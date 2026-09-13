/**
 * **案A(新防御式 + sw方式)で魔人12階の「共通高レア」だけが崩れる理由**を切り分ける。
 *
 *   npx tsx tools/swElementIsolate.ts --runs 200
 *
 * 魔人12階は草。共通高レアの妨害役は**電気ネメシス**で、草に不利。
 * sw方式では不利は50%でかすり、**かすった一撃は弱体を入れられない**。
 * そこで妨害役の属性だけを差し替えて測り、
 * 「システムの破綻」なのか「編成と階の属性が噛み合っていないだけ」なのかを分ける。
 *
 * 本番データは1つも変えない。`balanceFlags` に載せて測り、そのつど戻す。
 */
import { resetBalanceFlags, setBalanceFlags } from "../src/core/balanceFlags.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { PVE_DUNGEON_TEAMS, type PressureResult, type PressureTeam, measurePressure } from "./dungeonPressure.js";
import { FINAL_CANDIDATE } from "./finalCandidate.js";
import type { GearGrade } from "./battleLab/types.js";

const argv = process.argv.slice(2);
const arg = (n: string, f: string): string => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : f;
};
const RUNS = Number(arg("runs", "200"));
const SEED = 20260913;
const SCALE = { hp: 0.80, def: 0.30, atk: 2.20 };

const patch = (defs: MonsterDefinition[]): MonsterDefinition[] => defs.map((d) => ({
  ...d,
  stats: {
    ...d.stats,
    hp: Math.max(1, Math.round(d.stats.hp * SCALE.hp)),
    def: Math.max(1, Math.round(d.stats.def * SCALE.def)),
    atk: Math.max(1, Math.round(d.stats.atk * SCALE.atk)),
  },
}));

/** 妨害役(ネメシス)の属性だけを差し替えた共通高レア */
function withDebufferElement(element: "FIRE" | "WATER" | "ELECTRIC" | "GRASS"): PressureTeam {
  const base = PVE_DUNGEON_TEAMS["共通高レア"];
  return {
    ...base,
    allies: base.allies.map((a) => (a.templateId === "nemesis" ? { ...a, element } : a)),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function show(label: string, r: PressureResult): void {
  console.log(
    `  ${label.padEnd(34)} 勝率${pct(r.rate).padStart(5)}  手数 中${String(r.actions).padStart(3)}/平${r.actionsMean.toFixed(0).padStart(3)}  ` +
    `全滅${pct(r.wipeRate).padStart(4)}  時間切${pct(r.timeoutRate).padStart(4)}  敵残${pct1(r.enemyHpLeft).padStart(6)}  味方残${pct1(r.allyHpLeft).padStart(6)}`,
  );
}

function run(label: string, team: PressureTeam, gear: GearGrade, flags: Record<string, unknown>): void {
  resetBalanceFlags();
  setBalanceFlags(flags as Parameters<typeof setBalanceFlags>[0]);
  show(label, measurePressure(team, 12, gear, RUNS, "DEMON", SEED, patch));
  resetBalanceFlags();
}

/** 案Aから属性方式だけを外した比較用(防御式・タイプ・能力付与は案Aのまま) */
const { elementMode: _drop, ...NO_SW_ELEMENT } = FINAL_CANDIDATE;

console.log(`魔人12階(草)の切り分け / ${RUNS}戦 / seed${SEED} / 敵 HP×${SCALE.hp} DEF×${SCALE.def} ATK×${SCALE.atk}`);

for (const gear of ["STRONG", "TYPICAL"] as const) {
  console.log(`\n── ${gear} ──`);
  console.log("  [1] 属性sw方式なし(防御式・タイプ・能力付与は案Aのまま)");
  show("  電気ネメシス(原編成)", (() => {
    resetBalanceFlags(); setBalanceFlags(NO_SW_ELEMENT as Parameters<typeof setBalanceFlags>[0]);
    const r = measurePressure(PVE_DUNGEON_TEAMS["共通高レア"], 12, gear, RUNS, "DEMON", SEED, patch);
    resetBalanceFlags(); return r;
  })());

  console.log("  [2] 案A(属性sw方式あり) / 妨害役の属性だけを変える");
  for (const el of ["ELECTRIC", "FIRE", "WATER", "GRASS"] as const) {
    const tag = el === "ELECTRIC" ? "電気(原編成・草に不利)"
      : el === "FIRE" ? "火(草に有利)"
        : el === "WATER" ? "水(等倍)" : "草(等倍)";
    run(`  ${tag}`, withDebufferElement(el), gear, FINAL_CANDIDATE);
  }
}
