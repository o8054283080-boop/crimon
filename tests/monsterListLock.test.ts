import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handleMonsterListLockClick, monsterListLockView } from "../src/web/views/monsters.js";

describe("所持モンスター一覧のロック操作", () => {
  it.each([
    [false, "モンスターをロック", "🔓"],
    [true, "モンスターのロックを解除", "🔒"],
  ] as const)("状態に応じた鍵を表示する", (locked, label, glyph) => {
    const view = monsterListLockView({ locked });
    expect(view.label).toBe(label);
    expect(view.glyph).toBe(glyph);
    expect(view.locked).toBe(locked);
  });

  it("鍵のクリックだけを処理し、カードへ伝播させない", () => {
    const toggle = vi.fn();
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    handleMonsterListLockClick(event, "monster-1", toggle);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(toggle).toHaveBeenCalledWith("monster-1");
  });

  it("3列を維持し、鍵のタップ領域を44px確保する", () => {
    const baseCss = readFileSync(new URL("../src/web/style.css", import.meta.url), "utf8");
    const listCss = readFileSync(new URL("../src/web/ui/monsterList.css", import.meta.url), "utf8");
    expect(baseCss).toMatch(/\.monster-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/s);
    expect(listCss).toMatch(/\.monsters-list-panel \.monster-list-card__lock\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s);
  });
});
