/**
 * 装備のレア度。**★数とは別物で、生成時の初期サブオプション数だけで決まる。**
 *
 * ## ★数と何が違うのか
 *
 * ★数は装備そのものの基礎性能(メインの数値の大きさ)で、
 * レア度は**伸びしろ**——強化の節目で埋まる枠がいくつ最初から埋まっていたか。
 * だから ★6ノーマル も ★6エピック も、★1エピック も普通に存在する。
 * 「★6エピック」が厳選の到達点になる、という関係になる。
 *
 * ## なぜ「初期」サブ数なのか
 *
 * 強化は +3 / +6 / +9 / +12 / +15 でサブを1つ増やす(4個そろっていれば数値を伸ばす)。
 * つまり**今のサブ数は、育てれば誰でも4個になる。**
 * 今のサブ数からレア度を出すと、+15まで鍛えた装備が全部エピックになり、
 * レア度が「育てたかどうか」を指す別の物になってしまう。
 *
 * だから `initialSubStatCount` を生成時に焼き、**その後は永久に動かさない。**
 * 初期1個のレア装備は、サブが4個になってもレアのまま。
 *
 * ## 二重管理をしない
 *
 * レア度そのものは保存しない。保存するのは `initialSubStatCount` だけで、
 * レア度はいつもそこから導く。両方持つと、片方だけ書き換わった装備が
 * 必ず生まれる(強化・売却・スナップショット・クラウド復元と、
 * 装備を通す道が多い)。
 *
 * ## レア度は見え方だけを変える
 *
 * 名前が付くだけで、隠れた性能補正は一切付けない。
 * メインの数値も、サブの初期値も、強化の伸び方も、成功率も、レア度では変わらない。
 * **レア度＝初期サブ数の可視化**であって、それ以上のものにはしない。
 */
import type { Equipment } from "./equipment.js";

export type EquipmentRarity = "NORMAL" | "RARE" | "HERO" | "LEGEND" | "EPIC";

/** 生成時のサブオプション数。0〜4しか取らない */
export type InitialSubStatCount = 0 | 1 | 2 | 3 | 4;

/** 低い順。並び替えの基準もこの並びから作る */
export const EQUIPMENT_RARITIES: readonly EquipmentRarity[] = ["NORMAL", "RARE", "HERO", "LEGEND", "EPIC"];

/** 初期サブ数 → レア度。**この対応だけが唯一の定義** */
export const RARITY_BY_INITIAL_SUB_COUNT: Record<InitialSubStatCount, EquipmentRarity> = {
  0: "NORMAL",
  1: "RARE",
  2: "HERO",
  3: "LEGEND",
  4: "EPIC",
};

export const EQUIPMENT_RARITY_LABEL: Record<EquipmentRarity, string> = {
  NORMAL: "ノーマル",
  RARE: "レア",
  HERO: "ヒーロー",
  LEGEND: "レジェンド",
  EPIC: "エピック",
};

/** 0〜4に収める。旧セーブの補完でも使う */
export function clampInitialSubStatCount(value: number): InitialSubStatCount {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  if (floored <= 0) return 0;
  if (floored >= 4) return 4;
  return floored as InitialSubStatCount;
}

/**
 * その装備の初期サブ数。
 *
 * **旧セーブには入っていない。** 強化済みの装備から本来の初期サブ数を
 * 復元する手立ては無い(何個目が強化で増えたのか、どこにも残っていない)ので、
 * 推測で複雑な復元を組まず、**今のサブ数をそのまま初期値として一度だけ採る。**
 *
 * 強化済みの旧装備は本来より高いレア度になり得るが、
 * それは「既に持っている装備の価値を下げない」側に倒した結果で、
 * セーブを壊すことや、開くたびにレア度が動くことよりずっと軽い。
 * 補完値は正規化のときに書き込まれるので、**読み直すたびに変わることはない。**
 */
export function equipmentInitialSubStatCount(equipment: Equipment): InitialSubStatCount {
  if (typeof equipment.initialSubStatCount === "number") {
    return clampInitialSubStatCount(equipment.initialSubStatCount);
  }
  return clampInitialSubStatCount(equipment.subStats.length);
}

/** その装備のレア度。**画面ごとに `subStats.length === 4` と書かないための唯一の入口** */
export function getEquipmentRarity(equipment: Equipment): EquipmentRarity {
  return RARITY_BY_INITIAL_SUB_COUNT[equipmentInitialSubStatCount(equipment)];
}

export function getEquipmentRarityLabel(equipment: Equipment): string {
  return EQUIPMENT_RARITY_LABEL[getEquipmentRarity(equipment)];
}

/**
 * CSSへ渡す印。色と縁取りは `data-rarity` を見てCSS側が当てる。
 *
 * 画面ごとにクラス名を組み立てると必ずずれるので、文字列はここでしか作らない
 * (`arena-tickets__pip` / `arena-ticket__pip` のずれで部品が1つも出なかった事故がある)。
 */
export function getEquipmentRarityClass(equipment: Equipment): string {
  return getEquipmentRarity(equipment).toLowerCase();
}

/** 並び替え用の順位。高いほど上位(エピック=4) */
export function equipmentRarityRank(rarity: EquipmentRarity): number {
  return EQUIPMENT_RARITIES.indexOf(rarity);
}

/* ==========================================================================
 * 初期サブ数の抽選
 *
 * 出方は「通常ステージ」と「装備ダンジョンの階層別」の2つだけ。
 * 添字が初期サブ数、値がその%(各行の合計は100)。
 * ========================================================================== */

/** 初期サブ数0〜4ぶんの重み。添字がそのまま初期サブ数になる */
export type InitialSubStatWeights = readonly [number, number, number, number, number];

/**
 * 通常ステージ。**★数によらず一律。**
 *
 * ★1でもエピックは出るし、★6でもノーマルは出る。
 * ★とレア度が連動すると「★6＝エピック」という誤解がそのまま仕様になってしまい、
 * 2軸で厳選する意味が消える。
 */
export const NORMAL_STAGE_INITIAL_SUB_WEIGHTS: InitialSubStatWeights = [20, 30, 30, 15, 5];

/**
 * 装備ダンジョン。**階層が上がるほど上のレア度へ寄る。**
 *
 * 11F・12Fは**まだ無い階の設定を先に置いてある。**
 * 階を足した時にこの表をそのまま使えるようにするためで、
 * ここに行があること自体は階の存在を意味しない
 * (階の定義は `src/data/equipmentDungeon.ts` 側)。
 */
export const DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS: Record<number, InitialSubStatWeights> = {
  1: [25, 35, 25, 12, 3],
  2: [23, 34, 27, 13, 3],
  3: [20, 33, 28, 15, 4],
  4: [17, 31, 30, 17, 5],
  5: [14, 29, 31, 20, 6],
  6: [11, 27, 32, 22, 8],
  7: [8, 24, 34, 24, 10],
  8: [5, 20, 35, 27, 13],
  9: [2, 16, 35, 31, 16],
  10: [0, 10, 35, 35, 20],
  11: [0, 6, 30, 38, 26],
  12: [0, 3, 25, 40, 32],
};

/**
 * 表に載っている階の一覧(昇順)。**10で決め打ちしない。**
 *
 * 階を足す時にここを直す必要が無いよう、表そのものから読む。
 */
export const DUNGEON_RARITY_FLOORS: readonly number[] = Object.keys(DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * その階の重み。表に無い階は**いちばん近い端の階へ寄せる。**
 *
 * 表より下(0階など)は最下層、表より上(13階以降)は最上層を使う。
 * 落とすと装備が1つも出ない階が生まれるので、必ず何かを返す。
 */
export function dungeonFloorInitialSubWeights(floor: number): InitialSubStatWeights {
  const exact = DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[floor];
  if (exact) return exact;
  const first = DUNGEON_RARITY_FLOORS[0];
  const last = DUNGEON_RARITY_FLOORS[DUNGEON_RARITY_FLOORS.length - 1];
  return DUNGEON_FLOOR_INITIAL_SUB_WEIGHTS[floor < first ? first : last];
}

/**
 * 重みから初期サブ数を1つ引く。**抽選はここ1か所だけ。**
 *
 * 通常ステージとダンジョン各階で別々に書くと、片方だけ直した時に
 * 「呼ぶ場所によって違う確率」という読めない状態になる。
 */
export function pickInitialSubStatCount(weights: InitialSubStatWeights, rng: () => number): InitialSubStatCount {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0) return 0;
  let roll = rng() * total;
  for (let count = 0; count < weights.length; count += 1) {
    const weight = Math.max(0, weights[count]);
    if (roll < weight) return count as InitialSubStatCount;
    roll -= weight;
  }
  // 端数で抜けた時のため。重みが0でない最後の値を返す
  for (let count = weights.length - 1; count >= 0; count -= 1) {
    if (weights[count] > 0) return count as InitialSubStatCount;
  }
  return 0;
}

/** 画面に出す用の一覧(その階でどのレア度が何%か)。表と実際の抽選がずれないよう、同じ表から作る */
export function dungeonFloorRarityRates(floor: number): { rarity: EquipmentRarity; percent: number }[] {
  const weights = dungeonFloorInitialSubWeights(floor);
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  return weights.map((weight, count) => ({
    rarity: RARITY_BY_INITIAL_SUB_COUNT[count as InitialSubStatCount],
    percent: total > 0 ? Math.round((weight / total) * 1000) / 10 : 0,
  }));
}
