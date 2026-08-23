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
import { icon, IconName } from "../icons.js";
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
  onGoShop: () => void;
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

/**
 * 上部の身分証。
 *
 * 以前はレベル・EXP・3種の通貨が同じ高さに並んでいて、どれが主でどれが従か
 * 分からなかった。ここでは**レベルを丸で立て、名前を主役に、EXPは帯で見せる**。
 * 数字を読ませるのではなく、伸び具合を目で分かるようにする。
 */
function renderIdentity(player: PlayerState, onEditFighterName: () => void, onOpenSettings: () => void): HTMLElement {
  const isMax = player.fighterLevel >= MAX_FIGHTER_LEVEL;
  const needed = requiredExpForFighterLevel(player.fighterLevel);
  const ratio = isMax ? 1 : Math.max(0, Math.min(1, player.fighterExp / Math.max(1, needed)));

  return el("section", { className: "home-id" }, [
    el("div", { className: "home-id__level" }, [
      el("small", {}, ["Lv"]),
      el("strong", {}, [String(player.fighterLevel)]),
    ]),
    el("div", { className: "home-id__body" }, [
      el("div", { className: "home-id__name" }, [
        el("strong", {}, [player.fighterName]),
        el("button", { type: "button", className: "home-id__edit", onclick: onEditFighterName, title: "名前を変える" }, [
          icon("pencil"),
        ]),
        el("button", { type: "button", className: "home-id__edit home-id__gear", onclick: onOpenSettings, title: "設定" }, [
          icon("settings"),
        ]),
      ]),
      el("div", { className: "home-id__exp" }, [
        el("div", { className: "home-id__bar" }, [
          el("i", { style: `width:${(ratio * 100).toFixed(1)}%` }, []),
        ]),
        el("span", {}, [isMax ? "MAX" : `${player.fighterExp} / ${needed}`]),
      ]),
    ]),
  ]);
}

function currencyChip(name: IconName, value: number, modifier: string): HTMLElement {
  return el("div", { className: `home-wallet__chip home-wallet__chip--${modifier}` }, [
    icon(name),
    el("strong", {}, [value.toLocaleString("ja-JP")]),
  ]);
}

/**
 * スタミナは**1か所にしか出さない。**
 * 以前は上部の通貨欄と下部の欄の2か所にあり、片方だけ見て
 * 「回復したのに増えていない」と誤解する余地があった。
 */
function renderStamina(player: PlayerState, onPartial: () => void, onFull: () => void): HTMLElement {
  const full = player.stamina >= player.maxStamina;
  const ratio = Math.max(0, Math.min(1, player.stamina / Math.max(1, player.maxStamina)));
  return el("section", { className: "home-stamina-bar" }, [
    el("div", { className: "home-stamina-bar__head" }, [
      icon("stamina"),
      el("strong", {}, [`${player.stamina}`]),
      el("span", {}, [`/ ${player.maxStamina}`]),
    ]),
    el("div", { className: "home-stamina-bar__track" }, [el("i", { style: `width:${(ratio * 100).toFixed(1)}%` }, [])]),
    el("div", { className: "home-stamina-bar__actions" }, [
      el(
        "button",
        {
          type: "button",
          className: "btn btn--ghost",
          disabled: full || player.crystal < STAMINA_REFILL_PARTIAL_COST,
          onclick: onPartial,
        },
        [`💎${STAMINA_REFILL_PARTIAL_COST} +${STAMINA_REFILL_PARTIAL_AMOUNT}`],
      ),
      el(
        "button",
        {
          type: "button",
          className: "btn btn--ghost",
          disabled: full || player.crystal < STAMINA_REFILL_FULL_COST,
          onclick: onFull,
        },
        [`💎${STAMINA_REFILL_FULL_COST} 全回復`],
      ),
    ]),
  ]);
}

interface MenuTile {
  name: IconName;
  label: string;
  sub: string;
  onClick: () => void;
}

function renderMenuTile(tile: MenuTile): HTMLElement {
  return el("button", { type: "button", className: "home-tile", onclick: tile.onClick }, [
    el("span", { className: "home-tile__icon" }, [icon(tile.name)]),
    el("span", { className: "home-tile__label" }, [tile.label]),
    el("span", { className: "home-tile__sub" }, [tile.sub]),
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
    onGoShop,
    onRefillStaminaPartial,
    onRefillStaminaFull,
    onEditFighterName,
  } = props;
  const party = getParty(player);
  const hasStarted = sessionStorage.getItem("crimon.started") === "1";

  /**
   * 設定は普段いらないものなので、ホームに出しっぱなしにしない。
   * 音量つまみとデータの書き出しが常に見えていると、
   * 遊ぶための導線と同じ重さで並んでしまう。
   */
  const settingsSheet = el("div", { className: "home-sheet", hidden: true }, [
    el("div", { className: "home-sheet__scrim", onclick: () => closeSettings() }, []),
    el("div", { className: "home-sheet__panel" }, [
      el("div", { className: "home-sheet__head" }, [
        el("strong", {}, ["設定"]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: () => closeSettings() }, ["閉じる"]),
      ]),
      renderAudioSettings(props.audioSettings),
      renderSaveDataPanel(props),
      el("p", { className: "build-id" }, [`版 ${__BUILD_ID__}`]),
    ]),
  ]);
  const closeSettings = () => {
    settingsSheet.hidden = true;
  };
  const openSettings = () => {
    settingsSheet.hidden = false;
  };

  /**
   * 5個を3列に並べると最後の行が欠けて、意味のない空白が残っていた。
   * 数を合わせるより、**性質でまとめた方が探しやすい**。
   * 「増やす」と「鍛える」に分けると、それぞれ2個と3個でちょうど収まる。
   */
  const gather: MenuTile[] = [
    { name: "summon", label: "召喚", sub: "新しい仲間", onClick: onGoSummon },
    { name: "shop", label: "ショップ", sub: "1時間ごとに更新", onClick: onGoShop },
  ];
  const dungeons: MenuTile[] = [
    { name: "equipDungeon", label: "装備", sub: "ダンジョン", onClick: onGoEquipDungeon },
    { name: "trainDungeon", label: "育成", sub: "ダンジョン", onClick: onGoLevelDungeon },
    { name: "goldDungeon", label: "ゴールド", sub: "ダンジョン", onClick: onGoGoldDungeon },
  ];

  const menu = el("div", { className: `home-menu ${hasStarted ? "home-menu--visible" : "home-menu--hidden"}` }, [
    props.compensationClaims.length > 0 ? renderCompensationBanner(props.compensationClaims, props.onDismissCompensation) : null,
    loginBonusResult ? renderLoginBonusBanner(loginBonusResult, onDismissLoginBonus) : null,
    renderIdentity(player, onEditFighterName, openSettings),
    el("section", { className: "home-wallet" }, [
      currencyChip("crystal", player.crystal, "crystal"),
      currencyChip("coin", player.gold, "gold"),
    ]),
    renderStamina(player, onRefillStaminaPartial, onRefillStaminaFull),
    el("section", { className: "home-party-card" }, [
      el("div", { className: "home-section-title" }, [
        el("strong", {}, ["CURRENT PARTY"]),
        el("button", { type: "button", className: "btn btn--ghost", onclick: onGoParty }, ["編成"]),
      ]),
      renderPartySlots(party, 4),
    ]),
    el("button", { type: "button", className: "home-adventure", onclick: onGoStages }, [
      el("span", { className: "home-adventure__icon" }, [icon("adventure")]),
      el("span", { className: "home-adventure__text" }, [el("strong", {}, ["ADVENTURE"]), el("small", {}, ["ステージに挑戦する"])]),
      el("span", { className: "home-adventure__arrow" }, [icon("chevron")]),
    ]),
    el("section", { className: "home-group" }, [
      el("div", { className: "home-group__title" }, ["増やす"]),
      el("div", { className: "home-menu-grid home-menu-grid--2" }, gather.map(renderMenuTile)),
    ]),
    el("section", { className: "home-group" }, [
      el("div", { className: "home-group__title" }, ["鍛える"]),
      el("div", { className: "home-menu-grid" }, dungeons.map(renderMenuTile)),
    ]),
    settingsSheet,
  ].filter((n): n is HTMLElement => n !== null));

  if (hasStarted) return el("div", { className: "screen home-screen home-screen--menu-only" }, [menu]);

  const titleScreen = el("section", { className: "title-screen" }, [
    el("div", { className: "title-screen__logo" }, [
      el("span", {}, ["CREATE"]),
      el("strong", {}, ["MONSTERS"]),
      el("small", {}, ["クリエイトモンスターズ"]),
    ]),
    el("div", { className: "title-screen__line" }, []),
    el("button", { type: "button", className: "title-start", onclick: () => {
      sessionStorage.setItem("crimon.started", "1");
      titleScreen.remove();
      menu.classList.remove("home-menu--hidden");
      menu.classList.add("home-menu--visible");
      window.scrollTo({ top: 0 });
    } }, ["START"]),
    el("p", { className: "title-screen__hint" }, ["MONSTER BATTLE ADVENTURE"]),
  ]);

  return el("div", { className: "screen home-screen" }, [titleScreen, menu]);
}
