/**
 * 周回の結果から開く「獲得装備」のシート。
 *
 * 周回10回ぶんの装備がそのまま縦に並ぶので、要るものと要らないものを
 * 選り分けるには**1枚ずつ見ていく**しかなかった(依頼主の指摘)。
 * 所持装備の一覧と同じ軸で絞り、残ったものだけをまとめて売れるようにする。
 *
 * ここで見張るのは**配線**。「絞ったのに全部売れた」が起きないことを、
 * 型検査にもCSSにも拾えないので文字列で押さえる。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EMPTY_EQUIPMENT_FILTER, filterEquipment } from "../src/web/equipmentFilter.js";
import { Equipment, STAT_TYPES } from "../src/core/equipment.js";

const VIEW = readFileSync(new URL("../src/web/views/farmEquipmentResult.ts", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../src/web/farmEquipmentResult.css", import.meta.url), "utf8");

describe("獲得装備のシートで絞り込める", () => {
  it("所持装備の一覧と同じ部品を使う(軸が2つに割れない)", () => {
    expect(VIEW).toContain("renderEquipmentFilterBar");
    expect(VIEW).toContain("filterEquipment(props.equipment, props.filter, () => false)");
  });

  it("絞り込みは流れの中に置く(浮かせて札を覆わない)", () => {
    expect(VIEW).not.toMatch(/farm-equip-sheet__filter[\s\S]{0,200}position:\s*(fixed|absolute)/);
    // 開いた時に中身を押し出さないよう、札の側を巻物にする
    expect(CSS).toContain(".farm-equip-sheet__panel .mfilter__body");
    expect(CSS).toContain("overflow-y: auto");
  });

  it("条件に当てはまるものが無い時は、そう言う", () => {
    // 「今回の装備がありません」と出ると、絞ったせいだと気づけない
    expect(VIEW).toContain("この条件に当てはまる装備はありません");
    expect(VIEW).toContain("現在所持している今回の装備はありません");
  });
});

describe("一括売却は表示中のものだけ", () => {
  it("「全選択」ではなく「表示中をすべて選ぶ」", () => {
    expect(VIEW).toContain("表示中をすべて選ぶ");
    expect(VIEW).not.toContain('["全選択"]');
    // 渡すのは絞り込んだ後の売却可能ID
    expect(VIEW).toContain("const sellableShownIds = sellableEquipmentIds(shown)");
    expect(VIEW).toContain("props.onSelectAll(sellableShownIds)");
  });

  it("受け取る側も、渡されたIDだけを選ぶ", () => {
    /*
     * ここが `sellableEquipmentIds(equipment)` のままだと、
     * **絞り込みを無視して見えていないものまで選ぶ。**
     */
    const at = MAIN.indexOf("onSelectAll: (ids)");
    expect(at, "渡されたIDを受け取っていない").toBeGreaterThan(-1);
    expect(MAIN.slice(at, at + 260)).toContain("ids.filter((id) => valid.has(id))");
  });

  it("シートを開くたびに条件を白紙へ戻す", () => {
    // 前の周回の条件が残っていると、次に開いた人は0個のシートを見る
    const at = MAIN.indexOf("state.farmEquipmentOpen = true;");
    expect(at).toBeGreaterThan(-1);
    expect(MAIN.slice(at, at + 400)).toContain("state.farmEquipmentFilter = { ...EMPTY_EQUIPMENT_FILTER }");
  });

  it("所持装備の一覧とは別の条件を持つ", () => {
    // 共有すると、一覧を★6に絞ったまま周回を終えた人が空のシートを見る
    expect(MAIN).toContain("farmEquipmentFilter: EquipmentFilter");
    expect(MAIN).toContain("farmEquipmentFilter: { ...EMPTY_EQUIPMENT_FILTER }");
  });
});

/** 絞った結果と「表示中をすべて選ぶ」が噛み合うこと自体も確かめる */
describe("絞った後に残るもの", () => {
  const make = (id: string, subs: (typeof STAT_TYPES)[number][], locked = false): Equipment => ({
    id,
    slot: 1,
    star: 6,
    level: 0,
    set: "CRIT",
    mainStat: { type: "ATK_FLAT", value: 10 },
    subStats: subs.map((type) => ({ type, value: 5 })),
    initialSubStatCount: subs.length,
    ...(locked ? { locked: true } : {}),
  });

  it("ロック中のものは、絞り込みに残っても売却の対象に入らない", async () => {
    const { sellableEquipmentIds } = await import("../src/web/uxHelpers.js");
    const all = [make("a", ["SPD"]), make("b", ["SPD"], true), make("c", ["CRIT_RATE"])];
    const shown = filterEquipment(all, { ...EMPTY_EQUIPMENT_FILTER, subStats: ["SPD"] }, () => false);

    expect(shown.map((e) => e.id)).toEqual(["a", "b"]);
    expect(sellableEquipmentIds(shown)).toEqual(["a"]);
  });
});
