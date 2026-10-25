// Peek: Shift+click on a link opens it in a temporary popup window centred over
// the current window. The popup closes as soon as it loses focus, or on Esc.

const PEEKS_KEY = "peeks";
// Peek size relative to the window it was opened from.
const PEEK_SCALE = 0.85;

// Open peek window ids, mirrored to storage.session so a restarted service
// worker still knows which windows to close.
let peeksLoad: Promise<Set<number>> | undefined;

function loadPeeks(): Promise<Set<number>> {
  peeksLoad ??= chrome.storage.session
    .get(PEEKS_KEY)
    .then((items) => new Set((items[PEEKS_KEY] as number[] | undefined) ?? []));
  return peeksLoad;
}

async function savePeeks(peeks: Set<number>): Promise<void> {
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
  peeks.add(peek.id);
  await savePeeks(peeks);
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

chrome.windows.onFocusChanged.addListener((focusedWindowId) => {
  void loadPeeks().then(async (peeks) => {
    for (const id of peeks) {
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
