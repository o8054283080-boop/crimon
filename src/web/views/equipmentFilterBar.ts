/**
 * 所持装備の絞り込み札。
 *
 * 作りは所持モンスター側(`monsterFilterBar.ts`)と同じ。既定では1行に畳んでおき、
 * 押した時だけ条件の札を開く。**装備は数百個たまる**ので、
 * 開いた時に画面が札で埋まらないよう、持っている値の札だけを出す。
 *
 * 見た目のクラス(`mfilter*` / `slot-filter-chip`)はモンスター側と共有している。
 * 同じ役目の部品なので、2つの画面で形が割れないようにする。
 */
import { EQUIP_STARS, EquipStar, Equipment, SET_LABEL, SET_TYPES, STAT_LABEL, STAT_TYPES } from "../../core/equipment.js";
import { EQUIPMENT_RARITIES, EQUIPMENT_RARITY_LABEL } from "../../core/equipmentRarity.js";
import { el } from "../dom.js";
import {
  EMPTY_EQUIPMENT_FILTER,
  EQUIP_USE_FILTER_LABEL,
  EquipUseFilter,
  EquipmentFilter,
  activeEquipmentFilterCount,
  availableEquipmentFacets,
  toggleEquipmentFilterValue,
} from "../equipmentFilter.js";

export interface EquipmentFilterBarProps {
  /** 絞り込む前の全部。札の候補と「◯個中」の分母に使う */
  all: readonly Equipment[];
  /** 絞り込んだ後に見えている数 */
  shownCount: number;
  filter: EquipmentFilter;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (filter: EquipmentFilter) => void;
}

function chip(label: string, active: boolean, onClick: () => void, extraClass = ""): HTMLElement {
  return el(
    "button",
    {
      type: "button",
      className: `slot-filter-chip mfilter__chip${active ? " slot-filter-chip--active" : ""}${extraClass}`,
      onclick: onClick,
    },
    [label],
  );
}

function group(label: string, chips: HTMLElement[]): HTMLElement | null {
  if (chips.length === 0) return null;
  return el("div", { className: "mfilter__group" }, [
    el("span", { className: "mfilter__label" }, [label]),
    el("div", { className: "mfilter__chips" }, chips),
  ]);
}

export function renderEquipmentFilterBar(props: EquipmentFilterBarProps): HTMLElement {
  const { filter, onChange } = props;
  const facets = availableEquipmentFacets(props.all, {
    rarities: EQUIPMENT_RARITIES,
    stars: EQUIP_STARS,
    sets: SET_TYPES,
    mainStats: STAT_TYPES,
  });
  const activeCount = activeEquipmentFilterCount(filter);

  /*
   * レア度の札だけ `data-rarity` を持たせ、選んでいない時も色が乗るようにする。
   * 5段の色は装備の札で使っているものと同じなので、
   * 「金の札を押せば金の装備が残る」が字を読まずに分かる。
   */
  const rarityChips = facets.rarities.map((rarity) => {
    const node = chip(
      EQUIPMENT_RARITY_LABEL[rarity],
      filter.rarities.includes(rarity),
      () => onChange({ ...filter, rarities: toggleEquipmentFilterValue(filter.rarities, rarity) }),
      " mfilter__chip--rarity",
    );
    node.setAttribute("data-rarity", rarity.toLowerCase());
    return node;
  });

  const starChips = facets.stars.map((star: EquipStar) =>
    chip(`★${star}`, filter.stars.includes(star), () =>
      onChange({ ...filter, stars: toggleEquipmentFilterValue(filter.stars, star) }),
    ),
  );

  const setChips = facets.sets.map((set) =>
    chip(SET_LABEL[set], filter.sets.includes(set), () =>
      onChange({ ...filter, sets: toggleEquipmentFilterValue(filter.sets, set) }),
    ),
  );

  const mainChips = facets.mainStats.map((stat) =>
    chip(STAT_LABEL[stat], filter.mainStats.includes(stat), () =>
      onChange({ ...filter, mainStats: toggleEquipmentFilterValue(filter.mainStats, stat) }),
    ),
  );

  // 装着・ロックは「どれか1つ」なので、同じ札をもう一度押すと解除にする
  const useChips = (["EQUIPPED", "FREE", "LOCKED", "AUTO_OFF"] as Exclude<EquipUseFilter, "ALL">[]).map((value) =>
    chip(EQUIP_USE_FILTER_LABEL[value], filter.use === value, () =>
      onChange({ ...filter, use: filter.use === value ? "ALL" : value }),
    ),
  );

  const bar = el("div", { className: "mfilter__bar" }, [
    el(
      "button",
      {
        type: "button",
        className: `mfilter__toggle${props.open ? " mfilter__toggle--open" : ""}${activeCount > 0 ? " mfilter__toggle--on" : ""}`,
        onclick: props.onToggleOpen,
      },
      [
        el("span", {}, ["🔍 絞り込み"]),
        activeCount > 0 ? el("span", { className: "mfilter__badge" }, [String(activeCount)]) : null,
        el("span", { className: "mfilter__caret" }, [props.open ? "▲" : "▼"]),
      ].filter((n): n is HTMLElement => n !== null),
    ),
    el("span", { className: "mfilter__count" }, [
      props.shownCount === props.all.length ? `${props.all.length}個` : `${props.all.length}個中 ${props.shownCount}個`,
    ]),
    activeCount > 0
      ? el(
          "button",
          { type: "button", className: "mfilter__clear", onclick: () => onChange({ ...EMPTY_EQUIPMENT_FILTER }) },
          ["✕ 解除"],
        )
      : null,
  ].filter((n): n is HTMLElement => n !== null));

  const body: HTMLElement | null = props.open
    ? el(
        "div",
        { className: "mfilter__body" },
        [
          group("レア度", rarityChips),
          group("星", starChips),
          group("シリーズ", setChips),
          group("メイン効果", mainChips),
          group("状態", useChips),
        ].filter((n): n is HTMLElement => n !== null),
      )
    : null;

  return el("div", { className: "mfilter" }, [bar, body].filter((n): n is HTMLElement => n !== null));
}
