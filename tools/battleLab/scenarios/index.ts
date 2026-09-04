/**
 * シナリオの棚。
 *
 * 新しく足す時は、ここへ1行 import して並べるだけ。
 * `--scenario <id>` の `<id>` は `Scenario.id` を見ている。
 */
import type { Scenario } from "../types.js";
import { TOWER60 } from "./tower60.js";
import { TOWER60_V2 } from "./tower60v2.js";
import { TOWER90_LIVE_RUSH, TOWER90_LIVE_SAFE } from "./tower90Live.js";
import { TOWER_FLOOR_SCENARIOS } from "./towerFloors.js";

export const SCENARIOS: Scenario[] = [
  TOWER60,
  TOWER60_V2,
  // 90階だけは `trialTowerFloor` を渡す。狂化・脆弱は engine 側の実装が動く
  TOWER90_LIVE_SAFE,
  TOWER90_LIVE_RUSH,
  ...TOWER_FLOOR_SCENARIOS,
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
