import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { vi } from "vitest";
import { dungeonActions, homeTowerSummary, homeUtilityActions } from "../src/web/views/home.js";

const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/web/crimon-visual-system.css", import.meta.url), "utf8");

describe("CRIMON world lobby", () => {
  it("uses real Trial Tower data safely", () => {
    expect(homeTowerSummary({ trialTowerBestFloor: 37, trialTowerRun: { floor: 42, members: [] } })).toEqual({ bestFloor: 37, floor: 42, progress: 37, isRunning: true });
    expect(homeTowerSummary({ trialTowerBestFloor: 999, trialTowerRun: { floor: -8, members: [] } })).toEqual({ bestFloor: 100, floor: 1, progress: 100, isRunning: true });
  });

  it("身分証 → 編成 → 世界 の順に積み、案内は世界の中へ入れる", () => {
    /*
     * **編成は世界の枠より上。**
     *
     * 世界の枠は左右の縦列が入りきる高さで縮まない(縮めると
     * `overflow:hidden` に切り落とされ「試練の塔」が押せなくなる。実際に出した事故)。
     * その結果、上に札や自動周回の帯が増えるたび**編成が画面の外へ押し出されて**
     * いた。実測で 390x844 でも下端の外(944px地点)まで落ちている。
     * 世界を縮めずに編成を必ず見せるには、順番を入れ替えるしかない。
     *
     * **札と初心者ミッションは世界の中(`world-info`)へ入れた。**
     * 外に積んでいた頃は2つで183pxを縦から取り、ホームが画面に収まらなかった
     * (実測: はみ出し164px)。中へ入れれば場所を分け合わない。
     */
    const selectors = ["crimon-resource-header", "current-party-panel", "home-world", "world-info"];
    const positions = selectors.map((selector) => source.indexOf(selector));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source).not.toContain('className: "crimon-brand"');

    // **世界の外へ戻さない。**戻すとまた画面からはみ出す
    const worldStart = source.indexOf('className: "home-world"');
    expect(source.indexOf("world-info"), "案内の箱が世界の外にある").toBeGreaterThan(worldStart);
  });

  it("has exactly the required world actions", () => {
    for (const label of ["ミッション", "図鑑", "ランキング", "遊び方", "冒険", "ダンジョン", "闘技場", "試練の塔"]) expect(source).toContain(`"${label}"`);
    expect(source.match(/"闘技場"/g)).toHaveLength(1);
    expect(source).not.toContain("ギルド");
  });

  it("renders real party figures without card chrome", () => {
    expect(source).toContain("party.map((member, index)");
    expect(source).toContain("props.onViewPartyMonster");
    expect(css).toContain(".world-party__figure");
    expect(css).toContain("border:0!important");
  });

  it("preserves dungeon callbacks", () => {
    // 目覚の深域を足した。**順番も込みで見る**——並びが入れ替わると別の場所へ飛ぶ
    const callbacks = [vi.fn(), vi.fn(), vi.fn(), vi.fn()] as const;
    dungeonActions({
      onGoEquipDungeon: callbacks[0], onGoLevelDungeon: callbacks[1],
      onGoGoldDungeon: callbacks[2], onGoAwakeningDepth: callbacks[3],
    }).forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
  });

  it("preserves arena, shop and help callbacks", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    homeUtilityActions({ onGoArena: callbacks[0], onGoShop: callbacks[1], onGoHowToPlay: callbacks[2] }).forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
  });

  it("下の帯の5マスを、絵の仕切りに合わせて割る", () => {
    /*
     * 帯は1枚の絵を `100% 100%` で引き伸ばして敷いている。
     * 絵の仕切りは 0.9 / 21.1 / 40.2 / 59.3 / 78.3 / 99.7% にあり、
     * **20%刻みではない**(画素を数えて実測)。`flex:1 1 0` の5等分に戻すと
     * 文字の中心がマスから最大4.7pxずれ、「ホーム」は絵より左、
     * 「召喚」は絵より右に出て並びがばらつく。
     *
     * 幅の合計が100%から外れていないことも見る。足りなければ右端が余り、
     * 超えれば5つ目が画面の外へ出る。
     */
    const pop = readFileSync(new URL("../src/web/home-pop-design.css", import.meta.url), "utf8");
    const widths = [1, 2, 3, 4, 5].map((n) => {
      const found = pop.match(new RegExp(`\\.bottom-nav__btn:nth-child\\(${n}\\)\\s*\\{\\s*flex:\\s*0 0 ([\\d.]+)%`));
      expect(found, `${n}番目のマスの幅が無い`).not.toBeNull();
      return Number(found![1]);
    });
    expect(widths.reduce((sum, w) => sum + w, 0)).toBeCloseTo(100, 1);
    // 両端は外枠の縁を抱えるぶん広い。中の3つはほぼ等しい
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[4]).toBeGreaterThan(widths[3]);
  });
});

describe("ホームの高さ(実機のノッチとホームインジケーター)", () => {
  /*
   * **コメントを落としてから読む。**この1枚は「なぜそうしたか」を長く書いて
   * あるので、説明文の中の `100dvh` や `env()` を規則と取り違える。
   */
  const pop = readFileSync(new URL("../src/web/home-pop-design.css", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  /** 同じセレクタの規則は複数ある(色だけのもの、高さのもの)。まとめて返す */
  function rulesFor(selector: string): string[] {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...pop.matchAll(new RegExp(`(^|[\\s,}])${escaped}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[2]);
  }

  it("safe-area は `env()` 直書きではなく変数を通す", () => {
    /*
     * **確認用ブラウザには safe-area が無い。**`env()` を直に書くと、
     * ノッチとホームインジケーターのぶん(iPhone 15 Pro Max で 59px + 34px)が
     * 一度も測れないまま「収まっています」と言うことになる。実際にそうなり、
     * 依頼主の実機では身分証が上で切れ、プレゼントが下タブの裏に沈んでいた。
     *
     * `--home-safe-top` / `--home-safe-bottom` を通していれば、
     * `tools/homeSafeArea.mjs` が注入して実機相当を再現できる。
     */
    const sized = rulesFor(".crimon-home").filter((body) => /(^|;|\s)(height|padding)/.test(body));
    expect(sized.length, "高さ・余白を決める .crimon-home の規則が見つからない").toBeGreaterThan(0);
    const all = sized.join("\n");
    expect(all).toContain("var(--home-safe-top)");
    expect(all).toContain("var(--bottom-nav-h)");
    for (const body of sized) expect(body).not.toContain("env(");
  });

  it("世界の枠は残りをもらう。高さを引き算で決めない", () => {
    /*
     * `calc(100dvh - 下タブ - ヘッダー - 86px - 48px - 23px - …)` という式が
     * メディアクエリ違いを含めて9本あり、**どれも safe-area を引いていなかった。**
     * 数え漏らした端末が出るたびに式を増やす作りをやめ、縦の flex の
     * 残りをもらう形にしてある。足りない端末では下限まで縮み、
     * そこから先は左右の縦列の段が分け合う。
     */
    const sized = rulesFor(".home-world").filter((body) => /(^|;|\s)(height|flex)/.test(body));
    expect(sized.length, "高さを決める .home-world の規則が見つからない").toBeGreaterThan(0);
    const all = sized.join("\n");
    expect(all).toContain("flex: 1 1 auto !important");
    expect(all).toContain("height: auto !important");
    // 引き算の式へ戻していない(この1枚に9本あったものを全部やめた)
    for (const body of sized) expect(body).not.toContain("100dvh");
  });

  it("左右の縦列の段は、枠を分け合って指で押せる大きさを保つ", () => {
    // 段が固定だと、枠が足りない端末で下の段が下タブの裏へ沈む(実機で発生)
    for (const side of ["left", "right"]) {
      const rule = pop.match(new RegExp(`\\.world-actions--${side} \\.world-action \\{[^}]*\\}`));
      expect(rule, `${side} の段の規則が無い`).not.toBeNull();
      expect(rule![0]).toContain("flex: 1 1 0 !important");
      const min = rule![0].match(/min-height:\s*(\d+)px/);
      expect(Number(min![1])).toBeGreaterThanOrEqual(44);
    }
  });
});

describe("初心者ミッションの札(世界の中の幅で読める形)", () => {
  const compact = readFileSync(new URL("../src/web/beginnerMissionCompact.ts", import.meta.url), "utf8");

  it("横に並べるのは2つまでにする", () => {
    /*
     * 札の幅は世界の中で約198px。内側の余白を引くと170pxしかない。
     * 3つ横に並べると実測で「✦ 初心者ミッション」と「0 / 80」が重なり、
     * ミッション名は幅38pxまで潰れて「モン…」になった。
     *
     * 1段目は見出しと章、全体の数はボタンと同じ3段目。
     * **`__top` を2列より多い grid へ戻すと、また重なる。**
     */
    expect(compact).toContain(".crimon-tutorial-compact__foot");
    expect(compact).toMatch(/__top\s*\{[^}]*display:\s*flex/);
    expect(compact).not.toMatch(/__top\s*\{[^}]*grid-template-columns/);
    // 全体の数は3段目(foot)へ。1段目(top)に混ぜない
    const footIndex = compact.indexOf("foot.append(overall");
    expect(footIndex).toBeGreaterThan(0);
    expect(compact).not.toContain("top.append(heading, overall)");
  });

  it("ミッション名は省略記号で畳み、折り返して縦に伸ばさない", () => {
    /*
     * 折り返すと札が背を伸ばし、世界の枠を押し下げて下のボタンを
     * 画面の外へ出す。**1行で畳んで、続きは押して開いた先で読ませる。**
     */
    expect(compact).toMatch(/__mission\s*\{[^}]*white-space:\s*nowrap/);
    expect(compact).toMatch(/__mission\s*\{[^}]*text-overflow:\s*ellipsis/);
  });

  it("全部終わったら札ごと出さない", () => {
    /*
     * **前に「終わった案内は引く」と直したつもりで、引けていなかった。**
     * `openTutorial` を `?.` にしただけで、札を作るのはやめていなかったため、
     * 全80達成した方の画面には「🏆 初心者ミッション 80 / 80 完全制覇！」が
     * 居座り続けていた(依頼主の実機の画面で発覚。同じ指摘が2回)。
     */
    expect(source).toMatch(/const tutorial = !tutorialNext \? null :/);
    // 「全◯ミッション達成！」の札そのものを作らない
    expect(source).not.toContain("crimon-tutorial__complete");
  });

  it("文字は9pxを割らない", () => {
    // 実機で読めない文字は無いのと同じ(`tests/cssReadability.test.ts` と同じ下限)
    const sizes = [...compact.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(9);
  });
});

/*
 * ホームのスタミナの札に添えた、ポーションの所持数。
 *
 * ## 0個で隠したら「壊れている」と読まれた
 *
 * 最初は幅の節約のつもりで「持っている時だけ出す」にしていた。
 * ところが依頼主が0個の画面を見て**「ポーションがみえません」**と言った。
 * 無いから出ていないのか、出す作りになっていないのか、画面から区別できない。
 * 数を出す目的そのものを外していたので、0個でも必ず出す形へ変えた。
 */
describe("スタミナポーションの所持数", () => {
  const potionCss = readFileSync(new URL("../src/web/home-pop-design.css", import.meta.url), "utf8");

  it("0個でも出す(持っている時だけ、にしない)", () => {
    const chip = source.slice(source.indexOf("home-wallet__potion") - 800, source.indexOf("home-wallet__potion") + 400);
    // 「0より大きい時だけ出す」の形が戻っていないこと
    expect(chip).not.toMatch(/staminaPotionsOwned\(player\)\s*>\s*0\s*\n?\s*\?/);
    expect(chip).toContain("home-wallet__potion");
  });

  it("0個は色を落とす印を付ける", () => {
    expect(source).toContain("home-wallet__potion--empty");
    expect(source).toContain("staminaPotionsOwned(player) === 0");
  });

  /*
   * **薄くする指定は、通常の色より後ろに置く。**
   * 詳細度が同じなので、先に書くと通常の色が後勝ちして効かない
   * (実際に先へ置いてしまい、0個でも緑のままだった)。
   */
  it("薄くする指定が、通常の色より後ろにある", () => {
    const normal = potionCss.indexOf(".crimon-resource-header .home-wallet__potion {");
    const empty = potionCss.indexOf(".crimon-resource-header .home-wallet__potion--empty");
    expect(normal).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(normal);
  });

  /*
   * 通貨の帯の数字。**9px未満は実機で読めない。**
   * `clamp()` の下限が7.5pxで、390px幅では 2vw = 7.8px になっていた
   * (`tests/cssReadability.test.ts` は clamp() の中までは見ていない)。
   */
  it("通貨の帯の数字が9pxを下回らない", () => {
    for (const match of potionCss.matchAll(/font-size:\s*clamp\(\s*([\d.]+)px/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(9);
    }
  });
});
