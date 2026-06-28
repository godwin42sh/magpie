import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { INSPECTOR_SCRIPT } from '../picker/inspector.js';
import type { PickerSelection } from '../picker/picker.types.js';
import { PICKER_SOURCE, isPickerEvent } from '../picker/picker.types.js';

export type PickerViewProps = {
  /** Sanitized, same-origin HTML returned by the proxy-render backend. */
  html: string;
  /** Fired with the captured zone when the user clicks an element. */
  onSelect: (selection: PickerSelection) => void;
};

/**
 * Builds the iframe document: the sanitized page plus the injected inspector
 * script. The proxy already neutralized the page's own scripts; sandbox
 * `allow-scripts allow-same-origin` lets *our* injected script run while
 * `allow-top-navigation` is withheld so foreign content cannot escape.
 */
function buildSrcDoc(html: string): string {
  const scriptTag = `<script>${INSPECTOR_SCRIPT}</script>`;
  // Append before </body> when present, else just append.
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${scriptTag}</body>`);
  }
  return `${html}${scriptTag}`;
}

/**
 * Renders sanitized page HTML into a sandboxed iframe and wires the dev-tools
 * picker. Captures the parent↔iframe postMessage protocol with strict
 * source/window checks.
 */
export function PickerView({ html, onSelect }: PickerViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [picked, setPicked] = useState<PickerSelection | null>(null);

  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = iframeRef.current;
      // Strict window check: only trust our own iframe's content window.
      if (!frame || event.source !== frame.contentWindow) return;
      if (!isPickerEvent(event.data)) return;

      switch (event.data.type) {
        case 'ready':
          setReady(true);
          break;
        case 'selected':
          setPicked(event.data.payload);
          onSelect(event.data.payload);
          break;
        case 'cancelled':
          setPicked(null);
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect]);

  const reselect = useCallback(() => {
    setPicked(null);
    const win = iframeRef.current?.contentWindow;
    if (win) win.postMessage({ source: PICKER_SOURCE, type: 'reselect' }, '*');
  }, []);

  return (
    <div className="picker-view">
      <div className="picker-toolbar">
        {picked ? (
          <>
            <span className="picker-status picked">
              Selected <code>{picked.selector}</code>
            </span>
            <button type="button" className="secondary" onClick={reselect}>
              Reselect
            </button>
          </>
        ) : (
          <span className="picker-status">
            {ready ? 'Hover an element and click to select it (Esc to cancel).' : 'Loading page…'}
          </span>
        )}
      </div>
      <div className="picker-frame-wrap">
        <iframe
          ref={iframeRef}
          className="picker-frame"
          title="Page preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
