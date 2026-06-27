# turbo-hello

A tiny **Hello World** terminal UI built with [Ink](https://github.com/vadimdemedes/ink)
and TypeScript, styled after Borland's **Turbo Vision** — the blue desktop with its
grey `░` stipple, a light‑grey menu bar and status line, framed windows with drop
shadows, and green push‑buttons with a thin half‑block shadow.

```
  File
░░░░░░░░░░░░░░░░░╔════════════════ Hello App ═════════════════╗░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░║                                            ║░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░║    Press the button to greet the world.    ║░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░║                  Hello  ▄                  ║░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░║                 ▀▀▀▀▀▀▀▀▀                  ║░░░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░╚════════════════════════════════════════════╝░░░░░░░░░░░░░░░░░
 Alt-F Menu   Enter Hello   Esc Close   Alt-X Exit
```

The desktop is a **uniform** `░` stipple in light grey on blue — the same glyph and
colour in every cell, exactly like Turbo Vision's `TBackground` (no gradient).

## Run it

```bash
npm install
npm start        # runs the source directly with tsx
```

Or build and run the compiled output:

```bash
npm run build
node dist/index.js
```

It needs an interactive terminal (a TTY).

## Controls

### Keyboard

| Key            | Action                                   |
| -------------- | ---------------------------------------- |
| `Enter` / `Space` | Press the **Hello** button → show the dialog |
| `Alt‑F`        | Open the **File** menu                    |
| `↑` / `↓`      | Move within the menu                      |
| `Enter`        | Activate the highlighted menu item        |
| `Esc`          | Close the menu or dialog                  |
| `Alt‑X` / `Ctrl‑C` | Exit the application                  |

### Mouse

Click **File** to open the menu, click an item to choose it, click the **Hello**
button to open the dialog, and click **OK** to dismiss it. (Requires a terminal
with xterm mouse reporting — most modern terminals.)

## Scripts

| Command            | What it does                              |
| ------------------ | ----------------------------------------- |
| `npm start`        | Run the app (via `tsx`)                    |
| `npm run build`    | Type‑check and compile to `dist/`          |
| `npm test`         | Run the unit tests (Node test runner)      |
| `npm run verify`   | `typecheck` + `test` + `build`             |

## How it works

Ink lays its components out with flexbox and has no z‑index, so it cannot float a
dialog with a drop shadow over a patterned desktop using components alone. Instead
the whole screen is composited into a character buffer each frame — exactly how
Turbo Vision drew its windows — and that buffer is painted to the terminal directly.

The app drives the terminal itself and uses Ink only for the React lifecycle:

- **No scrollbars** — it runs in the **alternate screen buffer** (like `vim`/`htop`),
  which has no scrollback, with line wrap disabled so the bottom‑right cell never
  scrolls.
- **No flicker** — each frame is written **in place** with absolute cursor moves and
  no erase. Because the buffer is opaque (every cell painted, full width), overwriting
  leaves no stale characters, so there is nothing to flicker. (Ink's own renderer
  erases and rewrites every printed line each frame, which flashes at full size.)
- **Mouse** — xterm mouse reporting (SGR mode) is enabled and parsed alongside the
  keyboard, so the same controls respond to clicks.

All of these terminal modes are restored on exit (including `Ctrl‑C` and crashes).

```
src/
  index.tsx            entry point: enter/leave full-screen mode, render the shell
  tui/                 reusable, framework-level toolkit
    theme.ts           Turbo Vision palette, semantic roles, box glyphs
    buffer.ts          ScreenBuffer: per-cell colour grid + draw helpers
    ansi.ts            raw ANSI/xterm control sequences (alt screen, colour, mouse)
    color.ts           hex colour parsing for the ANSI serialiser
    serialize.ts       ScreenBuffer → in-place ANSI frame string
    useScreenSize.ts   live terminal size hook
    index.ts           public API of the toolkit
  app/                 this application
    state.ts           UI state model + the File menu definition
    geometry.ts        where each control sits (shared by painter and mouse)
    reducer.ts         pure state transitions
    paint.ts           pure: (state, size) → composited ScreenBuffer
    input.ts           pure: parse stdin (keys + mouse) → interpret to actions
    App.tsx            wires input to the reducer and paints the frame
```

The painter (`paint.ts`), reducer (`reducer.ts`), geometry, and input interpreter
(`input.ts`) are pure functions with no Ink or React dependency — which is exactly
what the unit tests exercise directly.
