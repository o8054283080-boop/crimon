/**
 * クラウドバックアップが、黙って止まらないこと。
 *
 * ## 実際に起きたこと(依頼主の指摘)
 *
 * 「かどさんはログインしているはずなのにサーバーに保存されていません」。
 *
 * 原因はセッションの期限切れだった。サーバ側(`crimon-recovery`)の
 * セッションは**発行から30日**で、**使っても延びなかった。**
 * 切れると手元では:
 *
 *   - `loadCloudMeta()` が `null` を返す
 *   - 自動バックアップが `if (!meta) return;` で**何も言わずに終わる**
 *   - ホームの警告も出ない(`hasCloudRecoveryAccount` は期限を見ないので
 *     「登録済み」のまま)
 *   - 設定を開くと、**登録していない人と同じ画面**が出る
 *
 * つまり**何も起きていないように見えたまま、ひと月ぶんの遊びが
 * サーバへ届かない。**いちばん危ない人にだけ、何も出ていなかった。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLOUD_RECOVERY_META_KEY,
  cloudRecoveryWarning,
  hasCloudRecoveryAccount,
  isSessionExpired,
  loadCloudMeta,
  readCloudMeta,
  type CloudRecoveryMeta,
} from "../src/game/cloudRecovery.js";

const EDGE = readFileSync(new URL("../supabase/functions/crimon-recovery/index.ts", import.meta.url), "utf8");
const BOOTSTRAP = readFileSync(new URL("../src/web/cloudRecoveryBootstrap.ts", import.meta.url), "utf8");
const HOME = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");

const meta = (expiresAt: string): CloudRecoveryMeta => ({
  recoveryId: "kado",
  sessionToken: "token-abcdefghijklmnopqrstuvwxyz",
  sessionExpiresAt: expiresAt,
  revision: 12,
  savedAt: "2026-09-01T00:00:00.000Z",
  lastUploadedSave: "x",
});

function storageWith(value: CloudRecoveryMeta | null): Pick<Storage, "getItem"> {
  return { getItem: (key: string) => (key === CLOUD_RECOVERY_META_KEY && value ? JSON.stringify(value) : null) };
}

const FUTURE = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe("期限切れを、未登録と取り違えない", () => {
  it("期限が切れていても、控えそのものは読める", () => {
    /*
     * `loadCloudMeta` は期限切れを `null` で返すので、呼び出し側からは
     * **「登録していない」と区別が付かない。**切れた本人を掴めないと、
     * 「期限が切れています」と言うことすらできない。
     */
    const expired = storageWith(meta(PAST));
    expect(loadCloudMeta(expired), "ここは null で正しい").toBeNull();
    expect(readCloudMeta(expired), "切れた本人を掴めていない").not.toBeNull();
    expect(isSessionExpired(readCloudMeta(expired)!)).toBe(true);
  });

  it("生きているセッションは、どちらでも読める", () => {
    const alive = storageWith(meta(FUTURE));
    expect(loadCloudMeta(alive)).not.toBeNull();
    expect(isSessionExpired(readCloudMeta(alive)!)).toBe(false);
  });

  it("読めない期限は、切れている扱いにする", () => {
    // **迷ったら「届いていないかもしれない」側へ倒す。**黙って止まるよりまし
    expect(isSessionExpired(meta("こわれている"))).toBe(true);
  });
});

describe("ホームの警告は、3つを区別する", () => {
  it("登録していない人には、登録を促す", () => {
    expect(cloudRecoveryWarning(storageWith(null))).toBe("UNREGISTERED");
  });

  it("登録済みで期限切れの人には、ログインし直しを促す", () => {
    /*
     * **ここが空いていた。**登録の有無しか見ていなかったので、
     * 「登録はしたがもう届いていない」人にだけ何も出なかった。
     */
    expect(cloudRecoveryWarning(storageWith(meta(PAST)))).toBe("EXPIRED");
    expect(hasCloudRecoveryAccount(storageWith(meta(PAST))), "登録はしている").toBe(true);
  });

  it("届いている人には何も出さない", () => {
    expect(cloudRecoveryWarning(storageWith(meta(FUTURE)))).toBe("NONE");
  });

  it("ホームが、この3つで文面を分けている", () => {
    expect(HOME).toContain("cloudRecoveryWarning()");
    expect(HOME).toContain("クラウドへ保存できていません");
    expect(HOME).toContain("ログインし直す");
  });
});

describe("切れた時に、黙って止まらない", () => {
  it("自動バックアップが、期限切れを言ってから止まる", () => {
    expect(BOOTSTRAP).toContain("function expiredNotice(");
    expect(BOOTSTRAP).toContain("クラウドのセッションが切れています");
    // 期限を見ない読み方で掴んでから判定していること
    expect(BOOTSTRAP).toContain("const stored = readCloudMeta();");
    expect(BOOTSTRAP).toContain("if (isSessionExpired(stored))");
  });

  it("起動時の表示も、期限切れを伝える", () => {
    const at = BOOTSTRAP.indexOf("function boot(");
    expect(at).toBeGreaterThan(-1);
    expect(BOOTSTRAP.slice(at, at + 900)).toContain("expiredNotice()");
  });
});

describe("期限切れの人を、上書きの道へ流さない", () => {
  it("切れている時は、専用の画面を出す", () => {
    /*
     * 前は**未登録の人と同じ画面**が出ていたので、
     * 「登録のやり方」が並び、**登録が消えたように見えていた。**
     */
    expect(BOOTSTRAP).toContain("function renderExpired(");
    expect(BOOTSTRAP).toContain("else if (stored) renderExpired(panel, stored);");
    expect(BOOTSTRAP).toContain("ログインし直すと、バックアップが再開します");
  });

  it("**クラウドの古い控えで端末を上書きしない**", () => {
    /*
     * 「以前のデータを復旧」はクラウドを端末へ入れる道。切れている人の
     * クラウド側は**切れた時点の古い控え**なので、そこへ流すと
     * その後に遊んだぶんが丸ごと消える。いちばんやってはいけない事故。
     *
     * ここは逆に、手元のデータをそのままクラウドへ上げる。
     */
    const at = BOOTSTRAP.indexOf("function renderExpired(");
    const block = BOOTSTRAP.slice(at, BOOTSTRAP.indexOf("function renderDisconnected("));
    expect(block).toContain("storeCloudMeta(result.meta)");
    expect(block).toContain("syncNow(true)");
    expect(block, "端末へ書き戻す道を混ぜている").not.toContain("restoreCloudSave");
    expect(block, "復旧の確認画面へ流している").not.toContain("previewRestore");
  });

  it("復旧IDを入れ直させない", () => {
    const at = BOOTSTRAP.indexOf("function renderExpired(");
    expect(BOOTSTRAP.slice(at, at + 1600)).toContain("id.value = meta.recoveryId;");
  });
});

describe("サーバ側: 使っていれば切れない", () => {
  it("セッションを使うたびに期限を延ばす", () => {
    /*
     * 前は `last_used_at` を書くだけで `expires_at` を動かしていなかった。
     * だから**毎日遊んでいる人でも、発行から30日でいきなり切れた。**
     */
    expect(EDGE).toContain("SESSION_RENEW_AFTER_MS");
    expect(EDGE).toMatch(/expires_at:\s*nextExpiry/);
  });

  it("延ばした期限を、応答で返す", () => {
    // 返さないと手元の期限が古いままで、結局そこで切れる
    const save = EDGE.indexOf('action === "save"');
    expect(save).toBeGreaterThan(-1);
    expect(EDGE.slice(save)).toContain("sessionExpiresAt: session.expiresAt");
    const load = EDGE.indexOf('action === "load"');
    expect(EDGE.slice(load, save)).toContain("sessionExpiresAt: session.expiresAt");
  });

  it("毎回は書き戻さない(遊んでいる間ずっと UPDATE が走る)", () => {
    expect(EDGE).toContain("const renew = remaining < SESSION_RENEW_AFTER_MS;");
  });

  it("鍵の値がソースに焼き込まれていない", () => {
    // **このリポジトリは公開されている。**1行でも入れば守りが無意味になる
    expect(EDGE).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(EDGE).not.toMatch(/eyJ[A-Za-z0-9_-]{30,}/);
    expect(EDGE).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/);
  });

  it("守りを緩めていない", () => {
    // 取り出して置き直した時に、うっかり弱めていないこと
    expect(EDGE).toContain("PBKDF2_ITERATIONS = 180_000");
    expect(EDGE).toContain("function timingSafeEqual(");
    expect(EDGE).toContain("STALE_REVISION");
    // モンスター0体の控えで上書きさせない
    expect(EDGE).toContain("state.monsters.length === 0");
  });
});

describe("手元の期限も、サーバに合わせて進む", () => {
  it("アップロードの応答から期限を受け取る", () => {
    const source = readFileSync(new URL("../src/game/cloudRecovery.ts", import.meta.url), "utf8");
    const at = source.indexOf("export async function uploadCloudSave(");
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, at + 1200)).toContain("sessionExpiresAt: data.sessionExpiresAt ?? meta.sessionExpiresAt");
  });
});
