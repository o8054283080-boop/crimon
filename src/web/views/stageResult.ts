import { Equipment, STAT_LABEL } from "../../core/equipment.js";
import { Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { el } from "../dom.js";
import { buildMonsterCard } from "./monsterCard.js";
import { ResultAction, renderResultActions } from "./resultActions.js";

export interface StageResultLevelUp {
  instanceId: string;
  name: string;
  levels: number;
}

export interface StageResultInfo {
  cleared: boolean;
  stageName: string;
  goldEarned: number;
  crystalEarned: number;
  wavesCleared: number;
  totalWaves: number;
  levelUps: StageResultLevelUp[];
  expAwards?: { instanceId: string; name: string; total: number; maxMemberBonus: number }[];
  dropDexId: string | null;
  dropStar: number | null;
  equipmentDrop: Equipment | null;
  /** 召喚の書がドロップしたか */
  summonScrollDropped?: boolean;
  /** 転生ピッグのボーナスドロップ(通常の一般モンスタードロップとは別枠) */
  pigDrop?: { dexId: string; star: number } | null;
  /** このクリアでファイターレベルが何レベル上がったか */
  fighterLevelsGained?: number;
}

export interface StageResultProps {
  info: StageResultInfo;
  /** 次の行き先。周回で押すのはほぼ「もう一度」なので、それを主役に置く */
  actions: ResultAction[];
}

/** 通貨などの「数が出るだけ」の報酬を、横に並ぶ小さな札で表す */
function rewardTile(icon: string, label: string, amount: string, modifier?: string): HTMLElement {
  return el("div", { className: `reward-tile${modifier ? ` reward-tile--${modifier}` : ""}` }, [
    el("span", { className: "reward-tile__icon" }, [icon]),
    el("span", { className: "reward-tile__amount" }, [amount]),
    el("span", { className: "reward-tile__label" }, [label]),
  ]);
}

/** 装備ドロップの札。スロット・星・主効果を1枚にまとめる */
function equipmentTile(equipment: Equipment): HTMLElement {
  return el("div", { className: "reward-drop" }, [
    el("div", { className: "reward-drop__art reward-drop__art--gear" }, [
      el("span", { className: "reward-drop__emoji" }, ["⚔"]),
      el("span", { className: "reward-drop__stars" }, ["★".repeat(equipment.star)]),
    ]),
    el("div", { className: "reward-drop__name" }, [`スロット${equipment.slot}`]),
    el("div", { className: "reward-drop__meta" }, [STAT_LABEL[equipment.mainStat.type]]),
  ]);
}

export function renderStageResult(props: StageResultProps): HTMLElement {
  const { info } = props;
  const dropDex = info.dropDexId ? findMonsterById(info.dropDexId) : undefined;
  const pigDex = info.pigDrop ? findMonsterById(info.pigDrop.dexId) : undefined;

  // --- 数で表せる報酬は札にして横並びにする ---
  const tiles: HTMLElement[] = [];
  if (info.goldEarned > 0) tiles.push(rewardTile("🪙", "ゴールド", `+${info.goldEarned}`, "gold"));
  if (info.crystalEarned > 0) tiles.push(rewardTile("💎", "ダイヤ", `+${info.crystalEarned}`, "crystal"));
  if (info.summonScrollDropped) tiles.push(rewardTile("📜", "召喚の書", "+1", "scroll"));
  if (info.fighterLevelsGained && info.fighterLevelsGained > 0) {
    tiles.push(rewardTile("🎖", "ファイター", `Lv+${info.fighterLevelsGained}`, "fighter"));
  }

  // --- 現物のドロップは、一覧と同じカードで見せる ---
  const drops: HTMLElement[] = [];
  if (dropDex && info.dropStar) {
    drops.push(
      el("div", { className: "reward-drop" }, [
        buildMonsterCard(dropDex, dropDex.id, () => {}, { star: info.dropStar as Star }),
        el("div", { className: "reward-drop__tag" }, ["モンスター"]),
      ]),
    );
  }
  if (pigDex && info.pigDrop) {
    drops.push(
      el("div", { className: "reward-drop" }, [
        buildMonsterCard(pigDex, pigDex.id, () => {}, { star: info.pigDrop.star as Star }),
        el("div", { className: "reward-drop__tag reward-drop__tag--bonus" }, ["ボーナス"]),
      ]),
    );
  }
  if (info.equipmentDrop) {
    drops.push(
      el("div", { className: "reward-drop" }, [equipmentTile(info.equipmentDrop), el("div", { className: "reward-drop__tag" }, ["装備"])]),
    );
  }

  const levelUpLine =
    info.levelUps.length > 0
      ? el(
          "div",
          { className: "result-levelups" },
          info.levelUps.map((l) => el("span", { className: "result-levelups__item" }, [`${l.name} Lv+${l.levels}`])),
        )
      : null;
  const expLine = info.expAwards && info.expAwards.length > 0
    ? el("div", { className: "result-levelups" }, info.expAwards.map((award) => el("span", { className: "result-levelups__item" }, [
        `${award.name} +${award.total.toLocaleString()} EXP${award.maxMemberBonus > 0 ? `（MAXメンバー分 +${award.maxMemberBonus.toLocaleString()}）` : ""}`,
      ])))
    : null;

  const body: (HTMLElement | null)[] = [
    tiles.length > 0 ? el("div", { className: "reward-tiles" }, tiles) : null,
    drops.length > 0 ? el("div", { className: "reward-drops" }, drops) : null,
    expLine,
    levelUpLine,
    tiles.length === 0 && drops.length === 0 && !levelUpLine
      ? el("p", { className: "result-empty" }, ["獲得したものはありません"])
      : null,
  ];

  return el("div", { className: `screen result-screen${info.cleared ? " result-screen--win" : " result-screen--lose"}` }, [
    el("div", { className: "result-banner-large" }, [
      el("span", { className: "result-banner-large__text" }, [info.cleared ? "VICTORY" : "DEFEAT"]),
      el("span", { className: "result-banner-large__sub" }, [
        `${info.stageName} ・ ${info.wavesCleared}/${info.totalWaves} ウェーブ`,
      ]),
    ]),
    el("div", { className: "result-body" }, body.filter((n): n is HTMLElement => n !== null)),
    renderResultActions(props.actions),
  ]);
}
