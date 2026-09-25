import {
  CLOUD_RESTORE_BACKUP_AT_KEY,
  CloudRecoveryMeta,
  CloudRecoveryError,
  saveConfirmedCloud,
  pendingCloudMeta,
  cloudRecoveryMessage,
  clearCloudMeta,
  currentSaveEnvelope,
  isSessionExpired,
  loadCloudMeta,
  loadLatestCloud,
  loginRecovery,
  logoutRecovery,
  readCloudMeta,
  recoverWithKey,
  registerRecovery,
  restoreBeforeCloudRecovery,
  restoreCloudSave,
  saveEnvelopeFromRaw,
  storeCloudMeta,
  syncOnOpen,
  uploadCloudSave,
  type CloudSaveEnvelope,
} from "../game/cloudRecovery.js";
import { SAVE_TOUCHED_AT_KEY, startupSaveSnapshot } from "../game/playerState.js";
import { arenaAuthUserId } from "../net/arenaAuth.js";

import { syncAdminSnapshot, ADMIN_SNAPSHOT_RETRY_MS } from "../net/playerSnapshot.js";

const PANEL_MARKER = "data-crimon-cloud-recovery";
/*
 * クラウドへ控えを上げる間隔。
 *
 * **12時間に1回だった。**端末が壊れた人は半日ぶんを失うし、
 * 管理者画面から見えるレベルや所持品も**最大12時間古い**
 * (「遅れすぎている」という指摘の出どころがこれ)。
 *
 * セーブはJSON1本で軽い。1時間ごとなら、遊んでいる人の通信も
 * 1日に数回で済む。**上げるのは中身が変わった時だけ**
 * (`uploadCloudSave` が同じ内容なら世代を増やさない)。
 */
const AUTO_SYNC_MS = 60 * 60 * 1000;
/** これより古い控えは「置いていかれている」扱いにして、短い間隔で追いつかせる */
const STALE_BACKUP_MS = 3 * 60 * 60 * 1000;
/** 48時間以上古い場合は、起動直後の同期を待たず強制的に試す。アカウント再登録は絶対に行わない。 */
const FORCE_BACKUP_MS = 48 * 60 * 60 * 1000;
const STALE_RETRY_MS = 20 * 60 * 1000;
const LAST_ATTEMPT_KEY = "crimon_cloud_backup_last_attempt_v1";
let syncRunning = false;
let conflictDetected = false;
let statusText = "";
let statusTone: "ok" | "warn" | "error" = "ok";

function setStatus(message: string, tone: typeof statusTone = "ok") {
  statusText = message;
  statusTone = tone;
  document.querySelectorAll<HTMLElement>(`[${PANEL_MARKER}] .cloud-recovery__status`).forEach((node) => {
    node.textContent = message;
    node.dataset.tone = tone;
  });
}

function formatSavedAt(value: string | null | undefined): string {
  if (!value) return "未保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未保存";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function button(label: string, className: string, onclick: () => void | Promise<void>): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.onclick = () => { void onclick(); };
  return node;
}

function input(type: string, placeholder: string, autocomplete?: string): HTMLInputElement {
  const node = document.createElement("input");
  node.type = type;
  node.placeholder = placeholder;
  node.className = "cloud-recovery__input";
  if (autocomplete) node.setAttribute("autocomplete", autocomplete);
  return node;
}

function summaryText(save: CloudSaveEnvelope): string {
  const summary = save.summary as Record<string, unknown> | undefined;
  const state = save.state;
  const fighter = typeof summary?.fighterName === "string" ? summary.fighterName : state.fighterName;
  const level = typeof summary?.fighterLevel === "number" ? summary.fighterLevel : state.fighterLevel;
  const monsters = typeof summary?.monsterCount === "number" ? summary.monsterCount : state.monsters.length;
  const equipment = typeof summary?.equipmentCount === "number" ? summary.equipmentCount : state.equipment.length;
  const gold = typeof summary?.gold === "number" ? summary.gold : state.gold;
  const crystal = typeof summary?.crystal === "number" ? summary.crystal : state.crystal;
  return `${fighter} / Lv.${level} / モンスター${monsters}体 / 装備${equipment}個 / ゴールド${Number(gold).toLocaleString("ja-JP")} / ダイヤ${Number(crystal).toLocaleString("ja-JP")}`;
}

function backupAge(meta: CloudRecoveryMeta): number {
  const savedAt = meta.savedAt ? new Date(meta.savedAt).getTime() : 0;
  return savedAt > 0 ? Date.now() - savedAt : Number.POSITIVE_INFINITY;
}

function shouldRunScheduledSync(meta: CloudRecoveryMeta): boolean {
  const lastAttempt = Number(localStorage.getItem(LAST_ATTEMPT_KEY) ?? "0");
  const sinceAttempt = !Number.isFinite(lastAttempt) || lastAttempt <= 0 ? Number.POSITIVE_INFINITY : Date.now() - lastAttempt;
  if (backupAge(meta) >= STALE_BACKUP_MS) return sinceAttempt >= STALE_RETRY_MS;
  return sinceAttempt >= AUTO_SYNC_MS;
}

/**
 * セッションが切れている時に、**黙って止まらない。**
 *
 * ## 何が起きていたか
 *
 * セッションはサーバ側で**発行から30日**(`crimon-recovery` の `SESSION_DAYS`)。
 * 使っても延びなかったので、毎日遊んでいる人でも30日目にいきなり切れる。
 *
 * 切れると `loadCloudMeta()` が `null` を返し、ここが `if (!meta) return;` で
 * **何も言わずに終わっていた。**ホームの警告も出ない
 * (`hasCloudRecoveryAccount` は期限を見ないので「登録済み」のまま)。
 * つまりプレイヤーからは**何も起きていないように見えたまま、
 * ひと月ぶんの遊びがサーバに届かない。**
 * 依頼主の「ログインしているはずなのに保存されていません」がこれ。
 *
 * いまはサーバが使うたびに期限を延ばすので、遊んでいれば切れない。
 * それでも切れた時は**ここで声を上げる。**
 */
function expiredNotice(): void {
  setStatus("クラウドのセッションが切れています。下の「復旧IDでログイン」からログインし直すと、バックアップが再開します。", "error");
  for (const node of document.querySelectorAll<HTMLElement>("[data-cloud-recovery-warning]")) {
    node.dataset.cloudExpired = "1";
  }
}

async function syncNow(showUnchanged = false, scheduled = false): Promise<void> {
  if (syncRunning) return;
  if (conflictDetected && !showUnchanged) return;
  const stored = readCloudMeta();
  // 登録していない人はここで終わり。**警告はホーム側が出している**
  if (!stored) return;
  if (isSessionExpired(stored)) {
    expiredNotice();
    return;
  }
  const meta = loadCloudMeta();
  if (!meta) return;
  // 強制更新も既存セッションの save だけを使う。register/login は呼ばず、recoveryId を作り直さない。
  if (scheduled && backupAge(meta) < FORCE_BACKUP_MS && !shouldRunScheduledSync(meta)) return;
  if (scheduled) localStorage.setItem(LAST_ATTEMPT_KEY, String(Date.now()));
  const save = currentSaveEnvelope();
  if (!save) {
    setStatus("端末セーブを確認できないため、クラウド更新を止めました。", "error");
    return;
  }
  syncRunning = true;
  try {
    storeCloudMeta(await pendingCloudMeta(meta, save));
    const next = await uploadCloudSave(meta, save, arenaAuthUserId());
    storeCloudMeta(next);
    if (next.syncConflict) {
      /*
       * **競合していても止まらない。**この端末の最新データは別のバックアップとして
       * クラウドへ控えた(本来のバックアップと世代・アリーナには触れていない)。
       * 本来のバックアップをどちらにするかは、本人が「保存内容を確認して再開」で選ぶ。
       */
      conflictDetected = false;
      localStorage.setItem(LAST_ATTEMPT_KEY, String(Date.now()));
      if (!meta.syncConflict) document.querySelectorAll<HTMLElement>(`[${PANEL_MARKER}]`).forEach(panel => renderPanelInto(panel));
      if (showUnchanged || next.conflictCopySavedAt !== meta.conflictCopySavedAt) {
        setStatus(`クラウドの保存内容と異なるため、この端末のデータを別のバックアップとして保存しました：${formatSavedAt(next.conflictCopySavedAt ?? new Date().toISOString())}。元のバックアップも残しています。`, "ok");
      }
      return;
    }
    conflictDetected = false;
    if (scheduled || next.revision !== meta.revision) localStorage.setItem(LAST_ATTEMPT_KEY, String(Date.now()));
    if (next.revision !== meta.revision) {
      setStatus(`バックアップ済み：${formatSavedAt(next.savedAt)}（世代 ${next.revision}）`, "ok");
    } else if (showUnchanged) {
      setStatus(`最新データは保存済みです：${formatSavedAt(next.savedAt)}`, "ok");
    }
  } catch (error) {
    const message = cloudRecoveryMessage(error);
    if (error instanceof CloudRecoveryError && error.code === "STALE_REVISION") {
      conflictDetected = true;
      storeCloudMeta({ ...meta, syncConflict: true });
      document.querySelectorAll<HTMLElement>(`[${PANEL_MARKER}]`).forEach(panel => renderPanelInto(panel));
    }
    setStatus(message, "error");
  } finally {
    syncRunning = false;
  }
}

/** 別の端末のデータに合わせて読み直した後、設定の欄に一度だけ伝えるための印 */
const ADOPTED_NOTICE_KEY = "crimon_cloud_adopted_notice_v1";
/** `cloudRestoreNavigationGuard.ts` と同じ鍵。読み直しの途中で古いデータが書き戻されないようにする */
const PENDING_RESTORE_KEY = "crimon_cloud_restore_pending_navigation_v1";
/** 復帰のたびに取りに行くと通信が増えるので、間を空ける */
const OPEN_SYNC_MIN_INTERVAL_MS = 60 * 1000;
let lastOpenSyncAt = 0;

function localTouchedAt(): number | null {
  const value = Number(localStorage.getItem(SAVE_TOUCHED_AT_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * **開いた時・復帰した時に、クラウドと合わせる。**
 *
 * 別の端末で後から遊んでいれば、そのデータに合わせて読み直す。
 * この端末の方が後で遊ばれていれば、この端末のデータでクラウドを更新する。
 * どちらの場合も、負けた方は別のバックアップとしてクラウドに残る(`syncOnOpen`)。
 *
 * @param atStartup 起動直後か。起動直後は、このページが書く前の姿で判断する
 *                  (ログインボーナスなどの書き込みを「遊んだ」と数えないため)
 */
async function syncOpen(atStartup: boolean): Promise<void> {
  if (syncRunning) return;
  if (!atStartup && Date.now() - lastOpenSyncAt < OPEN_SYNC_MIN_INTERVAL_MS) return;
  const meta = loadCloudMeta();
  if (!meta) return;
  const snapshot = atStartup ? startupSaveSnapshot() : null;
  const local = (snapshot ? saveEnvelopeFromRaw(snapshot.raw) : null) ?? currentSaveEnvelope();
  if (!local) return;
  const touchedAt = snapshot && snapshot.raw ? snapshot.touchedAt : localTouchedAt();
  lastOpenSyncAt = Date.now();
  syncRunning = true;
  try {
    const result = await syncOnOpen(meta, local, touchedAt, () => currentSaveEnvelope(), arenaAuthUserId());
    // 待っている間に接続を解除した・別の復旧IDへ入り直した
    if (readCloudMeta()?.sessionToken !== meta.sessionToken) return;
    if (result.kind === "ADOPT_CLOUD") {
      restoreCloudSave(result.save); // いまの端末のデータは「クラウド復旧前の端末データ」として残る
      storeCloudMeta(result.meta);
      try {
        const raw = localStorage.getItem("crimon_save_v1");
        if (raw) sessionStorage.setItem(PENDING_RESTORE_KEY, raw);
        sessionStorage.setItem(ADOPTED_NOTICE_KEY, result.keptLocalCopy ? "copied" : "plain");
      } catch { /* 印が残せなくても読み直しはできる */ }
      window.location.reload();
      return;
    }
    storeCloudMeta(result.meta);
    if (result.kind === "UP_TO_DATE") return;
    conflictDetected = false;
    if (result.kind === "KEEP_LOCAL") {
      setStatus(`この端末の方が新しいため、この端末のデータでバックアップしました：${formatSavedAt(result.meta.savedAt)}。前のクラウドのデータも別のバックアップとして残しています。`, "ok");
    }
    if (meta.syncConflict) {
      document.querySelectorAll<HTMLElement>(`[${PANEL_MARKER}]`).forEach(panel => renderPanelInto(panel));
      dismissHomeWarning();
    }
  } catch {
    // 通信できない時は何もしない。端末のデータはそのまま、いつもの自動保存が後で試す
  } finally {
    syncRunning = false;
  }
}

function showAdoptedNotice(): void {
  let kind: string | null = null;
  try {
    kind = sessionStorage.getItem(ADOPTED_NOTICE_KEY);
    sessionStorage.removeItem(ADOPTED_NOTICE_KEY);
  } catch { kind = null; }
  if (!kind) return;
  setStatus(kind === "copied"
    ? "別の端末で後から遊んだデータに合わせました。この端末で遊んでいた分は、別のバックアップとしてクラウドに残しています。"
    : "別の端末で遊んだ最新のデータに合わせました。", "ok");
}

/**
 * ホームの「アカウント復旧の登録がまだです」を、登録できた瞬間に消す。
 *
 * ホームの再描画は `main.ts` が持っていて、この欄からは呼べない
 * (呼べたとしても、開いている設定シートごと閉じてしまう)。
 * 出ている札を直接外す。
 *
 * 高さの申告はホーム側の `ResizeObserver` が札の並びを見ているので、
 * 1枚減れば `--home-banner-h` も自動で縮む。**ここで高さを触らない**——
 * 触ると実測と食い違い、世界の枠が潰れて「試練の塔」が押せなくなる。
 */
function dismissHomeWarning(): void {
  document.querySelectorAll("[data-cloud-recovery-warning]").forEach((node) => node.remove());
}

function showRecoveryKey(panel: HTMLElement, recoveryId: string, recoveryKey: string) {
  panel.querySelector(".cloud-recovery__key-box")?.remove();
  const box = document.createElement("div");
  box.className = "cloud-recovery__key-box";
  box.innerHTML = `<strong>登録完了：復旧キーを必ず控えてください</strong><p>復旧ID：<code></code></p><p>復旧キー：<code></code></p><small>このキーはパスワードを忘れた時の最後の手段です。スクリーンショット等で安全な場所へ保存してください。</small>`;
  const codes = box.querySelectorAll("code");
  codes[0].textContent = recoveryId;
  codes[1].textContent = recoveryKey;
  box.append(button("復旧情報をコピー", "btn btn--ghost", async () => {
    await navigator.clipboard?.writeText(`CRIMON 復旧ID: ${recoveryId}\n復旧キー: ${recoveryKey}`);
    setStatus("復旧情報をコピーしました。", "ok");
  }));
  panel.append(box);
}

function previewRestore(panel: HTMLElement, save: CloudSaveEnvelope, meta: CloudRecoveryMeta) {
  panel.querySelector(".cloud-recovery__preview")?.remove();
  const preview = document.createElement("div");
  preview.className = "cloud-recovery__preview";
  const title = document.createElement("strong");
  title.textContent = "復旧するクラウドデータ";
  const details = document.createElement("p");
  details.textContent = summaryText(save);
  const saved = document.createElement("p");
  saved.textContent = `最終バックアップ：${formatSavedAt(meta.savedAt)} / 世代 ${meta.revision}`;
  const warning = document.createElement("p");
  warning.className = "cloud-recovery__warning";
  warning.textContent = "復旧前の端末データは別枠へ自動退避します。確認するまで旧データは消しません。";
  const restore = button("このデータを復旧する", "btn btn--primary", () => {
    if (!window.confirm("表示されているクラウドデータへ復旧しますか？ 現在の端末データは復旧前バックアップとして残します。")) return;
    storeCloudMeta(meta);
    restoreCloudSave(save);
    window.location.reload();
  });
  preview.append(title, details, saved, warning, restore);
  panel.append(preview);
}

/**
 * 登録のやり方(全文)。**ホームの札ではなく、ここに置く。**
 *
 * ホームは `100dvh` を分け合う縦並びで、上に足したぶんはそのまま
 * 下の何かを画面外へ押し出す(手順4行を札へ積んだら、実機で
 * 「試練の塔」と「遊び方」が押せなくなった)。設定シートは全画面の覆いなので、
 * 縦に伸びても何も潰さない。**読ませる場所はこちら。**
 */
function registerSteps(): HTMLElement {
  const steps = [
    "下の「アカウント復旧を設定」を開く",
    "復旧IDとパスワード（6文字以上）を決めて「復旧設定を登録」を押す",
    "表示される復旧キーを控える（パスワードを忘れた時の最後の手段）",
  ];
  const box = document.createElement("div");
  box.className = "cloud-recovery__steps";
  const title = document.createElement("strong");
  title.textContent = "登録のやり方（メールアドレスは要りません）";
  const list = document.createElement("ol");
  for (const step of steps) {
    const item = document.createElement("li");
    item.textContent = step;
    list.append(item);
  }
  const note = document.createElement("small");
  note.textContent = "登録すると、この端末の最新セーブが自動でクラウドへ控えられます。機種を変えても、IDとパスワードで取り戻せます。";
  box.append(title, list, note);
  return box;
}

/**
 * セッションが切れた人の画面。
 *
 * ## 「以前のデータを復旧」へ流してはいけない
 *
 * あちらはクラウドの控えを**端末へ上書きする**道。切れている人の
 * クラウド側は**切れた時点の古い控え**なので、押させると
 * **その後に遊んだぶんが丸ごと消える。**いちばんやってはいけない事故。
 *
 * ここが欲しいのは逆で、**手元のデータはそのまま、送る口だけを開け直す。**
 * ログインして新しいセッションを受け取り、そのまま今の端末セーブを上げる。
 */
function renderExpired(panel: HTMLElement, meta: CloudRecoveryMeta) {
  const box = document.createElement("div");
  box.className = "cloud-recovery__steps";
  const title = document.createElement("strong");
  title.textContent = "ログインし直すと、バックアップが再開します";
  const note = document.createElement("small");
  note.textContent = "登録は消えていません。復旧IDとパスワードはそのままです。いまの端末のデータはそのまま残り、ログインし直した時点でクラウドへ上がります（クラウドの古いデータで上書きはしません）。";
  box.append(title, note);

  const details = document.createElement("details");
  details.className = "cloud-recovery__details";
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = "復旧IDでログイン";
  const id = input("text", "復旧ID", "username");
  id.autocapitalize = "none";
  id.value = meta.recoveryId;
  const password = input("password", "パスワード", "current-password");
  const login = button("ログインしてバックアップを再開", "btn btn--primary", async () => {
    login.disabled = true;
    try {
      const result = await loginRecovery(id.value, password.value, arenaAuthUserId());
      // **控えは受け取るが、端末へは入れない。**セッションだけ取り直す
      storeCloudMeta(result.meta);
      password.value = "";
      setStatus("ログインしました。いまの端末データをクラウドへ上げています…", "ok");
      renderPanelInto(panel);
      dismissHomeWarning();
      await syncNow(true);
    } catch (error) {
      setStatus(cloudRecoveryMessage(error), "error");
    } finally {
      login.disabled = false;
    }
  });
  details.append(summary, id, password, login);
  panel.append(box, details);
}

function renderDisconnected(panel: HTMLElement) {
  const intro = registerSteps();

  const registerDetails = document.createElement("details");
  registerDetails.className = "cloud-recovery__details";
  const registerSummary = document.createElement("summary");
  registerSummary.textContent = "アカウント復旧を設定";
  const id = input("text", "復旧ID（例：kado2525）", "username");
  id.autocapitalize = "none";
  const password = input("password", "パスワード（6文字以上）", "new-password");
  const password2 = input("password", "パスワード確認", "new-password");
  const register = button("復旧設定を登録", "btn btn--primary", async () => {
    if (password.value !== password2.value) {
      setStatus("確認用パスワードが一致しません。", "error");
      return;
    }
    const save = currentSaveEnvelope();
    if (!save) {
      setStatus("現在の端末セーブを確認できないため登録しませんでした。", "error");
      return;
    }
    register.disabled = true;
    try {
      const result = await registerRecovery(id.value, password.value, save, arenaAuthUserId());
      storeCloudMeta(result.meta);
      setStatus(`登録・バックアップ完了：${formatSavedAt(result.meta.savedAt)}`, "ok");
      showRecoveryKey(panel, result.meta.recoveryId, result.recoveryKey);
      renderPanelInto(panel, true);
      dismissHomeWarning();
    } catch (error) {
      setStatus(cloudRecoveryMessage(error), "error");
    } finally {
      register.disabled = false;
    }
  });
  registerDetails.append(registerSummary, id, password, password2, register);

  const loginDetails = document.createElement("details");
  loginDetails.className = "cloud-recovery__details";
  const loginSummary = document.createElement("summary");
  loginSummary.textContent = "以前のデータを復旧";
  const loginId = input("text", "復旧ID", "username");
  loginId.autocapitalize = "none";
  const loginPassword = input("password", "パスワード", "current-password");
  const login = button("クラウドデータを確認", "btn btn--ghost", async () => {
    login.disabled = true;
    try {
      const result = await loginRecovery(loginId.value, loginPassword.value, arenaAuthUserId());
      setStatus("復旧候補を読み込みました。まだ端末データは変更していません。", "ok");
      previewRestore(panel, result.save, result.meta);
    } catch (error) {
      setStatus(cloudRecoveryMessage(error), "error");
    } finally { login.disabled = false; }
  });
  loginDetails.append(loginSummary, loginId, loginPassword, login);

  const keyDetails = document.createElement("details");
  keyDetails.className = "cloud-recovery__details";
  const keySummary = document.createElement("summary");
  keySummary.textContent = "パスワードを忘れた場合（復旧キー）";
  const keyId = input("text", "復旧ID", "username");
  keyId.autocapitalize = "none";
  const recoveryKey = input("text", "CRMN-XXXX-XXXX-XXXX-XXXX", "off");
  recoveryKey.autocapitalize = "characters";
  const recover = button("復旧キーで確認", "btn btn--ghost", async () => {
    recover.disabled = true;
    try {
      const result = await recoverWithKey(keyId.value, recoveryKey.value, arenaAuthUserId());
      setStatus("復旧候補を読み込みました。まだ端末データは変更していません。", "ok");
      previewRestore(panel, result.save, result.meta);
    } catch (error) {
      setStatus(cloudRecoveryMessage(error), "error");
    } finally { recover.disabled = false; }
  });
  keyDetails.append(keySummary, keyId, recoveryKey, recover);

  panel.append(intro, registerDetails, loginDetails, keyDetails);
}

async function previewResume(panel: HTMLElement): Promise<void> {
  if (syncRunning) return;
  syncRunning = true;
  try {
    const meta = loadCloudMeta();
    const local = currentSaveEnvelope();
    if (!meta || !local) throw new Error("保存内容を確認できません");
    const latest = await loadLatestCloud(meta);
    // 閲覧した世代を接続情報へ保存しない。本人の選択前に自動保存が上書きしてしまう。
    panel.querySelector(".cloud-recovery__preview")?.remove();
    const preview = document.createElement("div");
    preview.className = "cloud-recovery__preview";
    const title = document.createElement("strong");
    title.textContent = "バックアップに使うデータを確認";
    const current = document.createElement("p");
    current.textContent = `この端末：${summaryText(local)}`;
    const remote = document.createElement("p");
    remote.textContent = `クラウド（${formatSavedAt(latest.meta.savedAt)}）：${summaryText(latest.save)}`;
    const resume = button("この端末のデータでバックアップを再開", "btn btn--primary", async () => {
      if (syncRunning) return;
      if (!window.confirm("この端末の現在のデータをクラウドへ保存しますか？ 別の端末で遊んだ続きがないことを確認してください。現在のクラウドデータは履歴に残ります。")) return;
      const connected = readCloudMeta();
      if (!connected || connected.sessionToken !== meta.sessionToken) {
        setStatus("接続先が変わりました。保存内容をもう一度確認してください。", "error");
        return;
      }
      syncRunning = true;
      resume.disabled = true;
      try {
        const save = currentSaveEnvelope();
        if (!save) throw new Error("端末セーブを確認できません");
        storeCloudMeta(await pendingCloudMeta(connected, save));
        const next = await saveConfirmedCloud(latest.meta, save, arenaAuthUserId());
        storeCloudMeta(next);
        conflictDetected = false;
        preview.remove();
        setStatus(`バックアップを再開しました：${formatSavedAt(next.savedAt)}`, "ok");
        renderPanelInto(panel);
        dismissHomeWarning();
      } catch (error) { setStatus(cloudRecoveryMessage(error), "error"); }
      finally { syncRunning = false; resume.disabled = false; }
    });
    preview.append(title, current, remote, resume);
    panel.append(preview);
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) { setStatus(cloudRecoveryMessage(error), "error"); }
  finally { syncRunning = false; }
}

function renderConnected(panel: HTMLElement, meta: CloudRecoveryMeta) {
  const connected = document.createElement("p");
  connected.className = "cloud-recovery__connected";
  connected.textContent = `✓ 復旧設定済み　ID：${meta.recoveryId}`;
  const saved = document.createElement("p");
  saved.className = "save-data__note";
  saved.textContent = `最終クラウドバックアップ：${formatSavedAt(meta.savedAt)} / 世代 ${meta.revision}`;
  // 競合中は、この端末のデータが別のバックアップとして控えられていることを見せる(止まって見えないように)
  const copyNote = meta.syncConflict ? document.createElement("p") : null;
  if (copyNote) {
    copyNote.className = "save-data__note";
    copyNote.textContent = meta.conflictCopySavedAt
      ? `この端末のデータは別のバックアップとして保存中：${formatSavedAt(meta.conflictCopySavedAt)}（元のバックアップも残しています）`
      : "この端末のデータを別のバックアップとして保存します（元のバックアップも残します）";
  }
  const actions = document.createElement("div");
  actions.className = "save-data__actions";
  actions.append(
    button("☁ 今すぐバックアップ", "btn btn--primary", () => syncNow(true)),
    button("☁ 保存内容を確認して再開", "btn btn--primary", () => previewResume(panel)),
    button("☁ 最新クラウドを確認", "btn btn--ghost", async () => {
      try {
        const latest = await loadLatestCloud(readCloudMeta() ?? meta);
        setStatus("クラウドの最新データを確認しました。", "ok");
        previewRestore(panel, latest.save, latest.meta);
      } catch (error) { setStatus(cloudRecoveryMessage(error), "error"); }
    }),
  );
  /*
   * **アリーナの身元が入れ替わっていないか。**
   *
   * アリーナの身元は端末の localStorage にしかなく、クラウドの控えにも
   * セーブファイルにも入らない。機種を変えたりサイトデータが消えたりすると
   * 新しい匿名ユーザが生まれ、名前はセーブから来るので
   * **ランキングに同じ名前で2人並ぶ**(実際に起きた)。
   *
   * サーバが覚えている身元と、いまの身元がずれていたら、そう伝える。
   * **こちらでは直せない**(成績を移すのは運営の仕事)ので、
   * 直せるふりをせず、何が起きているかだけをはっきり書く。
   */
  const mine = arenaAuthUserId();
  if (meta.arenaUserId && mine && meta.arenaUserId !== mine) {
    const split = document.createElement("div");
    split.className = "cloud-recovery__steps";
    const title = document.createElement("strong");
    title.textContent = "アリーナが別のアカウントになっています";
    const note = document.createElement("small");
    note.textContent = "機種変更やブラウザのデータ削除で、アリーナの登録だけが作り直されたようです。手持ちのモンスターや装備は無事ですが、アリーナのレートと戦績は新しい方で1から始まります。元の成績へ戻したい場合は、この画面を見せてお問い合わせください。";
    split.append(title, note);
    panel.append(split);
  }

  const disconnect = button("この端末のクラウド接続を解除", "btn btn--ghost", async () => {
    if (!window.confirm("この端末のログイン情報だけ解除します。クラウド上の復旧データは削除されません。よろしいですか？")) return;
    await logoutRecovery(meta);
    clearCloudMeta();
    conflictDetected = false;
    setStatus("この端末のクラウド接続を解除しました。クラウドデータは残っています。", "ok");
    renderPanelInto(panel, true);
  });
  panel.append(connected, saved);
  if (copyNote) panel.append(copyNote);
  panel.append(actions, disconnect);
}

function renderPanelInto(panel: HTMLElement, preserveKey = false) {
  const keyBox = preserveKey ? panel.querySelector(".cloud-recovery__key-box") : null;
  const preview = panel.querySelector(".cloud-recovery__preview");
  panel.replaceChildren();
  const header = document.createElement("div");
  header.className = "panel-header";
  const h2 = document.createElement("h2");
  h2.textContent = "クラウド復旧";
  header.append(h2);
  const status = document.createElement("p");
  status.className = "cloud-recovery__status";
  status.dataset.tone = statusTone;
  status.textContent = statusText;
  panel.append(header, status);
  /*
   * 3つに分ける。**期限切れを未登録と同じ画面にしない。**
   * 前は「登録のやり方」が出ていたので、**登録が消えたように見えていた。**
   */
  const meta = loadCloudMeta();
  const stored = readCloudMeta();
  if (meta) renderConnected(panel, meta);
  else if (stored) renderExpired(panel, stored);
  else renderDisconnected(panel);
  if (keyBox) panel.append(keyBox);
  if (preview) panel.append(preview);

  const backupAt = localStorage.getItem(CLOUD_RESTORE_BACKUP_AT_KEY);
  if (backupAt) {
    panel.append(button(`↩ クラウド復旧前の端末データへ戻す（${formatSavedAt(backupAt)}）`, "btn btn--ghost cloud-recovery__rollback", () => {
      if (!window.confirm("クラウド復旧を行う直前の端末データへ戻しますか？")) return;
      if (!restoreBeforeCloudRecovery()) {
        setStatus("復旧前バックアップを安全に確認できませんでした。", "error");
        return;
      }
      window.location.reload();
    }));
  }
}

function attachPanel() {
  document.querySelectorAll<HTMLElement>(".save-data").forEach((savePanel) => {
    const parent = savePanel.parentElement;
    if (!parent || parent.querySelector(`[${PANEL_MARKER}]`)) return;
    const panel = document.createElement("section");
    panel.className = "panel cloud-recovery";
    panel.setAttribute(PANEL_MARKER, "");
    renderPanelInto(panel);
    savePanel.insertAdjacentElement("afterend", panel);
  });
}

function installStyles() {
  if (document.getElementById("crimon-cloud-recovery-style")) return;
  const style = document.createElement("style");
  style.id = "crimon-cloud-recovery-style";
  style.textContent = `
    .cloud-recovery{display:grid;gap:10px}.cloud-recovery__status:empty{display:none}
    .cloud-recovery__status{margin:0;padding:8px 10px;border-radius:10px;background:rgba(80,160,110,.12);font-size:.85rem}
    .cloud-recovery__status[data-tone="error"]{background:rgba(210,70,70,.14)}.cloud-recovery__status[data-tone="warn"]{background:rgba(220,160,60,.14)}
    .cloud-recovery__details{border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px}.cloud-recovery__details summary{cursor:pointer;font-weight:700}
    .cloud-recovery__input{box-sizing:border-box;width:100%;margin-top:8px;padding:11px 12px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(0,0,0,.22);color:inherit;font:inherit}
    .cloud-recovery__details .btn{margin-top:10px;width:100%}.cloud-recovery__connected{font-weight:700;margin:0}.cloud-recovery__key-box,.cloud-recovery__preview{display:grid;gap:7px;padding:12px;border:1px solid rgba(233,181,76,.5);border-radius:10px;background:rgba(233,181,76,.08)}
    .cloud-recovery__key-box p,.cloud-recovery__preview p{margin:0}.cloud-recovery__key-box code{user-select:all;overflow-wrap:anywhere}.cloud-recovery__warning{font-size:.82rem;opacity:.9}.cloud-recovery__rollback{width:100%}
    .cloud-recovery__steps{display:grid;gap:6px;padding:10px;border:1px solid rgba(224,122,95,.4);border-left:3px solid #e07a5f;border-radius:10px;background:rgba(70,34,26,.35)}
    .cloud-recovery__steps strong{font-size:.82rem;color:#ffd9a8}.cloud-recovery__steps ol{margin:0;padding-left:1.3em;font-size:.76rem;line-height:1.6}
    .cloud-recovery__steps li+li{margin-top:3px}.cloud-recovery__steps small{font-size:.72rem;opacity:.88;line-height:1.5}
  `;
  document.head.append(style);
}

function boot() {
  installStyles();
  attachPanel();
  new MutationObserver(attachPanel).observe(document.body, { childList: true, subtree: true });
  const stored = readCloudMeta();
  if (stored && isSessionExpired(stored)) {
    // **登録はしている。切れているだけ。**ここを黙らせると誰も気づけない
    expiredNotice();
  } else if (stored) {
    if (backupAge(stored) >= FORCE_BACKUP_MS) setStatus(`バックアップが48時間以上更新されていません。既存アカウントのまま強制バックアップを試します。最終：${formatSavedAt(stored.savedAt)}`, "warn");
    else if (backupAge(stored) >= STALE_BACKUP_MS) setStatus(`バックアップが3時間以上更新されていません。次の同期で自動バックアップを試します。最終：${formatSavedAt(stored.savedAt)}`, "warn");
    else setStatus(`クラウド接続済み：${formatSavedAt(stored.savedAt)}`, "ok");
    showAdoptedNotice();
    // 開いたらまずクラウドを見に行く。別の端末で後から遊んでいれば、そちらに合わせる
    void syncOpen(true);
  }
  window.setInterval(() => { void syncNow(false, true); }, AUTO_SYNC_MS);
  window.setInterval(() => { void syncAdminSnapshot(); }, ADMIN_SNAPSHOT_RETRY_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void syncNow(false, true);
    else {
      void syncOpen(false);
      void syncAdminSnapshot();
    }
  });
  window.addEventListener("pagehide", () => { void syncNow(false, true); });
  window.setTimeout(() => { void syncNow(false, true); void syncAdminSnapshot(); }, 5_000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
