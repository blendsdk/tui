# Test & Lint Toolchain: RD-01 Scaffolding & Toolchain

> **Document**: 03-02-test-and-lint-toolchain.md
> **Parent**: [Index](00-index.md)

## Overview

Defines the test runner (`node:test` via `tsx`), the spec/impl file split, and the
ESLint + Prettier setup. Backs the testing standard and AC-5/AC-7 (local half).

## Architecture

### Current Architecture
Tests run via `tsx --test src/app/*.test.ts`; no linter; no spec/impl split enforced
(existing files happen to be `*.impl.test.ts`).

### Proposed Changes
A single test glob covering both spec and impl files, plus ESLint flat config +
Prettier, enforced by `npm run lint` and CI.

## Implementation Details

### Test runner (PL-8)

- Invocation: `tsx --test "src/**/*.{spec,impl}.test.ts"` (the `test` script).
- Framework: Node built-in `node:test` + `node:assert/strict` — **no third-party
  test framework** (AR-2, RD-01).
- File split (testing standard, non-negotiable):
  - `*.spec.test.ts` — specification tests; expectations derive from requirements /
    AC / this plan's ST-cases, **never** from reading implementation. Immutable oracle.
  - `*.impl.test.ts` — implementation/edge/internal tests; may derive from code.
- Test files live beside the code under `src/engine/**` and are excluded from the
  shipped build via `tsconfig` `exclude` (so they never reach `dist/` — AC-3).

> **Cross-platform note:** the glob is quoted so the shell does not expand it on
> POSIX; `tsx --test` performs the match itself, keeping behaviour identical on
> Windows (AR-4).

### ESLint (flat config) — `eslint.config.js` (PL-2)

- Use the `typescript-eslint` meta-package's flat-config helper with the
  recommended + recommended-type-checked rule sets for `src/**/*.ts`.
- `eslint-config-prettier` last to disable formatting-related lint rules (Prettier
  owns formatting).
- Ignore `dist/`, `node_modules/`, `_archive/`, `coverage/`.
- Lint the test files too (same rules), since they ship no code but must stay clean.

Shape (illustrative — exact rule tuning is mechanical):

```js
// eslint.config.js
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '_archive', 'coverage'] },
  ...tseslint.configs.recommended,
  prettier,
);
```

### Prettier — `.prettierrc.json` + `.prettierignore` (PL-2)

- `.prettierrc.json`: project-wide formatting (single quotes, semicolons, trailing
  commas, print width) — values chosen to match the existing prototype style for
  consistency (coding standard: "consistency is non-negotiable").
- `.prettierignore`: `dist`, `node_modules`, `_archive`, `package-lock.json`.
- `npm run lint` runs `prettier --check .`; `npm run lint:fix` runs `prettier --write .`.

## Integration Points
- `npm run lint` is invoked by CI ([03-03](03-03-ci-and-release.md)).
- `verify` does **not** include `lint` (verify = typecheck + test + build per RD-01);
  CI runs `lint` as a separate step so a lint failure is distinguishable from a
  build/test failure. *(Consistent with RD-01's explicit `verify` definition.)*

## Error Handling

| Error Case | Handling Strategy | Ref |
| ---------- | ----------------- | --- |
| Lint/format violation | `npm run lint` exits non-zero; CI step fails | PL-2 |
| A `*.spec.test.ts` fails after implementation | Implementation is wrong, not the test (immutable oracle) — fix the code | testing standard |
| Test file accidentally shipped | `tsconfig` `exclude` keeps tests out of `dist/`; packaging spec test asserts it | AC-3 |

> **Traceability:** see [`00-ambiguity-register.md`](00-ambiguity-register.md).

## Testing Requirements
- The toolchain is exercised by the ST-cases in [07-testing-strategy.md](07-testing-strategy.md):
  packaging assertions, `VERSION` assertions, and the `noUnused*` boundary check.
- A trivial `*.impl.test.ts` confirms the runner discovers both `*.spec.test.ts` and
  `*.impl.test.ts` globs (guards PL-8's glob).
