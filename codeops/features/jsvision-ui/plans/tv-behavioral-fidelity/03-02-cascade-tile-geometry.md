# 03-02 — TV-exact cascade + tile geometry

> **Parent**: [Index](00-index.md) · Implements RD-10 AR-89/AR-90 · PA-4/PA-5/PA-6 · TV `tdesktop.cpp`
> **CodeOps Skills Version**: 3.1.0

Replace the AR-87 preset in `ui/src/desktop/arrange.ts` with TV's exact algorithms. `place()` (un-zoom
+ set `layout.rect` + `invalidateLayout`) is reused unchanged. The desktop rect is `(0,0)`–`(deskW,deskH)`
(TV `TRect` with exclusive bottom-right).

## A. Cascade (TV `doCascade`, `tdesktop.cpp:67-78` — PA-4)

`windows` is z-order back→front (`i=0` = back). TV gives the front window the largest offset and the
back window offset 0 (it fills); the bottom-right corner is pinned to the desktop corner for all:

```ts
export function cascade(windows, deskW, deskH): void {
  const n = windows.length;
  if (n === 0) return;                                   // no-op
  // tileError: refuse if the smallest window (offset n-1) would fall below the minimum.
  if (MIN_WIDTH > deskW - (n - 1) || MIN_HEIGHT > deskH - (n - 1)) return;  // PA-6 no-op
  windows.forEach((w, i) => place(w, i, i, deskW - i, deskH - i));
}
```

- window `i` ⇒ rect `{ x:i, y:i, width: deskW−i, height: deskH−i }`. `n===1` ⇒ fills (offset 0).
- Drop `CASCADE_DROW`/`CASCADE_DCOL` and the `2/3` sizing.

## B. Tile (TV `mostEqualDivisors`/`dividerLoc`/`calcTileRect`/`doTile` — PA-5)

Port the integer helpers verbatim (private to `arrange.ts`):

```ts
// iSqr — TV integer sqrt (tdesktop.cpp:55).
function iSqr(i: number): number {
  let r1 = 2, r2 = Math.floor(i / r1);
  while (Math.abs(r1 - r2) > 1) { r1 = Math.floor((r1 + r2) / 2); r2 = Math.floor(i / r1); }
  return r1 < r2 ? r1 : r2;
}
// mostEqualDivisors — favorY=true (tileColumnsFirst=false). Returns {cols, rows}.
function mostEqualDivisors(n: number): { cols: number; rows: number } {
  let i = iSqr(n);
  if (n % i !== 0 && n % (i + 1) === 0) i++;
  if (i < Math.floor(n / i)) i = Math.floor(n / i);
  return { cols: Math.floor(n / i), rows: i };          // favorY ⇒ x=n/i, y=i
}
// dividerLoc — proportional split (tdesktop.cpp:171).
function dividerLoc(lo: number, hi: number, num: number, pos: number): number {
  return Math.trunc(((hi - lo) * pos) / num) + lo;
}
```

`calcTileRect(pos, deskW, deskH, cols, rows, leftOver)` ports `tdesktop.cpp:177-211` exactly:

```ts
const d = (cols - leftOver) * rows;
let cx, cy, aY, bY;
if (pos < d) { cx = Math.floor(pos / rows);            cy = pos % rows; }
else         { cx = Math.floor((pos - d) / (rows + 1)) + (cols - leftOver); cy = (pos - d) % (rows + 1); }
const aX = dividerLoc(0, deskW, cols, cx), bX = dividerLoc(0, deskW, cols, cx + 1);
if (pos >= d) { aY = dividerLoc(0, deskH, rows + 1, cy); bY = dividerLoc(0, deskH, rows + 1, cy + 1); }
else          { aY = dividerLoc(0, deskH, rows,     cy); bY = dividerLoc(0, deskH, rows,     cy + 1); }
return { x: aX, y: aY, width: bX - aX, height: bY - aY };
```

`tile()`:

```ts
export function tile(windows, deskW, deskH): void {
  const n = windows.length;
  if (n === 0) return;
  const { cols, rows } = mostEqualDivisors(n);
  if (Math.floor(deskW / cols) === 0 || Math.floor(deskH / rows) === 0) return;   // tileError no-op (PA-6)
  const leftOver = n % cols;
  // TV iterates front→back with tileNum = n-1 … 0; our windows are back→front, so window i ⇒ pos i.
  windows.forEach((w, i) => { const r = calcTileRect(i, deskW, deskH, cols, rows, leftOver); place(w, r.x, r.y, r.width, r.height); });
}
```

- **n=2** ⇒ `mostEqualDivisors(2)` = `{cols:1, rows:2}` ⇒ **stacked** (two full-width half-height cells).
- Cells exactly fill the desktop (dividers, no remainder strip); `leftOver` trailing columns get `rows+1`.
- `n===1` ⇒ `{cols:1,rows:1}` ⇒ fills.

> The z-order→`pos` mapping (window `i` ⇒ `pos i`) is pinned by the ST-11 spec test against TV's output;
> if a fixture reveals TV's `forEach` orders front-first, flip to `pos = n-1-i` (the geometry set is
> identical — only which window lands in which cell differs).

## C. Desktop wiring

`Desktop.cascade()/tile()` (`desktop.ts:127-136`) are unchanged — they still call `arrange.cascade/tile`
then `invalidateLayout()`. Only `arrange.ts` changes.

## Acceptance (→ ST-05/ST-06, rewritten ST-11)

- Cascade: window `i` at `(i,i)` sized `(deskW−i, deskH−i)`; un-zoom first; 0 no-op, 1 fill; too-small no-op (ST-05).
- Tile: cells fill the desktop exactly; **n=2 stacks**; un-zoom first; 0 no-op, 1 fill; too-small no-op (ST-06).
