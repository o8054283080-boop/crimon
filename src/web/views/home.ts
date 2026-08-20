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
import { CompensationClaim } from "../../game/compensation.js";
import { el } from "../dom.js";
import { AudioSettingsProps, renderAudioSettings } from "./audioSettings.js";
import { renderPartySlots } from "./partyCard.js";

export interface HomeProps {
  player: PlayerState;
  loginBonusResult: LoginBonusResult | null;
  compensationClaims: CompensationClaim[];
  onDismissCompensation: () => void;
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
  audioSettings: AudioSettingsProps;
  onExportSave: () => void;
  onImportSave: (file: File) => void;
}

function renderSaveDataPanel(props: HomeProps): HTMLElement {
  const input = el("input", {
    type: "file",
    accept: "application/json,.json",
    className: "save-data__input",
    onchange: (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) props.onImportSave(file);
      target.value = "";
    },
  }) as HTMLInputElement;

  return el("section", { className: "panel save-data" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["データの控え"])]),
    el("p", { className: "save-data__warning" }, [
      "このゲームのデータは、この端末のブラウザの中だけに保存されています。ブラウザの履歴やサイトデータを削除すると、いっしょに消えてしまいます。ときどき書き出して控えを取っておいてください。",
    ]),
    el("div", { className: "save-data__actions" }, [
      el("button", { type: "button", className: "btn btn--primary", onclick: props.onExportSave }, ["⬇ データを書き出す"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => input.click() }, ["⬆ データを読み込む"]),
      input,
    ]),
  ]);
}

function renderCompensationBanner(claims: CompensationClaim[], onDismiss: () => void): HTMLElement {
  const rows: HTMLElement[] = [];
  for (const { compensation } of claims) {
    rows.push(el("p", { className: "compensation__title" }, [`🎁 ${compensation.title}`]));
    rows.push(el("p", { className: "compensation__message" }, [compensation.message]));
    const items: string[] = [];
    if (compensation.crystal > 0) items.push(`💎 ダイヤ ${compensation.crystal.toLocaleString()}`);
    if (compensation.gold > 0) items.push(`🪙 ゴールド ${compensation.gold.toLocaleString()}`);
    if (compensation.summonScrolls > 0) items.push(`📜 召喚の書 ${compensation.summonScrolls}枚`);
    rows.push(el("p", { className: "compensation__items" }, [items.join(" / ")]));
  }
  return el("section", { className: "panel compensation" }, [
    ...rows,
    el("button", { type: "button", className: "btn btn--ghost", onclick: onDismiss }, ["閉じる"]),
  ]);
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

  const menu = el("div", { className: "home-menu home-menu--hidden" }, [
    props.compensationClaims.length > 0 ? renderCompensationBanner(props.compensationClaims, props.onDismissCompensation) : null,
    loginBonusResult ? renderLoginBonusBanner(loginBonusResult, onDismissLoginBonus) : null,
    el("section", { className: "home-topbar" }, [
      el("div", { className: "home-player" }, [
        el("strong", {}, [`${player.fighterName} Lv.${player.fighterLevel}`]),
        el("span", {}, [isMaxFighterLevel ? "MAX" : `EXP ${player.fighterExp}/${fighterExpNeeded}`]),
      ]),
      el("div", { className: "home-currencies" }, [
        el("span", {}, [`💎 ${player.crystal}`]),
        el("span", {}, [`🪙 ${player.gold}`]),
        el("span", {}, [`⚡ ${player.stamina}/${player.maxStamina}`]),
      ]),
      el("button", { type: "button", className: "btn btn--ghost home-name-btn", onclick: onEditFighterName }, ["✎"]),
    ]),
    el("section", { className: "home-party-card" }, [
      el("div", { className: "home-section-title" }, [el("strong", {}, ["CURRENT PARTY"]), el("button", { type: "button", className: "btn btn--ghost", onclick: onGoParty }, ["編成"])]),
      renderPartySlots(party, 4),
    ]),
    el("button", { type: "button", className: "home-adventure", onclick: onGoStages }, [
      el("span", { className: "home-adventure__icon" }, ["⚔"]),
      el("span", { className: "home-adventure__text" }, [el("strong", {}, ["ADVENTURE"]), el("small", {}, ["ステージに挑戦する"])]),
      el("span", { className: "home-adventure__arrow" }, ["›"]),
    ]),
    el("div", { className: "home-menu-grid" }, [
      el("button", { type: "button", className: "home-menu-tile", onclick: onGoSummon }, ["✨", "召喚"]),
      el("button", { type: "button", className: "home-menu-tile", onclick: onGoParty }, ["👥", "パーティ"]),
      el("button", { type: "button", className: "home-menu-tile", onclick: onGoEquipDungeon }, ["🛡", "装備"]),
      el("button", { type: "button", className: "home-menu-tile", onclick: onGoLevelDungeon }, ["📈", "育成"]),
      el("button", { type: "button", className: "home-menu-tile", onclick: onGoGoldDungeon }, ["🪙", "ゴールド"]),
    ]),
    el("section", { className: "home-utility" }, [
      el("div", { className: "home-stamina" }, [el("span", {}, ["⚡ スタミナ"]), el("strong", {}, [`${player.stamina} / ${player.maxStamina}`])]),
      el("div", { className: "home-stamina-actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", disabled: isStaminaFull || player.crystal < STAMINA_REFILL_PARTIAL_COST, onclick: onRefillStaminaPartial }, [`💎${STAMINA_REFILL_PARTIAL_COST} +${STAMINA_REFILL_PARTIAL_AMOUNT}`]),
        el("button", { type: "button", className: "btn btn--ghost", disabled: isStaminaFull || player.crystal < STAMINA_REFILL_FULL_COST, onclick: onRefillStaminaFull }, [`💎${STAMINA_REFILL_FULL_COST} 全回復`]),
      ]),
    ]),
    renderAudioSettings(props.audioSettings),
    renderSaveDataPanel(props),
    el("p", { className: "build-id" }, [`版 ${__BUILD_ID__}`]),
  ].filter((n): n is HTMLElement => n !== null));

  const titleScreen = el("section", { className: "title-screen" }, [
    el("div", { className: "title-screen__logo" }, [
      el("span", {}, ["CREATE"]),
      el("strong", {}, ["MONSTERS"]),
      el("small", {}, ["クリエイトモンスターズ"]),
    ]),
    el("div", { className: "title-screen__line" }, []),
    el("button", { type: "button", className: "title-start", onclick: () => {
      titleScreen.remove();
      menu.classList.remove("home-menu--hidden");
      menu.classList.add("home-menu--visible");
      window.scrollTo({ top: 0 });
    } }, ["START"]),
    el("p", { className: "title-screen__hint" }, ["MONSTER BATTLE ADVENTURE"]),
  ]);

  return el("div", { className: "screen home-screen" }, [titleScreen, menu]);
}
