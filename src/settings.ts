export interface Settings {
  // How many of the most recently visited tabs one cycle loops through.
  cycleSize: number;
  // Switch to the highlighted tab if no Ctrl release arrives for this long
  // after the last press (safety net for when Karabiner isn't running).
  cycleTimeoutMs: number;
  // Show the tab you're about to switch to as selected in the tab strip.
  highlightWhileSwitching: boolean;
}

export type NumberSettingKey = "cycleSize" | "cycleTimeoutMs";

export interface NumberBounds {
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cycleSize: 5,
  cycleTimeoutMs: 1500,
  highlightWhileSwitching: true,
};

export const NUMBER_BOUNDS: Record<NumberSettingKey, NumberBounds> = {
  cycleSize: { min: 2, max: 20, step: 1 },
  cycleTimeoutMs: { min: 100, max: 5000, step: 50 },
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
    cycleTimeoutMs: clamp("cycleTimeoutMs", stored.cycleTimeoutMs),
    highlightWhileSwitching: Boolean(stored.highlightWhileSwitching),
  };
}

// Stores the clamped value and returns it.
export async function setNumberSetting(key: NumberSettingKey, value: number): Promise<number> {
  const clamped = clamp(key, value);
  await chrome.storage.sync.set({ [key]: clamped });
  return clamped;
}

export async function setHighlightWhileSwitching(enabled: boolean): Promise<void> {
  await chrome.storage.sync.set({ highlightWhileSwitching: enabled });
}
