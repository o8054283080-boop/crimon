import "../ui/accessories.css";
import { type Accessory, ACCESSORY_FAMILIES, ACCESSORY_FAMILY_JA, type AccessoryFamily } from "../../core/accessory.js";
import { type Equipment, SET_LABEL, SET_TYPES, type SetType } from "../../core/equipment.js";
import { ANCIENT_CRAFT_COST, canCraft } from "../../game/ancientCraft.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAccessorySummary } from "./accessoryCard.js";
import { renderRuinMaterials } from "./ruins.js";

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
  onCraftAccessory: (family: AccessoryFamily) => void;
  onCraftEquipment: (set: SetType) => void;
  onGoAccessories: () => void;
}

export function renderAncientCraft(props: AncientCraftProps): HTMLElement {
  const have = props.player.ancientShards ?? 0;
  const ok = canCraft(props.player);
  const short = ok ? null : `あと${(ANCIENT_CRAFT_COST - have).toLocaleString("ja-JP")}個`;
  return el("div", { className: "screen craft-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["カケラ製作"]),
    ]),
    renderRuinMaterials(props.player),
    el("p", { className: "acc-note" }, [
      `古代のカケラ${ANCIENT_CRAFT_COST}個で1つ作れます。余ったカケラはそのまま残ります。`,
    ]),
    props.notice ? el("p", { className: "acc-note", role: "status" }, [props.notice]) : null,
    props.lastAccessory
      ? el("section", { className: "craft-result" }, [renderAccessorySummary(props.lastAccessory)])
      : null,
    props.lastEquipment
      ? el("p", { className: "acc-note craft-result" }, [
        `★6 ${SET_LABEL[props.lastEquipment.set]} の装備(枠${props.lastEquipment.slot})を作りました。装備画面で確認できます。`,
      ])
      : null,
    el("section", { className: "card" }, [
      el("h2", {}, ["アクセサリー(★6確定)"]),
      el("p", { className: "acc-note" }, ["系統を選びます。レア度・メイン・特殊効果・弱効果は作った時に決まります。"]),
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
  ].filter((n): n is HTMLElement => n !== null));
}
