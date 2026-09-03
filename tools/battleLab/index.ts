/**
 * Battle Lab —— バランス調整のための、開発専用の戦闘実験台。
 *
 *   npm run battle:lab -- --scenario tower-60 --runs 1000
 *   npm run battle:lab -- --scenario tower-60 --runs 1 --verbose
 *   npm run battle:lab -- --scenario tower-60 --runs 500 --json --out
 *   npm run battle:lab -- --scenario tower-60 --runs 300 --compare boss-s3=3.0,2.8,2.5,2.3
 *   npm run battle:lab -- --scenario tower-60 --runs 300 --focus 豪魔人集中
 *   npm run battle:lab -- --scenario tower-60 --runs 300 --gear mid
 *   npm run battle:lab -- --scenario tower-60 --runs 300 --gear-compare
 *   npm run battle:lab -- --list
 *
 * ## 何を触らないか
 *
 * localStorage も Supabase も、プレイヤーの持ち物も進行状況も**一切見ない。**
 * ここが読むのは図鑑・装備・スキル・戦闘エンジンだけで、書き込む先は
 * `--out` を付けた時の `tools/battleLab/results/` しかない。
 * 何千回走らせても、遊んでいる人のデータは1バイトも変わらない。
 *
 * ## 別のダメージ計算を作らない
 *
 * この道具にはダメージ式も会心判定も命中/抵抗もゲージ処理もAIも無い。
 * 全部 `src/battle/engine.ts` が持っている。ここでやるのは
 * **盤面を組んで、走らせて、出てきた数字を数えること**だけ。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill } from "../../src/core/skill.js";
import { runBattle, runMany } from "./run.js";
import { compareMarkdown, summarize, toMarkdown } from "./report.js";
import { SCENARIOS, findScenario } from "./scenarios/index.js";
import type { GearGrade, Scenario } from "./types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** 装備の仕上がり具合。上から順に強い */
/*
 * 並びは**実測で強い順**。名前の印象順ではない。
 *
 * 「60階の想定」は★6+15なのに、★6+12の「育成の途中」より弱く出る。
 * サブOPが最初から4個ある装備は、+3/+6/+9/+12/+15 の強化が
 * **既にある項目を伸ばす**方へ全部回る。1〜2個から始めた装備は、
 * その枠を**個数を増やす**のに使ってしまう。同じ+15でも中身が違う。
 */
const GEAR_GRADES: GearGrade[] = ["FINISHED", "STRONG", "MID", "TYPICAL", "ROUGH"];
const GEAR_LABEL: Record<GearGrade, string> = {
  FINISHED: "仕上げ切った (★6+15 / サブ4つとも役割どおり)",
  STRONG: "真面目に集めた (★6+15 / サブ半分は運任せ)",
  TYPICAL: "60階の想定 (★6+15 / 初期サブ1〜2個から最大強化)",
  MID: "育成の途中 (★6+12 / サブ1つだけ狙いどおり)",
  ROUGH: "拾ったまま (★5+9 / サブは完全に運任せ)",
};

interface Args {
  scenario: string;
  runs: number;
  seed: number;
  focus?: string;
  verbose: boolean;
  logBattle: number;
  json: boolean;
  markdown: boolean;
  out: boolean;
  list: boolean;
  strict: boolean;
  /** 味方の装備の仕上がり具合。省略時はプリセットのまま(仕上げ切った人) */
  gear?: GearGrade;
  /** 仕上がり具合を並べて比べる */
  gearCompare: boolean;
  compare?: { key: string; values: number[] };
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    scenario: "tower-60",
    runs: 1,
    // 種を書かなければ毎回変わる。**書けば必ず同じ戦いが再現できる**
    seed: Math.floor(Math.random() * 1e9),
    verbose: false,
    logBattle: 0,
    json: false,
    markdown: false,
    out: false,
    list: false,
    strict: false,
    gearCompare: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    switch (key) {
      case "--scenario": args.scenario = value; i += 1; break;
      case "--runs": args.runs = Math.max(1, Number(value)); i += 1; break;
      case "--seed": args.seed = Number(value) >>> 0; i += 1; break;
      case "--focus": args.focus = value; i += 1; break;
      case "--verbose": args.verbose = true; args.logBattle = Math.max(1, args.logBattle); break;
      case "--log-battle": args.logBattle = Math.max(0, Number(value)); i += 1; break;
      case "--json": args.json = true; break;
      case "--markdown": args.markdown = true; break;
      case "--out": args.out = true; break;
      case "--list": args.list = true; break;
      case "--strict": args.strict = true; break;
      case "--gear": {
        const upper = (value ?? "").toUpperCase();
        if (!GEAR_GRADES.includes(upper as GearGrade)) {
          throw new Error(`装備の段階 "${value}" がありません。候補: ${GEAR_GRADES.join(" / ").toLowerCase()}`);
        }
        args.gear = upper as GearGrade;
        i += 1;
        break;
      }
      case "--gear-compare": args.gearCompare = true; break;
      case "--compare": {
        const [k, list] = (value ?? "").split("=");
        args.compare = { key: k, values: (list ?? "").split(",").map(Number).filter((n) => !Number.isNaN(n)) };
        i += 1;
        break;
      }
      default: break;
    }
  }
  return args;
}

/**
 * 見比べ用に、シナリオを1か所だけ変えた複製を作る。
 *
 * いまのところ `boss-s3`(勝利条件になっている敵のスキル3の倍率)だけ。
 * **複製して変えるので、元のシナリオには触らない。**
 */
function variant(scenario: Scenario, key: string, value: number): Scenario {
  if (key !== "boss-s3") throw new Error(`--compare は boss-s3 だけに対応しています(受け取った: ${key})`);
  const enemies = scenario.enemies.map((enemy) => {
    if (!enemy.victoryTarget || !enemy.skills) return enemy;
    const skills = enemy.skills.map((skill, i) => (
      i !== 2 ? skill : { ...skill, effects: skill.effects.map((effect) => (
        effect.kind === "DAMAGE" ? { ...effect, multiplier: value } : effect
      )) }
    )) as [Skill, Skill, Skill];
    return { ...enemy, skills };
  });
  return { ...scenario, enemies };
}

function focusOf(scenario: Scenario, name: string | undefined): { name: string; order: string[] } {
  const patterns = scenario.focusPatterns ?? [];
  if (patterns.length === 0) return { name: "既存AIまかせ", order: [] };
  if (!name) return patterns[0];
  const found = patterns.find((pattern) => pattern.name === name);
  if (!found) {
    throw new Error(`狙う順 "${name}" がありません。候補: ${patterns.map((p) => p.name).join(" / ")}`);
  }
  return found;
}

function saveResult(name: string, body: string): string {
  const dir = resolve(HERE, "results");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, name);
  writeFileSync(path, body, "utf8");
  return path;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    for (const scenario of SCENARIOS) {
      console.log(`${scenario.id}  ${scenario.title}`);
      console.log(`  ${scenario.note}`);
      const patterns = (scenario.focusPatterns ?? []).map((p) => p.name).join(" / ");
      if (patterns) console.log(`  狙う順: ${patterns}`);
    }
    return;
  }

  const scenario = findScenario(args.scenario);
  if (!scenario) {
    console.error(`シナリオ ${args.scenario} がありません。--list で一覧を出せます`);
    process.exitCode = 1;
    return;
  }
  const focus = focusOf(scenario, args.focus);

  // --- 見比べ ---
  if (args.compare) {
    const rows = args.compare.values.map((value) => {
      const target = variant(scenario, args.compare!.key, value);
      const tallies = runMany(target, args.seed, args.runs, focus.order, args.gear);
      return { label: `${args.compare!.key}=${value}`, summary: summarize(target, tallies, { seed: args.seed, focus: focus.name }) };
    });
    const body = compareMarkdown(`${scenario.title} 見比べ (${args.runs}戦 / seed ${args.seed} / ${focus.name})`, rows);
    if (args.json) {
      const json = JSON.stringify(rows.map((r) => ({ label: r.label, ...r.summary })), null, 2);
      console.log(json);
      if (args.out) console.error(`保存: ${saveResult(`${scenario.id}-compare-${args.seed}.json`, json)}`);
    } else {
      console.log(body);
      if (args.out) console.error(`保存: ${saveResult(`${scenario.id}-compare-${args.seed}.md`, body)}`);
    }
    return;
  }

  // --- 装備の仕上がり具合を並べて比べる ---
  if (args.gearCompare) {
    const rows = GEAR_GRADES.map((grade) => ({
      label: GEAR_LABEL[grade],
      summary: summarize(scenario, runMany(scenario, args.seed, args.runs, focus.order, grade), { seed: args.seed, focus: focus.name }),
    }));
    const body = compareMarkdown(`${scenario.title} 装備の仕上がり具合ごと (${args.runs}戦 / seed ${args.seed} / ${focus.name})`, rows);
    if (args.json) {
      const json = JSON.stringify(rows.map((r) => ({ label: r.label, ...r.summary })), null, 2);
      console.log(json);
      if (args.out) console.error(`保存: ${saveResult(`${scenario.id}-gear-${args.seed}.json`, json)}`);
    } else {
      console.log(body);
      if (args.out) console.error(`保存: ${saveResult(`${scenario.id}-gear-${args.seed}.md`, body)}`);
    }
    return;
  }

  // --- 詳しいログ(先頭の数戦ぶんだけ) ---
  if (args.logBattle > 0) {
    for (let i = 0; i < Math.min(args.logBattle, args.runs); i += 1) {
      const seed = (args.seed + i) >>> 0;
      const tally = runBattle(scenario, seed, focus.order, args.gear);
      console.log(`=== ${scenario.title} / seed ${seed} / 狙う順 ${focus.name} ===`);
      for (const line of tally.log) console.log(line);
      console.log(`--- 結果: ${tally.winner === "PLAYER" ? "勝利" : tally.winner === "DRAW" ? "引き分け" : "敗北"} `
        + `/ ${tally.turns}ターン / 生存 ${tally.survivors}体${tally.lossReason ? ` / 敗因: ${tally.lossReason}` : ""}`);
      console.log("");
    }
    if (args.runs <= args.logBattle) return;
  }

  const tallies = runMany(scenario, args.seed, args.runs, focus.order, args.gear);
  const summary = summarize(scenario, tallies, { seed: args.seed, focus: focus.name });

  if (args.json) {
    const json = JSON.stringify(summary, null, 2);
    console.log(json);
    if (args.out) console.error(`保存: ${saveResult(`${scenario.id}-${args.seed}.json`, json)}`);
  } else {
    const body = toMarkdown(summary);
    console.log(body);
    if (args.out) console.error(`保存: ${saveResult(`${scenario.id}-${args.seed}.md`, body)}`);
  }

  /*
   * 崩れの見張り。**既定では落とさない。**
   * 数字を動かしている最中に毎回赤くなると、警告そのものを見なくなる。
   * CIへ載せる時だけ `--strict` を付けて、終了コードで止める。
   */
  if (!summary.withinExpect) {
    const min = summary.expect?.minWinRate;
    const max = summary.expect?.maxWinRate;
    const range = `${min !== undefined ? `${(min * 100).toFixed(0)}%` : "—"}-${max !== undefined ? `${(max * 100).toFixed(0)}%` : "—"}`;
    console.error(`WARN: ${summary.scenario} win rate ${(summary.winRate * 100).toFixed(1)}% is outside expected range ${range}`);
    if (args.strict) process.exitCode = 1;
  }
}

main();
