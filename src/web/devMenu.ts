/**
 * 開発用のメニュー。開発中の表示にだけ出る。
 *
 * これまで、何かを確かめるたびに手で状態を作っていた。
 * 「装備ダンジョン10階の見た目を見たい」なら、ゴールドを増やし、
 * モンスターを召喚し、育てて、装備を付けて……と何十手もかかる。
 * そのせいで**確認が面倒な場所ほど確認されず**、不具合が残っていた。
 *
 * ここでは状態を一発で作れるようにする。**本番では読み込まれない**
 * (import.meta.env.DEV でしか呼ばれない)。
 */
import { EQUIP_SLOTS, EquipStar, generateEquipment } from "../core/equipment.js";
import { ELEMENTS } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { MONSTER_TEMPLATES, GACHA_EXCLUSIVE_DEX } from "../data/monsters.js";
import { PlayerState, addEquipment, addMonster, addSummonScrolls, equipToMonster } from "../game/playerState.js";
import { el } from "./dom.js";

export interface DevMenuHooks {
  player: PlayerState;
  save: () => void;
  render: () => void;
}

/** 所持金・ダイヤ・召喚の書を潤沢にする */
function grantCurrency(player: PlayerState): void {
  player.gold += 10_000_000;
  player.crystal += 100_000;
  addSummonScrolls(player, 100);
}

/** 通常モンスターを全種類・全属性、指定の星で配る */
function grantAllMonsters(player: PlayerState, star: Star, level: number): void {
  for (const template of MONSTER_TEMPLATES) {
    for (const element of ELEMENTS) {
      addMonster(player, `${template.templateId}_${element}`, star, level);
    }
  }
}

/** ガチャ限定の高レアも配る。終盤の編成を確かめる時に要る */
function grantGachaMonsters(player: PlayerState, star: Star, level: number): void {
  for (const dex of GACHA_EXCLUSIVE_DEX) {
    addMonster(player, dex.id, star, level);
  }
}

/**
 * 手持ち全員に指定の星の装備をフルで着ける。
 * 装備を1個ずつ選ぶ手間が、終盤の確認をいちばん重くしていた。
 */
function equipEveryone(player: PlayerState, star: EquipStar, subStatCount: number): void {
  for (const monster of player.monsters) {
    for (const slot of EQUIP_SLOTS) {
      const eq = generateEquipment({ slot, star, subStatCount });
      addEquipment(player, eq);
      equipToMonster(player, monster.id, eq.id);
    }
  }
}

interface DevAction {
  label: string;
  run: (player: PlayerState) => void;
}

const ACTIONS: DevAction[] = [
  { label: "資源を盛る", run: grantCurrency },
  { label: "通常★1を全種", run: (p) => grantAllMonsters(p, 1, 1) },
  { label: "通常★6Lv60を全種", run: (p) => grantAllMonsters(p, 6, 60) },
  { label: "高レア★6Lv60", run: (p) => grantGachaMonsters(p, 6, 60) },
  { label: "全員に★6装備", run: (p) => equipEveryone(p, 6, 4) },
  { label: "全員に★3装備", run: (p) => equipEveryone(p, 3, 2) },
  {
    label: "スタミナ全回復",
    run: (p) => {
      p.stamina = p.maxStamina;
    },
  },
  {
    label: "ファイターLv50",
    run: (p) => {
      p.fighterLevel = 50;
      p.fighterExp = 0;
    },
  },
  {
    label: "全ステージ解放",
    run: (p) => {
      const ids: string[] = [];
      for (let chapter = 1; chapter <= 4; chapter++) {
        for (let stage = 1; stage <= 5; stage++) ids.push(`${chapter}-${stage}`);
      }
      p.clearedStageIds = ids;
    },
  },
];

/**
 * 画面の隅に出す小さな引き出し。
 * 常に開いていると確認の邪魔になるので、既定では畳んでおく。
 */
export function mountDevMenu(hooks: DevMenuHooks): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(".dev-menu")) return;

  const body = el("div", { className: "dev-menu__body" });
  const panel = el("div", { className: "dev-menu" }, [
    el(
      "button",
      {
        type: "button",
        className: "dev-menu__toggle",
        onclick: () => panel.classList.toggle("dev-menu--open"),
      },
      ["DEV"],
    ),
    body,
  ]);

  for (const action of ACTIONS) {
    body.append(
      el(
        "button",
        {
          type: "button",
          className: "dev-menu__btn",
          onclick: () => {
            action.run(hooks.player);
            hooks.save();
            hooks.render();
          },
        },
        [action.label],
      ),
    );
  }

  body.append(
    el(
      "button",
      {
        type: "button",
        className: "dev-menu__btn dev-menu__btn--danger",
        onclick: () => {
          if (!window.confirm("保存データを消して最初からにします。よろしいですか?")) return;
          localStorage.removeItem("crimon_save_v1");
          location.reload();
        },
      },
      ["データ初期化"],
    ),
  );

  document.body.append(panel);
}
