/**
 * 種から決まる乱数。
 *
 * **同じ種なら必ず同じ戦いになる。** 「さっきの敗北をもう一度見たい」が
 * できないと、原因を追う手段が推測しか残らない。
 *
 * 本編と同じ mulberry32(他の測定ツールもこれを使っている)。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 1回ぶんの種。
 *
 * 走らせるたびに `seed + index` を使う。こうしておくと、
 * 1000戦のうち137戦目だけを `--seed <seed+137> --runs 1` で
 * そのまま取り出して眺められる。
 */
export function runSeed(baseSeed: number, index: number): number {
  return (baseSeed + index) >>> 0;
}
