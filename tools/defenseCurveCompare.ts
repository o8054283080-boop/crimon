/**
 * **新旧の防御式が、DEFの帯ごとにどう違うか**を並べる。
 *
 *   npx tsx tools/defenseCurveCompare.ts
 *
 * 新式 `1000/(1000+1.2×DEF)` は係数を終盤のDEF(3,000〜6,000)に合わせてある。
 * 旧式は攻撃力との比なので、攻守が釣り合っていればDEFの大小に関わらず一定だった。
 * **どこで新旧が入れ替わるか**が分かれば、序盤が壊れる理由も、
 * 敵のDEFをどの帯で直すべきかも決められる。
 */
import { applyDefenseLegacyE, applyDefenseSw } from "../src/battle/damageFormula.js";

/** 攻守が釣り合っている(ATK = DEF × 倍率)と仮定した時の、通るダメージの割合 */
const BASE = 10_000;

const ROWS = [50, 100, 200, 300, 500, 800, 1_200, 1_600, 2_400, 3_600, 5_000, 6_500];

console.log("防御式の比較 / 「通る割合」= 軽減後 ÷ 軽減前");
console.log("旧式は攻撃力との比で決まるので、攻撃側のATKを2通り置いて幅を見る\n");
console.log("   DEF  │ 新式(本番) │ 旧式 ATK=DEF  旧式 ATK=DEF×3 │ 新旧の差(ATK=DEF×3比)");
console.log("  " + "─".repeat(78));

for (const def of ROWS) {
  const sw = applyDefenseSw(BASE, def).afterDefense / BASE;
  const legacySame = applyDefenseLegacyE(BASE, def, def).afterDefense / BASE;
  const legacyHigh = applyDefenseLegacyE(BASE, def * 3, def).afterDefense / BASE;
  const ratio = sw / legacyHigh;
  const mark = ratio > 1.15 ? "← 新式のほうが通る" : ratio < 0.85 ? "← 新式のほうが硬い" : "  ほぼ同じ";
  console.log(
    `  ${String(def).padStart(5)}  │ ${(sw * 100).toFixed(1).padStart(8)}% │`
    + ` ${(legacySame * 100).toFixed(1).padStart(11)}% ${(legacyHigh * 100).toFixed(1).padStart(13)}% │`
    + ` ×${ratio.toFixed(2).padStart(5)}  ${mark}`,
  );
}

console.log("");
console.log("読み方: **DEF 400前後で新旧が入れ替わる。**");
console.log("        そこより下(序盤)では新式のほうがダメージが通り(DEF 50 で1.4倍)、");
console.log("        上(終盤)では新式のほうが硬い(DEF 3,600 で0.33倍)。");
console.log("        序盤ほど「お互いに素通し」になるので、低層は敵の数値を対で見直すこと。");
