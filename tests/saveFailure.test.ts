import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createInitialState, lastSaveFailure, savePlayerState } from "../src/game/playerState.js";

/**
 * セーブの失敗を、投げっぱなしにしない。
 *
 * ## 起きていたこと
 *
 * `savePlayerState` が `localStorage.setItem` の1行だったので、保存領域が
 * 一杯だと `QuotaExceededError` がそのまま呼び出し元へ抜けていた。
 * 召喚はこう並んでいる:
 *
 *   書を減らす → 抽選 → モンスターを足す → **保存(ここで例外)**
 *   → 結果を画面へ → 描き直す
 *
 * 後ろ2つに到達しないので、報告された症状がそのまま出る。
 *
 *   ・演出が出ない ・モンスターは増えている ・戻ると書が減っている
 *   ・**再起動すると書が戻る**(何も保存されていないため)
 *
 * 実機(Chromium)で上限は4.5MB。モンスター1体405バイト・装備1個276バイトなので、
 * 長く遊んだ人ほどここへ来る。
 */

const KEY = "crimon_save_v1";

/** localStorage の最小限の代役。setItem だけ差し替えられるようにする */
function installStorage(setItem: (key: string, value: string) => void): void {
  const data = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem,
    removeItem: (k: string) => { data.delete(k); },
    clear: () => { data.clear(); },
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  };
}

beforeEach(() => { installStorage(() => {}); savePlayerState(createInitialState()); });
afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; });

describe("保存に失敗しても例外を投げない", () => {
  it("保存領域が一杯でも throw しない。false が返る", () => {
    installStorage(() => { throw new DOMException("quota", "QuotaExceededError"); });
    const state = createInitialState();
    expect(() => savePlayerState(state)).not.toThrow();
    expect(savePlayerState(state)).toBe(false);
  });

  it("失敗の中身を取り出せる。**保存領域が一杯かどうかも見分ける**", () => {
    installStorage(() => { throw new DOMException("quota", "QuotaExceededError"); });
    savePlayerState(createInitialState());
    const failure = lastSaveFailure();
    expect(failure, "失敗が記録されていない").not.toBeNull();
    expect(failure!.quotaExceeded, "一杯だと分かっていない").toBe(true);
    expect(failure!.bytes, "大きさが分からない").toBeGreaterThan(0);
  });

  it("書き込み禁止のような別の失敗は、一杯とは分けて記録する", () => {
    installStorage(() => { throw new Error("write denied"); });
    savePlayerState(createInitialState());
    expect(lastSaveFailure()!.quotaExceeded).toBe(false);
  });

  it("成功したら失敗の記録は消える", () => {
    installStorage(() => { throw new DOMException("quota", "QuotaExceededError"); });
    savePlayerState(createInitialState());
    expect(lastSaveFailure()).not.toBeNull();

    installStorage(() => {});
    expect(savePlayerState(createInitialState())).toBe(true);
    expect(lastSaveFailure()).toBeNull();
  });
});

/**
 * 画面側。**黙って消えるのがいちばん悪い。**
 * 保存できていないことは、遊び方の案内より先に伝える。
 */
describe("保存できていないことを画面に出す", () => {
  const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
  const CSS = readFileSync(new URL("../src/web/ui/tutorialBar.css", import.meta.url), "utf8");

  it("警告の帯を組み立てている", () => {
    expect(MAIN).toContain("function buildSaveFailureBar");
    expect(MAIN).toContain("データを保存できていません");
  });

  it("案内の帯より上に出す", () => {
    // 初心者ミッションの帯を prepend した後に、警告を prepend する = 警告が上
    const i = MAIN.indexOf("const bar = buildTutorialBar();");
    const j = MAIN.indexOf("const saveBar = buildSaveFailureBar();");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  /*
   * **数字を見て、原因を3つに切り分ける。**どれも同じ `QuotaExceededError` になる。
   *
   * 実ユーザーのスクショで**セーブ882KB**で失敗していると分かった。
   * localStorage の上限はふつう5MB前後なので、882KB で溢れるのは
   * アプリのデータ量の問題ではない。それなのに当時の文面は
   * 「装備やモンスターを整理してください」——**整理しても直らない案内**だった。
   */
  it("許す量に余裕がある時は、整理ではなく設定を疑わせる", () => {
    const detail = MAIN.slice(MAIN.indexOf("function quotaDetail"), MAIN.indexOf("function buildSaveFailureBar"));
    const roomy = detail.slice(detail.indexOf("if (quota >= ROOMY_QUOTA)"), detail.indexOf("if (quota > 0)"));
    expect(roomy).toContain("サイトのデータを保存しない設定");
    expect(roomy, "余裕がある人に整理を案内しない").not.toContain("整理して空き");
  });

  it("警告にはモンスターや装備の整理案内も出す", () => {
    expect(MAIN).toContain("モンスターや装備が増えすぎている場合は、使わないものを整理してください");
  });

  it("小さいセーブで失敗した人に「整理しても直らない」と伝える", () => {
    const detail = MAIN.slice(MAIN.indexOf("function quotaDetail"), MAIN.indexOf("function buildSaveFailureBar"));
    expect(detail).toContain("装備やモンスターを整理しても直りません");
  });

  /*
   * `navigator.storage.estimate()` の `usage` は localStorage を数えないことがある。
   * 実機(Chromium)で quota 958.6MB / usage 0 が返り、画面に「使用 **不明**」と出た。
   * **0 を割り算に使えば判定ごと嘘になる。**
   */
  it("信用できない usage を、表示にも判定にも使わない", () => {
    const detail = MAIN.slice(MAIN.indexOf("function quotaDetail"), MAIN.indexOf("function buildSaveFailureBar"));
    expect(detail, "使用量を画面に出している").not.toContain("使用 ");
    expect(detail, "usage で割っている").not.toMatch(/usage\s*\//);
  });

  it("usage が欠けていても quota だけで案内する", () => {
    const req = MAIN.slice(MAIN.indexOf("function requestStorageEstimate"), MAIN.indexOf("function formatBytes"));
    expect(req, "usage が無いだけで諦めている").not.toContain("estimate.usage === undefined ||");
    expect(req).toContain("estimate.usage ?? 0");
  });

  /*
   * 控えを取る的を帯の中に置く。以前は「まず下の『データを書き出す』で」と
   * 書いていたが、**そのボタンはホームにしか無い。**召喚画面で警告が出ている人には
   * 存在しないものを指していた。
   */
  it("その場で控えを書き出せる", () => {
    const bar = MAIN.slice(MAIN.indexOf("function buildSaveFailureBar"), MAIN.indexOf("function mountTutorialBar"));
    expect(bar).toContain("onclick: handleExportSave");
    expect(bar).toContain("⬇ 控えを書き出す");
  });

  /*
   * 狭い端末で説明が消えていた。`.tutorial-bar__cond > span:first-child` を
   * 380px 以下で `display: none` にしていて、**周回の帯だけが例外指定**されていた。
   * 360px の端末では題だけが残り、何をすればいいかが1文字も出ない。
   */
  it("360pxでも警告文が消えない", () => {
    const media = CSS.slice(CSS.indexOf("@media (max-width: 380px)"));
    expect(media).toContain(".tutorial-bar--danger .tutorial-bar__cond > span:first-child");
  });

  /*
   * **浮かせない。**この案件では浮遊パネルで押せないボタンを3回作っている。
   */
  it("帯を浮かせていない", () => {
    const rule = CSS.slice(CSS.indexOf(".tutorial-bar--danger {"));
    const block = rule.slice(0, rule.indexOf("}"));
    expect(block).not.toContain("position:fixed");
    expect(block).not.toContain("position: fixed");
    expect(block).not.toContain("position:absolute");
    expect(block).not.toContain("position: absolute");
  });
});

/**
 * 召喚は「消費して得る」操作。保存できないなら**無かったことにする。**
 * ここを素通りさせると、書だけ減って見えるのに再起動で戻る、という
 * 実際に報告された状態になる。
 */
describe("保存できなかった召喚は巻き戻す", () => {
  const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

  it("ダイヤの召喚・書の召喚・はじまりの10連の3つとも巻き戻す", () => {
    const rollbacks = MAIN.match(/if \(!savePlayerState\(state\.player\)\) \{/g) ?? [];
    expect(rollbacks.length, "保存の成否を見ている召喚の数").toBeGreaterThanOrEqual(3);
    expect(MAIN).toContain("state.player.summonScrolls += count;");
    expect(MAIN).toContain("state.player.crystal += cost;");
    expect(MAIN).toContain("state.player.tutorialSummonDone = false;");
  });

  it("足したモンスターも取り消す", () => {
    expect(MAIN).toContain("removeMonsters(state.player, added.map((m) => m.id));");
  });
});
