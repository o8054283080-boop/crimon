import { EquipStar, getDungeonFloorDropRates } from "../../core/equipment.js";
import { ELEMENT_JA } from "../../core/element.js";
import { DungeonFloor, EQUIPMENT_DUNGEON_FLOORS } from "../../data/equipmentDungeon.js";
import { getParty, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface EquipmentDungeonProps {
  player: PlayerState;
  selectedFloor: number | null;
  onSelectFloor: (floor: number | null) => void;
  onStartFloor: (floor: DungeonFloor) => void;
}

function starLabel(star: EquipStar): string {
  return "★".repeat(star);
}

function renderList(props: EquipmentDungeonProps): HTMLElement {
  const cards = EQUIPMENT_DUNGEON_FLOORS.map((floor) => {
    const rates = getDungeonFloorDropRates(floor.floor);
    const topRate = rates[rates.length - 1];
    return el(
      "button",
      { type: "button", className: "stage-card", onclick: () => props.onSelectFloor(floor.floor) },
      [
        el("div", { className: "stage-card__name" }, [floor.name]),
        el("div", { className: "stage-card__meta" }, [`最高レア: ${starLabel(topRate.star)} (${topRate.percent}%)`]),
      ],
    );
  });

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["装備ダンジョン"]),
      el("p", { className: "app-subtitle" }, [
        "1〜3階は星4まで、4〜6階は星5まで、7〜10階は星6までの装備が出現します。階層が上がるほど高レアリティが出やすくなります。",
      ]),
      el("p", { className: "app-subtitle equip-dungeon__warning" }, [
        "⚠ 最上級コンテンツです。星5の装備を6箇所すべてに装着した星5モンスターでなければ1階すら突破は困難です。",
      ]),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "stage-list" }, cards)]),
  ]);
}

function renderDetail(props: EquipmentDungeonProps, floor: DungeonFloor): HTMLElement {
  const party = getParty(props.player);
  const canChallenge = party.length > 0;
  const rates = getDungeonFloorDropRates(floor.floor);

  const enemyTags = floor.enemies.map((e) =>
    el("span", { className: "enemy-tag" }, [`${e.templateId}[${ELEMENT_JA[e.element]}]★${e.star}Lv${e.level}`]),
  );

  const rateRows = rates.map((r) =>
    el("div", { className: "wave-row" }, [
      el("div", { className: "wave-row__title" }, [starLabel(r.star)]),
      el("div", { className: "wave-row__enemies" }, [`${r.percent}%`]),
    ]),
  );

  const recommendedGear = floor.floor <= 5 ? "★5装備(サブ4個推奨)" : "★6装備推奨";

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [floor.name])]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["出現する敵"]),
      el("div", { className: "wave-row__enemies" }, enemyTags),
      el("p", { className: "app-subtitle" }, [`推奨装備目安: ${recommendedGear} / モンスター★5`]),
    ]),
    el("section", { className: "panel" }, [
      el("h2", {}, ["装備ドロップ率(星ランク別)"]),
      el("div", { className: "wave-rows" }, rateRows),
      el("p", { className: "app-subtitle" }, ["クリアすると装備が1個確定でドロップします(サブステータス数は星が高いほど付きやすくなります)。"]),
    ]),
    el("section", { className: "panel" }, [el("p", {}, [`🪙 クリア報酬ゴールド: ${floor.goldReward}`])]),
    !canChallenge ? el("p", { className: "app-subtitle" }, ["パーティが編成されていません。先にパーティを編成してください。"]) : null,
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canChallenge, onclick: () => props.onStartFloor(floor) },
      ["⚔ 挑戦する"],
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectFloor(null) }, ["◀ 階層選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderEquipmentDungeon(props: EquipmentDungeonProps): HTMLElement {
  const floor = props.selectedFloor ? EQUIPMENT_DUNGEON_FLOORS.find((f) => f.floor === props.selectedFloor) : undefined;
  if (floor) return renderDetail(props, floor);
  return renderList(props);
}
