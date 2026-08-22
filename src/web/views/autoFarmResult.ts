import { Star } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { AutoFarmResult } from "../../game/autoFarm.js";
import { el } from "../dom.js";
import { buildMonsterCard } from "./monsterCard.js";
import { ResultAction, renderResultActions } from "./resultActions.js";

export interface AutoFarmResultProps {
  result: AutoFarmResult;
  targetName: string;
  /** 次の行き先。同じ場所をもう一度回すのが最も多い操作 */
  actions: ResultAction[];
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

/** 数が出るだけの報酬を、横に並ぶ小さな札で表す(戦闘結果と同じ見せ方) */
function rewardTile(icon: string, label: string, amount: string, modifier?: string): HTMLElement {
  return el("div", { className: `reward-tile${modifier ? ` reward-tile--${modifier}` : ""}` }, [
    el("span", { className: "reward-tile__icon" }, [icon]),
    el("span", { className: "reward-tile__amount" }, [amount]),
    el("span", { className: "reward-tile__label" }, [label]),
  ]);
}

export function renderAutoFarmResult(props: AutoFarmResultProps): HTMLElement {
  const { result, targetName } = props;
  const drops = groupDrops(result);
  const succeeded = result.cleared > 0;

  const tiles: HTMLElement[] = [];
  if (result.totalGold > 0) tiles.push(rewardTile("🪙", "ゴールド", `+${result.totalGold}`, "gold"));
  if (result.totalCrystal > 0) tiles.push(rewardTile("💎", "ダイヤ", `+${result.totalCrystal}`, "crystal"));
  if (result.equipmentDropCount > 0) tiles.push(rewardTile("⚔", "装備", `+${result.equipmentDropCount}`));
  if (result.summonScrollCount > 0) tiles.push(rewardTile("📜", "召喚の書", `+${result.summonScrollCount}`, "scroll"));
  if (result.totalFighterLevels > 0) tiles.push(rewardTile("🎖", "ファイター", `Lv+${result.totalFighterLevels}`, "fighter"));

  // 同じモンスターは1枚にまとめ、枚数を重ねて表示する
  const dropCards = drops.map((drop) => {
    const dex = findMonsterById(drop.dexId);
    return el("div", { className: "reward-drop" }, [
      buildMonsterCard(dex, drop.dexId, () => {}, {
        star: drop.star as Star,
        badge: drop.count > 1 ? `×${drop.count}` : undefined,
      }),
    ]);
  });

  const levelUpLine =
    result.levelUps.length > 0
      ? el(
          "div",
          { className: "result-levelups" },
          result.levelUps.map((l) => el("span", { className: "result-levelups__item" }, [`${l.name} Lv+${l.levels}`])),
        )
      : null;

  const body: (HTMLElement | null)[] = [
    tiles.length > 0 ? el("div", { className: "reward-tiles" }, tiles) : null,
    dropCards.length > 0 ? el("div", { className: "reward-drops" }, dropCards) : null,
    levelUpLine,
    tiles.length === 0 && dropCards.length === 0 && !levelUpLine
      ? el("p", { className: "result-empty" }, ["獲得したものはありません"])
      : null,
  ];

  return el("div", { className: `screen result-screen${succeeded ? " result-screen--win" : " result-screen--lose"}` }, [
    el("div", { className: "result-banner-large" }, [
      el("span", { className: "result-banner-large__text result-banner-large__text--compact" }, ["周回結果"]),
      el("span", { className: "result-banner-large__sub" }, [
        `${targetName} ・ ${result.attempts}回中 ${result.cleared}回クリア`,
      ]),
      el("span", { className: "result-banner-large__note" }, [STOP_REASON_LABEL[result.stopReason]]),
    ]),
    el("div", { className: "result-body" }, body.filter((n): n is HTMLElement => n !== null)),
    renderResultActions(props.actions),
  ]);
}
