import type { PlayerState } from "./playerState.js";

export type TutorialMissionId =
  | "clear_battle" | "level_up" | "rank_three" | "equip" | "enhance_equipment"
  | "ability" | "skill" | "edit_party" | "challenge_equipment_dungeon" | "clear_equipment_floor_3";

export interface TutorialMissionSave {
  claimedIds: TutorialMissionId[];
  partyEdited: boolean;
  equipmentDungeonChallenged: boolean;
}

export interface TutorialMissionDefinition {
  id: TutorialMissionId;
  name: string;
  task: string;
  target: number;
  unit: string;
  reward: { crystal?: number; gold?: number };
  destination: "STAGES" | "MONSTERS" | "EQUIPMENT" | "PARTY" | "EQUIP_DUNGEON";
}

export const TUTORIAL_MISSIONS: readonly TutorialMissionDefinition[] = [
  { id: "clear_battle", name: "はじめての勝利", task: "バトルを1回クリアしよう", target: 1, unit: "回", reward: { gold: 1000 }, destination: "STAGES" },
  { id: "level_up", name: "モンスターを強くしよう", task: "モンスターをLv2以上にしよう", target: 2, unit: "Lv", reward: { gold: 1500 }, destination: "MONSTERS" },
  { id: "rank_three", name: "ランクアップに挑戦", task: "モンスターを★3以上にしよう", target: 3, unit: "★", reward: { crystal: 20 }, destination: "MONSTERS" },
  { id: "equip", name: "装備で力を引き出そう", task: "装備を1個装着しよう", target: 1, unit: "個", reward: { gold: 2000 }, destination: "MONSTERS" },
  { id: "enhance_equipment", name: "装備を磨こう", task: "装備を+1以上に強化しよう", target: 1, unit: "+", reward: { gold: 2500 }, destination: "EQUIPMENT" },
  { id: "ability", name: "能力を伸ばそう", task: "能力ポイントを1pt以上割り振ろう", target: 1, unit: "pt", reward: { gold: 2500 }, destination: "MONSTERS" },
  { id: "skill", name: "スキルを鍛えよう", task: "いずれかのスキルをLv2以上にしよう", target: 2, unit: "Lv", reward: { crystal: 20 }, destination: "MONSTERS" },
  { id: "edit_party", name: "仲間を編成しよう", task: "パーティを1回編集しよう", target: 1, unit: "回", reward: { gold: 3000 }, destination: "PARTY" },
  { id: "challenge_equipment_dungeon", name: "装備を探しに行こう", task: "装備ダンジョンに1回挑戦しよう", target: 1, unit: "回", reward: { gold: 3000 }, destination: "EQUIP_DUNGEON" },
  { id: "clear_equipment_floor_3", name: "初心者卒業への一歩", task: "装備ダンジョン3階をクリアしよう", target: 3, unit: "階", reward: { crystal: 50 }, destination: "EQUIP_DUNGEON" },
] as const;

export function createTutorialMissionSave(): TutorialMissionSave {
  return { claimedIds: [], partyEdited: false, equipmentDungeonChallenged: false };
}

export function tutorialMissionProgress(state: PlayerState, mission: TutorialMissionDefinition): number {
  switch (mission.id) {
    case "clear_battle": return state.clearedStageIds.length > 0 || state.clearedDungeonFloors.length > 0 ? 1 : 0;
    case "level_up": return Math.max(1, ...state.monsters.map((monster) => monster.level));
    case "rank_three": return Math.max(1, ...state.monsters.map((monster) => monster.star));
    case "equip": return state.monsters.some((monster) => Object.keys(monster.equipment).length > 0) ? 1 : 0;
    case "enhance_equipment": return Math.max(0, ...state.equipment.map((equipment) => equipment.level));
    case "ability": return Math.max(0, ...state.monsters.map((monster) => Object.values(monster.development.abilityPoints).reduce((a, b) => a + b, 0)));
    case "skill": return Math.max(1, ...state.monsters.flatMap((monster) => monster.skillLevels));
    case "edit_party": return state.tutorialMissions.partyEdited ? 1 : 0;
    case "challenge_equipment_dungeon": return state.tutorialMissions.equipmentDungeonChallenged || state.clearedDungeonFloors.length > 0 ? 1 : 0;
    case "clear_equipment_floor_3": return state.clearedDungeonFloors.includes(3) ? 3 : Math.max(0, ...state.clearedDungeonFloors.filter((floor) => floor < 3));
  }
}

export function currentTutorialMission(state: PlayerState): TutorialMissionDefinition | null {
  return TUTORIAL_MISSIONS.find((mission) => !state.tutorialMissions.claimedIds.includes(mission.id)) ?? null;
}

/** 受取済みの印を先に立ててから報酬を加えるため、同じ呼び出しを繰り返しても二重受取にならない。 */
export function claimTutorialMission(state: PlayerState): boolean {
  const mission = currentTutorialMission(state);
  if (!mission || tutorialMissionProgress(state, mission) < mission.target) return false;
  state.tutorialMissions.claimedIds.push(mission.id);
  state.crystal += mission.reward.crystal ?? 0;
  state.gold += mission.reward.gold ?? 0;
  return true;
}
