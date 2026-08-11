import { EquipStar } from "../../core/equipment.js";
import { CYCLE_ELEMENTS, Element, ELEMENT_JA, getElementAffinity } from "../../core/element.js";
import { DUNGEON_STAMINA_COST } from "../../core/fighterLevel.js";
import { DungeonFloor, EQUIPMENT_DUNGEON_FLOORS, REINCARNATION_PIG_LOW_TIER_MAX_FLOOR } from "../../data/equipmentDungeon.js";
import { getDungeonParty, PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

export interface EquipmentDungeonProps {
  player: PlayerState;
  selectedFloor: number | null;
  onSelectFloor: (floor: number | null) => void;
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

function renderList(props: EquipmentDungeonProps): HTMLElement {
  const cards = EQUIPMENT_DUNGEON_FLOORS.map((floor) => {
    return el(
      "button",
      { type: "button", className: "stage-card", onclick: () => props.onSelectFloor(floor.floor) },
      [
        el("div", { className: "stage-card__name" }, [floor.name]),
        el("div", { className: "stage-card__meta" }, [
          `最高レア: ${starLabel(maxStarForFloor(floor))} / 敵属性: ${ELEMENT_JA[floorElement(floor)]}`,
        ]),
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
    el("section", { className: "panel" }, [
      el(
        "button",
        { type: "button", className: "btn btn--ghost btn--large", onclick: props.onGoDungeonParty },
        [`🧑‍🤝‍🧑 ダンジョン専用パーティ編成 (${getDungeonParty(props.player).length}/5)`],
      ),
    ]),
    el("section", { className: "panel" }, [el("div", { className: "stage-list" }, cards)]),
  ]);
}

function renderDetail(props: EquipmentDungeonProps, floor: DungeonFloor): HTMLElement {
  const party = getDungeonParty(props.player);
  const hasEnoughStamina = props.player.stamina >= DUNGEON_STAMINA_COST;
  const canChallenge = party.length > 0 && hasEnoughStamina;

  const enemyTags = floor.enemies.map((e) =>
    el("span", { className: "enemy-tag" }, [`${e.templateId}[${ELEMENT_JA[e.element]}]★${e.star}Lv${e.level}`]),
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

  return el("div", { className: "screen stages-screen" }, [
    el("header", { className: "app-header" }, [el("h1", {}, [floor.name])]),
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
      ...bonusNotes.map((note) => el("p", { className: "app-subtitle" }, [note])),
      el("p", {}, [`🪙 クリア報酬ゴールド: ${floor.goldReward}`]),
    ]),
    el("section", { className: "panel" }, [
      el("p", { className: "app-subtitle" }, [`ダンジョン専用パーティ: ${party.length}/5体`]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoDungeonParty }, ["編成を変更する"]),
    ]),
    party.length === 0 ? el("p", { className: "app-subtitle" }, ["ダンジョン専用パーティが編成されていません。先に編成してください。"]) : null,
    !hasEnoughStamina ? el("p", { className: "app-subtitle" }, ["スタミナが足りません。"]) : null,
    el(
      "button",
      { type: "button", className: "btn btn--primary btn--large", disabled: !canChallenge, onclick: () => props.onStartFloor(floor) },
      [`⚔ 挑戦する (⚡${DUNGEON_STAMINA_COST})`],
    ),
    el("section", { className: "panel auto-farm-panel" }, [
      el("h2", {}, ["🔁 オート周回"]),
      el("p", { className: "app-subtitle" }, ["指定した回数まで自動で挑戦し、スタミナが尽きるか敗北したら中断します。"]),
      el("div", { className: "auto-farm-count-row" }, [
        el("input", {
          type: "number",
          min: "1",
          max: "999",
          value: String(props.autoFarmCount),
          className: "auto-farm-count-input",
          oninput: (e: Event) => {
            const value = Math.max(1, Math.min(999, Number((e.target as HTMLInputElement).value) || 1));
            props.onChangeAutoFarmCount(value);
          },
        }),
        el("span", {}, ["回"]),
      ]),
      el(
        "button",
        {
          type: "button",
          className: "btn btn--primary btn--large",
          disabled: !canChallenge,
          onclick: () => props.onAutoFarm(floor, props.autoFarmCount),
        },
        [`▶ オート周回開始`],
      ),
    ]),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onSelectFloor(null) }, ["◀ 階層選択に戻る"]),
  ].filter((n): n is HTMLElement => n !== null));
}

export function renderEquipmentDungeon(props: EquipmentDungeonProps): HTMLElement {
  const floor = props.selectedFloor ? EQUIPMENT_DUNGEON_FLOORS.find((f) => f.floor === props.selectedFloor) : undefined;
  if (floor) return renderDetail(props, floor);
  return renderList(props);
}
