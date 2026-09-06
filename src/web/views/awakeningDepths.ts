import "../ui/awakeningDepths.css";
import { AWAKENING_DEPTH_FLOORS, AwakeningDepthFloor } from "../../data/awakeningDepths.js";
import { getParty, PlayerState } from "../../game/playerState.js";
import {
  MATERIAL_EXCHANGES, isAwakeningDepthCleared, isAwakeningDepthUnlocked, materialCount,
} from "../../game/awakeningDepths.js";
import { el } from "../dom.js";
import { renderAutoFarmPanel } from "./autoFarmPanel.js";
import { renderDungeonIntro, renderFloorGrid } from "./dungeonList.js";
import { referenceRunTime } from "../../game/manualClearTimes.js";

/**
 * 目覚の深域の画面。
 *
 * 階層の一覧 → 1つ選ぶと中身と挑戦。装備ダンジョンやゴールドダンジョンと
 * 同じ形にしてあるので、**初めて見ても迷わない。**
 *
 * ## 素材の持ち数を常に出す
 *
 * 深域は「あと何個で1pt解放できるか」を数えながら回る場所なので、
 * 持ち数が見えないと**何周すればいいのか分からない**まま回ることになる。
 * 一覧にも詳細にも同じ帯を出す。
 */

export interface AwakeningDepthProps {
  player: PlayerState;
  selectedFloor: number | null;
  onSelectFloor: (floor: number | null) => void;
  onStartFloor: (floor: AwakeningDepthFloor) => void;
  onGoParty: () => void;
  onExchange: (id: string) => void;
  autoFarmCount: number;
  onChangeAutoFarmCount: (count: number) => void;
  onAutoFarm: (floor: AwakeningDepthFloor, count: number) => void;
}

/** 素材の持ち数の帯。**同じ形を一覧と詳細の両方に出す** */
export function renderMaterialBar(player: PlayerState): HTMLElement {
  return el("div", { className: "depth-materials" }, [
    materialChip("🔹", "目覚の欠片", materialCount(player, "shards")),
    materialChip("💠", "目覚の結晶", materialCount(player, "crystals")),
    materialChip("🌟", "目覚の奇石", materialCount(player, "stones")),
  ]);
}

function materialChip(emoji: string, name: string, count: number): HTMLElement {
  return el("div", { className: "depth-material" }, [
    el("span", { className: "depth-material__icon" }, [emoji]),
    el("span", { className: "depth-material__name" }, [name]),
    el("span", { className: "depth-material__count" }, [count.toLocaleString("ja-JP")]),
  ]);
}

function dropText(floor: AwakeningDepthFloor): string {
  const range = ([min, max]: readonly [number, number]): string => (min === max ? `${min}` : `${min}〜${max}`);
  const parts = [`欠片 ${range(floor.drop.shards)}`];
  if (floor.drop.crystals[1] > 0) parts.push(`結晶 ${range(floor.drop.crystals)}`);
  // **確率の数字は出さない。**出るか出ないかだけを伝える
  if (floor.drop.stoneChance > 0) parts.push("奇石 まれに");
  return parts.join(" / ");
}

function renderList(props: AwakeningDepthProps): HTMLElement {
  const tiles = AWAKENING_DEPTH_FLOORS.map((floor) => {
    const unlocked = isAwakeningDepthUnlocked(props.player, floor.floor);
    const cleared = isAwakeningDepthCleared(props.player, floor.floor);
    return {
      badge: `${floor.floor}F`,
      title: unlocked ? `⚡${floor.stamina}` : "未開放",
      color: unlocked ? "#7fb2ff" : "#4a5372",
      chips: unlocked
        ? [dropText(floor), cleared ? "クリア済み" : "初回報酬あり"]
        : [`${floor.floor - 1}階をクリアで開放`],
      onClick: () => props.onSelectFloor(floor.floor),
      disabled: !unlocked,
    };
  });

  return el("div", { className: "screen stages-screen depth-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["目覚の深域"]),
    ]),
    renderDungeonIntro(
      "才能覚醒の素材を集める場所です。上の階ほど多く落ちますが、"
      + "5階からは同じ相手で殴り続けるほどダメージが通らなくなる「才能適応」が働きます。",
      ["1階から順に開放", "★6でなくても挑めます"],
    ),
    renderMaterialBar(props.player),
    renderFloorGrid(tiles),
    renderExchange(props),
  ]);
}

/**
 * 素材の交換。**深域の画面の中に置く。**
 *
 * 別の画面へ移すと「余りをどうするか」を考える場所と
 * 「集める場所」が離れてしまう。ここで見せれば、
 * 回りながら「あと少しで結晶に替えられる」と分かる。
 */
function renderExchange(props: AwakeningDepthProps): HTMLElement {
  const rows = MATERIAL_EXCHANGES.map((def) => {
    const have = materialCount(props.player, def.from.kind);
    const enough = have >= def.from.count;
    return el("div", { className: "depth-exchange__row" }, [
      el("div", { className: "depth-exchange__text" }, [
        el("div", { className: "depth-exchange__name" }, [def.name]),
        /*
         * **何個で何個になるかを必ず出す。**名前だけでは
         * 「余ったら替えられる」しか分からず、あと何個貯めるかが読めない。
         * 手持ちを添えて、押せない時の「あと◯個」と数が噛み合うようにする。
         */
        el("div", { className: "depth-exchange__rate" }, [
          `${def.from.count.toLocaleString("ja-JP")}個 → ${def.to.count.toLocaleString("ja-JP")}個`,
          el("span", { className: "depth-exchange__have" }, [`手持ち ${have.toLocaleString("ja-JP")}`]),
        ]),
        el("div", { className: "depth-exchange__note" }, [def.description.replace(/\*\*/g, "")]),
      ]),
      el(
        "button",
        {
          type: "button",
          className: `btn btn--ghost depth-exchange__btn${enough ? "" : " depth-exchange__btn--short"}`,
          disabled: !enough,
          onclick: () => props.onExchange(def.id),
        },
        [enough ? "交換" : `あと${(def.from.count - have).toLocaleString("ja-JP")}`],
      ),
    ]);
  });
  return el("section", { className: "card depth-exchange" }, [
    el("h2", { className: "depth-exchange__title" }, ["素材の交換"]),
    ...rows,
  ]);
}

function renderDetail(props: AwakeningDepthProps, floor: AwakeningDepthFloor): HTMLElement {
  const party = getParty(props.player);
  const hasStamina = props.player.stamina >= floor.stamina;
  const canChallenge = party.length > 0 && hasStamina;
  const firstClear = !isAwakeningDepthCleared(props.player, floor.floor);

  const blockers = [
    party.length === 0 ? "パーティにモンスターを編成してください" : null,
    hasStamina ? null : `スタミナが足りません(⚡${floor.stamina}必要)`,
  ].filter((v): v is string => v !== null);

  const enemyTags = floor.enemies.map((e) =>
    el("span", { className: "enemy-tag" }, [e.displayName ?? e.templateId]),
  );

  return el("div", { className: "screen stages-screen depth-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => props.onSelectFloor(null) }, ["◀ 階層選択に戻る"]),
      el("h1", {}, [`${floor.floor}階`]),
    ]),
    renderMaterialBar(props.player),
    el("section", { className: "card depth-detail" }, [
      el("p", { className: "depth-detail__note" }, [floor.note.replace(/\*\*/g, "")]),
      el("div", { className: "depth-detail__row" }, [
        el("span", { className: "depth-detail__label" }, ["敵"]),
        el("div", { className: "enemy-tags" }, enemyTags),
      ]),
      el("div", { className: "depth-detail__row" }, [
        el("span", { className: "depth-detail__label" }, ["ドロップ"]),
        el("span", {}, [dropText(floor)]),
      ]),
      firstClear
        ? el("div", { className: "depth-detail__row depth-detail__row--first" }, [
            el("span", { className: "depth-detail__label" }, ["初回報酬"]),
            el("span", {}, [
              [
                `欠片 ×${floor.firstClear.shards}`,
                floor.firstClear.crystals > 0 ? `結晶 ×${floor.firstClear.crystals}` : null,
                floor.firstClear.stones > 0 ? `奇石 ×${floor.firstClear.stones}` : null,
              ].filter(Boolean).join(" / "),
            ]),
          ])
        : null,
      el("div", { className: "depth-detail__row" }, [
        el("span", { className: "depth-detail__label" }, ["消費"]),
        el("span", {}, [`⚡${floor.stamina}`]),
      ]),
    ].filter((node) => node !== null) as HTMLElement[]),
    ...blockers.map((text) => el("p", { className: "warn-text" }, [text])),
    el("div", { className: "stage-actions" }, [
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoParty }, ["編成を変更する"]),
      el(
        "button",
        { type: "button", className: "btn btn--primary", disabled: !canChallenge, onclick: () => props.onStartFloor(floor) },
        [`⚔ 挑戦する (⚡${floor.stamina})`],
      ),
    ]),
    /*
     * バックグラウンド周回は**一度クリアした階だけ。**
     * 勝てるか分からない階を放置で回させると、
     * スタミナだけが消えて何も残らない。
     */
    isAwakeningDepthCleared(props.player, floor.floor)
      ? renderAutoFarmPanel({
          ...(() => {
            const timing = referenceRunTime(props.player.recentManualClearTimes, "AWAKENING_DEPTH", String(floor.floor));
            return { referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual, recentManualClearTimes: timing.recent };
          })(),
          count: props.autoFarmCount,
          onChangeCount: props.onChangeAutoFarmCount,
          staminaCost: floor.stamina,
          stamina: props.player.stamina,
          disabled: !canChallenge,
          onStart: () => props.onAutoFarm(floor, props.autoFarmCount),
        })
      : el("p", { className: "app-subtitle" }, ["バックグラウンド周回は、この階を一度クリアすると解放されます。"]),
  ]);
}

export function renderAwakeningDepths(props: AwakeningDepthProps): HTMLElement {
  const floor = props.selectedFloor !== null
    ? AWAKENING_DEPTH_FLOORS.find((f) => f.floor === props.selectedFloor)
    : undefined;
  return floor ? renderDetail(props, floor) : renderList(props);
}
