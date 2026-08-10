import { MonsterInstance } from "../../core/monsterInstance.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkSkillTraining } from "../../game/skillTraining.js";
import { el } from "../dom.js";
import { monsterCard } from "./monsters.js";

export interface SkillTrainingProps {
  player: PlayerState;
  targetId: string;
  selectedMaterialIds: string[];
  onToggleMaterial: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function renderSkillTraining(props: SkillTrainingProps): HTMLElement {
  const target = props.player.monsters.find((m) => m.id === props.targetId);
  if (!target) {
    return el("div", { className: "screen monsters-screen" }, [
      el("p", { className: "app-subtitle" }, ["対象のモンスターが見つかりません"]),
      el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancel }, ["◀ 戻る"]),
    ]);
  }

  const dex = findMonsterById(target.dexId);
  const candidates = props.player.monsters.filter(
    (m) => m.id !== target.id && m.dexId === target.dexId && !props.player.partyIds.includes(m.id),
  );
  const materials = props.selectedMaterialIds
    .map((id) => props.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkSkillTraining(target, materials, props.player.partyIds);

  const cards = candidates.map((c) =>
    monsterCard(c, () => props.onToggleMaterial(c.id), { selected: props.selectedMaterialIds.includes(c.id) }),
  );

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["スキル強化素材選択"])]),
    el("section", { className: "panel" }, [
      el("p", {}, [`対象: ${dex ? dex.name : target.dexId}`]),
      el("p", { className: "app-subtitle" }, [
        `現在のスキルレベル: ${target.skillLevels.map((lvl, i) => `スキル${i + 1} Lv.${lvl}`).join(" / ")}`,
      ]),
      el("p", { className: "app-subtitle" }, [
        "同じモンスター(同じ種類・同じ属性)を素材にすると、1体につきランダムでいずれか1つのスキルレベルが+1されます。",
      ]),
      el("p", {}, [`${props.selectedMaterialIds.length}体選択中`]),
    ]),
    el("section", { className: "panel" }, [
      candidates.length === 0
        ? el("p", { className: "app-subtitle" }, ["素材にできる同じモンスターがいません"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !check.ok, onclick: props.onConfirm },
      ["🔼 スキル強化実行"],
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancel }, ["キャンセル"]),
  ]);
}
