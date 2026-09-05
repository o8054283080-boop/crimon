import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("../src/web/views/trialTower.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/web/ui/trialTower.css", import.meta.url), "utf8");

describe("試練の塔: 敵情報・ランキングUI", () => {
  it("60階以降の各階を未到達でもボタンとして開き、選択階の実データを使う", () => {
    expect(view).toContain("const hasEnemyInfo = floor.floor >= 60");
    expect(view).toContain('return el("button"');
    expect(view).toContain("props.onOpenEnemyInfo(floor.floor)");
    expect(view).toContain("trialTowerEnemyInfo(props.enemyInfoFloor)");
    expect(view).toContain("ⓘ 60階以降は敵情報");
    expect(view).toContain('"data-tour": "tower-enemy-info-open"');
  });

  it("15・30階の追加報酬と、全100階の月次報酬一覧を分けて表示する", () => {
    expect(view).toContain("🎁 全100階の報酬を見る");
    expect(view).toContain("15階・30階の追加報酬");
    expect(view).toContain("TRIAL_TOWER_FLOORS.filter");
    expect(view).toContain("覚醒オーブ 1（追加）");
    expect(view).toContain('"data-tour": "tower-rewards-open"');
    expect(view).toContain('"data-tour": "tower-rewards"');
  });

  it("ランキングに空・失敗・100F CLEAR・自分固定行がある", () => {
    expect(view).toContain("まだ到達記録がありません");
    expect(view).toContain("ランキングを取得できませんでした");
    expect(view).toContain("👑 100F CLEAR");
    expect(view).toContain("tower-ranking__self");
    expect(view).toContain('"data-tour": "tower-ranking-open"');
  });

  it("縦画面で横へ溢れず、モーダルがSafe Areaを避ける", () => {
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("overflow-x: clip");
    expect(css).toContain("width: min(100%, 520px)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
