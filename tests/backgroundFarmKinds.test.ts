import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BackgroundFarmKind } from "../src/game/backgroundAutoFarm.js";
import { AWAKENING_DEPTH_FLOORS } from "../src/data/awakeningDepths.js";
import { GOLD_DUNGEON_FLOORS } from "../src/data/goldDungeon.js";

/**
 * 周回が種類ごとに正しい場所を見ているか。
 *
 * **目覚の深域を足した時、3か所で漏れた。**
 *
 *   - スタミナ  … `if` の連ねの最後へ落ち、ゴールドダンジョンの値が引かれていた
 *   - 戦う相手  … 三項の最後へ落ち、**同じ階番号のゴールドダンジョンと戦っていた**
 *   - 報酬      … 同じく最後へ落ち、1〜5階はゴールドの報酬、6階以上は
 *                  見つからない階を `!` で潰していたので例外になっていた
 *
 * どれも「当てはまらないものを黙って別の場所へ落とす」書き方が原因で、
 * 型チェックは1つも拾わない。**深域の階番号(1〜10)とゴールドダンジョンの階が
 * 重なっている**ことが、取り違えを見えにくくしていた。
 */
const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

/** 周回できる種類。増やしたら、下の3つすべてに現れる必要がある */
const KINDS: BackgroundFarmKind[] = ["STAGE", "EQUIP_DUNGEON", "LEVEL_DUNGEON", "GOLD_DUNGEON", "AWAKENING_DEPTH"];

describe("周回は種類ごとに正しい場所を見る", () => {
  it("スタミナは switch で書き、種類が増えたら型が漏れを教える", () => {
    const body = MAIN.slice(MAIN.indexOf("function backgroundFarmCost"));
    const scope = body.slice(0, body.indexOf("\n}"));
    for (const kind of KINDS) expect(scope, `${kind} のスタミナ`).toContain(`case "${kind}"`);
    // 戻り値のある switch にしておくと、網羅していない種類を型が落とす
    expect(scope).toContain("switch (job.kind)");
  });

  it("戦う相手を引く時、深域をゴールドダンジョンへ落とさない", () => {
    const body = MAIN.slice(MAIN.indexOf("function simulateBackgroundBattle"));
    const scope = body.slice(0, body.indexOf("\n}"));
    expect(scope).toContain('job.kind === "GOLD_DUNGEON"');
    expect(scope).toContain("findAwakeningDepthFloor(Number(job.targetId))");
  });

  it("報酬を配る時、深域を明示して分ける", () => {
    const body = MAIN.slice(MAIN.indexOf("function processBackgroundFarmOnce"));
    const scope = body.slice(0, body.indexOf("\n}\n"));
    expect(scope).toContain('job.kind === "AWAKENING_DEPTH"');
    expect(scope).toContain("grantAwakeningDepthReward(state.player, floor)");
    // 素材はゴールドや経験値と別枠。ここへ積まないと結果画面に何も出ない
    expect(scope).toContain("job.result.awakeningShards");
  });

  it("「もう一度」から始められる種類に、深域が入っている", () => {
    const body = MAIN.slice(MAIN.indexOf("function startFromLastRun"));
    const scope = body.slice(0, body.indexOf("\n}"));
    // 戻り値が無い switch なので、漏れても型は何も言わない
    expect(scope).toContain('case "AWAKENING_DEPTH"');
    expect(scope).toContain("startAwakeningDepthFloor(last.floor)");
  });
});

describe("階番号が重なっていること自体を覚えておく", () => {
  it("深域とゴールドダンジョンは階番号が重なる（だから取り違えても気づけなかった）", () => {
    const depthFloors = new Set(AWAKENING_DEPTH_FLOORS.map((f) => f.floor));
    const goldFloors = new Set(GOLD_DUNGEON_FLOORS.map((f) => f.floor));
    const overlap = [...depthFloors].filter((floor) => goldFloors.has(floor));
    /*
     * 重なりが**ある**ことを確かめる。無くなったら、この見張りの前提が変わる。
     * 重なっている限り、種類を取り違えると「別のダンジョンを普通に戦って
     * 普通に報酬をもらう」——いちばん気づきにくい壊れ方になる。
     */
    expect(overlap.length).toBeGreaterThan(0);
  });
});
