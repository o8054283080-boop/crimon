import { describe, expect, it } from "vitest";
import {
  buildSaveFile,
  describeSaveFile,
  parseSaveFile,
  saveFileName,
  serializeSaveFile,
} from "../src/game/saveFile.js";
import { SKILL_PIG_DEX } from "../src/data/monsters.js";
import { addMonster, createInitialState } from "../src/game/playerState.js";

function sampleState() {
  const state = createInitialState();
  state.gold = 12345;
  state.crystal = 678;
  state.fighterLevel = 9;
  state.fighterName = "テスト";
  addMonster(state, "wolf_FIRE", 3, 20);
  return state;
}

describe("セーブデータの書き出し", () => {
  it("スキルピッグを所持したまま保存・読み込みできる", () => {
    const state = sampleState();
    addMonster(state, SKILL_PIG_DEX[0].id, 1, 1);
    const result = parseSaveFile(serializeSaveFile(state));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.state.monsters.some((monster) => monster.dexId === SKILL_PIG_DEX[0].id)).toBe(true);
  });
  it("書き出して読み込むと、中身がそのまま戻る", () => {
    const state = sampleState();
    const text = serializeSaveFile(state);
    const result = parseSaveFile(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.state.gold).toBe(12345);
    expect(result.file.state.crystal).toBe(678);
    expect(result.file.state.monsters).toHaveLength(state.monsters.length);
    expect(result.file.state.fighterName).toBe("テスト");
  });

  it("中身を開かなくても分かるよう、概要が入っている", () => {
    const file = buildSaveFile(sampleState());
    expect(file.summary.fighterName).toBe("テスト");
    expect(file.summary.fighterLevel).toBe(9);
    expect(file.summary.monsterCount).toBeGreaterThan(0);
    expect(describeSaveFile(file)).toContain("テスト");
  });

  it("ファイル名に日時が入り、古い控えと見分けが付く", () => {
    const a = saveFileName(new Date("2026-08-18T01:02:00"));
    const b = saveFileName(new Date("2026-08-19T03:04:00"));
    expect(a).not.toBe(b);
    expect(a.endsWith(".json")).toBe(true);
  });
});

describe("セーブデータの読み込み(壊れたデータを受け付けないこと)", () => {
  it("JSONとして壊れていれば断る", () => {
    const result = parseSaveFile("{ こわれている");
    expect(result.ok).toBe(false);
  });

  it("別のアプリのJSONは断る", () => {
    const result = parseSaveFile(JSON.stringify({ hello: "world" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("セーブデータ");
  });

  it("モンスターが空のデータは断る(手持ちを空で上書きしてしまうため)", () => {
    const state = sampleState();
    state.monsters = [];
    const result = parseSaveFile(serializeSaveFile(state));
    expect(result.ok).toBe(false);
  });

  it("装備の情報が壊れていれば断る", () => {
    const file = buildSaveFile(sampleState()) as unknown as { state: { equipment: unknown } };
    file.state.equipment = "こわれた値";
    const result = parseSaveFile(JSON.stringify(file));
    expect(result.ok).toBe(false);
  });

  it("将来の新しい版のデータは断る(黙って壊さない)", () => {
    const file = buildSaveFile(sampleState()) as unknown as { version: number };
    file.version = 999;
    const result = parseSaveFile(JSON.stringify(file));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("更新");
  });

  it("空文字は断る", () => {
    expect(parseSaveFile("").ok).toBe(false);
  });
});
