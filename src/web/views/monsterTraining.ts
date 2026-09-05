import { MonsterInstance } from "../../core/monsterInstance.js";
import { ELEMENTS, ELEMENT_COLOR, ELEMENT_JA, Element } from "../../core/element.js";
import { STARS, STAR_MAX_LEVEL, Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkMonsterPowerUp, isSameElement, isSameSpecies, monsterPowerUpExp } from "../../game/monsterPowerUp.js";
import { MaterialMonsterSort, sortMaterialMonsters } from "../../game/materialMonsterSort.js";
import { el } from "../dom.js";
import { createIncrementalGrid } from "../incrementalGrid.js";
import { monsterCard } from "./monsters.js";
import { renderPartySlots } from "./partyCard.js";
import { managementHeader } from "./managementHeader.js";
import { stickyActions } from "./stickyActions.js";
import { renderMonsterListDensityToggle } from "../monsterListDensity.js";

export interface MonsterTrainingProps {
  player: PlayerState;
  targetId: string;
  selectedMaterialIds: string[];
  filter: MonsterTrainingFilter;
  onChangeFilter: (filter: MonsterTrainingFilter) => void;
  onToggleMaterial: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  dense: boolean;
  onToggleDense: () => void;
}

export type MaterialUseFilter = "ALL" | "SAME_SPECIES" | "SAME_ELEMENT" | "SELECTED";
export type MonsterTrainingMaterialSort = Extract<MaterialMonsterSort, "DEFAULT" | "EXP_PIG_FIRST">;
export interface MonsterTrainingFilter {
  element: Element | "ALL";
  star: Star | "ALL";
  use: MaterialUseFilter;
  /** 既存状態との互換性のため省略時は通常順として扱う。 */
  sort?: MonsterTrainingMaterialSort;
}
export const EMPTY_MONSTER_TRAINING_FILTER: MonsterTrainingFilter = { element: "ALL", star: "ALL", use: "ALL", sort: "DEFAULT" };

/** 素材の選択自体とは独立した表示条件。複数条件はすべてANDで適用する。 */
export function filterTrainingMaterials(
  candidates: readonly MonsterInstance[],
  target: MonsterInstance,
  selectedIds: readonly string[],
  filter: MonsterTrainingFilter,
): MonsterInstance[] {
  const filtered = candidates.filter((candidate) => {
    if (filter.element !== "ALL" && findMonsterById(candidate.dexId)?.element !== filter.element) return false;
    if (filter.star !== "ALL" && candidate.star !== filter.star) return false;
    if (filter.use === "SAME_SPECIES" && !isSameSpecies(target, candidate)) return false;
    if (filter.use === "SAME_ELEMENT" && !isSameElement(target, candidate)) return false;
    if (filter.use === "SELECTED" && !selectedIds.includes(candidate.id)) return false;
    return true;
  });
  return sortMaterialMonsters(filtered, filter.sort ?? "DEFAULT");
}

function filterChip(label: string, active: boolean, onclick: () => void, style?: string): HTMLElement {
  return el("button", { type: "button", className: `slot-filter-chip mfilter__chip${active ? " slot-filter-chip--active" : ""}`, onclick, style }, [label]);
}

export function renderMonsterTraining(props: MonsterTrainingProps): HTMLElement {
  const target = props.player.monsters.find((m) => m.id === props.targetId);
  if (!target) {
    return el("div", { className: "screen monsters-screen" }, [
      el("p", { className: "app-subtitle" }, ["対象のモンスターが見つかりません"]),
      el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancel }, ["◀ 戻る"]),
    ]);
  }

  const dex = findMonsterById(target.dexId);
  const candidates = props.player.monsters.filter(
    (m) => m.id !== target.id && !props.player.partyIds.includes(m.id) && m.locked !== true,
  );
  const materials = props.selectedMaterialIds
    .map((id) => props.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkMonsterPowerUp(target, materials, props.player.partyIds);

  const isLevelMax = target.level >= STAR_MAX_LEVEL[target.star];
  const totalExp = monsterPowerUpExp(target, materials);
  const bonusCount = materials.filter((m) => isSameSpecies(target, m)).length;
  const sameElementCount = materials.filter((m) => isSameElement(target, m)).length;

  const shownCandidates = filterTrainingMaterials(candidates, target, props.selectedMaterialIds, props.filter);
  const materialGrid = createIncrementalGrid({
    className: `monster-grid${props.dense ? " monster-grid--dense" : ""}`,
    items: shownCandidates,
    renderItem: (candidate) => monsterCard(candidate, () => props.onToggleMaterial(candidate.id), {
      selected: props.selectedMaterialIds.includes(candidate.id),
      bonus: isSameSpecies(target, candidate),
      dense: props.dense,
    }),
    moreLabel: (shown, total) => `素材をさらに表示（${shown} / ${total}）`,
  });

  return el("div", { className: "screen monsters-screen" }, [
    managementHeader("モンスター強化", props.onCancel, dex ? dex.name : target.dexId),
    el("section", { className: "panel" }, [
      el("p", {}, [`対象: ${dex ? dex.name : target.dexId}`]),
      el("p", { className: "app-subtitle" }, [`現在 Lv${target.level} / 経験値${target.exp}`]),
      el("p", { className: "app-subtitle" }, [
        `現在のスキルレベル: ${target.skillLevels.map((lvl, i) => `スキル${i + 1} Lv.${lvl}`).join(" / ")}`,
      ]),
      el("p", { className: "app-subtitle" }, [
        "どのモンスターでも素材にすると経験値になり、対象のレベルが上がります。★マーク付きは対象と同じ種族(属性違いも可)で、1体につきランダムでいずれか1つのスキルレベルも+1されます。対象と同じ属性(色)の素材は経験値が1.5倍になります。",
      ]),
      isLevelMax
        ? el("p", { className: "app-subtitle training-warning" }, ["LvMAXのため経験値は獲得できません。同種族素材でスキル育成できます。"])
        : null,
      el("p", {}, [
        `${props.selectedMaterialIds.length}体選択中(うち同種${bonusCount}体・同属性${sameElementCount}体) / 獲得予定経験値 ${totalExp}${isLevelMax ? "（LvMAX）" : ""}`,
      ]),
      materials.length > 0
        ? el("div", { className: "picked-row" }, [
            el("span", { className: "picked-row__label" }, ["選んだ素材(押すと外せます)"]),
            renderPartySlots(materials, materials.length, props.onToggleMaterial),
          ])
        : el("p", { className: "app-subtitle" }, ["下の一覧から素材を選んでください。選んだものはここに並びます。"]),
      materials.length > 0 && !check.ok && check.reason
        ? el("p", { className: "app-subtitle training-warning" }, [`⚠ ${check.reason}`])
        : null,
    ].filter((n): n is HTMLParagraphElement => n !== null)),
    el("section", { className: "panel" }, [
      el("div", { className: "monster-density-row" }, [renderMonsterListDensityToggle(props.dense, props.onToggleDense)]),
      el("div", { className: "mfilter mfilter__body training-filter" }, [
        el("div", { className: "mfilter__group" }, [
          el("span", { className: "mfilter__label" }, ["属性"]),
          el("div", { className: "mfilter__chips" }, [
            filterChip("すべて", props.filter.element === "ALL", () => props.onChangeFilter({ ...props.filter, element: "ALL" })),
            ...ELEMENTS.map((element) => filterChip(ELEMENT_JA[element], props.filter.element === element, () => props.onChangeFilter({ ...props.filter, element }), props.filter.element === element ? `background:${ELEMENT_COLOR[element]};border-color:${ELEMENT_COLOR[element]};color:#10131f` : undefined)),
          ]),
        ]),
        el("div", { className: "mfilter__group" }, [
          el("span", { className: "mfilter__label" }, ["★"]),
          el("div", { className: "mfilter__chips" }, [
            filterChip("すべて", props.filter.star === "ALL", () => props.onChangeFilter({ ...props.filter, star: "ALL" })),
            ...STARS.map((star) => filterChip(`★${star}`, props.filter.star === star, () => props.onChangeFilter({ ...props.filter, star }))),
          ]),
        ]),
        el("div", { className: "mfilter__group" }, [
          el("span", { className: "mfilter__label" }, ["素材用途"]),
          el("div", { className: "mfilter__chips" }, [
            ...([["ALL", "すべて"], ["SAME_SPECIES", "同じ種族"], ["SAME_ELEMENT", "同じ属性"], ["SELECTED", "選択中"]] as const).map(([use, label]) => {
              return filterChip(label, props.filter.use === use, () => props.onChangeFilter({ ...props.filter, use }));
            }),
          ]),
        ]),
        el("div", { className: "mfilter__group" }, [
          el("span", { className: "mfilter__label" }, ["並び順"]),
          el("div", { className: "mfilter__chips" }, [
            filterChip("通常", (props.filter.sort ?? "DEFAULT") === "DEFAULT", () => props.onChangeFilter({ ...props.filter, sort: "DEFAULT" })),
            filterChip("経験豚優先", props.filter.sort === "EXP_PIG_FIRST", () => props.onChangeFilter({ ...props.filter, sort: "EXP_PIG_FIRST" })),
          ]),
        ]),
        el("span", { className: "mfilter__count" }, [shownCandidates.length === candidates.length ? `${candidates.length}体` : `${candidates.length}体中 ${shownCandidates.length}体`]),
      ]),
      candidates.length === 0
        ? el("p", { className: "app-subtitle" }, ["素材にできるモンスターがいません"])
        : shownCandidates.length === 0
          ? el("p", { className: "app-subtitle" }, ["条件に一致するモンスターがいません"])
          : materialGrid.element,
      el("div", { className: "sticky-actions__spacer" }, []),
    ]),
    stickyActions({
      status: check.ok
        ? `${props.selectedMaterialIds.length}体で 経験値 ${totalExp}`
        : check.reason ?? "下の一覧から素材を選んでください",
      primary: el(
        "button",
        { type: "button", className: "btn btn--primary btn--large", disabled: !check.ok, onclick: props.onConfirm },
        ["💪 モンスター強化実行"],
      ),
    }),
  ]);
}
