import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BATTLE_SCREENS } from "../src/web/audio/bgmScene.js";

/**
 * 画面が真っ黒になって操作できなくなった事故の見張り。
 *
 * `render()` は `root.innerHTML = ""` で一度まっさらにしてから中身を組み立てる。
 * 途中で例外が出れば、消したまま何も入らない——**押せるものが1つも無い画面**が残る。
 * 実際に出したのは次の形:
 *
 *   結果画面で「戻る」 → 戻り先が終わったばかりの戦闘画面
 *   → 進行中の戦い(`stageRun`)がもう無い → 例外 → 真っ黒
 *
 * 型チェックもテストもここを素通りする(投げるのは実行時で、しかも
 * 画面の組み立ての奥)。だからソースの形そのものを見張る。
 */
const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

describe("画面が空のまま残らないこと", () => {
  it("戦闘画面は履歴に積まない", () => {
    // 決着した戦いは戻れる場所ではない。積む側と `canGoBack()` の扱いを揃える
    expect(MAIN).toContain("if (!BATTLE_SCREENS.has(lastRouteState.screen)) routeHistory.push(lastRouteState);");
  });

  it("進行中の戦いが無い戦闘画面は、描く前にホームへ落とす", () => {
    expect(MAIN).toMatch(/if \(BATTLE_SCREENS\.has\(state\.screen\) && !hasBattleRun\(state\.screen\)\) \{\s*navigate\("HOME"\);/);
  });

  it("すべての戦闘画面が hasBattleRun で見分けられている", () => {
    const body = MAIN.slice(MAIN.indexOf("function hasBattleRun"));
    const listed = new Set([...body.slice(0, body.indexOf("\n}")).matchAll(/case "([A-Z_]+)":/g)].map((m) => m[1]));
    // 戦闘画面を足したのに控えの見分けを足し忘れると、その画面だけ真っ黒になる
    for (const screen of BATTLE_SCREENS) expect(listed).toContain(screen);
  });

  it("描画が投げても受け止めてホームへ落とす", () => {
    expect(MAIN).toMatch(/function render\(\): void \{\s*try \{\s*renderScreen\(\);/);
    expect(MAIN).toContain("画面を表示できませんでした。");
  });
});
