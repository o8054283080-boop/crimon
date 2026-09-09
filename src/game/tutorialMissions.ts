import { createMonsterInstance } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL, type Star } from "../core/rarity.js";
import { EXP_PIG_DEX, REINCARNATION_PIG_DEX, SKILL_PIG_DEX } from "../data/monsters.js";
import { addArenaCoins } from "./arena/progress.js";
import type { PlayerState } from "./playerState.js";
import { registerMissionPlayer, syncMissions, type MissionCounterKey } from "./missions.js";

export type TutorialDestination =
  | "STAGES"
  | "PARTY"
  | "MONSTERS"
  | "EQUIPMENT"
  | "EQUIP_DUNGEON"
  | "MONSTER_CREATE";

export interface TutorialReward {
  gold?: number;
  crystal?: number;
  stamina?: number;
  arenaCoins?: number;
  summonScrolls?: number;
  fourStarSummonScrolls?: number;
  lightDarkFourStarSummonScrolls?: number;
  fiveStarSummonScrolls?: number;
  awakeningOrbs?: number;
  awakeningStones?: number;
  expPig5?: number;
  expPig6?: number;
  reincarnationPig4?: number;
  reincarnationPig5?: number;
  skillPig?: number;
}

export interface TutorialMission {
  id: string;
  step: number;
  chapter: number;
  chapterTitle: string;
  title: string;
  condition: string;
  reward: TutorialReward;
  destination: TutorialDestination;
  isComplete: (player: PlayerState) => boolean;
  progress?: (player: PlayerState) => { current: number; target: number };
}

export interface TutorialChapterView {
  chapter: number;
  title: string;
  firstStep: number;
  lastStep: number;
  claimed: number;
  complete: boolean;
  active: boolean;
}

export const TUTORIAL_CHAPTER_TITLES = [
  "冒険のはじまり",
  "戦う準備を整えよう",
  "もっと強くなろう",
  "ランクアップに挑戦",
  "ダンジョンへ挑もう",
  "パーティを鍛えよう",
  "★6への道",
  "クリエイトを知ろう",
  "強敵に挑戦",
  "初心者卒業",
] as const;

const stage = (p: PlayerState, id: string) => p.clearedStageIds.includes(id);
const dungeon = (p: PlayerState, floor: number) => p.clearedDungeonFloors.some((f) => f >= floor);
const equippedTotal = (p: PlayerState) => p.monsters.reduce((sum, monster) => sum + Object.keys(monster.equipment).length, 0);
const partyMonsters = (p: PlayerState) => p.partyIds.map((id) => p.monsters.find((m) => m.id === id)).filter((m): m is PlayerState["monsters"][number] => Boolean(m));
const partyEquippedTotal = (p: PlayerState) => partyMonsters(p).reduce((sum, monster) => sum + Object.keys(monster.equipment).length, 0);
const enhanced = (p: PlayerState, level: number) => p.equipment.some((e) => e.level >= level);
const enhancedCount = (p: PlayerState, level: number) => p.equipment.filter((e) => e.level >= level).length;
const hasLevel = (p: PlayerState, level: number) => p.monsters.some((m) => m.level >= level);
const hasStarCount = (p: PlayerState, star: Star, count: number) => p.monsters.filter((m) => m.star >= star).length >= count;
const starLevelCount = (p: PlayerState, star: Star, level: number) => p.monsters.filter((m) => m.star >= star && m.level >= level).length;
const hasStarLevel = (p: PlayerState, star: Star, level: number) => starLevelCount(p, star, level) >= 1;
const hasMaxLevel = (p: PlayerState) => p.monsters.some((m) => m.level >= STAR_MAX_LEVEL[m.star]);
const hasMaxStarAtLeast = (p: PlayerState, star: Star) => p.monsters.some((m) => m.star >= star && m.level >= STAR_MAX_LEVEL[m.star]);
const partyAllLevel = (p: PlayerState, level: number) => {
  const party = partyMonsters(p);
  return party.length >= 4 && party.slice(0, 4).every((m) => m.level >= level);
};
const abilityPoints = (p: PlayerState) => p.monsters.some((m) => Object.values(m.development.abilityPoints).reduce((a, b) => a + b, 0) > 0);
const maxAbilityPoints = (p: PlayerState) => Math.max(0, ...p.monsters.map((m) => Object.values(m.development.abilityPoints).reduce((a, b) => a + b, 0)));
const typed = (p: PlayerState) => p.monsters.some((m) => m.development.type !== null);
const missionCounter = (p: PlayerState, key: MissionCounterKey) => syncMissions(p).counters[key];
const arenaBattles = (p: PlayerState) => Math.max(p.arenaSeasonBattles ?? 0, missionCounter(p, "arenaBattles"));

const mission = (
  step: number,
  chapter: number,
  title: string,
  condition: string,
  reward: TutorialReward,
  destination: TutorialDestination,
  isComplete: TutorialMission["isComplete"],
  progress?: TutorialMission["progress"],
): TutorialMission => ({
  id: `beginner-step-${String(step).padStart(3, "0")}`,
  step,
  chapter,
  chapterTitle: TUTORIAL_CHAPTER_TITLES[chapter - 1],
  title,
  condition,
  reward,
  destination,
  isComplete,
  progress,
});

/**
 * 実際の攻略順をそのまま案内する80個の一本道初心者ミッション。
 * 8件ごとの最後の報酬には章クリア報酬を合算しているため、章報酬専用の
 * 保存フラグを増やさずclaimedIdsだけで二重受取を防げる。
 *
 * 新ID(beginner-step-xxx)を使うので、旧30件(tutorial-step-x)の受取印は壊さない。
 * 既存プレイヤーは現在の所持・到達状態から順番に遡及達成できる。
 */
export const TUTORIAL_MISSIONS: readonly TutorialMission[] = [
  mission(1, 1, "最初の召喚", "モンスターを1回召喚する", { summonScrolls: 5 }, "MONSTERS", p => p.tutorialSummonDone === true || p.monsters.length >= 4),
  mission(2, 1, "4体で編成", "パーティに4体編成する", { gold: 50_000 }, "PARTY", p => p.partyIds.length >= 4, p => ({ current: p.partyIds.length, target: 4 })),
  mission(3, 1, "1-1へ挑戦", "ステージ1-1をクリアする", { crystal: 50 }, "STAGES", p => stage(p, "1-1")),
  mission(4, 1, "Lv5にしよう", "モンスター1体をLv5以上にする", { expPig5: 1 }, "MONSTERS", p => hasLevel(p, 5)),
  mission(5, 1, "1-2へ挑戦", "ステージ1-2をクリアする", { summonScrolls: 5 }, "STAGES", p => stage(p, "1-2")),
  mission(6, 1, "Lv10にしよう", "モンスター1体をLv10以上にする", { stamina: 100 }, "MONSTERS", p => hasLevel(p, 10)),
  mission(7, 1, "1-3へ挑戦", "ステージ1-3をクリアする", { crystal: 50 }, "STAGES", p => stage(p, "1-3")),
  mission(8, 1, "初めての装備", "装備を1個装着する", { gold: 100_000, summonScrolls: 10, crystal: 200, expPig5: 1 }, "MONSTERS", p => equippedTotal(p) >= 1, p => ({ current: equippedTotal(p), target: 1 })),

  mission(9, 2, "1-4へ挑戦", "ステージ1-4をクリアする", { summonScrolls: 5 }, "STAGES", p => stage(p, "1-4")),
  mission(10, 2, "装備を増やそう", "装備を合計3個装着する", { gold: 100_000 }, "MONSTERS", p => equippedTotal(p) >= 3, p => ({ current: equippedTotal(p), target: 3 })),
  mission(11, 2, "装備を強化", "装備を1回以上強化する", { gold: 100_000 }, "EQUIPMENT", p => enhanced(p, 1)),
  mission(12, 2, "装備を+3へ", "強化値+3以上の装備を1個作る", { crystal: 50 }, "EQUIPMENT", p => enhanced(p, 3)),
  mission(13, 2, "1-5へ挑戦", "ステージ1-5をクリアする", { summonScrolls: 5 }, "STAGES", p => stage(p, "1-5")),
  mission(14, 2, "Lv15にしよう", "モンスター1体をLv15以上にする", { expPig5: 1 }, "MONSTERS", p => hasLevel(p, 15)),
  mission(15, 2, "2-1へ進もう", "ステージ2-1をクリアする", { stamina: 150 }, "STAGES", p => stage(p, "2-1")),
  mission(16, 2, "第2章クリア", "ステージ2-2をクリアする", { crystal: 300, gold: 300_000, summonScrolls: 10 }, "STAGES", p => stage(p, "2-2")),

  mission(17, 3, "育成を続けよう", "モンスター1体をLv20以上にする", { expPig5: 1 }, "MONSTERS", p => hasLevel(p, 20)),
  mission(18, 3, "2-3へ挑戦", "ステージ2-3をクリアする", { summonScrolls: 5 }, "STAGES", p => stage(p, "2-3")),
  mission(19, 3, "装備を6個", "装備を合計6個装着する", { crystal: 50 }, "MONSTERS", p => equippedTotal(p) >= 6, p => ({ current: equippedTotal(p), target: 6 })),
  mission(20, 3, "装備を+6へ", "強化値+6以上の装備を1個作る", { gold: 200_000 }, "EQUIPMENT", p => enhanced(p, 6)),
  mission(21, 3, "2-4へ挑戦", "ステージ2-4をクリアする", { summonScrolls: 5 }, "STAGES", p => stage(p, "2-4")),
  mission(22, 3, "LvMAXを作ろう", "LvMAXのモンスターを1体作る", { reincarnationPig4: 1 }, "MONSTERS", p => hasMaxLevel(p)),
  mission(23, 3, "2-5を突破", "ステージ2-5をクリアする", { crystal: 100 }, "STAGES", p => stage(p, "2-5")),
  mission(24, 3, "第3章クリア", "★4以上のモンスターを1体所持する", { summonScrolls: 10, crystal: 250, expPig5: 2 }, "MONSTERS", p => hasStarCount(p, 4, 1)),

  mission(25, 4, "★4を育てよう", "★4以上のモンスターをLv10以上にする", { gold: 100_000 }, "MONSTERS", p => hasStarLevel(p, 4, 10)),
  mission(26, 4, "ランクアップ", "ランクアップを1回以上行う", { summonScrolls: 5 }, "MONSTERS", p => missionCounter(p, "rankUps") >= 1),
  mission(27, 4, "★4をLv20へ", "★4以上をLv20以上にする", { expPig5: 1 }, "MONSTERS", p => hasStarLevel(p, 4, 20)),
  mission(28, 4, "3-1へ挑戦", "ステージ3-1をクリアする", { crystal: 50 }, "STAGES", p => stage(p, "3-1")),
  mission(29, 4, "3-2へ挑戦", "ステージ3-2をクリアする", { summonScrolls: 5 }, "STAGES", p => stage(p, "3-2")),
  mission(30, 4, "装備強化10回", "装備強化を累計10回行う", { gold: 250_000 }, "EQUIPMENT", p => missionCounter(p, "equipmentEnhancements") >= 10),
  mission(31, 4, "3-3へ挑戦", "ステージ3-3をクリアする", { crystal: 100 }, "STAGES", p => stage(p, "3-3")),
  mission(32, 4, "第4章クリア", "★4以上のモンスターを2体所持する", { summonScrolls: 10, fourStarSummonScrolls: 1, reincarnationPig4: 2, crystal: 300 }, "MONSTERS", p => hasStarCount(p, 4, 2)),

  mission(33, 5, "装備ダンジョンへ", "装備ダンジョン1階をクリアする", { stamina: 200 }, "EQUIP_DUNGEON", p => dungeon(p, 1)),
  mission(34, 5, "2階へ挑戦", "装備ダンジョン2階をクリアする", { summonScrolls: 5 }, "EQUIP_DUNGEON", p => dungeon(p, 2)),
  mission(35, 5, "★3装備を入手", "★3以上の装備を1個所持する", { gold: 200_000 }, "EQUIP_DUNGEON", p => p.equipment.some(e => e.star >= 3)),
  mission(36, 5, "装備を付け替え", "装備を合計8個以上装着する", { crystal: 75 }, "MONSTERS", p => equippedTotal(p) >= 8, p => ({ current: equippedTotal(p), target: 8 })),
  mission(37, 5, "3階へ挑戦", "装備ダンジョン3階をクリアする", { summonScrolls: 5 }, "EQUIP_DUNGEON", p => dungeon(p, 3)),
  mission(38, 5, "装備を+6以上に", "強化値+6以上の装備を2個所持する", { gold: 250_000 }, "EQUIPMENT", p => enhancedCount(p, 6) >= 2, p => ({ current: enhancedCount(p, 6), target: 2 })),
  mission(39, 5, "4階へ挑戦", "装備ダンジョン4階をクリアする", { stamina: 300 }, "EQUIP_DUNGEON", p => dungeon(p, 4)),
  mission(40, 5, "第5章クリア", "装備ダンジョン5階をクリアする", { summonScrolls: 15, fourStarSummonScrolls: 1, crystal: 300, expPig5: 2 }, "EQUIP_DUNGEON", p => dungeon(p, 5)),

  mission(41, 6, "★4を2体育成", "★4以上を2体Lv20以上にする", { expPig5: 1 }, "MONSTERS", p => starLevelCount(p, 4, 20) >= 2, p => ({ current: starLevelCount(p, 4, 20), target: 2 })),
  mission(42, 6, "4体をLv20へ", "パーティ4体を全員Lv20以上にする", { summonScrolls: 5 }, "PARTY", p => partyAllLevel(p, 20)),
  mission(43, 6, "4-1へ挑戦", "ステージ4-1をクリアする", { gold: 250_000 }, "STAGES", p => stage(p, "4-1")),
  mission(44, 6, "装備を12個", "パーティに合計12個以上装備する", { crystal: 75 }, "PARTY", p => partyEquippedTotal(p) >= 12, p => ({ current: partyEquippedTotal(p), target: 12 })),
  mission(45, 6, "装備強化20回", "装備強化を累計20回行う", { gold: 300_000 }, "EQUIPMENT", p => missionCounter(p, "equipmentEnhancements") >= 20),
  mission(46, 6, "★4をLvMAXへ", "★4以上のLvMAXを1体所持する", { reincarnationPig4: 1 }, "MONSTERS", p => hasMaxStarAtLeast(p, 4)),
  mission(47, 6, "初めての★5", "★5以上のモンスターを1体所持する", { summonScrolls: 10 }, "MONSTERS", p => hasStarCount(p, 5, 1)),
  mission(48, 6, "第6章クリア", "ステージ4-5をクリアする", { fourStarSummonScrolls: 1, summonScrolls: 15, expPig5: 2, crystal: 400 }, "STAGES", p => stage(p, "4-5")),

  mission(49, 7, "★5をLv20へ", "★5以上をLv20以上にする", { expPig5: 1 }, "MONSTERS", p => hasStarLevel(p, 5, 20)),
  mission(50, 7, "装備ダンジョン6階", "装備ダンジョン6階をクリアする", { summonScrolls: 5 }, "EQUIP_DUNGEON", p => dungeon(p, 6)),
  mission(51, 7, "★5をLvMAXへ", "★5以上のLvMAXを1体所持する", { reincarnationPig5: 1 }, "MONSTERS", p => hasMaxStarAtLeast(p, 5)),
  mission(52, 7, "ランクアップ5回", "ランクアップを累計5回行う", { gold: 300_000 }, "MONSTERS", p => missionCounter(p, "rankUps") >= 5),
  mission(53, 7, "★5を2体", "★5以上を2体所持する", { summonScrolls: 10 }, "MONSTERS", p => hasStarCount(p, 5, 2)),
  mission(54, 7, "初めての★6", "★6モンスターを1体所持する", { crystal: 200 }, "MONSTERS", p => hasStarCount(p, 6, 1)),
  mission(55, 7, "★6をLv30へ", "★6モンスターをLv30以上にする", { expPig5: 2 }, "MONSTERS", p => hasStarLevel(p, 6, 30)),
  mission(56, 7, "第7章クリア", "★6モンスターをLv60にする", { expPig6: 1, fourStarSummonScrolls: 1, summonScrolls: 15, crystal: 500, reincarnationPig5: 1 }, "MONSTERS", p => hasStarLevel(p, 6, 60)),

  mission(57, 8, "クリエイト入門", "★6のクリエイト画面を開く", { gold: 200_000 }, "MONSTER_CREATE", p => p.tutorialMissions.createOpened),
  mission(58, 8, "能力ポイント", "能力ポイントを1以上使用する", { crystal: 75 }, "MONSTER_CREATE", abilityPoints),
  mission(59, 8, "潜在覚醒", "潜在覚醒を1回行う", { summonScrolls: 5 }, "MONSTER_CREATE", p => p.monsters.some(m => m.development.latentAbilityId !== null)),
  mission(60, 8, "タイプ転生", "タイプ転生を1回行う", { awakeningOrbs: 1 }, "MONSTER_CREATE", typed),
  mission(61, 8, "★6を整えよう", "★6に装備を4個以上装着する", { gold: 300_000 }, "MONSTERS", p => p.monsters.some(m => m.star === 6 && Object.keys(m.equipment).length >= 4)),
  mission(62, 8, "能力をさらに強化", "能力ポイントを合計10以上使用する", { summonScrolls: 5 }, "MONSTER_CREATE", p => maxAbilityPoints(p) >= 10),
  mission(63, 8, "目覚の深域へ", "目覚の深域1階をクリアする", { crystal: 150 }, "STAGES", p => (p.clearedAwakeningDepthFloors ?? []).some(f => f >= 1)),
  mission(64, 8, "第8章クリア", "スキル覚醒用の才能ptを1以上解放する", { lightDarkFourStarSummonScrolls: 1, summonScrolls: 15, awakeningOrbs: 1, crystal: 500 }, "MONSTER_CREATE", p => missionCounter(p, "talentPointsUnlocked") >= 1),

  mission(65, 9, "試練の塔へ", "試練の塔1Fをクリアする", { summonScrolls: 5 }, "STAGES", p => p.trialTowerBestFloor >= 1),
  mission(66, 9, "塔5Fを突破", "試練の塔5Fをクリアする", { crystal: 100 }, "STAGES", p => p.trialTowerBestFloor >= 5),
  mission(67, 9, "アリーナへ", "アリーナを1回戦う", { arenaCoins: 300 }, "STAGES", p => arenaBattles(p) >= 1),
  mission(68, 9, "アリーナ初勝利", "アリーナで1勝する", { summonScrolls: 5 }, "STAGES", p => p.arenaSeasonWins >= 1),
  mission(69, 9, "装備ダンジョン7階", "装備ダンジョン7階をクリアする", { gold: 400_000 }, "EQUIP_DUNGEON", p => dungeon(p, 7)),
  mission(70, 9, "塔10Fを突破", "試練の塔10Fをクリアする", { expPig5: 1 }, "STAGES", p => p.trialTowerBestFloor >= 10),
  mission(71, 9, "アリーナ5戦", "アリーナを累計5回戦う", { arenaCoins: 500 }, "STAGES", p => arenaBattles(p) >= 5),
  mission(72, 9, "第9章クリア", "装備ダンジョン8階をクリアする", { lightDarkFourStarSummonScrolls: 1, summonScrolls: 15, crystal: 600, gold: 500_000 }, "EQUIP_DUNGEON", p => dungeon(p, 8)),

  mission(73, 10, "★6を2体", "★6モンスターを2体所持する", { expPig6: 1 }, "MONSTERS", p => hasStarCount(p, 6, 2)),
  mission(74, 10, "★6装備を入手", "★6装備を1個所持する", { gold: 500_000 }, "EQUIP_DUNGEON", p => p.equipment.some(e => e.star >= 6)),
  mission(75, 10, "装備を+12へ", "強化値+12以上の装備を1個作る", { crystal: 150 }, "EQUIPMENT", p => enhanced(p, 12)),
  mission(76, 10, "塔20Fを突破", "試練の塔20Fをクリアする", { summonScrolls: 10 }, "STAGES", p => p.trialTowerBestFloor >= 20),
  mission(77, 10, "アリーナ10戦", "アリーナを累計10回戦う", { arenaCoins: 1_000 }, "STAGES", p => arenaBattles(p) >= 10),
  mission(78, 10, "目覚の深域へ", "目覚の深域を1階以上クリアする", { awakeningStones: 1 }, "STAGES", p => (p.clearedAwakeningDepthFloors ?? []).length >= 1),
  mission(79, 10, "スキル覚醒への一歩", "才能ptを3以上解放する", { skillPig: 1 }, "MONSTER_CREATE", p => missionCounter(p, "talentPointsUnlocked") >= 3),
  mission(80, 10, "初心者卒業", "★6を2体所持し、塔20Fを突破する", { fiveStarSummonScrolls: 1, fourStarSummonScrolls: 1, summonScrolls: 20, crystal: 1_000, gold: 1_000_000, expPig6: 2, reincarnationPig5: 2, awakeningStones: 1, skillPig: 1 }, "MONSTERS", p => hasStarCount(p, 6, 2) && p.trialTowerBestFloor >= 20),
];

export function nextTutorialMission(player: PlayerState): TutorialMission | undefined {
  registerMissionPlayer(player);
  return TUTORIAL_MISSIONS.find((entry) => !player.tutorialMissions.claimedIds.includes(entry.id));
}

export function canClaimTutorialMission(player: PlayerState, entry: TutorialMission): boolean {
  const next = nextTutorialMission(player);
  return next?.id === entry.id && entry.isComplete(player);
}

export function tutorialMissionProgress(player: PlayerState, entry: TutorialMission): { current: number; target: number } {
  if (!entry.progress) return { current: entry.isComplete(player) ? 1 : 0, target: 1 };
  const value = entry.progress(player);
  return { current: Math.min(value.target, Math.max(0, value.current)), target: value.target };
}

export function tutorialChapterViews(player: PlayerState): TutorialChapterView[] {
  const next = nextTutorialMission(player);
  return TUTORIAL_CHAPTER_TITLES.map((title, index) => {
    const chapter = index + 1;
    const firstStep = index * 8 + 1;
    const lastStep = firstStep + 7;
    const entries = TUTORIAL_MISSIONS.filter((entry) => entry.chapter === chapter);
    const claimed = entries.filter((entry) => player.tutorialMissions.claimedIds.includes(entry.id)).length;
    return { chapter, title, firstStep, lastStep, claimed, complete: claimed === entries.length, active: next?.chapter === chapter };
  });
}

function grantMaterialPig(player: PlayerState, pool: typeof EXP_PIG_DEX, star: 4 | 5 | 6, count: number): void {
  if (count <= 0 || pool.length === 0) return;
  const maxLevel = STAR_MAX_LEVEL[star];
  for (let index = 0; index < count; index += 1) {
    player.monsters.push(createMonsterInstance(pool[index % pool.length].id, star, maxLevel));
  }
}

function grantSkillPig(player: PlayerState, count: number): void {
  if (count <= 0 || SKILL_PIG_DEX.length === 0) return;
  for (let index = 0; index < count; index += 1) {
    player.monsters.push(createMonsterInstance(SKILL_PIG_DEX[index % SKILL_PIG_DEX.length].id, 5, STAR_MAX_LEVEL[5]));
  }
}

function grantTutorialReward(player: PlayerState, reward: TutorialReward): void {
  player.gold += reward.gold ?? 0;
  player.crystal += reward.crystal ?? 0;
  player.stamina += reward.stamina ?? 0;
  player.summonScrolls += reward.summonScrolls ?? 0;
  player.fourStarSummonScrolls += reward.fourStarSummonScrolls ?? 0;
  player.lightDarkFourStarSummonScrolls += reward.lightDarkFourStarSummonScrolls ?? 0;
  player.fiveStarSummonScrolls += reward.fiveStarSummonScrolls ?? 0;
  player.awakeningOrbs += reward.awakeningOrbs ?? 0;
  if (reward.awakeningStones) player.awakeningStones = (player.awakeningStones ?? 0) + reward.awakeningStones;
  addArenaCoins(player, reward.arenaCoins ?? 0);
  grantMaterialPig(player, EXP_PIG_DEX, 5, reward.expPig5 ?? 0);
  grantMaterialPig(player, EXP_PIG_DEX, 6, reward.expPig6 ?? 0);
  grantMaterialPig(player, REINCARNATION_PIG_DEX, 4, reward.reincarnationPig4 ?? 0);
  grantMaterialPig(player, REINCARNATION_PIG_DEX, 5, reward.reincarnationPig5 ?? 0);
  grantSkillPig(player, reward.skillPig ?? 0);
}

export function claimTutorialMission(player: PlayerState, id: string): boolean {
  const entry = TUTORIAL_MISSIONS.find((candidate) => candidate.id === id);
  if (!entry || !canClaimTutorialMission(player, entry)) return false;
  if (player.tutorialMissions.claimedIds.includes(id)) return false;
  grantTutorialReward(player, entry.reward);
  player.tutorialMissions.claimedIds.push(id);
  return true;
}

export function tutorialRewardText(reward: TutorialReward): string {
  const parts: string[] = [];
  if (reward.gold) parts.push(`${reward.gold.toLocaleString("ja-JP")}G`);
  if (reward.crystal) parts.push(`ダイヤ×${reward.crystal.toLocaleString("ja-JP")}`);
  if (reward.stamina) parts.push(`スタミナ×${reward.stamina.toLocaleString("ja-JP")}`);
  if (reward.summonScrolls) parts.push(`召喚の書×${reward.summonScrolls}`);
  if (reward.fourStarSummonScrolls) parts.push(`★4以上召喚書×${reward.fourStarSummonScrolls}`);
  if (reward.lightDarkFourStarSummonScrolls) parts.push(`★4以上光闇召喚書×${reward.lightDarkFourStarSummonScrolls}`);
  if (reward.fiveStarSummonScrolls) parts.push(`★5召喚書×${reward.fiveStarSummonScrolls}`);
  if (reward.expPig5) parts.push(`★5 MAX経験ピッグ×${reward.expPig5}`);
  if (reward.expPig6) parts.push(`★6 MAX経験ピッグ×${reward.expPig6}`);
  if (reward.reincarnationPig4) parts.push(`★4 MAX転生ピッグ×${reward.reincarnationPig4}`);
  if (reward.reincarnationPig5) parts.push(`★5 MAX転生ピッグ×${reward.reincarnationPig5}`);
  if (reward.skillPig) parts.push(`スキルピッグ×${reward.skillPig}`);
  if (reward.awakeningOrbs) parts.push(`覚醒オーブ×${reward.awakeningOrbs}`);
  if (reward.awakeningStones) parts.push(`目覚の奇石×${reward.awakeningStones}`);
  if (reward.arenaCoins) parts.push(`アリーナコイン×${reward.arenaCoins.toLocaleString("ja-JP")}`);
  return parts.join(" / ") || "報酬なし";
}
