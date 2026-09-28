import "../ui/accessories.css";
import "../farmEquipmentResult.css";
import { type Accessory, ACCESSORY_FAMILIES, ACCESSORY_FAMILY_JA, type AccessoryFamily } from "../../core/accessory.js";
import { type Equipment, SET_LABEL, SET_TYPES, SLOT_LABEL, type SetType, formatStatValue } from "../../core/equipment.js";
import { ANCIENT_CRAFT_COST, canCraft } from "../../game/ancientCraft.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAccessorySummary } from "./accessoryCard.js";
import { renderRuinMaterials } from "./ruins.js";
import { screenHeader } from "./managementHeader.js";
import { equipmentRarityAttrs, equipmentRarityTag } from "./equipmentRarityTag.js";

/**
 * 古代のカケラでの製作。**150個で1つ。余りは残る。**
 *
 * アクセ … ★6確定・系統を選ぶ。レア度・メイン・特殊・弱効果は引く
 * 装備   … ★6確定・シリーズを選ぶ。枠・メイン・サブは引く(装備ダンジョン12階と同じ出方)
 *
 * **確率の数字は出さない。**「何が確定で、何を引くか」だけを書く。
 */
export interface AncientCraftProps {
  player: PlayerState;
  lastAccessory: Accessory | null;
  lastEquipment: Equipment | null;
  notice: string | null;
  /**
   * 作った直後の結果を、**画面の真ん中に**開くか。
   *
   * 以前は結果を画面の上端にだけ出していた。製作のボタンは下の方にあるので、
   * 押しても結果が画面の外に出てしまい、「カケラだけ減って何ができたか分からない」状態だった
   * (依頼主の指摘)。押した場所に関係なく見えるよう、ダイアログで出す。
   */
  resultOpen: boolean;
  onCloseResult: () => void;
  /** 同じ系統・シリーズでもう1つ作る。カケラが足りなければ null */
  onCraftAgain: (() => void) | null;
  onCraftAccessory: (family: AccessoryFamily) => void;
  onCraftEquipment: (set: SetType) => void;
  onGoAccessories: () => void;
}

/** 作った装備の中身。★・シリーズ・枠・レア度・メイン・サブを全部出す */
function renderCraftedEquipment(item: Equipment): HTMLElement {
  return el("article", { className: "farm-equip-card", ...equipmentRarityAttrs(item) }, [
    el("div", { className: "farm-equip-card__detail" }, [
      el("strong", {}, [`${SET_LABEL[item.set]}の${SLOT_LABEL[item.slot]}`]),
      el("span", { className: "farm-equip-card__stars" }, ["★".repeat(item.star)]),
      equipmentRarityTag(item, "lg"),
      el("span", {}, [`${SLOT_LABEL[item.slot]} ・ +${item.level}`]),
      el("b", {}, [formatStatValue(item.mainStat)]),
      el("small", {}, [item.subStats.length ? `サブ：${item.subStats.map(formatStatValue).join(" / ")}` : "サブステータスなし"]),
    ]),
  ]);
}

function renderCraftResultDialog(props: AncientCraftProps): HTMLElement | null {
  const item = props.lastAccessory ?? props.lastEquipment;
  if (!props.resultOpen || !item) return null;
  const have = (props.player.ancientShards ?? 0).toLocaleString("ja-JP");
  const isAccessory = props.lastAccessory !== null;
  /*
   * `aria-modal` は巡回が「いま裏は触れなくて正しい」を見分ける印でもある
   * (`farmEquipmentResult.ts` と同じ作り・同じ見た目)。
   */
  return el("div", { className: "farm-equip-sheet craft-result-sheet", role: "dialog", "aria-modal": "true", ariaLabel: "作ったもの", "data-tour": "craft-result" }, [
    el("div", { className: "farm-equip-sheet__scrim", onclick: props.onCloseResult }),
    el("section", { className: "farm-equip-sheet__panel" }, [
      el("header", {}, [
        el("div", {}, [
          el("h2", {}, [isAccessory ? "アクセができました" : "装備ができました"]),
          el("p", {}, [`古代のカケラを${ANCIENT_CRAFT_COST}個使いました(残り${have}個)。${isAccessory ? "アクセサリー一覧" : "装備画面"}に入っています`]),
        ]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: props.onCloseResult }, ["閉じる"]),
      ]),
      props.lastAccessory ? renderAccessorySummary(props.lastAccessory) : renderCraftedEquipment(props.lastEquipment!),
      el("footer", {}, [
        props.onCraftAgain
          ? el("button", { type: "button", className: "btn btn--primary", "data-tour": "craft-result:again", onclick: props.onCraftAgain }, [
            `同じものをもう1つ作る(カケラ${ANCIENT_CRAFT_COST}個)`,
          ])
          : el("p", { className: "acc-note" }, [`次を作るには古代のカケラがあと${(ANCIENT_CRAFT_COST - (props.player.ancientShards ?? 0)).toLocaleString("ja-JP")}個必要です`]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: props.onCloseResult }, ["閉じる"]),
      ]),
    ]),
  ]);
}

export function renderAncientCraft(props: AncientCraftProps): HTMLElement {
  const have = props.player.ancientShards ?? 0;
  const ok = canCraft(props.player);
  const short = ok ? null : `あと${(ANCIENT_CRAFT_COST - have).toLocaleString("ja-JP")}個`;
  return el("div", { className: "screen craft-screen" }, [
    screenHeader("カケラ製作"),
    renderRuinMaterials(props.player),
    el("p", { className: "acc-note" }, [
      `古代のカケラ${ANCIENT_CRAFT_COST}個で1つ作れます。余ったカケラはそのまま残ります。`,
    ]),
    props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
    props.lastAccessory
      ? el("section", { className: "craft-result" }, [renderAccessorySummary(props.lastAccessory)])
      : null,
    props.lastEquipment
      ? el("section", { className: "craft-result" }, [renderCraftedEquipment(props.lastEquipment)])
      : null,
    el("section", { className: "card" }, [
      el("h2", {}, ["アクセサリー(★6確定)"]),
      el("p", { className: "acc-note" }, ["系統を選びます。レア度・メイン・効果は作った時に決まります。"]),
      el("div", { className: "craft-grid" }, ACCESSORY_FAMILIES.map((family) =>
        el("button", {
          type: "button",
          className: "btn btn--primary",
          "data-tour": `craft:accessory:${family}`,
          disabled: !ok,
          onclick: () => props.onCraftAccessory(family),
        }, [short ? `${ACCESSORY_FAMILY_JA[family]}(${short})` : `${ACCESSORY_FAMILY_JA[family]}を作る`]))),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoAccessories }, ["💍 アクセサリー一覧"]),
    ]),
    el("section", { className: "card" }, [
      el("h2", {}, ["装備(★6確定)"]),
      el("p", { className: "acc-note" }, ["シリーズを選びます。枠・メイン・サブは作った時に決まります(装備ダンジョン12階と同じ品質)。"]),
      el("div", { className: "craft-grid" }, SET_TYPES.map((set) =>
        el("button", {
          type: "button",
          className: "btn btn--ghost",
          disabled: !ok,
          onclick: () => props.onCraftEquipment(set),
        }, [SET_LABEL[set]]))),
    ]),
    renderCraftResultDialog(props),
  ].filter((n): n is HTMLElement => n !== null));
}
