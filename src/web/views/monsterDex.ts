import { ELEMENT_COLOR, ELEMENT_JA } from "../../core/element.js";
import { MonsterDefinition } from "../../core/monster.js";
import { describeSkillLines } from "../../core/skill.js";
import { formatExtraStatLines } from "../../core/stats.js";
import { LATENT_ABILITY_CANDIDATES } from "../../data/latentAbilities.js";
import { GACHA_ONLY_TEMPLATE_IDS, MATERIAL_TEMPLATE_IDS, MONSTER_DEX_ENTRIES } from "../../data/monsters.js";
import {
  DEX_SOURCE_LABEL,
  DexFilter,
  DexSourceSets,
  EMPTY_DEX_FILTER,
  dexFacets,
  dexFilterCount,
  filterDexEntries,
  toggleDexValue,
} from "../../game/monsterDexFilter.js";
import { DEX_SORT_KEYS, DEX_SORT_LABEL, DexSortKey, sortDexEntries } from "../../game/monsterDexSort.js";
import { el } from "../dom.js";
import { withPortrait } from "../three/portrait.js";
import "../ui/monsterDex.css";
import { buildMonsterCard } from "./monsterCard.js";
import { renderSkillGrowthRows } from "./skillPanel.js";

const LATENT_CATEGORY_LABEL = { OFFENSE: "攻勢", DISRUPT: "妨害", DURABILITY: "耐久", SUPPORT: "支援", SPECIAL: "特殊" } as const;

export interface MonsterDexProps {
  selectedDexId: string | null;
  sortKey: DexSortKey;
  filter: DexFilter;
  filterOpen: boolean;
  onChangeSort: (key: DexSortKey) => void;
  onChangeFilter: (filter: DexFilter) => void;
  onToggleFilterOpen: () => void;
  onSelectEntry: (dexId: string | null) => void;
  onBack: () => void;
}

/** 入手先の判定に使う集合。データ側の定数をここで1度だけ束ねる */
const DEX_SOURCE_SETS: DexSourceSets = { gachaOnly: GACHA_ONLY_TEMPLATE_IDS, material: MATERIAL_TEMPLATE_IDS };

/** 図鑑は育成状態を参照せず、静的な候補を読むだけにする。欠損時も必ず空配列を返す。 */
export function latentAbilitiesForDex(dexId: string) {
  return LATENT_ABILITY_CANDIDATES[dexId] ?? [];
}

export function resolveDexSelection(selectedDexId: string | null): MonsterDefinition | null {
  if (!selectedDexId) return null;
  return MONSTER_DEX_ENTRIES.find((entry) => entry.id === selectedDexId) ?? null;
}

function dexCard(dex: MonsterDefinition, index: number, onClick: () => void): HTMLElement {
  return buildMonsterCard(dex, dex.id, onClick, { caption: `No.${String(index + 1).padStart(3, "0")} · ${dex.role}`, compact: true });
}

/**
 * 並べ替えの帯。所持モンスターの一覧と同じ札の形にしてある
 * (`renderMonsterSortRow`)。同じ操作は同じ見た目で置く。
 */
function renderDexSortRow(props: MonsterDexProps): HTMLElement {
  return el("div", { className: "slot-filter-row sort-row monster-dex__sort" }, [
    el("span", { className: "sort-row__label" }, ["並べ替え"]),
    ...DEX_SORT_KEYS.map((key) =>
      el("button", {
        type: "button",
        className: `slot-filter-chip${props.sortKey === key ? " slot-filter-chip--active" : ""}`,
        onclick: () => props.onChangeSort(key),
      }, [DEX_SORT_LABEL[key]]),
    ),
  ]);
}

/**
 * 絞り込みの帯。所持モンスターの絞り込み(`renderMonsterFilterBar`)と
 * 同じ形にしてある。**既定では1行に畳んでおく。**
 * 条件を全部並べると、モンスターが1体も見えないまま画面が終わる。
 */
function renderDexFilterBar(props: MonsterDexProps, shownCount: number): HTMLElement {
  const { filter, onChangeFilter } = props;
  const facets = dexFacets(MONSTER_DEX_ENTRIES, DEX_SOURCE_SETS);
  const activeCount = dexFilterCount(filter);

  const chip = (label: string, active: boolean, onClick: () => void, style?: string) =>
    el("button", {
      type: "button",
      className: `slot-filter-chip mfilter__chip${active ? " slot-filter-chip--active" : ""}`,
      style,
      onclick: onClick,
    }, [label]);

  const group = (label: string, chips: HTMLElement[]): HTMLElement | null =>
    chips.length === 0 ? null : el("div", { className: "mfilter__group" }, [
      el("span", { className: "mfilter__label" }, [label]),
      el("div", { className: "mfilter__chips" }, chips),
    ]);

  const elementChips = facets.elements.map((element) =>
    chip(
      ELEMENT_JA[element],
      filter.elements.includes(element),
      () => onChangeFilter({ ...filter, elements: toggleDexValue(filter.elements, element) }),
      // 選ばれている札は属性の色で塗る。文字だけだと6つ並んだ時に見分けが遅い
      filter.elements.includes(element)
        ? `background:${ELEMENT_COLOR[element]};border-color:${ELEMENT_COLOR[element]};color:#10131f`
        : undefined,
    ),
  );
  const roleChips = facets.roles.map((role) =>
    chip(role, filter.roles.includes(role), () => onChangeFilter({ ...filter, roles: toggleDexValue(filter.roles, role) })),
  );
  const sourceChips = facets.sources.map((source) =>
    chip(DEX_SOURCE_LABEL[source], filter.sources.includes(source), () =>
      onChangeFilter({ ...filter, sources: toggleDexValue(filter.sources, source) })),
  );

  const bar = el("div", { className: "mfilter__bar" }, [
    el("button", {
      type: "button",
      className: `mfilter__toggle${props.filterOpen ? " mfilter__toggle--open" : ""}${activeCount > 0 ? " mfilter__toggle--on" : ""}`,
      onclick: props.onToggleFilterOpen,
    }, [
      el("span", {}, ["🔍 絞り込み"]),
      activeCount > 0 ? el("span", { className: "mfilter__badge" }, [String(activeCount)]) : null,
      el("span", { className: "mfilter__caret" }, [props.filterOpen ? "▲" : "▼"]),
    ].filter((n): n is HTMLElement => n !== null)),
    el("span", { className: "mfilter__count" }, [
      shownCount === MONSTER_DEX_ENTRIES.length ? `${MONSTER_DEX_ENTRIES.length}体` : `${MONSTER_DEX_ENTRIES.length}体中 ${shownCount}体`,
    ]),
    activeCount > 0
      ? el("button", { type: "button", className: "mfilter__clear", onclick: () => onChangeFilter({ ...EMPTY_DEX_FILTER }) }, ["✕ 解除"])
      : null,
  ].filter((n): n is HTMLElement => n !== null));

  const groups: (HTMLElement | null)[] = [group("属性", elementChips), group("役割", roleChips), group("入手", sourceChips)];
  const body: HTMLElement | null = props.filterOpen
    ? el("div", { className: "mfilter__body" }, groups.filter((n): n is HTMLElement => n !== null))
    : null;

  const parts: (HTMLElement | null)[] = [bar, body];
  return el("div", { className: "mfilter monster-dex__filter" }, parts.filter((n): n is HTMLElement => n !== null));
}

function renderList(props: MonsterDexProps): HTMLElement {
  /*
   * **番号は絞っても並べ替えても動かさない。**
   * 「No.007」はその種を指す名前なので、表示の順番で振り直すと、
   * 図鑑を見ながら話が通じなくなる。番号は必ず元の並びから引く。
   */
  const numbers = new Map(MONSTER_DEX_ENTRIES.map((dex, index) => [dex.id, index]));
  const shown = filterDexEntries(MONSTER_DEX_ENTRIES, props.filter, DEX_SOURCE_SETS);
  const entries = sortDexEntries(shown, props.sortKey);
  const cards = entries.map((dex) => dexCard(dex, numbers.get(dex.id) ?? 0, () => props.onSelectEntry(dex.id)));
  return el("div", { className: "screen monster-dex monster-dex--list" }, [
    el("header", { className: "app-header monster-dex__header" }, [
      el("div", {}, [el("h1", {}, ["モンスター図鑑"]), el("p", { className: "app-subtitle" }, ["タップで能力を確認"])]),
      el("button", { type: "button", className: "btn btn--ghost monster-dex__back", onclick: props.onBack }, ["閉じる"]),
    ]),
    renderDexFilterBar(props, cards.length),
    renderDexSortRow(props),
    el("section", { className: "panel monster-dex__catalog" }, [
      cards.length === 0
        ? el("p", { className: "app-subtitle monster-dex__empty-list" }, ["条件に合うモンスターがいません。絞り込みを解除してください。"])
        : el("div", { className: "monster-grid monster-dex__grid" }, cards),
    ]),
  ]);
}

function statTile(label: string, value: string | number): HTMLElement {
  return el("div", { className: "monster-dex-detail__stat" }, [el("span", {}, [label]), el("strong", {}, [String(value)])]);
}

function renderSkills(dex: MonsterDefinition): HTMLElement {
  return el("section", { className: "monster-dex-detail__panel monster-dex-detail__skills" }, [
    el("h2", {}, ["スキル"]),
    ...dex.skills.map((skill, index) => el("article", { className: "monster-dex-detail__skill" }, [
      el("div", { className: "monster-dex-detail__skill-head" }, [
        el("strong", {}, [`S${index + 1} ${skill.name}`]),
        el("span", {}, [skill.cooldownTurns ? `CT${skill.cooldownTurns}` : "通常"]),
      ]),
      el("p", {}, [skill.description || "説明未登録"]),
      el("small", {}, [describeSkillLines(skill).join(" / ") || "効果データなし"]),
    ])),
  ]);
}

function renderLatents(dex: MonsterDefinition): HTMLElement {
  const candidates = latentAbilitiesForDex(dex.id);
  return el("section", { className: "monster-dex-detail__panel monster-dex-detail__latents" }, [
    el("h2", {}, ["潜在覚醒"]),
    candidates.length
      ? el("div", { className: "monster-dex-detail__latent-grid" }, candidates.map((ability) =>
          el("article", { className: "monster-dex-detail__latent" }, [
            el("div", {}, [el("strong", {}, [ability.name || "名称未登録"]), el("span", {}, [LATENT_CATEGORY_LABEL[ability.category] ?? "分類なし"])]),
            el("p", {}, [ability.description || "説明未登録"]),
          ])))
      : el("p", { className: "monster-dex-detail__empty" }, ["潜在覚醒なし"]),
    el("small", { className: "monster-dex-detail__unlock" }, ["覚醒オーブで候補から1つ選択"]),
  ]);
}

function renderDetail(props: MonsterDexProps, dex: MonsterDefinition): HTMLElement {
  const index = MONSTER_DEX_ENTRIES.indexOf(dex);
  const extraStats = formatExtraStatLines(dex.stats);
  return el("div", { className: "screen monster-dex monster-dex-detail" }, [
    el("header", { className: "monster-dex-detail__top" }, [
      el("button", { type: "button", className: "btn btn--ghost monster-dex-detail__back", onclick: () => props.onSelectEntry(null) }, ["‹ 一覧"]),
      withPortrait(el("div", { className: "monster-dex-detail__portrait", style: `background:${dex.color}` }, [dex.emoji]), dex),
      el("div", { className: "monster-dex-detail__identity" }, [
        el("span", { className: "monster-dex-detail__number" }, [`No.${String(index + 1).padStart(3, "0")}`]),
        el("h1", {}, [dex.name || "名称未登録"]),
        el("div", { className: "monster-dex-detail__badges" }, [
          el("span", {}, [ELEMENT_JA[dex.element] ?? "属性不明"]), el("span", {}, [dex.role || "タイプ不明"]),
        ]),
      ]),
    ]),
    /*
     * 説明。**スキルより先に置く。**
     *
     * 素材専用のピッグは、スキルとステータスを見ても用途が分からない。
     * 「ぷいぷい(攻撃力0.3倍)」を読んでも、それが戦うための数字ではないことは
     * どこにも書いていなかった。何のために居るのかを最初に言う。
     */
    dex.dexNote ? el("section", { className: "monster-dex-detail__panel monster-dex-detail__note-panel" }, [
      el("h2", {}, ["このモンスターについて"]),
      el("p", {}, [dex.dexNote]),
    ]) : null,
    el("section", { className: "monster-dex-detail__stats", "aria-label": "基礎ステータス" }, [
      statTile("HP", dex.stats.hp), statTile("攻撃", dex.stats.atk), statTile("防御", dex.stats.def), statTile("速度", dex.stats.spd),
      ...extraStats.map((line) => { const [label, ...value] = line.split(" "); return statTile(label, value.join(" ")); }),
    ]),
    el("div", { className: "monster-dex-detail__columns" }, [renderSkills(dex), renderLatents(dex)]),
    el("details", { className: "monster-dex-detail__growth" }, [
      el("summary", {}, ["スキルLv別の変化を見る"]), ...renderSkillGrowthRows(dex.skills),
    ]),
    el("p", { className: "monster-dex-detail__note" }, ["表示値はLv1の基礎値です。入手先は召喚・各ステージの報酬をご確認ください。"]),
  ].filter((node): node is HTMLElement => node !== null));
}

export function renderMonsterDex(props: MonsterDexProps): HTMLElement {
  try {
    const dex = resolveDexSelection(props.selectedDexId);
    return dex ? renderDetail(props, dex) : renderList(props);
  } catch (error) {
    // render() は差し替え前にrootを空にするため、例外を外へ出すとゲーム全体が空になる。
    // 図鑑内の壊れた1項目はここで止め、HOMEへ戻れる最小画面を必ず返す。
    console.error("モンスター図鑑の描画に失敗しました", error);
    return el("div", { className: "screen monster-dex monster-dex__error", role: "alert" }, [
      el("h1", {}, ["図鑑を表示できませんでした"]),
      el("p", {}, ["データを読み直すか、一覧へ戻って別のモンスターを選んでください。"]),
      el("div", { className: "monster-dex__error-actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onSelectEntry(null) }, ["図鑑一覧へ"]),
        el("button", { type: "button", className: "btn btn--primary", onclick: props.onBack }, ["モンスター画面へ"]),
      ]),
    ]);
  }
}
