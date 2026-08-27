import { Difficulty } from "../data/stages.js";
import { BackgroundFarmKind } from "./backgroundAutoFarm.js";

export type ManualClearTimes = Record<string, number[]>;

export const MAX_RECENT_MANUAL_CLEARS = 5;
export const MAX_MANUAL_CLEAR_SECONDS = 10 * 60;

export const MIN_REFERENCE_SECONDS: Record<BackgroundFarmKind, number> = {
  STAGE: 30,
  EQUIP_DUNGEON: 45,
  LEVEL_DUNGEON: 30,
  GOLD_DUNGEON: 30,
};

export const FALLBACK_REFERENCE_SECONDS: Record<BackgroundFarmKind, number> = {
  STAGE: 120,
  EQUIP_DUNGEON: 150,
  LEVEL_DUNGEON: 120,
  GOLD_DUNGEON: 120,
};

/** 難易度を含め、報酬・解放単位と同じ粒度で実戦記録を分離する。 */
export function manualClearKey(kind: BackgroundFarmKind, targetId: string, difficulty?: Difficulty): string {
  switch (kind) {
    case "STAGE": return `stage_${targetId}_${difficulty ?? "NORMAL"}`;
    case "EQUIP_DUNGEON": return `equip_${targetId}`;
    case "LEVEL_DUNGEON": return `level_${targetId}`;
    case "GOLD_DUNGEON": return `gold_${targetId}`;
  }
}

export function addManualClearTime(records: ManualClearTimes, key: string, seconds: number): boolean {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_MANUAL_CLEAR_SECONDS) return false;
  const recent = Array.isArray(records[key]) ? records[key].filter(validRecordedTime) : [];
  records[key] = [...recent, seconds].slice(-MAX_RECENT_MANUAL_CLEARS);
  return true;
}

function validRecordedTime(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_MANUAL_CLEAR_SECONDS;
}

export function recentManualClearTimes(records: ManualClearTimes, key: string): number[] {
  return (Array.isArray(records[key]) ? records[key] : []).filter(validRecordedTime).slice(-MAX_RECENT_MANUAL_CLEARS);
}

export function medianSeconds(values: number[]): number | null {
  const sorted = values.filter(validRecordedTime).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function referenceRunTime(records: ManualClearTimes, kind: BackgroundFarmKind, targetId: string, difficulty?: Difficulty): { seconds: number; fromManual: boolean; recent: number[] } {
  const recent = recentManualClearTimes(records, manualClearKey(kind, targetId, difficulty));
  const median = medianSeconds(recent);
  return {
    seconds: median === null ? FALLBACK_REFERENCE_SECONDS[kind] : Math.max(MIN_REFERENCE_SECONDS[kind], median),
    fromManual: median !== null,
    recent,
  };
}

/** 時計逆行やAFKを統計へ入れず、実際の画面滞在時間だけを秒へ変換する。 */
export function recordManualBattle(records: ManualClearTimes, key: string, startedAt: number, finishedAt: number): boolean {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt <= startedAt) return false;
  return addManualClearTime(records, key, (finishedAt - startedAt) / 1000);
}
