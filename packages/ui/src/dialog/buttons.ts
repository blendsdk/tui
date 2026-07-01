/**
 * Standard dialog-button helpers (RD-11 AC-11, PA-13/AR-109).
 *
 * Thin `Button` presets that emit the standard terminating commands (`Commands.ok`/`cancel`/`yes`/
 * `no`, decoded from TV `cmOK=10…cmNo=13`, `views.h:44`). Faces use the tilde hotkey convention
 * (`~O~K` etc.); the OK/Yes buttons are the dialog `default` (also activate on unconsumed Enter). The
 * `Button` itself draws the fidelity-verified TV face + shadow (RD-06). `.js` per NodeNext.
 */
import { Button } from '../controls/index.js';
import { Commands } from '../status/index.js';

/** An OK button — `default`, emits `Commands.ok`. */
export function okButton(): Button {
  return new Button('~O~K', { command: Commands.ok, default: true });
}

/** A Cancel button — emits `Commands.cancel`. */
export function cancelButton(): Button {
  return new Button('~C~ancel', { command: Commands.cancel });
}

/** A Yes button — `default`, emits `Commands.yes`. */
export function yesButton(): Button {
  return new Button('~Y~es', { command: Commands.yes, default: true });
}

/** A No button — emits `Commands.no`. */
export function noButton(): Button {
  return new Button('~N~o', { command: Commands.no });
}

/** The OK + Cancel pair (in that z/tab order). */
export function okCancelButtons(): [Button, Button] {
  return [okButton(), cancelButton()];
}

/** The Yes + No pair (in that z/tab order). */
export function yesNoButtons(): [Button, Button] {
  return [yesButton(), noButton()];
}
