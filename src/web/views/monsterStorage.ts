import type { Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import type { PlayerState } from "../../game/playerState.js";
import { storableOwnedGroups, storageCount, storageStacks } from "../../game/monsterStorage.js";
import { el } from "../dom.js";
import { managementHeader } from "./managementHeader.js";
import "../ui/monsterStorage.css";

export interface MonsterStorageExchangeDraft {
  dexId: string;
  star: Star;
  count: number;
}

export interface MonsterStorageProps {
  player: PlayerState;
  notice: string | null;
  /** ポイントへ変える前の確かめ。画面の中で「はい/やめる」を出す。 */
  pendingExchange: MonsterStorageExchangeDraft | null;
  onBack: () => void;
  onDeposit: (dexId: string, star: Star, count: number) => void;
  onWithdraw: (dexId: string, star: Star, count: number) => void;
  onRequestExchange: (dexId: string, star: Star, count: number) => void;
  onConfirmExchange: () => void;
  onCancelExchange: () => void;
}

function nameOf(dexId: string): string {
  return findMonsterById(dexId)?.name ?? dexId;
}

/**
 * 数量を画面の中で選ぶ。
 *
 * **`window.prompt` は使わない。**ホーム画面へ追加したアプリ(PWA)や、
 * ダイアログを止める設定の端末では入力窓が出ずに null が返り、
 * 押しても何も起きない「預けられない」ボタンになっていた。
 */
function quantityPicker(max: number, initial: number): { root: HTMLElement; value: () => number } {
  let current = Math.max(1, Math.min(max, initial));
  const input = el("input", {
    type: "number",
    className: "monster-storage-qty__input",
    min: "1",
    max: String(max),
    step: "1",
    inputMode: "numeric",
    value: String(current),
    "aria-label": `数量（1〜${max}）`,
  }) as HTMLInputElement;
  const set = (next: number): void => {
    current = Math.max(1, Math.min(max, Math.floor(Number.isFinite(next) ? next : current)));
    input.value = String(current);
  };
  input.addEventListener("change", () => set(Number(input.value)));
  const step = (label: string, aria: string, delta: number): HTMLElement =>
    el("button", { type: "button", className: "monster-storage-qty__step", "aria-label": aria, onclick: () => set(current + delta) }, [label]);
  // 最初から最大(=その行の全数)が入っている。減らす方が多いので「最大」ボタンは置かない
  const root = el("div", { className: "monster-storage-qty" }, [
    step("−", "1体減らす", -1),
    input,
    step("＋", "1体増やす", 1),
  ]);
  return {
    root,
    value: () => {
      set(Number(input.value));
      return current;
    },
  };
}

/**
 * 1行 = 1種類。**一画面にできるだけ多く並べる**(依頼主の指定)。
 * 名前と数を左に2段で、数量と操作を右へ1列に置く。
 */
function row(dexId: string, star: Star, count: number, extra: string | null, controls: HTMLElement[]): HTMLElement {
  return el("div", { className: "monster-storage-row", "data-storage-row": `${dexId}::${star}` }, [
    el("div", { className: "monster-storage-row__main" }, [
      el("strong", { className: "monster-storage-row__name" }, [nameOf(dexId)]),
      el("span", { className: "monster-storage-row__meta" }, [
        `★${star} `,
        el("b", { className: "monster-storage-row__count" }, [`×${count.toLocaleString("ja-JP")}`]),
        ...(extra ? [` ${extra}`] : []),
      ]),
    ]),
    el("div", { className: "monster-storage-row__actions" }, controls),
  ]);
}

function storedRow(props: MonsterStorageProps, dexId: string, star: Star, count: number): HTMLElement {
  const pending = props.pendingExchange;
  if (pending && pending.dexId === dexId && pending.star === star) {
    const gain = pending.count * star;
    return el("div", { className: "monster-storage-row monster-storage-row--confirm", "data-storage-row": `${dexId}::${star}`, role: "group", "aria-label": "ポイントへ変える確認" }, [
      el("p", { className: "monster-storage-confirm__text" }, [
        `${nameOf(dexId)} ★${star}を${pending.count.toLocaleString("ja-JP")}体送り、${gain.toLocaleString("ja-JP")}Pに変えます。戻せません。`,
      ]),
      el("div", { className: "monster-storage-row__actions" }, [
        el("button", { type: "button", className: "btn btn--ghost monster-storage-act", onclick: props.onCancelExchange }, ["やめる"]),
        el("button", { type: "button", className: "btn btn--primary monster-storage-act", "data-storage-action": "confirm-exchange", onclick: props.onConfirmExchange }, ["送る"]),
      ]),
    ]);
  }
  const qty = quantityPicker(count, count);
  return row(dexId, star, count, `${star}P/体`, [
    qty.root,
    el("button", { type: "button", className: "btn btn--ghost monster-storage-act", "data-storage-action": "withdraw", onclick: () => props.onWithdraw(dexId, star, qty.value()) }, ["取出"]),
    el("button", { type: "button", className: "btn btn--primary monster-storage-act", "data-storage-action": "exchange", "aria-label": `ポイントへ変える（1体${star}P）`, onclick: () => props.onRequestExchange(dexId, star, qty.value()) }, ["P化"]),
  ]);
}

function ownedRow(props: MonsterStorageProps, dexId: string, star: Star, count: number): HTMLElement {
  const qty = quantityPicker(count, count);
  return row(dexId, star, count, null, [
    qty.root,
    el("button", { type: "button", className: "btn btn--primary monster-storage-act", "data-storage-action": "deposit", onclick: () => props.onDeposit(dexId, star, qty.value()) }, ["預ける"]),
  ]);
}

export function renderMonsterStorage(props: MonsterStorageProps): HTMLElement {
  const stored = [...storageStacks(props.player)].sort((a, b) => b.star - a.star || nameOf(a.dexId).localeCompare(nameOf(b.dexId), "ja"));
  const owned = storableOwnedGroups(props.player).sort((a, b) => b.star - a.star || nameOf(a.dexId).localeCompare(nameOf(b.dexId), "ja"));

  return el("div", { className: "screen monster-storage-screen" }, [
    managementHeader("モンスター保管所", props.onBack, `保管 ${storageCount(props.player).toLocaleString("ja-JP")}体`),
    props.notice ? el("p", { className: "shop-notice", role: "status" }, [props.notice]) : el("span", {}),
    el("section", { className: "monster-storage-section" }, [
      el("h2", { className: "monster-storage-section__title" }, [`保管中（${stored.length}種）`]),
      stored.length === 0
        ? el("p", { className: "monster-storage-section__empty" }, ["まだ保管されているモンスターはいません。"])
        : el("div", { className: "monster-storage-list" }, stored.map((stack) => storedRow(props, stack.dexId, stack.star, stack.count))),
    ]),
    el("section", { className: "monster-storage-section" }, [
      el("h2", { className: "monster-storage-section__title" }, [`預けられる（${owned.length}種）`]),
      el("p", { className: "monster-storage-section__note" }, [
        "Lv1・未育成・装備なし・未ロック・編成外の個体だけ。同じ種類・属性・★は1枠にまとまります。",
      ]),
      owned.length === 0
        ? el("p", { className: "monster-storage-section__empty" }, ["いま預けられるモンスターはいません。"])
        : el("div", { className: "monster-storage-list" }, owned.map((stack) => ownedRow(props, stack.dexId, stack.star, stack.count))),
    ]),
  ]);
}
