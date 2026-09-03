/**
 * シナリオの棚。
 *
 * 新しく足す時は、ここへ1行 import して並べるだけ。
 * `--scenario <id>` の `<id>` は `Scenario.id` を見ている。
 */
import type { Scenario } from "../types.js";
import { TOWER60 } from "./tower60.js";
import { TOWER60_V2 } from "./tower60v2.js";
import { TOWER_FLOOR_SCENARIOS } from "./towerFloors.js";

export const SCENARIOS: Scenario[] = [TOWER60, TOWER60_V2, ...TOWER_FLOOR_SCENARIOS];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}
