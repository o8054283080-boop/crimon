import { Equipment, SET_LABEL, SLOT_LABEL, equipmentSellPrice, formatStatValue } from "../../core/equipment.js";
import { el } from "../dom.js";
import "../farmEquipmentResult.css";
import { EquipmentFilter, filterEquipment } from "../equipmentFilter.js";
import { equipmentLockLabel, sellableEquipmentIds } from "../uxHelpers.js";
import { equipmentRarityAttrs, equipmentRarityTag } from "./equipmentRarityTag.js";
import { renderEquipmentFilterBar } from "./equipmentFilterBar.js";

export interface FarmEquipmentResultProps {
  equipment: Equipment[];
  selectedIds: string[];
  detailId: string | null;
  selling: boolean;
  /** 所持装備の一覧と同じ絞り込み。軸も見た目も共通の部品を使う */
  filter: EquipmentFilter;
  filterOpen: boolean;
  onChangeFilter(filter: EquipmentFilter): void;
  onToggleFilterOpen(): void;
  onToggleLock(id: string): void;
  onToggleSelected(id: string): void;
  onDetail(id: string | null): void;
  onSell(): void;
  onSelectAll(ids: string[]): void;
  onClearSelection(): void;
  onClose(): void;
}

/*
 * **ここには★数から作った別のレア度名(伝説/英雄/希少/一般)が並んでいた。**
 *
 * 装備のレア度は初期サブ数で決まる別の軸になったので、★由来の言葉を残すと
 * 「★6＝伝説」と「初期サブ4＝エピック」の2つのレア度が同じ札の中に並ぶ。
 * ★は `★★★★★★` として既に出ているので、言葉の方はレア度へ譲る。
 */
const name = (equipment: Equipment): string => `${SET_LABEL[equipment.set]}の${SLOT_LABEL[equipment.slot]}`;

export function renderFarmEquipmentResult(props: FarmEquipmentResultProps): HTMLElement {
  /*
   * **絞り込んでから、まとめて売る。**
   *
   * 周回10回ぶんの装備がそのまま縦に並ぶので、ここで要るものと要らないものを
   * 選り分けるには1枚ずつ見ていくしかなかった(依頼主の指摘)。
   * 所持装備の一覧と同じ軸で絞り、**残ったものだけ**をまとめて選べるようにする。
   *
   * ここに出るのは獲得直後の装備なので、誰も着けていない(`isEquipped` は常に偽)。
   */
  const shown = filterEquipment(props.equipment, props.filter, () => false);
  const selected = props.equipment.filter((item) => props.selectedIds.includes(item.id) && !item.locked);
  const total = selected.reduce((sum, item) => sum + equipmentSellPrice(item), 0);
  const detail = props.equipment.find((item) => item.id === props.detailId) ?? null;
  const sellableShownIds = sellableEquipmentIds(shown);
  const cards = shown.map((item) => el("article", { className: "farm-equip-card", "data-locked": String(item.locked === true), ...equipmentRarityAttrs(item) }, [
    el("button", { type: "button", className: "farm-equip-card__detail", onclick: () => props.onDetail(item.id) }, [
      el("strong", {}, [name(item)]),
      el("span", { className: "farm-equip-card__stars" }, ["★".repeat(item.star)]),
      // 獲得の場面はいちばん強く出してよい。レジェンド・エピックが一目で分かるように大きい札にする
      equipmentRarityTag(item, "lg"),
      el("span", {}, [`${SLOT_LABEL[item.slot]} ・ +${item.level}`]),
      el("b", {}, [formatStatValue(item.mainStat)]),
      el("small", {}, [item.subStats.length ? `サブ：${item.subStats.map(formatStatValue).join(" / ")}` : "サブステータスなし"]),
    ]),
    el("div", { className: "farm-equip-card__actions" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onToggleLock(item.id) }, [equipmentLockLabel(item)]),
      el("label", { className: `farm-equip-card__select${item.locked ? " farm-equip-card__select--disabled" : ""}` }, [
        el("input", { type: "checkbox", disabled: item.locked === true, checked: props.selectedIds.includes(item.id), onchange: () => props.onToggleSelected(item.id) }),
        " 売却選択",
      ]),
    ]),
  ]));

  /*
   * `aria-modal` を付けるのは**支援技術のためだけではない。**
   * 巡回はこの印で「いま裏は触れなくて正しい」を見分けている。
   * 無いと、シートの後ろにある結果画面のボタンを全部「押せない」と誤報する。
   */
  return el("div", { className: "farm-equip-sheet", role: "dialog", "aria-modal": "true", ariaLabel: "今回獲得した装備" }, [
    el("div", { className: "farm-equip-sheet__scrim", onclick: props.onClose }),
    el("section", { className: "farm-equip-sheet__panel" }, [
      el("header", {}, [el("div", {}, [el("h2", {}, ["今回獲得した装備"]), el("p", {}, ["所持品に追加済みの装備だけを表示しています"])]), el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClose }, ["閉じる"])]),
      // 絞り込みは**流れの中**に置く。浮かせると下の札を覆って押せなくする
      renderEquipmentFilterBar({
        all: props.equipment,
        shownCount: shown.length,
        filter: props.filter,
        open: props.filterOpen,
        onToggleOpen: props.onToggleFilterOpen,
        onChange: props.onChangeFilter,
      }),
      cards.length
        ? el("div", { className: "farm-equip-sheet__list" }, cards)
        : el("p", { className: "result-empty" }, [
          props.equipment.length ? "この条件に当てはまる装備はありません" : "現在所持している今回の装備はありません",
        ]),
      el("footer", {}, [
        el("span", {}, [`選択 ${selected.length}個　売却予定 +${total.toLocaleString("ja-JP")}G`]),
        el("div", { className: "farm-equip-sheet__bulk" }, [
          /*
           * **「全選択」ではなく「表示中をすべて選ぶ」。**
           * 絞り込んだ意味が無くなるうえ、見えていないものが選ばれて売れてしまう。
           * 所持装備の一覧と同じ言い回しにしてある
           */
          el("button", {
            type: "button",
            className: "btn btn--ghost",
            disabled: sellableShownIds.length === 0,
            onclick: () => props.onSelectAll(sellableShownIds),
          }, [`表示中をすべて選ぶ (${sellableShownIds.length})`]),
          el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClearSelection }, ["選択解除"]),
        ]),
        el("button", { type: "button", className: "btn btn--danger", disabled: selected.length === 0 || props.selling, onclick: props.onSell }, [props.selling ? "売却中…" : `${selected.length}個を売却　+${total.toLocaleString("ja-JP")}G`]),
      ]),
    ]),
    detail ? el("section", { className: "farm-equip-detail", role: "dialog", ariaLabel: "装備詳細", ...equipmentRarityAttrs(detail) }, [
      el("h3", {}, [name(detail)]),
      el("b", {}, [`${"★".repeat(detail.star)}　+${detail.level}`]),
      equipmentRarityTag(detail, "lg"),
      el("p", {}, [`${SLOT_LABEL[detail.slot]} / ${SET_LABEL[detail.set]}シリーズ`]),
      el("strong", {}, [formatStatValue(detail.mainStat)]),
      ...detail.subStats.map((stat) => el("p", {}, [formatStatValue(stat)])),
      el("button", { type: "button", className: "btn btn--primary", onclick: () => props.onDetail(null) }, ["詳細を閉じる"]),
    ]) : null,
  ].filter((node): node is HTMLElement => node !== null));
}
