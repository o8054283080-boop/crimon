import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("../src/web/views/trialTower.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/web/ui/trialTower.css", import.meta.url), "utf8");

describe("試練の塔: 敵情報・ランキングUI", () => {
  it("敵情報ボタンは60階以降だけ表示し、実データ生成関数を使う", () => {
    expect(view).toContain("props.nextFloor >= 60");
    expect(view).toContain("trialTowerEnemyInfo(props.nextFloor)");
    expect(view).toContain('"data-tour": "tower-enemy-info-open"');
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
