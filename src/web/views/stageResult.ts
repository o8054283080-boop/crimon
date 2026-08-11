import { Equipment, STAT_LABEL } from "../../core/equipment.js";
import { findMonsterById } from "../../data/monsters.js";
import { el } from "../dom.js";

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
  onClose: () => void;
}

export function renderStageResult(props: StageResultProps): HTMLElement {
  const { info, onClose } = props;
  const dropDex = info.dropDexId ? findMonsterById(info.dropDexId) : undefined;
  const pigDex = info.pigDrop ? findMonsterById(info.pigDrop.dexId) : undefined;

  const summaryChildren: (HTMLElement | null)[] = [
    el("p", {}, [`🪙 獲得ゴールド: ${info.goldEarned}`]),
    info.crystalEarned > 0 ? el("p", {}, [`💎 獲得ダイヤ: ${info.crystalEarned}`]) : null,
    info.fighterLevelsGained && info.fighterLevelsGained > 0
      ? el("p", {}, [`🎖 ファイターレベルが+${info.fighterLevelsGained}上がりました！(スタミナ全回復・上限アップ)`])
      : null,
    info.levelUps.length > 0
      ? el(
          "div",
          {},
          info.levelUps.map((l) => el("p", {}, [`⬆ ${l.name} が Lv+${l.levels} しました！`])),
        )
      : el("p", { className: "app-subtitle" }, ["レベルアップしたモンスターはいません"]),
  ];

  return el("div", { className: "screen stage-result-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, [info.cleared ? "🎉 ステージクリア！" : "💀 全滅…"]),
      el("p", { className: "app-subtitle" }, [`${info.stageName} (${info.wavesCleared}/${info.totalWaves} ウェーブクリア)`]),
    ]),
    el("section", { className: "panel" }, summaryChildren.filter((n): n is HTMLElement => n !== null)),
    dropDex && info.dropStar
      ? el("section", { className: "panel" }, [
          el("h2", {}, ["モンスタードロップ！"]),
          el("div", { className: "summon-card summon-card--rare" }, [
            el("div", { className: "summon-card__avatar", style: `background:${dropDex.color}` }, []),
            el("div", { className: "summon-card__name" }, [dropDex.name]),
            el("div", { className: "summon-card__star" }, ["★".repeat(info.dropStar)]),
          ]),
        ])
      : null,
    pigDex && info.pigDrop
      ? el("section", { className: "panel" }, [
          el("h2", {}, ["🐷 ボーナスモンスターを入手！"]),
          el("div", { className: "summon-card summon-card--rare" }, [
            el("div", { className: "summon-card__avatar", style: `background:${pigDex.color}` }, []),
            el("div", { className: "summon-card__name" }, [pigDex.name]),
            el("div", { className: "summon-card__star" }, ["★".repeat(info.pigDrop.star)]),
          ]),
        ])
      : null,
    info.summonScrollDropped
      ? el("section", { className: "panel" }, [el("h2", {}, ["召喚の書を入手！"]), el("p", {}, ["📜 召喚画面から消費して1回分の召喚ができます。"])])
      : null,
    info.equipmentDrop
      ? el("section", { className: "panel" }, [
          el("h2", {}, ["装備ドロップ！"]),
          el("div", { className: "summon-card summon-card--rare" }, [
            el("div", { className: "summon-card__name" }, [`スロット${info.equipmentDrop.slot}`]),
            el("div", { className: "summon-card__star" }, ["★".repeat(info.equipmentDrop.star)]),
            el("div", { className: "summon-card__name" }, [STAT_LABEL[info.equipmentDrop.mainStat.type]]),
            info.equipmentDrop.subStats.length > 0
              ? el("div", { className: "summon-card__name" }, [`サブ${info.equipmentDrop.subStats.length}個`])
              : null,
          ].filter((n): n is HTMLDivElement => n !== null)),
        ])
      : null,
    el("button", { type: "button", className: "btn btn--primary btn--large", onclick: onClose }, ["ホームに戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}
