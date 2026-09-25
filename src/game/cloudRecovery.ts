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
  /** 内容の競合は、本人が保存元を選ぶまで保持する。 */
  syncConflict?: boolean;
  /** 送信済み・応答未確認の内容。応答欠落後も保存元の連続性を確認する。 */
  pendingSaveHash?: string;
  savedAt: string;
  lastUploadedSave: string;
  /** サーバが覚えている、この復旧IDのアリーナの身元。まだ無ければ未定義 */
  arenaUserId?: string | null;
  /**
   * 競合中の控え(`save_copy`)の端末番号。一度決めたら変えない。
   * 同じ端末からの控えはサーバの同じ行を上書きする(際限なく増やさない)。
   */
  deviceCopyId?: string;
  /** 競合中に、この端末の最新データを別のバックアップとして控えた日時 */
  conflictCopySavedAt?: string;
  /** 最後に控えた内容。変わっていなければ送り直さない */
  conflictCopyFingerprint?: string;
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
  return saveEnvelopeFromRaw(storage.getItem(PLAYER_STORAGE_KEY));
}

/** 端末に保存されている形(縮めた文字列)から、クラウドへ送る形を作る */
export function saveEnvelopeFromRaw(raw: string | null): CloudSaveEnvelope | null {
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
export type CloudRecoveryWarning = "NONE" | "UNREGISTERED" | "EXPIRED" | "CONFLICT";

export function cloudRecoveryWarning(storage: Pick<Storage, "getItem"> = localStorage): CloudRecoveryWarning {
  if (!hasCloudRecoveryAccount(storage)) return "UNREGISTERED";
  const meta = readCloudMeta(storage);
  if (!meta || isSessionExpired(meta)) return "EXPIRED";
  return meta.syncConflict ? "CONFLICT" : "NONE";
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
  if (!meta.syncConflict && fingerprint === meta.lastUploadedSave) return meta;
  /*
   * **競合中は、本来のバックアップへ書きに行かない。**
   * 別の端末の続きを上書きしないため。代わりに、クラウドが追いついていれば解消し、
   * そうでなければこの端末の最新データを別のバックアップとして控える。
   */
  if (meta.syncConflict) return syncWhileConflicted(meta, save);
  const revision = meta.revision + 1;
  // **いま使っているアリーナの身元も一緒に上げる。**機種を変えた後もここが最新になる
  let data: ApiOk;
  try {
    data = await request({ action: "save", sessionToken: meta.sessionToken, revision, save, arenaUserId });
  } catch (error) {
    if (!(error instanceof CloudRecoveryError) || error.code !== "STALE_REVISION") throw error;
    return reconcileCloudSave(meta, save, arenaUserId);
  }
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
    revision: data.revision ?? revision,
    syncConflict: false,
    pendingSaveHash: undefined,
    savedAt: data.savedAt,
    lastUploadedSave: fingerprint,
    sessionExpiresAt: data.sessionExpiresAt ?? meta.sessionExpiresAt,
    arenaUserId: data.arenaUserId ?? meta.arenaUserId ?? null,
  };
}

/** JSONBでキー順が変わっても、同じ内容として比較する。配列の順序は維持する。 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

async function saveHash(state: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(state));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** 通信を始める前に保存する。終了時に応答を受け取れなくても次回照合できる。 */
export async function pendingCloudMeta(meta: CloudRecoveryMeta, save: CloudSaveEnvelope): Promise<CloudRecoveryMeta> {
  return { ...meta, pendingSaveHash: await saveHash(save.state) };
}

async function reconcileCloudSave(meta: CloudRecoveryMeta, save: CloudSaveEnvelope, arenaUserId?: string | null): Promise<CloudRecoveryMeta> {
  const latest = await loadLatestCloud(meta);
  const remote = canonical(latest.save.state);
  // サーバで保存済みだが、応答が届かなかった場合。書き直す必要はない。
  if (remote === canonical(save.state)) return { ...latest.meta, syncConflict: false, pendingSaveHash: undefined };
  if (meta.pendingSaveHash && meta.pendingSaveHash === await saveHash(latest.save.state)) {
    return saveConfirmedCloud(latest.meta, save, arenaUserId);
  }
  let base: unknown = null;
  try { base = JSON.parse(meta.lastUploadedSave); } catch { base = null; }
  // 世代だけを合わせてはいけない。既知の保存内容と一致した時だけ一度再送する。
  if (base !== null && remote === canonical(base)) return saveConfirmedCloud(latest.meta, save, arenaUserId);
  /*
   * **内容が分かれている。**本来のバックアップ(別の端末の続きかもしれない)は上書きせず、
   * この端末の最新データを別のバックアップとして控える。
   * 本人に操作を頼まなくても、この端末の遊びがクラウドに残る。
   * どちらを本来のバックアップにするかは、後から「保存内容を確認して再開」で選べる。
   */
  return saveConflictCopy({ ...meta, syncConflict: true }, save);
}

/**
 * 競合している間の保存。クラウドがこの端末と同じ内容になっていれば(別の端末から
 * 同じデータで再開したなど)競合を解き、違えばこの端末の最新データを控える。
 */
async function syncWhileConflicted(meta: CloudRecoveryMeta, save: CloudSaveEnvelope): Promise<CloudRecoveryMeta> {
  const latest = await loadLatestCloud(meta);
  if (canonical(latest.save.state) === canonical(save.state)) {
    return { ...latest.meta, syncConflict: false, pendingSaveHash: undefined,
      conflictCopySavedAt: undefined, conflictCopyFingerprint: undefined, deviceCopyId: meta.deviceCopyId };
  }
  return saveConflictCopy({ ...meta, sessionExpiresAt: latest.meta.sessionExpiresAt }, save);
}

function newDeviceCopyId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * **この端末の最新データを、別のバックアップとして控える。**
 *
 * 本来のバックアップ(`latest_save`)・世代・アリーナのID・戦績には触れない
 * (サーバの `save_copy` がそう作ってある)。世代(`revision`)と
 * `lastUploadedSave` も進めない——進めると、次の自動保存が別の端末の続きを上書きする。
 */
export async function saveConflictCopy(meta: CloudRecoveryMeta, save: CloudSaveEnvelope): Promise<CloudRecoveryMeta> {
  const fingerprint = envelopeFingerprint(save);
  const deviceCopyId = meta.deviceCopyId ?? newDeviceCopyId();
  if (meta.conflictCopyFingerprint === fingerprint && meta.conflictCopySavedAt) {
    return { ...meta, deviceCopyId, syncConflict: true, pendingSaveHash: undefined };
  }
  const data = await request({ action: "save_copy", sessionToken: meta.sessionToken, deviceId: deviceCopyId, baseRevision: meta.revision, save });
  if (!data.savedAt) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return {
    ...meta,
    deviceCopyId,
    syncConflict: true,
    pendingSaveHash: undefined,
    conflictCopySavedAt: data.savedAt,
    conflictCopyFingerprint: fingerprint,
    sessionExpiresAt: data.sessionExpiresAt ?? meta.sessionExpiresAt,
  };
}

/** 確認した世代の次だけを送る。確認後に他端末が保存したら、再競合として止める。 */
export async function saveConfirmedCloud(meta: CloudRecoveryMeta, save: CloudSaveEnvelope, arenaUserId?: string | null): Promise<CloudRecoveryMeta> {
  const revision = meta.revision + 1;
  const data = await request({ action: "save", sessionToken: meta.sessionToken, revision, save, arenaUserId });
  if (!data.savedAt || data.revision !== revision) throw new CloudRecoveryError("INVALID_RESPONSE", 500);
  return { ...meta, revision, savedAt: data.savedAt, lastUploadedSave: envelopeFingerprint(save),
    syncConflict: false, pendingSaveHash: undefined, sessionExpiresAt: data.sessionExpiresAt ?? meta.sessionExpiresAt,
    arenaUserId: data.arenaUserId ?? meta.arenaUserId ?? null,
    conflictCopySavedAt: undefined, conflictCopyFingerprint: undefined };
}

/**
 * 開いた時にクラウドと合わせる。**いちばん後で遊んだ端末のデータに揃える。**
 *
 * ## なぜ要るのか
 *
 * 前は、端末はクラウドへ「上げる」だけで、開いた時に「取りに行く」ことをしなかった。
 * だから別の端末で遊んだ後にこちらを開くと、古いデータのまま遊び始め、
 * 次の保存で世代がぶつかって**保存が2つに分かれていた。**
 * 依頼主「ログインした時点でそのアカウントに合わせるだけではだめなんですか？」——
 * その通りなので、開くたびに(復帰した時も)クラウドを見に行く。
 *
 * - `IN_SYNC`     … 同じ内容。分かれていた印を消すだけ
 * - `UP_TO_DATE`  … 他の端末は保存していない。いつも通り上げればよい
 * - `ADOPT_CLOUD` … 他の端末で後から遊んでいる。クラウドのデータに合わせる
 * - `KEEP_LOCAL`  … この端末の方が後で遊ばれている。この端末のデータでクラウドを更新する
 *
 * 「後で遊んだ」は、この端末がセーブを最後に書いた時刻と、クラウドの保存時刻で比べる。
 * 最後に上げた後この端末で何も遊んでいなければ、比べるまでもなくクラウドに合わせる。
 * **どちらに揃えても、負けた方は別のバックアップとしてクラウドに残す**(黙って消さない)。
 */
export type OpenSyncDecision = "IN_SYNC" | "UP_TO_DATE" | "ADOPT_CLOUD" | "KEEP_LOCAL";

export function decideOpenSync(args: {
  meta: CloudRecoveryMeta;
  local: CloudSaveEnvelope;
  /** この端末がセーブを最後に書いた時刻。分からなければ null */
  localTouchedAt: number | null;
  cloud: { revision: number; savedAt: string; save: CloudSaveEnvelope };
}): { decision: OpenSyncDecision; localChanged: boolean } {
  const { meta, local, cloud } = args;
  if (canonical(cloud.save.state) === canonical(local.state)) return { decision: "IN_SYNC", localChanged: false };
  // 世代が進んでいない = この端末が最後に上げてから、誰もクラウドへ保存していない
  if (cloud.revision <= meta.revision) return { decision: "UP_TO_DATE", localChanged: true };
  let base: unknown = null;
  try { base = JSON.parse(meta.lastUploadedSave); } catch { base = null; }
  const localChanged = base === null || canonical(local.state) !== canonical(base);
  // 最後に上げた後、この端末では遊んでいない。別の端末の続きに合わせるだけ
  if (!localChanged) return { decision: "ADOPT_CLOUD", localChanged };
  /*
   * **両方で遊んでいる。**後で遊んだ方に揃える。
   * 書いた時刻を持たない古い端末は、分かれた後に控えた時刻を使う。
   * どちらも無ければクラウドに合わせる(この端末のデータは控えに残す)。
   */
  const copiedAt = meta.conflictCopySavedAt ? Date.parse(meta.conflictCopySavedAt) : Number.NaN;
  const localAt = args.localTouchedAt ?? (Number.isFinite(copiedAt) ? copiedAt : null);
  const cloudAt = Date.parse(cloud.savedAt);
  if (localAt !== null && Number.isFinite(cloudAt) && localAt > cloudAt) return { decision: "KEEP_LOCAL", localChanged };
  return { decision: "ADOPT_CLOUD", localChanged };
}

/** クラウドの本来のバックアップを、この端末のデータで置き換える前に控える行の番号 */
export const REPLACED_MAIN_COPY_ID = "replaced-main";

export type OpenSyncResult =
  | { kind: "IN_SYNC" | "UP_TO_DATE" | "KEEP_LOCAL"; meta: CloudRecoveryMeta }
  | { kind: "ADOPT_CLOUD"; meta: CloudRecoveryMeta; save: CloudSaveEnvelope; keptLocalCopy: boolean };

/**
 * `decideOpenSync` の判断を実行する。**端末のセーブは書き換えない**
 * (`ADOPT_CLOUD` の時に書き換えて読み直すのは画面側の仕事)。
 *
 * @param local       判断に使う端末のデータ(起動直後なら、このページが書く前の姿)
 * @param currentSave `KEEP_LOCAL` の時にクラウドへ上げる、いまの端末のデータ
 */
export async function syncOnOpen(
  meta: CloudRecoveryMeta,
  local: CloudSaveEnvelope,
  localTouchedAt: number | null,
  currentSave: () => CloudSaveEnvelope | null,
  arenaUserId?: string | null,
): Promise<OpenSyncResult> {
  const latest = await loadLatestCloud(meta);
  const cleared = { syncConflict: false, pendingSaveHash: undefined, conflictCopySavedAt: undefined, conflictCopyFingerprint: undefined };
  const { decision, localChanged } = decideOpenSync({
    meta, local, localTouchedAt,
    cloud: { revision: latest.meta.revision, savedAt: latest.meta.savedAt, save: latest.save },
  });
  if (decision === "IN_SYNC") return { kind: "IN_SYNC", meta: { ...latest.meta, ...cleared } };
  if (decision === "UP_TO_DATE") return { kind: "UP_TO_DATE", meta: { ...meta, sessionExpiresAt: latest.meta.sessionExpiresAt } };
  if (decision === "ADOPT_CLOUD") {
    // この端末でも遊んでいたなら、その姿を別のバックアップとして残してから合わせる。
    // **控えられなかったら合わせない**(この端末にしか無いデータを置き去りにしない)
    if (!localChanged) return { kind: "ADOPT_CLOUD", save: latest.save, keptLocalCopy: false, meta: { ...latest.meta, ...cleared } };
    const withCopy = await saveConflictCopy({ ...meta, sessionExpiresAt: latest.meta.sessionExpiresAt }, local);
    /*
     * 控えは「いま」の時刻で入るので、そのままだと**負けた方が一番新しく見える**
     * (管理画面は新しい方を出す)。同じ内容で本来のバックアップを保存し直し、
     * こちらが最新だと日時の上でも分かるようにする。
     */
    const touched = await saveConfirmedCloud(latest.meta, latest.save, arenaUserId);
    return { kind: "ADOPT_CLOUD", save: latest.save, keptLocalCopy: true,
      meta: { ...touched, ...cleared, deviceCopyId: withCopy.deviceCopyId } };
  }
  const save = currentSave() ?? local;
  // 置き換えられる側(別の端末の続き)も、別のバックアップとして残す
  await request({ action: "save_copy", sessionToken: meta.sessionToken, deviceId: REPLACED_MAIN_COPY_ID, baseRevision: latest.meta.revision, save: latest.save });
  const next = await saveConfirmedCloud(latest.meta, save, arenaUserId);
  return { kind: "KEEP_LOCAL", meta: { ...next, deviceCopyId: meta.deviceCopyId } };
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
    STALE_REVISION: "端末とクラウドの保存内容が異なります。この端末のデータは別のバックアップとして自動で保存しています。どちらを使うかは「保存内容を確認して再開」から選べます。",
    NETWORK: "クラウドに接続できませんでした。端末内のセーブはそのままです。",
  };
  return messages[code] ?? "クラウド処理に失敗しました。端末内のセーブは変更していません。";
}
