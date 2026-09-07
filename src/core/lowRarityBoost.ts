import type { Stats } from "./stats.js";

/**
 * 召喚で低い星から出るモンスターへの底上げ。**プレイヤーの手持ちにだけ効く。**
 *
 * ## なぜ要るか
 *
 * 同じ★6 Lv60・同じ装備・同じ育成で揃えても、初期★3と初期★5では
 * こうなっていた(アタッカーどうしの平均)。
 *
 *   HP 1.27倍 / 攻撃 1.55倍 / 防御 1.48倍 / **速度 1.11倍**
 *
 * 速度だけ差が小さいのは、狙ったからではない。速度の装備は実数加算が主で
 * 素の差が埋もれるが、攻撃は%装備が効くので**素の差がそのまま比例して残る**。
 * つまり構造の副産物として、攻撃と防御の差だけが1.5倍まで開いていた。
 *
 * `docs/design-concept.md` の芯は「ふつうのモンスターでも、育てて装備を整えれば
 * 奥まで行ける」。1.5倍の開きはこれを削る。
 *
 * ## なぜ図鑑の baseStats を直接上げないか
 *
 * **上げると敵も強くなる。**スライムやウルフはステージ1〜6章のウェーブ、
 * 装備ダンジョンのお供、レベル上げ・ゴールドダンジョン、試練の塔1〜50階の
 * 敵として使われている(`MONSTER_TEMPLATES` が土台になっている)。
 * baseStats を上げれば、プレイヤーと同じだけ敵も上がって差し引きゼロになり、
 * **★5編成の人にだけ純粋な難化**として残ってしまう。
 *
 * だからここはプレイヤーの実効値を作る道(`toBattleDefinition` と一覧表示)だけに
 * 掛ける。敵は `stageRunner` / `dungeonRunner` の別の道を通るので、
 * **これまでどおりの強さのまま**になる。
 *
 * ## 係数の決め方
 *
 * 役割ごとに、★5の同じ役割に対する開きが**1.25倍に収まる**ところまで引き上げる。
 * 一律に上げないのは、役割によって開きがまったく違うため:
 *
 *   アタッカー  1.55倍  ← 突出している
 *   デバッファー 1.41倍
 *   サポート    1.15倍  ← すでに十分近い
 *   守り役      1.11倍(HP) / ★3の方が高い(防御)
 *
 * 速度には掛けない。**すでに1.11倍で、そこは開いていない。**
 */

/** テンプレートIDごとの底上げ倍率。HP・攻撃・防御にだけ掛かる */
export const LOW_RARITY_BOOST: Readonly<Record<string, number>> = {
  // 初期★3のアタッカー: ★5アタッカーとの開き 1.55倍 → 1.25倍
  slime: 1.24,
  wolf: 1.24,
  kobold: 1.24,
  // 初期★3のデバッファー: 1.41倍 → 1.25倍
  imp: 1.13,
  mushroon: 1.13,
  // 初期★4のアタッカー: ★5との開き 1.27倍 → 1.12倍(★3→★5の1.25倍を等比で割った値)
  griffon: 1.13,
  thunderbeast: 1.13,
  // 初期★4のデバッファー: 1.21倍 → 1.12倍
  basilisk: 1.08,
};

/**
 * 今の星ごとの効き方。**★5から効き始め、★6で満額。**
 *
 * 序盤には効かせない。装備ダンジョン1階は「★3のLv上限・装備なしでは
 * 勝てない」ところに置いてあり(`tests/equipmentDungeonBalance.test.ts`)、
 * ここが**装備を取りに行く理由**そのものになっている。
 * 満額を最初から掛けたとき、その勝率が実測で 12% から 100% へ飛んだ。
 * 序盤の設計を壊さずに済ませるには、効き始めを遅らせるのが確実だった。
 *
 * 意味としても素直で、**低い星から出たモンスターを★6まで育て切った人への報い**になる。
 * 依頼のきっかけも★6 Lv60 どうしの比較だった。
 */
const BOOST_RATIO_BY_STAR: Readonly<Record<number, number>> = { 5: 0.5, 6: 1 };

/**
 * そのテンプレートと今の星での底上げ倍率。効かないときは 1。
 *
 * 星を渡さないと満額(★6と同じ)になる。図鑑のように「育て切ったらどうなるか」を
 * 見せる場所で使う。
 */
export function lowRarityBoostOf(templateId: string | undefined, star?: number): number {
  if (templateId === undefined) return 1;
  const full = LOW_RARITY_BOOST[templateId];
  if (full === undefined) return 1;
  const ratio = star === undefined ? 1 : BOOST_RATIO_BY_STAR[star] ?? 0;
  return 1 + (full - 1) * ratio;
}

/**
 * HP・攻撃・防御へ底上げを掛ける。**速度と会心・命中・抵抗はそのまま。**
 *
 * 倍率が 1 のときは元のオブジェクトをそのまま返す。ほとんどのモンスターが
 * 対象外なので、無駄なコピーを作らないため。
 */
export function applyLowRarityBoost(stats: Stats, templateId: string | undefined, star?: number): Stats {
  const boost = lowRarityBoostOf(templateId, star);
  if (boost === 1) return stats;
  return {
    ...stats,
    hp: Math.round(stats.hp * boost),
    atk: Math.round(stats.atk * boost),
    def: Math.round(stats.def * boost),
  };
}
