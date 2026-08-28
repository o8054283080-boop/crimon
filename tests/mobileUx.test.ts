import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileCss = readFileSync(new URL("../src/web/mobile-ux.css", import.meta.url), "utf8");
const navSource = readFileSync(new URL("../src/web/views/bottomNav.ts", import.meta.url), "utf8");

describe("iPhone UX baseline", () => {
  it("44px tap target and both safe-area axes remain defined", () => {
    expect(mobileCss).toContain("--tap-target: 44px");
    expect(mobileCss).toContain("env(safe-area-inset-bottom)");
    expect(mobileCss).toContain("env(safe-area-inset-left)");
    expect(mobileCss).toContain("env(safe-area-inset-right)");
  });

  it("reduced motion disables transform feedback", () => {
    expect(mobileCss).toContain("prefers-reduced-motion: reduce");
    expect(mobileCss).toMatch(/prefers-reduced-motion:[\s\S]*transform: none/);
  });

  it("bottom navigation exposes its landmark and current page", () => {
    expect(navSource).toContain('"aria-label": "メインナビゲーション"');
    expect(navSource).toContain('"aria-current": tab.screen === current ? "page"');
  });
});
