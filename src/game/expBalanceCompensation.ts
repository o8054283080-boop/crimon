import { createMonsterInstance } from "../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../core/rarity.js";
import { EXP_PIG_DEX } from "../data/monsters.js";
import { COMPENSATIONS, type Compensation } from "./compensation.js";
import { loadPlayerState, savePlayerState, type PlayerState } from "./playerState.js";

/**
 * 2026-09-10 経験値バランス調整のお詫び。
 *
 * ダイヤと召喚の書は既存の配布システムに任せる。
 * 経験ピッグは Compensation がモンスター配布を持たないため、別の安定IDで
 * 一度だけ所持モンスターへ追加する。どちらも claimedCompensationIds に記録されるので、
 * 再起動・再描画で二重配布されない。
 */
export const EXP_BALANCE_APOLOGY_ID = "2026-09-10-exp-balance-apology";
export const EXP_BALANCE_PIG_GRANT_ID = "2026-09-10-exp-balance-pig-grant";

export const EXP_BALANCE_APOLOGY: Compensation = {
  id: EXP_BALANCE_APOLOGY_ID,
  title: "経験値バランス調整のお詫び",
  message:
    "経験値まわりのバランス調整により、育成計画に影響が出ることへのお詫びとして、ダイヤ1,500個、召喚の書20枚、★6経験ピッグを全6属性それぞれ2体ずつお贈りします。\n\n★6経験ピッグは火・水・雷・風・光・闇を各2体、合計12体です。更新後にゲームを開くと自動で受け取れます。受け取りは1回限りです。",
  kind: "APOLOGY",
  fromDate: "2026-09-10",
  toDate: "9999-12-31",
  crystal: 1_500,
  gold: 0,
  summonScrolls: 20,
};

/** 既存のお知らせ配列へ、同じIDを重複させず先頭追加する。 */
export function registerExpBalanceApology(): void {
  if (COMPENSATIONS.some((compensation) => compensation.id === EXP_BALANCE_APOLOGY_ID)) return;
  COMPENSATIONS.unshift(EXP_BALANCE_APOLOGY);
}

/**
 * ★6 Lv60 経験ピッグを6属性×2体、合計12体だけ一度配る。
 * 通貨側のお詫びIDとは分け、どちらか片方の保存だけ失敗しても次回起動で不足分だけ再試行できる。
 */
export function grantExpBalancePigs(state: PlayerState): number {
  if (state.claimedCompensationIds.includes(EXP_BALANCE_PIG_GRANT_ID)) return 0;

  let granted = 0;
  for (const pig of EXP_PIG_DEX) {
    state.monsters.push(createMonsterInstance(pig.id, 6, STAR_MAX_LEVEL[6]));
    state.monsters.push(createMonsterInstance(pig.id, 6, STAR_MAX_LEVEL[6]));
    granted += 2;
  }
  state.claimedCompensationIds.push(EXP_BALANCE_PIG_GRANT_ID);
  return granted;
}

/**
 * main の起動より先に呼ぶ小さなブートストラップ。
 * 保存に失敗した場合は永続化されないため、次回起動時に同じ配布を再試行できる。
 */
export function installExpBalanceCompensation(): void {
  registerExpBalanceApology();
  try {
    const state = loadPlayerState();
    if (grantExpBalancePigs(state) > 0) savePlayerState(state);
  } catch (error) {
    console.error("[CRIMON] 経験値調整のお詫び配布に失敗しました", error);
  }
}
