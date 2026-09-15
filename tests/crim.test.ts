import { describe, expect, it } from "vitest";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { Skill, computeLeveledSkill } from "../src/core/skill.js";
import { BattleEngine } from "../src/battle/engine.js";
import { findMonsterById } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { CRIM_TEMPLATE_ID } from "../src/data/newMonsters/crim.js";

/**
 * クリムの登録データと、★/Lv成長・スキルLvの到達値。
 *
 * **ここの数字は設計値そのもの。**依頼で決まった値を、
 * 実際のゲーム計算経路(`computeEffectiveStats` / `computeLeveledSkill`)を
 * 通した結果と突き合わせる。データを直接読んで比べても、
 * 成長の式を触った時に気づけない。
 */

export const CRIM_DEX_ID = `${CRIM_TEMPLATE_ID}_LIGHT`;

function crim() {
  const dex = findMonsterById(CRIM_DEX_ID);
  expect(dex, "クリムが図鑑に登録されていない").toBeDefined();
  return dex!;
}

describe("クリムの登録データ", () => {
  it("光属性★5のアタッカーとして1体だけ登録されている", () => {
    const dex = crim();
    expect(dex.name).toBe("クリム[光]");
    expect(dex.element).toBe("LIGHT");
    expect(dex.role).toBe("アタッカー");
    expect(dex.templateId).toBe(CRIM_TEMPLATE_ID);
  });

  it("他属性のクリムは作らない", () => {
    for (const element of ["FIRE", "WATER", "GRASS", "ELECTRIC", "DARK"]) {
      expect(findMonsterById(`${CRIM_TEMPLATE_ID}_${element}`), `${element}のクリムが居る`).toBeUndefined();
    }
  });

  it("★6 Lv60で設計値ちょうどになる(装備・能力pt・転生・才能なし)", () => {
    /*
     * **属性補正の丸めを通さないから、ちょうどに置ける**(`noElementFlavor`)。
     * 補正を通すと防御は1248か1259にしかならず、1250はどう置いても作れない。
     */
    const stats = computeEffectiveStats(crim().stats, 6, 60);
    expect(stats.hp).toBe(18_000);
    expect(stats.atk).toBe(2_300);
    expect(stats.def).toBe(1_250);
    expect(stats.spd).toBe(118);
    expect(stats.criRate).toBeCloseTo(0.20, 10);
    expect(stats.criDmg).toBeCloseTo(1.60, 10);
    expect(stats.accuracy).toBeCloseTo(0.15, 10);
    expect(stats.resistance).toBeCloseTo(0.15, 10);
  });

  it("★5から★6まで、星とレベルで素直に伸びる", () => {
    const star5 = computeEffectiveStats(crim().stats, 5, 1);
    const star5Max = computeEffectiveStats(crim().stats, 5, 50);
    const star6 = computeEffectiveStats(crim().stats, 6, 60);
    expect(star5.hp).toBeGreaterThan(0);
    expect(star5Max.hp).toBeGreaterThan(star5.hp);
    expect(star6.hp).toBeGreaterThan(star5Max.hp);
    // 速度は★でもLvでも伸びない(既存仕様)
    expect(star5.spd).toBe(118);
    expect(star6.spd).toBe(118);
  });
});

/** そのスキルのLvごとの姿 */
function leveled(slot: 0 | 1 | 2, level: number) {
  return computeLeveledSkill(crim().skills[slot], level);
}

function damageOf(skill: ReturnType<typeof leveled>) {
  const effect = skill.effects.find((e) => e.kind === "DAMAGE");
  expect(effect, "DAMAGE効果が無い").toBeDefined();
  return effect as Extract<typeof effect, { kind: "DAMAGE" }>;
}

describe("S1 プリズムスプレッド", () => {
  it("単体攻撃＋拡散で、クールタイムを持たない", () => {
    const skill = crim().skills[0];
    expect(skill.name).toBe("プリズムスプレッド");
    expect(skill.target).toBe("SINGLE_ENEMY");
    expect(skill.cooldownTurns).toBe(0);
    expect(skill.effects.some((e) => e.kind === "SPLASH")).toBe(true);
  });

  it("スキルLvで倍率と拡散率が交互に伸びる", () => {
    const table = [
      { level: 1, multiplier: 1.0, ratio: 0.5 },
      { level: 2, multiplier: 1.05, ratio: 0.5 },
      { level: 3, multiplier: 1.05, ratio: 0.6 },
      { level: 4, multiplier: 1.10, ratio: 0.6 },
      { level: 5, multiplier: 1.10, ratio: 0.7 },
    ];
    for (const row of table) {
      const skill = leveled(0, row.level);
      expect(damageOf(skill).multiplier, `Lv${row.level}の倍率`).toBeCloseTo(row.multiplier, 10);
      const splash = skill.effects.find((e) => e.kind === "SPLASH") as { ratio: number } | undefined;
      expect(splash?.ratio, `Lv${row.level}の拡散率`).toBeCloseTo(row.ratio, 10);
      // クールタイムは最後まで0のまま
      expect(skill.cooldownTurns).toBe(0);
    }
  });
});

describe("S2 クリスタルラッシュ", () => {
  it("敵全体への2回攻撃で、ヒットごとに攻撃DOWNを判定する", () => {
    const skill = crim().skills[1];
    expect(skill.name).toBe("クリスタルラッシュ");
    expect(skill.target).toBe("ALL_ENEMIES");
    const damage = damageOf(skill);
    expect(damage.hits).toBe(2);
    // **1撃ごとの判定。**スキル全体で1回ではない
    expect(damage.perHitEffects?.some((e) => e.kind === "DEBUFF" && e.stat === "atk")).toBe(true);
  });

  it("スキルLvごとに、倍率・付与率・持続・CTが表のとおりになる", () => {
    const table = [
      { level: 1, multiplier: 0.8, chance: 0.35, turns: 1, cooldown: 3 },
      { level: 2, multiplier: 0.9, chance: 0.35, turns: 1, cooldown: 3 },
      { level: 3, multiplier: 0.9, chance: 0.50, turns: 1, cooldown: 3 },
      { level: 4, multiplier: 0.9, chance: 0.50, turns: 2, cooldown: 3 },
      { level: 5, multiplier: 1.0, chance: 0.50, turns: 2, cooldown: 2 },
    ];
    for (const row of table) {
      const skill = leveled(1, row.level);
      const damage = damageOf(skill);
      expect(damage.multiplier, `Lv${row.level}の倍率`).toBeCloseTo(row.multiplier, 10);
      expect(damage.hits, `Lv${row.level}のヒット数`).toBe(2);
      expect(skill.cooldownTurns, `Lv${row.level}のCT`).toBe(row.cooldown);
      const debuff = damage.perHitEffects?.find((e) => e.kind === "DEBUFF") as
        { chance?: number; durationTurns: number } | undefined;
      expect(debuff?.chance, `Lv${row.level}の付与率`).toBeCloseTo(row.chance, 10);
      expect(debuff?.durationTurns, `Lv${row.level}の持続`).toBe(row.turns);
    }
  });
});

describe("S3 創世の宝珠", () => {
  it("敵全体＋味方全体で、撃破時に追加ターンを得る", () => {
    const skill = crim().skills[2];
    expect(skill.name).toBe("創世の宝珠");
    expect(skill.target).toBe("ALL_ENEMIES");
    expect(skill.extraTurnOnKill).toBe(true);
    const shield = skill.effects.find((e) => e.kind === "SHIELD") as
      { fromSourceHp?: boolean; applyTo?: string } | undefined;
    // **クリム自身の最大HPが基準。**受け手の最大HPではない
    expect(shield?.fromSourceHp).toBe(true);
    expect(shield?.applyTo).toBe("ALLIES");
  });

  it("スキルLvごとに、倍率・シールド量・CTが表のとおりになる", () => {
    const table = [
      { level: 1, multiplier: 2.0, shield: 0.20, cooldown: 5 },
      { level: 2, multiplier: 2.3, shield: 0.20, cooldown: 5 },
      { level: 3, multiplier: 2.3, shield: 0.25, cooldown: 5 },
      { level: 4, multiplier: 2.7, shield: 0.25, cooldown: 5 },
      { level: 5, multiplier: 2.7, shield: 0.25, cooldown: 4 },
    ];
    for (const row of table) {
      const skill = leveled(2, row.level);
      expect(damageOf(skill).multiplier, `Lv${row.level}の倍率`).toBeCloseTo(row.multiplier, 10);
      expect(skill.cooldownTurns, `Lv${row.level}のCT`).toBe(row.cooldown);
      const shield = skill.effects.find((e) => e.kind === "SHIELD") as
        { shieldRate: number; durationTurns: number } | undefined;
      expect(shield?.shieldRate, `Lv${row.level}のシールド量`).toBeCloseTo(row.shield, 10);
      // 持続は2ターン固定。Lv5でも伸ばさない
      expect(shield?.durationTurns, `Lv${row.level}のシールド持続`).toBe(2);
    }
  });
});

/* ==========================================================================
 * 戦闘での振る舞い
 *
 * **数字の一致ではなく「決めた約束が起きるか」を見る。**
 * 倍率は今後も動かすが、「拡散はメイン対象の実ダメージが基準」
 * 「拡散から拡散は起きない」といった約束は動かない。
 * ========================================================================== */

/** 乱数を固定した戦闘。`rng` が常に0なら確率つきの効果は必ず当たる */
function battle(playerIds: string[], enemyIds: string[], rng = () => 0) {
  const toDef = (id: string) => {
    const dex = findMonsterById(id);
    if (!dex) throw new Error(`図鑑に無い: ${id}`);
    return dex;
  };
  return new BattleEngine(playerIds.map(toDef), enemyIds.map(toDef), { rng });
}

/** クリムのスキルを指定レベルへ差し替えた戦闘 */
function crimBattle(
  enemyIds: string[],
  levels: [number, number, number] = [1, 1, 1],
  options: { rng?: () => number; latentId?: string; allies?: string[] } = {},
) {
  const engine = battle([CRIM_DEX_ID, ...(options.allies ?? [])], enemyIds, options.rng ?? (() => 0.99));
  const unit = engine.getUnits()[0];
  const dex = crim();
  unit.def = {
    ...unit.def,
    skills: [
      computeLeveledSkill(dex.skills[0], levels[0]),
      computeLeveledSkill(dex.skills[1], levels[1]),
      computeLeveledSkill(dex.skills[2], levels[2]),
    ] as [Skill, Skill, Skill],
    ...(options.latentId
      ? { latentAbility: LATENT_ABILITY_CANDIDATES[CRIM_DEX_ID]?.find((c) => c.id === options.latentId) }
      : {}),
  };
  return engine;
}

/** そのログ行から「◯◯ に N ダメージ」を拾う */
function damagesIn(lines: string[]): number[] {
  return lines.flatMap((line) => {
    const match = line.match(/に (\d+) ダメージ/);
    return match ? [Number(match[1])] : [];
  });
}

describe("S1の拡散", () => {
  it("メイン対象へ実際に与えたダメージを基準に、対象以外へ配る", () => {
    // 敵3体。1体目がメイン対象、残り2体へ拡散する
    const engine = crimBattle(["slime_WATER", "slime_WATER", "slime_WATER"]);
    const enemies = engine.getUnits().filter((unit) => unit.team === "ENEMY");
    for (const enemy of enemies) { enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999; }

    const record = engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 });
    const damages = damagesIn(record.lines);
    expect(damages.length, "メイン1発＋拡散2発").toBe(3);

    const [main, ...splashed] = damages;
    // **Lv1は50%。**実ダメージの半分が、対象以外の全員へ同じ量で入る
    for (const value of splashed) expect(value).toBe(Math.max(1, Math.round(main * 0.5)));
  });

  it("スキルLvを上げると拡散の割合が上がる", () => {
    const ratioAt = (level: number) => {
      const engine = crimBattle(["slime_WATER", "slime_WATER"], [level, 1, 1]);
      for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
        enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
      }
      const damages = damagesIn(engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 }).lines);
      return damages[1] / damages[0];
    };
    expect(ratioAt(1)).toBeCloseTo(0.5, 2);
    expect(ratioAt(3)).toBeCloseTo(0.6, 2);
    expect(ratioAt(5)).toBeCloseTo(0.7, 2);
  });

  it("拡散からさらに拡散しない(1回の使用で与える回数は敵の数まで)", () => {
    /*
     * 再帰すると、敵3体なら 1 + 2 + 2×2 + … と際限なく増える。
     * ダメージの回数が敵の数ぴったりであることが、再帰していない証拠。
     */
    const engine = crimBattle(["slime_WATER", "slime_WATER", "slime_WATER", "slime_WATER"]);
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
      enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
    }
    const damages = damagesIn(engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 }).lines);
    expect(damages.length).toBe(4);
  });

  it("拡散はダメージだけ。弱体などの追加効果を敵の数だけ撒かない", () => {
    // S1は弱体を持たないので、ログに弱体の行が1つも出ないことで見る
    const engine = crimBattle(["slime_WATER", "slime_WATER", "slime_WATER"]);
    const record = engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 });
    expect(record.lines.some((line) => line.includes("低下")), record.lines.join("\n")).toBe(false);
  });

  it("敵が1体しか居なければ拡散は起きない", () => {
    const engine = crimBattle(["slime_WATER"]);
    const enemy = engine.getUnits()[1];
    enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
    const damages = damagesIn(engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 }).lines);
    expect(damages.length).toBe(1);
  });
});

describe("S1の潜在覚醒", () => {
  it("3候補が図鑑IDに紐づいている", () => {
    const candidates = LATENT_ABILITY_CANDIDATES[CRIM_DEX_ID];
    expect(candidates?.map((c) => c.name)).toEqual(["プリズムチェイン", "光速循環", "貫光の宝珠"]);
    // **どれもS1専用。**この作品の潜在覚醒はスキル1にしか乗らない
    for (const candidate of candidates!) expect(candidate.skillSlot).toBe(0);
  });

  it("プリズムチェインは拡散率を20pt上げる(MAXで70% → 90%)", () => {
    const withoutLatent = crimBattle(["slime_WATER", "slime_WATER"], [5, 1, 1]);
    const withLatent = crimBattle(["slime_WATER", "slime_WATER"], [5, 1, 1], { latentId: "crim_LIGHT_latent_1" });
    const ratioOf = (engine: ReturnType<typeof crimBattle>) => {
      for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
        enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
      }
      const damages = damagesIn(engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 }).lines);
      return damages[1] / damages[0];
    };
    expect(ratioOf(withoutLatent)).toBeCloseTo(0.7, 2);
    expect(ratioOf(withLatent)).toBeCloseTo(0.9, 2);
  });

  it("光速循環はS1で倒した時だけゲージが上がり、複数倒しても1回だけ", () => {
    const engine = crimBattle(["slime_WATER", "slime_WATER", "slime_WATER"], [5, 1, 1], {
      latentId: "crim_LIGHT_latent_2",
    });
    const crimUnit = engine.getUnits()[0];
    // 拡散だけで全員落ちる体力にして、1回のS1で複数撃破させる
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
      enemy.maxHp = 1; enemy.currentHp = 1;
    }
    /*
     * **手番を使うとゲージは満タンぶん引かれる**(`resolveTurn` の冒頭)ので、
     * 満タンから始めて、行動後に残った量を見る。
     * **+50%が1回だけ。**2体倒したからといって2回入らない。
     */
    crimUnit.gauge = 100;
    engine.resolveTurn(crimUnit, { skillIndex: 0 });
    expect(crimUnit.gauge / 100).toBeCloseTo(0.5, 2);

    // 倒せなければ1つも入らない
    const noKill = crimBattle(["golem_WATER"], [5, 1, 1], { latentId: "crim_LIGHT_latent_2" });
    const aliveEnemy = noKill.getUnits()[1];
    aliveEnemy.maxHp = 99_999_999; aliveEnemy.currentHp = 99_999_999;
    noKill.getUnits()[0].gauge = 100;
    noKill.resolveTurn(noKill.getUnits()[0], { skillIndex: 0 });
    expect(noKill.getUnits()[0].gauge).toBe(0);
  });

  it("貫光の宝珠は防御を30%無視する(硬い相手ほど効く)", () => {
    const damageAgainstWall = (latentId?: string) => {
      const engine = crimBattle(["golem_WATER"], [1, 1, 1], latentId ? { latentId } : {});
      const enemy = engine.getUnits()[1];
      enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
      return damagesIn(engine.resolveTurn(engine.getUnits()[0], { skillIndex: 0 }).lines)[0];
    };
    expect(damageAgainstWall("crim_LIGHT_latent_3")).toBeGreaterThan(damageAgainstWall());
  });
});

describe("S2の振る舞い", () => {
  it("敵全体へ2回ずつ当たる", () => {
    const engine = crimBattle(["slime_WATER", "slime_WATER"], [1, 1, 1]);
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
      enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
    }
    const damages = damagesIn(engine.resolveTurn(engine.getUnits()[0], { skillIndex: 1 }).lines);
    // 敵2体 × 2ヒット
    expect(damages.length).toBe(4);
  });

  it("攻撃DOWNの判定はヒットごとに行う", () => {
    /*
     * **1撃目で必ず入り、2撃目でも判定される。**
     * スキル全体で1回なら、弱体の行は敵1体につき1行しか出ない。
     */
    const engine = crimBattle(["slime_WATER"], [1, 1, 1], { rng: () => 0 });
    const enemy = engine.getUnits()[1];
    enemy.maxHp = 9_999_999; enemy.currentHp = 9_999_999;
    const lines = engine.resolveTurn(engine.getUnits()[0], { skillIndex: 1 }).lines;
    const downs = lines.filter((line) => line.includes("ATK") && line.includes("低下"));
    expect(downs.length).toBe(2);
  });
});

describe("S3の振る舞い", () => {
  it("味方全体へ、クリム自身の最大HPを基準にしたシールドを張る", () => {
    const engine = crimBattle(["slime_WATER"], [1, 1, 1], { allies: ["slime_FIRE"] });
    const [crimUnit, ally] = engine.getUnits();
    engine.resolveTurn(crimUnit, { skillIndex: 2 });
    /*
     * **受け手の最大HPではなくクリムの最大HPの20%。**
     * 味方はクリムと最大HPが違うので、受け手基準ならこの値にならない。
     */
    const expected = Math.round(crimUnit.maxHp * 0.2);
    expect(ally.shieldValue).toBe(expected);
    expect(crimUnit.shieldValue).toBe(expected);
  });

  it("敵を倒せなくてもシールドは張る", () => {
    const engine = crimBattle(["golem_WATER"], [1, 1, 1], { allies: ["slime_FIRE"] });
    const [crimUnit, ally] = engine.getUnits();
    const enemy = engine.getUnits()[2];
    enemy.maxHp = 99_999_999; enemy.currentHp = 99_999_999;
    const record = engine.resolveTurn(crimUnit, { skillIndex: 2 });
    expect(record.lines.some((line) => line.includes("追加ターン"))).toBe(false);
    expect(ally.shieldValue).toBeGreaterThan(0);
  });

  it("敵を倒すと追加ターンを得る。複数倒しても1回だけ", () => {
    const engine = crimBattle(["slime_WATER", "slime_WATER", "slime_WATER"], [1, 1, 1]);
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
      enemy.maxHp = 1; enemy.currentHp = 1;
    }
    const record = engine.resolveTurn(engine.getUnits()[0], { skillIndex: 2 });
    const extras = record.lines.filter((line) => line.includes("追加ターン"));
    expect(extras.length).toBe(1);
  });
});
