export const DEFAULT_CYCLE_SIZE = 5;
export const MIN_CYCLE_SIZE = 2;
export const MAX_CYCLE_SIZE = 20;

export function clampCycleSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_CYCLE_SIZE;
  return Math.min(MAX_CYCLE_SIZE, Math.max(MIN_CYCLE_SIZE, Math.round(value)));
}

export async function getCycleSize(): Promise<number> {
  const { cycleSize } = await chrome.storage.sync.get({ cycleSize: DEFAULT_CYCLE_SIZE });
  return clampCycleSize(Number(cycleSize));
}

export async function setCycleSize(value: number): Promise<number> {
  const cycleSize = clampCycleSize(value);
  await chrome.storage.sync.set({ cycleSize });
  return cycleSize;
}
