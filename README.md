# riparc

Arc behaviour for Chromium browsers (Chrome, Edge).

Currently one feature: **Ctrl+Tab switches between your most recently used tabs**, like Alt+Tab on Windows, instead of walking the tab strip left to right.

- Quick Ctrl+Tab (press and release): switch straight to the previous tab. Do it again to jump back.
- Hold Ctrl and keep tapping Tab: each tap switches to the next recent tab (5 by default), wrapping back to where you started. While you hold, every tab in that loop is highlighted in the tab strip.
- Release Ctrl: you stay on the tab you're on, and the highlight clears.

The highlight appears once you've held Ctrl for the highlight delay (300 ms by default) or tapped Tab a second time, so quick switches never flash it. Recent-tab history is per window. Clicking a tab outside the loop mid-cycle ends the cycle.

## Why Karabiner

Chromium reserves Ctrl+Tab, so no extension can bind it, and extension shortcuts only fire on key press, never on release. The included [Karabiner-Elements](https://karabiner-elements.pqrs.org/) rule fills both gaps while Chrome or Edge is frontmost:

| You press | Karabiner sends | riparc does |
|---|---|---|
| Ctrl+Tab | Ctrl+Q | switches to the next recent tab |
| release Ctrl | Ctrl+Shift+Q | ends the cycle and clears the highlight (ignored when not cycling) |

Without Karabiner you can press Ctrl+Q directly. riparc never hears Ctrl being released then, so a cycle ends 5 seconds after your last press.

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
   | Switch to the next most recently used tab | Ctrl+Q | Alt+Q |
   | End the switch (Karabiner sends this on Ctrl release) | Ctrl+Shift+Q | Alt+Shift+Q |

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
| Highlight delay (ms) | 300 | How long Ctrl must stay held after the first press before the loop is highlighted (0 to 2000) |
| Highlight while switching | on | Highlight the loop's tabs while holding Ctrl |
| Shortcut | | Shows the current shortcut; click to open the browser's shortcut page |

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

- The highlight is the browser's multi-select. While it shows, Cmd/Ctrl+W closes every highlighted tab; it collapses back to a single tab when you release Ctrl.
- History lives in session storage and is rebuilt from the browser's own last-accessed times after a restart.
