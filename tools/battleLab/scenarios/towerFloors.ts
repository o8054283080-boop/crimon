/**
 * 試練の塔の階を、**本編のデータそのまま**測るシナリオ。
 *
 * ## 他のシナリオと決定的に違うところ
 *
 * `tower60` / `tower60v2` は「こういう階にしたらどうなるか」を書いた**仮の盤面**で、
 * 本編とは切り離してある。こちらは逆で、`src/data/trialTower.ts` が組んだ階を
 * `buildDungeonEnemyTeam` に通した結果を丸ごと持ってくる。
 * だから**ここで出た数字は本編の数字**で、階を触れば自動でついてくる。
 *
 * ## 測れないこと
 *
 * 塔はHPとクールタイムを次の階へ持ち越す。この道具は1戦だけを測るので、
 * ここの勝率は**全回復から その階だけに挑んだ場合**の値になる。
 * 実際の登坂は削られた状態で入るので、通しの到達階は
 * `npx tsx tools/towerPressure.mjs` の方で測ること。
 *
 * ## 使い方
 *
 *   npx tsx tools/battleLab/index.ts --scenario tower-f99 --runs 200 --gear TYPICAL
 *   npx tsx tools/battleLab/index.ts --list          # 生えている階の一覧
 */
import type { MonsterDefinition } from "../../../src/core/monster.js";
import { findTowerFloor } from "../../../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../../../src/game/dungeonRunner.js";
import type { EnemySpec, Scenario } from "../types.js";
import { TOWER60 } from "./tower60.js";

/** 測る階。**代表点だけ。**全100階を生やすと `--list` が読めなくなる */
const MEASURED_FLOORS = [51, 55, 59, 60, 61, 65, 69, 71, 75, 79, 81, 85, 89, 91, 95, 99];

function toEnemySpec(def: MonsterDefinition, index: number): EnemySpec {
  return {
    // 同名の敵が並ぶ階があるので、狙う順で名指しできるよう番号を付ける
    label: `${index + 1}. ${def.name}`,
    templateId: def.templateId,
    element: def.element,
    // **実効ステータスを丸ごと渡す。**一部だけ渡すと、残りが Battle Lab 側の
    // 組み立て(能力ポイントや潜在)から来て本編と食い違う
    stats: { ...def.stats },
    skills: def.skills,
    bossTraits: def.bossTraits,
    victoryTarget: def.victoryTarget,
    initialCooldowns: def.initialCooldowns,
  };
}

function buildFloorScenario(floor: number): Scenario {
  const def = findTowerFloor(floor);
  if (!def) throw new Error(`試練の塔にない階: ${floor}`);
  const enemies = buildDungeonEnemyTeam(def).map(toEnemySpec);
  const victoryTarget = enemies.find((enemy) => enemy.victoryTarget);
  return {
    id: `tower-f${floor}`,
    title: `試練の塔 ${def.name}(本編)`,
    note: `本編の${def.floor}階をそのまま。敵${enemies.length}体。全回復から1戦だけ挑んだ場合の値`,
    maxTurns: 300,
    // **範囲は置かない。**階ごとに狙いが違うので、1つの範囲で全部を測ると
    // どれかが必ず警告を出し続けて意味を失う
    allies: TOWER60.allies,
    enemies,
    focusPatterns: victoryTarget
      ? [
        { name: "本体集中", order: [victoryTarget.label!] },
        { name: "既存AIまかせ", order: [] },
      ]
      : [{ name: "既存AIまかせ", order: [] }],
  };
}

export const TOWER_FLOOR_SCENARIOS: Scenario[] = MEASURED_FLOORS.map(buildFloorScenario);
