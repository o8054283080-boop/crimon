import { PlayerState } from "./playerState.js";
import { SaveFile, parseSaveFile, serializeSaveFile } from "./saveFile.js";

/**
 * 控えが消えないようにするための手立て。
 *
 * このゲームの保存先はブラウザの localStorage だけで、そこには**2つの消え方**がある。
 *
 * 1. **本人が「サイトのデータを削除」する** — これは止められない。
 *    ファイルへの書き出しだけが救いになる(`saveFile.ts`)
 * 2. **ブラウザが勝手に消す** — 端末の空きが減った時、
 *    ブラウザは「一時的」と見なした保存領域を予告なく捨てる。
 *    実測でこのゲームは `navigator.storage.persisted() === false`、
 *    つまり**いつ捨てられてもおかしくない扱い**だった。
 *
 * ここが受け持つのは 2 の方。`persist()` を頼んで「一時的」から外してもらう。
 * 加えて、起動のたびに**1つ前の状態**を別の鍵で控えておく。
 * これは 1 も 2 も防がないが、**壊れた読み込みや操作ミスで潰した時に戻れる**。
 */

const BACKUP_KEY = "crimon_save_backup_v1";
const BACKUP_AT_KEY = "crimon_save_backup_at_v1";

export type PersistState =
  /** ブラウザが「消さない」と約束している */
  | "PERSISTED"
  /** 頼んだが断られた。いつ消えてもおかしくない */
  | "DENIED"
  /** このブラウザにはこの仕組みが無い */
  | "UNSUPPORTED";

export const PERSIST_STATE_NOTE: Record<PersistState, string> = {
  PERSISTED: "この端末では、ブラウザが自動でデータを消さない設定になっています。",
  DENIED: "端末の空きが減ると、ブラウザがデータを消すことがあります。控えを書き出しておいてください。",
  UNSUPPORTED: "このブラウザでは保護を頼めません。控えを書き出しておいてください。",
};

/**
 * 「勝手に消さないでほしい」とブラウザへ頼む。
 *
 * **断られても何も壊れない。**その時は今までと同じ扱いに戻るだけなので、
 * 起動のたびに黙って頼んでよい(既に許可されていれば `persisted()` が true を返すので、
 * 二度目以降は確認だけで済む)。
 */
export async function ensurePersistentStorage(): Promise<PersistState> {
  try {
    const storage = navigator.storage;
    if (!storage || typeof storage.persisted !== "function" || typeof storage.persist !== "function") {
      return "UNSUPPORTED";
    }
    if (await storage.persisted()) return "PERSISTED";
    return (await storage.persist()) ? "PERSISTED" : "DENIED";
  } catch {
    // 権限まわりで例外を投げるブラウザがある。保護が無いだけで、遊べなくはならない
    return "UNSUPPORTED";
  }
}

/** 控えを取った時刻。取っていなければ null */
export function backupTakenAt(): Date | null {
  try {
    const raw = localStorage.getItem(BACKUP_AT_KEY);
    if (!raw) return null;
    const at = new Date(raw);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

/**
 * 起動時の状態を控えておく。**起動のたびに1回だけ**呼ぶこと。
 *
 * 保存のたびに控えを取り直すと、壊れた状態で何度か保存された時点で
 * 控えも壊れた状態に置き換わってしまい、戻り先が無くなる。
 * 「前回このアプリを開いた時の状態」に固定してあるのは、そのため。
 */
export function takeStartupBackup(state: PlayerState): void {
  try {
    if (state.monsters.length === 0) return;
    localStorage.setItem(BACKUP_KEY, serializeSaveFile(state));
    localStorage.setItem(BACKUP_AT_KEY, new Date().toISOString());
  } catch {
    // 容量が足りない等で控えが取れないことがある。本体の保存は別経路なので続行してよい
  }
}

/** 控えを読む。無い・壊れているなら null */
export function readStartupBackup(): SaveFile | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = parseSaveFile(raw);
    return parsed.ok ? parsed.file : null;
  } catch {
    return null;
  }
}
