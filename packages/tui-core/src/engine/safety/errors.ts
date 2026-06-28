/**
 * Typed error model for the SDK (RD-08 §Error model; AR-7).
 *
 * A single {@link TuiError} base lets consumers `catch (e) { if (e instanceof
 * TuiError) ... }` to handle every error the SDK raises, while the concrete
 * subclasses carry the specifics: {@link EssentialsNotMetError} reports the unmet
 * runtime essentials, and {@link LoggerConfigError} signals a logger sink that
 * would corrupt the UI stream.
 */

/**
 * Base class for every error the SDK throws, so consumers can catch `TuiError`
 * broadly. Sets `name` to the concrete subclass name so it reads correctly in
 * stack traces. [AR-7]
 */
export class TuiError extends Error {
  /**
   * @param message Human-readable description (never carries raw input/secrets).
   */
  public constructor(message: string) {
    super(message);
    this.name = new.target.name; // concrete subclass name in stacks
  }
}

/**
 * Thrown when the runtime essentials are not met and the SDK refuses to start.
 * [AR-1, AR-2, AR-7]
 */
export class EssentialsNotMetError extends TuiError {
  /** The unmet essential(s), e.g. `['interactive TTY (raw-mode keyboard input)']`. */
  public readonly missing: readonly string[];

  /**
   * @param missing The unmet essential(s); included in the message verbatim.
   */
  public constructor(missing: readonly string[]) {
    super(`Terminal does not meet the SDK essentials: ${missing.join(', ')}.`);
    this.missing = missing;
  }
}

/**
 * Thrown by {@link createLogger} when a configured sink resolves to the UI
 * output stream — failing fast so a misconfigured logger can never corrupt the
 * screen (AC-7). [AR-7, AR-10]
 */
export class LoggerConfigError extends TuiError {}
