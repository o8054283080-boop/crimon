import type { Star } from "./rarity.js";

/**
 * 才能覚醒。**★6に到達したモンスターだけが開ける、2本目の育成の道。**
 *
 * ## 潜在覚醒とは役割が違う
 *
 * 潜在覚醒はスキル1だけを対象にした「1つ選んで終わり」の仕組み。
 * こちらは**pt を配る**形で、基礎・戦闘・スキル2/3の3方向へ好きに割り振る。
 * どちらか一方の代わりではなく、両方を持てる。
 *
 * ## 上限は「今の★」ではなく「初期★」で決まる
 *
 * ★3を★6まで育てても 20pt のまま。★5は 11pt しかない。
 * **育てにくい方を厚くする**ための逆転で、これが無いと
 * 「★5を引くまで何も始まらない」ゲームになる。
 * `docs/design-concept.md` の「ふつうのモンスターでも奥まで行ける」に沿う。
 *
 * ## ここに書くもの / 書かないもの
 *
 * 書くのは**才能の定義と、状態に対する純粋な計算だけ。**
 * 素材の消費も所持数の判定も `src/game/talents.ts` の仕事で、
 * ここは data 層にも game 層にも依存しない。
 */

/* ==========================================================================
 * 初期レアリティと才能ptの上限
 * ========================================================================== */

/** 才能覚醒が扱う「元々のレアリティ」。★1〜2の個体は存在しないので3〜5だけ */
export type InitialRarity = 3 | 4 | 5;

/**
 * 初期★ごとの才能pt上限。
 *
 * **★が低いほど多い。** 引きやすさの差を、育て切った時の伸びしろで埋め戻す。
 */
export const TALENT_POINT_CAP: Readonly<Record<InitialRarity, number>> = {
  3: 20,
  4: 15,
  5: 11,
};

/** 才能覚醒が解放される★。ここに届くまでは素材だけ貯められる */
export const TALENT_UNLOCK_STAR: Star = 6;

/* ==========================================================================
 * 才能ptの解放コスト
 *
 * ptは最初から全部使えるのではなく、**1ptずつ素材で買う。**
 * 同じ1ptでも後ろほど高い(下の表は「n pt目を買う値段」)。
 * ========================================================================== */

export interface TalentUnlockCost {
  /** 目覚の欠片 */
  shards: number;
  /** 目覚の結晶 */
  crystals: number;
}

interface UnlockBand {
  /** この帯の最後のpt番号(1始まり・この番号まで同じ値段) */
  upTo: number;
  cost: TalentUnlockCost;
}

/**
 * 初期★ごとの、pt解放の値段の帯。
 *
 * 合計は 初期★3 = 欠片472・結晶76 / ★4 = 520・85 / ★5 = 550・86。
 * **★が低いほど1ptあたりは安いが、ptの数が多いので総額はほぼ揃う。**
 * `tests/talents.test.ts` が合計を突き合わせている。
 */
const UNLOCK_BANDS: Readonly<Record<InitialRarity, readonly UnlockBand[]>> = {
  3: [
    { upTo: 7, cost: { shards: 16, crystals: 0 } },
    { upTo: 14, cost: { shards: 24, crystals: 4 } },
    { upTo: 20, cost: { shards: 32, crystals: 8 } },
  ],
  4: [
    { upTo: 5, cost: { shards: 24, crystals: 0 } },
    { upTo: 10, cost: { shards: 34, crystals: 6 } },
    { upTo: 15, cost: { shards: 46, crystals: 11 } },
  ],
  5: [
    { upTo: 4, cost: { shards: 35, crystals: 0 } },
    { upTo: 8, cost: { shards: 50, crystals: 8 } },
    { upTo: 11, cost: { shards: 70, crystals: 18 } },
  ],
};

/**
 * 「次の1pt」の値段。`unlocked` は今までに解放した数(0始まり)。
 * 上限に達していれば null。
 */
export function nextTalentUnlockCost(rarity: InitialRarity, unlocked: number): TalentUnlockCost | null {
  const cap = TALENT_POINT_CAP[rarity];
  if (unlocked >= cap) return null;
  const nth = unlocked + 1;
  for (const band of UNLOCK_BANDS[rarity]) {
    if (nth <= band.upTo) return { ...band.cost };
  }
  return null;
}

/** 上限まで解放するのに要る総額。画面の「あとどれだけ要るか」に使う */
export function totalTalentUnlockCost(rarity: InitialRarity, from = 0): TalentUnlockCost {
  const total: TalentUnlockCost = { shards: 0, crystals: 0 };
  for (let i = from; i < TALENT_POINT_CAP[rarity]; i += 1) {
    const cost = nextTalentUnlockCost(rarity, i);
    if (!cost) break;
    total.shards += cost.shards;
    total.crystals += cost.crystals;
  }
  return total;
}

/** 取得済みの才能だけを白紙に戻す費用。解放済みptは失わない */
export const TALENT_RESET_GOLD_COST = 100_000;

/** スキル覚醒に要る目覚の奇石 */
export const SKILL_AWAKENING_STONE_COST = 3;
/** スキル覚醒のpt。**どの候補も同じ**(選ぶ理由を値段にしない) */
export const SKILL_AWAKENING_POINT_COST = 8;

/* ==========================================================================
 * 基礎才能・戦闘才能
 *
 * どちらも I → II → III の3段階。**IIはIを、IIIはIIを取らないと取れない。**
 * 保存するのは「どこまで進んだか」の段数だけ(0〜3)。
 * ========================================================================== */

/** 段階の番号。0 = 未取得 */
export type TalentTier = 0 | 1 | 2 | 3;

/** 基礎才能の系統 */
export type BasicTalentLine =
  | "atk" | "hp" | "def" | "spd" | "criRate" | "criDmg" | "accuracy" | "resistance";

/** 戦闘才能の系統 */
export type BattleTalentLine =
  | "damageDealt" | "damageTaken" | "healing" | "shielding" | "debuffChance" | "gaugeUp";

export interface TieredTalentStep {
  /** その段を取るのに要るpt(その段だけの値段。累計ではない) */
  cost: number;
  /** 効果量。割合は 0.05 = 5%、速度だけ実数 */
  value: number;
  /** 一覧に出す効果の文言 */
  effectLabel: string;
}

export interface TieredTalentDef<L extends string> {
  line: L;
  name: string;
  /** カードの説明。何に効くのかを一言で */
  description: string;
  /** I / II / III の3段。添字0がI */
  steps: readonly [TieredTalentStep, TieredTalentStep, TieredTalentStep];
}

const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`;

/**
 * 基礎才能。**速度だけが高い。**
 *
 * 速度は手番の数そのもので、+3 でも並び順が変わる。
 * 他と同じ1ptで配ると、誰もが速度から取って他の系統が死ぬ。
 */
export const BASIC_TALENTS: readonly TieredTalentDef<BasicTalentLine>[] = [
  {
    line: "atk", name: "攻撃", description: "攻撃力そのものを底上げする。倍率で殴る役ほど効く",
    steps: [
      { cost: 1, value: 0.05, effectLabel: `攻撃力 +${pct(0.05)}` },
      { cost: 2, value: 0.08, effectLabel: `攻撃力 +${pct(0.08)}` },
      { cost: 3, value: 0.12, effectLabel: `攻撃力 +${pct(0.12)}` },
    ],
  },
  {
    line: "hp", name: "HP", description: "最大HPを底上げする。HP比例の回復やシールドにも乗る",
    steps: [
      { cost: 1, value: 0.06, effectLabel: `HP +${pct(0.06)}` },
      { cost: 2, value: 0.09, effectLabel: `HP +${pct(0.09)}` },
      { cost: 3, value: 0.12, effectLabel: `HP +${pct(0.12)}` },
    ],
  },
  {
    line: "def", name: "防御", description: "防御力を底上げする。受けるダメージが素直に減る",
    steps: [
      { cost: 1, value: 0.06, effectLabel: `防御力 +${pct(0.06)}` },
      { cost: 2, value: 0.09, effectLabel: `防御力 +${pct(0.09)}` },
      { cost: 3, value: 0.12, effectLabel: `防御力 +${pct(0.12)}` },
    ],
  },
  {
    line: "spd", name: "速度", description: "行動順に直に効く。**他の才能より高い**のはそのため",
    steps: [
      { cost: 3, value: 3, effectLabel: "速度 +3" },
      { cost: 4, value: 5, effectLabel: "速度 +5" },
      { cost: 5, value: 7, effectLabel: "速度 +7" },
    ],
  },
  {
    line: "criRate", name: "クリ率", description: "会心の出やすさ。クリダメと組にして初めて効く",
    steps: [
      { cost: 1, value: 0.04, effectLabel: `クリ率 +${pct(0.04)}` },
      { cost: 2, value: 0.06, effectLabel: `クリ率 +${pct(0.06)}` },
      { cost: 3, value: 0.08, effectLabel: `クリ率 +${pct(0.08)}` },
    ],
  },
  {
    line: "criDmg", name: "クリダメ", description: "会心した時の倍率。クリ率が足りている個体ほど伸びる",
    steps: [
      { cost: 1, value: 0.08, effectLabel: `クリダメ +${pct(0.08)}` },
      { cost: 2, value: 0.12, effectLabel: `クリダメ +${pct(0.12)}` },
      { cost: 3, value: 0.18, effectLabel: `クリダメ +${pct(0.18)}` },
    ],
  },
  {
    line: "accuracy", name: "的中", description: "弱体を通す力。相手の抵抗と引き算になる",
    steps: [
      { cost: 1, value: 0.06, effectLabel: `的中 +${pct(0.06)}` },
      { cost: 2, value: 0.10, effectLabel: `的中 +${pct(0.10)}` },
      { cost: 3, value: 0.14, effectLabel: `的中 +${pct(0.14)}` },
    ],
  },
  {
    line: "resistance", name: "抵抗", description: "弱体を弾く力。塔の上の階ほど要る",
    steps: [
      { cost: 1, value: 0.06, effectLabel: `抵抗 +${pct(0.06)}` },
      { cost: 2, value: 0.10, effectLabel: `抵抗 +${pct(0.10)}` },
      { cost: 3, value: 0.14, effectLabel: `抵抗 +${pct(0.14)}` },
    ],
  },
];

/**
 * 戦闘才能。**能力値ではなく、戦闘中の振る舞いに掛かる補正。**
 *
 * 「弱化成功」は的中とは別物。的中は相手の抵抗と引き算する値で、
 * こちらは**スキルが元々持っている発動率そのもの**を上げる
 * (「65%で火傷」の65を動かす)。
 */
export const BATTLE_TALENTS: readonly TieredTalentDef<BattleTalentLine>[] = [
  {
    line: "damageDealt", name: "与ダメージ", description: "与えるダメージ全体に掛かる。属性も会心も関係なく乗る",
    steps: [
      { cost: 2, value: 0.03, effectLabel: `与ダメージ +${pct(0.03)}` },
      { cost: 3, value: 0.05, effectLabel: `与ダメージ +${pct(0.05)}` },
      { cost: 4, value: 0.07, effectLabel: `与ダメージ +${pct(0.07)}` },
    ],
  },
  {
    line: "damageTaken", name: "被ダメージ軽減", description: "受けるダメージ全体を減らす。防御と違い割合で効く",
    steps: [
      { cost: 2, value: 0.03, effectLabel: `被ダメージ -${pct(0.03)}` },
      { cost: 3, value: 0.05, effectLabel: `被ダメージ -${pct(0.05)}` },
      { cost: 4, value: 0.07, effectLabel: `被ダメージ -${pct(0.07)}` },
    ],
  },
  {
    line: "healing", name: "回復量", description: "自分が行う回復の量。回復役の要",
    steps: [
      { cost: 1, value: 0.08, effectLabel: `回復量 +${pct(0.08)}` },
      { cost: 2, value: 0.12, effectLabel: `回復量 +${pct(0.12)}` },
      { cost: 3, value: 0.18, effectLabel: `回復量 +${pct(0.18)}` },
    ],
  },
  {
    line: "shielding", name: "シールド量", description: "自分が張るシールドの量",
    steps: [
      { cost: 1, value: 0.08, effectLabel: `シールド量 +${pct(0.08)}` },
      { cost: 2, value: 0.12, effectLabel: `シールド量 +${pct(0.12)}` },
      { cost: 3, value: 0.18, effectLabel: `シールド量 +${pct(0.18)}` },
    ],
  },
  {
    line: "debuffChance", name: "弱化成功", description: "スキルが持つ発動率そのものを上げる（的中とは別）",
    steps: [
      { cost: 2, value: 0.05, effectLabel: `基本発動率 +${pct(0.05)}` },
      { cost: 3, value: 0.08, effectLabel: `基本発動率 +${pct(0.08)}` },
      { cost: 4, value: 0.12, effectLabel: `基本発動率 +${pct(0.12)}` },
    ],
  },
  {
    line: "gaugeUp", name: "ゲージ増加量", description: "味方の行動ゲージを進めるスキルの量",
    steps: [
      { cost: 2, value: 0.03, effectLabel: `ゲージ増加量 +${pct(0.03)}` },
      { cost: 3, value: 0.05, effectLabel: `ゲージ増加量 +${pct(0.05)}` },
      { cost: 4, value: 0.07, effectLabel: `ゲージ増加量 +${pct(0.07)}` },
    ],
  },
];

export const BASIC_TALENT_BY_LINE = new Map(BASIC_TALENTS.map((t) => [t.line, t]));
export const BATTLE_TALENT_BY_LINE = new Map(BATTLE_TALENTS.map((t) => [t.line, t]));

/** 段階の表記。カードの見出しに使う */
export const TIER_NUMERALS = ["I", "II", "III"] as const;

/** その系統をその段まで取るのに要る累計pt */
export function tieredTalentTotalCost<L extends string>(def: TieredTalentDef<L>, tier: TalentTier): number {
  let total = 0;
  for (let i = 0; i < tier; i += 1) total += def.steps[i].cost;
  return total;
}

/* ==========================================================================
 * 保存する状態
 * ========================================================================== */

/**
 * 個体1体ぶんの才能覚醒。
 *
 * **省略可にしてある。**前から遊んでいる人の控えには丸ごと無いので、
 * 読み込み時に既定値で埋める(`playerState` の正規化)。
 */
export interface TalentState {
  /** 保存形式の移行単位 */
  schemaVersion: 1;
  /** 素材で買った才能ptの総数。振り直しても減らない */
  unlockedPoints: number;
  /** 基礎才能の系統 → 段(0〜3) */
  basic: Partial<Record<BasicTalentLine, TalentTier>>;
  /** 戦闘才能の系統 → 段(0〜3) */
  battle: Partial<Record<BattleTalentLine, TalentTier>>;
  /**
   * スキル才能。**枠ごと**に取得IDを並べる。
   * 添字はスキルの枠(1 = スキル2、2 = スキル3)で、`MonsterInstance.skills` に揃えてある。
   */
  skill: { 1: string[]; 2: string[] };
  /** スキル覚醒。**1体に1つだけ。**取っていなければ null */
  awakening: { slot: 1 | 2; id: string } | null;
}

export function createDefaultTalentState(): TalentState {
  return { schemaVersion: 1, unlockedPoints: 0, basic: {}, battle: {}, skill: { 1: [], 2: [] }, awakening: null };
}

/** 才能覚醒に触ったことがあるか。UIの「未着手」表示に使う */
export function isTalentUntouched(state: TalentState): boolean {
  return usedTalentPoints(state, () => 0) === 0 && state.unlockedPoints === 0;
}

/**
 * 使用済みpt。
 *
 * スキル才能の値段はカタログを引かないと分からないので、
 * **引く関数を外から渡す**(core が data を知らないようにするため)。
 */
export function usedTalentPoints(state: TalentState, skillTalentCost: (id: string) => number): number {
  let used = 0;
  for (const def of BASIC_TALENTS) used += tieredTalentTotalCost(def, state.basic[def.line] ?? 0);
  for (const def of BATTLE_TALENTS) used += tieredTalentTotalCost(def, state.battle[def.line] ?? 0);
  for (const slot of [1, 2] as const) {
    for (const id of state.skill[slot]) used += skillTalentCost(id);
  }
  if (state.awakening) used += SKILL_AWAKENING_POINT_COST;
  return used;
}

/** 残りpt。解放済み - 使用済み */
export function remainingTalentPoints(state: TalentState, skillTalentCost: (id: string) => number): number {
  return Math.max(0, state.unlockedPoints - usedTalentPoints(state, skillTalentCost));
}

/* ==========================================================================
 * 才能から出る補正のまとめ
 *
 * 戦闘側は**この形だけを見る。**才能の種類が増えても、
 * 受け取る側(`toBattleDefinition` と `BattleEngine`)を触らずに済む。
 * ========================================================================== */

export interface TalentStatBonus {
  /** 割合で乗るもの */
  atkPercent: number;
  hpPercent: number;
  defPercent: number;
  /** 速度だけ実数で足す */
  spdFlat: number;
  /** 0〜1のまま足す */
  criRate: number;
  criDmg: number;
  accuracy: number;
  resistance: number;
}

export interface TalentCombatBonus {
  damageDealt: number;
  damageTaken: number;
  healing: number;
  shielding: number;
  debuffChance: number;
  gaugeUp: number;
}

export function emptyTalentStatBonus(): TalentStatBonus {
  return { atkPercent: 0, hpPercent: 0, defPercent: 0, spdFlat: 0, criRate: 0, criDmg: 0, accuracy: 0, resistance: 0 };
}

export function emptyTalentCombatBonus(): TalentCombatBonus {
  return { damageDealt: 0, damageTaken: 0, healing: 0, shielding: 0, debuffChance: 0, gaugeUp: 0 };
}

/**
 * 段の値は**置き換えではなく、そこまでの段の合計。**
 *
 * 攻撃IIIまで取れば 5 + 8 + 12 = 25%。IIIだけの12%ではない。
 * 段ごとに払ったptが1+2+3=6ptなので、置き換えだと後段の割に合わない。
 */
export function talentStatBonus(state: TalentState): TalentStatBonus {
  const bonus = emptyTalentStatBonus();
  for (const def of BASIC_TALENTS) {
    const tier = state.basic[def.line] ?? 0;
    let sum = 0;
    for (let i = 0; i < tier; i += 1) sum += def.steps[i].value;
    if (sum === 0) continue;
    switch (def.line) {
      case "atk": bonus.atkPercent += sum; break;
      case "hp": bonus.hpPercent += sum; break;
      case "def": bonus.defPercent += sum; break;
      case "spd": bonus.spdFlat += sum; break;
      case "criRate": bonus.criRate += sum; break;
      case "criDmg": bonus.criDmg += sum; break;
      case "accuracy": bonus.accuracy += sum; break;
      case "resistance": bonus.resistance += sum; break;
    }
  }
  return bonus;
}

export function talentCombatBonus(state: TalentState): TalentCombatBonus {
  const bonus = emptyTalentCombatBonus();
  for (const def of BATTLE_TALENTS) {
    const tier = state.battle[def.line] ?? 0;
    let sum = 0;
    for (let i = 0; i < tier; i += 1) sum += def.steps[i].value;
    if (sum === 0) continue;
    bonus[def.line === "damageTaken" ? "damageTaken" : def.line] += sum;
  }
  return bonus;
}
