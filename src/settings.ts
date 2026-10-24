export interface Settings {
  // How many of the most recently visited tabs one cycle loops through.
  cycleSize: number;
  // A cycle ends once no shortcut press arrives for this long; the tab you
  // landed on then becomes the most recent one.
  cycleTimeoutMs: number;
}

export type SettingKey = keyof Settings;

export interface SettingBounds {
  default: number;
  min: number;
  max: number;
  step: number;
}

export const SETTING_BOUNDS: Record<SettingKey, SettingBounds> = {
  cycleSize: { default: 5, min: 2, max: 20, step: 1 },
  cycleTimeoutMs: { default: 700, min: 100, max: 5000, step: 50 },
};

function clamp(key: SettingKey, value: unknown): number {
  const { default: fallback, min, max } = SETTING_BOUNDS[key];
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get({
    cycleSize: SETTING_BOUNDS.cycleSize.default,
    cycleTimeoutMs: SETTING_BOUNDS.cycleTimeoutMs.default,
  });
  return {
    cycleSize: clamp("cycleSize", stored.cycleSize),
    cycleTimeoutMs: clamp("cycleTimeoutMs", stored.cycleTimeoutMs),
  };
}

// Stores the clamped value and returns it.
export async function setSetting(key: SettingKey, value: number): Promise<number> {
  const clamped = clamp(key, value);
  await chrome.storage.sync.set({ [key]: clamped });
  return clamped;
}
