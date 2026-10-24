import { getSettings } from "./settings.js";

const COMMAND = "cycle-recent-tab";
const STATE_KEY = "state";

interface Cycle {
  windowId: number;
  // Snapshot of the window's most recent tabs taken when the cycle started.
  // order[0] is the tab the cycle started from.
  order: number[];
  index: number;
  expiresAt: number;
  // Whether this cycle multi-selected its tabs, so finishing knows to clear them.
  highlighted: boolean;
}

interface State {
  // windowId -> tab ids, most recently visited first.
  mru: Record<number, number[]>;
  cycle: Cycle | null;
}

// The service worker can be suspended at any time, so state is mirrored to
// storage.session (survives worker restarts, cleared on browser restart).
let state: State | null = null;
let queue: Promise<void> = Promise.resolve();
let cycleTimer: number | undefined;

// Event handlers are async; run them one at a time so they never interleave.
function serialize(task: (s: State) => void | Promise<void>): Promise<void> {
  queue = queue
    .then(async () => {
      const s = await loadState();
      if (s.cycle && Date.now() >= s.cycle.expiresAt) await finishCycle(s);
      await task(s);
      await chrome.storage.session.set({ [STATE_KEY]: s });
    })
    .catch((err) => console.error("riparc:", err));
  return queue;
}

async function loadState(): Promise<State> {
  if (state) return state;
  const stored = (await chrome.storage.session.get(STATE_KEY))[STATE_KEY] as State | undefined;
  state = stored ?? { mru: await seedFromBrowser(), cycle: null };
  return state;
}

// First run after install or browser start: use Chromium's own lastAccessed.
async function seedFromBrowser(): Promise<Record<number, number[]>> {
  const tabs = await chrome.tabs.query({});
  tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  const mru: Record<number, number[]> = {};
  for (const tab of tabs) {
    if (tab.id !== undefined) (mru[tab.windowId] ??= []).push(tab.id);
  }
  return mru;
}

function touch(s: State, windowId: number, tabId: number): void {
  const list = s.mru[windowId] ?? [];
  s.mru[windowId] = [tabId, ...list.filter((id) => id !== tabId)];
}

function forget(s: State, windowId: number, tabId: number): void {
  const list = s.mru[windowId];
  if (list) s.mru[windowId] = list.filter((id) => id !== tabId);
}

async function finishCycle(s: State): Promise<void> {
  const cycle = s.cycle;
  if (!cycle) return;
  s.cycle = null;
  clearTimeout(cycleTimer);
  // Use the tab that is actually active, in case the user clicked a tab mid-cycle.
  const [active] = await chrome.tabs.query({ active: true, windowId: cycle.windowId });
  if (active?.id === undefined) return;
  touch(s, cycle.windowId, active.id);
  if (cycle.highlighted) {
    // Drop the rest of the cycle from the selection so Cmd+W and drags only affect one tab again.
    await Promise.allSettled(
      cycle.order
        .filter((id) => id !== active.id)
        .map((id) => chrome.tabs.update(id, { highlighted: false })),
    );
  }
}

async function dropFromCycle(s: State, windowId: number, tabId: number): Promise<void> {
  const cycle = s.cycle;
  if (!cycle || cycle.windowId !== windowId) return;
  const idx = cycle.order.indexOf(tabId);
  if (idx === -1) return;
  cycle.order.splice(idx, 1);
  if (idx <= cycle.index) cycle.index -= 1;
  if (cycle.order.length < 2) await finishCycle(s);
}

// The most recent tabs in the window, reconciled against the tabs that
// actually exist, starting with the active tab.
async function buildOrder(
  s: State,
  windowId: number,
  activeTabId: number,
  size: number,
): Promise<number[]> {
  const tabs = await chrome.tabs.query({ windowId });
  const live = new Set(tabs.map((t) => t.id));
  const known = (s.mru[windowId] ?? []).filter((id) => live.has(id));
  const knownSet = new Set(known);
  const unknown = tabs
    .filter((t) => t.id !== undefined && !knownSet.has(t.id))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .map((t) => t.id as number);
  const mru = [activeTabId, ...[...known, ...unknown].filter((id) => id !== activeTabId)];
  s.mru[windowId] = mru;
  return mru.slice(0, size);
}

async function cycle(s: State, windowId: number, activeTabId: number): Promise<void> {
  const { cycleSize, cycleTimeoutMs, highlightWhileSwitching } = await getSettings();
  if (s.cycle && s.cycle.windowId !== windowId) await finishCycle(s);
  if (!s.cycle) {
    const order = await buildOrder(s, windowId, activeTabId, cycleSize);
    if (order.length < 2) return;
    s.cycle = { windowId, order, index: 0, expiresAt: 0, highlighted: highlightWhileSwitching };
  }
  const c = s.cycle;
  c.index = (c.index + 1) % c.order.length;
  c.expiresAt = Date.now() + cycleTimeoutMs;
  clearTimeout(cycleTimer);
  cycleTimer = setTimeout(() => void serialize(finishCycle), cycleTimeoutMs);
  const target = c.order[c.index];
  if (target === undefined) return;
  if (!c.highlighted) {
    await chrome.tabs.update(target, { active: true });
    return;
  }
  // tabs.highlight takes tab positions and activates the first one given.
  const indexById = new Map((await chrome.tabs.query({ windowId })).map((t) => [t.id, t.index]));
  const indices = [target, ...c.order.filter((id) => id !== target)]
    .map((id) => indexById.get(id))
    .filter((i) => i !== undefined);
  await chrome.tabs.highlight({ windowId, tabs: indices });
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== COMMAND) return;
  void serialize(async (s) => {
    const current =
      tab?.id !== undefined
        ? tab
        : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (current?.id === undefined) return;
    await cycle(s, current.windowId, current.id);
  });
});

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  void serialize((s) => {
    // Activations during a cycle are ours; the landing tab is recorded when the cycle ends.
    if (s.cycle?.windowId === windowId) return;
    touch(s, windowId, tabId);
  });
});

chrome.tabs.onRemoved.addListener((tabId, { windowId, isWindowClosing }) => {
  void serialize(async (s) => {
    if (isWindowClosing) {
      delete s.mru[windowId];
      if (s.cycle?.windowId === windowId) s.cycle = null;
      return;
    }
    forget(s, windowId, tabId);
    await dropFromCycle(s, windowId, tabId);
  });
});

chrome.tabs.onDetached.addListener((tabId, { oldWindowId }) => {
  void serialize(async (s) => {
    forget(s, oldWindowId, tabId);
    await dropFromCycle(s, oldWindowId, tabId);
  });
});

chrome.tabs.onAttached.addListener((tabId, { newWindowId }) => {
  void serialize((s) => {
    const list = (s.mru[newWindowId] ??= []);
    if (!list.includes(tabId)) list.push(tabId);
  });
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  void serialize((s) => {
    for (const ids of [...Object.values(s.mru), s.cycle?.order ?? []]) {
      const idx = ids.indexOf(removedTabId);
      if (idx !== -1) ids[idx] = addedTabId;
    }
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  void serialize((s) => {
    delete s.mru[windowId];
    if (s.cycle?.windowId === windowId) s.cycle = null;
  });
});
