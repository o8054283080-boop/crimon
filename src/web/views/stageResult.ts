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
  wavesCleared: number;
  totalWaves: number;
  levelUps: StageResultLevelUp[];
  dropDexId: string | null;
  dropStar: number | null;
  equipmentDrop: Equipment | null;
}

export interface StageResultProps {
  info: StageResultInfo;
  onClose: () => void;
}

export function renderStageResult(props: StageResultProps): HTMLElement {
  const { info, onClose } = props;
  const dropDex = info.dropDexId ? findMonsterById(info.dropDexId) : undefined;

  return el("div", { className: "screen stage-result-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, [info.cleared ? "🎉 ステージクリア！" : "💀 全滅…"]),
      el("p", { className: "app-subtitle" }, [`${info.stageName} (${info.wavesCleared}/${info.totalWaves} ウェーブクリア)`]),
    ]),
    el("section", { className: "panel" }, [
      el("p", {}, [`🪙 獲得ゴールド: ${info.goldEarned}`]),
      info.levelUps.length > 0
        ? el(
            "div",
            {},
            info.levelUps.map((l) => el("p", {}, [`⬆ ${l.name} が Lv+${l.levels} しました！`])),
          )
        : el("p", { className: "app-subtitle" }, ["レベルアップしたモンスターはいません"]),
    ]),
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
