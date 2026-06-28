import { PICKER_SOURCE } from './picker.types.js';

/**
 * The injected picker ("inspector") that runs *inside* the sandboxed iframe.
 *
 * It cannot import application modules at runtime (the iframe is loaded from a
 * `srcdoc` string and is script-neutralized except for what we inject), so the
 * whole behavior is emitted as a self-contained IIFE **source string** that the
 * wizard concatenates into the iframe document.
 *
 * The selector/xpath/fingerprint algorithm here is a runtime mirror of
 * `selectorEngine.ts` (which is unit-tested). The string is produced from a
 * real function below so it type-checks and stays readable, then stringified
 * via `Function.prototype.toString`.
 *
 * Behavior (dev-tools style):
 *  - mousemove → draw a highlight overlay box + a tag/selector label
 *  - click     → freeze selection, compute selector/xpath/fingerprint,
 *                postMessage `selected` to the parent
 *  - Escape    → postMessage `cancelled`
 *  - parent can send `reselect` to re-arm hover after a freeze
 */

/** The picker body. Runs in the iframe; receives the protocol source tag. */
function pickerMain(SOURCE: string): void {
  const doc = document;
  const HASHED = /^[A-Za-z][\w-]*?[-_]?[0-9a-f]{5,}$/;
  const VOLATILE = /^(css-|sc-|jsx-|emotion-|chakra-|MuiBox-|svelte-|v-|ng-|data-v-)/;
  const HEXBLOB = /^[0-9a-f]{6,}$/i;

  function isHashed(token: string): boolean {
    if (!token) return false;
    return VOLATILE.test(token) || HASHED.test(token) || HEXBLOB.test(token);
  }
  function esc(value: string): string {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value);
    return value.replace(/[^\w-]/g, (c) => '\\' + c);
  }
  function stableClasses(el: Element): string[] {
    const raw = el.getAttribute('class');
    if (!raw) return [];
    return raw
      .split(/\s+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0 && !isHashed(c));
  }
  function stableId(el: Element): string | null {
    const id = el.getAttribute('id');
    if (!id || isHashed(id) || !/^[A-Za-z][\w-]*$/.test(id)) return null;
    try {
      if (doc.querySelectorAll('#' + esc(id)).length === 1) return '#' + id;
    } catch {
      return null;
    }
    return null;
  }
  function segmentFor(el: Element): string {
    let seg = el.tagName.toLowerCase();
    const classes = stableClasses(el);
    if (classes.length) seg += classes.map((c) => '.' + esc(c)).join('');
    return seg;
  }
  function disambiguate(el: Element, segment: string): string {
    const parent = el.parentElement;
    if (!parent) return segment;
    const tag = el.tagName.toLowerCase();
    const sameTag = Array.prototype.filter.call(
      parent.children,
      (c: Element) => c.tagName.toLowerCase() === tag,
    ) as Element[];
    if (sameTag.length <= 1) return segment;
    const matching = sameTag.filter((c) => c.matches(segment));
    if (matching.length <= 1) return segment;
    return segment + ':nth-of-type(' + (sameTag.indexOf(el) + 1) + ')';
  }
  function unique(selector: string): boolean {
    try {
      return doc.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }
  function computeSelector(el: Element): string {
    const direct = stableId(el);
    if (direct) return direct;
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current.nodeType === 1) {
      const anchor = stableId(current);
      if (anchor) {
        parts.unshift(anchor);
        break;
      }
      parts.unshift(disambiguate(current, segmentFor(current)));
      const candidate = parts.join(' > ');
      if (unique(candidate)) return candidate;
      const parent: Element | null = current.parentElement;
      if (!parent || parent === doc.documentElement) {
        if (parent) parts.unshift(disambiguate(parent, segmentFor(parent)));
        break;
      }
      current = parent;
    }
    return parts.join(' > ');
  }
  function computeXPath(el: Element): string {
    if (el.nodeType !== 1) return '';
    const segs: string[] = [];
    let current: Element | null = el;
    while (current && current.nodeType === 1) {
      const tag = current.tagName.toLowerCase();
      const parent: Element | null = current.parentElement;
      if (!parent) {
        segs.unshift(tag);
        break;
      }
      const sameTag = Array.prototype.filter.call(
        parent.children,
        (c: Element) => c.tagName.toLowerCase() === tag,
      ) as Element[];
      segs.unshift(sameTag.length === 1 ? tag : tag + '[' + (sameTag.indexOf(current) + 1) + ']');
      current = parent;
    }
    return '/' + segs.join('/');
  }
  function fingerprint(el: Element): { tag: string; textLen: number; sample: string } {
    const norm = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    return { tag: el.tagName.toLowerCase(), textLen: norm.length, sample: norm.slice(0, 50) };
  }

  // ---- Overlay UI ---------------------------------------------------------
  const box = doc.createElement('div');
  box.setAttribute('data-crawl-picker', 'box');
  box.style.cssText =
    'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #5b8cff;' +
    'background:rgba(91,140,255,0.15);border-radius:2px;transition:all .03s ease-out;display:none;';
  const label = doc.createElement('div');
  label.setAttribute('data-crawl-picker', 'label');
  label.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;font:12px/1.4 ui-monospace,monospace;' +
    'background:#5b8cff;color:#fff;padding:2px 6px;border-radius:3px;white-space:nowrap;' +
    'max-width:80vw;overflow:hidden;text-overflow:ellipsis;display:none;';
  doc.documentElement.appendChild(box);
  doc.documentElement.appendChild(label);

  let armed = true;
  let hovered: Element | null = null;

  function isOurOwn(el: Element | null): boolean {
    return !!el && el.getAttribute && el.getAttribute('data-crawl-picker') !== null;
  }

  function paint(el: Element): void {
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
    label.textContent = sel;
    label.style.display = 'block';
    const top = r.top - 22 < 0 ? r.bottom + 4 : r.top - 22;
    label.style.left = r.left + 'px';
    label.style.top = top + 'px';
  }
  function hide(): void {
    box.style.display = 'none';
    label.style.display = 'none';
  }

  function onMove(e: MouseEvent): void {
    if (!armed) return;
    const target = e.target as Element | null;
    if (!target || isOurOwn(target)) return;
    hovered = target;
    paint(target);
  }
  function onClick(e: MouseEvent): void {
    if (!armed) return;
    const target = (e.target as Element | null) ?? hovered;
    if (!target || isOurOwn(target)) return;
    e.preventDefault();
    e.stopPropagation();
    armed = false;
    box.style.borderColor = '#3ecf8e';
    box.style.background = 'rgba(62,207,142,0.18)';
    label.style.background = '#3ecf8e';
    const payload = {
      selector: computeSelector(target),
      xpath: computeXPath(target),
      fingerprint: fingerprint(target),
    };
    parent.postMessage({ source: SOURCE, type: 'selected', payload }, '*');
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      parent.postMessage({ source: SOURCE, type: 'cancelled' }, '*');
    }
  }
  function reselect(): void {
    armed = true;
    box.style.borderColor = '#5b8cff';
    box.style.background = 'rgba(91,140,255,0.15)';
    label.style.background = '#5b8cff';
    hide();
  }

  doc.addEventListener('mousemove', onMove, true);
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKey, true);

  window.addEventListener('message', (e: MessageEvent) => {
    // Only honor commands from our direct parent carrying our protocol tag.
    if (e.source !== parent) return;
    const data = e.data as { source?: string; type?: string } | null;
    if (!data || data.source !== SOURCE) return;
    if (data.type === 'reselect') reselect();
  });

  // Announce readiness so the parent can arm/observe.
  parent.postMessage({ source: SOURCE, type: 'ready' }, '*');
}

/**
 * The injectable `<script>` body: the picker IIFE invoked with the protocol
 * source tag baked in as a string literal. Concatenate this into the iframe's
 * srcdoc inside a `<script>…</script>`.
 */
export const INSPECTOR_SCRIPT = `(${pickerMain.toString()})(${JSON.stringify(PICKER_SOURCE)});`;
