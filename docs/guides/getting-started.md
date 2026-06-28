# Getting Started

> **Last Updated**: 2026-06-28

## Prerequisites

| Tool    | Version                                        | Installation       |
| ------- | ---------------------------------------------- | ------------------ |
| Node.js | Active LTS 18 / 20 / 22 (`engines.node >= 18`) | https://nodejs.org |
| npm     | Ships with Node                                | —                  |

The package is **ESM-only** and has **zero runtime dependencies**.

## Install

```bash
npm install @blendsdk/tui-core
```

## First Use

```ts
import { resolveCapabilities, ScreenBuffer, serialize } from '@blendsdk/tui-core';

// 1. Detect what the terminal can do (auto-configuration).
const { profile: caps } = resolveCapabilities({ env: process.env, platform: process.platform });

// 2. Compose a frame.
const buf = new ScreenBuffer(20, 3, { fg: 'default', bg: 'default' });
buf.box(0, 0, 20, 3, { fg: 'cyan', bg: 'default' }, 'single', 'hello');

// 3. Serialize to minimal ANSI and write it.
process.stdout.write(serialize(buf, null, { caps }));
```

> `require('@blendsdk/tui-core')` is not supported (no CommonJS condition). Use `import`
> or a dynamic `await import('@blendsdk/tui-core')`.

## Working on the Library

### 1. Clone & install

```bash
git clone <repository-url>
cd Ink
npm install
```

### 2. Verify the toolchain

```bash
npm run verify   # typecheck + typecheck:examples + build + test
```

## Project Structure

```
src/engine/            Source. Single public entry point: src/engine/index.ts.
  capability/          RD-02 capability detection core.
  input/               RD-06 input decoder.
  render/              RD-04 rendering engine (buffer + serialize + glyphs + osc).
  color/               RD-05 depth-aware SGR encoding.
  host/                RD-07 host & lifecycle (tty host behind a RuntimeAdapter).
  safety/              RD-08 essentials gate, sanitize, logger, errors.
bench/                 RD-10 frame benchmark (npm run bench).
test/                  ALL tests (*.spec.test.ts / *.impl.test.ts / *.e2e.test.ts).
examples/              Dev-only examples (capability-probe, resize-demo); never published.
scripts/               Build/policy scripts (run-tests, check-no-native-deps, gate).
docs/                  This documentation set + the acceptance-gate map.
plans/ requirements/   CodeOps implementation plans + requirements.
```

## Common Tasks

| Task                       | Command              |
| -------------------------- | -------------------- |
| Verify (build + test)      | `npm run verify`     |
| Unit tests                 | `npm test`           |
| Lint + format check        | `npm run lint`       |
| Auto-fix lint/format       | `npm run lint:fix`   |
| Dependency policy guard    | `npm run check:deps` |
| Acceptance gate (go/no-go) | `npm run gate`       |
| Performance bench          | `npm run bench`      |
| Capability probe (dev)     | `npm run probe`      |

## Next Steps

- Read the [System Overview](/architecture/system-overview) for the architecture.
- Skim the [API Reference](/architecture/api-design) for the public surface.
- Review the [Architecture Decisions](/decisions/) to understand why things are built this way.
- Check the [Development Workflow](/guides/development) for conventions and the test split.
