import { AutoFarmResult, AutoFarmStopReason, emptyResult } from "./autoFarm.js";
import { Difficulty } from "../data/stages.js";

export type BackgroundFarmKind = "STAGE" | "EQUIP_DUNGEON" | "LEVEL_DUNGEON" | "GOLD_DUNGEON";
export type BackgroundFarmStatus = "RUNNING" | "SETTLING" | "COMPLETED" | "STOPPED";

/** localStorage に報酬集計と進行位置を一緒に保存する、同時に一つだけの周回ジョブ。 */
export interface BackgroundFarmJob {
  id: string;
  kind: BackgroundFarmKind;
  targetId: string;
  targetName: string;
  difficulty?: Difficulty;
  requestedRuns: number;
  completedRuns: number;
  startedAt: number;
  lastProcessedAt: number;
  /** 日付変更後まで自動で翌日枠を使わないための JST 日付。 */
  sessionDate: string;
  partyIds: string[];
  status: BackgroundFarmStatus;
  stopReason: AutoFarmStopReason | null;
  staminaSpent: number;
  result: AutoFarmResult;
  /** 支払い保存済み・未精算の1戦。復帰時は再課金せず、この戦闘から再開する。 */
  inFlight: boolean;
}

export function parseRequestedRuns(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function jstDateKey(at: number = Date.now()): string {
  return new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createBackgroundFarmJob(input: {
  kind: BackgroundFarmKind; targetId: string; targetName: string; difficulty?: Difficulty;
  requestedRuns: number; partyIds: string[]; now?: number;
}): BackgroundFarmJob {
  const requestedRuns = parseRequestedRuns(input.requestedRuns);
  if (requestedRuns === null) throw new Error("周回回数は正の整数で指定してください");
  const now = input.now ?? Date.now();
  return {
    id: `farm-${now}-${Math.random().toString(36).slice(2)}`,
    kind: input.kind, targetId: input.targetId, targetName: input.targetName,
    difficulty: input.difficulty, requestedRuns, completedRuns: 0,
    startedAt: now, lastProcessedAt: now, sessionDate: jstDateKey(now),
    partyIds: [...input.partyIds], status: "RUNNING", stopReason: null,
    staminaSpent: 0, result: emptyResult(), inFlight: false,
  };
}

export function finishBackgroundFarm(job: BackgroundFarmJob, reason: AutoFarmStopReason): void {
  job.stopReason = reason;
  job.result.stopReason = reason;
  job.status = reason === "COMPLETED" ? "COMPLETED" : "STOPPED";
  job.lastProcessedAt = Date.now();
  job.inFlight = false;
}

/**
 * 確認済みの結果通知だけを外す。報酬を持つ PlayerState の他フィールドには触れず、
 * RUNNING/SETTLING は将来のオフライン精算も含めて絶対に削除しない。
 */
export function dismissFinishedBackgroundFarm(holder: { backgroundFarmJob: BackgroundFarmJob | null }, expectedJobId: string): boolean {
  const job = holder.backgroundFarmJob;
  if (!job || job.id !== expectedJobId || job.status === "RUNNING" || job.status === "SETTLING") return false;
  holder.backgroundFarmJob = null;
  return true;
}
