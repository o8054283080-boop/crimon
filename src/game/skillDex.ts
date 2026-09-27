import { ELEMENTS, type Element } from "../core/element.js";
import type { MonsterDefinition } from "../core/monster.js";
import {
  MAX_SKILL_LEVEL, STATUS_EFFECT_CATEGORY, computeLeveledSkill, describeSkillLines,
  type Skill, type SkillEffect,
} from "../core/skill.js";
import { skillTags, type SkillTag } from "../core/skillTags.js";
import { isCrim } from "./crim.js";

/**
 * スキル図鑑。**欲しい効果を持つスキルを探して、誰が持っているかを見る**ための索引。
 *
 * ## 別のスキル表を持たない
 *
 * 索引は図鑑に並ぶモンスター定義(`MONSTER_DEX_ENTRIES` 相当を呼ぶ側から渡す)の
 * `skills[0..2]` をそのまま読んで作る。スキル調整で定義が変われば、
 * 次に開いた時の索引もそのまま変わる。**図鑑側だけ古い数字が残る場所が無い。**
 *
 * ## 効果の札は SkillEffect から作る
 *
 * 「防御DOWN」「回復」などの札は、`skill.effects`(とLv2〜5の中身、1撃ごとの効果)を
 * 種類ごとに読んで付ける。**スキル名や手書きの説明文は見ない。**
 * 説明文に「防御DOWN」と書いてあっても、効果に DEBUFF(def) が無ければ札は付かない。
 * フリーワード検索も、手書きの説明文ではなく効果から作った文(`describeSkillLines`)と
 * 札の名前を相手にする。
 *
 * ## まとめ方
 *
 * 同じスキルID・同じ枠は1枚にまとめ、持っているモンスター(属性違いを含む)を並べる。
 * **同じIDの中身はどのモンスターでも同じ**(属性差は能力値で、スキルには無い)。
 * 名前が同じでもIDが違うスキル(ドラゴンの属性違いの技)はまとめない。
 */

export type SkillDexSlot = 0 | 1 | 2;
export const SKILL_DEX_SLOTS: readonly SkillDexSlot[] = [0, 1, 2];
export const SKILL_DEX_SLOT_LABEL: Record<SkillDexSlot, string> = { 0: "スキル1", 1: "スキル2", 2: "スキル3" };

/* ============================================================ 効果の札 */

/**
 * 検索用の効果の札。**今のゲームに実在する効果だけ**を並べてある
 * (クリ率DOWNのように、効果の型はあっても誰も持たないものは作らない)。
 */
export type SkillEffectTag =
  /* 攻撃 */
  | "attack" | "single_attack" | "aoe_attack" | "multi_hit" | "splash" | "ignore_defense" | "extra_turn" | "coop_attack"
  /* 弱体 */
  | "atk_down" | "def_down" | "spd_down" | "crit_taken_up" | "stun" | "poison" | "burn" | "curse"
  | "heal_block" | "buff_block" | "skill_lock" | "taunt" | "blind" | "gauge_down" | "gauge_drain"
  | "cooldown_extend" | "strip" | "steal_buff"
  /* 強化・支援 */
  | "heal" | "lifesteal" | "regen" | "shield" | "atk_up" | "def_up" | "spd_up" | "crit_rate_up" | "crit_dmg_up"
  | "damage_up" | "immunity" | "invincible" | "revive" | "endure" | "reflect" | "focus" | "gauge_up"
  | "cooldown_reduce" | "mitigate" | "protect" | "counter" | "cleanse"
  /* その他 */
  | "passive";

export interface SkillEffectTagInfo {
  label: string;
  /** フリーワードで引ける別の言い方(正規化の前の形で書く) */
  aliases: readonly string[];
}

export const SKILL_EFFECT_TAG_INFO: Record<SkillEffectTag, SkillEffectTagInfo> = {
  attack: { label: "攻撃", aliases: ["ダメージ"] },
  single_attack: { label: "単体攻撃", aliases: [] },
  aoe_attack: { label: "全体攻撃", aliases: [] },
  multi_hit: { label: "多段攻撃", aliases: ["連撃", "複数回攻撃"] },
  splash: { label: "拡散", aliases: ["巻き込み"] },
  ignore_defense: { label: "防御無視", aliases: ["防御貫通"] },
  extra_turn: { label: "追加ターン", aliases: ["再行動", "もう一度行動"] },
  coop_attack: { label: "協力攻撃", aliases: [] },
  atk_down: { label: "攻撃DOWN", aliases: ["攻撃ダウン", "攻撃低下", "攻撃力低下", "攻撃デバフ"] },
  def_down: { label: "防御DOWN", aliases: ["防御ダウン", "防御低下", "防御力低下", "防御デバフ"] },
  spd_down: { label: "速度DOWN", aliases: ["速度ダウン", "速度低下", "素早さ低下", "スピードダウン"] },
  crit_taken_up: { label: "被クリ率UP", aliases: ["被クリティカル率アップ", "被会心"] },
  stun: { label: "気絶", aliases: ["スタン", "行動不能"] },
  poison: { label: "毒", aliases: [] },
  burn: { label: "火傷", aliases: ["やけど"] },
  curse: { label: "呪い", aliases: [] },
  heal_block: { label: "回復阻害", aliases: ["治癒阻害", "回復封じ", "回復不可"] },
  buff_block: { label: "強化阻害", aliases: ["強化不可", "バフ阻害"] },
  skill_lock: { label: "スキル封印", aliases: ["スキル使用不可", "封印"] },
  taunt: { label: "挑発", aliases: [] },
  blind: { label: "暗闇", aliases: ["くらやみ", "命中低下"] },
  gauge_down: { label: "行動ゲージDOWN", aliases: ["ゲージダウン", "ゲージ減少", "ゲージ低下", "ゲージDOWN"] },
  gauge_drain: { label: "ゲージ吸収", aliases: ["行動ゲージ吸収"] },
  cooldown_extend: { label: "CT延長", aliases: ["クールタイム延長"] },
  strip: { label: "強化解除", aliases: ["バフ解除", "有利な効果を解除", "剥がす"] },
  steal_buff: { label: "強化奪取", aliases: ["強化を奪う", "バフ奪取"] },
  heal: { label: "回復", aliases: ["ヒール", "HP回復"] },
  lifesteal: { label: "吸血", aliases: ["HP吸収", "ドレイン", "回復"] },
  regen: { label: "継続回復", aliases: ["リジェネ", "回復"] },
  shield: { label: "シールド", aliases: ["バリア", "盾"] },
  atk_up: { label: "攻撃UP", aliases: ["攻撃アップ", "攻撃上昇", "攻撃力上昇", "攻撃バフ"] },
  def_up: { label: "防御UP", aliases: ["防御アップ", "防御上昇", "防御力上昇", "防御バフ"] },
  spd_up: { label: "速度UP", aliases: ["速度アップ", "速度上昇", "素早さ上昇", "スピードアップ"] },
  crit_rate_up: { label: "クリ率UP", aliases: ["クリティカル率アップ", "会心率アップ", "クリ率上昇"] },
  crit_dmg_up: { label: "クリダメUP", aliases: ["クリティカルダメージアップ", "会心ダメージアップ", "クリダメ上昇"] },
  damage_up: { label: "与ダメージUP", aliases: ["与ダメージアップ", "与ダメ上昇"] },
  immunity: { label: "免疫", aliases: ["状態異常無効", "弱体無効"] },
  invincible: { label: "無敵", aliases: [] },
  revive: { label: "蘇生", aliases: ["復活"] },
  endure: { label: "我慢", aliases: ["踏みとどまる", "耐える"] },
  reflect: { label: "反射", aliases: ["ダメージ反射"] },
  focus: { label: "ターゲット集中", aliases: ["狙われやすい"] },
  gauge_up: { label: "行動ゲージUP", aliases: ["ゲージアップ", "ゲージ上昇", "ゲージ増加", "ゲージUP"] },
  cooldown_reduce: { label: "CT短縮", aliases: ["クールタイム短縮"] },
  mitigate: { label: "ダメージ軽減", aliases: ["被ダメージ軽減", "被ダメ軽減"] },
  protect: { label: "かばう", aliases: ["肩代わり", "保護"] },
  counter: { label: "反撃", aliases: ["カウンター"] },
  cleanse: { label: "弱体解除", aliases: ["デバフ解除", "状態異常解除"] },
  passive: { label: "パッシブ", aliases: ["常時", "自動発動"] },
};

/** 絞り込みの群れ。画面の見出しと並びはこの順 */
export const SKILL_EFFECT_TAG_GROUPS: readonly { label: string; tags: readonly SkillEffectTag[] }[] = [
  { label: "攻撃", tags: ["attack", "single_attack", "aoe_attack", "multi_hit", "splash", "ignore_defense", "extra_turn", "coop_attack"] },
  {
    label: "弱体",
    tags: ["atk_down", "def_down", "spd_down", "crit_taken_up", "stun", "poison", "burn", "curse", "heal_block", "buff_block",
      "skill_lock", "taunt", "blind", "gauge_down", "gauge_drain", "cooldown_extend", "strip", "steal_buff"],
  },
  {
    label: "強化・支援",
    tags: ["heal", "lifesteal", "regen", "shield", "atk_up", "def_up", "spd_up", "crit_rate_up", "crit_dmg_up", "damage_up",
      "immunity", "invincible", "revive", "endure", "reflect", "focus", "gauge_up", "cooldown_reduce", "mitigate", "protect",
      "counter", "cleanse"],
  },
  { label: "その他", tags: ["passive"] },
];

const DEBUFF_STAT_TAG = { atk: "atk_down", def: "def_down", spd: "spd_down" } as const;
const BUFF_STAT_TAG = { atk: "atk_up", def: "def_up", spd: "spd_up", criRate: "crit_rate_up", criDmg: "crit_dmg_up" } as const;
const STATUS_TAG = {
  BUFF_BLOCK: "buff_block", SKILL_LOCK: "skill_lock", TAUNT: "taunt", CRIT_RATE_UP: "crit_taken_up",
  INVINCIBLE: "invincible", REVIVE: "revive", ENDURE: "endure", REFLECT: "reflect", FOCUS: "focus",
} as const;

/** 効果1つから札を出す。1撃ごとの効果(`perHitEffects`)の中まで降りる */
function tagsOfEffect(effect: SkillEffect, out: Set<SkillEffectTag>): void {
  switch (effect.kind) {
    case "DAMAGE":
      out.add("attack");
      if ((effect.hits ?? 1) > 1) out.add("multi_hit");
      if (effect.ignoreDefense || effect.ignoreDefenseRatio || effect.conditionalIgnoreDefense
        || effect.targetHpIgnoreDefense?.length || effect.debuffIgnoreDefense) out.add("ignore_defense");
      for (const inner of effect.perHitEffects ?? []) tagsOfEffect(inner, out);
      break;
    case "FLAT_DAMAGE": case "MAX_HP_DAMAGE": out.add("attack"); break;
    case "SPLASH": out.add("splash"); break;
    case "COOP_ATTACK": out.add("coop_attack"); break;
    case "DEBUFF": {
      const tag = DEBUFF_STAT_TAG[effect.stat as keyof typeof DEBUFF_STAT_TAG];
      if (tag) out.add(tag);
      break;
    }
    case "BUFF": {
      const tag = BUFF_STAT_TAG[effect.stat as keyof typeof BUFF_STAT_TAG];
      if (tag) out.add(tag);
      break;
    }
    case "STATUS": {
      const tag = STATUS_TAG[effect.status as keyof typeof STATUS_TAG];
      if (tag) out.add(tag);
      break;
    }
    case "STUN": out.add("stun"); break;
    case "POISON": out.add("poison"); break;
    case "BURN": out.add("burn"); break;
    case "CURSE": case "CONVERT_CURSES": case "DETONATE_CURSES": out.add("curse"); break;
    case "HEAL_BLOCK": out.add("heal_block"); break;
    case "BLIND": out.add("blind"); break;
    case "COOLDOWN_EXTEND": out.add("cooldown_extend"); break;
    case "STRIP": out.add("strip"); break;
    case "STEAL_BUFF": out.add("steal_buff"); out.add("strip"); break;
    case "GAUGE":
      /*
       * **増やすか減らすかは符号と吸収で決まる**(`skillTags.ts` と同じ考え方)。
       * 吸収は相手から減らして自分へ足すので、「ゲージDOWN」と「ゲージ吸収」の両方に出す。
       */
      if (effect.drain) { out.add("gauge_down"); out.add("gauge_drain"); } else if (effect.amount < 0) out.add("gauge_down");
      else if (effect.amount > 0) out.add("gauge_up");
      break;
    case "GAUGE_ON_HIT": out.add("gauge_up"); break;
    case "HEAL": out.add("heal"); break;
    case "LIFESTEAL": out.add("lifesteal"); break;
    case "REGEN": out.add("regen"); break;
    case "SHIELD": out.add("shield"); break;
    case "IMMUNITY": out.add("immunity"); break;
    case "DAMAGE_BOOST": out.add("damage_up"); break;
    case "COOLDOWN_REDUCE": out.add("cooldown_reduce"); break;
    case "MITIGATE": out.add("mitigate"); break;
    case "PROTECT": out.add("protect"); break;
    case "COUNTER_STANCE": out.add("counter"); break;
    case "CLEANSE": out.add("cleanse"); break;
    case "SELF_DAMAGE": break;
  }
}

/**
 * スキル1つの効果の札。**Lv1〜5のどこかで持つ効果は全部拾う**
 * (Lv5で反射が付く、Lv3でゲージ上昇が付く、のような技を取りこぼさない)。
 * パッシブは効果の配列を持たないので「パッシブ」の札だけ。
 */
export function skillEffectTags(skill: Skill): ReadonlySet<SkillEffectTag> {
  const out = new Set<SkillEffectTag>();
  if (skill.passive) {
    out.add("passive");
    return out;
  }
  for (let level = 1; level <= MAX_SKILL_LEVEL; level += 1) {
    for (const effect of computeLeveledSkill(skill, level).effects) tagsOfEffect(effect, out);
  }
  if (skill.extraTurn || skill.extraTurnOnKill) out.add("extra_turn");
  // 単体か全体かは技の対象で決まる(`skillTags` の single / aoe と同じ)
  if (out.has("attack") || out.has("splash")) {
    if (skill.target === "SINGLE_ENEMY") out.add("single_attack");
    if (skill.target === "ALL_ENEMIES") out.add("aoe_attack");
  }
  return out;
}

/** STATUS の中身が強化か弱体か(図鑑の色分けなどに使う)。既存の分類表をそのまま使う */
export function statusCategoryOf(status: keyof typeof STATUS_EFFECT_CATEGORY): "BUFF" | "DEBUFF" {
  return STATUS_EFFECT_CATEGORY[status];
}

/* ============================================================ 対象 */

/** 対象の絞り込み。`skillTags.ts` の「誰に向く技か」の札をそのまま使う */
export type SkillDexTarget = "single" | "aoe" | "self_target" | "ally_target" | "enemy_target";
export const SKILL_DEX_TARGETS: readonly SkillDexTarget[] = ["single", "aoe", "enemy_target", "ally_target", "self_target"];
export const SKILL_DEX_TARGET_LABEL: Record<SkillDexTarget, string> = {
  single: "単体", aoe: "全体", enemy_target: "敵", ally_target: "味方", self_target: "自分",
};

/* ============================================================ 索引 */

export interface SkillDexEntry {
  /** 枠とスキルIDの組。同じIDでも枠が違えば別の札 */
  key: string;
  slot: SkillDexSlot;
  /** 実際にゲームで使っているスキル定義そのもの(複製しない) */
  skill: Skill;
  /** このスキルを持つモンスター(図鑑の並び順) */
  holders: readonly MonsterDefinition[];
  isPassive: boolean;
  /**
   * クリエイトの移し元にできるか。**`monsterCreate.ts` と同じ決まり**:
   * スキル2・3の枠で、パッシブではなく、持ち主にクリム以外がいること
   * (`tests/skillDex.test.ts` が `creatableSkills` / `checkMonsterCreate` と突き合わせている)
   */
  creatable: boolean;
  effectTags: ReadonlySet<SkillEffectTag>;
  targetTags: ReadonlySet<SkillTag>;
  /** フリーワード検索の相手(正規化済み) */
  searchText: string;
}

/** 効果から作った文(Lv1〜5)。手書きの説明文は入れない */
function effectLinesAllLevels(skill: Skill): string[] {
  const lines = new Set<string>();
  if (skill.passive) {
    for (let level = 1; level <= MAX_SKILL_LEVEL; level += 1) {
      for (const line of describeSkillLines({ ...skill, passiveLevel: level })) lines.add(line);
    }
    return [...lines];
  }
  for (let level = 1; level <= MAX_SKILL_LEVEL; level += 1) {
    for (const line of describeSkillLines(computeLeveledSkill(skill, level))) lines.add(line);
  }
  return [...lines];
}

export function buildSkillDexIndex(entries: readonly MonsterDefinition[]): SkillDexEntry[] {
  const byKey = new Map<string, { slot: SkillDexSlot; skill: Skill; holders: MonsterDefinition[] }>();
  for (const dex of entries) {
    SKILL_DEX_SLOTS.forEach((slot) => {
      const skill = dex.skills[slot];
      if (!skill) return;
      const key = `${slot}:${skill.id}`;
      const found = byKey.get(key);
      if (found) found.holders.push(dex);
      else byKey.set(key, { slot, skill, holders: [dex] });
    });
  }
  return [...byKey.entries()].map(([key, { slot, skill, holders }]) => {
    const isPassive = skill.passive !== undefined || skill.automatic === true;
    const effectTags = skillEffectTags(skill);
    const creatable = slot !== 0 && !isPassive && holders.some((dex) => !isCrim({ dexId: dex.id }));
    const names = new Set(holders.flatMap((dex) => [dex.name, dex.name.replace(/\[.*\]$/, "")]));
    const tagWords = [...effectTags].flatMap((tag) => [SKILL_EFFECT_TAG_INFO[tag].label, ...SKILL_EFFECT_TAG_INFO[tag].aliases]);
    const searchText = normalizeSkillSearch([skill.name, ...names, ...effectLinesAllLevels(skill), ...tagWords].join(" "));
    return { key, slot, skill, holders, isPassive, creatable, effectTags, targetTags: skillTags(skill), searchText };
  });
}

/* ============================================================ 検索 */

/**
 * 表記の揺れを1つの形へ寄せる。**索引と検索語の両方に同じものを掛ける。**
 *
 * 全角・半角、ひらがな・カタカナ、「ダウン/低下/DOWN」、「攻撃力/攻撃」などを揃える。
 * 長い言い方から先に置き換える(「行動ゲージ」を「ゲージ」より先に)。
 */
const CANONICAL: readonly [RegExp, string][] = [
  [/クリティカルダメージ|会心ダメージ|クリダメ/g, "クリダメ"],
  [/クリティカル率|会心率|クリ率/g, "クリ率"],
  [/クリティカル|会心/g, "クリティカル"],
  [/スキル使用不可|スキル封印/g, "スキル封印"],
  [/治癒阻害|回復阻害|回復封じ|回復不可/g, "回復阻害"],
  [/強化不可|強化阻害/g, "強化阻害"],
  [/クールタイム/g, "ct"],
  [/行動ゲージ/g, "ゲージ"],
  [/攻撃力/g, "攻撃"],
  [/防御力/g, "防御"],
  [/素早さ|スピード|速さ/g, "速度"],
  [/気絶|スタン/g, "スタン"],
  [/ヤケド/g, "火傷"],
  [/クラヤミ/g, "暗闇"],
  [/ダウン|低下|down|減少/g, "down"],
  [/アップ|上昇|up|増加/g, "up"],
];

function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

export function normalizeSkillSearch(text: string): string {
  let out = toKatakana(text.normalize("NFKC").toLowerCase());
  out = out.replace(/[−–]/g, "-");
  for (const [pattern, to] of CANONICAL) out = out.replace(pattern, to);
  // 区切りは探す時に邪魔になるだけ(「防御 DOWN」「防御・DOWN」を「防御down」と同じに)
  return out.replace(/[\s・、。,.:：/()（）「」]+/g, "");
}

/* ============================================================ 絞り込み */

export interface SkillDexFilter {
  slot: SkillDexSlot;
  query: string;
  effects: SkillEffectTag[];
  elements: Element[];
  targets: SkillDexTarget[];
  /** クリエイトの移し元にできるスキルだけ */
  creatableOnly: boolean;
}

/**
 * 初めて開いた時の形。**スキル2から見せる。**
 * この図鑑のいちばんの用途はクリエイトの素材探しで、移し替えられるのはスキル2・3。
 * クリエイト画面の枠の並び(スキル2 → スキル3)とも揃う。
 */
export const EMPTY_SKILL_DEX_FILTER: SkillDexFilter = {
  slot: 1, query: "", effects: [], elements: [], targets: [], creatableOnly: false,
};

/** 枠と検索語を除いた、選んでいる条件の数(絞り込みボタンの数字) */
export function skillDexFilterCount(filter: SkillDexFilter): number {
  return filter.effects.length + filter.elements.length + filter.targets.length + (filter.creatableOnly ? 1 : 0);
}

/** 枠はそのまま、検索語と条件だけを外す */
export function resetSkillDexFilter(filter: SkillDexFilter): SkillDexFilter {
  return { ...EMPTY_SKILL_DEX_FILTER, slot: filter.slot };
}

export interface SkillDexResult {
  entry: SkillDexEntry;
  /** 属性で絞った時は、その属性の持ち主だけ */
  holders: readonly MonsterDefinition[];
}

/**
 * 絞り込む。
 *
 * - 枠は必ず1つ(スキル1・2・3の切り替え)
 * - 検索語は空白で区切ると**すべて**を含むもの
 * - 効果は選んだものを**すべて**持つもの(「防御DOWN」と「全体攻撃」で両方持つ技)
 * - 属性・対象は選んだものの**どれか**
 */
/**
 * 効果の名前・別名(正規化済み) → その名前で呼ばれる札。
 *
 * **検索語が効果の名前そのものなら、文字ではなく札で判定する。**
 * 文字で探すと「回復」が回復阻害(「回復を受けられない」)にも当たり、
 * 「防御DOWN」が説明の書き方しだいで当たったり外れたりする。札は効果から作るので嘘をつかない。
 */
const TAG_WORDS: ReadonlyMap<string, ReadonlySet<SkillEffectTag>> = (() => {
  const map = new Map<string, Set<SkillEffectTag>>();
  for (const [tag, info] of Object.entries(SKILL_EFFECT_TAG_INFO) as [SkillEffectTag, SkillEffectTagInfo][]) {
    for (const word of [info.label, ...info.aliases]) {
      const key = normalizeSkillSearch(word);
      const set = map.get(key) ?? new Set<SkillEffectTag>();
      set.add(tag);
      map.set(key, set);
    }
  }
  return map;
})();

/** 検索語1つがその札に当たるか。効果の名前なら札で、それ以外(スキル名・モンスター名・数字)は文字で */
function matchesWord(entry: SkillDexEntry, word: string): boolean {
  const tags = TAG_WORDS.get(word);
  if (tags) return [...tags].some((tag) => entry.effectTags.has(tag));
  return entry.searchText.includes(word);
}

/**
 * 検索語を語に分ける。**隣り合う語をつなぐと効果の名前になるなら、1語として扱う**
 * (「防御 DOWN」を「防御」と「DOWN」の別々の文字探しにすると、
 * 攻撃DOWNと防御UPを持つ技まで当たる)。
 */
function queryWords(query: string): string[] {
  const raw = query.split(/[\s　]+/).map(normalizeSkillSearch).filter(Boolean);
  const words: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const joined = raw[i] + (raw[i + 1] ?? "");
    if (i + 1 < raw.length && TAG_WORDS.has(joined)) {
      words.push(joined);
      i += 1;
    } else words.push(raw[i]);
  }
  return words;
}

export function filterSkillDex(index: readonly SkillDexEntry[], filter: SkillDexFilter): SkillDexResult[] {
  const words = queryWords(filter.query);
  const out: SkillDexResult[] = [];
  for (const entry of index) {
    if (entry.slot !== filter.slot) continue;
    if (filter.creatableOnly && !entry.creatable) continue;
    if (!words.every((word) => matchesWord(entry, word))) continue;
    if (!filter.effects.every((tag) => entry.effectTags.has(tag))) continue;
    if (filter.targets.length > 0 && !filter.targets.some((tag) => entry.targetTags.has(tag))) continue;
    const holders = filter.elements.length > 0 ? entry.holders.filter((dex) => filter.elements.includes(dex.element)) : entry.holders;
    if (holders.length === 0) continue;
    out.push({ entry, holders });
  }
  return out;
}

/** その枠に実在する効果・属性だけを札にする。押しても0件になる札は出さない */
export function skillDexFacets(index: readonly SkillDexEntry[], slot: SkillDexSlot): { effects: Set<SkillEffectTag>; elements: Element[] } {
  const effects = new Set<SkillEffectTag>();
  const elements = new Set<Element>();
  for (const entry of index) {
    if (entry.slot !== slot) continue;
    entry.effectTags.forEach((tag) => effects.add(tag));
    entry.holders.forEach((dex) => elements.add(dex.element));
  }
  return { effects, elements: ELEMENTS.filter((element) => elements.has(element)) };
}

export function toggleSkillDexValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}
