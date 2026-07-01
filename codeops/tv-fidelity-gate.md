# Turbo Vision Fidelity Gate — jsvision-ui

> **Status**: Standing convention (project-authored, not a CodeOps skill artifact)
> **Applies to**: every `@jsvision/ui` component/widget/chrome that has a Turbo Vision counterpart.
> **Canonical law**: the `## Turbo Vision fidelity (NON-NEGOTIABLE)` section of the repo `CLAUDE.md`
> points here; this doc holds the operational detail + the copy-paste plan checklist.

## The principle

**Decode, don't design.** These components already exist in Borland Turbo Vision's C++
(`magiblot/tvision`, checked out at `/home/gevik/workdir/github/tvision`). We do **not** reinvent
them — we carefully decode the original and re-implement it in our code. Fidelity is a
**transcription + verification** task, not a design task.

The rule has teeth because paraphrasing silently fails. The RD-06 `TButton` shipped two defects — it
invented `[ ]` brackets (a monochrome-only `markers` feature) and mis-guessed the shadow color — both
because the plan *paraphrased* `TButton::drawState` instead of **decoding** it and then **re-checking
the output against the source**. Two gates prevent exactly this.

## Source of truth

- `source/tvision/t*.cpp` — `draw()`, sizing (`getRect`/`sizeLimits`/`getItemRect`), event handling.
- `source/tvision/tvtext1.cpp` — the glyph tables (`frameChars`, `specialChars`, per-class
  `shadows`/`markers`) **and `cpAppColor`** (the root palette).
- `include/tvision/*.h` — geometry; `app.h` / `dialogs.h` — the `cpX` palette definitions
  (`cpAppColor`, `cpGrayDialog`, `cpBlueDialog`, `cpButton`, `cpInputLine`, …).

## GATE 1 — BEFORE writing or changing any draw/size/layout code

Open the original class and decode, citing the exact `file:line` of every fact in the code JSDoc:

1. **Geometry** — `draw()` + sizing: exact column math, frame/gutter insets, padding, fill
   characters, `markers`/`shadows`/`specialChars`, and hit-zones (`getItemRect`, mouse math).
2. **Color — the full `getColor(N)` chain.** Resolve `N` through the view's **local** palette
   (`cpButton`/`cpInputLine`/…) → the **owner** palette (`cpGrayDialog`/…) → **`cpAppColor`** → the
   attribute byte `0xHL` (high nibble = bg, low nibble = fg) → the DOS-16 color name. Color
   indirection — not glyphs — is where fidelity silently breaks. Worked example (the button shadow):
   `cShadow = getColor(8)` → `cpButton[8]=0x0F` → `cpGrayDialog` slot 15 = `0x2E` → `cpAppColor[0x2E]
   = 0x70` = black-on-lightGray (the dialog's own bg with black ink), **not** the window drop-shadow.
3. **Mode-gated features** the palette/state path turns on or off — e.g. `showMarkers` (the `[ ]`
   button brackets / cluster end-markers) is **monochrome-only**; on a color palette it is off.

Convert CP437 byte glyphs to their Unicode equivalents; mind East-Asian ambiguous width (prefer
unambiguous-narrow code points — see the close-glyph `×` note).

## GATE 2 — AFTER implementing (a component is NOT "done" until this passes)

Re-open the same `.cpp` and **diff our rendered output against the decode, cell by cell**: glyphs,
column math, hit-zones, and every resolved color. Record the decode (especially the `getColor`
palette resolution) in the code and the commit message. If the render and the source disagree, **our
code is wrong** — fix it against the source, then re-diff. A headless render harness (compose the
component in a `RenderRoot`/`EventLoop` and print the buffer) makes the diff concrete.

## The C++ source outranks our own spec tests (TV-derived components only)

A `*.spec.test.ts` can encode a *mis-decode* (the ST-05 button oracle asserted the phantom brackets).
So for a TV-derived component, **if a spec oracle disagrees with a faithful C++ decode, the spec test
is the defect** — correct it against the source and cite the `.cpp`. This is a deliberate, **narrow**
exception to "spec tests are immutable oracles", scoped to TV-fidelity oracles only; it does **not**
license editing behavioral/logic spec tests to match broken code.

## Plan-flow integration (make_plan / exec_plan)

**make_plan**, for every TV-derived component:
- Give the component's spec doc (`03-NN-*.md`) a **"TV decode (GATE 1)"** section that cites the
  original `file:line` for draw + sizing + the `getColor(N)` chain (the decode itself, not a summary).
- Add these two tasks to the plan's `99-execution-plan.md` (copy-paste, per component `<X>`):

  ```markdown
  - [ ] **BEFORE-decode `<TClass>`** — read `source/tvision/<file>.cpp` `<TClass>::draw`/sizing +
        resolve every `getColor(N)` through the palette chain to its `0xHL` byte; record the decode
        (with `file:line` cites) in `03-NN-<X>.md`. Note any mode-gated feature (`showMarkers`, …).
  - [ ] **AFTER-diff `<TClass>`** — render `<X>` and diff glyphs/columns/hit-zones/colors against the
        `<TClass>` decode cell-by-cell; fix any deviation against the source; record the resolved
        palette bytes in the code JSDoc + commit. (If a spec oracle disagrees with the decode, the
        oracle is the defect — correct it against the `.cpp`.)
  ```

**exec_plan**:
- Do NOT mark a TV-derived component task `[x]` until its **AFTER-diff** task is complete and the
  decode (incl. palette resolution) is recorded in the code/commit.
- If the AFTER-diff surfaces a spec-oracle/source conflict, fix the oracle against the `.cpp` (per the
  section above) rather than weakening the code.

## Proven precedent

- RD-05 menu box matched `tmenubox.cpp` 1:1 (both gates, implicitly).
- RD-06 `TButton` is the cautionary tale: paraphrase → phantom `[ ]` + wrong shadow color; caught
  only in a later visual audit. GATE 2 exists so that audit happens *before* shipping, not after.
