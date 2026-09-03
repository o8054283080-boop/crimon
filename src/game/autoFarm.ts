import { ClearRewardResult, LevelUpInfo } from "./rewards.js";

/**
 * 周回(まとめて何回も挑む)の成果を積み上げる側。
 *
 * **かつてここには「戦闘を実行せずに決着だけ出す」関数が4つあった。**
 * 10回まとめて挑むと一瞬で集計画面に着く作りで、
 * 結果として**戦闘画面を一度も見ないまま遊べてしまっていた**。
 * 依頼主の指摘で取りやめ、周回は1戦ずつ実際に戦闘画面で戦う形へ変えた
 * (進行は `src/web/main.ts` の `farmRun`)。
 *
 * ここに残すのは集計だけ。1戦ぶんの報酬を受け取って足していく。
 */

export type AutoFarmStopReason = "COMPLETED" | "STAMINA" | "DEFEAT" | "NO_PARTY" | "DAILY_LIMIT" | "STOPPED";

export interface AutoFarmDrop {
  dexId: string;
  star: number;
}

export interface AutoFarmResult {
  /** 実際に挑戦を試みた回数(スタミナ切れ等で中断した場合、指定回数より少なくなる) */
  attempts: number;
  /** そのうちクリアできた回数 */
  cleared: number;
  stopReason: AutoFarmStopReason;
  totalGold: number;
  totalCrystal: number;
  totalExp: number;
  totalFighterLevels: number;
  monsterDrops: AutoFarmDrop[];
  equipmentDropCount: number;
  /** その周回で既に所持品へ追加された装備のID。報酬を再生成するためには使わない。 */
  earnedEquipmentIds?: string[];
  pigDropCount: number;
  summonScrollCount: number;
  levelUps: LevelUpInfo[];
}

export function emptyResult(): AutoFarmResult {
  return {
    attempts: 0,
    cleared: 0,
    stopReason: "COMPLETED",
    totalGold: 0,
    totalCrystal: 0,
    totalExp: 0,
    totalFighterLevels: 0,
    monsterDrops: [],
    equipmentDropCount: 0,
    earnedEquipmentIds: [],
    pigDropCount: 0,
    summonScrollCount: 0,
    levelUps: [],
  };
}

/** 次の1戦を始められるかを見るのに要るもの */
export interface FarmContinueCheck {
  /** 編成に入っている数 */
  partySize: number;
  stamina: number;
  /** 1回あたりの消費スタミナ */
  staminaCost: number;
  /** 1日の残り挑戦回数。上限が無いコンテンツでは省略する */
  challengesLeft?: number;
}

/**
 * 次の1戦を始められない理由。始められるなら null。
 *
 * **見る順番は、実際に消費する順番と合わせてある。**
 * ゴールドダンジョンは1日の上限を先に消費するので、
 * 上限に達しているのに「スタミナ切れ」と出すと直し方を間違える。
 *
 * 「始めてみて駄目だった」を後から検出する形にはできない。周回は戦闘画面から
 * 戦闘画面へ移るので、始まったかどうかを画面の変化では判定できない。
 */
export function farmBlockReason(check: FarmContinueCheck): AutoFarmStopReason | null {
  if (check.partySize === 0) return "NO_PARTY";
  if (check.challengesLeft !== undefined && check.challengesLeft <= 0) return "DAILY_LIMIT";
  if (check.stamina < check.staminaCost) return "STAMINA";
  return null;
}

/**
 * 1戦ぶんのクリア報酬を集計へ足す。
 *
 * `extraGold` はステージのウェーブ報酬のように、クリア報酬とは別に
 * 戦闘中へ入っているぶん。**同じモンスターのレベルアップは1行にまとめる**
 * (10回まわして同じ子が10行並ぶと、何が何レベル上がったのか読めない)。
 */
export function mergeReward(result: AutoFarmResult, reward: ClearRewardResult, extraGold: number): void {
  result.totalGold += reward.goldEarned + extraGold;
  result.totalCrystal += reward.crystalEarned;
  result.totalExp += reward.expTotal;
  result.totalFighterLevels += reward.fighterLevelsGained;
  if (reward.dropDexId && reward.dropStar) {
    result.monsterDrops.push({ dexId: reward.dropDexId, star: reward.dropStar });
  }
  if (reward.equipmentDrop) {
    result.equipmentDropCount += 1;
    (result.earnedEquipmentIds ??= []).push(reward.equipmentDrop.id);
  }
  const pigDrops = reward.pigDrops ?? (reward.pigDrop ? [reward.pigDrop] : []);
  for (const pigDrop of pigDrops) {
    result.pigDropCount += 1;
    result.monsterDrops.push({ dexId: pigDrop.dexId, star: pigDrop.star });
  }
  if (reward.summonScrollDropped) result.summonScrollCount += 1;

  for (const levelUp of reward.levelUps) {
    const existing = result.levelUps.find((l) => l.instanceId === levelUp.instanceId);
    if (existing) existing.levels += levelUp.levels;
    else result.levelUps.push({ ...levelUp });
  }
}
