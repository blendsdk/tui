/**
 * `controls/` — the RD-06 essential leaf controls + validator model (the widgets a form is made of),
 * faithfully ported from Borland Turbo Vision onto the `@jsvision/ui` spine.
 *
 * Each control is a `View`/`Group` subclass that draws via `DrawContext`, handles input through
 * `onEvent` (raising commands with `ev.emit` — RD-06 PA-1), binds its value to an RD-01 signal, and
 * themes via the additive core control roles (`staticText`/`label`/`cluster*`/`input*`, PA-5).
 *
 * The barrel grows one phase at a time (`Text`/`Label` → `Button` → validators → `Input` → clusters);
 * `src/index.ts` re-exports each landed symbol explicitly. The `.js` extension in import specifiers is
 * required by NodeNext ESM resolution.
 */
export { Text } from './text.js';
export { Label } from './label.js';
export { Button } from './button.js';
export type { ButtonOptions } from './button.js';
export { Input } from './input.js';
export type { InputOptions } from './input.js';
export { CheckGroup } from './check-group.js';
export { RadioGroup } from './radio-group.js';
export { filter, range, lookup } from './validators/index.js';
export type { Validator } from './validators/index.js';
