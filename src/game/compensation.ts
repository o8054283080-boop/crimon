import { PlayerState } from "./playerState.js";

/**
 * お詫びの配布。
 *
 * 期間中に一度アプリを開けば自動で受け取れる。受け取った記録は id で残すので、
 * 何度開いても重複して配られることはない。
 *
 * **日付は端末のローカル日付で判定する。** UTCで判定すると、時差のある地域では
 * 「その日に開いたのに受け取れない」「日付が変わる前に打ち切られる」が起きる。
 */

export interface Compensation {
  id: string;
  title: string;
  /** 何のお詫びかの説明。受け取った本人が理由を分かるようにする */
  message: string;
  /** 受け取れる期間(端末のローカル日付 YYYY-MM-DD、両端を含む) */
  fromDate: string;
  toDate: string;
  crystal: number;
  gold: number;
  summonScrolls: number;
}

/**
 * 配布の一覧。
 *
 * 2026-08-18: キャッシュの不具合を直す手順として「サイトのデータを削除」を案内した際、
 * その操作でセーブデータごと消えることを警告していなかった。実際に手持ちが全て失われた。
 */
export const COMPENSATIONS: Compensation[] = [
  {
    id: "2026-08-30-2d-transition",
    title: "2D化のお詫び",
    message: "モンスターグラフィックの2D化に伴うお詫びです。",
    fromDate: "2026-08-30",
    // 新規・既存を問わず全ユーザーが1アカウントにつき1度受け取れるよう、終了日は設けない。
    toDate: "9999-12-31",
    crystal: 3000,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-08-28-autofarm-summon-freeze",
    title: "不具合のお詫び",
    message: "自動周回中に召喚を行うと操作できなくなる場合があった不具合のお詫びです。",
    fromDate: "2026-08-28",
    toDate: "2026-09-30",
    crystal: 900,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-08-18-save-loss",
    title: "お詫びの配布",
    message: "更新の案内の不備でデータが失われた件のお詫びです。ご迷惑をおかけしました。",
    fromDate: "2026-08-18",
    toDate: "2026-08-18",
    crystal: 10000,
    gold: 1000000,
    summonScrolls: 50,
  },
];

/** 端末のローカル日付を YYYY-MM-DD で返す */
export function localDateString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isWithinPeriod(compensation: Compensation, today: string): boolean {
  return today >= compensation.fromDate && today <= compensation.toDate;
}

/** いま受け取れる配布(期間中で、まだ受け取っていないもの) */
export function pendingCompensations(state: PlayerState, now: Date = new Date()): Compensation[] {
  const today = localDateString(now);
  const claimed = new Set(state.claimedCompensationIds ?? []);
  return COMPENSATIONS.filter((c) => isWithinPeriod(c, today) && !claimed.has(c.id));
}

export interface CompensationClaim {
  compensation: Compensation;
}

/**
 * 受け取れる配布をすべて受け取る。受け取ったものを返す(無ければ空)。
 * 画面を開くたびに呼んでよい(重複しない)。
 */
export function claimCompensations(state: PlayerState, now: Date = new Date()): CompensationClaim[] {
  const claims: CompensationClaim[] = [];
  for (const compensation of pendingCompensations(state, now)) {
    state.crystal += compensation.crystal;
    state.gold += compensation.gold;
    state.summonScrolls += compensation.summonScrolls;
    state.claimedCompensationIds.push(compensation.id);
    claims.push({ compensation });
  }
  return claims;
}
