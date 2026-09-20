/**
 * コラボ召喚の排出率を、実際に大量に引いて測る。
 *
 *   npx tsx tools/collabGachaRates.mts
 *
 * **表を読んで「合っている」と言わないための道具。**
 * 重みの書き方を1つ間違えるだけで、狙いから外れた確率が静かに出続ける。
 * `tests/collabGacha.test.ts` が機械的な合否を見るのに対し、
 * こちらは**数字そのものを目で見る**ために使う(報告にも貼る)。
 */
import { summonCollabMany, summonWithCollabScroll } from "../src/game/collabGacha.js";
import { isCollabDexId } from "../src/data/collabEvent.js";

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1_664_525 + 1_013_904_223) >>> 0; return s / 4_294_967_296; };
}
const N = 400_000;
const r = summonCollabMany(N, seeded(20260919));
const rate = (f: (x: typeof r[number]) => boolean) => r.filter(f).length / N;
console.log("=== コラボピックアップ召喚 (40万回) ===");
console.log(`★3 ${(rate((x) => x.star === 3) * 100).toFixed(2)}% / ★4 ${(rate((x) => x.star === 4) * 100).toFixed(2)}% / ★5 ${(rate((x) => x.star === 5) * 100).toFixed(2)}%`);
console.log(`光闇ぜんぶ ${(rate((x) => x.isRare) * 100).toFixed(2)}%`);
for (const [star, isRare] of [[3, false], [3, true], [4, false], [4, true], [5, false], [5, true]] as const) {
  const box = r.filter((x) => x.star === star && x.isRare === isRare);
  const collab = box.filter((x) => x.isCollab).length;
  console.log(`★${star}${isRare ? "光闇" : "通常"}: 全体の${(box.length / N * 100).toFixed(2)}% / うちコラボ ${box.length ? (collab / box.length * 100).toFixed(2) : "-"}%`);
}
console.log("\n=== 同条件のコラボ内訳 ===");
for (const [star, isRare] of [[4, false], [4, true], [5, false], [5, true]] as const) {
  const hit = r.filter((x) => x.isCollab && x.star === star && x.isRare === isRare);
  const c = new Map<string, number>();
  for (const x of hit) c.set(x.dexId, (c.get(x.dexId) ?? 0) + 1);
  const shares = [...c.entries()].map(([id, n]) => `${id}:${(n / hit.length * 100).toFixed(1)}%`);
  console.log(`★${star}${isRare ? "光闇" : "通常"} (${c.size}種) ${shares.join(" ")}`);
}
console.log("\n=== コラボ限定召喚書 ===");
for (const type of ["COLLAB_FOUR_STAR", "COLLAB_LIGHT_DARK_FOUR_STAR", "COLLAB_FIVE_STAR"] as const) {
  const rng = seeded(777);
  const res = Array.from({ length: N }, () => summonWithCollabScroll(type, rng));
  const s4 = res.filter((x) => x.star === 4).length / N;
  const s5 = res.filter((x) => x.star === 5).length / N;
  const rare = res.filter((x) => x.isRare).length / N;
  const c = new Map<string, number>();
  for (const x of res) c.set(x.dexId, (c.get(x.dexId) ?? 0) + 1);
  console.log(`${type}: ★4 ${(s4 * 100).toFixed(2)}% / ★5 ${(s5 * 100).toFixed(2)}% / 光闇 ${(rare * 100).toFixed(2)}% / 顔ぶれ${c.size}種 / 通常混入 ${res.filter((x) => !isCollabDexId(x.dexId)).length}体`);
  const shares = [...c.entries()].sort().map(([id, n]) => `${id.replace(/_/, ":")}=${(n / N * 100).toFixed(2)}%`);
  console.log(`   ${shares.join(" ")}`);
}
