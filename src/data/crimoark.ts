import { MonsterTemplate } from "../core/monster.js";
import { Skill } from "../core/skill.js";

/**
 * 試練の塔100階の最終ボス「クリモアーク」と、その分身3種。
 *
 * ## この階だけが持っているもの
 *
 * **自分のコピーを作って戦わせるボス。**60階の豪魔人(反撃)、70階の始祖ベヒモス
 * (超再生)、90階の古代ネメシス(狂化)はどれも「ボス1体+固定のお供」だが、
 * ここは**戦っている最中に顔ぶれが増える。**しかも増える相手は3種類から毎回
 * ランダムなので、同じ盤面が二度と出てこない。
 *
 * ## ここに書いてあるもの / 書いていないもの
 *
 * 書いてあるのは**スキルの定義と図鑑の原型だけ。**分身の生成、生存数の上限、
 * 分身のHP、本体の段階強化、スキル4は、どれもスキルの効果として書けないので
 * `BattleEngine` の100階処理が持つ(`trialTowerFloor === 100` でしか動かない)。
 *
 * ## 属性は本体も分身も闇で揃えてある
 *
 * 見た目は4枚とも色が違う(本体=紫 / 攻撃型=赤 / サポート型=青緑 / デバフ型=青)が、
 * **属性は全員 DARK。** 分身ごとに属性を変えると、こちらの編成との相性で
 * 難易度が分身の抽選運に振れてしまう。Battle Labでの実測も全員闇で取っている。
 * 絵は `crimoark-DARK.webp` のように属性名を付けて置くので、
 * 属性色への寄せ(tint)もかからず、描いたままの色で出る。
 */

/* ========================================================================
 * 図鑑ID。**画像のファイル名もこれで決まる**(`spriteArt.ts`)
 * ===================================================================== */

export const CRIMOARK_TEMPLATE_ID = "crimoark";
export const CRIMOARK_ATTACK_TEMPLATE_ID = "crimoark_attack";
export const CRIMOARK_SUPPORT_TEMPLATE_ID = "crimoark_support";
export const CRIMOARK_DEBUFF_TEMPLATE_ID = "crimoark_debuff";

/** 分身の3種。**抽選は等確率**で、同じ型が並んでも良い */
export type CrimoarkCloneRole = "ATTACK" | "SUPPORT" | "DEBUFF";
export const CRIMOARK_CLONE_ROLES: readonly CrimoarkCloneRole[] = ["ATTACK", "SUPPORT", "DEBUFF"];

/* ========================================================================
 * 本体の実効ステータス
 * ===================================================================== */

export const CRIMOARK_HP = 400_000;
export const CRIMOARK_ATK = 9_800;
export const CRIMOARK_DEF = 4_600;
export const CRIMOARK_SPD = 215;
export const CRIMOARK_CRI_RATE = 0.30;
export const CRIMOARK_CRI_DMG = 1.80;
export const CRIMOARK_ACCURACY = 0.75;
export const CRIMOARK_RESISTANCE = 0.60;

/* ========================================================================
 * 段階強化。**HP70 / 40 / 20% で積み上がる**(置き換えではない)
 * ===================================================================== */

export const CRIMOARK_HP70_ATK = 1_000;
export const CRIMOARK_HP70_SPD = 15;
export const CRIMOARK_HP40_ATK = 1_500;
export const CRIMOARK_HP40_SPD = 25;
export const CRIMOARK_HP40_CRI_RATE = 0.20;
export const CRIMOARK_HP40_CRI_DMG = 0.30;
export const CRIMOARK_HP20_ATK = 2_000;
export const CRIMOARK_HP20_SPD = 40;
export const CRIMOARK_HP20_CRI_RATE = 0.20;
export const CRIMOARK_HP20_CRI_DMG = 0.50;

/**
 * 与ダメージの倍率。**ここだけは積まずに段階で置き換える。**
 * 1.15 × 1.30 = 1.495 にはしない(依頼主の指定)。
 */
export const CRIMOARK_HP40_DAMAGE_FACTOR = 1.15;
export const CRIMOARK_HP20_DAMAGE_FACTOR = 1.30;

/* ========================================================================
 * 分身まわり
 * ===================================================================== */

/** HP70%より上は1体まで、70%以下で2体まで。**3体にはしない** */
export const CRIMOARK_MAX_CLONES_HIGH = 1;
export const CRIMOARK_MAX_CLONES_LOW = 2;
/** 分身の最大HP =「生成した瞬間の本体の現在HP」の割合。生成後は動かない */
export const CRIMOARK_CLONE_HP_RATIO = 0.25;
/** 分身の最大HPの下限。本体が削れきっても紙にはならない */
export const CRIMOARK_CLONE_HP_FLOOR = 75_000;
/** 上限まで分身が揃っている時にS3を撃つと、生成の代わりにこれだけ立て直す */
export const CRIMOARK_CLONE_REFRESH_HEAL = 0.30;
export const CRIMOARK_CLONE_REFRESH_GAUGE = 0.30;
/** 分身1体につき本体が軽くなる被ダメージ。2体なら20% */
export const CRIMOARK_CLONE_MITIGATE_EACH = 0.10;
/** 分身が1体倒れるたびに本体へ乗る一時強化(2ターン) */
export const CRIMOARK_CLONE_DEATH_ATK = 0.30;
export const CRIMOARK_CLONE_DEATH_SPD = 0.20;
export const CRIMOARK_CLONE_DEATH_TURNS = 2;

/** HP20%以下でだけ起きる、本体と分身の押し合い */
export const CRIMOARK_LOW_HP_CLONE_GAUGE = 0.20;
export const CRIMOARK_LOW_HP_BOSS_GAUGE = 0.10;

/* ========================================================================
 * スキル4「オーバークリエイト」
 * ===================================================================== */

export const CRIMOARK_S4_COOLDOWN = 6;
/** 生存している分身1体につき、スキル4の最終ダメージへ足す割合 */
export const CRIMOARK_S4_CLONE_BONUS = 0.15;

/* ========================================================================
 * 分身のスキルが本体へ渡すぶん。**どれも本体だけ**(味方全体には配らない)
 * ===================================================================== */

/** 攻撃型「模造処刑」で相手を倒した時、本体の行動ゲージへ */
export const CRIMOARK_ATTACK_KILL_GAUGE = 0.20;
/** サポート型「模造供給」で本体の行動ゲージへ */
export const CRIMOARK_SUPPORT_FEED_GAUGE = 0.10;
/** サポート型「模造強化」が本体へ渡す強化とシールド */
export const CRIMOARK_SUPPORT_BUFF_ATK = 0.50;
export const CRIMOARK_SUPPORT_BUFF_SPD = 0.30;
export const CRIMOARK_SUPPORT_SHIELD_RATE = 0.08;
export const CRIMOARK_SUPPORT_BUFF_TURNS = 2;
/** サポート型「模造加速」が本体へ渡すゲージと、縮めるクールタイム */
export const CRIMOARK_SUPPORT_HASTE_GAUGE = 0.35;
export const CRIMOARK_SUPPORT_HASTE_COOLDOWN = 1;

/* ========================================================================
 * 本体のスキル
 * ===================================================================== */

export const CRIMOARK_S1_ID = "crimoark_s1";
export const CRIMOARK_S2_ID = "crimoark_s2";
export const CRIMOARK_S3_ID = "crimoark_s3";
export const CRIMOARK_S4_ID = "crimoark_s4";

const CRIMOARK_S1: Skill = {
  id: CRIMOARK_S1_ID,
  name: "クリエイト・ブレイク",
  description: "敵単体に攻撃力1.35倍のダメージを与え、防御力を50%低下させ(2ターン)、行動ゲージを20%減少させる。"
    + "対象に弱体効果が2個以上あれば最終ダメージ+30%、さらにHPが50%以下なら+20%。",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [
    /*
     * **弱体2個以上の判定は、この技が防御ダウンを入れる前に行われる。**
     * 効果は上から順に解決されるので、DAMAGE を先頭に置いておけば
     * 「自分で入れた防御ダウンを数えて自分で+30%する」ことにはならない。
     */
    {
      kind: "DAMAGE",
      multiplier: 1.35,
      conditionalBonus: [{ when: "TARGET_DEBUFF_AT_LEAST_2", bonus: 0.30 }],
      targetHpBonus: [{ hpRatio: 0.5, bonus: 0.20 }],
    },
    { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 2, chance: 1 },
    { kind: "GAUGE", amount: -0.20 },
  ],
};

const CRIMOARK_S2: Skill = {
  id: CRIMOARK_S2_ID,
  name: "リライト・ディザスター",
  description: "敵全体に攻撃力1.15倍のダメージを与え、強化効果を2個解除する。"
    + "解除できた相手には2ターンの強化不可。さらに行動ゲージを25%減少させ、70%で攻撃力を50%低下させる(2ターン)。"
    + "最後に自身の弱体効果を2個解除する。",
  target: "ALL_ENEMIES",
  cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 1.15 },
    { kind: "STRIP", count: 2, chance: 1 },
    // **剥がせた相手にだけ。**剥がすものが無かった相手には何も付かない
    { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 1, requires: "STRIPPED_TARGET", fixedDuration: true },
    { kind: "GAUGE", amount: -0.25 },
    { kind: "DEBUFF", stat: "atk", amount: 0.50, durationTurns: 2, chance: 0.70 },
    { kind: "CLEANSE", count: 2, applyTo: "SELF" },
  ],
};

/**
 * 分身の生成そのものは `BattleEngine` の100階処理が行う。
 * ここは「その手番でこの技を撃った」ことを盤面とログへ残すための入れ物。
 */
const CRIMOARK_S3: Skill = {
  id: CRIMOARK_S3_ID,
  name: "クリエイト・コピー",
  description: "自身の分身を1体生み出す。攻撃型・サポート型・デバフ型のいずれかがランダムに現れる。"
    + "分身は自身のHPが70%以下になると2体まで同時に存在できる。"
    + "すでに上限まで揃っている場合は、生存中の分身を最大HPの30%回復し、行動ゲージを30%進める。",
  target: "SELF",
  cooldownTurns: 5,
  // **効果は1つも持たない。**中身は engine の100階処理が行う
  effects: [],
};

/**
 * スキル4。**通常の3枠には入らない。**
 *
 * 100階の手番で、エンジンがこの定義を一時的に差し込んで撃たせる
 * (`BattleEngine` の100階処理)。既存モンスターは3枠のままで、
 * UI・AI・セーブのどれにも4枠目は生えない。
 */
export const CRIMOARK_S4: Skill = {
  id: CRIMOARK_S4_ID,
  name: "オーバークリエイト",
  description: "敵全体の強化効果をすべて解除し、攻撃力1.30倍のダメージを与える。"
    + "さらに行動ゲージを50%減少させ、防御力を50%低下(3ターン)、回復阻害(2ターン)を与え、自身の行動ゲージを30%進める。"
    + "生存している分身1体につき最終ダメージ+15%。",
  target: "ALL_ENEMIES",
  cooldownTurns: CRIMOARK_S4_COOLDOWN,
  effects: [
    { kind: "STRIP", chance: 1 },
    { kind: "DAMAGE", multiplier: 1.30 },
    { kind: "GAUGE", amount: -0.50 },
    { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 3, chance: 1, fixedDuration: true },
    { kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 1, fixedDuration: true },
    { kind: "GAUGE", amount: 0.30, applyTo: "SELF" },
  ],
};

/* ========================================================================
 * 分身のスキル
 *
 * **本体だけへ渡すぶんは、ここには書けない。**
 * 「味方全体」で書くともう1体の分身にも配られてしまうので、
 * 本体限定の受け渡しは engine の100階処理が技IDを見て行う。
 * ===================================================================== */

export const CRIMOARK_ATTACK_S3_ID = "crimoark_attack_s3";
export const CRIMOARK_SUPPORT_S1_ID = "crimoark_support_s1";
export const CRIMOARK_SUPPORT_S2_ID = "crimoark_support_s2";
export const CRIMOARK_SUPPORT_S3_ID = "crimoark_support_s3";

const ATTACK_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "crimoark_attack_s1", name: "模造強襲",
    description: "敵単体に攻撃力1.20倍のダメージを与え、行動ゲージを15%減少させる。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 1.20 }, { kind: "GAUGE", amount: -0.15 }],
  },
  {
    id: "crimoark_attack_s2", name: "模造連撃",
    description: "敵単体に攻撃力0.85倍のダメージを2回与える。対象のHPが50%以下なら最終ダメージ+30%。",
    target: "SINGLE_ENEMY", cooldownTurns: 3,
    effects: [{ kind: "DAMAGE", multiplier: 0.85, hits: 2, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.30 }] }],
  },
  {
    id: CRIMOARK_ATTACK_S3_ID, name: "模造処刑",
    description: "敵単体に攻撃力1.80倍のダメージを与える。対象のHPが50%以下なら最終ダメージ+50%。"
      + "この攻撃で相手を倒すと、クリモアーク本体の行動ゲージを20%進める。",
    target: "SINGLE_ENEMY", cooldownTurns: 4, targetPriority: "LOWEST_HP",
    effects: [{ kind: "DAMAGE", multiplier: 1.80, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.50 }] }],
  },
];

const SUPPORT_SKILLS: [Skill, Skill, Skill] = [
  {
    id: CRIMOARK_SUPPORT_S1_ID, name: "模造供給",
    description: "敵単体に攻撃力0.75倍のダメージを与え、クリモアーク本体の行動ゲージを10%進める。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.75 }],
  },
  {
    id: CRIMOARK_SUPPORT_S2_ID, name: "模造強化",
    description: "クリモアーク本体の攻撃力を50%、速度を30%上昇させ(2ターン)、最大HPの8%のシールドを張る。",
    // 本体だけへ渡すので、スキルの効果としては書けない(engine の100階処理が渡す)
    target: "SELF", cooldownTurns: 3,
    effects: [],
  },
  {
    id: CRIMOARK_SUPPORT_S3_ID, name: "模造加速",
    description: "クリモアーク本体の行動ゲージを35%進め、スキル3とスキル4のクールタイムを1ターン短縮する。",
    target: "SELF", cooldownTurns: 4,
    effects: [],
  },
];

const DEBUFF_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "crimoark_debuff_s1", name: "模造侵蝕刃",
    description: "敵単体に攻撃力0.80倍のダメージを与え、防御力を50%低下させる(2ターン)。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.80 },
      { kind: "DEBUFF", stat: "def", amount: 0.50, durationTurns: 2, chance: 1 },
    ],
  },
  {
    id: "crimoark_debuff_s2", name: "模造災波",
    description: "敵全体に攻撃力0.65倍のダメージを与え、行動ゲージを20%減少させ、70%で攻撃力を50%低下させる(2ターン)。",
    target: "ALL_ENEMIES", cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.65 },
      { kind: "GAUGE", amount: -0.20 },
      { kind: "DEBUFF", stat: "atk", amount: 0.50, durationTurns: 2, chance: 0.70 },
    ],
  },
  {
    id: "crimoark_debuff_s3", name: "模造侵食",
    description: "敵全体に攻撃力0.40倍のダメージを与え、強化効果を1個解除する。"
      + "さらに強化不可(2ターン)・回復阻害(2ターン)を与え、行動ゲージを25%減少させる。",
    target: "ALL_ENEMIES", cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: 0.40 },
      { kind: "STRIP", count: 1, chance: 1 },
      { kind: "STATUS", status: "BUFF_BLOCK", durationTurns: 2, chance: 1, fixedDuration: true },
      { kind: "HEAL_BLOCK", healMultiplier: 0, durationTurns: 2, chance: 1, fixedDuration: true },
      { kind: "GAUGE", amount: -0.25 },
    ],
  },
];

/** 分身の型ごとの実効ステータスとスキル。HPだけは生成時に決まるのでここには無い */
export const CRIMOARK_CLONE_PROFILE: Record<CrimoarkCloneRole, {
  templateId: string;
  /** 戦闘中の表示名。**札の幅に収まる短さにしてある** */
  displayName: string;
  atk: number;
  def: number;
  spd: number;
  criRate: number;
  criDmg: number;
  accuracy: number;
  resistance: number;
  skills: [Skill, Skill, Skill];
}> = {
  ATTACK: {
    templateId: CRIMOARK_ATTACK_TEMPLATE_ID, displayName: "クリモアーク・攻",
    atk: 8_500, def: 2_100, spd: 220, criRate: 0.40, criDmg: 1.90, accuracy: 0.65, resistance: 0.40,
    skills: ATTACK_SKILLS,
  },
  SUPPORT: {
    templateId: CRIMOARK_SUPPORT_TEMPLATE_ID, displayName: "クリモアーク・援",
    atk: 5_500, def: 2_700, spd: 230, criRate: 0.30, criDmg: 1.80, accuracy: 0.65, resistance: 0.40,
    skills: SUPPORT_SKILLS,
  },
  DEBUFF: {
    templateId: CRIMOARK_DEBUFF_TEMPLATE_ID, displayName: "クリモアーク・蝕",
    atk: 6_000, def: 2_300, spd: 225, criRate: 0.30, criDmg: 1.80, accuracy: 0.75, resistance: 0.40,
    skills: DEBUFF_SKILLS,
  },
};

/* ========================================================================
 * 図鑑の原型。**召喚にも図鑑にも出さない**(古代の魔人などと同じ扱い)
 *
 * 実際に戦う時のステータスとスキルは階のデータと engine が決めるので、
 * ここの `baseStats` は「その場に何も無い」を避けるための土台でしかない。
 * ===================================================================== */

function templateOf(templateId: string, baseName: string, emoji: string, role: string, skills: [Skill, Skill, Skill]): MonsterTemplate {
  return {
    templateId,
    baseName,
    emoji,
    role,
    baseStats: { hp: 1600, atk: 230, def: 110, spd: 125, criRate: 0.30, criDmg: 1.80, resistance: 0.30, accuracy: 0.30 },
    skill1: skills[0],
    skill2Variants: [skills[1]],
    skill3Variants: [skills[2]],
    dexNote: "試練の塔100階にのみ現れる。召喚では手に入らない。",
  };
}

export const CRIMOARK: MonsterTemplate = templateOf(
  CRIMOARK_TEMPLATE_ID, "クリモアーク", "🌌", "ボス",
  [CRIMOARK_S1, CRIMOARK_S2, CRIMOARK_S3],
);
export const CRIMOARK_ATTACK: MonsterTemplate = templateOf(
  CRIMOARK_ATTACK_TEMPLATE_ID, "クリモアーク・攻", "⚔️", "アタッカー", ATTACK_SKILLS,
);
export const CRIMOARK_SUPPORT: MonsterTemplate = templateOf(
  CRIMOARK_SUPPORT_TEMPLATE_ID, "クリモアーク・援", "✨", "サポート", SUPPORT_SKILLS,
);
export const CRIMOARK_DEBUFF: MonsterTemplate = templateOf(
  CRIMOARK_DEBUFF_TEMPLATE_ID, "クリモアーク・蝕", "🕸️", "デバッファー", DEBUFF_SKILLS,
);

/** 本体の3枠。階のデータがそのまま使う */
export const CRIMOARK_SKILLS: [Skill, Skill, Skill] = [CRIMOARK_S1, CRIMOARK_S2, CRIMOARK_S3];
