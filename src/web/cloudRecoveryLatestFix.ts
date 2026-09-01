import {
  cloudRecoveryMessage,
  loadCloudMeta,
  loadLatestCloud,
  restoreCloudSave,
  storeCloudMeta,
  type CloudSaveEnvelope,
} from "../game/cloudRecovery.js";

const LATEST_LABEL = "最新クラウドを確認";
let checking = false;

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未保存";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

function setPanelStatus(panel: HTMLElement, message: string, tone: "ok" | "warn" | "error" = "ok") {
  const status = panel.querySelector<HTMLElement>(".cloud-recovery__status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function showLatest(panel: HTMLElement, save: CloudSaveEnvelope, savedAt: string, revision: number) {
  panel.querySelector(".cloud-recovery__latest-confirm")?.remove();

  const box = document.createElement("div");
  box.className = "cloud-recovery__preview cloud-recovery__latest-confirm";

  const title = document.createElement("strong");
  title.textContent = "クラウドの最新データ";
  const details = document.createElement("p");
  details.textContent = summaryText(save);
  const saved = document.createElement("p");
  saved.textContent = `最終バックアップ：${formatSavedAt(savedAt)} / 世代 ${revision}`;
  const note = document.createElement("p");
  note.className = "cloud-recovery__warning";
  note.textContent = "この確認だけでは端末データは変更されません。復旧する場合だけ下のボタンを押してください。";

  const restore = document.createElement("button");
  restore.type = "button";
  restore.className = "btn btn--primary";
  restore.textContent = "このクラウドデータを復旧する";
  restore.addEventListener("click", () => {
    if (!window.confirm("表示されている最新クラウドデータへ復旧しますか？ 現在の端末データは復旧前バックアップとして残します。")) return;
    restoreCloudSave(save);
    window.location.reload();
  });

  box.append(title, details, saved, note, restore);

  const actions = panel.querySelector(".save-data__actions");
  if (actions) actions.insertAdjacentElement("afterend", box);
  else panel.append(box);

  window.setTimeout(() => box.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
}

async function handleLatest(button: HTMLButtonElement, panel: HTMLElement) {
  if (checking) return;
  const meta = loadCloudMeta();
  if (!meta) {
    setPanelStatus(panel, "クラウド接続情報が見つかりません。もう一度復旧IDで接続してください。", "error");
    return;
  }

  checking = true;
  const original = button.textContent ?? `☁ ${LATEST_LABEL}`;
  button.disabled = true;
  button.textContent = "☁ クラウド確認中…";
  setPanelStatus(panel, "クラウドの最新データを確認しています…", "warn");

  try {
    const latest = await loadLatestCloud(meta);
    storeCloudMeta(latest.meta);
    setPanelStatus(panel, `クラウドの最新データを確認しました：${formatSavedAt(latest.meta.savedAt)}（世代 ${latest.meta.revision}）`, "ok");
    showLatest(panel, latest.save, latest.meta.savedAt, latest.meta.revision);
  } catch (error) {
    setPanelStatus(panel, cloudRecoveryMessage(error), "error");
  } finally {
    checking = false;
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLButtonElement>("button");
  if (!button || !button.textContent?.includes(LATEST_LABEL)) return;
  const panel = button.closest<HTMLElement>("[data-crimon-cloud-recovery]");
  if (!panel) return;

  // cloudRecoveryBootstrap.ts の旧ハンドラより先に処理し、二重リクエストを防ぐ。
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void handleLatest(button, panel);
}, true);
