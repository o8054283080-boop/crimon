import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { TRIAL_TOWER_FLOORS } from "../src/data/trialTower.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { buildTower70, TOWER70_POISON } from "../tools/battleLab/scenarios/tower70.js";
import { tower70Enemies } from "../tools/battleLab/tower70/enemies.js";
import { roarSkill } from "../tools/battleLab/tower70/probe.js";
import { TOWER70_ADDS, TOWER70_BASE, TOWER70_CRUSH, TOWER70_LABELS, TOWER70_ROAR, TOWER70_ROAR_V2, TOWER70_TIERS, tower70TierAt, tower70With, type Tower70Numbers } from "../tools/battleLab/tower70/spec.js";
import { findMonsterById } from "../src/data/monsters.js";

/*
 * 試練の塔70階の**仮**盤面。
 *
 * ## ここで見張ること
 *
 * この盤面は本編に無い挙動を `probe` が受け持っている。だから
 * **「置いたつもりの数値が本当にその形で効いているか」**を確かめないと、
 * 測った数字が何の数字なのか分からなくなる。
 *
 * 一番怖いのは、機構が黙って効いていない状態で勝率だけ見て
 * 「70階は簡単だった」と報告すること。段階も再生もシールドも、
 * **実際に発動したことを数えてから**でないと結論を書けない。
 *
 * ## 本編を汚していないことも見張る
 *
 * `src/data/trialTower.ts` の70階は従来のまま(古代の魔人+お供2体)。
 * ここが変わっていたら、検証用のはずの作業が本編へ漏れている。
 */

const [BOSS_SPEC, LIFE_SPEC, PULSE_SPEC] = tower70Enemies(TOWER70_BASE);
/** 第2回の脈動晶(守り役)。切り分け用に残してあるので、そちらも見張る */
const SHIELD_NUMBERS = tower70With({ pulseRole: "SHIELD" });

/**
 * 観測点だけを取り付けた盤面を作る。`E1`=本体 `E2`=生命晶 `E3`=脈動晶。
 *
 * `allyHp` を渡すと、その数だけ味方を並べて現在HPを直に置く
 * (命脈断ちが**現在HPの実数**で狙い先を決めるので、順番を作れないと確かめられない)。
 */
function rig(options: { bossHp?: number; numbers?: Tower70Numbers; allyHp?: number[] } = {}) {
  const numbers = options.numbers ?? TOWER70_BASE;
  const scenario = buildTower70({ numbers });
  const enemies = tower70Enemies(numbers).map(buildEnemy);
  const base = findMonsterById("wolf_FIRE")!;
  const allyHp = options.allyHp ?? [500_000];
  const allies = allyHp.map(() => ({ ...base, stats: { ...base.stats, hp: 500_000, atk: 1, spd: 1 } }));
  const engine = new BattleEngine(allies, enemies, { rng: mulberry32(1), maxTurns: 1 });
  const probe = attachProbe(engine, scenario.hook)!;
  const units = engine.getUnits();
  const players = units.filter((unit) => unit.team === "PLAYER");
  const foes = units.filter((unit) => unit.team === "ENEMY");
  allyHp.forEach((hp, index) => { players[index].currentHp = hp; });
  const boss = foes[0];
  if (options.bossHp !== undefined) boss.currentHp = options.bossHp;
  return { engine, probe, units, players, boss, life: foes[1], pulse: foes[2] };
}

/** 観測点へ1手番ぶん通す(エンジンを走らせずに、境目の挙動だけを見る) */
function turn(rigged: ReturnType<typeof rig>, id: string, lines: string[] = []): void {
  rigged.probe.beforeTurn(id);
  rigged.probe.afterTurn(id, lines);
}

/** 脈動晶が「命脈断ち」を撃った手番。合図はログの1行だけ */
const CRUSH_LINE = '[敵:E3] 古代の脈動晶(闇) は 「命脈断ち」 を使った！';

describe("70階の仮盤面: 敵のステータス", () => {
  it("始祖ベヒモスは HP230,000 / ATK7,800 / DEF4,000 / SPD168", () => {
    expect(BOSS_SPEC.stats).toMatchObject({ hp: 230_000, atk: 7_800, def: 4_000, spd: 168 });
    const built = buildEnemy(BOSS_SPEC);
    expect(built.stats.hp).toBe(230_000);
    expect(built.stats.atk).toBe(7_800);
    expect(built.stats.spd).toBe(168);
  });

  it("生命晶は HP130,000 / DEF3,800 / SPD230(第2回改訂)", () => {
    expect(LIFE_SPEC.stats).toMatchObject({ hp: 130_000, def: 3_800, spd: 230 });
    expect(LIFE_SPEC.stats?.hp).toBe(TOWER70_ADDS.life.hp);
    // ATKは第1回のまま。硬さと速さだけを上げた
    expect(LIFE_SPEC.stats?.atk).toBe(1_900);
  });

  it("脈動晶は HP140,000 / DEF4,200 / SPD230(第2回改訂)", () => {
    expect(PULSE_SPEC.stats).toMatchObject({ hp: 140_000, def: 4_200, spd: 230 });
    expect(PULSE_SPEC.stats?.hp).toBe(TOWER70_ADDS.pulse.hp);
    expect(PULSE_SPEC.stats?.atk).toBe(2_100);
  });

  it("勝利条件は始祖ベヒモスの撃破だけ", () => {
    expect(BOSS_SPEC.victoryTarget).toBe(true);
    expect(LIFE_SPEC.victoryTarget).toBeUndefined();
    expect(PULSE_SPEC.victoryTarget).toBeUndefined();
  });

  it("始祖ベヒモスに毒・継続ダメージへの耐性を1つも付けていない", () => {
    /*
     * **毒は塞ぐべき抜け道ではない**(docs/design-concept.md)。
     * 高HPだから毒が効く、という攻略構造を作るのがこの階の狙いなので、
     * 耐性を付けた瞬間に階の意味ごと消える
     */
    const built = buildEnemy(BOSS_SPEC);
    expect(JSON.stringify(built.bossTraits ?? {})).not.toContain("poison");
    expect(JSON.stringify(built.skills)).not.toContain("POISON_RESIST");
  });
});

describe("70階の仮盤面: スキル", () => {
  const boss = buildEnemy(BOSS_SPEC);
  const life = buildEnemy(LIFE_SPEC);
  const pulse = buildEnemy(PULSE_SPEC);
  const damageOf = (skill: { effects: readonly unknown[] }): DamageEffect =>
    skill.effects.find((effect) => (effect as DamageEffect).kind === "DAMAGE") as DamageEffect;

  it("S1〜S3のATK倍率と最大HP加算が仕様どおり", () => {
    expect(damageOf(boss.skills[0])).toMatchObject({ multiplier: 0.55, hpCoefficient: 0.03 });
    expect(damageOf(boss.skills[1])).toMatchObject({ multiplier: 0.8, hpCoefficient: 0.04 });
    expect(damageOf(boss.skills[2])).toMatchObject({ multiplier: 1.2, hpCoefficient: 0.05 });
  });

  it("S1は50%で2ターン挑発", () => {
    expect(boss.skills[0].effects).toContainEqual({ kind: "STATUS", status: "TAUNT", durationTurns: 2, chance: 0.5 });
  });

  it("S3は自身の弱化を全解除し、HP50%以上のときだけゲージを削る", () => {
    // 個数を書かない=全部。applyTo: SELF なので味方は巻き込まない
    expect(boss.skills[2].effects).toContainEqual({ kind: "CLEANSE", applyTo: "SELF" });
    expect(boss.skills[2].effects).toContainEqual({ kind: "GAUGE", amount: -0.2, requires: "SELF_HP_ABOVE_50" });
  });

  it("生命晶のS2はCT3の全体弱化解除で、ダメージも回復も持たない", () => {
    expect(life.skills[1].cooldownTurns).toBe(3);
    expect(life.skills[1].target).toBe("ALL_ALLIES");
    expect(life.skills[1].effects).toEqual([{ kind: "CLEANSE" }]);
  });

  it("生命晶のS3はAIの行動候補にならない(S2の解除が最上位になる)", () => {
    // ここが候補に入ると、CT3の解除がほとんど撃たれなくなり階の狙いが消える
    expect(life.skills[2].automatic).toBe(true);
    expect(life.skills[2].effects).toEqual([]);
  });

  it("脈動晶のS2は「命脈断ち」でCT5、ダメージ効果を1つも持たない", () => {
    /*
     * **効果を空にしてあるのが仕様。**現在HPの割合を書き換える機構が本編に無く、
     * ダメージ効果で代用すると防御・軽減・会心を通ってしまい別物になる。
     * 中身は `probe.ts` が手番の境目で受け持ち、ここは使用の合図だけを出す
     */
    expect(pulse.skills[1].name).toBe("命脈断ち");
    expect(pulse.skills[1].cooldownTurns).toBe(5);
    expect(pulse.skills[1].cooldownTurns).toBe(TOWER70_CRUSH.cooldownTurns);
    expect(pulse.skills[1].target).toBe("SINGLE_ENEMY");
    expect(pulse.skills[1].effects).toEqual([]);
  });

  it("脈動晶のS3は軽めの全体攻撃(主役はS2なので結果を壊さない値)", () => {
    expect(pulse.skills[2].name).toBe("脈動崩し");
    expect(pulse.skills[2].target).toBe("ALL_ENEMIES");
    expect(pulse.skills[2].cooldownTurns).toBe(5);
    expect(pulse.skills[2].effects).toContainEqual({ kind: "DAMAGE", multiplier: 0.5 });
    expect(pulse.skills[2].effects).toContainEqual({ kind: "GAUGE", amount: -0.15, chance: 0.5 });
  });

  it("**脈動晶からシールドが完全に消えている**(第3回)", () => {
    // 守りも軽減も残っていないこと。1つでも残ると引き分けの原因が戻る
    const json = JSON.stringify(pulse.skills);
    expect(json).not.toContain("SHIELD");
    expect(json).not.toContain("shieldRate");
    expect(json).not.toContain("MITIGATE");
    expect(json).not.toContain("脈動の護り");
    expect(json).not.toContain("不動の脈");
  });

  it("第2回の守り役は切り分け用に残っている(既定では使わない)", () => {
    const shielder = tower70Enemies(SHIELD_NUMBERS)[2];
    expect(shielder.skills?.[1].effects).toContainEqual({ kind: "SHIELD", shieldRate: 0.15, durationTurns: 2 });
    // 術者基準にすると脈動晶の最大HPの15%になってしまう。受け手基準のまま
    expect(JSON.stringify(shielder.skills?.[1].effects)).not.toContain("fromSourceHp");
    expect(JSON.stringify(tower70Enemies(tower70With({ pulseRole: "SHIELD", pulseShieldRate: 0.2 }))[2].skills))
      .toContain('"shieldRate":0.2');
  });
});

describe("70階の仮盤面: 命脈断ち(第3回)", () => {
  /*
   * **ダメージではない。**防御でも軽減でも会心でも動かず、命中/抵抗も通らない。
   * 現在HPの実数がいちばん大きい1体を、その場で半分にするだけ。
   * だから硬い個体ほど大きく削られ、耐久で粘る形にだけ代償が付く。
   */
  it("60,000のモンスターは30,000になる", () => {
    const r = rig({ allyHp: [60_000, 10_000] });
    turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[0].currentHp).toBe(30_000);
    expect(r.players[1].currentHp).toBe(10_000);
  });

  it("40,000のモンスターは20,000になる", () => {
    const r = rig({ allyHp: [40_000, 5_000] });
    turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[0].currentHp).toBe(20_000);
  });

  it("狙うのは**現在HPの実数**が最も高い1体だけ", () => {
    const r = rig({ allyHp: [10_000, 90_000, 30_000] });
    turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[1].currentHp).toBe(45_000);
    expect(r.players[0].currentHp).toBe(10_000);
    expect(r.players[2].currentHp).toBe(30_000);
  });

  it("現在HPの順が変われば、狙い先も変わる", () => {
    const r = rig({ allyHp: [100_000, 90_000] });
    turn(r, "E3", [CRUSH_LINE]);
    // 100,000 → 50,000。次はもう1体の 90,000 が最も高い
    expect(r.players[0].currentHp).toBe(50_000);
    turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[1].currentHp).toBe(45_000);
    expect(r.players[0].currentHp).toBe(50_000);
  });

  it("**絶対に即死させない。**現在HP1なら1のまま", () => {
    const r = rig({ allyHp: [1] });
    turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[0].currentHp).toBe(1);
    expect(r.players[0].alive).toBe(true);
    expect(r.probe.finish()["命脈断ちでの死亡"]).toBe(0);
  });

  it("何度撃っても0にならず、倒れない", () => {
    const r = rig({ allyHp: [50_000] });
    for (let i = 0; i < 30; i += 1) turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[0].currentHp).toBeGreaterThanOrEqual(1);
    expect(r.players[0].alive).toBe(true);
    expect(r.probe.finish()["命脈断ちでの死亡"]).toBe(0);
  });

  it("倒れている味方は狙わない", () => {
    const r = rig({ allyHp: [200_000, 60_000] });
    r.players[0].alive = false;
    r.players[0].currentHp = 0;
    turn(r, "E3", [CRUSH_LINE]);
    expect(r.players[1].currentHp).toBe(30_000);
  });

  it("使っていない手番では誰のHPも動かない", () => {
    const r = rig({ allyHp: [60_000] });
    turn(r, "E3");
    turn(r, "E1");
    turn(r, "E2");
    expect(r.players[0].currentHp).toBe(60_000);
    expect(r.probe.finish()["命脈断ちの発動回数"]).toBe(0);
  });

  it("削った量と狙い先が集計に出る", () => {
    const r = rig({ allyHp: [80_000, 20_000] });
    turn(r, "E3", [CRUSH_LINE]);
    const extra = r.probe.finish();
    expect(extra["命脈断ちの発動回数"]).toBe(1);
    expect(extra["命脈断ち発動前HP"]).toBe(80_000);
    expect(extra["命脈断ち発動後HP"]).toBe(40_000);
    expect(extra["命脈断ち1回の削り"]).toBe(40_000);
    expect(extra["命脈断ちP1"]).toBe(1);
    expect(extra["命脈断ちP2"]).toBe(0);
  });
});

describe("70階の仮盤面: 段階は置き換え式(第2回改訂)", () => {
  /*
   * **回復してから段階を判定する**ので、境界ぎりぎりの値では戻って外れる。
   * 段の中へ確実に入る値で確かめること(第1回は0.65で試して回復後72%になり落ちた)。
   */
  const hpCoefOf = (r: ReturnType<typeof rig>, slot: number): number => {
    const damage = r.boss.def.skills[slot].effects.find((e) => e.kind === "DAMAGE") as DamageEffect;
    return damage.hpCoefficient ?? 0;
  };

  it("HP70%以下は SPD+10 / HP比例+10% / 被ダメ-10%", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.55) });
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(10);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.1, 6);
    expect(r.boss.mitigateAmount).toBeCloseTo(0.10, 5);
  });

  it("HP50%以下は SPD+25 / HP比例+20%", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.35) });
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(25);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.2, 6);
  });

  it("HP30%以下は SPD+45 / HP比例+35%", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(45);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.35, 6);
    // ATK倍率には触らない。ここが動くと打点が仕様の倍近くになる
    const damage = r.boss.def.skills[2].effects.find((e) => e.kind === "DAMAGE") as DamageEffect;
    expect(damage.multiplier).toBe(1.2);
  });

  it("**加算ではなく置き換え。**30%以下でも +10+25+45 にはならない", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(45);
    expect(r.boss.flatStatBonus.spd).not.toBe(10 + 25 + 45);
    expect(hpCoefOf(r, 2)).not.toBeCloseTo(0.05 * (1 + 0.10 + 0.20 + 0.35), 6);
  });

  it("回復すると弱い段へ**戻る**(第1回はここが戻らなかった)", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(45);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.35, 6);

    r.boss.currentHp = Math.round(230_000 * 0.35);
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(25);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.2, 6);

    r.boss.currentHp = Math.round(230_000 * 0.55);
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(10);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.1, 6);

    r.boss.currentHp = Math.round(230_000 * 0.75);
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(0);
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05, 6);
    // 70%を上回れば軽減も外れる
    expect(r.boss.mitigateTurns).toBe(0);
  });

  it("何手番経っても倍率が積み重ならない", () => {
    // 自分の手番では回復するので、HPを毎回同じ帯へ戻して段を固定する
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    for (let i = 0; i < 8; i += 1) {
      r.boss.currentHp = Math.round(230_000 * 0.15);
      turn(r, "E1");
    }
    expect(hpCoefOf(r, 2)).toBeCloseTo(0.05 * 1.35, 6);
  });

  it("段の表そのものが仕様どおり", () => {
    expect(TOWER70_TIERS).toEqual([
      { hpRatio: 0.3, spd: 45, hpDamageUp: 0.35, damageTakenCut: 0.10 },
      { hpRatio: 0.5, spd: 25, hpDamageUp: 0.20, damageTakenCut: 0.10 },
      { hpRatio: 0.7, spd: 10, hpDamageUp: 0.10, damageTakenCut: 0.10 },
    ]);
    expect(tower70TierAt(0.8)).toBeNull();
    expect(tower70TierAt(0.7)?.spd).toBe(10);
    expect(tower70TierAt(0.5)?.spd).toBe(25);
    expect(tower70TierAt(0.3)?.spd).toBe(45);
  });
});

describe("70階の仮盤面: 始祖の咆哮", () => {
  /*
   * 咆哮は本編の `counterWithSkill` で撃つ。**手番もクールタイムも
   * 行動ゲージも消費しない**本編の機構なので、ダメージも命中も抵抗も
   * 会心も防御計算も、すべてエンジンが決める。
   */
  const roars = (r: ReturnType<typeof rig>): number =>
    (r.engine as unknown as { log: string[] }).log.filter((line) => line.includes("「始祖の咆哮」")).length;

  it("**第3回はATK1.5倍+最大HP5%**(ゲージ-50%、防御-50%を3ターンは据え置き)", () => {
    /*
     * 第2回は2.0倍+8%で、**1発で味方チームの残HPが95.2%→48.4%へ落ちていた。**
     * 切り分けでも咆哮ひとつで−93〜−100pt。ここだけが効きすぎていた
     */
    const skill = roarSkill(TOWER70_BASE);
    expect(skill.target).toBe("ALL_ENEMIES");
    expect(skill.effects).toContainEqual({ kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.05 });
    expect(skill.effects).toContainEqual({ kind: "GAUGE", amount: -0.5 });
    expect(skill.effects).toContainEqual({ kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 3, chance: 1 });
    expect(TOWER70_ROAR).toMatchObject({ multiplier: 1.5, hpCoefficient: 0.05, gaugeDown: 0.5, defDown: 0.5, defDownTurns: 3 });
  });

  it("基礎の打点は 7,800×1.5 + 230,000×5% = 23,200", () => {
    // 防御・軽減・会心の前の素の値。第2回は 15,600 + 18,400 = 34,000 だった
    const base = TOWER70_BASE.bossAtk * TOWER70_ROAR.multiplier + TOWER70_BASE.bossHp * TOWER70_ROAR.hpCoefficient;
    expect(base).toBe(23_200);
    expect(TOWER70_BASE.bossAtk * TOWER70_ROAR_V2.multiplier + TOWER70_BASE.bossHp * TOWER70_ROAR_V2.hpCoefficient).toBe(34_000);
  });

  it("第2回の打点も切り分け用に呼び出せる", () => {
    const skill = roarSkill(tower70With({ roarProfile: "V2" }));
    expect(skill.effects).toContainEqual({ kind: "DAMAGE", multiplier: 2.0, hpCoefficient: 0.08 });
  });

  it("HP75%を初めて割った時に1回だけ鳴る", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.74) });
    turn(r, "E1");
    expect(roars(r)).toBe(1);
  });

  it("同じ閾値では二度鳴らない", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.74) });
    for (let i = 0; i < 5; i += 1) turn(r, "E1");
    expect(roars(r)).toBe(1);
  });

  it("回復して跨ぎ直しても再発動しない", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.74) });
    turn(r, "E1");
    expect(roars(r)).toBe(1);
    r.boss.currentHp = Math.round(230_000 * 0.9);
    turn(r, "E1");
    r.boss.currentHp = Math.round(230_000 * 0.74);
    turn(r, "E1");
    expect(roars(r)).toBe(1);
  });

  it("50%・25%もそれぞれ1回ずつ鳴る", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.74) });
    turn(r, "E1");
    expect(roars(r)).toBe(1);
    r.boss.currentHp = Math.round(230_000 * 0.49);
    turn(r, "E1");
    expect(roars(r)).toBe(2);
    r.boss.currentHp = Math.round(230_000 * 0.24);
    turn(r, "E1");
    expect(roars(r)).toBe(3);
  });

  it("80%→40%へ一撃で飛ぶと、75%と50%の2回が鳴る", () => {
    /*
     * **高火力で閾値を飛ばしてギミックを無視できないようにする。**
     * 跨いだ数だけ上から順に出す
     */
    const r = rig({ bossHp: Math.round(230_000 * 0.8) });
    turn(r, "E1");
    expect(roars(r)).toBe(0);
    r.boss.currentHp = Math.round(230_000 * 0.4);
    turn(r, "E1");
    expect(roars(r)).toBe(2);
  });

  it("80%→20%へ一撃で飛ぶと、75%・50%・25%の3回が鳴る", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.8) });
    turn(r, "E1");
    r.boss.currentHp = Math.round(230_000 * 0.2);
    turn(r, "E1");
    expect(roars(r)).toBe(3);
  });

  it("咆哮でクールタイムも行動ゲージも動かない", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.74) });
    r.boss.cooldowns = [0, 4, 5];
    const gaugeBefore = r.boss.gauge;
    turn(r, "E1");
    expect(roars(r)).toBe(1);
    expect(r.boss.cooldowns).toEqual([0, 4, 5]);
    expect(r.boss.gauge).toBe(gaugeBefore);
  });

  it("咆哮のあとも本体のスキルは元の3つに戻っている", () => {
    // 撃つ間だけ枠へ差し込む作りなので、戻し忘れると以降の行動が咆哮になる
    const r = rig({ bossHp: Math.round(230_000 * 0.74) });
    turn(r, "E1");
    expect(r.boss.def.skills.map((skill) => skill.name)).toEqual(["巨獣の一撃", "大地踏み", "天地崩壊"]);
  });

  it("咆哮は段階のHP比例強化を受けない(素の5%のまま)", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    turn(r, "E1");
    const skill = roarSkill(TOWER70_BASE);
    const damage = skill.effects.find((e) => e.kind === "DAMAGE") as DamageEffect;
    expect(damage.hpCoefficient).toBe(0.05);
  });

  it("咆哮を切れば1回も鳴らない(切り分け用)", () => {
    const scenario = buildTower70({ numbers: tower70With({ roar: false }) });
    const enemies = tower70Enemies(TOWER70_BASE).map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
    const probe = attachProbe(engine, scenario.hook)!;
    const boss = engine.getUnits()[1];
    boss.currentHp = Math.round(230_000 * 0.2);
    probe.beforeTurn("E1");
    probe.afterTurn("E1", []);
    expect((engine as unknown as { log: string[] }).log.filter((l) => l.includes("始祖の咆哮"))).toHaveLength(0);
  });
});

describe("70階の仮盤面: 再生とシールド", () => {
  it("自ターン終了時に回復し、生命晶が生きていれば7%・倒れていれば3%", () => {
    const r = rig({ bossHp: 100_000 });
    turn(r, "E1");
    // 3% + 4% = 7% = 16,100
    expect(r.boss.currentHp).toBe(100_000 + Math.round(230_000 * 0.07));

    r.life.alive = false;
    r.life.currentHp = 0;
    const before = r.boss.currentHp;
    turn(r, "E1");
    expect(r.boss.currentHp - before).toBe(Math.round(230_000 * 0.03));
  });

  it("回復するのは本体の手番だけ(取り巻きの手番では増えない)", () => {
    const r = rig({ bossHp: 100_000 });
    turn(r, "E2");
    turn(r, "E3");
    expect(r.boss.currentHp).toBe(100_000);
  });

  it("最大HPを超えて回復しない", () => {
    const r = rig({ bossHp: 229_000 });
    turn(r, "E1");
    expect(r.boss.currentHp).toBe(230_000);
  });

  it("**第3回は本体に一切シールドが張られない**(3手番ごとの自動シールドも削除)", () => {
    /*
     * ここが残っていると、第2回の引き分け(TYPICAL 81〜89% / SUSTAIN 96〜99%)が
     * そのまま戻る。吸収量は本体HPの0.86〜1.46倍まで積み上がっていた
     */
    const r = rig({ bossHp: 100_000 });
    for (let i = 0; i < 12; i += 1) turn(r, "E3");
    expect(r.boss.shieldValue).toBe(0);
    expect(r.probe.finish()["シールド発動回数"]).toBe(0);
  });

  it("第2回の周期シールドは切り分けの時だけ動く(3手番ごとに最大HPの15%)", () => {
    const r = rig({ bossHp: 100_000, numbers: SHIELD_NUMBERS });
    turn(r, "E3");
    turn(r, "E3");
    expect(r.boss.shieldValue).toBe(0);
    turn(r, "E3");
    expect(r.boss.shieldValue).toBe(Math.round(230_000 * 0.15));
    expect(r.boss.shieldValue).toBe(34_500);
    // 重ならない(本編が Math.max で上書きしている)
    for (let i = 0; i < 6; i += 1) turn(r, "E3");
    expect(r.boss.shieldValue).toBe(34_500);
  });

  it("切り分けの時でも、脈動晶が倒れていれば周期シールドは飛ばない", () => {
    const r = rig({ bossHp: 100_000, numbers: SHIELD_NUMBERS });
    r.pulse.alive = false;
    r.pulse.currentHp = 0;
    for (let i = 0; i < 6; i += 1) turn(r, "E3");
    expect(r.boss.shieldValue).toBe(0);
  });
});

describe("70階の仮盤面: 実際に戦わせる", () => {
  it("始祖ベヒモスを倒せば、取り巻きが残っていても勝ち", () => {
    const enemies = tower70Enemies(TOWER70_BASE).map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(5), maxTurns: 1 });
    const units = engine.getUnits();
    const boss = units.find((unit) => unit.def.victoryTarget)!;
    boss.alive = false;
    boss.currentHp = 0;
    const result = engine.run();
    expect(result.winner).toBe("PLAYER");
    expect(units.filter((unit) => unit.team === "ENEMY" && unit.alive)).toHaveLength(2);
  });

  it("生命晶の全体解除は、本編の解除なので毒スタックごと消える", () => {
    const enemies = tower70Enemies(TOWER70_BASE).map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(2), maxTurns: 3 });
    const units = engine.getUnits();
    const boss = units[1];
    const life = units[2];
    boss.poisonStacks = 4;
    boss.poisonTurns = 5;
    boss.poisonDamageRate = 0.05;
    (engine as unknown as { resolveTurn(u: unknown, c: unknown): void })
      .resolveTurn(life, { skillIndex: 1 });
    expect(boss.poisonStacks).toBe(0);
    expect(boss.poisonTurns).toBe(0);
  });

  it("毒編成は、本編に実在する毒スキルだけで組んである", () => {
    /*
     * 毒を1つも持たない3体を「毒編成」として測り、丸ごと嘘の結論を出した前例がある。
     * しかも味方AIは**番号の大きいスキル**を優先するので、
     * スキル3に毒が無いと実際にはほとんど撒かれない
     */
    const withPoisonOnS3 = TOWER70_POISON.filter((ally) => {
      const dex = findMonsterById(`${ally.templateId}_${ally.element}`);
      return dex?.skills[2].effects.some((effect) => effect.kind === "POISON") ?? false;
    });
    expect(withPoisonOnS3.length).toBeGreaterThanOrEqual(3);
    for (const ally of TOWER70_POISON) {
      expect(findMonsterById(`${ally.templateId}_${ally.element}`), `${ally.label} が図鑑にない`).toBeDefined();
    }
  });

  it("1戦通して、再生・段階・解除が実際に発動する", () => {
    // 機構が黙って効いていない状態で勝率だけ見て結論を書かないための番人
    const scenario = buildTower70();
    const enemies = scenario.enemies.map(buildEnemy);
    const tank = { ...findMonsterById("behemoth_WATER")!, stats: { ...findMonsterById("behemoth_WATER")!.stats, hp: 900_000, atk: 900, def: 3_000, spd: 90 } };
    const engine = new BattleEngine([tank, tank, tank], enemies, { rng: mulberry32(11), maxTurns: 120 });
    const probe = attachProbe(engine, scenario.hook)!;
    engine.run();
    const extra = probe.finish();
    expect(extra["再生発動回数"]).toBeGreaterThan(0);
    expect(extra["本体総回復量"]).toBeGreaterThan(0);
    expect(extra["S3使用回数"]).toBeGreaterThan(0);
    // 第3回の主役。ここが0なら、脈動晶が仕事をしないまま勝率を測っている
    expect(extra["命脈断ちの発動回数"]).toBeGreaterThan(0);
    // **半減で直接倒してはいけない**(1未満にはしない仕様)
    expect(extra["命脈断ちでの死亡"]).toBe(0);
  });
});

describe("Battle Labの仮組みが本編へ漏れていない", () => {
  /*
   * **この節の意味が途中で変わっている。**
   *
   * 元は「本編は1つも変わっていない」で、70階が従来の古代の魔人のままだと
   * 固めていた。その後の回で本編実装が入り、70階は始祖ベヒモスになった。
   * 変わったのは本編の側なので、ここは
   * **仮組み(`lab_t70_*`)が本編へ紛れ込んでいないか**だけを見張る役へ移す。
   * 70階そのものの中身は `tests/trialTowerUpper.test.ts` が固めている。
   */
  it("本編の70階は本編の定義で組まれている(Labの札ではない)", () => {
    const floor = TRIAL_TOWER_FLOORS[69];
    expect(floor.floor).toBe(70);
    expect(floor.enemies).toHaveLength(3);
    // Labの仮スキルIDが1つも混ざっていないこと
    expect(JSON.stringify(floor)).not.toContain("lab_t70");
    // Labだけの仮の呼び名(取り巻きの内部ラベル)も漏れていないこと
    expect(JSON.stringify(floor)).not.toContain(TOWER70_LABELS.pulse + "(仮)");
  });

  it("70階の仮スキルは図鑑のどこにも入っていない", () => {
    const ids = ["lab_t70_boss_s1", "lab_t70_boss_s2", "lab_t70_boss_s3", "lab_t70_life_s2", "lab_t70_pulse_s2"];
    for (const id of ids) {
      expect(findMonsterById(id.replace("lab_t70_", ""))).toBeUndefined();
    }
    expect(JSON.stringify(TRIAL_TOWER_FLOORS)).not.toContain("lab_t70");
  });

  it("観測点を付けない盤面では、集計が空のまま", () => {
    // 既存のシナリオ(60階など)に影響が出ていないこと
    const enemies = tower70Enemies(TOWER70_BASE).map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
    expect(attachProbe(engine, undefined)).toBeNull();
  });
});
