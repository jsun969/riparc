export interface Settings {
  // How many of the most recently visited tabs one cycle loops through.
  cycleSize: number;
  // A cycle ends once no shortcut press arrives for this long; the tab you
  // landed on then becomes the most recent one.
  cycleTimeoutMs: number;
  // Multi-select the cycle's tabs in the tab strip while switching.
  highlightWhileSwitching: boolean;
}

export type SettingKey = keyof Settings;
export type NumberSettingKey = "cycleSize" | "cycleTimeoutMs";

export interface NumberBounds {
  min: number;
  max: number;
  step: number;
}

export const DEFAULT_SETTINGS: Settings = {
  cycleSize: 5,
  cycleTimeoutMs: 700,
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
