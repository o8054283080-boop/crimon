/// <reference types="vite/client" />
import { currentSaveEnvelope } from "../game/cloudRecovery.js";
import { arenaAuthAccessToken, arenaAuthUserId } from "./arenaAuth.js";

export const ADMIN_SNAPSHOT_RETRY_MS = 60_000;
const INTERVAL_MS = 60 * 60 * 1000;
const SUCCESS_KEY = "crimon_admin_snapshot_success_v2:";
let running = false;
let retryAt = 0;

/** 管理用の控えだけを保存する。アリーナ登録や復旧登録は行わない。 */
export async function syncAdminSnapshot(): Promise<void> {
  if (running || Date.now() < retryAt) return;
  running = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const userId = arenaAuthUserId();
    if (!userId) return;
    const env = import.meta.env;
    const base = (env?.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
    const anonKey = env?.VITE_SUPABASE_ANON_KEY;
    if (!base || !anonKey) return;
    const last = Number(localStorage.getItem(SUCCESS_KEY + userId) ?? "0");
    const age = Date.now() - last;
    if (last > 0 && age >= 0 && age < INTERVAL_MS) return;
    const save = currentSaveEnvelope();
    if (!save) return;
    retryAt = Date.now() + ADMIN_SNAPSHOT_RETRY_MS;
    const token = await arenaAuthAccessToken();
    if (!token || arenaAuthUserId() !== userId) return;
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(`${base}/functions/v1/crimon-player-snapshot`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ save }),
      signal: controller.signal,
    });
    if (!response.ok) return;
    const result = await response.json();
    if (result?.ok === true && arenaAuthUserId() === userId) {
      localStorage.setItem(SUCCESS_KEY + userId, String(Date.now()));
    }
  } catch {
    // 通信・ストレージの失敗は1分後に再試行。ゲームや復旧保存を止めない。
    retryAt = Date.now() + ADMIN_SNAPSHOT_RETRY_MS;
  } finally {
    if (timer) clearTimeout(timer);
    running = false;
  }
}
