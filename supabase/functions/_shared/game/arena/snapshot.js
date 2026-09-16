import { resolveEquippedItems, toBattleDefinition } from "../../core/monsterInstance.js";
import { findMonsterById } from "../../data/monsters.js";
import { ARENA_SNAPSHOT_VERSION } from "./types.js";
/** 参照を1つも共有しない複製。焼いた後の書き換えが伝わらないようにする */
function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
}
/**
 * 1体ぶんを焼く。
 *
 * **装備IDを焼き直す。** 手持ちの装備IDのまま持つと、
 * 同じIDの装備を売って別の装備が同じIDを取った時に中身がすり替わる。
 * スナップショットの中だけで完結する新しいIDを振る。
 */
export function captureArenaUnit(instance, allEquipment, index) {
    const equipped = resolveEquippedItems(instance, allEquipment);
    const copiedInstance = deepCopy(instance);
    const copiedEquipment = [];
    const remap = new Map();
    for (const [i, item] of equipped.entries()) {
        const frozen = deepCopy(item);
        const newId = `snap${index}_${i}_${item.slot}`;
        remap.set(item.id, newId);
        frozen.id = newId;
        copiedEquipment.push(frozen);
    }
    const slots = {};
    for (const [slot, id] of Object.entries(copiedInstance.equipment)) {
        const next = id ? remap.get(id) : undefined;
        if (next)
            slots[Number(slot)] = next;
    }
    copiedInstance.equipment = slots;
    copiedInstance.id = `snap${index}`;
    return { instance: copiedInstance, equipment: copiedEquipment };
}
/** 防衛パーティ全体を焼く */
export function captureArenaDefense(members, allEquipment, now = Date.now()) {
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
export function snapshotUnitToDefinition(unit) {
    const dex = findMonsterById(unit.instance.dexId);
    if (!dex)
        return null;
    const def = toBattleDefinition(unit.instance, dex, unit.equipment);
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
export function snapshotToDefinitions(snapshot) {
    const defs = snapshot.units
        .map(snapshotUnitToDefinition)
        .filter((def) => def !== null);
    const multiplier = snapshot.statMultiplier ?? 1;
    if (multiplier === 1)
        return defs;
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
export function isUsableDefense(snapshot) {
    return !!snapshot && snapshot.units.length > 0 && snapshotToDefinitions(snapshot).length > 0;
}
