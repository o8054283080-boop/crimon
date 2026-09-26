import { ELEMENT_COLOR, ELEMENT_JA } from "../../core/element.js";
import type { MonsterDefinition } from "../../core/monster.js";
import { describeSkillLines } from "../../core/skill.js";
import { MONSTER_DEX_ENTRIES } from "../../data/monsters.js";
import {
  SKILL_DEX_SLOTS, SKILL_DEX_SLOT_LABEL, SKILL_DEX_TARGETS, SKILL_DEX_TARGET_LABEL, SKILL_EFFECT_TAG_GROUPS,
  SKILL_EFFECT_TAG_INFO, buildSkillDexIndex, filterSkillDex, resetSkillDexFilter, skillDexFacets, skillDexFilterCount,
  toggleSkillDexValue, type SkillDexEntry, type SkillDexFilter, type SkillDexResult, type SkillDexSlot,
} from "../../game/skillDex.js";
import { el } from "../dom.js";
import { withPortrait } from "../three/portrait.js";
import "../ui/skillDex.css";
import { screenHeadAction, screenHeader } from "./managementHeader.js";
import { describeSkillTarget, skillDescriptionText } from "./skillPanel.js";

/**
 * スキル図鑑。**欲しい効果のスキルを探して、誰が持っているかを見る。**
 *
 * いちばんの用途はクリエイトの素材探し(スキル2・3)。探し方は3つ:
 *   1. 上の「スキル1/2/3」で枠を決める(クリエイトは枠をまたげない)
 *   2. 検索欄に「防御DOWN」「回復」「ドラゴン」などを打つ
 *   3. 「絞り込み」から効果・属性・対象を選ぶ
 *
 * 数字と効果の文は**図鑑・戦闘と同じ定義から毎回作る**(`src/game/skillDex.ts`)。
 */
export interface SkillDexProps {
  filter: SkillDexFilter;
  filterOpen: boolean;
  onChangeFilter: (filter: SkillDexFilter) => void;
  onToggleFilterOpen: () => void;
  /** 持ち主を押した時(モンスター図鑑の詳細へ) */
  onOpenMonster: (dexId: string) => void;
  onGoMonsterDex: () => void;
  onBack: () => void;
  backLabel?: string;
}

/**
 * 索引は1度だけ作る。**定義はこのモジュールの読み込み時点で確定している**ので、
 * スキル調整(定義ファイルの書き換え)は次の読み込みでそのまま索引に入る。
 */
let cachedIndex: SkillDexEntry[] | null = null;
export function skillDexIndex(): SkillDexEntry[] {
  cachedIndex ??= buildSkillDexIndex(MONSTER_DEX_ENTRIES);
  return cachedIndex;
}

function slotTabs(props: SkillDexProps): HTMLElement {
  return el("div", { className: "skill-dex__slots", role: "group", "aria-label": "スキルの枠の切り替え" }, SKILL_DEX_SLOTS.map((slot) =>
    el("button", {
      type: "button",
      className: `skill-dex__slot${props.filter.slot === slot ? " skill-dex__slot--active" : ""}`,
      "aria-pressed": String(props.filter.slot === slot),
      "data-tour": `skill-dex-slot:${slot + 1}`,
      onclick: () => { if (props.filter.slot !== slot) props.onChangeFilter({ ...props.filter, slot }); },
    }, [SKILL_DEX_SLOT_LABEL[slot]])));
}

/**
 * 検索欄。**文字を打つたびに描き直すと、入力中の欄ごと作り直されて打てなくなる。**
 * 打った内容は確定(変換の確定・Enter・欄を離れる)の時と、
 * 一呼吸おいた時だけ送る。欄そのものは描き直しでも位置と中身を保つ。
 */
let pendingQueryTimer: ReturnType<typeof setTimeout> | null = null;
function searchBox(props: SkillDexProps): HTMLElement {
  const input = el("input", {
    type: "search",
    className: "skill-dex__search-input",
    value: props.filter.query,
    placeholder: "例: 防御DOWN / 回復 / ドラゴン",
    ariaLabel: "スキルを検索",
    enterKeyHint: "search",
    autocomplete: "off",
  }) as HTMLInputElement;
  let composing = false;
  const send = () => {
    if (pendingQueryTimer) { clearTimeout(pendingQueryTimer); pendingQueryTimer = null; }
    if (input.value !== props.filter.query) {
      focusSearchAfterRender = document.activeElement === input;
      props.onChangeFilter({ ...props.filter, query: input.value });
    }
  };
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => { composing = false; send(); });
  input.addEventListener("input", () => {
    if (composing) return;
    if (pendingQueryTimer) clearTimeout(pendingQueryTimer);
    pendingQueryTimer = setTimeout(send, 250);
  });
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") { send(); input.blur(); } });
  input.addEventListener("change", send);
  if (focusSearchAfterRender) {
    focusSearchAfterRender = false;
    queueMicrotask(() => {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }
  return el("label", { className: "skill-dex__search" }, [
    el("span", { className: "skill-dex__search-icon", ariaHidden: "true" }, ["🔍"]),
    input,
  ]);
}
let focusSearchAfterRender = false;

function chip(label: string, active: boolean, onClick: () => void, style?: string): HTMLElement {
  return el("button", {
    type: "button",
    className: `slot-filter-chip mfilter__chip${active ? " slot-filter-chip--active" : ""}`,
    style,
    "aria-pressed": String(active),
    onclick: onClick,
  }, [label]);
}

function group(label: string, chips: HTMLElement[]): HTMLElement | null {
  return chips.length === 0 ? null : el("div", { className: "mfilter__group skill-dex__group" }, [
    el("span", { className: "mfilter__label" }, [label]),
    el("div", { className: "mfilter__chips" }, chips),
  ]);
}

/** 絞り込み。**既定は1行に畳む**(モンスター図鑑・所持一覧と同じ形) */
function filterBar(props: SkillDexProps, shown: SkillDexResult[]): HTMLElement {
  const { filter, onChangeFilter } = props;
  const facets = skillDexFacets(skillDexIndex(), filter.slot);
  const activeCount = skillDexFilterCount(filter);
  const anything = activeCount > 0 || filter.query.trim() !== "";
  const monsters = new Set(shown.flatMap((result) => result.holders.map((dex) => dex.id))).size;

  const bar = el("div", { className: "mfilter__bar" }, [
    el("button", {
      type: "button",
      className: `mfilter__toggle${props.filterOpen ? " mfilter__toggle--open" : ""}${activeCount > 0 ? " mfilter__toggle--on" : ""}`,
      "data-tour": "skill-dex-filter",
      onclick: props.onToggleFilterOpen,
    }, [
      el("span", {}, ["絞り込み"]),
      activeCount > 0 ? el("span", { className: "mfilter__badge" }, [String(activeCount)]) : null,
      el("span", { className: "mfilter__caret" }, [props.filterOpen ? "▲" : "▼"]),
    ].filter((n): n is HTMLElement => n !== null)),
    el("span", { className: "mfilter__count skill-dex__count", "aria-live": "polite" }, [
      el("strong", {}, [`${shown.length}件`]), ` / ${monsters}体`,
    ]),
  ]);

  const effectGroups = SKILL_EFFECT_TAG_GROUPS.map(({ label, tags }) => group(label, tags
    .filter((tag) => facets.effects.has(tag) || filter.effects.includes(tag))
    .map((tag) => chip(SKILL_EFFECT_TAG_INFO[tag].label, filter.effects.includes(tag), () =>
      onChangeFilter({ ...filter, effects: toggleSkillDexValue(filter.effects, tag) })))));
  const elementChips = facets.elements.map((element) => chip(
    ELEMENT_JA[element],
    filter.elements.includes(element),
    () => onChangeFilter({ ...filter, elements: toggleSkillDexValue(filter.elements, element) }),
    filter.elements.includes(element) ? `background:${ELEMENT_COLOR[element]};border-color:${ELEMENT_COLOR[element]};color:#10131f` : undefined,
  ));
  const targetChips = SKILL_DEX_TARGETS.map((target) => chip(SKILL_DEX_TARGET_LABEL[target], filter.targets.includes(target), () =>
    onChangeFilter({ ...filter, targets: toggleSkillDexValue(filter.targets, target) })));
  const createChips = filter.slot === 0 ? [] : [chip("クリエイトで継承できる", filter.creatableOnly, () =>
    onChangeFilter({ ...filter, creatableOnly: !filter.creatableOnly }))];

  const body = props.filterOpen
    ? el("div", { className: "mfilter__body skill-dex__filter-body" }, [
      group("継承", createChips),
      group("属性", elementChips),
      group("対象", targetChips),
      ...effectGroups,
      el("p", { className: "skill-dex__filter-note" }, ["効果は「すべて持つ」、属性・対象は「どれか」で絞ります。Lv2〜5で付く効果も含みます。"]),
    ].filter((n): n is HTMLElement => n !== null))
    : null;

  const parts: (HTMLElement | null)[] = [
    bar,
    anything
      ? el("button", {
        type: "button",
        className: "mfilter__clear skill-dex__reset",
        "data-tour": "skill-dex-reset",
        onclick: () => onChangeFilter(resetSkillDexFilter(filter)),
      }, ["✕ 条件をリセット"])
      : null,
    body,
  ];
  return el("div", { className: "mfilter skill-dex__filter" }, parts.filter((n): n is HTMLElement => n !== null));
}

function holderChip(dex: MonsterDefinition, onOpen: (dexId: string) => void): HTMLElement {
  return el("button", {
    type: "button",
    className: "skill-dex__holder",
    title: `${dex.name}を図鑑で見る`,
    onclick: () => onOpen(dex.id),
  }, [
    withPortrait(el("span", { className: "skill-dex__holder-face", style: `background:${dex.color}` }, [dex.emoji]), dex),
    el("span", { className: "skill-dex__holder-name" }, [dex.name.replace(/\[.*\]$/, "")]),
    el("span", { className: "skill-dex__holder-element", style: `background:${ELEMENT_COLOR[dex.element]}` }, [ELEMENT_JA[dex.element]]),
  ]);
}

/** 札の上の小さな印。クリエイトに使えるかを、パッシブと取り違えないように言い切る */
function badges(entry: SkillDexEntry): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (entry.isPassive) out.push(el("span", { className: "skill-dex__badge skill-dex__badge--passive" }, ["パッシブ"]));
  if (entry.slot === 0) return out;
  out.push(entry.creatable
    ? el("span", { className: "skill-dex__badge skill-dex__badge--create" }, ["継承できる"])
    : el("span", { className: "skill-dex__badge skill-dex__badge--nocreate" }, [entry.isPassive ? "継承できない(パッシブ)" : "継承できない"]));
  return out;
}

function resultCard(result: SkillDexResult, props: SkillDexProps): HTMLElement {
  const { entry, holders } = result;
  const { skill } = entry;
  const ct = entry.isPassive ? "常時" : skill.cooldownTurns > 0 ? `CT${skill.cooldownTurns}` : "CTなし";
  // 効果の行は**効果から作った文**(Lv1)。手書きの説明は、生成文の後ろの一言だけを添える
  const lines = [describeSkillTarget(skill), ...describeSkillLines(skill)];
  return el("article", { className: "skill-dex__card", "data-skill-id": skill.id }, [
    el("header", { className: "skill-dex__card-head" }, [
      el("span", { className: "skill-dex__card-slot" }, [`S${entry.slot + 1}`]),
      el("strong", { className: "skill-dex__card-name" }, [skill.name]),
      el("span", { className: "skill-dex__card-ct" }, [ct]),
    ]),
    el("div", { className: "skill-dex__badges" }, badges(entry)),
    ...skillDescriptionText(skill).map((text) => el("p", { className: "skill-dex__card-desc" }, [text])),
    el("ul", { className: "skill-dex__card-lines" }, lines.map((line) => el("li", {}, [line]))),
    el("div", { className: "skill-dex__holders" }, [
      el("span", { className: "skill-dex__holders-label" }, [`持っているモンスター(${holders.length}体)`]),
      el("div", { className: "skill-dex__holder-list" }, holders.map((dex) => holderChip(dex, props.onOpenMonster))),
    ]),
  ]);
}

export function renderSkillDex(props: SkillDexProps): HTMLElement {
  const shown = filterSkillDex(skillDexIndex(), props.filter);
  return el("div", { className: "screen skill-dex" }, [
    screenHeader("スキル図鑑", {
      sub: "効果からスキルを探す",
      onBack: props.onBack,
      backLabel: props.backLabel ?? "前の画面へ戻る",
      action: screenHeadAction("📖 モンスター図鑑", props.onGoMonsterDex, { dataTour: "skill-dex-to-monster-dex" }),
    }),
    slotTabs(props),
    searchBox(props),
    filterBar(props, shown),
    shown.length === 0
      ? el("section", { className: "panel skill-dex__empty" }, [
        el("p", {}, [`${SKILL_DEX_SLOT_LABEL[props.filter.slot]}に条件に合うスキルがありません。`]),
        el("p", { className: "skill-dex__empty-sub" }, ["言葉を変えるか、別の枠を見るか、条件をリセットしてください。"]),
      ])
      : el("section", { className: "skill-dex__list" }, shown.map((result) => resultCard(result, props))),
  ]);
}

/** 枠の番号(0〜2)を画面の言葉で。テストと他画面の導線から使う */
export function skillDexSlotLabel(slot: SkillDexSlot): string {
  return SKILL_DEX_SLOT_LABEL[slot];
}
