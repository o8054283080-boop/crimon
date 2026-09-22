import { PlayerState } from "./playerState.js";
import { decodeSave, encodeSave } from "./saveCodec.js";
import { parseSaveFile, serializeSaveFile } from "./saveFile.js";

export const CLOUD_RECOVERY_ENDPOINT = "https://plufhhhxokqgedlyfsfz.supabase.co/functions/v1/crimon-recovery";
export const CLOUD_RECOVERY_META_KEY = "crimon_cloud_recovery_v1";
export const CLOUD_RESTORE_BACKUP_KEY = "crimon_save_before_cloud_restore_v1";
export const CLOUD_RESTORE_BACKUP_AT_KEY = "crimon_save_before_cloud_restore_at_v1";
const PLAYER_STORAGE_KEY = "crimon_save_v1";

export interface CloudRecoveryMeta {
  recoveryId: string;
  sessionToken: string;
  sessionExpiresAt: string;
  revision: number;
  savedAt: string;
  lastUploadedSave: string;
  /** サーバが覚えている、この復旧IDのアリーナの身元。まだ無ければ未定義 */
  arenaUserId?: string | null;
}

export interface CloudSaveEnvelope {
  kind: "crimon-save";
  version: number;
  exportedAt: string;
  summary?: unknown;
  state: PlayerState;
}

interface ApiOk {
  ok: true;
  recoveryId?: string;
  recoveryKey?: string;
  revision?: number;
  savedAt?: string;
  save?: CloudSaveEnvelope;
  session?: { token: string; expiresAt: string };
  /** 使ったついでにサーバが延ばした期限。**手元の期限も一緒に進める** */
  sessionExpiresAt?: string;
  /**
   * この復旧IDが最後に使っていたアリーナの身元。
   *
   * **アリーナの身元は端末の中にしかない。**機種を変えたりサイトデータが
   * 消えたりすると新しい匿名ユーザが生まれ、名前はセーブから来るので
   * **ランキングに同じ名前で2人並ぶ**(実際に起きた)。
   * ここを突き合わせれば、「別のアカウントになっている」と気づける。
   */
  arenaUserId?: string | null;
}
interface ApiFail { ok: false; code: string }
export type CloudRecoveryResponse = ApiOk | ApiFail;

export class CloudRecoveryError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
  }
}

async function request(body: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<ApiOk> {
  const response = await fetchImpl(CLOUD_RECOVERY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({ ok: false, code: "INVALID_RESPONSE" })) as CloudRecoveryResponse;
  if (!response.ok || !data.ok) {
    throw new CloudRecoveryError(data.ok ? "SERVER_ERROR" : data.code, response.status);
  }
  return data;
}

export function currentSaveEnvelope(storage: Pick<Storage, "getItem"> = localStorage): CloudSaveEnvelope | null {
  const raw = storage.getItem(PLAYER_STORAGE_KEY);
  if (!raw) return null;
  try {
    // 縮めた形で保存されている。**生の JSON.parse では読めない**
    const state = decodeSave(raw);
    if (!state) return null;
    const parsed = parseSaveFile(serializeSaveFile(state));
    return parsed.ok ? parsed.file as CloudSaveEnvelope : null;
  } catch {
    return null;
  }
}

export function envelopeFingerprint(save: CloudSaveEnvelope): string {
  return JSON.stringify(save.state);
}

/**
 * 形だけを見て読む。**期限は見ない。**
 *
 * `loadCloudMeta` は期限切れを `null` で返すので、呼び出し側からは
 * 「登録していない」と**区別が付かない**。実際それで、
 * 自動バックアップが `if (!meta) return;` で黙って止まり、
 * プレイヤーには何も出ないまま**ひと月ぶんの遊びがサーバに届いていなかった。**
 * 「期限が切れている」と言うには、切れた本人を掴めないといけない。
 */
export function readCloudMeta(storage: Pick<Storage, "getItem"> = localStorage): CloudRecoveryMeta | null {
  try {
    const raw = storage.getItem(CLOUD_RECOVERY_META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw) as CloudRecoveryMeta;
    if (!meta.recoveryId || !meta.sessionToken || !Number.isSafeInteger(meta.revision) || meta.revision < 1) return null;
    return meta;
  } catch {
    return null;
  }
}

/** セッションの期限が切れているか。**切れていても登録はしている** */
export function isSessionExpired(meta: CloudRecoveryMeta): boolean {
  const at = new Date(meta.sessionExpiresAt).getTime();
  return !Number.isFinite(at) || at <= Date.now();
}

export function loadCloudMeta(storage: Pick<Storage, "getItem"> = localStorage): CloudRecoveryMeta | null {
  const meta = readCloudMeta(storage);
  if (!meta || isSessionExpired(meta)) return null;
  return meta;
}

export function storeCloudMeta(meta: CloudRecoveryMeta, storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(CLOUD_RECOVERY_META_KEY, JSON.stringify(meta));
}

export function clearCloudMeta(storage: Pick<Storage, "removeItem"> = localStorage): void {
  storage.removeItem(CLOUD_RECOVERY_META_KEY);
}

/**
 * この端末がクラウド復旧へつながっているか。**ホームの警告を出すかどうかの判定。**
 *
 * `loadCloudMeta` を使ってはいけない。あちらは**セッションの期限切れでも null** を返すので、
 * ちゃんと登録した人にまで「登録がまだです」と出てしまう。
 * ここで見たいのは「登録という手続きを済ませたか」なので、
 * 期限は見ずに `recoveryId` の有無だけで決める。
 *
 * 逆に、この端末の接続を解除した人には**また出る**。それでいい——
 * 解除した端末はもう復旧設定につながっておらず、消えたら戻せないのは同じだから。
 */
export function hasCloudRecoveryAccount(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    const raw = storage.getItem(CLOUD_RECOVERY_META_KEY);
    if (!raw) return false;
    const meta = JSON.parse(raw) as Partial<CloudRecoveryMeta>;
    return typeof meta.recoveryId === "string" && meta.recoveryId.length > 0;
  } catch {
    return false;
  }
}

/**
 * ホームに出す警告の種類。
 *
 * ## なぜ2種類要るのか
 *
 * 前は「登録したか」だけを見ていた。**登録さえしていれば警告は出ない。**
 * ところがセッションは30日で切れ、切れた後はバックアップが黙って止まる。
 * 結果、**いちばん危ない人**——登録はしたがもう届いていない人——にだけ
 * 何も出ていなかった。「ログインしているのに保存されていない」がこれ。
 *
 * `"EXPIRED"` は登録済みで期限切れ。やることが違う(登録ではなくログインし直し)
 * ので、文面も飛び先も分ける。
 */
export type CloudRecoveryWarning = "NONE" | "UNREGISTERED" | "EXPIRED";

export function cloudRecoveryWarning(storage: Pick<Storage, "getItem"> = localStorage): CloudRecoveryWarning {
  if (!hasCloudRecoveryAccount(storage)) return "UNREGISTERED";
  const meta = readCloudMeta(storage);
  if (!meta || isSessionExpired(meta)) return "EXPIRED";
  return "NONE";
}

function metaFromAuth(recoveryId: string, data: ApiOk, save: CloudSaveEnvelope): CloudRecoveryMeta {
  if (!data.session || !data.revision || !data.savedAt) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return {
    recoveryId,
    sessionToken: data.session.token,
    sessionExpiresAt: data.session.expiresAt,
    revision: data.revision,
    savedAt: data.savedAt,
    lastUploadedSave: envelopeFingerprint(save),
    arenaUserId: data.arenaUserId ?? null,
  };
}

export async function registerRecovery(
  recoveryId: string,
  password: string,
  save: CloudSaveEnvelope,
  arenaUserId?: string | null,
): Promise<{ meta: CloudRecoveryMeta; recoveryKey: string }> {
  const normalized = recoveryId.trim().toLowerCase();
  const data = await request({ action: "register", recoveryId: normalized, password, save, arenaUserId });
  if (!data.recoveryKey) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return { meta: metaFromAuth(normalized, data, save), recoveryKey: data.recoveryKey };
}

export async function loginRecovery(recoveryId: string, password: string, arenaUserId?: string | null): Promise<{ meta: CloudRecoveryMeta; save: CloudSaveEnvelope }> {
  const normalized = recoveryId.trim().toLowerCase();
  const data = await request({ action: "login", recoveryId: normalized, password, arenaUserId });
  if (!data.save) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return { meta: metaFromAuth(normalized, data, data.save), save: data.save };
}

export async function recoverWithKey(recoveryId: string, recoveryKey: string, arenaUserId?: string | null): Promise<{ meta: CloudRecoveryMeta; save: CloudSaveEnvelope }> {
  const normalized = recoveryId.trim().toLowerCase();
  const data = await request({ action: "recover", recoveryId: normalized, recoveryKey: recoveryKey.trim().toUpperCase(), arenaUserId });
  if (!data.save) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return { meta: metaFromAuth(normalized, data, data.save), save: data.save };
}

export async function loadLatestCloud(meta: CloudRecoveryMeta): Promise<{ meta: CloudRecoveryMeta; save: CloudSaveEnvelope }> {
  const data = await request({ action: "load", sessionToken: meta.sessionToken });
  if (!data.save || !data.revision || !data.savedAt) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return {
    save: data.save,
    meta: {
      ...meta,
      revision: data.revision,
      savedAt: data.savedAt,
      lastUploadedSave: envelopeFingerprint(data.save),
      sessionExpiresAt: data.sessionExpiresAt ?? meta.sessionExpiresAt,
      arenaUserId: data.arenaUserId ?? meta.arenaUserId ?? null,
    },
  };
}

export async function uploadCloudSave(
  meta: CloudRecoveryMeta,
  save: CloudSaveEnvelope,
  arenaUserId?: string | null,
): Promise<CloudRecoveryMeta> {
  const fingerprint = envelopeFingerprint(save);
  if (fingerprint === meta.lastUploadedSave) return meta;
  const revision = meta.revision + 1;
  // **いま使っているアリーナの身元も一緒に上げる。**機種を変えた後もここが最新になる
  const data = await request({ action: "save", sessionToken: meta.sessionToken, revision, save, arenaUserId });
  if (!data.savedAt) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  /*
   * **サーバが延ばした期限を受け取る。**
   *
   * 前は `...meta` で古い期限を持ち回っていたので、毎日上げている人でも
   * 発行から30日でいきなり切れた。切れた後は黙って止まるので、
   * プレイヤーには何も起きていないように見えていた。
   */
  return {
    ...meta,
    revision,
    savedAt: data.savedAt,
    lastUploadedSave: fingerprint,
    sessionExpiresAt: data.sessionExpiresAt ?? meta.sessionExpiresAt,
    arenaUserId: arenaUserId ?? meta.arenaUserId ?? null,
  };
}

export async function logoutRecovery(meta: CloudRecoveryMeta): Promise<void> {
  try { await request({ action: "logout", sessionToken: meta.sessionToken }); } catch { /* local disconnect must still work */ }
}

export function restoreCloudSave(save: CloudSaveEnvelope, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  const parsed = parseSaveFile(JSON.stringify(save));
  if (!parsed.ok) throw new Error(parsed.reason);
  const current = storage.getItem(PLAYER_STORAGE_KEY);
  if (current) {
    storage.setItem(CLOUD_RESTORE_BACKUP_KEY, current);
    storage.setItem(CLOUD_RESTORE_BACKUP_AT_KEY, new Date().toISOString());
  }
  storage.setItem(PLAYER_STORAGE_KEY, encodeSave(parsed.file.state));
}

export function restoreBeforeCloudRecovery(storage: Pick<Storage, "getItem" | "setItem"> = localStorage): boolean {
  const backup = storage.getItem(CLOUD_RESTORE_BACKUP_KEY);
  if (!backup) return false;
  try {
    // 退避した控えも縮めた形。**戻す時も同じ道を通す**
    const state = decodeSave(backup);
    if (!state) return false;
    const parsed = parseSaveFile(serializeSaveFile(state));
    if (!parsed.ok) return false;
    storage.setItem(PLAYER_STORAGE_KEY, encodeSave(state));
    return true;
  } catch {
    return false;
  }
}

export function cloudRecoveryMessage(error: unknown): string {
  const code = error instanceof CloudRecoveryError ? error.code : "NETWORK";
  const messages: Record<string, string> = {
    INVALID_RECOVERY_ID: "復旧IDは半角英字で始まる4〜20文字（英数字・.-_）にしてください。",
    INVALID_PASSWORD: "パスワードは6文字以上にしてください。",
    INVALID_SAVE: "現在のセーブデータを安全に確認できませんでした。クラウドには保存していません。",
    RECOVERY_ID_TAKEN: "その復旧IDはすでに使われています。別のIDを選んでください。",
    INVALID_CREDENTIALS: "復旧IDまたはパスワード／復旧キーが違います。",
    TEMPORARILY_LOCKED: "入力失敗が続いたため15分間ロックされています。",
    SESSION_INVALID: "クラウド接続の期限が切れました。もう一度ログインしてください。",
    STALE_REVISION: "別の端末または新しいデータがクラウドにあります。古いデータでは上書きしませんでした。",
    NETWORK: "クラウドに接続できませんでした。端末内のセーブはそのままです。",
  };
  return messages[code] ?? "クラウド処理に失敗しました。端末内のセーブは変更していません。";
}
