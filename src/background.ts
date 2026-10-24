import { getSettings } from "./settings.js";

const CYCLE_COMMAND = "cycle-recent-tab";
// Sent by the Karabiner rule whenever Ctrl is released, like letting go of Alt in Alt+Tab.
const COMMIT_COMMAND = "commit-cycle";
// Ends a cycle if no press or Ctrl release arrives for this long, in case the
// release signal never comes (Karabiner not running).
const IDLE_COMMIT_MS = 5000;
const STATE_KEY = "state";

// One hold of Ctrl. Every press switches to the next recent tab right away.
// A quick tap-and-release never shows anything; if Ctrl is still held after the
// highlight delay (or Tab is pressed again), every tab in the loop is shown
// selected. Releasing Ctrl ends the cycle and clears the selection.
interface Cycle {
  windowId: number;
  // Snapshot of the window's most recent tabs taken when the cycle started.
  // order[0] is the tab the cycle started from.
  order: number[];
  // Position in order of the tab the last press switched to.
  index: number;
  lastPressAt: number;
  // Whether "Highlight while switching" was on when the cycle started.
  highlight: boolean;
  // Whether the loop's tabs are currently shown selected.
  highlightShown: boolean;
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
let highlightTimer: number | undefined;
let idleTimer: number | undefined;

// Event handlers are async; run them one at a time so they never interleave.
function serialize(task: (s: State) => void | Promise<void>): Promise<void> {
  queue = queue
    .then(async () => {
      const s = await loadState();
      if (s.cycle && Date.now() - s.cycle.lastPressAt >= IDLE_COMMIT_MS) await finishCycle(s);
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
  clearTimeout(highlightTimer);
  clearTimeout(idleTimer);
  const [active] = await chrome.tabs.query({ active: true, windowId: cycle.windowId });
  if (active?.id === undefined) return;
  touch(s, cycle.windowId, active.id);
  if (!cycle.highlightShown) return;
  // Drop the rest of the loop from the selection so Cmd+W and drags only affect one tab again.
  await Promise.allSettled(
    cycle.order
      .filter((id) => id !== active.id)
      .map((id) => chrome.tabs.update(id, { highlighted: false })),
  );
}

// Selects every tab in the loop. tabs.highlight activates the first index it is
// given, so this also switches to activeId.
async function applyHighlight(c: Cycle, activeId: number): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId: c.windowId });
  const indexById = new Map(tabs.map((t) => [t.id, t.index]));
  const indices = [activeId, ...c.order.filter((id) => id !== activeId)]
    .map((id) => indexById.get(id))
    .filter((i) => i !== undefined);
  c.highlightShown = true;
  await chrome.tabs.highlight({ windowId: c.windowId, tabs: indices });
}

// Ctrl is still held after the highlight delay: reveal the loop.
async function showHighlight(s: State): Promise<void> {
  const c = s.cycle;
  if (!c || c.highlightShown) return;
  const [active] = await chrome.tabs.query({ active: true, windowId: c.windowId });
  if (active?.id !== undefined) await applyHighlight(c, active.id);
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
  const { cycleSize, highlightDelayMs, highlightWhileSwitching } = await getSettings();
  if (s.cycle && s.cycle.windowId !== windowId) await finishCycle(s);
  const pressedAgain = s.cycle !== null;
  if (!s.cycle) {
    const order = await buildOrder(s, windowId, activeTabId, cycleSize);
    if (order.length < 2) return;
    s.cycle = {
      windowId,
      order,
      index: 0,
      lastPressAt: 0,
      highlight: highlightWhileSwitching,
      highlightShown: false,
    };
  }
  const c = s.cycle;
  c.index = (c.index + 1) % c.order.length;
  c.lastPressAt = Date.now();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void serialize(finishCycle), IDLE_COMMIT_MS);
  const target = c.order[c.index];
  if (target === undefined) return;
  if (c.highlight && (c.highlightShown || pressedAgain)) {
    clearTimeout(highlightTimer);
    await applyHighlight(c, target);
    return;
  }
  await chrome.tabs.update(target, { active: true });
  if (c.highlight) {
    clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => void serialize(showHighlight), highlightDelayMs);
  }
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMIT_COMMAND) {
    void serialize(finishCycle);
    return;
  }
  if (command !== CYCLE_COMMAND) return;
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
    if (s.cycle?.windowId === windowId) {
      // Our own switches; whichever loop tab is active gets recorded when Ctrl is released.
      if (s.cycle.order.includes(tabId)) return;
      // You switched to a tab outside the loop some other way (click, tab closed); that wins.
      s.cycle = null;
      clearTimeout(highlightTimer);
      clearTimeout(idleTimer);
    }
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
