import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { ARENA_BATTLE_OPTIONS, ARENA_DAMAGE_RAMP } from "../src/data/pvpArena.js";
import { findMonsterById } from "../src/data/monsters.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { mulberry32 } from "../tools/battleLab/rng.js";

/*
 * 長引いた試合を決着させる仕掛けの見張り。
 *
 * 硬い編成どうしがぶつかると、どちらも相手を削り切れない。実測で
 * **299手番かけて相手のHPを0.7%しか減らせない**組み合わせが出た。
 * 硬い編成を弱くして避けることもできるが、それは耐久という戦い方を潰す。
 * 代わりに、長引くほど決まりやすくしてある。
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** 硬いだけで火力の無い相手。放っておくと決着しない盤面を作る */
function wall(id: string, hp: number, atk: number): MonsterDefinition {
  const dex = findMonsterById(id)!;
  return { ...dex, stats: { ...dex.stats, hp, atk, def: 3_000, spd: 100 } };
}

describe("アリーナの、長引いた試合の決着", () => {
  it("設定は 20手番の猶予・10手番ごと・1.25倍", () => {
    expect(ARENA_DAMAGE_RAMP.afterTurns).toBe(20);
    expect(ARENA_DAMAGE_RAMP.everyTurns).toBe(10);
    expect(ARENA_DAMAGE_RAMP.factorPerStep).toBe(1.25);
    expect(ARENA_BATTLE_OPTIONS.damageRamp).toBe(ARENA_DAMAGE_RAMP);
  });

  /*
   * **アリーナの戦闘は3か所で組まれる。**挑む画面・留守中の防衛・サーバ側の判定。
   * 3つは同じ種で同じ結果を出すことが前提で、1か所でも設定が違うと
   * 「画面とサーバで別の戦いをする」。以前それを実際にやっている。
   */
  it("戦闘を組む3か所が、そろって同じ設定を渡している", () => {
    const places: [string, string][] = [
      ["挑む画面", "../src/web/main.ts"],
      ["留守中の防衛", "../src/game/arena/defenseSim.ts"],
      ["サーバ側の判定", "../supabase/functions/arena-settle/index.ts"],
    ];
    for (const [label, path] of places) {
      const source = read(path);
      expect(source.includes("ARENA_BATTLE_OPTIONS"), `${label} が設定を渡していない`).toBe(true);
    }
  });

  it("猶予の内側では、ダメージが増えない", () => {
    const attacker = wall("golem_FIRE", 200_000, 400);
    const defender = wall("golem_WATER", 200_000, 400);
    const plain = new BattleEngine([attacker], [defender], { rng: mulberry32(7), maxTurns: 12 }).run();
    const ramped = new BattleEngine([attacker], [defender], {
      rng: mulberry32(7), maxTurns: 12, ...ARENA_BATTLE_OPTIONS,
    }).run();
    const hpOf = (result: typeof plain) => {
      const last = result.turns[result.turns.length - 1];
      return last.snapshot.filter((u) => u.team === "ENEMY").reduce((sum, u) => sum + u.currentHp, 0);
    };
    expect(hpOf(ramped)).toBe(hpOf(plain));
  });

  /*
   * **ここが本題。**互いに削り切れない盤面を置いて、
   * 補正なしでは上限まで終わらず、補正ありでは決着することを見る。
   */
  it("削り切れない相手どうしでも、放っておけば決着する", () => {
    const attacker = wall("golem_FIRE", 400_000, 300);
    const defender = wall("golem_WATER", 400_000, 300);

    const plain = new BattleEngine([attacker], [defender], { rng: mulberry32(11) }).run();
    expect(plain.winner, "補正なしなら上限まで終わらない盤面であること").toBe("DRAW");

    const ramped = new BattleEngine([attacker], [defender], {
      rng: mulberry32(11), ...ARENA_BATTLE_OPTIONS,
    }).run();
    expect(ramped.winner, "補正ありでは決着する").not.toBe("DRAW");
    expect(ramped.turnsTaken).toBeLessThan(plain.turnsTaken);
  });

  it("PvEには持ち込まない(塔の階を指定した戦闘には乗らない)", () => {
    /*
     * 耐久編成で塔を登る道が消えるので、ここを広げてはいけない。
     * 設定を渡さない限り倍率は1のまま、という当たり前を固定しておく。
     */
    const attacker = wall("golem_FIRE", 400_000, 300);
    const defender = wall("golem_WATER", 400_000, 300);
    const result = new BattleEngine([attacker], [defender], { rng: mulberry32(11), trialTowerFloor: 30 }).run();
    expect(result.winner).toBe("DRAW");
  });
});
