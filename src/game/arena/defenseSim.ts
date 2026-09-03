/**
 * 留守中に、NPCが自分の防衛編成へ挑んでくる。
 *
 * ## なぜ要るのか
 *
 * 非同期PvPは「自分が居ない時に戦われる」のが本体なのに、
 * **実プレイヤーが挑んでこない限り、防衛は一度も動かない。**
 * 人口が少ない前提で作っているのに、防衛だけ人口任せでは
 * 「登録すると挑まれるようになります」が嘘になり、防衛履歴も
 * リベンジも永久に空のままになる。
 *
 * 対戦候補をNPCで埋めるのと同じ理屈で、**防衛側もNPCで埋める。**
 *
 * ## 勝手に強い相手を呼ばない
 *
 * 攻めてくるのは `buildArenaNpcs` が作る**自分のレート帯の相手**で、
 * 戦うのも既存の `BattleEngine`。勝敗を作るのではなく、実際に戦って決める。
 * 数字を後から捏ねる余地をどこにも作らない。
 *
 * ## 寝ている間に溶けないようにする
 *
 * - 1回の起動でさばくのは最大 {@link MAX_ATTACKS_PER_VISIT} 件
 * - どれだけ間が空いても、遡るのは {@link MAX_CATCHUP_MS} まで
 * - 1日に落ちるレートの上限は `recordArenaMatch` 側が持っている
 * - **防衛未登録なら1件も起きない**(登録していない人が攻められる道理が無い)
 */
import { BattleEngine } from "../../battle/engine.js";
import { MonsterDefinition } from "../../core/monster.js";
import { PlayerState } from "../playerState.js";
import { buildArenaNpcs } from "./npc.js";
import { recordArenaMatch } from "./match.js";
import { snapshotToDefinitions } from "./snapshot.js";
import { arenaCompressedSpeed } from "../../data/pvpArena.js";

/** 攻められる間隔。これより短い間に何度も起きない */
export const DEFENSE_ATTACK_INTERVAL_MS = 3 * 60 * 60 * 1000;
/** 1回の起動でさばく上限 */
export const MAX_ATTACKS_PER_VISIT = 3;
/** どれだけ間が空いても、これ以上は遡らない */
export const MAX_CATCHUP_MS = 24 * 60 * 60 * 1000;

/** アリーナの速度圧縮。**両陣営に同じ式で掛ける** */
function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

export interface DefenseAttackSummary {
  /** さばいた件数 */
  attacks: number;
  /** 退けた回数 */
  held: number;
  /** レートの増減の合計 */
  ratingDelta: number;
}

/**
 * 前回からの経過ぶんの防衛戦をさばく。
 *
 * **アリーナを開いた時に1度だけ呼ぶ。** 戦闘は表に出さず、
 * 結果だけが防衛履歴に積まれる(攻める側の画面と混ざらない)。
 */
export function runPendingDefenseAttacks(state: PlayerState, now: number = Date.now()): DefenseAttackSummary {
  const empty: DefenseAttackSummary = { attacks: 0, held: 0, ratingDelta: 0 };
  const snapshot = state.arenaDefenseSnapshot;
  if (!snapshot || snapshot.units.length === 0) return empty;

  // 初回は「今から数え始める」。登録した瞬間に過去ぶんが襲ってくるのはおかしい
  if (!state.arenaLastDefenseCheckAt) {
    state.arenaLastDefenseCheckAt = now;
    return empty;
  }
  const since = Math.max(state.arenaLastDefenseCheckAt, now - MAX_CATCHUP_MS);
  const due = Math.floor((now - since) / DEFENSE_ATTACK_INTERVAL_MS);
  if (due <= 0) return empty;

  const count = Math.min(due, MAX_ATTACKS_PER_VISIT);
  state.arenaLastDefenseCheckAt = now;

  const defenders = snapshotToDefinitions(snapshot).map(withArenaSpeed);
  if (defenders.length === 0) return empty;

  // 攻めてくるのは自分のレート帯の相手。種は時刻から作るので毎回同じにはならない
  const attackers = buildArenaNpcs(state.arenaPoints, Math.floor(now / 60_000) | 0, count);
  const summary: DefenseAttackSummary = { attacks: 0, held: 0, ratingDelta: 0 };

  for (const attacker of attackers.slice(0, count)) {
    const attackerDefs = snapshotToDefinitions(attacker.defense).map(withArenaSpeed);
    if (attackerDefs.length === 0) continue;
    /*
     * **実際に戦って決める。** 攻める側を `playerDefs` に置くので、
     * 勝者が PLAYER なら攻撃側の勝ち = こちらの防衛は破られた。
     */
    const winner = new BattleEngine(attackerDefs, defenders).run().winner;
    const held = winner !== "PLAYER";
    const outcome = recordArenaMatch(state, {
      opponent: attacker,
      won: held,
      side: "DEFENSE",
      now: now - (count - summary.attacks - 1) * DEFENSE_ATTACK_INTERVAL_MS,
    });
    summary.attacks += 1;
    if (held) summary.held += 1;
    summary.ratingDelta += outcome.record.ratingDelta;
  }
  return summary;
}
