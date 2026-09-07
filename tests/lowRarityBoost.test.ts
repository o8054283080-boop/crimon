import { describe, expect, it } from "vitest";
import { LOW_RARITY_BOOST, applyLowRarityBoost, lowRarityBoostOf } from "../src/core/lowRarityBoost.js";
import { computeEffectiveStats } from "../src/core/rarity.js";
import { createMonsterInstance, toBattleDefinition } from "../src/core/monsterInstance.js";
import {
  ALL_MONSTER_TEMPLATES, GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES,
  findMonsterById,
} from "../src/data/monsters.js";
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { scaledEnemyAtk } from "../src/battle/enemyPower.js";

/**
 * 低い星から出るモンスターの底上げ。
 *
 * 同じ★6 Lv60・同じ装備で揃えても、初期★3と初期★5では
 * **速度だけ差が小さく(1.11倍)、攻撃と防御は1.5倍**開いていた。
 * `docs/design-concept.md` の「ふつうのモンスターでも奥まで行ける」を削るので縮めた。
 *
 * ここで見張るのは3つ。
 *
 *   1. **敵には掛からない**(掛かると差し引きゼロになり、★5編成にだけ難化として残る)
 *   2. **★5未満には掛からない**(序盤の「装備を取りに行く理由」を壊さない)
 *   3. **★5を追い越さない**(縮めるのであって、ひっくり返すのではない)
 */

/** そのテンプレートの図鑑ID(属性は問わない) */
function dexIdOf(templateId: string): string {
  const dex = ALL_MONSTER_TEMPLATES.find((t) => t.templateId === templateId);
  if (!dex) throw new Error(`テンプレートが無い: ${templateId}`);
  return `${templateId}_FIRE`;
}

describe("底上げの表", () => {
  it("書いてあるテンプレートIDが実在する", () => {
    for (const templateId of Object.keys(LOW_RARITY_BOOST)) {
      expect(ALL_MONSTER_TEMPLATES.some((t) => t.templateId === templateId), templateId).toBe(true);
    }
  });

  /*
   * **初期★5を底上げしてはいけない。**縮めたい差の片側なので、
   * ここへ紛れ込むと何も縮まらない。
   */
  it("初期★5は1体も入っていない", () => {
    for (const template of GACHA_STAR5_TEMPLATES) {
      expect(LOW_RARITY_BOOST[template.templateId], template.templateId).toBeUndefined();
    }
  });

  it("初期★3の方が、初期★4より大きく引き上げられている", () => {
    const star3 = GACHA_STAR3_TEMPLATES.filter((t) => LOW_RARITY_BOOST[t.templateId]);
    const star4 = GACHA_STAR4_TEMPLATES.filter((t) => LOW_RARITY_BOOST[t.templateId]);
    expect(star3.length).toBeGreaterThan(0);
    expect(star4.length).toBeGreaterThan(0);
    const max4 = Math.max(...star4.map((t) => LOW_RARITY_BOOST[t.templateId]));
    const maxAttacker3 = LOW_RARITY_BOOST.wolf;
    expect(maxAttacker3).toBeGreaterThan(max4);
  });
});

describe("効き始める星", () => {
  it("★4以下では効かない。★5で半分、★6で満額", () => {
    const full = LOW_RARITY_BOOST.wolf;
    for (const star of [1, 2, 3, 4]) expect(lowRarityBoostOf("wolf", star), `★${star}`).toBe(1);
    expect(lowRarityBoostOf("wolf", 5)).toBeCloseTo(1 + (full - 1) * 0.5, 6);
    expect(lowRarityBoostOf("wolf", 6)).toBeCloseTo(full, 6);
  });

  it("星を渡さないと満額(図鑑のように「育て切ったら」を見せる場所むけ)", () => {
    expect(lowRarityBoostOf("wolf")).toBeCloseTo(LOW_RARITY_BOOST.wolf, 6);
  });

  it("表に無いモンスターは何も変わらない", () => {
    expect(lowRarityBoostOf("dragon", 6)).toBe(1);
    expect(lowRarityBoostOf(undefined, 6)).toBe(1);
    const stats = findMonsterById("dragon_FIRE")!.stats;
    expect(applyLowRarityBoost(stats, "dragon", 6)).toBe(stats);
  });

  it("速度と会心には掛からない(そこは開いていない)", () => {
    const stats = findMonsterById("wolf_FIRE")!.stats;
    const boosted = applyLowRarityBoost(stats, "wolf", 6);
    expect(boosted.spd).toBe(stats.spd);
    expect(boosted.criRate).toBe(stats.criRate);
    expect(boosted.criDmg).toBe(stats.criDmg);
    expect(boosted.atk).toBeGreaterThan(stats.atk);
    expect(boosted.hp).toBeGreaterThan(stats.hp);
    expect(boosted.def).toBeGreaterThan(stats.def);
  });
});

describe("プレイヤーの手持ちにだけ効く", () => {
  it("手持ちの★6には効く", () => {
    const dex = findMonsterById(dexIdOf("wolf"))!;
    const instance = createMonsterInstance(dex.id, 6, 60);
    const plain = computeEffectiveStats(dex.stats, 6, 60);
    expect(toBattleDefinition(instance, dex).stats.atk).toBeGreaterThan(plain.atk);
  });

  /*
   * **敵は別の道を通る。**ここが繋がってしまうと、プレイヤーと敵が同じだけ
   * 強くなって差し引きゼロになり、底上げの意味が消える。
   * 装備ダンジョンのお供にはウルフやスライムがそのまま出る。
   */
  it("敵には効かない", () => {
    const floor = EQUIPMENT_DUNGEON_FLOORS.find((f) => f.enemies.some((e) => e.templateId === "wolf"));
    expect(floor, "ウルフが出る階が無い").toBeDefined();
    const enemy = floor!.enemies.find((e) => e.templateId === "wolf")!;
    const dex = findMonsterById(`${enemy.templateId}_${enemy.element}`)!;
    const base = computeEffectiveStats(dex.stats, enemy.star, enemy.level);
    const plain = scaledEnemyAtk(base.atk * floor!.powerScale);
    const boosted = scaledEnemyAtk(applyLowRarityBoost(base, "wolf", enemy.star).atk * floor!.powerScale);

    const built = buildDungeonEnemyTeam(floor!).find((d) => d.templateId === "wolf")!;
    expect(built.stats.atk, "敵に底上げが掛かっている").toBe(plain);
    // 掛かっていたら値が変わる階を選べているか(見張りが空振りしていないことの確認)
    expect(boosted, "この階では底上げの有無で差が出ない").not.toBe(plain);
  });
});

describe("縮めるのであって、ひっくり返さない", () => {
  it("★6 Lv60 の素の値で、初期★3が初期★5を追い越さない", () => {
    const effective = (templateId: string) => {
      const dex = findMonsterById(dexIdOf(templateId))!;
      return applyLowRarityBoost(computeEffectiveStats(dex.stats, 6, 60), templateId, 6);
    };
    const attackers3 = ["slime", "wolf", "kobold"].map(effective);
    const attackers5 = ["dragon", "nemesis"].map(effective);
    const best3 = Math.max(...attackers3.map((s) => s.atk));
    const worst5 = Math.min(...attackers5.map((s) => s.atk));
    expect(best3).toBeLessThan(worst5);
  });

  it("初期★3アタッカーと初期★5アタッカーの攻撃の開きが 1.2〜1.35倍に収まる", () => {
    const atk = (templateId: string) => {
      const dex = findMonsterById(dexIdOf(templateId))!;
      return applyLowRarityBoost(computeEffectiveStats(dex.stats, 6, 60), templateId, 6).atk;
    };
    const avg = (ids: string[]) => ids.reduce((s, id) => s + atk(id), 0) / ids.length;
    const ratio = avg(["dragon", "nemesis", "fenrir"]) / avg(["slime", "wolf", "kobold"]);
    // 底上げ前は 1.55倍だった
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.35);
  });
});
