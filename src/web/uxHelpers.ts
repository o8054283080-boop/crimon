import { Equipment, EquipSlot, StatType, STAT_LABEL } from "../core/equipment.js";
import type { MonsterInstance } from "../core/monsterInstance.js";
import type { Difficulty } from "../data/stages.js";
import type { LevelDungeonTier } from "../data/levelDungeon.js";
import type { ScreenName } from "./views/bottomNav.js";

export interface DungeonReturnContext {
  screen: ScreenName;
  label: string;
  selectedStageId?: string;
  selectedDifficulty?: Difficulty;
  selectedDungeonFloor?: number;
  selectedLevelDungeonTier?: LevelDungeonTier;
  selectedGoldDungeonFloor?: number;
}

export interface RestorableDungeonSelection {
  screen: ScreenName;
  selectedStageId: string | null;
  selectedDifficulty: Difficulty;
  selectedDungeonFloor: number | null;
  selectedLevelDungeonTier: LevelDungeonTier | null;
  selectedGoldDungeonFloor: number | null;
}

export function restoreDungeonSelection(context: DungeonReturnContext): RestorableDungeonSelection {
  return {
    screen: context.screen,
    selectedStageId: context.selectedStageId ?? null,
    selectedDifficulty: context.selectedDifficulty ?? "NORMAL",
    selectedDungeonFloor: context.selectedDungeonFloor ?? null,
    selectedLevelDungeonTier: context.selectedLevelDungeonTier ?? null,
    selectedGoldDungeonFloor: context.selectedGoldDungeonFloor ?? null,
  };
}

export function normalStageReturnContext(selectedStageId: string, selectedDifficulty: Difficulty, label: string): DungeonReturnContext {
  return { screen: "STAGES", label, selectedStageId, selectedDifficulty };
}

export function keepReturnContext(current: DungeonReturnContext | null, incoming: DungeonReturnContext): DungeonReturnContext {
  return current ?? incoming;
}

export function replacePartySlot(ids: readonly string[], slot: number | null, instanceId: string): string[] | null {
  if (slot === null || slot < 0 || ids.includes(instanceId) || slot > ids.length) return null;
  const next = [...ids];
  if (slot === next.length) next.push(instanceId);
  else next[slot] = instanceId;
  return next;
}

export function partyCardAction(instance: MonsterInstance | undefined, onEmpty: () => void, onMonster: (id: string) => void): () => void {
  return instance ? () => onMonster(instance.id) : onEmpty;
}

export function equipmentForSlot(equipment: readonly Equipment[], slot: EquipSlot): Equipment[] {
  return equipment.filter((item) => item.slot === slot);
}

export function equipmentStatTotal(equipment: Equipment, type: StatType): number {
  return [equipment.mainStat, ...equipment.subStats]
    .filter((roll) => roll.type === type)
    .reduce((sum, roll) => sum + roll.value, 0);
}

export function sortEquipmentByStat(equipment: readonly Equipment[], type: StatType): Equipment[] {
  return equipment.slice().sort((a, b) => equipmentStatTotal(b, type) - equipmentStatTotal(a, type) || b.star - a.star || b.level - a.level);
}

export interface EquipmentComparisonRow {
  type: StatType;
  label: string;
  current: number | null;
  candidate: number | null;
  delta: number;
}

export function compareEquipmentStats(current: Equipment | undefined, candidate: Equipment): EquipmentComparisonRow[] {
  const types = new Set<StatType>([
    ...(current ? [current.mainStat, ...current.subStats].map((roll) => roll.type) : []),
    ...[candidate.mainStat, ...candidate.subStats].map((roll) => roll.type),
  ]);
  return [...types].map((type) => {
    const oldRolls = current ? [current.mainStat, ...current.subStats].filter((roll) => roll.type === type) : [];
    const newRolls = [candidate.mainStat, ...candidate.subStats].filter((roll) => roll.type === type);
    const oldValue = oldRolls.reduce((sum, roll) => sum + roll.value, 0);
    const newValue = newRolls.reduce((sum, roll) => sum + roll.value, 0);
    return { type, label: STAT_LABEL[type], current: oldRolls.length ? oldValue : null, candidate: newRolls.length ? newValue : null, delta: newValue - oldValue };
  }).filter((row) => row.delta !== 0);
}

export function sellableEquipmentIds(equipment: readonly Equipment[], equippedIds: ReadonlySet<string> = new Set()): string[] {
  return equipment.filter((item) => !item.locked && !equippedIds.has(item.id)).map((item) => item.id);
}

export function equipmentLockLabel(equipment: Pick<Equipment, "locked">, compact = false): string {
  return equipment.locked ? `🔒 ${compact ? "解除" : "ロック解除"}` : `🔓 ${compact ? "ロック" : "ロックする"}`;
}

export function rememberedScrollTop(element: Pick<HTMLElement, "scrollTop"> | null, fallback: number): number {
  return element?.scrollTop ?? fallback;
}

export function restoreScrollTop(element: Pick<HTMLElement, "scrollTop"> | null, value: number): void {
  if (element) element.scrollTop = value;
}
