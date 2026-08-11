import { findMonsterById } from "../../data/monsters.js";
import { AutoFarmResult } from "../../game/autoFarm.js";
import { el } from "../dom.js";

export interface AutoFarmResultProps {
  result: AutoFarmResult;
  targetName: string;
  onClose: () => void;
}

const STOP_REASON_LABEL: Record<AutoFarmResult["stopReason"], string> = {
  COMPLETED: "指定回数を消化しました",
  STAMINA: "スタミナが尽きたため中断しました",
  DEFEAT: "敗北したため中断しました",
  NO_PARTY: "パーティが編成されていないため中断しました",
  DAILY_LIMIT: "本日の挑戦回数の上限に達したため中断しました",
};

function groupDrops(result: AutoFarmResult): { dexId: string; star: number; count: number }[] {
  const groups = new Map<string, { dexId: string; star: number; count: number }>();
  for (const drop of result.monsterDrops) {
    const key = `${drop.dexId}_${drop.star}`;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { dexId: drop.dexId, star: drop.star, count: 1 });
  }
  return Array.from(groups.values());
}

export function renderAutoFarmResult(props: AutoFarmResultProps): HTMLElement {
  const { result, targetName, onClose } = props;
  const drops = groupDrops(result);

  const summaryChildren: (HTMLElement | null)[] = [
    el("p", {}, [`挑戦回数: ${result.attempts}回中 ${result.cleared}回クリア`]),
    el("p", { className: "app-subtitle" }, [STOP_REASON_LABEL[result.stopReason]]),
    el("p", {}, [`🪙 獲得ゴールド合計: ${result.totalGold}`]),
    result.totalCrystal > 0 ? el("p", {}, [`💎 獲得ダイヤ合計: ${result.totalCrystal}`]) : null,
    result.totalFighterLevels > 0
      ? el("p", {}, [`🎖 ファイターレベルが+${result.totalFighterLevels}上がりました！`])
      : null,
    result.levelUps.length > 0
      ? el(
          "div",
          {},
          result.levelUps.map((l) => el("p", {}, [`⬆ ${l.name} が Lv+${l.levels} しました！`])),
        )
      : el("p", { className: "app-subtitle" }, ["レベルアップしたモンスターはいません"]),
  ];

  return el("div", { className: "screen stage-result-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, [result.cleared > 0 ? "🔁 オート周回結果" : "💀 オート周回失敗"]),
      el("p", { className: "app-subtitle" }, [targetName]),
    ]),
    el("section", { className: "panel" }, summaryChildren.filter((n): n is HTMLElement => n !== null)),
    drops.length > 0
      ? el("section", { className: "panel" }, [
          el("h2", {}, ["モンスタードロップ"]),
          ...drops.map((d) => {
            const dex = findMonsterById(d.dexId);
            return el("div", { className: "summon-card summon-card--rare" }, [
              el("div", { className: "summon-card__avatar", style: dex ? `background:${dex.color}` : undefined }, []),
              el("div", { className: "summon-card__name" }, [`${dex ? dex.name : d.dexId} ×${d.count}`]),
              el("div", { className: "summon-card__star" }, ["★".repeat(d.star)]),
            ]);
          }),
        ])
      : null,
    result.equipmentDropCount > 0
      ? el("section", { className: "panel" }, [el("h2", {}, ["装備ドロップ"]), el("p", {}, [`⚔ ${result.equipmentDropCount}個入手しました`])])
      : null,
    result.summonScrollCount > 0
      ? el("section", { className: "panel" }, [el("h2", {}, ["召喚の書"]), el("p", {}, [`📜 ${result.summonScrollCount}冊入手しました`])])
      : null,
    el("button", { type: "button", className: "btn btn--primary btn--large", onclick: onClose }, ["戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}
