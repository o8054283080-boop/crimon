/**
 * アリーナの精算。**勝敗をここで決める。**
 *
 * ## なぜ Edge Function なのか
 *
 * 「勝った」と申告させない、という一点のため。
 * SQL の中では戦闘を回せないので、**戦闘エンジンが動く場所**が要る。
 *
 * 戦闘エンジンは種を渡せば完全に決定的(同じ種・同じ編成なら、
 * 同じ経過をたどる)。だから
 *
 *   1. `arena_begin_match` が種と相手を発行して控える
 *   2. クライアントはその種で戦闘を**見せる**
 *   3. ここで同じ種・同じ編成で回し直し、**出た勝敗で精算する**
 *
 * クライアントが送るのは対戦IDと nonce だけ。勝敗を送る欄が無い。
 * 画面の見た目と食い違うことは無い——同じ入力から同じ結果しか出ないので。
 *
 * ## 鍵の扱い
 *
 * `SUPABASE_SERVICE_ROLE_KEY` は**この関数の中だけ**にある。
 * フロントには一切出さない(出したら全部の守りが無意味になる)。
 * 精算RPCは service_role にしか grant していないので、
 * 仮にこの関数を通さずに叩こうとしても入口が無い。
 *
 * ## 使う前に
 *
 *   npm run build:edge                       # 共有コードを _shared/ へ
 *   supabase functions deploy arena-settle
 */
import { BattleEngine } from "../_shared/battle/engine.js";
import { MonsterDefinition } from "../_shared/core/monster.js";
import { buildArenaNpcs } from "../_shared/game/arena/npc.js";
import { snapshotToDefinitions } from "../_shared/game/arena/snapshot.js";
import { arenaCompressedSpeed } from "../_shared/data/pvpArena.js";
import type { ArenaDefenseSnapshot } from "../_shared/game/arena/types.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** アリーナの速度圧縮。**両陣営に同じ式で掛ける**(クライアントと同じ) */
function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/** 種から決まる乱数。`game/arena/npc.ts` の実装と同じ式 */
function seededRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 送られてきたトークンの持ち主。
 *
 * **自分で JWT を読まない。** 署名の検証を自前で書くと、
 * 間違えた時に「誰でも誰にでもなれる」穴になる。GoTrue に聞く。
 */
async function whoami(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const id = body?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/** service_role での問い合わせ。**この関数の外へは出さない** */
async function admin(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
  return body;
}

/** 長さの違いで早く抜けない比較。nonce の突き合わせに使う */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface MatchSession {
  id: string;
  attacker_id: string;
  opponent_kind: "PLAYER" | "NPC";
  defender_id: string | null;
  npc_seed: string | null;
  npc_index: number | null;
  npc_count: number | null;
  attacker_snapshot: ArenaDefenseSnapshot;
  defender_snapshot: ArenaDefenseSnapshot | null;
  attacker_rating_before: number;
  defender_rating_before: number;
  battle_seed: number;
  nonce: string;
  status: string;
  expires_at: string;
}

/**
 * 相手を組み立てる。
 *
 * 実プレイヤーなら発行時に控えた編成。NPCなら**種から組み直す。**
 * 組み直すのは、送られてきたNPCを信じると
 * 「わざと弱いNPC」を送って勝ち放題になるため。
 */
function buildDefender(session: MatchSession): { defs: MonsterDefinition[]; rating: number } {
  if (session.opponent_kind === "PLAYER") {
    if (!session.defender_snapshot) return { defs: [], rating: session.defender_rating_before };
    return {
      defs: snapshotToDefinitions(session.defender_snapshot).map(withArenaSpeed),
      rating: session.defender_rating_before,
    };
  }

  const seed = Number(session.npc_seed);
  const index = session.npc_index ?? 0;
  const count = session.npc_count ?? index + 1;
  if (!Number.isFinite(seed)) return { defs: [], rating: session.defender_rating_before };

  /*
   * **並び全体を作ってから取り出す。**
   * `buildArenaNpcs` は「同じ編成を続けて出さない」ために、
   * 前に出した編成を避けながら順に配る。1人だけ作ると別の相手になる。
   */
  const list = buildArenaNpcs(session.defender_rating_before, seed, count);
  const npc = list[index];
  if (!npc) return { defs: [], rating: session.defender_rating_before };
  return {
    defs: snapshotToDefinitions(npc.defense).map(withArenaSpeed),
    rating: npc.rating,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, code: "NOT_CONFIGURED" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

  const uid = await whoami(token);
  if (!uid) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

  let input: { matchId?: unknown; nonce?: unknown };
  try {
    input = await req.json();
  } catch {
    return json({ ok: false, code: "BAD_REQUEST" }, 400);
  }
  const matchId = typeof input.matchId === "string" ? input.matchId : "";
  const nonce = typeof input.nonce === "string" ? input.nonce : "";
  if (!matchId || !nonce) return json({ ok: false, code: "BAD_REQUEST" }, 400);

  let session: MatchSession | undefined;
  try {
    const rows = await admin(
      `arena_match_sessions?id=eq.${encodeURIComponent(matchId)}&select=*&limit=1`,
    ) as MatchSession[];
    session = Array.isArray(rows) ? rows[0] : undefined;
  } catch {
    return json({ ok: false, code: "LOOKUP_FAILED" }, 500);
  }
  if (!session) return json({ ok: false, code: "UNKNOWN_MATCH" }, 404);

  // **持ち主だけが精算できる。** 他人の対戦を終わらせられては困る
  if (session.attacker_id !== uid) return json({ ok: false, code: "NOT_YOUR_MATCH" }, 403);
  if (!sameSecret(session.nonce, nonce)) return json({ ok: false, code: "BAD_NONCE" }, 403);
  if (session.status !== "OPEN") return json({ ok: false, code: "ALREADY_SETTLED" }, 409);
  if (Date.parse(session.expires_at) < Date.now()) return json({ ok: false, code: "MATCH_EXPIRED" }, 410);

  const attackers = snapshotToDefinitions(session.attacker_snapshot).map(withArenaSpeed);
  const defender = buildDefender(session);
  if (attackers.length === 0 || defender.defs.length === 0) {
    return json({ ok: false, code: "EMPTY_TEAM" }, 422);
  }

  /*
   * **ここが判定。**
   * 攻める側を `playerTeam` に置くので、勝者が PLAYER なら攻撃側の勝ち。
   * 引き分け(手数の上限に達した)は**攻める側の負け**にする——
   * 守り切ったのだから防衛の勝ち、という扱い。
   */
  const result = new BattleEngine(attackers, defender.defs, {
    rng: seededRng(Number(session.battle_seed) | 0),
  }).run();
  const attackerWon = result.winner === "PLAYER";

  try {
    const settled = await admin("rpc/arena_settle_match", {
      method: "POST",
      body: JSON.stringify({
        p_match_id: session.id,
        p_attacker_won: attackerWon,
        p_opponent_rating: session.opponent_kind === "NPC" ? Math.round(defender.rating) : null,
      }),
    });
    return json(settled ?? { ok: true, won: attackerWon });
  } catch (error) {
    // 精算だけが失敗した時。**勝敗は伝える**(画面が固まらないように)
    return json({
      ok: false,
      code: "SETTLE_FAILED",
      won: attackerWon,
      detail: String(error).slice(0, 200),
    }, 500);
  }
});
