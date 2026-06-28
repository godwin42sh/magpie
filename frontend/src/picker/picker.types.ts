import type { Fingerprint } from '@magpie/shared';

/**
 * Messaging contract between the parent window (the React wizard) and the
 * injected picker script running inside the sandboxed iframe.
 *
 * Every message carries a discriminant `source` so each side can reject
 * unrelated `message` events, plus a `type` discriminant for the payload.
 */

/** Tag stamped on every message that belongs to the picker protocol. */
export const PICKER_SOURCE = 'crawl-zone-picker';

/** Parent → iframe. Sent once the iframe announces it is ready. */
export type PickerCommand =
  | { source: typeof PICKER_SOURCE; type: 'arm' }
  | { source: typeof PICKER_SOURCE; type: 'reselect' };

/** The element selection the picker computes and hands back to the parent. */
export type PickerSelection = {
  /** Stable CSS selector, unique within the rendered document. */
  selector: string;
  /** Best-effort absolute XPath, used as a fallback locator. */
  xpath: string;
  /** Lightweight fingerprint of the chosen element. */
  fingerprint: Fingerprint;
};

/** iframe → parent. */
export type PickerEvent =
  | { source: typeof PICKER_SOURCE; type: 'ready' }
  | { source: typeof PICKER_SOURCE; type: 'selected'; payload: PickerSelection }
  | { source: typeof PICKER_SOURCE; type: 'cancelled' };

/** Narrowing guard for inbound `message` events on the parent side. */
export function isPickerEvent(data: unknown): data is PickerEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === PICKER_SOURCE &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}

/** Narrowing guard for inbound `message` events on the iframe side. */
export function isPickerCommand(data: unknown): data is PickerCommand {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === PICKER_SOURCE &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}
