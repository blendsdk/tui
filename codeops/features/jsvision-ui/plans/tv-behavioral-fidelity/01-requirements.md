# Requirements — TV Behavioral Fidelity

> **Source**: [RD-10](../../requirements/RD-10-tv-behavioral-fidelity.md)
> **Parent**: [Index](00-index.md) · **Implements**: jsvision-ui/RD-10
> **CodeOps Skills Version**: 3.1.0

## Scope

Complete the Turbo Vision fidelity of the existing RD-05 app shell for the four **behaviors**
the drawing pass (`1caa188`) deferred. Behavior + window-arrangement math only — no rendering
changes beyond re-adding one theme role consumed by behavior 1.

### In scope

1. **Status-line press feedback + emit-on-release** (AR-88)
   - Green held-item highlight (`statusSelected` = black/green, red-on-green hotkey run).
   - Drag tracking via the loop pointer-capture seam; highlight follows the cursor, clears off-bar.
   - Command emitted on mouse-**up** only if still over the same **enabled** item (drag-off / disabled cancels).
   - Re-add the additive `statusSelected` core `Theme` role.
2. **TV-exact cascade** (AR-89, supersedes AR-87)
   - `windows[i]` (back→front) → top-left `(i,i)`, bottom-right pinned to the desktop corner.
   - Un-zoom first; 0 = no-op; 1 = fill; too-small ⇒ `tileError` no-op (PA-6).
3. **TV-exact tile** (AR-90, supersedes AR-87)
   - `mostEqualDivisors`/`dividerLoc`/`calcTileRect` (`tileColumnsFirst=false`); cells exactly fill the
     desktop (no remainder); `leftOver` trailing columns get one extra row; **n=2 stacks**.
   - Un-zoom first; 0 = no-op; 1 = fill; too-small ⇒ `tileError` no-op.
4. **Left-grow resize gesture** (AR-91)
   - The bottom-left grip `└─` begins a `resize-left` gesture: move the left + bottom edges, anchor the
     right edge, floor at 10×3.
   - `frameZoneAt` returns a distinct `resize-left` zone for the bottom-left grip cells; SE corner unchanged.

### Out of scope

- New widgets / controls (RD-06+); keyboard-driven move/resize mode (still deferred, AR-85); other TV
  drag modes (only the SW grip is added); status help-context ranges (AR-72); any drawing/glyph/color
  change beyond the `statusSelected` role (the drawing is already faithful as of `1caa188`).

## Success criteria

- RD-10 AC-1…AC-11 satisfied; the ST-11 desktop oracle (cascade/tile) and the status press/emit
  spec/impl tests rewritten to the TV-faithful expectations and green.
- `yarn verify` (typecheck + build + all tests), `yarn check:deps`, `yarn lint` clean.
- `demo:shell` shows the TV cascade + tile geometry; the drawing fidelity from `1caa188` is unregressed.
- One cross-package edit only (additive `statusSelected`); the loop is composed, not re-shaped.

## Dependencies

- **RD-05** (done) — modified in place: `StatusLine`, `Desktop`/`arrange`, `Window`/`Frame`/`gestures`.
- **RD-04** (done) — reuses `EventLoop.setCapture`/`releaseCapture` (AR-82); no new loop surface.
- **`@jsvision/core`** (done) — additive `Theme.statusSelected` role (the only cross-package edit).
- **TV source** — `/home/gevik/workdir/github/tvision/source/tvision/{tstatusl,tdesktop,tframe}.cpp`
  (the authoritative behavior, per the NON-NEGOTIABLE fidelity directive).
