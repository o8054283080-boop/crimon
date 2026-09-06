import { el } from "./dom.js";

const EQUIPMENT_LIST_DENSE_KEY = "crimon_equipment_list_dense_v1";

/**
 * 所持装備の表示密度。
 *
 * セーブデータとは分離し、端末の見た目設定としてだけ保存する
 * (モンスター一覧の `monsterListDensity.ts` と同じ扱い)。
 * 別のキーにしてあるのは、装備とモンスターで「見たい細かさ」が違うため——
 * 装備は数百個たまるので簡易のまま使い、モンスターは通常で見る、という
 * 組み合わせが普通に起きる。
 */
export function loadEquipmentListDense(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(EQUIPMENT_LIST_DENSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveEquipmentListDense(dense: boolean, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(EQUIPMENT_LIST_DENSE_KEY, dense ? "1" : "0");
  } catch {
    // 見た目設定を書けない端末でも、装備の付け外しと売却は止めない。
  }
}

/** 見た目と文言はモンスター一覧の切替と揃える(同じ役目の道具を2つの形にしない) */
export function renderEquipmentListDensityToggle(dense: boolean, onToggle: () => void): HTMLButtonElement {
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
