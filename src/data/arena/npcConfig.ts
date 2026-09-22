/**
 * アリーナNPCの「育ち具合」を決める表。
 *
 * ## なぜ設定を1か所に集めるのか
 *
 * NPCは**プレイヤーと同じ育成ルールだけ**で作る。星・レベル・タイプ・能力ポイント・
 * 潜在覚醒・スキルレベル・装備、この7つ以外に強さの出どころを作らない。
 * だから「NPCが強い/弱い」を直したい時に触る場所は、原理的にこの表しかない。
 *
 * 逆に言うと、生成側(`src/game/arena/npc.ts`)に数字を書き始めた時点で、
 * バランス調整は「コードを読んで数字を探す作業」に変わる。
 * この案件では既に、装備の生成側を変えても控えに焼いた値が変わらない事故を
 * 出している(CLAUDE.md)。**調整点を散らさないことがそのまま安全になる。**
 *
 * ## 上の帯ほど「数値が高い」ではなく「完成度が高い」(レート3000まで)
 *
 * 3000までは、帯を上げる時に倍率を掛けない。上げるのは
 *
 *   星 → レベルの詰め具合 → 装備の星と強化 → サブOPの本数 →
 *   メインOPが役割に合う確率 → **装備を選び取った回数(厳選)** →
 *   能力ポイントの投入率 → 潜在覚醒の所持率 →
 *   タイプ転生の済み具合 → 編成テンプレの噛み合い
 *
 * の10個だけ。**どれもプレイヤーが自分の手で到達できる**ものに限る。
 * `EQUIP_MAX_LEVEL`(15)・`ABILITY_POINT_BUDGETS`(星6で100)・
 * `STAR_MAX_LEVEL`(星6で60)を1も超えない。
 *
 * ## 3000から上だけ、育成の外へ出ている
 *
 * 星もレベルもスキルも装備の強化も能力ポイントも、上の帯はとっくに上限に
 * 張り付いている。最後に残っていた軸が「厳選」(`gearRolls`)だが、
 * **22本でほぼ最適に届く**ので、320本に増やしても差にならなかった。
 *
 * それどころか**厳選は途中から逆効果だった。**体力型はサブOPの希望がHP寄りなので、
 * 選び直すほどHPに偏る。同じ編成で 3000 と 3500 を比べると
 * 攻撃が-12%・防御が-13%・クリ率が-6pt 下がっていた(HPは+23%)。
 *
 * そこで依頼主の判断で、3000より上には `statMultiplier` を置いた。
 * **ここだけが「どう育てても再現できない」領域**で、
 * 3000までは今までどおり育成の範囲内に収まっている。
 */
import { EquipStar, SetType, StatType } from "../../core/equipment.js";
import { MonsterType } from "../../core/monsterDevelopment.js";
import { Star } from "../../core/rarity.js";

/* ==========================================================================
 * 役割
 * ========================================================================== */

/**
 * NPCの1体が担う役割。**`MonsterType` の実在する値をそのまま使う**
 * (BALANCE だけは「役割なし」なので除く)。
 * 独自の役割名を作ると、タイプ転生の補正と役割がずれる。
 */
export type ArenaNpcRole = Exclude<MonsterType, "BALANCE">;

/** 可変メインOPを持つスロット。1/3/5は固定なので狙う余地がない */
export type VariableSlot = 2 | 4 | 6;
export const VARIABLE_SLOTS: readonly VariableSlot[] = [2, 4, 6];

export interface ArenaNpcRolePlan {
  label: string;
  /**
   * 可変スロットで狙うメインOP。**すべて `SLOT_MAIN_STAT_OPTIONS` に実在するもの**に限る。
   * ここに存在しない組み合わせを書くと、いくら振り直しても当たらず、
   * 「役割に合った装備」を名乗れないNPCが黙って出来上がる。
   */
  mainStats: Record<VariableSlot, readonly StatType[]>;
  /**
   * その役割にとって値打ちのあるサブOP。**厳選の良し悪しを測る物差し。**
   *
   * サブOPは枠も種類も選べない(引いたものが乗る)ので、`mainStats` のように
   * 「狙って当てる」ことはできない。できるのは**当たりの多い装備を選び取る**こと——
   * 実際のプレイヤーがやっている厳選そのもの。上の帯ほど、その選び取りを
   * たくさん繰り返した相手になる(`ArenaNpcBand.gearRolls`)。
   *
   * **並び順が優先度。**前にあるものほど重く数える。
   */
  subStats: readonly StatType[];
  /** 4個セットに寄せるシリーズと、残り2枠のシリーズ */
  sets: { primary: SetType; secondary: SetType };
  /** 能力ポイントの配り方。合計1になるようにしておく(端数は最大の枠へ寄せる) */
  abilityWeights: { hp: number; atk: number; def: number; spd: number };
  /**
   * 潜在覚醒を選ぶ時に優先する分類。
   * 候補は個体ごとに違うので、**この順で見つかった最初のものを取る**。
   * 1つも無ければ候補の先頭から決定的に選ぶ(存在しないIDは絶対に作らない)。
   */
  latentCategories: readonly string[];
}

/**
 * 役割ごとの装備・能力ポイントの方針。
 *
 * 依頼どおりの割り振り(攻撃=攻撃/クリ率/クリダメ/速度、体力=HP/速度/防御/抵抗、
 * 防御=防御/HP/速度、補助=速度/HP/防御/抵抗、妨害=速度/的中/HP/防御)を、
 * **スロットごとに実際に出うるOPへ落として**書いてある。
 * 例えばクリ率・クリダメはスロット4にしか出ないので、攻撃型でもそこにしか置けない。
 */
export const ARENA_NPC_ROLE_PLANS: Readonly<Record<ArenaNpcRole, ArenaNpcRolePlan>> = {
  ATTACK: {
    label: "攻撃",
    mainStats: { 2: ["ATK_PERCENT", "SPD"], 4: ["CRIT_RATE", "CRIT_DMG"], 6: ["ATK_PERCENT"] },
    subStats: ["CRIT_DMG", "CRIT_RATE", "ATK_PERCENT", "SPD", "ATK_FLAT"],
    sets: { primary: "CRIT", secondary: "POWER" },
    abilityWeights: { hp: 0.1, atk: 0.6, def: 0.05, spd: 0.25 },
    latentCategories: ["OFFENSE", "DISRUPT", "SPECIAL"],
  },
  HP: {
    label: "体力",
    mainStats: { 2: ["HP_PERCENT", "SPD"], 4: ["HP_PERCENT"], 6: ["HP_PERCENT", "RESISTANCE"] },
    subStats: ["HP_PERCENT", "SPD", "DEF_PERCENT", "RESISTANCE", "HP_FLAT"],
    sets: { primary: "VITALITY", secondary: "RESIST_SET" },
    abilityWeights: { hp: 0.55, atk: 0, def: 0.2, spd: 0.25 },
    latentCategories: ["DURABILITY", "SUPPORT", "SPECIAL"],
  },
  DEFENSE: {
    label: "防御",
    mainStats: { 2: ["DEF_PERCENT", "SPD"], 4: ["DEF_PERCENT", "HP_PERCENT"], 6: ["DEF_PERCENT", "HP_PERCENT"] },
    subStats: ["DEF_PERCENT", "HP_PERCENT", "SPD", "RESISTANCE", "DEF_FLAT"],
    sets: { primary: "GUARD", secondary: "VITALITY" },
    abilityWeights: { hp: 0.25, atk: 0, def: 0.55, spd: 0.2 },
    latentCategories: ["DURABILITY", "SUPPORT", "SPECIAL"],
  },
  SUPPORT: {
    label: "補助",
    mainStats: { 2: ["SPD"], 4: ["HP_PERCENT", "DEF_PERCENT"], 6: ["RESISTANCE", "HP_PERCENT"] },
    subStats: ["SPD", "HP_PERCENT", "RESISTANCE", "DEF_PERCENT", "HP_FLAT"],
    sets: { primary: "SWIFT", secondary: "RESIST_SET" },
    abilityWeights: { hp: 0.3, atk: 0, def: 0.2, spd: 0.5 },
    latentCategories: ["SUPPORT", "DURABILITY", "SPECIAL"],
  },
  DISRUPT: {
    label: "妨害",
    mainStats: { 2: ["SPD"], 4: ["HP_PERCENT", "DEF_PERCENT"], 6: ["ACCURACY", "HP_PERCENT"] },
    subStats: ["SPD", "ACCURACY", "HP_PERCENT", "DEF_PERCENT", "HP_FLAT"],
    sets: { primary: "ACCURACY_SET", secondary: "SWIFT" },
    abilityWeights: { hp: 0.3, atk: 0, def: 0.2, spd: 0.5 },
    latentCategories: ["DISRUPT", "SUPPORT", "SPECIAL"],
  },
};

/* ==========================================================================
 * レート帯
 * ========================================================================== */

export type ArenaNpcBandId =
  | "NOVICE" | "LEARNER" | "REGULAR" | "VETERAN" | "EXPERT" | "MASTER"
  | "ELITE" | "CHAMPION" | "FINALIST" | "APEX"
  /*
   * --- 2700から上、100ごとの9段 ---
   *
   * ここから先は**育成では上げられない。**星もレベルもスキルも装備の強化も
   * 能力ポイントも、APEX の時点で上限に張り付いている。
   * 違うのは `gearRolls` ——**何本引いて一番良いものを残したか**だけ。
   */
  | "ASCEND_1" | "ASCEND_2" | "ASCEND_3" | "ASCEND_4" | "ASCEND_5"
  | "ASCEND_6" | "ASCEND_7" | "ASCEND_8" | "ASCEND_9"
  | "ASCEND_10" | "ASCEND_11" | "ASCEND_12" | "ASCEND_13" | "ASCEND_14"
  | "ASCEND_15" | "ASCEND_16" | "ASCEND_17" | "ASCEND_18" | "ASCEND_19";

export interface WeightedStar {
  star: Star;
  weight: number;
}

export interface ArenaNpcBand {
  id: ArenaNpcBandId;
  /** 調整の議論に使う名前。画面へ出す必要はない */
  name: string;
  /** この帯に入る最低レート。**昇順に並べること** */
  minRating: number;
  /** 星の分布。上の帯ほど高い星へ寄る */
  starWeights: readonly WeightedStar[];
  /**
   * その星の最大レベルに対する到達率の範囲。
   * 「Lv44〜50」のような絶対値で書くと、星が変わるたびに意味が変わる。
   */
  levelRatio: readonly [number, number];
  skillLevel: readonly [number, number];
  /** 装備の星の範囲(この中から一様に選ぶ) */
  equipStar: readonly [EquipStar, EquipStar];
  /** 強化レベルの範囲。上限は `EQUIP_MAX_LEVEL` を超えない */
  equipEnhance: readonly [number, number];
  /** 生成時のサブOP本数。強化の節目でさらに増えることがある */
  equipSubStats: readonly [number, number];
  /**
   * 狙ったメインOPを引くための振り直し回数。
   * 0だと完全に運任せになり、下の帯の「役割に合っていない装備」を再現できる。
   */
  mainStatRerolls: number;
  /**
   * 装備1個を**何本引いて、そのうち一番良いものを残したか**。
   *
   * `mainStatRerolls` は「狙ったメインが出るまで引き直す」だけで、
   * サブOPの中身は最後に引いたものが素通りする。こちらは**引いた装備を
   * 最後まで鍛えてから見比べて、役割に噛み合う1本を残す**——
   * 実際のプレイヤーがやっている厳選と同じ手順。
   *
   * 省略・0・1 はどれも「引いたものをそのまま着ける」。
   * 上の帯だけがここを持ち、下の帯は今までどおり運任せのまま。
   *
   * **効きは鈍る。**2本から4本にした時ほど、40本から80本にした効果は無い
   * (良い方を選び続けるほど、次の1本が上回る見込みが減るため)。
   * 帯を上げる時は倍々で増やさないと差にならない。
   */
  gearRolls?: number;
  /**
   * HP・攻撃・防御へ掛ける倍率。**レート3000より上の帯だけが持つ。**
   *
   * ## ここだけが育成の外に出ている
   *
   * 上の10項目は全部「プレイヤーが自分の手で到達できる」ものだが、これは違う。
   * 3000あたりで育成の範囲内で作れる強さの天井に届き、そこから先は
   * 何を積んでも差が出なくなったため、依頼主の判断で入れた。
   *
   * **厳選は途中から逆効果でもあった。**体力型はサブOPの希望がHP寄りなので、
   * 選び直すほどHPに偏る。同じ編成で 3000 と 3500 を比べると
   * 攻撃が-12%・防御が-13%・クリ率が-6pt 下がっていた(HPは+23%)。
   * だから `gearRolls` は3000で打ち止めにして、そこから上は倍率で伸ばす。
   *
   * ## 速度には掛からない
   *
   * 掛かるのはHP・攻撃・防御の3つだけ(`snapshotToDefinitions`)。
   * 速度は手番の数に直結するので、伸ばすと相手だけが何度も動く別のゲームになる。
   */
  statMultiplier?: number;
  /** シリーズを4+2でそろえる確率。低い帯はバラバラの装備を着ている */
  setCoherence: number;
  /** 星別上限(`ABILITY_POINT_BUDGETS`)のうち、実際に振ってある割合 */
  abilityPointRatio: readonly [number, number];
  /** 潜在覚醒を持っている確率 */
  latentChance: number;
  /** タイプ転生を済ませている確率 */
  typeChance: number;
  /** この帯で使う編成テンプレの段(`npcTeams.ts` の `tier`) */
  teamTiers: readonly number[];
}

/**
 * レート帯の表。**昇順**に並べること(`arenaNpcBandForRating` が後ろから探す)。
 *
 * 依頼の区切りは 〜1199 / 1200-1499 / 1500-1799 / 1800-2099 / 2100-2399 / 2400〜。
 * 最上段だけ 2400-2699 と 2700〜 に割って7段にしてある。
 * レジェンド(`ARENA_TIERS` では2500から)に届いた相手と、
 * そこからさらに積み上げた相手が同じ完成度で並ぶと、
 * **一番上まで来た人にだけ、伸びしろの見えない壁**が残ってしまうため。
 */
export const ARENA_NPC_BANDS: readonly ArenaNpcBand[] = [
  {
    id: "NOVICE",
    name: "駆け出し",
    minRating: 0,
    starWeights: [{ star: 3, weight: 60 }, { star: 4, weight: 40 }],
    levelRatio: [0.55, 0.8],
    skillLevel: [1, 2],
    equipStar: [1, 2],
    equipEnhance: [0, 3],
    equipSubStats: [0, 1],
    mainStatRerolls: 0,
    setCoherence: 0,
    abilityPointRatio: [0, 0.15],
    latentChance: 0,
    typeChance: 0.1,
    teamTiers: [0],
  },
  {
    id: "LEARNER",
    name: "常連",
    minRating: 1200,
    starWeights: [{ star: 4, weight: 80 }, { star: 5, weight: 20 }],
    levelRatio: [0.8, 1],
    skillLevel: [1, 3],
    equipStar: [2, 3],
    equipEnhance: [3, 6],
    equipSubStats: [1, 2],
    mainStatRerolls: 2,
    setCoherence: 0.3,
    abilityPointRatio: [0.2, 0.5],
    latentChance: 0.1,
    typeChance: 0.35,
    teamTiers: [0, 1],
  },
  {
    id: "REGULAR",
    name: "手練れ",
    minRating: 1500,
    starWeights: [{ star: 4, weight: 25 }, { star: 5, weight: 75 }],
    levelRatio: [0.9, 1],
    skillLevel: [2, 4],
    equipStar: [3, 4],
    equipEnhance: [6, 9],
    equipSubStats: [1, 3],
    mainStatRerolls: 4,
    setCoherence: 0.55,
    abilityPointRatio: [0.4, 0.7],
    latentChance: 0.25,
    typeChance: 0.6,
    teamTiers: [1, 2],
  },
  {
    id: "VETERAN",
    name: "熟練",
    minRating: 1800,
    starWeights: [{ star: 5, weight: 85 }, { star: 6, weight: 15 }],
    levelRatio: [1, 1],
    skillLevel: [3, 4],
    equipStar: [4, 5],
    equipEnhance: [9, 12],
    equipSubStats: [2, 3],
    mainStatRerolls: 6,
    setCoherence: 0.75,
    abilityPointRatio: [0.6, 0.85],
    latentChance: 0.45,
    typeChance: 0.8,
    teamTiers: [2],
  },
  {
    id: "EXPERT",
    name: "上位",
    minRating: 2100,
    starWeights: [{ star: 5, weight: 25 }, { star: 6, weight: 75 }],
    levelRatio: [1, 1],
    skillLevel: [4, 5],
    equipStar: [5, 5],
    equipEnhance: [12, 14],
    equipSubStats: [3, 4],
    mainStatRerolls: 8,
    setCoherence: 0.9,
    abilityPointRatio: [0.8, 1],
    latentChance: 0.65,
    typeChance: 0.9,
    teamTiers: [2, 3],
  },
  {
    id: "MASTER",
    name: "頂点手前",
    minRating: 2400,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [4, 5],
    equipStar: [5, 6],
    equipEnhance: [14, 15],
    equipSubStats: [3, 4],
    mainStatRerolls: 10,
    setCoherence: 1,
    abilityPointRatio: [0.9, 1],
    latentChance: 0.85,
    typeChance: 1,
    teamTiers: [3],
  },
  {
    id: "ELITE",
    name: "上級",
    minRating: 2500,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [4, 5],
    equipStar: [5, 6],
    equipEnhance: [14, 15],
    equipSubStats: [3, 4],
    mainStatRerolls: 12,
    setCoherence: 1,
    abilityPointRatio: [0.92, 1],
    latentChance: 0.88,
    typeChance: 1,
    teamTiers: [3],
  },
  {
    id: "CHAMPION",
    name: "最上級",
    minRating: 2575,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [14, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 14,
    setCoherence: 1,
    abilityPointRatio: [0.95, 1],
    latentChance: 0.92,
    typeChance: 1,
    teamTiers: [3],
  },
  {
    id: "FINALIST",
    name: "王者級",
    minRating: 2625,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 16,
    setCoherence: 1,
    abilityPointRatio: [0.98, 1],
    latentChance: 0.97,
    typeChance: 1,
    teamTiers: [3],
  },
  {
    id: "APEX",
    name: "最終NPC",
    minRating: 2675,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [3],
  },

  {
    id: "ASCEND_1",
    name: "絶級",
    minRating: 2700,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 3,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [3, 4],
  },
  {
    id: "ASCEND_2",
    name: "絶級II",
    minRating: 2800,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 6,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [4],
  },
  {
    id: "ASCEND_3",
    name: "絶級III",
    minRating: 2900,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 12,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [4],
  },
  {
    id: "ASCEND_4",
    name: "極級",
    minRating: 3000,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 22,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [4, 5],
  },
  {
    id: "ASCEND_5",
    name: "極級II",
    minRating: 3100,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 22,
    statMultiplier: 1.1,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [4, 5],
  },
  {
    id: "ASCEND_6",
    name: "極級III",
    minRating: 3200,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 22,
    statMultiplier: 1.22,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [5],
  },
  {
    id: "ASCEND_7",
    name: "覇級",
    minRating: 3300,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 22,
    statMultiplier: 1.36,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [5],
  },
  {
    id: "ASCEND_8",
    name: "覇級II",
    minRating: 3400,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 22,
    statMultiplier: 1.52,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [5],
  },
  {
    id: "ASCEND_9",
    name: "覇級III",
    minRating: 3500,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 20,
    gearRolls: 22,
    statMultiplier: 1.7,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [5],
  },
  {
    id: "ASCEND_10", name: "天級", minRating: 3750,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.73, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [5, 6],
  },
  {
    id: "ASCEND_11", name: "天級II", minRating: 4000,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.76, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [6],
  },
  {
    id: "ASCEND_12", name: "天級III", minRating: 4250,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.79, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [6, 7],
  },
  {
    id: "ASCEND_13", name: "神級", minRating: 4500,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.82, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [7],
  },
  {
    id: "ASCEND_14", name: "神級II", minRating: 4750,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.85, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [7, 8],
  },
  {
    id: "ASCEND_15", name: "神級III", minRating: 5000,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.88, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [8],
  },
  {
    id: "ASCEND_16", name: "超越級", minRating: 5250,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.91, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [8, 9],
  },
  {
    id: "ASCEND_17", name: "超越級II", minRating: 5500,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.94, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [9],
  },
  {
    id: "ASCEND_18", name: "超越級III", minRating: 5750,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 1.97, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [9],
  },
  {
    id: "ASCEND_19", name: "極致", minRating: 6000,
    starWeights: [{ star: 6, weight: 100 }], levelRatio: [1, 1], skillLevel: [5, 5],
    equipStar: [6, 6], equipEnhance: [15, 15], equipSubStats: [4, 4],
    mainStatRerolls: 20, gearRolls: 22, statMultiplier: 2, setCoherence: 1,
    abilityPointRatio: [1, 1], latentChance: 1, typeChance: 1, teamTiers: [9],
  },
];

/** そのレートの帯。表の外の値でも必ず1つ返す */
export function arenaNpcBandForRating(rating: number): ArenaNpcBand {
  let found = ARENA_NPC_BANDS[0];
  for (const band of ARENA_NPC_BANDS) {
    if (rating >= band.minRating) found = band;
  }
  return found;
}

/* ==========================================================================
 * 並べ方
 * ========================================================================== */

/** 1編成の人数。プレイヤーのパーティと同じ */
export const ARENA_NPC_TEAM_SIZE = 4;

/** 一度に並べるNPCの既定人数 */
export const ARENA_NPC_DEFAULT_COUNT = 3;

/**
 * NPCレートの絶対上限。**NPCだけで上位レートを青天井に伸ばさない。**
 *
 * 2700 だった頃、そこを越えた人には**同じ相手しか並ばなかった**。
 * 3500 まで100ごとの帯(`ASCEND_1`〜`ASCEND_9`)を置いたので、そこに合わせる。
 * ここを動かす時は帯の表も一緒に伸ばすこと——上限だけ上げると、
 * 一番上の帯が伸びしろのないまま横に広がる。
 */
export const ARENA_NPC_MAX_RATING = 6000;

/**
 * 並んだNPCのレートの置き方。
 * **勝てそうな相手・互角・格上**が必ず混ざるようにする。
 * 3人とも同じ強さなら、選ぶという操作そのものに意味が無くなる。
 */
export const ARENA_NPC_RATING_OFFSETS: readonly number[] = [-60, 5, 70];

/** 同じ帯の中でもう少し揺らす幅(±) */
export const ARENA_NPC_RATING_JITTER = 25;
