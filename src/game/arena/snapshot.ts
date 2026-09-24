/**
 * 防衛パーティのスナップショット。
 *
 * ## なぜ「その場で手持ちを見る」ではいけないのか
 *
 * 防衛は**自分が居ない時に戦われる**。登録した後で本人が装備を外し、
 * 素材にし、売り、ランクアップに使うのは普通のことで、
 * そのたびに相手の画面で防衛パーティが崩れたり消えたりしてはいけない。
 *
 * なので**登録した瞬間の姿を焼いて持つ**。焼いた後に本人が何をしても、
 * 焼いた側は1バイトも変わらない。再登録した時だけ最新へ差し替わる。
 *
 * ## 何を焼くか
 *
 * `MonsterInstance` と、その個体が着けている `Equipment` の実体だけ。
 * 最終ステータスは `toBattleDefinition(instance, dex, equipment)` の1本で
 * 決まるので、この2つが揃っていれば戦闘は完全に再現できる
 * (種類・属性・★・レベル・基礎値・タイプ・能力ポイント・スキル・
 * スキルレベル・潜在覚醒・装備のレア/Lv/強化/メインOP/サブOP が全部入る)。
 *
 * **平たい別形式へ写し直さない。** 育成要素が増えるたびに写し忘れが起き、
 * 「新しい要素だけ防衛に乗らない」という気づきにくい壊れ方をする。
 */
import { Equipment } from "../../core/equipment.js";
import { MonsterDefinition } from "../../core/monster.js";
import type { Accessory } from "../../core/accessory.js";
import { MonsterInstance, resolveAccessory, resolveEquippedItems, toBattleDefinition } from "../../core/monsterInstance.js";
import { findMonsterById } from "../../data/monsters.js";
import { ARENA_SNAPSHOT_VERSION, ArenaDefenseSnapshot, ArenaUnitSnapshot } from "./types.js";

/** 参照を1つも共有しない複製。焼いた後の書き換えが伝わらないようにする */
function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 1体ぶんを焼く。
 *
 * **装備IDを焼き直す。** 手持ちの装備IDのまま持つと、
 * 同じIDの装備を売って別の装備が同じIDを取った時に中身がすり替わる。
 * スナップショットの中だけで完結する新しいIDを振る。
 */
export function captureArenaUnit(
  instance: MonsterInstance,
  allEquipment: readonly Equipment[],
  index: number,
  allAccessories: readonly Accessory[] = [],
): ArenaUnitSnapshot {
  const equipped = resolveEquippedItems(instance, allEquipment as Equipment[]);
  const copiedInstance = deepCopy(instance);
  const copiedEquipment: Equipment[] = [];
  const remap = new Map<string, string>();
  for (const [i, item] of equipped.entries()) {
    const frozen = deepCopy(item);
    const newId = `snap${index}_${i}_${item.slot}`;
    remap.set(item.id, newId);
    frozen.id = newId;
    copiedEquipment.push(frozen);
  }
  const slots: MonsterInstance["equipment"] = {};
  for (const [slot, id] of Object.entries(copiedInstance.equipment)) {
    const next = id ? remap.get(id) : undefined;
    if (next) slots[Number(slot) as keyof MonsterInstance["equipment"]] = next;
  }
  copiedInstance.equipment = slots;
  copiedInstance.id = `snap${index}`;
  /*
   * アクセも装備と同じく**焼いた写し**を持つ。手持ちのIDは残さない
   * (売った・付け替えた・強化した後も、登録した時の姿のまま戦う)。
   */
  delete copiedInstance.accessoryId;
  const accessory = resolveAccessory(instance, allAccessories);
  if (!accessory) return { instance: copiedInstance, equipment: copiedEquipment };
  const frozenAccessory = deepCopy(accessory);
  frozenAccessory.id = `snap${index}_acc`;
  delete frozenAccessory.locked;
  return { instance: copiedInstance, equipment: copiedEquipment, accessory: frozenAccessory };
}

/** 防衛パーティ全体を焼く */
export function captureArenaDefense(
  members: readonly MonsterInstance[],
  allEquipment: readonly Equipment[],
  now: number = Date.now(),
  allAccessories: readonly Accessory[] = [],
): ArenaDefenseSnapshot {
  return {
    version: ARENA_SNAPSHOT_VERSION,
    capturedAt: now,
    units: members.map((member, index) => captureArenaUnit(member, allEquipment, index, allAccessories)),
  };
}

/**
 * スナップショット1体を戦闘用の定義へ戻す。
 *
 * 図鑑に無いモンスター(データから消えた等)は**黙って落とす**。
 * ここで例外を投げると、相手の編成が1体壊れただけでアリーナ全体が開かなくなる。
 */
export function snapshotUnitToDefinition(unit: ArenaUnitSnapshot): MonsterDefinition | null {
  const dex = findMonsterById(unit.instance.dexId);
  if (!dex) return null;
  /*
   * アクセは**あれば効かせる、無ければ着けていない。**
   * 旧形式(欄が無い)・null・壊れた値は `toBattleDefinition` の中の
   * `sanitizeAccessory` が null に落とすので、ここでは何も判定しない。
   * 値の範囲もそこで正規の上限へ収まる(照合表はアクセを見ていないため)。
   */
  let def: MonsterDefinition;
  try {
    def = toBattleDefinition(unit.instance, dex, unit.equipment, unit.accessory ?? null);
  } catch {
    // アクセ1個のせいで防衛全体を落とさない。**その1体だけアクセ無しで戦う**
    def = toBattleDefinition(unit.instance, dex, unit.equipment);
  }
  return { ...def, name: `${dex.name}★${unit.instance.star} Lv${unit.instance.level}` };
}

/**
 * 防衛パーティ全体を戦闘用の定義列へ戻す。
 *
 * **倍率(`statMultiplier`)はここでだけ掛ける。**
 * アリーナの戦闘は3か所で組まれるが、どこも必ずこの関数を通るので、
 * ここに置けば3か所とも自動でそろう。呼ぶ側へ配ると、1か所忘れた時に
 * 「画面とサーバで別の強さの相手と戦う」ことになる。
 */
export function snapshotToDefinitions(snapshot: ArenaDefenseSnapshot): MonsterDefinition[] {
  const defs = snapshot.units
    .map(snapshotUnitToDefinition)
    .filter((def): def is MonsterDefinition => def !== null);
  const multiplier = snapshot.statMultiplier ?? 1;
  if (multiplier === 1) return defs;
  /*
   * **速度には掛けない。**速度は手番の数に直結するので、
   * ここを伸ばすと相手だけが何度も動く別のゲームになる。
   * クリ率・クリダメ・的中・抵抗も触らない(確率は積み上げても頭打ちで、
   * 100%を超えた瞬間から「絶対に当たる」という別の性質に変わる)。
   */
  return defs.map((def) => ({
    ...def,
    stats: {
      ...def.stats,
      hp: Math.round(def.stats.hp * multiplier),
      atk: Math.round(def.stats.atk * multiplier),
      def: Math.round(def.stats.def * multiplier),
    },
  }));
}

/** 焼いたものが戦えるか。0体になっていたら候補に出さない */
export function isUsableDefense(snapshot: ArenaDefenseSnapshot | null | undefined): boolean {
  return !!snapshot && snapshot.units.length > 0 && snapshotToDefinitions(snapshot).length > 0;
}
