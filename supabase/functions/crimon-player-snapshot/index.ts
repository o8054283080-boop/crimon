import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: cors }); }
function validSave(save: unknown): boolean {
  if (!save || typeof save !== "object") return false;
  const f = save as Record<string, unknown>;
  if (f.kind !== "crimon-save" || typeof f.version !== "number" || !f.state || typeof f.state !== "object") return false;
  const state = f.state as Record<string, unknown>;
  return Array.isArray(state.monsters) && state.monsters.length > 0 && Array.isArray(state.equipment);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!bearer) return json(401, { ok: false, code: "UNAUTHORIZED" });

  // The caller's auth.uid() is derived from the verified access token. The client never supplies user_id.
  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(bearer);
  if (userError || !userData.user) return json(401, { ok: false, code: "UNAUTHORIZED" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { ok: false, code: "INVALID_JSON" }); }
  if (!body || typeof body !== "object" || Array.isArray(body) || !validSave(body.save)) return json(400, { ok: false, code: "INVALID_SAVE" });

  const { error } = await admin.from("crimon_player_snapshots").upsert({
    user_id: userData.user.id,
    save: body.save,
    saved_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) {
    console.error(error);
    return json(503, { ok: false, code: "SNAPSHOT_UNAVAILABLE" });
  }
  return json(200, { ok: true });
});
