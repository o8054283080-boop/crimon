/**
 * 試練の塔90階を、**本編に入った実装のまま**測る盤面。
 *
 * ## V1〜V7の盤面と決定的に違うところ
 *
 * `tower90v1`〜`tower90v7` は「こういう階にしたらどうなるか」を書いた仮案で、
 * 狂化も脆弱も `hook`(観測点)が外から張り替えていた。ここは逆で、
 *
 *   - 敵の顔ぶれとステータスは `src/data/trialTowerFloor90.ts`
 *   - 狂化・与ダメ倍率・戦鼓晶の追加テンポ・処刑突撃2.9倍は `src/battle/engine.ts`
 *
 * のどちらも本編そのもの。**フックは1つも使っていない。**
 * だからここで出た数字は本編90階の数字で、階を触れば自動でついてくる。
 *
 * ## 使い方
 *
 *   npx tsx tools/battleLab/index.ts --scenario tower-90-live --runs 1000 --gear TYPICAL \
 *     --focus "安全: 狂牙獣→戦鼓晶→ボス"
 *
 * ## 測れないこと
 *
 * 塔はHPとクールタイムを次の階へ持ち越す。ここは**全回復から1戦だけ**の値。
 * 通しの到達階は `npx tsx tools/towerPressure.mjs` の方で測ること。
 */
import type { MonsterDefinition } from "../../../src/core/monster.js";
import { findTowerFloor } from "../../../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../../../src/game/dungeonRunner.js";
import type { EnemySpec, Scenario } from "../types.js";
import {
  TOWER90_RUSH_FOCUS,
  TOWER90_RUSH_PARTY,
  TOWER90_SAFE_FOCUS,
  TOWER90_SAFE_PARTY,
} from "./tower90v1.js";

function toEnemySpec(def: MonsterDefinition): EnemySpec {
  return {
    // 狙う順は V1〜V7 と同じ名前で書けるようにする(【BOSS】の印は外す)
    label: def.name.replace(" 【BOSS】", ""),
    templateId: def.templateId,
    element: def.element,
    // **実効ステータスを丸ごと渡す。**一部だけ渡すと、残りが Battle Lab 側の
    // 組み立てから来て本編と食い違う
    stats: { ...def.stats },
    skills: def.skills,
    bossTraits: def.bossTraits,
    victoryTarget: def.victoryTarget,
    initialCooldowns: def.initialCooldowns,
  };
}

const enemies: EnemySpec[] = buildDungeonEnemyTeam(findTowerFloor(90)!).map(toEnemySpec);

const base = {
  enemies,
  maxTurns: 300,
  // これが本編の仕掛けを動かす唯一の鍵。**hook は書かない**
  trialTowerFloor: 90,
};

export const TOWER90_LIVE_SAFE: Scenario = {
  id: "tower-90-live",
  title: "試練の塔90階 狂化(本編)",
  note: "本編の90階をそのまま。狂化・脆弱・戦鼓晶の追加テンポは engine の実装が動く。全回復から1戦だけの値",
  allies: TOWER90_SAFE_PARTY,
  focusPatterns: TOWER90_SAFE_FOCUS,
  ...base,
};

export const TOWER90_LIVE_RUSH: Scenario = {
  id: "tower-90-live-rush",
  title: "試練の塔90階 狂化(本編)ボス速攻型",
  note: "本編の90階へ、お供を残してボスへ直行する編成で挑む。安全処理型との比較用",
  allies: TOWER90_RUSH_PARTY,
  focusPatterns: TOWER90_RUSH_FOCUS,
  ...base,
};
