import { Difficulty } from "../data/stages.js";
import { BackgroundFarmKind } from "./backgroundAutoFarm.js";

export type ManualClearTimes = Record<string, number[]>;

export const MAX_RECENT_MANUAL_CLEARS = 5;
export const MAX_MANUAL_CLEAR_SECONDS = 10 * 60;

/**
 * 自動周回1周の下限。**1秒。**
 *
 * ## 30〜45秒の下限をやめた理由
 *
 * 以前はコンテンツごとに「STAGE 30秒 / 装備ダンジョン 45秒」といった下限を
 * 置いていた。そのため**x8で3秒で終わる編成を作っても、自動周回は30秒/周**の
 * ままで、速く倒せるように育てたことが自動周回には1秒も効かなかった。
 *
 * 高速周回の編成を組んだことが、そのまま周回効率になるべき(依頼主の指定)。
 * 実測の中央値をそのまま使う。
 *
 * **ここに残す1秒は、速さの調整ではなく暴走止め。**
 * 0秒や極端に小さい値が入ると、`availableBackgroundRuns` の
 * 「経過時間 ÷ 1周の秒数」が跳ね上がり、復帰した瞬間に数万回ぶんの
 * 処理権が生まれる。実際の記録は `addManualClearTime` が0以下を弾くので
 * ここへは来ないが、**保存の壊れや時計の巻き戻し**は防ぎきれない。
 */
export const MIN_REFERENCE_SECONDS = 1;

export const FALLBACK_REFERENCE_SECONDS: Record<BackgroundFarmKind, number> = {
  STAGE: 120,
  EQUIP_DUNGEON: 150,
  LEVEL_DUNGEON: 120,
  GOLD_DUNGEON: 120,
  AWAKENING_DEPTH: 160,
  /*
   * 遺跡。**装備ダンジョン12階の150秒を流用しない。**
   * 実ブラウザの x8 で1勝おおむね11〜20秒(完成編成)なので、等倍に直すと
   * 90〜160秒ほど。記録が1件も無い時だけ使う値なので、その真ん中の120秒に置く。
   * 周回は手で1度クリアしてからしか始められないので、ふつうはここへ来る前に実測が入る。
   */
  RUINS: 120,
};

/** 難易度を含め、報酬・解放単位と同じ粒度で実戦記録を分離する。 */
export function manualClearKey(kind: BackgroundFarmKind, targetId: string, difficulty?: Difficulty): string {
  switch (kind) {
    case "STAGE": return `stage_${targetId}_${difficulty ?? "NORMAL"}`;
    case "EQUIP_DUNGEON": return `equip_${targetId}`;
    case "LEVEL_DUNGEON": return `level_${targetId}`;
    case "GOLD_DUNGEON": return `gold_${targetId}`;
    case "AWAKENING_DEPTH": return `depth_${targetId}`;
    // 場所IDがそのまま鍵(`ruins_power_5` など)。遺跡と階ごとに記録が分かれる
    case "RUINS": return targetId;
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
    /*
     * **実測の中央値をそのまま使う。**速度の倍率で割り戻したりしない。
     * x8で3秒なら3秒/周。画面上でかかった時間が、そのまま自動周回の1周になる。
     * 記録が1件も無い時だけ、従来どおりコンテンツごとの標準時間へ落ちる。
     */
    seconds: median === null ? FALLBACK_REFERENCE_SECONDS[kind] : Math.max(MIN_REFERENCE_SECONDS, median),
    fromManual: median !== null,
    recent,
  };
}

/** 時計逆行やAFKを統計へ入れず、実際の画面滞在時間だけを秒へ変換する。 */
export function recordManualBattle(records: ManualClearTimes, key: string, startedAt: number, finishedAt: number): boolean {
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt <= startedAt) return false;
  return addManualClearTime(records, key, (finishedAt - startedAt) / 1000);
}
