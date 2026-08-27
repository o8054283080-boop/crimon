import { pathToFileURL } from "node:url";
import { Equipment, StatType, applyEquipmentToStats } from "../src/core/equipment.js";
import { MonsterDefinition } from "../src/core/monster.js";
import { ABILITY_POINT_VALUES, AllocatableStat, MonsterType } from "../src/core/monsterDevelopment.js";
import { STAR_MAX_LEVEL, Star, computeEffectiveStats, starMultiplier } from "../src/core/rarity.js";
import {
  GACHA_SR_COMMON_DEX,
  GACHA_SR_RARE_DEX,
  GACHA_SSR_COMMON_DEX,
  GACHA_SSR_RARE_DEX,
  MONSTER_TEMPLATES_DEX,
} from "../src/data/monsters.js";

type PrimaryStats = Record<AllocatableStat, number>;
type Stage = { label: string; star: Star; level: number };

export const RARITY_POOLS: Readonly<Record<3 | 4 | 5, readonly MonsterDefinition[]>> = {
  3: MONSTER_TEMPLATES_DEX,
  4: [...GACHA_SR_COMMON_DEX, ...GACHA_SR_RARE_DEX],
  5: [...GACHA_SSR_COMMON_DEX, ...GACHA_SSR_RARE_DEX],
};

/**
 * 採用値ではなく比較用の候補。base はLv1、growth はLv1から最大Lvまでの増分だけに掛ける。
 * 係数を編集して `npm run stats:balance` を再実行すれば、候補を横並びで再計算できる。
 */
export const TYPE_PROPOSAL: Readonly<Record<MonsterType, { base: PrimaryStats; growth: PrimaryStats }>> = {
  ATTACK:  { base: { hp: 0.96, atk: 1.08, def: 0.96, spd: 1.00 }, growth: { hp: 0.98, atk: 1.08, def: 0.98, spd: 1.00 } },
  HP:      { base: { hp: 1.08, atk: 0.96, def: 1.00, spd: 0.98 }, growth: { hp: 1.08, atk: 0.98, def: 1.00, spd: 1.00 } },
  DEFENSE: { base: { hp: 1.00, atk: 0.95, def: 1.10, spd: 0.97 }, growth: { hp: 1.00, atk: 0.98, def: 1.10, spd: 1.00 } },
  SUPPORT: { base: { hp: 1.04, atk: 0.96, def: 1.02, spd: 1.04 }, growth: { hp: 1.03, atk: 0.98, def: 1.02, spd: 1.00 } },
  DISRUPT: { base: { hp: 0.98, atk: 0.97, def: 0.98, spd: 1.07 }, growth: { hp: 1.00, atk: 0.99, def: 1.00, spd: 1.00 } },
};

export function statsWithTypeProposal(base: PrimaryStats, star: Star, level: number, type: MonsterType): PrimaryStats {
  const proposal = TYPE_PROPOSAL[type];
  const rank = starMultiplier(star);
  const max = STAR_MAX_LEVEL[star];
  const progress = max === 1 ? 0 : (Math.max(1, Math.min(level, max)) - 1) / (max - 1);
  const result = {} as PrimaryStats;
  for (const stat of ["hp", "atk", "def"] as const) {
    const initial = base[stat] * rank * proposal.base[stat];
    result[stat] = Math.round(initial + base[stat] * rank * progress * proposal.growth[stat]);
  }
  result.spd = Math.round(base.spd * proposal.base.spd); // 現行仕様と同じく速度はレベル成長しない
  return result;
}

export function addAbilityPoints(stats: PrimaryStats, stat: AllocatableStat, points: number): PrimaryStats {
  return { ...stats, [stat]: Math.round(stats[stat] + Math.floor(points * ABILITY_POINT_VALUES[stat])) };
}

function equipment(stat: StatType, values: number[], set: Equipment["set"]): Equipment[] {
  return values.map((value, index) => ({
    id: `balance_${stat}_${index}`, slot: (index + 1) as Equipment["slot"], star: 6, level: 15, set,
    mainStat: { type: stat, value }, subStats: [],
  }));
}

/** 強装備=現実的な★6+15主能力3枠、理論装備=6枠すべて同じ最大級主能力相当。 */
export const EQUIPMENT_SCENARIOS = {
  atkStrong: equipment("ATK_PERCENT", [0.765, 0.765, 0.765, 0, 0, 0], "POWER"),
  atkTheory: equipment("ATK_PERCENT", [0.765, 0.765, 0.765, 0.765, 0.765, 0.765], "POWER"),
  hpStrong: equipment("HP_PERCENT", [0.765, 0.765, 0.765, 0, 0, 0], "VITALITY"),
  hpTheory: equipment("HP_PERCENT", [0.765, 0.765, 0.765, 0.765, 0.765, 0.765], "VITALITY"),
  defStrong: equipment("DEF_PERCENT", [0.765, 0.765, 0.765, 0, 0, 0], "GUARD"),
  defTheory: equipment("DEF_PERCENT", [0.765, 0.765, 0.765, 0.765, 0.765, 0.765], "GUARD"),
} as const;

function primary(stats: MonsterDefinition["stats"]): PrimaryStats {
  return { hp: stats.hp, atk: stats.atk, def: stats.def, spd: stats.spd };
}

function summary(values: number[]): string {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = ordered.length / 2;
  const median = ordered.length % 2 ? ordered[Math.floor(middle)] : (ordered[middle - 1] + ordered[middle]) / 2;
  return `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)} / ${Math.round(median)} / ${ordered[0]} / ${ordered.at(-1)}`;
}

export function buildReport(): string {
  const out: string[] = ["# ステータスバランス再計算", "", "表の数値は `平均 / 中央値 / 最低 / 最高`。属性補正込みの全属性個体を母集団とする。", ""];
  const stages: Stage[] = [];
  for (const rarity of [3, 4, 5] as const) {
    stages.push({ label: `初期★${rarity} Lv1`, star: rarity, level: 1 });
    stages.push({ label: `初期★${rarity} Lv最大`, star: rarity, level: STAR_MAX_LEVEL[rarity] });
  }
  out.push("## 現状分布", "", "| 段階 | HP | ATK | DEF | SPD |", "|---|---:|---:|---:|---:|");
  for (const stage of stages) {
    const rows = RARITY_POOLS[stage.star as 3 | 4 | 5].map((monster) => computeEffectiveStats(monster.stats, stage.star, stage.level));
    out.push(`| ${stage.label} | ${summary(rows.map((s) => s.hp))} | ${summary(rows.map((s) => s.atk))} | ${summary(rows.map((s) => s.def))} | ${summary(rows.map((s) => s.spd))} |`);
  }
  for (const rarity of [3, 4, 5] as const) {
    const rows = RARITY_POOLS[rarity].map((monster) => computeEffectiveStats(monster.stats, 6, 60));
    out.push(`| 初期★${rarity} → ★6 Lv60 | ${summary(rows.map((s) => s.hp))} | ${summary(rows.map((s) => s.atk))} | ${summary(rows.map((s) => s.def))} | ${summary(rows.map((s) => s.spd))} |`);
  }

  const all = Object.values(RARITY_POOLS).flat();
  const reference = RARITY_POOLS[3].find((monster) => monster.id === "slime_FIRE") ?? RARITY_POOLS[3][0];
  const baseline = primary(computeEffectiveStats(reference.stats, 6, 60));
  out.push("", "## タイプ補正候補（全個体・★6 Lv60）", "", "| タイプ | HP | ATK | DEF | SPD |", "|---|---:|---:|---:|---:|");
  for (const type of Object.keys(TYPE_PROPOSAL) as MonsterType[]) {
    const rows = all.map((monster) => statsWithTypeProposal(primary(monster.stats), 6, 60, type));
    out.push(`| ${type} | ${summary(rows.map((s) => s.hp))} | ${summary(rows.map((s) => s.atk))} | ${summary(rows.map((s) => s.def))} | ${summary(rows.map((s) => s.spd))} |`);
  }

  out.push("", `## 能力ポイント（${reference.name}・★6 Lv60、装備なし）`, "", `基準: HP ${baseline.hp} / ATK ${baseline.atk} / DEF ${baseline.def} / SPD ${baseline.spd}`, "", "| 振り先 | 0pt | 25pt | 50pt | 100pt |", "|---|---:|---:|---:|---:|");
  for (const stat of ["hp", "atk", "def", "spd"] as const) {
    out.push(`| ${stat.toUpperCase()} | ${[0, 25, 50, 100].map((p) => addAbilityPoints(baseline, stat, p)[stat]).join(" | ")} |`);
  }

  out.push("", `## 極振り＋装備（${reference.name}・タイプ候補・★6 Lv60）`, "", "| 構成 | 装備なし | 強装備 | 理論装備 |", "|---|---:|---:|---:|");
  for (const [type, stat, strong, theory] of [
    ["ATTACK", "atk", "atkStrong", "atkTheory"], ["HP", "hp", "hpStrong", "hpTheory"], ["DEFENSE", "def", "defStrong", "defTheory"],
  ] as const) {
    const typed = statsWithTypeProposal(primary(reference.stats), 6, 60, type);
    const pointed = addAbilityPoints(typed, stat, 100);
    out.push(`| ${type} + ${stat.toUpperCase()}100 | ${pointed[stat]} | ${applyEquipmentToStats({ ...reference.stats, ...pointed }, EQUIPMENT_SCENARIOS[strong])[stat]} | ${applyEquipmentToStats({ ...reference.stats, ...pointed }, EQUIPMENT_SCENARIOS[theory])[stat]} |`);
  }
  return `${out.join("\n")}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.stdout.write(buildReport());
