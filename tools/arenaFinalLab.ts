/**
 * アクセサリー 実戦アリーナ最終検証。
 *
 * **検証専用。本番のデータには何も書かない。**
 *
 * ## 本番のアリーナと同じにしてあるところ
 *
 *   - 個体: Battle Lab の `buildAlly`(createMonsterInstance → 装備 → toBattleDefinition)
 *   - 速度: 本番の `arenaCompressedSpeed` を両陣営へ掛ける(`buildArenaEntryBattle` と同じ)
 *   - 戦闘: 本番の `BattleEngine` に本番の `ARENA_BATTLE_OPTIONS`(長引いた時のダメージ増加)を渡す
 *   - AI: エンジンの既定のまま(両陣営とも同じAI。攻撃側だけを賢くしない)
 *   - 攻撃側 = PLAYER、防衛側 = ENEMY(`defenseSim.ts` と同じ置き方)
 *
 * アクセの条件付き効果は `attachAccessories` で、このエンジンのインスタンスにだけ差し込む
 * (本番のエンジンのコードは変えない)。
 *
 *   npx tsx tools/arenaFinalLab.ts --mode roster            # 顔ぶれと最終ステータス
 *   npx tsx tools/arenaFinalLab.ts --mode baseline          # アクセなしで防衛の強さ(200戦)
 *   npx tsx tools/arenaFinalLab.ts --mode full --csv out.csv # 全条件
 */
import { writeFileSync } from "node:fs";
import { BattleEngine } from "../src/battle/engine.js";
import { createBattleUnit, getEffectiveStat, hasStatus, type BattleUnit } from "../src/battle/unit.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { ATK_UP, DEF_DOWN } from "../src/core/statusValues.js";
import { balanceFlags } from "../src/core/balanceFlags.js";
import { ARENA_BATTLE_OPTIONS, arenaCompressedSpeed } from "../src/data/pvpArena.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { SET_LABEL } from "../src/core/equipment.js";
import { MONSTER_TYPE_LABELS } from "../src/core/monsterDevelopment.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import {
  NONE,
  attachAccessories,
  describe,
  equipDefinition,
  type Accessory,
  type Roll,
  type Special,
  type Tier,
} from "./accessoryFinal/specials.js";
import { ATTACKS, ATTACK_ROUND1, ATTACK_VARIANTS, DEFENSES, DEFENSE_ROUND1, DEFENSE_VARIANTS, ROLE_LABEL, gearOf, type Member, type Team } from "./arenaFinal/roster.js";

if (balanceFlags.defenseFormula !== "sw" || balanceFlags.elementMode !== "sw" || balanceFlags.swRatio !== 1.2) {
  throw new Error(`本番の既定ではない: ${JSON.stringify(balanceFlags)}`);
}

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const MODE = arg("--mode", "full");
const BATTLES = Number(arg("--battles", "200"));
const CSV = arg("--csv", "");
const ONLY_DEF = arg("--def", "");
const ONLY_ATK = arg("--atk", "");
const ONLY_COND = arg("--cond", "");

/* ================================================================ 個体 */

/** 個体は1体につき1つに固定する(条件ごとに装備の目が変わらないように)。種は名前から決める */
function seedOf(key: string, side: "A" | "D"): number {
  let h = side === "A" ? 17 : 29;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const baseCache = new Map<string, MonsterDefinition>();
function baseDef(m: Member, side: "A" | "D"): MonsterDefinition {
  const k = `${side}:${m.key}:${m.build.set4}:${m.build.slot2}`;
  if (!baseCache.has(k)) {
    baseCache.set(k, buildAlly({
      label: m.label, templateId: m.templateId, element: m.element,
      type: m.build.type, abilityPoints: m.build.abilityPoints, gear: gearOf(m.build), latentIndex: m.latentIndex,
    }, mulberry32(seedOf(m.key, side))));
  }
  return baseCache.get(k)!;
}

/** アクセを着けてからアリーナの速度圧縮を掛ける(本番の `withArenaSpeed` と同じ式) */
function arenaDef(m: Member, side: "A" | "D", acc: Accessory): MonsterDefinition {
  const def = equipDefinition(baseDef(m, side), acc);
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/* ================================================================ アクセの条件 */

const ATK_MAIN = 2_000;
const HP_MAIN = 5_000;
const DEF_MAIN = 750;

type Side = "A" | "D";
const tierCount: Record<Tier, number> = { HERO: 1, LEGEND: 2, EPIC: 3 };

/** 役割に応じたメイン。攻撃側の攻撃役・妨害役はATK、支援役はHP。防衛側はDEF受けだけDEF、他はHP */
function mainOf(m: Member, side: Side): "ATK" | "HP" | "DEF" {
  if (side === "A") return m.role === "SUP" || m.role === "HEAL" ? "HP" : "ATK";
  return m.role === "DEF" ? "DEF" : "HP";
}
const mainValue = (kind: "ATK" | "HP" | "DEF", mult: number) => (kind === "ATK" ? ATK_MAIN : kind === "HP" ? HP_MAIN : DEF_MAIN) * mult;

function accOf(m: Member, side: Side, tier: Tier | "MAIN" | null, roll: Roll = "STD", mult = 1): Accessory {
  if (tier === null) return NONE;
  const main = mainOf(m, side);
  if (tier === "MAIN") return { ...NONE, main, mainValue: mainValue(main, mult) };
  const specials = m.acc.specials.slice(0, tierCount[tier]) as Special[];
  return { main, mainValue: mainValue(main, mult), specials, tier, roll, weak: m.acc.weak };
}

interface Condition {
  key: string;
  label: string;
  atk: (m: Member) => Accessory;
  def: (m: Member) => Accessory;
}
const CONDITIONS: Condition[] = [
  { key: "A", label: "A 双方アクセなし", atk: () => NONE, def: () => NONE },
  { key: "B", label: "B 双方メインのみ", atk: (m) => accOf(m, "A", "MAIN"), def: (m) => accOf(m, "D", "MAIN") },
  { key: "C", label: "C 双方ヒーロー(中央値+特殊1+弱1)", atk: (m) => accOf(m, "A", "HERO"), def: (m) => accOf(m, "D", "HERO") },
  { key: "D", label: "D 双方レジェンド(中央値+特殊2+弱1)", atk: (m) => accOf(m, "A", "LEGEND"), def: (m) => accOf(m, "D", "LEGEND") },
  { key: "E", label: "E 双方エピック(中央値+特殊3+弱1)", atk: (m) => accOf(m, "A", "EPIC"), def: (m) => accOf(m, "D", "EPIC") },
  { key: "X", label: "X 双方 理想エピック(メイン1.2倍+特殊上限3+弱1)", atk: (m) => accOf(m, "A", "EPIC", "MAX", 1.2), def: (m) => accOf(m, "D", "EPIC", "MAX", 1.2) },
  { key: "XA", label: "XA 攻撃側だけ理想エピック(防衛アクセなし)", atk: (m) => accOf(m, "A", "EPIC", "MAX", 1.2), def: () => NONE },
  { key: "XD", label: "XD 防衛側だけ理想エピック(攻撃アクセなし)", atk: () => NONE, def: (m) => accOf(m, "D", "EPIC", "MAX", 1.2) },
  /* --- 判断のための追加条件 --- */
  { key: "B08", label: "B08 双方メインのみ・個体差0.8倍(ATK+1,600 / HP+4,000 / DEF+600)", atk: (m) => accOf(m, "A", "MAIN", "STD", 0.8), def: (m) => accOf(m, "D", "MAIN", "STD", 0.8) },
  { key: "B12", label: "B12 双方メインのみ・個体差1.2倍(ATK+2,400 / HP+6,000 / DEF+900)", atk: (m) => accOf(m, "A", "MAIN", "STD", 1.2), def: (m) => accOf(m, "D", "MAIN", "STD", 1.2) },
  { key: "MA", label: "MA 攻撃側だけメイン(ATK+2,000・防衛アクセなし)", atk: (m) => accOf(m, "A", "MAIN"), def: () => NONE },
  { key: "MD", label: "MD 防衛側だけメイン(HP+5,000/DEF+750・攻撃アクセなし)", atk: () => NONE, def: (m) => accOf(m, "D", "MAIN") },
  /* --- 片側だけ理想エピックの振れ幅を切り分ける(代表の組だけで回す) --- */
  { key: "HA", label: "HA 攻撃側だけヒーロー(中央値)", atk: (m) => accOf(m, "A", "HERO"), def: () => NONE },
  { key: "LA", label: "LA 攻撃側だけレジェンド(中央値)", atk: (m) => accOf(m, "A", "LEGEND"), def: () => NONE },
  { key: "HD", label: "HD 防衛側だけヒーロー(中央値)", atk: () => NONE, def: (m) => accOf(m, "D", "HERO") },
  { key: "LD", label: "LD 防衛側だけレジェンド(中央値)", atk: () => NONE, def: (m) => accOf(m, "D", "LEGEND") },
  { key: "EA", label: "EA 攻撃側だけエピック(中央値・メイン1.0倍)", atk: (m) => accOf(m, "A", "EPIC"), def: () => NONE },
  { key: "ED", label: "ED 防衛側だけエピック(中央値・メイン1.0倍)", atk: () => NONE, def: (m) => accOf(m, "D", "EPIC") },
  { key: "XAm", label: "XAm 攻撃側だけメイン1.2倍(特殊なし)", atk: (m) => accOf(m, "A", "MAIN", "STD", 1.2), def: () => NONE },
  { key: "XDm", label: "XDm 防衛側だけメイン1.2倍(特殊なし)", atk: () => NONE, def: (m) => accOf(m, "D", "MAIN", "STD", 1.2) },
  ...[0, 1, 2].map((i): Condition => ({
    key: `XA-${i + 1}`, label: `XA-${i + 1} 攻撃側だけ理想エピックから特殊${i + 1}番目を外す`,
    atk: (m) => { const a = accOf(m, "A", "EPIC", "MAX", 1.2); return { ...a, specials: a.specials.filter((_, j) => j !== i) }; }, def: () => NONE,
  })),
  { key: "XA-w", label: "XA-w 攻撃側だけ理想エピックから弱効果を外す", atk: (m) => ({ ...accOf(m, "A", "EPIC", "MAX", 1.2), weak: null }), def: () => NONE },
  ...[0, 1, 2].map((i): Condition => ({
    key: `XD-${i + 1}`, label: `XD-${i + 1} 防衛側だけ理想エピックから特殊${i + 1}番目を外す`,
    atk: () => NONE, def: (m) => { const a = accOf(m, "D", "EPIC", "MAX", 1.2); return { ...a, specials: a.specials.filter((_, j) => j !== i) }; },
  })),
  { key: "XD-w", label: "XD-w 防衛側だけ理想エピックから弱効果を外す", atk: () => NONE, def: (m) => ({ ...accOf(m, "D", "EPIC", "MAX", 1.2), weak: null }) },
  {
    key: "XS", label: "XS 双方 理想エピック・防衛は回復特化(ターン回復+被弾回復+50%シールド+弱:微回復)",
    atk: (m) => accOf(m, "A", "EPIC", "MAX", 1.2),
    def: (m) => ({ ...accOf(m, "D", "EPIC", "MAX", 1.2), specials: ["TURN_HEAL", "HIT_HEAL", "SHIELD50"], weak: "W_TURN_HEAL" }),
  },
];

/* ================================================================ 1戦 */

interface BattleOut {
  winner: "PLAYER" | "ENEMY" | "DRAW";
  turns: number;
  /** 攻撃側が初めて防衛側を倒した手番(無ければ null) */
  atkFirstKill: number | null;
  /** 防衛側が初めて攻撃側を倒した手番 */
  defFirstKill: number | null;
  atkAlive: number;
  defAlive: number;
  /** 決着時点の、防衛側の残りHP合計 ÷ 最大HP合計(倒れた個体は0) */
  defHpLeft: number;
  atkHpLeft: number;
  /** 復活した回数(フェニックス闇の輪廻転生・復活状態。エンジンのログ「復活した」を数える) */
  revives: number;
  /** 時間切れで、しかも最後に我慢でHP1のまま残っていた個体がいた */
  endureDraw: boolean;
  shield50: number;
  hitHeals: number;
}

const STACK = { stackAtk: "ADD" as const, stackDef: "MUL" as const };

function runBattle(attack: Team, defense: Team, cond: Condition, seed: number, noRamp = false, trace?: (log: string[]) => void): BattleOut {
  const players = attack.members.map((m) => arenaDef(m, "A", cond.atk(m)));
  const enemies = defense.members.map((m) => arenaDef(m, "D", cond.def(m)));
  const accOf = new Map<string, Accessory>();
  attack.members.forEach((m, i) => accOf.set(`P${i + 1}`, cond.atk(m)));
  defense.members.forEach((m, i) => accOf.set(`E${i + 1}`, cond.def(m)));
  const engine = new BattleEngine(players, enemies, noRamp ? { rng: mulberry32(seed) } : { ...ARENA_BATTLE_OPTIONS, rng: mulberry32(seed) });
  const attached = attachAccessories(engine, (u) => accOf.get(u.instanceId) ?? NONE, { ...STACK, rng: mulberry32(seed ^ 0x9e3779b9) });
  const internals = engine as unknown as { units: BattleUnit[]; turns: unknown[]; recordTurn: (unit: BattleUnit, ...rest: unknown[]) => unknown };
  const original = internals.recordTurn.bind(engine);
  const alive = (team: "PLAYER" | "ENEMY") => internals.units.filter((u) => u.team === team && u.alive).length;
  let atkFirstKill: number | null = null;
  let defFirstKill: number | null = null;
  internals.recordTurn = (unit, ...rest) => {
    const beforeP = alive("PLAYER");
    const beforeE = alive("ENEMY");
    const out = original(unit, ...rest);
    const turn = internals.turns.length;
    const afterP = alive("PLAYER");
    const afterE = alive("ENEMY");
    if (atkFirstKill === null && afterE < beforeE) atkFirstKill = turn;
    if (defFirstKill === null && afterP < beforeP) defFirstKill = turn;
    return out;
  };
  const result = engine.run();
  trace?.(result.log);
  const hpLeft = (team: "PLAYER" | "ENEMY") => {
    const us = internals.units.filter((u) => u.team === team);
    return us.reduce((s, u) => s + (u.alive ? Math.max(0, u.currentHp) : 0), 0) / us.reduce((s, u) => s + u.maxHp, 0);
  };
  return {
    winner: result.winner as BattleOut["winner"], turns: result.turnsTaken,
    atkFirstKill, defFirstKill,
    atkAlive: alive("PLAYER"), defAlive: alive("ENEMY"),
    defHpLeft: hpLeft("ENEMY"), atkHpLeft: hpLeft("PLAYER"),
    revives: result.log.filter((line) => line.includes("復活した")).length,
    endureDraw: result.winner === "DRAW" && internals.units.some((u) => u.alive && u.currentHp === 1 && hasStatus(u, "ENDURE")),
    shield50: attached.stats.shield50, hitHeals: attached.stats.hitHeals,
  };
}

/* ================================================================ 集計 */

interface Summary {
  atk: string; def: string; cond: string; n: number;
  atkWin: number; defWin: number; draw: number;
  meanTurns: number; medianTurns: number; maxTurns: number;
  within20: number; over50: number; timeout: number;
  atkFirstKill: number | null; defFirstKill: number | null;
  flawless: number;
  atkAlive: number; defAlive: number;
  defHpLeft: number; atkHpLeft: number;
  revives: number; hitHeals: number; shield50: number;
  /** 時間切れのうち、我慢でHP1のまま残った個体がいたもの(全戦闘に対する割合) */
  endureDraw: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
/** 条件間で同じ種の組を使う。組み合わせごとに種をずらさない */
const SEEDS = Array.from({ length: BATTLES }, (_, i) => 70_000 + i);

function runMatchup(attack: Team, defense: Team, cond: Condition, noRamp = false): Summary {
  const outs = SEEDS.map((seed) => runBattle(attack, defense, cond, seed, noRamp));
  const n = outs.length;
  const fk = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? mean(v) : null; };
  return {
    atk: attack.key, def: defense.key, cond: cond.key, n,
    atkWin: outs.filter((o) => o.winner === "PLAYER").length / n,
    defWin: outs.filter((o) => o.winner === "ENEMY").length / n,
    draw: outs.filter((o) => o.winner === "DRAW").length / n,
    meanTurns: mean(outs.map((o) => o.turns)),
    medianTurns: median(outs.map((o) => o.turns)),
    maxTurns: Math.max(...outs.map((o) => o.turns)),
    within20: outs.filter((o) => o.winner !== "DRAW" && o.turns <= 20).length / n,
    over50: outs.filter((o) => o.turns >= 50).length / n,
    timeout: outs.filter((o) => o.winner === "DRAW").length / n,
    atkFirstKill: fk(outs.map((o) => o.atkFirstKill)),
    defFirstKill: fk(outs.map((o) => o.defFirstKill)),
    flawless: outs.filter((o) => o.winner === "PLAYER" && o.defFirstKill === null).length / n,
    atkAlive: mean(outs.map((o) => o.atkAlive)),
    defAlive: mean(outs.map((o) => o.defAlive)),
    defHpLeft: mean(outs.map((o) => o.defHpLeft)),
    atkHpLeft: mean(outs.map((o) => o.atkHpLeft)),
    revives: mean(outs.map((o) => o.revives)),
    hitHeals: mean(outs.map((o) => o.hitHeals)),
    shield50: mean(outs.map((o) => o.shield50)),
    endureDraw: outs.filter((o) => o.endureDraw).length / n,
  };
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const f1 = (v: number | null) => (v === null || Number.isNaN(v) ? "—" : v.toFixed(1));
const n0 = (v: number) => Math.round(v).toLocaleString("en-US");

const HEAD = "| 攻撃 | 防衛 | 条件 | 攻撃側勝率 | 防衛側勝率 | 平均T | 中央T | 最長T | 20T以内決着 | 50T以上 | 時間切れ(うち我慢HP1) | 攻撃側初撃破T | 防衛側初撃破T | 攻撃側0体死亡勝利 | 攻撃側生存 | 防衛側生存 | 決着時 防衛残HP | 決着時 攻撃残HP |";
const SEP = "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|";
const row = (s: Summary) => `| ${s.atk} | ${s.def} | ${s.cond} | ${pct(s.atkWin)} | ${pct(s.defWin)} | ${s.meanTurns.toFixed(1)} | ${s.medianTurns} | ${s.maxTurns} | ${pct(s.within20)} | ${pct(s.over50)} | ${pct(s.timeout)}(${pct(s.endureDraw)}) | ${f1(s.atkFirstKill)} | ${f1(s.defFirstKill)} | ${pct(s.flawless)} | ${s.atkAlive.toFixed(2)} | ${s.defAlive.toFixed(2)} | ${pct(s.defHpLeft)} | ${pct(s.atkHpLeft)} |`;

/* ================================================================ 顔ぶれの表 */

function rosterTable(team: Team, side: Side): string {
  const lines = [
    `### ${team.label}\n`,
    `${team.concept}\n`,
    "| モンスター | 役割 | 属性 | タイプ転生 | 最終HP | 最終ATK | 最終DEF | 最終SPD(アリーナ圧縮後) | 装備セット | 2/4/6番メイン | 能力ポイント | 潜在覚醒 |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|---|---|",
  ];
  for (const m of team.members) {
    const def = baseDef(m, side);
    const unit = createBattleUnit(def, side === "A" ? "PLAYER" : "ENEMY", "probe");
    const latent = (LATENT_ABILITY_CANDIDATES[`${m.templateId}_${m.element}`] ?? [])[m.latentIndex]?.name ?? "なし";
    const ap = m.build.abilityPoints;
    const b = m.build;
    lines.push(`| ${m.label} | ${ROLE_LABEL[m.role]} | ${m.element} | ${MONSTER_TYPE_LABELS[b.type]} | ${n0(unit.maxHp)} | ${n0(getEffectiveStat(unit, "atk"))} | ${n0(getEffectiveStat(unit, "def"))} | ${def.stats.spd}(${arenaCompressedSpeed(def.stats.spd)}) | ${SET_LABEL[b.set4]}4+${SET_LABEL[b.set2]}2 | ${[b.slot2, b.slot4, b.slot6].join(" / ")} | HP${ap.hp}・ATK${ap.atk}・DEF${ap.def}・SPD${ap.spd} | ${latent} |`);
  }
  lines.push("", "| モンスター | 主要スキル | 採用した理由 | アクセ(理想エピック) |", "|---|---|---|---|");
  for (const m of team.members) lines.push(`| ${m.label} | ${m.skills} | ${m.why} | ${describe(accOf(m, side, "EPIC", "MAX", 1.2))} |`);
  return lines.join("\n") + "\n";
}

/* ================================================================ 実行 */

const t0 = Date.now();
let totalBattles = 0;
const csvRows: string[] = ["attack,defense,condition,battles,atk_win,def_win,draw,mean_turns,median_turns,max_turns,within20,over50,timeout,atk_first_kill,def_first_kill,atk_flawless,atk_alive,def_alive,def_hp_left,atk_hp_left,revives,hit_heals,shield50,endure_draw"];

console.log(`<!-- ${new Date().toISOString()} / 攻撃UP ${ATK_UP * 100}% / 防御DOWN ${DEF_DOWN * 100}% / ダメージ増加 ${JSON.stringify(ARENA_BATTLE_OPTIONS.damageRamp)} -->\n`);

if (MODE === "trace") {
  // 1戦のログ: --atk 3 --def F --cond XD --seed 70000 --lines 80
  const cond = CONDITIONS.find((c) => c.key === (ONLY_COND || "A"))!;
  const out = runBattle(ATTACKS.find((t) => t.key === ONLY_ATK)!, DEFENSES.find((t) => t.key === ONLY_DEF)!, cond, Number(arg("--seed", "70000")), argv.includes("--no-ramp"),
    (log) => console.log(log.slice(0, Number(arg("--lines", "80"))).join("\n")));
  console.log(JSON.stringify(out));
} else if (MODE === "roster") {
  console.log("## 防衛編成\n");
  for (const t of DEFENSES) console.log(rosterTable(t, "D"));
  console.log("## 攻撃編成\n");
  for (const t of ATTACKS) console.log(rosterTable(t, "A"));
} else {
  const NO_RAMP = argv.includes("--no-ramp");
  if (NO_RAMP) console.log("**参考測定: アリーナの『長引いた時のダメージ増加』を外している。本番の条件ではない。**\n");
  const conds = MODE === "baseline" ? CONDITIONS.filter((c) => c.key === "A")
    : CONDITIONS.filter((c) => (ONLY_COND ? ONLY_COND.split(",").includes(c.key) : !/^(HA|LA|HD|LD|EA|ED|XAm|XDm|XA-|XD-)/.test(c.key)));
  const pool = argv.includes("--variants") ? [...DEFENSE_ROUND1, ...DEFENSE_VARIANTS] : DEFENSES;
  const defs = pool.filter((d) => !ONLY_DEF || ONLY_DEF.split(",").includes(d.key));
  const atkPool = argv.includes("--variants") ? [...ATTACK_ROUND1, ...ATTACK_VARIANTS] : ATTACKS;
  const atks = atkPool.filter((a) => !ONLY_ATK || ONLY_ATK.split(",").includes(a.key));
  console.log(`各${BATTLES}戦。種は ${SEEDS[0]}〜${SEEDS[SEEDS.length - 1]} を**全条件で共通**に使う。T = 手番(エンジンの行動回数。アリーナのダメージ増加と同じ数え方)。\n`);
  for (const cond of conds) {
    console.log(`## ${cond.label}\n`);
    console.log(HEAD);
    console.log(SEP);
    for (const d of defs) {
      for (const a of atks) {
        const s = runMatchup(a, d, cond, NO_RAMP);
        totalBattles += s.n;
        console.log(row(s));
        csvRows.push([s.atk, s.def, s.cond, s.n, s.atkWin, s.defWin, s.draw, s.meanTurns.toFixed(2), s.medianTurns, s.maxTurns, s.within20, s.over50, s.timeout, s.atkFirstKill?.toFixed(2) ?? "", s.defFirstKill?.toFixed(2) ?? "", s.flawless, s.atkAlive.toFixed(3), s.defAlive.toFixed(3), s.defHpLeft.toFixed(4), s.atkHpLeft.toFixed(4), s.revives.toFixed(3), s.hitHeals.toFixed(3), s.shield50.toFixed(3), s.endureDraw].join(","));
      }
    }
    console.log("");
  }
  console.log(`<!-- 戦闘数 ${totalBattles} / ${((Date.now() - t0) / 1000).toFixed(0)}秒 -->`);
  if (CSV) writeFileSync(CSV, csvRows.join("\n") + "\n");
}
