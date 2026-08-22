/**
 * 所持モンスターの絞り込み札。
 *
 * 一覧の上に条件を全部並べると、**モンスターが1体も見えないまま画面が終わる**。
 * 縦画面(390x844)では特にそうなるので、既定では1行に畳んでおき、
 * 押した時だけ条件の札を開く。畳んでいる間も、何個絞っているか・
 * いま何体見えているかは常に見えるようにしてある。
 */
import { ELEMENT_COLOR, ELEMENT_JA } from "../../core/element.js";
import { MonsterInstance } from "../../core/monsterInstance.js";
import { Star } from "../../core/rarity.js";
import { el } from "../dom.js";
import {
  EMPTY_MONSTER_FILTER,
  GEAR_FILTER_LABEL,
  GearFilter,
  MonsterFilter,
  PARTY_FILTER_LABEL,
  PartyFilter,
  activeFilterCount,
  availableFacets,
  toggleInList,
} from "../monsterFilter.js";

export interface MonsterFilterBarProps {
  /** 絞り込む前の全部。札の候補と「◯体中」の分母に使う */
  all: readonly MonsterInstance[];
  /** 絞り込んだ後に見えている数 */
  shownCount: number;
  filter: MonsterFilter;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (filter: MonsterFilter) => void;
}

function chip(label: string, active: boolean, onClick: () => void, style?: string): HTMLElement {
  return el(
    "button",
    {
      type: "button",
      className: `slot-filter-chip mfilter__chip${active ? " slot-filter-chip--active" : ""}`,
      style,
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

export function renderMonsterFilterBar(props: MonsterFilterBarProps): HTMLElement {
  const { filter, onChange } = props;
  const facets = availableFacets(props.all);
  const activeCount = activeFilterCount(filter);

  const elementChips = facets.elements.map((element) =>
    chip(
      ELEMENT_JA[element],
      filter.elements.includes(element),
      () => onChange({ ...filter, elements: toggleInList(filter.elements, element) }),
      // 選ばれている札は属性の色で塗る。文字だけだと6つ並んだ時に見分けが遅い
      filter.elements.includes(element) ? `background:${ELEMENT_COLOR[element]};border-color:${ELEMENT_COLOR[element]};color:#10131f` : undefined,
    ),
  );

  const starChips = facets.stars.map((star: Star) =>
    chip(`★${star}`, filter.stars.includes(star), () => onChange({ ...filter, stars: toggleInList(filter.stars, star) })),
  );

  const roleChips = facets.roles.map((role) =>
    chip(role, filter.roles.includes(role), () => onChange({ ...filter, roles: toggleInList(filter.roles, role) })),
  );

  // 編成と装備は「どちらか1つ」なので、同じ札をもう一度押すと解除にする
  const stateChips = [
    ...(["IN", "OUT"] as Exclude<PartyFilter, "ALL">[]).map((value) =>
      chip(PARTY_FILTER_LABEL[value], filter.party === value, () =>
        onChange({ ...filter, party: filter.party === value ? "ALL" : value }),
      ),
    ),
    ...(["FULL", "PARTIAL", "NONE"] as Exclude<GearFilter, "ALL">[]).map((value) =>
      chip(GEAR_FILTER_LABEL[value], filter.gear === value, () =>
        onChange({ ...filter, gear: filter.gear === value ? "ALL" : value }),
      ),
    ),
  ];

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
      props.shownCount === props.all.length ? `${props.all.length}体` : `${props.all.length}体中 ${props.shownCount}体`,
    ]),
    activeCount > 0
      ? el(
          "button",
          { type: "button", className: "mfilter__clear", onclick: () => onChange({ ...EMPTY_MONSTER_FILTER }) },
          ["✕ 解除"],
        )
      : null,
  ].filter((n): n is HTMLElement => n !== null));

  const body: HTMLElement | null = props.open
    ? el(
        "div",
        { className: "mfilter__body" },
        [group("属性", elementChips), group("星", starChips), group("役割", roleChips), group("状態", stateChips)].filter(
          (n): n is HTMLElement => n !== null,
        ),
      )
    : null;

  return el("div", { className: "mfilter" }, [bar, body].filter((n): n is HTMLElement => n !== null));
}
