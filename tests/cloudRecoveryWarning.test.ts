import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLOUD_RECOVERY_META_KEY, hasCloudRecoveryAccount } from "../src/game/cloudRecovery.js";

/*
 * ホームの「アカウント復旧の登録がまだです」。
 *
 * ## ここで見張ること
 *
 * データが消えてから気づいても打つ手が無い、という一点のための案内なので、
 * **出るべき時に出て、登録したら消える**ことが仕様のすべて。
 * 判定を `loadCloudMeta` に変えられると、セッションの期限切れだけで
 * 「登録がまだです」が復活し、登録した人へ嘘を言い続ける。
 *
 * ## 見た目も見張る
 *
 * 型もテストもCSSの事故を拾わない。ホームで浮かせた部品が下のボタンを
 * 覆う事故を3回出しているので、`position` を持っていないことと、
 * 文字が9pxを下回っていないことを機械で確かめる。
 */

const home = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/web/ui/cloudRecoveryWarning.css", import.meta.url), "utf8");
const bootstrap = readFileSync(new URL("../src/web/cloudRecoveryBootstrap.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storageWith = (value: unknown): Storage => {
  const storage = new MemoryStorage();
  storage.setItem(CLOUD_RECOVERY_META_KEY, JSON.stringify(value));
  return storage as unknown as Storage;
};

describe("アカウント復旧の登録判定", () => {
  it("何も登録していなければ「未登録」", () => {
    expect(hasCloudRecoveryAccount(new MemoryStorage() as unknown as Storage)).toBe(false);
  });

  it("登録していれば「登録済み」", () => {
    expect(hasCloudRecoveryAccount(storageWith({
      recoveryId: "kado2525",
      sessionToken: "token",
      sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      revision: 1,
      savedAt: "2026-09-04T00:00:00.000Z",
      lastUploadedSave: "{}",
    }))).toBe(true);
  });

  it("**セッションが切れていても「登録済み」のまま**", () => {
    /*
     * `loadCloudMeta` は期限切れで null を返す。そちらで判定すると、
     * ちゃんと登録した人に「登録がまだです」と出続ける
     */
    expect(hasCloudRecoveryAccount(storageWith({
      recoveryId: "kado2525",
      sessionToken: "token",
      sessionExpiresAt: "2000-01-01T00:00:00.000Z",
      revision: 3,
      savedAt: "2026-09-04T00:00:00.000Z",
      lastUploadedSave: "{}",
    }))).toBe(true);
  });

  it("壊れた記録や空のIDでは「未登録」に倒す", () => {
    const broken = new MemoryStorage();
    broken.setItem(CLOUD_RECOVERY_META_KEY, "{壊れている");
    expect(hasCloudRecoveryAccount(broken as unknown as Storage)).toBe(false);
    expect(hasCloudRecoveryAccount(storageWith({ recoveryId: "" }))).toBe(false);
    expect(hasCloudRecoveryAccount(storageWith({ sessionToken: "token" }))).toBe(false);
  });
});

describe("ホームの警告札", () => {
  it("未登録の時だけ作り、登録済みなら作らない", () => {
    expect(home).toContain("function renderCloudRecoveryWarning");
    expect(home).toContain("if (hasCloudRecoveryAccount()) return null;");
    // 期限で消える判定に差し替えられていないこと
    expect(home).not.toContain("loadCloudMeta()");
  });

  it("配布の札より先に積む", () => {
    const warning = home.indexOf("renderCloudRecoveryWarning(openSettings)");
    const compensation = home.indexOf("...renderCompensationBanners(");
    expect(warning).toBeGreaterThan(0);
    expect(warning).toBeLessThan(compensation);
  });

  it("**閉じるボタンを付けない**(いちばん要る人から先に消える)", () => {
    const block = home.slice(home.indexOf("function renderCloudRecoveryWarning"), home.indexOf("/** 畳んだぶんの行"));
    expect(block).not.toContain("閉じる");
    expect(block).not.toContain("onDismiss");
  });

  it("危ないことと、やり方の入口を書く", () => {
    expect(home).toContain("アカウント復旧の登録がまだです");
    expect(home).toContain("データはこの端末の中だけ。消すと戻せません。");
    expect(home).toContain("IDとパスワードを決めるだけです（メール不要）");
    // 押した先で自分から探させない
    expect(home).toContain('document.querySelector(".cloud-recovery")?.scrollIntoView');
  });

  it("**手順の全文はホームに積まない**(積んだら下のボタンが画面外へ出た)", () => {
    /*
     * 実機(390x844)で手順4行を札へ積んだところ `--home-banner-h` が640pxへ膨らみ、
     * 世界の枠が y=904 —— 画面の外。「試練の塔」も「遊び方」も押せなくなった。
     * ホームは 100dvh を分け合う縦並びで、上に足したぶんは下を押し出す
     */
    const block = home.slice(home.indexOf("function renderCloudRecoveryWarning"), home.indexOf("/** 畳んだぶんの行"));
    expect(block).not.toContain('el("ol"');
    expect(block).not.toContain("復旧キーを控える");
  });

  it("手順の全文は、押した先のクラウド復旧の欄にある", () => {
    expect(bootstrap).toContain("function registerSteps");
    expect(bootstrap).toContain("登録のやり方（メールアドレスは要りません）");
    expect(bootstrap).toContain('下の「アカウント復旧を設定」を開く');
    expect(bootstrap).toContain("復旧IDとパスワード（6文字以上）を決めて「復旧設定を登録」を押す");
    expect(bootstrap).toContain("表示される復旧キーを控える");
    // 未登録の人にだけ出す(登録済みの画面に手順が残っていると読み違える)
    const disconnected = bootstrap.indexOf("function renderDisconnected");
    expect(bootstrap.indexOf("registerSteps()", disconnected)).toBeGreaterThan(disconnected);
  });

  it("登録できた瞬間に、出ている札を消す", () => {
    expect(bootstrap).toContain("function dismissHomeWarning");
    expect(bootstrap).toContain("[data-cloud-recovery-warning]");
    const register = bootstrap.indexOf("await registerRecovery(");
    expect(bootstrap.indexOf("dismissHomeWarning();", register)).toBeGreaterThan(register);
  });

  it("高さの申告には触らない(触ると世界の枠が潰れて試練の塔が押せなくなる)", () => {
    const block = bootstrap.slice(bootstrap.indexOf("function dismissHomeWarning"), bootstrap.indexOf("function showRecoveryKey"));
    expect(block).not.toContain("--home-banner-h");
  });
});

describe("警告札の見た目", () => {
  it("CSSが取り込まれている", () => {
    expect(main).toContain('import "./ui/cloudRecoveryWarning.css";');
  });

  it("**浮かせない。**position を1つも持たない", () => {
    // 浮遊パネルで押せないボタンを作った事故を3回出している
    expect(css).not.toMatch(/position\s*:\s*(fixed|absolute|sticky)/);
  });

  it("文字が9pxを下回らない", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)rem/g)].map((match) => Number(match[1]) * 16);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(9);
  });

  it("押す的が40pxを下回らない", () => {
    const minHeight = /\.cloud-warn__go[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(minHeight).not.toBeNull();
    expect(Number(minHeight![1])).toBeGreaterThanOrEqual(40);
  });

  it("**本文を3行で止める。**伸びると下のボタンを画面外へ押し出す", () => {
    // 2行では「どうすれば登録できるか」が省略記号の向こうへ消えた(実機で確認)
    expect(css).toContain("line-clamp: 3");
    expect(css).toMatch(/\.cloud-warn__lead[^}]*overflow:\s*hidden/);
  });

  it("横一列で、縦へ積み上げない", () => {
    // 縦積みで291pxまで伸ばし、実機で「試練の塔」を押せなくした
    expect(css).toMatch(/\.cloud-warn\s*\{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto/);
  });
});

describe("お知らせ", () => {
  it("HOMEのアップデート情報へ載せてある", () => {
    const compensation = readFileSync(new URL("../src/game/compensation.ts", import.meta.url), "utf8");
    expect(compensation).toContain("2026-09-04-cloud-recovery-warning");
    expect(compensation).toContain("9/4 アカウント復旧の案内をホームに追加");
  });
});
