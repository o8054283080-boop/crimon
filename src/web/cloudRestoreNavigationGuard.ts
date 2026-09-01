const PLAYER_STORAGE_KEY = "crimon_save_v1";
const PENDING_RESTORE_KEY = "crimon_cloud_restore_pending_navigation_v1";
const RESTORE_BUTTON_SELECTOR = ".cloud-recovery__preview button";

function safeGetPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_RESTORE_KEY);
  } catch {
    return null;
  }
}

function safeStorePending(raw: string): void {
  try {
    sessionStorage.setItem(PENDING_RESTORE_KEY, raw);
  } catch {
    // sessionStorage が使えない環境では通常の復旧処理に任せる。
  }
}

function reapplyPendingRestore(): void {
  const raw = safeGetPending();
  if (!raw) return;
  try {
    localStorage.setItem(PLAYER_STORAGE_KEY, raw);
  } catch {
    // localStorage の書き込み失敗は既存の復旧UI側で扱う。
  }
}

function clearPendingAfterNextPageIsReady(): void {
  if (!safeGetPending()) return;

  // 前ページの pagehide で復旧データを最後に書き戻しているが、
  // iOS Safari の遷移順差にも耐えるよう新ページ側でも一度だけ補強する。
  reapplyPendingRestore();
  window.addEventListener(
    "load",
    () => {
      reapplyPendingRestore();
      try {
        sessionStorage.removeItem(PENDING_RESTORE_KEY);
      } catch {
        // 解除できなくても次回クリックで最新値に更新される。
      }
    },
    { once: true },
  );
}

// クラウド復旧ボタン本体の onclick は target phase で先に実行される。
// その後 document へ bubble してきた時点では crimon_save_v1 が
// 復旧候補へ置き換わっているため、その値を遷移専用に退避する。
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(RESTORE_BUTTON_SELECTOR) : null;
  if (!target || !target.textContent?.includes("復旧")) return;

  try {
    const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
    if (raw) safeStorePending(raw);
  } catch {
    // 既存の復旧処理を妨げない。
  }
});

// main.ts は visibilitychange / pagehide で現在メモリ上の player を保存する。
// 復旧直後だけ、その保存より後にクラウド復旧値を再適用して遷移先へ渡す。
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") reapplyPendingRestore();
});
window.addEventListener("pagehide", reapplyPendingRestore);

clearPendingAfterNextPageIsReady();
