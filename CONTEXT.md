# riparc: agent context

Context for agents working on this repo. `README.md` is the human usage guide; don't duplicate it here, and don't put implementation detail there.

## Project

- Manifest V3 extension that brings Arc behaviour to Chromium browsers. Targets Chrome and Edge 121+ on macOS; the owner uses Edge with Karabiner-Elements.
- Features: MRU tab cycling on Ctrl+Tab, and Shift+click peek popups.
- Owner tests manually in the browser. No automated tests; verify with `just check` / `just build`.

## Workflow

- pnpm for packages, `just` for every task (recipes in `justfile`).
- Commit only when asked. Messages use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).
- Remote: private `github.com/jsun969/riparc`. Push only when asked.
- Don't install the Karabiner rule into `~/.config/karabiner`; it lives in the repo and the owner pastes it (`just karabiner` copies it to the clipboard).

| Recipe | Does |
|---|---|
| `just install` | `pnpm install` |
| `just build` | `tsc` into `dist/`, then copy `static/*` into `dist/` |
| `just watch` | build, then `tsc --watch` (static files not re-copied) |
| `just check` | `tsc --noEmit` |
| `just zip` | clean, build, zip `dist/` to `riparc.zip` |
| `just clean` | trash `dist/` and `riparc.zip` |
| `just karabiner` | `pbcopy < karabiner/riparc.json` |

## Build

- Plain `tsc`, no bundler. `tsconfig.json`: ES2022 modules, strict, `noUncheckedIndexedAccess`, `rootDir: src`, `outDir: dist`.
- Service worker (`background.js`) and options page load as ES modules; relative imports must end in `.js`.
- `src/peek-content.ts` is a manifest content script, so it must compile to a classic script: no `import`/`export` (even `import type`), and all code wrapped in a top-level `{ }` block, because it can be injected twice into the same isolated world and top-level `let`/`const` would collide.
- `static/` (manifest, options.html) is copied verbatim.

## Files

| File | Role |
|---|---|
| `static/manifest.json` | Permissions `storage`, `scripting`; host `<all_urls>`; content script `peek-content.js` (all frames, `document_start`); four commands |
| `src/background.ts` | Service worker entry. MRU tracking and Ctrl+Tab cycling. Imports `peek.js` for its side effects |
| `src/peek.ts` | Peek windows: open, track, close on blur/Esc, expand to tab, inject content script on install/update |
| `src/peek-content.ts` | In-page: Shift+click interception, Esc to close |
| `src/settings.ts` | Single source of settings, defaults, numeric bounds, get/set helpers |
| `src/options.ts`, `static/options.html` | Settings page. Inputs bind generically via `data-setting`; one button shows the `expand-peek` shortcut and opens `edge://` or `chrome://extensions/shortcuts` |
| `karabiner/riparc.json` | A single Karabiner rule object (for "Add your own rule"), not an assets file with `title`/`rules` |

## Commands and the Karabiner bridge

Chromium reserves Ctrl+Tab (extensions and pages never see it), `chrome.commands` can't bind Tab, and commands fire on key down only, so the extension can't see Ctrl being released. Karabiner, scoped to `com.google.Chrome` and `com.microsoft.edgemac`, translates:

| Physical | Karabiner sends | Command | Suggested key (mac / default) |
|---|---|---|---|
| Ctrl+Tab | Ctrl+Q (tap) | `cycle-recent-tab` | `MacCtrl+Q` / `Alt+Q` |
| Ctrl+Shift+Tab | Ctrl+Shift+W (tap) | `cycle-recent-tab-reverse` | `MacCtrl+Shift+W` / `Alt+Shift+W` |
| any Ctrl release | Ctrl+Shift+Q (`to_after_key_up` on left/right control) | `commit-cycle` | `MacCtrl+Shift+Q` / `Alt+Shift+Q` |
| (pressed directly) | | `expand-peek` | `Command+O` / `Ctrl+O` |

- The Tab mappings end with `{ "key_code": "vk_none" }` so Ctrl+Q is a tap, not held. Holding Q made the release's Ctrl+Shift+Q arrive as a repeat that Chromium ignored, so quick taps never committed. Side effect: holding Tab doesn't auto-repeat.
- `commit-cycle` is sent on every Ctrl release in the browser; the worker ignores it when no cycle is active.
- All four suggested-key slots (the Chromium maximum) are used. Adding a command means it can't have a suggested key.
- Suggested keys apply on first install only; reloading an unpacked extension doesn't reassign changed or new ones. Users can always rebind on the shortcuts page; extensions can't lock keys.
- Karabiner keys and command keys must stay in sync.

## MRU cycling (`background.ts`)

State (mirrored to `chrome.storage.session` under `state`, survives worker restarts, cleared on browser restart):

- `mru: Record<windowId, tabId[]>`, most recent first, per window.
- `cycle: Cycle | null`: `windowId`, `order` (snapshot of the top `cycleSize` MRU tabs, `order[0]` = start tab), `index` (tab the last press switched to), `lastPressAt`, `highlight` (setting captured at cycle start), `highlightShown`.

Every event handler runs through `serialize()`, a promise queue that loads state, ends an idle cycle, runs the task, and persists. Never mutate state outside it.

- Seeding: with no stored state, MRU is built from `tab.lastAccessed` (why min version is 121). `buildOrder` also reconciles against live tabs at cycle start.
- Press (`cycle(step)`): start a cycle if none (needs 2+ tabs), move `index` by `step` with wraparound (reverse from a fresh start lands on the oldest loop tab), and switch immediately.
  - First press, highlight not yet shown: `tabs.update(active)`, then a `highlightDelayMs` timer calls `showHighlight`.
  - Second press, or highlight already shown: `applyHighlight`, i.e. `tabs.highlight` with the target index first (it activates the first index) and the rest of the loop selected.
- Commit (`finishCycle`, on `commit-cycle`, idle, or loop collapse): MRU-touch the actually active tab; if the highlight was shown, deselect the other loop tabs with `tabs.update({ highlighted: false })`.
- Idle fallback: `IDLE_COMMIT_MS` = 5000 after the last press, for when Karabiner isn't running. Checked by timer and lazily in `serialize()`.
- `onActivated` during a cycle: activations of loop tabs are ours and ignored; any other tab cancels the cycle and is touched.
- Tab removal mid-cycle (`dropFromCycle`) adjusts `index`; fewer than 2 tabs ends the cycle. Also handles detach/attach/replace/window removal.

Behaviour history:
1. v1 switched on each press and ended the cycle on a timer. The owner found that wrong.
2. v2 moved a cursor highlight without switching and switched on release. Also wrong.
3. Current: quick tap switches to the previous tab with no highlight; holding shows all loop tabs highlighted while switching live; release ends it.

## Peek (`peek.ts`, `peek-content.ts`)

- Content script: capture-phase `click` on `window`; plain Shift+left-click on an `<a>`/`<area>` (via `composedPath`) with an http(s) `href` and no `download` attribute. It calls `preventDefault` + `stopImmediatePropagation` and messages `{ type: "peek", url }`.
- Esc: bubble-phase `keydown`, skipped if `defaultPrevented` or `window.locationbar.visible` (only popups lack it); messages `close-peek`. The worker checks the window really is a peek.
- Orphaned content scripts (after an extension reload) step aside when `chrome.runtime?.id` is undefined, so the browser default or a fresh copy handles the event.
- `peekEnabled` is read from `chrome.storage.sync` in the content script directly (it can't import `settings.ts`); keep its key and default in sync with `DEFAULT_SETTINGS`.
- Worker: `windows.create({ type: "popup" })` at 85% of the source window, centred. Peeks are tracked as `Map<peekWindowId, { windowId, tabId }>` (source), persisted to `storage.session` under `peeks` as entries.
- Shift+click inside a peek navigates the peek instead of stacking.
- `windows.onFocusChanged` closes every peek that isn't the newly focused window (including `WINDOW_ID_NONE`, i.e. app switch).
- `expand-peek` (Cmd+O): only acts when the command's tab is in a peek. `chrome.tabs.move` can't move tabs out of popup windows, so it `tabs.create`s the URL right after the source tab (wherever it is now, with `openerTabId`), falling back to the source window, then a new window. It focuses that window and removes the peek.
- `onInstalled` (install/update) injects `peek-content.js` into all open tabs and frames; failures on restricted pages are ignored.
- Tried and removed: an in-page "Open as tab" button (closed shadow root, popover top layer). It didn't appear for the owner, who asked for the shortcut only.

## Settings (`settings.ts`)

| Key | Default | Bounds |
|---|---|---|
| `cycleSize` | 5 | 2 to 20 |
| `highlightDelayMs` | 300 | 0 to 2000, step 50 |
| `highlightWhileSwitching` | true | |
| `peekEnabled` | true | |

Stored in `chrome.storage.sync`; numbers are clamped on read and write. The worker reads settings per press. The options page has no secondary labels or descriptions.

## Known risks

- While the loop highlight shows, Cmd+W closes every selected tab.
- Peek focus-loss closing could misfire if macOS reports focus out of order, or when a native file dialog opens from a peek (unverified).
