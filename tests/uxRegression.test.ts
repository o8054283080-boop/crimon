import { describe, expect, it, vi } from "vitest";
import { Equipment, EquipSlot, StatType } from "../src/core/equipment.js";
import { MonsterInstance } from "../src/core/monsterInstance.js";
import { createInitialState, findEquippedOwner, setEquipmentLocked } from "../src/game/playerState.js";
import {
  compareEquipmentStats,
  equipmentForSlot,
  equipmentLockLabel,
  equipmentStatTotal,
  keepReturnContext,
  normalStageReturnContext,
  partyCardAction,
  rememberedScrollTop,
  replacePartySlot,
  restoreDungeonSelection,
  restoreScrollTop,
  sellableEquipmentIds,
  sortEquipmentByStat,
} from "../src/web/uxHelpers.js";

function equipment(id: string, slot: EquipSlot, type: StatType, value: number, locked = false): Equipment {
  return { id, slot, star: 3, level: 0, set: "POWER", mainStat: { type, value }, subStats: [], locked };
}

describe("編成・装備・復帰UX回帰", () => {
  it("CURRENT PARTYカードは対象モンスターcallbackを呼ぶ", () => {
    const empty = vi.fn(); const detail = vi.fn();
    partyCardAction({ id: "m1" } as MonsterInstance, empty, detail)();
    expect(detail).toHaveBeenCalledWith("m1"); expect(empty).not.toHaveBeenCalled();
  });
  it("CURRENT PARTY空き枠は編成callbackを呼ぶ", () => {
    const empty = vi.fn(); partyCardAction(undefined, empty, vi.fn())(); expect(empty).toHaveBeenCalledOnce();
  });
  it("選択枠を所持モンスターで交換する", () => expect(replacePartySlot(["a", "b"], 0, "c")).toEqual(["c", "b"]));
  it("空き枠へ追加する", () => expect(replacePartySlot(["a"], 1, "b")).toEqual(["a", "b"]));
  it("同じモンスターの重複編成を拒否する", () => expect(replacePartySlot(["a", "b"], 0, "b")).toBeNull());
  it("装備pickerは指定slotだけを返す", () => expect(equipmentForSlot([equipment("a", 1, "ATK_FLAT", 1), equipment("b", 2, "SPD", 1)], 2).map((e) => e.id)).toEqual(["b"]));
  it("装備statで降順sortする", () => expect(sortEquipmentByStat([equipment("low", 1, "SPD", 2), equipment("high", 1, "SPD", 8)], "SPD").map((e) => e.id)).toEqual(["high", "low"]));
  it("HP%とHP実数を混同しない", () => {
    const item = equipment("hp", 1, "HP_PERCENT", .2); item.subStats = [{ type: "HP_FLAT", value: 500 }];
    expect(equipmentStatTotal(item, "HP_PERCENT")).toBe(.2); expect(equipmentStatTotal(item, "HP_FLAT")).toBe(500);
  });
  it("会心率と会心ダメージを混同しない", () => {
    const item = equipment("crit", 1, "CRIT_RATE", .1); item.subStats = [{ type: "CRIT_DMG", value: .4 }];
    expect(equipmentStatTotal(item, "CRIT_RATE")).toBe(.1); expect(equipmentStatTotal(item, "CRIT_DMG")).toBe(.4);
  });
  it("異なるmain stat比較は上昇と低下を両方返す", () => {
    const rows = compareEquipmentStats(equipment("old", 1, "ATK_FLAT", 20), equipment("new", 1, "SPD", 7));
    expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({ type: "ATK_FLAT", delta: -20 }), expect.objectContaining({ type: "SPD", delta: 7 })]));
  });
  it("通常一覧・詳細・pickerで共有するlock表示を切り替える", () => {
    expect(equipmentLockLabel({ locked: false })).toBe("🔓 ロックする");
    expect(equipmentLockLabel({ locked: true })).toBe("🔒 ロック解除");
    expect(equipmentLockLabel({ locked: false }, true)).toBe("🔓 ロック");
  });
  it("正式lock処理でlock/unlockする", () => {
    const state = createInitialState(); state.equipment = [equipment("a", 1, "ATK_FLAT", 1)];
    expect(setEquipmentLocked(state, "a", true)).toBe(true); expect(state.equipment[0].locked).toBe(true);
    expect(setEquipmentLocked(state, "a", false)).toBe(true); expect(state.equipment[0].locked).toBe(false);
  });
  it("locked装備はbulk selection対象外", () => expect(sellableEquipmentIds([equipment("free", 1, "SPD", 1), equipment("locked", 1, "SPD", 1, true)])).toEqual(["free"]));
  it("装備中装備もbulk selection対象外", () => expect(sellableEquipmentIds([equipment("used", 1, "SPD", 1)], new Set(["used"]))).toEqual([]));
  it("farm結果の全選択はlockedを除外する", () => expect(sellableEquipmentIds([equipment("a", 1, "SPD", 1), equipment("b", 1, "SPD", 1, true)])).toEqual(["a"]));
  it("farm結果scroll位置を保存・復元する", () => {
    const oldPanel = { scrollTop: 432 }; const nextPanel = { scrollTop: 0 };
    const saved = rememberedScrollTop(oldPanel as HTMLElement, 0); restoreScrollTop(nextPanel as HTMLElement, saved);
    expect(nextPanel.scrollTop).toBe(432);
  });
  it("他モンスター装備中判定は正式ownerを返す", () => {
    const state = createInitialState(); const item = equipment("gear", 1, "ATK_FLAT", 1); state.equipment = [item];
    state.monsters = [{ id: "owner", dexId: "slime_FIRE", star: 1, level: 1, exp: 0, equipment: { 1: item.id }, skillLevels: {} } as MonsterInstance];
    expect(findEquippedOwner(state, item.id)?.id).toBe("owner");
  });
  it("通常ステージreturnContextにstageとdifficultyを保持する", () => expect(normalStageReturnContext("stage-7", "HELL", "火山")).toMatchObject({ screen: "STAGES", selectedStageId: "stage-7", selectedDifficulty: "HELL" }));
  it("通常ステージ選択と難易度を復元する", () => expect(restoreDungeonSelection(normalStageReturnContext("stage-7", "HARD", "火山"))).toMatchObject({ selectedStageId: "stage-7", selectedDifficulty: "HARD" }));
  it("装備・Gold・Level dungeonの選択を復元する", () => expect(restoreDungeonSelection({ screen: "EQUIP_DUNGEON", label: "戻る", selectedDungeonFloor: 10, selectedGoldDungeonFloor: 8, selectedLevelDungeonTier: "F5" })).toMatchObject({ selectedDungeonFloor: 10, selectedGoldDungeonFloor: 8, selectedLevelDungeonTier: "F5" }));
  it("Towerへ復帰する", () => expect(restoreDungeonSelection({ screen: "TRIAL_TOWER", label: "試練の塔70F" }).screen).toBe("TRIAL_TOWER"));
  it("深い遷移では最初のreturnContextを上書きしない", () => {
    const first = normalStageReturnContext("stage-3", "HARD", "森");
    expect(keepReturnContext(first, { screen: "TRIAL_TOWER", label: "塔" })).toBe(first);
  });
});
