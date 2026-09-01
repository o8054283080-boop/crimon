import {
  CLOUD_RESTORE_BACKUP_AT_KEY,
  CloudRecoveryMeta,
  cloudRecoveryMessage,
  clearCloudMeta,
  currentSaveEnvelope,
  loadCloudMeta,
  loadLatestCloud,
  loginRecovery,
  logoutRecovery,
  recoverWithKey,
  registerRecovery,
  restoreBeforeCloudRecovery,
  restoreCloudSave,
  storeCloudMeta,
  uploadCloudSave,
  type CloudSaveEnvelope,
} from "../game/cloudRecovery.js";

const PANEL_MARKER = "data-crimon-cloud-recovery";
const AUTO_SYNC_MS = 30_000;
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

async function syncNow(showUnchanged = false): Promise<void> {
  if (syncRunning || conflictDetected) return;
  const meta = loadCloudMeta();
  if (!meta) return;
  const save = currentSaveEnvelope();
  if (!save) {
    setStatus("端末セーブを確認できないため、クラウド更新を止めました。", "error");
    return;
  }
  syncRunning = true;
  try {
    const next = await uploadCloudSave(meta, save);
    storeCloudMeta(next);
    if (next.revision !== meta.revision) {
      setStatus(`バックアップ済み：${formatSavedAt(next.savedAt)}（世代 ${next.revision}）`, "ok");
    } else if (showUnchanged) {
      setStatus(`最新データは保存済みです：${formatSavedAt(next.savedAt)}`, "ok");
    }
  } catch (error) {
    const message = cloudRecoveryMessage(error);
    if (message.includes("古いデータ")) conflictDetected = true;
    setStatus(message, "error");
  } finally {
    syncRunning = false;
  }
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

function renderDisconnected(panel: HTMLElement) {
  const intro = document.createElement("p");
  intro.className = "save-data__note";
  intro.textContent = "復旧IDとパスワードを登録すると、この端末の最新セーブをクラウドへ控えられます。メールアドレスは不要です。";

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
      const result = await registerRecovery(id.value, password.value, save);
      storeCloudMeta(result.meta);
      setStatus(`登録・バックアップ完了：${formatSavedAt(result.meta.savedAt)}`, "ok");
      showRecoveryKey(panel, result.meta.recoveryId, result.recoveryKey);
      renderPanelInto(panel, true);
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
      const result = await loginRecovery(loginId.value, loginPassword.value);
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
      const result = await recoverWithKey(keyId.value, recoveryKey.value);
      setStatus("復旧候補を読み込みました。まだ端末データは変更していません。", "ok");
      previewRestore(panel, result.save, result.meta);
    } catch (error) {
      setStatus(cloudRecoveryMessage(error), "error");
    } finally { recover.disabled = false; }
  });
  keyDetails.append(keySummary, keyId, recoveryKey, recover);

  panel.append(intro, registerDetails, loginDetails, keyDetails);
}

function renderConnected(panel: HTMLElement, meta: CloudRecoveryMeta) {
  const connected = document.createElement("p");
  connected.className = "cloud-recovery__connected";
  connected.textContent = `✓ 復旧設定済み　ID：${meta.recoveryId}`;
  const saved = document.createElement("p");
  saved.className = "save-data__note";
  saved.textContent = `最終クラウドバックアップ：${formatSavedAt(meta.savedAt)} / 世代 ${meta.revision}`;
  const actions = document.createElement("div");
  actions.className = "save-data__actions";
  actions.append(
    button("☁ 今すぐバックアップ", "btn btn--primary", () => syncNow(true)),
    button("☁ 最新クラウドを確認", "btn btn--ghost", async () => {
      try {
        const latest = await loadLatestCloud(meta);
        storeCloudMeta(latest.meta);
        setStatus("クラウドの最新データを確認しました。", "ok");
        previewRestore(panel, latest.save, latest.meta);
      } catch (error) { setStatus(cloudRecoveryMessage(error), "error"); }
    }),
  );
  const disconnect = button("この端末のクラウド接続を解除", "btn btn--ghost", async () => {
    if (!window.confirm("この端末のログイン情報だけ解除します。クラウド上の復旧データは削除されません。よろしいですか？")) return;
    await logoutRecovery(meta);
    clearCloudMeta();
    conflictDetected = false;
    setStatus("この端末のクラウド接続を解除しました。クラウドデータは残っています。", "ok");
    renderPanelInto(panel, true);
  });
  panel.append(connected, saved, actions, disconnect);
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
  const meta = loadCloudMeta();
  if (meta) renderConnected(panel, meta); else renderDisconnected(panel);
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
  `;
  document.head.append(style);
}

function boot() {
  installStyles();
  attachPanel();
  new MutationObserver(attachPanel).observe(document.body, { childList: true, subtree: true });
  const meta = loadCloudMeta();
  if (meta) setStatus(`クラウド接続済み：${formatSavedAt(meta.savedAt)}`, "ok");
  window.setInterval(() => { void syncNow(); }, AUTO_SYNC_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void syncNow();
  });
  window.addEventListener("pagehide", () => { void syncNow(); });
  window.setTimeout(() => { void syncNow(); }, 5_000);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
