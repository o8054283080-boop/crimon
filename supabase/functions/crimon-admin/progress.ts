/**
 * 控えから「進め具合」と「日別の動き」を数える所。
 *
 * ## なぜ `index.ts` から切り離してあるのか
 *
 * あちらは `jsr:` から取り込むので、**手元のテストからは読めない。**
 * 数え方が間違っていても、本番へ流して管理者画面を開くまで気づけない
 * ——実際、日の切り方(UTC か 日本時間か)は間違えると山が丸ごと1日ずれる。
 *
 * ここには**Deno固有のものを一切入れない。**そうすれば `tests/` から
 * そのまま呼んで、値を入れて確かめられる(`tests/adminProgress.test.ts`)。
 */

export function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type SaveProgress = {
  /** 到達した最大の章(ステージIDは `${章}-${番号}`) */
  stageChapter: number;
  stageLabel: string;
  stageCleared: number;
  stageHardCleared: number;
  towerBestFloor: number;
  towerLifetimeFloor: number;
  equipFloor: number;
  beastFloor: number;
  goldFloor: number;
  levelTiers: number;
  arenaPoints: number;
  /** 星ごとの所持数。`{"6": 3, "5": 12}` のような形で返す */
  monsterStars: Record<string, number>;
  monsterMaxStar: number;
  monsterMaxLevel: number;
  monsterMaxed: number;
  equipStars: Record<string, number>;
  equipMaxed: number;
  equipLocked: number;
};

export function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(number).filter((n) => Number.isFinite(n)) : [];
}

export function maxOf(value: unknown): number {
  const list = numbers(value);
  return list.length === 0 ? 0 : Math.max(...list);
}

/**
 * 控えの `state` から、**進め具合と持ち物の中身**を数える。
 *
 * ## なぜサーバで数えるのか
 *
 * 控えの丸ごとは大きい(モンスター数百体・装備数千個)。**そのまま画面へ送ると、
 * 1000人ぶんで数十MBになる。**ここで数え終えた形だけを返せば、
 * 増えるのは1人あたり数十バイトで済む。
 *
 * ## 何を見ているか
 *
 * 「レベルと所持金」だけでは、その人がどこで止まっているのかが分からない。
 * **詰まっている場所は、クリア済みの並びにしか出ない。**
 * 星ごとの所持数も同じで、合計だけ見ていると
 * 「300体持っているが★6が0体」と「30体で★6が10体」が同じ顔で並ぶ。
 */
export function saveProgress(save: unknown): SaveProgress | null {
  if (!save || typeof save !== "object") return null;
  const state = (save as { state?: unknown }).state;
  if (!state || typeof state !== "object") return null;
  const row = state as Record<string, unknown>;

  const clearedStages = Array.isArray(row.clearedStageIds) ? row.clearedStageIds.map(text) : [];
  let stageChapter = 0;
  let stageNumber = 0;
  let stageCleared = 0;
  let stageHardCleared = 0;
  for (const key of clearedStages) {
    // `"3-7"` は NORMAL、`"3-7::HARD"` のように後ろが付くのが高難度
    const hard = key.includes("::");
    if (hard) stageHardCleared += 1;
    else stageCleared += 1;
    if (hard) continue;
    const [chapterText, numberText] = key.split("-", 2);
    const chapter = number(chapterText);
    const stage = number(numberText);
    if (chapter > stageChapter || (chapter === stageChapter && stage > stageNumber)) {
      stageChapter = chapter;
      stageNumber = stage;
    }
  }

  const monsterStars: Record<string, number> = {};
  let monsterMaxStar = 0;
  let monsterMaxLevel = 0;
  let monsterMaxed = 0;
  const monsters = Array.isArray(row.monsters) ? row.monsters : [];
  for (const entry of monsters) {
    if (!entry || typeof entry !== "object") continue;
    const monster = entry as Record<string, unknown>;
    const star = number(monster.star);
    const level = number(monster.level);
    if (star > 0) monsterStars[String(star)] = (monsterStars[String(star)] ?? 0) + 1;
    if (star > monsterMaxStar) monsterMaxStar = star;
    if (level > monsterMaxLevel) monsterMaxLevel = level;
    // ★6の上限は Lv60。ここに乗っている数が「育て切った手駒」
    if (star >= 6 && level >= 60) monsterMaxed += 1;
  }

  const equipStars: Record<string, number> = {};
  let equipMaxed = 0;
  let equipLocked = 0;
  const equipment = Array.isArray(row.equipment) ? row.equipment : [];
  for (const entry of equipment) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const star = number(item.star);
    if (star > 0) equipStars[String(star)] = (equipStars[String(star)] ?? 0) + 1;
    if (number(item.level) >= 15) equipMaxed += 1;
    if (item.locked === true) equipLocked += 1;
  }

  return {
    stageChapter,
    stageLabel: stageChapter > 0 ? `${stageChapter}-${stageNumber}` : "",
    stageCleared,
    stageHardCleared,
    towerBestFloor: number(row.trialTowerBestFloor),
    towerLifetimeFloor: number(row.trialTowerLifetimeBestFloor),
    equipFloor: maxOf(row.clearedDungeonFloors),
    beastFloor: maxOf(row.clearedBeastDungeonFloors),
    goldFloor: maxOf(row.clearedGoldDungeonFloors),
    levelTiers: Array.isArray(row.clearedLevelDungeonTiers) ? row.clearedLevelDungeonTiers.length : 0,
    arenaPoints: number(row.arenaPoints),
    monsterStars,
    monsterMaxStar,
    monsterMaxLevel,
    monsterMaxed,
    equipStars,
    equipMaxed,
    equipLocked,
  };
}

/**
 * **日本時間の「何日」に丸める。**
 *
 * サーバは UTC で動いているので、素直に `toISOString().slice(0, 10)` を取ると
 * **日本の朝9時が境目**になる。深夜に遊んだぶんが翌日へ回り、
 * 日別の山がまるごと1日ずれる。
 */
export function jstDay(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return "";
  return new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type DailyRow = { date: string; newAccounts: number; saves: number; matches: number; newArena: number };

/**
 * 日別の動き。**直近14日を、1日も飛ばさずに並べる。**
 *
 * 動きのあった日だけを返すと、**止まっている日が一覧から消える**ので、
 * 「4日連続で誰も遊んでいない」が見えなくなる。0の日も行として返す。
 */
export function buildDaily(
  days: number,
  sources: { created: unknown[]; saved: unknown[]; matched: unknown[]; arenaCreated: unknown[] },
): DailyRow[] {
  const table = new Map<string, DailyRow>();
  const today = Date.now();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = jstDay(new Date(today - i * 24 * 60 * 60 * 1000).toISOString());
    table.set(date, { date, newAccounts: 0, saves: 0, matches: 0, newArena: 0 });
  }
  const bump = (value: unknown, key: "newAccounts" | "saves" | "matches" | "newArena") => {
    const row = table.get(jstDay(value));
    if (row) row[key] += 1;
  };
  for (const value of sources.created) bump(value, "newAccounts");
  for (const value of sources.saved) bump(value, "saves");
  for (const value of sources.matched) bump(value, "matches");
  for (const value of sources.arenaCreated) bump(value, "newArena");
  return [...table.values()];
}

/** 日別の動きで見る日数。2週間あれば、週末と平日の差まで読める */
export const DAILY_DAYS = 14;
