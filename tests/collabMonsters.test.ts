/**
 * コラボ4種24体の登録・スキル・属性補正。
 *
 * **依頼主が列挙した必須項目をそのまま写してある。**
 * 4種×6属性は「同じ種族なのに属性で別の技を持つ」作りなので、
 * 表を見ながら手で確かめると必ず読み落とす。機械に読ませる。
 *
 * 戦闘での挙動は分けてある:
 *   - 新しい効果の種類 → `tests/collabEngineEffects.test.ts`
 *   - パッシブ4種      → `tests/collabPassives.test.ts`
 *   - 既存228体の補正が動いていないこと → `tests/elementFlavorRegression.test.ts`
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BattleEngine } from "../src/battle/engine.js";
import { ELEMENTS, type Element } from "../src/core/element.js";
import { MonsterDefinition, createMonsterVariant, elementStatFlavorOf } from "../src/core/monster.js";
import { Skill, computeLeveledSkill, describeSkillLines } from "../src/core/skill.js";
import { COLLAB_MONSTER_TEMPLATES, GUJIRA, MOCCHI, SUEZO, UNDINE } from "../src/data/collabMonsters/index.js";
import {
  ALL_DISPLAYABLE_MONSTERS_DEX, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES, MONSTER_DEX, findMonster,
} from "../src/data/monsters.js";
import { addMonster, createInitialState } from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";

/** 仕様表そのまま。属性ごとに「S2の名前 / S3の名前」 */
const EXPECTED_SKILLS: Record<string, Partial<Record<Element, [string, string]>>> = {
  mocchi: {
    FIRE: ["モッチ砲", "超モッチ砲"],
    WATER: ["ガッチャー", "宵闇ざくら"],
    ELECTRIC: ["さくらふぶき", "ガッツチャージ"],
    GRASS: ["さくらふぶき", "宵闇ざくら"],
    LIGHT: ["モッチ砲", "白もっさま"],
    DARK: ["ガッチャー", "さくらフィールド"],
  },
  suezo: {
    FIRE: ["テレパシー", "超熱視線"],
    WATER: ["サイコキネシス", "歌う"],
    ELECTRIC: ["キッス", "食う"],
    GRASS: ["テレパシー", "食う"],
    LIGHT: ["キッス", "魅惑のまなこ"],
    DARK: ["サイコキネシス", "クロノキネシス"],
  },
  undine: {
    FIRE: ["クリスタルレイン", "クリスタルアロー"],
    WATER: ["アクアヴェール", "水の祝福"],
    ELECTRIC: ["アクアヴェール", "水神の祝福"],
    GRASS: ["アクアヒーリング", "水の祝福"],
    LIGHT: ["アクアヒーリング", "水神の息吹"],
    DARK: ["クリスタルレイン", "アクアドーム"],
  },
  gujira: {
    FIRE: ["ホエールブースト", "ウェーブプレス"],
    WATER: ["地震", "大津波"],
    ELECTRIC: ["ぐるぐるプレス", "ホワイトサージ"],
    GRASS: ["ホエールブースト", "大津波"],
    LIGHT: ["地震", "キングウェーブ"],
    DARK: ["ぐるぐるプレス", "深淵の主"],
  },
};

/** 仕様表そのまま。属性ごとの補正の note */
const EXPECTED_FLAVOR: Record<string, Record<Element, string>> = {
  mocchi: {
    FIRE: "HP+10% / 攻撃-7%", WATER: "速度+5% / 防御-8%", ELECTRIC: "防御+10% / 速度-3%",
    GRASS: "HP+14% / 攻撃-10%", LIGHT: "HP+10% / クリダメ-4%", DARK: "防御+10% / 攻撃-7%",
  },
  suezo: {
    FIRE: "クリダメ+5% / 防御-6%", WATER: "命中+7% / HP-6%", ELECTRIC: "攻撃+10% / HP-8%",
    GRASS: "速度+4% / 防御-7%", LIGHT: "クリ率+3% / 防御-6%", DARK: "HP+9% / 速度-3%",
  },
  undine: {
    FIRE: "速度+4% / HP-7%", WATER: "防御+14% / 攻撃-10%", ELECTRIC: "速度+6% / HP-10%",
    GRASS: "HP+14% / 攻撃-10%", LIGHT: "速度+4% / 攻撃-6%", DARK: "防御+10% / 攻撃-7%",
  },
  gujira: {
    FIRE: "攻撃+12% / 防御-12%", WATER: "速度+5% / 防御-8%", ELECTRIC: "攻撃+10% / HP-8%",
    GRASS: "防御+12% / 攻撃-8%", LIGHT: "HP+10% / クリダメ-4%", DARK: "HP+9% / 速度-3%",
  },
};

const skillOf = (def: MonsterDefinition, slot: 0 | 1 | 2, level = 1): Skill =>
  computeLeveledSkill(def.skills[slot], level);

describe("1〜4. 24体の登録と属性ごとの割り当て", () => {
  it("4種×6属性=24体がすべて実体化でき、IDが一意", () => {
    const ids = new Set<string>();
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const def = createMonsterVariant(t, element);
        ids.add(def.id);
        expect(def.skills, `${t.templateId}[${element}]`).toHaveLength(3);
        expect(findMonster(t.templateId, element)?.id, `${t.templateId}[${element}] が引けない`).toBe(def.id);
      }
    }
    expect(ids.size).toBe(24);
  });

  it("gachaStar が モッチー4 / スエゾー4 / ウンディーネ5 / グジラ5", () => {
    expect(MOCCHI.gachaStar).toBe(4);
    expect(SUEZO.gachaStar).toBe(4);
    expect(UNDINE.gachaStar).toBe(5);
    expect(GUJIRA.gachaStar).toBe(5);
  });

  /*
   * **自動割り当てに任せると、候補の並びを変えた瞬間に全属性が入れ替わる。**
   * 表がある種族は `skillAssignment` で明示してあるので、その通りかを見る。
   */
  it("属性ごとのS2/S3が仕様表と完全に一致する", () => {
    const wrong: string[] = [];
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const def = createMonsterVariant(t, element);
        const [s2, s3] = EXPECTED_SKILLS[t.templateId][element]!;
        if (def.skills[1].name !== s2) wrong.push(`${t.templateId}[${element}] S2: ${def.skills[1].name} (期待 ${s2})`);
        if (def.skills[2].name !== s3) wrong.push(`${t.templateId}[${element}] S3: ${def.skills[2].name} (期待 ${s3})`);
      }
    }
    expect(wrong, `割り当てが違う:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("光と闇だけが固有のS3を持ち、他の属性へは漏れない", () => {
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      const light = t.lightSkill3!.id;
      const dark = t.darkSkill3!.id;
      expect(createMonsterVariant(t, "LIGHT").skills[2].id).toBe(light);
      expect(createMonsterVariant(t, "DARK").skills[2].id).toBe(dark);
      for (const element of ELEMENTS) {
        if (element === "LIGHT" || element === "DARK") continue;
        const got = createMonsterVariant(t, element).skills[2].id;
        expect([light, dark], `${t.templateId}[${element}] に固有技が漏れている`).not.toContain(got);
      }
    }
  });

  it("属性補正の型が仕様表どおり(2番・3番も含む)", () => {
    const wrong: string[] = [];
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const want = EXPECTED_FLAVOR[t.templateId][element];
        expect(t.elementFlavorAssignment?.[element], `${t.templateId}[${element}] に指定が無い`).toBeDefined();
        // 実際に掛かる補正を、実体化と同じ道筋(`elementStatFlavorOf`)で読む
        const note = elementStatFlavorOf(t.templateId, element, t.elementFlavorAssignment).note;
        if (note !== want) wrong.push(`${t.templateId}[${element}]: ${note} (期待 ${want})`);
      }
    }
    expect(wrong, `補正が違う:\n${wrong.join("\n")}`).toEqual([]);
  });
});

describe("5〜7. スキルLvの成長", () => {
  it("全34本のLv1〜5が有効で、原本を書き換えない", () => {
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        for (const skill of createMonsterVariant(t, element).skills) {
          const original = JSON.stringify(skill);
          for (let lv = 1; lv <= 5; lv += 1) {
            const leveled = computeLeveledSkill(skill, lv);
            expect(describeSkillLines(leveled).join(""), `${skill.id} Lv${lv}`).not.toMatch(/NaN|undefined/);
            expect(leveled.cooldownTurns, `${skill.id} Lv${lv}`).toBeGreaterThanOrEqual(0);
            // パッシブ以外は、書いた段がそのまま出る(一律成長へ落ちない)
            if (!skill.passive) expect(leveled.effects).toEqual(skill.levelOverrides![lv - 1].effects);
          }
          expect(JSON.stringify(skill), `${skill.id} の原本が書き換わった`).toBe(original);
        }
      }
    }
  });

  /*
   * **CT短縮はLv5に置く、が依頼主の指定。**
   * 途中の段へ置くと、そこから先の段が霞む。
   */
  it("CTを持つスキルは、Lv5でちょうど1縮む(Lv1〜4では縮まない)", () => {
    const odd: string[] = [];
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        for (const skill of createMonsterVariant(t, element).skills) {
          if (skill.passive) continue;
          const ct = (lv: number) => computeLeveledSkill(skill, lv).cooldownTurns;
          if (ct(1) === 0) {
            // CTの無いスキル1へ無理にCT短縮を入れない
            if (ct(5) !== 0) odd.push(`${skill.id}: CT0なのにLv5で${ct(5)}`);
            continue;
          }
          if (ct(4) !== ct(1)) odd.push(`${skill.id}: Lv4でもうCTが縮んでいる(${ct(1)}→${ct(4)})`);
          if (ct(5) !== ct(1) - 1) odd.push(`${skill.id}: Lv5のCTが ${ct(5)}(期待 ${ct(1) - 1})`);
        }
      }
    }
    expect(odd, `CTの伸ばし方がおかしい:\n${odd.join("\n")}`).toEqual([]);
  });

  /*
   * **強い拘束は伸ばさない、が依頼主の指定。**
   * 気絶・スキル封印は、明示したもの以外は1段も伸びてはいけない。
   */
  it("気絶とスキル封印の持続は、Lv1からLv5まで1ターンも伸びない", () => {
    const grown: string[] = [];
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        for (const skill of createMonsterVariant(t, element).skills) {
          if (skill.passive) continue;
          const bound = (lv: number) => computeLeveledSkill(skill, lv).effects
            .flatMap((e) => [e, ...("perHitEffects" in e ? e.perHitEffects ?? [] : [])])
            .filter((e) => e.kind === "STUN" || (e.kind === "STATUS" && e.status === "SKILL_LOCK"))
            .map((e) => (e as { durationTurns: number }).durationTurns);
          const at1 = bound(1), at5 = bound(5);
          if (JSON.stringify(at1) !== JSON.stringify(at5)) {
            grown.push(`${skill.id}: Lv1 ${at1.join(",")} → Lv5 ${at5.join(",")}`);
          }
        }
      }
    }
    expect(grown, `拘束の持続が伸びている:\n${grown.join("\n")}`).toEqual([]);
  });

  it("持続を+1すると決めた段で、実際に+1される", () => {
    // モッチー 宵闇ざくら: Lv4で回復阻害 2 → 3
    const yoi = MOCCHI.skill3Variants.find((s) => s.name === "宵闇ざくら")!;
    const healBlockTurns = (lv: number) => (computeLeveledSkill(yoi, lv).effects
      .find((e) => e.kind === "HEAL_BLOCK") as { durationTurns: number }).durationTurns;
    expect(healBlockTurns(3)).toBe(2);
    expect(healBlockTurns(4)).toBe(3);

    // ウンディーネ 水神の祝福: Lv4でシールド・防御UP・速度UPが 2 → 3
    const blessing = UNDINE.skill3Variants.find((s) => s.name === "水神の祝福")!;
    const turns = (lv: number) => computeLeveledSkill(blessing, lv).effects
      .filter((e) => e.kind === "SHIELD" || e.kind === "BUFF")
      .map((e) => (e as { durationTurns: number }).durationTurns);
    expect(turns(3)).toEqual([2, 2, 2]);
    expect(turns(4)).toEqual([3, 3, 3]);
  });
});

describe("8〜9. モッチーのスキル", () => {
  /*
   * **ATK・最大HP・DEFの3つが本当に足されているか。**
   * 説明文に3つ書いてあっても、実際に効いているのは1つ、という
   * 壊れ方をする(`dependentStat` はどちらか一方しか見ない作りだった)。
   */
  it("もんた: 攻撃力・最大HP・防御力の3つがすべてダメージに乗る", () => {
    const s1 = MOCCHI.skill1.effects[0];
    expect(s1).toMatchObject({ kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.05, defCoefficient: 0.5 });

    // HPを2倍にした個体の方が強く殴れる(HP項が効いている証拠)
    const hit = (hp: number, def: number) => {
      const me = probe("m", MOCCHI.skill1, { hp, def, atk: 1_000 });
      const result = new BattleEngine([me], [probe("e", IDLE, { hp: 10_000_000, def: 100, spd: 1 })],
        { rng: () => 0.5, maxTurns: 1 }).run();
      const last = result.turns[result.turns.length - 1].snapshot.find((u) => u.team === "ENEMY")!;
      return last.maxHp - last.currentHp;
    };
    expect(hit(200_000, 100)).toBeGreaterThan(hit(100_000, 100));
    expect(hit(100_000, 5_000)).toBeGreaterThan(hit(100_000, 100));
  });

  it("ガッチャー: ゲージ低下は各ヒットごとに判定する", () => {
    const gatcher = MOCCHI.skill2Variants.find((s) => s.name === "ガッチャー")!;
    const damage = gatcher.effects[0] as { hits: number; perHitEffects: { kind: string; amount: number; chance: number }[] };
    expect(damage.hits).toBe(2);
    expect(damage.perHitEffects).toEqual([{ kind: "GAUGE", amount: -0.3, chance: 0.4 }]);
  });

  /*
   * **抵抗は無視するが、免疫は貫けない。**
   * 免疫は相手が自分で用意した答えで、運で弾く抵抗とは別のもの。
   */
  it("さくらフィールド: 抵抗100%の相手には入るが、免疫の相手には入らない", () => {
    const field = MOCCHI.darkSkill3!;
    const fight = (immune: boolean) => {
      const me = probe("m", field, { spd: 300 });
      const enemy = probe("e", IDLE, { spd: 1, resistance: 1, hp: 10_000_000 });
      const engine = new BattleEngine([me], [enemy], { rng: () => 0.5, maxTurns: 1 });
      const [a, b] = engine.getUnits();
      // 免疫は `effects` ではなく `immuneTurns` が持つ
      if (immune) b.immuneTurns = 9;
      a.gauge = 100;
      engine.resolveTurn(a, { skillIndex: 0, targetId: b.instanceId });
      return b.effects.some((e) => e.kind === "DEBUFF" && e.stat === "def");
    };
    expect(fight(false), "抵抗100%で弾かれている").toBe(true);
    expect(fight(true), "免疫を貫いてしまっている").toBe(false);
  });
});

describe("12〜13. スエゾーのスキル", () => {
  it("歌う: 防御DOWN・ゲージ低下・CT延長がそれぞれ独立に判定する", () => {
    const sing = SUEZO.skill3Variants.find((s) => s.name === "歌う")!;
    const chances = sing.effects.filter((e) => "chance" in e).map((e) => (e as { chance: number }).chance);
    expect(chances).toEqual([0.8, 0.8, 0.8]);
    // 同じ判定を共有する印(chanceGroup)が付いていないこと
    for (const e of sing.effects) expect("chanceGroup" in e && e.chanceGroup).toBeFalsy();
  });

  it("食う: ゲージを吸収し、与えたダメージぶん回復する", () => {
    const eat = SUEZO.skill3Variants.find((s) => s.name === "食う")!;
    expect(eat.effects[1]).toMatchObject({ kind: "GAUGE", drain: true, amount: 0.5 });
    expect(eat.effects[2]).toMatchObject({ kind: "LIFESTEAL", healRate: 0.3 });

    const me = probe("m", eat, { spd: 300, atk: 3_000, hp: 100_000 });
    const enemy = probe("e", IDLE, { spd: 1, hp: 10_000_000 });
    const engine = new BattleEngine([me], [enemy], { rng: () => 0.5, maxTurns: 1 });
    const [a, b] = engine.getUnits();
    a.currentHp = 10_000;
    b.gauge = 50;
    const beforeGauge = a.gauge;
    a.gauge = 100;
    engine.resolveTurn(a, { skillIndex: 0, targetId: b.instanceId });
    expect(b.gauge, "相手のゲージが減っていない").toBeLessThan(50);
    expect(a.currentHp, "与ダメージぶん回復していない").toBeGreaterThan(10_000);
    expect(beforeGauge).toBeDefined();
  });
});

describe("15〜18. ウンディーネのスキル", () => {
  /*
   * **対象の最大HP基準。**フェニックスの「自身の最大HP基準」と混同すると、
   * 硬い味方を戻す時の効き目が逆になる。
   */
  it("アクアヴェール: 回復量は受け手の最大HPで決まる(術者の最大HPではない)", () => {
    const veil = UNDINE.skill2Variants.find((s) => s.name === "アクアヴェール")!;
    const heal = veil.effects[0] as { kind: string; healRate: number; scaleStat?: string };
    expect(heal).toMatchObject({ kind: "HEAL", healRate: 0.4 });
    expect(heal.scaleStat, "術者の能力値を基準にしてしまっている").toBeUndefined();

    // 受け手の最大HPを変えると回復量が変わる
    const healed = (allyMaxHp: number) => {
      const healer = probe("h", veil, { spd: 300, hp: 50_000 });
      const ally = probe("a", IDLE, { spd: 200, hp: allyMaxHp });
      const engine = new BattleEngine([healer, ally], [probe("e", IDLE, { spd: 1, hp: 10_000_000 })],
        { rng: () => 0.5, maxTurns: 1 });
      const [h, a] = engine.getUnits();
      a.currentHp = 1;
      h.gauge = 100;
      engine.resolveTurn(h, { skillIndex: 0, targetId: a.instanceId });
      return a.currentHp - 1;
    };
    expect(healed(200_000)).toBeGreaterThan(healed(100_000));
  });

  it("水神の息吹: 強化解除がゲージ低下より先に並んでいる", () => {
    const breath = UNDINE.lightSkill3!;
    for (let lv = 1; lv <= 5; lv += 1) {
      const kinds = computeLeveledSkill(breath, lv).effects.map((e) => e.kind);
      expect(kinds.indexOf("STRIP"), `Lv${lv}`).toBeLessThan(kinds.indexOf("GAUGE"));
    }
  });

  /*
   * **最大HP30%の部分に防御が効かない。**
   * 硬い相手と柔らかい相手で同じ値が出ることを測る
   * (実装を間違えても、それらしい数字は出てしまう)。
   */
  it("アクアドーム: 最大HP30%の部分は相手の防御に左右されない", () => {
    const dome = UNDINE.darkSkill3!;
    expect(dome.effects[0]).toMatchObject({ kind: "MAX_HP_DAMAGE", ratio: 0.3 });
    expect(dome.effects[1]).toMatchObject({ kind: "DAMAGE", defCoefficient: 2.1 });

    // MAX_HP_DAMAGE だけを撃つ技にして、防御の違う相手へ当てる
    const onlyHp: Skill = { ...dome, effects: [dome.effects[0]], levelOverrides: undefined };
    const dealt = (enemyDef: number) => {
      const me = probe("m", onlyHp, { spd: 300, atk: 1 });
      const enemy = probe("e", IDLE, { spd: 1, hp: 100_000, def: enemyDef });
      const engine = new BattleEngine([me], [enemy], { rng: () => 0.5, maxTurns: 1 });
      const [a, b] = engine.getUnits();
      a.gauge = 100;
      engine.resolveTurn(a, { skillIndex: 0, targetId: b.instanceId });
      return b.maxHp - b.currentHp;
    };
    expect(dealt(10_000)).toBe(dealt(10));
    expect(dealt(10)).toBe(30_000);
  });
});

describe("19. グジラの大津波", () => {
  /*
   * **防御DOWNが攻撃より先。**通った相手には、その同じ一撃から低下が効く。
   * 後ろに置くと「次のターンから効く」になり、1手ぶん遅れる。
   */
  it("防御DOWNが攻撃より前に並び、成功した相手にはその一撃から効く", () => {
    const tsunami = GUJIRA.skill3Variants.find((s) => s.name === "大津波")!;
    for (let lv = 1; lv <= 5; lv += 1) {
      const kinds = computeLeveledSkill(tsunami, lv).effects.map((e) => e.kind);
      expect(kinds.indexOf("DEBUFF"), `Lv${lv}`).toBeLessThan(kinds.indexOf("DAMAGE"));
    }

    // 防御DOWNが必ず通る形(chance 1.0)と、通らない形で与ダメージを比べる
    const dealt = (debuffChance: number) => {
      const skill: Skill = {
        ...tsunami, levelOverrides: undefined,
        effects: tsunami.effects.map((e) => (e.kind === "DEBUFF" ? { ...e, chance: debuffChance } : e)),
      };
      const me = probe("m", skill, { spd: 300, atk: 3_000, accuracy: 1 });
      const enemy = probe("e", IDLE, { spd: 1, hp: 10_000_000, def: 3_000, resistance: 0 });
      const engine = new BattleEngine([me], [enemy], { rng: () => 0.5, maxTurns: 1 });
      const [a, b] = engine.getUnits();
      a.gauge = 100;
      engine.resolveTurn(a, { skillIndex: 0, targetId: b.instanceId });
      return b.maxHp - b.currentHp;
    };
    expect(dealt(1.0), "先に守りを崩したのにダメージが増えていない").toBeGreaterThan(dealt(0));
  });
});

describe("23〜27. 画像・セーブ・図鑑・召喚・照合表", () => {
  const ASSETS = fileURLToPath(new URL("../src/web/assets/monsters", import.meta.url));

  it("24属性ぶんの絵がすべて置いてある", () => {
    const files = new Set(readdirSync(ASSETS));
    const missing: string[] = [];
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const name = `${t.templateId}-${element}.webp`;
        if (!files.has(name)) missing.push(name);
      }
    }
    expect(missing, `絵が無い:\n${missing.join("\n")}`).toEqual([]);
  });

  it("sprites.json に24件ぶんの測定値が入っている", () => {
    const manifest = JSON.parse(readFileSync(join(ASSETS, "sprites.json"), "utf8")) as Record<string, unknown>;
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        expect(manifest[`${t.templateId}-${element}`], `${t.templateId}-${element}`).toBeDefined();
      }
    }
  });

  it("24体のスキルレベルをセーブして読み戻せる", () => {
    const state = createInitialState();
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const m = addMonster(state, createMonsterVariant(t, element).id, t.gachaStar!);
        m.skillLevels = [5, 3, 4];
      }
    }
    expect(decodeSave(encodeSave(state))).toEqual(state);
  });

  it("図鑑に24体すべてが載る", () => {
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const id = createMonsterVariant(t, element).id;
        expect(ALL_DISPLAYABLE_MONSTERS_DEX.some((d) => d.id === id), `図鑑に無い: ${id}`).toBe(true);
        expect(MONSTER_DEX.some((d) => d.id === id), `MONSTER_DEX に無い: ${id}`).toBe(true);
      }
    }
  });

  it("召喚のプールに、星どおりに入っている", () => {
    expect(GACHA_STAR4_TEMPLATES.map((t) => t.templateId)).toContain("mocchi");
    expect(GACHA_STAR4_TEMPLATES.map((t) => t.templateId)).toContain("suezo");
    expect(GACHA_STAR5_TEMPLATES.map((t) => t.templateId)).toContain("undine");
    expect(GACHA_STAR5_TEMPLATES.map((t) => t.templateId)).toContain("gujira");
    // 星を跨いでいないこと
    expect(GACHA_STAR5_TEMPLATES.map((t) => t.templateId)).not.toContain("mocchi");
    expect(GACHA_STAR4_TEMPLATES.map((t) => t.templateId)).not.toContain("gujira");
  });

  /*
   * **アリーナの照合表に無い個体は、防衛編成に置けない。**
   * 過去に「存在しないdexId」で対戦不能になった事故があったので、
   * 24体が最新の migration に載っていることをここでも見る。
   */
  it("アリーナの照合表に24体が載っている", () => {
    const dir = fileURLToPath(new URL("../supabase/migrations", import.meta.url));
    const latest = readdirSync(dir)
      .filter((name) => name.includes("arena_catalog") && name.endsWith(".sql"))
      .sort()
      .at(-1)!;
    const sql = readFileSync(join(dir, latest), "utf8");
    for (const t of COLLAB_MONSTER_TEMPLATES) {
      for (const element of ELEMENTS) {
        const id = createMonsterVariant(t, element).id;
        expect(sql.includes(`'${id}'`), `照合表に無い: ${id}(${latest})`).toBe(true);
      }
    }
  });
});

/* ───────── 測るための小道具 ───────── */

const IDLE: Skill = {
  id: "idle", name: "待機", description: "", target: "SINGLE_ENEMY", cooldownTurns: 0, effects: [],
};

/** 能力値だけを指定して1体作る。スキルは3枠とも同じものを入れる */
function probe(
  id: string, skill: Skill,
  stats: { hp?: number; atk?: number; def?: number; spd?: number; accuracy?: number; resistance?: number } = {},
): MonsterDefinition {
  return {
    id, templateId: id, name: id, element: "GRASS", emoji: "🟢", color: "#0f0", role: "テスト",
    stats: {
      hp: 100_000, atk: 1_000, def: 100, spd: 100,
      criRate: 0, criDmg: 1.5, resistance: 0, accuracy: 1, ...stats,
    },
    skills: [skill, skill, skill],
  } as MonsterDefinition;
}
