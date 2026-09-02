/**
 * アリーナのランク表。
 *
 * **境界はすべてここの1つの表で決める。** レートの数字を画面のあちこちへ
 * 散らすと、調整のたびに「どこかだけ古い」状態が生まれる。
 * ランク名・境界・色を1行にまとめてあるので、行を足せばランクが増える。
 */
export type ArenaTierId =
  | "BRONZE_3" | "BRONZE_2" | "BRONZE_1"
  | "SILVER_3" | "SILVER_2" | "SILVER_1"
  | "GOLD_3" | "GOLD_2" | "GOLD_1"
  | "PLATINUM_3" | "PLATINUM_2" | "PLATINUM_1"
  | "MASTER" | "LEGEND";

export interface ArenaTier {
  id: ArenaTierId;
  name: string;
  /** このランクに入る最低レート。表は昇順に並べる */
  minRating: number;
  /** 帯の色。札・縁・進み具合で同じ色を使う */
  color: string;
}

/**
 * ランクの表。**昇順**に並べること(`arenaTierForRating` が後ろから探す)。
 *
 * 境界は依頼の初期案そのまま。ここを触る時は
 * `tests/arenaRank.test.ts` が昇順と抜けを見張っている。
 */
export const ARENA_TIERS: readonly ArenaTier[] = [
  { id: "BRONZE_3", name: "ブロンズIII", minRating: 0, color: "#b1764a" },
  { id: "BRONZE_2", name: "ブロンズII", minRating: 1000, color: "#bd8353" },
  { id: "BRONZE_1", name: "ブロンズI", minRating: 1100, color: "#c9905d" },
  { id: "SILVER_3", name: "シルバーIII", minRating: 1200, color: "#9aa6bb" },
  { id: "SILVER_2", name: "シルバーII", minRating: 1300, color: "#aab5c8" },
  { id: "SILVER_1", name: "シルバーI", minRating: 1400, color: "#bcc6d6" },
  { id: "GOLD_3", name: "ゴールドIII", minRating: 1500, color: "#d4a63c" },
  { id: "GOLD_2", name: "ゴールドII", minRating: 1600, color: "#e0b44b" },
  { id: "GOLD_1", name: "ゴールドI", minRating: 1700, color: "#eec25c" },
  { id: "PLATINUM_3", name: "プラチナIII", minRating: 1800, color: "#5fd6c4" },
  { id: "PLATINUM_2", name: "プラチナII", minRating: 1900, color: "#74e0d2" },
  { id: "PLATINUM_1", name: "プラチナI", minRating: 2000, color: "#8aeade" },
  { id: "MASTER", name: "マスター", minRating: 2200, color: "#b07bff" },
  { id: "LEGEND", name: "レジェンド", minRating: 2500, color: "#ff9f4a" },
] as const;

/** そのレートのランク。表の外の値でも必ず1つ返す */
export function arenaTierForRating(rating: number): ArenaTier {
  let found = ARENA_TIERS[0];
  for (const tier of ARENA_TIERS) {
    if (rating >= tier.minRating) found = tier;
  }
  return found;
}

/** 次のランクまでの残り。最上位なら null */
export function arenaNextTier(rating: number): { tier: ArenaTier; remaining: number } | null {
  const next = ARENA_TIERS.find((tier) => tier.minRating > rating);
  return next ? { tier: next, remaining: next.minRating - rating } : null;
}
