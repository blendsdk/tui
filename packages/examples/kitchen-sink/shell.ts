/**
 * The kitchen-sink **shell** — the showcase app: a `createApplication` desktop whose menu bar is
 * generated from the story registry, a full-screen grey {@link StoryWindow} canvas that swaps to the
 * selected story, and the navigation glue (menu / clickable status items / `Ctrl`+arrows).
 *
 * This is the **Navigator seam**: today navigation is menu-driven (pure existing TV primitives, the
 * canonical Turbo Vision idiom, zero throwaway). When RD-11 lands `ListView`/`ScrollBar`, only this
 * file changes — the persistent sidebar navigator is built here and every `Story` stays untouched.
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import {
  createApplication,
  menuBar,
  subMenu,
  item,
  separator,
  statusLine,
  statusItem,
  Commands,
  Group,
  Text,
  View,
  createRoot,
  type DispatchEvent,
  type DrawContext,
} from '@jsvision/ui';
import type { CapabilityProfile } from '@jsvision/core';
import { StoryWindow, CommandSink } from './window.js';
import { STORIES } from './stories/index.js';
import { at, firstFocusable } from './story.js';
import type { Story } from './story.js';

/** Showcase navigation command names (not built-in shell commands). */
const CMD_HOME = 'kitchen.home';
const CMD_NEXT = 'kitchen.next';
const CMD_PREV = 'kitchen.prev';

/** Mark a string's first character as its `Alt` hotkey (`'Controls'` → `'~C~ontrols'`). */
function withHotkey(s: string): string {
  return `~${s[0]}~${s.slice(1)}`;
}

/** Group the registry by category, preserving first-seen order. */
function categoriesOf(stories: readonly Story[]): Map<string, Story[]> {
  const map = new Map<string, Story[]>();
  for (const story of stories) {
    const list = map.get(story.category);
    if (list !== undefined) list.push(story);
    else map.set(story.category, [story]);
  }
  return map;
}

/** Build the menu bar: a system menu, one submenu per category (its stories), and a Nav menu. */
function buildMenu(cats: Map<string, Story[]>): ReturnType<typeof menuBar> {
  const categoryMenus = [...cats.entries()].map(([cat, list]) =>
    subMenu(
      withHotkey(cat),
      list.map((s) => item(s.title, s.id)),
    ),
  );
  return menuBar([
    subMenu('≡', [item('~W~elcome', CMD_HOME, 'F1'), separator(), item('E~x~it', Commands.quit, 'Alt-X')]),
    ...categoryMenus,
    subMenu('~N~av', [item('~N~ext story', CMD_NEXT), item('~P~rev story', CMD_PREV)]),
  ]);
}

/** Build the status line: exit + navigation hints (all clickable; the chords fire where parseable). */
function buildStatus(): ReturnType<typeof statusLine> {
  return statusLine([
    statusItem('~Alt-X~ Exit', Commands.quit, 'Alt+X'),
    statusItem('~F1~ Welcome', CMD_HOME, 'F1'),
    statusItem('~^→~ Next', CMD_NEXT),
    statusItem('~^←~ Prev', CMD_PREV),
  ]);
}

/**
 * An invisible pre-process view that turns `Ctrl`+Left/Right into prev/next-story navigation,
 * regardless of the focus chain (a convenience alongside the menu + clickable status items).
 */
class NavKeys extends View {
  override preProcess = true;

  constructor(
    private readonly onNext: () => void,
    private readonly onPrev: () => void,
  ) {
    super();
    this.state.visible = false;
  }

  override draw(_ctx: DrawContext): void {
    // invisible
  }

  override onEvent(ev: DispatchEvent): void {
    const inner = ev.event;
    if (inner.type !== 'key' || !inner.ctrl) return;
    if (inner.key === 'right') {
      this.onNext();
      ev.handled = true;
    } else if (inner.key === 'left') {
      this.onPrev();
      ev.handled = true;
    }
  }
}

/** Build the welcome/index catalog view (shell-owned, so it can enumerate the registry). */
function buildWelcome(cats: Map<string, Story[]>, w: number, h: number): Group {
  const g = new Group();
  let y = 0;
  g.add(at(new Text('jsvision — a Turbo Vision-style TUI framework for TypeScript.'), 1, y, w - 2, 1));
  y += 1;
  g.add(at(new Text('The kitchen-sink showcase — a live demo of every component, grown as we build.'), 1, y, w - 2, 1));
  y += 2;
  for (const [cat, list] of cats) {
    g.add(at(new Text(`${cat}`), 1, y, 24, 1));
    y += 1;
    for (const s of list) {
      g.add(at(new Text(`  • ${s.title} — ${s.blurb}`), 2, y, w - 4, 1));
      y += 1;
    }
    y += 1;
  }
  g.add(
    at(
      new Text('Open a story from the menu bar (F10 / Alt-letter) · Ctrl+→ / Ctrl+← cycle · Alt-X exit.'),
      1,
      Math.max(y, h - 1),
      w - 2,
      1,
    ),
  );
  // Fill the canvas interior so the absolutely-positioned rows above have space to lay out.
  g.layout = { position: 'absolute', rect: { x: 0, y: 0, width: w, height: h } };
  return g;
}

/** The composed showcase: the app + a `run()` that drives it to the `quit` command. */
export interface Showcase {
  /** The composed application (loop + desktop + chrome). */
  readonly app: ReturnType<typeof createApplication>;
  /** Run the showcase until `quit`; resolves the exit code. */
  run(): Promise<number>;
}

/**
 * Compose the kitchen-sink showcase over the given capabilities.
 *
 * @param caps Resolved terminal capabilities for the render.
 * @returns The app + a `run()` entry point.
 */
export function createShowcase(caps: CapabilityProfile): Showcase {
  const cats = categoriesOf(STORIES);
  const app = createApplication({ caps, menuBar: buildMenu(cats), statusLine: buildStatus() });

  const dw = app.desktop.bounds.width;
  const dh = app.desktop.bounds.height;
  const canvas = new StoryWindow('');
  canvas.layout.rect = { x: 0, y: 0, width: dw, height: dh };
  app.desktop.addWindow(canvas);

  let currentIndex = -1; // -1 = the welcome screen
  // Disposes the reactive owner of the currently-shown story's build() (its signals/computeds/
  // effects), so swapping stories never leaks reactive computations. `null` on the welcome screen.
  let disposeStory: (() => void) | null = null;

  /** Tear down the previous story's reactive graph before showing the next content. */
  function disposePrevious(): void {
    disposeStory?.();
    disposeStory = null;
  }

  /** Swap the canvas to a new content view, set its title, and focus its first control. */
  function showView(view: View, title: string): void {
    for (const child of [...canvas.children]) canvas.remove(child);
    canvas.add(view);
    canvas.title.set(title);
    canvas.invalidateLayout();
    const focusTarget = firstFocusable(view);
    if (focusTarget !== null) app.loop.focusView(focusTarget);
  }

  /** Show a story: a blurb header + its live build() body, filling the canvas interior. */
  function showStory(story: Story): void {
    disposePrevious();
    currentIndex = STORIES.indexOf(story);
    const iw = canvas.layout.rect.width - 2; // interior (1-cell border each side)
    const ih = canvas.layout.rect.height - 2;
    const holder = new Group();
    holder.layout = { position: 'absolute', rect: { x: 0, y: 0, width: iw, height: ih } };
    const chip = story.rd !== undefined ? `[${story.rd}] ` : '';
    holder.add(at(new Text(`${chip}${story.blurb}`), 0, 0, iw, 2)); // 2 rows so long blurbs don't clip
    const bodyW = iw;
    const bodyH = Math.max(1, ih - 3);
    // Build inside a disposable owner so any signal/computed/effect the story creates is torn down
    // when we navigate away (disposed in disposePrevious), not leaked across swaps.
    let body: Group;
    createRoot((dispose) => {
      disposeStory = dispose;
      body = story.build({ caps, width: bodyW, height: bodyH });
    });
    holder.add(at(body!, 0, 3, bodyW, bodyH));
    showView(holder, `${story.category} / ${story.title}`);
  }

  /** Show the welcome/index catalog. */
  function showWelcome(): void {
    disposePrevious();
    currentIndex = -1;
    const iw = canvas.layout.rect.width - 2;
    const ih = canvas.layout.rect.height - 2;
    showView(buildWelcome(cats, iw, ih), 'jsvision · showcase');
  }

  const step = (delta: number): void => {
    const base = currentIndex < 0 ? 0 : currentIndex;
    const next = (base + delta + STORIES.length) % STORIES.length;
    const target = STORIES[next];
    if (target !== undefined) showStory(target);
  };

  const handlers: Record<string, () => void> = {
    [CMD_HOME]: showWelcome,
    [CMD_NEXT]: () => step(1),
    [CMD_PREV]: () => step(-1),
  };
  for (const story of STORIES) handlers[story.id] = () => showStory(story);
  app.desktop.add(new CommandSink(handlers));
  app.desktop.add(
    new NavKeys(
      () => step(1),
      () => step(-1),
    ),
  );

  showWelcome();

  // Force one full layout pass before the first paint. A freshly-mounted absolute canvas isn't sized
  // until a full reflow, so the very first content shown (the welcome) would otherwise compose into
  // zero space. Re-laying out at the current viewport (read from the composed buffer) fixes it; the
  // host emits resize only on SIGWINCH, so we can't rely on a start-up resize to do this for us.
  const firstRows = app.loop.renderRoot.buffer().rows();
  app.loop.resize({ width: firstRows[0]?.length ?? dw, height: firstRows.length });

  return { app, run: () => app.run() };
}
