import { describe, expect, it } from "vitest";
import { BattleEngine } from "../src/battle/engine.js";
import { applyStatus, applyStatEffect } from "../src/battle/unit.js";
import { computeLeveledSkill, type Skill } from "../src/core/skill.js";
import { findMonsterById, findSkillById } from "../src/data/monsters.js";
import type { MonsterDefinition } from "../src/core/monster.js";

/*
 * **2026年10月のスキル調整で、依頼主が「特に確認」と挙げた7件を実際に戦わせて見る。**
 *
 * 数字が指定どおりかは `tests/skillTuning.test.ts` が見ている。ここは
 * 「書いた効果が、戦闘で想定の回数だけ起きるか」——二重適用・無限行動・
 * 条件外の発動・多段での発動回数——を見る。
 */

function dex(id: string): MonsterDefinition {
  const found = findMonsterById(id);
  if (!found) throw new Error(`図鑑に無い: ${id}`);
  return found;
}

/** スロットのスキルを Lv を焼いた形に差し替えた個体 */
function withSkill(def: MonsterDefinition, slot: 0 | 1 | 2, skill: Skill): MonsterDefinition {
  const skills = [...def.skills] as MonsterDefinition["skills"];
  skills[slot] = skill;
  return { ...def, skills };
}

/** 硬くて倒れない的。行動はさせない */
function dummy(id = "golem_WATER"): MonsterDefinition {
  const base = dex(id);
  return { ...base, stats: { ...base.stats, hp: 10_000_000, spd: 1 } };
}

function battle(players: MonsterDefinition[], enemies: MonsterDefinition[], rng = () => 0) {
  return new BattleEngine(players, enemies, { rng });
}

describe("クロノス: 時空崩壊のゲージ100%減とスタンが二重に掛からない", () => {
  it("実行時の差し替えを撤去した後も、効果は1つずつしか持たない", () => {
    const skill = findSkillById("chronos_s3_b")!;
    for (let level = 1; level <= 5; level += 1) {
      const kinds = computeLeveledSkill(skill, level).effects.map((e) => e.kind);
      expect(kinds.filter((k) => k === "GAUGE"), `Lv${level}`).toHaveLength(1);
      expect(kinds.filter((k) => k === "STUN"), `Lv${level}`).toHaveLength(1);
    }
  });

  it("敵1体あたり、ゲージ減少とスタンの記録は1回ずつ", () => {
    const chronos = dex("chronos_GRASS");
    const engine = battle([chronos], [dummy(), dummy()]);
    const [source, ...targets] = engine.getUnits();
    source.gauge = 100;
    targets.forEach((t) => { t.gauge = 80; });
    const record = engine.resolveTurn(source, { skillIndex: 2 });
    for (const target of targets) {
      expect(target.gauge).toBe(0);
      expect(target.stunTurns).toBe(1);
    }
    const stuns = record.lines.filter((l) => l.includes("スタン"));
    expect(stuns.length).toBeLessThanOrEqual(targets.length);
  });
});

describe("アビスリーパー: 死神の収穫は多段の1撃ごとに判定し、再帰しない", () => {
  const reaper = dex("abyssreaper_GRASS");
  const harvestLines = (lines: string[]) => lines.filter((l) => l.includes("「死神の収穫」")).length;
  const hitSkill = (hits: number, target: Skill["target"] = "SINGLE_ENEMY"): Skill => ({
    id: "test_hits", name: "検査用", description: "", target, cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.1, hits }],
  });

  it.each([1, 2, 4])("%i回攻撃なら、収穫はちょうど%i回", (hits) => {
    const engine = battle([withSkill(reaper, 0, hitSkill(hits))], [dummy()]);
    const [source] = engine.getUnits();
    source.gauge = 100;
    const record = engine.resolveTurn(source, { skillIndex: 0 });
    expect(harvestLines(record.lines)).toBe(hits);
  });

  it("全体攻撃では主対象に当たった回数だけ(敵の数だけ増えない)", () => {
    const engine = battle([withSkill(reaper, 0, hitSkill(1, "ALL_ENEMIES"))], [dummy(), dummy(), dummy(), dummy()]);
    const [source] = engine.getUnits();
    source.gauge = 100;
    const record = engine.resolveTurn(source, { skillIndex: 0 });
    expect(harvestLines(record.lines)).toBe(1);
  });

  it("収穫の回数は1撃ごとの判定の結果で、失敗した撃は数えない", () => {
    // rng が常に 0.99 なら、Lv1 の発動率 50% は1回も通らない
    const engine = battle([withSkill(reaper, 0, hitSkill(4))], [dummy()], () => 0.99);
    const [source] = engine.getUnits();
    source.gauge = 100;
    const record = engine.resolveTurn(source, { skillIndex: 0 });
    expect(harvestLines(record.lines)).toBe(0);
  });
});

describe("サンダービースト: 雷獣覚醒の即時追加ターンから無限に動かない", () => {
  it("使った直後にクールタイムが入り、追加ターンで同じ技は撃てない", () => {
    const beast = dex("thunderbeast_ELECTRIC");
    expect(beast.skills[2].id).toBe("thunderbeast_s3_c");
    expect(beast.skills[2].extraTurn).toBe(true);
    const engine = battle([beast], [dummy()]);
    const [source] = engine.getUnits();
    source.gauge = 100;
    engine.resolveTurn(source, { skillIndex: 2 });
    expect(source.cooldowns[2]).toBeGreaterThan(0);
  });

  it("最後まで戦わせても、雷獣覚醒の回数はクールタイムで決まる上限を超えない", () => {
    const beast = dex("thunderbeast_ELECTRIC");
    const target = dex("golem_WATER");
    const engine = new BattleEngine([beast], [{ ...target, stats: { ...target.stats, hp: 200_000 } }], { rng: () => 0.5 });
    const result = engine.run();
    const awakenings = result.turns.filter((t) => t.lines.some((l) => l.includes("雷獣覚醒"))).length;
    const beastTurns = result.turns.filter((t) => t.actorId === engine.getUnits()[0].instanceId).length;
    // CT が 1 以上あるので、自分の手番の半分を超えて撃てることはない
    expect(awakenings).toBeLessThanOrEqual(Math.ceil(beastTurns / 2));
    expect(result.turnsTaken).toBeGreaterThan(0);
  });
});

describe("コボルト: HP50%以下の防御無視100%は、条件外では掛からない", () => {
  it("相手のHPが50%を超えていれば、防御の高い相手ほどダメージが減る", () => {
    const kobold = dex("kobold_FIRE");
    expect(kobold.skills[1].id).toBe("kobold_s2_a");
    const hit = (hpRatio: number, def: number) => {
      const target = dex("golem_WATER");
      const engine = battle([kobold], [{ ...target, stats: { ...target.stats, hp: 100_000, def } }], () => 0.99);
      const [source, enemy] = engine.getUnits();
      enemy.currentHp = Math.round(enemy.maxHp * hpRatio);
      const before = enemy.currentHp;
      source.gauge = 100;
      engine.resolveTurn(source, { skillIndex: 1 });
      return before - enemy.currentHp;
    };
    // HP60%: 防御 100 と 1000 で差が出る(防御を読んでいる)
    expect(hit(0.6, 1000)).toBeLessThan(hit(0.6, 100) * 0.8);
    // HP40%: 防御を無視するので、防御 100 と 1000 でほぼ同じ
    expect(hit(0.4, 1000)).toBeGreaterThan(hit(0.4, 100) * 0.95);
  });
});

describe("ミミック: 偽りの財宝は敵1行動につき1回", () => {
  const mimic = dex("mimic_GRASS");
  const treasureLines = (lines: string[]) => lines.filter((l) => l.includes("「偽りの財宝」でHP")).length;
  const counterLines = (lines: string[]) => lines.filter((l) => l.includes("「偽りの財宝」が")).length;

  it("4連撃を受けても、回復も反撃も1回だけ", () => {
    const attacker = withSkill(dex("wolf_FIRE"), 0, {
      id: "test_multi", name: "検査用多段", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.1, hits: 4 }],
    });
    const engine = battle([attacker], [mimic]);
    const [source, target] = engine.getUnits();
    source.gauge = 100;
    const hpBefore = source.currentHp;
    const record = engine.resolveTurn(source, { skillIndex: 0 });
    expect(treasureLines(record.lines)).toBe(1);
    expect(counterLines(record.lines)).toBe(1);
    // 反撃はミミックの最大HPの5%(Lv1)
    expect(hpBefore - source.currentHp).toBe(Math.round(target.maxHp * 0.05));
  });

  it("ミミック同士で撃ち合っても、反撃が往復しない", () => {
    const engine = battle([withSkill(mimic, 0, {
      id: "test_one", name: "検査用", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.1 }],
    })], [mimic]);
    const [source] = engine.getUnits();
    source.gauge = 100;
    const record = engine.resolveTurn(source, { skillIndex: 0 });
    expect(counterLines(record.lines)).toBe(1);
  });
});

describe("バジリスク闇: 1撃ごとにゲージ減少とスタンを判定する", () => {
  it("3回攻撃の perHit にゲージとスタンが入っている(一括判定ではない)", () => {
    const skill = findSkillById("basilisk_s3_dark")!;
    for (let level = 1; level <= 5; level += 1) {
      const damage = computeLeveledSkill(skill, level).effects[0];
      expect(damage.kind).toBe("DAMAGE");
      if (damage.kind !== "DAMAGE") continue;
      expect(damage.hits).toBe(3);
      expect(damage.perHitEffects?.map((e) => e.kind)).toEqual(["GAUGE", "STUN"]);
    }
  });

  it("全部当たれば、1体から3回ぶんゲージが減る", () => {
    const engine = battle([dex("basilisk_DARK")], [dummy()]);
    const [source, target] = engine.getUnits();
    source.gauge = 100;
    target.gauge = 100;
    engine.resolveTurn(source, { skillIndex: 2 });
    // Lv1: 1撃ごとに -30%。3回で -90%
    expect(target.gauge).toBeCloseTo(10, 5);
    expect(target.stunTurns).toBe(1);
  });
});

describe("新しく足した効果", () => {
  it("味方向けの技から敵全体へ掛ける暗闇は、敵1体に1回ずつ(味方の数だけ重ならない)", () => {
    const knight = dex("knight_LIGHT");
    expect(knight.skills[2].id).toBe("knight_s3_light");
    const ally = dex("slime_FIRE");
    const engine = battle([knight, ally, ally, ally], [dummy(), dummy()]);
    const [source] = engine.getUnits();
    source.gauge = 100;
    const record = engine.resolveTurn(source, { skillIndex: 2 });
    const blinded = record.lines.filter((l) => l.includes("暗闇")).length;
    expect(blinded).toBe(2);
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) expect(enemy.blindTurns).toBeGreaterThan(0);
  });

  it("死の宣告は、攻撃を始めた時点の強化の数で火力が上がる(同じ技の解除より前に数える)", () => {
    const reaper = dex("abyssreaper_FIRE");
    expect(reaper.skills[2].id).toBe("abyssreaper_s3_b");
    const damageWith = (buffs: number) => {
      // 相性の悪い相手だと「かすり」で解除が入らないので、同じ火属性の的を使う
      const engine = battle([reaper], [dummy("golem_FIRE")]);
      const [source, target] = engine.getUnits();
      const stats = ["atk", "def", "spd"] as const;
      for (let i = 0; i < buffs; i += 1) applyStatEffect(target, stats[i], 0.3, 3, "BUFF");
      const before = target.currentHp;
      source.gauge = 100;
      engine.resolveTurn(source, { skillIndex: 2 });
      return { dealt: before - target.currentHp, left: target.effects.filter((e) => e.kind === "BUFF").length };
    };
    const none = damageWith(0);
    const three = damageWith(3);
    // Lv1: 強化1個につき +15%。防御UPの分だけ受け手は硬くなるので、比は 1.45 より小さい
    expect(three.dealt).toBeGreaterThan(none.dealt * 1.1);
    // 撃ったあとで全部剥がす
    expect(three.left).toBe(0);
  });

  it("魂喰らいの宴は、剥がせた敵1体につき自身のゲージが進む", () => {
    const reaper = dex("abyssreaper_ELECTRIC");
    expect(reaper.skills[2].id).toBe("abyssreaper_s3_a");
    const engine = battle([reaper], [dummy(), dummy(), dummy()]);
    const [source, ...targets] = engine.getUnits();
    // 2体にだけ強化を張る
    for (const t of targets.slice(0, 2)) applyStatus(t, "ENDURE", 2, t.instanceId);
    for (const t of targets.slice(0, 2)) applyStatEffect(t, "atk", 0.3, 3, "BUFF");
    source.gauge = 100;
    engine.resolveTurn(source, { skillIndex: 2 });
    // Lv1: 1体につき +10%。剥がせたのは2体
    expect(source.gauge).toBeCloseTo(20, 5);
  });
});
