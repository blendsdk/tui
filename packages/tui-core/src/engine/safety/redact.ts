/**
 * Pure redaction helpers — the no-secret-logging controls (RD-08; AR-9, AR-6).
 *
 * {@link redactEvent} reduces a decoded input event to a log-safe shape that can
 * never carry a typed character or pasted text. {@link dumpCaps} renders a
 * one-line, secret-free capabilities summary from the RD-02 reason trace for
 * debug logs. Both are pure: no I/O, no logging, no mutation of their arguments.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM
 * resolution (it resolves to the `.ts` source during development via tsx).
 */
import type { InputEvent } from '../input/events.js';
import type { CapabilityProfile, CapabilityResolution } from '../capability/profile.js';

/** A redacted, log-safe view of an input event — never carries raw content. [AR-9] */
export type RedactedEvent =
  | {
      readonly type: 'key';
      readonly key?: string;
      readonly printable?: true;
      readonly ctrl: boolean;
      readonly alt: boolean;
      readonly shift: boolean;
    }
  | { readonly type: 'mouse'; readonly kind: string; readonly button: number; readonly x: number; readonly y: number }
  | { readonly type: 'wheel'; readonly dir: string; readonly x: number; readonly y: number }
  | { readonly type: 'paste'; readonly length: number; readonly truncated: boolean }
  | { readonly type: 'focus'; readonly focused: boolean };

/**
 * Reduce an input event to a log-safe shape — the core no-secret-logging control.
 * [AR-9]
 *
 * Keys: a printable key (`codepoint` present) becomes `{type:'key',
 * printable:true, ctrl,alt,shift}` — the character and codepoint are dropped. A
 * named key (no `codepoint`) keeps its name: `{type:'key', key:'enter',
 * ctrl,alt,shift}`. A paste yields only `{type:'paste', length, truncated}` —
 * never its text. Mouse/wheel/focus carry no secrets and pass their
 * coordinates/direction/flag through.
 *
 * @param event Any decoded input event (RD-06).
 * @returns The redacted, log-safe view. Pure; never logs; never mutates `event`.
 */
export function redactEvent(event: InputEvent): RedactedEvent {
  switch (event.type) {
    case 'key':
      // `codepoint` is present iff the key is printable (RD-06 KeyEvent): drop
      // the character and codepoint for printable keys; keep the name otherwise.
      if (event.codepoint !== undefined) {
        return { type: 'key', printable: true, ctrl: event.ctrl, alt: event.alt, shift: event.shift };
      }
      return { type: 'key', key: event.key, ctrl: event.ctrl, alt: event.alt, shift: event.shift };
    case 'mouse':
      return { type: 'mouse', kind: event.kind, button: event.button, x: event.x, y: event.y };
    case 'wheel':
      return { type: 'wheel', dir: event.dir, x: event.x, y: event.y };
    case 'paste':
      // Only the length survives — never the pasted text.
      return { type: 'paste', length: event.text.length, truncated: event.truncated };
    case 'focus':
      return { type: 'focus', focused: event.focused };
  }
}

/**
 * Render one `field=value (layer)` pair for a single profile field.
 *
 * Scalars render their value directly. Object groups list their enabled boolean
 * members comma-separated (`sgr,wheel`), with an all-false group collapsing to
 * `-`; non-boolean nested fields render as `name:value`. Never emits any
 * input/clipboard/title text (the profile carries none).
 */
function renderField(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const members: string[] = [];
    for (const [name, member] of Object.entries(value)) {
      if (typeof member === 'boolean') {
        if (member) members.push(name);
      } else {
        members.push(`${name}:${String(member)}`);
      }
    }
    return members.length > 0 ? members.join(',') : '-';
  }
  return String(value);
}

/**
 * Render a one-line, secret-free capabilities summary from the RD-02 reason
 * trace. [AR-6]
 *
 * Emits exactly one `field=value (layer)` pair per `CapabilityReasons` key, in
 * declaration order, space-separated. See {@link renderField} for the per-field
 * rules. Contains no input/clipboard/title text — only profile values and the
 * resolution-layer names.
 *
 * @param resolution The RD-02 `CapabilityResolution` (`{ profile, reasons }`).
 * @returns A single screen-safe summary string.
 */
export function dumpCaps(resolution: CapabilityResolution): string {
  const { profile, reasons } = resolution;
  // `CapabilityProfile` and `CapabilityReasons` share their field names, so a
  // single `keyof` indexes both (no index signature on either).
  const keys = Object.keys(reasons) as Array<keyof CapabilityProfile>;
  const parts = keys.map((key) => `${key}=${renderField(profile[key])} (${reasons[key]})`);
  return parts.join(' ');
}
