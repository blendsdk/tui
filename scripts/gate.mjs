#!/usr/bin/env node
/**
 * RD-09 acceptance-gate aggregator (FR-7, AR-4/AR-13).
 *
 * The runnable half of the project go/no-go gate: it runs the automatable tiers
 * (verify + the Tier-3 / signal e2e files + the probe in `--auto`) and prints a
 * PASS/FAIL/DEFERRED verdict per RD-09 criterion (canonical numbering 1–11),
 * exiting non-zero if any non-deferred criterion fails. The criteria↔step map and
 * the DEFERRED set below are the single source of truth the doc table mirrors and
 * `gate.spec.test.ts` (ST-24) asserts against, so the doc and script never drift.
 *
 * Usage: `npm run gate` (or `node scripts/gate.mjs`). Importing this module is
 * side-effect-free (the gate only runs when invoked as the main script), so tests
 * can read `STEPS`/`DEFERRED`/`CRITERIA` directly.
 *
 * Exit codes: 0 = every non-deferred criterion passed; 1 = a required criterion
 * failed. Pure-Node ESM, no shell-isms beyond a win32 shell hop for npm/npx (AR-13).
 *
 * Note: the probe step writes to the checked-in `terminal-matrix.json` (RD-03
 * behavior); CI must not assert a clean tree after `gate` (or pass `--no-matrix`).
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** The 11 RD-09 go/no-go criteria (canonical numbering). */
export const CRITERIA = {
  1: 'Correct colours',
  2: 'Flicker-free + correct partial updates',
  3: 'Keyboard',
  4: 'Mouse (incl. beyond column 223)',
  5: 'Scroll',
  6: 'Resize',
  7: 'Paste',
  8: 'Clean teardown',
  9: 'Cross-platform',
  10: 'Security',
  11: 'Boundary/negative',
};

/** The automatable steps, each mapped to the criteria it provides evidence for. */
export const STEPS = [
  { id: 'verify', cmd: 'npm', args: ['run', 'verify'], criteria: [1, 2, 3, 4, 5, 7, 10, 11] },
  { id: 'tier3', cmd: 'npx', args: ['tsx', '--test', 'test/host-tier3.e2e.test.ts'], criteria: [8] },
  { id: 'signals', cmd: 'npx', args: ['tsx', '--test', 'test/host-signals.e2e.test.ts'], criteria: [8] },
  { id: 'probe', cmd: 'npm', args: ['run', 'probe', '--', '--auto'], criteria: [11] },
];

/** Criteria deferred under the local-no-remote boundary; printed DEFERRED, never failing (AR-14). */
export const DEFERRED = {
  6: 'DEF-3 real-PTY SIGWINCH resize (needs a real PTY)',
  9: 'DEF-1/DEF-2 cross-platform CI cells green + macOS/Windows acceptance (no remote/platforms)',
};

/**
 * Run the gate: execute each step, then print a per-criterion verdict table.
 * @returns {number} The process exit code (0 = all required criteria passed).
 */
function runGate() {
  /** @type {Map<string, boolean>} */
  const ok = new Map();
  const useShell = process.platform === 'win32';

  for (const step of STEPS) {
    process.stdout.write(`\n▶ ${step.id}: ${step.cmd} ${step.args.join(' ')}\n`);
    const result = spawnSync(step.cmd, step.args, { stdio: 'inherit', shell: useShell });
    ok.set(step.id, result.status === 0);
  }

  process.stdout.write('\n=== RD-09 Acceptance Gate ===\n');
  let anyFail = false;
  for (let n = 1; n <= 11; n += 1) {
    const name = CRITERIA[n];
    if (DEFERRED[n]) {
      process.stdout.write(`  [DEFERRED] ${n}. ${name} — ${DEFERRED[n]}\n`);
      continue;
    }
    const steps = STEPS.filter((s) => s.criteria.includes(n));
    const passed = steps.length > 0 && steps.every((s) => ok.get(s.id));
    if (!passed) anyFail = true;
    process.stdout.write(`  [${passed ? 'PASS' : 'FAIL'}] ${n}. ${name}\n`);
  }

  const code = anyFail ? 1 : 0;
  process.stdout.write(`\nGate ${code === 0 ? 'PASSED' : 'FAILED'} (deferred criteria do not fail the gate).\n`);
  return code;
}

// Run only when invoked as the main script; importing stays side-effect-free.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exit(runGate());
}
