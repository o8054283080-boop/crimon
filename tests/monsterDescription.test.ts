import { describe, expect, it } from "vitest";
import { ELEMENTS } from "../src/core/element.js";
import { MonsterTemplate, createMonsterVariant } from "../src/core/monster.js";
import type { Skill, SkillEffect } from "../src/core/skill.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";

/*
 * スキルの説明文が、実際の効果と食い違っていないか。
 *
 * モンスターを1体足すのに、スキル7本とその説明文を手で書くことになる。
 * **型チェックは通るのに中身が嘘になっている**という壊れ方をするので、
 * ここで機械的に見張る。
 *
 * これを作った時点で本物の嘘が2つ見つかっている。古代の呪晶の
 * 「呪縛の波動」は強化効果を剥がし、「破滅の呪詛」は回復封じを付けるのに、
 * **説明文にはどちらも一言も書かれていなかった**。
 * プレイヤーには何が起きたのか分からない状態だった。
 *
 * 検診の道具は `npx tsx tools/monsterDoctor.mts`(属性ごとの表・雛形も出せる)。
 * ここはその中から、**壊れたら必ず落ちてほしいもの**だけを写してある。
 */

/**
 * 効果ごとに、説明文へ現れるべき言葉。
 * **実データから拾った語彙**で組んである(思い付きで決めると、
 * 正しい説明文まで落とし始めて誰もテストを信じなくなる)。
 */
const REQUIRED_WORDS: Record<SkillEffect["kind"], string[]> = {
  DAMAGE: ["ダメージ", "一撃"],
  DEBUFF: ["低下"],
  BUFF: ["上昇", "高める"],
  STATUS: [], // 本番モンスターへは次のバランス調整で割り当てる
  POISON: ["毒"],
  BURN: ["火傷", "やけど"],
  BLIND: ["暗闇"],
  STUN: ["スタン", "気絶", "行動不能"],
  GAUGE: ["ゲージ"],
  SHIELD: ["シールド", "盾"],
  REGEN: ["毎ターン", "継続回復"],
  CLEANSE: ["解除"],
  HEAL: ["回復"],
  IMMUNITY: ["無効", "免疫"],
  LIFESTEAL: ["回復", "吸収"],
  COOLDOWN_EXTEND: ["クールタイム", "待ち時間"],
  STRIP: ["剥が", "はが", "打ち消", "取り除"],
  HEAL_BLOCK: ["回復封じ", "回復不能", "回復を封"],
};

function allSkills(t: MonsterTemplate): { where: string; skill: Skill }[] {
  const out = [{ where: `${t.templateId}/${t.skill1.id}`, skill: t.skill1 }];
  for (const s of t.skill2Variants) out.push({ where: `${t.templateId}/${s.id}`, skill: s });
  for (const s of t.skill3Variants) out.push({ where: `${t.templateId}/${s.id}`, skill: s });
  // 光/闇の固有スキルは変種の一覧にも入っていることがある(同じ実体を二度数えない)
  for (const s of [t.lightSkill3, t.darkSkill3]) {
    if (s && !t.skill3Variants.includes(s)) out.push({ where: `${t.templateId}/${s.id}`, skill: s });
  }
  return out;
}

const EVERY_SKILL = ALL_MONSTER_TEMPLATES.flatMap(allSkills);

describe("スキルの説明文と効果", () => {
  it("実際に起きる効果は、必ず説明文に書かれている", () => {
    const lies: string[] = [];
    for (const { where, skill } of EVERY_SKILL) {
      const d = skill.description ?? "";
      for (const effect of skill.effects) {
        const words = REQUIRED_WORDS[effect.kind];
        if (words.length > 0 && !words.some((w) => d.includes(w))) {
          lies.push(`${where}: ${effect.kind} が説明文に無い —「${d}」`);
        }
      }
    }
    expect(lies, `効果が説明されていないスキル:\n${lies.join("\n")}`).toEqual([]);
  });

  it("説明文に書かれた数字が、実際の効果と一致している", () => {
    const lies: string[] = [];
    for (const { where, skill } of EVERY_SKILL) {
      const d = skill.description ?? "";
      const effects = skill.effects as (SkillEffect & Record<string, unknown>)[];
      const declared = (re: RegExp, scale = 1) => [...d.matchAll(re)].map((m) => Number(m[1]) * scale);
      const actual = (key: string) => effects.map((e) => e[key]).filter((v): v is number => typeof v === "number");

      const pairs = [
        { label: "倍率", want: declared(/攻撃力([0-9.]+)倍/g), have: actual("multiplier") },
        { label: "発動率", want: declared(/([0-9]+)%で/g, 0.01), have: actual("chance") },
        { label: "ターン数", want: declared(/([0-9]+)ターン/g), have: [...actual("durationTurns"), ...actual("turns")] },
        { label: "回数", want: declared(/([0-9]+)回/g), have: actual("hits") },
      ];
      for (const { label, want, have } of pairs) {
        if (have.length === 0) continue;
        for (const w of want) {
          if (!have.some((h) => Math.abs(h - w) < 1e-6)) {
            lies.push(`${where}: 説明文の${label} ${w} が効果に無い(実際 ${have.join(",")})`);
          }
        }
      }
    }
    expect(lies, `数字が食い違うスキル:\n${lies.join("\n")}`).toEqual([]);
  });
});

describe("スキルidの規約", () => {
  it("重複したidが無い", () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const { where, skill } of EVERY_SKILL) {
      const already = seen.get(skill.id);
      if (already) dupes.push(`${skill.id}: ${already} と ${where}`);
      else seen.set(skill.id, where);
    }
    expect(dupes, `idが重複:\n${dupes.join("\n")}`).toEqual([]);
  });

  it("idが種族名で始まっている", () => {
    const odd = ALL_MONSTER_TEMPLATES.flatMap((t) =>
      allSkills(t)
        .filter(({ skill }) => !skill.id.startsWith(`${t.templateId}_`))
        .map(({ skill }) => `${t.templateId}: ${skill.id}`),
    );
    expect(odd, `種族名で始まっていないid:\n${odd.join("\n")}`).toEqual([]);
  });
});

describe("属性ごとの実体化", () => {
  it("どの属性でもスキルが3つ揃う", () => {
    /*
     * **どの属性がどの変種を引くかはハッシュで決まる。**
     * 「この種族は盾を張る」と思っていても、属性によっては
     * 盾を持たない変種が選ばれる(試練の塔の守りの階で実際に起きた)。
     * ここでは「3つ揃うこと」だけを見る。何を引くかは
     * `npx tsx tools/monsterDoctor.mts --table <種族>` で目視すること。
     */
    for (const t of ALL_MONSTER_TEMPLATES) {
      for (const element of t.elements ?? ELEMENTS) {
        const def = createMonsterVariant(t, element);
        expect(def.skills, `${t.templateId}[${element}]`).toHaveLength(3);
        expect(def.skills.every(Boolean), `${t.templateId}[${element}] に空のスキルがある`).toBe(true);
      }
    }
  });
});
