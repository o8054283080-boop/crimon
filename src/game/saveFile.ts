import { PlayerState } from "./playerState.js";

/**
 * セーブデータの書き出し・読み込み。
 *
 * このゲームの保存先はブラウザの localStorage だけだった。
 * localStorage は「サイトのデータを削除」やアプリの入れ直しで**予告なく消える**。
 * 実際にそれで手持ちを全て失う事故を起こしている。
 * 端末にファイルとして残せる経路を必ず用意しておくこと。
 */

/** 書き出すファイルの形式。読み込み側で世代を見分けるために付ける */
const SAVE_FILE_KIND = "crimon-save";
const SAVE_FILE_VERSION = 1;

export interface SaveFile {
  kind: typeof SAVE_FILE_KIND;
  version: number;
  /** 書き出した時刻(ISO文字列)。ファイル名と、読み込み時の確認に使う */
  exportedAt: string;
  /** 取り違え防止のための概要。中身を開かなくても、どのデータか分かるようにする */
  summary: {
    fighterName: string;
    fighterLevel: number;
    monsterCount: number;
    equipmentCount: number;
    gold: number;
    crystal: number;
  };
  state: PlayerState;
}

export function buildSaveFile(state: PlayerState, now = new Date()): SaveFile {
  return {
    kind: SAVE_FILE_KIND,
    version: SAVE_FILE_VERSION,
    exportedAt: now.toISOString(),
    summary: {
      fighterName: state.fighterName,
      fighterLevel: state.fighterLevel,
      monsterCount: state.monsters.length,
      equipmentCount: state.equipment.length,
      gold: state.gold,
      crystal: state.crystal,
    },
    state,
  };
}

/** 書き出すファイル名。日時を入れて、古い控えと並べても見分けが付くようにする */
export function saveFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `crimon-save-${stamp}.json`;
}

export function serializeSaveFile(state: PlayerState, now = new Date()): string {
  return JSON.stringify(buildSaveFile(state, now), null, 2);
}

export type ParseSaveResult = { ok: true; file: SaveFile } | { ok: false; reason: string };

/**
 * 読み込んだ文字列をセーブデータとして解釈する。
 *
 * **壊れたデータで今の手持ちを上書きしてしまう方が、読み込めないことより事故が大きい。**
 * 少しでも怪しければ受け付けずに理由を返す。
 */
export function parseSaveFile(text: string): ParseSaveResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "ファイルの中身を読み取れませんでした(JSONとして壊れています)" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "セーブデータの形式ではありません" };
  }

  const file = parsed as Partial<SaveFile>;
  if (file.kind !== SAVE_FILE_KIND) {
    return { ok: false, reason: "このゲームのセーブデータではありません" };
  }
  if (typeof file.version !== "number" || file.version > SAVE_FILE_VERSION) {
    return { ok: false, reason: "新しすぎるセーブデータです。アプリを更新してから読み込んでください" };
  }

  const state = file.state as PlayerState | undefined;
  if (!state || typeof state !== "object") {
    return { ok: false, reason: "セーブデータの中身が入っていません" };
  }
  if (!Array.isArray(state.monsters) || state.monsters.length === 0) {
    return { ok: false, reason: "モンスターが1体も入っていないため、読み込みを中止しました" };
  }
  if (!Array.isArray(state.equipment)) {
    return { ok: false, reason: "装備の情報が壊れています" };
  }

  return { ok: true, file: file as SaveFile };
}

/** 読み込み前の確認に出す一文。何で上書きされるのかが分かるようにする */
export function describeSaveFile(file: SaveFile): string {
  const s = file.summary;
  const when = file.exportedAt.slice(0, 16).replace("T", " ");
  return `${when} 書き出し / ${s.fighterName} Lv${s.fighterLevel} / モンスター${s.monsterCount}体 / 装備${s.equipmentCount}個 / 🪙${s.gold} 💎${s.crystal}`;
}
