import { describe, expect, it } from "vitest";
import { emptyResult, farmBlockReason, mergeReward } from "../src/game/autoFarm.js";
import { ClearRewardResult } from "../src/game/rewards.js";

/*
 * かつてここには「戦闘を実行せずに10回ぶんの決着だけ出す」関数のテストがあった。
 * その関数ごと消してある(周回は1戦ずつ実際に戦闘画面で戦う形へ変えた)ので、
 * 残った集計の側だけを見る。
 *
 * **集計は周回の成果そのもの**で、ここが狂うと「10回まわして何が手に入ったのか」が
 * 丸ごと嘘になる。1戦ぶんの積み方をここで固定しておく。
 */

function reward(over: Partial<ClearRewardResult> = {}): ClearRewardResult {
  return {
    goldEarned: 0,
    crystalEarned: 0,
    expTotal: 0,
    levelUps: [],
    dropDexId: null,
    dropStar: null,
    equipmentDrop: null,
    pigDrop: null,
    summonScrollDropped: false,
    fighterLevelsGained: 0,
    ...over,
  };
}

describe("周回を続けられるか (farmBlockReason)", () => {
  it("編成があってスタミナが足りていれば続けられる", () => {
    expect(farmBlockReason({ partySize: 4, stamina: 10, staminaCost: 10 })).toBeNull();
  });

  it("スタミナが1回ぶんに足りなければ止まる", () => {
    expect(farmBlockReason({ partySize: 4, stamina: 9, staminaCost: 10 })).toBe("STAMINA");
  });

  it("編成が空なら止まる", () => {
    expect(farmBlockReason({ partySize: 0, stamina: 999, staminaCost: 10 })).toBe("NO_PARTY");
  });

  it("1日の上限に達していたら止まる", () => {
    expect(farmBlockReason({ partySize: 4, stamina: 999, staminaCost: 10, challengesLeft: 0 })).toBe("DAILY_LIMIT");
  });

  it("上限とスタミナの両方が尽きていたら、先に消費する上限の方を理由にする", () => {
    // ここが逆になると「スタミナを回復すれば回せる」と読めてしまい、直し方を間違える
    expect(farmBlockReason({ partySize: 4, stamina: 0, staminaCost: 10, challengesLeft: 0 })).toBe("DAILY_LIMIT");
  });

  it("上限が無いコンテンツでは回数を見ない", () => {
    expect(farmBlockReason({ partySize: 4, stamina: 999, staminaCost: 10 })).toBeNull();
  });
});

describe("周回の集計 (mergeReward)", () => {
  it("何も足していない集計は空で、止まった理由は「消化しきった」", () => {
    const result = emptyResult();
    expect(result.attempts).toBe(0);
    expect(result.cleared).toBe(0);
    expect(result.stopReason).toBe("COMPLETED");
    expect(result.monsterDrops).toEqual([]);
    expect(result.levelUps).toEqual([]);
  });

  it("数で出る報酬は回数ぶん積み上がる", () => {
    const result = emptyResult();
    for (let i = 0; i < 3; i++) {
      mergeReward(result, reward({ goldEarned: 100, crystalEarned: 50, expTotal: 20, fighterLevelsGained: 1 }), 0);
    }
    expect(result.totalGold).toBe(300);
    expect(result.totalCrystal).toBe(150);
    expect(result.totalExp).toBe(60);
    expect(result.totalFighterLevels).toBe(3);
  });

  it("ウェーブ報酬(extraGold)はクリア報酬とは別に足される", () => {
    const result = emptyResult();
    mergeReward(result, reward({ goldEarned: 100 }), 45);
    expect(result.totalGold).toBe(145);
  });

  it("同じモンスターのレベルアップは1行にまとめる", () => {
    // 10回まわして同じ子が10行並ぶと、結局何レベル上がったのかが読めない
    const result = emptyResult();
    mergeReward(result, reward({ levelUps: [{ instanceId: "a", name: "スライム", levels: 2 }] }), 0);
    mergeReward(result, reward({ levelUps: [{ instanceId: "a", name: "スライム", levels: 3 }] }), 0);
    mergeReward(result, reward({ levelUps: [{ instanceId: "b", name: "ウルフ", levels: 1 }] }), 0);

    expect(result.levelUps).toHaveLength(2);
    expect(result.levelUps.find((l) => l.instanceId === "a")?.levels).toBe(5);
    expect(result.levelUps.find((l) => l.instanceId === "b")?.levels).toBe(1);
  });

  it("元の報酬のレベルアップを書き換えない(積み上げ先へ複製している)", () => {
    // 同じ配列を掴んだままだと、集計へ足すたびに元のオブジェクトが太っていく
    const result = emptyResult();
    const source = reward({ levelUps: [{ instanceId: "a", name: "スライム", levels: 2 }] });
    mergeReward(result, source, 0);
    mergeReward(result, source, 0);
    expect(source.levelUps[0].levels).toBe(2);
    expect(result.levelUps[0].levels).toBe(4);
  });

  it("ドロップしたモンスターと豚は、どちらも手に入った一覧へ並ぶ", () => {
    const result = emptyResult();
    mergeReward(result, reward({ dropDexId: "slime_FIRE", dropStar: 3 }), 0);
    mergeReward(result, reward({ pigDrop: { dexId: "pig_LIGHT", star: 4 } }), 0);

    expect(result.pigDropCount).toBe(1);
    expect(result.monsterDrops).toEqual([
      { dexId: "slime_FIRE", star: 3 },
      { dexId: "pig_LIGHT", star: 4 },
    ]);
  });

  it("星が付いていないドロップは一覧に入れない", () => {
    // dropDexId だけあって星が無い状態は、札を描く時に星0の空欄になる
    const result = emptyResult();
    mergeReward(result, reward({ dropDexId: "slime_FIRE", dropStar: null }), 0);
    expect(result.monsterDrops).toEqual([]);
  });

  it("装備と召喚の書は個数だけ数える", () => {
    const result = emptyResult();
    mergeReward(result, reward({ equipmentDrop: { id: "e1" } as never, summonScrollDropped: true }), 0);
    mergeReward(result, reward({ equipmentDrop: { id: "e2" } as never }), 0);
    expect(result.equipmentDropCount).toBe(2);
    expect(result.summonScrollCount).toBe(1);
  });
});
