import { describe, expect, it } from "vitest";
import { SET_TYPES, STAT_TYPES, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import type { MonsterType } from "../src/core/monsterDevelopment.js";
import { SAVE_CODE_TABLES, SAVE_FORMAT, decodeSave, encodeSave } from "../src/game/saveCodec.js";
import { addEquipment, addMonster, createInitialState, normalizeLoadedState } from "../src/game/playerState.js";
import { parseSaveFile, serializeSaveFile } from "../src/game/saveFile.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import type { PlayerState } from "../src/game/playerState.js";

/**
 * セーブを縮める。
 *
 * ## なぜ縮めるのか
 *
 * 実際に報告された端末では**セーブ882KB**で保存に失敗していた。
 * localStorage の上限はふつう5MB前後あるが、端末の空き容量が少ないと
 * ブラウザは割り当てそのものを絞る。**空き容量はこちらから増やせない。**
 * できるのは、狭い割り当てでも収まる大きさにしておくこと。
 *
 * ## ここで守るもの
 *
 * **縮めて戻したら、一字一句もとに戻ること。**
 * ここが崩れると、その人の手持ちが静かに変わる。型チェックは通ってしまう
 * (どちらも同じ型なので)。だから実際に往復させて中身を突き合わせる。
 */

const DEX_IDS = ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => dex.id);

/** 育て方の違う個体と、強化度合いの違う装備を混ぜた手持ちを作る */
function richState(monsterCount = 40, equipmentCount = 120): PlayerState {
  const state = createInitialState();
  for (let i = 0; i < equipmentCount; i += 1) {
    const equipment = generateEquipment({
      slot: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      star: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
      subStatCount: i % 5,
      rng: () => ((i * 37) % 100) / 100,
    });
    equipment.level = i % 16;
    if (i % 7 === 0) equipment.locked = true;
    addEquipment(state, equipment);
  }
  for (let i = 0; i < monsterCount; i += 1) {
    const monster = addMonster(state, DEX_IDS[i % DEX_IDS.length], ((i % 4) + 3) as 3 | 4 | 5 | 6, 1 + (i % 40));
    monster.exp = i * 13;
    if (i % 5 === 0) monster.locked = true;
    monster.skillLevels = [1 + (i % 5), 1 + (i % 4), 1 + (i % 3)];
    // 装備を6スロット埋める個体と、素手の個体を混ぜる
    if (i % 3 !== 0) {
      for (let slot = 1; slot <= 6; slot += 1) {
        monster.equipment[slot as 1 | 2 | 3 | 4 | 5 | 6] = state.equipment[(i * 6 + slot) % state.equipment.length].id;
      }
    }
    // 育成に手が入った個体
    if (i % 4 === 0) {
      const types: MonsterType[] = ["ATTACK", "HP", "DEFENSE", "SUPPORT", "DISRUPT", "BALANCE"];
      monster.development.type = types[i % types.length];
      monster.development.abilityPoints = { hp: i % 7, atk: (i + 1) % 7, def: (i + 2) % 7, spd: (i + 3) % 7 };
      monster.development.abilityPointsConfirmed = true;
      monster.development.latentAbilityId = `latent_${i}`;
      monster.development.latentReselectPending = i % 8 === 0;
    }
    // 才能覚醒に手が入った個体
    if (i % 6 === 0) {
      monster.development.talents = {
        schemaVersion: 1,
        unlockedPoints: 4 + (i % 5),
        basic: { HP: 2 } as never,
        battle: { CRIT: 1 } as never,
        skill: { 1: [`skill_talent_${i}`], 2: [] },
        awakening: { slot: 1, id: `awaken_${i}` },
      };
    }
    // 移し替えたスキルを持つ個体
    if (i % 9 === 0) {
      monster.createdSkill = { slot: 1, skillId: `created_${i}`, sourceDexId: DEX_IDS[(i + 3) % DEX_IDS.length] };
    }
  }
  return state;
}

describe("縮めて戻したら、もとに戻る", () => {
  it("育て方も装備も混ざった手持ちが、そっくり戻る", () => {
    const state = richState();
    const restored = decodeSave(encodeSave(state));
    expect(restored).toEqual(state);
  });

  it("始めたばかりの手持ちも戻る", () => {
    const state = createInitialState();
    expect(decodeSave(encodeSave(state))).toEqual(state);
  });

  /*
   * **モンスター1体ずつ突き合わせる。**まとめて `toEqual` すると
   * どの個体のどの項目が崩れたのか分からず、直しようがない。
   */
  it("1体ずつ、項目ごとに一致する", () => {
    const state = richState();
    const restored = decodeSave(encodeSave(state))!;
    expect(restored.monsters).toHaveLength(state.monsters.length);
    state.monsters.forEach((monster, i) => {
      expect(restored.monsters[i], `${i}体目 (${monster.dexId})`).toEqual(monster);
    });
  });

  it("装備も1個ずつ一致する", () => {
    const state = richState();
    const restored = decodeSave(encodeSave(state))!;
    expect(restored.equipment).toHaveLength(state.equipment.length);
    state.equipment.forEach((equipment, i) => {
      expect(restored.equipment[i], `${i}個目 (★${equipment.star} +${equipment.level})`).toEqual(equipment);
    });
  });

  /*
   * **生成時に焼いた初期サブ数は、既定値でも必ず書く。**
   *
   * 省くと読み込み時の正規化が「今のサブ数」から補い直す。強化でサブが
   * 増えた装備はそこで数が変わり、レア度が勝手に上がる。
   */
  it("初期サブ数が0の装備でも、0のまま戻る", () => {
    const state = createInitialState();
    const equipment = generateEquipment({ slot: 1, star: 5, subStatCount: 0, rng: () => 0.5 });
    expect(equipment.initialSubStatCount).toBe(0);
    addEquipment(state, equipment);
    const restored = decodeSave(encodeSave(state))!;
    expect(restored.equipment[0].initialSubStatCount).toBe(0);
  });

  /*
   * 縮めた形では「印が無い = false」と決まっている。未定義で戻すと
   * 正規化が**旧セーブ用の推し量る道**へ入り、1点でも振ってあれば
   * 確定済みにされてしまう(無料の振り直しが消える)。
   */
  it("能力ポイントの確定印は、未定義ではなく false で戻る", () => {
    const state = createInitialState();
    const monster = addMonster(state, DEX_IDS[0], 3);
    monster.development.abilityPointsConfirmed = false;
    monster.development.abilityPoints = { hp: 3, atk: 0, def: 0, spd: 0 };
    const restored = decodeSave(encodeSave(state))!;
    const back = restored.monsters.find((m) => m.id === monster.id)!;
    expect(back.development.abilityPointsConfirmed).toBe(false);
    expect(back.development.abilityPoints).toEqual({ hp: 3, atk: 0, def: 0, spd: 0 });
  });

  it("正規化を通しても、縮める前と後で同じ手持ちになる", () => {
    const state = richState();
    const direct = normalizeLoadedState(structuredClone(state));
    const roundTripped = normalizeLoadedState(decodeSave(encodeSave(state))!);
    expect(roundTripped.monsters).toEqual(direct.monsters);
    expect(roundTripped.equipment).toEqual(direct.equipment);
  });
});

/**
 * 触らないと決めたところ。
 *
 * **アリーナの防衛スナップショットはサーバへ送って項目ごとに照合される。**
 * こちらの都合で形を変えていい場所ではない。
 */
describe("触らないと決めたものは、素通しする", () => {
  it("防衛スナップショットは形も中身もそのまま", () => {
    const state = richState(8, 20);
    state.arenaDefenseSnapshot = {
      version: 1,
      capturedAt: 1_700_000_000_000,
      units: state.monsters.slice(0, 4).map((monster) => ({
        instance: structuredClone(monster),
        equipment: state.equipment.slice(0, 6).map((e) => structuredClone(e)),
      })),
    };
    const restored = decodeSave(encodeSave(state))!;
    expect(restored.arenaDefenseSnapshot).toEqual(state.arenaDefenseSnapshot);
  });

  it("塔の途中経過もそのまま", () => {
    const state = richState(8, 20);
    state.trialTowerRun = {
      floor: 17,
      members: state.monsters.slice(0, 3).map((m, i) => ({
        instanceId: m.id, hp: 1000 + i, cooldowns: [0, 2, 1] as [number, number, number],
      })),
    };
    const restored = decodeSave(encodeSave(state))!;
    expect(restored.trialTowerRun).toEqual(state.trialTowerRun);
  });
});

/**
 * 書き出した控えのファイルは縮めない。
 *
 * 端末の中に置く保存とは役目が違う。控えは**人が開いて中身を確かめられる**もので、
 * 大きさより読めることが大事だし、この変更の前に取った控えを
 * これまでどおり読み込めなければならない。
 */
describe("書き出した控えのファイルは、今までと同じ形のまま", () => {
  it("控えの中の手持ちが、縮めずにそのまま入っている", () => {
    const state = richState(6, 12);
    const file = JSON.parse(serializeSaveFile(state)) as { state: PlayerState };
    expect(file.state.monsters[0].development, "縮めた形が混ざっている").toBeDefined();
    expect(file.state.monsters[0].dexId).toBe(state.monsters[0].dexId);
    expect(file.state.equipment[0].mainStat).toEqual(state.equipment[0].mainStat);
  });

  it("控えは今までどおり読み込める", () => {
    const state = richState(6, 12);
    const parsed = parseSaveFile(serializeSaveFile(state));
    expect(parsed.ok, parsed.ok ? "" : parsed.reason).toBe(true);
    if (parsed.ok) expect(parsed.file.state.monsters).toHaveLength(state.monsters.length);
  });
});

/**
 * 前から遊んでいる人の控えを、黙って読めること。
 *
 * **ここを落とすと、全員の手持ちが消える。**
 */
describe("昔の形のセーブも読める", () => {
  it("縮めていない生のJSONがそのまま読める", () => {
    const state = richState(10, 20);
    const restored = decodeSave(JSON.stringify(state));
    expect(restored).toEqual(state);
  });

  it("印が付いていなければ昔の形として読む", () => {
    const state = createInitialState();
    const raw = JSON.stringify(state);
    expect(JSON.parse(raw).f).toBeUndefined();
    expect(decodeSave(raw)!.monsters).toHaveLength(state.monsters.length);
  });

  it("壊れた文字列は例外ではなく null で返す", () => {
    // 例外を投げると、読み込みの途中で操作が飛ぶ。それがいちばん困る
    expect(() => decodeSave("{壊れている")).not.toThrow();
    expect(decodeSave("{壊れている")).toBeNull();
    expect(decodeSave("null")).toBeNull();
    expect(decodeSave(JSON.stringify({ f: SAVE_FORMAT }))).toBeNull();
  });
});

/**
 * 対応表。
 *
 * **並び順から作らない**と決めてある。`STAT_TYPES` の順を入れ替えた瞬間に、
 * 既に保存されている装備のステータスが別物にすり替わるため。
 * 手で書いた表なので、抜けと重複はここが拾う。
 */
describe("値の対応表に抜けが無い", () => {
  it("ステータスの種類が全部載っている", () => {
    for (const type of STAT_TYPES) {
      expect(SAVE_CODE_TABLES.statType[type], `${type} が表に無い`).toBeTypeOf("number");
    }
    expect(Object.keys(SAVE_CODE_TABLES.statType)).toHaveLength(STAT_TYPES.length);
  });

  it("装備シリーズが全部載っている", () => {
    for (const set of SET_TYPES) {
      expect(SAVE_CODE_TABLES.setType[set], `${set} が表に無い`).toBeTypeOf("number");
    }
    expect(Object.keys(SAVE_CODE_TABLES.setType)).toHaveLength(SET_TYPES.length);
  });

  it("番号が重複していない", () => {
    for (const table of Object.values(SAVE_CODE_TABLES)) {
      const codes = Object.values(table);
      expect(new Set(codes).size, `重複がある: ${JSON.stringify(table)}`).toBe(codes.length);
    }
  });

  /*
   * **番号は動かせない。**動かすと、既に保存されている装備の
   * ステータスやシリーズが別物になる。ここは値を直に書いて固定する。
   */
  it("割り当てた番号が動いていない", () => {
    expect(SAVE_CODE_TABLES.statType).toEqual({
      ATK_FLAT: 0, ATK_PERCENT: 1, DEF_FLAT: 2, DEF_PERCENT: 3, HP_FLAT: 4, HP_PERCENT: 5,
      SPD: 6, CRIT_RATE: 7, CRIT_DMG: 8, ACCURACY: 9, RESISTANCE: 10,
    });
    expect(SAVE_CODE_TABLES.setType).toEqual({
      CRIT: 0, POWER: 1, GUARD: 2, VITALITY: 3, ACCURACY_SET: 4, RESIST_SET: 5, SWIFT: 6,
      WARD: 7, RAMPAGE: 8, IMMUNITY_SET: 9, COLLAPSE: 10, BLESSING: 11,
    });
    expect(SAVE_CODE_TABLES.monsterType).toEqual({
      ATTACK: 0, HP: 1, DEFENSE: 2, SUPPORT: 3, DISRUPT: 4, BALANCE: 5,
    });
  });
});

/**
 * 効果の実測。
 *
 * **測らずに「小さくなったはず」と言わない。**この案件では
 * 「直した本人は必ず良くなったと言う」で何度も間違えている。
 */
describe("実際に小さくなっている", () => {
  const state = richState(200, 600);
  const before = JSON.stringify(state).length;
  const after = encodeSave(state).length;

  it("200体・600個の手持ちが半分以下になる", () => {
    expect(after, `${before} → ${after}`).toBeLessThan(before * 0.5);
  });

  it("何も育てていない個体1体が150バイトを下回る", () => {
    const fresh = createInitialState();
    fresh.monsters = [createMonsterInstance(DEX_IDS[0], 3)];
    fresh.equipment = [];
    const empty = { ...fresh, monsters: [] as never[] };
    const perMonster = encodeSave(fresh).length - encodeSave(empty as PlayerState).length;
    expect(perMonster, `1体 ${perMonster} バイト`).toBeLessThan(150);
  });
});
