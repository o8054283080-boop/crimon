import { el } from "./dom.js";

const MONSTER_LIST_DENSE_KEY = "crimon_monster_list_dense_v1";

/**
 * 所持・強化素材・ランクアップ素材で共有する表示密度。
 * セーブデータとは分離し、端末の見た目設定としてだけ保存する。
 */
export function loadMonsterListDense(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(MONSTER_LIST_DENSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveMonsterListDense(dense: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(MONSTER_LIST_DENSE_KEY, dense ? "1" : "0");
  } catch {
    // 見た目設定を書けない端末でも、ゲーム本体と素材選択は止めない。
  }
}

/** 3画面で同じ見た目・文言を使う表示切替。 */
export function renderMonsterListDensityToggle(dense: boolean, onToggle: () => void): HTMLButtonElement {
  return el("button", {
    type: "button",
    className: `monster-density-toggle${dense ? " monster-density-toggle--active" : ""}`,
    onclick: onToggle,
    "aria-pressed": String(dense),
    title: dense ? "通常表示に戻す" : "簡易表示に切り替える",
  }, [
    el("span", { className: "monster-density-toggle__grid", "aria-hidden": "true" }, ["▦"]),
    el("span", {}, [dense ? "通常表示" : "簡易表示"]),
  ]);
}
