/**
 * 力の遺跡・守護の遺跡の難易度を、Battle Lab と同じ育成・装備基準で測る。
 *
 * 味方は全員 `buildAlly()` を通る(★6 Lv60・スキル最大・能力ポイント100・タイプ転生・
 * 潜在覚醒・装備等級ごとの★6装備)。敵は本編と同じ `buildDungeonEnemyTeam()`。
 * **敵の数値はここで一切いじらない。**
 *
 *   npx tsx tools/ruinPressure.ts                     # 5階・全編成・STRONG/FINISHED
 *   npx tsx tools/ruinPressure.ts --floors 1,2,3,4,5 --gear TYPICAL,STRONG --trials 200
 *   npx tsx tools/ruinPressure.ts --size 4            # 4体で測る(本編はダンジョン編成の5体)
 *
 * 「像先落とし」の編成だけ、戦闘開始時に身代わり像へ集中攻撃を指定する
 * (本編の画面で敵をタップして狙いを決めるのと同じ `setFocusTarget`)。
 */
import { BattleEngine } from "../src/battle/engine.js";
import { findRuinFloor, type RuinKind } from "../src/data/ruins.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import type { AllySpec, GearGrade } from "./battleLab/types.js";

interface RuinTeam {
  kind: RuinKind;
  purpose: string;
  allies: AllySpec[];
  /** 開幕に狙う敵の並び番号(0=本体, 1=取り巻きA, 2=取り巻きB) */
  focus?: number;
}

const ally = (label: string, templateId: string, element: AllySpec["element"], preset: NonNullable<AllySpec["preset"]>): AllySpec => ({
  label, templateId, element, preset,
});

/** 汎用: 装備ダンジョンの「実戦通常」と同じ5体(属性は遺跡に合わせていない) */
const GENERIC: AllySpec[] = [
  ally("主力・草ウルフ", "wolf", "GRASS", "MAX_ATTACKER"),
  ally("サブ・水ナイト", "knight", "WATER", "MAX_ATTACKER"),
  ally("妨害・電気インプ", "imp", "ELECTRIC", "MAX_DEBUFFER"),
  ally("回復・水フェアリー", "fairy", "WATER", "MAX_HEALER"),
  ally("支援・草ウィスプ", "wisp", "GRASS", "MAX_SUPPORT"),
];

/** 汎用からインプ(毒)を外し、毒を持たない草ナイトを入れた5体 */
const GENERIC_NO_POISON: AllySpec[] = GENERIC.map((a) => (a.templateId === "imp" ? ally("サブ・草ナイト", "knight", "GRASS", "MAX_ATTACKER") : a));

export const RUIN_TEAMS: Record<string, RuinTeam> = {
  "力・汎用": { kind: "POWER", purpose: "属性を合わせない通常の編成", allies: GENERIC },
  "力・制圧(水)": {
    kind: "POWER",
    purpose: "火に強い水で揃え、本体へ火力を集める",
    allies: [
      ally("主力・水ドラゴン", "dragon", "WATER", "MAX_ATTACKER"),
      ally("主力・水グリフォン", "griffon", "WATER", "MAX_ATTACKER"),
      ally("妨害・水ネメシス", "nemesis", "WATER", "MAX_DEBUFFER"),
      ally("回復・水セラフ", "seraph", "WATER", "MAX_HEALER"),
      ally("支援・水ヴァルキリア", "valkyria", "WATER", "MAX_SUPPORT"),
    ],
  },
  "守護・汎用": { kind: "GUARDIAN", purpose: "属性を合わせない通常の編成", allies: GENERIC },
  /*
   * 汎用の電気インプは「どくのきり」で毒を撒く。**毒は身代わりされない**(依頼主の指定)ので、
   * 汎用のままだと実質「毒編成」になる。毒を持たない汎用を別に並べて、身代わりの圧を測る。
   */
  "力・汎用(毒なし)": { kind: "POWER", purpose: "汎用のインプ(毒)を草ナイトに替えた通常の編成", allies: GENERIC_NO_POISON },
  "守護・汎用(毒なし)": { kind: "GUARDIAN", purpose: "汎用のインプ(毒)を草ナイトに替えた通常の編成", allies: GENERIC_NO_POISON },
  "守護・解除対策(電気)": {
    kind: "GUARDIAN",
    purpose: "解除で身代わりを剥がし、水に強い電気で本体を削る",
    allies: [
      ally("解除・電気アビスリーパー", "abyssreaper", "ELECTRIC", "MAX_DEBUFFER"),
      ally("主力・電気ドラゴン", "dragon", "ELECTRIC", "MAX_ATTACKER"),
      ally("主力・電気グリフォン", "griffon", "ELECTRIC", "MAX_ATTACKER"),
      ally("回復・水セラフ", "seraph", "WATER", "MAX_HEALER"),
      ally("支援・電気ヴァルキリア", "valkyria", "ELECTRIC", "MAX_SUPPORT"),
    ],
  },
  "守護・別解 防御DOWN+火力": {
    kind: "GUARDIAN",
    purpose: "解除を持たず、防御DOWNと火力で身代わりごと押し切る",
    allies: [
      ally("妨害・電気インプ", "imp", "ELECTRIC", "MAX_DEBUFFER"),
      ally("主力・電気ドラゴン", "dragon", "ELECTRIC", "MAX_ATTACKER"),
      ally("主力・電気グリフォン", "griffon", "ELECTRIC", "MAX_ATTACKER"),
      ally("妨害・電気ネメシス", "nemesis", "ELECTRIC", "MAX_DEBUFFER"),
      ally("回復・水セラフ", "seraph", "WATER", "MAX_HEALER"),
    ],
  },
  "守護・別解 像先落とし": {
    kind: "GUARDIAN",
    purpose: "解除を持たず、身代わり像を先に倒してから本体へ",
    focus: 1,
    allies: [
      ally("主力・電気ドラゴン", "dragon", "ELECTRIC", "MAX_ATTACKER"),
      ally("主力・電気グリフォン", "griffon", "ELECTRIC", "MAX_ATTACKER"),
      ally("妨害・電気ネメシス", "nemesis", "ELECTRIC", "MAX_DEBUFFER"),
      ally("回復・水セラフ", "seraph", "WATER", "MAX_HEALER"),
      ally("支援・電気ヴァルキリア", "valkyria", "ELECTRIC", "MAX_SUPPORT"),
    ],
  },
  "守護・別解 毒": {
    kind: "GUARDIAN",
    purpose: "継続ダメージは身代わりされない。毒で本体を直接削る",
    allies: [
      ally("毒主力・電気マッシュルン", "mushroon", "ELECTRIC", "MAX_DEBUFFER"),
      ally("毒火力・電気スコーピオン", "scorpion", "ELECTRIC", "MAX_ATTACKER"),
      ally("毒補助・電気フェンリル", "fenrir", "ELECTRIC", "MAX_DEBUFFER"),
      ally("回復・水フェニックス", "phoenix", "WATER", "MAX_HEALER"),
      ally("防護・光ゴーレム", "golem", "LIGHT", "MAX_TANK"),
    ],
  },
};

export interface RuinResult {
  rate: number;
  bossHpLeft: number;
  turns: number;
  timeoutRate: number;
}

export function measureRuin(team: RuinTeam, floorNum: number, gear: GearGrade, trials: number, size: number, seedBase = 700): RuinResult {
  const floor = findRuinFloor(team.kind, floorNum);
  if (!floor) throw new Error(`${team.kind} ${floorNum}階が無い`);
  let wins = 0, bossLeft = 0, turns = 0, timeouts = 0;
  for (let t = 0; t < trials; t += 1) {
    const rng = mulberry32(seedBase + t * 7919 + floorNum * 31);
    const allies = team.allies.slice(0, size).map((spec) => buildAlly(spec, rng, gear));
    const engine = new BattleEngine(allies, buildDungeonEnemyTeam(floor), { rng });
    if (team.focus !== undefined) {
      const target = engine.getUnits().filter((u) => u.team === "ENEMY")[team.focus];
      if (target) engine.setFocusTarget(target.instanceId);
    }
    const result = engine.run();
    if (result.winner === "PLAYER") wins += 1;
    if (result.winner === "DRAW" || (result.winner !== "PLAYER" && result.turnsTaken >= 300)) timeouts += 1;
    const boss = engine.getUnits().find((u) => u.team === "ENEMY" && u.def.victoryTarget);
    bossLeft += boss ? boss.currentHp / boss.maxHp : 0;
    turns += result.turnsTaken;
  }
  return { rate: wins / trials, bossHpLeft: bossLeft / trials, turns: turns / trials, timeoutRate: timeouts / trials };
}

if (process.argv[1]?.endsWith("ruinPressure.ts")) {
  const argv = process.argv.slice(2);
  const opt = (name: string, fallback: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const floors = opt("--floors", "5").split(",").map(Number);
  const gears = opt("--gear", "STRONG,FINISHED").split(",") as GearGrade[];
  const trials = Number(opt("--trials", "200"));
  const size = Number(opt("--size", "5"));
  const only = opt("--teams", "");
  for (const floor of floors) for (const gear of gears) {
    console.log(`\n=== ${floor}階 / ${gear} / ${size}体 / ${trials}戦 ===`);
    for (const [name, team] of Object.entries(RUIN_TEAMS)) {
      if (only && !name.includes(only)) continue;
      const r = measureRuin(team, floor, gear, trials, size);
      console.log(`${name}: 勝率${(r.rate * 100).toFixed(1)}% 本体残HP${(r.bossHpLeft * 100).toFixed(1)}% 平均手数${r.turns.toFixed(0)} 時間切れ${(r.timeoutRate * 100).toFixed(1)}%`);
    }
  }
}
