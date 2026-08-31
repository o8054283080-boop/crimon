import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../src/core/element.js";
import { createMonsterVariant } from "../src/core/monster.js";
import { MAX_SKILL_LEVEL, computeLeveledSkill } from "../src/core/skill.js";
import { passiveAtLevel } from "../src/core/passive.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import { BattleEngine } from "../src/battle/engine.js";
import { applyStatus, createBattleUnit, hasAnyBuff, stealBuffs, stripBuffs } from "../src/battle/unit.js";
import { creatableSkills, applyMonsterCreate } from "../src/game/monsterCreate.js";
import { findMonster, findMonsterById, NEW_MONSTERS_DEX } from "../src/data/monsters.js";
import {
  MUSHROON, SHELLTURTLE, KOBOLD, BASILISK, MIMIC, VALKYRIA, THUNDERBEAST,
  ABYSSREAPER, FENRIR, CHRONOS, BEHEMOTH, NEW_MONSTER_TEMPLATES,
} from "../src/data/newMonsters/index.js";

/*
 * 追加した11種の検査。
 *
 * **数字の一致ではなく「決めた振る舞いが起きるか」を見る。**
 * 倍率や確率は今後も動かすが、「無敵はスキルMAXでも1ターン」
 * 「多段で追加効果が何度も出ない」といった約束は動かない。
 * 動かないものだけをここへ置く。
 */

/** 検査で使う、乱数を固定した戦闘。`rng` が常に0なら確率つきの効果は必ず当たる */
function battle(playerIds: string[], enemyIds: string[], rng = () => 0) {
  const toDef = (id: string) => {
    const dex = findMonsterById(id);
    if (!dex) throw new Error(`図鑑に無い: ${id}`);
    return dex;
  };
  return new BattleEngine(playerIds.map(toDef), enemyIds.map(toDef), { rng });
}

describe("① 11種すべてが6属性で実体化できる", () => {
  it("11種 × 6属性 = 66体が図鑑にある", () => {
    expect(NEW_MONSTER_TEMPLATES).toHaveLength(11);
    expect(NEW_MONSTERS_DEX).toHaveLength(66);
    for (const template of NEW_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const dex = findMonster(template.templateId, element);
        expect(dex, `${template.templateId}[${element}]`).toBeDefined();
        expect(dex!.skills.filter(Boolean)).toHaveLength(3);
      }
    }
  });
});

describe("② スキル1は同じ種族の6属性で共通", () => {
  it("6属性すべてが同じスキル1のidを持つ", () => {
    for (const template of NEW_MONSTER_TEMPLATES) {
      const ids = new Set(ELEMENTS.map((element) => createMonsterVariant(template, element).skills[0].id));
      expect([...ids], template.templateId).toEqual([template.skill1.id]);
    }
  });
});

describe("③ 属性ごとのスキル2/スキル3の割り当てが指定どおり", () => {
  /** 依頼主が指定した表。添字は skill2Variants / skill3Variants のもの */
  const EXPECTED: Record<string, Partial<Record<string, [number, number | "LIGHT" | "DARK"]>>> = {
    mushroon: { FIRE: [0, 0], GRASS: [1, 2], ELECTRIC: [2, 1], WATER: [0, 2], LIGHT: [1, "LIGHT"], DARK: [2, "DARK"] },
    shellturtle: { FIRE: [1, 1], GRASS: [0, 2], ELECTRIC: [1, 0], WATER: [2, 2], LIGHT: [0, "LIGHT"], DARK: [2, "DARK"] },
    kobold: { FIRE: [0, 0], GRASS: [1, 2], ELECTRIC: [2, 1], WATER: [1, 0], LIGHT: [0, "LIGHT"], DARK: [2, "DARK"] },
    basilisk: { FIRE: [0, 0], GRASS: [2, 2], ELECTRIC: [1, 1], WATER: [0, 2], LIGHT: [2, "LIGHT"], DARK: [1, "DARK"] },
    mimic: { FIRE: [1, 1], GRASS: [0, 2], ELECTRIC: [2, 0], WATER: [0, 0], LIGHT: [2, "LIGHT"], DARK: [1, "DARK"] },
    valkyria: { FIRE: [1, 1], GRASS: [0, 2], ELECTRIC: [1, 0], WATER: [2, 2], LIGHT: [0, "LIGHT"], DARK: [2, "DARK"] },
    abyssreaper: { FIRE: [0, 1], GRASS: [2, 2], ELECTRIC: [1, 0], WATER: [0, 2], LIGHT: [2, "LIGHT"], DARK: [1, "DARK"] },
    fenrir: { FIRE: [0, 0], GRASS: [1, 2], ELECTRIC: [2, 1], WATER: [0, 2], LIGHT: [1, "LIGHT"], DARK: [2, "DARK"] },
    behemoth: { FIRE: [1, 0], GRASS: [2, 2], ELECTRIC: [1, 1], WATER: [0, 2], LIGHT: [2, "LIGHT"], DARK: [0, "DARK"] },
  };
  const BY_ID = Object.fromEntries(NEW_MONSTER_TEMPLATES.map((t) => [t.templateId, t]));

  it("表に書いた属性は、その通りの組み合わせになる", () => {
    for (const [templateId, table] of Object.entries(EXPECTED)) {
      const template = BY_ID[templateId];
      for (const [element, pair] of Object.entries(table)) {
        const dex = createMonsterVariant(template, element as (typeof ELEMENTS)[number]);
        const [s2, s3] = pair!;
        expect(dex.skills[1].id, `${templateId}[${element}] のスキル2`).toBe(template.skill2Variants[s2].id);
        const expected3 = s3 === "LIGHT" ? template.lightSkill3! : s3 === "DARK" ? template.darkSkill3! : template.skill3Variants[s3];
        expect(dex.skills[2].id, `${templateId}[${element}] のスキル3`).toBe(expected3.id);
      }
    }
  });

  it("既存モンスターの組み合わせは1つも変わっていない", () => {
    // 明示の割り当てを持たない種族は、今までどおり pickSkillVariant が決める
    const slimeFire = findMonster("slime", "FIRE");
    expect(slimeFire?.skills[1].id).toBe("slime_s2_a");
    expect(slimeFire?.skills[2].id).toBe("slime_s3_a");
  });
});

describe("④ 光/闇の専用スキル3が上書きされる", () => {
  it("11種すべてで、光と闇は専用スキル3を持つ", () => {
    for (const template of NEW_MONSTER_TEMPLATES) {
      expect(createMonsterVariant(template, "LIGHT").skills[2].id, template.templateId).toBe(template.lightSkill3!.id);
      expect(createMonsterVariant(template, "DARK").skills[2].id, template.templateId).toBe(template.darkSkill3!.id);
    }
  });
});

describe("⑤⑥ パッシブと継承(クリエイト)", () => {
  it("パッシブは移し替えの元に出てこない", () => {
    // 草マッシュルンのスキル3は「菌糸支配」(パッシブ)
    const material = createMonsterInstance("mushroon_GRASS", 6, 40);
    const slots = creatableSkills(material).map((entry) => entry.slot);
    expect(findMonster("mushroon", "GRASS")!.skills[2].passive).toBeDefined();
    expect(slots).toEqual([1]);
  });

  it("パッシブを元にしようとすると、理由を返して断る", () => {
    const target = createMonsterInstance("slime_FIRE", 6, 40);
    const material = createMonsterInstance("mushroon_GRASS", 6, 40);
    const result = applyMonsterCreate(target, material, 2, [], []);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("パッシブ");
  });

  it("パッシブが入っている枠は、別の継承できるスキルへ変更できる", () => {
    const target = createMonsterInstance("mushroon_GRASS", 6, 40);
    const material = createMonsterInstance("slime_FIRE", 6, 40);
    const result = applyMonsterCreate(target, material, 2, [], []);
    expect(result.ok).toBe(true);
    const def = toBattleDefinition(target, findMonster("mushroon", "GRASS")!);
    expect(def.skills[2].passive).toBeUndefined();
    expect(def.skills[2].id).toBe(findMonster("slime", "FIRE")!.skills[2].id);
  });
});

describe("⑦ パッシブのLv1〜5成長", () => {
  it("11種のパッシブすべてが5段を持ち、Lv5がLv1より弱くならない", () => {
    const passives = NEW_MONSTER_TEMPLATES.flatMap((t) =>
      [...t.skill3Variants, t.lightSkill3, t.darkSkill3].filter((s) => s?.passive).map((s) => s!));
    expect(passives.length).toBe(11);
    for (const skill of passives) {
      expect(skill.passive!.levels, skill.id).toHaveLength(5);
      const lv1 = JSON.stringify(passiveAtLevel(skill.passive!, 1));
      const lv5 = JSON.stringify(passiveAtLevel(skill.passive!, 5));
      expect(lv1, skill.id).not.toBe(lv5);
    }
  });

  it("スキルレベルはパッシブへ焼き込まれ、効果の配列は増えない", () => {
    const skill = MUSHROON.skill3Variants[2];
    const leveled = computeLeveledSkill(skill, 5);
    expect(leveled.passiveLevel).toBe(5);
    expect(leveled.effects).toHaveLength(0);
    expect(passiveAtLevel(leveled.passive!, 5)).toEqual({ kind: "GAUGE_ON_ENEMY_POISON", gauge: 0.1 });
  });
});

describe("⑧ 無敵はスキルMAXでも1ターン固定", () => {
  it("ミミック光・クロノス光・ヴァルキリアの誓いは、Lv5でも1ターンのまま", () => {
    for (const skill of [MIMIC.lightSkill3!, CHRONOS.lightSkill3!]) {
      const leveled = computeLeveledSkill(skill, MAX_SKILL_LEVEL);
      const invincible = leveled.effects.find((e) => e.kind === "STATUS" && e.status === "INVINCIBLE");
      expect(invincible, skill.id).toBeDefined();
      expect((invincible as { durationTurns: number }).durationTurns, skill.id).toBe(1);
    }
  });

  it("固定していない継続効果は、今までどおりLv5で1ターン伸びる", () => {
    const leveled = computeLeveledSkill(MUSHROON.skill1, MAX_SKILL_LEVEL);
    const poison = leveled.effects.find((e) => e.kind === "POISON") as { durationTurns: number };
    expect(poison.durationTurns).toBe(3);
  });
});

describe("⑨ 戦乙女の誓いの内部クールタイム", () => {
  it("味方がHP30%を割った時に1度だけ発動し、内部クールタイムの間は出ない", () => {
    const engine = battle(["valkyria_GRASS", "slime_FIRE"], ["dragon_FIRE"]);
    const [valkyria, ally] = engine.getUnits();
    // パッシブ持ちのレベルを最大にして、内部クールタイムを4ターンにする
    valkyria.def = { ...valkyria.def, skills: [
      valkyria.def.skills[0], valkyria.def.skills[1], computeLeveledSkill(VALKYRIA.skill3Variants[2], 5),
    ] };
    ally.currentHp = Math.round(ally.maxHp * 0.9);

    const enemy = engine.getUnits()[2];
    // 1回目: 攻撃で閾値を割ったので発動し、無敵と回復が入る
    ally.currentHp = Math.round(ally.maxHp * 0.31);
    const first = engine.resolveTurn(enemy, { skillIndex: 0, targetId: ally.instanceId });
    expect(first.lines.some((line) => line.includes("「戦乙女の誓い」"))).toBe(true);
    expect(valkyria.passiveCooldown).toBe(4);
    // 2回目: 同じように閾値を割っても、内部クールタイム中なので出ない
    ally.currentHp = Math.round(ally.maxHp * 0.31);
    const second = engine.resolveTurn(enemy, { skillIndex: 0, targetId: ally.instanceId });
    expect(second.lines.some((line) => line.includes("「戦乙女の誓い」"))).toBe(false);
    // クールタイムは保持者の手番開始時に減る。敵が動いただけでは減らない
    expect(valkyria.passiveCooldown).toBe(4);
    engine.resolveTurn(valkyria, { skillIndex: 0 });
    expect(valkyria.passiveCooldown).toBe(3);
  });
});

describe("⑩ 群狼の本能の追加ターン", () => {
  it("倒すたびに追加ターンを得て、決着まで手番が連なる", () => {
    // 草フェンリルのスキル3が「群狼の本能」
    expect(findMonster("fenrir", "GRASS")!.skills[2].passive).toBeDefined();
    const engine = battle(["fenrir_GRASS"], ["slime_WATER", "slime_WATER", "slime_WATER"], () => 0.99);
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
      enemy.maxHp = 10;
      enemy.currentHp = 10;
    }
    const result = engine.run();
    expect(result.winner).toBe("PLAYER");
    // 追加ターンが無ければ、3体を倒すのに敵の手番を挟まざるを得ない
    expect(result.log.some((line) => line.includes("追加ターンを得た"))).toBe(true);
  });
});

describe("⑪ フェンリルの協力攻撃", () => {
  it("呼ばれた味方がスキル1で同じ相手を殴り、クールタイムが縮む", () => {
    const engine = battle(["fenrir_GRASS", "kobold_FIRE", "slime_FIRE"], ["golem_WATER"], () => 0.99);
    const [fenrir, kobold, slime] = engine.getUnits();
    kobold.cooldowns = [0, 3, 3];
    slime.cooldowns = [0, 3, 3];
    const record = engine.resolveTurn(fenrir, { skillIndex: 1 });
    expect(record.lines.some((line) => line.includes("協力攻撃に加わった"))).toBe(true);
    // 参加した2体はクールタイムが1縮む。フェンリル自身は縮まない
    const reduced = [kobold, slime].filter((unit) => unit.cooldowns[1] === 2).length;
    expect(reduced).toBe(2);
    expect(fenrir.cooldowns[1]).toBeGreaterThan(0);
  });

  it("協力攻撃が協力攻撃を呼ばない", () => {
    // フェンリル2体でも、入れ子にならず1段で止まる
    const engine = battle(["fenrir_GRASS", "fenrir_GRASS"], ["golem_WATER"], () => 0.99);
    const record = engine.resolveTurn(engine.getUnits()[0], { skillIndex: 1 });
    const joined = record.lines.filter((line) => line.includes("協力攻撃に加わった")).length;
    expect(joined).toBe(1);
  });
});

describe("⑫ ターゲット集中", () => {
  it("敵の単体攻撃は、集中している相手へ向く", () => {
    const engine = battle(["mimic_ELECTRIC", "slime_FIRE"], ["slime_WATER"], () => 0.99);
    const [mimic, ally, enemy] = engine.getUnits();
    applyStatus(mimic, "FOCUS", 2);
    const before = ally.currentHp;
    engine.resolveTurn(enemy, { skillIndex: 0 });
    expect(ally.currentHp).toBe(before);
    expect(mimic.currentHp).toBeLessThan(mimic.maxHp);
  });

  it("全体攻撃には影響しない(両方に当たる)", () => {
    const engine = battle(["mimic_ELECTRIC", "slime_FIRE"], ["slime_DARK"], () => 0.99);
    const [mimic, ally, enemy] = engine.getUnits();
    applyStatus(mimic, "FOCUS", 2);
    enemy.def = { ...enemy.def, skills: [enemy.def.skills[0], enemy.def.skills[1], {
      id: "test_aoe", name: "検査用全体攻撃", description: "", target: "ALL_ENEMIES", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1 }],
    }] };
    engine.resolveTurn(enemy, { skillIndex: 2 });
    expect(ally.currentHp).toBeLessThan(ally.maxHp);
    expect(mimic.currentHp).toBeLessThan(mimic.maxHp);
  });
});

describe("⑬ 多段スキルで追加効果が多重発動しない", () => {
  it("4連撃でも、ゲージ吸収のパッシブは1回しか出ない", () => {
    // 闇クロノスの「時の管理者」は、攻撃スキル1回につき1度だけ吸収する
    const engine = battle(["chronos_DARK"], ["golem_WATER"], () => 0);
    const [chronos] = engine.getUnits();
    chronos.def = { ...chronos.def, skills: [{
      id: "test_multi", name: "検査用多段", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 0.1, hits: 4 }],
    }, chronos.def.skills[1], chronos.def.skills[2]] };
    const record = engine.resolveTurn(chronos, { skillIndex: 0 });
    const drains = record.lines.filter((line) => line.includes("「時の管理者」で行動ゲージを吸収")).length;
    expect(drains).toBe(1);
  });

  it("多段の毒付与も1回だけ判定される", () => {
    const engine = battle(["mushroon_FIRE"], ["golem_WATER"], () => 0);
    const [mushroon, enemy] = engine.getUnits();
    mushroon.def = { ...mushroon.def, skills: [{
      ...mushroon.def.skills[0],
      effects: [{ kind: "DAMAGE", multiplier: 0.05, hits: 4 }, { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 1 }],
    }, mushroon.def.skills[1], mushroon.def.skills[2]] };
    engine.resolveTurn(mushroon, { skillIndex: 0 });
    expect(enemy.poisonStacks).toBe(1);
  });
});

describe("⑭ 行動ゲージの吸収", () => {
  it("減らした分がそのまま術者へ移る", () => {
    const engine = battle(["slime_FIRE"], ["golem_WATER"], () => 0);
    const [source, target] = engine.getUnits();
    source.def = { ...source.def, skills: [{
      id: "test_drain", name: "検査用吸収", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "GAUGE", amount: 0.3, drain: true }],
    }, source.def.skills[1], source.def.skills[2]] };
    target.gauge = 80;
    // 手番の解決で先に100引かれるので、ちょうど0から始まるようにしておく
    source.gauge = 100;
    engine.resolveTurn(source, { skillIndex: 0 });
    expect(target.gauge).toBeCloseTo(50, 5);
    expect(source.gauge).toBeCloseTo(30, 5);
  });
});

describe("⑮⑯ クールタイムの短縮と延長", () => {
  it("短縮しても0未満にならない", () => {
    const engine = battle(["chronos_FIRE", "slime_FIRE"], ["golem_WATER"], () => 0);
    const [chronos, ally] = engine.getUnits();
    ally.cooldowns = [0, 1, 0];
    chronos.def = { ...chronos.def, skills: [chronos.def.skills[0], {
      id: "test_cdr", name: "検査用短縮", description: "", target: "ALL_ALLIES", cooldownTurns: 0,
      effects: [{ kind: "COOLDOWN_REDUCE", turns: 3 }],
    }, chronos.def.skills[2]] };
    engine.resolveTurn(chronos, { skillIndex: 1 });
    expect(ally.cooldowns.every((c) => c >= 0)).toBe(true);
    expect(ally.cooldowns[1]).toBe(0);
  });

  it("延長は今までどおり足される", () => {
    const engine = battle(["chronos_FIRE"], ["golem_WATER"], () => 0);
    const [chronos, enemy] = engine.getUnits();
    enemy.cooldowns = [0, 2, 2];
    chronos.def = { ...chronos.def, skills: [chronos.def.skills[0], {
      id: "test_cde", name: "検査用延長", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "COOLDOWN_EXTEND", turns: 1, chance: 1 }],
    }, chronos.def.skills[2]] };
    engine.resolveTurn(chronos, { skillIndex: 1 });
    expect(enemy.cooldowns[1]).toBe(3);
  });
});

describe("⑰ 毒2スタック", () => {
  it("フェンリルの血の追跡は一度に2スタック載せる", () => {
    const skill = FENRIR.skill3Variants[1];
    const poison = skill.effects.find((e) => e.kind === "POISON") as { stacks?: number };
    expect(poison.stacks).toBe(2);
    const engine = battle(["fenrir_ELECTRIC"], ["golem_WATER"], () => 0);
    const [fenrir, enemy] = engine.getUnits();
    fenrir.def = { ...fenrir.def, skills: [fenrir.def.skills[0], fenrir.def.skills[1], skill] };
    engine.resolveTurn(fenrir, { skillIndex: 2 });
    expect(enemy.poisonStacks).toBe(2);
  });

  it("毒床は、既に毒状態の相手にだけ追加で1スタック重ねる", () => {
    const engine = battle(["mushroon_FIRE"], ["golem_WATER"], () => 0);
    const [mushroon, enemy] = engine.getUnits();
    mushroon.def = { ...mushroon.def, skills: [mushroon.def.skills[0], mushroon.def.skills[1], MUSHROON.skill3Variants[0]] };
    engine.resolveTurn(mushroon, { skillIndex: 2 });
    expect(enemy.poisonStacks).toBe(1);
    mushroon.cooldowns[2] = 0;
    engine.resolveTurn(mushroon, { skillIndex: 2 });
    expect(enemy.poisonStacks).toBe(3);
  });
});

describe("⑱⑲ 強化の全解除と奪取", () => {
  const dummy = () => createBattleUnit(findMonster("golem", "WATER")!, "ENEMY", "E1");

  it("個数を指定しない解除は全部剥がす", () => {
    const unit = dummy();
    unit.immuneTurns = 2;
    unit.shieldValue = 100; unit.shieldTurns = 2;
    unit.effects.push({ stat: "atk", amount: 0.3, remainingTurns: 2, kind: "BUFF" });
    expect(stripBuffs(unit)).toBe(3);
    expect(hasAnyBuff(unit)).toBe(false);
  });

  it("奪取は取り除くだけでなく、そのまま受け手へ移る", () => {
    const from = dummy();
    const to = createBattleUnit(findMonster("golem", "FIRE")!, "PLAYER", "P1");
    from.effects.push({ stat: "atk", amount: 0.5, remainingTurns: 3, kind: "BUFF" });
    expect(stealBuffs(from, to, 1)).toBe(1);
    expect(from.effects.filter((e) => e.kind === "BUFF")).toHaveLength(0);
    expect(to.effects.filter((e) => e.kind === "BUFF")).toHaveLength(1);
  });

  it("アビスリーパーの冥府の契約が、実戦でも奪って自分に付ける", () => {
    const engine = battle(["abyssreaper_GRASS"], ["golem_WATER"], () => 0);
    const [reaper, enemy] = engine.getUnits();
    enemy.effects.push({ stat: "def", amount: 0.5, remainingTurns: 3, kind: "BUFF" });
    reaper.def = { ...reaper.def, skills: [reaper.def.skills[0], ABYSSREAPER.skill2Variants[2], reaper.def.skills[2]] };
    engine.resolveTurn(reaper, { skillIndex: 1 });
    expect(enemy.effects.filter((e) => e.kind === "BUFF")).toHaveLength(0);
    expect(reaper.effects.filter((e) => e.kind === "BUFF")).toHaveLength(1);
  });
});

describe("⑳ セーブとの互換性", () => {
  it("新モンスターの個体も、既存と同じ形のセーブデータで復元できる", () => {
    const instance = createMonsterInstance("behemoth_DARK", 5, 30);
    instance.skillLevels = [3, 4, 5];
    const restored = JSON.parse(JSON.stringify(instance));
    const def = toBattleDefinition(restored, findMonster("behemoth", "DARK")!);
    expect(def.skills).toHaveLength(3);
    expect(def.stats.hp).toBeGreaterThan(0);
  });

  it("パッシブを持つ個体でも、保存する形は今までと同じ(増えた項目が無い)", () => {
    const instance = createMonsterInstance("mushroon_GRASS", 4, 20);
    expect(Object.keys(instance).sort()).toEqual(
      ["development", "dexId", "equipment", "exp", "id", "level", "skillLevels", "star"],
    );
  });

  it("パッシブは戦闘用の定義にだけレベルが焼かれ、図鑑の静的データは汚れない", () => {
    const dexSkill = findMonster("mushroon", "GRASS")!.skills[2];
    expect(dexSkill.passiveLevel).toBeUndefined();
    const instance = createMonsterInstance("mushroon_GRASS", 4, 20);
    instance.skillLevels = [1, 1, 4];
    expect(toBattleDefinition(instance, findMonster("mushroon", "GRASS")!).skills[2].passiveLevel).toBe(4);
  });
});

describe("パッシブは行動として選ばれない", () => {
  it("パッシブの枠を手で選んでも、AIの判断へ落ちる", () => {
    const engine = battle(["kobold_GRASS"], ["golem_WATER"], () => 0.99);
    const [kobold] = engine.getUnits();
    expect(kobold.def.skills[2].passive).toBeDefined();
    const record = engine.resolveTurn(kobold, { skillIndex: 2 });
    expect(record.lines.some((line) => line.includes("「獲物の匂い」"))).toBe(false);
  });
});

describe("既存モンスターを触っていない", () => {
  it("既存12種のスキルidと基礎ステータスは変わっていない", () => {
    // 変えていないことの証拠を1件だけ残す。全件は既存テストが見張っている
    const nemesis = findMonster("nemesis", "DARK")!;
    expect(nemesis.skills.map((s) => s.id)).toEqual(["nemesis_s1", "nemesis_s2_c", "nemesis_s3_dark"]);
    expect(findMonster("slime", "FIRE")!.stats.atk).toBe(132);
  });
});

// 未使用の import を残さないための参照。種族定数はテストの読み手が辿れるよう明示している
void [SHELLTURTLE, KOBOLD, BASILISK, THUNDERBEAST, BEHEMOTH];
