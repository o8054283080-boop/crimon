/**
 * ホームの「ダンジョン」を押すと開く選択。
 *
 * 前は世界の中に浮いた小窓で、次の崩れを全部抱えていた(依頼主:「簡易的すぎるかつバランスが悪い」)。
 * - 3列の格子に5つで、下の段が欠けていた
 * - 幅142pxに9pxの文字を押し込み、「ゴールド」が2行に折れていた。押す所も44x39pxだった
 * - 目覚=育成、遺跡=装備の絵の使い回しで、見分けられなかった
 * - 名前が「目覚」「遺跡」の略称だけで、何が手に入るかが書かれていなかった
 * - `position:absolute` でお知らせの札の上に乗り、札を覆っていた
 * - CSSが4つのファイルに `!important` で積み重なっていた
 *
 * どれかへ戻ったらここが落ちる。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInitialState } from "../src/game/playerState.js";
import { GOLD_DUNGEON_DAILY_LIMIT } from "../src/data/goldDungeon.js";
import { dungeonChooserEntries } from "../src/web/views/home.js";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const source = read("src/web/views/home.ts");
const css = read("src/web/ui/dungeonChooser.css");

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(path));
    else if (entry.name.endsWith(".css")) out.push(path);
  }
  return out;
}

/** セレクタの中身(宣言の塊)を取り出す */
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} が無い`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("ダンジョンの選択", () => {
  it("正式な名前と、手に入るものを5つそろえて並べる", () => {
    const entries = dungeonChooserEntries(createInitialState(), true);
    expect(entries.map((e) => [e.mark, e.name, e.yields])).toEqual([
      ["equipDungeon", "装備ダンジョン", "装備"],
      ["trainDungeon", "育成ダンジョン", "経験値"],
      ["goldDungeon", "ゴールドダンジョン", "ゴールド"],
      ["awakeningDepth", "目覚の深域", "才能覚醒の素材"],
      ["ruins", "遺跡", "アクセサリー"],
    ]);
    // 絵と色の系統は5つとも別(使い回しに戻さない)
    expect(new Set(entries.map((e) => e.tone)).size).toBe(5);
    // 確率の数字は出さない
    for (const e of entries) expect(e.status).not.toMatch(/%|％/);
  });

  it("遺跡の入口が無い時は4つで、欠けた段は作らない(1列に並べる)", () => {
    expect(dungeonChooserEntries(createInitialState(), false).map((e) => e.mark)).not.toContain("ruins");
    // 格子の列数で並べると、数が割り切れない時に段が欠ける
    expect(block(".dungeon-chooser__list")).toContain("flex-direction: column");
    expect(css).not.toMatch(/grid-template-columns:\s*repeat\(3/);
  });

  it("1日の回数を使い切ったら、消さずに印を付ける", () => {
    const player = createInitialState();
    const now = Date.now();
    player.goldDungeonChallengesToday = GOLD_DUNGEON_DAILY_LIMIT;
    player.lastGoldDungeonResetAt = now;
    const gold = dungeonChooserEntries(player, true, now).find((e) => e.mark === "goldDungeon")!;
    expect(gold.spent).toBe(true);
    expect(gold.status).toBe(`本日 残り0/${GOLD_DUNGEON_DAILY_LIMIT}回`);
  });

  it("5つの絵は別々のファイルで、中身も違う", () => {
    const names = ["equip", "train", "gold", "awakening", "ruins"];
    const bodies = names.map((name) => {
      const path = new URL(`src/web/assets/home/dungeon-${name}.svg`, root);
      expect(existsSync(path), `dungeon-${name}.svg が無い`).toBe(true);
      expect(source).toContain(`../assets/home/dungeon-${name}.svg`);
      return readFileSync(path, "utf8");
    });
    expect(new Set(bodies).size).toBe(5);
  });

  it("閉じるまで背面を触らせないシートとして名乗り、世界の中へは置かない", () => {
    const open = source.indexOf('className: "dungeon-chooser"');
    expect(open).toBeGreaterThan(0);
    const head = source.slice(open, source.indexOf("}", open));
    expect(head).toContain('role: "dialog"');
    expect(head).toContain('"aria-modal": "true"');
    // 暗幕を押すか「閉じる」で閉じる
    expect(source).toContain('className: "dungeon-chooser__scrim", onclick: closeDungeonChooser');
    expect(source).toContain('className: "dungeon-chooser__close", onclick: closeDungeonChooser');
    // 世界(`home-world`)の子に戻すと、また浮いた小窓になって札を覆う
    expect(source.indexOf("      dungeonChooser,\n")).toBeGreaterThan(source.indexOf("      settingsSheet,\n"));
    // 巡回の目印は描画側で `tile:<mark>` として付ける
    expect(source).toContain('"data-tour": `tile:${entry.mark}`');
  });

  it("CSSはこの1ファイルだけで、`!important` を積まない", () => {
    const others = cssFiles(new URL("src/web/", root).pathname)
      .filter((path) => !path.endsWith("dungeonChooser.css"))
      .filter((path) => /dungeon-chooser/.test(readFileSync(path, "utf8")));
    expect(others, "ダンジョンの選択のルールが別のCSSにある").toEqual([]);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("!important");
    expect(source).toContain('import "../ui/dungeonChooser.css"');
  });

  it("押す所は44px以上、文字は9px以上", () => {
    expect(block(".dungeon-chooser .dungeon-chooser__card")).toMatch(/min-height: (\d+)px/);
    expect(Number(block(".dungeon-chooser .dungeon-chooser__card").match(/min-height: (\d+)px/)![1])).toBeGreaterThanOrEqual(44);
    expect(Number(block(".dungeon-chooser .dungeon-chooser__close").match(/min-height: (\d+)px/)![1])).toBeGreaterThanOrEqual(44);
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
  });

  it("下のバーの裏へ潜り込ませない(バーの高さぶん床を上げる)", () => {
    expect(block(".dungeon-chooser")).toContain("var(--bottom-nav-h");
    // 上はノッチを避ける。env() を直に書かず、注入できる変数を通す
    expect(block(".dungeon-chooser")).toContain("var(--home-safe-top");
    expect(css).not.toContain("env(safe-area");
  });
});
