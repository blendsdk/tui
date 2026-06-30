/**
 * `@jsvision/ui` — public entry point of the Turbo Vision-style widget framework.
 *
 * The UI layer of jsvision: a **retained widget tree** with **fine-grained signal
 * reactivity** (the "disciplined hybrid" model), built on the `@jsvision/core`
 * engine (rendering, input, host, color, capability detection).
 *
 * First subsystem landed: the cell-native **layout** core (ADR-008) — integer
 * apportionment + a 1-D flex track solver. The reactive core, the view/group
 * spine, and the widgets follow per `plans/tui-ui/01-component-map.md`, each
 * re-exporting its public symbols through this single entry point.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution
 * (it resolves to the `.ts` source during development).
 */
export { VERSION } from './version.js';

// Layout (ADR-008 / RD-02) — cell-native, integer-correct.
export { apportion, solveTrack, layout } from './layout/index.js';
export type {
  TrackItem,
  Align,
  Direction,
  Justify,
  LayoutBox,
  LayoutProps,
  LayoutResult,
  Padding,
  Rect,
  Size,
  Size2D,
} from './layout/index.js';

// Reactive core (RD-01) — fine-grained signals, effects, computeds, combinators.
export * from './reactive/index.js';

// View/Group spine (RD-03) — retained widget tree + clipped paint + theming. Explicit named
// re-exports (not `export *`), per the layout convention (AC-18). Grows per phase.
export { View, Group, intersect, translate, contains, createRenderRoot } from './view/index.js';
export type { Point, ViewState, DrawContext, ThemeRoleName, RenderRoot, RenderRootOptions } from './view/index.js';

// Event loop (RD-04) — host-agnostic dispatch mechanism. Explicit named re-exports, per the layout
// convention. Grows per phase.
export { createEventLoop } from './event/index.js';
export type { EventLoop, EventLoopOptions, CommandEvent, AppEvent, DispatchEvent } from './event/index.js';

// App shell (RD-05) — Application/Desktop/Window/MenuBar/StatusLine. Explicit named re-exports, per
// the layout convention. Grows per phase (Phase 2: createApplication + run() lifecycle).
export { createApplication } from './app/index.js';
export type { Application, ApplicationOptions } from './app/index.js';
export { Desktop } from './desktop/index.js';
export type { DesktopLoopSeam } from './desktop/index.js';
export { Window } from './window/index.js';
export { MenuBar, MenuPopup, menuBar, subMenu, item, separator } from './menu/index.js';
export type { MenuItem, ParsedLabel, TitleLayout, MenuController, MenuLoopSeam } from './menu/index.js';
export { Commands, StatusLine, statusLine, statusItem } from './status/index.js';
export type { CommandName, StatusItem, StatusLoopSeam } from './status/index.js';

// Essential controls (RD-06) — leaf widgets + validators (`src/controls/`). Explicit named
// re-exports, per the layout convention (AC-18 / ST-13). The list grows one phase at a time
// (Text/Label → Button → validators → Input → clusters) as each control lands.
export { Text, Label, Button, Input, CheckGroup, RadioGroup, filter, range, lookup } from './controls/index.js';
export type { ButtonOptions, InputOptions, Validator } from './controls/index.js';
