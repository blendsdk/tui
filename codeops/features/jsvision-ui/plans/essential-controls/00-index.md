# Essential Controls + Validators — Implementation Plan

> **Feature**: The RD-06 Tier-1 leaf controls (`Text`/`Label`/`Button`/`Input`/`CheckGroup`/`RadioGroup`) + the validator model, faithfully ported from Borland Turbo Vision onto the `@jsvision/ui` spine.
> **Status**: Planning Complete
> **Created**: 2026-06-30
> **Implements**: jsvision-ui/RD-06
> **CodeOps Skills Version**: 3.1.0

## Overview

This plan builds the first batch of interactive **leaf controls** for `@jsvision/ui` — the widgets a
form is made of — plus the **validator** units that constrain text entry. Each control is a `View`
(or `Group`) subclass that draws itself via `DrawContext`, handles input through `onEvent`, binds its
value to an RD-01 signal, and themes via named roles. Every control's drawing/geometry replicates its
Turbo Vision counterpart exactly (the **NON-NEGOTIABLE** fidelity directive): `TStaticText`, `TLabel`,
`TButton`, `TInputLine`, `TCluster`/`TCheckBoxes`/`TRadioButtons`, and the `TValidator` family.

The work adds one new package subsystem (`packages/ui/src/controls/`), one additive intra-ui primitive
(`emit()` on the dispatch envelope, so a focused control can raise a typed command), and the faithful
`cpGrayDialog` control theme roles to `@jsvision/core` (the one cross-package edit — buttons reuse the
existing `button`/`buttonFocused`). A headless `demo:controls` walkthrough proves it.

Scope is the user-approved **split** (AR-93): the container/scrolling/list controls + the rich `Dialog`
are the sibling **RD-11**, deferred here. Deferred sub-scope (Input selection/clipboard, `picture`/mask
validator, `MultiCheckGroup`, the modal focus-trap, multi-column clusters) is registered in
[`requirements/DEFERRED.md`](../../requirements/DEFERRED.md).

## Document Index

| #   | Document                                       | Description                                          |
| --- | ---------------------------------------------- | -------------------------------------------------- |
| AR  | [Ambiguity Register](00-ambiguity-register.md) | Plan-level decisions PA-1…PA-14 (audit trail)       |
| 00  | [Index](00-index.md)                           | This document — overview and navigation             |
| 01  | [Requirements](01-requirements.md)             | Feature requirements and scope (Source: RD-06)      |
| 02  | [Current State](02-current-state.md)           | The `@jsvision/ui` seams + TV sources to build on   |
| 03-01 | [Foundation](03-01-foundation.md)            | `ev.emit()` primitive · core Theme roles · subsystem |
| 03-02 | [Text + Label](03-02-text-label.md)          | `TStaticText`/`TLabel` controls                     |
| 03-03 | [Button](03-03-button.md)                    | `TButton` control                                   |
| 03-04 | [Validators](03-04-validators.md)            | `filter`/`range`/`lookup` validator model           |
| 03-05 | [Input](03-05-input.md)                      | `TInputLine` lean editor                            |
| 03-06 | [Clusters](03-06-clusters.md)                | `TCluster`/`CheckGroup`/`RadioGroup`                |
| 03-07 | [Demo](03-07-demo.md)                        | `demo:controls` walkthrough                         |
| 07  | [Testing Strategy](07-testing-strategy.md)     | ST-* spec oracles + verification                    |
| 99  | [Execution Plan](99-execution-plan.md)         | Phases, sessions, task checklist                    |

## Quick Reference

### Usage sketch
```ts
const name = signal('');
const form = new Group();
form.add(new Label('~N~ame', nameInput));
form.add((nameInput = new Input({ value: name, validator: filter('A-Za-z ') })));
form.add(new CheckGroup(['~B~old', '~I~talic'], styleFlags));   // Signal<boolean[]>
form.add(new RadioGroup(['~L~eft', '~C~enter'], align));        // Signal<number>
form.add(new Button('~O~K', { command: 'ok', default: true }));
```

### Key Decisions
| Decision | Outcome | AR/PA |
|----------|---------|-------|
| Command emission | `ev.emit(cmd, arg?)` on `DispatchEvent` (additive) | PA-1 |
| Invalid focus-leave | expose `valid()`+`invalid`, no trap (trap → RD-11) | PA-2 |
| Cluster value | `CheckGroup: Signal<boolean[]>` · `RadioGroup: Signal<number>` | PA-3 |
| Theme bytes | pinned from `app.h` in the spec oracle; buttons reuse `button`/`buttonFocused` | PA-5 |
| Validators | `{isValidInput, isValid, error?}` + `filter`/`range`/`lookup` factories | PA-12 |

## Related Files
- New: `packages/ui/src/controls/{text,label,button,input,cluster,check-group,radio-group,index}.ts` + `controls/validators/{types,filter,range,lookup,index}.ts`
- Edited (intra-ui): `view/types.ts` + `event/dispatch.ts`/`event/types.ts` (the `emit` envelope primitive)
- Edited (core, additive): `packages/core/src/engine/color/theme.ts` (the new control roles)
- New demo: `packages/examples/controls-demo/main.ts` + `packages/examples/test/controls-demo.e2e.test.ts`
- New tests: `packages/ui/test/controls.*.{spec,impl}.test.ts` + `packages/core/test/color-palette-theme.spec.test.ts` (role additions)
