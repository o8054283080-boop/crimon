/**
 * 装備メイン効果の値域を測る。
 *
 * ばらつき(0.85〜1.15)が乗るので、1個引いただけでは値域が分からない。
 * 同じ★・同じ強化値で何本も引いて、最低・中央・平均・最大を出す。
 *
 *   npx tsx tools/mainStatRange.ts              # ★6+15の全メイン
 *   npx tsx tools/mainStatRange.ts --star 5     # ★5
 *   npx tsx tools/mainStatRange.ts --level 0    # 無強化
 */
import {
  EQUIP_MAX_LEVEL,
  STAT_LABEL,
  enhanceEquipment,
  generateEquipment,
  type EquipStar,
  type StatType,
} from "../src/core/equipment.js";
import { mulberry32 } from "./battleLab/rng.js";

const argv = process.argv.slice(2);
const pick = (name: string, fallback: number) => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : fallback;
};
const star = pick("--star", 6) as EquipStar;
const level = pick("--level", EQUIP_MAX_LEVEL);
const trials = pick("--trials", 2000);

/** その型がメインに載る枠を1つ選ぶ。枠によってメインの値は変わらない */
const SLOT_OF: Partial<Record<StatType, 1 | 2 | 3 | 4 | 5 | 6>> = {
  ATK_FLAT: 1, DEF_FLAT: 3, HP_FLAT: 5,
  SPD: 2, ATK_PERCENT: 2, DEF_PERCENT: 2, HP_PERCENT: 4,
  CRIT_RATE: 4, CRIT_DMG: 4, ACCURACY: 6, RESISTANCE: 6,
};

const isFlat = (type: StatType) => type === "ATK_FLAT" || type === "DEF_FLAT" || type === "HP_FLAT" || type === "SPD";

console.log(`★${star} +${level} / ${trials}本`);
console.log("| メイン | 最低 | 中央 | 平均 | 最大 |");
console.log("|---|---:|---:|---:|---:|");

for (const [type, slot] of Object.entries(SLOT_OF) as [StatType, 1 | 2 | 3 | 4 | 5 | 6][]) {
  const values: number[] = [];
  for (let i = 0; i < trials; i += 1) {
    const rng = mulberry32(1000 + i);
    let equipment = generateEquipment({ slot, star, subStatCount: 0, rng });
    // 枠によっては狙ったメインが出ないので、出るまで引き直す
    let guard = 0;
    while (equipment.mainStat.type !== type && guard < 200) {
      equipment = generateEquipment({ slot, star, subStatCount: 0, rng });
      guard += 1;
    }
    if (equipment.mainStat.type !== type) continue;
    while (equipment.level < level) enhanceEquipment(equipment, rng);
    values.push(equipment.mainStat.value);
  }
  if (values.length === 0) continue;
  values.sort((a, b) => a - b);
  const show = (value: number) => (isFlat(type) ? `${Math.round(value)}` : `${(value * 100).toFixed(1)}%`);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  console.log(`| ${STAT_LABEL[type]} | ${show(values[0])} | ${show(values[Math.floor(values.length / 2)])} `
    + `| ${show(mean)} | ${show(values[values.length - 1])} |`);
}
