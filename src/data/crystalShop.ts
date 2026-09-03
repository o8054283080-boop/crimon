/**
 * ダイヤショップ。
 *
 * ## ここに並べるものの決め方
 *
 * **いま実際に手に入るものだけ。** 存在しない道具を棚に置くと、
 * 買えたのに手元に何も増えない、が起きる(アリーナショップで実際にやった)。
 *
 * スタミナは置かない(依頼主の指定)。通常ステージの周回でダイヤが手に入る
 * 以上、スタミナをダイヤで買えると **ダイヤ→スタミナ→周回→ダイヤ** の輪が
 * できてしまい、時間の制限そのものが消える。
 *
 * ## 値段と上限は、ここだけに書く
 *
 * 画面にも処理にも数字を書かない。**表示している額と引かれる額が
 * 別の場所から出ていると、片方だけ直された時に食い違う**——
 * この案件で何度も起きた形なので、出どころを1つにする。
 */
import { Star } from "../core/rarity.js";

/** 買える周期。上限を数え直す単位でもある */
export type CrystalShopPeriod = "UNLIMITED" | "WEEKLY" | "MONTHLY";

/** 何が手に入るか。**ここに無い種類は売らない** */
export type CrystalShopKind =
  | "GOLD"
  | "REINCARNATION_PIG"
  | "FOUR_STAR_SCROLL"
  | "LIGHT_DARK_SCROLL";

/** 棚の並び。カテゴリごとに区切って出す */
export type CrystalShopCategory = "GOLD" | "TRAINING" | "SUMMON";

export interface CrystalShopItem {
  id: string;
  name: string;
  /** 何が手に入るかを一行で */
  note: string;
  category: CrystalShopCategory;
  kind: CrystalShopKind;
  /** ダイヤの値段 */
  price: number;
  /** 1回の購入で渡す数 */
  amount: number;
  /** 転生ピッグの星。それ以外では使わない */
  star?: Star;
  period: CrystalShopPeriod;
  /** その周期の中で買える回数。`UNLIMITED` では使わない */
  limit?: number;
}

/**
 * 棚。
 *
 * ## ゴールド交換の値付け
 *
 * まとめ買いほど得になる形にしてある(依頼主の指定)。
 *
 *   100💎 →   200,000G   (1💎 = 2,000G)
 *   500💎 → 1,200,000G   (1💎 = 2,400G)
 *  1000💎 → 3,000,000G   (1💎 = 3,000G)
 *
 * ★6装備を+0から+15まで上げるのに 1,346,000G。
 * **1000💎でようやく装備2つぶんに届く**、という重さになっている。
 *
 * ## 育成・召喚に上限を置く理由
 *
 * 転生ピッグはランクアップの頭数をそのまま買えるので、無制限だと
 * 育成の順番そのものが消える。召喚書も同じで、上限が無ければ
 * 「ダイヤを持っている人だけ図鑑が埋まる」場所になる。
 */
export const CRYSTAL_SHOP_ITEMS: readonly CrystalShopItem[] = [
  /* --- ゴールド交換。無制限 --- */
  {
    id: "gold_200k",
    name: "ゴールド 200,000",
    note: "1回の交換でいちばん軽い",
    category: "GOLD", kind: "GOLD", amount: 200_000,
    price: 100, period: "UNLIMITED",
  },
  {
    id: "gold_1200k",
    name: "ゴールド 1,200,000",
    note: "100💎×5 より 200,000G 多い",
    category: "GOLD", kind: "GOLD", amount: 1_200_000,
    price: 500, period: "UNLIMITED",
  },
  {
    id: "gold_3000k",
    name: "ゴールド 3,000,000",
    note: "★6装備を2つ仕上げられる",
    category: "GOLD", kind: "GOLD", amount: 3_000_000,
    price: 1_000, period: "UNLIMITED",
  },

  /* --- 育成 --- */
  {
    id: "reincarnation_pig_3_max",
    name: "★3MAX転生ピッグ",
    note: "★3のレベル上限で1体。ランクアップの素材に",
    category: "TRAINING", kind: "REINCARNATION_PIG", amount: 1, star: 3,
    price: 150, period: "WEEKLY", limit: 1,
  },
  {
    id: "reincarnation_pig_4_max",
    name: "★4MAX転生ピッグ",
    note: "★4のレベル上限で1体。★5へのランクアップに",
    category: "TRAINING", kind: "REINCARNATION_PIG", amount: 1, star: 4,
    price: 400, period: "MONTHLY", limit: 1,
  },

  /* --- 召喚 --- */
  {
    id: "four_star_scroll",
    name: "★4以上召喚書",
    note: "★4以上が確定で出る召喚書を1枚",
    category: "SUMMON", kind: "FOUR_STAR_SCROLL", amount: 1,
    price: 350, period: "MONTHLY", limit: 2,
  },
  {
    id: "light_dark_scroll",
    name: "★4以上光闇召喚書",
    note: "光か闇の★4以上が確定で出る召喚書を1枚",
    category: "SUMMON", kind: "LIGHT_DARK_SCROLL", amount: 1,
    price: 700, period: "MONTHLY", limit: 1,
  },
];

export const CRYSTAL_SHOP_CATEGORY_LABEL: Record<CrystalShopCategory, string> = {
  GOLD: "ゴールド",
  TRAINING: "育成",
  SUMMON: "召喚",
};

export function findCrystalShopItem(id: string): CrystalShopItem | undefined {
  return CRYSTAL_SHOP_ITEMS.find((item) => item.id === id);
}
