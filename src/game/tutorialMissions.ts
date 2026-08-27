import type { PlayerState } from "./playerState.js";

export type TutorialDestination = "STAGES" | "PARTY" | "MONSTERS" | "EQUIPMENT" | "EQUIP_DUNGEON" | "MONSTER_CREATE";
export interface TutorialReward { gold?: number; crystal?: number; summonScrolls?: number; fourStarSummonScrolls?: number; lightDarkFourStarSummonScrolls?: number; fiveStarSummonScrolls?: number }
export interface TutorialMission {
  id: string; step: number; chapter: number; chapterTitle: string; title: string;
  condition: string; reward: TutorialReward; destination: TutorialDestination;
  isComplete: (player: PlayerState) => boolean;
}

const maxStar = (p: PlayerState, star: number, level = 1) => p.monsters.some((m) => m.star >= star && m.level >= level);
const equipped = (p: PlayerState, count: number) => p.monsters.some((m) => Object.keys(m.equipment).length >= count);
const enhanced = (p: PlayerState, level: number) => p.equipment.some((e) => e.level >= level);
const dungeon = (p: PlayerState, floor: number) => p.clearedDungeonFloors.some((f) => f >= floor);
const abilityPoints = (p: PlayerState) => p.monsters.some((m) => Object.values(m.development.abilityPoints).reduce((a, b) => a + b, 0) > 0);
const typed = (p: PlayerState) => p.monsters.some((m) => m.development.type !== null);

const chapters = ["冒険の始まり", "モンスターを育てる", "装備と本格育成", "★6への道", "クリエイト入門"];
const m = (step: number, chapter: number, title: string, condition: string, reward: TutorialReward, destination: TutorialDestination, isComplete: TutorialMission["isComplete"]): TutorialMission =>
  ({ id: `tutorial-step-${step}`, step, chapter, chapterTitle: chapters[chapter - 1], title, condition, reward, destination, isComplete });

/** 報酬・条件・移動先を一か所で監査できる、一本道の初心者ロードマップ。 */
export const TUTORIAL_MISSIONS: readonly TutorialMission[] = [
  m(1,1,"最初の勝利","通常ステージを1回クリア",{gold:5000,crystal:20},"STAGES",p=>p.clearedStageIds.length>=1),
  m(2,1,"Lv5を目指そう","モンスター1体をLv5以上",{gold:6000},"MONSTERS",p=>maxStar(p,1,5)),
  m(3,1,"Lv10を目指そう","モンスター1体をLv10以上",{gold:7000,crystal:20},"MONSTERS",p=>maxStar(p,1,10)),
  m(4,1,"編成を整えよう","パーティ編成を変更",{gold:5000},"PARTY",p=>p.tutorialMissions.partyChanged),
  m(5,1,"冒険に慣れよう","通常ステージを3種類クリア",{gold:10000,crystal:30},"STAGES",p=>p.clearedStageIds.length>=3),
  m(6,2,"初めての★3","★3以上のモンスターを所持",{gold:20000,crystal:40,summonScrolls:1},"MONSTERS",p=>maxStar(p,3)),
  m(7,2,"★3を育成","★3以上をLv10以上",{gold:12000},"MONSTERS",p=>maxStar(p,3,10)),
  m(8,2,"装備を着けよう","1体に装備を1個装着",{gold:10000,crystal:20},"MONSTERS",p=>equipped(p,1)),
  m(9,2,"装備を組み合わせよう","1体に装備を2個装着",{gold:12000},"MONSTERS",p=>equipped(p,2)),
  m(10,2,"初めての装備強化","強化値+1以上の装備を所持",{gold:15000,crystal:30,fourStarSummonScrolls:1},"EQUIPMENT",p=>enhanced(p,1)),
  m(11,2,"装備を+3へ","強化値+3以上の装備を所持",{gold:20000},"EQUIPMENT",p=>enhanced(p,3)),
  m(12,2,"装備ダンジョンへ","装備ダンジョン1階をクリア",{gold:25000,crystal:40},"EQUIP_DUNGEON",p=>dungeon(p,1)),
  m(13,3,"2階を突破","装備ダンジョン2階をクリア",{gold:30000,crystal:40,summonScrolls:1},"EQUIP_DUNGEON",p=>dungeon(p,2)),
  m(14,3,"3階を突破","装備ダンジョン3階をクリア",{gold:30000,crystal:50},"EQUIP_DUNGEON",p=>dungeon(p,3)),
  m(15,3,"初めての★4","★4以上のモンスターを所持",{gold:50000,crystal:80,summonScrolls:12},"MONSTERS",p=>maxStar(p,4)),
  m(16,3,"★4を育成","★4以上をLv20以上",{gold:30000,crystal:30},"MONSTERS",p=>maxStar(p,4,20)),
  m(17,3,"高品質な装備","★4以上の装備を所持",{gold:30000,crystal:40},"EQUIP_DUNGEON",p=>p.equipment.some(e=>e.star>=4)),
  m(18,3,"装備を+6へ","強化値+6以上の装備を所持",{gold:40000},"EQUIPMENT",p=>enhanced(p,6)),
  m(19,3,"5階を突破","装備ダンジョン5階をクリア",{gold:50000,crystal:80,summonScrolls:2},"EQUIP_DUNGEON",p=>dungeon(p,5)),
  m(20,4,"初めての★5","★5以上のモンスターを所持",{gold:80000,crystal:120,summonScrolls:13,lightDarkFourStarSummonScrolls:1},"MONSTERS",p=>maxStar(p,5)),
  m(21,4,"★5を育成","★5以上をLv25以上",{gold:50000,crystal:40},"MONSTERS",p=>maxStar(p,5,25)),
  m(22,4,"主力の装備","1体に装備を4個装着",{gold:40000,crystal:40},"MONSTERS",p=>equipped(p,4)),
  m(23,4,"中層を制覇","装備ダンジョン7階をクリア",{gold:70000,crystal:100,summonScrolls:2},"EQUIP_DUNGEON",p=>dungeon(p,7)),
  m(24,4,"★6進化の準備","★5モンスターをLv50にする",{gold:100000,crystal:80,summonScrolls:2},"MONSTERS",p=>maxStar(p,5,50)),
  m(25,4,"基本育成卒業・★6","★6モンスターを所持",{gold:200000,crystal:300,summonScrolls:15},"MONSTERS",p=>maxStar(p,6)),
  m(26,5,"クリエイト入門","★6のクリエイト画面を開く",{gold:50000,crystal:50},"MONSTER_CREATE",p=>p.tutorialMissions.createOpened),
  m(27,5,"能力ポイント","能力ポイントを1以上使用",{gold:60000,crystal:60},"MONSTER_CREATE",abilityPoints),
  m(28,5,"タイプ転生","タイプ転生を1回行う",{gold:80000,crystal:80,summonScrolls:2},"MONSTER_CREATE",typed),
  m(29,5,"転生後の育成","タイプ転生済み★6をLv10以上",{gold:100000,crystal:100},"MONSTERS",p=>p.monsters.some(x=>x.star===6&&x.level>=10&&x.development.type!==null)),
  m(30,5,"ロードマップ制覇","タイプ転生済み★6に能力ポイントを使用",{gold:150000,crystal:200,summonScrolls:5,fiveStarSummonScrolls:1},"MONSTER_CREATE",p=>p.monsters.some(x=>x.star===6&&x.development.type!==null&&Object.values(x.development.abilityPoints).some(v=>v>0))),
];

export function nextTutorialMission(player: PlayerState): TutorialMission | undefined {
  return TUTORIAL_MISSIONS.find((mission) => !player.tutorialMissions.claimedIds.includes(mission.id));
}
export function canClaimTutorialMission(player: PlayerState, mission: TutorialMission): boolean {
  const next = nextTutorialMission(player);
  return next?.id === mission.id && mission.isComplete(player);
}
export function claimTutorialMission(player: PlayerState, id: string): boolean {
  const mission = TUTORIAL_MISSIONS.find((x) => x.id === id);
  if (!mission || !canClaimTutorialMission(player, mission)) return false;
  player.gold += mission.reward.gold ?? 0; player.crystal += mission.reward.crystal ?? 0;
  player.summonScrolls += mission.reward.summonScrolls ?? 0; player.tutorialMissions.claimedIds.push(id);
  player.fourStarSummonScrolls += mission.reward.fourStarSummonScrolls ?? 0;
  player.lightDarkFourStarSummonScrolls += mission.reward.lightDarkFourStarSummonScrolls ?? 0;
  player.fiveStarSummonScrolls += mission.reward.fiveStarSummonScrolls ?? 0;
  return true;
}
