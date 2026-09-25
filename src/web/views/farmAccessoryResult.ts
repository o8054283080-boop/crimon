import { type Accessory, accessorySellPrice, describeAccessoryMain, describeSpecial } from "../../core/accessory.js";
import { type AccessoryFilter, filterAccessories, sellableAccessoryIds } from "../../game/accessories.js";
import { el } from "../dom.js";
import "../farmEquipmentResult.css";
import "../ui/accessories.css";
import { renderAccessoryBadges, renderAccessorySummary } from "./accessoryCard.js";
import { renderAccessoryFilterBar } from "./accessoryFilterBar.js";

/**
 * 今回獲得したアクセサリーのシート。**装備の「今回獲得した装備」(`farmEquipmentResult.ts`)と同じ形。**
 *
 * 遺跡の周回・1戦の結果から開く。前は結果画面に「💍 アクセサリー +10」の札が出るだけで、
 * 中身を見るには装備画面のアクセ一覧まで行き、今回の分を探して1個ずつ売るしかなかった。
 *
 * 見た目のクラス(`farm-equip-sheet*` / `farm-equip-card*`)は装備のシートと共有している。
 * 同じ役目の部品なので、装備とアクセで形が割れないようにする。
 */
export interface FarmAccessoryResultProps {
  /** 所持品に残っている今回のアクセだけ(売った・消えたものは渡さない) */
  accessories: Accessory[];
  /** 誰かが着けているアクセのID。後から開いた時は、もう着けていることがある */
  wornIds: ReadonlySet<string>;
  /** 着けている子の名前(着けていない時は null) */
  ownerName: (accessoryId: string) => string | null;
  selectedIds: readonly string[];
  detailId: string | null;
  selling: boolean;
  filter: AccessoryFilter;
  filterOpen: boolean;
  onChangeFilter(filter: AccessoryFilter): void;
  onToggleFilterOpen(): void;
  onToggleLock(id: string): void;
  onToggleSelected(id: string): void;
  onDetail(id: string | null): void;
  onSell(): void;
  onSelectAllShown(ids: string[]): void;
  onClearSelection(): void;
  onClose(): void;
}

export function renderFarmAccessoryResult(props: FarmAccessoryResultProps): HTMLElement {
  const isWorn = (acc: Accessory) => props.wornIds.has(acc.id);
  const blocked = (acc: Accessory) => acc.locked === true || isWorn(acc);
  const shown = filterAccessories(props.accessories, props.filter, isWorn);
  const selected = props.accessories.filter((acc) => props.selectedIds.includes(acc.id) && !blocked(acc));
  const total = selected.reduce((sum, acc) => sum + accessorySellPrice(acc), 0);
  const detail = props.accessories.find((acc) => acc.id === props.detailId) ?? null;
  const sellableShownIds = sellableAccessoryIds(shown, props.wornIds);

  const cards = shown.map((acc) => {
    const owner = props.ownerName(acc.id);
    const picked = props.selectedIds.includes(acc.id) && !blocked(acc);
    return el("article", {
      className: `farm-equip-card farm-acc-card farm-acc-card--${acc.rarity.toLowerCase()}${picked ? " farm-acc-card--picked" : ""}`,
      "data-locked": String(acc.locked === true),
      "data-accessory-id": acc.id,
    }, [
      el("button", { type: "button", className: "farm-equip-card__detail", onclick: () => props.onDetail(acc.id) }, [
        renderAccessoryBadges(acc),
        el("b", {}, [describeAccessoryMain(acc)]),
        el("small", {}, [acc.specials.map(describeSpecial).join(" / ")]),
        owner ? el("small", { className: "farm-acc-card__owner" }, [`装着中: ${owner}`]) : null,
      ].filter((n): n is HTMLElement => n !== null)),
      el("div", { className: "farm-equip-card__actions" }, [
        el("button", {
          type: "button",
          className: "btn btn--ghost",
          "aria-pressed": String(acc.locked === true),
          onclick: () => props.onToggleLock(acc.id),
        }, [acc.locked ? "🔓 ロック解除" : "🔒 ロック"]),
        /*
         * 売却に選ぶ操作は**ロックと同じ大きさのボタン**にする。
         * ブラウザ標準の小さなチェック箱だった時は、隣のロックの方が主役に見えた。
         * 選べない時は、理由(ロック中・装着中)をボタンの字で言う。
         */
        el("button", {
          type: "button",
          className: `btn btn--ghost farm-acc-card__pick${picked ? " is-picked" : ""}`,
          "aria-pressed": String(picked),
          disabled: blocked(acc),
          onclick: () => props.onToggleSelected(acc.id),
        }, [acc.locked ? "ロック中は売れません" : isWorn(acc) ? "装着中は売れません" : picked ? "✓ 売却に選択中" : "売却に選ぶ"]),
      ]),
    ]);
  });

  /*
   * `aria-modal` は巡回が「いま裏は触れなくて正しい」を見分ける印でもある。
   * 無いと、シートの後ろの結果画面のボタンを全部「押せない」と誤報する。
   */
  return el("div", { className: "farm-equip-sheet farm-acc-sheet", role: "dialog", "aria-modal": "true", ariaLabel: "今回獲得したアクセサリー" }, [
    el("div", { className: "farm-equip-sheet__scrim", onclick: props.onClose }),
    el("section", { className: "farm-equip-sheet__panel" }, [
      el("header", {}, [
        el("div", {}, [el("h2", {}, ["今回獲得したアクセサリー"]), el("p", {}, ["所持品に残っている分だけを表示します"])]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClose }, ["閉じる"]),
      ]),
      // 絞り込みは**流れの中**に置く。浮かせると下の札を覆って押せなくする
      renderAccessoryFilterBar({
        all: props.accessories,
        shownCount: shown.length,
        filter: props.filter,
        open: props.filterOpen,
        onToggleOpen: props.onToggleFilterOpen,
        onChange: props.onChangeFilter,
      }),
      cards.length
        ? el("div", { className: "farm-equip-sheet__list" }, cards)
        : el("p", { className: "result-empty" }, [
          props.accessories.length ? "この条件に当てはまるアクセサリーはありません" : "現在所持している今回のアクセサリーはありません",
        ]),
      el("footer", {}, [
        el("span", {}, [`選択 ${selected.length}個　売却予定 +${total.toLocaleString("ja-JP")}G`]),
        el("div", { className: "farm-equip-sheet__bulk" }, [
          // 「全選択」ではなく「表示中をすべて選ぶ」。見えていないものまで売れないように
          el("button", {
            type: "button",
            className: "btn btn--ghost",
            disabled: sellableShownIds.length === 0,
            onclick: () => props.onSelectAllShown(sellableShownIds),
          }, [`表示中をすべて選ぶ (${sellableShownIds.length})`]),
          el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClearSelection }, ["選択解除"]),
        ]),
        el("button", {
          type: "button",
          className: "btn btn--danger",
          disabled: selected.length === 0 || props.selling,
          onclick: props.onSell,
        }, [props.selling ? "売却中…" : `${selected.length}個を売却　+${total.toLocaleString("ja-JP")}G`]),
      ]),
    ]),
    detail ? el("section", { className: "farm-equip-detail farm-acc-detail", role: "dialog", ariaLabel: "アクセサリー詳細" }, [
      renderAccessorySummary(detail),
      props.ownerName(detail.id) ? el("p", { className: "acc-note" }, [`装着中: ${props.ownerName(detail.id)}`]) : null,
      el("p", { className: "acc-note" }, [`売却額 🪙${accessorySellPrice(detail).toLocaleString("ja-JP")}`]),
      el("button", { type: "button", className: "btn btn--primary", onclick: () => props.onDetail(null) }, ["詳細を閉じる"]),
    ].filter((n): n is HTMLElement => n !== null)) : null,
  ].filter((node): node is HTMLElement => node !== null));
}
