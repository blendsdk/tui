/**
 * Layer-4 known-terminal table (RD-02, plan doc 03-02; PL-10).
 *
 * Maps a recognised terminal to the capabilities it is known to support, so
 * detection can fill fields the environment alone does not reveal. Lookup is
 * keyed in strict precedence order — `TERM_PROGRAM`, then `WT_SESSION` (Windows
 * Terminal), then `TERM` family, then the VTE/Konsole version markers — and the
 * first match wins. Unknown terminals contribute nothing and fall through to
 * env/defaults.
 *
 * Values are conservative-but-known: probe-dependent nuances (emoji width, some
 * OSC notifications) stay at their defaults here and are refined by RD-03 (PL-2).
 * `colorDepth` is intentionally omitted for the `xterm` family so the env signal
 * (`COLORTERM`/`TERM`) drives it; richer terminals assert their known depth.
 */
import type { CapabilityProfile, DeepPartial, MouseCaps } from './profile.js';

/** Mouse support common to every modern terminal in the table (shared, read-only). */
const FULL_MOUSE: MouseCaps = { sgr: true, drag: true, wheel: true };

/** Known capabilities for terminals identified by `TERM_PROGRAM`. */
const BY_TERM_PROGRAM: Readonly<Record<string, DeepPartial<CapabilityProfile>>> = {
  // iTerm2 — full modern feature set incl. synchronized output (per 03-02).
  'iTerm.app': {
    colorDepth: 'truecolor',
    mouse: FULL_MOUSE,
    osc: { hyperlink8: true, clipboard52: true, title: true, notify9: true },
    sync2026: true,
    altScreen: true,
    bracketedPaste: true,
  },
  // Apple Terminal — known to NOT support truecolor (caps at 256).
  Apple_Terminal: {
    colorDepth: '256',
    mouse: FULL_MOUSE,
    osc: { title: true },
    altScreen: true,
    bracketedPaste: true,
  },
  // VS Code integrated terminal (xterm.js).
  vscode: {
    colorDepth: 'truecolor',
    mouse: FULL_MOUSE,
    osc: { hyperlink8: true, title: true },
    altScreen: true,
    bracketedPaste: true,
  },
};

/** Known capabilities for terminals identified by a `TERM` family/prefix. */
const BY_TERM_PREFIX: ReadonlyArray<{
  prefix: string;
  caps: DeepPartial<CapabilityProfile>;
}> = [
  // Kitty — native keyboard protocol + synchronized output.
  {
    prefix: 'xterm-kitty',
    caps: {
      colorDepth: 'truecolor',
      mouse: FULL_MOUSE,
      keyboard: { kittyFlags: true },
      osc: { hyperlink8: true, clipboard52: true, title: true },
      sync2026: true,
      altScreen: true,
      bracketedPaste: true,
    },
  },
  // Alacritty.
  {
    prefix: 'alacritty',
    caps: {
      colorDepth: 'truecolor',
      mouse: FULL_MOUSE,
      osc: { clipboard52: true, title: true },
      altScreen: true,
      bracketedPaste: true,
    },
  },
  // foot — synchronized output + hyperlinks.
  {
    prefix: 'foot',
    caps: {
      colorDepth: 'truecolor',
      mouse: FULL_MOUSE,
      osc: { hyperlink8: true, title: true },
      sync2026: true,
      altScreen: true,
      bracketedPaste: true,
    },
  },
  // GNU screen — multiplexer; conservative caps only.
  { prefix: 'screen', caps: { multiplexer: true, altScreen: true } },
  // tmux — multiplexer; conservative caps only.
  { prefix: 'tmux', caps: { multiplexer: true, altScreen: true } },
  // xterm family — colorDepth left to the env signal; modifyOtherKeys known.
  {
    prefix: 'xterm',
    caps: {
      mouse: FULL_MOUSE,
      keyboard: { modifyOtherKeys: true },
      osc: { title: true },
      altScreen: true,
      bracketedPaste: true,
    },
  },
];

/** GNOME Terminal / other VTE-based terminals, identified by `VTE_VERSION`. */
const VTE_CAPS: DeepPartial<CapabilityProfile> = {
  colorDepth: 'truecolor',
  mouse: FULL_MOUSE,
  osc: { hyperlink8: true, title: true },
  altScreen: true,
  bracketedPaste: true,
};

/** KDE Konsole, identified by `KONSOLE_VERSION`. */
const KONSOLE_CAPS: DeepPartial<CapabilityProfile> = {
  colorDepth: 'truecolor',
  mouse: FULL_MOUSE,
  osc: { hyperlink8: true, title: true },
  altScreen: true,
  bracketedPaste: true,
};

/**
 * Look up the known capabilities for the terminal described by `env`.
 *
 * Precedence (first match wins): `TERM_PROGRAM` → `WT_SESSION` → `TERM` family
 * → `VTE_VERSION` → `KONSOLE_VERSION`. An unrecognised terminal returns an empty
 * partial (contributes nothing).
 *
 * @param env The environment to inspect (never mutated or logged).
 * @returns A capability partial for the matched terminal, or `{}` if none.
 */
export function lookupTable(env: NodeJS.ProcessEnv): DeepPartial<CapabilityProfile> {
  const termProgram = env.TERM_PROGRAM;
  if (termProgram !== undefined && termProgram in BY_TERM_PROGRAM) {
    return BY_TERM_PROGRAM[termProgram];
  }

  // Windows Terminal advertises itself only via WT_SESSION.
  if (env.WT_SESSION !== undefined) {
    return {
      colorDepth: 'truecolor',
      mouse: FULL_MOUSE,
      osc: { hyperlink8: true, title: true },
      altScreen: true,
      bracketedPaste: true,
    };
  }

  const term = env.TERM;
  if (term !== undefined) {
    for (const entry of BY_TERM_PREFIX) {
      if (term.startsWith(entry.prefix)) {
        return entry.caps;
      }
    }
  }

  if (env.VTE_VERSION !== undefined) {
    return VTE_CAPS;
  }
  if (env.KONSOLE_VERSION !== undefined) {
    return KONSOLE_CAPS;
  }

  return {};
}
