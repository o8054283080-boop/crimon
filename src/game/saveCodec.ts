import type { Equipment, EquipSlot, EquipStar, SetType, StatRoll, StatType } from "../core/equipment.js";
import type { CreatedSkill, MonsterInstance } from "../core/monsterInstance.js";
import type { MonsterDevelopment, MonsterType } from "../core/monsterDevelopment.js";
import type { TalentState } from "../core/talents.js";
import type { Star } from "../core/rarity.js";
import type { PlayerState } from "./playerState.js";

/**
 * セーブを縮める。
 *
 * ## なぜ要るのか
 *
 * 実際に報告された端末では**セーブ882KB**で保存に失敗していた。
 * localStorage の上限はふつう5MB前後あるが、端末の空き容量が少ないと
 * ブラウザは割り当てそのものを絞る。**こちらから空き容量は増やせない。**
 * できるのは、狭い割り当てでも収まる大きさにしておくこと。
 *
 * 測った内訳(モンスター200体・装備600個で 251KB):
 *
 *   モンスター1体 600バイト … うち `development` が 292バイト
 *   装備1個       225バイト … うち `initialSubStatCount` のキー名だけで 24バイト
 *
 * `development` の292バイトは、**何も育てていない個体でも丸ごと書かれていた。**
 * 型・能力ポイント・潜在・才能のどれも既定値のまま、キー名と `null` と `0` を
 * 1体ぶん並べていたことになる。
 *
 * ## 3つの縮め方
 *
 *   1. **既定値は書かない。**読む時に既定値で埋める。これがいちばん効く
 *   2. **キー名を1〜2文字にする。**200体・600個ぶん繰り返されるので効く
 *   3. **決まった語を番号にする。**`"ATK_FLAT"` は 3000回以上出てくる
 *
 * ## 触らないもの
 *
 * **アリーナの防衛スナップショットは縮めない。**あれはサーバへ送って
 * 項目ごとに照合されるもので、こちらの都合で形を変えていい場所ではない。
 * 4体ぶんしかないので、縮めても全体の3%にしかならない。
 * `towerRun` も同じ理由(小さいので割に合わない)で素通しする。
 *
 * ## いちばん大事な約束
 *
 * **縮めて戻したら、一字一句もとに戻ること。**
 * ここが崩れると、その人の手持ちが静かに変わる。
 * `tests/saveCodec.test.ts` が実際に往復させて確かめている。
 */

/** 縮めた形の印。旧セーブ(印なし)も読めるようにしてある */
export const SAVE_FORMAT = 2;

/**
 * ステータスの種類 → 番号。
 *
 * **並び順から作らない。**`STAT_TYPES` の順を変えた瞬間に、
 * 既に保存されている装備のステータスが別物にすり替わる。
 * 手で書いて、`tests/saveCodec.test.ts` が抜けを機械的に拾う。
 */
const STAT_TYPE_CODES: Readonly<Record<StatType, number>> = {
  ATK_FLAT: 0,
  ATK_PERCENT: 1,
  DEF_FLAT: 2,
  DEF_PERCENT: 3,
  HP_FLAT: 4,
  HP_PERCENT: 5,
  SPD: 6,
  CRIT_RATE: 7,
  CRIT_DMG: 8,
  ACCURACY: 9,
  RESISTANCE: 10,
};

/** 装備シリーズ → 番号。ここも並び順から作らない(同上) */
const SET_TYPE_CODES: Readonly<Record<SetType, number>> = {
  CRIT: 0,
  POWER: 1,
  GUARD: 2,
  VITALITY: 3,
  ACCURACY_SET: 4,
  RESIST_SET: 5,
  SWIFT: 6,
  WARD: 7,
  RAMPAGE: 8,
  IMMUNITY_SET: 9,
  COLLAPSE: 10,
  BLESSING: 11,
};

/** タイプ転生 → 番号。ここも並び順から作らない(同上) */
const MONSTER_TYPE_CODES: Readonly<Record<MonsterType, number>> = {
  ATTACK: 0,
  HP: 1,
  DEFENSE: 2,
  SUPPORT: 3,
  DISRUPT: 4,
  BALANCE: 5,
};

function invert<T extends string>(codes: Readonly<Record<T, number>>): Readonly<Record<number, T>> {
  const back: Record<number, T> = {};
  for (const [name, code] of Object.entries(codes) as [T, number][]) back[code] = name;
  return back;
}

const STAT_TYPE_BY_CODE = invert(STAT_TYPE_CODES);
const SET_TYPE_BY_CODE = invert(SET_TYPE_CODES);
const MONSTER_TYPE_BY_CODE = invert(MONSTER_TYPE_CODES);

/** テストから対応表そのものを見られるようにする(抜けの検出に使う) */
export const SAVE_CODE_TABLES = {
  statType: STAT_TYPE_CODES,
  setType: SET_TYPE_CODES,
  monsterType: MONSTER_TYPE_CODES,
} as const;

type Packed = Record<string, unknown>;

/* ------------------------------------------------------------------ *
 * ステータスの1行
 * ------------------------------------------------------------------ */

/**
 * `{type, value}` を `[番号, 値]` にする。
 *
 * 装備600個 × サブ最大4個 + メイン1個で3000行を超えるので、
 * ここのキー名6バイトが全体で18KBになる。
 */
function packRoll(roll: StatRoll): [number, number] {
  return [STAT_TYPE_CODES[roll.type], roll.value];
}

function unpackRoll(packed: unknown): StatRoll {
  const [code, value] = packed as [number, number];
  return { type: STAT_TYPE_BY_CODE[code], value };
}

/* ------------------------------------------------------------------ *
 * 装備
 * ------------------------------------------------------------------ */

/**
 * **`initialSubStatCount` は既定値でも必ず書く。**
 *
 * 省くと、読み込み時の正規化が「今のサブ数」から補い直す。
 * 強化でサブが増えた装備はそこで数が変わり、**レア度が上がってしまう。**
 * 生成時に焼いた値が正であって、今の姿から測り直してよいものではない。
 */
function packEquipment(equipment: Equipment): Packed {
  const packed: Packed = {
    i: equipment.id,
    s: equipment.slot,
    r: equipment.star,
    t: SET_TYPE_CODES[equipment.set],
    m: packRoll(equipment.mainStat),
  };
  if (equipment.level) packed.l = equipment.level;
  if (equipment.locked) packed.o = 1;
  if (equipment.autoExclude) packed.a = 1;
  if (equipment.subStats.length > 0) packed.b = equipment.subStats.map(packRoll);
  if (equipment.initialSubStatCount !== undefined) packed.n = equipment.initialSubStatCount;
  return packed;
}

function unpackEquipment(packed: Packed): Equipment {
  const equipment: Equipment = {
    id: String(packed.i),
    slot: packed.s as EquipSlot,
    star: packed.r as EquipStar,
    level: (packed.l as number | undefined) ?? 0,
    set: SET_TYPE_BY_CODE[packed.t as number],
    mainStat: unpackRoll(packed.m),
    subStats: ((packed.b as unknown[] | undefined) ?? []).map(unpackRoll),
  };
  if (packed.n !== undefined) equipment.initialSubStatCount = packed.n as number;
  if (packed.o) equipment.locked = true;
  if (packed.a) equipment.autoExclude = true;
  return equipment;
}

/* ------------------------------------------------------------------ *
 * 才能覚醒
 * ------------------------------------------------------------------ */

/** 何も取っていなければ丸ごと消す。★6に届くまでは全員がこの状態 */
function packTalents(talents: TalentState): Packed | null {
  const packed: Packed = {};
  if (talents.unlockedPoints) packed.u = talents.unlockedPoints;
  if (Object.keys(talents.basic).length > 0) packed.b = talents.basic;
  if (Object.keys(talents.battle).length > 0) packed.t = talents.battle;
  if (talents.skill[1].length > 0) packed.x = talents.skill[1];
  if (talents.skill[2].length > 0) packed.y = talents.skill[2];
  if (talents.awakening) packed.a = [talents.awakening.slot, talents.awakening.id];
  return Object.keys(packed).length > 0 ? packed : null;
}

function unpackTalents(packed: Packed | undefined): TalentState {
  const talents: TalentState = {
    schemaVersion: 1,
    unlockedPoints: (packed?.u as number | undefined) ?? 0,
    basic: (packed?.b as TalentState["basic"] | undefined) ?? {},
    battle: (packed?.t as TalentState["battle"] | undefined) ?? {},
    skill: {
      1: (packed?.x as string[] | undefined) ?? [],
      2: (packed?.y as string[] | undefined) ?? [],
    },
    awakening: null,
  };
  if (packed?.a) {
    const [slot, id] = packed.a as [1 | 2, string];
    talents.awakening = { slot, id };
  }
  return talents;
}

/* ------------------------------------------------------------------ *
 * 育成情報
 * ------------------------------------------------------------------ */

/**
 * **ここが1体600バイトのうち292バイトを占めていた。**
 * 何も育てていない個体なら丸ごと消える。
 */
function packDevelopment(development: MonsterDevelopment): Packed | null {
  const packed: Packed = {};
  if (development.type) packed.t = MONSTER_TYPE_CODES[development.type];
  const points = development.abilityPoints;
  if (points.hp || points.atk || points.def || points.spd) {
    packed.a = [points.hp, points.atk, points.def, points.spd];
  }
  if (development.latentAbilityId) packed.n = development.latentAbilityId;
  if (development.latentReselectPending) packed.r = 1;
  if (development.abilityPointsConfirmed) packed.c = 1;
  const talents = development.talents ? packTalents(development.talents) : null;
  if (talents) packed.l = talents;
  return Object.keys(packed).length > 0 ? packed : null;
}

/**
 * **`abilityPointsConfirmed` は必ず boolean で戻す。**
 *
 * 未定義のまま戻すと、正規化が「1点でも振ってあれば確定済み」と推し量る道へ入る。
 * それは**印を知らない旧セーブだけの仕事**で、ここで通す道ではない。
 * 縮めた形では「印が無い＝false」と決まっている。
 */
function unpackDevelopment(packed: Packed | undefined): MonsterDevelopment {
  const points = (packed?.a as [number, number, number, number] | undefined) ?? [0, 0, 0, 0];
  const type = packed?.t === undefined ? null : MONSTER_TYPE_BY_CODE[packed.t as number];
  return {
    schemaVersion: 1,
    type,
    abilityPoints: { hp: points[0], atk: points[1], def: points[2], spd: points[3] },
    latentAbilityId: (packed?.n as string | undefined) ?? null,
    latentReselectPending: Boolean(packed?.r),
    abilityPointsConfirmed: Boolean(packed?.c),
    talents: unpackTalents(packed?.l as Packed | undefined),
  };
}

/* ------------------------------------------------------------------ *
 * モンスター
 * ------------------------------------------------------------------ */

function packMonster(monster: MonsterInstance): Packed {
  const packed: Packed = {
    i: monster.id,
    d: monster.dexId,
    s: monster.star,
    l: monster.level,
  };
  if (monster.exp) packed.x = monster.exp;
  if (monster.locked) packed.o = 1;

  // 空スロットは書かない。装備を外した跡が `{"1": undefined}` で残ることがある
  const worn = Object.entries(monster.equipment).filter(([, id]) => Boolean(id));
  if (worn.length > 0) packed.q = Object.fromEntries(worn);

  // 全部Lv1なら書かない(引いたばかりの個体はこれ)
  if (monster.skillLevels.some((level) => level !== 1)) packed.k = monster.skillLevels;

  if (monster.createdSkill) {
    packed.c = [monster.createdSkill.slot, monster.createdSkill.skillId, monster.createdSkill.sourceDexId];
  }
  const development = packDevelopment(monster.development);
  if (development) packed.v = development;

  /*
   * 装備プリセット。**使っている人のぶんだけ書く。**
   * 中身は素通し(3枠しかなく、縮めても数十バイトにしかならない一方、
   * 読めなくなった時に何が消えたのか分からなくなる)。
   */
  const presets = monster.equipmentPresets?.filter((preset) => preset.savedAt > 0);
  if (presets && presets.length > 0) packed.p = monster.equipmentPresets;
  return packed;
}

function unpackMonster(packed: Packed): MonsterInstance {
  const monster: MonsterInstance = {
    id: String(packed.i),
    dexId: String(packed.d),
    star: packed.s as Star,
    level: packed.l as number,
    exp: (packed.x as number | undefined) ?? 0,
    equipment: (packed.q as MonsterInstance["equipment"] | undefined) ?? {},
    skillLevels: (packed.k as [number, number, number] | undefined) ?? [1, 1, 1],
    development: unpackDevelopment(packed.v as Packed | undefined),
  };
  if (packed.o) monster.locked = true;
  if (Array.isArray(packed.p)) monster.equipmentPresets = packed.p as MonsterInstance["equipmentPresets"];
  if (packed.c) {
    const [slot, skillId, sourceDexId] = packed.c as [CreatedSkill["slot"], string, string];
    monster.createdSkill = { slot, skillId, sourceDexId };
  }
  return monster;
}

/* ------------------------------------------------------------------ *
 * まとめ
 * ------------------------------------------------------------------ */

/**
 * 保存する文字列を作る。
 *
 * 縮めるのは `monsters` と `equipment` の2つだけ。
 * 他の項目は1回ずつしか出てこないので、縮めても数百バイトにしかならない一方、
 * **読めなくなった時に何が起きたか分からなくなる**代償の方が大きい。
 */
export function encodeSave(state: PlayerState): string {
  const packed: Packed = { ...state };
  packed.monsters = state.monsters.map(packMonster);
  packed.equipment = state.equipment.map(packEquipment);
  return JSON.stringify({ f: SAVE_FORMAT, s: packed });
}

/**
 * 保存された文字列を読む。**旧セーブ(縮めていないもの)もそのまま読める。**
 *
 * 見分けは `f` の有無ひとつ。`PlayerState` に1文字のキーは無いので、
 * 昔のセーブがここに引っかかることはない。
 *
 * 読めなければ `null` を返す。**投げない。**呼び出し元は
 * 「セーブが無い人」と同じ道へ落とせばよく、例外で操作の途中が飛ぶのがいちばん困る。
 */
export function decodeSave(raw: string): PlayerState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const envelope = parsed as { f?: unknown; s?: unknown };
  if (envelope.f !== SAVE_FORMAT) return parsed as PlayerState; // 印が無い = 昔の形

  const inner = envelope.s;
  if (!inner || typeof inner !== "object") return null;
  const packed = inner as Packed;
  return {
    ...packed,
    monsters: ((packed.monsters as Packed[] | undefined) ?? []).map(unpackMonster),
    equipment: ((packed.equipment as Packed[] | undefined) ?? []).map(unpackEquipment),
  } as unknown as PlayerState;
}
