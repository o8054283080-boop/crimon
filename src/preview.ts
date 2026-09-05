/**
 * 開発用のバトルステージ単体プレビュー。
 * ビルド対象(index.html)には含まれず、`vite dev` でのみ配信される。
 * スクリーンショットによる見た目のレビューを、ゲーム進行を経由せずに行うために使う。
 *
 * クエリパラメータ:
 *   ?seed=123     バトルの乱数シード(同じ値なら同じ展開になる)
 *   ?paused=1     自動進行を止めて初期状態のまま表示する
 *   ?turns=8      指定ターン数だけ即座に進めた状態から表示する
 *   ?view=result  バトルではなく戦闘結果画面を表示する(&lose=1 で敗北時)
 *   ?view=farm    オート周回の結果画面を表示する
 *   ?view=tower   試練の塔の画面を表示する
 *                 &run=1      登坂の途中(削られた顔ぶれ)にする
 *                 &empty=1    塔の編成が空の状態にする
 *                 &blocked=1  スタミナ切れで挑めない状態にする
 *                 &outcome=checkpoint|wiped|completed|paused  戻ってきた理由を出す
 */
import "./web/style.css";
import { BattleEngine } from "./battle/engine.js";
import { MonsterDefinition } from "./core/monster.js";
import { createMonsterInstance } from "./core/monsterInstance.js";
import { Star } from "./core/rarity.js";
import { MONSTER_DEX, findMonster } from "./data/monsters.js";
import { createInitialState } from "./game/playerState.js";
import { emptyTowerRewardResult } from "./game/trialTower.js";
import { renderBattleView } from "./web/views/battleView.js";
import { renderAutoFarmResult } from "./web/views/autoFarmResult.js";
import { renderStageResult } from "./web/views/stageResult.js";
import { renderTrialTower, TrialTowerProps } from "./web/views/trialTower.js";

/**
 * 「描画が安定した」ことをスクリーンショット側へ伝える。
 *
 * **window のプロパティだけでは足りない。** Playwright の `waitForFunction` は
 * ページとは別のJSコンテキストで評価されるため、ページ側が window に生やした値が見えない
 * (`evaluate` では見えるのに `waitForFunction` だけが永久に待ち続ける、という形で刺さった)。
 * DOM は両方のコンテキストで共有されるので、属性の方を待ち受けの目印にする。
 */
function markPreviewReady(): void {
  Object.assign(window, { __crimonPreviewReady: true });
  document.documentElement.setAttribute("data-crimon-preview-ready", "1");
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function must(templateId: string, element: string): MonsterDefinition {
  const found = findMonster(templateId, element);
  if (!found) throw new Error(`モンスターが見つかりません: ${templateId}/${element}`);
  return found;
}

const params = new URLSearchParams(location.search);
const app = document.querySelector("#app");

// オート周回の結果画面のプレビュー。ドロップが多い時に破綻しないかを見る
if (params.get("view") === "farm") {
  app?.append(
    renderAutoFarmResult({
      targetName: "第3章 4-5 氷結の谷",
      result: {
        attempts: 12,
        cleared: 11,
        stopReason: "STAMINA",
        totalGold: 8640,
        totalCrystal: 90,
        totalFighterLevels: 2,
        equipmentDropCount: 7,
        summonScrollCount: 2,
        totalExp: 4200,
        pigDropCount: 1,
        levelUps: [
          { instanceId: "a", name: "ドラゴン[火]", levels: 4 },
          { instanceId: "b", name: "セラフ[光]", levels: 3 },
          { instanceId: "c", name: "グリフォン[電気]", levels: 2 },
        ],
        monsterDrops: [
          { dexId: "slime_FIRE", star: 2 },
          { dexId: "slime_FIRE", star: 2 },
          { dexId: "slime_FIRE", star: 2 },
          { dexId: "wolf_WATER", star: 3 },
          { dexId: "wolf_WATER", star: 3 },
          { dexId: "golem_ELECTRIC", star: 1 },
          { dexId: "fairy_GRASS", star: 4 },
        ],
      },
      actions: [{ label: "🔁 もう一度", variant: "primary", run: () => location.reload() }],
    }),
  );
  markPreviewReady();
  throw new Error("周回結果のプレビューを表示しました");
}

// 試練の塔のプレビュー。登坂前・登坂中の両方を、配線を待たずに見るために使う
if (params.get("view") === "tower") {
  const inRun = params.get("run") === "1";
  const empty = params.get("empty") === "1";
  const blocked = params.get("blocked") === "1";
  const requestedFloor = Number(params.get("floor") ?? 14);
  const previewFloor = Number.isInteger(requestedFloor) && requestedFloor >= 1 && requestedFloor <= 100 ? requestedFloor : 14;
  const previewPanel = params.get("panel") === "enemy"
    ? "ENEMY_INFO"
    : params.get("panel") === "ranking"
      ? "RANKING"
      : params.get("panel") === "rewards"
        ? "REWARDS"
        : "NONE";
  const requestedInfoFloor = Number(params.get("infoFloor") ?? previewFloor);
  const enemyInfoFloor = Number.isInteger(requestedInfoFloor) && requestedInfoFloor >= 60 && requestedInfoFloor <= 100
    ? requestedInfoFloor
    : Math.max(60, previewFloor);

  const player = createInitialState();
  player.stamina = blocked ? 1 : 62;

  const roster: [string, Star, number][] = [
    ["dragon_FIRE", 6, 40],
    ["seraph_LIGHT", 6, 40],
    ["fairy_GRASS", 5, 35],
    ["golem_WATER", 5, 35],
    ["wolf_ELECTRIC", 4, 30],
  ];
  const party = empty ? [] : roster.map(([dexId, star, level]) => createMonsterInstance(dexId, star, level));

  // HPは5桁まで伸びる。桁が増えても札からはみ出さないかを、ここで必ず見る
  const runMembers = [
    { hp: 16317, maxHp: 23440, fallen: false },
    { hp: 9820, maxHp: 21050, fallen: false },
    { hp: 1204, maxHp: 18730, fallen: false },
    { hp: 0, maxHp: 17600, fallen: true },
    { hp: 0, maxHp: 15980, fallen: true },
  ];

  const outcomeKind = (params.get("outcome") ?? "").toUpperCase();
  const reward = emptyTowerRewardResult();
  if (outcomeKind === "CHECKPOINT" || outcomeKind === "COMPLETED") {
    reward.crystal = outcomeKind === "COMPLETED" ? 500 : 200;
    reward.summonScrolls = outcomeKind === "COMPLETED" ? 3 : 1;
    reward.pigStar = 3;
    reward.equipment = {
      id: "eq_tower",
      slot: 4,
      star: outcomeKind === "COMPLETED" ? 6 : 5,
      level: 0,
      set: "CRIT",
      mainStat: { type: "ATK_PERCENT", value: 12 },
      subStats: [{ type: "SPD", value: 8 }],
    };
  }

  const props: TrialTowerProps = {
    bestFloor: Math.max(0, previewFloor - 1),
    nextFloor: previewFloor,
    run: inRun
      ? {
          floor: previewFloor,
          members: party.map((instance, i) => ({
            instanceId: instance.id,
            name: MONSTER_DEX.find((m) => m.id === instance.dexId)?.name ?? instance.dexId,
            dexId: instance.dexId,
            hp: runMembers[i].hp,
            maxHp: runMembers[i].maxHp,
            fallen: runMembers[i].fallen,
          })),
        }
      : null,
    party,
    player,
    claimedFloors: Array.from({ length: 12 }, (_, i) => i + 1),
    blockedReason: empty
      ? "塔の編成が組まれていません"
      : blocked
        ? "スタミナが足りません(⚡4必要 / 手持ち⚡1)"
        : null,
    notice: blocked ? "スタミナが回復するまで待つか、ショップで補充してください。" : null,
    outcome:
      outcomeKind === "CHECKPOINT" || outcomeKind === "WIPED" || outcomeKind === "COMPLETED" || outcomeKind === "PAUSED"
        ? { kind: outcomeKind, floor: outcomeKind === "COMPLETED" ? 30 : outcomeKind === "CHECKPOINT" ? 10 : 13, reward }
        : null,
    panel: previewPanel,
    enemyInfoFloor,
    rankingEntries: [
      { rank: 1, userId: "one", name: "PLAYER-A", bestFloor: 100, bestFloorReachedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
      { rank: 2, userId: "two", name: "PLAYER-B", bestFloor: 97, bestFloorReachedAt: "2026-09-02T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z" },
      { rank: 17, userId: "self", name: "あなたの名前は長めです", bestFloor: 73, bestFloorReachedAt: "2026-09-03T00:00:00Z", updatedAt: "2026-09-03T00:00:00Z" },
    ],
    rankingSelf: { rank: 17, userId: "self", name: "あなたの名前は長めです", bestFloor: 73, bestFloorReachedAt: "2026-09-03T00:00:00Z", updatedAt: "2026-09-03T00:00:00Z" },
    rankingLoading: params.get("loading") === "1",
    rankingError: params.get("error") === "1",
    rankingOffline: params.get("offline") === "1",
    onOpenEnemyInfo: () => undefined,
    onOpenRewards: () => undefined,
    onOpenRanking: () => undefined,
    onReloadRanking: () => undefined,
    onClosePanel: () => undefined,
    onDismissOutcome: () => location.reload(),
    onEditParty: () => undefined,
    onChallenge: () => undefined,
    onAbandon: () => undefined,
    onBack: () => undefined,
  };

  app?.append(renderTrialTower(props));
  markPreviewReady();
  throw new Error("試練の塔のプレビューを表示しました");
}

// 戦闘結果画面のプレビュー。報酬が一通り出た状態で、1画面に収まるかを見る
if (params.get("view") === "result") {
  const cleared = params.get("lose") !== "1";
  app?.append(
    renderStageResult({
      info: {
        cleared,
        stageName: "第4章 5-5 古城の主",
        goldEarned: 1240,
        crystalEarned: 30,
        wavesCleared: cleared ? 3 : 2,
        totalWaves: 3,
        levelUps: [
          { instanceId: "a", name: "ドラゴン[火]", levels: 2 },
          { instanceId: "b", name: "セラフ[光]", levels: 1 },
        ],
        dropDexId: "griffon_ELECTRIC",
        dropStar: 4,
        equipmentDrop: {
          id: "eq1",
          slot: 2,
          star: 5,
          level: 0,
          set: "CRIT",
          mainStat: { type: "ATK_PERCENT", value: 12 },
          subStats: [{ type: "SPD", value: 8 }],
        },
        summonScrollDropped: true,
        pigDrop: { dexId: "reincarnation_pig_GRASS", star: 3 },
        fighterLevelsGained: 1,
      },
      actions: [{ label: "🔁 もう一度", variant: "primary", run: () => location.reload() }],
    }),
  );
  markPreviewReady();
  throw new Error("結果画面のプレビューを表示しました(以降のバトル初期化は行いません)");
}
const seed = Number(params.get("seed") ?? 12345);
const paused = params.get("paused") === "1";
const preTurns = Number(params.get("turns") ?? 0);

/** "slime" または "slime:WATER" から1体を取り出す(造形の確認用) */
function anyOf(spec: string): MonsterDefinition {
  const [templateId, element] = spec.split(":");
  const found = MONSTER_DEX.find((m) => m.templateId === templateId && (!element || m.element === element));
  if (!found) throw new Error(`モンスターが見つかりません: ${spec}`);
  return found;
}

// ?roster=slime,wolf,nemesis,golem|fairy,dragon,seraph,griffon
// 造形の確認用に、味方4体・敵4体の種別を直接指定できるようにする
const roster = params.get("roster");

const playerTeam: MonsterDefinition[] = roster
  ? (roster.split("|")[0] ?? "").split(",").filter(Boolean).map(anyOf)
  : [must("dragon", "FIRE"), must("seraph", "LIGHT"), must("griffon", "ELECTRIC"), must("fairy", "GRASS")];

const enemyTeam: MonsterDefinition[] = roster
  ? (roster.split("|")[1] ?? "").split(",").filter(Boolean).map(anyOf)
  : [
      must("ancient_demon", "DARK"),
      must("ancient_crystal", "WATER"),
      must("ancient_crystal_curse", "DARK"),
      must("golem", "WATER"),
    ];

const engine = new BattleEngine(playerTeam, enemyTeam, { rng: mulberry32(seed) });

// 指定ターン数だけ先に進めておく(戦闘中盤の絵を撮りたい場合に使う)
for (let i = 0; i < preTurns; i++) {
  if (engine.getWinner()) break;
  const actor = engine.getNextActor();
  if (!actor) break;
  engine.resolveTurn(actor);
}

const view = renderBattleView({
  engine,
  playerTeam,
  enemyTeam,
  title: "バトルステージ プレビュー",
  resultLabel: () => "もう一度",
  onFinish: () => location.reload(),
});

app?.append(view.element);

if (paused) {
  // 自動進行の一時停止ボタンを押した状態にする
  const pauseButton = view.element.querySelector<HTMLButtonElement>(".battle-icon-btn--play");
  pauseButton?.click();
}

// スクリーンショット側から「描画が安定した」ことを判定できるようにする
markPreviewReady();
