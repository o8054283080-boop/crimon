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

async function dashboard(failedTable?: string) {
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table);
    const result = table === "crimon_admin_settings"
      ? { data: { value: createHash("sha256").update("test-password").digest("hex") }, error: null }
      : { data: table === "arena_profiles" ? Array.from({ length: 5 }, (_, i) => ({ user_id: `existing-${i}` })) : [], error: table === failedTable ? { code: "42P01" } : null };
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
  it("アリーナ取得失敗なら503として通知する", async () => {
    const { response, body } = await dashboard("arena_profiles");
    expect(response.status).toBe(503);
    expect(body.error).toBe("dashboard_read_failed");
  });
});
