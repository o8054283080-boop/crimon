import { MonsterInstance } from "../../core/monsterInstance.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState } from "../../game/playerState.js";
import { checkMonsterPowerUp, feedExpValue, isSameElement, isSameSpecies } from "../../game/monsterPowerUp.js";
import { el } from "../dom.js";
import { monsterCard } from "./monsters.js";
import { renderPartySlots } from "./partyCard.js";

export interface MonsterTrainingProps {
  player: PlayerState;
  targetId: string;
  selectedMaterialIds: string[];
  onToggleMaterial: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
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
  const candidates = props.player.monsters.filter((m) => m.id !== target.id && !props.player.partyIds.includes(m.id));
  const materials = props.selectedMaterialIds
    .map((id) => props.player.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
  const check = checkMonsterPowerUp(target, materials, props.player.partyIds);

  const totalExp = materials.reduce((sum, m) => sum + feedExpValue(target, m), 0);
  const bonusCount = materials.filter((m) => isSameSpecies(target, m)).length;
  const sameElementCount = materials.filter((m) => isSameElement(target, m)).length;

  const cards = candidates.map((c) =>
    monsterCard(c, () => props.onToggleMaterial(c.id), {
      selected: props.selectedMaterialIds.includes(c.id),
      bonus: isSameSpecies(target, c),
    }),
  );

  return el("div", { className: "screen monsters-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["モンスター強化素材選択"])]),
    el("section", { className: "panel" }, [
      el("p", {}, [`対象: ${dex ? dex.name : target.dexId}`]),
      el("p", { className: "app-subtitle" }, [`現在 Lv${target.level} / 経験値${target.exp}`]),
      el("p", { className: "app-subtitle" }, [
        `現在のスキルレベル: ${target.skillLevels.map((lvl, i) => `スキル${i + 1} Lv.${lvl}`).join(" / ")}`,
      ]),
      el("p", { className: "app-subtitle" }, [
        "どのモンスターでも素材にすると経験値になり、対象のレベルが上がります。★マーク付きは対象と同じ種族(属性違いも可)で、1体につきランダムでいずれか1つのスキルレベルも+1されます。対象と同じ属性(色)の素材は経験値が1.5倍になります。",
      ]),
      el("p", {}, [
        `${props.selectedMaterialIds.length}体選択中(うち同種${bonusCount}体・同属性${sameElementCount}体) / 獲得予定経験値 ${totalExp}`,
      ]),
      /*
       * **選んだ顔ぶれをここに並べる。**
       * 数だけ出しても「誰を選んだか」は分からず、確かめるには数十枚の一覧を
       * 上から探し直すしかなかった。押せば外せるので、間違えた時も一覧へ戻らずに済む。
       */
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
      candidates.length === 0
        ? el("p", { className: "app-subtitle" }, ["素材にできるモンスターがいません"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !check.ok, onclick: props.onConfirm },
      ["💪 モンスター強化実行"],
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onCancel }, ["キャンセル"]),
  ]);
}
