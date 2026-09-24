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
 *   npx tsx tools/ruinPressure.ts --aim 既定,本体,号令塔,妨害塔 --teams 力
 *
 * ## 狙い(`--aim`)を必ず2通りで測る
 *
 * 本編には狙いが2通りある。**放置周回は狙いを付けられない**(既定の自動の狙い)が、
 * 手で遊ぶ人は本体を1回タップするだけで狙い撃ちになる(`setFocusTarget`)。
 * 片方だけで目安を合わせると、もう片方が別の難しさの階になる
 * (力5階STRONGの汎用が 既定19% / 本体を狙い撃ち94% だった)。
 * 既定は `既定,本体` の2通り。`号令塔` `妨害塔` は「その塔を先に落とす」手。
 *
 * - 既定 … 編成に書いた狙い(`focus`)。書いていなければ狙い無し(放置周回と同じ)
 * - 本体 … 開幕に勝利条件の敵(並び0)を狙う
 * - 号令塔 / 妨害塔 … 開幕にその塔(並び1 / 2)を狙う。倒れたら狙いは外れ、既定の狙いに戻る
 *
 * 「像先落とし」の編成は、既定の狙いが身代わり像になっている。
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
  /*
   * 通常モンスターだけで火に強い水を揃えた5体。**「属性を合わせれば通る」が、
   * SR/SSRを持っていない人にも成り立つか**を見る(制圧は5体とも高レア)。
   * 汎用と同じく毒(水スライム・水インプ)を持つ。
   */
  "力・通常水": {
    kind: "POWER",
    purpose: "通常モンスターだけで水に揃えた編成",
    allies: [
      ally("主力・水ナイト", "knight", "WATER", "MAX_ATTACKER"),
      ally("妨害・水スライム", "slime", "WATER", "MAX_DEBUFFER"),
      ally("妨害・水インプ", "imp", "WATER", "MAX_DEBUFFER"),
      ally("回復・水フェアリー", "fairy", "WATER", "MAX_HEALER"),
      ally("主力・水ウルフ", "wolf", "WATER", "MAX_ATTACKER"),
    ],
  },
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

export type RuinAim = "既定" | "本体" | "号令塔" | "妨害塔";
export const RUIN_AIMS: readonly RuinAim[] = ["既定", "本体", "号令塔", "妨害塔"];
const AIM_INDEX: Record<Exclude<RuinAim, "既定">, number> = { 本体: 0, 号令塔: 1, 妨害塔: 2 };

export interface RuinResult {
  rate: number;
  bossHpLeft: number;
  turns: number;
  timeoutRate: number;
  /** 倒した取り巻きの数(0〜2)の平均 */
  towerKills: number;
  /** 倒れた味方の数の平均 */
  allyDeaths: number;
}

/** その狙いで開幕に指定する敵の並び番号。undefined なら狙い無し */
function focusIndexOf(team: RuinTeam, aim: RuinAim): number | undefined {
  return aim === "既定" ? team.focus : AIM_INDEX[aim];
}

export function measureRuin(
  team: RuinTeam, floorNum: number, gear: GearGrade, trials: number, size: number, seedBase = 700, aim: RuinAim = "既定",
): RuinResult {
  const floor = findRuinFloor(team.kind, floorNum);
  if (!floor) throw new Error(`${team.kind} ${floorNum}階が無い`);
  const focus = focusIndexOf(team, aim);
  let wins = 0, bossLeft = 0, turns = 0, timeouts = 0, towerKills = 0, allyDeaths = 0;
  for (let t = 0; t < trials; t += 1) {
    const rng = mulberry32(seedBase + t * 7919 + floorNum * 31);
    const allies = team.allies.slice(0, size).map((spec) => buildAlly(spec, rng, gear));
    const engine = new BattleEngine(allies, buildDungeonEnemyTeam(floor), { rng });
    if (focus !== undefined) {
      const target = engine.getUnits().filter((u) => u.team === "ENEMY")[focus];
      if (target) engine.setFocusTarget(target.instanceId);
    }
    const result = engine.run();
    if (result.winner === "PLAYER") wins += 1;
    if (result.winner === "DRAW" || (result.winner !== "PLAYER" && result.turnsTaken >= 300)) timeouts += 1;
    const units = engine.getUnits();
    const boss = units.find((u) => u.team === "ENEMY" && u.def.victoryTarget);
    bossLeft += boss ? boss.currentHp / boss.maxHp : 0;
    turns += result.turnsTaken;
    towerKills += units.filter((u) => u.team === "ENEMY" && !u.def.victoryTarget && !u.alive).length;
    allyDeaths += units.filter((u) => u.team === "PLAYER" && !u.alive).length;
  }
  return {
    rate: wins / trials, bossHpLeft: bossLeft / trials, turns: turns / trials, timeoutRate: timeouts / trials,
    towerKills: towerKills / trials, allyDeaths: allyDeaths / trials,
  };
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
  const aims = opt("--aim", "既定,本体").split(",") as RuinAim[];
  for (const aim of aims) if (!RUIN_AIMS.includes(aim)) throw new Error(`--aim は ${RUIN_AIMS.join(" / ")} のどれか: ${aim}`);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  for (const floor of floors) for (const gear of gears) {
    console.log(`\n=== ${floor}階 / ${gear} / ${size}体 / ${trials}戦 ===`);
    for (const [name, team] of Object.entries(RUIN_TEAMS)) {
      if (only && !name.includes(only)) continue;
      for (const aim of aims) {
        // 守護の遺跡に「号令塔」「妨害塔」は無い(並び1・2は身代わり像・霧の巫女)ので、名前の合う狙いだけ
        if (team.kind === "GUARDIAN" && (aim === "号令塔" || aim === "妨害塔")) continue;
        const r = measureRuin(team, floor, gear, trials, size, 700, aim);
        console.log(`${name} [狙い:${aim}]: 勝率${pct(r.rate)} 本体残HP${pct(r.bossHpLeft)} 平均手数${r.turns.toFixed(0)} 時間切れ${pct(r.timeoutRate)} 塔撃破${r.towerKills.toFixed(2)} 倒れた味方${r.allyDeaths.toFixed(2)}`);
      }
    }
  }
}
