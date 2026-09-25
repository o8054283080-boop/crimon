import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto, createHash } from "node:crypto";
import ts from "typescript";
import * as progress from "../supabase/functions/crimon-admin/progress.js";

function handler(file: string, client: unknown) {
  let serve!: (req: Request) => Promise<Response>;
  const source = readFileSync(new URL(`../supabase/functions/${file}/index.ts`, import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    ...progress, createClient: () => client,
    Deno: { env: { get: () => "test-secret" }, serve: (fn: typeof serve) => { serve = fn; } },
    Response, Request, TextEncoder, TextDecoder, crypto: webcrypto, btoa, atob, console: { error: vi.fn() }, setTimeout,
  });
  return serve;
}
const request = (body: unknown, bearer = "valid-token") => new Request("https://example.test", {
  method: "POST", headers: { Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body),
});
const save = { kind: "crimon-save", version: 1, state: { monsters: [{}], equipment: [] } };

describe("保存APIの書き込み境界", () => {
  it("送信JSONのuser_idを無視して検証済み本人のsnapshotだけを書き込む", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upsert });
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
    const call = handler("crimon-player-snapshot", { from, auth: { getUser } });
    const response = await call(request({ user_id: "someone-else", save }));
    expect(response.status).toBe(200);
    expect(getUser).toHaveBeenCalledWith("valid-token");
    expect(from.mock.calls).toEqual([["crimon_player_snapshots"]]);
    expect(upsert.mock.calls[0][0]).toMatchObject({ user_id: "verified-user", save });
  });
  it("認証エラー時にはDBを書かない", async () => {
    const from = vi.fn();
    const call = handler("crimon-player-snapshot", { from, auth: { getUser: async () => ({ data: { user: null }, error: {} }) } });
    expect((await call(request({ save }))).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("DB未適用は503、null本文は400を返し例外で落ちない", async () => {
    const client = { from: () => ({ upsert: async () => ({ error: { code: "42P01" } }) }), auth: { getUser: async () => ({ data: { user: { id: "verified-user" } }, error: null }) } };
    const call = handler("crimon-player-snapshot", client);
    expect((await call(request({ save }))).status).toBe(503);
    expect((await call(request(null))).status).toBe(400);
  });
});

async function dashboard(failedTable?: string, rows: Record<string, unknown[]> = {}) {
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table);
    const result = table === "crimon_admin_settings"
      ? { data: { value: createHash("sha256").update("test-password").digest("hex") }, error: null }
      : { data: rows[table] ?? (table === "arena_profiles" ? Array.from({ length: 5 }, (_, i) => ({ user_id: `existing-${i}` })) : []), error: table === failedTable ? { code: "42P01" } : null };
    const query: Record<string, unknown> = { then: (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve) };
    for (const name of ["select", "eq", "order", "limit", "gte", "maybeSingle"]) query[name] = () => query;
    return query;
  };
  const call = handler("crimon-admin", { from, auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } } });
  const login = await (await call(request({ action: "login", password: "test-password" }))).json();
  const response = await call(request({ action: "dashboard", token: login.token }));
  return { response, tables, body: await response.json() };
}

describe("管理APIは取得失敗を0件にしない", () => {
  it("snapshot未適用でも既存アリーナ5件を表示できる", async () => {
    const { response, body } = await dashboard("crimon_player_snapshots");
    expect(response.status).toBe(200);
    expect(body.arenaPlayers).toHaveLength(5);
    expect(body.snapshotStatus).toBe("unavailable");
  });
  it("端末の別バックアップの表が無くても、一覧は出して取得失敗を伝える", async () => {
    const { response, body } = await dashboard("crimon_recovery_conflict_copies");
    expect(response.status).toBe(200);
    expect(body.conflictCopyStatus).toBe("unavailable");
  });
  it("アリーナ取得失敗なら503として通知する", async () => {
    const { response, body } = await dashboard("arena_profiles");
    expect(response.status).toBe(503);
    expect(body.error).toBe("dashboard_read_failed");
  });
});

describe("復旧保存の競合はアリーナに副作用を起こさない", () => {
  for (const conflict of [false, true]) {
    it(conflict ? "世代競合なら409、戦績とIDは不変" : "保存成功時も元のIDを返し戦績を移さない", async () => {
      const writes: string[] = [];
      const from = (table: string) => {
        const data = table === "crimon_recovery_sessions"
          ? { id: "session", account_id: "account", expires_at: "2099-01-01T00:00:00Z" }
          : { arena_user_id: "original-arena-id" };
        const query: Record<string, unknown> = { then: (resolve: (v: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve) };
        for (const method of ["select", "eq", "single", "maybeSingle"]) query[method] = () => query;
        query.update = () => { writes.push(table); return query; };
        return query;
      };
      const rpc = vi.fn().mockResolvedValue(conflict
        ? { error: { message: "STALE_REVISION" } }
        : { data: [{ saved_revision: 10, saved_at: "2026-09-25" }], error: null });
      const call = handler("crimon-recovery", { from, rpc });
      const response = await call(request({ action: "save", sessionToken: "test-session-token-abcdefghijklmnopqrstuvwxyz", revision: 10, save, arenaUserId: "11111111-1111-4111-8111-111111111111" }));
      expect(response.status).toBe(conflict ? 409 : 200);
      expect(rpc.mock.calls.map(args => args[0])).toEqual(["crimon_store_recovery_save"]);
      expect(writes).toEqual(["crimon_recovery_sessions"]);
      if (!conflict) expect((await response.json()).arenaUserId).toBe("original-arena-id");
    });
  }
});

/*
 * 競合した端末の控え(save_copy)。依頼主の指定:
 * 「競合したら最新の端末データを別のバックアップとして自動保存し、既存のバックアップも残す」。
 * 本来のバックアップ(crimon_store_recovery_save / crimon_recovery_accounts)とアリーナには触れない。
 */
describe("競合した端末の控えは、本来のバックアップとアリーナに触れない", () => {
  function harness() {
    const writes: { table: string; op: string; row?: unknown; onConflict?: string }[] = [];
    const from = (table: string) => {
      const data = table === "crimon_recovery_sessions"
        ? { id: "session", account_id: "account-1", expires_at: "2099-01-01T00:00:00Z" }
        : { arena_user_id: "original-arena-id" };
      const query: Record<string, unknown> = { then: (resolve: (v: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve) };
      for (const method of ["select", "eq", "single", "maybeSingle"]) query[method] = () => query;
      query.update = () => { writes.push({ table, op: "update" }); return query; };
      query.upsert = (row: unknown, options: { onConflict?: string }) => { writes.push({ table, op: "upsert", row, onConflict: options?.onConflict }); return query; };
      query.insert = () => { writes.push({ table, op: "insert" }); return query; };
      return query;
    };
    const rpc = vi.fn();
    return { call: handler("crimon-recovery", { from, rpc }), writes, rpc };
  }
  const token = "test-session-token-abcdefghijklmnopqrstuvwxyz";

  it("端末ごとの控えを1行で上書きし、世代・本来の控え・アリーナは動かさない", async () => {
    const { call, writes, rpc } = harness();
    const response = await call(request({ action: "save_copy", sessionToken: token, deviceId: "0123456789abcdef", baseRevision: 7, save }));
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    const copy = writes.find((w) => w.table === "crimon_recovery_conflict_copies");
    expect(copy?.op).toBe("upsert");
    expect(copy?.onConflict).toBe("account_id,device_id");
    expect(copy?.row).toMatchObject({ account_id: "account-1", device_id: "0123456789abcdef", base_revision: 7 });
    // セッションの最終利用の記録以外に、書き込み先は控えの表だけ
    expect(writes.map((w) => w.table).filter((t) => t !== "crimon_recovery_sessions")).toEqual(["crimon_recovery_conflict_copies"]);
  });

  it("端末番号や中身が不正なら書き込まない", async () => {
    const { call, writes } = harness();
    for (const body of [
      { action: "save_copy", sessionToken: token, deviceId: "../x", save },
      { action: "save_copy", sessionToken: token, deviceId: "0123456789abcdef", save: { kind: "crimon-save", version: 1, state: { monsters: [], equipment: [] } } },
    ]) {
      expect((await call(request(body))).status).toBe(400);
    }
    expect(writes.filter((w) => w.table === "crimon_recovery_conflict_copies")).toEqual([]);
  });
});

/*
 * 依頼主「新しいデータが見れないと何の意味もありません」。
 * 保存が分かれた人は、本来のバックアップが止まっている。管理画面の行は、いちばん新しい方(端末の控え)から出す。
 */
describe("管理画面は、保存が分かれた人のいちばん新しいデータを出す", () => {
  const saveOf = (level: number, gold: number) => ({ kind: "crimon-save", version: 1, summary: { fighterName: "ドラ", fighterLevel: level, gold, crystal: 1, monsterCount: 3, equipmentCount: 2 }, state: { fighterName: "ドラ", monsters: [{}], equipment: [] } });
  const account = { id: "acc-1", recovery_id: "dora", latest_revision: 5, latest_saved_at: "2026-09-20T00:00:00Z", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-20T00:00:00Z", latest_save: saveOf(60, 100) };

  it("控えの方が新しければ、行の値と日時を控えから出し、本来の方も並べて返す", async () => {
    const { body } = await dashboard(undefined, {
      crimon_recovery_accounts: [account],
      crimon_recovery_conflict_copies: [{ account_id: "acc-1", device_id: "0123456789abcdef", save: saveOf(70, 900), base_revision: 5, saved_at: "2026-09-25T00:00:00Z" }],
    });
    const row = body.recoveryAccounts[0];
    expect(row.newestSource).toBe("COPY");
    expect(row.shownSavedAt).toBe("2026-09-25T00:00:00Z");
    expect(row.fighterLevel).toBe(70);
    expect(row.gold).toBe(900);
    expect(row.conflictCopies).toHaveLength(1);
    expect(row.main).toMatchObject({ fighterLevel: 60, gold: 100, savedAt: "2026-09-20T00:00:00Z" });
    expect(body.conflictCopyStatus).toBe("ready");
  });

  it("控えより本来の方が新しければ、本来の方を出す(控えは比較用に並べる)", async () => {
    const { body } = await dashboard(undefined, {
      crimon_recovery_accounts: [{ ...account, latest_saved_at: "2026-09-26T00:00:00Z" }],
      crimon_recovery_conflict_copies: [{ account_id: "acc-1", device_id: "0123456789abcdef", save: saveOf(70, 900), base_revision: 5, saved_at: "2026-09-25T00:00:00Z" }],
    });
    const row = body.recoveryAccounts[0];
    expect(row.newestSource).toBe("MAIN");
    expect(row.fighterLevel).toBe(60);
    expect(row.conflictCopies).toHaveLength(1);
  });

  it("控えが無い人は、これまでどおり本来のバックアップだけ", async () => {
    const { body } = await dashboard(undefined, { crimon_recovery_accounts: [account] });
    const row = body.recoveryAccounts[0];
    expect(row.newestSource).toBe("MAIN");
    expect(row.conflictCopies).toEqual([]);
    expect(row.main).toBeNull();
  });
});
