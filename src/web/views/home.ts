import { MAX_FIGHTER_LEVEL, requiredExpForFighterLevel } from "../../core/fighterLevel.js";
import {
  getParty,
  LoginBonusResult,
  LOGIN_BONUS_MILESTONE_INTERVAL_DAYS,
  PlayerState,
  STAMINA_REFILL_FULL_COST,
  STAMINA_REFILL_PARTIAL_AMOUNT,
  STAMINA_REFILL_PARTIAL_COST,
} from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderPartySlots } from "./partyCard.js";

export interface HomeProps {
  player: PlayerState;
  loginBonusResult: LoginBonusResult | null;
  onDismissLoginBonus: () => void;
  onGoSummon: () => void;
  onGoStages: () => void;
  onGoParty: () => void;
  onGoEquipDungeon: () => void;
  onGoLevelDungeon: () => void;
  onGoGoldDungeon: () => void;
  onRefillStaminaPartial: () => void;
  onRefillStaminaFull: () => void;
  onEditFighterName: () => void;
}

function renderLoginBonusBanner(result: LoginBonusResult, onDismiss: () => void): HTMLElement {
  const total = result.dailyCrystal + result.milestoneCrystal;
  const lines = [`🎁 ログインボーナスでダイヤ+${total}獲得!`];
  if (result.milestoneCrystal > 0) {
    lines.push(`✨ ${LOGIN_BONUS_MILESTONE_INTERVAL_DAYS}日分ログインで追加ボーナス+${result.milestoneCrystal}も獲得しました!`);
  }
  return el("section", { className: "panel login-bonus-banner" }, [
    ...lines.map((line) => el("p", {}, [line])),
    el("button", { type: "button", className: "btn btn--ghost", onclick: onDismiss }, ["閉じる"]),
  ]);
}

export function renderHome(props: HomeProps): HTMLElement {
  const {
    player,
    loginBonusResult,
    onDismissLoginBonus,
    onGoSummon,
    onGoStages,
    onGoParty,
    onGoEquipDungeon,
    onGoLevelDungeon,
    onGoGoldDungeon,
    onRefillStaminaPartial,
    onRefillStaminaFull,
    onEditFighterName,
  } = props;
  const party = getParty(player);

  const isMaxFighterLevel = player.fighterLevel >= MAX_FIGHTER_LEVEL;
  const fighterExpNeeded = requiredExpForFighterLevel(player.fighterLevel);
  const isStaminaFull = player.stamina >= player.maxStamina;

  return el("div", { className: "screen home-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, ["Crimon"]), el("p", { className: "app-subtitle" }, ["周回してモンスターを育てよう"])]),
    loginBonusResult ? renderLoginBonusBanner(loginBonusResult, onDismissLoginBonus) : null,
    el("section", { className: "panel currency-panel" }, [
      el("div", { className: "currency-chip" }, [el("span", {}, ["💎"]), ` ${player.crystal}`]),
      el("div", { className: "currency-chip" }, [el("span", {}, ["🪙"]), ` ${player.gold}`]),
    ]),
    el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [
        el("h2", {}, [`${player.fighterName} Lv.${player.fighterLevel}`]),
        el("button", { type: "button", className: "btn btn--ghost fighter-name-edit-btn", onclick: onEditFighterName }, ["✎ 名前変更"]),
      ]),
      el("p", { className: "app-subtitle" }, [isMaxFighterLevel ? "MAX" : `EXP ${player.fighterExp}/${fighterExpNeeded}`]),
      el("p", {}, [`⚡ スタミナ ${player.stamina} / ${player.maxStamina}`]),
      el("div", { className: "stamina-refill-row" }, [
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost",
            disabled: isStaminaFull || player.crystal < STAMINA_REFILL_PARTIAL_COST,
            onclick: onRefillStaminaPartial,
          },
          [`💎${STAMINA_REFILL_PARTIAL_COST}で+${STAMINA_REFILL_PARTIAL_AMOUNT}回復`],
        ),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost",
            disabled: isStaminaFull || player.crystal < STAMINA_REFILL_FULL_COST,
            onclick: onRefillStaminaFull,
          },
          [`💎${STAMINA_REFILL_FULL_COST}で全回復`],
        ),
      ]),
    ]),
    el("section", { className: "panel" }, [
      el("div", { className: "panel-header" }, [el("h2", {}, ["現在のパーティ"]), el("button", { type: "button", className: "btn btn--ghost", onclick: onGoParty }, ["編成へ"])]),
      renderPartySlots(party, 4),
    ]),
    el("button", { type: "button", className: "btn btn--primary btn--large", onclick: onGoStages }, ["🗺 ステージに挑戦する"]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onGoSummon }, ["✨ モンスターを召喚する"]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onGoEquipDungeon }, ["🏰 装備ダンジョンに挑戦する"]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onGoLevelDungeon }, ["📈 レベル上げダンジョンに挑戦する"]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: onGoGoldDungeon }, ["🪙 ゴールドダンジョンに挑戦する"]),
  ].filter((n): n is HTMLElement => n !== null));
}
