import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hasStartedHome, homeUtilityActions, startHome, tutorialMissionActions } from "../src/web/views/home.js";
import { TUTORIAL_MISSIONS } from "../src/game/tutorialMissions.js";

const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");

describe("NEW TITLE → NEW HOME regression contract", () => {
  it("shows title before the first START and persists START", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(hasStartedHome(storage)).toBe(false);
    startHome(storage);
    expect(hasStartedHome(storage)).toBe(true);
  });

  it("renders the CRIMON title logo, START control and transition", () => {
    expect(source).toContain('className: "title-screen crimon-title-screen"');
    expect(source).toContain('alt: "CRIMON"');
    expect(source).toContain('["START"]');
    expect(source).toContain('title-screen--leaving');
    expect(source).toContain('home-menu--visible');
  });

  it("preserves Arena, Shop, and How to Play callbacks exactly", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    const actions = homeUtilityActions({ onGoArena: callbacks[0], onGoShop: callbacks[1], onGoHowToPlay: callbacks[2] });
    actions.forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    expect(source).toContain('onclick: onGoHowToPlay');
  });

  it("wires tutorial destination and claim once", () => {
    const go = vi.fn(); const claim = vi.fn();
    const actions = tutorialMissionActions({ onGoTutorialDestination: go, onClaimTutorial: claim }, TUTORIAL_MISSIONS[0]);
    actions.go(); actions.claim();
    expect(go).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledWith(TUTORIAL_MISSIONS[0].destination);
    expect(claim).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledWith(TUTORIAL_MISSIONS[0].id);
  });

  it("keeps current, claimable and completed tutorial states", () => {
    expect(source).toContain("tutorialNext.condition");
    expect(source).toContain("rewardText(tutorialNext)");
    expect(source).toContain('["報酬を受け取る"]');
    expect(source).toContain("全30ミッション達成");
  });

  it("keeps CURRENT PARTY monster detail and puts Trial Tower in the side menu", () => {
    expect(source).toContain("homePartyCard(party[i], props.onGoParty, props.onViewPartyMonster)");
    expect(source).not.toContain('className: "crimon-hero"');
    expect(source).toContain('className: "crimon-side-menu"');
    expect(source).toContain("props.onGoTrialTower");
  });
});
