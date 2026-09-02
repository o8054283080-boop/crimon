import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import {
  ALL_DISPLAYABLE_MONSTERS_DEX,
  EXP_PIG,
  GACHA_ONLY_TEMPLATE_IDS,
  MATERIAL_TEMPLATE_IDS,
  MONSTER_DEX_ENTRIES,
  REINCARNATION_PIG,
  SKILL_PIG,
} from "../src/data/monsters.js";
import {
  DEX_SOURCES,
  DEX_SOURCE_LABEL,
  EMPTY_DEX_FILTER,
  dexFacets,
  dexFilterCount,
  dexSourceOf,
  filterDexEntries,
  toggleDexValue,
} from "../src/game/monsterDexFilter.js";

/*
 * 図鑑の絞り込みと、素材モンスターの掲載。
 *
 * ## なぜ要るのか
 *
 * - 156体を**並べ替えるだけでは見る量が減らない**。「炎の耐久型」を探すのに
 *   炎の26体を目で追うことになる
 * - ピッグは手持ちに入るのに図鑑に無く、**何のために居るのかを確かめる場所が
 *   どこにも無かった**。スキルの「ぷいぷい(0.3倍)」を読んでも分からない
 */

const SETS = { gachaOnly: GACHA_ONLY_TEMPLATE_IDS, material: MATERIAL_TEMPLATE_IDS };

describe("素材モンスターを図鑑に載せる", () => {
  it("3種のピッグが6属性ぶん載っている", () => {
    for (const template of [REINCARNATION_PIG, EXP_PIG, SKILL_PIG]) {
      const entries = MONSTER_DEX_ENTRIES.filter((dex) => dex.templateId === template.templateId);
      expect(entries, `${template.baseName} が図鑑に無い`).toHaveLength(6);
    }
  });

  it("3種とも「何のために居るのか」を書いてある", () => {
    for (const template of [REINCARNATION_PIG, EXP_PIG, SKILL_PIG]) {
      const dex = MONSTER_DEX_ENTRIES.find((entry) => entry.templateId === template.templateId);
      expect(dex?.dexNote, `${template.baseName} に説明が無い`).toBeTruthy();
      // 用途と、戦力にならないことを必ず言う。数字だけ見ても分からない相手なので
      expect(dex!.dexNote!, template.baseName).toContain("素材");
      expect(dex!.dexNote!, template.baseName).toContain("戦力にはなりません");
      expect(dex!.dexNote!.length, `${template.baseName} の説明が短すぎる`).toBeGreaterThan(60);
    }
  });

  it("説明に確率の数字を出さない", () => {
    /*
     * ドロップ率は画面へ出さない(CLAUDE.md)。
     * 戦闘スキルの発動%は別だが、ここは入手の話なので対象外。
     */
    for (const dex of MONSTER_DEX_ENTRIES) {
      if (!dex.dexNote) continue;
      expect(dex.dexNote, `${dex.name} の説明に%がある`).not.toMatch(/\d+\s*[%％]/);
    }
  });

  it("ピッグには潜在覚醒を生やさない", () => {
    /*
     * 覚醒候補は `ALL_DISPLAYABLE_MONSTERS_DEX` から生成される。
     * ここへピッグを混ぜると、**覚醒できない相手に候補が3つ生えて図鑑が嘘をつく。**
     * 素材は表示用の一覧(`MONSTER_DEX_ENTRIES`)にだけ入れる。
     */
    for (const dex of MONSTER_DEX_ENTRIES) {
      if (!MATERIAL_TEMPLATE_IDS.has(dex.templateId)) continue;
      expect(ALL_DISPLAYABLE_MONSTERS_DEX.map((d) => d.id), `${dex.name} が覚醒候補の生成元に居る`).not.toContain(dex.id);
      expect(LATENT_ABILITY_CANDIDATES[dex.id], `${dex.name} に覚醒候補が生えている`).toBeUndefined();
    }
  });

  it("戦力になる側の並びは1体も変わっていない", () => {
    // 覚醒候補のIDは添字に効く。既存の並びが動くと、持っている覚醒が別物になる
    expect(MONSTER_DEX_ENTRIES.slice(0, ALL_DISPLAYABLE_MONSTERS_DEX.length).map((d) => d.id))
      .toEqual(ALL_DISPLAYABLE_MONSTERS_DEX.map((d) => d.id));
  });
});

describe("図鑑の絞り込み", () => {
  it("何も選んでいなければ全部通す", () => {
    expect(filterDexEntries(MONSTER_DEX_ENTRIES, EMPTY_DEX_FILTER, SETS)).toHaveLength(MONSTER_DEX_ENTRIES.length);
    expect(dexFilterCount(EMPTY_DEX_FILTER)).toBe(0);
  });

  it("同じ群れの中は「どれか」", () => {
    const shown = filterDexEntries(MONSTER_DEX_ENTRIES, { ...EMPTY_DEX_FILTER, elements: ["FIRE", "WATER"] }, SETS);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((d) => d.element === "FIRE" || d.element === "WATER")).toBe(true);
  });

  it("群れをまたぐと「すべて」", () => {
    const shown = filterDexEntries(MONSTER_DEX_ENTRIES, { elements: ["FIRE"], roles: ["ヒーラー"], sources: [] }, SETS);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((d) => d.element === "FIRE" && d.role === "ヒーラー")).toBe(true);
  });

  it("入手先の分け方が正しい", () => {
    /*
     * 11種の新モンスターも召喚に出るが、ステージにも出るので「召喚限定」ではない。
     * 集合の作り方を間違えると、画面の札が黙って嘘をつく。
     */
    const griffon = MONSTER_DEX_ENTRIES.find((d) => d.templateId === "griffon")!;
    const slime = MONSTER_DEX_ENTRIES.find((d) => d.templateId === "slime")!;
    const pig = MONSTER_DEX_ENTRIES.find((d) => d.templateId === REINCARNATION_PIG.templateId)!;
    expect(dexSourceOf(griffon, SETS)).toBe("GACHA");
    expect(dexSourceOf(slime, SETS)).toBe("NORMAL");
    expect(dexSourceOf(pig, SETS)).toBe("MATERIAL");
    // 新11種はステージにも出るので通常扱い
    const abyss = MONSTER_DEX_ENTRIES.find((d) => d.templateId === "abyss_reaper");
    if (abyss) expect(dexSourceOf(abyss, SETS)).toBe("NORMAL");
  });

  it("素材で絞ると18体だけになる", () => {
    const shown = filterDexEntries(MONSTER_DEX_ENTRIES, { ...EMPTY_DEX_FILTER, sources: ["MATERIAL"] }, SETS);
    expect(shown).toHaveLength(18);
    expect(shown.every((d) => MATERIAL_TEMPLATE_IDS.has(d.templateId))).toBe(true);
  });

  it("札は一覧に居る値だけを出す", () => {
    // 押しても0体になる札を出さない
    const facets = dexFacets(MONSTER_DEX_ENTRIES, SETS);
    for (const element of facets.elements) {
      expect(MONSTER_DEX_ENTRIES.some((d) => d.element === element)).toBe(true);
    }
    for (const role of facets.roles) {
      expect(MONSTER_DEX_ENTRIES.some((d) => d.role === role)).toBe(true);
    }
    expect(facets.sources).toEqual(DEX_SOURCES);
    // 並びは定義順。出てきた順だと絞り込むたび札の位置が動く
    expect(facets.roles).toEqual([...facets.roles].sort((a, b) => a.localeCompare(b, "ja")));
  });

  it("札は押すたびに入り切りする", () => {
    expect(toggleDexValue(["FIRE"], "WATER")).toEqual(["FIRE", "WATER"]);
    expect(toggleDexValue(["FIRE", "WATER"], "FIRE")).toEqual(["WATER"]);
  });

  it("すべての入手先に日本語の名前がある", () => {
    for (const source of DEX_SOURCES) expect(DEX_SOURCE_LABEL[source]).toBeTruthy();
  });

  it("既定では札を畳んでおく", () => {
    /*
     * 条件を全部並べると、モンスターが1体も見えないまま画面が終わる。
     * 所持モンスターの絞り込みと同じ扱いにする。
     */
    const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    expect(main).toContain("dexFilterOpen: false");
  });

  it("0件になった時に、行き止まりにしない", () => {
    const view = readFileSync(new URL("../src/web/views/monsterDex.ts", import.meta.url), "utf8");
    expect(view).toContain("条件に合うモンスターがいません");
    expect(view).toContain("mfilter__clear");
  });
});
