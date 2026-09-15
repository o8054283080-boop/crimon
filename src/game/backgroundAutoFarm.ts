import { AutoFarmResult, AutoFarmStopReason, emptyResult } from "./autoFarm.js";
import { Difficulty } from "../data/stages.js";

export type BackgroundFarmKind = "STAGE" | "EQUIP_DUNGEON" | "LEVEL_DUNGEON" | "GOLD_DUNGEON" | "AWAKENING_DEPTH";
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
  /** 開始時の実戦中央値。進行中は再計算せず、表示中・終了中ともこの値を使う。 */
  referenceRunSeconds: number;
  referenceFromManual: boolean;
  /** 日付変更後まで自動で翌日枠を使わないための JST 日付。 */
  sessionDate: string;
  partyIds: string[];
  status: BackgroundFarmStatus;
  stopReason: AutoFarmStopReason | null;
  staminaSpent: number;
  result: AutoFarmResult;
  /** 支払い保存済み・未精算の1戦。復帰時は再課金せず、この戦闘から再開する。 */
  inFlight: boolean;
  /**
   * この周回で使ってよいスタミナポーションの数。**0なら使わない。**
   *
   * 始めた時の設定で固定する。途中で設定を変えても、
   * 既に進んだぶんの扱いが変わらないように。
   *
   * **ダイヤは絶対に自動で使わない。**ポーションはスタミナにしか使えないので
   * 減っても使い道が狭まるだけだが、ダイヤは何にでも使える。
   * 自動で減らしてよいものではない(依頼主の指定)。
   *
   * 省略可にしてあるのは、**進行中のジョブを持ったまま更新した人のため。**
   * 旧 `autoUseStaminaPotion`(入 / 切)だけを持つジョブは、
   * 入だったなら「全部」として読む(`staminaPotionBudgetOf`)。
   */
  staminaPotionBudget?: number;
  /**
   * 旧: ポーションを自動で使うか(入 / 切)。
   *
   * **進行中の古いジョブを読む時にだけ**参照する。新しく書くことはない。
   */
  autoUseStaminaPotion?: boolean;
  /** その周回で自動使用したポーションの数。終わった時の報告に使う */
  staminaPotionsUsed?: number;
}

export function parseRequestedRuns(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const count = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function jstDateKey(at: number = Date.now()): string {
  return new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 日次挑戦枠を持つコンテンツだけは、開始日の翌日枠へ自動で食い込ませない。 */
export function shouldStopForJstDateChange(job: Pick<BackgroundFarmJob, "kind" | "sessionDate">, now: number = Date.now()): boolean {
  const hasDailyLimit = job.kind === "LEVEL_DUNGEON" || job.kind === "GOLD_DUNGEON";
  return hasDailyLimit && jstDateKey(now) !== job.sessionDate;
}

export function createBackgroundFarmJob(input: {
  kind: BackgroundFarmKind; targetId: string; targetName: string; difficulty?: Difficulty;
  requestedRuns: number; partyIds: string[]; referenceRunSeconds?: number; referenceFromManual?: boolean;
  staminaPotionBudget?: number; now?: number;
}): BackgroundFarmJob {
  const requestedRuns = parseRequestedRuns(input.requestedRuns);
  if (requestedRuns === null) throw new Error("周回回数は正の整数で指定してください");
  const now = input.now ?? Date.now();
  return {
    id: `farm-${now}-${Math.random().toString(36).slice(2)}`,
    kind: input.kind, targetId: input.targetId, targetName: input.targetName,
    difficulty: input.difficulty, requestedRuns, completedRuns: 0,
    startedAt: now, lastProcessedAt: now, sessionDate: jstDateKey(now),
    referenceRunSeconds: input.referenceRunSeconds ?? (input.kind === "EQUIP_DUNGEON" ? 150 : 120),
    referenceFromManual: input.referenceFromManual ?? false,
    partyIds: [...input.partyIds], status: "RUNNING", stopReason: null,
    staminaSpent: 0, result: emptyResult(), inFlight: false,
    // **既定は0＝使わない。**入れた人だけが使う
    staminaPotionBudget: input.staminaPotionBudget !== undefined && input.staminaPotionBudget > 0
      ? Math.floor(input.staminaPotionBudget)
      : 0,
    staminaPotionsUsed: 0,
  };
}

/**
 * このジョブがポーションを何個まで使ってよいか。
 *
 * **古いジョブも読めるようにする。**進行中のまま更新した人のジョブには
 * `staminaPotionBudget` が無く、入 / 切の `autoUseStaminaPotion` しか無い。
 * 入だったなら「全部」として扱い、**前と同じ動きのまま**にする。
 */
export function staminaPotionBudgetOf(
  job: Pick<BackgroundFarmJob, "staminaPotionBudget" | "autoUseStaminaPotion">,
  unlimited: number,
): number {
  if (typeof job.staminaPotionBudget === "number" && job.staminaPotionBudget >= 0) {
    return Math.floor(job.staminaPotionBudget);
  }
  return job.autoUseStaminaPotion === true ? unlimited : 0;
}

/**
 * 次の1周を始めるために、ポーションを何個使えばよいか。
 *
 * **必要な分だけ。**まとめて使わない。1個で100回復するので、
 * 10しか要らない周回のために2個使うようなことは起きない。
 *
 * @returns 使う個数。0なら使わなくてよい。足りない時は持っている数を超えて返さない
 */
export function staminaPotionsNeeded(
  stamina: number,
  cost: number,
  owned: number,
  potionAmount: number,
  /** この周回でまだ使ってよい数。省略すると上限なし */
  budgetLeft: number = Number.MAX_SAFE_INTEGER,
): number {
  if (!(potionAmount > 0)) return 0;
  if (stamina >= cost) return 0;
  const needed = Math.ceil((cost - stamina) / potionAmount);
  return Math.max(0, Math.min(owned, needed, Math.max(0, Math.floor(budgetLeft))));
}

export const MAX_OFFLINE_FARM_MS = 8 * 60 * 60 * 1000;

/** 経過時間が生んだ処理権。BattleEngine の実行速度には一切依存しない。 */
export function availableBackgroundRuns(job: BackgroundFarmJob, now: number): number {
  if (!(job.referenceRunSeconds > 0) || !Number.isFinite(now)) return 0;
  const elapsed = Math.max(0, Math.min(now - job.lastProcessedAt, MAX_OFFLINE_FARM_MS));
  return Math.max(0, Math.min(job.requestedRuns - job.completedRuns, Math.floor(elapsed / (job.referenceRunSeconds * 1000))));
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
