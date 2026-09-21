/**
 * 管理者画面へ出す「進め具合」と「日別の動き」の数え方。
 *
 * ## なぜここだけ実際に動かすのか
 *
 * 管理APIの本体(`index.ts`)は `jsr:` から取り込むので、**手元からは動かせない。**
 * 数え方が間違っていても、本番へ流して画面を開くまで気づけない。
 *
 * 特に**日の切り方**は静かに間違う。サーバは UTC で動くので、素直に日付を取ると
 * **日本の朝9時が境目**になり、深夜に遊んだぶんが翌日へ回って山が丸ごと1日ずれる。
 * 見ても「なんとなく合っている」ので、ずれたまま気づかない類の誤り。
 *
 * だから数える所だけ `progress.ts` へ切り出して、ここで値を入れて確かめる。
 */
import { describe, expect, it } from "vitest";
import { buildDaily, jstDay, maxOf, saveProgress } from "../supabase/functions/crimon-admin/progress.js";

/** 控えの形。`src/game/saveFile.ts` が書き出すものと同じ入れ子 */
const save = (state: Record<string, unknown>) => ({ summary: {}, state });

describe("進め具合を数える", () => {
  it("到達した章は、いちばん奥のクリアから決まる", () => {
    const progress = saveProgress(save({ clearedStageIds: ["1-1", "1-2", "2-1", "1-3"] }));
    expect(progress?.stageChapter).toBe(2);
    expect(progress?.stageLabel).toBe("2-1");
  });

  it("同じ章なら、番号の大きい方を取る", () => {
    const progress = saveProgress(save({ clearedStageIds: ["3-2", "3-10", "3-7"] }));
    expect(progress?.stageLabel).toBe("3-10");
  });

  it("高難度のクリアは、章の判定に混ぜない", () => {
    /*
     * `"3-7::HARD"` の `"3"` を素直に読むと通常クリアと同じ顔で混ざる。
     * 1章しか通常クリアしていない人が、高難度の解放だけで
     * 「4章まで進んだ」と出てしまう。
     */
    const progress = saveProgress(save({ clearedStageIds: ["1-1", "4-5::HARD", "4-5::HELL"] }));
    expect(progress?.stageChapter).toBe(1);
    expect(progress?.stageCleared).toBe(1);
    expect(progress?.stageHardCleared).toBe(2);
  });

  it("1つもクリアしていない人は、空で返す(0-0 と書かない)", () => {
    const progress = saveProgress(save({ clearedStageIds: [] }));
    expect(progress?.stageChapter).toBe(0);
    expect(progress?.stageLabel).toBe("");
  });

  it("塔とダンジョンの到達階を拾う", () => {
    const progress = saveProgress(save({
      trialTowerBestFloor: 18,
      trialTowerLifetimeBestFloor: 26,
      clearedDungeonFloors: [1, 2, 3, 10, 7],
      clearedGoldDungeonFloors: [1, 2],
      clearedLevelDungeonTiers: ["A", "B", "C"],
    }));
    // 今シーズンの最高と、通算の最高は別物(塔は月ごとに戻る)
    expect(progress?.towerBestFloor).toBe(18);
    expect(progress?.towerLifetimeFloor).toBe(26);
    // 並び順に頼らない。**クリア済みは押した順に積まれる**ので、末尾が最高とは限らない
    expect(progress?.equipFloor).toBe(10);
    expect(progress?.goldFloor).toBe(2);
    expect(progress?.levelTiers).toBe(3);
  });

  it("壊れた控えでも落ちない", () => {
    expect(saveProgress(null)).toBeNull();
    expect(saveProgress({})).toBeNull();
    expect(saveProgress({ state: "こわれている" })).toBeNull();
    const progress = saveProgress(save({ clearedStageIds: "配列ではない", monsters: null }));
    expect(progress?.stageChapter).toBe(0);
    expect(progress?.monsterMaxStar).toBe(0);
  });
});

describe("モンスターと装備の中身を数える", () => {
  it("星ごとに分けて数える", () => {
    /*
     * **合計だけでは読めない。**「300体持っているが★6が0体」と
     * 「30体で★6が10体」が、同じ顔で並んでしまう。
     */
    const progress = saveProgress(save({
      monsters: [
        { star: 6, level: 60 },
        { star: 6, level: 40 },
        { star: 5, level: 35 },
        { star: 3, level: 1 },
      ],
    }));
    expect(progress?.monsterStars).toEqual({ "6": 2, "5": 1, "3": 1 });
    expect(progress?.monsterMaxStar).toBe(6);
    expect(progress?.monsterMaxLevel).toBe(60);
    // ★6 Lv60 だけが「育て切った手駒」。★6 Lv40 は数えない
    expect(progress?.monsterMaxed).toBe(1);
  });

  it("装備は +15 と、鍵をかけた数を分けて数える", () => {
    const progress = saveProgress(save({
      equipment: [
        { star: 6, level: 15, locked: true },
        { star: 6, level: 12 },
        { star: 5, level: 15 },
        { star: 4, level: 0, locked: true },
      ],
    }));
    expect(progress?.equipStars).toEqual({ "6": 2, "5": 1, "4": 1 });
    expect(progress?.equipMaxed).toBe(2);
    expect(progress?.equipLocked).toBe(2);
  });

  it("星の無い行は、星の内訳に混ぜない", () => {
    const progress = saveProgress(save({ monsters: [{ level: 5 }, { star: 0, level: 1 }] }));
    expect(progress?.monsterStars).toEqual({});
  });
});

describe("日の切り方", () => {
  it("日本時間で1日を切る", () => {
    /*
     * **UTC のままだと朝9時が境目**になる。
     * 日本の 2026-09-20 23:00(= UTC 14:00)は、その日のうち。
     */
    expect(jstDay("2026-09-20T14:00:00.000Z")).toBe("2026-09-20");
    // 日本の 2026-09-21 00:30(= UTC 前日 15:30)は、もう翌日
    expect(jstDay("2026-09-20T15:30:00.000Z")).toBe("2026-09-21");
    // 日本の朝8時(= UTC 23:00 前日)。UTC で切ると前日へ落ちる所
    expect(jstDay("2026-09-20T23:00:00.000Z")).toBe("2026-09-21");
  });

  it("読めない値は、どの日にも数えない", () => {
    expect(jstDay(null)).toBe("");
    expect(jstDay("")).toBe("");
    expect(jstDay("きのう")).toBe("");
  });
});

describe("日別の動き", () => {
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  it("動きの無かった日も、行として返す", () => {
    /*
     * **0の日を落とすと、「4日連続で誰も遊んでいない」が見えなくなる。**
     * 動いた日だけが並ぶ一覧は、止まっていることを隠す。
     */
    const rows = buildDaily(7, { created: [], saved: [iso(0)], matched: [], arenaCreated: [] });
    expect(rows).toHaveLength(7);
    expect(rows.every((row) => typeof row.date === "string" && row.date.length === 10)).toBe(true);
    expect(rows.reduce((total, row) => total + row.saves, 0)).toBe(1);
  });

  it("古い順に並ぶ(末尾が今日)", () => {
    const rows = buildDaily(5, { created: [], saved: [], matched: [], arenaCreated: [] });
    expect(rows[rows.length - 1].date).toBe(jstDay(iso(0)));
    expect([...rows].sort((a, b) => a.date.localeCompare(b.date))).toEqual(rows);
  });

  it("種類ごとに別々に数える", () => {
    const rows = buildDaily(3, {
      created: [iso(0), iso(0)],
      saved: [iso(0), iso(1), iso(1)],
      matched: [iso(1)],
      arenaCreated: [iso(2)],
    });
    const today = rows[rows.length - 1];
    const yesterday = rows[rows.length - 2];
    expect(today.newAccounts).toBe(2);
    expect(today.saves).toBe(1);
    expect(yesterday.saves).toBe(2);
    expect(yesterday.matches).toBe(1);
    expect(rows[0].newArena).toBe(1);
  });

  it("窓の外の日付は、どこにも足さない", () => {
    // 14日を見ている時、30日前の行が今日へ紛れ込まないこと
    const rows = buildDaily(14, { created: [iso(30)], saved: [], matched: [], arenaCreated: [] });
    expect(rows.reduce((total, row) => total + row.newAccounts, 0)).toBe(0);
  });
});

describe("最大値の取り方", () => {
  it("空なら0。並び順には頼らない", () => {
    expect(maxOf([])).toBe(0);
    expect(maxOf(undefined)).toBe(0);
    expect(maxOf([3, 12, 7])).toBe(12);
    // 数でないものが混ざっても落ちない
    expect(maxOf([1, "2", null])).toBe(2);
  });
});
