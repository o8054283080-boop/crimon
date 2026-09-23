/**
 * アクセサリー4系統の最終調整検証: **再設計したサポート型と、修正版の妨害型。**
 *
 * **検証専用。本番のデータには何も書かない。我慢の仕様も変えない。攻撃・耐久の数値も変えない。**
 *
 * 前回の `arena4Lab.ts` と同じく、本番の `BattleEngine` + アリーナの速度圧縮 + 長引いた時のダメージ増加で戦わせる。
 * 個体は Battle Lab の `buildAlly`(本番と同じ育成の道)。AIはエンジンの既定のまま(両陣営とも同じ)。
 * 「本人を集中攻撃されるケース」だけは、本番の手動操作用の `setFocusTarget` で攻撃側の単体技を1体に向ける。
 *
 *   npx tsx tools/arena5Lab.ts --mode roster
 *   npx tsx tools/arena5Lab.ts --plan main --battles 200 --csv out.csv
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
import { DIS5, NONE5, SUP5, attach5, buffCount, describe5, equip5, type Acc5, type Dis5, type Metrics5, type Special5, type Sup5 } from "./accessory5/specials5.js";
import { ATTACKS5, DEFENSES5, DEFENSES_NEW, DEF_X, OFF_B5, OFF_E_STRIP5, OFF_X, type Member5, type SupRole, type Team5 } from "./accessory5/roster5.js";
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
/** 計画の一部だけを回す(並列に分けるため)。"i/n" で n 分割の i 番目 */
const SHARD = arg("--shard", "0/1").split("/").map(Number);

/* ================================================================ 個体 */

function seedOf(key: string, side: "A" | "D"): number {
  let h = side === "A" ? 17 : 29;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
const baseCache = new Map<string, MonsterDefinition>();
function baseDef(m: Member5, side: "A" | "D"): MonsterDefinition {
  const k = `${side}:${m.key}:${JSON.stringify(m.build)}:${m.latentIndex}`;
  if (!baseCache.has(k)) {
    baseCache.set(k, buildAlly({
      label: m.label, templateId: m.templateId, element: m.element,
      type: m.build.type, abilityPoints: m.build.abilityPoints, gear: gearOf(m.build), latentIndex: m.latentIndex,
    }, mulberry32(seedOf(m.key, side))));
  }
  return baseCache.get(k)!;
}
function arenaDef(m: Member5, side: "A" | "D", acc: Acc5): MonsterDefinition {
  const def = equip5(m.patch ? m.patch(baseDef(m, side)) : baseDef(m, side), acc);
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

/* ================================================================ アクセ */

const MAIN_VALUE = { ATK: 2_000, HP: 5_000, DEF: 750 } as const;
const COUNT: Record<Tier, number> = { HERO: 1, LEGEND: 2, EPIC: 3 };

/** プロファイル名(ROLE=役割最適)・格・目・メイン倍率・値の上書きからアクセを作る */
function acc(m: Member5, profile: string | null, tier: Tier | "MAIN" = "EPIC", roll: Roll = "STD", mult = 1, override?: Acc5["override"]): Acc5 {
  if (!profile) return NONE5;
  const p = m.profiles[profile === "ROLE" ? m.role5 : profile];
  if (!p) throw new Error(`${m.label} にプロファイル ${profile} が無い`);
  if (tier === "MAIN") return { ...NONE5, main: p.main, mainValue: MAIN_VALUE[p.main] * mult };
  return { main: p.main, mainValue: MAIN_VALUE[p.main] * mult, specials: p.specials.slice(0, COUNT[tier]), tier, roll, weak: p.weak, override };
}
/** 攻撃・耐久の2系統だけ(前回までの世界)。攻撃役は攻撃、それ以外は耐久 */
const twoFamily = (m: Member5) => (m.role === "ATK" ? "ATK" : "DEF");
/** 特殊1個だけ(弱効果なし)。単体寄与の測定用 */
const single = (k: Special5 | null, main: "HP" | "ATK" = "HP", value?: number): Acc5 =>
  ({ main, mainValue: MAIN_VALUE[main] * 1.2, specials: k ? [k] : [], tier: "EPIC", roll: "MAX", weak: null, override: k && value !== undefined ? { [k]: value } as Acc5["override"] : undefined });

interface Condition {
  key: string;
  label: string;
  atk: (m: Member5) => Acc5;
  def: (m: Member5) => Acc5;
  gaugeMode?: "MUL" | "ADD";
  shieldMode?: "ADD" | "MAX";
  /** 攻撃側の単体技を、防衛のこの個体へ向ける(本人を集中攻撃されるケース) */
  focus?: (m: Member5) => boolean;
  /** 生存・行動を個別に追う個体(アクセを着けた本人) */
  watch?: (m: Member5, side: "A" | "D") => boolean;
}
const C = (key: string, label: string, atk: Condition["atk"], def: Condition["def"], extra: Partial<Condition> = {}): Condition => ({ key, label, atk, def, ...extra });
const none = () => NONE5;

/* ================================================================ 1戦 */

interface Out {
  winner: string; turns: number;
  atkAlive: number; defAlive: number; defHpLeft: number; atkHpLeft: number;
  m: Metrics5;
  r1Kill: boolean;
  chain: { tagged: boolean; stripHad: boolean; stripOk: boolean; defDownFrac: number | null; atkActedR1: boolean; ok: boolean };
  /** 注目個体: 生存・行動回数・倒れた手番 */
  watchAlive: number; watchCount: number; watchActions: number; watchDeathTurn: number | null;
  /** 注目個体と同じ陣営の、注目個体以外の生存数 */
  othersAlive: number; othersCount: number;
}

function runBattle(attack: Team5, defense: Team5, cond: Condition, seed: number): Out {
  const players = attack.members.map((m) => arenaDef(m, "A", cond.atk(m)));
  const enemies = defense.members.map((m) => arenaDef(m, "D", cond.def(m)));
  const accMap = new Map<string, Acc5>();
  attack.members.forEach((m, i) => accMap.set(`P${i + 1}`, cond.atk(m)));
  defense.members.forEach((m, i) => accMap.set(`E${i + 1}`, cond.def(m)));
  const tagOf = new Map<string, string>();
  attack.members.forEach((m, i) => { if (m.tag) tagOf.set(`P${i + 1}`, m.tag); });
  const watchIds = new Set<string>();
  attack.members.forEach((m, i) => { if (cond.watch?.(m, "A")) watchIds.add(`P${i + 1}`); });
  defense.members.forEach((m, i) => { if (cond.watch?.(m, "D")) watchIds.add(`E${i + 1}`); });
  const engine = new BattleEngine(players, enemies, { ...ARENA_BATTLE_OPTIONS, rng: mulberry32(seed) });
  const { metrics } = attach5(engine, (u) => accMap.get(u.instanceId) ?? NONE5, {
    stackAtk: "ADD", stackDef: "MUL", rng: mulberry32(seed ^ 0x9e3779b9), gaugeMode: cond.gaugeMode ?? "MUL", shieldMode: cond.shieldMode ?? "ADD",
  });
  const focusIdx = cond.focus ? defense.members.findIndex((m) => cond.focus!(m)) : -1;
  if (focusIdx >= 0) engine.setFocusTarget(`E${focusIdx + 1}`);
  const internals = engine as unknown as { units: BattleUnit[]; turns: unknown[]; recordTurn: (u: BattleUnit, ...r: unknown[]) => unknown };
  const enemiesAlive = () => internals.units.filter((u) => u.team === "ENEMY" && u.alive);
  const defDownFrac = () => { const es = enemiesAlive(); return es.length ? es.filter((u) => u.effects.some((e) => e.kind === "DEBUFF" && e.stat === "def")).length / es.length : 0; };

  const firstDone = new Set<string>();
  let roundOneOver = false;
  let r1Kill = false;
  const chain = { tagged: tagOf.size > 0, stripHad: false, stripOk: false, defDownFrac: null as number | null, atkActedR1: false, ok: false };
  let stripDone = false;
  let defDownDone = false;
  let watchDeathTurn: number | null = null;
  const original = internals.recordTurn.bind(engine);
  internals.recordTurn = (unit, ...rest) => {
    const isFirst = unit.team === "PLAYER" && !firstDone.has(unit.instanceId);
    if (unit.team === "PLAYER" && !isFirst) roundOneOver = true;
    const tag = tagOf.get(unit.instanceId);
    const aliveBefore = enemiesAlive().length;
    const buffedBefore = enemiesAlive().filter((u) => buffCount(u) > 0).map((u) => [u, buffCount(u)] as const);
    if (isFirst && tag === "ATTACKER") {
      chain.atkActedR1 = !roundOneOver;
      chain.ok = stripDone && defDownDone && defDownFrac() >= 0.5 && chain.atkActedR1;
    }
    const out = original(unit, ...rest);
    if (isFirst) {
      firstDone.add(unit.instanceId);
      if (tag === "STRIP") { stripDone = true; chain.stripHad = buffedBefore.length > 0; chain.stripOk = buffedBefore.some(([u, n]) => buffCount(u) < n); }
      if (tag === "DEFDOWN") { defDownDone = true; chain.defDownFrac = defDownFrac(); }
    }
    if (!roundOneOver && enemiesAlive().length < aliveBefore) r1Kill = true;
    if (watchDeathTurn === null && internals.units.some((u) => watchIds.has(u.instanceId) && !u.alive)) watchDeathTurn = internals.turns.length;
    return out;
  };
  const result = engine.run();
  const hpLeft = (team: string) => {
    const us = internals.units.filter((u) => u.team === team);
    return us.reduce((s, u) => s + (u.alive ? Math.max(0, u.currentHp) : 0), 0) / us.reduce((s, u) => s + u.maxHp, 0);
  };
  const watched = internals.units.filter((u) => watchIds.has(u.instanceId));
  const watchTeam = watched[0]?.team;
  const others = watchTeam ? internals.units.filter((u) => u.team === watchTeam && !watchIds.has(u.instanceId)) : [];
  return {
    winner: result.winner, turns: result.turnsTaken,
    atkAlive: internals.units.filter((u) => u.team === "PLAYER" && u.alive).length,
    defAlive: enemiesAlive().length,
    defHpLeft: hpLeft("ENEMY"), atkHpLeft: hpLeft("PLAYER"),
    m: metrics, r1Kill, chain,
    watchAlive: watched.filter((u) => u.alive).length, watchCount: watched.length,
    watchActions: watched.reduce((s, u) => s + (metrics.unitActions[u.instanceId] ?? 0), 0),
    watchDeathTurn,
    othersAlive: others.filter((u) => u.alive).length, othersCount: others.length,
  };
}

/* ================================================================ 集計 */

const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => 70_000 + i);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const ratio = (ok: number, att: number) => (att > 0 ? ok / att : NaN);

type Row = Record<string, string | number>;

function summarize(plan: string, a: Team5, d: Team5, cond: Condition, outs: Out[]): Row {
  const n = outs.length;
  const sum = (f: (o: Out) => number) => outs.reduce((s, o) => s + f(o), 0);
  const P = (f: (o: Out) => boolean) => outs.filter(f).length / n;
  const tagged = outs[0].chain.tagged;
  const watched = outs[0].watchCount > 0;
  const procs = outs.reduce((acc0, o) => { for (const [k, v] of Object.entries(o.m.procs)) acc0[k] = (acc0[k] ?? 0) + v; return acc0; }, {} as Record<string, number>);
  return {
    plan, attack: a.key, defense: d.key, condition: cond.key, label: cond.label, battles: n,
    atk_win: P((o) => o.winner === "PLAYER"), def_win: P((o) => o.winner === "ENEMY"), timeout: P((o) => o.winner === "DRAW"),
    mean_turns: mean(outs.map((o) => o.turns)), median_turns: median(outs.map((o) => o.turns)), max_turns: Math.max(...outs.map((o) => o.turns)),
    over50: P((o) => o.turns >= 50), over100: P((o) => o.turns > 100), over200: P((o) => o.turns > 200), at300: P((o) => o.turns >= 300),
    atk_alive: mean(outs.map((o) => o.atkAlive)), def_alive: mean(outs.map((o) => o.defAlive)),
    def_hp_left: mean(outs.map((o) => o.defHpLeft)), atk_hp_left: mean(outs.map((o) => o.atkHpLeft)),
    r1_kill: P((o) => o.r1Kill),
    strip_rate: ratio(sum((o) => o.m.strip.PLAYER.ok), sum((o) => o.m.strip.PLAYER.att)),
    strip_endure: ratio(sum((o) => o.m.strip.PLAYER.endureOk), sum((o) => o.m.strip.PLAYER.endureAtt)),
    defdown_rate: ratio(sum((o) => o.m.defDown.PLAYER.ok), sum((o) => o.m.defDown.PLAYER.att)),
    chain_ok: tagged ? P((o) => o.chain.ok) : NaN,
    chain_strip_ok: tagged ? ratio(outs.filter((o) => o.chain.stripHad && o.chain.stripOk).length, outs.filter((o) => o.chain.stripHad).length) : NaN,
    chain_defdown_frac: tagged ? mean(outs.filter((o) => o.chain.defDownFrac !== null).map((o) => o.chain.defDownFrac!)) : NaN,
    heal_def: sum((o) => o.m.heal.ENEMY) / n, heal_atk: sum((o) => o.m.heal.PLAYER) / n,
    acc_heal_def: sum((o) => o.m.accHeal.ENEMY) / n, acc_heal_atk: sum((o) => o.m.accHeal.PLAYER) / n,
    shield_def: sum((o) => o.m.shield.ENEMY) / n, shield_atk: sum((o) => o.m.shield.PLAYER) / n,
    acc_shield_def: sum((o) => o.m.accShield.ENEMY) / n, acc_shield_atk: sum((o) => o.m.accShield.PLAYER) / n,
    acc_shield_n_def: sum((o) => o.m.accShieldCount.ENEMY) / n,
    acc_shield_ratio_def: ratio(sum((o) => o.m.accShieldRatioSum.ENEMY), sum((o) => o.m.accShieldCount.ENEMY)),
    acc_shield_peak_def: Math.max(...outs.map((o) => o.m.accShieldPeak.ENEMY)),
    acc_shield_peak_mean_def: mean(outs.filter((o) => o.m.accShieldCount.ENEMY > 0).map((o) => o.m.accShieldPeak.ENEMY)),
    dr_saved_def: sum((o) => o.m.drSaved.ENEMY) / n, dr_hits_def: sum((o) => o.m.drHits.ENEMY) / n,
    revives_def: sum((o) => o.m.revives.ENEMY) / n, revives_atk: sum((o) => o.m.revives.PLAYER) / n,
    gauge_up_atk: sum((o) => o.m.gaugeUp.PLAYER) / n, gauge_up_def: sum((o) => o.m.gaugeUp.ENEMY) / n,
    gauge_down_by_atk: sum((o) => o.m.gaugeDown.PLAYER) / n, gauge_down_by_def: sum((o) => o.m.gaugeDown.ENEMY) / n,
    roll_ok_atk: ratio(sum((o) => o.m.roll.PLAYER.ok), sum((o) => o.m.roll.PLAYER.att)),
    roll_ok_def: ratio(sum((o) => o.m.roll.ENEMY.ok), sum((o) => o.m.roll.ENEMY.att)),
    actions_atk: sum((o) => o.m.actions.PLAYER) / n, actions_def: sum((o) => o.m.actions.ENEMY) / n,
    act_share_atk: sum((o) => o.m.actions.PLAYER) / Math.max(1, sum((o) => o.m.actions.PLAYER + o.m.actions.ENEMY)),
    max_streak: Math.max(...outs.map((o) => o.m.maxConsecutiveSameTeam)),
    mean_max_streak: mean(outs.map((o) => o.m.maxConsecutiveSameTeam)),
    endure_saves: sum((o) => o.m.endureSaves) / n,
    watch_alive: watched ? sum((o) => o.watchAlive) / sum((o) => o.watchCount) : NaN,
    watch_actions: watched ? sum((o) => o.watchActions) / sum((o) => o.watchCount) : NaN,
    watch_death_turn: watched ? mean(outs.filter((o) => o.watchDeathTurn !== null).map((o) => o.watchDeathTurn!)) : NaN,
    others_alive: watched ? ratio(sum((o) => o.othersAlive), sum((o) => o.othersCount)) : NaN,
    procs: JSON.stringify(Object.fromEntries(Object.entries(procs).map(([k, v]) => [k, +(v / n).toFixed(2)]))),
  };
}

const rows: Row[] = [];
let total = 0;
let jobIndex = 0;
function run(plan: string, atks: Team5[], defs: Team5[], conds: Condition[], battles = BATTLES) {
  for (const cond of conds) for (const d of defs) for (const a of atks) {
    // 分割実行: 仕事の通し番号で振り分ける(同じ仕事は常に同じ番号・同じseed)
    const mine = jobIndex++ % SHARD[1] === SHARD[0];
    if (!mine) continue;
    const outs = SEEDS(battles).map((s) => runBattle(a, d, cond, s));
    total += outs.length;
    rows.push(summarize(plan, a, d, cond, outs));
  }
}

/* ================================================================ 計画 */

const DEF_ALL = [...DEFENSES5, ...DEFENSES_NEW];
const byKey = (teams: Team5[], key: string) => teams.find((t) => t.key === key)!;
const has = (roles: SupRole[]) => (m: Member5) => m.sup.some((r) => roles.includes(r));
const onlyIf = (pred: (m: Member5) => boolean, a: (m: Member5) => Acc5) => (m: Member5) => (pred(m) ? a(m) : NONE5);
const onlyTag = (tag: string, a: (m: Member5) => Acc5) => onlyIf((m) => m.tag === tag, a);
const onlyKey = (keys: string[], a: (m: Member5) => Acc5) => onlyIf((m) => keys.includes(m.key), a);
const watchDef = (pred: (m: Member5) => boolean) => (m: Member5, side: "A" | "D") => side === "D" && pred(m);
const watchAtk = (pred: (m: Member5) => boolean) => (m: Member5, side: "A" | "D") => side === "A" && pred(m);

const HEALER = has(["HEALER"]);
const SHIELDER = (m: Member5) => m.sup.includes("SHIELDER") && !m.sup.includes("HEALER");
const CLEANSER = has(["CLEANSER"]);
const REVIVER = (m: Member5) => m.sup.includes("REVIVER") && m.key === "phoenix_DARK";
const SUPPORTERS = has(["HEALER", "SHIELDER", "CLEANSER", "REVIVER", "BUFFER"]);
const DIS_ATK_KEYS = ["chronos_GRASS", "suezo_DARK", "fenrir_LIGHT"];
const DIS_DEF_KEYS = ["chronos_GRASS", "suezo_DARK"];

/** 役割最適の理想エピック。`best` は検証で決めた推奨の組(役割ごと) */
const RX = (m: Member5) => acc(m, "ROLE", "EPIC", "MAX", 1.2);

function plan(name: string) {
  const ALL_OFF = [...ATTACKS5];
  switch (name) {
    /* ---------------- 15章: 特殊1個だけの寄与(HP+6,000 だけと比べる) ---------------- */
    case "single-sup": {
      run("single-sup", ALL_OFF, DEF_ALL, [
        C("1S:main", "防衛のサポート役にHP+6,000だけ", none, onlyIf(SUPPORTERS, () => single(null)), { watch: watchDef(SUPPORTERS) }),
        ...(Object.keys(SUP5) as Sup5[]).map((k) => C(`1S:${k}`, `防衛のサポート役に ${SUP5[k].label} 1個(エピック上限)`, none, onlyIf(SUPPORTERS, () => single(k)), { watch: watchDef(SUPPORTERS) })),
      ]);
      break;
    }
    case "single-sup-atk": {
      // 攻撃側(OFF-B の解除役・防御DOWN役・支援役)に着けた場合。強化付与・ゲージ系の寄与を見る
      const tgt = (m: Member5) => !!m.tag && m.tag !== "ATTACKER";
      run("single-sup-atk", [OFF_B5], DEF_ALL, [
        C("1SA:main", "OFF-Bの非アタッカー3体にHP+6,000だけ", onlyIf(tgt, () => single(null)), none),
        ...(Object.keys(SUP5) as Sup5[]).map((k) => C(`1SA:${k}`, `OFF-Bの非アタッカー3体に ${SUP5[k].label} 1個`, onlyIf(tgt, () => single(k)), none)),
      ]);
      break;
    }
    case "single-dis": {
      const tgtA = (m: Member5) => (!!m.tag && m.tag !== "ATTACKER") || DIS_ATK_KEYS.includes(m.key);
      run("single-dis-atk", [OFF_B5, byKey(ATTACKS5, "OFF-E")], DEF_ALL, [
        C("1DA:main", "攻撃側の妨害・支援役にHP+6,000だけ", onlyIf(tgtA, () => single(null)), none),
        ...(Object.keys(DIS5) as Dis5[]).map((k) => C(`1DA:${k}`, `攻撃側の妨害・支援役に ${DIS5[k].label} 1個`, onlyIf(tgtA, () => single(k)), none)),
        C("1DA:GAUGE_DOWN_UP:ADD", "攻撃側の妨害・支援役に ゲージ減少量UP 1個(12pt加算・危険確認)", onlyIf(tgtA, () => single("GAUGE_DOWN_UP")), none, { gaugeMode: "ADD" }),
      ]);
      const tgtD = (m: Member5) => DIS_DEF_KEYS.includes(m.key);
      run("single-dis-def", ALL_OFF, [byKey(DEFENSES5, "D")], [
        C("1DD:main", "防衛Dの妨害役にHP+6,000だけ", none, onlyIf(tgtD, () => single(null))),
        ...(Object.keys(DIS5) as Dis5[]).map((k) => C(`1DD:${k}`, `防衛Dの妨害役に ${DIS5[k].label} 1個`, none, onlyIf(tgtD, () => single(k)))),
        C("1DD:GAUGE_DOWN_UP:ADD", "防衛Dの妨害役に ゲージ減少量UP 1個(12pt加算・危険確認)", none, onlyIf(tgtD, () => single("GAUGE_DOWN_UP")), { gaugeMode: "ADD" }),
      ]);
      break;
    }
    case "weak": {
      // 弱効果だけ(メインHP+6,000)。サポート役に1個ずつ
      const weakAcc = (w: string, main: "HP" | "ATK" = "HP"): Acc5 => ({ main, mainValue: MAIN_VALUE[main] * 1.2, specials: [], tier: "EPIC", roll: "MAX", weak: w as Acc5["weak"] });
      run("weak-sup", ALL_OFF, DEF_ALL, ["WS_HEAL", "WS_SHIELD", "WS_HEALED_SHIELD", "WS_CLEANSE_HEAL", "WS_HEALED_GAUGE", "WS_CLEANSE_GAUGE", "WS_BUFF_SHIELD", "WS_REVIVE"].map((w) =>
        C(`W:${w}`, `防衛のサポート役に 弱効果 ${w} だけ`, none, onlyIf(SUPPORTERS, () => weakAcc(w)))));
      const tgtA = (m: Member5) => (!!m.tag && m.tag !== "ATTACKER") || DIS_ATK_KEYS.includes(m.key);
      run("weak-dis", [OFF_B5, byKey(ATTACKS5, "OFF-E")], DEF_ALL, ["WD_RATE", "WD_S1_RATE", "WD_S2_RATE", "WD_S3_RATE", "WD_GAUGE_DOWN", "WD_DEBUFF_GAUGE", "WD_STRIP_GAUGE", "WD_STUNNED_DMG"].map((w) =>
        C(`W:${w}`, `攻撃側の妨害・支援役に 弱効果 ${w} だけ`, onlyIf(tgtA, () => weakAcc(w)), none)));
      break;
    }

    /* ---------------- 17〜19章: 値の比較 ---------------- */
    case "sweep": {
      const shieldDefs = DEF_ALL.filter((t) => t.members.some(SHIELDER) || t.members.some((m) => m.key === "undine_ELECTRIC"));
      const shieldTarget = (m: Member5) => SHIELDER(m) || m.key === "undine_ELECTRIC";
      run("sweep-shield", ALL_OFF, shieldDefs, [
        C("SH:none", "シールド役 アクセなし", none, none, { watch: watchDef(shieldTarget) }),
        C("SH:DEF", "シールド役 耐久エピック", none, onlyIf(shieldTarget, (m) => acc(m, "DEF")), { watch: watchDef(shieldTarget) }),
        ...[0.25, 0.30, 0.35].map((v) => C(`SH:SUP_SHIELD@${v}`, `シールド役 シールド特化(シールド量UP ${v * 100}%)`, none, onlyIf(shieldTarget, (m) => acc(m, "SUP_SHIELD", "EPIC", "STD", 1, { SHIELD_UP: v })), { watch: watchDef(shieldTarget) })),
        ...[0.25, 0.30, 0.35].map((v) => C(`SH:ONLY@${v}`, `シールド役 シールド量UP ${v * 100}% 1個だけ`, none, onlyIf(shieldTarget, () => single("SHIELD_UP", "HP", v)), { watch: watchDef(shieldTarget) })),
        C("SH:SUP_SHIELD@0.30:MAX", "シールド役 シールド特化30%(アクセのシールドを本番と同じ『大きい方』で重ねる)", none, onlyIf(shieldTarget, (m) => acc(m, "SUP_SHIELD", "EPIC", "STD", 1, { SHIELD_UP: 0.30 })), { watch: watchDef(shieldTarget), shieldMode: "MAX" }),
      ]);
      const healDefs = DEF_ALL.filter((t) => t.members.some(HEALER));
      run("sweep-heal", ALL_OFF, healDefs, [
        C("HL:none", "ヒーラー アクセなし", none, none, { watch: watchDef(HEALER) }),
        C("HL:DEF", "ヒーラー 耐久エピック", none, onlyIf(HEALER, (m) => acc(m, "DEF_STD")), { watch: watchDef(HEALER) }),
        ...[0.06, 0.07, 0.08].map((v) => C(`HL:DR@${v}`, `ヒーラー 回復時軽減 ${v * 100}% 1個だけ`, none, onlyIf(HEALER, () => single("HEALED_DR", "HP", v)), { watch: watchDef(HEALER) })),
        ...[0.03, 0.04, 0.05].map((v) => C(`HL:HS@${v}`, `ヒーラー 回復時シールド ${v * 100}% 1個だけ`, none, onlyIf(HEALER, () => single("HEALED_SHIELD", "HP", v)), { watch: watchDef(HEALER) })),
        ...[0.04, 0.05, 0.06].map((v) => C(`HL:LS@${v}`, `ヒーラー 低HP回復時シールド ${v * 100}% 1個だけ`, none, onlyIf(HEALER, () => single("LOW50_HEALED_SHIELD", "HP", v)), { watch: watchDef(HEALER) })),
        ...[0.06, 0.07, 0.08].map((v) => C(`HL:GUARD_DR@${v}`, `ヒーラー 保護特化(軽減${v * 100}%・シールド4%・低HPシールド5.5%)`, none, onlyIf(HEALER, (m) => acc(m, "SUP_GUARD", "EPIC", "STD", 1, { HEALED_DR: v, HEALED_SHIELD: 0.04, LOW50_HEALED_SHIELD: 0.055 })), { watch: watchDef(HEALER) })),
        ...[0.03, 0.05].map((v) => C(`HL:GUARD_HS@${v}`, `ヒーラー 保護特化(軽減7%・シールド${v * 100}%・低HPシールド5.5%)`, none, onlyIf(HEALER, (m) => acc(m, "SUP_GUARD", "EPIC", "STD", 1, { HEALED_DR: 0.07, HEALED_SHIELD: v, LOW50_HEALED_SHIELD: 0.055 })), { watch: watchDef(HEALER) })),
        ...[0.04, 0.06].map((v) => C(`HL:GUARD_LS@${v}`, `ヒーラー 保護特化(軽減7%・シールド4%・低HPシールド${v * 100}%)`, none, onlyIf(HEALER, (m) => acc(m, "SUP_GUARD", "EPIC", "STD", 1, { HEALED_DR: 0.07, HEALED_SHIELD: 0.04, LOW50_HEALED_SHIELD: v })), { watch: watchDef(HEALER) })),
        C("HL:GUARD:MAX", "ヒーラー 保護特化(中央値)・アクセのシールドを『大きい方』で重ねる", none, onlyIf(HEALER, (m) => acc(m, "SUP_GUARD")), { watch: watchDef(HEALER), shieldMode: "MAX" }),
      ]);
      break;
    }

    /* ---------------- 21章: 耐久 vs サポート(ケース別) ---------------- */
    case "direct":
    case "direct-sup": {
      // direct-sup: サポートの条件だけ(`ACC5_SUP_SCALE` で値を何倍かにして、耐久と競合する倍率を探す)
      const supOnly = name === "direct-sup";
      const cases: { key: string; atk: Team5[]; focus?: (m: Member5) => boolean }[] = [
        { key: "全体", atk: [byKey(ATTACKS5, "OFF-A"), byKey(ATTACKS5, "OFF-C")] },
        { key: "単体", atk: [byKey(ATTACKS5, "OFF-D")] },
        { key: "防御DOWN", atk: [OFF_B5] },
        { key: "妨害", atk: [byKey(ATTACKS5, "OFF-E")] },
      ];
      const who: { key: string; pred: (m: Member5) => boolean; profiles: string[] }[] = [
        { key: "ヒーラー", pred: HEALER, profiles: ["DEF_STD", "SUP_HEAL", "SUP_GUARD", "SUP_CLEANSE", "SUP_TEMPO"] },
        { key: "シールド役", pred: (m) => SHIELDER(m) || m.key === "undine_ELECTRIC", profiles: ["DEF_STD", "SUP_SHIELD", "SUP_GUARD", "SUP_TEMPO"] },
        { key: "蘇生役", pred: REVIVER, profiles: ["DEF_STD", "SUP_REVIVE", "SUP_GUARD", "SUP_HEAL"] },
      ];
      for (const w0 of who) {
        const w = supOnly ? { ...w0, profiles: w0.profiles.filter((p) => p.startsWith("SUP_")) } : w0;
        const base = supOnly ? [] : ["none"];
        const defs = DEF_ALL.filter((t) => t.members.some(w.pred));
        for (const c of cases) {
          const conds = [...base, ...w.profiles].map((p) => C(`${w.key}:${c.key}:${p}`, `${w.key}だけ ${p}(エピック)・${c.key}`, none, onlyIf(w.pred, (m) => acc(m, p === "none" ? null : p)), { watch: watchDef(w.pred) }));
          run(`direct-${w.key}`, c.atk, defs, conds);
        }
        // 本人を集中攻撃されるケース: OFF-D と OFF-A の単体技を本人へ向ける
        const conds = [...base, ...w.profiles].map((p) => C(`${w.key}:集中:${p}`, `${w.key}だけ ${p}(エピック)・本人を集中攻撃`, none, onlyIf(w.pred, (m) => acc(m, p === "none" ? null : p)), { watch: watchDef(w.pred), focus: w.pred }));
        run(`direct-${w.key}`, [byKey(ATTACKS5, "OFF-D"), byKey(ATTACKS5, "OFF-A")], defs, conds);
      }
      break;
    }

    /* ---------------- 22章: 妨害アクセの直接比較 ---------------- */
    case "dis-direct": {
      const P4 = ["none", "DEF_STD", "ATK_ONLY", "DIS"];
      const accFor = (p: string, disProfile: string) => (m: Member5) => acc(m, p === "none" ? null : p === "DIS" ? disProfile : p);
      // 攻撃側: ゲージ役(クロノス草・スエゾー闇)・行動不能役(フェンリル光)in OFF-E、防御DOWN役(モッチー闇)・全体解除役(アビスリーパー光)in OFF-B
      const roles: { key: string; team: Team5; pred: (m: Member5) => boolean; dis: string }[] = [
        { key: "ゲージ役", team: byKey(ATTACKS5, "OFF-E"), pred: (m) => ["chronos_GRASS", "suezo_DARK"].includes(m.key), dis: "DIS_GAUGE" },
        { key: "行動不能役", team: byKey(ATTACKS5, "OFF-E"), pred: (m) => m.key === "fenrir_LIGHT", dis: "DIS_CC_ATK" },
        { key: "防御DOWN役", team: OFF_B5, pred: (m) => m.tag === "DEFDOWN", dis: "DIS_MOCCHI" },
        { key: "全体解除役", team: OFF_B5, pred: (m) => m.tag === "STRIP", dis: "DIS_STRIP" },
      ];
      for (const r of roles) {
        run(`dis-direct-${r.key}`, [r.team], DEF_ALL, P4.map((p) => C(`${r.key}:${p}`, `${r.key}だけ ${p === "DIS" ? r.dis : p}(エピック)`, onlyIf(r.pred, accFor(p, r.dis)), none, { watch: watchAtk(r.pred) })));
      }
      // 防衛側: 防衛Dのゲージ役
      run("dis-direct-防衛ゲージ役", ALL_OFF, [byKey(DEFENSES5, "D")], P4.map((p) => C(`防衛ゲージ役:${p}`, `防衛Dのゲージ役だけ ${p === "DIS" ? "DIS_GAUGE" : p}(エピック)`, none, onlyKey(DIS_DEF_KEYS, accFor(p, "DIS_GAUGE")), { watch: watchDef((m) => DIS_DEF_KEYS.includes(m.key)) })));
      break;
    }

    /* ---------------- 23章: ゲージハメ ---------------- */
    case "lock": {
      const allDis = (profile: string) => (m: Member5) => acc(m, profile === "ROLE" ? "ROLE" : profile, "EPIC", "MAX", 1.2);
      run("lock-atk", [OFF_X], DEF_ALL, [
        C("L:none", "妨害4体 アクセなし", none, none),
        C("L:RX", "妨害4体 全員妨害の理想エピック(ゲージ減少は元の量×)", allDis("ROLE"), none),
        C("L:RX:ADD", "妨害4体 全員妨害の理想エピック(ゲージ減少を pt 加算=危険確認)", allDis("ROLE"), none, { gaugeMode: "ADD" }),
        C("L:RXvRX", "妨害4体の理想エピック 対 防衛も役割最適の理想エピック", allDis("ROLE"), RX),
      ]);
      run("lock-def", ALL_OFF, [DEF_X], [
        C("L:none", "防衛の妨害4体 アクセなし", none, none),
        C("L:RX", "防衛の妨害4体 全員妨害の理想エピック", none, allDis("ROLE")),
        C("L:RX:ADD", "防衛の妨害4体 全員妨害の理想エピック(pt 加算=危険確認)", none, allDis("ROLE"), { gaugeMode: "ADD" }),
        C("L:RXvRX", "攻撃側も役割最適の理想エピック", RX, allDis("ROLE")),
      ]);
      break;
    }

    /* ---------------- 23章の分解: どの妨害特殊がハメを伸ばすか ---------------- */
    case "lock-split": {
      const one = (k: Dis5, v?: number) => (m: Member5) => ({ ...single(k, m.profiles[m.role5].main === "ATK" ? "ATK" : "HP", v) });
      const conds = [
        C("LS:main", "妨害4体 メインだけ", (m) => single(null, m.profiles[m.role5].main === "ATK" ? "ATK" : "HP"), none),
        ...(["GAUGE_DOWN_UP", "DEBUFFED_GAUGE_DOWN", "DEBUFF_SELF_GAUGE", "DEBUFF_RATE", "S3_RATE", "STUNNED_DMG"] as Dis5[]).map((k) => C(`LS:${k}`, `妨害4体 ${DIS5[k].label} 1個(上限値)`, one(k), none)),
        C("LS:GAUGE_DOWN_UP:ADD", "妨害4体 ゲージ減少量UP 1個(12pt加算)", one("GAUGE_DOWN_UP"), none, { gaugeMode: "ADD" }),
      ];
      run("lock-split-atk", [OFF_X], DEF_ALL, conds);
      run("lock-split-def", ALL_OFF, [DEF_X], conds.map((c) => ({ ...c, atk: none, def: c.atk })));
      break;
    }
    /* ---------------- 30章: 妨害の値の絞り込み(ゲージ減少倍率・付与率) ---------------- */
    case "dis-sweep": {
      const gaugeTeams = [byKey(ATTACKS5, "OFF-E"), OFF_X];
      const gAcc = (up: number, cond: number) => (m: Member5) => (m.role5.startsWith("DIS") ? acc(m, "DIS_GAUGE", "EPIC", "STD", 1, { GAUGE_DOWN_UP: up, DEBUFFED_GAUGE_DOWN: cond }) : NONE5);
      run("dis-sweep-gauge", gaugeTeams, DEF_ALL, [
        C("DG:none", "妨害役 アクセなし", none, none),
        ...[[0.08, 0.06], [0.10, 0.08], [0.12, 0.10], [0.15, 0.12]].map(([u, c]) => C(`DG:${u}/${c}`, `妨害役 ゲージ妨害(減少量×${1 + u}・弱体中×${1 + c}・自身ゲージ4%)`, gAcc(u, c), none)),
      ]);
      const rAcc = (v: number) => (m: Member5) => (m.role5.startsWith("DIS") ? acc(m, m.role5 === "DIS_GAUGE" ? "DIS_RATE" : m.role5, "EPIC", "STD", 1, { DEBUFF_RATE: v, S1_RATE: v, S2_RATE: v, S3_RATE: v }) : NONE5);
      run("dis-sweep-rate", [OFF_B5, byKey(ATTACKS5, "OFF-E")], DEF_ALL, [
        C("DR:none", "妨害役 アクセなし", none, none),
        ...[0.03, 0.04, 0.05, 0.07].map((v) => C(`DR:${v}`, `妨害役 役割最適(付与率の特殊を ${v * 100}pt に)`, rAcc(v), none)),
      ]);
      break;
    }

    /* ---------------- 24章: サポート永久耐久 ---------------- */
    case "wall": {
      const wallDefs = [...DEFENSES_NEW, byKey(DEFENSES5, "A"), byKey(DEFENSES5, "C")];
      // 防衛: ヒーラー → 保護特化 / シールド役 → シールド特化 / 蘇生役 → 蘇生特化 / タンク → 耐久(すべて理想エピック)
      const wallAcc = (heal: string) => (m: Member5) => {
        if (HEALER(m)) return acc(m, heal, "EPIC", "MAX", 1.2);
        if (SHIELDER(m)) return acc(m, "SUP_SHIELD", "EPIC", "MAX", 1.2);
        if (REVIVER(m)) return acc(m, "SUP_REVIVE", "EPIC", "MAX", 1.2);
        return acc(m, "DEF", "EPIC", "MAX", 1.2);
      };
      const offs = [...ALL_OFF, OFF_E_STRIP5];
      run("wall", offs, wallDefs, [
        C("W:none", "双方アクセなし", none, none),
        C("W:GUARD", "防衛サポート理想(ヒーラー保護特化)・攻撃アクセなし", none, wallAcc("SUP_GUARD")),
        C("W:HEAL", "防衛サポート理想(ヒーラー回復特化)・攻撃アクセなし", none, wallAcc("SUP_HEAL")),
        C("W:TEMPO", "防衛サポート理想(ヒーラー行動支援特化)・攻撃アクセなし", none, wallAcc("SUP_TEMPO")),
        C("W:GUARDvRX", "防衛サポート理想(保護特化) 対 攻撃側 役割最適の理想エピック", RX, wallAcc("SUP_GUARD")),
        C("W:GUARD:MAX", "防衛サポート理想(保護特化)・アクセのシールドを『大きい方』で重ねる", none, wallAcc("SUP_GUARD"), { shieldMode: "MAX" }),
      ]);
      break;
    }

    /* ---------------- 26章: クロスビルド ---------------- */
    case "cross": {
      // 解除役(アビスリーパー光): 耐久 / サポート / 妨害。防御DOWN役(モッチー闇): 攻撃 / 耐久 / 妨害
      run("cross-解除役", [OFF_B5], DEF_ALL, ["none", "DEF_STD", "SUP_TEMPO", "SUP_REVIVE", "DIS_STRIP", "DIS_RATE"].map((p) =>
        C(`解除役:${p}`, `解除役(アビスリーパー光)だけ ${p}`, onlyTag("STRIP", (m) => acc(m, p === "none" ? null : p)), none, { watch: watchAtk((m) => m.tag === "STRIP") })));
      run("cross-防御DOWN役", [OFF_B5], DEF_ALL, ["none", "ATK_ONLY", "DEF_STD", "DIS_MOCCHI", "DIS_RATE_ATK"].map((p) =>
        C(`防御DOWN役:${p}`, `防御DOWN役(モッチー闇)だけ ${p}`, onlyTag("DEFDOWN", (m) => acc(m, p === "none" ? null : p)), none, { watch: watchAtk((m) => m.tag === "DEFDOWN") })));
      // 妨害+火力: ジョーカー水(OFF-C・OFF-D)とフェンリル光(OFF-E)
      run("cross-妨害火力", [byKey(ATTACKS5, "OFF-C"), byKey(ATTACKS5, "OFF-D")], DEF_ALL, ["none", "ATK_ONLY", "DIS_CC_ATK", "DIS_CC", "DIS_RATE_ATK", "DIS_STRIP"].map((p) =>
        C(`ジョーカー水:${p}`, `ジョーカー水だけ ${p}`, onlyKey(["joker_WATER"], (m) => acc(m, p === "none" ? null : p)), none, { watch: watchAtk((m) => m.key === "joker_WATER") })));
      run("cross-妨害火力", [byKey(ATTACKS5, "OFF-E")], DEF_ALL, ["none", "ATK_ONLY", "DIS_CC_ATK", "DIS_CC", "DIS_RATE_ATK"].map((p) =>
        C(`フェンリル光:${p}`, `フェンリル光だけ ${p}`, onlyKey(["fenrir_LIGHT"], (m) => acc(m, p === "none" ? null : p)), none, { watch: watchAtk((m) => m.key === "fenrir_LIGHT") })));
      break;
    }

    /* ---------------- 27・28章と全体像 ---------------- */
    case "main":
      run("main", ALL_OFF, DEF_ALL, [
        C("N", "双方アクセなし", none, none),
        C("RM", "双方 役割どおりのメインのみ", (m) => acc(m, "ROLE", "MAIN"), (m) => acc(m, "ROLE", "MAIN")),
        C("RH", "双方 役割最適ヒーロー(特殊1+弱1)", (m) => acc(m, "ROLE", "HERO"), (m) => acc(m, "ROLE", "HERO")),
        C("RL", "双方 役割最適レジェンド(特殊2+弱1)", (m) => acc(m, "ROLE", "LEGEND"), (m) => acc(m, "ROLE", "LEGEND")),
        C("RE", "双方 役割最適エピック(特殊3+弱1)", (m) => acc(m, "ROLE", "EPIC"), (m) => acc(m, "ROLE", "EPIC")),
        C("RX", "双方 役割最適の理想エピック", RX, RX),
        C("OX", "双方 理想エピック・攻撃/耐久の2系統だけ(前回の世界)", (m) => acc(m, twoFamily(m), "EPIC", "MAX", 1.2), (m) => acc(m, twoFamily(m), "EPIC", "MAX", 1.2)),
        C("RXA", "攻撃側だけ役割最適の理想エピック", RX, none),
        C("RXD", "防衛側だけ役割最適の理想エピック", none, RX),
      ]);
      break;
    case "tier-sup": {
      // サポート・妨害の格の差(防衛のサポート役・攻撃の妨害役だけに着ける)
      const tiers: (Tier | "MAIN" | null)[] = [null, "MAIN", "HERO", "LEGEND", "EPIC"];
      run("tier-sup", ALL_OFF, DEF_ALL, tiers.map((t) => C(`TS:${t ?? "none"}`, `防衛のサポート役だけ 役割最適 ${t ?? "なし"}`, none, onlyIf(SUPPORTERS, (m) => (t ? acc(m, "ROLE", t) : NONE5)))));
      const tgtA = (m: Member5) => (!!m.tag && m.tag !== "ATTACKER") || DIS_ATK_KEYS.includes(m.key);
      run("tier-dis", [OFF_B5, byKey(ATTACKS5, "OFF-E")], DEF_ALL, tiers.map((t) => C(`TD:${t ?? "none"}`, `攻撃側の妨害・支援役だけ 役割最適 ${t ?? "なし"}`, onlyIf(tgtA, (m) => (t ? acc(m, "ROLE", t) : NONE5)), none)));
      break;
    }
    default:
      throw new Error(`計画 ${name} は無い`);
  }
}

/* ================================================================ 顔ぶれの表 */

function rosterTable(team: Team5, side: "A" | "D"): string {
  const lines = [`### ${team.label}\n`, `${team.concept}\n`,
    "| モンスター | 役割 | 属性 | タイプ転生 | 最終HP | 最終ATK | 最終DEF | 最終SPD(圧縮後) | 装備セット | 2/4/6番メイン | 能力ポイント | 潜在覚醒 | 役割最適アクセ(理想エピック) |",
    "|---|---|---|---|---:|---:|---:|---:|---|---|---|---|---|"];
  for (const m of team.members) {
    const def = baseDef(m, side);
    const unit = createBattleUnit(def, side === "A" ? "PLAYER" : "ENEMY", "probe");
    const latent = (LATENT_ABILITY_CANDIDATES[`${m.templateId}_${m.element}`] ?? [])[m.latentIndex]?.name ?? "なし";
    const b = m.build; const ap = b.abilityPoints;
    lines.push(`| ${m.label} | ${m.profiles[m.role5].label} | ${m.element} | ${MONSTER_TYPE_LABELS[b.type]} | ${Math.round(unit.maxHp).toLocaleString("en-US")} | ${getEffectiveStat(unit, "atk").toLocaleString("en-US")} | ${getEffectiveStat(unit, "def").toLocaleString("en-US")} | ${def.stats.spd}(${arenaCompressedSpeed(def.stats.spd)}) | ${SET_LABEL[b.set4]}4+${SET_LABEL[b.set2]}2 | ${[b.slot2, b.slot4, b.slot6].join(" / ")} | HP${ap.hp}・ATK${ap.atk}・DEF${ap.def}・SPD${ap.spd} | ${latent} | ${describe5(acc(m, "ROLE", "EPIC", "MAX", 1.2))} |`);
  }
  lines.push("", "| モンスター | 主要スキル | 採用した理由 |", "|---|---|---|");
  for (const m of team.members) lines.push(`| ${m.label} | ${m.skills} | ${m.why} |`);
  return lines.join("\n") + "\n";
}

/* ================================================================ 実行 */

const t0 = Date.now();
if (MODE === "roster") {
  console.log("## 攻撃編成\n");
  for (const t of [...ATTACKS5, OFF_E_STRIP5, OFF_X]) console.log(rosterTable(t, "A"));
  console.log("## 防衛編成\n");
  for (const t of [...DEF_ALL, DEF_X]) console.log(rosterTable(t, "D"));
} else {
  for (const p of PLAN.split(",")) plan(p);
  if (rows.length === 0) { console.log("この分割に仕事が無い"); process.exit(0); }
  const keys = Object.keys(rows[0]);
  const fmt = (v: string | number) => (typeof v === "number" ? (Number.isNaN(v) ? "" : Number.isInteger(v) ? String(v) : v.toFixed(4)) : `"${v.replace(/"/g, '""')}"`);
  if (CSV) writeFileSync(CSV, [keys.join(","), ...rows.map((r) => keys.map((k) => fmt(r[k])).join(","))].join("\n") + "\n");
  console.log(`戦闘数 ${total} / ${((Date.now() - t0) / 1000).toFixed(0)}秒 / 行 ${rows.length}`);
}
