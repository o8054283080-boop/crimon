import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MATERIAL_PIG_KINDS, MATERIAL_PIG_LABEL, MATERIAL_PIG_TEMPLATE_IDS,
  filterRoleOf, materialPigKindOf,
} from "../src/core/materialPig.js";
import { EXP_PIG, MONSTER_DEX_ENTRIES, REINCARNATION_PIG, SKILL_PIG } from "../src/data/monsters.js";
import { EMPTY_MONSTER_FILTER, availableFacets, filterMonsters } from "../src/web/monsterFilter.js";
import { EMPTY_DEX_FILTER, dexFacets, filterDexEntries } from "../src/game/monsterDexFilter.js";
import { MonsterInstance } from "../src/core/monsterInstance.js";

/**
 * 素材ピッグ3種を、絞り込みの上で別のものとして扱う。
 *
 * **3種とも役割は「素材」で同じ**だったので、役割で絞ると1枚にまとまり、
 * 「経験ピッグだけ見たい」ができなかった。使い道はまったく違う——
 * 星を上げる / 経験値を渡す / スキルを伸ばす。
 *
 * 判定は `src/core/materialPig.ts` の1か所に集めてある。
 * **片方の絞り込みだけ分かれている**状態を作らないため、
 * ここでは3系統(所持モンスター・図鑑・素材選択)すべてを見張る。
 */
describe("素材ピッグの見分け", () => {
  it("テンプレートIDが図鑑の定義と一致している", () => {
    // ここがずれると、絞り込みが静かに効かなくなる(型では気づけない)
    expect(MATERIAL_PIG_TEMPLATE_IDS.REINCARNATION).toBe(REINCARNATION_PIG.templateId);
    expect(MATERIAL_PIG_TEMPLATE_IDS.EXP).toBe(EXP_PIG.templateId);
    expect(MATERIAL_PIG_TEMPLATE_IDS.SKILL).toBe(SKILL_PIG.templateId);
  });

  it("3種とも図鑑上の役割は「素材」で同じ（だから分ける必要がある）", () => {
    expect(REINCARNATION_PIG.role).toBe("素材");
    expect(EXP_PIG.role).toBe("素材");
    expect(SKILL_PIG.role).toBe("素材");
  });

  it("テンプレートIDから種類が引ける", () => {
    expect(materialPigKindOf("reincarnation_pig")).toBe("REINCARNATION");
    expect(materialPigKindOf("exp_pig")).toBe("EXP");
    expect(materialPigKindOf("skill_pig")).toBe("SKILL");
    expect(materialPigKindOf("dragon")).toBeNull();
    expect(materialPigKindOf(undefined)).toBeNull();
  });

  it("絞り込みに出す役割名は、ピッグだけ種類になる", () => {
    expect(filterRoleOf({ templateId: "exp_pig", role: "素材" })).toBe("経験ピッグ");
    expect(filterRoleOf({ templateId: "skill_pig", role: "素材" })).toBe("スキルピッグ");
    expect(filterRoleOf({ templateId: "reincarnation_pig", role: "素材" })).toBe("転生ピッグ");
    // ピッグ以外は役割のまま
    expect(filterRoleOf({ templateId: "dragon", role: "アタッカー" })).toBe("アタッカー");
    expect(filterRoleOf(undefined)).toBeNull();
  });

  it("3種すべてに札の名前があり、並ぶ順が決まっている", () => {
    expect(MATERIAL_PIG_KINDS).toHaveLength(3);
    for (const kind of MATERIAL_PIG_KINDS) expect(MATERIAL_PIG_LABEL[kind]).toBeTruthy();
  });
});

/** 図鑑から1体ずつ拾って、所持している体で作る */
function instance(dexId: string, id: string): MonsterInstance {
  return {
    id,
    dexId,
    star: 3,
    level: 1,
    exp: 0,
    equipment: {},
    skillLevels: [1, 1, 1],
  } as MonsterInstance;
}

describe("所持モンスターの絞り込みで分かれる", () => {
  const pigIds = MATERIAL_PIG_KINDS.map((kind) => {
    const dex = MONSTER_DEX_ENTRIES.find((d) => d.templateId === MATERIAL_PIG_TEMPLATE_IDS[kind])!;
    return { kind, dexId: dex.id };
  });
  const dragon = MONSTER_DEX_ENTRIES.find((d) => d.templateId === "dragon")!;
  const monsters = [
    ...pigIds.map((p, i) => instance(p.dexId, `pig${i}`)),
    instance(dragon.id, "dragon"),
  ];
  const context = { partyIds: [] };

  it("札が3種に分かれて出る（「素材」1枚にまとまらない）", () => {
    const roles = availableFacets(monsters).roles;
    for (const kind of MATERIAL_PIG_KINDS) expect(roles).toContain(MATERIAL_PIG_LABEL[kind]);
    expect(roles).not.toContain("素材");
  });

  it("種類で絞ると、その1体だけが残る", () => {
    for (const { kind, dexId } of pigIds) {
      const shown = filterMonsters(monsters, { ...EMPTY_MONSTER_FILTER, roles: [MATERIAL_PIG_LABEL[kind]] }, context);
      expect(shown.map((m) => m.dexId), MATERIAL_PIG_LABEL[kind]).toEqual([dexId]);
    }
  });

  it("ピッグ以外の役割はこれまでどおり", () => {
    const shown = filterMonsters(monsters, { ...EMPTY_MONSTER_FILTER, roles: [dragon.role] }, context);
    expect(shown.map((m) => m.id)).toEqual(["dragon"]);
  });
});

describe("図鑑の絞り込みで分かれる", () => {
  const sets = { gachaOnly: new Set<string>(), material: new Set<string>() };

  it("札が3種に分かれて出る", () => {
    const roles = dexFacets(MONSTER_DEX_ENTRIES, sets).roles;
    for (const kind of MATERIAL_PIG_KINDS) expect(roles).toContain(MATERIAL_PIG_LABEL[kind]);
    expect(roles).not.toContain("素材");
  });

  it("種類で絞ると、その種類だけが残る", () => {
    for (const kind of MATERIAL_PIG_KINDS) {
      const shown = filterDexEntries(MONSTER_DEX_ENTRIES, { ...EMPTY_DEX_FILTER, roles: [MATERIAL_PIG_LABEL[kind]] }, sets);
      expect(shown.length, MATERIAL_PIG_LABEL[kind]).toBeGreaterThan(0);
      for (const dex of shown) expect(dex.templateId).toBe(MATERIAL_PIG_TEMPLATE_IDS[kind]);
    }
  });
});

/**
 * 素材を選ぶ2画面(強化・ランクアップ)。
 *
 * どちらも独自の絞り込みを持っていて、共通の役割の軸を通らない。
 * **「全ての絞り込みに入れる」**という依頼なので、ここも見張る。
 */
describe("素材を選ぶ画面にも札がある", () => {
  it("強化の素材選択に「素材の種類」がある", () => {
    const source = readFileSync(new URL("../src/web/views/monsterTraining.ts", import.meta.url), "utf8");
    expect(source).toContain('el("span", { className: "mfilter__label" }, ["素材の種類"])');
    expect(source).toContain("materialPigKindOf(findMonsterById(candidate.dexId)?.templateId) !== filter.pig");
  });

  it("ランクアップの素材選択に「素材の種類」がある", () => {
    const source = readFileSync(new URL("../src/web/views/monsters.ts", import.meta.url), "utf8");
    expect(source).toContain('el("span", { className: "mfilter__label" }, ["素材の種類"])');
    expect(source).toContain("rankUpPigFilter");
  });
});
