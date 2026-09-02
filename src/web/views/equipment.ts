import { canEnhanceEquipment, enhanceEquipmentCost, equipmentSellPrice, Equipment, EQUIP_SLOTS, EquipSlot, SET_LABEL, SLOT_LABEL, STAT_LABEL, StatRoll, formatStatValue } from "../../core/equipment.js";
import { findMonsterById } from "../../data/monsters.js";
import { findEquippedOwner, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { createIncrementalGrid } from "../incrementalGrid.js";
import { icon, slotIcon } from "../icons.js";
import { managementHeader } from "./managementHeader.js";
import { compareEquipmentStats, equipmentForSlot, equipmentLockLabel, equipmentStatTotal, sellableEquipmentIds } from "../uxHelpers.js";
import "../ui/equipmentList.css";

export interface EquipmentPickerContext {
  monsterId: string;
  slot: EquipSlot;
}

/**
 * 並べ替えの種類。
 *
 * 装備は数十個たまるので、「今その順で見たい理由」が場面ごとに違う。
 * 強い物を探す・売る物を探す・シリーズを揃える、で必要な順序が別なので選べるようにする。
 */
export type EquipmentSortKey = "recommended" | "star" | "level" | "slot" | "set" | "value" | StatRoll["type"];

/**
 * 並べ替えの札に出す文言。
 *
 * 「星の高い順」「強化の高い順」「売値の高い順」と全部を言い切ると、
 * 6枚で3段に折り返し、**装備が1枚も見えないまま画面が終わっていた**。
 * 「〜の高い順」は札の並びそのものが語るので、頭の語だけ残す。
 */
export const EQUIPMENT_SORT_LABEL: Record<EquipmentSortKey, string> = {
  recommended: "おすすめ",
  star: "★の高い順",
  level: "強化順",
  slot: "枠の順",
  set: "シリーズ",
  value: "売値順",
  HP_PERCENT: "HP%", HP_FLAT: "HP実数", ATK_PERCENT: "攻撃%", ATK_FLAT: "攻撃実数",
  DEF_PERCENT: "防御%", DEF_FLAT: "防御実数", SPD: "速度", CRIT_RATE: "会心率",
  CRIT_DMG: "会心ダメージ", ACCURACY: "効果命中", RESISTANCE: "効果抵抗",
};

export const EQUIPMENT_SORT_KEYS: EquipmentSortKey[] = ["recommended", "level", "star", "HP_PERCENT", "HP_FLAT", "ATK_PERCENT", "ATK_FLAT", "DEF_PERCENT", "DEF_FLAT", "SPD", "CRIT_RATE", "CRIT_DMG", "ACCURACY", "RESISTANCE", "slot", "set", "value"];

export interface EquipmentProps {
  player: PlayerState;
  detailId: string | null;
  pickerContext: EquipmentPickerContext | null;
  slotFilter: EquipSlot | null;
  sortKey: EquipmentSortKey;
  /** 一括売却のために選ばれている装備 */
  selectedIds: string[];
  /** 選択モード中かどうか。通常は札を押すと詳細へ、選択モード中は選択の切り替えになる */
  selecting: boolean;
  onSelectDetail: (id: string | null) => void;
  onEquip: (equipmentId: string, monsterId: string) => void;
  onUnequip: (equipmentId: string) => void;
  onEnhance: (equipmentId: string) => void;
  onSell: (equipmentId: string) => void;
  onCancelPicker: () => void;
  onGoDungeon: () => void;
  onChangeSlotFilter: (slot: EquipSlot | null) => void;
  onChangeSort: (key: EquipmentSortKey) => void;
  onToggleSelecting: () => void;
  onToggleSelected: (equipmentId: string) => void;
  onSelectAllShown: (ids: string[]) => void;
  onClearSelection: () => void;
  onBulkSell: () => void;
  onToggleLock: (equipmentId: string) => void;
}

function equipmentOwnerName(player: PlayerState, equipment: Equipment): string | null {
  const owner = findEquippedOwner(player, equipment.id);
  if (!owner) return null;
  const dex = findMonsterById(owner.dexId);
  return dex ? dex.name : owner.dexId;
}

/** 割合で持つ値かどうか。表示の桁と単位がここで分かれる */
function isPercentStat(type: StatRoll["type"]): boolean {
  return !["HP_FLAT", "ATK_FLAT", "DEF_FLAT", "SPD"].includes(type);
}

function formatMainStatNumber(stat: StatRoll): string {
  return isPercentStat(stat.type) ? `${(stat.value * 100).toFixed(1)}%` : String(stat.value);
}

/** サブの数値だけ。名前は呼ぶ側が別の枠に出す */
function formatSubStatNumber(stat: StatRoll): string {
  return formatMainStatNumber(stat);
}

/**
 * 一覧に並べる装備1枚。
 *
 * 前は「スロット1 / 的中 / +0 / ★★★★★★ / 攻撃力+136 / サブ4行 / 名前」を
 * 上から順に積んだだけで、**どの札も同じ濃さの数字の柱**になっていた。
 * 数十枚を見比べる画面なので、読ませる前に見分けが付くことを優先する:
 *
 *   左に枠の紋章(剣・羽・盾・珠・兜・環)… どの枠の物かを字を読まずに掴む
 *   右上に強化段階 …………………………… 育てた度合い
 *   中央に大きくメインの数値 ……………… その装備を選ぶ理由
 *   下にサブと持ち主 ………………………… 確かめる時だけ読む
 */
function equipmentCard(player: PlayerState, equipment: Equipment, onClick: () => void, currentId?: string): HTMLElement {
  const ownerName = equipmentOwnerName(player, equipment);
  /*
   * サブは**名前と数値を分ける。**
   *
   * `formatStatValue` は「攻撃力%3.8%」と1つの文字列で返す。並べると
   * どこまでが名前でどこからが数値なのか目で切れず、数十枚を見比べる画面で
   * いちばん読み違えるところだった。名前は左、数値は右端で揃える。
   */
  const subLines =
    equipment.subStats.length > 0
      ? equipment.subStats.map((s) => el("div", { className: "equip-card__sub-line" }, [
        el("span", { className: "equip-card__sub-label" }, [STAT_LABEL[s.type]]),
        el("span", { className: "equip-card__sub-value" }, [formatSubStatNumber(s)]),
      ]))
      : [el("div", { className: "equip-card__sub-line equip-card__sub-line--empty" }, ["サブステータスなし"])];

  // 等級・シリーズ・強化段階を data 属性で持たせ、色と縁取りはCSS側で当てる。
  // 数十枚を並べる画面なので、文字を読まなくても強さの序列が分かることを優先する
  return el(
    "button",
    {
      type: "button",
      className: `equip-card${equipment.id === currentId ? " equip-card--current" : ""}`,
      onclick: onClick,
      "data-star": String(equipment.star),
      "data-set": equipment.set,
      "data-tier": equipment.level >= 12 ? "max" : equipment.level >= 6 ? "mid" : "low",
    },
    [
      el("div", { className: "equip-card__head" }, [
        // 枠の紋章。等級の色を纏わせ、台座に嵌める
        el("span", { className: "equip-card__sigil" }, [icon(slotIcon(equipment.slot))]),
        el("span", { className: "equip-card__head-text" }, [
          el("span", { className: "equip-card__star" }, ["★".repeat(equipment.star)]),
          el("span", { className: "equip-card__meta" }, [
            el("span", { className: "equip-card__slot" }, [`枠${equipment.slot}`]),
            el("span", { className: "equip-card__set" }, [SET_LABEL[equipment.set]]),
          ]),
        ]),
        el("span", { className: "equip-card__level" }, [`+${equipment.level}`]),
      ]),
      equipment.id === currentId ? el("span", { className: "equip-card__status" }, ["現在装備中"]) : null,
      el("div", { className: "equip-card__main" }, [
        el("span", { className: "equip-card__main-label" }, [STAT_LABEL[equipment.mainStat.type]]),
        el("strong", { className: "equip-card__main-value" }, [formatMainStatNumber(equipment.mainStat)]),
      ]),
      el("div", { className: "equip-card__subs" }, subLines),
      ownerName
        ? el("div", { className: "equip-card__owner" }, [el("i", { className: "equip-card__dot" }, []), ownerName])
        : el("div", { className: "equip-card__owner equip-card__owner--free" }, [
            el("i", { className: "equip-card__dot" }, []),
            "未装着",
          ]),
    ].filter((node): node is HTMLElement => node !== null),
  );
}

/**
 * 枠で絞る帯。
 *
 * 「すべて/スロット1…スロット6」を字で並べると7枚で2段に折り返し、
 * その下の並べ替えの帯と**同じ見た目・同じ青**で続いていた。
 * どこまでが1つの群れなのか分からず、画面の上半分が札で埋まる原因でもあった。
 * 枠は紋章の四角い印にして1段に収め、並べ替えとは形からして別物にする。
 */
function renderSlotFilterRow(props: EquipmentProps): HTMLElement {
  const allChip = el(
    "button",
    {
      type: "button",
      className: `equip-filter__chip equip-filter__chip--all${props.slotFilter === null ? " equip-filter__chip--active" : ""}`,
      onclick: () => props.onChangeSlotFilter(null),
    },
    ["すべて"],
  );
  const slotChips = EQUIP_SLOTS.map((slot) =>
    el(
      "button",
      {
        type: "button",
        className: `equip-filter__chip${props.slotFilter === slot ? " equip-filter__chip--active" : ""}`,
        // 印だけでは6つの区別を覚えるまで迷うので、番号も小さく添える
        ariaLabel: SLOT_LABEL[slot],
        onclick: () => props.onChangeSlotFilter(slot),
      },
      [icon(slotIcon(slot)), el("small", {}, [String(slot)])],
    ),
  );
  return el("div", { className: "equip-filter" }, [allChip, ...slotChips]);
}

/** 並べ替えの本体。各軸の同値条件をたどり、最後はIDで必ず決着させる。 */
export function compareEquipmentBySort(key: EquipmentSortKey, isEquipped: (e: Equipment) => boolean = () => false): (a: Equipment, b: Equipment) => number {
  return (a, b) => {
    let result: number;
    switch (key) {
      case "star":
        result = b.star - a.star || b.level - a.level || a.slot - b.slot;
        break;
      case "level":
        result = b.level - a.level || b.star - a.star || a.slot - b.slot;
        break;
      case "slot":
        result = a.slot - b.slot || b.star - a.star || b.level - a.level;
        break;
      case "set":
        result = a.set.localeCompare(b.set) || b.star - a.star || b.level - a.level;
        break;
      case "value":
        result = equipmentSellPrice(b) - equipmentSellPrice(a);
        break;
      case "HP_PERCENT": case "HP_FLAT": case "ATK_PERCENT": case "ATK_FLAT": case "DEF_PERCENT": case "DEF_FLAT":
      case "SPD": case "CRIT_RATE": case "CRIT_DMG": case "ACCURACY": case "RESISTANCE":
        result = equipmentStatTotal(b, key) - equipmentStatTotal(a, key) || b.star - a.star || b.level - a.level;
        break;
      default:
        // おすすめ: 装着中 → スロット → 星 → 強化。普段使いの並び
        result = Number(isEquipped(b)) - Number(isEquipped(a)) || a.slot - b.slot || b.star - a.star || b.level - a.level;
    }
    // すべての条件が同じでも、保存配列の偶然の順序に依存させない。
    return result || a.id.localeCompare(b.id);
  };
}

/** 通常一覧と装備候補一覧で必ず同じ比較器を通すための共通入口。 */
export function sortEquipment(equipment: readonly Equipment[], key: EquipmentSortKey, isEquipped: (e: Equipment) => boolean = () => false): Equipment[] {
  return equipment.slice().sort(compareEquipmentBySort(key, isEquipped));
}

/** iPhoneでも1段に収まり、現在値が常に見えるネイティブ選択欄。 */
function renderSortRow(props: EquipmentProps): HTMLElement {
  return el("div", { className: "equip-sort" }, [
    el("label", { className: "equip-sort__label", htmlFor: "equipment-sort" }, ["並べ替え"]),
    el("div", { className: "equip-sort__control" }, [
      el("select", {
        id: "equipment-sort",
        className: "equip-sort__select",
        value: props.sortKey,
        onchange: (event: Event) => props.onChangeSort((event.currentTarget as HTMLSelectElement).value as EquipmentSortKey),
        ariaLabel: "装備の並べ替え",
      }, EQUIPMENT_SORT_KEYS.map((key) => el("option", { value: key }, [EQUIPMENT_SORT_LABEL[key]]))),
      el("span", { className: "equip-sort__current", ariaHidden: "true" }, [EQUIPMENT_SORT_LABEL[props.sortKey]]),
    ]),
  ]);
}

/** 一括売却の操作帯。選択モードの時だけ出す */
function renderBulkBar(props: EquipmentProps, shown: Equipment[]): HTMLElement {
  const isEquipped = (e: Equipment) => equipmentOwnerName(props.player, e) !== null;
  // 装着中のものは売れないので、まとめて選ぶ対象からも外す
  const equippedIds = new Set(shown.filter(isEquipped).map((item) => item.id));
  const sellableIds = sellableEquipmentIds(shown, equippedIds);
  const sellable = shown.filter((item) => sellableIds.includes(item.id));
  const selected = props.player.equipment.filter((e) => props.selectedIds.includes(e.id) && !e.locked);
  const total = selected.reduce((sum, e) => sum + equipmentSellPrice(e), 0);

  return el("div", { className: "bulk-bar" }, [
    el("div", { className: "bulk-bar__row" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onSelectAllShown(sellable.map((e) => e.id)) }, [
        `表示中をすべて選ぶ (${sellable.length})`,
      ]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onClearSelection }, ["選択を解除"]),
    ]),
    // 売値は**押す前に見せる**。押してから知る金額であってはいけない
    el("div", { className: "bulk-bar__summary" }, [
      `${selected.length}個を選択中`,
      el("span", { className: "bulk-bar__price" }, [icon("coin"), el("strong", {}, [total.toLocaleString("ja-JP")])]),
    ]),
    el(
      "button",
      {
        type: "button",
        className: "btn btn--danger btn--large bulk-bar__go",
        disabled: selected.length === 0,
        onclick: props.onBulkSell,
      },
      [icon("tag"), `選択した${selected.length}個を売却する`],
    ),
  ]);
}

function renderList(props: EquipmentProps): HTMLElement {
  const isEquipped = (e: Equipment) => equipmentOwnerName(props.player, e) !== null;
  const filteredItems = props.pickerContext
    ? equipmentForSlot(props.player.equipment, props.pickerContext.slot)
    : props.player.equipment.filter((e) => props.slotFilter === null || e.slot === props.slotFilter);
  const items = sortEquipment(filteredItems, props.sortKey, isEquipped);

  const selecting = props.selecting && !props.pickerContext;
  const pickerMonster = props.pickerContext
    ? props.player.monsters.find((monster) => monster.id === props.pickerContext!.monsterId)
    : undefined;
  const currentEquipmentId = props.pickerContext && pickerMonster
    ? pickerMonster.equipment[props.pickerContext.slot]
    : undefined;

  const renderItem = (eq: Equipment): HTMLElement => {
    const card = equipmentCard(props.player, eq, () => {
      if (props.pickerContext) {
        props.onEquip(eq.id, props.pickerContext.monsterId);
      } else if (selecting) {
        // 装着中は売れないので、選択そのものをさせない
        if (!isEquipped(eq) && !eq.locked) props.onToggleSelected(eq.id);
      } else {
        props.onSelectDetail(eq.id);
      }
    }, currentEquipmentId);
    if (selecting) {
      card.classList.add("equip-card--selectable");
      if (isEquipped(eq) || eq.locked) card.classList.add("equip-card--locked");
      if (props.selectedIds.includes(eq.id)) card.classList.add("equip-card--selected");
    }
    const lockButton = el(
      "button",
      {
        type: "button",
        className: `equip-card__lock-button${eq.locked ? " equip-card__lock-button--locked" : ""}`,
        ariaLabel: equipmentLockLabel(eq),
        "aria-pressed": String(eq.locked),
        title: equipmentLockLabel(eq),
        onclick: (event: Event) => {
          // 鍵は札と別の操作。親の選択・詳細表示へ絶対に伝播させない。
          event.preventDefault();
          event.stopPropagation();
          props.onToggleLock(eq.id);
        },
      },
      [icon("lock")],
    );
    if (!props.pickerContext) return el("div", { className: "equip-picker-card" }, [card, lockButton]);

    const current = props.player.equipment.find((item) => item.id === currentEquipmentId);
    const comparisons = compareEquipmentStats(current, eq);
    const enhanceable = canEnhanceEquipment(eq);
    const enhanceCost = enhanceable ? enhanceEquipmentCost(eq) : 0;
    const canAffordEnhance = !enhanceable || props.player.gold >= enhanceCost;
    const enhanceButton = el(
      "button",
      {
        type: "button",
        className: `btn equip-picker-card__enhance${enhanceable ? " btn--gold" : " btn--ghost"}`,
        disabled: !enhanceable || !canAffordEnhance,
        title: enhanceable
          ? canAffordEnhance
            ? `この装備を+${eq.level + 1}へ強化`
            : `ゴールドが足りません（${enhanceCost.toLocaleString("ja-JP")}必要）`
          : "最大まで強化済み",
        onclick: (event: Event) => {
          // 強化は「装備する」とは別操作。札本体の装着処理へ絶対に伝播させない。
          event.preventDefault();
          event.stopPropagation();
          if (enhanceable && canAffordEnhance) props.onEnhance(eq.id);
        },
      },
      enhanceable
        ? [icon("arrowUp", { size: 13 }), `強化+${eq.level + 1}`, el("span", { className: "equip-picker-card__enhance-cost" }, [icon("coin", { size: 12 }), enhanceCost.toLocaleString("ja-JP")])]
        : [icon("check", { size: 13 }), "MAX"],
    );

    /*
     * 差分は**1項目1行の表**にする。
     *
     * 前は「攻撃力+ 36 → 37 (+1)」を色付きの `<small>` で並べていただけで、
     * 折り返しの都合で行の途中に次の項目が始まり、**5行の色の帯**になっていた。
     * 名前・変化・差、と列を決めれば、目は差の列だけを縦に追える。
     */
    const comparisonRows = comparisons.map((row) => {
      const percent = isPercentStat(row.type);
      const show = (value: number | null) => value === null ? "—" : percent ? `${Math.round(value * 100)}%` : `${Math.round(value)}`;
      const delta = percent ? `${Math.round(row.delta * 100)}%` : `${Math.round(row.delta)}`;
      return el("div", { className: `equip-cmp__row ${row.delta >= 0 ? "is-up" : "is-down"}` }, [
        el("span", { className: "equip-cmp__label" }, [row.label]),
        el("span", { className: "equip-cmp__move" }, [`${show(row.current)}→${show(row.candidate)}`]),
        el("span", { className: "equip-cmp__delta" }, [`${row.delta >= 0 ? "+" : ""}${delta}`]),
      ]);
    });

    /*
     * 札・差分・強化を**1つの枠に収める。**
     *
     * 前は枠(`.equip-card`)の外に差分と画面幅いっぱいの金色の強化ボタンを
     * 積んでいたので、どこまでが1つの装備なのか切れ目が分からなかった。
     * 枠を外側(`.equip-picker-card`)へ移し、中身を上から
     * 「装備そのもの → 今との差 → 強化」の順に置く。
     * 等級の色は `data-star` で決まるので、枠を移した先にも同じ印を持たせる。
     */
    return el("div", {
      className: `equip-picker-card equip-picker-card--framed${eq.id === currentEquipmentId ? " equip-picker-card--current" : ""}`,
      "data-star": String(eq.star),
      "data-set": eq.set,
      "data-tier": eq.level >= 12 ? "max" : eq.level >= 6 ? "mid" : "low",
    }, [
      card,
      comparisonRows.length ? el("div", { className: "equip-cmp" }, comparisonRows) : null,
      el("div", { className: "equip-picker-card__foot" }, [enhanceButton]),
      lockButton,
    ].filter((node): node is HTMLElement => node !== null));
  };

  const equipmentGrid = createIncrementalGrid({
    className: "equip-grid",
    items,
    renderItem,
    moreLabel: (shown, total) => `装備をさらに表示（${shown} / ${total}）`,
  });

  // 操作の帯。
  // 前は「挑戦する」「まとめて売却する」が画面幅いっぱいの札として
  // 縦に2枚並び、絞り込みの2段と合わせて**上から360pxが全部つまみ**だった。
  // 行き先(ダンジョン)と道具の整理(まとめ売り)を1段に並べる
  const toolbar = props.pickerContext
    ? currentEquipmentId
      // 何をどう読む画面かを1行で言う。2行に割れると、その下の札が半分隠れる
      ? el("div", { className: "equip-picker__current" }, [el("strong", {}, ["金の縁"]), "が今ついている装備。札を押すと着け替え、右下から強化できます"])
      : el("div", { className: "equip-picker__current" }, ["この枠は未装備です。札を押すと装着、右下から強化できます"])
    : el("div", { className: "equip-toolbar" }, [
        el("button", { type: "button", className: "btn btn--gold equip-toolbar__go", onclick: props.onGoDungeon }, [
          icon("equipDungeon"),
          el("span", {}, ["装備ダンジョン"]),
        ]),
        el(
          "button",
          {
            type: "button",
            className: `btn equip-toolbar__select${selecting ? " equip-toolbar__select--on" : ""}`,
            onclick: props.onToggleSelecting,
          },
          [icon("check"), el("span", {}, [selecting ? "選択を終える" : "まとめ売り"])],
        ),
      ]);

  return el("div", { className: "screen equipment-screen" }, [
    props.pickerContext ? managementHeader(
      `スロット${props.pickerContext.slot}を変更`,
      props.onCancelPicker,
      pickerMonster ? (findMonsterById(pickerMonster.dexId)?.name ?? pickerMonster.dexId) : "",
    ) : el("header", { className: "app-header" }, [
      // 「スロット1の装備を選択」は390pxの幅で「…装備を / 選択」と2行に割れ、
      // 見出しだけで縦100pxを使っていた。同じことを1行で言う
      el("h1", {}, ["所持装備"]),
      el("p", { className: "app-subtitle" }, [`${items.length}個`]),
    ]),
    toolbar,
    props.pickerContext ? null : renderSlotFilterRow(props),
    renderSortRow(props),
    selecting ? renderBulkBar(props, items) : null,
    el("section", { className: "panel" }, [
      items.length === 0
        ? el("p", { className: "app-subtitle" }, ["該当する装備がありません。ステージクリアでドロップします。"])
        : equipmentGrid.element,
    ]),
  ].filter((n): n is HTMLElement => n !== null));
}

function renderDetail(props: EquipmentProps, equipment: Equipment): HTMLElement {
  const ownerName = equipmentOwnerName(props.player, equipment);
  const canEnhance = canEnhanceEquipment(equipment);
  const cost = enhanceEquipmentCost(equipment);
  const canAfford = props.player.gold >= cost;
  const sellPrice = equipmentSellPrice(equipment);
  const isEquipped = ownerName !== null;

  const MAX_LEVEL = 15;
  const progress = Math.max(0, Math.min(1, equipment.level / MAX_LEVEL));

  return el("div", { className: "screen equipment-screen equipment-screen--detail" }, [
    managementHeader(`スロット${equipment.slot}の装備`, () => props.onSelectDetail(null), ownerName ?? "装備詳細"),

    /* 銘板。
     * 前は文字を7行縦に積んだだけで、**どれが主役の数字か**が分からなかった。
     * 枠の紋章を大きく立て、メインの数値を主役に、強化は帯で見せる。 */
    el(
      "section",
      {
        className: "panel equip-detail",
        "data-star": String(equipment.star),
        "data-set": equipment.set,
        "data-tier": equipment.level >= 12 ? "max" : equipment.level >= 6 ? "mid" : "low",
      },
      [
        el("div", { className: "equip-detail__top" }, [
          el("div", { className: "equip-detail__sigil" }, [icon(slotIcon(equipment.slot))]),
          el("div", { className: "equip-detail__ident" }, [
            el("div", { className: "equip-detail__star" }, ["★".repeat(equipment.star)]),
            el("div", { className: "equip-detail__set" }, [`${SET_LABEL[equipment.set]}シリーズ`]),
            el("div", { className: "equip-detail__main" }, [formatStatValue(equipment.mainStat)]),
          ]),
        ]),

        // 強化。数字だけでは「あとどれだけ伸ばせるか」が伝わらないので溝に嵌めた帯にする
        el("div", { className: "equip-detail__gauge" }, [
          el("div", { className: "equip-detail__gauge-head" }, [
            el("span", {}, ["強化"]),
            el("strong", {}, [`+${equipment.level}`]),
            el("small", {}, [`/ ${MAX_LEVEL}`]),
          ]),
          el("div", { className: "equip-detail__track" }, [
            el("i", { style: `width:${(progress * 100).toFixed(1)}%` }, []),
          ]),
        ]),

        el("div", { className: "equip-detail__subs" }, [
          el("div", { className: "equip-detail__subs-label" }, ["サブステータス"]),
          ...(equipment.subStats.length > 0
            ? equipment.subStats.map((s) => el("div", { className: "equip-detail__sub-line" }, [formatStatValue(s)]))
            : [el("div", { className: "equip-detail__sub-line equip-detail__sub-line--empty" }, ["なし"])]),
        ]),

        ownerName
          ? el("div", { className: "equip-detail__owner" }, [el("i", { className: "equip-card__dot" }, []), `装着中 ・ ${ownerName}`])
          : el("div", { className: "equip-detail__owner equip-detail__owner--free" }, [
              el("i", { className: "equip-card__dot" }, []),
              "未装着",
            ]),
      ],
    ),

    /* 押す場所の序列。
     * 前は「強化」「外す」「売却」「戻る」が同じ幅・同じ高さで4枚並び、
     * **取り返しのつかない売却と、ただ戻るだけの操作が同格**だった。
     * 育てる(金)→ 付け外し(鋼)→ 手放す(朱)→ 戻る(控えめ)の順に落とす。 */
    canEnhance
      ? el(
          "button",
          {
            type: "button",
            className: "btn btn--gold btn--large equip-detail__enhance",
            disabled: !canAfford,
            onclick: () => props.onEnhance(equipment.id),
          },
          [
            icon("arrowUp"),
            el("span", { className: "equip-detail__enhance-lead" }, ["強化する"]),
            el("span", { className: "equip-detail__enhance-cost" }, [icon("coin"), el("strong", {}, [cost.toLocaleString("ja-JP")])]),
          ],
        )
      : el("div", { className: "equip-detail__maxed" }, [icon("check"), "強化はここまで。最大まで鍛え上げてある"]),

    ownerName
      ? el("button", { type: "button", className: "btn btn--ghost equip-detail__act", onclick: () => props.onUnequip(equipment.id) }, [
          "外す",
        ])
      : null,

    el("button", { type: "button", className: "btn btn--ghost equip-detail__act", onclick: () => props.onToggleLock(equipment.id) }, [equipmentLockLabel(equipment)]),

    isEquipped ? el("p", { className: "equip-detail__note" }, ["装着中は売却できません。先に外してください"]) : null,

    el(
      "button",
      { type: "button", className: "btn btn--danger equip-detail__act", disabled: isEquipped || equipment.locked, onclick: () => props.onSell(equipment.id) },
      [icon("tag"), `売却する`, el("span", { className: "equip-detail__sell-price" }, [icon("coin"), sellPrice.toLocaleString("ja-JP")])],
    ),

  ].filter((n): n is HTMLElement => n !== null));
}

export function renderEquipment(props: EquipmentProps): HTMLElement {
  if (props.pickerContext) return renderList(props);
  const target = props.detailId ? props.player.equipment.find((e) => e.id === props.detailId) : undefined;
  if (target) return renderDetail(props, target);
  return renderList(props);
}
