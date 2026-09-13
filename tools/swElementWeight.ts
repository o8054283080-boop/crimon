/**
 * **sw方式で属性の重みがどれだけ変わったか**を、期待ダメージ比で出す。
 *
 *   npx tsx tools/swElementWeight.ts
 *
 * 旧方式は有利×1.5 / 不利×0.5 の素の倍率。
 * sw方式は倍率を使わず、有利=クリ率+15pt、不利=クリ率-15pt＋50%でかすり(×0.7・クリ不可)。
 * 等倍を1.00として、クリ率・クリダメごとに何倍になるかを並べる。
 *
 * **かすった一撃は弱体を入れられない**ぶんは、この表には出ない。
 * 妨害役の不利は、ここに出ている数字よりさらに重い。
 */
import {
  SW_CRIT_SHIFT, SW_GLANCING_CHANCE, SW_GLANCING_MULTIPLIER,
} from "../src/core/balanceFlags.js";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** クリ率r・クリダメ倍率cのときの期待ダメージ(等倍=1.00の素のダメージを1とする) */
const expected = (r: number, c: number) => 1 + clamp01(r) * (c - 1);

function swAdvantage(r: number, c: number): number {
  return expected(r + SW_CRIT_SHIFT, c);
}

function swDisadvantage(r: number, c: number): number {
  const glance = SW_GLANCING_CHANCE * SW_GLANCING_MULTIPLIER;
  const normal = (1 - SW_GLANCING_CHANCE) * expected(r - SW_CRIT_SHIFT, c);
  return glance + normal;
}

const ROWS: { label: string; r: number; c: number }[] = [
  { label: "会心特化(実測 火ドラゴン)", r: 0.76, c: 3.42 },
  { label: "会心やや高め", r: 0.60, c: 3.00 },
  { label: "会心なかば", r: 0.40, c: 2.50 },
  { label: "会心低め(支援・妨害役)", r: 0.20, c: 2.00 },
  { label: "会心ほぼ無し", r: 0.05, c: 1.80 },
];

console.log("属性の重み / 等倍を1.00としたときの期待ダメージ比");
console.log(`sw方式: 有利=クリ率+${(SW_CRIT_SHIFT * 100).toFixed(0)}pt / 不利=クリ率-${(SW_CRIT_SHIFT * 100).toFixed(0)}pt＋${(SW_GLANCING_CHANCE * 100).toFixed(0)}%でかすり(×${SW_GLANCING_MULTIPLIER.toFixed(2)}・クリ不可)`);
console.log("");
console.log("  個体                          クリ率 クリダメ │ 旧:有利 旧:不利 │ sw:有利 sw:不利 │ 有利の目減り");
console.log("  " + "─".repeat(104));
for (const { label, r, c } of ROWS) {
  const base = expected(r, c);
  const a = swAdvantage(r, c) / base;
  const d = swDisadvantage(r, c) / base;
  console.log(
    `  ${label.padEnd(28)}${(r * 100).toFixed(0).padStart(4)}% ${(c * 100).toFixed(0).padStart(5)}% │ `
    + `${"1.50".padStart(7)} ${"0.50".padStart(7)} │ `
    + `${a.toFixed(2).padStart(7)} ${d.toFixed(2).padStart(7)} │ `
    + `×${(a / 1.5).toFixed(2)}`,
  );
}
console.log("");
console.log("読み方: **sw方式は有利の得だけを大きく削り、不利の損はほぼ据え置き。**");
console.log("        有利は1.50→1.10前後(会心特化ほど目減りが大きい)、不利は0.50→0.56前後。");
console.log("        さらに不利はかすった一撃で弱体を入れられないので、妨害役の不利は表以上に重い。");
