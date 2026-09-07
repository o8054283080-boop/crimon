import { describe, expect, it } from "vitest";
import { MonsterInstance } from "../src/core/monsterInstance.js";
import type { Star } from "../src/core/rarity.js";
import { baseStarOf } from "../src/game/monsterBaseStar.js";
import {
  GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES,
  MONSTER_DEX_ENTRIES, REINCARNATION_PIG,
} from "../src/data/monsters.js";
import { autoSelectRankUpSacrificeIds } from "../src/web/views/monsters.js";

/**
 * ランクアップの一括選択。
 *
 * 依頼は「初期星がすくないモンスターかつレベルが低いのを優先」。
 * **今の星では区別がつかない**のがここの肝で、候補はランクアップの条件から
 * 全員同じ星になる。★5同士でも、★5として引いたものと★3を上げたものが混ざる。
 */

/** そのテンプレートの図鑑ID(属性は問わない。先頭の1つ) */
function dexIdOf(templateId: string): string {
  const dex = MONSTER_DEX_ENTRIES.find((entry) => entry.templateId === templateId);
  if (!dex) throw new Error(`図鑑に無い: ${templateId}`);
  return dex.id;
}

function instance(id: string, dexId: string, star: Star, level: number): MonsterInstance {
  return { id, dexId, star, level, exp: 0, equipment: {}, skillLevels: [1, 1, 1] } as MonsterInstance;
}

const STAR3_DEX = dexIdOf(GACHA_STAR3_TEMPLATES[0].templateId);
const STAR3_DEX_OTHER = dexIdOf(GACHA_STAR3_TEMPLATES[1].templateId);
const STAR4_DEX = dexIdOf(GACHA_STAR4_TEMPLATES[0].templateId);
const STAR5_DEX = dexIdOf(GACHA_STAR5_TEMPLATES[0].templateId);

describe("初期星", () => {
  it("召喚のプールがそのまま初期星になる", () => {
    for (const template of GACHA_STAR3_TEMPLATES) {
      expect(baseStarOf({ dexId: dexIdOf(template.templateId), star: 6 }), template.templateId).toBe(3);
    }
    for (const template of GACHA_STAR4_TEMPLATES) {
      expect(baseStarOf({ dexId: dexIdOf(template.templateId), star: 6 }), template.templateId).toBe(4);
    }
    for (const template of GACHA_STAR5_TEMPLATES) {
      expect(baseStarOf({ dexId: dexIdOf(template.templateId), star: 6 }), template.templateId).toBe(5);
    }
  });

  it("**今の星に引きずられない。**★3を★6まで上げても初期星は3のまま", () => {
    expect(baseStarOf({ dexId: STAR3_DEX, star: 6 })).toBe(3);
    expect(baseStarOf({ dexId: STAR3_DEX, star: 3 })).toBe(3);
  });

  /*
   * ピッグは入手先ごとに星が違い(装備ダンジョンは★2〜3、ショップは★3〜5)、
   * 自分は星が上がらない。だから今の星がそのまま入手時の星になる。
   * ここで 0 や 1 を返すと、**正体が分からないものを真っ先に食わせる**ことになる。
   */
  it("召喚に出ないものは今の星を返す(低い方へ倒さない)", () => {
    const pig = dexIdOf(REINCARNATION_PIG.templateId);
    expect(baseStarOf({ dexId: pig, star: 3 })).toBe(3);
    expect(baseStarOf({ dexId: pig, star: 5 })).toBe(5);
    expect(baseStarOf({ dexId: "存在しない図鑑ID", star: 4 })).toBe(4);
  });
});

describe("一括選択の優先順位", () => {
  it("初期星が低いものから選ぶ(今の星は全員同じ)", () => {
    const candidates = [
      instance("star5", STAR5_DEX, 5, 1),
      instance("star4", STAR4_DEX, 5, 1),
      instance("star3", STAR3_DEX, 5, 1),
    ];
    expect(autoSelectRankUpSacrificeIds(candidates, [], 2)).toEqual(["star3", "star4"]);
  });

  it("初期星が同じならレベルが低い方から選ぶ", () => {
    const candidates = [
      instance("lv30", STAR3_DEX, 3, 30),
      instance("lv1", STAR3_DEX, 3, 1),
      instance("lv15", STAR3_DEX, 3, 15),
    ];
    expect(autoSelectRankUpSacrificeIds(candidates, [], 2)).toEqual(["lv1", "lv15"]);
  });

  /*
   * **初期星がレベルより先。**★3のLv30 と ★5のLv1 なら、育っていても
   * ★3の方を先に食わせる。★5は引き直せないが、★3は引き直せる。
   */
  it("初期星の方がレベルより強い物差し", () => {
    const candidates = [
      instance("star5lv1", STAR5_DEX, 5, 1),
      instance("star3lv30", STAR3_DEX, 5, 30),
    ];
    expect(autoSelectRankUpSacrificeIds(candidates, [], 1)).toEqual(["star3lv30"]);
  });

  it("初期星もレベルも同じなら、同じ種類を多く持っている方が先", () => {
    const candidates = [
      instance("only", STAR3_DEX_OTHER, 3, 1),
      instance("dup1", STAR3_DEX, 3, 1),
      instance("dup2", STAR3_DEX, 3, 1),
    ];
    expect(autoSelectRankUpSacrificeIds(candidates, [], 2)).toEqual(["dup1", "dup2"]);
  });

  it("手で選んだ素材は残し、足りない分だけ補う", () => {
    const candidates = [
      instance("star3", STAR3_DEX, 5, 1),
      instance("star4", STAR4_DEX, 5, 1),
      instance("star5", STAR5_DEX, 5, 1),
    ];
    // 手で★5を選んでいたら、それは外さない
    expect(autoSelectRankUpSacrificeIds(candidates, ["star5"], 2)).toEqual(["star5", "star3"]);
  });

  it("候補に居ないIDや重複は捨てる", () => {
    const candidates = [instance("a", STAR3_DEX, 3, 1), instance("b", STAR3_DEX, 3, 2)];
    expect(autoSelectRankUpSacrificeIds(candidates, ["消えた素材", "a", "a"], 2)).toEqual(["a", "b"]);
  });

  it("候補が足りなければ、あるだけ返す", () => {
    const candidates = [instance("a", STAR3_DEX, 3, 1)];
    expect(autoSelectRankUpSacrificeIds(candidates, [], 3)).toEqual(["a"]);
  });
});
