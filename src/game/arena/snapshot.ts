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
import { MonsterInstance, resolveEquippedItems, toBattleDefinition } from "../../core/monsterInstance.js";
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
  return { instance: copiedInstance, equipment: copiedEquipment };
}

/** 防衛パーティ全体を焼く */
export function captureArenaDefense(
  members: readonly MonsterInstance[],
  allEquipment: readonly Equipment[],
  now: number = Date.now(),
): ArenaDefenseSnapshot {
  return {
    version: ARENA_SNAPSHOT_VERSION,
    capturedAt: now,
    units: members.map((member, index) => captureArenaUnit(member, allEquipment, index)),
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
  const def = toBattleDefinition(unit.instance, dex, unit.equipment);
  return { ...def, name: `${dex.name}★${unit.instance.star} Lv${unit.instance.level}` };
}

/** 防衛パーティ全体を戦闘用の定義列へ戻す */
export function snapshotToDefinitions(snapshot: ArenaDefenseSnapshot): MonsterDefinition[] {
  return snapshot.units
    .map(snapshotUnitToDefinition)
    .filter((def): def is MonsterDefinition => def !== null);
}

/** 焼いたものが戦えるか。0体になっていたら候補に出さない */
export function isUsableDefense(snapshot: ArenaDefenseSnapshot | null | undefined): boolean {
  return !!snapshot && snapshot.units.length > 0 && snapshotToDefinitions(snapshot).length > 0;
}
