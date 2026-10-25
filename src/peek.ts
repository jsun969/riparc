import { getSettings } from "./settings.js";

// Peek: Shift+click on a link opens it in a temporary popup window centred over
// the current window. The popup closes on Esc, and (by default) as soon as it
// loses focus. Cmd+O reopens the page as a real tab next to the tab the peek
// came from.

const PEEKS_KEY = "peeks";
// Peek size relative to the window it was opened from.
const PEEK_SCALE = 0.85;

// Where a peek was opened from, so expanding it lands next to that tab.
interface PeekSource {
  windowId: number;
  tabId: number | undefined;
}

// Open peek window id -> source, mirrored to storage.session so a restarted
// service worker still knows which windows are peeks.
let peeksLoad: Promise<Map<number, PeekSource>> | undefined;

function loadPeeks(): Promise<Map<number, PeekSource>> {
  peeksLoad ??= chrome.storage.session
    .get(PEEKS_KEY)
    .then((items) => new Map((items[PEEKS_KEY] as [number, PeekSource][] | undefined) ?? []));
  return peeksLoad;
}

async function savePeeks(peeks: Map<number, PeekSource>): Promise<void> {
  await chrome.storage.session.set({ [PEEKS_KEY]: [...peeks] });
}

async function openPeek(url: string, sender: chrome.tabs.Tab): Promise<void> {
  const peeks = await loadPeeks();
  // Shift+click inside a peek navigates the peek instead of stacking another one.
  if (peeks.has(sender.windowId)) {
    if (sender.id !== undefined) await chrome.tabs.update(sender.id, { url });
    return;
  }
  const origin = await chrome.windows.get(sender.windowId);
  const originLeft = origin.left ?? 0;
  const originTop = origin.top ?? 0;
  const originWidth = origin.width ?? 1280;
  const originHeight = origin.height ?? 800;
  const width = Math.round(originWidth * PEEK_SCALE);
  const height = Math.round(originHeight * PEEK_SCALE);
  const peek = await chrome.windows.create({
    url,
    type: "popup",
    focused: true,
    width,
    height,
    left: originLeft + Math.round((originWidth - width) / 2),
    top: originTop + Math.round((originHeight - height) / 2),
  });
  if (peek?.id === undefined) return;
  peeks.set(peek.id, { windowId: sender.windowId, tabId: sender.id });
  await savePeeks(peeks);
}

// Chromium can't move a tab out of a popup window, so the page is opened fresh
// in a normal tab and the peek is closed.
async function expandPeek(peekTab: chrome.tabs.Tab): Promise<void> {
  const source = (await loadPeeks()).get(peekTab.windowId);
  const url = peekTab.url;
  if (!source || !url) return;
  const sourceTab =
    source.tabId === undefined ? undefined : await chrome.tabs.get(source.tabId).catch(() => undefined);
  let tab: chrome.tabs.Tab | undefined;
  if (sourceTab) {
    // The source tab may have moved, so use where it is now.
    tab = await chrome.tabs.create({
      windowId: sourceTab.windowId,
      index: sourceTab.index + 1,
      openerTabId: sourceTab.id,
      url,
    });
  } else {
    tab = await chrome.tabs.create({ windowId: source.windowId, url }).catch(() => undefined);
  }
  if (tab) {
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    // The source window is gone too.
    await chrome.windows.create({ url, focused: true });
  }
  // Focusing another window usually closes the peek already.
  await chrome.windows.remove(peekTab.windowId).catch(() => {});
}

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  const tab = sender.tab;
  if (!tab || typeof message !== "object" || message === null) return;
  const { type, url } = message as { type?: unknown; url?: unknown };
  if (type === "peek" && typeof url === "string" && /^https?:/.test(url)) {
    void openPeek(url, tab);
  } else if (type === "close-peek") {
    void loadPeeks().then((peeks) => {
      if (peeks.has(tab.windowId)) return chrome.windows.remove(tab.windowId);
    });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "expand-peek" || !tab) return;
  void loadPeeks().then((peeks) => {
    if (peeks.has(tab.windowId)) return expandPeek(tab);
  });
});

chrome.windows.onFocusChanged.addListener((focusedWindowId) => {
  void loadPeeks().then(async (peeks) => {
    if (peeks.size === 0 || !(await getSettings()).peekCloseOnBlur) return;
    for (const id of peeks.keys()) {
      if (id !== focusedWindowId) await chrome.windows.remove(id).catch(() => {});
    }
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  void loadPeeks().then(async (peeks) => {
    if (peeks.delete(windowId)) await savePeeks(peeks);
  });
});

// Content scripts declared in the manifest only reach pages loaded after
// install; inject into tabs that are already open so peek works right away.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason !== "install" && reason !== "update") return;
  void chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      chrome.scripting
        .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["peek-content.js"] })
        // edge:// pages, the Web Store and discarded tabs refuse injection.
        .catch(() => {});
    }
  });
});
