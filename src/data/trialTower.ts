import { Element } from "../core/element.js";
import { SkillEffect } from "../core/skill.js";
import { Star, levelMultiplier, starMultiplier } from "../core/rarity.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { ANCIENT_DEMON, findMonster } from "./monsters.js";
import { TOWER60_ENEMIES } from "./trialTowerFloor60.js";
import { TOWER70_ENEMIES } from "./trialTowerFloor70.js";
import { TOWER80_ENEMIES } from "./trialTowerFloor80.js";
import { TOWER90_ENEMIES } from "./trialTowerFloor90.js";
import { TOWER100_ENEMIES } from "./trialTowerFloor100.js";
import {
  isTowerUpperFloor,
  towerUpperEnemies,
  towerUpperFloorDef,
  towerUpperNote,
  towerUpperSwiftFloorSpd,
} from "./trialTowerUpper.js";

/**
 * 試練の塔。
 *
 * 既存のダンジョンは1階=1戦で、毎回全回復から始まる。だから「削られたまま次へ行く」
 * という状況が一度も起きず、**回復・継続回復・免疫・耐久のスキルに出番が無かった**。
 * 塔はそこを埋める。HPとクールタイムを次の階へ持ち越すので、
 * 「どれだけ削られずに勝つか」が初めて意味を持つ。
 *
 * ## 階の傾向について
 *
 * 難しくする時、**プレイヤーの戦い方を封じる方向へは倒さない**。
 * 一度ボスに継続ダメージ耐性を持たせて撤回している(毒も耐久もちゃんとした戦術で、
 * それを封じるのは戦い方を選んだこと自体への罰だった)。
 *
 * 代わりに**敵の側の性質**を変える。敵が回復するなら削り切る手に、敵が盾を張るなら
 * 削り続ける手に、敵が数で来るなら全体攻撃に、敵が速いなら手番を奪う手に場面が回る。
 * これは特定の戦術を潰すのではなく、別の戦術へ**場面を配る**やり方になる。
 *
 * 50階までの傾向に「回復封じ・剥がしに場面が回る」を入れていないのは、
 * この帯を作った時点で**プレイヤー側にその手が無かった**から。
 * STRIP と HEAL_BLOCK を持つのは敵専用の古代の呪晶だけで、
 * 通常モンスターにも高レアにも1体もいなかった(全図鑑を機械的に数えて確認した)。
 * 持っていない答えを前提に階を作ると、それは場面ではなく通行止めになる。
 *
 * **いまは11種が入って、その手はプレイヤー側にもある**
 * (アビスリーパー・マッシュルン・ミミック・フェンリル)。
 * だから51階以降には妨害・弱体の階を置いてある。50階までは据え置き
 * (途中で性質を変えると、途中まで登った人の壁が動く)。
 *
 * ## 51階以降は別の作りになっている
 *
 * 下の `towerPowerOf` の曲線が受け持つのは**50階まで**。
 * 51〜99階の通常階は `trialTowerUpper.ts` の固定編成+実数の帯で、
 * 60階は `trialTowerFloor60.ts`、70階は `trialTowerFloor70.ts` の専用編成。
 * 80/90/100階は従来の特殊ボス曲線に乗っている。
 */

export type TowerTrait =
  | "NONE"
  | "HEALER"
  | "WARD"
  | "SWARM"
  | "SWIFT";

export const TOWER_TRAIT_LABEL: Record<TowerTrait, string> = {
  NONE: "",
  HEALER: "癒やしの階",
  WARD: "守りの階",
  SWARM: "群れの階",
  SWIFT: "疾風の階",
};

export const TOWER_TRAIT_NOTE: Record<TowerTrait, string> = {
  NONE: "",
  HEALER: "敵が味方を癒やします。削りきる前に戻されます。",
  WARD: "敵が盾と免疫を張ります。素直に殴っても通りません。",
  SWARM: "敵の数が多く、手番が多く回ります。",
  SWIFT: "敵が速く、先に動いてきます。",
};

export interface TowerFloor {
  floor: number;
  name: string;
  label: string;
  note: string;
  trait: TowerTrait;
  enemies: DungeonEnemy[];
  powerScale: number;
  speedScale: number;
  firstClearReward: TowerReward;
}

export interface TowerReward {
  crystal?: number;
  gold?: number;
  summonScroll?: number;
  pigStar?: Star;
  equipmentStar?: Star;
  awakeningOrbs?: number;
  fourStarSummonScrolls?: number;
  lightDarkFourStarSummonScrolls?: number;
  fiveStarSummonScrolls?: number;
  skillPigs?: number;
}

export const TOWER_FLOOR_COUNT = 100;
export const TOWER_CHECKPOINT_INTERVAL = 10;
export const TOWER_BOSS_INTERVAL = 10;
export const TOWER_STAMINA_COST = 2;

export function isTowerCheckpoint(floor: number): boolean {
  return floor % TOWER_CHECKPOINT_INTERVAL === 0;
}

export function isTowerBossFloor(floor: number): boolean {
  return floor % TOWER_BOSS_INTERVAL === 0;
}

export function towerStartFloor(bestFloor: number): number {
  return Math.floor(bestFloor / TOWER_CHECKPOINT_INTERVAL) * TOWER_CHECKPOINT_INTERVAL + 1;
}

const CYCLE: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

const ATTACKER_ROSTER: { templateId: string; element: Element }[] = [
  { templateId: "slime", element: "GRASS" },
  { templateId: "wolf", element: "FIRE" },
  { templateId: "imp", element: "WATER" },
  { templateId: "knight", element: "GRASS" },
  { templateId: "slime", element: "ELECTRIC" },
  { templateId: "wolf", element: "WATER" },
  { templateId: "imp", element: "FIRE" },
  { templateId: "knight", element: "WATER" },
  { templateId: "slime", element: "WATER" },
  { templateId: "wolf", element: "GRASS" },
  { templateId: "imp", element: "GRASS" },
  { templateId: "knight", element: "FIRE" },
];

const TRAIT_ANCHORS: Record<TowerTrait, { templateId: string; element: Element }[]> = {
  NONE: [],
  HEALER: [
    { templateId: "fairy", element: "WATER" },
    { templateId: "fairy", element: "ELECTRIC" },
    { templateId: "wisp", element: "GRASS" },
    { templateId: "treant", element: "FIRE" },
  ],
  WARD: [
    { templateId: "golem", element: "GRASS" },
    { templateId: "treant", element: "ELECTRIC" },
    { templateId: "golem", element: "WATER" },
    { templateId: "wisp", element: "WATER" },
  ],
  SWARM: [],
  SWIFT: [
    { templateId: "wolf", element: "ELECTRIC" },
    { templateId: "imp", element: "ELECTRIC" },
  ],
};

export const TOWER_TRAIT_REQUIRED_EFFECTS: Partial<Record<TowerTrait, SkillEffect["kind"][]>> = {
  HEALER: ["HEAL", "REGEN"],
  WARD: ["SHIELD"],
};

function traitOf(floor: number): TowerTrait {
  if (isTowerBossFloor(floor)) return "NONE";
  const upper = towerUpperFloorDef(floor);
  if (upper) return upper.trait;
  if (floor < TOWER_BOSS_INTERVAL) return "NONE";
  const order: TowerTrait[] = ["NONE", "HEALER", "SWARM", "WARD", "SWIFT"];
  return order[floor % order.length];
}

const TOWER_POWER_START = 3.0;
const TOWER_POWER_GROWTH = 1.07;

function towerPowerOf(floor: number): number {
  if (floor <= 30) return TOWER_POWER_START * TOWER_POWER_GROWTH ** (floor - 1);
  const anchors: [number, number][] = [[30, 21.32], [40, 34], [50, 55], [60, 92], [70, 180], [80, 340], [90, 620], [100, 1100]];
  const upper = anchors.findIndex(([f]) => floor <= f);
  const [f1, p1] = anchors[Math.max(0, upper - 1)];
  const [f2, p2] = anchors[upper];
  return p1 * (p2 / p1) ** ((floor - f1) / (f2 - f1));
}

const ENEMY_HP_RATIO_START = 1;
const ENEMY_HP_RATIO_END = 0.65;

function enemyHpRatioOf(floor: number): number {
  const t = (Math.min(floor, 30) - 1) / 29;
  return ENEMY_HP_RATIO_START + (ENEMY_HP_RATIO_END - ENEMY_HP_RATIO_START) * t;
}

function powerScaleOf(floor: number): number {
  const star = enemyStarOf(floor);
  const statMultiplier = starMultiplier(star) * levelMultiplier(star, enemyLevelOf(floor));
  return Number((towerPowerOf(floor) / statMultiplier).toFixed(3));
}

function speedScaleOf(floor: number): number {
  if (floor <= 30) return Number((0.92 + (floor - 1) * 0.0138).toFixed(3));
  return Number((1.32 + (floor - 30) * 0.012).toFixed(3));
}

function enemyStarOf(floor: number): Star {
  if (floor <= 8) return 4;
  if (floor <= 18) return 5;
  return 6;
}

function enemyLevelOf(floor: number): number {
  if (floor <= 8) return 24 + floor * 2;
  if (floor <= 18) return 30 + (floor - 8) * 2;
  return Math.min(60, 36 + (floor - 18) * 2);
}

function rewardOf(floor: number): TowerReward {
  if (floor <= 30) {
    if (floor === 30) return { crystal: 500, gold: 30000, summonScroll: 3, equipmentStar: 6, pigStar: 3 };
    if (floor === 15) return { crystal: 70, gold: 4500, equipmentStar: 4 };
    if (floor % 10 === 0) return { crystal: 100 + floor * 5, gold: 2000 + floor * 400, summonScroll: 1, equipmentStar: 5, pigStar: 3 };
    if (floor % 5 === 0) return { crystal: 40 + floor * 2, gold: 1500 + floor * 200, equipmentStar: 4 };
    return { crystal: 10 + floor, gold: 400 + floor * 100 };
  }
  const milestones: Partial<Record<number, TowerReward>> = {
    40: { crystal: 600, summonScroll: 10 },
    50: { crystal: 800, fourStarSummonScrolls: 1, awakeningOrbs: 2 },
    60: { crystal: 1_200, summonScroll: 10, fourStarSummonScrolls: 1 },
    70: { crystal: 1_500, fiveStarSummonScrolls: 1, skillPigs: 1 },
    80: { crystal: 2_000, fourStarSummonScrolls: 3, lightDarkFourStarSummonScrolls: 1 },
    90: { crystal: 2_500, skillPigs: 3, awakeningOrbs: 3 },
    100: { crystal: 3_000, summonScroll: 30, lightDarkFourStarSummonScrolls: 3, fiveStarSummonScrolls: 1 },
  };
  if (milestones[floor]) return milestones[floor]!;
  return { gold: floor * 1_000 };
}

const BOSS_HP_MULTIPLIER = 2.2;
const BOSS_SPD_MULTIPLIER = 1.15;

const TRAIT_ANCHOR_HP: Record<TowerTrait, number> = {
  NONE: 1,
  HEALER: 1.3,
  WARD: 1.4,
  SWARM: 1,
  SWIFT: 1.35,
};

const TRAIT_ANCHOR_SPD: Record<TowerTrait, number> = {
  NONE: 1,
  HEALER: 1.3,
  WARD: 1,
  SWARM: 1,
  SWIFT: 1,
};

const TRAIT_SWIFT_SPD = 1.2;
const TRAIT_SWIFT_ANCHOR_SPD = 1.45;

function enemiesOf(floor: number, trait: TowerTrait): DungeonEnemy[] {
  if (floor === 60) return TOWER60_ENEMIES.map((enemy) => ({ ...enemy }));
  if (floor === 70) return TOWER70_ENEMIES.map((enemy) => ({ ...enemy }));
  if (floor === 80) return TOWER80_ENEMIES.map((enemy) => ({ ...enemy }));
  if (floor === 90) return TOWER90_ENEMIES.map((enemy) => ({ ...enemy }));
  if (floor === 100) return TOWER100_ENEMIES.map((enemy) => ({ ...enemy }));
  const upper = towerUpperEnemies(floor);
  if (upper) return upper;

  const star = enemyStarOf(floor);
  const level = enemyLevelOf(floor);
  const element = CYCLE[(floor - 1) % CYCLE.length];
  const hpRatio = enemyHpRatioOf(floor);
  const trash = (i: number): DungeonEnemy => ({
    ...ATTACKER_ROSTER[(floor * 3 + i) % ATTACKER_ROSTER.length],
    star,
    level,
    hpMultiplier: hpRatio,
  });

  if (isTowerBossFloor(floor)) {
    return [
      {
        templateId: ANCIENT_DEMON.templateId,
        element,
        star,
        level,
        isBoss: true,
        hpMultiplier: BOSS_HP_MULTIPLIER * hpRatio,
        spdMultiplier: BOSS_SPD_MULTIPLIER,
      },
      trash(0),
      trash(1),
    ];
  }

  const anchors = TRAIT_ANCHORS[trait];
  const anchor = anchors.length > 0 ? anchors[(floor - 1) % anchors.length] : null;
  const size = trait === "SWARM" ? 6 : 4;
  const rest = Array.from({ length: size - (anchor ? 1 : 0) }, (_, i) => trash(i));

  if (!anchor) return rest;

  const swift = trait === "SWIFT";
  if (swift) for (const enemy of rest) enemy.spdMultiplier = TRAIT_SWIFT_SPD;

  return [
    {
      ...anchor,
      star,
      level,
      hpMultiplier: TRAIT_ANCHOR_HP[trait] * hpRatio,
      spdMultiplier: swift ? TRAIT_SWIFT_ANCHOR_SPD : TRAIT_ANCHOR_SPD[trait],
    },
    ...rest,
  ];
}

export function buildTowerFloor(floor: number, traitOverride?: TowerTrait): TowerFloor {
  const fixedRoster = floor === 60 || floor === 70 || floor === 80 || floor === 90 || floor === 100 || isTowerUpperFloor(floor);
  const trait = fixedRoster ? traitOf(floor) : traitOverride ?? traitOf(floor);
  const bossLabels: Partial<Record<number, string>> = { 60: "豪魔人", 70: "始祖ベヒモス", 80: "古代聖竜", 90: "古代ネメシス", 100: "クリモアーク" };
  const upperConcept = towerUpperFloorDef(floor)?.concept;
  const label = bossLabels[floor]
    ?? upperConcept
    ?? (isTowerBossFloor(floor) && traitOverride === undefined ? "関門" : TOWER_TRAIT_LABEL[trait] || "");
  const specialNote = floor === 70
    ? "生命晶が生きている間は始祖ベヒモスの再生が強化され、脈動晶は現在HPの高い3体を半減させます。始祖ベヒモスはHPが減るほど攻撃性能が上がります。"
    : floor === 80
      ? "古代聖竜と4体のお供が免疫・強化・妨害で攻めてきます。免疫が切れると本体が弱まり、お供を倒すほど本体にダメージが通りやすくなります。本体を倒せばクリアです。"
    : floor === 90
      // **何が起きるかだけを書く。**「◯◯を持って行け」とは書かない(編成は考える所)
      ? "古代ネメシスはHPが減るほど狂化し、お供を1体倒すごとにさらに強くなります。お供は強化・加速・妨害で攻めてきます。"
      : floor === 100
        ? "クリモアークは戦いの最中に自身の分身を生み出します。分身は攻撃型・サポート型・デバフ型のいずれかで、"
          + "生きている間はクリモアーク本体が硬くなり、倒すと本体が一時的に強くなります。"
          + "クリモアーク本体を倒せば、分身が残っていてもその階はクリアです。"
        : "";
  return {
    floor,
    name: `${floor}階${label ? ` ${label}` : ""}`,
    label,
    note: specialNote || (upperConcept ? towerUpperNote(floor) : "") || TOWER_TRAIT_NOTE[trait],
    trait,
    enemies: enemiesOf(floor, trait),
    powerScale: powerScaleOf(floor),
    speedScale: speedScaleOf(floor),
    firstClearReward: rewardOf(floor),
  };
}

export const TRIAL_TOWER_FLOORS: TowerFloor[] = Array.from({ length: TOWER_FLOOR_COUNT }, (_, i) =>
  buildTowerFloor(i + 1),
);

export function findTowerFloor(floor: number): TowerFloor | undefined {
  return TRIAL_TOWER_FLOORS.find((f) => f.floor === floor);
}

export function towerTraitProblem(floor: TowerFloor): string | null {
  const required = TOWER_TRAIT_REQUIRED_EFFECTS[floor.trait];
  if (required) {
    const canDoIt = floor.enemies.some((enemy) => {
      const dex = findMonster(enemy.templateId, enemy.element);
      return dex?.skills.some((skill) => skill.effects.some((effect) => required.includes(effect.kind))) ?? false;
    });
    if (!canDoIt) return `${TOWER_TRAIT_LABEL[floor.trait]}なのに ${required.join("/")} を持つ敵が1体もいない`;
  }
  if (floor.trait === "SWARM" && floor.enemies.length <= 4) {
    return `群れの階なのに敵が${floor.enemies.length}体しかいない`;
  }
  if (floor.trait === "SWIFT") {
    const swiftFloorSpd = towerUpperSwiftFloorSpd(floor.floor);
    if (swiftFloorSpd !== null && isTowerUpperFloor(floor.floor)) {
      const slow = floor.enemies.filter((e) => (e.fixedStats?.spd ?? 0) < swiftFloorSpd);
      if (slow.length > 0) return `疾風の階なのに速度が${swiftFloorSpd}未満の敵が${slow.length}体いる`;
    } else if (!floor.enemies.every((e) => (e.spdMultiplier ?? 1) > 1)) {
      return "疾風の階なのに速度が上がっていない敵がいる";
    }
  }
  return null;
}
