import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MonsterDefinition } from "../src/core/monster.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { MAX_SKILL_LEVEL, computeLeveledSkill, type Skill, type SkillEffect } from "../src/core/skill.js";
import { COLLAB_MONSTERS_DEX, MONSTER_DEX_ENTRIES, findMonsterById } from "../src/data/monsters.js";
import { isCrim } from "../src/game/crim.js";
import { checkMonsterCreate, creatableSkills } from "../src/game/monsterCreate.js";
import {
  EMPTY_SKILL_DEX_FILTER, SKILL_DEX_SLOTS, buildSkillDexIndex, filterSkillDex, normalizeSkillSearch,
  resetSkillDexFilter, skillDexFacets, skillDexFilterCount, skillEffectTags,
  type SkillDexFilter, type SkillDexSlot,
} from "../src/game/skillDex.js";

/**
 * スキル図鑑。
 *
 * **図鑑は実際のスキル定義を読んでいるだけ**であることを、ここで確かめる。
 * 別の表を持たないので、スキル調整をしても図鑑だけ古い数字が残ることはない。
 * 効果の札は SkillEffect から作り、手書きの説明文は見ない。
 */

const INDEX = buildSkillDexIndex(MONSTER_DEX_ENTRIES);

function search(slot: SkillDexSlot, patch: Partial<SkillDexFilter> = {}) {
  return filterSkillDex(INDEX, { ...EMPTY_SKILL_DEX_FILTER, slot, ...patch });
}

function holderIds(results: ReturnType<typeof search>): string[] {
  return results.flatMap((r) => r.holders.map((dex) => dex.id));
}

describe("スキル図鑑: 網羅(図鑑の全モンスター・全枠が索引に載る)", () => {
  it("図鑑に並ぶ全モンスターの スキル1/2/3 が、同じ枠の札に必ず載っている", () => {
    let slots = 0;
    for (const dex of MONSTER_DEX_ENTRIES) {
      for (const slot of SKILL_DEX_SLOTS) {
        const entry = INDEX.find((e) => e.key === `${slot}:${dex.skills[slot].id}`);
        expect(entry, `${dex.id} のスキル${slot + 1}(${dex.skills[slot].name})が載っていない`).toBeDefined();
        expect(entry!.holders).toContain(dex);
        slots += 1;
      }
    }
    expect(slots).toBe(MONSTER_DEX_ENTRIES.length * 3);
    // 札の持ち主を全部足すと、図鑑の枠の数とぴったり一致する(二重にも載らない)
    expect(INDEX.reduce((sum, e) => sum + e.holders.length, 0)).toBe(slots);
  });

  it("件数の監査(数を控えておく。モンスターを足せば自動で増える)", () => {
    const perSlot = SKILL_DEX_SLOTS.map((slot) => INDEX.filter((e) => e.slot === slot).length);
    const audit = {
      monsters: MONSTER_DEX_ENTRIES.length,
      entries: INDEX.length,
      s1: perSlot[0], s2: perSlot[1], s3: perSlot[2],
      passiveEntries: INDEX.filter((e) => e.isPassive).length,
      passiveSlots: MONSTER_DEX_ENTRIES.flatMap((d) => d.skills).filter((s) => s.passive).length,
      creatable: INDEX.filter((e) => e.creatable).length,
    };
    // 下限だけを見る(モンスターが増えても落ちない)。中身は報告のために出す
    console.info("[skillDex audit]", JSON.stringify(audit));
    expect(audit.monsters).toBeGreaterThanOrEqual(205);
    expect(audit.s1 + audit.s2 + audit.s3).toBe(audit.entries);
    expect(audit.passiveEntries).toBeGreaterThan(0);
  });

  it("同じIDのスキルは、どの持ち主でも中身が同じ(だから1枚にまとめてよい)", () => {
    for (const entry of INDEX) {
      const first = JSON.stringify(entry.holders[0].skills[entry.slot]);
      for (const dex of entry.holders) {
        expect(JSON.stringify(dex.skills[entry.slot]), `${entry.skill.id} の中身が ${dex.id} だけ違う`).toBe(first);
      }
    }
  });

  it("名前が同じでもIDが違えばまとめない(ドラゴンの属性違いの技)", () => {
    const byName = new Map<string, Set<string>>();
    for (const e of INDEX) byName.set(`${e.slot}:${e.skill.name}`, (byName.get(`${e.slot}:${e.skill.name}`) ?? new Set()).add(e.skill.id));
    const split = [...byName.values()].filter((ids) => ids.size > 1);
    expect(split.length).toBeGreaterThan(0);
  });
});

describe("スキル図鑑: 唯一の正(実際のスキル定義を参照する)", () => {
  it("札のスキルは、図鑑のスキル定義そのもの(複製していない)", () => {
    for (const entry of INDEX) {
      // 最初の持ち主の定義をそのまま指す。ほかの持ち主は中身が同じ(上の検査)
      expect(entry.skill).toBe(entry.holders[0].skills[entry.slot]);
      for (const dex of entry.holders) expect(dex.skills[entry.slot]).toStrictEqual(entry.skill);
    }
  });

  it("索引を作っても、モンスター定義は1文字も変わらない(図鑑・戦闘へ影響しない)", () => {
    const before = JSON.stringify(MONSTER_DEX_ENTRIES);
    buildSkillDexIndex(MONSTER_DEX_ENTRIES);
    filterSkillDex(INDEX, { ...EMPTY_SKILL_DEX_FILTER, query: "防御DOWN 全体", effects: ["attack"] });
    expect(JSON.stringify(MONSTER_DEX_ENTRIES)).toBe(before);
  });

  it("定義を変えれば、次に作った索引も変わる(図鑑だけ古い数字が残らない)", () => {
    const base = MONSTER_DEX_ENTRIES.find((d) => d.id === "slime_FIRE")!;
    const tuned: MonsterDefinition = {
      ...base,
      skills: [base.skills[0], { ...base.skills[1], cooldownTurns: base.skills[1].cooldownTurns + 7 }, base.skills[2]],
    };
    const index = buildSkillDexIndex([tuned]);
    expect(index.find((e) => e.slot === 1)!.skill.cooldownTurns).toBe(base.skills[1].cooldownTurns + 7);
  });

  it("今後足したモンスターも、図鑑の一覧へ入れば自動で載る", () => {
    const base = MONSTER_DEX_ENTRIES[0];
    const newcomer: MonsterDefinition = {
      ...base, id: "future_FIRE", name: "ミライモン[火]",
      skills: [base.skills[0], { ...base.skills[1], id: "future_s2", name: "みらいのいちげき" }, base.skills[2]],
    };
    const index = buildSkillDexIndex([...MONSTER_DEX_ENTRIES, newcomer]);
    const found = filterSkillDex(index, { ...EMPTY_SKILL_DEX_FILTER, slot: 1, query: "ミライモン" });
    expect(found.map((r) => r.entry.skill.id)).toEqual(["future_s2"]);
  });

  it("画面は図鑑と同じ一覧(MONSTER_DEX_ENTRIES)から索引を作る。別のスキル表を読まない", () => {
    const view = readFileSync("src/web/views/skillDex.ts", "utf8");
    expect(view).toContain("buildSkillDexIndex(MONSTER_DEX_ENTRIES)");
    const logic = readFileSync("src/game/skillDex.ts", "utf8");
    // 索引の側はデータを取り込まない(渡されたモンスター定義だけを読む)
    expect(logic).not.toMatch(/from "\.\.\/data\//);
  });
});

describe("スキル図鑑: スキル1/2/3の切り替え", () => {
  it.each([0, 1, 2] as const)("スキル%iの枠を選ぶと、その枠のスキルだけが出る", (slot) => {
    const results = search(slot);
    expect(results.length).toBeGreaterThan(0);
    for (const { entry } of results) {
      expect(entry.slot).toBe(slot);
      for (const dex of entry.holders) expect(dex.skills[slot].id).toBe(entry.skill.id);
    }
    expect(results.length).toBe(INDEX.filter((e) => e.slot === slot).length);
  });

  it("はじめはスキル2(クリエイトの素材探しから入る)", () => {
    expect(EMPTY_SKILL_DEX_FILTER.slot).toBe(1);
  });
});

describe("スキル図鑑: フリーワード検索", () => {
  it("モンスター名で探せる(属性を付けても付けなくても)", () => {
    const results = search(1, { query: "スライム" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(({ entry }) => entry.holders.some((d) => d.name.startsWith("スライム")))).toBe(true);
    expect(search(1, { query: "スライム[火]" }).some(({ entry }) => entry.holders.some((d) => d.id === "slime_FIRE"))).toBe(true);
  });

  it("スキル名で探せる。ひらがな・カタカナ・全角半角の違いは気にしない", () => {
    const skill = findMonsterById("slime_FIRE")!.skills[1];
    const hit = search(1, { query: skill.name });
    expect(hit.map((r) => r.entry.skill.id)).toContain(skill.id);
    const hira = skill.name.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    expect(search(1, { query: hira }).map((r) => r.entry.skill.id)).toContain(skill.id);
    expect(normalizeSkillSearch("ＤＯＷＮ")).toBe(normalizeSkillSearch("down"));
  });

  it("「防御DOWN」は効果に防御DEBUFFを持つスキルだけ。言い方が違っても同じ結果", () => {
    const expected = INDEX.filter((e) => e.slot === 1 && e.effectTags.has("def_down")).map((e) => e.key).sort();
    expect(expected.length).toBeGreaterThan(0);
    for (const word of ["防御DOWN", "防御ダウン", "防御力低下", "防御 down", "防御・ダウン", "防御ｄｏｗｎ"]) {
      expect(search(1, { query: word }).map((r) => r.entry.key).sort(), word).toEqual(expected);
    }
    // 札の中身が本当に DEBUFF(def) を含むこと(Lv1〜5のどこか。1撃ごとの効果の中も見る)
    const hasDefDebuff = (effects: readonly SkillEffect[]): boolean => effects.some((e) =>
      (e.kind === "DEBUFF" && e.stat === "def") || (e.kind === "DAMAGE" && hasDefDebuff(e.perHitEffects ?? [])));
    for (const key of expected) {
      const entry = INDEX.find((e) => e.key === key)!;
      const levels = Array.from({ length: MAX_SKILL_LEVEL }, (_, i) => computeLeveledSkill(entry.skill, i + 1));
      expect(levels.some((s) => hasDefDebuff(s.effects)), entry.skill.name).toBe(true);
    }
  });

  it("「回復」は回復・吸血・継続回復だけで、回復阻害には当たらない", () => {
    const results = search(2, { query: "回復" });
    expect(results.length).toBeGreaterThan(0);
    for (const { entry } of results) {
      expect(["heal", "lifesteal", "regen"].some((t) => entry.effectTags.has(t as never)), entry.skill.name).toBe(true);
    }
    const blockOnly = INDEX.filter((e) => e.slot === 2 && e.effectTags.has("heal_block")
      && !e.effectTags.has("heal") && !e.effectTags.has("lifesteal") && !e.effectTags.has("regen"));
    for (const entry of blockOnly) expect(results.map((r) => r.entry)).not.toContain(entry);
  });

  it("「シールド」「バリア」は SHIELD 効果を持つスキル", () => {
    const expected = INDEX.filter((e) => e.slot === 1 && e.effectTags.has("shield")).map((e) => e.key).sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(search(1, { query: "シールド" }).map((r) => r.entry.key).sort()).toEqual(expected);
    expect(search(1, { query: "バリア" }).map((r) => r.entry.key).sort()).toEqual(expected);
  });

  it("「ゲージDOWN」は行動ゲージを減らす・吸うスキル(増やす方は入らない)", () => {
    const results = search(2, { query: "ゲージDOWN" });
    expect(results.length).toBeGreaterThan(0);
    for (const { entry } of results) expect(entry.effectTags.has("gauge_down"), entry.skill.name).toBe(true);
    expect(search(2, { query: "行動ゲージダウン" }).length).toBe(results.length);
  });

  it("空白で区切った語は、すべてを満たすもの", () => {
    const both = search(1, { query: "防御DOWN 全体攻撃" });
    for (const { entry } of both) {
      expect(entry.effectTags.has("def_down")).toBe(true);
      expect(entry.effectTags.has("aoe_attack")).toBe(true);
    }
    expect(both.length).toBeLessThan(search(1, { query: "防御DOWN" }).length);
  });

  it("何にも当たらない語は0件", () => {
    expect(search(1, { query: "そんなすきるはないよzzz" })).toEqual([]);
  });
});

describe("スキル図鑑: 絞り込み", () => {
  it("属性で絞ると、その属性の持ち主だけが並ぶ", () => {
    const results = search(1, { elements: ["WATER"] });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.holders.length).toBeGreaterThan(0);
      expect(r.holders.every((d) => d.element === "WATER")).toBe(true);
    }
  });

  it("単体・全体で絞れる(skillTags と同じ判定)", () => {
    const single = search(2, { targets: ["single"] });
    const aoe = search(2, { targets: ["aoe"] });
    expect(single.length).toBeGreaterThan(0);
    expect(aoe.length).toBeGreaterThan(0);
    expect(single.every((r) => r.entry.targetTags.has("single"))).toBe(true);
    expect(aoe.every((r) => r.entry.targetTags.has("aoe"))).toBe(true);
    // 対象は「どれか」: 単体+全体は、それぞれの和
    const either = search(2, { targets: ["single", "aoe"] }).length;
    const overlap = single.filter((r) => r.entry.targetTags.has("aoe")).length;
    expect(either).toBe(single.length + aoe.length - overlap);
  });

  it("効果・属性・対象・検索語を重ねると、全部を満たすものだけ", () => {
    const results = search(2, { query: "攻撃", effects: ["def_down"], elements: ["FIRE", "WATER"], targets: ["aoe"] });
    for (const r of results) {
      expect(r.entry.effectTags.has("def_down")).toBe(true);
      expect(r.entry.targetTags.has("aoe")).toBe(true);
      expect(r.holders.every((d) => d.element === "FIRE" || d.element === "WATER")).toBe(true);
    }
    const effectsOnly = search(2, { effects: ["def_down"] });
    expect(results.length).toBeLessThanOrEqual(effectsOnly.length);
  });

  it("効果を2つ選ぶと、両方を持つもの", () => {
    const results = search(1, { effects: ["attack", "def_down"] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.entry.effectTags.has("attack") && r.entry.effectTags.has("def_down"))).toBe(true);
  });

  it("条件のリセットは、枠を残して検索語と条件を全部外す", () => {
    const busy: SkillDexFilter = {
      slot: 2, query: "回復", effects: ["heal"], elements: ["FIRE"], targets: ["aoe"], creatableOnly: true,
    };
    expect(skillDexFilterCount(busy)).toBe(4);
    const reset = resetSkillDexFilter(busy);
    expect(reset).toEqual({ ...EMPTY_SKILL_DEX_FILTER, slot: 2 });
    expect(skillDexFilterCount(reset)).toBe(0);
    expect(filterSkillDex(INDEX, reset).length).toBe(INDEX.filter((e) => e.slot === 2).length);
  });

  it("絞り込みの札は、その枠に実在する効果・属性だけ", () => {
    for (const slot of SKILL_DEX_SLOTS) {
      const { effects, elements } = skillDexFacets(INDEX, slot);
      for (const tag of effects) expect(search(slot, { effects: [tag] }).length, `${slot}:${tag}`).toBeGreaterThan(0);
      for (const element of elements) expect(search(slot, { elements: [element] }).length).toBeGreaterThan(0);
    }
    // パッシブはスキル1には居ない
    expect(skillDexFacets(INDEX, 0).effects.has("passive")).toBe(false);
  });
});

describe("スキル図鑑: 効果の札は SkillEffect から作る", () => {
  const fake = (patch: Partial<Skill>): Skill => ({
    id: "fake", name: "にせもの", description: "", target: "SINGLE_ENEMY", cooldownTurns: 3, effects: [], ...patch,
  });

  it("説明文に「防御DOWN」と書いてあっても、DEBUFF(def) が無ければ札は付かない", () => {
    const liar = fake({
      name: "防御DOWNの一撃", description: "敵の防御DOWN(2ターン)。防御力低下。",
      effects: [{ kind: "DAMAGE", multiplier: 1.2 }],
    });
    const tags = skillEffectTags(liar);
    expect(tags.has("def_down")).toBe(false);
    expect(tags.has("attack")).toBe(true);
    // 検索でも、効果の名前としては当たらない(スキル名の文字列としてだけ当たる)
    const base = MONSTER_DEX_ENTRIES[0];
    const index = buildSkillDexIndex([{ ...base, skills: [base.skills[0], liar, base.skills[2]] }]);
    expect(filterSkillDex(index, { ...EMPTY_SKILL_DEX_FILTER, slot: 1, query: "防御DOWN" })).toEqual([]);
    expect(filterSkillDex(index, { ...EMPTY_SKILL_DEX_FILTER, slot: 1, effects: ["def_down"] })).toEqual([]);
  });

  it("説明文が空でも、効果に DEBUFF(def) があれば札が付く", () => {
    const quiet = fake({ effects: [{ kind: "DEBUFF", stat: "def", amount: 0.3, durationTurns: 2, chance: 1 }] });
    expect(skillEffectTags(quiet).has("def_down")).toBe(true);
  });

  it("効果の種類ごとの札", () => {
    const tagsOf = (effects: Skill["effects"], patch: Partial<Skill> = {}) => [...skillEffectTags(fake({ effects, ...patch }))].sort();
    expect(tagsOf([{ kind: "DAMAGE", multiplier: 1, hits: 3 }])).toEqual(["attack", "multi_hit", "single_attack"]);
    expect(tagsOf([{ kind: "DAMAGE", multiplier: 1 }], { target: "ALL_ENEMIES" })).toEqual(["aoe_attack", "attack"]);
    expect(tagsOf([{ kind: "HEAL", healRate: 0.2 }], { target: "ALL_ALLIES" })).toEqual(["heal"]);
    expect(tagsOf([{ kind: "SHIELD", shieldRate: 0.2, durationTurns: 2 }], { target: "ALL_ALLIES" })).toEqual(["shield"]);
    expect(tagsOf([{ kind: "GAUGE", amount: -0.3 }])).toEqual(["gauge_down"]);
    expect(tagsOf([{ kind: "GAUGE", amount: 0.3 }], { target: "ALL_ALLIES" })).toEqual(["gauge_up"]);
    expect(tagsOf([{ kind: "BUFF", stat: "spd", amount: 0.3, durationTurns: 2 }], { target: "ALL_ALLIES" })).toEqual(["spd_up"]);
    expect(tagsOf([{ kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 1 }])).toEqual(["crit_taken_up"]);
    expect(tagsOf([], { extraTurn: true })).toContain("extra_turn");
  });

  it("1撃ごとの効果(perHitEffects)とLv2〜5で付く効果も拾う", () => {
    const perHit = fake({ effects: [{ kind: "DAMAGE", multiplier: 1, hits: 2, perHitEffects: [{ kind: "STUN", chance: 0.2, durationTurns: 1 }] }] });
    expect(skillEffectTags(perHit).has("stun")).toBe(true);
    const late = fake({
      levelOverrides: [
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1 }] },
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1 }] },
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.1 }] },
        { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.2 }] },
        { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.2 }, { kind: "STRIP", count: 1, chance: 1 }] },
      ],
    });
    expect(skillEffectTags(late).has("strip")).toBe(true);
  });

  it("パッシブは「パッシブ」の札だけ", () => {
    const passive = INDEX.find((e) => e.isPassive)!;
    expect([...passive.effectTags]).toEqual(["passive"]);
  });
});

describe("スキル図鑑: クリエイトと同じ決まり", () => {
  it("パッシブは「継承できる」にならない", () => {
    const passives = INDEX.filter((e) => e.isPassive);
    expect(passives.length).toBeGreaterThan(0);
    expect(passives.every((e) => !e.creatable)).toBe(true);
    expect(search(2, { creatableOnly: true }).some((r) => r.entry.isPassive)).toBe(false);
  });

  it("スキル1は継承できない", () => {
    expect(INDEX.filter((e) => e.slot === 0).every((e) => !e.creatable)).toBe(true);
  });

  it("「継承できる」は、実際の creatableSkills / checkMonsterCreate と一致する", () => {
    const target = createMonsterInstance("slime_FIRE", 6, 1);
    for (const entry of INDEX) {
      if (entry.slot === 0) continue;
      const realCreatable = entry.holders.some((dex) => {
        const material = createMonsterInstance(dex.id, 6, 1);
        if (material.dexId === target.dexId) return creatableSkills(material).some((c) => c.slot === entry.slot);
        const check = checkMonsterCreate(target, material, []);
        return check.ok && creatableSkills(material).some((c) => c.slot === entry.slot && c.skill.id === entry.skill.id);
      });
      expect(entry.creatable, `${entry.key} ${entry.skill.name}`).toBe(realCreatable);
    }
  });

  it("クリムのスキルは載るが、クリムしか持たないスキルは継承できない", () => {
    const crimEntries = INDEX.filter((e) => e.holders.some((d) => isCrim({ dexId: d.id })));
    expect(crimEntries.length).toBe(3);
    for (const e of crimEntries) {
      if (e.holders.every((d) => isCrim({ dexId: d.id }))) expect(e.creatable).toBe(false);
    }
    expect(search(0, { query: "クリム" }).length).toBe(1);
  });
});

describe("スキル図鑑: コラボ・特別なモンスターも載る", () => {
  it("コラボモンスターの全スキルが載り、名前で探せる", () => {
    expect(COLLAB_MONSTERS_DEX.length).toBeGreaterThan(0);
    for (const dex of COLLAB_MONSTERS_DEX) {
      for (const slot of SKILL_DEX_SLOTS) {
        expect(INDEX.some((e) => e.slot === slot && e.holders.includes(dex))).toBe(true);
      }
    }
    for (const name of ["モッチー", "スエゾー", "ウンディーネ", "グジラ"]) {
      expect(search(1, { query: name }).length, name).toBeGreaterThan(0);
    }
  });
});
