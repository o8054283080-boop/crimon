import { EQUIP_SLOTS, EquipSlot } from "../core/equipment.js";
import type { EquipmentPreset } from "../core/equipmentPreset.js";
import type { MonsterInstance } from "../core/monsterInstance.js";
import {
  AUTO_EQUIP_STATS,
  AUTO_EQUIP_TYPES,
  AutoEquipSettings,
  AutoEquipStat,
  AutoEquipType,
  MAX_AUTO_EQUIP_PRIORITIES,
  createDefaultAutoEquipSettings,
  normalizeWantedSets,
} from "./autoEquip.js";
import type { PlayerState } from "./playerState.js";

/**
 * 装備プリセット。
 *
 * ## 何を残すのか
 *
 * **「その時の装備」と「探し方」の両方。**片方だけでは足りない。
 *
 *   装備だけ残す … 新しい装備を拾っても、古い構成に戻るだけ
 *   条件だけ残す … 押すたびに計算が走り、同じ並びに戻せない
 *
 * 両方あるので、呼び出す時に選べる。
 *
 *   「この装備に戻す」     … 保存した時とまったく同じ装備を着ける
 *   「今の持ち物で組み直す」 … 保存した条件で、今ある装備から探し直す
 *
 * ## 装備が消えていても壊れない
 *
 * 保存した装備は売られるし、素材にもなる。**IDだけを持っているので、
 * 呼び出した時にはもう無いことがある。**そこで落ちると、
 * プリセットを開くだけで画面が死ぬ。
 * 読み出しは必ず `resolvePreset` を通し、**欠けを数えてから**画面へ渡す。
 */

/** 1体につき持てる枠の数 */
export const EQUIPMENT_PRESET_SLOTS = 3;

/** 名前の長さの上限。長い名前で札が崩れないようにする */
export const PRESET_NAME_MAX_LENGTH = 12;

/*
 * 枠の**形は `core/equipmentPreset.ts` にある。**
 * `MonsterInstance` が枠を持つので core 側が知る必要があり、
 * ここへ置いたままだと core → game の向きが生まれて
 * Edge Function 用のビルドが壊れる(理由はあちらに書いた)。
 */
export type { EquipmentPreset } from "../core/equipmentPreset.js";

export function defaultPresetName(index: number): string {
  return `プリセット${index + 1}`;
}

/**
 * 中身の入っていない枠。
 *
 * **枠そのものは常に3つある。**「保存されているか」は `savedAt` で見分ける
 * (0 なら未保存)。枠を可変長にすると、2番目だけ保存した時に
 * 1番目が繰り上がって番号がずれる。
 */
export function createEmptyPreset(index: number): EquipmentPreset {
  return {
    name: defaultPresetName(index),
    assignment: {},
    settings: createDefaultAutoEquipSettings(),
    savedAt: 0,
  };
}

export function isPresetSaved(preset: EquipmentPreset): boolean {
  return preset.savedAt > 0;
}

/** その子の3枠。旧セーブには無いので、無ければ空の3枠を作って返す */
export function presetsOf(monster: MonsterInstance): EquipmentPreset[] {
  const stored = monster.equipmentPresets ?? [];
  return Array.from({ length: EQUIPMENT_PRESET_SLOTS }, (_, i) => stored[i] ?? createEmptyPreset(i));
}

/** 3枠のうち1つを書き換える。**他の枠には触らない** */
export function writePreset(monster: MonsterInstance, index: number, preset: EquipmentPreset): void {
  if (index < 0 || index >= EQUIPMENT_PRESET_SLOTS) return;
  const presets = presetsOf(monster);
  presets[index] = preset;
  monster.equipmentPresets = presets;
}

/** いま着けている装備と、渡された条件を、その枠へ焼く */
export function capturePreset(
  monster: MonsterInstance,
  index: number,
  settings: AutoEquipSettings,
  name?: string,
): EquipmentPreset {
  const assignment: Partial<Record<EquipSlot, string>> = {};
  for (const slot of EQUIP_SLOTS) {
    const id = monster.equipment[slot];
    if (id) assignment[slot] = id;
  }
  const current = presetsOf(monster)[index];
  return {
    name: name ?? current.name,
    assignment,
    settings: normalizeAutoEquipSettings(settings),
    savedAt: Date.now(),
  };
}

export interface ResolvedPreset {
  /** いま実際に着けられる装備だけを残した割り当て */
  available: Partial<Record<EquipSlot, string>>;
  /** 保存されていたが、もう持っていない装備の数 */
  missing: number;
  /** 他の子が着けている装備。着けるなら外すことになる */
  stolen: { monsterId: string; monsterName: string; equipmentId: string; slot: EquipSlot }[];
}

/**
 * 保存した装備が今も使えるかを確かめる。
 *
 * **落とさない。**売られた装備・素材にされた装備は黙って外し、
 * 数だけ数えて返す。呼び出し側はその数を見て
 * 「一部が見つかりません」と伝えられる。
 */
export function resolvePreset(
  state: PlayerState,
  monster: MonsterInstance,
  preset: EquipmentPreset,
  monsterNameOf: (m: MonsterInstance) => string,
): ResolvedPreset {
  const byId = new Map(state.equipment.map((e) => [e.id, e] as const));
  const owners = new Map<string, MonsterInstance>();
  for (const other of state.monsters) {
    if (other.id === monster.id) continue;
    for (const id of Object.values(other.equipment)) if (id) owners.set(id, other);
  }

  const available: Partial<Record<EquipSlot, string>> = {};
  const stolen: ResolvedPreset["stolen"] = [];
  let missing = 0;

  for (const slot of EQUIP_SLOTS) {
    const id = preset.assignment[slot];
    if (!id) continue;
    const item = byId.get(id);
    // 売られた・素材にされた・スロットが変わった(有り得ないが念のため)
    if (!item || item.slot !== slot) { missing += 1; continue; }
    available[slot] = id;
    const owner = owners.get(id);
    if (owner) {
      stolen.push({ monsterId: owner.id, monsterName: monsterNameOf(owner), equipmentId: id, slot });
    }
  }
  return { available, missing, stolen };
}

/* ------------------------------------------------------------------ *
 * 読み込みの手当て
 * ------------------------------------------------------------------ */

function isAutoEquipStat(value: unknown): value is AutoEquipStat {
  return typeof value === "string" && (AUTO_EQUIP_STATS as readonly string[]).includes(value);
}

function isAutoEquipType(value: unknown): value is AutoEquipType {
  return typeof value === "string" && (AUTO_EQUIP_TYPES as readonly string[]).includes(value);
}

/**
 * 条件を安全な形へ整える。
 *
 * **控えは人が書き換えられる。**書き出したファイルを編集して読み込ませることも
 * できるので、知らない値が入っている前提で読む。
 */
export function normalizeAutoEquipSettings(raw: Partial<AutoEquipSettings> | undefined): AutoEquipSettings {
  const base = createDefaultAutoEquipSettings();
  if (!raw || typeof raw !== "object") return base;

  const type = isAutoEquipType(raw.type) ? raw.type : base.type;
  /*
   * **重複を外してから3つに切る。**先に切ると、
   * 「速度・速度・攻撃」と書かれた控えが「速度・攻撃」の2つになり、
   * 3つ指定したつもりの人の第3優先が黙って消える。
   */
  const priorities = Array.isArray(raw.priorities) ? raw.priorities.filter(isAutoEquipStat) : [];
  const uniquePriorities = [...new Set(priorities)].slice(0, MAX_AUTO_EQUIP_PRIORITIES);

  const minimums: Partial<Record<AutoEquipStat, number>> = {};
  if (raw.minimums && typeof raw.minimums === "object") {
    for (const key of AUTO_EQUIP_STATS) {
      const value = (raw.minimums as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) minimums[key] = value;
    }
  }

  const scope = raw.scope === "UNEQUIPPED" || raw.scope === "ALL" || raw.scope === "OWN_AND_UNEQUIPPED"
    ? raw.scope : base.scope;

  const fixedSlots = Array.isArray(raw.fixedSlots)
    ? [...new Set(raw.fixedSlots.filter((s): s is EquipSlot => EQUIP_SLOTS.includes(s as EquipSlot)))]
    : [];

  /*
   * 指定シリーズ。**持たない形のまま残す。**
   * 空の入れ物を付けて回ると、使っていない人のセーブが枠の数だけ太る
   * (`saveCodec` は既定のままなら書かない作りなので、無いことに意味がある)。
   * 4個専用シリーズの丸めや合計6枠の検査は `normalizeWantedSets` が持つ。
   */
  const wanted = normalizeWantedSets(raw.wantedSets);
  const settings: AutoEquipSettings = { type, priorities: uniquePriorities, minimums, scope, fixedSlots };
  if (wanted.size > 0) settings.wantedSets = Object.fromEntries(wanted) as AutoEquipSettings["wantedSets"];
  return settings;
}

/** 読み込んだ枠を整える。壊れていたら空の枠にする */
export function normalizePreset(raw: unknown, index: number): EquipmentPreset {
  if (!raw || typeof raw !== "object") return createEmptyPreset(index);
  const value = raw as Partial<EquipmentPreset>;

  const assignment: Partial<Record<EquipSlot, string>> = {};
  if (value.assignment && typeof value.assignment === "object") {
    for (const slot of EQUIP_SLOTS) {
      const id = (value.assignment as Record<string, unknown>)[String(slot)];
      if (typeof id === "string" && id) assignment[slot] = id;
    }
  }
  const name = typeof value.name === "string" && value.name.trim()
    ? value.name.trim().slice(0, PRESET_NAME_MAX_LENGTH)
    : defaultPresetName(index);
  const savedAt = typeof value.savedAt === "number" && Number.isFinite(value.savedAt) && value.savedAt > 0
    ? Math.floor(value.savedAt) : 0;

  return { name, assignment, settings: normalizeAutoEquipSettings(value.settings), savedAt };
}

/**
 * 読み込み時にその子の枠を整える。
 *
 * **枠を持っていない子は、持っていないままにする。**空の3枠を全員へ配ると、
 * 使っていない人のセーブがモンスターの数だけ太る
 * (`saveCodec` は既定値を書かない作りなので、無いことに意味がある)。
 */
export function normalizeMonsterPresets(monster: MonsterInstance): void {
  const raw = monster.equipmentPresets;
  if (!Array.isArray(raw) || raw.length === 0) {
    delete monster.equipmentPresets;
    return;
  }
  const presets = Array.from({ length: EQUIPMENT_PRESET_SLOTS }, (_, i) => normalizePreset(raw[i], i));
  // ひとつも保存されていないなら持たせない(上と同じ理由)
  monster.equipmentPresets = presets.some(isPresetSaved) ? presets : undefined;
  if (!monster.equipmentPresets) delete monster.equipmentPresets;
}
