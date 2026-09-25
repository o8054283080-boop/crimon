import "../ui/accessories.css";
import { ACCESSORY_FAMILY_JA, ACCESSORY_RARITY_JA } from "../../core/accessory.js";
import { ANCIENT_CRAFT_COST } from "../../game/ancientCraft.js";
import {
  RUIN_FAMILIES, RUIN_KINDS, RUIN_NAME, type RuinFloor, type RuinKind, ruinFloors, ruinLocationId,
} from "../../data/ruins.js";
import { isRuinFloorCleared, isRuinFloorUnlocked } from "../../game/ruins.js";
import { referenceRunTime } from "../../game/manualClearTimes.js";
import { MAX_DUNGEON_PARTY_SIZE, getDungeonParty, type PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";
import { buildDungeonEnemyTeam } from "../../game/dungeonRunner.js";
import { applyPortrait } from "../three/portrait.js";
import { autoFarmPotionProps, renderAutoFarmPanel } from "./autoFarmPanel.js";
import { renderDungeonIntro, renderFloorGrid } from "./dungeonList.js";
import { renderPartySlots } from "./partyCard.js";
import { screenHeader } from "./managementHeader.js";

/**
 * 力の遺跡・守護の遺跡。
 *
 * 階の一覧 → 1つ選ぶと中身と挑戦。深域・装備ダンジョンと同じ形。
 * 上に**カケラ・進化核・アクセの数**を常に出す(何周すれば製作できるかを数えながら回る場所)。
 *
 * **確率の数字は出さない。**何が出るか・★の幅・個数の幅だけを伝える。
 */
export interface RuinsProps {
  player: PlayerState;
  kind: RuinKind;
  selectedFloor: number | null;
  onSelectKind: (kind: RuinKind) => void;
  onSelectFloor: (floor: number | null) => void;
  onStartFloor: (floor: RuinFloor) => void;
  onGoParty: () => void;
  onGoAccessories: () => void;
  onGoCraft: () => void;
  autoFarmCount: number;
  onChangeAutoFarmCount: (count: number) => void;
  onAutoFarm: (floor: RuinFloor, count: number) => void;
  onChangeStaminaPotionBudget: (next: number) => void;
}

export function renderRuinMaterials(player: PlayerState): HTMLElement {
  const chip = (name: string, count: number) => el("div", { className: "ruin-material" }, [
    el("span", { className: "ruin-material__name" }, [name]),
    el("span", { className: "ruin-material__count" }, [count.toLocaleString("ja-JP")]),
  ]);
  return el("div", { className: "ruin-materials" }, [
    chip("古代のカケラ", player.ancientShards ?? 0),
    chip("進化核", player.evolutionCores ?? 0),
    chip("アクセサリー", (player.accessories ?? []).length),
  ]);
}

const range = ([lo, hi]: readonly [number, number]) => (lo === hi ? `${lo}` : `${lo}〜${hi}`);

function starText(floor: RuinFloor): string {
  const stars = floor.starWeights.filter(([, w]) => w > 0).map(([s]) => s);
  return stars.length === 1 ? `★${stars[0]}` : `★${stars[0]}〜★${stars[stars.length - 1]}`;
}

function familiesText(kind: RuinKind): string {
  return RUIN_FAMILIES[kind].map((f) => ACCESSORY_FAMILY_JA[f]).join("・");
}

function bonusText(floor: RuinFloor): string {
  const parts = ["召喚の書"];
  if (floor.bonus.reincarnationPig3 > 0) parts.push("転生ピッグ★3");
  if (floor.bonus.skillPig1 > 0) parts.push("スキルピッグ★1");
  return `${parts.join("・")}(まれに)`;
}

function renderList(props: RuinsProps): HTMLElement {
  const tiles = ruinFloors(props.kind).map((floor) => {
    const unlocked = isRuinFloorUnlocked(props.player, props.kind, floor.floor);
    const cleared = isRuinFloorCleared(props.player, props.kind, floor.floor);
    return {
      badge: `${floor.floor}F`,
      title: unlocked ? `⚡${floor.stamina}` : "未開放",
      color: unlocked ? (props.kind === "POWER" ? "#ff9f6a" : "#6ab8ff") : "#4a5372",
      chips: unlocked
        ? [`アクセ${starText(floor)}`, cleared ? "クリア済み" : "未クリア"]
        : [`${floor.floor - 1}階をクリアで開放`],
      onClick: () => props.onSelectFloor(floor.floor),
      disabled: !unlocked,
    };
  });
  return el("div", { className: "screen stages-screen ruins-screen" }, [
    screenHeader("遺跡"),
    el("div", { className: "ruin-tabs" }, RUIN_KINDS.map((kind) =>
      el("button", {
        type: "button",
        className: `ruin-tab${kind === props.kind ? " ruin-tab--active" : ""}`,
        "data-tour": `ruin-tab:${kind}`,
        onclick: () => props.onSelectKind(kind),
      }, [RUIN_NAME[kind]]))),
    renderDungeonIntro(
      props.kind === "POWER"
        ? "指揮兵器を倒せば勝ち。号令塔・妨害塔を倒すと指揮兵器が強くなります。4階からは号令塔が指揮兵器に護りを張り、解除で剥がすと張り直すまで穴が開きます。"
        : "霊獣を倒せば勝ち。身代わり像が霊獣のダメージを肩代わりします(解除で剥がせます)。",
      [`アクセ(${familiesText(props.kind)})が必ず落ちる`, "曜日の縛りなし"],
    ),
    renderRuinMaterials(props.player),
    el("div", { className: "ruin-links" }, [
      el("button", { type: "button", className: "btn btn--ghost", "data-tour": "ruin:accessories", onclick: props.onGoAccessories }, ["💍 アクセサリー"]),
      el("button", { type: "button", className: "btn btn--ghost", "data-tour": "ruin:craft", onclick: props.onGoCraft }, [`🔨 カケラ製作(${ANCIENT_CRAFT_COST}個)`]),
    ]),
    renderFloorGrid(tiles),
  ]);
}

/**
 * その階の主の絵。**流れの中に置く**(浮かせると下の何かを覆う)。
 * 絵は戦闘と同じ肖像(`applyPortrait`)なので、戦闘で見る姿と必ず一致する。
 */
function renderBossArt(floor: RuinFloor): HTMLElement {
  const boss = buildDungeonEnemyTeam(floor)[0];
  const art = el("div", { className: "ruin-boss-art", role: "img", "aria-label": floor.enemies[0].displayName ?? "" }, []);
  applyPortrait(art, boss);
  return art;
}

function renderDetail(props: RuinsProps, floor: RuinFloor): HTMLElement {
  const party = getDungeonParty(props.player);
  const hasStamina = props.player.stamina >= floor.stamina;
  const canChallenge = party.length > 0 && hasStamina;
  const cleared = isRuinFloorCleared(props.player, floor.kind, floor.floor);
  const blockers = [
    party.length === 0 ? "ダンジョン編成にモンスターを入れてください" : null,
    hasStamina ? null : `スタミナが足りません(⚡${floor.stamina}必要)`,
  ].filter((v): v is string => v !== null);
  const rarities = floor.rarityWeights.filter(([, w]) => w > 0).map(([r]) => ACCESSORY_RARITY_JA[r]).join("・");
  return el("div", { className: "screen stages-screen ruins-screen" }, [
    // 戻るは見出しの1つだけ。行き先は「階の一覧」(履歴ではなく1つ上)
    screenHeader(floor.name, { onBack: () => props.onSelectFloor(null), backLabel: "階層選択に戻る", meta: `⚡${props.player.stamina}/${props.player.maxStamina}` }),
    renderRuinMaterials(props.player),
    el("section", { className: "card ruin-detail" }, [
      renderBossArt(floor),
      el("p", { className: "acc-note" }, [floor.note]),
      ...floor.enemies.map((enemy) => el("div", { className: "ruin-enemy" }, [
        el("strong", {}, [`${enemy.displayName ?? enemy.templateId}${enemy.victoryTarget ? "(倒せば勝ち)" : ""}`]),
        el("span", {}, [(enemy.skills ?? []).map((s) => s.name).join(" / ")]),
      ])),
      el("div", { className: "ruin-detail__row" }, [
        el("span", { className: "ruin-detail__label" }, ["アクセ"]),
        el("span", {}, [`${familiesText(floor.kind)} / ${starText(floor)} / ${rarities}(クリアで必ず1つ)`]),
      ]),
      el("div", { className: "ruin-detail__row" }, [
        el("span", { className: "ruin-detail__label" }, ["素材"]),
        el("span", {}, [`進化核 ${range(floor.cores)} / 古代のカケラ ${range(floor.shards)}`]),
      ]),
      // 勝つたびに必ず入る額。確率ではないので数字をそのまま出す
      el("div", { className: "ruin-detail__row" }, [
        el("span", { className: "ruin-detail__label" }, ["ゴールド"]),
        el("span", {}, [`${floor.goldReward.toLocaleString("ja-JP")} G`]),
      ]),
      el("div", { className: "ruin-detail__row" }, [
        el("span", { className: "ruin-detail__label" }, ["経験値"]),
        el("span", {}, [`${floor.expReward.toLocaleString("ja-JP")}(1体ずつ)`]),
      ]),
      el("div", { className: "ruin-detail__row" }, [
        el("span", { className: "ruin-detail__label" }, ["ボーナス"]),
        el("span", {}, [bonusText(floor)]),
      ]),
      el("div", { className: "ruin-detail__row" }, [
        el("span", { className: "ruin-detail__label" }, ["消費"]),
        el("span", {}, [`⚡${floor.stamina}`]),
      ]),
    ]),
    el("section", { className: "card depth-party" }, [
      el("h2", { className: "depth-party__title" }, ["この編成で挑みます"]),
      el("p", { className: "depth-party__note" }, ["遺跡は装備ダンジョンと同じ「ダンジョン編成」(最大5体)で戦います"]),
      renderPartySlots(party, MAX_DUNGEON_PARTY_SIZE),
      el("button", { type: "button", className: "btn btn--ghost", onclick: props.onGoParty }, ["ダンジョン編成を変更する"]),
    ]),
    /*
     * 1戦の「挑戦する」が**この階の主役。**前は編成の変更と並べた小さな札で左に寄り、
     * 下の「▶ 10回まとめて挑戦」の方が大きかった(主と従が逆)。
     * 装備ダンジョンの階と同じ、幅いっぱいの大きな札にする。
     */
    el("section", { className: "panel challenge-panel" }, [
      ...(blockers.length > 0 ? [el("p", { className: "challenge-panel__warn" }, [blockers.join(" / ")])] : []),
      el("button", {
        type: "button",
        className: "btn btn--primary btn--large challenge-panel__go",
        "data-tour": "ruin:start",
        disabled: !canChallenge,
        onclick: () => props.onStartFloor(floor),
      }, [`⚔ 挑戦する (⚡${floor.stamina})`]),
    ]),
    cleared
      ? renderAutoFarmPanel({
        ...(() => {
          const timing = referenceRunTime(props.player.recentManualClearTimes, "RUINS", ruinLocationId(floor.kind, floor.floor));
          return { referenceRunSeconds: timing.seconds, referenceFromManual: timing.fromManual, recentManualClearTimes: timing.recent };
        })(),
        ...autoFarmPotionProps(props.player, props.onChangeStaminaPotionBudget),
        count: props.autoFarmCount,
        onChangeCount: props.onChangeAutoFarmCount,
        staminaCost: floor.stamina,
        stamina: props.player.stamina,
        disabled: !canChallenge,
        onStart: () => props.onAutoFarm(floor, props.autoFarmCount),
      })
      : el("p", { className: "app-subtitle" }, ["自動周回は、この階を一度クリアすると解放されます。"]),
  ]);
}

export function renderRuins(props: RuinsProps): HTMLElement {
  const floor = props.selectedFloor !== null ? ruinFloors(props.kind).find((f) => f.floor === props.selectedFloor) : undefined;
  return floor ? renderDetail(props, floor) : renderList(props);
}
