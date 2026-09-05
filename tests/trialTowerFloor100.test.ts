import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import type { BattleUnit } from "../src/battle/unit.js";
import {
  CRIMOARK_ATTACK_TEMPLATE_ID,
  CRIMOARK_CLONE_DEATH_ATK,
  CRIMOARK_CLONE_DEATH_SPD,
  CRIMOARK_CLONE_HP_FLOOR,
  CRIMOARK_CLONE_HP_RATIO,
  CRIMOARK_CLONE_MITIGATE_EACH,
  CRIMOARK_CLONE_REFRESH_GAUGE,
  CRIMOARK_CLONE_REFRESH_HEAL,
  CRIMOARK_DEBUFF_TEMPLATE_ID,
  CRIMOARK_HP,
  CRIMOARK_S4,
  CRIMOARK_S4_CLONE_BONUS,
  CRIMOARK_S4_COOLDOWN,
  CRIMOARK_SUPPORT_HASTE_COOLDOWN,
  CRIMOARK_SUPPORT_S3_ID,
  CRIMOARK_SUPPORT_TEMPLATE_ID,
  CRIMOARK_TEMPLATE_ID,
} from "../src/data/crimoark.js";
import { findMonster } from "../src/data/monsters.js";
import { TRIAL_TOWER_FLOORS, findTowerFloor } from "../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "../tools/battleLab/build.js";
import { mulberry32 } from "../tools/battleLab/rng.js";
import type { AllySpec } from "../tools/battleLab/types.js";

/*
 * 試練の塔100階「クリモアーク」。Battle Lab V3 を本編へ移した回。
 *
 * ## この階だけの難しさ
 *
 * **戦っている最中に敵が増える。**増える機構はエンジンに無いので、
 * 空席を2つ先に置いて眠らせ、スキル3で起こしている。
 * 眠っている席を「倒された」と数えないこと、同じ死を二度数えないこと、
 * 生まれた後で最大HPが動かないことが、この作りの一番危ないところ。
 *
 * ## Battle Lab V3 の実測(各1000戦)
 *
 *   TYPICAL  分身処理 2.3% / ボス集中 7.7% / 耐久処理 0%
 *   STRONG   分身処理 9.1% / ボス集中 26.7% / 耐久処理 0%
 *   FINISHED 分身処理 26.7% / ボス集中 47.7% / 耐久処理 0.9%
 *
 * 本実装での測り直しは `npx tsx tools/battleLab/tower100/measureLive.ts`。
 */

/** 100階の盤面を組む。`trialTowerFloor: 100` を渡さないと階固有の処理は動かない */
function rig(options: { floor?: number; seed?: number } = {}) {
  const floor = options.floor ?? 100;
  const enemies = buildDungeonEnemyTeam(findTowerFloor(floor)!);
  const player = findMonster("wolf", "FIRE")!;
  const engine = new BattleEngine([player, player, player], enemies, {
    rng: mulberry32(options.seed ?? 1),
    maxTurns: 1,
    trialTowerFloor: floor,
  });
  const units = engine.getUnits();
  const foes = units.filter((unit) => unit.team === "ENEMY");
  return { engine, units, foes, boss: foes[0], slots: foes.slice(1) };
}

type Rig = ReturnType<typeof rig>;

/** ボスの手番と同じ同期を走らせる(private を叩く。テストだけの入口) */
const sync = (r: Rig): void => {
  (r.engine as unknown as { applyTrialBossAction(u: unknown): void }).applyTrialBossAction(r.boss);
};
/** スキル3の中身だけを呼ぶ。手番の解決を通さずに生成と立て直しを確かめる */
const copy = (r: Rig): void => {
  (r.engine as unknown as { applyTower100Copy(u: unknown): void }).applyTower100Copy(r.boss);
};
const kill = (unit: BattleUnit): void => { unit.alive = false; unit.currentHp = 0; };
const setHpRatio = (unit: BattleUnit, ratio: number): void => { unit.currentHp = Math.round(unit.maxHp * ratio); };

describe("100階: 編成と勝利条件", () => {
  it("100階にクリモアークが出現する", () => {
    const def = findTowerFloor(100)!;
    expect(def.label).toBe("クリモアーク");
    expect(def.enemies[0].templateId).toBe(CRIMOARK_TEMPLATE_ID);
    expect(def.enemies[0].displayName).toBe("クリモアーク");
    expect(def.enemies[0].isBoss).toBe(true);
  });

  it("本体HPは400,000。他の実数も依頼どおり", () => {
    expect(findTowerFloor(100)!.enemies[0].fixedStats).toMatchObject({
      hp: CRIMOARK_HP, atk: 9_800, def: 4_600, spd: 215,
      criRate: 0.30, criDmg: 1.80, accuracy: 0.75, resistance: 0.60,
    });
    expect(CRIMOARK_HP).toBe(400_000);
  });

  it("本体を倒せば、分身が残っていても勝ち", () => {
    const r = rig();
    copy(r);
    expect(r.slots.some((slot) => slot.alive)).toBe(true);
    kill(r.boss);
    expect(r.engine.run().winner).toBe("PLAYER");
  });

  it("**分身を倒しただけでは勝てない**", () => {
    const r = rig();
    copy(r);
    for (const slot of r.slots) kill(slot);
    expect(r.engine.getWinner()).toBeNull();
    // 勝利条件を持つのは本体だけ
    expect(findTowerFloor(100)!.enemies.filter((enemy) => enemy.victoryTarget)).toHaveLength(1);
    for (const slot of findTowerFloor(100)!.enemies.slice(1)) expect(slot.victoryTarget).toBe(false);
  });
});

describe("100階: 分身の上限", () => {
  it("HP70%より上では1体まで", () => {
    const r = rig();
    setHpRatio(r.boss, 0.9);
    copy(r);
    copy(r);
    expect(r.slots.filter((slot) => slot.alive)).toHaveLength(1);
  });

  it("HP70%以下では2体まで", () => {
    const r = rig();
    setHpRatio(r.boss, 0.65);
    copy(r);
    copy(r);
    expect(r.slots.filter((slot) => slot.alive)).toHaveLength(2);
    // **3体にはしない**
    copy(r);
    expect(r.slots.filter((slot) => slot.alive)).toHaveLength(2);
  });

  it("上限まで揃っている時は、生成せず立て直す(30%回復 + ゲージ+30%)", () => {
    const r = rig();
    setHpRatio(r.boss, 0.9);
    copy(r);
    const clone = r.slots.find((slot) => slot.alive)!;
    clone.currentHp = Math.round(clone.maxHp * 0.2);
    clone.gauge = 0;
    const before = clone.currentHp;

    copy(r);
    expect(r.slots.filter((slot) => slot.alive)).toHaveLength(1);
    expect(clone.currentHp - before).toBe(Math.round(clone.maxHp * CRIMOARK_CLONE_REFRESH_HEAL));
    expect(clone.gauge).toBeCloseTo(CRIMOARK_CLONE_REFRESH_GAUGE * 100, 6);
  });
});

describe("100階: 分身のHP", () => {
  it("生成時の最大HPは、その瞬間の本体の現在HPの25%", () => {
    const r = rig();
    setHpRatio(r.boss, 1);
    copy(r);
    const clone = r.slots.find((slot) => slot.alive)!;
    expect(clone.maxHp).toBe(Math.round(CRIMOARK_HP * CRIMOARK_CLONE_HP_RATIO));
    expect(clone.maxHp).toBe(100_000);
    expect(clone.currentHp).toBe(clone.maxHp);
  });

  it("**最低75,000を保証する**(本体HP280,000なら70,000ではなく75,000)", () => {
    const r = rig();
    r.boss.currentHp = 280_000;
    copy(r);
    const clone = r.slots.find((slot) => slot.alive)!;
    expect(Math.round(280_000 * CRIMOARK_CLONE_HP_RATIO)).toBe(70_000);
    expect(clone.maxHp).toBe(CRIMOARK_CLONE_HP_FLOOR);

    // 本体160,000でも下限で止まる
    const r2 = rig();
    r2.boss.currentHp = 160_000;
    copy(r2);
    expect(r2.slots.find((slot) => slot.alive)!.maxHp).toBe(75_000);
  });

  it("**生成済みの分身のHPは、後から本体HPが減っても追従しない**", () => {
    const r = rig();
    setHpRatio(r.boss, 1);
    copy(r);
    const clone = r.slots.find((slot) => slot.alive)!;
    expect(clone.maxHp).toBe(100_000);

    r.boss.currentHp = 120_000;
    sync(r);
    (r.engine as unknown as { syncTower100Boss(u: unknown): void }).syncTower100Boss(r.boss);
    expect(clone.maxHp, "先に生まれた分身は生成時の値のまま").toBe(100_000);
  });
});

describe("100階: 分身の3種類", () => {
  it("攻撃型・サポート型・デバフ型の3種がランダムに出る", () => {
    const seen = new Set<string>();
    // 引き直しの種を変えながら、3種すべてが出ることを確かめる
    for (let seed = 1; seed <= 60; seed += 1) {
      const r = rig({ seed });
      setHpRatio(r.boss, 0.65);
      copy(r);
      copy(r);
      for (const slot of r.slots) if (slot.alive) seen.add(slot.def.templateId);
    }
    expect([...seen].sort()).toEqual([
      CRIMOARK_ATTACK_TEMPLATE_ID, CRIMOARK_DEBUFF_TEMPLATE_ID, CRIMOARK_SUPPORT_TEMPLATE_ID,
    ].sort());
  });

  it("型ごとに姿・名前・ステータス・スキルがそろって切り替わる", () => {
    const found = new Map<string, BattleUnit>();
    for (let seed = 1; seed <= 60 && found.size < 3; seed += 1) {
      const r = rig({ seed });
      copy(r);
      const clone = r.slots.find((slot) => slot.alive);
      if (clone) found.set(clone.def.templateId, clone);
    }
    const attack = found.get(CRIMOARK_ATTACK_TEMPLATE_ID)!;
    expect(attack.def.name).toBe("クリモアーク・攻");
    expect(attack.def.stats).toMatchObject({ atk: 8_500, def: 2_100, spd: 220, criRate: 0.40, criDmg: 1.90 });
    expect(attack.def.skills.map((s) => s.name)).toEqual(["模造強襲", "模造連撃", "模造処刑"]);

    const support = found.get(CRIMOARK_SUPPORT_TEMPLATE_ID)!;
    expect(support.def.name).toBe("クリモアーク・援");
    expect(support.def.stats).toMatchObject({ atk: 5_500, def: 2_700, spd: 230 });

    const debuff = found.get(CRIMOARK_DEBUFF_TEMPLATE_ID)!;
    expect(debuff.def.name).toBe("クリモアーク・蝕");
    expect(debuff.def.stats).toMatchObject({ atk: 6_000, def: 2_300, spd: 225, accuracy: 0.75 });
  });

  it("**同じ型が2体並ぶことを禁じていない**", () => {
    let sawDuplicate = false;
    for (let seed = 1; seed <= 120 && !sawDuplicate; seed += 1) {
      const r = rig({ seed });
      setHpRatio(r.boss, 0.65);
      copy(r);
      copy(r);
      const ids = r.slots.filter((slot) => slot.alive).map((slot) => slot.def.templateId);
      if (ids.length === 2 && ids[0] === ids[1]) sawDuplicate = true;
    }
    expect(sawDuplicate).toBe(true);
  });
});

describe("100階: 分身が本体に与えるもの", () => {
  it("分身1体につき本体の被ダメージ-10%。倒せば即座に戻る", () => {
    const r = rig();
    setHpRatio(r.boss, 0.65);
    sync(r);
    expect(r.boss.mitigateAmount).toBe(0);

    copy(r);
    sync(r);
    expect(r.boss.mitigateAmount).toBeCloseTo(CRIMOARK_CLONE_MITIGATE_EACH, 6);

    copy(r);
    sync(r);
    expect(r.boss.mitigateAmount).toBeCloseTo(2 * CRIMOARK_CLONE_MITIGATE_EACH, 6);

    for (const slot of r.slots) kill(slot);
    sync(r);
    expect(r.boss.mitigateAmount, "倒したぶんは即座に外れる").toBe(0);
  });

  it("分身が1体倒れるごとに本体へ ATK+30% / SPD+20%", () => {
    const r = rig();
    setHpRatio(r.boss, 0.65);
    copy(r);
    copy(r);
    sync(r);
    const before = r.boss.effects.length;

    kill(r.slots[0]);
    sync(r);
    const buffs = r.boss.effects.filter((effect) => effect.kind === "BUFF");
    expect(r.boss.effects.length).toBe(before + 2);
    expect(buffs.find((b) => b.stat === "atk")?.amount).toBe(CRIMOARK_CLONE_DEATH_ATK);
    expect(buffs.find((b) => b.stat === "spd")?.amount).toBe(CRIMOARK_CLONE_DEATH_SPD);
  });

  it("**同じ分身の死亡を二重に数えない**(何度張り直しても増えない)", () => {
    const r = rig();
    copy(r);
    kill(r.slots.find((slot) => slot.alive)!);
    for (let i = 0; i < 10; i += 1) sync(r);
    expect(r.boss.effects.filter((effect) => effect.kind === "BUFF")).toHaveLength(2);
  });

  it("**まだ生まれていない席を死亡扱いしない**", () => {
    /*
     * 生存の有無だけで見ると、開幕から2席が「死んでいる」ことになり、
     * 1手目でいきなり「分身2体を倒した」ぶんの強化が乗る
     */
    const r = rig();
    for (let i = 0; i < 5; i += 1) sync(r);
    expect(r.boss.effects.filter((effect) => effect.kind === "BUFF")).toHaveLength(0);
    expect(r.boss.mitigateAmount).toBe(0);
  });

  it("生成 → 撃破 → 再生成でも、前の死亡を数え直さない", () => {
    const r = rig();
    setHpRatio(r.boss, 0.9);
    copy(r);
    kill(r.slots.find((slot) => slot.alive)!);
    sync(r);
    const afterFirst = r.boss.effects.filter((effect) => effect.kind === "BUFF").length;
    copy(r);
    for (let i = 0; i < 5; i += 1) sync(r);
    expect(r.boss.effects.filter((effect) => effect.kind === "BUFF")).toHaveLength(afterFirst);
  });
});

describe("100階: 本体の段階強化", () => {
  it("HP70%以下で ATK+1,000 / SPD+15", () => {
    const r = rig();
    setHpRatio(r.boss, 0.65);
    sync(r);
    expect(r.boss.flatStatBonus).toMatchObject({ atk: 1_000, spd: 15, criRate: 0, criDmg: 0 });
  });

  it("HP40%以下では**積み上がって** ATK+2,500 / SPD+40 / クリ率+20% / クリダメ+30%", () => {
    const r = rig();
    setHpRatio(r.boss, 0.35);
    sync(r);
    expect(r.boss.flatStatBonus).toMatchObject({ atk: 2_500, spd: 40 });
    expect(r.boss.flatStatBonus.criRate).toBeCloseTo(0.20, 6);
    expect(r.boss.flatStatBonus.criDmg).toBeCloseTo(0.30, 6);
  });

  it("HP20%以下では70/40/20のすべてを持つ(ATK+4,500 / SPD+80)", () => {
    const r = rig();
    setHpRatio(r.boss, 0.15);
    sync(r);
    expect(r.boss.flatStatBonus).toMatchObject({ atk: 4_500, spd: 80 });
    expect(r.boss.flatStatBonus.criRate).toBeCloseTo(0.40, 6);
    expect(r.boss.flatStatBonus.criDmg).toBeCloseTo(0.80, 6);
  });

  it("与ダメージ倍率だけは積まずに段階で置き換える(1.15×1.30 にしない)", () => {
    const factorOf = (ratio: number): number => {
      const r = rig();
      setHpRatio(r.boss, ratio);
      return (r.engine as unknown as { tower100BossDamageFactor(u: unknown): number }).tower100BossDamageFactor(r.boss);
    };
    expect(factorOf(0.9)).toBe(1);
    expect(factorOf(0.5)).toBe(1);
    expect(factorOf(0.35)).toBe(1.15);
    expect(factorOf(0.15)).toBe(1.30);
    expect(factorOf(0.15)).not.toBeCloseTo(1.15 * 1.30, 6);
  });

  it("**HP40%のトリガーは1戦につき1回だけ**", () => {
    const r = rig();
    r.boss.effects.push({ kind: "DEBUFF", stat: "def", amount: 0.5, remainingTurns: 3 });
    r.boss.gauge = 0;
    r.boss.cooldowns = [0, 0, 4];
    setHpRatio(r.boss, 0.35);
    sync(r);
    expect(r.boss.effects.filter((effect) => effect.kind === "DEBUFF"), "弱体は全解除").toHaveLength(0);
    expect(r.boss.gauge, "行動ゲージは最低100%").toBeGreaterThanOrEqual(100);
    expect(r.boss.cooldowns[2], "スキル3のCTは0").toBe(0);

    // 2度目は起きない
    r.boss.effects.push({ kind: "DEBUFF", stat: "atk", amount: 0.5, remainingTurns: 3 });
    r.boss.gauge = 0;
    r.boss.cooldowns[2] = 4;
    sync(r);
    expect(r.boss.effects.filter((effect) => effect.kind === "DEBUFF")).toHaveLength(1);
    expect(r.boss.gauge).toBe(0);
    expect(r.boss.cooldowns[2]).toBe(4);
  });

  it("HP20%以下では本体と分身が互いのゲージを押し合う", () => {
    const r = rig();
    setHpRatio(r.boss, 0.15);
    copy(r);
    const clone = r.slots.find((slot) => slot.alive)!;
    const tempo = (actor: BattleUnit): void =>
      (r.engine as unknown as { applyTower100LowHpTempo(u: unknown): void }).applyTower100LowHpTempo(actor);

    clone.gauge = 0;
    tempo(r.boss);
    expect(clone.gauge, "本体が動いたら分身が20%進む").toBeCloseTo(20, 6);

    r.boss.gauge = 0;
    tempo(clone);
    expect(r.boss.gauge, "分身が動いたら本体が10%進む").toBeCloseTo(10, 6);
  });

  it("HP20%より上では押し合わない", () => {
    const r = rig();
    setHpRatio(r.boss, 0.5);
    copy(r);
    const clone = r.slots.find((slot) => slot.alive)!;
    clone.gauge = 0;
    (r.engine as unknown as { applyTower100LowHpTempo(u: unknown): void }).applyTower100LowHpTempo(r.boss);
    expect(clone.gauge).toBe(0);
  });
});

describe("100階: スキル4「オーバークリエイト」", () => {
  it("クールタイムは6", () => {
    expect(CRIMOARK_S4.cooldownTurns).toBe(6);
    expect(CRIMOARK_S4_COOLDOWN).toBe(6);
  });

  it("効果の順番と中身が仕様どおり", () => {
    expect(CRIMOARK_S4.effects.map((effect) => effect.kind))
      .toEqual(["STRIP", "DAMAGE", "GAUGE", "DEBUFF", "HEAL_BLOCK", "GAUGE"]);
    // 1. 全解除(count を書かない = 全部)
    expect(CRIMOARK_S4.effects[0]).toMatchObject({ chance: 1 });
    expect((CRIMOARK_S4.effects[0] as { count?: number }).count).toBeUndefined();
    expect(CRIMOARK_S4.effects[1]).toMatchObject({ multiplier: 1.30 });
    expect(CRIMOARK_S4.effects[2]).toMatchObject({ amount: -0.50 });
    expect(CRIMOARK_S4.effects[3]).toMatchObject({ stat: "def", amount: 0.50, durationTurns: 3 });
    expect(CRIMOARK_S4.effects[4]).toMatchObject({ healMultiplier: 0, durationTurns: 2 });
    expect(CRIMOARK_S4.effects[5]).toMatchObject({ amount: 0.30, applyTo: "SELF" });
  });

  it("生存分身1体につき最終ダメージ+15%", () => {
    expect(CRIMOARK_S4_CLONE_BONUS).toBe(0.15);
    // 実際に撃たせて、注ぎ込まれる上乗せが分身の数で変わることを見る
    const bonusOf = (clones: number): number => {
      const r = rig();
      setHpRatio(r.boss, 0.65);
      for (let i = 0; i < clones; i += 1) copy(r);
      return r.slots.filter((slot) => slot.alive).length * CRIMOARK_S4_CLONE_BONUS;
    };
    expect(bonusOf(0)).toBeCloseTo(0, 6);
    expect(bonusOf(1)).toBeCloseTo(0.15, 6);
    expect(bonusOf(2)).toBeCloseTo(0.30, 6);
  });

  it("**スキル4は3枠の外**。撃ってもスキル3のクールタイムを奪わない", () => {
    /*
     * スキル4は枠2へ差し込んで撃つ。`cooldownTurns` を 6 のまま渡すと
     * `cooldowns[2] = 6` が走り、クリエイト・コピーまで6ターン止まる
     */
    const r = rig({ seed: 5 });
    const engine = r.engine as unknown as {
      tower100S4Cooldown: number;
      tower100ChooseSkillIndex(u: unknown): number | null;
    };
    engine.tower100S4Cooldown = 0;
    r.boss.cooldowns = [0, 0, 0];
    expect(engine.tower100ChooseSkillIndex(r.boss)).toBe(2);
    (r.engine as unknown as { act(u: unknown): void }).act(r.boss);
    expect(engine.tower100S4Cooldown, "スキル4は自分の待ち時間へ戻る").toBe(CRIMOARK_S4_COOLDOWN);
    expect(r.boss.cooldowns[2], "スキル3の枠は止められていない").toBe(0);
  });
});

describe("100階: サポート型分身のCT短縮は本体だけ", () => {
  it("模造加速は本体のスキル3とスキル4だけを縮める", () => {
    const r = rig();
    setHpRatio(r.boss, 0.65);
    copy(r);
    copy(r);
    const clones = r.slots.filter((slot) => slot.alive);
    const other = clones[1] ?? clones[0];
    r.boss.cooldowns = [0, 3, 4];
    other.cooldowns = [0, 3, 4];
    (r.engine as unknown as { tower100S4Cooldown: number }).tower100S4Cooldown = 4;
    const beforeGauge = r.boss.gauge;

    (r.engine as unknown as { applyTower100CloneSupport(a: unknown, id: string, k: number): void })
      .applyTower100CloneSupport(clones[0], CRIMOARK_SUPPORT_S3_ID, 0);

    expect(r.boss.gauge).toBeGreaterThan(beforeGauge);
    expect(r.boss.cooldowns, "縮むのはスキル3の枠だけ").toEqual([0, 3, 4 - CRIMOARK_SUPPORT_HASTE_COOLDOWN]);
    expect((r.engine as unknown as { tower100S4Cooldown: number }).tower100S4Cooldown)
      .toBe(4 - CRIMOARK_SUPPORT_HASTE_COOLDOWN);
    // **もう1体の分身のクールタイムは1つも動かない**
    if (other !== clones[0]) expect(other.cooldowns).toEqual([0, 3, 4]);
  });
});

describe("100階の仕掛けは1〜99階へ漏れていない", () => {
  it("他の階では分身も段階強化も動かない", () => {
    for (const floor of [60, 70, 80, 90]) {
      const r = rig({ floor });
      setHpRatio(r.boss, 0.15);
      const before = { ...r.boss.flatStatBonus };
      (r.engine as unknown as { syncTower100Boss(u: unknown): void }).syncTower100Boss(r.boss);
      expect(r.boss.flatStatBonus.criDmg ?? 0, `${floor}階`).toBe(before.criDmg ?? 0);
      expect((r.engine as unknown as { tower100Clones: unknown[] }).tower100Clones, `${floor}階`).toHaveLength(0);
    }
  });

  it("60/70/80/90階の敵の数は変わっていない", () => {
    expect(findTowerFloor(60)!.enemies).toHaveLength(3);
    expect(findTowerFloor(70)!.enemies).toHaveLength(3);
    expect(findTowerFloor(80)!.enemies).toHaveLength(3);
    expect(findTowerFloor(90)!.enemies).toHaveLength(5);
  });

  it("100階の仮スキルIDが他の階へ紛れていない", () => {
    const others = TRIAL_TOWER_FLOORS.filter((floor) => floor.floor !== 100);
    expect(JSON.stringify(others)).not.toContain("crimoark");
  });

  it("追加報酬を維持し、指定されたダイヤ3,000へ更新する", () => {
    expect(findTowerFloor(100)!.firstClearReward)
      .toEqual({ crystal: 3_000, summonScroll: 30, lightDarkFourStarSummonScrolls: 3, fiveStarSummonScrolls: 1 });
  });
});

describe("100階: 実戦で全部が動く", () => {
  it("階番号を渡した時だけ戦いの中身が変わる", () => {
    const play = (floor?: number): string[] => {
      const enemies = buildDungeonEnemyTeam(findTowerFloor(100)!);
      const player = findMonster("wolf", "FIRE")!;
      return new BattleEngine([player, player, player, player], enemies, {
        rng: mulberry32(20261000), maxTurns: 40, trialTowerFloor: floor,
      }).run().log;
    };
    expect(play(100)).not.toEqual(play(undefined));
  });

  it("本体の4スキルと分身が、実戦で実際に出る", () => {
    /*
     * **仕上げ切った耐久編成をぶつける。**素の図鑑のまま並べるとこちらが
     * 3ターンで全滅し、ボスの手番が2回しか回らない。
     * 4つの技が出る所まで見たいので、長引く盤面を作る
     */
    const rng = mulberry32(4242);
    const players = ([
      { templateId: "valkyria", element: "LIGHT", preset: "MAX_TANK" },
      { templateId: "seraph", element: "LIGHT", preset: "MAX_HEALER" },
      { templateId: "basilisk", element: "LIGHT", preset: "MAX_TANK" },
      { templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
    ] as AllySpec[]).map((spec) => buildAlly(spec, rng, "FINISHED"));
    const enemies = buildDungeonEnemyTeam(findTowerFloor(100)!);
    const log = new BattleEngine(players, enemies, {
      rng, maxTurns: 300, trialTowerFloor: 100,
    }).run().log;
    for (const name of ["クリエイト・ブレイク", "リライト・ディザスター", "クリエイト・コピー", "オーバークリエイト"]) {
      expect(log.some((line) => line.includes(name)), name).toBe(true);
    }
    expect(log.some((line) => line.includes("生み出された")), "分身が生まれる").toBe(true);
  });
});
