/**
 * `dialog/` barrel (RD-11) — the modal/modeless dialog subsystem.
 *
 * Public symbols land in Phase 4 and are re-exported through `@jsvision/ui`'s single entry point
 * (`src/index.ts`, explicit named re-exports per the AR-102 convention): `Dialog` (TV
 * `tdialog.cpp`, a `Window` subclass) + the standard-button helpers (`okButton`/`cancelButton`/…).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
export { Dialog } from './dialog.js';
export type { DialogOptions } from './dialog.js';
export { okButton, cancelButton, yesButton, noButton, okCancelButtons, yesNoButtons } from './buttons.js';
