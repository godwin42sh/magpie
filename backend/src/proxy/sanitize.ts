import * as cheerio from 'cheerio';

/**
 * Sanitizes foreign-origin HTML so it can be safely embedded in a same-origin
 * `<iframe srcdoc>` for the zone picker.
 *
 * What this does:
 *  - Neutralizes every `<script>` (inline + external) so no foreign JS runs in
 *    our origin. We rewrite the tag to an inert `<script type="text/neutralized">`
 *    placeholder rather than deleting it, so DOM indices the picker relies on are
 *    preserved.
 *  - Removes event-handler attributes (`onclick`, `onload`, …) and
 *    `javascript:` URLs.
 *  - Strips `<meta http-equiv>` security directives (CSP, frame-ancestors,
 *    X-Frame-Options, refresh) that would otherwise block embedding or redirect.
 *  - Injects a `<base href>` pointing at the original origin so relative CSS /
 *    images / fonts still resolve against the foreign origin.
 *  - Removes `<base>` tags already present (replaced by our injected one).
 *
 * The returned string is a full document suitable for an iframe `srcdoc`.
 */
export function sanitizeHtml(html: string, finalUrl: string): string {
  const $ = cheerio.load(html);

  // 1. Neutralize all scripts.
  $('script').each((_, el) => {
    const $el = $(el);
    $el.removeAttr('src');
    $el.attr('type', 'text/neutralized');
    $el.empty();
  });

  // 2. Strip dangerous meta directives (CSP / frame-ancestors / X-Frame / refresh).
  $('meta').each((_, el) => {
    const httpEquiv = ($(el).attr('http-equiv') ?? '').toLowerCase();
    if (
      httpEquiv === 'content-security-policy' ||
      httpEquiv === 'x-frame-options' ||
      httpEquiv === 'refresh'
    ) {
      $(el).remove();
    }
  });

  // 3. Remove inline event handlers and javascript: URLs.
  const elements = $('*').toArray();
  for (const el of elements) {
    if (el.type !== 'tag') {
      continue;
    }
    const attribs = el.attribs;
    for (const name of Object.keys(attribs)) {
      const lower = name.toLowerCase();
      if (lower.startsWith('on')) {
        $(el).removeAttr(name);
        continue;
      }
      if (
        (lower === 'href' || lower === 'src' || lower === 'xlink:href') &&
        /^\s*javascript:/i.test(attribs[name] ?? '')
      ) {
        $(el).removeAttr(name);
      }
    }
  }

  // 4. Inject <base href> at the foreign origin so relative assets resolve.
  $('base').remove();
  const baseHref = computeBaseHref(finalUrl);
  if ($('head').length === 0) {
    if ($('html').length === 0) {
      $.root().prepend('<html><head></head><body></body></html>');
    } else {
      $('html').prepend('<head></head>');
    }
  }
  $('head').prepend(`<base href="${escapeAttr(baseHref)}">`);

  return $.html();
}

/** Returns the directory-level base href for resolving relative URLs. */
function computeBaseHref(finalUrl: string): string {
  try {
    const u = new URL(finalUrl);
    // Use the full document URL as base; the browser resolves relative paths
    // against the document URL, so this is correct for both ./x and /x forms.
    return u.toString();
  } catch {
    return finalUrl;
  }
}

/** Minimal attribute-value escaping for the injected base href. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
