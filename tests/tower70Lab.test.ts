import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { DamageEffect } from "../src/core/skill.js";
import { TRIAL_TOWER_FLOORS } from "../src/data/trialTower.js";
import { buildEnemy } from "../tools/battleLab/build.js";
import { attachProbe } from "../tools/battleLab/hook.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import { buildTower70, TOWER70_POISON } from "../tools/battleLab/scenarios/tower70.js";
import { tower70Enemies } from "../tools/battleLab/tower70/enemies.js";
import { TOWER70_ADDS, TOWER70_BASE, TOWER70_LABELS, TOWER70_TIERS, tower70With } from "../tools/battleLab/tower70/spec.js";
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

const S = buildTower70();
const [BOSS_SPEC, LIFE_SPEC, PULSE_SPEC] = tower70Enemies(TOWER70_BASE);

/** 観測点だけを取り付けた盤面を作る。`E1`=本体 `E2`=生命晶 `E3`=脈動晶 */
function rig(options: { bossHp?: number } = {}) {
  const enemies = tower70Enemies(TOWER70_BASE).map(buildEnemy);
  const dummy = { ...findMonsterById("wolf_FIRE")!, stats: { ...findMonsterById("wolf_FIRE")!.stats, hp: 500_000, atk: 1, spd: 1 } };
  const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
  const probe = attachProbe(engine, S.hook)!;
  const units = engine.getUnits();
  const boss = units[1];
  if (options.bossHp !== undefined) boss.currentHp = options.bossHp;
  return { engine, probe, units, boss, life: units[2], pulse: units[3] };
}

/** 観測点へ1手番ぶん通す(エンジンを走らせずに、境目の挙動だけを見る) */
function turn(rigged: ReturnType<typeof rig>, id: string, lines: string[] = []): void {
  rigged.probe.beforeTurn(id);
  rigged.probe.afterTurn(id, lines);
}

describe("70階の仮盤面: 敵のステータス", () => {
  it("始祖ベヒモスは HP230,000 / ATK7,800 / DEF4,000 / SPD168", () => {
    expect(BOSS_SPEC.stats).toMatchObject({ hp: 230_000, atk: 7_800, def: 4_000, spd: 168 });
    const built = buildEnemy(BOSS_SPEC);
    expect(built.stats.hp).toBe(230_000);
    expect(built.stats.atk).toBe(7_800);
    expect(built.stats.spd).toBe(168);
  });

  it("取り巻きはどちらも SPD210", () => {
    expect(LIFE_SPEC.stats?.spd).toBe(210);
    expect(PULSE_SPEC.stats?.spd).toBe(210);
    expect(LIFE_SPEC.stats?.hp).toBe(TOWER70_ADDS.life.hp);
    expect(PULSE_SPEC.stats?.hp).toBe(TOWER70_ADDS.pulse.hp);
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

  it("脈動晶のS2は受け手の最大HPの15%シールド", () => {
    expect(pulse.skills[1].cooldownTurns).toBe(4);
    expect(pulse.skills[1].effects).toContainEqual({ kind: "SHIELD", shieldRate: 0.15, durationTurns: 2 });
    // 術者基準にすると脈動晶(95,000)の15%になってしまう。受け手基準のまま
    expect(JSON.stringify(pulse.skills[1].effects)).not.toContain("fromSourceHp");
  });

  it("シールドの割合はスイープの値がそのまま入る", () => {
    const wide = tower70Enemies(tower70With({ pulseShieldRate: 0.2 }))[2];
    expect(JSON.stringify(wide.skills)).toContain('"shieldRate":0.2');
  });
});

describe("70階の仮盤面: 段階は重なる", () => {
  it("HP70%以下で被ダメージが10%減る", () => {
    // **回復してから段階を判定する**ので、境界ぎりぎりの値では戻って外れる。
    // 段階の中へ確実に入る値で確かめること(0.65は回復後72%になり、実際に落ちた)
    const r = rig({ bossHp: Math.round(230_000 * 0.5) });
    turn(r, "E1");
    expect(r.boss.mitigateAmount).toBeCloseTo(TOWER70_TIERS.damageTakenCut, 5);
    expect(r.boss.mitigateTurns).toBeGreaterThan(0);
  });

  it("HP50%以下でHP比例の係数だけが1.2倍になる(ATK倍率は動かない)", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.35) });
    turn(r, "E1");
    const damage = r.boss.def.skills[2].effects.find((e) => e.kind === "DAMAGE") as DamageEffect;
    expect(damage.hpCoefficient).toBeCloseTo(0.05 * 1.2, 6);
    // **ATK倍率は1.2倍しない。**ここが動くと打点が仕様の倍近くになる
    expect(damage.multiplier).toBe(1.2);
  });

  it("HP比例の1.2倍は何手番経っても二度掛からない", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.35) });
    for (let i = 0; i < 5; i += 1) turn(r, "E1");
    const damage = r.boss.def.skills[2].effects.find((e) => e.kind === "DAMAGE") as DamageEffect;
    expect(damage.hpCoefficient).toBeCloseTo(0.06, 6);
  });

  it("HP30%以下で速度+35、戻れば外れる", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(35);
    r.boss.currentHp = Math.round(230_000 * 0.6);
    turn(r, "E1");
    expect(r.boss.flatStatBonus.spd).toBe(0);
  });

  it("HP30%以下では3段とも同時に効く(排他ではない)", () => {
    const r = rig({ bossHp: Math.round(230_000 * 0.15) });
    turn(r, "E1");
    const damage = r.boss.def.skills[1].effects.find((e) => e.kind === "DAMAGE") as DamageEffect;
    expect(r.boss.mitigateAmount).toBeCloseTo(0.10, 5);
    expect(damage.hpCoefficient).toBeCloseTo(0.04 * 1.2, 6);
    expect(r.boss.flatStatBonus.spd).toBe(35);
  });

  it("速度の加算はスイープの値に従う", () => {
    const scenario = buildTower70({ numbers: tower70With({ lowHpSpdBonus: 45 }) });
    const enemies = tower70Enemies(TOWER70_BASE).map(buildEnemy);
    const dummy = findMonsterById("wolf_FIRE")!;
    const engine = new BattleEngine([dummy], enemies, { rng: mulberry32(1), maxTurns: 1 });
    const probe = attachProbe(engine, scenario.hook)!;
    const boss = engine.getUnits()[1];
    boss.currentHp = Math.round(230_000 * 0.15);
    probe.beforeTurn("E1");
    probe.afterTurn("E1", []);
    expect(boss.flatStatBonus.spd).toBe(45);
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

  it("脈動晶の固有シールドは3手番ごとに、本体の最大HPの15%", () => {
    const r = rig({ bossHp: 100_000 });
    turn(r, "E3");
    turn(r, "E3");
    expect(r.boss.shieldValue).toBe(0);
    turn(r, "E3");
    expect(r.boss.shieldValue).toBe(Math.round(230_000 * 0.15));
    expect(r.boss.shieldValue).toBe(34_500);
  });

  it("シールドは重ならない(何度張っても同じ値)", () => {
    const r = rig({ bossHp: 100_000 });
    for (let i = 0; i < 9; i += 1) turn(r, "E3");
    expect(r.boss.shieldValue).toBe(34_500);
  });

  it("脈動晶が倒れていれば固有シールドは飛ばない", () => {
    const r = rig({ bossHp: 100_000 });
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
    expect(extra["シールド発動回数"]).toBeGreaterThan(0);
    expect(extra["S3使用回数"]).toBeGreaterThan(0);
  });
});

describe("本編は1つも変わっていない", () => {
  it("試練の塔70階は従来どおり古代の魔人+お供2体のまま", () => {
    const floor = TRIAL_TOWER_FLOORS[69];
    expect(floor.floor).toBe(70);
    expect(floor.name).toBe("70階 超再生");
    expect(floor.enemies).toHaveLength(3);
    expect(floor.enemies[0].templateId).toBe("ancient_demon");
    // 仮の名前が本編へ漏れていないこと
    expect(JSON.stringify(floor)).not.toContain(TOWER70_LABELS.boss);
    expect(JSON.stringify(floor)).not.toContain("始祖");
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
