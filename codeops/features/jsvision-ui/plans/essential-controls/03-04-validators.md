# Validators

> **Document**: 03-04-validators.md
> **Parent**: [Index](00-index.md)
> TV source: `tvalidat.cpp:639-807` · `validate.h`

Composable typed units attachable to `Input`. The `TValidator` class hierarchy is reframed as small
factory functions returning a plain `Validator` object (PA-12). Built before `Input` (03-05), which
consumes them.

## The `Validator` shape (PA-12, mirrors `validate.h`)
```ts
// controls/validators/types.ts
export interface Validator {
  /** Transient, per-keystroke: may a candidate string exist mid-edit? (TV isValidInput) */
  isValidInput(s: string): boolean;
  /** Blocking, on completion/focus-leave: is the complete value acceptable? (TV isValid) */
  isValid(s: string): boolean;
  /** Optional message for the invalid state (consumed by Input's invalid feedback, PA-2). */
  readonly error?: string;
}
```
The key TV distinction (confirmed in recon): `isValidInput` gates keystrokes (transient, allows partial);
`isValid` gates completion (blocking). `Input` calls `isValidInput` on each edit (reject the keystroke if
false) and `isValid` on focus-leave / `valid()` (set the `invalid` state if false). (PA-2)

## `filter(chars)` (TV `TFilterValidator`, `tvalidat.cpp:639-647`)
- `chars`: an allowed-character set (a string, or a compact range spec like `'0-9A-Za-z '`).
- `isValidInput(s)` = `isValid(s)` = **every char of `s` is in the set** (TV uses the same test for both;
  the live rejection comes from `Input` calling `isValidInput` per keystroke).
```ts
export function filter(chars: string): Validator;   // e.g. filter('0-9'), filter('A-Za-z ')
```

## `range(min, max)` (TV `TRangeValidator`, `tvalidat.cpp:656-704`)
- Extends the filter: `validChars` = `'0123456789'` (+ leading `'-'` when `min < 0`).
- `isValidInput(s)` = digit/sign filter only (**allows partial** numbers like `''`/`'-'`/`'12'` mid-edit).
- `isValid(s)` = digit-filter **and** parses to an integer **and** `min ≤ value ≤ max`.
```ts
export function range(min: number, max: number): Validator;  // e.g. range(0, 100)
```

## `lookup(list)` (TV `TStringLookupValidator`, `tvalidat.cpp:752-807`)
- `isValidInput(s)` = **`true`** (no per-keystroke filtering — type anything).
- `isValid(s)` = `list.includes(s)` (exact membership on completion).
```ts
export function lookup(list: readonly string[]): Validator;  // e.g. lookup(['red','green','blue'])
```

## Deferred
- `picture(mask)` (`TPXPictureValidator`, the mask mini-DSL) → RD-07 (AR-95, `DEFERRED.md`).

## Error handling
| Case | Strategy | Ref |
|------|----------|-----|
| empty string vs a blocking validator | `range('')`/`lookup('')` ⇒ `isValid` false (not in range / not in list); but `isValidInput('')` true (partial allowed) | tvalidat.cpp:694 |
| `range` non-numeric leftover | `isValid` false (parse fails) | tvalidat.cpp:694-704 |
| an empty `chars`/`list` | `filter('')` rejects all input; `lookup([])` never valid — documented, caller's choice | PA-12 |

## Testing Requirements
- Spec: `filter('0-9').isValidInput('5')` true, `…('a')` false; `range(0,100).isValidInput('1')` true &
  `isValid('150')` false & `isValid('50')` true & `isValidInput('-')` true (partial); `lookup(['red']).isValidInput('x')` true & `isValid('blue')` false & `isValid('red')` true.
- Impl: range with `min<0` allows a leading `'-'`; empty-string edge for each; range parse of `'12x'`.
