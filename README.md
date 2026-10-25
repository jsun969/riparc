# riparc

Arc behaviour for Chromium browsers (Chrome, Edge).

## Ctrl+Tab: recent tabs

**Ctrl+Tab switches between your most recently used tabs**, like Alt+Tab on Windows, instead of walking the tab strip left to right.

- Quick Ctrl+Tab (press and release): switch straight to the previous tab. Do it again to jump back.
- Hold Ctrl and keep tapping Tab: each tap switches to the next recent tab (5 by default), wrapping back to where you started. While you hold, every tab in that loop is highlighted in the tab strip.
- Add Shift to go the other way: Ctrl+Shift+Tab steps back toward the newest tab, and from a fresh start it jumps to the oldest tab in the loop.
- Release Ctrl: you stay on the tab you're on, and the highlight clears.

The highlight appears once you've held Ctrl for the highlight delay (300 ms by default) or tapped Tab a second time, so quick switches never flash it. Recent-tab history is per window. Clicking a tab outside the loop mid-cycle ends the cycle.

Ctrl+Tab needs [Karabiner-Elements](https://karabiner-elements.pqrs.org/) (macOS), because the browser doesn't let extensions use Ctrl+Tab or notice Ctrl being released. Without it you can press Ctrl+Q instead; a cycle then ends 5 seconds after your last press.

## Shift+click: peek

Shift+click a link and it opens in a peek: a popup window (no tab strip or address bar) centred over the current window, instead of a new browser window.

- Links clicked inside the peek open in the peek; Shift+click inside it navigates the peek too.
- Press Esc to close the peek. By default it also closes as soon as it loses focus (click the main window, switch apps); turn that off in settings to keep it open until you close it.
- To keep the page, press Cmd+O (Ctrl+O elsewhere). It opens as a real tab right after the tab you Shift+clicked from, and the peek closes. The page reloads, so scroll position and unsaved form input are lost.
- Only links in web pages are peeked. `edge://` / `chrome://` pages, the Web Store, the PDF viewer, and the browser's own UI keep the normal Shift+click.

## Setup

Requires Chrome or Edge 121+, Node, [pnpm](https://pnpm.io), and [just](https://just.systems).

1. Build:

   ```sh
   just install
   just build
   ```

2. Load the extension: open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**, click **Load unpacked**, and select `dist/`. Accept the request to access all sites; peek needs it to catch Shift+clicks.

3. Check the shortcuts at `chrome://extensions/shortcuts` (or `edge://extensions/shortcuts`):

   | Command | macOS | Elsewhere |
   |---|---|---|
   | Switch to the next most recently used tab | Ctrl+Q | Alt+Q |
   | Switch to the previous most recently used tab | Ctrl+Shift+W | Alt+Shift+W |
   | End the switch (Karabiner sends this on Ctrl release) | Ctrl+Shift+Q | Alt+Shift+Q |
   | Open the peek as a tab | Cmd+O | Ctrl+O |

   Leave the first three as they are; the Karabiner rule sends exactly those keys. If a shortcut is empty (another extension already uses it), set it by hand.

4. Add the Karabiner rule (macOS):

   1. Run `just karabiner` to copy the rule to the clipboard.
   2. In Karabiner-Elements: **Settings → Complex Modifications → Add your own rule**, paste, and save.

   The rule covers Chrome and Edge. For another Chromium browser, add its bundle identifier to every `bundle_identifiers` list in [`karabiner/riparc.json`](karabiner/riparc.json).

To update, pull, run `just build`, and click reload on riparc's card in the extensions page.

## Settings

Open riparc's **Extension options** from its card in the extensions page.

| Setting | Default | Meaning |
|---|---|---|
| Tabs to cycle | 5 | How many recent tabs one cycle loops through (2 to 20) |
| Highlight delay (ms) | 300 | How long Ctrl must stay held after the first press before the loop is highlighted (0 to 2000) |
| Highlight while switching | on | Highlight the loop's tabs while holding Ctrl |
| Peek on Shift+click | on | Open Shift+clicked links in a peek popup |
| Close peek on focus loss | on | Close the peek when another window or app takes focus |
| Open peek as tab | Cmd+O | Shows the current shortcut; click to change it on the browser's shortcut page |

## Good to know

- While the loop is highlighted, Cmd+W closes every highlighted tab. It's back to a single tab once you release Ctrl.
- Opening a peek as a tab replaces the browser's own Cmd+O (Open File).
