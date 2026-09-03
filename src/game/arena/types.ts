/**
 * アリーナで受け渡しする型。**ここが担当をまたぐ唯一の契約。**
 *
 * ## スナップショットは既存の型をそのまま束ねる
 *
 * 「戦闘再現に必要な情報」を新しい平たい構造で持ち直すことはしない。
 * 最終ステータスは `toBattleDefinition(instance, dex, equipment)` の1本で
 * 決まっており、そこが要求するのは **`MonsterInstance` と `Equipment[]`** だけ。
 * 同じ2つを保存すれば、依頼の一覧(種類・属性・★・レベル・基礎値・タイプ・
 * 能力ポイント・スキル・スキルレベル・潜在覚醒・装備の種類/レア/Lv/強化/
 * メインOP/サブOP)は**全部そこに入っている**。
 *
 * 平たく持ち直すと、育成要素が増えるたびに写し忘れが起きる。
 * 実際この案件では「装備の生成側を変えても控えに焼いた値は変わらない」
 * 事故を出している(CLAUDE.md)。写す面を増やさないことがそのまま安全になる。
 */
import { Equipment } from "../../core/equipment.js";
import { MonsterInstance } from "../../core/monsterInstance.js";
import { ArenaTierId } from "../../data/arena/ranks.js";

/** 保存形式の版。増やす時は必ず移行を書く */
export const ARENA_SNAPSHOT_VERSION = 1;

/**
 * 防衛の1体。
 *
 * `instance.equipment` はスロット→装備IDの対応表なので、
 * **同じスナップショットの中の `equipment` を指していること。**
 * 手持ちの装備IDを指したままにすると、本人が売った瞬間に壊れる。
 */
export interface ArenaUnitSnapshot {
  instance: MonsterInstance;
  equipment: Equipment[];
}

/** 防衛パーティ1つぶん */
export interface ArenaDefenseSnapshot {
  version: number;
  /** 焼いた時刻。再登録の判定と履歴の表示に使う */
  capturedAt: number;
  units: ArenaUnitSnapshot[];
}

/** 対戦候補の出どころ。**内部では必ず区別できるようにする** */
export type ArenaOpponentKind = "PLAYER" | "NPC";

/**
 * 対戦候補1人。実プレイヤーもNPCも同じ形にする。
 *
 * 画面はこの型だけを見る。**どちらであるかで画面の作りを分けない**ので、
 * 将来NPCの比率を下げても画面側を触らずに済む。
 */
export interface ArenaOpponentEntry {
  /** 候補の並びの中での位置 */
  index: number;
  /**
   * NPCを種から組み直す時に使う不変の位置。
   *
   * `index` は実プレイヤーとの混在後に画面用として振り直される。
   * こちらまで振り直すと、画面で見たNPCとサーバが再生成するNPCが別物になる。
   * 実プレイヤーでは未使用。
   */
  npcGenerationIndex?: number;
  kind: ArenaOpponentKind;
  /** 実プレイヤーならその識別子。NPCは生成に使った種 */
  id: string;
  name: string;
  rating: number;
  tierId: ArenaTierId;
  /** NPCの編成テンプレート名。実プレイヤーでは undefined */
  archetypeName?: string;
  archetypeNote?: string;
  defense: ArenaDefenseSnapshot;
}

/** 1戦の記録。攻撃履歴と防衛履歴で同じ形を使う */
export interface ArenaMatchRecord {
  id: string;
  at: number;
  /** 自分が攻めた戦いか、攻められた戦いか */
  side: "OFFENSE" | "DEFENSE";
  opponentKind: ArenaOpponentKind;
  opponentName: string;
  opponentRating: number;
  /** 自分から見た勝敗 */
  won: boolean;
  ratingDelta: number;
  ratingAfter: number;
  /** 獲得したアリーナコイン */
  coins: number;
  /**
   * この記録からリベンジ済みか。**同じ記録からは1回まで。**
   * 無制限に挑めると、負けた相手を延々狩り続けられる。
   */
  revenged?: boolean;
}

/** リベンジできるかどうかの判定理由。画面に出す文言をここで決めない */
export type ArenaRevengeBlock = "ALREADY" | "NOT_DEFENSE" | "WON" | "NO_TICKET" | null;
