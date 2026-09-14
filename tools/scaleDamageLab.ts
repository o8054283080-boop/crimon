/**
 * HP比例・DEF比例スキルの一撃ぶんを、敵DEFごとに測る。
 *
 * 勝率ではなく**素のダメージ**を見る道具。比例係数を触った時に
 * 「どの技がどれだけ動いたか」を1発単位で確かめるために要る。
 *
 * 味方は Battle Lab の型紙(★6 Lv60 スキルMAX 能力100 装備+15)を通すので、
 * 装備の値付けを直せばここの数字も自動で追随する。
 *
 *   npx tsx tools/scaleDamageLab.ts --gear STRONG
 *   npx tsx tools/scaleDamageLab.ts --who phoenix       # 1体だけ
 *   npx tsx tools/scaleDamageLab.ts --defdown           # 防御75%低下も出す
 */
import { calcDamage } from "../src/battle/damage.js";
import { applyStatEffect, createBattleUnit } from "../src/battle/unit.js";
import type { BattleUnit } from "../src/battle/unit.js";
import { computeLeveledSkill, MAX_SKILL_LEVEL, type DamageEffect } from "../src/core/skill.js";
import { DEF_DOWN } from "../src/core/statusValues.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade, PresetName } from "./battleLab/types.js";

const ENEMY_DEFS = [0, 1_000, 2_500, 3_000];

interface Subject {
  key: string;
  label: string;
  templateId: string;
  element: AllySpec["element"];
  /** 4枠に耐久%を置いた型紙と、クリダメを置いた型紙 */
  endure: PresetName;
  crit: PresetName;
  /** 見たいスキル。名前で引く(属性で枠が入れ替わるため) */
  skills: string[];
}

const SUBJECTS: Subject[] = [
  {
    key: "phoenix", label: "フェニックス(火)", templateId: "phoenix", element: "FIRE",
    endure: "HP_SCALE_ENDURE", crit: "HP_SCALE_CRIT",
    skills: ["生命の火", "炎の翼", "灼熱転生"],
  },
  {
    key: "behemoth_fire", label: "ベヒモス(火)", templateId: "behemoth", element: "FIRE",
    endure: "HP_SCALE_ENDURE", crit: "HP_SCALE_CRIT",
    skills: ["巨獣の一撃", "巨体の圧力", "天地崩壊"],
  },
  {
    key: "behemoth_dark", label: "ベヒモス(闇)", templateId: "behemoth", element: "DARK",
    endure: "HP_SCALE_ENDURE", crit: "HP_SCALE_CRIT",
    skills: ["巨獣の一撃", "大地踏み", "滅界の咆哮"],
  },
  {
    key: "treant", label: "トレント(闇)", templateId: "treant", element: "DARK",
    endure: "HP_SCALE_ENDURE", crit: "HP_SCALE_CRIT",
    skills: ["えだのひとふり", "ようぶんきゅうしゅう", "ソウルルート"],
  },
  {
    key: "mimic", label: "ミミック(闇)", templateId: "mimic", element: "DARK",
    endure: "HP_SCALE_ENDURE", crit: "HP_SCALE_CRIT",
    skills: ["噛みつく宝箱", "呪われた財宝", "強欲の魔箱"],
  },
  {
    key: "golem", label: "ゴーレム(闇)", templateId: "golem", element: "DARK",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["たいあたり", "オブシディアンクラッシュ"],
  },
  {
    key: "golem_fire", label: "ゴーレム(火)", templateId: "golem", element: "FIRE",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["たいあたり", "岩石落とし"],
  },
  {
    key: "golem_rush", label: "ゴーレム(草)", templateId: "golem", element: "GRASS",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["たいあたり", "たいあたりラッシュ"],
  },
  {
    key: "shellturtle", label: "シェルタートル(闇)", templateId: "shellturtle", element: "DARK",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["こうら突進", "アビスシェル"],
  },
  {
    key: "nemesis", label: "ネメシス(光)", templateId: "nemesis", element: "LIGHT",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["ラストジャッジメント"],
  },
  {
    key: "nemesis_dark", label: "ネメシス(闇)", templateId: "nemesis", element: "DARK",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["血のいけにえ"],
  },
  {
    key: "knight", label: "グレイヴナイト(闇)", templateId: "knight", element: "DARK",
    endure: "DEF_SCALE_ENDURE", crit: "DEF_SCALE_CRIT",
    skills: ["なぎはらい"],
  },
  /*
   * 比較用の純アタッカー。**比例型がここを食っていないか**を見る。
   * 闇ドラゴンのS3は防御無視なので、DEF比例の対象ではない(別枠で読む)。
   */
  {
    key: "dragon_dark", label: "闇ドラゴン(純攻撃)", templateId: "dragon", element: "DARK",
    endure: "MAX_ATTACKER_ATK4", crit: "MAX_ATTACKER",
    skills: ["破壊の流星"],
  },
];

/** 測るためだけの相手。DEFだけを動かし、他は当たり判定に関係しない値で固定する */
function makeDummy(def: number, element: AllySpec["element"]): BattleUnit {
  /*
   * **的の属性は、殴る側と同じにする。**
   *
   * sw方式では相性が倍率ではなく**クリ率とかすり**に出る。不利属性の相手を
   * 置くと、会心を固定したはずの一撃が50%でかすりに化け、
   * 「クリの方が非クリより弱い」という読めない表が出る(実際に出した)。
   * 同属性なら等倍・かすり無しなので、見たい比例係数の差だけが残る。
   */
  const unit = createBattleUnit({
    id: "dummy", templateId: "dummy", name: "的", element, color: "#888", role: "的", emoji: "🎯",
    stats: { hp: 10_000_000, atk: 1, def, spd: 100, criRate: 0, criDmg: 1.5, accuracy: 0, resistance: 0 },
    skills: [],
  } as unknown as Parameters<typeof createBattleUnit>[0], "ENEMY", "dummy");
  return unit;
}

const argv = process.argv.slice(2);
const gearIndex = argv.indexOf("--gear");
const gear = (gearIndex >= 0 ? argv[gearIndex + 1] : "STRONG") as GearGrade;
const whoIndex = argv.indexOf("--who");
const only = whoIndex >= 0 ? argv[whoIndex + 1] : undefined;
const withDefDown = argv.includes("--defdown");
/*
 * 依頼で示された「やり込んだ実戦フェニックス」の想定値で測るモード。
 * HP75,000 / ATK1,800 / クリダメ300%。装備の引き次第で上下するので、
 * **STRONG装備の実測と並べて読む**ための基準点として置く。
 */
const assumed = argv.includes("--assume");

/**
 * 一撃ぶんのダメージ。
 *
 * **乱数を潰して非クリ/クリの両方を出す。** 会心は確率なので、
 * 何度も回して平均を取ると「会心が何回出たか」の運が混ざる。
 * ここで見たいのは技の素の強さなので、当たる側を固定する。
 */
function hitDamage(attacker: BattleUnit, defender: BattleUnit, effect: DamageEffect, crit: boolean): number {
  // rng=0 なら常に会心、rng=1 なら決して会心しない
  const rng = () => (crit ? 0 : 0.999999);
  const hits = Math.max(1, Math.floor(effect.hits ?? 1));
  /*
   * **多段は1発ずつ解決して合計を出す。**比例部分が各ヒットに乗るのか
   * スキル全体で1回なのかが、ここに素直に出る(実際は各ヒットに乗る)。
   */
  let total = 0;
  for (let i = 0; i < hits; i += 1) total += calcDamage(attacker, defender, { ...effect, hits: 1 }, rng).damage;
  return Math.round(total);
}

function unitOf(spec: AllySpec, seed: number): BattleUnit {
  // 戦闘を回さず、1体ぶんの戦闘単位だけを本編と同じ道で組む
  return createBattleUnit(buildAlly(spec, mulberry32(seed), gear), "PLAYER", "subject");
}

for (const subject of SUBJECTS) {
  if (only && subject.key !== only) continue;
  console.log(`\n=== ${subject.label} / ${gear} ===`);
  const endureLabel = subject.endure === "MAX_ATTACKER_ATK4" ? "4番攻撃%" : "4番耐久%";
  for (const [mode, preset] of [[endureLabel, subject.endure], ["4番クリダメ", subject.crit]] as const) {
    const unit = unitOf({
      label: subject.label, templateId: subject.templateId, element: subject.element, preset,
      ...(assumed ? { statOverrides: { hp: 75_000, atk: 1_800, criDmg: 3.0 } } : {}),
    }, 4242);
    const stats = unit.def.stats;
    console.log(`${mode}: HP${Math.round(unit.maxHp)} ATK${Math.round(stats.atk)} DEF${Math.round(stats.def)} `
      + `SPD${Math.round(stats.spd)} クリ率${Math.round(stats.criRate * 100)}% クリダメ${Math.round(stats.criDmg * 100)}%`);

    for (const name of subject.skills) {
      const skill = unit.def.skills.find((s) => s?.name === name);
      if (!skill) { console.log(`  (${name} が見つからない)`); continue; }
      const leveled = computeLeveledSkill(skill, MAX_SKILL_LEVEL);
      const effect = leveled.effects.find((e): e is DamageEffect => e.kind === "DAMAGE");
      if (!effect) { console.log(`  (${name} に攻撃が無い)`); continue; }
      const scale = effect.hpCoefficient !== undefined ? `HP×${effect.hpCoefficient}`
        : effect.defCoefficient !== undefined ? `DEF×${effect.defCoefficient}` : "比例なし";
      const hits = Math.max(1, Math.floor(effect.hits ?? 1));
      const cells = ENEMY_DEFS.map((def) => {
        const dummy = makeDummy(def, subject.element);
        return `${hitDamage(unit, dummy, effect, false)}/${hitDamage(unit, dummy, effect, true)}`;
      });
      let line = `  ${name}(${scale}${hits > 1 ? ` ${hits}回` : ""}${effect.ignoreDefense ? " 防御無視" : ""}) `
        + ENEMY_DEFS.map((def, i) => `DEF${def}: ${cells[i]}`).join(" | ");
      if (withDefDown && effect.defCoefficient !== undefined) {
        const weakened = makeDummy(3_000, subject.element);
        applyStatEffect(weakened, "def", -DEF_DOWN, 2, "DEBUFF");
        line += ` | DEF3000かつ防御75%低下: ${hitDamage(unit, weakened, effect, false)}/${hitDamage(unit, weakened, effect, true)}`;
      }
      console.log(line);
    }
  }
}
console.log("\n各欄は 非クリ/クリ。DEF比例は自分のDEFで伸び、相手のDEFで減る");
