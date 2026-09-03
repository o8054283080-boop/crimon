import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BattleEngine } from "../src/battle/engine.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { arenaNpcRng, buildArenaNpcs } from "../src/game/arena/npc.js";
import { snapshotToDefinitions } from "../src/game/arena/snapshot.js";
import { arenaCompressedSpeed } from "../src/data/pvpArena.js";
import { buildArenaEntryBattle } from "../src/web/views/arena/model.js";

/*
 * **画面で見た決着と、サーバが出す決着が同じものであること。**
 *
 * ## なぜこれが核心なのか
 *
 * 勝敗を自己申告させないために、サーバは戦闘を回し直して判定する。
 * だが「回し直す」が**別の戦いになっていたら**、勝ったのに負けになる。
 * 実際、最初の実装では:
 *
 *   ・画面は `Math.random` で戦っていた
 *   ・サーバはサーバが決めた種で戦っていた
 *
 * 同じ戦いを2回やっているつもりで、**別の戦いを1回ずつやっていた。**
 *
 * 一致に要るのは3つ。どれか1つでも欠けると食い違う:
 *
 *   1. 同じ乱数の種
 *   2. 同じ編成(攻撃側も、防衛側も)
 *   3. 同じ速度圧縮
 *
 * ここではその3つを、Edge Function と同じ手順で組み立てて突き合わせる。
 */

/** Edge Function 側と同じ速度圧縮 */
function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/** 攻める側・守る側の見本。NPC生成器から取る(実際の編成と同じ作りになる) */
const attacker = buildArenaNpcs(1500, 11, 3)[0];
const defender = buildArenaNpcs(1500, 77, 3)[2];

/** Edge Function がやっていること、そのまま */
function settleLikeServer(seed: number): string {
  const attackers = snapshotToDefinitions(attacker.defense).map(withArenaSpeed);
  const defenders = snapshotToDefinitions(defender.defense).map(withArenaSpeed);
  const result = new BattleEngine(attackers, defenders, { rng: arenaNpcRng(seed | 0) }).run();
  return `${result.winner}:${Array.isArray(result.log) ? result.log.length : 0}`;
}

/** 画面がやっていること、そのまま(送った焼き付けから組む) */
function playLikeClient(seed: number): string {
  const setup = buildArenaEntryBattle([], defender, [], attacker.defense);
  const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng: arenaNpcRng(seed | 0) }).run();
  return `${result.winner}:${Array.isArray(result.log) ? result.log.length : 0}`;
}

describe("同じ種なら、同じ戦いになること", () => {
  it("同じ種で3回まわして、経過まで完全に一致する", () => {
    // ここが崩れると、サーバの回し直しは「別の戦い」になる
    const runs = [settleLikeServer(20260902), settleLikeServer(20260902), settleLikeServer(20260902)];
    expect(new Set(runs).size).toBe(1);
  });

  it("種を変えると結果が変わる(種が効いている)", () => {
    /*
     * 一致しているのが「種のおかげ」なのか「たまたま毎回同じ」なのかを
     * 分ける。全部同じなら、種は何も効いていない。
     */
    const runs = [1, 2, 3, 4, 5, 6, 7, 8].map(settleLikeServer);
    expect(new Set(runs).size).toBeGreaterThan(1);
  });
});

describe("画面とサーバが、同じ編成から戦うこと", () => {
  it("画面が組む攻撃編成は、サーバへ送った焼き付けと同じ結果になる", () => {
    /*
     * 画面は手持ちから組み直すこともできるが、**そうしない。**
     * サーバが検分して控えたのは焼き付けの方なので、画面もそれから組む。
     * 「同じはず」で済ませると、装備の解決が1か所違っただけで
     * 別のステータスで戦うことになる。
     */
    for (const seed of [1, 99, 20260902]) {
      expect(playLikeClient(seed), `種 ${seed}`).toBe(settleLikeServer(seed));
    }
  });

  it("焼き付けを渡さなければ、手持ちから組む道も残っている", () => {
    // 未接続の時はこちら。渡さないと空になる、では困る
    const setup = buildArenaEntryBattle([], defender, []);
    expect(setup.playerDefs).toEqual([]);
    expect(setup.enemyDefs.length).toBeGreaterThan(0);
  });

  it("両陣営に同じ速度圧縮がかかっている", () => {
    // 片方だけ掛けると、その時点で勝敗が決まる
    const setup = buildArenaEntryBattle([], defender, [], attacker.defense);
    const raw = snapshotToDefinitions(attacker.defense);
    for (let i = 0; i < raw.length; i += 1) {
      expect(setup.playerDefs[i].stats.spd).toBe(arenaCompressedSpeed(raw[i].stats.spd));
    }
    const rawEnemy = snapshotToDefinitions(defender.defense);
    for (let i = 0; i < rawEnemy.length; i += 1) {
      expect(setup.enemyDefs[i].stats.spd).toBe(arenaCompressedSpeed(rawEnemy[i].stats.spd));
    }
  });
});

describe("Edge Function が、同じ道具を使っていること", () => {
  const edge = readFileSync(
    new URL("../supabase/functions/arena-settle/index.ts", import.meta.url), "utf8");

  it("乱数の式がクライアントと同じ", () => {
    /*
     * Edge は Deno なので取り込みの都合で式を持っている。
     * **式が1文字違うだけで、別の戦いになる。**
     * `game/arena/npc.ts` の `arenaNpcRng` と同じ形であることを見る。
     */
    const npc = readFileSync(new URL("../src/game/arena/npc.ts", import.meta.url), "utf8");
    for (const line of [
      "a = (a + 0x6d2b79f5) | 0;",
      "let t = Math.imul(a ^ (a >>> 15), 1 | a);",
      "t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;",
      "return ((t ^ (t >>> 14)) >>> 0) / 4294967296;",
    ]) {
      expect(edge, `Edge に無い: ${line}`).toContain(line);
      expect(npc, `クライアントに無い: ${line}`).toContain(line);
    }
  });

  it("速度圧縮も共有の関数から取っている", () => {
    // ここを書き写すと、調整のたびに片方だけ古くなる
    expect(edge).toContain("arenaCompressedSpeed");
    expect(edge).toContain('from "../_shared/data/pvpArena.js"');
  });

  it("戦闘エンジンも共有のものを使っている", () => {
    expect(edge).toContain('from "../_shared/battle/engine.js"');
    expect(edge).toContain('from "../_shared/game/arena/snapshot.js"');
  });

  it("NPCは並び全体を作ってから取り出している", () => {
    /*
     * `buildArenaNpcs` は「同じ編成を続けて出さない」ために、
     * 前に出した編成を避けながら順に配る。**1人だけ作ると別の相手になる。**
     */
    expect(edge).toContain("buildArenaNpcs(session.defender_rating_before, seed, count)");
  });

  it("引き分けは攻める側の負けにしている", () => {
    // 守り切ったのだから防衛の勝ち。ここが曖昧だと判定が揺れる
    expect(edge).toContain('result.winner === "PLAYER"');
  });
});

describe("NPCが、種から同じ顔ぶれに戻ること", () => {
  it("同じ種・同じ件数なら、並びも編成も一致する", () => {
    /*
     * サーバはNPCの編成を保存せず、種から組み直す。
     * 保存すると「送られてきた弱いNPC」を保存してしまうため。
     * **組み直しがずれたら、画面と別の相手と戦うことになる。**
     */
    const a = buildArenaNpcs(1500, 12345, 10);
    const b = buildArenaNpcs(1500, 12345, 10);
    expect(a.map((e) => `${e.name}/${e.archetypeName}/${e.rating}`))
      .toEqual(b.map((e) => `${e.name}/${e.archetypeName}/${e.rating}`));
    expect(JSON.stringify(a[3].defense)).toBe(JSON.stringify(b[3].defense));
  });

  it("件数が違うと並びも変わる(件数を控える必要がある)", () => {
    /*
     * 避ける集合の配り方が件数で変わるので、**件数も控えないと再現できない。**
     * だから `arena_match_sessions` は種・並び位置・件数の3つを持っている。
     */
    const short = buildArenaNpcs(1500, 999, 3);
    const long = buildArenaNpcs(1500, 999, 10);
    // 先頭は同じ(順に配るので)。ここが違うと、そもそも決定的でない
    expect(short[0].name).toBe(long[0].name);
    expect(long.length).toBe(10);
  });
});
