import type { ScenarioProbe, TrackedUnit } from "../types.js";
import { tower70V4Probe } from "./probeV4.js";
import type { Tower70Numbers } from "./spec.js";

const PULSE = "E3";
const PLAYER_IDS = ["P1", "P2", "P3", "P4", "P5"] as const;

/**
 * 第5回: 命脈断ちを「現在HPが高い生存3体」へ拡張する。
 *
 * 第4回probeの内部で1位の対象が既に半減するので、
 * その手番の開始時HPで順位を保存し、2位・3位だけを追加で半減する。
 * これにより発動時点の上位3体が同時に50%になる。
 */
export function tower70V5Probe(
  context: { unitOf(id: string): TrackedUnit | undefined; aliveOf(id: string): boolean },
  numbers: Tower70Numbers,
): ScenarioProbe {
  const base = tower70V4Probe(context, numbers);
  let rankedAtPulseTurn: string[] = [];
  let extraCrushTargets = 0;
  let extraCrushRemoved = 0;

  const snapshotRank = (): string[] => PLAYER_IDS
    .map((id) => ({ id, unit: context.unitOf(id) }))
    .filter((entry): entry is { id: string; unit: TrackedUnit } => Boolean(entry.unit?.alive))
    .sort((a, b) => b.unit.currentHp - a.unit.currentHp)
    .map((entry) => entry.id);

  return {
    beforeTurn(unitId) {
      if (unitId === PULSE) rankedAtPulseTurn = snapshotRank();
      base.beforeTurn(unitId);
    },

    afterTurn(unitId, lines) {
      const usedCrush = unitId === PULSE && lines.some((line) => line.includes("「命脈断ち」"));
      const ranked = usedCrush ? [...rankedAtPulseTurn] : [];

      base.afterTurn(unitId, lines);

      if (usedCrush) {
        // 1位はbase probeが処理済み。2位・3位を追加で半減する。
        for (const id of ranked.slice(1, 3)) {
          const unit = context.unitOf(id);
          if (!unit?.alive) continue;
          const before = unit.currentHp;
          const after = Math.max(1, Math.round(before * 0.5));
          unit.currentHp = after;
          extraCrushTargets += 1;
          extraCrushRemoved += before - after;
        }
      }
    },

    finish() {
      return {
        ...base.finish(),
        V5命脈断ち追加対象数: extraCrushTargets,
        V5命脈断ち追加削り: extraCrushRemoved,
      };
    },
  };
}
