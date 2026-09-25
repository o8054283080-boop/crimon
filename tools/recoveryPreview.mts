/** 保存競合の画面検証。本番へは接続せず、架空のセーブとAPI応答だけを使う。 */
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { createInitialState } from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";
import { serializeSaveFile } from "../src/game/saveFile.js";
import { CLOUD_RECOVERY_META_KEY, envelopeFingerprint } from "../src/game/cloudRecovery.js";

const state = createInitialState();
state.fighterName = "保存の検証";
const local = JSON.parse(serializeSaveFile(state));
const remote = structuredClone(local);
remote.state.gold = 50;
remote.state.fighterName = "別の端末";
remote.summary = undefined;
const baseMeta = { recoveryId: "test-only", sessionToken: "test-only-session-not-a-real-credential", sessionExpiresAt: "2099-01-01", revision: 1,
  savedAt: "2026-09-01T00:00:00Z" };
const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

type Server = { revision: number; saves: unknown[]; copies: { deviceId: string; baseRevision: number; gold: number }[]; failLoads: number };

/** 架空の復旧APIと、最初の1回だけ端末へ入れるセーブ・接続情報を用意して開く */
async function open(browser: Browser, meta: Record<string, unknown>, server: Server, touchedAt: number | null): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route("**/*.supabase.co/**", async route => {
    if (!route.request().url().endsWith("/crimon-recovery")) return route.abort();
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" } });
    const body = route.request().postDataJSON();
    if (body.action === "load") {
      if (server.failLoads > 0) { server.failLoads--; return route.fulfill({ status: 503, headers, json: { ok: false, code: "SERVER_ERROR" } }); }
      return route.fulfill({ headers, json: { ok: true, revision: server.revision, savedAt: "2026-09-02T00:00:00Z", save: remote } });
    }
    if (body.action === "save_copy") {
      server.copies.push({ deviceId: body.deviceId, baseRevision: body.baseRevision, gold: body.save.state.gold });
      return route.fulfill({ headers, json: { ok: true, savedAt: "2026-09-25T00:00:00Z" } });
    }
    assert.equal(body.action, "save");
    if (body.revision <= server.revision) return route.fulfill({ status: 409, headers, json: { ok: false, code: "STALE_REVISION" } });
    server.revision = body.revision;
    server.saves.push(body.save);
    return route.fulfill({ headers, json: { ok: true, revision: server.revision, savedAt: "2026-09-25T00:00:00Z" } });
  });
  // **最初の1回だけ**入れる。読み直し(クラウドに合わせた後)で入れ直すと、また古いデータに戻ってしまう
  await page.addInitScript(({ save, meta, key, touchedAt }) => {
    if (sessionStorage.getItem("recovery-preview-seeded")) return;
    sessionStorage.setItem("recovery-preview-seeded", "1");
    sessionStorage.setItem("crimon.started", "1");
    localStorage.setItem("crimon_save_v1", save);
    localStorage.setItem(key, JSON.stringify(meta));
    if (touchedAt) localStorage.setItem("crimon_save_touched_at_v1", String(touchedAt));
    localStorage.setItem("crimon_cloud_backup_last_attempt_v1", String(Date.now()));
  }, { save: encodeSave(state), meta, key: CLOUD_RECOVERY_META_KEY, touchedAt });
  await page.goto("http://127.0.0.1:4173");
  return page;
}

const cloudMeta = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), CLOUD_RECOVERY_META_KEY);
const localName = async (page: Page) => decodeSave((await page.evaluate(() => localStorage.getItem("crimon_save_v1")))!)!.fighterName;

async function reachable(button: Locator) {
  await button.click({ trial: true }); // スクロールのアニメーション終了・操作可能を待って測定する
  assert.equal(await button.evaluate(el => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return top === el || !!top && el.contains(top);
  }), true, "ボタンが覆われている");
}

// 手元では Playwright 同梱版が無いことがあるので、場所を渡せるようにする(CIは未指定)
const browser = await chromium.launch({ headless: true, executablePath: process.env.CRIMON_CHROMIUM || undefined });
try {
  await mkdir("artifacts/home-preview", { recursive: true });

  /*
   * 1. 別の端末で後から遊んだ。この端末は最後に上げてから何もしていない
   *    → 開いたらクラウドのデータに合わせて読み直す。クラウドには何も書かない
   */
  {
    const server: Server = { revision: 2, saves: [], copies: [], failLoads: 0 };
    const page = await open(browser, { ...baseMeta, lastUploadedSave: envelopeFingerprint(local) }, server, null);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) ?? "{}").revision === 2, CLOUD_RECOVERY_META_KEY);
    await page.waitForLoadState("load");
    await page.getByRole("button", { name: "設定を開く", exact: true }).click();
    await page.locator(".cloud-recovery").getByText("別の端末で遊んだ最新のデータに合わせました", { exact: false }).waitFor();
    assert.equal(await localName(page), "別の端末", "別の端末の続きに合わせていない");
    assert.equal((await cloudMeta(page)).syncConflict, false);
    // 読み直した後の自動保存は、合わせたデータを上げるだけ。古いこの端末のデータで上書きしない
    assert.ok(server.saves.every(save => (save as { state: { fighterName: string } }).state.fighterName === "別の端末"), "古い端末のデータでクラウドを上書きした");
    assert.equal(server.copies.length, 0, "遊んでいない端末のデータを控えた");
    await page.locator(".cloud-recovery__status").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "artifacts/home-preview/recovery-adopted-390x844.png" });
    await page.close();
  }

  /*
   * 2. 両方で遊んだが、この端末の方が後 → この端末のデータでクラウドを更新する。
   *    置き換える前のクラウドは別のバックアップとして残す
   */
  {
    const server: Server = { revision: 2, saves: [], copies: [], failLoads: 0 };
    const page = await open(browser, { ...baseMeta, lastUploadedSave: "{}" }, server, Date.parse("2026-09-03T00:00:00Z"));
    await page.getByRole("button", { name: "設定を開く", exact: true }).click();
    await page.locator(".cloud-recovery").getByText("この端末の方が新しいため", { exact: false }).waitFor();
    assert.deepEqual(server.copies.map(copy => [copy.deviceId, copy.gold]), [["replaced-main", 50]], "置き換える前のクラウドを控えていない");
    assert.ok(server.saves.length >= 1);
    assert.equal((server.saves[0] as { state: { fighterName: string } }).state.fighterName, "保存の検証", "この端末のデータで更新していない");
    assert.ok((await cloudMeta(page)).revision >= 3);
    assert.equal(await localName(page), "保存の検証", "この端末のデータを捨てた");
    await page.close();
  }

  /*
   * 3. 開いた時に通信できなかった → いつもの自動保存が競合を見つけ、この端末のデータを控える。
   *    本人が「保存内容を確認して再開」から選ぶ道も残っている
   */
  const server: Server = { revision: 2, saves: [], copies: [], failLoads: 1 };
  const page = await open(browser, { ...baseMeta, lastUploadedSave: "{}", syncConflict: true }, server, null);
  await page.getByRole("button", { name: "設定を開く", exact: true }).click();
  const connected = page.locator(".cloud-recovery");
  await connected.getByText("復旧設定済み", { exact: false }).waitFor();
  await page.waitForFunction(() => document.querySelector(".cloud-recovery__status")?.textContent?.includes("別のバックアップとして保存しました"));
  assert.equal(server.copies.length, 1, "競合中なのに端末のデータを控えていない");
  assert.equal(server.saves.length, 0, "競合中に本来のバックアップへ書きに行った");
  assert.equal(server.copies[0].baseRevision, 1, "控えに端末の知っている世代が付いていない");
  assert.equal((await cloudMeta(page)).revision, 1, "控えただけで世代が変わった");
  const inspect = connected.getByRole("button", { name: "☁ 保存内容を確認して再開", exact: true });
  await reachable(inspect);
  await inspect.click();
  const resume = connected.getByRole("button", { name: "この端末のデータでバックアップを再開", exact: true });
  await resume.waitFor();
  assert.equal((await cloudMeta(page)).revision, 1, "閲覧だけで世代が変わった");
  await reachable(resume);
  await page.screenshot({ path: "artifacts/home-preview/recovery-conflict-390x844.png" });
  const priorSaves = server.saves.length;
  page.once("dialog", dialog => dialog.dismiss());
  await resume.click();
  assert.equal(server.saves.length, priorSaves, "取り消したのに保存した");
  server.revision = 3; // 確認後に別端末が保存
  const rejected = page.waitForResponse(response => response.url().endsWith("/crimon-recovery") && response.status() === 409);
  page.once("dialog", dialog => dialog.accept());
  await resume.click();
  await rejected;
  await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some(button =>
    button.textContent === "この端末のデータでバックアップを再開" && !button.disabled));
  await page.waitForFunction(() => document.querySelector(".cloud-recovery__status")?.textContent?.includes("保存内容が異なり"));
  assert.equal(server.saves.length, 0, "確認後の競合を上書きした");
  const oldPreview = await connected.locator(".cloud-recovery__preview").elementHandle();
  await inspect.click();
  await oldPreview!.waitForElementState("hidden");
  await resume.waitFor();
  await reachable(resume);
  page.once("dialog", dialog => dialog.accept());
  await resume.click();
  await page.getByText("バックアップを再開しました", { exact: false }).waitFor();
  assert.equal(server.revision, 4);
  assert.equal(server.saves.length, 1);
  assert.equal((await cloudMeta(page)).syncConflict, false);
  await connected.locator(".cloud-recovery__status").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "artifacts/home-preview/recovery-resumed-390x844.png" });
  console.log("開いた時の合わせ込み(クラウドへ合わせる・この端末で更新する)と、通信できなかった時の控え・比較・取消・再競合拒否・再開を実ブラウザで確認しました。");
} finally { await browser.close(); }
