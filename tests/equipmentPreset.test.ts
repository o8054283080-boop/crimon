import { describe, expect, it } from "vitest";
import { EQUIP_SLOTS, generateEquipment } from "../src/core/equipment.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, findMonsterById } from "../src/data/monsters.js";
import {
  addEquipment,
  addMonster,
  createInitialState,
  normalizeLoadedState,
  type PlayerState,
} from "../src/game/playerState.js";
import { decodeSave, encodeSave } from "../src/game/saveCodec.js";
import { applyAutoEquipPlan, createDefaultAutoEquipSettings, planAutoEquip } from "../src/game/autoEquip.js";
import {
  EQUIPMENT_PRESET_SLOTS,
  capturePreset,
  isPresetSaved,
  normalizeAutoEquipSettings,
  normalizeMonsterPresets,
  presetsOf,
  resolvePreset,
  writePreset,
} from "../src/game/equipmentPreset.js";

/**
 * 装備プリセット。
 *
 * ## ここで守るもの
 *
 *   1. 保存した装備と条件が、**再起動しても残る**
 *   2. **保存した装備が売られていても壊れない**(残りだけ着ける道を残す)
 *   3. 他の子が着けている装備は、**黙って外さない**(誰から外れるか分かる)
 *   4. 前から遊んでいる人の控えに枠が無くても、問題なく読める
 */

const DEX_IDS = ALL_DISPLAYABLE_MONSTERS_DEX.map((d) => d.id);

function makeRng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

function stateWith(perSlot = 4, seed = 7): { state: PlayerState; monsterId: string } {
  const state = createInitialState();
  state.monsters = [];
  state.equipment = [];
  const rng = makeRng(seed);
  const monster = addMonster(state, DEX_IDS[3], 6, 60);
  for (const slot of EQUIP_SLOTS) {
    for (let i = 0; i < perSlot; i += 1) addEquipment(state, generateEquipment({ slot, star: 6, subStatCount: 4, rng }));
  }
  const plan = planAutoEquip(state, monster.id, { ...createDefaultAutoEquipSettings(), type: "atk", scope: "ALL" });
  if (plan.ok) applyAutoEquipPlan(state, monster.id, plan.plan.assignment);
  return { state, monsterId: monster.id };
}

const nameOf = (m: { dexId: string }): string => findMonsterById(m.dexId)?.name ?? m.dexId;

describe("枠は常に3つある", () => {
  it("何も保存していない子でも3枠見える", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const presets = presetsOf(monster);
    expect(presets).toHaveLength(EQUIPMENT_PRESET_SLOTS);
    expect(presets.every((p) => !isPresetSaved(p))).toBe(true);
    expect(presets.map((p) => p.name)).toEqual(["プリセット1", "プリセット2", "プリセット3"]);
  });

  /*
   * **枠を可変長にしない。**2番目だけ保存した時に1番目が繰り上がると、
   * 「2番に入れたはずのものが1番に出る」ことになる。
   */
  it("2番だけ保存しても、1番と3番は空のまま残る", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    writePreset(monster, 1, capturePreset(monster, 1, createDefaultAutoEquipSettings(), "アリーナ"));
    const presets = presetsOf(monster);
    expect(isPresetSaved(presets[0])).toBe(false);
    expect(presets[1].name).toBe("アリーナ");
    expect(isPresetSaved(presets[1])).toBe(true);
    expect(isPresetSaved(presets[2])).toBe(false);
  });

  it("名前を付け替えられる", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    writePreset(monster, 0, capturePreset(monster, 0, createDefaultAutoEquipSettings(), "ボス"));
    expect(presetsOf(monster)[0].name).toBe("ボス");
  });
});

describe("装備と条件の両方が残る", () => {
  it("保存した時の装備がそのまま入る", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const preset = capturePreset(monster, 0, createDefaultAutoEquipSettings());
    for (const slot of EQUIP_SLOTS) {
      expect(preset.assignment[slot]).toBe(monster.equipment[slot]);
    }
  });

  it("おまかせの条件も一緒に残る", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const settings = {
      ...createDefaultAutoEquipSettings(),
      type: "custom" as const,
      priorities: ["spd", "atk"] as ("spd" | "atk")[],
      minimums: { spd: 180, criRate: 0.2 },
      scope: "ALL" as const,
      fixedSlots: [1 as 1],
    };
    const preset = capturePreset(monster, 0, settings);
    expect(preset.settings.type).toBe("custom");
    expect(preset.settings.priorities).toEqual(["spd", "atk"]);
    expect(preset.settings.minimums).toEqual({ spd: 180, criRate: 0.2 });
    expect(preset.settings.scope).toBe("ALL");
    expect(preset.settings.fixedSlots).toEqual([1]);
  });
});

describe("再起動しても残る", () => {
  it("保存して読み直しても、装備も条件も同じ", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    writePreset(monster, 0, capturePreset(monster, 0, {
      ...createDefaultAutoEquipSettings(), type: "spd", minimums: { spd: 170 }, fixedSlots: [2],
    }, "周回"));

    const restored = decodeSave(encodeSave(state))!;
    const back = restored.monsters.find((m) => m.id === monsterId)!;
    const preset = presetsOf(back)[0];
    expect(preset.name).toBe("周回");
    expect(preset.settings.type).toBe("spd");
    expect(preset.settings.minimums).toEqual({ spd: 170 });
    expect(preset.settings.fixedSlots).toEqual([2]);
    expect(preset.assignment).toEqual(presetsOf(monster)[0].assignment);
  });

  /*
   * **使っていない人のセーブを太らせない。**空の3枠を全員へ配ると、
   * 持っているモンスターの数だけ無駄が増える。
   */
  it("何も保存していない子は、保存の中で場所を取らない", () => {
    const { state } = stateWith();
    const saved = encodeSave(state);
    expect(saved).not.toContain("プリセット1");
  });
});

describe("前から遊んでいる人の控え", () => {
  it("枠が無くても読める", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    delete monster.equipmentPresets;
    const normalized = normalizeLoadedState(state);
    const back = normalized.monsters.find((m) => m.id === monsterId)!;
    expect(() => presetsOf(back)).not.toThrow();
    expect(presetsOf(back)).toHaveLength(EQUIPMENT_PRESET_SLOTS);
  });

  /*
   * **控えは人が書き換えられる。**知らない値が入っている前提で読む。
   */
  it("壊れた値が入っていても落ちない", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    (monster as { equipmentPresets?: unknown }).equipmentPresets = [
      { name: 123, assignment: "こわれている", settings: { type: "知らない型", priorities: ["foo"] }, savedAt: "昨日" },
      null,
      { name: "とても長い名前をつけてみたらどうなるか", assignment: { 1: 42 }, savedAt: 100 },
    ];
    expect(() => normalizeMonsterPresets(monster)).not.toThrow();
    const presets = presetsOf(monster);
    expect(presets).toHaveLength(3);
    expect(presets[0].name).toBe("プリセット1");
    expect(presets[0].settings.type).toBe("power");
    expect(presets[0].settings.priorities).toEqual([]);
    expect(presets[2].name.length).toBeLessThanOrEqual(12);
  });

  /*
   * 指定シリーズも枠へ焼いて、再起動しても残ること。
   * **形が増えた時に保存を通し忘れると、前から遊んでいる人だけが
   * 「保存したのに戻らない枠」を持つ**ことになる。
   */
  it("そろえるシリーズも、保存して読み直すと残る", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    writePreset(monster, 0, capturePreset(monster, 0, {
      ...createDefaultAutoEquipSettings(), type: "power", wantedSets: { SWIFT: 4, CRIT: 2 },
    }, "速攻"));

    const restored = decodeSave(encodeSave(state))!;
    const back = restored.monsters.find((m) => m.id === monsterId)!;
    expect(presetsOf(back)[0].settings.wantedSets).toEqual({ SWIFT: 4, CRIT: 2 });
  });

  it("知らないシリーズ名や、2でも4でもない個数は落とす", () => {
    const settings = normalizeAutoEquipSettings({
      wantedSets: { SWIFT: 4, CRIT: 3, でたらめ: 4, RAMPAGE: 2 },
    } as never);
    // 3個セットは無い。知らない名前も落とす。暴走の2は4へ引き上げる
    expect(settings.wantedSets).toEqual({ SWIFT: 4, RAMPAGE: 4 });
  });

  it("指定していない子は、そのぶんを持たない", () => {
    const settings = normalizeAutoEquipSettings({ type: "atk" } as never);
    expect(settings.wantedSets, "空の入れ物を配るとセーブが太る").toBeUndefined();
  });

  it("知らない条件は既定値へ丸める", () => {
    const settings = normalizeAutoEquipSettings({
      type: "でたらめ", priorities: ["spd", "spd", "atk", "def", "hp"], minimums: { spd: -5, atk: Number.NaN, hp: 100 },
      scope: "よその値", fixedSlots: [1, 1, 99],
    } as never);
    expect(settings.type).toBe("power");
    expect(settings.priorities, "同じものを2回優先しても意味が無い").toEqual(["spd", "atk", "def"]);
    expect(settings.minimums, "負やNaNは条件にしない").toEqual({ hp: 100 });
    expect(settings.scope).toBe("OWN_AND_UNEQUIPPED");
    expect(settings.fixedSlots).toEqual([1]);
  });
});

describe("保存した装備がもう無い時", () => {
  /*
   * **落とさない。**プリセットを開くだけで画面が死ぬのがいちばん悪い。
   * 売られた装備は黙って外し、数だけ数えて返す。
   */
  it("売られた装備は外して、欠けた数を教える", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const preset = capturePreset(monster, 0, createDefaultAutoEquipSettings());
    writePreset(monster, 0, preset);

    // 2つ売る
    const sold = [preset.assignment[1]!, preset.assignment[3]!];
    state.equipment = state.equipment.filter((e) => !sold.includes(e.id));
    for (const slot of EQUIP_SLOTS) {
      if (sold.includes(monster.equipment[slot] ?? "")) delete monster.equipment[slot];
    }

    const resolved = resolvePreset(state, monster, preset, nameOf);
    expect(resolved.missing).toBe(2);
    expect(resolved.available[1]).toBeUndefined();
    expect(resolved.available[3]).toBeUndefined();
    expect(resolved.available[2]).toBe(preset.assignment[2]);
  });

  it("全部売られていても落ちない", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const preset = capturePreset(monster, 0, createDefaultAutoEquipSettings());
    state.equipment = [];
    expect(() => resolvePreset(state, monster, preset, nameOf)).not.toThrow();
    const resolved = resolvePreset(state, monster, preset, nameOf);
    expect(Object.keys(resolved.available)).toHaveLength(0);
    expect(resolved.missing).toBeGreaterThan(0);
  });
});

describe("他の子が着けている時", () => {
  /*
   * **確認なしで外さない。**誰からどれが外れるかを、適用の前に出せること。
   */
  it("誰からどの装備が外れるか分かる", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const preset = capturePreset(monster, 0, createDefaultAutoEquipSettings());

    // 別の子に、そのプリセットの装備を着けさせる
    const other = addMonster(state, DEX_IDS[9], 6, 60);
    const takenId = preset.assignment[1]!;
    const taken = state.equipment.find((e) => e.id === takenId)!;
    delete monster.equipment[1];
    other.equipment[taken.slot] = takenId;

    const resolved = resolvePreset(state, monster, preset, nameOf);
    expect(resolved.stolen).toHaveLength(1);
    expect(resolved.stolen[0].equipmentId).toBe(takenId);
    expect(resolved.stolen[0].monsterId).toBe(other.id);
    expect(resolved.stolen[0].monsterName.length).toBeGreaterThan(0);
  });

  it("誰も着けていなければ、外す相手は出ない", () => {
    const { state, monsterId } = stateWith();
    const monster = state.monsters.find((m) => m.id === monsterId)!;
    const preset = capturePreset(monster, 0, createDefaultAutoEquipSettings());
    expect(resolvePreset(state, monster, preset, nameOf).stolen).toEqual([]);
  });
});
