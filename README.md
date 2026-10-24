# riparc

Arc behaviour for Chromium browsers (Chrome, Edge).

Currently one feature: **Ctrl+Tab switches between your most recently used tabs**, like Alt+Tab on Windows, instead of walking the tab strip left to right.

- Hold Ctrl, tap Tab: the current tab stays put and a highlight moves through your most recent tabs (5 by default), wrapping back to where you started.
- Release Ctrl: riparc switches to the highlighted tab.
- A single quick Ctrl+Tab jumps to the previous tab; doing it again jumps back.

Recent-tab history is per window. Clicking a tab mid-cycle cancels the cycle.

## Why Karabiner

Chromium reserves Ctrl+Tab, so no extension can bind it, and extension shortcuts only fire on key press, never on release. The included [Karabiner-Elements](https://karabiner-elements.pqrs.org/) rule fills both gaps while Chrome or Edge is frontmost:

| You press | Karabiner sends | riparc does |
|---|---|---|
| Ctrl+Tab | Ctrl+Q | moves the highlight to the next recent tab |
| release Ctrl | Ctrl+Shift+Q | switches to the highlighted tab (ignored when not cycling) |

Without Karabiner you can press Ctrl+Q directly; since riparc never hears Ctrl being released, it switches once the timeout passes after your last press.

## Setup

Requires Chrome or Edge 121+, Node, [pnpm](https://pnpm.io), and [just](https://just.systems).

1. Build:

   ```sh
   just install
   just build
   ```

2. Load the extension: open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, click **Load unpacked**, and select `dist/`.

3. Check the shortcuts at `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`). riparc needs both:

   | Command | Shortcut (macOS) | Elsewhere |
   |---|---|---|
   | Move the highlight to the next most recently used tab | Ctrl+Q | Alt+Q |
   | Switch to the highlighted tab | Ctrl+Shift+Q | Alt+Shift+Q |

   The browser skips a suggested shortcut if another extension already uses it; set it by hand in that case. The Karabiner rule assumes the macOS defaults above.

4. Add the Karabiner rule (macOS):

   1. `just karabiner` copies [`karabiner/riparc.json`](karabiner/riparc.json) to the clipboard.
   2. In Karabiner-Elements: **Settings → Complex Modifications → Add your own rule**, paste, and save.

   To support another Chromium browser, add its bundle identifier to both `bundle_identifiers` lists in the rule.

After changing the source, run `just build` and click reload on riparc's card in the extensions page.

## Settings

Open riparc's **Extension options** from its card in the extensions page.

| Setting | Default | Meaning |
|---|---|---|
| Tabs to cycle | 5 | How many recent tabs one cycle loops through (2 to 20) |
| Switch timeout (ms) | 1500 | Switch anyway if no Ctrl release arrives this long after the last press (100 to 5000) |
| Highlight while switching | on | Show the tab you're about to switch to as selected in the tab strip |
| Shortcut | | Shows the current shortcut; click to open the browser's shortcut page |

With Karabiner, keep the timeout comfortably above how long you pause while holding Ctrl.

## Commands

| Command | Does |
|---|---|
| `just install` | Install dependencies |
| `just build` | Build the unpacked extension into `dist/` |
| `just watch` | Build, then rebuild TypeScript on change (static files copied once) |
| `just check` | Type-check |
| `just zip` | Package `dist/` as `riparc.zip` |
| `just clean` | Move `dist/` and `riparc.zip` to the trash |
| `just karabiner` | Copy the Karabiner rule to the clipboard |

## Notes

- The highlight is the browser's multi-select. While a cycle is in progress, Cmd/Ctrl+W closes both the current tab and the highlighted one; it collapses back to a single tab as soon as you switch.
- Only the target tab is highlighted, since several selected tabs all get the same tint.
- History lives in session storage and is rebuilt from the browser's own last-accessed times after a restart.
