/**
 * アカウント復旧(クラウドバックアップ)のAPI。
 *
 * ## このファイルは、Supabase から取り出して置き直したもの
 *
 * ここも長いあいだ**リポジトリに無かった。**そのせいで
 * **セッションの寿命が何日なのか手元から分からず**、
 * 「ログインしているのにサーバーへ保存されない」の原因を追えなかった。
 * これ以降は main へ入れば自動で本番へ流れる(`.github/workflows/recovery-edge.yml`)。
 * **Supabase の画面から直接編集しないこと。**次に main が動いた時に消える。
 *
 * ## セッションは、使っていれば切れない
 *
 * 以前は**発行から30日で問答無用に切れた。**延長する仕組みがどこにも無く、
 * クライアントは切れた瞬間から `loadCloudMeta()` が null になって
 * **黙ってバックアップを止めていた。**プレイヤーには何も出ないので、
 * 「登録したはずなのに保存されていない」という形でしか気づけない。
 *
 * いまは**使うたびに期限を延ばす**(`requireSession`)。ひと月に一度でも
 * 遊んでいれば切れない。延ばした期限は応答に載せてクライアントへ返す。
 *
 * ## 鍵の扱い
 *
 * `SUPABASE_SERVICE_ROLE_KEY` はこの関数の中だけ。フロントへは出さない。
 * パスワードと復旧キーは PBKDF2(SHA-256, 18万回)で塩付きにして保管し、
 * 突き合わせは**長さが合っても最後まで見る**形にしてある(時間で漏らさない)。
 */
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 180_000;

/** セッションの寿命 */
const SESSION_DAYS = 30;
/**
 * 残りがこれを切ったら、使ったついでに期限を延ばす。
 *
 * **毎回書き戻すと、遊んでいる間ずっと `UPDATE` が走る。**
 * 半分を過ぎてからにすれば、書き込みは長くても15日に1回で済む。
 */
const SESSION_RENEW_AFTER_MS = (SESSION_DAYS / 2) * 24 * 60 * 60 * 1000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function normalizeRecoveryId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validRecoveryId(id: string): boolean {
  return /^[a-z][a-z0-9._-]{3,19}$/.test(id);
}

/**
 * アリーナの身元(`auth.uid()`)。
 *
 * **アリーナの身元は端末の localStorage にしかない。**クラウドの控えにも
 * セーブファイルにも入らないので、端末を変えたりサイトデータが消えたりすると
 * 新しい匿名ユーザが生まれ、名前はセーブから来るので**ランキングに
 * 同じ名前で2人並ぶ**(実際に起きた)。
 *
 * 復旧IDの側に覚えさせておけば、復旧した時に元の身元へ戻せる。
 * **形だけを検める。**ここで持ち主かどうかは判定しない(判定はセッションの仕事)。
 */
function arenaUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomToken(bytes = 32): string {
  const out = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(out).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomRecoveryKey(): string {
  // 紛らわしい文字(I/O/0/1)を入れない。**手で書き写すもの**なので
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let raw = "";
  for (const b of bytes) raw += alphabet[b % alphabet.length];
  return `CRMN-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

async function sha256Base64(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function hashSecret(secret: string, saltBase64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(saltBase64), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

function makeSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

/** 長さが合っても最後まで見る。途中で抜けると、掛かった時間から中身が読める */
function timingSafeEqual(a: string, b: string): boolean {
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function validateSave(save: unknown): boolean {
  if (!save || typeof save !== "object") return false;
  const f = save as Record<string, unknown>;
  if (f.kind !== "crimon-save") return false;
  if (typeof f.version !== "number" || f.version < 1) return false;
  if (!f.state || typeof f.state !== "object") return false;
  const state = f.state as Record<string, unknown>;
  // **モンスターが0体の控えで上書きさせない。**壊れたデータで手持ちを失う方が大きい
  if (!Array.isArray(state.monsters) || state.monsters.length === 0) return false;
  if (!Array.isArray(state.equipment)) return false;
  return true;
}

function sessionExpiry(from = Date.now()): string {
  return new Date(from + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function createSession(accountId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken(32);
  const tokenHash = await sha256Base64(token);
  const expires = sessionExpiry();
  const { error } = await supabase.from("crimon_recovery_sessions").insert({
    account_id: accountId,
    token_hash: tokenHash,
    expires_at: expires,
  });
  if (error) throw error;
  return { token, expiresAt: expires };
}

type SessionRow = { id: string; account_id: string; expires_at: string };

/**
 * セッションを確かめ、**使ったぶんだけ期限を延ばす。**
 *
 * 以前は `last_used_at` を書くだけで `expires_at` を動かしていなかった。
 * だから**毎日遊んでいる人でも、発行から30日でいきなり切れた。**
 * 切れた側(クライアント)は黙ってバックアップを止めるので、
 * プレイヤーには何も起きていないように見えていた。
 *
 * 延ばした期限は呼び出し側へ返す。クライアントはそれを控えて、
 * 手元の期限も一緒に進める。
 */
async function requireSession(token: unknown): Promise<{ row: SessionRow; expiresAt: string } | null> {
  if (typeof token !== "string" || token.length < 20) return null;
  const tokenHash = await sha256Base64(token);
  const { data, error } = await supabase
    .from("crimon_recovery_sessions")
    .select("id,account_id,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as SessionRow;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await supabase.from("crimon_recovery_sessions").delete().eq("id", row.id);
    return null;
  }

  const now = new Date().toISOString();
  const remaining = new Date(row.expires_at).getTime() - Date.now();
  // 残りが半分を切っていたら延ばす。毎回書くと、遊んでいる間ずっと UPDATE が走る
  const renew = remaining < SESSION_RENEW_AFTER_MS;
  const nextExpiry = renew ? sessionExpiry() : row.expires_at;
  await supabase.from("crimon_recovery_sessions")
    .update(renew ? { last_used_at: now, expires_at: nextExpiry } : { last_used_at: now })
    .eq("id", row.id);
  return { row, expiresAt: nextExpiry };
}

/**
 * 復旧IDが覚えているアリーナIDと、いまの端末のIDが違う時に元データを移す。
 *
 * 復旧IDのパスワード/復旧キーまたは有効なセッションを通った後だけ呼ぶ。
 * そのため、クライアントから任意の他人のアリーナを移すことはできない。
 */
async function reconcileArenaIdentity(accountId: string, currentValue: unknown): Promise<string | null> {
  const current = arenaUserId(currentValue);
  const { data: account, error } = await supabase
    .from("crimon_recovery_accounts").select("arena_user_id").eq("id", accountId).single();
  if (error) throw error;
  const remembered = arenaUserId(account?.arena_user_id);

  if (!current) return remembered;
  if (!remembered) {
    const { error: linkError } = await supabase.from("crimon_recovery_accounts")
      .update({ arena_user_id: current }).eq("id", accountId);
    if (linkError) throw linkError;
    return current;
  }
  if (remembered === current) return current;

  // **ここが再発防止の本体。**新しい側の仮戦績は捨て、元の成績をそのまま移す。
  const { error: relinkError } = await supabase.rpc("crimon_arena_relink", {
    p_from: remembered,
    p_to: current,
  });
  if (relinkError) throw relinkError;
  const { error: linkError } = await supabase.from("crimon_recovery_accounts")
    .update({ arena_user_id: current }).eq("id", accountId);
  if (linkError) throw linkError;
  return current;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, code: "INVALID_JSON" });
  }

  const action = body.action;
  try {
    if (action === "register") {
      const recoveryId = normalizeRecoveryId(body.recoveryId);
      const password = typeof body.password === "string" ? body.password : "";
      const save = body.save;
      if (!validRecoveryId(recoveryId)) return json(400, { ok: false, code: "INVALID_RECOVERY_ID" });
      if (password.length < 6 || password.length > 128) return json(400, { ok: false, code: "INVALID_PASSWORD" });
      if (!validateSave(save)) return json(400, { ok: false, code: "INVALID_SAVE" });

      const { data: existing } = await supabase
        .from("crimon_recovery_accounts").select("id").eq("recovery_id", recoveryId).maybeSingle();
      if (existing) return json(409, { ok: false, code: "RECOVERY_ID_TAKEN" });

      const passwordSalt = makeSalt();
      const recoveryKey = randomRecoveryKey();
      const recoveryKeySalt = makeSalt();
      const passwordHash = await hashSecret(password, passwordSalt);
      const recoveryKeyHash = await hashSecret(recoveryKey, recoveryKeySalt);
      const { data, error } = await supabase.from("crimon_recovery_accounts").insert({
        recovery_id: recoveryId,
        password_salt: passwordSalt,
        password_hash: passwordHash,
        recovery_key_salt: recoveryKeySalt,
        recovery_key_hash: recoveryKeyHash,
        latest_save: save,
        latest_revision: 1,
        // 登録した端末のアリーナの身元。復旧した時に元へ戻すための覚え書き
        arena_user_id: arenaUserId(body.arenaUserId),
      }).select("id,latest_revision,latest_saved_at").single();
      if (error) throw error;

      const session = await createSession(data.id as string);
      return json(200, {
        ok: true,
        recoveryId,
        recoveryKey,
        revision: data.latest_revision,
        savedAt: data.latest_saved_at,
        session,
        arenaUserId: arenaUserId(body.arenaUserId),
      });
    }

    if (action === "login" || action === "recover") {
      const recoveryId = normalizeRecoveryId(body.recoveryId);
      const raw = action === "login" ? body.password : body.recoveryKey;
      const secret = typeof raw === "string" ? raw : "";
      if (!validRecoveryId(recoveryId) || !secret) return json(400, { ok: false, code: "INVALID_CREDENTIALS" });

      const { data: account, error } = await supabase
        .from("crimon_recovery_accounts")
        .select("id,password_salt,password_hash,recovery_key_salt,recovery_key_hash,failed_attempts,locked_until,latest_revision,latest_saved_at,latest_save,arena_user_id")
        .eq("recovery_id", recoveryId).maybeSingle();
      if (error) throw error;
      if (!account) return json(401, { ok: false, code: "INVALID_CREDENTIALS" });
      if (account.locked_until && new Date(account.locked_until as string).getTime() > Date.now()) {
        return json(429, { ok: false, code: "TEMPORARILY_LOCKED" });
      }

      const salt = (action === "login" ? account.password_salt : account.recovery_key_salt) as string;
      const expected = (action === "login" ? account.password_hash : account.recovery_key_hash) as string;
      const actual = await hashSecret(secret, salt);
      if (!timingSafeEqual(actual, expected)) {
        // 5回外したら15分止める。総当たりを遅くするが、本人は待てば戻れる
        const attempts = Number(account.failed_attempts ?? 0) + 1;
        const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        await supabase.from("crimon_recovery_accounts")
          .update({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: lock })
          .eq("id", account.id);
        return json(401, { ok: false, code: "INVALID_CREDENTIALS" });
      }

      await supabase.from("crimon_recovery_accounts")
        .update({ failed_attempts: 0, locked_until: null }).eq("id", account.id);
      const resolvedArenaUserId = await reconcileArenaIdentity(account.id as string, body.arenaUserId);
      const session = await createSession(account.id as string);
      return json(200, {
        ok: true,
        revision: account.latest_revision,
        savedAt: account.latest_saved_at,
        save: account.latest_save,
        session,
        // **復旧する側へ、元のアリーナの身元を渡す。**
        // 受け取った側は、自分の身元と違えば「別のアカウントになっている」と分かる
        arenaUserId: resolvedArenaUserId ?? account.arena_user_id ?? null,
      });
    }

    if (action === "load") {
      const session = await requireSession(body.sessionToken);
      if (!session) return json(401, { ok: false, code: "SESSION_INVALID" });
      const { data, error } = await supabase
        .from("crimon_recovery_accounts")
        .select("latest_revision,latest_saved_at,latest_save,arena_user_id")
        .eq("id", session.row.account_id).single();
      if (error) throw error;
      return json(200, {
        ok: true,
        revision: data.latest_revision,
        savedAt: data.latest_saved_at,
        save: data.latest_save,
        arenaUserId: data.arena_user_id ?? null,
        // 延ばした期限を返す。クライアントは手元の期限も一緒に進める
        sessionExpiresAt: session.expiresAt,
      });
    }

    if (action === "save") {
      const session = await requireSession(body.sessionToken);
      if (!session) return json(401, { ok: false, code: "SESSION_INVALID" });
      const revision = Number(body.revision);
      const save = body.save;
      // バックアップはアリーナの身元・成績を移動しない。競合時にも副作用を起こさない。
      const { data: account, error: accountError } = await supabase
        .from("crimon_recovery_accounts").select("arena_user_id").eq("id", session.row.account_id).single();
      if (accountError) throw accountError;
      const resolvedArenaUserId = account?.arena_user_id ?? null;
      if (!Number.isSafeInteger(revision) || revision < 2 || !validateSave(save)) {
        return json(400, { ok: false, code: "INVALID_SAVE" });
      }
      const { data, error } = await supabase.rpc("crimon_store_recovery_save", {
        p_account_id: session.row.account_id,
        p_revision: revision,
        p_save: save,
      });
      if (error) {
        // 別の端末が先に上げていた。**古い方で上書きしない**
        if (String(error.message).includes("STALE_REVISION")) return json(409, { ok: false, code: "STALE_REVISION" });
        throw error;
      }
      return json(200, {
        ok: true,
        revision: data?.[0]?.saved_revision ?? revision,
        savedAt: data?.[0]?.saved_at ?? new Date().toISOString(),
        sessionExpiresAt: session.expiresAt,
        arenaUserId: resolvedArenaUserId,
      });
    }

    if (action === "logout") {
      if (typeof body.sessionToken === "string") {
        const tokenHash = await sha256Base64(body.sessionToken);
        await supabase.from("crimon_recovery_sessions").delete().eq("token_hash", tokenHash);
      }
      return json(200, { ok: true });
    }

    return json(400, { ok: false, code: "UNKNOWN_ACTION" });
  } catch (error) {
    console.error(error);
    return json(500, { ok: false, code: "SERVER_ERROR" });
  }
});
