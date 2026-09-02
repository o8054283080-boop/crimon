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

  it("身分証 → 編成 → 世界 → 初心者ミッション の順に積む", () => {
    /*
     * **編成は世界の枠より上。**
     *
     * 世界の枠は `min-height: 356px` で縮まない(縮めると左右の縦列が
     * `overflow:hidden` に切り落とされ「試練の塔」が押せなくなる。実際に出した事故)。
     * その結果、上に札や自動周回の帯が増えるたび**編成が画面の外へ押し出されて**
     * いた。実測で 390x844 でも下端の外(944px地点)まで落ちている。
     * 世界を縮めずに編成を必ず見せるには、順番を入れ替えるしかない。
     */
    const selectors = ["crimon-resource-header", "current-party-panel", "home-world", "tutorial,"];
    const positions = selectors.map((selector) => source.indexOf(selector));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(source).not.toContain('className: "crimon-brand"');
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
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    dungeonActions({ onGoEquipDungeon: callbacks[0], onGoLevelDungeon: callbacks[1], onGoGoldDungeon: callbacks[2] }).forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
  });

  it("preserves arena, shop and help callbacks", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    homeUtilityActions({ onGoArena: callbacks[0], onGoShop: callbacks[1], onGoHowToPlay: callbacks[2] }).forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
  });
});
