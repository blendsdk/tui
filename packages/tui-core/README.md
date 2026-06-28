# @blendsdk/tui-core

The foundation engine of the `@blendsdk/tui` SDK for building Turbo Vision-style
terminal (TUI) applications in TypeScript: capability detection & auto-config, a
pure byte→event input decoder, a width-correct rendering engine with a pure
damage-diff serializer, depth-aware colour encoding, a native tty host with
guaranteed restore on every exit path, and a safety layer (essentials gate,
sanitize boundary, typed errors).

ESM-only, zero runtime dependencies, Node ≥ 20.

```bash
npm install @blendsdk/tui-core
```

```ts
import { resolveCapabilities, ScreenBuffer, serialize } from '@blendsdk/tui-core';
```

See the [monorepo root](../../README.md) and the architecture docs under
[`docs/`](../../docs/) for the full reference, versioning policy, and ADRs.
