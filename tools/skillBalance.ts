/**
 * 終盤の基準ステータスで、実装済みの全スキルが実際に何をするかを数字で出す。
 *
 * スキルの説明文にある「攻撃力2.0倍」は、そのまま体力の何割かを表さない。
 * 防御力による軽減、属性相性、会心、HP補正が全部かかった後の値でないと、
 * 強すぎるのか弱すぎるのか判断できない。
 *
 * 基準ステータス(攻める側・受ける側とも同じ):
 *   HP 30000 / 攻撃 3500 / 防御 3500 / クリ率 60% / クリダメ 150%
 *
 *   npx tsx tools/skillBalance.ts          全スキルの一覧
 *   npx tsx tools/skillBalance.ts --detail 気になる数字の内訳も出す
 */
import { calcDamage } from "../src/battle/damage.js";
import { BattleUnit, createBattleUnit } from "../src/battle/unit.js";
import { MonsterDefinition, MonsterTemplate } from "../src/core/monster.js";
import { SCALE_REFERENCE, Skill, SkillEffect } from "../src/core/skill.js";
import { Stats } from "../src/core/stats.js";
import { ALL_MONSTER_TEMPLATES } from "../src/data/monsters.js";

/** 利用者が示した終盤の基準ステータス */
const BASELINE: Stats = {
  hp: 30000,
  atk: 3500,
  def: 3500,
  spd: 110,
  criRate: 0.6,
  // このゲームの criDmg は「与ダメージにかける倍率」。150% = 1.5倍
  criDmg: 1.5,
  resistance: 0.15,
  accuracy: 0.15,
};

function baselineUnit(team: "PLAYER" | "ENEMY"): BattleUnit {
  const def: MonsterDefinition = {
    id: `baseline_${team}`,
    templateId: "baseline",
    name: "基準",
    // 相性を打ち消すため、攻める側と受ける側を同じ属性にする
    element: "FIRE",
    color: "#fff",
    role: "基準",
    emoji: "⬜",
    stats: { ...BASELINE },
    skills: [] as unknown as MonsterDefinition["skills"],
  };
  return createBattleUnit(def, team, `${team}_baseline`);
}

const attacker = baselineUnit("PLAYER");
const defender = baselineUnit("ENEMY");

/** 会心を必ず出す/必ず出さない乱数。期待値は自分で混ぜる */
const alwaysCrit = () => 0;
const neverCrit = () => 0.999;

/** 1回のダメージ効果が、受ける側の最大HPの何割を削るか(会心込みの期待値) */
function damageShare(effect: SkillEffect & { kind: "DAMAGE" }): number {
  const crit = calcDamage(attacker, defender, effect, alwaysCrit).damage;
  const plain = calcDamage(attacker, defender, effect, neverCrit).damage;
  const expected = crit * BASELINE.criRate + plain * (1 - BASELINE.criRate);
  return (expected * (effect.hits ?? 1)) / BASELINE.hp;
}

interface Row {
  owner: string;
  skill: Skill;
  /** 敵1体あたりの削り(最大HP比) */
  perTarget: number;
  /** 全体技なら4体ぶん */
  total: number;
  /** その場で戻る回復・シールド(最大HP比、味方1体あたり) */
  sustain: number;
  /** 継続回復で、数ターンかけて戻る量 */
  overTime: number;
  /** 敵に乗せる不利な効果の数。デバフ役は火力が低くて当然なので、目安を緩める */
  debuffCount: number;
  notes: string[];
}

const ALL_ENEMIES_COUNT = 4;

function analyze(owner: string, skill: Skill): Row {
  let perTarget = 0;
  let sustain = 0;
  let overTime = 0;
  let debuffCount = 0;
  const notes: string[] = [];

  for (const effect of skill.effects) {
    switch (effect.kind) {
      case "DAMAGE": {
        perTarget += damageShare(effect);
        if (effect.scaleBonus) {
          const statValue = effect.scaleBonus.stat === "hp" ? BASELINE.hp : BASELINE[effect.scaleBonus.stat];
          const bonus = effect.scaleBonus.bonusAtReference * (statValue / SCALE_REFERENCE[effect.scaleBonus.stat]);
          notes.push(`${effect.scaleBonus.stat}補正で倍率+${bonus.toFixed(1)}(素の倍率${effect.multiplier})`);
        }
        if (effect.ignoreDefense) notes.push("防御無視");
        break;
      }
      case "HEAL": {
        const amount =
          effect.scaleStat === "atk"
            ? BASELINE.atk * effect.healRate
            : effect.scaleStat === "def"
              ? BASELINE.def * effect.healRate
              : BASELINE.hp * effect.healRate;
        sustain += amount / BASELINE.hp;
        break;
      }
      case "SHIELD":
        sustain += effect.shieldRate;
        break;
      case "REGEN":
        // 継続回復は即座には戻らない。**その場の回復と足してはいけない。**
        // 足すと「1回で7割戻す」ように見えるが、実際は数ターンかけて戻る
        overTime += effect.healRate * effect.durationTurns;
        break;
      case "LIFESTEAL":
        notes.push(`与ダメの${Math.round(effect.healRate * 100)}%回復`);
        break;
      case "DEBUFF":
      case "STUN":
      case "BURN":
      case "POISON":
      case "BLIND":
      case "COOLDOWN_EXTEND":
        debuffCount += 1;
        break;
      default:
        break;
    }
  }

  const targets = skill.target === "ALL_ENEMIES" ? ALL_ENEMIES_COUNT : 1;
  return { owner, skill, perTarget, total: perTarget * targets, sustain, overTime, debuffCount, notes };
}

const rows: Row[] = [];
for (const template of ALL_MONSTER_TEMPLATES) {
  const skills = [
    template.skill1,
    ...template.skill2Variants,
    ...template.skill3Variants,
    ...(template.lightSkill3 ? [template.lightSkill3] : []),
    ...(template.darkSkill3 ? [template.darkSkill3] : []),
  ];
  // 同じスキルが複数の枠に出てくる種族があるので、IDで畳む
  const seen = new Set<string>();
  for (const skill of skills) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    rows.push(analyze(template.baseName, skill));
  }
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(7);

// まず、この基準ステータスで何が起きているかを示す
const plainHit = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1.0 }, neverCrit).damage;
// 実際の式を写さず、ダメージから逆算する。写し間違いで嘘の数字を出さないように
const noMitigation = calcDamage(attacker, defender, { kind: "DAMAGE", multiplier: 1.0, ignoreDefense: true }, neverCrit).damage;
const mitigation = 1 - plainHit / noMitigation;
console.log("基準ステータス: HP30000 / 攻撃3500 / 防御3500 / クリ率60% / クリダメ150%");
console.log(`防御3500による軽減率: ${(mitigation * 100).toFixed(1)}%  (攻撃3500に対して)`);
console.log(`攻撃力1.0倍の非会心ダメージ: ${plainHit} (受ける側HPの ${((plainHit / BASELINE.hp) * 100).toFixed(2)}%)`);

const detail = process.argv.includes("--detail");

console.log("\n■ 攻撃スキル (敵1体あたりの削り / 全体技は4体ぶん合計)");
console.log(`${"種族".padEnd(10)}${"スキル".padEnd(22)}${"CT".padStart(3)}${"1体".padStart(8)}${"合計".padStart(8)}`);
for (const row of rows.filter((r) => r.perTarget > 0).sort((a, b) => b.total - a.total)) {
  const note = detail && row.notes.length > 0 ? `  ${row.notes.join(" / ")}` : "";
  console.log(
    `${row.owner.padEnd(10)}${row.skill.name.padEnd(22)}${String(row.skill.cooldownTurns).padStart(3)}${pct(row.perTarget)}${pct(row.total)}${note}`,
  );
}

console.log("\n■ 回復・シールド (味方1体あたり、最大HP比)");
console.log(`${"種族".padEnd(10)}${"スキル".padEnd(22)}${"CT".padStart(3)}${"その場".padStart(8)}${"継続".padStart(8)}`);
for (const row of rows.filter((r) => r.sustain > 0 || r.overTime > 0).sort((a, b) => b.sustain + b.overTime - (a.sustain + a.overTime))) {
  const ot = row.overTime > 0 ? pct(row.overTime) : "      -";
  console.log(
    `${row.owner.padEnd(10)}${row.skill.name.padEnd(22)}${String(row.skill.cooldownTurns).padStart(3)}${pct(row.sustain)}${ot}`,
  );
}

/**
 * 極端な値だけを名指しする。表を眺めて気付くのは無理がある。
 *
 * 目安を出すときに気を付けること:
 *
 * - **判定には「1体あたり」を使う。**「合計」は全体技で4体ぶんを足しただけなので、
 *   100%を超えても敵1体につき25%でしかない
 * - **単体技は全体技より高くて当たり前。**当たる相手が1体しかいないぶんを取り返す
 * - **デバフを積む技は火力が低くて当たり前。**インプのような妨害役を
 *   「火力不足」と呼ぶのは、役割ごと否定することになる
 * - **継続回復はその場の回復と足さない。**数ターンかけて戻る量なので、
 *   足すと1回の回復量を大きく見誤る
 */
console.log("\n■ 目に付いたもの");

/** クールタイム別の、1体あたりの削りの目安(全体技の場合) */
const EXPECTED_SHARE: { maxCooldown: number; low: number; high: number }[] = [
  { maxCooldown: 0, low: 0.02, high: 0.12 },
  { maxCooldown: 3, low: 0.05, high: 0.28 },
  { maxCooldown: 99, low: 0.08, high: 0.34 },
];

/** 単体技はこの倍まで許す */
const SINGLE_TARGET_ALLOWANCE = 1.7;
/** 不利な効果1つにつき、火力の下限をこの割合ぶん緩める */
const DEBUFF_ALLOWANCE_PER_EFFECT = 0.2;

const findings: string[] = [];
for (const row of rows) {
  if (row.perTarget > 0) {
    const band = EXPECTED_SHARE.find((b) => row.skill.cooldownTurns <= b.maxCooldown)!;
    const single = row.skill.target !== "ALL_ENEMIES";
    const high = band.high * (single ? SINGLE_TARGET_ALLOWANCE : 1);
    const low = band.low * Math.max(0, 1 - DEBUFF_ALLOWANCE_PER_EFFECT * row.debuffCount);
    if (row.perTarget > high) {
      findings.push(
        `${row.owner}「${row.skill.name}」CT${row.skill.cooldownTurns}${single ? "単体" : "全体"}: 1体あたり${pct(row.perTarget).trim()} — 目安${pct(high).trim()}を超えている`,
      );
    } else if (row.perTarget < low) {
      findings.push(
        `${row.owner}「${row.skill.name}」CT${row.skill.cooldownTurns}${single ? "単体" : "全体"}: 1体あたり${pct(row.perTarget).trim()} — 目安${pct(low).trim()}に届かない`,
      );
    }
  }
  // その場で半分以上を戻す回復は、削り合いそのものを成り立たなくする
  if (row.sustain >= 0.5) {
    findings.push(`${row.owner}「${row.skill.name}」CT${row.skill.cooldownTurns}: その場で最大HPの${pct(row.sustain).trim()}を戻す`);
  }
}
if (findings.length === 0) console.log("  なし");
for (const f of findings) console.log(`  ・${f}`);
console.log(`\n${rows.length}スキル中 ${findings.length}件`);
