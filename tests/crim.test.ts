import { describe, expect, it } from "vitest";
import { STAR_MAX_LEVEL, computeEffectiveStats } from "../src/core/rarity.js";
import { Skill, computeLeveledSkill, describeSkillLines } from "../src/core/skill.js";
import { BattleEngine } from "../src/battle/engine.js";
import { chooseSkill } from "../src/battle/ai.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { findMonsterById, SKILL_PIG_DEX } from "../src/data/monsters.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { GIFT_DEFINITIONS } from "../src/data/gifts.js";
import { CRIM_TEMPLATE_ID } from "../src/data/newMonsters/crim.js";
import { CRIM_SHARDS_FOR_MAX_SKILLS, useCrimShard } from "../src/game/crim.js";
import { createInitialState } from "../src/game/playerState.js";
import { canSendMonster, sendMonstersForPoints } from "../src/game/monsterPoints.js";
import { depositMonsters, isMonsterStorageEligible } from "../src/game/monsterStorage.js";
import { checkMonsterPowerUp, executeMonsterPowerUp } from "../src/game/monsterPowerUp.js";
import { checkRankUp } from "../src/game/progression.js";
import { checkMonsterCreate } from "../src/game/monsterCreate.js";
import { TUTORIAL_MISSIONS, syncCrimShardGrants } from "../src/game/tutorialMissions.js";

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
      // 2026年10月の調整で Lv2 1.05→1.10、Lv4 1.10→1.20(拡散率は据え置き)
      { level: 2, multiplier: 1.10, ratio: 0.5 },
      { level: 3, multiplier: 1.10, ratio: 0.6 },
      { level: 4, multiplier: 1.20, ratio: 0.6 },
      { level: 5, multiplier: 1.20, ratio: 0.7 },
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
      // 2026年10月の調整で Lv4 の倍率だけ 0.90→0.95
      { level: 4, multiplier: 0.95, chance: 0.50, turns: 2, cooldown: 3 },
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
      // 2026年10月の調整で Lv5 の倍率だけ 2.70→2.80
      { level: 5, multiplier: 2.8, shield: 0.25, cooldown: 4 },
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

/* ==========================================================================
 * クリムが消えないこと
 *
 * **画面から選べないだけでは足りない。**別の画面が同じ処理を呼んだ時、
 * あるいは将来UIを作り直した時に、また消えるようになる。
 * ここで見るのは**処理層の判定関数**そのもの。
 * ========================================================================== */

/** クリムと、比較用のふつうのモンスターを持った人 */
function playerWithCrim() {
  const player = createInitialState();
  player.monsters = [];
  const crimInstance = createMonsterInstance(CRIM_DEX_ID, 5, 1);
  const other = createMonsterInstance("slime_FIRE", 5, 1);
  const another = createMonsterInstance("slime_FIRE", 5, 1);
  player.monsters.push(crimInstance, other, another);
  player.partyIds = [];
  return { player, crim: crimInstance, other, another };
}

describe("クリムは消えない(処理層で拒否する)", () => {
  it("モンスターポイントへ変換できない", () => {
    const { player, crim: crimInstance, other } = playerWithCrim();
    expect(canSendMonster(player, crimInstance)).toBe(false);
    // ふつうのモンスターは今までどおり送れる(制限を広げすぎていない)
    expect(canSendMonster(player, other)).toBe(true);

    // IDを直に渡しても、クリムだけが残る
    const result = sendMonstersForPoints(player, [crimInstance.id, other.id]);
    expect(result?.sent).toBe(1);
    expect(player.monsters.some((m) => m.id === crimInstance.id)).toBe(true);
  });

  it("保管所へ預けられない(預けた先からポイントへ換えられてしまうため)", () => {
    const { player, crim: crimInstance, other } = playerWithCrim();
    expect(isMonsterStorageEligible(player, crimInstance)).toBe(false);
    expect(isMonsterStorageEligible(player, other)).toBe(true);

    const deposited = depositMonsters(player, CRIM_DEX_ID, 5, 1);
    expect(deposited).toBe(0);
    expect(player.monsters.some((m) => m.id === crimInstance.id)).toBe(true);
  });

  it("モンスター強化の素材にできない", () => {
    const { player, crim: crimInstance, other } = playerWithCrim();
    const check = checkMonsterPowerUp(other, [crimInstance], player.partyIds);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("クリム");

    // 実際に呼んでも消えない
    const transaction = executeMonsterPowerUp(player.monsters, other.id, [crimInstance.id], player.partyIds);
    expect(transaction.ok).toBe(false);
    expect(player.monsters.some((m) => m.id === crimInstance.id)).toBe(true);
  });

  it("ランクアップの素材にできない", () => {
    const { player, crim: crimInstance, other } = playerWithCrim();
    other.level = STAR_MAX_LEVEL[other.star];
    const sacrifices = [crimInstance, ...Array.from({ length: 4 }, () => createMonsterInstance("slime_FIRE", 5, 1))];
    const check = checkRankUp(other, sacrifices, player.partyIds);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("クリム");
  });

  it("クリエイト(スキル継承)の移し元にできない", () => {
    const { player, crim: crimInstance, other } = playerWithCrim();
    crimInstance.star = 6;
    const check = checkMonsterCreate(other, crimInstance, player.partyIds);
    expect(check.ok).toBe(false);
    expect(check.reason).toContain("クリム");
  });

  it("クリムを強化する側にするのは自由(素材にできないだけ)", () => {
    const { player, crim: crimInstance, other, another } = playerWithCrim();
    const check = checkMonsterPowerUp(crimInstance, [other, another], player.partyIds);
    expect(check.ok).toBe(true);
  });
});

/* ==========================================================================
 * 専用素材「クリムの宝珠のかけら」
 * ========================================================================== */

describe("クリムの宝珠のかけら", () => {
  it("クリムのスキルレベルを1つ上げ、1個減る", () => {
    const { player, crim: crimInstance } = playerWithCrim();
    player.crimShards = 3;
    const before = crimInstance.skillLevels.reduce((sum, level) => sum + level, 0);

    const result = useCrimShard(player, crimInstance.id, () => 0);
    expect(result.ok).toBe(true);
    expect(crimInstance.skillLevels.reduce((sum, level) => sum + level, 0)).toBe(before + 1);
    expect(player.crimShards).toBe(2);
  });

  it("クリム以外には使えない", () => {
    const { player, other } = playerWithCrim();
    player.crimShards = 5;
    const result = useCrimShard(player, other.id);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("クリム");
    // **かけらは減らない。**断ったのに消費されては困る
    expect(player.crimShards).toBe(5);
    expect(other.skillLevels).toEqual([1, 1, 1]);
  });

  it("持っていなければ使えない", () => {
    const { player, crim: crimInstance } = playerWithCrim();
    player.crimShards = 0;
    expect(useCrimShard(player, crimInstance.id).ok).toBe(false);
    expect(crimInstance.skillLevels).toEqual([1, 1, 1]);
  });

  it("全スキルMAXなら使えない(かけらを無駄にしない)", () => {
    const { player, crim: crimInstance } = playerWithCrim();
    player.crimShards = 1;
    crimInstance.skillLevels = [5, 5, 5];
    expect(useCrimShard(player, crimInstance.id).ok).toBe(false);
    expect(player.crimShards).toBe(1);
  });

  it("12個で全スキルがMAXになる", () => {
    const { player, crim: crimInstance } = playerWithCrim();
    player.crimShards = CRIM_SHARDS_FOR_MAX_SKILLS;
    for (let i = 0; i < CRIM_SHARDS_FOR_MAX_SKILLS; i += 1) {
      expect(useCrimShard(player, crimInstance.id, () => 0).ok, `${i + 1}個目`).toBe(true);
    }
    expect(crimInstance.skillLevels).toEqual([5, 5, 5]);
    expect(player.crimShards).toBe(0);
  });

  it("通常のスキルピッグでもクリムのスキルは上げられる(手段を奪っていない)", () => {
    const { player, crim: crimInstance } = playerWithCrim();
    const pig = createMonsterInstance(SKILL_PIG_DEX[0].id, 1, 1);
    player.monsters.push(pig);
    crimInstance.level = STAR_MAX_LEVEL[crimInstance.star];
    const check = checkMonsterPowerUp(crimInstance, [pig], player.partyIds);
    expect(check.ok).toBe(true);
  });
});

/* ==========================================================================
 * 配布と、初心者ミッションの遡及
 * ========================================================================== */

describe("クリムの配布", () => {
  it("プレゼントとして1件だけ並び、期限が無い", () => {
    const gifts = GIFT_DEFINITIONS.filter((gift) =>
      gift.rewards.some((reward) => reward.kind === "MONSTER" && reward.dexId === CRIM_DEX_ID));
    expect(gifts).toHaveLength(1);
    // **期限を切らない。**配り終わりを作ると、その後に始めた人が持てなくなる
    expect(gifts[0].expiresAt).toBeNull();
    const reward = gifts[0].rewards.find((r) => r.kind === "MONSTER") as { star: number; amount: number };
    expect(reward.star).toBe(5);
    expect(reward.amount).toBe(1);
  });
});

describe("初心者ミッションのかけら12個", () => {
  it("合計がちょうど12個で、全スキルMAXに要る数と一致する", () => {
    const total = TUTORIAL_MISSIONS.reduce((sum, entry) => sum + (entry.reward.crimShard ?? 0), 0);
    expect(total).toBe(CRIM_SHARDS_FOR_MAX_SKILLS);
  });

  it("一度にまとめて渡さず、章をまたいで散らしてある", () => {
    const steps = TUTORIAL_MISSIONS.filter((entry) => (entry.reward.crimShard ?? 0) > 0);
    expect(steps.length).toBeGreaterThanOrEqual(10);
    // 1つのミッションで2個以上まとめて渡さない
    for (const entry of steps) expect(entry.reward.crimShard).toBe(1);
    // 少なくとも5つの章にまたがっている
    expect(new Set(steps.map((entry) => entry.chapter)).size).toBeGreaterThanOrEqual(5);
  });

  it("新しく達成した人は、その場で受け取れる", () => {
    const player = createInitialState();
    const entry = TUTORIAL_MISSIONS.find((m) => (m.reward.crimShard ?? 0) > 0)!;
    player.tutorialMissions.claimedIds = [];
    player.crimShards = 0;
    // 受け取り済みにしてから同期すると、その1件ぶんだけ入る
    player.tutorialMissions.claimedIds.push(entry.id);
    expect(syncCrimShardGrants(player)).toBe(1);
    expect(player.crimShards).toBe(1);
  });

  it("途中まで達成済みの人は、そこまでの分だけ受け取れる", () => {
    const player = createInitialState();
    // 第4章の終わり(step 32)までを達成済みにする
    player.tutorialMissions.claimedIds = TUTORIAL_MISSIONS
      .filter((entry) => entry.step <= 32).map((entry) => entry.id);
    player.crimShards = 0;
    const expected = TUTORIAL_MISSIONS
      .filter((entry) => entry.step <= 32)
      .reduce((sum, entry) => sum + (entry.reward.crimShard ?? 0), 0);
    expect(syncCrimShardGrants(player)).toBe(expected);
    expect(player.crimShards).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(CRIM_SHARDS_FOR_MAX_SKILLS);
  });

  it("全部達成済みの人は、12個まとめて受け取れる", () => {
    const player = createInitialState();
    player.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.map((entry) => entry.id);
    player.crimShards = 0;
    expect(syncCrimShardGrants(player)).toBe(CRIM_SHARDS_FOR_MAX_SKILLS);
    expect(player.crimShards).toBe(CRIM_SHARDS_FOR_MAX_SKILLS);
  });

  it("二度呼んでも増えない", () => {
    const player = createInitialState();
    player.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.map((entry) => entry.id);
    player.crimShards = 0;
    syncCrimShardGrants(player);
    expect(syncCrimShardGrants(player)).toBe(0);
    expect(player.crimShards).toBe(CRIM_SHARDS_FOR_MAX_SKILLS);
  });

  it("過去の報酬(ダイヤ・召喚書・ゴールド)は二重に配られない", () => {
    /*
     * **ここが今回いちばん怖いところ。**
     * 受取印を消して配り直せば話は早いが、それをやると過去の報酬まで全部出る。
     * かけら専用の印を使っているので、他の持ち物は1つも動かない。
     */
    const player = createInitialState();
    player.tutorialMissions.claimedIds = TUTORIAL_MISSIONS.map((entry) => entry.id);
    const before = {
      crystal: player.crystal,
      gold: player.gold,
      summonScrolls: player.summonScrolls,
      monsters: player.monsters.length,
      arenaCoins: player.arenaCoins,
    };
    syncCrimShardGrants(player);
    expect(player.crystal).toBe(before.crystal);
    expect(player.gold).toBe(before.gold);
    expect(player.summonScrolls).toBe(before.summonScrolls);
    expect(player.monsters.length).toBe(before.monsters);
    expect(player.arenaCoins).toBe(before.arenaCoins);
  });

  it("受け取り済みでないミッションのぶんは配らない", () => {
    const player = createInitialState();
    player.tutorialMissions.claimedIds = [];
    player.crimShards = 0;
    expect(syncCrimShardGrants(player)).toBe(0);
    expect(player.crimShards).toBe(0);
  });
});

/* ==========================================================================
 * オートでの振る舞い
 * ========================================================================== */

describe("オートAI", () => {
  it("S3 → S2 → S1 の順に選ぶ(クリム専用の分岐を増やしていない)", () => {
    /*
     * 既存のAIは「クールタイムが明けている中で番号が大きいスキル」を選ぶ。
     * 依頼の優先度(S3 → S2 → S1)とそのまま一致するので、
     * **クリムのためだけの分岐は1つも足していない。**
     */
    const engine = crimBattle(["slime_WATER"]);
    const unit = engine.getUnits()[0];

    unit.cooldowns = [0, 0, 0];
    expect(chooseSkill(unit, [...engine.getUnits()]).index, "全部明けていればS3").toBe(2);

    unit.cooldowns = [0, 0, 3];
    expect(chooseSkill(unit, [...engine.getUnits()]).index, "S3が溜まり中ならS2").toBe(1);

    unit.cooldowns = [0, 2, 3];
    expect(chooseSkill(unit, [...engine.getUnits()]).index, "どちらも溜まり中ならS1").toBe(0);
  });

  it("S3で倒した後の追加ターンが、そのまま次の手番として処理される", () => {
    const engine = crimBattle(["slime_WATER", "slime_WATER"], [1, 1, 1]);
    for (const enemy of engine.getUnits().filter((u) => u.team === "ENEMY")) {
      enemy.maxHp = 1; enemy.currentHp = 1;
    }
    const crimUnit = engine.getUnits()[0];
    crimUnit.gauge = 100;
    const record = engine.resolveTurn(crimUnit, { skillIndex: 2 });
    expect(record.lines.some((line) => line.includes("追加ターンを得た"))).toBe(true);
    // 追加ターンぶん、ゲージが満タンへ戻っている(次に動けることの裏付け)
    expect(crimUnit.gauge).toBeGreaterThanOrEqual(100);
  });
});

describe("画面に出す数字", () => {
  it("図鑑のLv1表示は整数になる(素の値が小数でも)", () => {
    /*
     * **クリムの素の値は小数。**★6 Lv60 の到達値を設計値ちょうどに置くため、
     * 割り算で決めている(`src/data/newMonsters/crim.ts`)。
     *
     * 図鑑はこれをそのまま出していたので、
     * **「HP 1673.4098887338395645968914452109020051141989」**と並んだ。
     * `computeEffectiveStats` は★1 Lv1 では倍率1.0なので値は動かず、
     * 丸めだけが入る。
     */
    const raw = crim().stats;
    expect(Number.isInteger(raw.hp), "素の値は小数のまま持っている").toBe(false);

    const shown = computeEffectiveStats(raw, 1, 1);
    for (const key of ["hp", "atk", "def", "spd"] as const) {
      expect(Number.isInteger(shown[key]), `図鑑のLv1表示の${key}が整数でない`).toBe(true);
    }
  });

  it("スキルの説明に、桁の長い小数が出ない", () => {
    /*
     * 係数をそのまま埋め込んでいたため、フェニックスなどの説明に
     * 「最大HP×0.08624999999999998を加算」と出ていた(依頼主の指摘)。
     * 二進小数の誤差がそのまま画面に出ていたもの。
     */
    for (let level = 1; level <= 5; level += 1) {
      for (const skill of crim().skills) {
        for (const line of describeSkillLines(computeLeveledSkill(skill, level))) {
          expect(line, `Lv${level}: ${line}`).not.toMatch(/\d+\.\d{3,}/);
        }
      }
    }
  });
});
