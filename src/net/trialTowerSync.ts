import { arenaSyncAvailable, arenaSyncConfig } from "./arenaSync.js";

const DEFAULT_TIMEOUT_MS = 8_000;

export interface TrialTowerRankingEntry {
  rank: number;
  userId: string;
  name: string;
  bestFloor: number;
  bestFloorReachedAt: string;
  updatedAt: string;
}

export type TrialTowerRankingResult =
  | { ok: true; entries: TrialTowerRankingEntry[] }
  | { ok: false; entries: [] };

export interface TrialTowerProgressResult {
  ok: true;
  updated: boolean;
  bestFloor: number;
  bestFloorReachedAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function rankingEntry(value: unknown): TrialTowerRankingEntry | null {
  if (!isRecord(value)) return null;
  if (typeof value.user_id !== "string" || !value.user_id) return null;
  if (typeof value.display_name !== "string" || !value.display_name) return null;
  if (typeof value.rank !== "number" || !Number.isFinite(value.rank)) return null;
  if (typeof value.best_floor !== "number" || !Number.isFinite(value.best_floor)) return null;
  if (!validDate(value.best_floor_reached_at) || !validDate(value.updated_at)) return null;
  return {
    rank: Math.max(1, Math.round(value.rank)),
    userId: value.user_id,
    name: value.display_name,
    bestFloor: Math.max(1, Math.min(100, Math.round(value.best_floor))),
    bestFloorReachedAt: value.best_floor_reached_at,
    updatedAt: value.updated_at,
  };
}

async function request(path: string, method: "GET" | "POST" = "GET", body?: unknown): Promise<{ ok: boolean; value: unknown }> {
  const config = arenaSyncConfig();
  if (!config) return { ok: false, value: null };
  const fetchImpl = config.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof fetchImpl !== "function") return { ok: false, value: null };

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (typeof AbortController === "function") {
      controller = new AbortController();
      timer = setTimeout(() => controller?.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    }
    const response = await fetchImpl(`${config.url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.accessToken || config.anonKey}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!response.ok) return { ok: false, value: null };
    return { ok: true, value: await response.json().catch(() => null) };
  } catch {
    return { ok: false, value: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 歴代最高階を送る。同じ階以下はサーバ側で日時を含めて変更されない。 */
export async function submitTrialTowerProgress(bestFloor: number): Promise<TrialTowerProgressResult | null> {
  try {
    if (!arenaSyncAvailable() || !Number.isInteger(bestFloor) || bestFloor < 1 || bestFloor > 100) return null;
    const response = await request("rpc/trial_tower_submit_progress", "POST", { p_best_floor: bestFloor });
    if (!response.ok || !isRecord(response.value) || response.value.ok !== true) return null;
    const value = response.value;
    if (typeof value.bestFloor !== "number" || !validDate(value.bestFloorReachedAt) || !validDate(value.updatedAt)) return null;
    return {
      ok: true,
      updated: value.updated === true,
      bestFloor: Math.max(1, Math.min(100, Math.round(value.bestFloor))),
      bestFloorReachedAt: value.bestFloorReachedAt,
      updatedAt: value.updatedAt,
    };
  } catch {
    return null;
  }
}

/** 公開ランキング。接続失敗と正常な空一覧を区別する。 */
export async function fetchTrialTowerRanking(limit = 50): Promise<TrialTowerRankingResult> {
  try {
    if (!arenaSyncAvailable()) return { ok: false, entries: [] };
    const params = new URLSearchParams({
      select: "rank,user_id,display_name,best_floor,best_floor_reached_at,updated_at",
      order: "best_floor.desc,best_floor_reached_at.asc,user_id.asc",
      limit: String(Math.max(1, Math.min(100, Math.floor(limit)))),
    });
    const response = await request(`trial_tower_public_ranking?${params.toString()}`);
    if (!response.ok || !Array.isArray(response.value)) return { ok: false, entries: [] };
    return { ok: true, entries: response.value.map(rankingEntry).filter((entry): entry is TrialTowerRankingEntry => entry !== null) };
  } catch {
    return { ok: false, entries: [] };
  }
}

/** 一覧外でも固定表示できるよう、自分の行だけ取得する。 */
export async function fetchTrialTowerSelf(userId: string | null): Promise<TrialTowerRankingEntry | null> {
  try {
    if (!arenaSyncAvailable() || !userId) return null;
    const params = new URLSearchParams({
      select: "rank,user_id,display_name,best_floor,best_floor_reached_at,updated_at",
      user_id: `eq.${userId}`,
      limit: "1",
    });
    const response = await request(`trial_tower_public_ranking?${params.toString()}`);
    if (!response.ok || !Array.isArray(response.value)) return null;
    return rankingEntry(response.value[0]);
  } catch {
    return null;
  }
}
