/**
 * terminal-matrix.json accumulation (RD-03, plan doc 03-04).
 *
 * Appends each run's report to a checked-in JSON array so the project builds a
 * cross-terminal evidence base (AR-6). The fs access is an injectable seam so the
 * merge logic is unit-testable without touching disk. A missing file starts a new
 * array; a malformed file is not fatal — the run starts fresh rather than crashing
 * (the run's primary output is unaffected).
 *
 * The `.js` extensions in the import specifiers are required by NodeNext ESM
 * resolution (they resolve to the `.ts` sources during development via tsx).
 */
import type { Report } from './report.js';

/** Minimal filesystem seam so the merge is testable without disk I/O. */
export interface MatrixFs {
  /** Read the file's text, or null when it does not exist. */
  readFile(path: string): string | null;
  /** Write the file's text (overwrites). */
  writeFile(path: string, data: string): void;
}

/**
 * Append a report to the matrix array and persist it.
 *
 * @param deps The `fs` seam, the matrix `path`, and the `report` to append.
 * @returns The updated array (also written via `fs.writeFile`).
 */
export function appendToMatrix(deps: { fs: MatrixFs; path: string; report: Report }): readonly Report[] {
  const existing = deps.fs.readFile(deps.path);
  let reports: Report[] = [];
  if (existing !== null) {
    try {
      const parsed: unknown = JSON.parse(existing);
      if (Array.isArray(parsed)) {
        reports = parsed as Report[];
      }
      // A non-array (malformed) file is ignored: start fresh rather than crash.
    } catch {
      // Unparseable file: start fresh; the run's primary output is unaffected.
      reports = [];
    }
  }

  reports.push(deps.report);
  deps.fs.writeFile(deps.path, `${JSON.stringify(reports, null, 2)}\n`);
  return reports;
}
