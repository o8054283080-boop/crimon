/**
 * アリーナNPCの強さを、レート帯ごとに測る。
 *
 * **帯の名前や設定値ではなく、実際に戦わせた結果で見る。**
 * 「上の帯ほど強い」はデータを眺めても分からない。育成の項目が全部カンストした
 * 帯どうしでは、設定の表を見比べても差が1行も出ないためで、そこから先は
 * 装備のサブOPの質のような**数字に出ない差**が効く。
 *
 * 味方は Battle Lab の型紙で組んだ固定編成。**同じ相手を全帯へぶつける**ので、
 * 勝率と決着時の残りHPがそのまま帯の重さになる。
 *
 *   npx tsx tools/arenaNpcPressure.ts                  # 全帯
 *   npx tsx tools/arenaNpcPressure.ts --ratings 2675,2700,2800
 *   npx tsx tools/arenaNpcPressure.ts --runs 60 --gear FINISHED
 *   npx tsx tools/arenaNpcPressure.ts --teams --rating 3000   # 編成ごとに比べる
 */
import { BattleEngine } from "../src/battle/engine.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { arenaCompressedSpeed } from "../src/data/pvpArena.js";
import { ARENA_NPC_BANDS, arenaNpcBandForRating } from "../src/data/arena/npcConfig.js";
import { ARENA_NPC_TEAMS } from "../src/data/arena/npcTeams.js";
import { buildArenaNpc } from "../src/game/arena/npc.js";
import { snapshotToDefinitions } from "../src/game/arena/snapshot.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade } from "./battleLab/types.js";

/**
 * 挑む側。**上位レートの人が実際に組みそうな4体**にする。
 *
 * ここを弱くすると全帯が100%になって差が読めず、強くしすぎると全帯が0%になる。
 * アリーナは4対4なので、Battle Lab の5体編成から支援を1枠落とした形。
 */
const CHALLENGER: AllySpec[] = [
  { label: "主力・草グリフォン", templateId: "griffon", element: "GRASS", preset: "MAX_ATTACKER" },
  { label: "主力・火ドラゴン", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  { label: "妨害・電気ネメシス", templateId: "nemesis", element: "ELECTRIC", preset: "MAX_DEBUFFER" },
  { label: "回復・水セラフ", templateId: "seraph", element: "WATER", preset: "MAX_HEALER" },
];

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const RUNS = Number(arg("runs", "40"));
const GEAR = arg("gear", "STRONG") as GearGrade;
const RATINGS = arg("ratings", "").length > 0
  ? arg("ratings", "").split(",").map(Number)
  // 既定は各帯の下限。帯の切り替わりがそのまま見える
  : ARENA_NPC_BANDS.map((band) => band.minRating);

/** アリーナの速度圧縮。**両陣営に同じ式で掛ける**(本編と同じ) */
function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

interface Result {
  rating: number;
  bandId: string;
  bandName: string;
  /** 挑む側の勝率 */
  winRate: number;
  /** 決着時にNPC側へ残っていたHPの割合 */
  npcHpLeft: number;
  /** 決着までの手番数 */
  actions: number;
}

/**
 * 特定の編成だけを引かせる。
 *
 * `buildArenaNpc` は編成を乱数で選ぶので、そのままでは狙った編成を測れない。
 * **他を全部「すでに出した」ことにして除く**と、残った1つが必ず選ばれる
 * (候補を使い切った時に重複を許す作りなので、1つ残しておけば成立する)。
 */
function excludeAllBut(teamId: string): Set<string> {
  return new Set(ARENA_NPC_TEAMS.filter((team) => team.id !== teamId).map((team) => team.id));
}

function measure(rating: number, teamId?: string): Result {
  let wins = 0;
  let npcHpLeftSum = 0;
  let actionSum = 0;

  for (let run = 0; run < RUNS; run += 1) {
    const rng = mulberry32(50_000 + run * 977);
    const allies = CHALLENGER.map((spec) => withArenaSpeed(buildAlly(spec, mulberry32(7_000 + run * 31), GEAR)));
    /*
     * **並び位置は1(互角の枠)で固定する。**0や2にすると
     * `ARENA_NPC_RATING_OFFSETS` の -60 / +70 が乗って、
     * 測りたいレートと実際の相手のレートがずれる。
     */
    const npc = buildArenaNpc(rating, 90_000 + run * 13, 1, teamId ? excludeAllBut(teamId) : undefined);
    const enemies = snapshotToDefinitions(npc.defense).map(withArenaSpeed);
    if (enemies.length === 0) continue;

    const result = new BattleEngine(allies, enemies, { rng }).run();
    if (result.winner === "PLAYER") wins += 1;
    const last = result.turns[result.turns.length - 1];
    const snap = last ? last.snapshot.filter((u) => u.team === "ENEMY") : [];
    const maxHp = snap.reduce((sum, u) => sum + u.maxHp, 0);
    npcHpLeftSum += maxHp > 0 ? snap.reduce((sum, u) => sum + Math.max(0, u.currentHp), 0) / maxHp : 0;
    actionSum += result.turns.length;
  }

  const band = arenaNpcBandForRating(rating);
  return {
    rating,
    bandId: band.id,
    bandName: band.name,
    winRate: wins / RUNS,
    npcHpLeft: npcHpLeftSum / RUNS,
    actions: Math.round(actionSum / RUNS),
  };
}

if (argv.includes("--teams")) {
  /*
   * 編成ごとの比較。**帯は1つに固定する。**
   * 帯を変えると装備の厳選回数まで変わり、編成の差なのか装備の差なのか読めない。
   */
  const rating = Number(arg("rating", "3000"));
  const tier = Number(arg("tier", "4"));
  const targets = ARENA_NPC_TEAMS.filter((team) => team.tier === tier);
  console.log(`挑む側: ${GEAR}装備の4体 / 各${RUNS}戦 / レート${rating}の帯で段${tier}の編成を比べる`);
  console.log("| 編成 | 挑む側の勝率 | 決着時のNPC残HP | 手番 |");
  console.log("|---|---:|---:|---:|");
  const rows = targets.map((team) => ({ team, result: measure(rating, team.id) }));
  rows.sort((a, b) => a.result.winRate - b.result.winRate);
  for (const { team, result } of rows) {
    console.log(`| ${team.name} | ${(result.winRate * 100).toFixed(0)}% `
      + `| ${(result.npcHpLeft * 100).toFixed(1)}% | ${result.actions} |`);
  }
  console.log("\n**上ほど強い**(挑む側が勝ちにくい)");
} else {
  console.log(`挑む側: ${GEAR}装備の4体 / 各${RUNS}戦`);
  console.log("| レート | 帯 | 挑む側の勝率 | 決着時のNPC残HP | 手番 |");
  console.log("|---:|---|---:|---:|---:|");
  for (const rating of RATINGS) {
    const r = measure(rating);
    console.log(`| ${r.rating} | ${r.bandName}(${r.bandId}) | ${(r.winRate * 100).toFixed(0)}% `
      + `| ${(r.npcHpLeft * 100).toFixed(1)}% | ${r.actions} |`);
  }
  console.log("\n勝率は飽和しやすい。**上の帯を見る時は決着時のNPC残HPの方を読むこと**");
}
