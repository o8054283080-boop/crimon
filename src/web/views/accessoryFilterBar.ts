/**
 * アクセサリーの絞り込み札。
 *
 * **作りも見た目も所持装備の帯(`equipmentFilterBar.ts`)と同じ。**
 * 既定では1行(「🔍 絞り込み ▼」+「N個中M個」)に畳んでおき、押した時だけ札を開く。
 * クラス(`mfilter*` / `slot-filter-chip`)は装備・モンスターと共有している
 * ——同じ役目の部品なので、画面ごとに形が割れないようにする。
 *
 * 前は系統・レア・★・未装着の札を3段に**常に**並べていて、
 * アクセが数十個たまると札の段だけで画面が埋まり、一覧が1枚半しか見えなかった。
 *
 * 持っている値の札だけを出す。特殊効果は種類が50近くあるので、
 * **系統を選んだ時だけ、その系統の特殊効果を出す**(特殊効果は系統ごとに分かれている)。
 */
import {
  type AccessoryFamily, type AccessoryMainStat, type AccessoryRarity, type AccessorySpecialId, type AccessoryStar,
  type Accessory, ACCESSORY_FAMILY_JA, ACCESSORY_MAIN_JA, ACCESSORY_RARITY_JA, specialDef,
} from "../../core/accessory.js";
import { ELEMENT_JA } from "../../core/element.js";
import {
  type AccessoryFilter, type AccessoryLockFilter, type AccessoryWornFilter,
  EMPTY_ACCESSORY_FILTER, activeAccessoryFilterCount, availableAccessoryFacets,
} from "../../game/accessories.js";
import { el } from "../dom.js";

export interface AccessoryFilterBarProps {
  /** 絞り込む前の全部。札の候補と「◯個中」の分母に使う */
  all: readonly Accessory[];
  /** 絞り込んだ後に見えている数 */
  shownCount: number;
  filter: AccessoryFilter;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (filter: AccessoryFilter) => void;
}

/**
 * 特殊効果の札に出す短い名前。
 *
 * 説明文(「自分のHP70%以上で与ダメージ +8%」)をそのまま札にすると、
 * 1枚が画面幅の半分を取って札だけで何段にもなる。値は札に要らないので、
 * **何の効果かが分かる最短の言い方**にする。確率の数字(被弾時の15%など)は札に書かない。
 */
const SPECIAL_SHORT: Record<AccessorySpecialId, string> = {
  ELEM_FIRE: `${ELEMENT_JA.FIRE}属性特効`,
  ELEM_WATER: `${ELEMENT_JA.WATER}属性特効`,
  ELEM_ELECTRIC: `${ELEMENT_JA.ELECTRIC}属性特効`,
  ELEM_GRASS: `${ELEMENT_JA.GRASS}属性特効`,
  ELEM_LIGHT: `${ELEMENT_JA.LIGHT}属性特効`,
  ELEM_DARK: `${ELEMENT_JA.DARK}属性特効`,
  S1_DMG: "S1ダメージ",
  S2_DMG: "S2ダメージ",
  S3_DMG: "S3ダメージ",
  SELF_HP70: "自HP70%以上で与ダメ",
  SELF_HP50: "自HP50%以上で与ダメ",
  SELF_HP30: "自HP30%以下で与ダメ",
  ENEMY_HP30: "HP30%以下の敵へ",
  ENEMY_HP20: "HP20%以下の敵へ",
  DEBUFF1: "弱体1個以上の敵へ",
  DEBUFF3: "弱体3個以上の敵へ",
  MULTI2: "2ヒット目以降",
  MULTI3: "3ヒット目以降",
  FIRST: "最初の攻撃",
  KILL_GAUGE: "撃破でゲージ",
  DMG_TAKEN: "被ダメ軽減",
  CRIT_TAKEN: "被クリ軽減",
  MAX_HP: "最大HP",
  DEF_UP: "防御力",
  LOW50: "HP50%以下で軽減",
  LOW30: "HP30%以下で軽減",
  START_SHIELD: "開始時シールド",
  SHIELD50: "HP50%でシールド",
  TURN_HEAL: "毎ターン回復",
  HIT_HEAL: "被弾時回復",
  S1_TAKEN: "敵S1を軽減",
  S2_TAKEN: "敵S2を軽減",
  S3_TAKEN: "敵S3を軽減",
  HP70_TAKEN: "HP70%以上で軽減",
  DEBUFFED_TAKEN: "弱体中に軽減",
  SINGLE_TAKEN: "単体攻撃を軽減",
  AOE_TAKEN: "全体攻撃を軽減",
  HEAL_UP: "回復量",
  SHIELD_UP: "シールド量",
  LOW50_HEAL: "HP50%以下へ回復量",
  HEALED_DR: "回復先の被ダメ減",
  HEALED_SHIELD: "回復先にシールド",
  LOW50_HEALED_SHIELD: "瀕死回復でシールド",
  HEALED_GAUGE: "回復先のゲージ",
  BUFF_SHIELD: "強化先にシールド",
  BUFF_GAUGE: "強化先のゲージ",
  DEBUFF_RATE: "弱体の発動率",
  S1_RATE: "S1弱体の発動率",
  S2_RATE: "S2弱体の発動率",
  S3_RATE: "S3弱体の発動率",
  GAUGE_DOWN_UP: "ゲージ減少量",
  DEBUFFED_GAUGE_DOWN: "弱体中へゲージ減少",
  DEBUFF_SELF_GAUGE: "弱体成功でゲージ",
  STRIP_SELF_GAUGE: "解除成功でゲージ",
  STRIP_TARGET_GAUGE: "解除した敵のゲージ減",
  STUNNED_DMG: "行動不能の敵へ",
};

export function accessorySpecialShortLabel(id: AccessorySpecialId): string {
  return SPECIAL_SHORT[id];
}

const WORN_LABEL: Record<Exclude<AccessoryWornFilter, "ALL">, string> = { EQUIPPED: "装着中", FREE: "未装着" };
const LOCK_LABEL: Record<Exclude<AccessoryLockFilter, "ALL">, string> = { LOCKED: "ロック中", UNLOCKED: "ロックなし" };

/** 配列の中身を1つ出し入れする。札を押すたびに呼ぶ */
function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function chip(label: string, active: boolean, onClick: () => void, extraClass = ""): HTMLElement {
  return el("button", {
    type: "button",
    className: `slot-filter-chip mfilter__chip${active ? " slot-filter-chip--active" : ""}${extraClass}`,
    onclick: onClick,
  }, [label]);
}

function group(label: string, content: HTMLElement[]): HTMLElement | null {
  if (content.length === 0) return null;
  return el("div", { className: "mfilter__group" }, [
    el("span", { className: "mfilter__label" }, [label]),
    el("div", { className: "mfilter__chips" }, content),
  ]);
}

export function renderAccessoryFilterBar(props: AccessoryFilterBarProps): HTMLElement {
  const { filter, onChange } = props;
  const facets = availableAccessoryFacets(props.all);
  const activeCount = activeAccessoryFilterCount(filter);

  /*
   * 系統を外した時は、**その系統の特殊効果の選択も外す。**
   * 札が見えなくなったのに条件だけ残ると、理由の分からない0件になる。
   */
  const familyChips = facets.families.map((family: AccessoryFamily) =>
    chip(ACCESSORY_FAMILY_JA[family], filter.families.includes(family), () => {
      const families = toggle(filter.families, family);
      const specials = filter.specials.filter((id) => families.includes(specialDef(id).family));
      onChange({ ...filter, families, specials });
    }, ` acc-filter-chip--family acc-family--${family.toLowerCase()}`));

  // レア度は選んでいない時も色を乗せる(一覧の札と同じ色。字を読まずに分かる)
  const rarityChips = facets.rarities.map((rarity: AccessoryRarity) =>
    chip(ACCESSORY_RARITY_JA[rarity], filter.rarities.includes(rarity),
      () => onChange({ ...filter, rarities: toggle(filter.rarities, rarity) }),
      ` acc-filter-chip--rarity acc-filter-chip--${rarity.toLowerCase()}`));

  const starChips = facets.stars.map((star: AccessoryStar) =>
    chip(`★${star}`, filter.stars.includes(star), () => onChange({ ...filter, stars: toggle(filter.stars, star) })));

  const mainChips = facets.mainStats.map((stat: AccessoryMainStat) =>
    chip(ACCESSORY_MAIN_JA[stat], filter.mainStats.includes(stat),
      () => onChange({ ...filter, mainStats: toggle(filter.mainStats, stat) })));

  const specialContent: HTMLElement[] = filter.families.length === 0
    ? [el("span", { className: "acc-filter__hint" }, ["系統を選ぶと、その系統の特殊効果で絞れます"])]
    : facets.specials
      .filter((id) => filter.families.includes(specialDef(id).family))
      .map((id) => chip(SPECIAL_SHORT[id], filter.specials.includes(id),
        () => onChange({ ...filter, specials: toggle(filter.specials, id) })));

  // 装着・ロックは「どれか1つ」なので、同じ札をもう一度押すと解除にする
  const wornChips = (["EQUIPPED", "FREE"] as const).map((value) =>
    chip(WORN_LABEL[value], filter.worn === value, () => onChange({ ...filter, worn: filter.worn === value ? "ALL" : value })));
  const lockChips = (["LOCKED", "UNLOCKED"] as const).map((value) =>
    chip(LOCK_LABEL[value], filter.lock === value, () => onChange({ ...filter, lock: filter.lock === value ? "ALL" : value })));

  const bar = el("div", { className: "mfilter__bar" }, [
    el("button", {
      type: "button",
      className: `mfilter__toggle${props.open ? " mfilter__toggle--open" : ""}${activeCount > 0 ? " mfilter__toggle--on" : ""}`,
      "aria-expanded": String(props.open),
      onclick: props.onToggleOpen,
    }, [
      el("span", {}, ["🔍 絞り込み"]),
      activeCount > 0 ? el("span", { className: "mfilter__badge" }, [String(activeCount)]) : null,
      el("span", { className: "mfilter__caret" }, [props.open ? "▲" : "▼"]),
    ].filter((n): n is HTMLElement => n !== null)),
    el("span", { className: "mfilter__count" }, [
      props.shownCount === props.all.length ? `${props.all.length}個` : `${props.all.length}個中 ${props.shownCount}個`,
    ]),
    activeCount > 0
      ? el("button", { type: "button", className: "mfilter__clear", onclick: () => onChange({ ...EMPTY_ACCESSORY_FILTER }) }, ["✕ 解除"])
      : null,
  ].filter((n): n is HTMLElement => n !== null));

  const body = props.open
    ? el("div", { className: "mfilter__body acc-filter__body" }, [
      group("系統", familyChips),
      group("レア度", rarityChips),
      group("星", starChips),
      group("メイン", mainChips),
      group("特殊", specialContent),
      group("装着", wornChips),
      group("ロック", lockChips),
    ].filter((n): n is HTMLElement => n !== null))
    : null;

  return el("div", { className: "mfilter acc-filter" }, ([bar, body] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null));
}
