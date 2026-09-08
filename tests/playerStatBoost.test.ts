import { describe, expect, it } from "vitest";
import { PLAYER_STAT_BOOST, applyPlayerStatBoost, playerStatBoostOf } from "../src/core/playerStatBoost.js";
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
 * プレイヤーの手持ちにだけ掛かるステータス補正。
 *
 * 直しているのは2つの歪み。
 *
 *   1. 初期★3が初期★5に追いつけない(攻撃1.55倍・防御1.48倍・**速度だけ1.11倍**)
 *   2. アタッカーだけ総合値が高い(ヒーラーはアタッカーの63%しかなかった)
 *
 * ここで見張るのは4つ。
 *
 *   1. **敵には掛からない**(掛かると差し引きゼロになり、★5編成にだけ難化として残る)
 *   2. **★5未満には掛からない**(序盤の「装備を取りに行く理由」を壊さない)
 *   3. **役割ごとの総合値が揃っている**
 *   4. **役割の取り柄は残っている**(攻撃はアタッカー、防御はディフェンダー、HPはタンク)
 */

/** 初期星ごとのテンプレート。属性は FIRE で揃える(属性ごとに素の値が振れるため) */
const BAND = new Map<string, number>([
  ...GACHA_STAR3_TEMPLATES.map((t) => [t.templateId, 3] as [string, number]),
  ...GACHA_STAR4_TEMPLATES.map((t) => [t.templateId, 4] as [string, number]),
  ...GACHA_STAR5_TEMPLATES.map((t) => [t.templateId, 5] as [string, number]),
]);

interface Row { band: number; templateId: string; role: string; hp: number; atk: number; def: number; spd: number; power: number }

const ROWS: Row[] = ALL_MONSTER_TEMPLATES.flatMap((template) => {
  const band = BAND.get(template.templateId);
  const dex = findMonsterById(`${template.templateId}_FIRE`);
  if (band === undefined || !dex) return [];
  const s = applyPlayerStatBoost(computeEffectiveStats(dex.stats, 6, 60), template.templateId, 6);
  return [{
    band, templateId: template.templateId, role: String(template.role),
    hp: s.hp, atk: s.atk, def: s.def, spd: s.spd,
    power: s.hp / 10 + s.atk + s.def + s.spd,
  }];
});

/** その帯のアタッカー平均指数。役割の均衡はここを 1.00 として測る */
function attackerAverage(band: number): number {
  const g = ROWS.filter((r) => r.band === band && r.role === "アタッカー");
  return g.reduce((s, r) => s + r.power, 0) / g.length;
}

describe("倍率の表", () => {
  it("書いてあるテンプレートIDが実在する", () => {
    for (const templateId of Object.keys(PLAYER_STAT_BOOST)) {
      expect(ALL_MONSTER_TEMPLATES.some((t) => t.templateId === templateId), templateId).toBe(true);
    }
  });

  /*
   * **攻撃は下げない。**そのモンスターの立ち位置そのものだから。
   * 下げてよいのは防御(攻撃上位のアタッカーを打たれ弱くする)とHPだけ。
   */
  it("攻撃力を下げているモンスターは1体もいない", () => {
    for (const [templateId, boost] of Object.entries(PLAYER_STAT_BOOST)) {
      expect(boost.atk, `${templateId} の攻撃倍率`).toBeGreaterThanOrEqual(1);
    }
  });

  it("攻撃を上げるのはアタッカーとデバッファーだけ。他の役割のために攻撃は上げない", () => {
    for (const [templateId, boost] of Object.entries(PLAYER_STAT_BOOST)) {
      if (boost.atk === 1) continue;
      const role = ALL_MONSTER_TEMPLATES.find((t) => t.templateId === templateId)!.role;
      expect(["アタッカー", "デバッファー"], `${templateId} の役割`).toContain(String(role));
    }
  });

  /*
   * **★5として引いた意味が残っているか。**フェンリルは初期★5なのに
   * 初期★3の3体すべてより弱かった。指摘を受けて引き上げている。
   */
  it("フェンリルが初期★3のアタッカーを上回っている", () => {
    const power = (templateId: string) => ROWS.find((r) => r.templateId === templateId)!.power;
    for (const id of ["slime", "wolf", "kobold"]) {
      expect(power("fenrir"), `フェンリル 対 ${id}`).toBeGreaterThan(power(id));
    }
    // ただしドラゴン・ネメシスは超えない(基準はあくまでこの2体)
    expect(power("fenrir")).toBeLessThan(power("dragon"));
  });
});

describe("効き始める星", () => {
  it("★4以下では効かない。★5で半分、★6で満額", () => {
    const full = PLAYER_STAT_BOOST.fairy;
    for (const star of [1, 2, 3, 4]) expect(playerStatBoostOf("fairy", star).hp, `★${star}`).toBe(1);
    expect(playerStatBoostOf("fairy", 5).hp).toBeCloseTo(1 + (full.hp - 1) * 0.5, 6);
    expect(playerStatBoostOf("fairy", 6).hp).toBeCloseTo(full.hp, 6);
  });

  it("星を渡さないと満額(図鑑のように「育て切ったら」を見せる場所むけ)", () => {
    expect(playerStatBoostOf("fairy").def).toBeCloseTo(PLAYER_STAT_BOOST.fairy.def, 6);
  });

  it("表に無いモンスターは何も変わらない", () => {
    const stats = findMonsterById("seraph_FIRE")!.stats;
    expect(applyPlayerStatBoost(stats, "seraph", 6)).toBe(stats);
    expect(applyPlayerStatBoost(stats, undefined, 6)).toBe(stats);
  });

  it("速度と会心には掛からない(そこは開いていない)", () => {
    const stats = findMonsterById("fairy_FIRE")!.stats;
    const boosted = applyPlayerStatBoost(stats, "fairy", 6);
    expect(boosted.spd).toBe(stats.spd);
    expect(boosted.criRate).toBe(stats.criRate);
    expect(boosted.atk).toBe(stats.atk); // ヒーラーの攻撃は上げない
    expect(boosted.hp).toBeGreaterThan(stats.hp);
    expect(boosted.def).toBeGreaterThan(stats.def);
  });
});

describe("プレイヤーの手持ちにだけ効く", () => {
  it("手持ちの★6には効く", () => {
    const dex = findMonsterById("fairy_FIRE")!;
    const plain = computeEffectiveStats(dex.stats, 6, 60);
    expect(toBattleDefinition(createMonsterInstance(dex.id, 6, 60), dex).stats.def)
      .toBeGreaterThan(plain.def);
  });

  /*
   * **敵は別の道を通る。**ここが繋がると、プレイヤーと敵が同じだけ強くなって
   * 差し引きゼロになり、補正の意味が消える。
   */
  it("敵には効かない", () => {
    const floor = EQUIPMENT_DUNGEON_FLOORS.find((f) => f.enemies.some((e) => e.templateId === "wolf"));
    expect(floor, "ウルフが出る階が無い").toBeDefined();
    const enemy = floor!.enemies.find((e) => e.templateId === "wolf")!;
    const dex = findMonsterById(`${enemy.templateId}_${enemy.element}`)!;
    const base = computeEffectiveStats(dex.stats, enemy.star, enemy.level);
    const plain = scaledEnemyAtk(base.atk * floor!.powerScale);
    const boosted = scaledEnemyAtk(applyPlayerStatBoost(base, "wolf", enemy.star).atk * floor!.powerScale);

    const built = buildDungeonEnemyTeam(floor!).find((d) => d.templateId === "wolf")!;
    expect(built.stats.atk, "敵に補正が掛かっている").toBe(plain);
    // 掛かっていたら値が変わる階を選べているか(見張りが空振りしていないことの確認)
    expect(boosted, "この階では補正の有無で差が出ない").not.toBe(plain);
  });
});

describe("役割ごとの総合値", () => {
  /*
   * 完全に揃えないのは、**攻撃で勝つのがアタッカーの取り柄**だから。
   * 守りの役だけ上に置くのは、総合で劣る守り役を誰も選ばないため。
   */
  const TARGET: Record<string, [number, number]> = {
    "アタッカー": [0.99, 1.01],
    "ディフェンダー": [1.00, 1.10],
    "タンク": [0.97, 1.07],
    "バランス型": [0.90, 1.02],
    "デバッファー": [0.83, 0.93],
    "サポート": [0.83, 0.93],
    "ヒーラー": [0.83, 0.93],
  };

  for (const band of [3, 4, 5]) {
    it(`初期★${band}: どの役割もアタッカーの総合値に近い`, () => {
      const base = attackerAverage(band);
      const roles = [...new Set(ROWS.filter((r) => r.band === band).map((r) => r.role))];
      for (const role of roles) {
        const g = ROWS.filter((r) => r.band === band && r.role === role);
        const avg = g.reduce((s, r) => s + r.power, 0) / g.length;
        const [lo, hi] = TARGET[role] ?? [0.9, 1.2];
        expect(avg / base, `★${band} の ${role}`).toBeGreaterThanOrEqual(lo);
        expect(avg / base, `★${band} の ${role}`).toBeLessThanOrEqual(hi);
      }
    });
  }

  /*
   * ここが崩れると、総合値だけ揃った**のっぺりした役割**になる。
   * 数字を揃えたのは、役割を選ぶ余地を作るためであって、
   * 全員を同じ形にするためではない。
   */
  it("取り柄は残っている: 攻撃はアタッカー、防御はディフェンダー、HPはタンク", () => {
    const best = (key: "atk" | "def" | "hp", band: number) =>
      ROWS.filter((r) => r.band === band).sort((a, b) => b[key] - a[key])[0];
    expect(best("atk", 3).role).toBe("アタッカー");
    expect(best("def", 3).role).toBe("ディフェンダー");
    expect(best("atk", 5).role).toBe("アタッカー");
    expect(best("hp", 5).role).toBe("タンク");
  });

  /*
   * **攻撃で勝つ代わりに打たれ弱い、がアタッカーの形。**
   * ネメシスは攻撃1位・防御1位・速度1位・HP2位で、
   * 「攻撃が高い代わりに」が成立していなかった。
   */
  it("攻撃が上位のアタッカーほど、防御は上位に来ない", () => {
    const attackers = ROWS.filter((r) => r.role === "アタッカー");
    const byAtk = [...attackers].sort((a, b) => b.atk - a.atk);
    const byDef = [...attackers].sort((a, b) => b.def - a.def);
    for (const top of byAtk.slice(0, 2)) {
      const defRank = byDef.findIndex((r) => r.templateId === top.templateId) + 1;
      // 攻撃1位・2位が、防御でも上位2位に入らないこと
      expect(defRank, `${top.templateId} の防御順位`).toBeGreaterThan(2);
    }
  });

  it("ヒーラーは、アタッカーの63%だったところから追いついている", () => {
    const fairy = ROWS.find((r) => r.templateId === "fairy")!;
    expect(fairy.power / attackerAverage(3)).toBeGreaterThan(0.85);
    // 攻撃は上げていないので、殴り合いでアタッカーに勝つことはない
    const wolf = ROWS.find((r) => r.templateId === "wolf")!;
    expect(fairy.atk).toBeLessThan(wolf.atk);
  });
});

describe("初期星の差", () => {
  it("初期★3アタッカーと初期★5アタッカーの攻撃の開きが 1.2〜1.35倍に収まる", () => {
    const avg = (ids: string[]) =>
      ids.reduce((s, id) => s + ROWS.find((r) => r.templateId === id)!.atk, 0) / ids.length;
    const ratio = avg(["dragon", "nemesis", "fenrir"]) / avg(["slime", "wolf", "kobold"]);
    // 補正を入れる前は 1.55倍だった
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.35);
  });

  it("初期★3が初期★5を攻撃力で追い越さない", () => {
    const atk = (id: string) => ROWS.find((r) => r.templateId === id)!.atk;
    const best3 = Math.max(...["slime", "wolf", "kobold"].map(atk));
    const worst5 = Math.min(...["dragon", "nemesis", "fenrir"].map(atk));
    expect(best3).toBeLessThan(worst5);
  });
});
