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
