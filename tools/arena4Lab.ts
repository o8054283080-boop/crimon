/**
 * アクセサリー4系統(攻撃・耐久・サポート・妨害)の実戦総合検証。
 *
 * **検証専用。本番のデータには何も書かない。我慢の仕様も変えない。**
 *
 * 前回の `arenaFinalLab.ts` と同じく、本番の `BattleEngine` + アリーナの速度圧縮 + 長引いた時のダメージ増加で戦わせる。
 * 個体は Battle Lab の `buildAlly`(本番と同じ育成の道)。AIはエンジンの既定のまま(両陣営とも同じ)。
 *
 *   npx tsx tools/arena4Lab.ts --mode roster
 *   npx tsx tools/arena4Lab.ts --mode select --battles 200          # OFF-B の候補選び(アクセなし)
 *   npx tsx tools/arena4Lab.ts --mode plan --plan main --csv out.csv
 */
import { writeFileSync } from "node:fs";
import { BattleEngine } from "../src/battle/engine.js";
import { createBattleUnit, getEffectiveStat, hasStatus, type BattleUnit } from "../src/battle/unit.js";
import type { MonsterDefinition } from "../src/core/monster.js";
import { balanceFlags } from "../src/core/balanceFlags.js";
import { ARENA_BATTLE_OPTIONS, arenaCompressedSpeed } from "../src/data/pvpArena.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { SET_LABEL } from "../src/core/equipment.js";
import { MONSTER_TYPE_LABELS } from "../src/core/monsterDevelopment.js";
import { buildAlly } from "./battleLab/build.js";
import { mulberry32 } from "./battleLab/rng.js";
import { gearOf } from "./arenaFinal/roster.js";
import { DIS_SPECIALS, NONE4, SUP_SPECIALS, attach4, buffCount, describe4, equip4, type Acc4, type Metrics4, type Special4 } from "./accessory4/specials4.js";
import { ATTACKS4, DEFENSES4, OFF_B_CANDIDATES, OFF_E_STRIP, offBAblations, setOffB, type Member4, type Team4 } from "./accessory4/roster4.js";
import type { Roll, Tier } from "./accessoryFinal/specials.js";

if (balanceFlags.defenseFormula !== "sw" || balanceFlags.elementMode !== "sw" || balanceFlags.swRatio !== 1.2) {
  throw new Error(`本番の既定ではない: ${JSON.stringify(balanceFlags)}`);
}

const argv = process.argv.slice(2);
const arg = (name: string, fallback: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const MODE = arg("--mode", "plan");
const PLAN = arg("--plan", "main");
const BATTLES = Number(arg("--battles", "200"));
const CSV = arg("--csv", "");
const OFF_B = arg("--offb", "B-aby");

/* ================================================================ 個体 */

function seedOf(key: string, side: "A" | "D"): number {
  let h = side === "A" ? 17 : 29;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
const baseCache = new Map<string, MonsterDefinition>();
function baseDef(m: Member4, side: "A" | "D"): MonsterDefinition {
  const k = `${side}:${m.key}:${JSON.stringify(m.build)}:${m.latentIndex}`;
  if (!baseCache.has(k)) {
    baseCache.set(k, buildAlly({
      label: m.label, templateId: m.templateId, element: m.element,
      type: m.build.type, abilityPoints: m.build.abilityPoints, gear: gearOf(m.build), latentIndex: m.latentIndex,
    }, mulberry32(seedOf(m.key, side))));
  }
  return baseCache.get(k)!;
}
function arenaDef(m: Member4, side: "A" | "D", acc: Acc4): MonsterDefinition {
  const def = equip4(m.patch ? m.patch(baseDef(m, side)) : baseDef(m, side), acc);
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/* ================================================================ アクセ */

const MAIN_VALUE = { ATK: 2_000, HP: 5_000, DEF: 750 } as const;
const COUNT: Record<Tier, number> = { HERO: 1, LEGEND: 2, EPIC: 3 };

/** プロファイル名(ROLE=役割最適)・格・目・メイン倍率からアクセを作る */
function acc(m: Member4, profile: string | null, tier: Tier | "MAIN" = "EPIC", roll: Roll = "STD", mult = 1): Acc4 {
  if (!profile) return NONE4;
  const p = m.profiles[profile === "ROLE" ? m.role4 : profile];
  if (!p) throw new Error(`${m.label} にプロファイル ${profile} が無い`);
  if (tier === "MAIN") return { ...NONE4, main: p.main, mainValue: MAIN_VALUE[p.main] * mult };
  return { main: p.main, mainValue: MAIN_VALUE[p.main] * mult, specials: p.specials.slice(0, COUNT[tier]), tier, roll, weak: p.weak };
}
/** 攻撃・耐久の2系統だけ(前回までの世界)。攻撃役は攻撃、それ以外は耐久 */
const twoFamily = (m: Member4) => (m.role === "ATK" ? "ATK" : "DEF");

interface Condition {
  key: string;
  label: string;
  atk: (m: Member4) => Acc4;
  def: (m: Member4) => Acc4;
  gaugeMode?: "MUL" | "ADD";
}
const C = (key: string, label: string, atk: Condition["atk"], def: Condition["def"], gaugeMode?: "MUL" | "ADD"): Condition => ({ key, label, atk, def, gaugeMode });
const none = () => NONE4;

/* ================================================================ 1戦 */

interface Out {
  winner: string; turns: number;
  atkAlive: number; defAlive: number; defHpLeft: number; atkHpLeft: number;
  m: Metrics4;
  /* 1巡目(攻撃側の各自1回目の行動まで) */
  r1Kill: boolean;
  /** アタッカーの全行動の時点で: 防御DOWN中の敵の割合 / 守りの強化を持つ敵の割合(行動ごとの平均) */
  atkDefDownAll: number | null; atkProtectAll: number | null;
  chain: { tagged: boolean; stripHad: boolean; stripOk: boolean; defDownFrac: number | null; atkActedR1: boolean; atkDefDownFrac: number | null; atkProtective: number | null; ok: boolean; order: string };
  endureSaved: boolean; endureKillGap: number | null;
}

function runBattle(attack: Team4, defense: Team4, cond: Condition, seed: number): Out {
  const players = attack.members.map((m) => arenaDef(m, "A", cond.atk(m)));
  const enemies = defense.members.map((m) => arenaDef(m, "D", cond.def(m)));
  const accMap = new Map<string, Acc4>();
  attack.members.forEach((m, i) => accMap.set(`P${i + 1}`, cond.atk(m)));
  defense.members.forEach((m, i) => accMap.set(`E${i + 1}`, cond.def(m)));
  const tagOf = new Map<string, string>();
  attack.members.forEach((m, i) => { if (m.tag) tagOf.set(`P${i + 1}`, m.tag); });
  const engine = new BattleEngine(players, enemies, { ...ARENA_BATTLE_OPTIONS, rng: mulberry32(seed) });
  const { metrics } = attach4(engine, (u) => accMap.get(u.instanceId) ?? NONE4, {
    stackAtk: "ADD", stackDef: "MUL", rng: mulberry32(seed ^ 0x9e3779b9), gaugeMode: cond.gaugeMode ?? "MUL",
  });
  const internals = engine as unknown as { units: BattleUnit[]; turns: unknown[]; recordTurn: (u: BattleUnit, ...r: unknown[]) => unknown };
  const enemiesAlive = () => internals.units.filter((u) => u.team === "ENEMY" && u.alive);
  const protective = (u: BattleUnit) => hasStatus(u, "ENDURE") || hasStatus(u, "INVINCIBLE") || (u.shieldTurns > 0 && u.shieldValue > 0) || u.effects.some((e) => e.kind === "BUFF" && e.stat === "def");
  const defDownFrac = () => { const es = enemiesAlive(); return es.length ? es.filter((u) => u.effects.some((e) => e.kind === "DEBUFF" && e.stat === "def")).length / es.length : 0; };

  const firstDone = new Set<string>();
  let roundOneOver = false;
  let r1Kill = false;
  const chain = { tagged: tagOf.size > 0, stripHad: false, stripOk: false, defDownFrac: null as number | null, atkActedR1: false, atkDefDownFrac: null as number | null, atkProtective: null as number | null, ok: false, order: "" };
  let stripDone = false;
  const atkDD: number[] = [];
  const atkPR: number[] = [];
  let defDownDone = false;
  const original = internals.recordTurn.bind(engine);
  internals.recordTurn = (unit, ...rest) => {
    const isFirst = unit.team === "PLAYER" && !firstDone.has(unit.instanceId);
    if (unit.team === "PLAYER" && !isFirst) roundOneOver = true;
    const tag = tagOf.get(unit.instanceId);
    const aliveBefore = enemiesAlive().length;
    const buffedBefore = enemiesAlive().filter((u) => buffCount(u) > 0).map((u) => [u, buffCount(u)] as const);
    if (tag === "ATTACKER") {
      const es = enemiesAlive();
      if (es.length) { atkDD.push(defDownFrac()); atkPR.push(es.filter(protective).length / es.length); }
    }
    if (isFirst && tag === "ATTACKER") {
      chain.atkActedR1 = !roundOneOver;
      chain.atkDefDownFrac = defDownFrac();
      chain.atkProtective = enemiesAlive().filter(protective).length;
      chain.ok = stripDone && defDownDone && chain.atkDefDownFrac >= 0.5 && chain.atkProtective === 0 && chain.atkActedR1;
    }
    const out = original(unit, ...rest);
    if (isFirst) {
      firstDone.add(unit.instanceId);
      if (tag) chain.order += (chain.order ? ">" : "") + tag;
      if (tag === "STRIP") {
        stripDone = true;
        chain.stripHad = buffedBefore.length > 0;
        chain.stripOk = buffedBefore.some(([u, n]) => buffCount(u) < n);
      }
      if (tag === "DEFDOWN") { defDownDone = true; chain.defDownFrac = defDownFrac(); }
    }
    if (!roundOneOver && enemiesAlive().length < aliveBefore) r1Kill = true;
    return out;
  };
  const result = engine.run();
  const hpLeft = (team: string) => {
    const us = internals.units.filter((u) => u.team === team);
    return us.reduce((s, u) => s + (u.alive ? Math.max(0, u.currentHp) : 0), 0) / us.reduce((s, u) => s + u.maxHp, 0);
  };
  return {
    winner: result.winner, turns: result.turnsTaken,
    atkAlive: internals.units.filter((u) => u.team === "PLAYER" && u.alive).length,
    defAlive: enemiesAlive().length,
    defHpLeft: hpLeft("ENEMY"), atkHpLeft: hpLeft("PLAYER"),
    m: metrics, r1Kill, chain,
    atkDefDownAll: atkDD.length ? mean(atkDD) : null, atkProtectAll: atkPR.length ? mean(atkPR) : null,
    endureSaved: metrics.endureSaves > 0,
    endureKillGap: metrics.endureFirstTurn !== null && metrics.endureUnitDeathTurn !== null ? metrics.endureUnitDeathTurn - metrics.endureFirstTurn : null,
  };
}

/* ================================================================ 集計 */

const SEEDS = Array.from({ length: BATTLES }, (_, i) => 70_000 + i);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const ratio = (ok: number, att: number) => (att > 0 ? ok / att : NaN);

type Row = Record<string, string | number>;

function summarize(plan: string, a: Team4, d: Team4, cond: Condition, outs: Out[]): Row {
  const n = outs.length;
  const sum = (f: (o: Out) => number) => outs.reduce((s, o) => s + f(o), 0);
  const P = (f: (o: Out) => boolean) => outs.filter(f).length / n;
  const tagged = outs[0].chain.tagged;
  const endure = outs.filter((o) => o.endureSaved);
  return {
    plan, attack: a.key, defense: d.key, condition: cond.key, battles: n,
    atk_win: P((o) => o.winner === "PLAYER"), def_win: P((o) => o.winner === "ENEMY"), timeout: P((o) => o.winner === "DRAW"),
    mean_turns: mean(outs.map((o) => o.turns)), median_turns: median(outs.map((o) => o.turns)), max_turns: Math.max(...outs.map((o) => o.turns)),
    within20: P((o) => o.winner !== "DRAW" && o.turns <= 20), over50: P((o) => o.turns >= 50),
    atk_alive: mean(outs.map((o) => o.atkAlive)), def_alive: mean(outs.map((o) => o.defAlive)),
    def_hp_left: mean(outs.map((o) => o.defHpLeft)), atk_hp_left: mean(outs.map((o) => o.atkHpLeft)),
    r1_kill: P((o) => o.r1Kill),
    strip_rate: ratio(sum((o) => o.m.strip.PLAYER.ok), sum((o) => o.m.strip.PLAYER.att)),
    strip_att: sum((o) => o.m.strip.PLAYER.att) / n,
    strip_endure: ratio(sum((o) => o.m.strip.PLAYER.endureOk), sum((o) => o.m.strip.PLAYER.endureAtt)),
    strip_defup: ratio(sum((o) => o.m.strip.PLAYER.defUpOk), sum((o) => o.m.strip.PLAYER.defUpAtt)),
    strip_shield: ratio(sum((o) => o.m.strip.PLAYER.shieldOk), sum((o) => o.m.strip.PLAYER.shieldAtt)),
    strip_inv: ratio(sum((o) => o.m.strip.PLAYER.invOk), sum((o) => o.m.strip.PLAYER.invAtt)),
    defdown_rate: ratio(sum((o) => o.m.defDown.PLAYER.ok), sum((o) => o.m.defDown.PLAYER.att)),
    def_defdown_rate: ratio(sum((o) => o.m.defDown.ENEMY.ok), sum((o) => o.m.defDown.ENEMY.att)),
    chain_strip_ok: tagged ? ratio(outs.filter((o) => o.chain.stripHad && o.chain.stripOk).length, outs.filter((o) => o.chain.stripHad).length) : NaN,
    chain_defdown_frac: tagged ? mean(outs.filter((o) => o.chain.defDownFrac !== null).map((o) => o.chain.defDownFrac!)) : NaN,
    chain_both: tagged ? P((o) => (o.chain.defDownFrac ?? 0) >= 0.5 && (!o.chain.stripHad || o.chain.stripOk)) : NaN,
    chain_atk_acted: tagged ? P((o) => o.chain.atkActedR1) : NaN,
    chain_ok: tagged ? P((o) => o.chain.ok) : NaN,
    chain_atk_defdown: tagged ? mean(outs.filter((o) => o.chain.atkDefDownFrac !== null).map((o) => o.chain.atkDefDownFrac!)) : NaN,
    atk_all_defdown: tagged ? mean(outs.filter((o) => o.atkDefDownAll !== null).map((o) => o.atkDefDownAll!)) : NaN,
    atk_all_protect: tagged ? mean(outs.filter((o) => o.atkProtectAll !== null).map((o) => o.atkProtectAll!)) : NaN,
    chain_order: tagged ? mostCommon(outs.map((o) => o.chain.order)) : "",
    heal_def: sum((o) => o.m.heal.ENEMY) / n, heal_atk: sum((o) => o.m.heal.PLAYER) / n,
    shield_def: sum((o) => o.m.shield.ENEMY) / n, shield_atk: sum((o) => o.m.shield.PLAYER) / n,
    gauge_up_atk: sum((o) => o.m.gaugeUp.PLAYER) / n, gauge_up_def: sum((o) => o.m.gaugeUp.ENEMY) / n,
    gauge_down_by_atk: sum((o) => o.m.gaugeDown.PLAYER) / n, gauge_down_by_def: sum((o) => o.m.gaugeDown.ENEMY) / n,
    roll_att_atk: sum((o) => o.m.roll.PLAYER.att) / n, roll_ok_atk: ratio(sum((o) => o.m.roll.PLAYER.ok), sum((o) => o.m.roll.PLAYER.att)),
    roll_att_def: sum((o) => o.m.roll.ENEMY.att) / n, roll_ok_def: ratio(sum((o) => o.m.roll.ENEMY.ok), sum((o) => o.m.roll.ENEMY.att)),
    act_share_atk: sum((o) => o.m.actions.PLAYER) / Math.max(1, sum((o) => o.m.actions.PLAYER + o.m.actions.ENEMY)),
    max_streak: Math.max(...outs.map((o) => o.m.maxConsecutiveSameTeam)),
    endure_saved: endure.length / n,
    endure_stripped: sum((o) => o.m.endureStripped) / n,
    endure_kill_gap: mean(outs.filter((o) => o.endureKillGap !== null).map((o) => o.endureKillGap!)),
    endure_timeout: P((o) => o.endureSaved && o.winner === "DRAW"),
    procs: JSON.stringify(Object.fromEntries(Object.entries(outs.reduce((acc0, o) => { for (const [k, v] of Object.entries(o.m.procs)) acc0[k] = (acc0[k] ?? 0) + v; return acc0; }, {} as Record<string, number>)).map(([k, v]) => [k, +(v / n).toFixed(2)]))),
  };
}
function mostCommon(xs: string[]): string {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

const rows: Row[] = [];
let total = 0;
function run(plan: string, atks: Team4[], defs: Team4[], conds: Condition[]) {
  for (const cond of conds) for (const d of defs) for (const a of atks) {
    const outs = SEEDS.map((s) => runBattle(a, d, cond, s));
    total += outs.length;
    rows.push(summarize(plan, a, d, cond, outs));
  }
}

/* ================================================================ 計画 */

const offB = setOffB(OFF_B, "今回の最重要編成。①アビスリーパー光のS3で敵全体の強化を解除しつつ味方全体のゲージ+30% → ②モッチー闇のS3で敵全体に防御DOWN(抵抗無視)と味方全体に攻撃UP・ゲージ+10% → ③ウルフ電気のS3で味方全体のゲージ+24%・速度UP → ④ネメシス闇の全体S3。行動順は装備と能力ポイントだけで作った(アタッカーはあえて速度を積まない)");
const byKey = (teams: Team4[], key: string) => teams.find((t) => t.key === key)!;
const onlyTag = (tag: string, a: (m: Member4) => Acc4) => (m: Member4) => (m.tag === tag ? a(m) : NONE4);
const onlyKey = (keys: string[], a: (m: Member4) => Acc4) => (m: Member4) => (keys.includes(m.key) ? a(m) : NONE4);

const HEALERS = ["undine_WATER", "fairy_LIGHT", "valkyria_WATER"];
const SHIELDERS = ["behemoth_LIGHT", "golem_LIGHT"];
const DISRUPTORS_D = ["chronos_GRASS", "suezo_DARK"];

function plan(name: string) {
  const ALL_OFF = [...ATTACKS4];
  switch (name) {
    case "select":
      run("select", OFF_B_CANDIDATES, DEFENSES4, [C("N", "双方アクセなし", none, none)]);
      break;
    case "ablate":
      run("ablate", [offB, ...offBAblations()], DEFENSES4, [C("N", "双方アクセなし", none, none)]);
      break;
    case "main":
      run("main", ALL_OFF, DEFENSES4, [
        C("N", "双方アクセなし", none, none),
        C("RM", "双方 役割どおりのメインのみ", (m) => acc(m, "ROLE", "MAIN"), (m) => acc(m, "ROLE", "MAIN")),
        C("RH", "双方 役割最適ヒーロー", (m) => acc(m, "ROLE", "HERO"), (m) => acc(m, "ROLE", "HERO")),
        C("RL", "双方 役割最適レジェンド", (m) => acc(m, "ROLE", "LEGEND"), (m) => acc(m, "ROLE", "LEGEND")),
        C("RE", "双方 役割最適エピック", (m) => acc(m, "ROLE", "EPIC"), (m) => acc(m, "ROLE", "EPIC")),
        C("RX", "双方 役割最適の理想エピック", (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2), (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2)),
        C("OX", "双方 理想エピック・攻撃/耐久の2系統だけ(前回の世界)", (m) => acc(m, twoFamily(m), "EPIC", "MAX", 1.2), (m) => acc(m, twoFamily(m), "EPIC", "MAX", 1.2)),
        C("RXA", "攻撃側だけ役割最適の理想エピック", (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2), none),
        C("RXD", "防衛側だけ役割最適の理想エピック", none, (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2)),
      ]);
      break;
    case "stage":
      run("stage", [offB], DEFENSES4, [
        C("B0", "アクセなし", none, none),
        C("B1", "アタッカーだけATKメイン", onlyTag("ATTACKER", (m) => acc(m, "ATK", "MAIN")), none),
        C("B2", "アタッカー攻撃エピック+解除役サポートエピック", (m) => (m.tag === "ATTACKER" ? acc(m, "ATK") : m.tag === "STRIP" ? acc(m, "SUP_BUFF") : NONE4), none),
        C("B3", "B2の解除役を妨害(解除特化)にし、防御DOWN役に妨害エピック", (m) => (m.tag === "ATTACKER" ? acc(m, "ATK") : m.tag === "STRIP" ? acc(m, "DIS_STRIP") : m.tag === "DEFDOWN" ? acc(m, "DIS_RATE") : NONE4), none),
        C("B4", "全4体 役割最適エピック", (m) => acc(m, "ROLE"), none),
        C("B5", "全4体 1.2倍メイン+理想エピック", (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2), none),
        C("B5vRX", "B5 対 防衛も役割最適の理想エピック", (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2), (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2)),
      ]);
      break;
    case "stripper":
      run("stripper", [offB], DEFENSES4, ["none", "DEF", "SUP_BUFF", "SUP_CLEANSE", "DIS_RATE", "DIS_STRIP", "ATK"].map((p) =>
        C(`S:${p}`, `解除役だけ ${p === "none" ? "アクセなし" : p}(エピック)`, onlyTag("STRIP", (m) => acc(m, p === "none" ? null : p)), none)).concat(
        ["HERO", "LEGEND"].map((t) => C(`S:DIS_STRIP:${t}`, `解除役だけ 妨害解除特化 ${t}`, onlyTag("STRIP", (m) => acc(m, "DIS_STRIP", t as Tier)), none))));
      break;
    case "defdown":
      run("defdown", [offB], DEFENSES4, ["none", "ATK", "DEF", "DIS_MOCCHI", "DIS_RATE", "DIS_RATE_ATK"].map((p) =>
        C(`D:${p}`, `防御DOWN役だけ ${p}`, onlyTag("DEFDOWN", (m) => acc(m, p === "none" ? null : p)), none)));
      // 防御DOWN役がジョーカー水の候補でも比べる(抵抗判定のある防御DOWN)
      run("defdown-joker", [byKey(OFF_B_CANDIDATES, "B-und-jok")], DEFENSES4, ["none", "ATK", "DEF", "DIS_RATE", "DIS_RATE_ATK"].map((p) =>
        C(`D:${p}`, `防御DOWN役(ジョーカー水)だけ ${p}`, onlyTag("DEFDOWN", (m) => acc(m, p === "none" ? null : p)), none)));
      break;
    case "healer":
      run("healer", ALL_OFF, DEFENSES4, ["none", "DEF", "SUP_HEAL", "SUP_CLEANSE", "SUP_GAUGE", "SUP_BUFF"].map((p) =>
        C(`H:${p}`, `防衛のヒーラーだけ ${p}(エピック)`, none, onlyKey(HEALERS, (m) => acc(m, p === "none" ? null : p)))).concat(
        ["HERO", "LEGEND"].map((t) => C(`H:SUP_HEAL:${t}`, `防衛のヒーラーだけ 回復特化 ${t}`, none, onlyKey(HEALERS, (m) => acc(m, "SUP_HEAL", t as Tier))))));
      break;
    case "shield":
      run("shield", ALL_OFF, [byKey(DEFENSES4, "A"), byKey(DEFENSES4, "B"), byKey(DEFENSES4, "E")], ["none", "DEF", "SUP_SHIELD", "SUP_BUFF"].map((p) =>
        C(`SH:${p}`, `防衛のシールド役だけ ${p}(エピック)`, none, onlyKey(SHIELDERS, (m) => acc(m, p === "none" ? null : p)))));
      break;
    case "disrupt":
      // 防衛D(妨害耐久)の妨害役2体。永久妨害の兆候を見るため理想エピック(上限値)で
      run("disrupt-def", ALL_OFF, [byKey(DEFENSES4, "D")], [
        C("DD:none", "妨害役アクセなし", none, none),
        C("DD:DEF", "妨害役に耐久", none, onlyKey(DISRUPTORS_D, (m) => acc(m, "DEF", "EPIC", "MAX", 1.2))),
        C("DD:GAUGE_MUL", "妨害役にゲージ妨害(元の減少量×(1+x))", none, onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_GAUGE", "EPIC", "MAX", 1.2)), "MUL"),
        C("DD:GAUGE_ADD", "妨害役にゲージ妨害(x を pt で加算)", none, onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_GAUGE", "EPIC", "MAX", 1.2)), "ADD"),
        C("DD:RATE", "妨害役に付与率", none, onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_RATE", "EPIC", "MAX", 1.2))),
        C("DD:SPD", "妨害役にSPD(弱体3個以上)", none, onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_SPD", "EPIC", "MAX", 1.2))),
      ]);
      run("disrupt-atk", [byKey(ATTACKS4, "OFF-E")], DEFENSES4, [
        C("DA:none", "妨害役アクセなし", none, none),
        C("DA:ATK", "妨害役に攻撃(ATKメイン)", onlyKey(DISRUPTORS_D, (m) => acc(m, "ATK", "EPIC", "MAX", 1.2)), none),
        C("DA:GAUGE_MUL", "妨害役にゲージ妨害(×)", onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_GAUGE", "EPIC", "MAX", 1.2)), none, "MUL"),
        C("DA:GAUGE_ADD", "妨害役にゲージ妨害(+pt)", onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_GAUGE", "EPIC", "MAX", 1.2)), none, "ADD"),
        C("DA:RATE", "妨害役に付与率(HPメイン)", onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_RATE", "EPIC", "MAX", 1.2)), none),
        C("DA:RATE_ATK", "妨害役に付与率(ATKメイン)", onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_RATE_ATK", "EPIC", "MAX", 1.2)), none),
        C("DA:SPD", "妨害役にSPD(弱体3個以上)", onlyKey(DISRUPTORS_D, (m) => acc(m, "DIS_SPD", "EPIC", "MAX", 1.2)), none),
      ]);
      break;
    /*
     * 特殊効果を1個ずつ。**HP+6,000(1.2倍)のメインだけを着けた状態**と比べ、特殊1個(エピック上限値)の寄与を見る。
     * 3個セットの比較では「どれが効いたか」が分からないため。
     */
    case "single-sup": {
      const targets = [...HEALERS, ...SHIELDERS];
      const one = (k: Special4 | null) => onlyKey(targets, () => ({ main: "HP", mainValue: 6_000, specials: k ? [k] : [], tier: "EPIC", roll: "MAX", weak: null }));
      run("single-sup", ALL_OFF, DEFENSES4, [C("1S:main", "防衛のヒーラー・シールド役にHP+6,000だけ", none, one(null)),
        ...(Object.keys(SUP_SPECIALS) as Special4[]).map((k) => C(`1S:${k}`, `防衛のヒーラー・シールド役に ${k} 1個`, none, one(k)))]);
      break;
    }
    case "single-sup-atk": {
      const one = (k: Special4 | null) => (m: Member4) => (m.tag && m.tag !== "ATTACKER" ? { main: "HP" as const, mainValue: 6_000, specials: k ? [k] : [], tier: "EPIC" as const, roll: "MAX" as const, weak: null } : NONE4);
      run("single-sup-atk", [offB], DEFENSES4, [C("1SA:main", "OFF-Bの非アタッカー3体にHP+6,000だけ", one(null), none),
        ...(Object.keys(SUP_SPECIALS) as Special4[]).map((k) => C(`1SA:${k}`, `OFF-Bの非アタッカー3体に ${k} 1個`, one(k), none))]);
      break;
    }
    case "single-dis": {
      const oneA = (k: Special4 | null) => (m: Member4) => ((m.tag && m.tag !== "ATTACKER") || DISRUPTORS_D.includes(m.key) ? { main: "HP" as const, mainValue: 6_000, specials: k ? [k] : [], tier: "EPIC" as const, roll: "MAX" as const, weak: null } : NONE4);
      run("single-dis-atk", [offB, byKey(ATTACKS4, "OFF-E")], DEFENSES4, [C("1DA:main", "攻撃側の妨害・支援役にHP+6,000だけ", oneA(null), none),
        ...(Object.keys(DIS_SPECIALS) as Special4[]).map((k) => C(`1DA:${k}`, `攻撃側の妨害・支援役に ${k} 1個`, oneA(k), none)),
        C("1DA:GAUGE_DOWN_UP:ADD", "攻撃側の妨害・支援役に GAUGE_DOWN_UP 1個(pt加算)", oneA("GAUGE_DOWN_UP"), none, "ADD")]);
      const oneD = (k: Special4 | null) => onlyKey(DISRUPTORS_D, () => ({ main: "HP", mainValue: 6_000, specials: k ? [k] : [], tier: "EPIC", roll: "MAX", weak: null }));
      run("single-dis-def", ALL_OFF, [byKey(DEFENSES4, "D")], [C("1DD:main", "防衛Dの妨害役にHP+6,000だけ", none, oneD(null)),
        ...(Object.keys(DIS_SPECIALS) as Special4[]).map((k) => C(`1DD:${k}`, `防衛Dの妨害役に ${k} 1個`, none, oneD(k))),
        C("1DD:GAUGE_DOWN_UP:ADD", "防衛Dの妨害役に GAUGE_DOWN_UP 1個(pt加算)", none, oneD("GAUGE_DOWN_UP"), "ADD")]);
      break;
    }
    case "endure":
      run("endure", [byKey(ATTACKS4, "OFF-A"), offB, byKey(OFF_B_CANDIDATES, "B-und"), byKey(ATTACKS4, "OFF-E"), OFF_E_STRIP], DEFENSES4, [
        C("N", "双方アクセなし", none, none),
        C("RX", "双方 役割最適の理想エピック", (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2), (m) => acc(m, "ROLE", "EPIC", "MAX", 1.2)),
      ]);
      break;
    case "cross":
      // 攻撃側の妨害役(ジョーカー水)とデバッファー(スエゾー闇)のクロスビルド
      run("cross-joker", [byKey(ATTACKS4, "OFF-C"), byKey(ATTACKS4, "OFF-D")], DEFENSES4, ["none", "ATK", "DEF", "DIS_STRIP", "DIS_RATE", "DIS_RATE_ATK"].map((p) =>
        C(`J:${p}`, `ジョーカー水だけ ${p}`, onlyKey(["joker_WATER"], (m) => acc(m, p === "none" ? null : p)), none)));
      break;
    default:
      throw new Error(`計画 ${name} は無い`);
  }
}

/* ================================================================ 顔ぶれの表 */

function rosterTable(team: Team4, side: "A" | "D"): string {
  const lines = [`### ${team.label}\n`, `${team.concept}\n`,
    "| モンスター | 役割 | 属性 | タイプ転生 | 最終HP | 最終ATK | 最終DEF | 最終SPD(圧縮後) | 装備セット | 2/4/6番メイン | 能力ポイント | 潜在覚醒 | 役割最適アクセ(理想エピック) |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|"];
  for (const m of team.members) {
    const def = baseDef(m, side);
    const unit = createBattleUnit(def, side === "A" ? "PLAYER" : "ENEMY", "probe");
    const latent = (LATENT_ABILITY_CANDIDATES[`${m.templateId}_${m.element}`] ?? [])[m.latentIndex]?.name ?? "なし";
    const b = m.build; const ap = b.abilityPoints;
    lines.push(`| ${m.label} | ${m.tag ?? m.profiles[m.role4].label} | ${m.element} | ${MONSTER_TYPE_LABELS[b.type]} | ${Math.round(unit.maxHp).toLocaleString("en-US")} | ${getEffectiveStat(unit, "atk").toLocaleString("en-US")} | ${getEffectiveStat(unit, "def").toLocaleString("en-US")} | ${def.stats.spd}(${arenaCompressedSpeed(def.stats.spd)}) | ${SET_LABEL[b.set4]}4+${SET_LABEL[b.set2]}2 | ${[b.slot2, b.slot4, b.slot6].join(" / ")} | HP${ap.hp}・ATK${ap.atk}・DEF${ap.def}・SPD${ap.spd} | ${latent} | ${describe4(acc(m, "ROLE", "EPIC", "MAX", 1.2))} |`);
  }
  lines.push("", "| モンスター | 主要スキル | 採用した理由 |", "|---|---|---|");
  for (const m of team.members) lines.push(`| ${m.label} | ${m.skills} | ${m.why} |`);
  return lines.join("\n") + "\n";
}

/* ================================================================ 実行 */

const t0 = Date.now();
if (MODE === "roster") {
  console.log("## 攻撃編成\n");
  for (const t of [...ATTACKS4, OFF_E_STRIP]) console.log(rosterTable(t, "A"));
  console.log("## OFF-B の候補\n");
  for (const t of OFF_B_CANDIDATES) console.log(rosterTable(t, "A"));
  console.log("## 防衛編成\n");
  for (const t of DEFENSES4) console.log(rosterTable(t, "D"));
} else {
  if (MODE === "select") plan("select");
  else for (const p of PLAN.split(",")) plan(p);
  const keys = Object.keys(rows[0]);
  const fmt = (v: string | number) => (typeof v === "number" ? (Number.isNaN(v) ? "" : Number.isInteger(v) ? String(v) : v.toFixed(4)) : `"${v.replace(/"/g, '""')}"`);
  if (CSV) writeFileSync(CSV, [keys.join(","), ...rows.map((r) => keys.map((k) => fmt(r[k])).join(","))].join("\n") + "\n");
  console.log(`戦闘数 ${total} / ${((Date.now() - t0) / 1000).toFixed(0)}秒 / 行 ${rows.length}`);
}
