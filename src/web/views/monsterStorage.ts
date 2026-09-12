import type { Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import type { PlayerState } from "../../game/playerState.js";
import { storableOwnedGroups, storageCount, storageStacks } from "../../game/monsterStorage.js";
import { el } from "../dom.js";
import { managementHeader } from "./managementHeader.js";
import "../ui/monsterStorage.css";

export interface MonsterStorageProps {
  player: PlayerState;
  notice: string | null;
  onBack: () => void;
  onDeposit: (dexId: string, star: Star, max: number) => void;
  onWithdraw: (dexId: string, star: Star, max: number) => void;
  onExchangePoints: (dexId: string, star: Star, max: number) => void;
}

function nameOf(dexId: string): string {
  return findMonsterById(dexId)?.name ?? dexId;
}

function row(
  dexId: string,
  star: Star,
  count: number,
  actions: HTMLElement[],
): HTMLElement {
  return el("div", { className: "monster-storage-row" }, [
    el("div", { className: "monster-storage-row__main" }, [
      el("strong", {}, [nameOf(dexId)]),
      el("span", {}, [`★${star} Lv1`]),
      el("span", { className: "monster-storage-row__count" }, [`×${count.toLocaleString("ja-JP")}`]),
    ]),
    el("div", { className: "monster-storage-row__actions" }, actions),
  ]);
}

export function renderMonsterStorage(props: MonsterStorageProps): HTMLElement {
  const stored = [...storageStacks(props.player)].sort((a, b) => b.star - a.star || nameOf(a.dexId).localeCompare(nameOf(b.dexId), "ja"));
  const owned = storableOwnedGroups(props.player).sort((a, b) => b.star - a.star || nameOf(a.dexId).localeCompare(nameOf(b.dexId), "ja"));

  return el("div", { className: "screen monster-storage-screen" }, [
    managementHeader("モンスター保管所", props.onBack, `保管 ${storageCount(props.player).toLocaleString("ja-JP")}体`),
    props.notice ? el("p", { className: "shop-notice", role: "status" }, [props.notice]) : el("span", {}),
    el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [el("h2", {}, ["保管中"])]),
      el("p", { className: "app-subtitle" }, [
        "同じ種類・属性・★の未育成Lv1モンスターを1枠にまとめて保存します。必要な数だけ取り出せます。",
      ]),
      stored.length === 0
        ? el("p", { className: "app-subtitle" }, ["まだ保管されているモンスターはいません。"])
        : el("div", { className: "monster-storage-list" }, stored.map((stack) => row(stack.dexId, stack.star, stack.count, [
          el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onWithdraw(stack.dexId, stack.star, stack.count) }, ["取り出す"]),
          el("button", { type: "button", className: "btn btn--primary", onclick: () => props.onExchangePoints(stack.dexId, stack.star, stack.count) }, [`ポイントへ (+${stack.star}P/体)`]),
        ]))),
    ]),
    el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [el("h2", {}, ["所持モンスターから預ける"])]),
      el("p", { className: "app-subtitle" }, [
        "Lv1・経験値0・未育成・装備なし・未ロック・編成外の個体だけが対象です。数量を選んで預けます。",
      ]),
      owned.length === 0
        ? el("p", { className: "app-subtitle" }, ["現在、保管できるモンスターはいません。"])
        : el("div", { className: "monster-storage-list" }, owned.map((stack) => row(stack.dexId, stack.star, stack.count, [
          el("button", { type: "button", className: "btn btn--primary", onclick: () => props.onDeposit(stack.dexId, stack.star, stack.count) }, ["数量を選んで預ける"]),
        ]))),
    ]),
  ]);
}
