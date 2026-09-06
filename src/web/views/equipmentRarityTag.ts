/**
 * レア度の札と `data-rarity` を作る、画面共通の小さな部品。
 *
 * ここに集めているのは、**クラス名と属性値を画面ごとに組み立てないため。**
 * この案件では `arena-tickets__pip` と `arena-ticket__pip` のずれで
 * 部品が1つも出ないという事故を起こしていて、型チェックもテストも素通りした。
 * 文字列を作る場所を1つにしておけば、少なくともずれようがない。
 */
import type { Equipment } from "../../core/equipment.js";
import { getEquipmentRarityClass, getEquipmentRarityLabel } from "../../core/equipmentRarity.js";
import { el } from "../dom.js";
import "../ui/equipmentRarity.css";

/**
 * カードや札の根へ広げる属性。CSSはこれを見て枠と色を当てる。
 *
 * `data-star`(★数の色)とは別の属性にしてある。同じ変数へ混ぜると
 * 「★6＝エピック」という誤解をCSSの側から作ってしまう。
 */
export function equipmentRarityAttrs(equipment: Equipment): Record<string, string> {
  return { "data-rarity": getEquipmentRarityClass(equipment) };
}

/**
 * 「エピック」などの札。
 *
 * `size` は場所によって出し分ける。一覧は数十枚を並べるので小さく、
 * 詳細と獲得結果はひとまわり大きくしてレア感を出す。
 */
export function equipmentRarityTag(equipment: Equipment, size: "sm" | "lg" = "sm"): HTMLElement {
  return el(
    "span",
    { className: `equip-rarity-tag${size === "lg" ? " equip-rarity-tag--lg" : ""}` },
    [getEquipmentRarityLabel(equipment)],
  );
}
