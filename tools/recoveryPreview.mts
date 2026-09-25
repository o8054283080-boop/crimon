/** 保存競合の画面検証。本番へは接続せず、架空のセーブとAPI応答だけを使う。 */
import { chromium, type Locator } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createInitialState } from "../src/game/playerState.js";
import { encodeSave } from "../src/game/saveCodec.js";
import { serializeSaveFile } from "../src/game/saveFile.js";
import { CLOUD_RECOVERY_META_KEY } from "../src/game/cloudRecovery.js";

const state = createInitialState();
state.fighterName = "保存の検証";
const local = JSON.parse(serializeSaveFile(state));
const remote = structuredClone(local);
remote.state.gold = 50;
remote.summary = undefined;
const meta = { recoveryId: "test-only", sessionToken: "test-only-session-not-a-real-credential", sessionExpiresAt: "2099-01-01", revision: 1,
  savedAt: "2026-09-01T00:00:00Z", lastUploadedSave: "{}", syncConflict: true };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let revision = 2;
  let saves = 0;
  let lastSaved: unknown;
  await page.route("**/*.supabase.co/**", async route => {
    if (!route.request().url().endsWith("/crimon-recovery")) return route.abort();
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
    const body = route.request().postDataJSON();
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    if (body.action === "load") return route.fulfill({ headers, json: { ok: true, revision, savedAt: "2026-09-02T00:00:00Z", save: remote } });
    assert.equal(body.action, "save");
    saves++;
    if (body.revision <= revision) return route.fulfill({ status: 409, headers, json: { ok: false, code: "STALE_REVISION" } });
    revision = body.revision;
    lastSaved = body.save;
    return route.fulfill({ headers, json: { ok: true, revision, savedAt: "2026-09-25T00:00:00Z" } });
  });
  await page.addInitScript(({ save, meta, key }) => {
    sessionStorage.setItem("crimon.started", "1");
    localStorage.setItem("crimon_save_v1", save);
    localStorage.setItem(key, JSON.stringify(meta));
    localStorage.setItem("crimon_cloud_backup_last_attempt_v1", String(Date.now()));
  }, { save: encodeSave(state), meta, key: CLOUD_RECOVERY_META_KEY });
  await page.goto("http://127.0.0.1:4173");
  await page.getByRole("button", { name: "設定を開く", exact: true }).click();
  const connected = page.locator(".cloud-recovery");
  await connected.getByText("復旧設定済み", { exact: false }).waitFor();
  // 起動時の保存が競合するまで待つ。止まっても手動確認できることを検証する。
  await page.waitForFunction(() => document.querySelector(".cloud-recovery__status")?.textContent?.includes("保存内容が異なる"));
  async function reachable(button: Locator) {
    await button.scrollIntoViewIfNeeded();
    assert.equal(await button.evaluate(el => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top === el || !!top && el.contains(top);
    }), true, "ボタンが覆われている");
  }
  const inspect = connected.getByRole("button", { name: "☁ 保存内容を確認して再開", exact: true });
  await reachable(inspect);
  await inspect.click();
  const resume = connected.getByRole("button", { name: "この端末のデータでバックアップを再開", exact: true });
  await resume.waitFor();
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).revision, CLOUD_RECOVERY_META_KEY), 1, "閲覧だけで世代が変わった");
  await reachable(resume);
  await mkdir("artifacts/home-preview", { recursive: true });
  await page.screenshot({ path: "artifacts/home-preview/recovery-conflict-390x844.png" });
  const priorSaves = saves;
  page.once("dialog", dialog => dialog.dismiss());
  await resume.click();
  assert.equal(saves, priorSaves, "取り消したのに保存した");
  revision = 3; // 確認後に別端末が保存
  const rejected = page.waitForResponse(response => response.url().endsWith("/crimon-recovery") && response.status() === 409);
  page.once("dialog", dialog => dialog.accept());
  await resume.click();
  await rejected;
  await page.waitForFunction(() => document.querySelector(".cloud-recovery__status")?.textContent?.includes("保存内容が異なる"));
  assert.equal(lastSaved, undefined, "確認後の競合を上書きした");
  await inspect.click();
  await reachable(resume);
  page.once("dialog", dialog => dialog.accept());
  await resume.click();
  await page.getByText("バックアップを再開しました", { exact: false }).waitFor();
  assert.equal(revision, 4);
  assert.ok(lastSaved);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).syncConflict, CLOUD_RECOVERY_META_KEY), false);
  await connected.locator(".cloud-recovery__status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/home-preview/recovery-resumed-390x844.png" });
  console.log("保存競合の比較・取消・再競合拒否・再開を実ブラウザで確認しました。");
} finally { await browser.close(); }
