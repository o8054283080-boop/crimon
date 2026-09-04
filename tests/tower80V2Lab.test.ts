import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { hasStatus } from "../src/battle/unit.js";
import type { DamageEffect } from "../src/core/skill.js";
import { findMonsterById } from "../src/data/monsters.js";
import { TRIAL_TOWER_FLOORS } from "../src/data/trialTower.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { runBattle } from "../tools/battleLab/run.js";
import { buildTower80V2, TOWER80_ENEMIES_V2, TOWER80_STRIP_BLOCK_PARTY_V2, TOWER80_V2 } from "../tools/battleLab/scenarios/tower80v2.js";
import { TOWER80_RULES } from "../tools/battleLab/tower80/probe.js";

/*
 * 試練の塔80階の**仮**盤面(第2回)。
 *
 * ## 計測はここに置かない
 *
 * 元は「TYPICAL 1000戦×5攻略順」という `it` が V1・V2 に1つずつあり、
 * 合わせて28秒をCIが毎回払っていた。確かめていたのは
 * `expect(rows).toHaveLength(5)` だけで、数字は `console.log` へ流すだけ。
 * **測定はテストではない。**数字が要る時は
 * `npx tsx tools/battleLab/tower80/measure.ts` から回す。
 *
 * ## ここで見張ること
 *
 * この盤面はボス固有の仕掛けを `probe` が受け持っている。だから
 * **「置いたつもりの仕掛けが本当にその形で効いているか」**を確かめないと、
 * 測った勝率が何の勝率なのか分からなくなる。
 *
 * 特に**免疫と強化阻害の関係**は、この階の攻略そのもの。
 * ここが黙って壊れると「剥がし編成でも勝てない」という
 * 嘘の結論をそのまま報告することになる。
 */

/** 観測点だけを取り付けた盤面。`E1`=ボス `E2`=護晶 `E3`=鼓舞晶 `E4`=破邪獣 `E5`=呪獣 */
function rig(options: { bossHp?: number } = {}) {
  const scenario = buildTower80V2();
  const enemies = scenario.enemies.map(buildEnemy);
  const base = findMonsterById("wolf_FIRE")!;
  const dummy = { ...base, stats: { ...base.stats, hp: 500_000, atk: 1, spd: 1 } };
  const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
  const probe = attachProbe(engine, scenario.hook)!;
  const units = engine.getUnits();
  const foes = units.filter((unit) => unit.team === "ENEMY");
  const boss = foes[0];
  if (options.bossHp !== undefined) boss.currentHp = options.bossHp;
  return { engine, probe, boss, foes };
}

const turn = (rigged: ReturnType<typeof rig>, id: string, lines: string[] = []): void => {
  rigged.probe.beforeTurn(id);
  rigged.probe.afterTurn(id, lines);
};

const damageOf = (skill: { effects: readonly unknown[] }): DamageEffect =>
  skill.effects.find((effect) => (effect as DamageEffect).kind === "DAMAGE") as DamageEffect;

describe("80階V2: 敵の実数", () => {
  it("ボスとお供のATK/SPDが依頼どおり", () => {
    expect(TOWER80_ENEMIES_V2.map((enemy) => [enemy.stats?.atk, enemy.stats?.spd])).toEqual([
      [9_500, 185], [6_000, 170], [5_500, 162], [8_500, 180], [6_500, 155],
    ]);
  });

  it("HPも依頼どおり(ボス200,000 / お供は合計410,000)", () => {
    const hp = TOWER80_ENEMIES_V2.map((enemy) => enemy.stats?.hp);
    expect(hp).toEqual([200_000, 100_000, 120_000, 80_000, 110_000]);
    // お供の合計はボス単体の2倍を超える。**「お供を倒す線が重い」ことの根拠**
    expect(hp.slice(1).reduce<number>((sum, value) => sum + (value ?? 0), 0)).toBe(410_000);
  });

  it("勝利条件はボスの撃破だけ", () => {
    expect(TOWER80_ENEMIES_V2[0].victoryTarget).toBe(true);
    for (const enemy of TOWER80_ENEMIES_V2.slice(1)) expect(enemy.victoryTarget).toBeUndefined();
  });
});

describe("80階V2: 測定パーティは本当に剥がし・強化阻害を持っているか", () => {
  /*
   * **持っていない編成で測ると、結論がまるごと嘘になる。**
   * 毒を1つも持たない3体を「毒編成」として測った前例がある。
   */
  it("剥がしを持つのは3体(草・電気アビスリーパー・光バジリスク)", () => {
    const strippers = TOWER80_STRIP_BLOCK_PARTY_V2.filter((ally) => {
      const dex = findMonsterById(`${ally.templateId}_${ally.element}`)!;
      return dex.skills.some((skill) => skill.effects.some((effect) => effect.kind === "STRIP" || effect.kind === "STEAL_BUFF"));
    });
    expect(strippers.map((ally) => ally.label)).toEqual([
      "アビスリーパー[草]", "アビスリーパー[電気]", "バジリスク[光]",
    ]);
  });

  it("**強化阻害はパッシブから出る。**草アビスリーパーのS3が持っている", () => {
    /*
     * 効果の配列だけを見ると見落とす。`REAPER_HARVEST` は
     * 「ダメージを与えた時、確率で1ターンの強化不可」という**パッシブ**で、
     * S3「死神の収穫」の枠に入っている(効果の配列は空)
     */
    const grass = findMonsterById("abyssreaper_GRASS")!;
    const passive = grass.skills.find((skill) => skill.passive !== undefined);
    expect(passive?.name).toBe("死神の収穫");
    expect(JSON.stringify(passive?.passive)).toContain("REAPER_HARVEST");
  });

  it("編成にBUFF_BLOCKを効果として持つ個体はいない(パッシブ経由だけ)", () => {
    // ここが変わったら、強化阻害の入り方そのものが変わったということ
    for (const ally of TOWER80_STRIP_BLOCK_PARTY_V2) {
      const dex = findMonsterById(`${ally.templateId}_${ally.element}`)!;
      const direct = dex.skills.flatMap((skill) => skill.effects)
        .filter((effect) => effect.kind === "STATUS" && (effect as { status?: string }).status === "BUFF_BLOCK");
      expect(direct, `${ally.label}`).toHaveLength(0);
    }
  });
});

describe("80階V2: ボス固有の仕掛け", () => {
  it("戦闘開始時、敵側全体に免疫2ターン", () => {
    const r = rig();
    turn(r, "P1");
    for (const foe of r.foes) expect(foe.immuneTurns, foe.def.name).toBeGreaterThanOrEqual(TOWER80_RULES.immunityTurns);
  });

  it("免疫中はATK+2,000、剥がれると+0", () => {
    const r = rig();
    turn(r, "P1");
    expect(r.boss.flatStatBonus.atk).toBe(2_000);
    r.boss.immuneTurns = 0;
    turn(r, "P1");
    expect(r.boss.flatStatBonus.atk).toBe(0);
  });

  it("免疫が剥がれている間だけ被ダメージ+25%", () => {
    const r = rig();
    turn(r, "P1");
    // 免疫中は素通り(軽減0)
    expect(r.boss.mitigateAmount).toBe(0);
    r.boss.immuneTurns = 0;
    turn(r, "P1");
    // **軽減の裏返し**で表す。負の軽減=被ダメージ増加
    expect(r.boss.mitigateAmount).toBeCloseTo(-0.25, 6);
  });

  it("HP50%未満で全攻撃スキルの倍率が×1.5、戻れば元に戻る", () => {
    const r = rig({ bossHp: Math.round(200_000 * 0.45) });
    turn(r, "P1");
    expect(damageOf(r.boss.def.skills[0]).multiplier).toBeCloseTo(1.0 * 1.5, 6);
    expect(damageOf(r.boss.def.skills[1]).multiplier).toBeCloseTo(1.8 * 1.5, 6);
    expect(damageOf(r.boss.def.skills[2]).multiplier).toBeCloseTo(1.15 * 1.5, 6);

    // **累積させない。**HPが戻れば素の倍率へ戻る
    r.boss.currentHp = Math.round(200_000 * 0.8);
    turn(r, "P1");
    expect(damageOf(r.boss.def.skills[1]).multiplier).toBeCloseTo(1.8, 6);
  });

  it("HP70%・40%への初到達で1回ずつ免疫を配り直す(二度は配らない)", () => {
    const r = rig({ bossHp: Math.round(200_000 * 0.69) });
    turn(r, "P1");
    expect(r.probe.finish()["免疫再展開70%"]).toBe(1);

    const r2 = rig({ bossHp: Math.round(200_000 * 0.69) });
    for (let i = 0; i < 5; i += 1) turn(r2, "P1");
    r2.boss.currentHp = Math.round(200_000 * 0.39);
    for (let i = 0; i < 5; i += 1) turn(r2, "P1");
    const extra = r2.probe.finish();
    expect(extra["免疫再展開70%"]).toBe(1);
    expect(extra["免疫再展開40%"]).toBe(1);
  });

  it("ボスS3「聖域の咆哮」で敵側全体へ免疫が戻る", () => {
    const r = rig();
    turn(r, "P1");
    for (const foe of r.foes) foe.immuneTurns = 0;
    turn(r, "E1", ["[敵:E1] 古代聖竜(光) の「聖域の咆哮」！"]);
    for (const foe of r.foes) expect(foe.immuneTurns, foe.def.name).toBeGreaterThanOrEqual(2);
    expect(r.probe.finish()["S3の免疫供給"]).toBe(1);
  });
});

describe("80階V2: 強化阻害は免疫の再付与を防ぐ", () => {
  /*
   * **この階の攻略そのもの。**観測点が配る免疫も、本編の `IMMUNITY` 効果と
   * 同じく `BUFF_BLOCK` を見なければならない。ここを素通りさせると、
   * 強化阻害という攻略が観測点の側から黙って潰される。
   */
  it("強化阻害中の相手には免疫が乗らず、防いだ数が記録される", () => {
    const r = rig();
    turn(r, "P1");
    for (const foe of r.foes) foe.immuneTurns = 0;
    // ボスだけ強化不可にする
    r.boss.statusEffects.push({ type: "BUFF_BLOCK", category: "DEBUFF", remainingTurns: 3 });

    turn(r, "E1", ["[敵:E1] 古代聖竜(光) の「聖域の咆哮」！"]);
    expect(hasStatus(r.boss, "BUFF_BLOCK")).toBe(true);
    expect(r.boss.immuneTurns, "強化不可のボスには免疫が乗らない").toBe(0);
    // 他の4体には乗る
    for (const foe of r.foes.slice(1)) expect(foe.immuneTurns, foe.def.name).toBeGreaterThanOrEqual(2);
    expect(r.probe.finish()["強化阻害で防いだ免疫"]).toBeGreaterThanOrEqual(1);
  });
});

describe("80階V2: 実際に戦わせる", () => {
  it("1戦通して、免疫・剥がし・強化阻害がすべて発動する", () => {
    /*
     * 機構が黙って効いていない状態で勝率だけ見て結論を書かないための番人。
     *
     * **測定と同じ道(`runBattle`)で1戦だけ走らせる。**エンジンを自分で組むと
     * 装備も狙う順も本番と別物になり、「ここでは動いたが測定では動いていない」
     * を見逃す。狙う順はボス集中——剥がしも強化阻害も、
     * **ボスを殴っている線でしか入らない**ことが分かっているため
     */
    const tally = runBattle(TOWER80_V2, 20260930, ["古代聖竜"], "TYPICAL");
    expect(tally.extra["ボス行動回数"]).toBeGreaterThan(0);
    expect(tally.extra["免疫中の行動割合"]).toBeGreaterThan(0);
    expect(tally.extra["S3の免疫供給"]).toBeGreaterThan(0);
    expect(tally.extra["ボスへの剥がし回数"]).toBeGreaterThan(0);
    expect(tally.extra["ボスへの強化阻害回数"]).toBeGreaterThan(0);
  });
});

describe("本編の80階は1つも変わっていない", () => {
  it("試練の塔80階は従来どおり古代の魔人+お供2体のまま", () => {
    const floor = TRIAL_TOWER_FLOORS[79];
    expect(floor.floor).toBe(80);
    expect(floor.name).toBe("80階 免疫");
    expect(floor.enemies).toHaveLength(3);
    expect(floor.enemies[0].templateId).toBe("ancient_demon");
    // 仮の名前が本編へ漏れていないこと
    expect(JSON.stringify(floor)).not.toContain("古代聖竜");
    expect(JSON.stringify(floor)).not.toContain("tower80_");
  });

  it("80階の仮スキルは本編の塔データのどこにも入っていない", () => {
    expect(JSON.stringify(TRIAL_TOWER_FLOORS)).not.toContain("tower80_");
    expect(JSON.stringify(TRIAL_TOWER_FLOORS)).not.toContain("古代の護晶");
    expect(JSON.stringify(TRIAL_TOWER_FLOORS)).not.toContain("古代の鼓舞晶");
  });

  it("観測点を付けない盤面では、集計が空のまま", () => {
    const enemies = TOWER80_V2.enemies.map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
    expect(attachProbe(engine, undefined)).toBeNull();
  });
});
