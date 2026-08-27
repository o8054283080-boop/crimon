import { AutoFarmResult, AutoFarmStopReason, emptyResult } from "./autoFarm.js";
import { Difficulty } from "../data/stages.js";

export type BackgroundFarmKind = "STAGE" | "EQUIP_DUNGEON" | "LEVEL_DUNGEON" | "GOLD_DUNGEON";
export type BackgroundFarmStatus = "RUNNING" | "SETTLING" | "COMPLETED" | "STOPPED";

/** iOS の時計変更を含む長時間放置を、ゲームバランス上安全な範囲へ丸める。 */
export const MAX_OFFLINE_SECONDS = 8 * 60 * 60;
export const RECENT_CLEAR_TIME_LIMIT = 5;

export interface OfflineProgress {
  elapsedSeconds: number;
  availableRuns: number;
  carriedSeconds: number;
  clockWentBackwards: boolean;
  capped: boolean;
}

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
  /** 1周をオフラインで進めるための秒数。ジョブ開始時に固定する。 */
  referenceRunSeconds: number;
  /** 1周に満たなかった時間。次回の非表示期間へ繰り越す。 */
  accumulatedOfflineSeconds: number;
  offlineStartedAt: number | null;
  recentClearTimes: number[];
  offlineProcessedRuns: number;
  lastOfflineElapsedSeconds: number;
}

const DEFAULT_SECONDS: Record<BackgroundFarmKind, number> = {
  STAGE: 120, EQUIP_DUNGEON: 150, LEVEL_DUNGEON: 120, GOLD_DUNGEON: 120,
};
const MIN_SECONDS: Record<BackgroundFarmKind, number> = {
  STAGE: 60, EQUIP_DUNGEON: 90, LEVEL_DUNGEON: 75, GOLD_DUNGEON: 75,
};

/** 直近5勝の中央値を採用し、単発の高速値と難度差の影響を抑える。 */
export function referenceRunSeconds(kind: BackgroundFarmKind, recent: readonly number[] = [], difficulty?: Difficulty): number {
  const valid = recent.filter((v) => Number.isFinite(v) && v > 0).slice(-RECENT_CLEAR_TIME_LIMIT).sort((a, b) => a - b);
  const measured = valid.length ? valid[Math.floor(valid.length / 2)] : DEFAULT_SECONDS[kind] * (difficulty === "HARD" ? 1.25 : difficulty === "HELL" ? 1.5 : 1);
  return Math.ceil(Math.max(MIN_SECONDS[kind], measured));
}

/** 経過時間を一度だけ計上し、周数と余りへ分ける純粋計算。 */
export function calculateOfflineProgress(job: Pick<BackgroundFarmJob, "lastProcessedAt" | "accumulatedOfflineSeconds" | "referenceRunSeconds" | "requestedRuns" | "completedRuns">, now: number): OfflineProgress {
  const raw = (now - job.lastProcessedAt) / 1000;
  const elapsedSeconds = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, raw));
  const total = Math.max(0, job.accumulatedOfflineSeconds) + elapsedSeconds;
  const byTime = Math.floor(total / Math.max(1, job.referenceRunSeconds));
  const availableRuns = Math.min(byTime, Math.max(0, job.requestedRuns - job.completedRuns));
  return {
    elapsedSeconds, availableRuns,
    carriedSeconds: total - availableRuns * Math.max(1, job.referenceRunSeconds),
    clockWentBackwards: raw < 0, capped: raw > MAX_OFFLINE_SECONDS,
  };
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
    referenceRunSeconds: referenceRunSeconds(input.kind, [], input.difficulty),
    accumulatedOfflineSeconds: 0, offlineStartedAt: null, recentClearTimes: [],
    offlineProcessedRuns: 0, lastOfflineElapsedSeconds: 0,
  };
}

export function finishBackgroundFarm(job: BackgroundFarmJob, reason: AutoFarmStopReason): void {
  job.stopReason = reason;
  job.result.stopReason = reason;
  job.status = reason === "COMPLETED" ? "COMPLETED" : "STOPPED";
  job.lastProcessedAt = Date.now();
  job.inFlight = false;
}
