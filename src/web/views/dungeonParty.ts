import { MAX_DUNGEON_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { partyMemberCard, renderPartySlots } from "./partyCard.js";

export interface DungeonPartyProps {
  player: PlayerState;
  onToggleMember: (instanceId: string) => void;
  onBack: () => void;
}

export function renderDungeonParty(props: DungeonPartyProps): HTMLElement {
  const { player, onToggleMember, onBack } = props;
  const activeMembers = player.dungeonPartyIds
    .map((id) => player.monsters.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => m !== undefined);
  const cards = player.monsters.map((instance) =>
    partyMemberCard(instance, player.dungeonPartyIds.includes(instance.id), () => onToggleMember(instance.id)),
  );

  return el("div", { className: "screen party-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["ダンジョン専用パーティ編成"]),
      el("p", { className: "app-subtitle" }, [
        `${player.dungeonPartyIds.length} / ${MAX_DUNGEON_PARTY_SIZE} 体編成中(タップで編成/解除)。通常ステージのパーティとは別枠です。`,
      ]),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["現在編成中のメンバー"]),
      renderPartySlots(activeMembers, MAX_DUNGEON_PARTY_SIZE),
    ]),
    el("section", { className: "panel" }, [
      player.monsters.length === 0
        ? el("p", { className: "app-subtitle" }, ["モンスターを所持していません。召喚してみましょう。"])
        : el("div", { className: "monster-grid" }, cards),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onBack }, ["◀ 装備ダンジョンに戻る"]),
  ]);
}
