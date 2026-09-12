import type { EquipSlot } from "./equipment.js";

/**
 * 装備プリセットと、おまかせ装備の条件の**形だけ**。
 *
 * ## なぜ core に置くのか
 *
 * `MonsterInstance` が装備プリセットを持つので、`core/monsterInstance.ts` は
 * この型を知る必要がある。だが最初は `game/equipmentPreset.ts` から取り込んでいて、
 * **core → game の向きが生まれていた。**
 *
 * これが Edge Function 用のビルド(`npm run build:edge`)を壊した。
 * あちらは戦闘エンジンだけを持っていく設定で `lib` に DOM が入っていない。
 * `core/monsterInstance.ts` → `game/equipmentPreset.ts` → `game/playerState.ts`
 * と芋づるで引かれ、`localStorage` や `window` を触るコードまで
 * 型検査の対象に入って落ちた(型だけの取り込みでも、その相手は検査される)。
 *
 * **中身の振る舞いは `game/` に置いたまま、形だけをここへ下ろす。**
 * ここには他の取り込みを増やさないこと——増やした先が `game/` に触れた瞬間、
 * 同じ壊れ方が戻ってくる。
 */

/** おまかせで狙えるステータス。最低条件もこの単位で書く */
export type AutoEquipStat = "hp" | "atk" | "def" | "spd" | "criRate" | "criDmg";

/** おまかせの型。`custom` だけが優先順位と最低条件を使う */
export type AutoEquipType = AutoEquipStat | "power" | "custom";

/** どこから装備を探すか */
export type AutoEquipScope = "UNEQUIPPED" | "OWN_AND_UNEQUIPPED" | "ALL";

export interface AutoEquipSettings {
  type: AutoEquipType;
  /** カスタムの優先順位。押した順が第1〜第3 */
  priorities: AutoEquipStat[];
  /** これを下回る構成は選ばない */
  minimums: Partial<Record<AutoEquipStat, number>>;
  scope: AutoEquipScope;
  /** 今のまま動かさない部位 */
  fixedSlots: EquipSlot[];
}

export interface EquipmentPreset {
  /** 枠の名前。人が付け替える */
  name: string;
  /** 保存した時の装備。スロット → 装備ID */
  assignment: Partial<Record<EquipSlot, string>>;
  /** 保存した時のおまかせ条件 */
  settings: AutoEquipSettings;
  /** 保存した時刻(表示用)。0 なら未保存 */
  savedAt: number;
}
