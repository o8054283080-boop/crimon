/**
 * 開発用のバトルステージ単体プレビュー。
 * ビルド対象(index.html)には含まれず、`vite dev` でのみ配信される。
 * スクリーンショットによる見た目のレビューを、ゲーム進行を経由せずに行うために使う。
 *
 * クエリパラメータ:
 *   ?seed=123     バトルの乱数シード(同じ値なら同じ展開になる)
 *   ?paused=1     自動進行を止めて初期状態のまま表示する
 *   ?turns=8      指定ターン数だけ即座に進めた状態から表示する
 */
import "./web/style.css";
import { BattleEngine } from "./battle/engine.js";
import { MonsterDefinition } from "./core/monster.js";
import { findMonster } from "./data/monsters.js";
import { renderBattleView } from "./web/views/battleView.js";

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
const seed = Number(params.get("seed") ?? 12345);
const paused = params.get("paused") === "1";
const preTurns = Number(params.get("turns") ?? 0);

const playerTeam: MonsterDefinition[] = [
  must("dragon", "FIRE"),
  must("seraph", "LIGHT"),
  must("griffon", "ELECTRIC"),
  must("fairy", "GRASS"),
];

const enemyTeam: MonsterDefinition[] = [
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

const app = document.querySelector("#app");
app?.append(view.element);

if (paused) {
  // 自動進行の一時停止ボタンを押した状態にする
  const pauseButton = view.element.querySelector<HTMLButtonElement>(".battle-icon-btn--play");
  pauseButton?.click();
}

// スクリーンショット側から「描画が安定した」ことを判定できるようにする
Object.assign(window, { __crimonPreviewReady: true });
