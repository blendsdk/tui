/**
 * Story: `Dialog` (RD-11) — a button that opens a modal `TDialog` and reports the outcome.
 *
 * The launch button calls `ctx.execView` (wired by the live shell) to open a modal dialog hosting a
 * `Label`-linked `Input` with a `range(0,120)` validator + OK/Cancel. OK is vetoed while the age is
 * out of range (the `valid()` gate); Cancel/Esc/[×] always close. A live echo shows the resolved
 * command + the entered age. Headless (no `ctx.execView`, e.g. the smoke test) it renders the launch
 * button + a hint and the modal path is exercised by `demo:containers` instead (PA-11).
 *
 * The `.js` extension in import specifiers is required by NodeNext ESM resolution.
 */
import {
  Group,
  Dialog,
  Button,
  Label,
  Input,
  Text,
  signal,
  range,
  okButton,
  cancelButton,
  Commands,
} from '@jsvision/ui';
import { at } from '../story.js';
import type { Story, StoryContext } from '../story.js';

export const dialogStory: Story = {
  id: 'containers/dialog',
  category: 'Containers',
  title: 'Dialog',
  rd: 'RD-11',
  blurb: 'TDialog: a modal form. OK is vetoed while Age is out of range (the valid() gate); Cancel/Esc/[×] close.',
  build(ctx: StoryContext) {
    const age = signal('30');
    const result = signal('(not opened yet)');
    const g = new Group();

    /** Build a fresh modal dialog each open (execView mounts/unmounts it). */
    const openDialog = (): void => {
      if (ctx.execView === undefined) {
        result.set('(headless — run demo:containers for the modal)');
        return;
      }
      const dlg = new Dialog({ title: ' Person ', rect: { x: 4, y: 2, width: 40, height: 9 } });
      const ageInput = new Input({ value: age, validator: range(0, 120) });
      dlg.add(at(new Label('~A~ge (0–120)', ageInput), 2, 2, 14, 1));
      dlg.add(at(ageInput, 17, 2, 18, 1));
      dlg.add(at(okButton(), 8, 5, 10, 2));
      dlg.add(at(cancelButton(), 20, 5, 12, 2));
      void ctx.execView(dlg).then((cmd) => {
        const label = cmd === Commands.ok ? 'OK' : cmd === Commands.cancel ? 'Cancel' : String(cmd);
        result.set(`resolved: ${label}   (age = "${age()}")`);
      });
    };

    g.add(at(new Button('~O~pen dialog…', { command: 'containers.dialog.open', onClick: openDialog }), 1, 1, 16, 2));
    g.add(at(new Text(() => result()), 1, 4, ctx.width - 2, 1));
    g.add(
      at(
        new Text('Set Age to 200, press OK → vetoed (focus returns to Age). Fix it → OK resolves.'),
        1,
        6,
        ctx.width - 2,
        1,
      ),
    );
    return g;
  },
};
