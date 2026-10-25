export interface Settings {
  // How many of the most recently visited tabs one cycle loops through.
  cycleSize: number;
  // How long Ctrl must stay held after the first press before the loop's tabs
  // are highlighted. Quicker taps just switch to the previous tab.
  highlightDelayMs: number;
  // Show every tab in the loop as selected while holding Ctrl.
  highlightWhileSwitching: boolean;
  // Shift+click on a link opens it in a peek popup instead of a new window.
  // peek-content.ts reads this key directly; keep the name and default in sync.
  peekEnabled: boolean;
  // Close a peek as soon as another window (or app) takes focus.
  peekCloseOnBlur: boolean;
}

export type NumberSettingKey = "cycleSize" | "highlightDelayMs";
export type BooleanSettingKey = "highlightWhileSwitching" | "peekEnabled" | "peekCloseOnBlur";

export interface NumberBounds {
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cycleSize: 5,
  highlightDelayMs: 300,
  highlightWhileSwitching: true,
  peekEnabled: true,
  peekCloseOnBlur: true,
};

export const NUMBER_BOUNDS: Record<NumberSettingKey, NumberBounds> = {
  cycleSize: { min: 2, max: 20, step: 1 },
  highlightDelayMs: { min: 0, max: 2000, step: 50 },
};

function clamp(key: NumberSettingKey, value: unknown): number {
  const { min, max } = NUMBER_BOUNDS[key];
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS[key];
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get<Settings>(DEFAULT_SETTINGS);
  return {
    cycleSize: clamp("cycleSize", stored.cycleSize),
    highlightDelayMs: clamp("highlightDelayMs", stored.highlightDelayMs),
    highlightWhileSwitching: Boolean(stored.highlightWhileSwitching),
    peekEnabled: Boolean(stored.peekEnabled),
    peekCloseOnBlur: Boolean(stored.peekCloseOnBlur),
  };
}

// Stores the clamped value and returns it.
export async function setNumberSetting(key: NumberSettingKey, value: number): Promise<number> {
  const clamped = clamp(key, value);
  await chrome.storage.sync.set({ [key]: clamped });
  return clamped;
}

export async function setBooleanSetting(key: BooleanSettingKey, value: boolean): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}
