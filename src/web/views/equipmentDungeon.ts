import { EquipStar, SET_LABEL } from "../../core/equipment.js";
import { CYCLE_ELEMENTS, Element, ELEMENT_COLOR, ELEMENT_JA, getElementAffinity } from "../../core/element.js";
import { DUNGEON_STAMINA_COST } from "../../core/fighterLevel.js";
import { BEAST_DUNGEON_FLOORS, DungeonEnemy, DungeonFloor, EQUIPMENT_DUNGEON_FLOORS, EquipmentDungeonKind, REINCARNATION_PIG_LOW_TIER_MAX_FLOOR } from "../../data/equipmentDungeon.js";
import { findMonster } from "../../data/monsters.js";
import { getDungeonParty, isDungeonFloorCleared, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { renderAutoFarmPanel } from "./autoFarmPanel.js";
import { referenceRunTime } from "../../game/manualClearTimes.js";
import { renderDungeonIntro, renderFloorGrid } from "./dungeonList.js";

export interface EquipmentDungeonProps {
  player: PlayerState;
  selectedFloor: number | null;
  selectedKind: EquipmentDungeonKind;
  onSelectFloor: (kind: EquipmentDungeonKind, floor: number | null) => void;
  onStartFloor: (floor: DungeonFloor) => void;
  onGoDungeonParty: () => void;
  autoFarmCount: number;
  onChangeAutoFarmCount: (count: number) => void;
  onAutoFarm: (floor: DungeonFloor, count: number) => void;
}

function starLabel(star: EquipStar): string {
  return "★".repeat(star);
}

function maxStarForFloor(floor: DungeonFloor): EquipStar {
  return floor.floor <= 3 ? 4 : floor.floor <= 6 ? 5 : 6;
}

/** その階層の敵は全員この属性で統一されている(弱点属性を突きやすくするため) */
function floorElement(floor: DungeonFloor): Element {
  return floor.enemies[0].element;
}

/** floorElementに対して有利(弱点を突ける)属性を返す */
function counterElement(element: Element): Element | null {
  return CYCLE_ELEMENTS.find((e) => getElementAffinity(e, element) === "ADVANTAGE") ?? null;
}

function enemyDisplayName(enemy: DungeonEnemy): string {
  return findMonster(enemy.templateId, enemy.element)?.name ?? enemy.templateId;
}

function floorTiles(props: EquipmentDungeonProps, floors: readonly DungeonFloor[]) {
  return floors.map((floor) => {
    const element = floorElement(floor);
    const unlocked = floor.kind === "DEMON" || floor.floor === 1 || isDungeonFloorCleared(props.player, floor.floor - 1, floor.kind);
    return {
      badge: `${floor.floor}F`,
      title: unlocked ? `${ELEMENT_JA[element]}の階` : "未開放",
      color: ELEMENT_COLOR[element],
      chips: unlocked ? [`最高 ${starLabel(maxStarForFloor(floor))}`, `🪙${floor.goldReward.toLocaleString("ja-JP")}`] : ["前の階をクリア"],
      disabled: !unlocked,
      onClick: () => props.onSelectFloor(floor.kind, floor.floor),
    };
  });
}

function setNames(floors: readonly DungeonFloor[]): string {
  return floors[0].setPool.map((set) => SET_LABEL[set]).join("・");
}

function renderList(props: EquipmentDungeonProps): HTMLElement {

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["装備ダンジョン"]),
      el("span", { className: "head-note" }, [`⚡${props.player.stamina}/${props.player.maxStamina}`]),
    ]),
    renderDungeonIntro(
      "階層が上がるほど高い星の装備が出ます。敵は階ごとに1属性で揃っているので、弱点を突ける子で挑むと楽になります。",
      ["1〜3階 ★4まで", "4〜6階 ★5まで", "7〜10階 ★6まで"],
      "⚠ 最上級コンテンツです。★5装備を6箇所すべてに着けた★5モンスターでなければ1階の突破も困難です。",
    ),
    el("section", { className: "panel" }, [
      el(
        "button",
        { type: "button", className: "btn btn--ghost btn--large", onclick: props.onGoDungeonParty },
        [`🧑‍🤝‍🧑 ダンジョン専用パーティ編成 (${getDungeonParty(props.player).length}/5)`],
      ),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["魔人のダンジョン"]),
      el("p", { className: "app-subtitle" }, [`ドロップ: ${setNames(EQUIPMENT_DUNGEON_FLOORS)}`]),
      renderFloorGrid(floorTiles(props, EQUIPMENT_DUNGEON_FLOORS)),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["魔獣のダンジョン"]),
      el("p", { className: "app-subtitle" }, [`ドロップ: ${setNames(BEAST_DUNGEON_FLOORS)}`]),
      el("p", { className: "app-subtitle" }, ["古代の魔獣と2体のお供に挑む高難度ダンジョン。ボスを倒すと勝利です。"]),
      renderFloorGrid(floorTiles(props, BEAST_DUNGEON_FLOORS)),
    ]),
  ]);
}

function renderDetail(props: EquipmentDungeonProps, floor: DungeonFloor): HTMLElement {
  const party = getDungeonParty(props.player);
  const hasEnoughStamina = props.player.stamina >= DUNGEON_STAMINA_COST;
  const canChallenge = party.length > 0 && hasEnoughStamina;

  const enemyTags = floor.enemies.map((e) =>
    el("span", { className: "enemy-tag" + (e.isBoss ? " enemy-tag--boss" : "") }, [
      `${e.isBoss ? "👑 " : ""}${enemyDisplayName(e)}★${e.star}Lv${e.level}${e.isBoss ? " 【BOSS】" : ""}`,
    ]),
  );

  const element = floorElement(floor);
  const counter = counterElement(element);
  const recommendedGear = floor.floor <= 5 ? "★5装備(サブ4個推奨)" : "★6装備推奨";
  const pigStar = floor.floor <= REINCARNATION_PIG_LOW_TIER_MAX_FLOOR ? 2 : 3;
  const bonusNotes = [
    "クリアすると装備が1個確定でドロップします(サブステータス数は星が高いほど付きやすくなります)。",
    "低確率で「召喚の書」もドロップします。",
    `低確率で転生ピッグ★${pigStar}(ランクアップ素材専用モンスター)もドロップします。`,
  ];

  const blockers = [
    party.length === 0 ? "ダンジョン専用パーティが編成されていません" : null,
    !hasEnoughStamina ? `スタミナが足りません(⚡${DUNGEON_STAMINA_COST}必要)` : null,
  ].filter((t): t is string => t !== null);

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, [floor.name]),
      el("button", { type: "button", className: "btn btn--ghost head-action", onclick: () => props.onSelectFloor(floor.kind, null) }, ["◀ 階層"]),
    ]),

    // 挑戦の入口を最初に置く。情報を読み終えないと挑めない並びだと、
    // 2回目以降の周回で毎回スクロールさせることになる
    el(
      "section",
      { className: "panel challenge-panel" },
      ([
        blockers.length > 0 ? el("p", { className: "challenge-panel__warn" }, [blockers.join(" / ")]) : null,
        el(
          "button",
          {
            type: "button",
            className: "btn btn--primary btn--large challenge-panel__go",
            disabled: !canChallenge,
            onclick: () => props.onStartFloor(floor),
          },
          [`⚔ 挑戦する (⚡${DUNGEON_STAMINA_COST})`],
        ),
      ] as (HTMLElement | null)[]).filter((n): n is HTMLElement => n !== null),
    ),

    isDungeonFloorCleared(props.player, floor.floor, floor.kind) ? renderAutoFarmPanel({
      ...(() => { const timing = referenceRunTime(props.player.recentManualClearTimes, "EQUIP_DUNGEON", `${floor.kind}:${floor.floor}`); return { referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual, recentManualClearTimes: timing.recent }; })(),
      count: props.autoFarmCount,
      onChangeCount: props.onChangeAutoFarmCount,
      staminaCost: DUNGEON_STAMINA_COST,
      stamina: props.player.stamina,
      disabled: !canChallenge,
      onStart: () => props.onAutoFarm(floor, props.autoFarmCount),
    }) : el("p", { className: "app-subtitle" }, ["バックグラウンド周回は、この階を一度クリアすると解放されます。"]),

    el(
      "section",
      { className: "panel" },
      (
        [
          el("h2", {}, ["出現する敵"]),
          el("div", { className: "wave-row__enemies" }, enemyTags),
          el("p", { className: "app-subtitle" }, [`推奨装備目安: ${recommendedGear} / モンスター★5`]),
          counter
            ? el("p", { className: "app-subtitle equip-dungeon__hint" }, [
                `💡 この階層の敵は全員「${ELEMENT_JA[element]}」属性です。弱点である「${ELEMENT_JA[counter]}」属性のモンスターで挑むと有利に戦えます。`,
              ])
            : null,
        ] as (HTMLElement | null)[]
      ).filter((n): n is HTMLElement => n !== null),
    ),
    el("section", { className: "panel" }, [
      el("h2", {}, ["報酬"]),
      el("p", { className: "app-subtitle" }, [`装備セット: ${floor.setPool.map((set) => SET_LABEL[set]).join("・")}（種類は毎回ランダム）`]),
      ...bonusNotes.map((note) => el("p", { className: "app-subtitle" }, [note])),
      el("p", {}, [`🪙 クリア報酬ゴールド: ${floor.goldReward}`]),
    ]),
    el("section", { className: "panel" }, [
      el("p", { className: "app-subtitle" }, [`ダンジョン専用パーティ: ${party.length}/5体`]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoDungeonParty }, ["編成を変更する"]),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectFloor(floor.kind, null) }, ["◀ 階層選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderEquipmentDungeon(props: EquipmentDungeonProps): HTMLElement {
  const floors = props.selectedKind === "BEAST" ? BEAST_DUNGEON_FLOORS : EQUIPMENT_DUNGEON_FLOORS;
  const floor = props.selectedFloor ? floors.find((f) => f.floor === props.selectedFloor) : undefined;
  if (floor) return renderDetail(props, floor);
  return renderList(props);
}
