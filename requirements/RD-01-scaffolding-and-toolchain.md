# RD-01: Scaffolding & Toolchain

> **Document**: RD-01-scaffolding-and-toolchain.md
> **Status**: Draft
> **Created**: 2026-06-27
> **Project**: @blendsdk/tui (Foundation)
> **Depends On**: —
> **CodeOps Skills Version**: 2.0.0

---

## Feature Overview

Establishes the project skeleton for `@blendsdk/tui`: the TypeScript + ESM build,
the npm package identity, the test toolchain, linting, the CI matrix, and the
release process. Everything else in this requirements set is built on this. The
package must be a clean, typed, tree-shakeable ESM library with **zero native
runtime dependencies** so it installs and runs identically on Linux, macOS, and
Windows.

---

## Functional Requirements

### Must Have
- [ ] npm package named **`@blendsdk/tui`**, `"type": "module"` (ESM-only), license **MIT**.
- [ ] TypeScript with `strict: true`, `noUnusedLocals`, `noUnusedParameters`; compiles to ESM (`NodeNext`).
- [ ] Foundation-first layout under `src/`, each module with a single public entry point (`index.ts`); files target 200–500 lines.
- [ ] Ship type declarations (`.d.ts`) and source maps in the published package.
- [ ] Dev runner: `tsx` for running TS directly; build via `tsc` to `dist/`.
- [ ] Test runner: Node built-in `node:test` + `node:assert`; spec vs impl test files separated (`*.spec.test.ts`, `*.impl.test.ts`).
- [ ] Scripts: `build`, `typecheck`, `test`, `lint`, `verify` (typecheck + test + build).
- [ ] CI matrix on **ubuntu-latest, macos-latest, windows-latest** running `verify` on Node active-LTS versions (18, 20, 22).
- [ ] `engines.node >= 18`; `package.json` `exports` map; `sideEffects: false`; `files` allowlist.
- [ ] The prototype's reusable primitives are migrated from `src/tui/*` and `src/app/{buffer,serialize,ansi,input,geometry}` into the new `engine/` layout (per later RDs), not rewritten from scratch where they already work.

### Should Have
- [ ] Linting/formatting (ESLint + Prettier or Biome) enforced in CI.
- [ ] `npm publish` with provenance; automated changelog generation.
- [ ] A `examples/` workspace for demo apps and the probe harness.

### Won't Have (Out of Scope)
- Dual ESM+CJS output — **ESM-only** per AR-6.
- Monorepo/workspaces tooling beyond a single package (revisit when UI packages exist).
- Any runtime/UI code — covered by RD-02…RD-08.

---

## Technical Requirements

### Package layout
```
src/
  engine/            # the foundation (RD-02,04,05,06,07,08)
    index.ts         # single public entry point of the SDK foundation
  ...
examples/            # probe harness (RD-03) + demo apps
test/                # golden + PTY harnesses (RD-09)
```

### Toolchain matrix
| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript ≥5.7, `strict` | AR-2 (own typed core) |
| Module | ESM-only (`NodeNext`) | AR-6 |
| Runtime | Node ≥18 (LTS 18/20/22) | AR-20 |
| Dev exec | `tsx` | |
| Tests | `node:test` + `@xterm/headless` + `node-pty` (dev only) | RD-09; `node-pty` is a **dev/test** dep, never a runtime dep (AR-2) |
| CI | GitHub Actions matrix ubuntu/macos/windows × Node 18/20/22 | AR-4, AR-23 |

### Dependency policy
- **Runtime deps:** ideally zero; any added must be **pure-JS and MIT-compatible** (e.g. a `wcwidth`/East-Asian-width table). No native addons in runtime deps (AR-2, AR-21).
- **Dev deps:** may include native (`node-pty`) since they never ship to consumers.

---

## Integration Points

### With all RDs
- Provides the build, test, and package surface every other RD's code lands in.

### With RD-10 (Non-Functional)
- The `exports` map, `sideEffects: false`, SemVer policy, and CI matrix are the
  enforcement points for RD-10's packaging, API-stability, and cross-platform requirements.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|----------|-------------------|--------|-----------|--------|
| Module format | ESM-only / ESM+CJS | ESM-only | User decision | AR-6 |
| Package name | several | `@blendsdk/tui` | User decision | AR-6 |
| Node support | 18 only / 18+20+22 | Active LTS 18/20/22 | Enterprise reach | AR-20 |
| Runtime deps | allow native / pure-JS only | Pure-JS, ~zero | Portability across all OSes | AR-2, AR-21 |
| CI OS matrix | Linux only / 3-OS | ubuntu+macos+windows | Cross-platform is a MUST | AR-4, AR-23 |

---

## Security Considerations

- **Data sensitivity**: none handled at this layer.
- **Input validation**: n/a (no runtime input here).
- **Authentication & authorization**: n/a (library).
- **Injection risks**: none at build layer; downstream RDs handle ANSI/control sanitization.
- **Encryption needs**: none.
- **Rate limiting**: n/a.
- **Infrastructure**: CI must not expose secrets; npm publish uses provenance/OIDC, no long-lived tokens in the repo (AR-21).

---

## Acceptance Criteria

1. [ ] `npm install` of a packed tarball exposes `import { ... } from '@blendsdk/tui'` resolving via the `exports` map, with `.d.ts` types present; `require('@blendsdk/tui')` is **not** supported (ESM-only) and fails with a clear ESM error.
2. [ ] `npm run verify` (typecheck + test + build) exits 0 on ubuntu-latest, macos-latest, and windows-latest for Node 18, 20, and 22 (9 CI cells green).
3. [ ] The published package contains only `dist/` (JS + `.d.ts` + maps), `package.json`, `README`, `LICENSE` (MIT) — verified via `npm pack --dry-run`; no `src/`, tests, or `node_modules`.
4. [ ] `package.json` declares `"type":"module"`, `"sideEffects":false`, `"engines":{"node":">=18"}`, an `exports` map, and zero `dependencies` with native install steps (verified: a clean install runs no `node-gyp`).
5. [ ] Boundary: a build with an unused import/variable/parameter fails `typecheck` (proves `noUnused*` is enforced).
6. [ ] Negative: adding a runtime dependency that requires native compilation fails a CI policy check.
7. [ ] Security requirements verified: CI runs `npm audit` (or equivalent) and a publish dry-run uses provenance with no embedded secrets.
