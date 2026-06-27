#!/usr/bin/env node
/**
 * Entry point.
 *
 * Prepares the terminal for a full-screen TUI — alternate screen buffer (no
 * scrollback/scrollbars), hidden cursor, line wrap off (so the bottom-right
 * cell never scrolls), and mouse reporting — renders the shell, and restores
 * every one of those modes on exit no matter how we leave.
 */

import { render } from 'ink';
import { App } from './app/App.js';
import {
  CLEAR_SCREEN,
  DISABLE_MOUSE,
  DISABLE_WRAP,
  ENABLE_MOUSE,
  ENABLE_WRAP,
  ENTER_ALT_SCREEN,
  HIDE_CURSOR,
  LEAVE_ALT_SCREEN,
  SHOW_CURSOR,
} from './tui/ansi.js';

if (!process.stdout.isTTY) {
  process.stderr.write('turbo-hello must be run in an interactive terminal.\n');
  process.exit(1);
}

/** Put the terminal into full-screen TUI mode. */
function enterTuiMode(): void {
  process.stdout.write(ENTER_ALT_SCREEN + HIDE_CURSOR + DISABLE_WRAP + ENABLE_MOUSE + CLEAR_SCREEN);
}

/** Restore the terminal to the state it had before the app started. */
function leaveTuiMode(): void {
  process.stdout.write(DISABLE_MOUSE + ENABLE_WRAP + SHOW_CURSOR + LEAVE_ALT_SCREEN);
}

enterTuiMode();

const { waitUntilExit } = render(<App />, {
  // We drive the screen ourselves; tell Ink not to also clear on exit.
  exitOnCtrlC: false,
  patchConsole: false,
});

/** Ensure the terminal is restored even on an unexpected crash. */
function shutdown(code: number): void {
  leaveTuiMode();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => {
  leaveTuiMode();
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});

waitUntilExit().then(() => shutdown(0));
