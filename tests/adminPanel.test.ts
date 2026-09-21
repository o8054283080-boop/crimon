/**
 * 管理者画面。
 *
 * ## 何が問題だったのか(依頼主の指摘)
 *
 *   1. **情報が遅れすぎている。**開き直しても古く、しかも
 *      「いつ時点の値か」が画面に出ていないので判断できない
 *   2. **見られる情報が少ない。**サーバは18項目返しているのに、
 *      一覧に出ていたのは5つだけだった
 *
 * ## 遅れの出どころは2つある
 *
 *   - **サーバが直接持つ値**(レート・勝敗・コイン)。対戦の瞬間に更新される
 *   - **プレイヤーの端末から上がってくる値**(Lv・所持金・所持数)。
 *     クラウド保存のたびに更新されるので、**その間隔ぶん古い**
 *
 * 後者が12時間間隔だった。間隔を詰めるのと、いつ時点かを出すのと、両方やる。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

const PANEL = read("web/adminPanel.ts");
const CSS = read("web/adminPanel.css");
const CLOUD = read("web/cloudRecoveryBootstrap.ts");

describe("いつ時点の値かが分かる", () => {
  it("集計時刻を画面に出す", () => {
    // サーバは前から `generatedAt` を返していたのに、受け取って捨てていた
    expect(PANEL).toContain("dashboard.generatedAt");
    expect(PANEL).toContain("crimon-admin-generated");
    expect(PANEL).toContain("時点");
  });

  it("遅れの出どころを書いてある", () => {
    // 同じ画面に「即時の値」と「端末から上がる値」が並ぶ。区別が付かないと読めない
    expect(PANEL).toContain("対戦の瞬間に更新されます");
    expect(PANEL).toContain("クラウド保存した時点");
  });

  it("経過時間を添え、古いものに印を付ける", () => {
    expect(PANEL).toContain("function sinceText(");
    expect(PANEL).toContain("function savedMetric(");
    expect(PANEL).toContain("is-stale");
    expect(CSS).toContain(".crimon-admin-metric.is-stale");
  });
});

describe("開いたまま古くならない", () => {
  it("自動で読み直す", () => {
    expect(PANEL).toContain("AUTO_RELOAD_MS");
    expect(PANEL).toContain("startAutoReload");
  });

  it("閉じたら止める", () => {
    // 裏に回った画面が叩き続けない
    const at = PANEL.indexOf("function closeAdmin(");
    expect(at).toBeGreaterThan(-1);
    expect(PANEL.slice(at, at + 200)).toContain("stopAutoReload()");
    expect(PANEL).toContain("document.hidden");
  });

  it("黙って読み直す時は、出ている一覧を消さない", () => {
    /*
     * 毎分「読み込み中…」に差し替えると、押そうとした札が化けて
     * 操作を取りこぼし、検索の途中の文字も消える。
     */
    expect(PANEL).toContain("async function loadDashboard(root: HTMLElement, quiet = false)");
    expect(PANEL).toContain("if (!quiet) {");
    expect(PANEL).toContain("if (quiet) return;");
  });
});

describe("受け取っている値を捨てない", () => {
  /** サーバが返す項目のうち、一覧に出ていなかったもの */
  const RECOVERY_FIELDS = ["monsterCount", "equipmentCount", "latestRevision", "createdAt", "lockedUntil", "failedAttempts"];
  const ARENA_FIELDS = ["bestRating", "defenseWins", "defenseLosses", "lifetimeCoins", "tickets", "ticketsMax", "lastMatchAt"];

  for (const field of RECOVERY_FIELDS) {
    it(`登録データの ${field} を出す`, () => {
      expect(PANEL, `${field} を受け取っておきながら画面に出していない`).toContain(`row.${field}`);
    });
  }

  for (const field of ARENA_FIELDS) {
    it(`アリーナの ${field} を出す`, () => {
      expect(PANEL, `${field} を受け取っておきながら画面に出していない`).toContain(`row.${field}`);
    });
  }

  it("項目が増えても行が崩れない", () => {
    // 5列の決め打ちでは収まらない。入るだけ並べて折り返す
    expect(CSS).toContain("repeat(auto-fit, minmax(96px, 1fr))");
  });

  it("狭い画面で項目を消さない", () => {
    /*
     * 640px 未満で 4番目と 5番目を消していた。列を3つに決め打ちしていた
     * 頃の名残で、**消えていたのは「ダイヤ」と「モンスターの体数」**
     * ——問い合わせを受けた時にまっ先に見る値だった。
     * しかも消えたことは画面に出ないので、**端末によって答えが変わる。**
     */
    expect(CSS, "行の項目を display:none で落としている").not.toMatch(
      /\.crimon-admin-row\s*>\s*:nth-child\([45]\)[^}]*display:\s*none/,
    );
  });
});

describe("探し方", () => {
  it("並べ替えがある。既定は動きが新しい順", () => {
    /*
     * 登録順に並んでいると、いま遊んでいる人を探すのに全部見ることになる。
     * 問い合わせを受けて開く時も、まず見たいのは直近で動いた人。
     */
    expect(PANEL).toContain('let currentSort: "RECENT"');
    expect(PANEL).toContain('currentSort: "RECENT" | "RATING" | "LEVEL" | "NAME" = "RECENT"');
    expect(PANEL).toContain("function sortRecovery(");
    expect(PANEL).toContain("function sortArena(");
  });
});

/**
 * 見られる情報を増やす(依頼主の指定は3つ)。
 *
 *   1. **プレイヤーの進め具合** — ステージ・試練の塔・ダンジョン
 *   2. **モンスターと装備の中身** — 合計だけでは、
 *      「300体持っているが★6が0体」と「30体で★6が10体」が同じ顔で並ぶ
 *   3. **日別の動き** — いま遊んでいるのか、止まっているのか
 *
 * どれも**サーバが数えて返す**。控えの丸ごとは大きく(モンスター数百体・
 * 装備数千個)、そのまま画面へ送ると1000人ぶんで数十MBになる。
 */
const EDGE = readFileSync(new URL("../supabase/functions/crimon-admin/index.ts", import.meta.url), "utf8");
const PROGRESS = readFileSync(new URL("../supabase/functions/crimon-admin/progress.ts", import.meta.url), "utf8");

describe("進め具合が分かる", () => {
  it("数える所は、手元から動かせる形に切り出してある", () => {
    /*
     * 本体(`index.ts`)は `jsr:` から取り込むので**手元では動かせない。**
     * 数え方が間違っていても、本番へ流して画面を開くまで気づけない。
     * だから数える所だけ切り離し、`tests/adminProgress.test.ts` が
     * 実際に値を入れて確かめている。**ここに Deno 固有のものを入れないこと。**
     */
    expect(PROGRESS).toContain("export function saveProgress(");
    // コメントで名前を挙げるのは自由。見るのは**取り込みと呼び出し**だけ
    expect(PROGRESS, "Deno API を呼んでいる").not.toMatch(/^[^*/]*\bDeno\./m);
    expect(PROGRESS, "jsr から取り込んでいる").not.toMatch(/^import .*jsr:/m);
    expect(EDGE).toContain('from "./progress.ts"');
  });

  it("画面に、ステージ・塔・装備ダンジョンを出す", () => {
    expect(PANEL).toContain("progress.stageLabel");
    expect(PANEL).toContain("progress.towerLifetimeFloor");
    expect(PANEL).toContain("progress.equipFloor");
  });
});

describe("モンスターと装備の中身が分かる", () => {
  it("星ごとに数える", () => {
    expect(PROGRESS).toContain("monsterStars");
    expect(PROGRESS).toContain("equipStars");
    expect(PANEL).toContain("function starBreakdown(");
  });

  it("育て切った数と、+15の装備を出す", () => {
    expect(PANEL).toContain("progress.monsterMaxed");
    expect(PANEL).toContain("progress.equipMaxed");
  });

  it("0の星は書かない(並びが読めなくなる)", () => {
    expect(PANEL).toContain("count > 0");
  });
});

describe("日別の動きが分かる", () => {
  /*
   * 日の切り方と、0の日を落とさないことは `tests/adminProgress.test.ts` が
   * 実際に動かして確かめている(**日本時間で切らないと山が1日ずれる**)。
   * ここで見るのは、画面とサーバが繋がっているかどうか。
   */
  it("対戦の行そのものを数える", () => {
    // arena_standings の勝敗は合計なので、「いつ動いたか」が出てこない
    expect(EDGE).toContain('from("arena_matches").select("created_at")');
  });

  it("画面に出す", () => {
    expect(PANEL).toContain("function renderDaily(");
    expect(PANEL).toContain("dashboard.daily");
  });
});

describe("足した部品が、下の何かを覆わない", () => {
  it("折りたたみで、画面の流れの中に置く", () => {
    /*
     * **浮かせた部品は必ず下の何かを覆う。**この案件で3回やっている。
     * 初心者ミッションの浮遊パネル・ホームの fixed の小窓・
     * ログインボーナスの absolute の札。どれも押せないボタンを作った。
     */
    expect(PANEL).toContain('el("details", "crimon-admin-fold")');
    expect(CSS).toContain(".crimon-admin-fold");
    const fold = CSS.slice(CSS.indexOf(".crimon-admin-fold {"), CSS.indexOf(".crimon-admin-fold {") + 400);
    expect(fold, "浮かせている").not.toMatch(/position:\s*(fixed|absolute)/);
  });

  it("既定では閉じておく(一覧が画面の外へ押し出される)", () => {
    expect(PANEL, "open を付けている").not.toContain('box.open = true');
  });
});

describe("古いサーバでも画面が壊れない", () => {
  it("進め具合が無ければ、その欄を出さないだけにする", () => {
    /*
     * **サーバ側のdeployと、画面の配信は別の道を通る。**
     * どちらが先に着くかは決まっていないので、片方だけ新しい時間が必ずある。
     */
    expect(PANEL).toContain("progress?: SaveProgress | null");
    expect(PANEL).toContain("if (progress) {");
    expect(PANEL).toContain("if (overview) {");
  });
});

describe("遅れそのものを減らす", () => {
  it("クラウド保存の間隔を1時間にしてある", () => {
    /*
     * **12時間に1回だった。**端末が壊れた人は半日ぶんを失うし、
     * 管理者画面から見える値も最大12時間古い。
     */
    const auto = /const AUTO_SYNC_MS = ([\d *]+);/.exec(CLOUD);
    expect(auto, "自動保存の間隔が読めない").not.toBeNull();
    // eslint-disable-next-line no-eval
    const ms = Number(eval(auto![1]));
    expect(ms, "間隔が長すぎる(管理者画面がその分だけ古くなる)").toBeLessThanOrEqual(60 * 60 * 1000);
    // 短すぎても、遊んでいる間ずっと通信が走る
    expect(ms, "間隔が短すぎる").toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it("置いていかれた控えは、より短い間隔で追いつかせる", () => {
    const stale = /const STALE_BACKUP_MS = ([\d *]+);/.exec(CLOUD);
    const retry = /const STALE_RETRY_MS = ([\d *]+);/.exec(CLOUD);
    expect(stale).not.toBeNull();
    expect(retry).not.toBeNull();
    // eslint-disable-next-line no-eval
    expect(Number(eval(retry![1]))).toBeLessThan(Number(eval(stale![1])));
  });
});
