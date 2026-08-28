import { describe, expect, it } from "vitest";
import { homeTowerSummary } from "../src/web/views/home.js";
import { createInitialState, getParty } from "../src/game/playerState.js";
import { partyCardAction } from "../src/web/uxHelpers.js";
import { vi } from "vitest";

describe("home UI data and navigation contracts", () => {
  it("renders a safe tower fallback for old and invalid saves", () => {
    expect(homeTowerSummary(undefined)).toEqual({ bestFloor: 0, nextFloor: 1, status: "FLOOR 0 / 100" });
    expect(homeTowerSummary(Number.NaN)).toEqual({ bestFloor: 0, nextFloor: 1, status: "FLOOR 0 / 100" });
  });

  it("clamps tower progress to the official 100 floors", () => {
    expect(homeTowerSummary(47)).toEqual({ bestFloor: 47, nextFloor: 48, status: "FLOOR 47 / 100" });
    expect(homeTowerSummary(999)).toEqual({ bestFloor: 100, nextFloor: 100, status: "100F COMPLETE" });
  });

  it("the initial save supplies all four CURRENT PARTY slots", () => {
    expect(getParty(createInitialState())).toHaveLength(4);
  });

  it("a populated party card keeps the detail callback contract", () => {
    const instance = getParty(createInitialState())[0];
    const edit = vi.fn();
    const detail = vi.fn();
    partyCardAction(instance, edit, detail)();
    expect(detail).toHaveBeenCalledWith(instance.id);
    expect(edit).not.toHaveBeenCalled();
  });

  it("a missing party slot keeps the party-edit callback contract", () => {
    const edit = vi.fn();
    partyCardAction(undefined, edit, vi.fn())();
    expect(edit).toHaveBeenCalledOnce();
  });
});
