import { MAX_DUNGEON_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { partyMemberCard, renderPartySlots } from "./partyCard.js";

export type PartyEditMode = "NORMAL" | "DUNGEON";

export interface PartyProps {
  player: PlayerState;
  mode: PartyEditMode;
  onSetMode: (mode: PartyEditMode) => void;
  onToggleParty: (instanceId: string) => void;
  onToggleDungeonMember: (instanceId: string) => void;
}

const MAX_PARTY_SIZE = 4;

export function renderParty(props: PartyProps): HTMLElement {
  const { player, mode } = props;
  const isDungeon = mode === "DUNGEON";
  const activeIds = isDungeon ? player.dungeonPartyIds : player.partyIds;
  const maxSize = isDungeon ? MAX_DUNGEON_PARTY_SIZE : MAX_PARTY_SIZE;
  const onToggle = isDungeon ? props.onToggleDungeonMember : props.onToggleParty;
  const activeMembers = activeIds
    .map((id) => player.monsters.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);

  const cards = player.monsters.map((instance) => partyMemberCard(instance, activeIds.includes(instance.id), () => onToggle(instance.id)));

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["パーティ編成"]),
      el("p", { className: "app-subtitle" }, [
        isDungeon
          ? `装備ダンジョン専用: ${activeIds.length} / ${maxSize} 体編成中(タップで編成/解除)。通常ステージのパーティとは別枠です。`
          : `${activeIds.length} / ${maxSize} 体編成中(タップで編成/解除)`,
      ]),
    ]),
    el("section", { className: "panel mode-toggle" }, [
      el(
        "button",
        {
          type: "button",
          className: "mode-toggle__btn" + (!isDungeon ? " mode-toggle__btn--active" : ""),
          onclick: () => props.onSetMode("NORMAL"),
        },
        ["通常パーティ"],
      ),
      el(
        "button",
        {
          type: "button",
          className: "mode-toggle__btn" + (isDungeon ? " mode-toggle__btn--active" : ""),
          onclick: () => props.onSetMode("DUNGEON"),
        },
        ["🏰 装備ダンジョン専用"],
      ),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["現在編成中のメンバー"]),
      renderPartySlots(activeMembers, maxSize),
    ]),
    el("section", { className: "panel" }, [
      player.monsters.length === 0
        ? el("p", { className: "app-subtitle" }, ["モンスターを所持していません。召喚してみましょう。"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
  ]);
}
