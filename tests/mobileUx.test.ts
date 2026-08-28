import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const mobile = readFileSync(new URL("../src/web/mobile-ux.css", import.meta.url), "utf8");
const visual = readFileSync(new URL("../src/web/crimon-visual-system.css", import.meta.url), "utf8");
const nav = readFileSync(new URL("../src/web/views/bottomNav.ts", import.meta.url), "utf8");

describe("home mobile UX contract", () => {
  it("keeps 44px targets, safe areas, stable decoration and reduced motion", () => {
    expect(mobile).toContain("--tap-target:44px");
    expect(mobile).toContain("env(safe-area-inset-bottom)");
    expect(mobile).toContain("pointer-events:none");
    expect(mobile).toContain("prefers-reduced-motion:reduce");
    expect(mobile).toContain(":focus-visible");
  });
  it("uses the CRIMON token palette and responsive minmax grids", () => {
    expect(visual).toContain("--crimon-gold-bright");
    expect(visual).toContain("--crimon-purple-glow");
    expect(visual).toContain("minmax(0,1fr)");
  });
  it("labels the navigation and its current page", () => {
    expect(nav).toContain('ariaLabel: "メインナビゲーション"');
    expect(nav).toContain('ariaCurrent: tab.screen === current ? "page"');
  });
});
