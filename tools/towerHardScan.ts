/**
 * 試練の塔HARD候補を、現在のNORMAL完成ステータスへ追加倍率として掛けて比較する。
 *
 *   npx tsx tools/towerHardScan.ts
 *   npx tsx tools/towerHardScan.ts --runs 20 --floors 90,100
 *
 * 本番の敵定義は変更しない。`buildFloorScenario` が取り出した実効ステータスの複製だけを
 * 倍率化し、階固有処理は `trialTowerFloor` で本編BattleEngineをそのまま動かす。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetBalanceFlags } from "../src/core/balanceFlags.js";
import { CRIMOARK_CLONE_HP_FLOOR } from "../src/data/crimoark.js";
import { runMany, type BattleTally } from "./battleLab/run.js";
import { buildFloorScenario } from "./battleLab/scenarios/towerFloors.js";
import type { Scenario, ScenarioHook } from "./battleLab/types.js";

type StatMultipliers = { hp: number; def: number; atk: number; spd: number };
type CandidateName = "NORMAL" | "A" | "B" | "C" | "D" | "E"
  | "E_SPD1" | "D100_LOW1" | "D100_LOW2" | "F" | "G" | "G2" | "H" | "H2" | "H3"
  | "H3_SPD105" | "H3_SPD110" | "H3_SPD120" | "H3_LATE_SPD120"
  | "H4_MID_A" | "H4_MID_B" | "H4_MID_C" | "H4_MID_D" | "H4_MID_FINAL"
  | "H4_MID_REFINE_A" | "H4_MID_REFINE_B" | "H4_MID_FINAL_OFFENSE"
  | "H4_UPPER51_A" | "H4_UPPER51_B" | "H4_UPPER51_C"
  | "H4_UPPER51_54A" | "H4_UPPER51_54B" | "H4_UPPER51_FINAL"
  | "H5_SMOOTH_A" | "H5_SMOOTH_B" | "H6_SMOOTH_A" | "H7_BAND_TARGET"
  | "H8_BOSS_A" | "H8_BOSS_B" | "H8_BOSS_FINAL" | "ABSOLUTE_CURVE";
type PartyProfile = "STRONG" | "STRONG_PLUS" | "CONTROL" | "CONTROL_PLUS" | "DOT_CONTROL";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const RUNS = Math.max(1, Number(arg("runs", "200")));
const SEED = Number(arg("seed", "20260921")) >>> 0;
function parseFloors(value: string): number[] {
  const floors = new Set<number>();
  for (const part of value.split(",")) {
    const range = /^(\d+)-(\d+)$/.exec(part.trim());
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let floor = Math.min(from, to); floor <= Math.max(from, to); floor += 1) floors.add(floor);
      continue;
    }
    const floor = Number(part);
    if (Number.isFinite(floor)) floors.add(floor);
  }
  return [...floors].filter((floor) => floor >= 1 && floor <= 100).sort((a, b) => a - b);
}

const FLOORS = parseFloors(arg("floors", "1,20,30,50,70,80,90,99,100"));
const MAX_TURNS = Math.max(1, Number(arg("max-turns", "300")));
const REQUESTED_CANDIDATES = arg("candidates", "NORMAL,A,B,C").split(",") as CandidateName[];
const REQUESTED_PROFILES = arg("profiles", "STRONG").split(",") as PartyProfile[];
const OUT_NAME = arg("out", "tower-hard-scan-2026-09-21");

const CANDIDATES: Record<"A" | "B" | "C" | "D" | "E" | "F" | "G" | "G2" | "H", Array<{ maxFloor: number; stats: StatMultipliers }>> = {
  A: [
    { maxFloor: 30, stats: { hp: 1.30, def: 1.10, atk: 1.15, spd: 1.03 } },
    { maxFloor: 60, stats: { hp: 1.50, def: 1.15, atk: 1.25, spd: 1.05 } },
    { maxFloor: 80, stats: { hp: 1.70, def: 1.25, atk: 1.35, spd: 1.07 } },
    { maxFloor: 90, stats: { hp: 1.90, def: 1.30, atk: 1.45, spd: 1.08 } },
    { maxFloor: 99, stats: { hp: 2.10, def: 1.40, atk: 1.60, spd: 1.10 } },
    { maxFloor: 100, stats: { hp: 2.40, def: 1.45, atk: 1.70, spd: 1.10 } },
  ],
  B: [
    { maxFloor: 30, stats: { hp: 1.40, def: 1.15, atk: 1.20, spd: 1.05 } },
    { maxFloor: 60, stats: { hp: 1.70, def: 1.25, atk: 1.35, spd: 1.08 } },
    { maxFloor: 80, stats: { hp: 2.00, def: 1.35, atk: 1.50, spd: 1.10 } },
    { maxFloor: 90, stats: { hp: 2.30, def: 1.45, atk: 1.65, spd: 1.12 } },
    { maxFloor: 99, stats: { hp: 2.60, def: 1.55, atk: 1.80, spd: 1.15 } },
    { maxFloor: 100, stats: { hp: 3.00, def: 1.60, atk: 2.00, spd: 1.15 } },
  ],
  C: [
    { maxFloor: 30, stats: { hp: 1.50, def: 1.20, atk: 1.25, spd: 1.05 } },
    { maxFloor: 60, stats: { hp: 1.90, def: 1.30, atk: 1.45, spd: 1.10 } },
    { maxFloor: 80, stats: { hp: 2.30, def: 1.45, atk: 1.65, spd: 1.12 } },
    { maxFloor: 90, stats: { hp: 2.70, def: 1.55, atk: 1.85, spd: 1.15 } },
    { maxFloor: 99, stats: { hp: 3.10, def: 1.65, atk: 2.05, spd: 1.18 } },
    { maxFloor: 100, stats: { hp: 3.60, def: 1.75, atk: 2.30, spd: 1.18 } },
  ],
  // A/B/C実測後の探索用。最終値は追加実測を経てレポートで確定する。
  D: [
    { maxFloor: 1, stats: { hp: 1.50, def: 1.20, atk: 1.25, spd: 1.05 } },
    { maxFloor: 20, stats: { hp: 1.50, def: 1.20, atk: 1.25, spd: 1.05 } },
    { maxFloor: 30, stats: { hp: 5.00, def: 1.30, atk: 14.00, spd: 1.45 } },
    { maxFloor: 50, stats: { hp: 1.20, def: 1.00, atk: 5.50, spd: 1.23 } },
    { maxFloor: 70, stats: { hp: 1.45, def: 1.10, atk: 2.20, spd: 1.05 } },
    { maxFloor: 80, stats: { hp: 1.75, def: 1.20, atk: 2.50, spd: 1.10 } },
    { maxFloor: 90, stats: { hp: 1.25, def: 1.05, atk: 1.40, spd: 1.03 } },
    { maxFloor: 99, stats: { hp: 2.10, def: 1.25, atk: 3.50, spd: 1.15 } },
    { maxFloor: 100, stats: { hp: 2.00, def: 1.30, atk: 1.60, spd: 1.08 } },
  ],
  E: [
    { maxFloor: 20, stats: { hp: 1.60, def: 1.25, atk: 1.30, spd: 1.05 } },
    { maxFloor: 30, stats: { hp: 1.80, def: 1.30, atk: 1.40, spd: 1.06 } },
    { maxFloor: 40, stats: { hp: 2.00, def: 1.35, atk: 1.50, spd: 1.07 } },
    { maxFloor: 50, stats: { hp: 2.20, def: 1.40, atk: 1.60, spd: 1.08 } },
    { maxFloor: 60, stats: { hp: 2.25, def: 1.40, atk: 1.60, spd: 1.07 } },
    { maxFloor: 70, stats: { hp: 2.30, def: 1.45, atk: 1.65, spd: 1.06 } },
    { maxFloor: 80, stats: { hp: 2.35, def: 1.45, atk: 1.65, spd: 1.05 } },
    { maxFloor: 90, stats: { hp: 2.35, def: 1.45, atk: 1.65, spd: 1.03 } },
    { maxFloor: 99, stats: { hp: 2.40, def: 1.45, atk: 1.70, spd: 1.03 } },
    // 100階だけは一律延長せず、前回Dを維持する。
    { maxFloor: 100, stats: { hp: 2.00, def: 1.30, atk: 1.60, spd: 1.08 } },
  ],
  // E全階走査後の検証用。通常階とボス階の落差を抑えるため、一部を別帯に分ける。
  F: [
    { maxFloor: 10, stats: { hp: 30.00, def: 1.15, atk: 20.00, spd: 1.03 } },
    { maxFloor: 20, stats: { hp: 15.00, def: 1.15, atk: 10.00, spd: 1.03 } },
    { maxFloor: 30, stats: { hp: 6.00, def: 1.20, atk: 5.00, spd: 1.03 } },
    { maxFloor: 40, stats: { hp: 4.00, def: 1.20, atk: 4.00, spd: 1.03 } },
    { maxFloor: 49, stats: { hp: 3.00, def: 1.20, atk: 3.00, spd: 1.03 } },
    { maxFloor: 50, stats: { hp: 2.00, def: 1.20, atk: 2.20, spd: 1.03 } },
    { maxFloor: 59, stats: { hp: 3.00, def: 1.25, atk: 3.00, spd: 1.03 } },
    { maxFloor: 60, stats: { hp: 2.25, def: 1.35, atk: 2.00, spd: 1.03 } },
    { maxFloor: 69, stats: { hp: 2.30, def: 1.35, atk: 1.80, spd: 1.03 } },
    { maxFloor: 70, stats: { hp: 1.15, def: 1.00, atk: 1.80, spd: 1.00 } },
    { maxFloor: 79, stats: { hp: 2.35, def: 1.35, atk: 2.50, spd: 1.03 } },
    { maxFloor: 80, stats: { hp: 2.00, def: 1.25, atk: 1.80, spd: 1.00 } },
    { maxFloor: 89, stats: { hp: 2.35, def: 1.35, atk: 1.80, spd: 1.00 } },
    { maxFloor: 90, stats: { hp: 1.25, def: 1.05, atk: 1.40, spd: 1.00 } },
    { maxFloor: 99, stats: { hp: 2.00, def: 1.15, atk: 4.00, spd: 1.00 } },
    { maxFloor: 100, stats: { hp: 1.60, def: 1.15, atk: 1.40, spd: 1.03 } },
  ],
  // 将来の装備強化・アクセサリーを見越した、低耐久・高火力型の探索案。
  // 序盤だけはNORMALの絶対SPDが低いため、倍率後がおよそ200前後になるよう補う。
  G: [
    { maxFloor: 9, stats: { hp: 12.00, def: 1.00, atk: 25.00, spd: 2.20 } },
    { maxFloor: 10, stats: { hp: 8.00, def: 1.00, atk: 12.00, spd: 1.55 } },
    { maxFloor: 19, stats: { hp: 8.00, def: 1.00, atk: 12.00, spd: 1.55 } },
    { maxFloor: 20, stats: { hp: 6.00, def: 1.00, atk: 8.00, spd: 1.30 } },
    { maxFloor: 29, stats: { hp: 5.00, def: 1.05, atk: 6.00, spd: 1.20 } },
    { maxFloor: 30, stats: { hp: 3.00, def: 1.05, atk: 4.00, spd: 1.10 } },
    { maxFloor: 39, stats: { hp: 3.00, def: 1.10, atk: 4.00, spd: 1.08 } },
    { maxFloor: 40, stats: { hp: 2.50, def: 1.10, atk: 3.50, spd: 1.05 } },
    { maxFloor: 49, stats: { hp: 2.50, def: 1.10, atk: 3.50, spd: 1.05 } },
    { maxFloor: 50, stats: { hp: 1.60, def: 1.00, atk: 3.00, spd: 1.03 } },
    { maxFloor: 59, stats: { hp: 2.30, def: 1.10, atk: 3.00, spd: 1.03 } },
    { maxFloor: 60, stats: { hp: 1.80, def: 1.05, atk: 2.50, spd: 1.00 } },
    { maxFloor: 69, stats: { hp: 2.20, def: 1.10, atk: 2.80, spd: 1.03 } },
    { maxFloor: 70, stats: { hp: 1.05, def: 1.00, atk: 2.20, spd: 1.00 } },
    { maxFloor: 79, stats: { hp: 2.20, def: 1.10, atk: 3.00, spd: 1.00 } },
    { maxFloor: 80, stats: { hp: 1.50, def: 1.00, atk: 2.30, spd: 1.00 } },
    { maxFloor: 89, stats: { hp: 2.10, def: 1.10, atk: 3.20, spd: 1.00 } },
    { maxFloor: 90, stats: { hp: 1.15, def: 1.00, atk: 1.50, spd: 1.00 } },
    { maxFloor: 99, stats: { hp: 1.80, def: 1.10, atk: 4.00, spd: 1.00 } },
    { maxFloor: 100, stats: { hp: 1.60, def: 1.15, atk: 1.40, spd: 1.03 } },
  ],
  // Gで攻撃性能が不足した通常階を、耐久をほぼ据え置いたまま追加増幅する探索案。
  G2: [
    { maxFloor: 9, stats: { hp: 30.00, def: 1.00, atk: 80.00, spd: 2.20 } },
    { maxFloor: 10, stats: { hp: 12.00, def: 1.00, atk: 30.00, spd: 1.55 } },
    { maxFloor: 19, stats: { hp: 15.00, def: 1.00, atk: 40.00, spd: 1.55 } },
    { maxFloor: 20, stats: { hp: 8.00, def: 1.00, atk: 20.00, spd: 1.30 } },
    { maxFloor: 29, stats: { hp: 8.00, def: 1.00, atk: 15.00, spd: 1.20 } },
    { maxFloor: 30, stats: { hp: 4.00, def: 1.00, atk: 8.00, spd: 1.10 } },
    { maxFloor: 39, stats: { hp: 4.00, def: 1.00, atk: 8.00, spd: 1.08 } },
    { maxFloor: 40, stats: { hp: 3.00, def: 1.00, atk: 7.00, spd: 1.05 } },
    { maxFloor: 49, stats: { hp: 3.00, def: 1.00, atk: 7.00, spd: 1.05 } },
    { maxFloor: 50, stats: { hp: 1.50, def: 1.00, atk: 5.00, spd: 1.03 } },
    { maxFloor: 59, stats: { hp: 3.00, def: 1.00, atk: 6.00, spd: 1.03 } },
    { maxFloor: 60, stats: { hp: 1.50, def: 1.00, atk: 4.00, spd: 1.00 } },
    { maxFloor: 69, stats: { hp: 2.50, def: 1.00, atk: 5.00, spd: 1.03 } },
    { maxFloor: 70, stats: { hp: 1.00, def: 1.00, atk: 2.50, spd: 1.00 } },
    { maxFloor: 79, stats: { hp: 2.50, def: 1.00, atk: 5.00, spd: 1.00 } },
    { maxFloor: 80, stats: { hp: 1.30, def: 1.00, atk: 3.00, spd: 1.00 } },
    { maxFloor: 89, stats: { hp: 2.20, def: 1.00, atk: 5.00, spd: 1.00 } },
    { maxFloor: 90, stats: { hp: 1.00, def: 1.00, atk: 1.80, spd: 1.00 } },
    { maxFloor: 99, stats: { hp: 2.00, def: 1.00, atk: 6.00, spd: 1.00 } },
    { maxFloor: 100, stats: { hp: 1.60, def: 1.15, atk: 1.40, spd: 1.03 } },
  ],
  // 現在STRONGでは70階以降の通常階をほぼ突破不能にし、将来強化で差が縮むかを見る案。
  H: [
    { maxFloor: 9, stats: { hp: 30.00, def: 1.00, atk: 80.00, spd: 2.20 } },
    { maxFloor: 10, stats: { hp: 12.00, def: 1.00, atk: 30.00, spd: 1.55 } },
    { maxFloor: 19, stats: { hp: 15.00, def: 1.00, atk: 40.00, spd: 1.55 } },
    { maxFloor: 20, stats: { hp: 8.00, def: 1.00, atk: 20.00, spd: 1.30 } },
    { maxFloor: 29, stats: { hp: 8.00, def: 1.00, atk: 15.00, spd: 1.20 } },
    { maxFloor: 30, stats: { hp: 4.00, def: 1.00, atk: 8.00, spd: 1.10 } },
    { maxFloor: 39, stats: { hp: 4.00, def: 1.00, atk: 8.00, spd: 1.08 } },
    { maxFloor: 40, stats: { hp: 3.00, def: 1.00, atk: 7.00, spd: 1.05 } },
    { maxFloor: 49, stats: { hp: 3.00, def: 1.00, atk: 7.00, spd: 1.05 } },
    { maxFloor: 50, stats: { hp: 1.50, def: 1.00, atk: 5.00, spd: 1.03 } },
    { maxFloor: 59, stats: { hp: 3.00, def: 1.00, atk: 6.00, spd: 1.03 } },
    { maxFloor: 60, stats: { hp: 1.50, def: 1.00, atk: 4.00, spd: 1.00 } },
    { maxFloor: 69, stats: { hp: 2.50, def: 1.00, atk: 5.00, spd: 1.03 } },
    { maxFloor: 70, stats: { hp: 1.00, def: 1.00, atk: 2.50, spd: 1.00 } },
    { maxFloor: 79, stats: { hp: 3.50, def: 1.00, atk: 12.00, spd: 1.12 } },
    { maxFloor: 80, stats: { hp: 1.30, def: 1.00, atk: 3.00, spd: 1.00 } },
    { maxFloor: 88, stats: { hp: 3.20, def: 1.00, atk: 14.00, spd: 1.10 } },
    { maxFloor: 89, stats: { hp: 2.20, def: 1.00, atk: 5.00, spd: 1.00 } },
    { maxFloor: 90, stats: { hp: 1.00, def: 1.00, atk: 1.80, spd: 1.00 } },
    { maxFloor: 94, stats: { hp: 3.00, def: 1.00, atk: 16.00, spd: 1.10 } },
    { maxFloor: 97, stats: { hp: 2.70, def: 1.00, atk: 12.00, spd: 1.08 } },
    { maxFloor: 99, stats: { hp: 2.00, def: 1.00, atk: 6.00, spd: 1.00 } },
    { maxFloor: 100, stats: { hp: 1.60, def: 1.15, atk: 1.40, spd: 1.03 } },
  ],
};

function multipliersOf(candidate: CandidateName, floor: number): StatMultipliers {
  if (candidate === "NORMAL") return { hp: 1, def: 1, atk: 1, spd: 1 };
  // 50Fを約10%、60F以降のボスを0%付近へ揃える探索案。
  // 通常階はH7を維持し、対象ボスだけを個別に調整する。
  if (candidate === "H8_BOSS_A" || candidate === "H8_BOSS_B" || candidate === "H8_BOSS_FINAL") {
    const strong = candidate === "H8_BOSS_B";
    if (floor === 50) {
      if (candidate === "H8_BOSS_FINAL") return { hp: 0.70, def: 1.00, atk: 9.00, spd: 1.16 };
      return strong
        ? { hp: 0.70, def: 1.00, atk: 9.00, spd: 1.16 }
        : { hp: 0.80, def: 1.00, atk: 8.50, spd: 1.14 };
    }
    if (floor === 60) return { hp: 1.50, def: 1.00, atk: 8.00, spd: 1.15 };
    if (floor === 70) return { hp: 0.80, def: 1.00, atk: 4.50, spd: 1.20 };
    if (floor === 80) return { hp: 1.20, def: 1.00, atk: 7.00, spd: 1.22 };
    if (floor === 90) return { hp: 0.85, def: 1.00, atk: 3.00, spd: 1.20 };
    if (floor === 100) return { hp: 1.60, def: 1.15, atk: 1.50, spd: 1.22 };
    return multipliersOf("H7_BAND_TARGET", floor);
  }
  // STRONG基準で通常階の勝率を帯ごとに揃える探索案。
  // 10階ごとのボスはH6を維持し、編成差が大きい通常階だけ個別に補正する。
  if (candidate === "H7_BAND_TARGET") {
    const overrides: Partial<Record<number, StatMultipliers>> = {
      51: { hp: 3.00, def: 1.25, atk: 24.00, spd: 1.57 },
      52: { hp: 3.00, def: 1.00, atk: 24.00, spd: 1.50 },
      53: { hp: 3.00, def: 1.00, atk: 24.00, spd: 1.47 },
      54: { hp: 3.00, def: 1.75, atk: 24.00, spd: 1.60 },
      55: { hp: 3.00, def: 1.00, atk: 24.00, spd: 1.50 },
      56: { hp: 3.00, def: 1.00, atk: 16.00, spd: 1.30 },
      57: { hp: 3.00, def: 1.00, atk: 18.00, spd: 1.38 },
      58: { hp: 3.00, def: 1.20, atk: 18.00, spd: 1.44 },
      59: { hp: 3.00, def: 1.00, atk: 15.50, spd: 1.28 },
      61: { hp: 2.50, def: 1.00, atk: 20.00, spd: 1.45 },
      62: { hp: 2.50, def: 1.00, atk: 20.00, spd: 1.45 },
      63: { hp: 2.50, def: 1.00, atk: 16.00, spd: 1.35 },
      64: { hp: 2.50, def: 1.00, atk: 16.00, spd: 1.35 },
      65: { hp: 2.50, def: 1.00, atk: 19.00, spd: 1.42 },
      66: { hp: 2.50, def: 1.00, atk: 12.50, spd: 1.23 },
      67: { hp: 2.50, def: 1.00, atk: 15.00, spd: 1.30 },
      68: { hp: 1.50, def: 1.00, atk: 20.00, spd: 1.35 },
      69: { hp: 2.50, def: 1.00, atk: 10.00, spd: 1.16 },
      71: { hp: 3.50, def: 1.00, atk: 30.00, spd: 1.15 },
      72: { hp: 3.50, def: 1.00, atk: 30.00, spd: 1.08 },
      73: { hp: 3.50, def: 1.00, atk: 30.00, spd: 1.09 },
      74: { hp: 3.50, def: 1.00, atk: 30.00, spd: 1.08 },
      75: { hp: 3.50, def: 1.00, atk: 12.00, spd: 1.05 },
      76: { hp: 3.00, def: 1.00, atk: 11.00, spd: 1.05 },
      77: { hp: 2.25, def: 1.00, atk: 18.00, spd: 1.20 },
      78: { hp: 2.50, def: 1.00, atk: 11.00, spd: 1.08 },
      79: { hp: 2.70, def: 1.00, atk: 13.00, spd: 1.08 },
      81: { hp: 3.20, def: 1.00, atk: 18.00, spd: 1.10 },
      82: { hp: 3.20, def: 1.00, atk: 18.00, spd: 1.10 },
      83: { hp: 3.20, def: 1.00, atk: 18.00, spd: 1.10 },
      84: { hp: 3.20, def: 1.00, atk: 18.00, spd: 1.12 },
      85: { hp: 2.80, def: 1.00, atk: 12.00, spd: 1.03 },
      86: { hp: 2.80, def: 1.00, atk: 13.00, spd: 1.06 },
      87: { hp: 2.80, def: 1.00, atk: 13.00, spd: 1.08 },
      88: { hp: 2.50, def: 1.00, atk: 16.00, spd: 1.15 },
      89: { hp: 1.80, def: 1.00, atk: 10.00, spd: 1.14 },
    };
    return overrides[floor] ?? multipliersOf("H6_SMOOTH_A", floor);
  }
  // H5で残った44～49Fと61～69Fの編成差を、ボス階へ向けた下降カーブへ揃える。
  if (candidate === "H6_SMOOTH_A") {
    if (floor === 44) return { hp: 3.00, def: 1.00, atk: 12.00, spd: 1.15 };
    if (floor === 45) return { hp: 3.00, def: 1.00, atk: 15.00, spd: 1.20 };
    if (floor === 46) return { hp: 1.50, def: 1.00, atk: 22.00, spd: 1.32 };
    if (floor === 48) return { hp: 1.75, def: 1.00, atk: 20.00, spd: 1.28 };
    if (floor === 49) return { hp: 3.00, def: 1.00, atk: 9.20, spd: 1.10 };
    if (floor === 62) return { hp: 2.50, def: 1.00, atk: 18.00, spd: 1.40 };
    if (floor === 65) return { hp: 2.50, def: 1.00, atk: 19.00, spd: 1.42 };
    if (floor === 66) return { hp: 2.50, def: 1.00, atk: 14.00, spd: 1.28 };
    if (floor === 67) return { hp: 2.50, def: 1.00, atk: 17.00, spd: 1.35 };
    if (floor === 68) return { hp: 2.50, def: 1.00, atk: 13.00, spd: 1.22 };
    if (floor === 69) return { hp: 2.50, def: 1.00, atk: 15.00, spd: 1.30 };
    return multipliersOf("H5_SMOOTH_B", floor);
  }
  if (candidate === "H5_SMOOTH_B") {
    if (floor === 54) return { hp: 3.00, def: 1.82, atk: 24.00, spd: 1.63 };
    if (floor === 57) return { hp: 3.00, def: 1.62, atk: 18.00, spd: 1.45 };
    return multipliersOf("H5_SMOOTH_A", floor);
  }
  // 39→40Fと51～59Fの急激な難化を解消する段階型。
  // 50/60Fはボス壁として維持し、51Fから59Fへ通常階だけ緩やかに難しくする。
  if (candidate === "H5_SMOOTH_A") {
    if (floor === 40) return { hp: 3.00, def: 1.00, atk: 8.50, spd: 1.08 };
    if (floor === 51) return { hp: 3.00, def: 1.25, atk: 24.00, spd: 1.50 };
    if (floor === 52 || floor === 53 || floor === 56) {
      return multipliersOf("H4_MID_FINAL_OFFENSE", floor);
    }
    if (floor === 54) return { hp: 3.00, def: 1.75, atk: 24.00, spd: 1.60 };
    if (floor === 55) return { hp: 3.00, def: 1.50, atk: 24.00, spd: 1.50 };
    if (floor === 57 || floor === 58) return { hp: 3.00, def: 1.70, atk: 18.00, spd: 1.55 };
    if (floor === 59) return { hp: 3.00, def: 1.50, atk: 18.00, spd: 1.35 };
    return multipliersOf("H4_UPPER51_FINAL", floor);
  }
  // Bで唯一勝率が跳ねた54F（守備編成）だけを平準化する比較と最終案。
  if (candidate === "H4_UPPER51_54A" || candidate === "H4_UPPER51_54B" || candidate === "H4_UPPER51_FINAL") {
    if (floor !== 54) return multipliersOf("H4_UPPER51_B", floor);
    if (candidate === "H4_UPPER51_54A" || candidate === "H4_UPPER51_FINAL") {
      return { hp: 3.00, def: 2.15, atk: 24.00, spd: 1.80 };
    }
    return { hp: 3.00, def: 2.30, atk: 24.00, spd: 1.90 };
  }
  // 51Fでステータス生成方式が切り替わり、基礎DEF/SPDが急落する断絶の補正候補。
  // HPとATKは攻撃型最終案を維持し、初手で消されない最低限のDEFと手番用SPDだけを比較する。
  if (candidate === "H4_UPPER51_A" || candidate === "H4_UPPER51_B" || candidate === "H4_UPPER51_C") {
    if (floor < 51 || floor > 59) return multipliersOf("H4_MID_FINAL_OFFENSE", floor);
    const atk = floor <= 55 ? 24.00 : 18.00;
    if (candidate === "H4_UPPER51_A") {
      return { hp: 3.00, def: 1.50, atk, spd: floor <= 55 ? 1.50 : 1.35 };
    }
    if (candidate === "H4_UPPER51_B") {
      return { hp: 3.00, def: 2.00, atk, spd: 1.70 };
    }
    return { hp: 3.00, def: 2.50, atk, spd: 2.00 };
  }
  // 時間切れ偏重をATK・SPDによる全滅圧へ置き換えた40～69Fの最終攻撃型。
  if (candidate === "H4_MID_FINAL_OFFENSE") {
    if (floor === 40 || floor === 50) return multipliersOf("H4_MID_B", floor);
    if (floor === 46) return { hp: 3.00, def: 1.00, atk: 24.00, spd: 1.40 };
    if (floor === 48) return { hp: 3.00, def: 1.00, atk: 20.00, spd: 1.28 };
    if (floor === 68) return { hp: 2.50, def: 1.00, atk: 16.00, spd: 1.28 };
    return multipliersOf("H4_MID_FINAL", floor);
  }
  // FINALで時間切れが多かった階だけHPを削り、ATK・SPDへ振り直した攻撃型比較。
  if (candidate === "H4_MID_REFINE_A" || candidate === "H4_MID_REFINE_B") {
    const aggressive = candidate === "H4_MID_REFINE_B";
    if (floor === 40) return aggressive
      ? { hp: 1.75, def: 1.00, atk: 16.00, spd: 1.20 }
      : { hp: 2.00, def: 1.00, atk: 12.00, spd: 1.15 };
    if (floor === 46 || floor === 48) return aggressive
      ? { hp: 1.75, def: 1.00, atk: 20.00, spd: 1.28 }
      : { hp: 2.00, def: 1.00, atk: 17.00, spd: 1.23 };
    if (floor === 50) return aggressive
      ? { hp: 0.90, def: 1.00, atk: 9.00, spd: 1.16 }
      : { hp: 1.10, def: 1.00, atk: 8.00, spd: 1.13 };
    if (floor === 68) return aggressive
      ? { hp: 1.50, def: 1.00, atk: 16.00, spd: 1.28 }
      : { hp: 1.75, def: 1.00, atk: 13.00, spd: 1.23 };
    return multipliersOf("H4_MID_FINAL", floor);
  }
  // 40～69Fの全階実測から、同じ倍率の効き方が極端に違う階を個別に組み直した案。
  // DEFは全階×1.00のままにし、硬さではなくATK・SPDで難度を作る。
  if (candidate === "H4_MID_FINAL") {
    if (floor < 40 || floor >= 70) return multipliersOf("H3_LATE_SPD120", floor);
    if (floor === 40) return multipliersOf("H4_MID_A", floor);
    if (floor <= 42) return multipliersOf("H4_MID_B", floor);
    if (floor === 43) return { hp: 3.00, def: 1.00, atk: 24.00, spd: 1.35 };
    if (floor <= 46) return multipliersOf("H4_MID_B", floor);
    if (floor === 47) return multipliersOf("H4_MID_A", floor);
    if (floor === 48) return multipliersOf("H4_MID_B", floor);
    if (floor <= 50) return multipliersOf("H4_MID_A", floor);
    if (floor <= 55) return multipliersOf("H4_MID_D", floor);
    if (floor <= 59) return multipliersOf("H4_MID_C", floor);
    if (floor === 60) return multipliersOf("H4_MID_A", floor);
    if (floor <= 65) return multipliersOf("H4_MID_C", floor);
    return multipliersOf("H4_MID_B", floor);
  }
  // 40～69FがHARDでもほぼ確勝だったため、耐久ではなく攻撃性能を上げる探索案。
  // 70Fは既に勝率0%なので、最新比較案の値をそのまま維持する。
  if (candidate === "H4_MID_A" || candidate === "H4_MID_B"
    || candidate === "H4_MID_C" || candidate === "H4_MID_D") {
    if (floor < 40 || floor >= 70) return multipliersOf("H3_LATE_SPD120", floor);
    const strong = candidate !== "H4_MID_A";
    const veryFast = candidate === "H4_MID_C" || candidate === "H4_MID_D";
    const maximum = candidate === "H4_MID_D";
    if (floor <= 49) return strong
      ? { hp: 3.00, def: 1.00, atk: 14.00, spd: 1.18 }
      : { hp: 3.00, def: 1.00, atk: 10.00, spd: 1.12 };
    if (floor === 50) return strong
      ? { hp: 1.50, def: 1.00, atk: 9.00, spd: 1.15 }
      : { hp: 1.50, def: 1.00, atk: 6.50, spd: 1.10 };
    if (floor <= 59) return veryFast
      ? { hp: 3.00, def: 1.00, atk: maximum ? 24.00 : 18.00, spd: maximum ? 1.50 : 1.35 }
      : strong
      ? { hp: 3.00, def: 1.00, atk: 12.00, spd: 1.18 }
      : { hp: 3.00, def: 1.00, atk: 9.00, spd: 1.12 };
    if (floor === 60) return strong
      ? { hp: 1.50, def: 1.00, atk: 8.00, spd: 1.15 }
      : { hp: 1.50, def: 1.00, atk: 6.00, spd: 1.10 };
    if (floor <= 65 && veryFast) return {
      hp: 2.50, def: 1.00, atk: maximum ? 22.00 : 16.00, spd: maximum ? 1.50 : 1.35,
    };
    return strong
      ? { hp: 2.50, def: 1.00, atk: 11.00, spd: 1.18 }
      : { hp: 2.50, def: 1.00, atk: 8.00, spd: 1.12 };
  }
  // 最新比較案。1～69FはH3を維持し、今回再評価した70F以降だけSPD×1.20へ揃える。
  // 既存のH3_SPD120は全100階のSPDを置き換える探索用なので、全階比較では使わない。
  if (candidate === "H3_LATE_SPD120") {
    const base = multipliersOf("H3", floor);
    return floor >= 70 ? { ...base, spd: 1.20 } : base;
  }
  if (candidate === "H3_SPD105" || candidate === "H3_SPD110" || candidate === "H3_SPD120") {
    const base = multipliersOf("H3", floor);
    const spd = candidate === "H3_SPD105" ? 1.05 : candidate === "H3_SPD110" ? 1.10 : 1.20;
    return { ...base, spd };
  }
  if (candidate === "H3") {
    if (floor === 70) return { hp: 0.80, def: 1.00, atk: 4.50, spd: 1.00 };
    if (floor >= 71 && floor <= 74) return { hp: 3.50, def: 1.00, atk: 30.00, spd: 1.15 };
    if (floor === 80) return { hp: 1.20, def: 1.00, atk: 7.00, spd: 1.05 };
    if (floor === 89) return { hp: 1.80, def: 1.00, atk: 10.00, spd: 1.05 };
    if (floor === 90) return { hp: 0.85, def: 1.00, atk: 3.00, spd: 1.00 };
    return multipliersOf("H2", floor);
  }
  if (candidate === "H2") {
    if (floor === 70) return { hp: 0.90, def: 1.00, atk: 3.50, spd: 1.00 };
    if (floor >= 71 && floor <= 74) return { hp: 3.50, def: 1.00, atk: 20.00, spd: 1.15 };
    if (floor === 80) return { hp: 1.30, def: 1.00, atk: 5.00, spd: 1.03 };
    if (floor >= 81 && floor <= 84) return { hp: 3.20, def: 1.00, atk: 18.00, spd: 1.12 };
    if (floor === 89) return { hp: 2.00, def: 1.00, atk: 7.00, spd: 1.03 };
    if (floor === 90) return { hp: 0.90, def: 1.00, atk: 2.50, spd: 1.00 };
    if (floor === 98 || floor === 99) return { hp: 2.00, def: 1.00, atk: 8.00, spd: 1.03 };
    return multipliersOf("H", floor);
  }
  if (candidate === "E_SPD1") {
    const base = multipliersOf("E", floor);
    return floor >= 81 && floor <= 99 ? { ...base, spd: 1 } : base;
  }
  if (candidate === "D100_LOW1") {
    return floor === 100
      ? { hp: 1.60, def: 1.15, atk: 1.40, spd: 1.03 }
      : multipliersOf("E", floor);
  }
  if (candidate === "D100_LOW2") {
    return floor === 100
      ? { hp: 1.30, def: 1.05, atk: 1.20, spd: 1.00 }
      : multipliersOf("E", floor);
  }
  if (candidate === "D") {
    const anchors = CANDIDATES.D;
    const upperIndex = anchors.findIndex((entry) => floor <= entry.maxFloor);
    if (upperIndex <= 0) return anchors[0].stats;
    if (upperIndex < 0) return anchors.at(-1)!.stats;
    const lower = anchors[upperIndex - 1];
    const upper = anchors[upperIndex];
    const t = (floor - lower.maxFloor) / (upper.maxFloor - lower.maxFloor);
    return {
      hp: lower.stats.hp + (upper.stats.hp - lower.stats.hp) * t,
      def: lower.stats.def + (upper.stats.def - lower.stats.def) * t,
      atk: lower.stats.atk + (upper.stats.atk - lower.stats.atk) * t,
      spd: lower.stats.spd + (upper.stats.spd - lower.stats.spd) * t,
    };
  }
  const band = CANDIDATES[candidate].find((entry) => floor <= entry.maxFloor);
  if (!band) throw new Error(`${candidate}の${floor}階倍率がない`);
  return band.stats;
}

type AbsoluteStats = { hp: number; def: number; atk: number; spd: number };

const ABSOLUTE_ANCHORS: Array<{ floor: number; stats: AbsoluteStats }> = [
  { floor: 1, stats: { hp: 54000, atk: 4300, def: 2360, spd: 135 } },
  { floor: 9, stats: { hp: 70000, atk: 5100, def: 2440, spd: 151 } },
  { floor: 19, stats: { hp: 85000, atk: 6200, def: 3000, spd: 158 } },
  { floor: 29, stats: { hp: 105000, atk: 7500, def: 3600, spd: 165 } },
  { floor: 39, stats: { hp: 130000, atk: 9000, def: 4300, spd: 172 } },
  { floor: 49, stats: { hp: 160000, atk: 11000, def: 5000, spd: 180 } },
  { floor: 59, stats: { hp: 190000, atk: 14000, def: 6200, spd: 200 } },
  { floor: 69, stats: { hp: 225000, atk: 17000, def: 7200, spd: 215 } },
  { floor: 79, stats: { hp: 265000, atk: 20000, def: 8200, spd: 230 } },
  { floor: 89, stats: { hp: 310000, atk: 23500, def: 9200, spd: 245 } },
  { floor: 99, stats: { hp: 360000, atk: 27000, def: 10500, spd: 260 } },
];

function absoluteStatsOf(floor: number): AbsoluteStats {
  const upperIndex = ABSOLUTE_ANCHORS.findIndex((entry) => floor <= entry.floor);
  if (upperIndex <= 0) return ABSOLUTE_ANCHORS[0].stats;
  if (upperIndex < 0) return ABSOLUTE_ANCHORS.at(-1)!.stats;
  const lower = ABSOLUTE_ANCHORS[upperIndex - 1];
  const upper = ABSOLUTE_ANCHORS[upperIndex];
  const t = (floor - lower.floor) / (upper.floor - lower.floor);
  return {
    hp: lower.stats.hp + (upper.stats.hp - lower.stats.hp) * t,
    def: lower.stats.def + (upper.stats.def - lower.stats.def) * t,
    atk: lower.stats.atk + (upper.stats.atk - lower.stats.atk) * t,
    spd: lower.stats.spd + (upper.stats.spd - lower.stats.spd) * t,
  };
}

function absoluteCurveEnemies(base: Scenario, floor: number): Scenario["enemies"] {
  const target = absoluteStatsOf(floor);
  const withStats = base.enemies.filter((enemy) => enemy.stats);
  const meanOf = (key: keyof AbsoluteStats): number =>
    withStats.reduce((sum, enemy) => sum + Number(enemy.stats?.[key] ?? 0), 0) / Math.max(1, withStats.length);
  const means = { hp: meanOf("hp"), def: meanOf("def"), atk: meanOf("atk"), spd: meanOf("spd") };
  return base.enemies.map((enemy) => {
    if (!enemy.stats) return enemy;
    const relative = (key: keyof AbsoluteStats): number => Number(enemy.stats?.[key] ?? means[key]) / Math.max(1, means[key]);
    return {
      ...enemy,
      stats: {
        ...enemy.stats,
        hp: Math.max(1, Math.round(target.hp * relative("hp"))),
        def: Math.max(1, Math.round(target.def * relative("def"))),
        atk: Math.max(1, Math.round(target.atk * relative("atk"))),
        spd: Math.max(1, Math.round(target.spd * relative("spd"))),
      },
    };
  });
}

function tower100CloneAuditHook(stats: StatMultipliers): ScenarioHook {
  return ({ unitOf }) => {
    let births = 0;
    let deathBuffs = 0;
    let prematureDeathBuffs = 0;
    let scaledSpawns = 0;
    let minBossHpRatio = 1;
    let reached70 = 0;
    let reached40 = 0;
    let reached20 = 0;

    const observeBoss = (): void => {
      const boss = unitOf("E1");
      if (!boss) return;
      const ratio = boss.maxHp > 0 ? Math.max(0, boss.currentHp) / boss.maxHp : 0;
      minBossHpRatio = Math.min(minBossHpRatio, ratio);
      if (ratio <= 0.70) reached70 = 1;
      if (ratio <= 0.40) reached40 = 1;
      if (ratio <= 0.20) reached20 = 1;
    };

    const scaleSpawnedClones = (): void => {
      for (const id of ["E2", "E3"]) {
        if (unitOf(id)?.multiplySpawnedStatsOnce(
          { atk: stats.atk, def: stats.def, spd: stats.spd },
          CRIMOARK_CLONE_HP_FLOOR * stats.hp,
        )) scaledSpawns += 1;
      }
    };

    return {
      beforeTurn() { scaleSpawnedClones(); observeBoss(); },
      afterTurn(_unitId, lines) {
        for (const line of lines) {
          if (line.includes("が生み出された！")) births += 1;
          if (line.includes("失った分身の力を取り込んだ！")) {
            deathBuffs += 1;
            if (deathBuffs > births) prematureDeathBuffs += 1;
          }
        }
        // S3で生成された直後、次の行動者を選ぶ前にHARD倍率を反映する。
        scaleSpawnedClones();
        observeBoss();
      },
      finish: () => ({
        births, deathBuffs, prematureDeathBuffs, scaledSpawns,
        minBossHpRatio, reached70, reached40, reached20,
      }),
    };
  };
}

function scaledScenario(floor: number, candidate: CandidateName, profile: PartyProfile): Scenario {
  const base = buildFloorScenario(floor);
  const stats = multipliersOf(candidate, floor);
  // 通常の塔基準編成とは別に、「先に動いてゲージ低下・気絶で返す手番を減らす」
  // 攻略編成も測る。敵や本編AIは一切変えず、味方の顔ぶれと既存プリセットだけを替える。
  const controlAllies: Scenario["allies"] = [
    { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
    { label: "アビスリーパー[闇]", templateId: "abyssreaper", element: "DARK", preset: "MAX_DEBUFFER" },
    { label: "グリフォン[光]", templateId: "griffon", element: "LIGHT", preset: "MAX_DEBUFFER" },
    { label: "ドラゴン[闇]", templateId: "dragon", element: "DARK", preset: "MAX_ATTACKER" },
    { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  ];
  const dotControlAllies: Scenario["allies"] = [
    { label: "クロノス[電気]", templateId: "chronos", element: "ELECTRIC", preset: "MAX_SPEED" },
    { label: "アビスリーパー[闇]", templateId: "abyssreaper", element: "DARK", preset: "MAX_DEBUFFER" },
    { label: "グリフォン[光]", templateId: "griffon", element: "LIGHT", preset: "MAX_DEBUFFER" },
    { label: "マッシュルン[火]", templateId: "mushroon", element: "FIRE", preset: "MAX_DEBUFFER" },
    { label: "ウィスプ[水]", templateId: "wisp", element: "WATER", preset: "MAX_HEALER" },
  ];
  const profileBase = profile === "DOT_CONTROL"
    ? dotControlAllies
    : profile === "CONTROL" || profile === "CONTROL_PLUS" ? controlAllies : base.allies;
  const isFutureGrowth = profile === "STRONG_PLUS" || profile === "CONTROL_PLUS";
  const allies = isFutureGrowth
    ? profileBase.map((ally) => ({
        ...ally,
        finalStatMultipliers: { hp: 1.25, atk: 1.25, def: 1.20, spd: 1.05 },
      }))
    : profileBase;
  if (candidate === "ABSOLUTE_CURVE") {
    return {
      ...base,
      allies,
      id: `${base.id}-hard-absolute-curve`,
      title: `${base.title} HARD実数カーブ検証`,
      maxTurns: MAX_TURNS,
      enemies: absoluteCurveEnemies(base, floor),
    };
  }
  if (candidate === "NORMAL") {
    return {
      ...base,
      allies,
      maxTurns: MAX_TURNS,
      // NORMALも同じ監査を付け、分身生成と撃破時強化の比較基準を残す。
      hook: floor === 100 ? tower100CloneAuditHook(stats) : undefined,
    };
  }
  return {
    ...base,
    allies,
    id: `${base.id}-hard-${candidate.toLowerCase()}`,
    title: `${base.title} HARD候補${candidate}`,
    maxTurns: MAX_TURNS,
    enemies: base.enemies.map((enemy) => ({
      ...enemy,
      stats: enemy.stats ? {
        ...enemy.stats,
        hp: Math.max(1, Math.round((enemy.stats.hp ?? 1) * stats.hp)),
        def: Math.max(1, Math.round((enemy.stats.def ?? 1) * stats.def)),
        atk: Math.max(1, Math.round((enemy.stats.atk ?? 1) * stats.atk)),
        spd: Math.max(1, Math.round((enemy.stats.spd ?? 1) * stats.spd)),
      } : enemy.stats,
    })),
    // 100階だけ、戦闘中に作り直される分身の基礎値も同じ倍率へ揃える。
    hook: floor === 100 ? tower100CloneAuditHook(stats) : undefined,
  };
}

const mean = (values: number[]): number => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const quantile = (values: number[], q: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};

function maxEnemyStreak(tally: BattleTally): number {
  let max = 0;
  let current = 0;
  for (const line of tally.log) {
    const action = /^\[(味方|敵):[PE]\d+\][^「]*の「.+」！$/.exec(line);
    if (!action) continue;
    if (action[1] === "敵") { current += 1; max = Math.max(max, current); }
    else current = 0;
  }
  return max;
}

function firstEnemyActionOrdinal(tally: BattleTally): number | null {
  let ordinal = 0;
  for (const line of tally.log) {
    const action = /^\[(味方|敵):[PE]\d+\][^「]*の「.+」！$/.exec(line);
    if (!action) continue;
    ordinal += 1;
    if (action[1] === "敵") return ordinal;
  }
  return null;
}

function summarize(floor: number, candidate: CandidateName, profile: PartyProfile, stats: StatMultipliers, tallies: BattleTally[]) {
  const turns = tallies.map((tally) => tally.turns);
  const wins = tallies.filter((tally) => tally.winner === "PLAYER").length;
  const wipes = tallies.filter((tally) => tally.units.filter((u) => u.team === "PLAYER").every((u) => !u.alive)).length;
  const timeouts = tallies.filter((tally) => tally.winner === "DRAW").length;
  const allyLeft = tallies.map((tally) => {
    const units = tally.units.filter((u) => u.team === "PLAYER");
    const maxHp = units.reduce((sum, unit) => sum + unit.maxHp, 0);
    return maxHp ? units.reduce((sum, unit) => sum + Math.max(0, unit.hpLeft), 0) / maxHp : 0;
  });
  const enemyLeft = tallies.map((tally) => {
    const units = tally.units.filter((u) => u.team === "ENEMY");
    const maxHp = units.reduce((sum, unit) => sum + unit.maxHp, 0);
    return maxHp ? units.reduce((sum, unit) => sum + Math.max(0, unit.hpLeft), 0) / maxHp : 0;
  });
  const enemyActionRatios = tallies.map((tally) => {
    const enemy = tally.units.filter((u) => u.team === "ENEMY").reduce((sum, unit) => sum + unit.actions, 0);
    const player = tally.units.filter((u) => u.team === "PLAYER").reduce((sum, unit) => sum + unit.actions, 0);
    return enemy / Math.max(1, player);
  });
  const streaks = tallies.map(maxEnemyStreak);
  const enemyActions = tallies.map((tally) => tally.units
    .filter((unit) => unit.team === "ENEMY")
    .reduce((sum, unit) => sum + unit.actions, 0));
  const firstEnemyActions = tallies.map(firstEnemyActionOrdinal).filter((value): value is number => value !== null);
  const enemyDefeatedRates = tallies.map((tally) => {
    const enemies = tally.units.filter((unit) => unit.team === "ENEMY");
    return enemies.length ? enemies.filter((unit) => !unit.alive).length / enemies.length : 0;
  });
  const extras = (key: string): number => tallies.reduce((sum, tally) => sum + (tally.extra[key] ?? 0), 0);
  const allySurvivors = tallies.map((tally) => tally.units.filter((unit) => unit.team === "PLAYER" && unit.alive).length);
  const playerStuns = tallies.map((tally) => tally.units
    .filter((unit) => unit.team === "PLAYER")
    .reduce((sum, unit) => sum + unit.stunsLanded, 0));
  const playerGaugeDrains = tallies.map((tally) => tally.units
    .filter((unit) => unit.team === "PLAYER")
    .reduce((sum, unit) => sum + unit.gaugeDrains, 0));
  const survivorDistribution = Object.fromEntries(
    Array.from({ length: 6 }, (_, count) => [count, allySurvivors.filter((value) => value === count).length]),
  );
  const bossHpLeft = tallies.map((tally) => {
    const boss = tally.units.find((unit) => unit.id === "E1");
    return boss && boss.maxHp > 0 ? Math.max(0, boss.hpLeft) / boss.maxHp : 0;
  });

  return {
    floor, candidate, profile, multipliers: stats, runs: tallies.length,
    winRate: wins / tallies.length,
    medianTurns: quantile(turns, 0.5),
    meanTurns: mean(turns),
    wipeRate: wipes / tallies.length,
    timeoutRate: timeouts / tallies.length,
    allyHpLeftRate: mean(allyLeft),
    enemyHpLeftRate: mean(enemyLeft),
    meanAllySurvivors: mean(allySurvivors),
    offensePressure: {
      enemyActedRate: enemyActions.filter((value) => value > 0).length / tallies.length,
      meanEnemyActions: mean(enemyActions),
      meanFirstEnemyActionOrdinal: mean(firstEnemyActions),
      enemyDefeatedRate: mean(enemyDefeatedRates),
    },
    speedPressure: {
      enemyActionsPerPlayerAction: mean(enemyActionRatios),
      meanMaxEnemyStreak: mean(streaks),
      p95MaxEnemyStreak: quantile(streaks, 0.95),
      battlesWithEnemyStreak8Plus: streaks.filter((value) => value >= 8).length / tallies.length,
    },
    controlPressure: {
      playerStunsPerBattle: mean(playerStuns),
      playerGaugeDrainsPerBattle: mean(playerGaugeDrains),
      battlesWithoutEnemyAction: enemyActions.filter((value) => value === 0).length / tallies.length,
    },
    tower100: floor === 100 ? {
      cloneBirths: extras("births"),
      cloneDeathBuffs: extras("deathBuffs"),
      prematureDeathBuffs: extras("prematureDeathBuffs"),
      scaledSpawns: extras("scaledSpawns"),
      cloneBirthsPerBattle: extras("births") / tallies.length,
      cloneKillsPerBattle: extras("deathBuffs") / tallies.length,
      bossHpLeftRate: mean(bossHpLeft),
      bossHpLeftMedian: quantile(bossHpLeft, 0.5),
      minBossHpRate: extras("minBossHpRatio") / tallies.length,
      reached70Rate: extras("reached70") / tallies.length,
      reached40Rate: extras("reached40") / tallies.length,
      reached20Rate: extras("reached20") / tallies.length,
      survivorDistribution,
    } : undefined,
  };
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const rows: ReturnType<typeof summarize>[] = [];

resetBalanceFlags();
try {
  for (const floor of FLOORS) {
    for (const candidate of REQUESTED_CANDIDATES) {
      for (const profile of REQUESTED_PROFILES) {
        const scenario = scaledScenario(floor, candidate, profile);
        process.stderr.write(`測定中: ${floor}F ${candidate} ${profile} ${RUNS}戦 / seed ${SEED}\n`);
        // 既存 `tools/towerFloorScan.ts` と同じく、対象の強制指定はせず既存AIへ任せる。
        const tallies = runMany(scenario, SEED, RUNS, undefined, "STRONG");
        const row = summarize(floor, candidate, profile, multipliersOf(candidate, floor), tallies);
        rows.push(row);
        console.log(
          `${String(floor).padStart(3)}F ${candidate.padEnd(6)} ${profile.padEnd(11)} 勝${pct(row.winRate).padStart(6)} `
          + `手数${String(row.medianTurns).padStart(3)}/${row.meanTurns.toFixed(1).padStart(5)} `
          + `全滅${pct(row.wipeRate).padStart(6)} 時切${pct(row.timeoutRate).padStart(6)} `
          + `味方残${pct(row.allyHpLeftRate).padStart(6)} 敵残${pct(row.enemyHpLeftRate).padStart(6)} `
          + `敵行動有${pct(row.offensePressure.enemyActedRate).padStart(6)} 敵撃破${pct(row.offensePressure.enemyDefeatedRate).padStart(6)} `
          + `敵/味方行動${row.speedPressure.enemyActionsPerPlayerAction.toFixed(2)} `
          + `敵連続p95=${row.speedPressure.p95MaxEnemyStreak} `
          + `味方気絶${row.controlPressure.playerStunsPerBattle.toFixed(1)} ゲージ吸収${row.controlPressure.playerGaugeDrainsPerBattle.toFixed(1)}`,
        );
      }
    }
  }
} finally {
  resetBalanceFlags();
}

const baselines = new Map(rows.filter((row) => row.candidate === "NORMAL").map((row) => [`${row.floor}:${row.profile}`, row]));
const output = rows.map((row) => {
  const normal = baselines.get(`${row.floor}:${row.profile}`);
  return {
    ...row,
    versusNormal: normal ? {
      winRatePoints: (row.winRate - normal.winRate) * 100,
      medianTurns: row.medianTurns - normal.medianTurns,
      meanTurns: row.meanTurns - normal.meanTurns,
      allyHpLeftPoints: (row.allyHpLeftRate - normal.allyHpLeftRate) * 100,
      enemyHpLeftPoints: (row.enemyHpLeftRate - normal.enemyHpLeftRate) * 100,
    } : undefined,
  };
});

const resultDir = resolve(HERE, "battleLab/results");
mkdirSync(resultDir, { recursive: true });
const resultPath = resolve(resultDir, `${OUT_NAME}.json`);
writeFileSync(resultPath, JSON.stringify({ runs: RUNS, seed: SEED, gear: "STRONG", profiles: REQUESTED_PROFILES, maxTurns: MAX_TURNS, rows: output }, null, 2) + "\n", "utf8");
const csvColumns = [
  "floor", "candidate", "profile", "isBoss", "hpMultiplier", "defMultiplier", "atkMultiplier", "spdMultiplier",
  "winRate", "medianTurns", "meanTurns", "wipeRate", "timeoutRate", "allyHpLeftRate", "enemyHpLeftRate",
  "meanAllySurvivors", "enemyActionsPerPlayerAction", "p95MaxEnemyStreak", "battlesWithEnemyStreak8Plus",
  "enemyActedRate", "meanEnemyActions", "meanFirstEnemyActionOrdinal", "enemyDefeatedRate",
  "playerStunsPerBattle", "playerGaugeDrainsPerBattle", "battlesWithoutEnemyAction",
];
const csvRows = output.map((row) => [
  row.floor, row.candidate, row.profile, row.floor % 10 === 0, row.multipliers.hp, row.multipliers.def, row.multipliers.atk, row.multipliers.spd,
  row.winRate, row.medianTurns, row.meanTurns, row.wipeRate, row.timeoutRate, row.allyHpLeftRate, row.enemyHpLeftRate,
  row.meanAllySurvivors, row.speedPressure.enemyActionsPerPlayerAction, row.speedPressure.p95MaxEnemyStreak,
  row.speedPressure.battlesWithEnemyStreak8Plus,
  row.offensePressure.enemyActedRate, row.offensePressure.meanEnemyActions,
  row.offensePressure.meanFirstEnemyActionOrdinal, row.offensePressure.enemyDefeatedRate,
  row.controlPressure.playerStunsPerBattle, row.controlPressure.playerGaugeDrainsPerBattle,
  row.controlPressure.battlesWithoutEnemyAction,
]);
const csvPath = resolve(resultDir, `${OUT_NAME}.csv`);
writeFileSync(csvPath, [csvColumns, ...csvRows].map((row) => row.join(",")).join("\n") + "\n", "utf8");
console.log(`\nRAW_RESULT=${resultPath}`);
console.log(`CSV_RESULT=${csvPath}`);
