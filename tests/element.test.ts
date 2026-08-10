import { describe, expect, it } from "vitest";
import { getElementAffinity, getElementMultiplier } from "../src/core/element.js";

describe("元素相性", () => {
  it("火は草に強く、水に弱い", () => {
    expect(getElementAffinity("FIRE", "GRASS")).toBe("ADVANTAGE");
    expect(getElementAffinity("FIRE", "WATER")).toBe("DISADVANTAGE");
  });

  it("四属性の相性は一周する: 火→草→電気→水→火", () => {
    expect(getElementAffinity("GRASS", "ELECTRIC")).toBe("ADVANTAGE");
    expect(getElementAffinity("ELECTRIC", "WATER")).toBe("ADVANTAGE");
    expect(getElementAffinity("WATER", "FIRE")).toBe("ADVANTAGE");
  });

  it("隣接しない属性同士はニュートラル", () => {
    expect(getElementAffinity("FIRE", "ELECTRIC")).toBe("NEUTRAL");
    expect(getElementAffinity("GRASS", "WATER")).toBe("NEUTRAL");
  });

  it("光と闇は互いに弱点", () => {
    expect(getElementAffinity("LIGHT", "DARK")).toBe("ADVANTAGE");
    expect(getElementAffinity("DARK", "LIGHT")).toBe("ADVANTAGE");
  });

  it("光/闇は四属性に対してニュートラル", () => {
    expect(getElementAffinity("LIGHT", "FIRE")).toBe("NEUTRAL");
    expect(getElementAffinity("FIRE", "DARK")).toBe("NEUTRAL");
  });

  it("倍率は有利1.5倍・不利0.5倍・ニュートラル1.0倍", () => {
    expect(getElementMultiplier("FIRE", "GRASS")).toBeCloseTo(1.5);
    expect(getElementMultiplier("FIRE", "WATER")).toBeCloseTo(0.5);
    expect(getElementMultiplier("FIRE", "ELECTRIC")).toBeCloseTo(1.0);
  });
});
