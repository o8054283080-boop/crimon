/**
 * 1戦走らせて、起きたことを数える。
 *
 * ## なぜログを読んで数えるのか
 *
 * `BattleEngine` は結果とログを返すが、**「誰が誰に何をしたか」の表**は
 * 返さない。そこを取りたいがために計測用のフックをエンジンへ足すと、
 * 本編の戦闘に測定のための分岐が増える。増やしたくない。
 *
 * 代わりにログを読む。エンジンのログは行の先頭に
 * `[味方:P1]` / `[敵:E1]` という**識別子つきの名札**が必ず入るので、
 * 名前の重複や属性表記に左右されずに拾える。
 *
 * ## 数えているだけで、判定はしていない
 *
 * 勝敗もダメージも会心も、決めるのは全部エンジン。ここは出てきた
 * 数字を足し合わせるだけで、1つも計算し直していない。
 */
import { BattleEngine, BattleResult } from "../../src/battle/engine.js";
import type { MonsterDefinition } from "../../src/core/monster.js";
import { buildTeams } from "./build.js";
import { attachProbe } from "./hook.js";
import { mulberry32, runSeed } from "./rng.js";
import type { GearGrade, Scenario } from "./types.js";

/** 名札から識別子を取り出す。`[味方:P1] ドラゴン(火)` → `P1` */
const ID = /\[(?:味方|敵):(P\d+|E\d+)\]/;

function idOf(line: string): string | null {
  const m = ID.exec(line);
  return m ? m[1] : null;
}

/** 行の中の**すべての**識別子(反撃行のように2体出てくる行がある) */
function allIdsOf(line: string): string[] {
  return [...line.matchAll(/\[(?:味方|敵):(P\d+|E\d+)\]/g)].map((m) => m[1]);
}

export interface UnitTally {
  id: string;
  name: string;
  team: "PLAYER" | "ENEMY";
  alive: boolean;
  hpLeft: number;
  maxHp: number;
  /** 倒れた順番(1始まり)。生き残ったら0 */
  deathOrder: number;
  actions: number;
  damageDealt: number;
  damageTaken: number;
  healed: number;
  buffsGiven: number;
  debuffsLanded: number;
  stunsLanded: number;
  stripsLanded: number;
  resisted: number;
  /** 行動ゲージの吸収に成功した回数(スキル・パッシブの両方) */
  gaugeDrains: number;
  /** パッシブで自分の行動ゲージが進んだ回数(闇クロノスの「時の管理者」など) */
  passiveGaugeGains: number;
}

export interface SkillTally {
  key: string;
  unitId: string;
  skillName: string;
  uses: number;
  damage: number;
  crits: number;
  hits: number;
  debuffs: number;
  strips: number;
}

/** 豪魔人のような「溜めて返す反撃」を持つ敵だけの数え上げ */
export interface CounterTally {
  unitId: string;
  /** 溜めた反撃が発動した回数 */
  counters: number;
  /** 反撃で撃ったスキルの名前ごとの回数 */
  bySkill: Record<string, number>;
}

export interface BattleTally {
  winner: BattleResult["winner"];
  turns: number;
  survivors: number;
  units: UnitTally[];
  skills: SkillTally[];
  counters: CounterTally[];
  /** 敗因の見出し。勝った戦いでは空 */
  lossReason: string;
  log: string[];
  /**
   * その階だけの数え上げ。`Scenario.hook` を持つ盤面だけが中身を持つ。
   * 持たない盤面では空のまま(既存のシナリオは1つも変わらない)
   */
  extra: Record<string, number>;
}

function newUnitTally(def: MonsterDefinition, id: string, team: "PLAYER" | "ENEMY"): UnitTally {
  return {
    id, name: def.name, team, alive: true, hpLeft: def.stats.hp, maxHp: def.stats.hp,
    deathOrder: 0, actions: 0, damageDealt: 0, damageTaken: 0, healed: 0,
    buffsGiven: 0, debuffsLanded: 0, stunsLanded: 0, stripsLanded: 0, resisted: 0,
    gaugeDrains: 0, passiveGaugeGains: 0,
  };
}

/**
 * 1戦。
 *
 * `focus` を渡すと、味方AIの単体攻撃がその順で狙う
 * (`BattleEngine.setFocusTarget` は本編の「狙う相手を決める」機能そのもの)。
 *
 * `grade` を渡すと、味方の装備の仕上がり具合をそこまで落とす。
 * 装備を極めた人だけで測ると、その階が誰にとって難しいのかが読めない。
 */
export function runBattle(scenario: Scenario, seed: number, focus?: string[], grade?: GearGrade): BattleTally {
  const rng = mulberry32(seed);
  const { players, enemies } = buildTeams(scenario, rng, grade);
  const engine = new BattleEngine(players, enemies, {
    rng,
    maxTurns: scenario.maxTurns ?? 300,
    // 階固有の仕掛けを**本編の実装のまま**動かす。書いていない盤面は今までどおり
    trialTowerFloor: scenario.trialTowerFloor,
  });
  // 階固有の挙動と数え上げ。**戦闘の中身には入らない**(tools/battleLab/hook.ts)
  const probe = attachProbe(engine, scenario.hook);

  const tallies = new Map<string, UnitTally>();
  players.forEach((def, i) => tallies.set(`P${i + 1}`, newUnitTally(def, `P${i + 1}`, "PLAYER")));
  enemies.forEach((def, i) => tallies.set(`E${i + 1}`, newUnitTally(def, `E${i + 1}`, "ENEMY")));

  /** 狙う順の名前 → 識別子 */
  const focusIds = (focus ?? [])
    .map((label) => {
      const index = scenario.enemies.findIndex((e) => (e.label ?? e.templateId) === label);
      return index >= 0 ? `E${index + 1}` : null;
    })
    .filter((id): id is string => id !== null);

  /*
   * 狙う順は**1手ごとに引き直す。** 先頭が倒れたら次へ自動で移る。
   * 手番の合間に呼ばないと、倒した相手を狙い続けて手が止まる。
   */
  const refocus = (): void => {
    if (focusIds.length === 0) return;
    for (const id of focusIds) {
      const tally = tallies.get(id);
      if (tally?.alive) { engine.setFocusTarget(id); return; }
    }
    engine.setFocusTarget(null);
  };

  refocus();
  const result = engine.run();

  // --- ここから集計。エンジンは触らない ---
  let actor: string | null = null;
  let skillName = "";
  let inCounter = false;
  let deaths = 0;
  const skills = new Map<string, SkillTally>();
  const counters = new Map<string, CounterTally>();
  const lastHp = new Map<string, [number, number]>();

  const bump = (id: string, key: keyof UnitTally, amount = 1): void => {
    const tally = tallies.get(id);
    if (tally) (tally[key] as number) += amount;
  };
  const skillKey = (): string => `${actor}:${skillName}`;
  const skillTally = (): SkillTally | undefined => {
    if (!actor || !skillName) return undefined;
    const key = skillKey();
    let entry = skills.get(key);
    if (!entry) {
      entry = { key, unitId: actor, skillName, uses: 0, damage: 0, crits: 0, hits: 0, debuffs: 0, strips: 0 };
      skills.set(key, entry);
    }
    return entry;
  };

  for (const line of result.log) {
    // 通常の手番: 名札で始まり「〜の「技名」！」
    const use = /^\[(?:味方|敵):(P\d+|E\d+)\][^「]*の「(.+)」！$/.exec(line);
    if (use) {
      actor = use[1]; skillName = use[2]; inCounter = false;
      bump(actor, "actions");
      const entry = skillTally();
      if (entry) entry.uses += 1;
      continue;
    }

    // 溜めた反撃でスキルを撃った
    const counterSkill = /^ {2}→ \[(?:味方|敵):(P\d+|E\d+)\][^「]*の反撃「(.+)」！$/.exec(line);
    if (counterSkill) {
      actor = counterSkill[1]; skillName = counterSkill[2]; inCounter = true;
      const entry = skills.get(`${actor}:${skillName}(反撃)`) ?? {
        key: `${actor}:${skillName}(反撃)`, unitId: actor, skillName: `${skillName}(反撃)`,
        uses: 0, damage: 0, crits: 0, hits: 0, debuffs: 0, strips: 0,
      };
      entry.uses += 1;
      skills.set(entry.key, entry);
      skillName = `${skillName}(反撃)`;
      let counter = counters.get(actor);
      if (!counter) { counter = { unitId: actor, counters: 0, bySkill: {} }; counters.set(actor, counter); }
      counter.counters += 1;
      counter.bySkill[counterSkill[2]] = (counter.bySkill[counterSkill[2]] ?? 0) + 1;
      continue;
    }

    // 倍率だけの反撃(スキルを撃たない従来の形)
    const flatCounter = /^ {2}→ \[(?:味方|敵):(P\d+|E\d+)\][^「]*の反撃！/.exec(line);
    if (flatCounter) {
      actor = flatCounter[1]; skillName = "反撃"; inCounter = true;
      let counter = counters.get(actor);
      if (!counter) { counter = { unitId: actor, counters: 0, bySkill: {} }; counters.set(actor, counter); }
      counter.counters += 1;
      counter.bySkill["反撃"] = (counter.bySkill["反撃"] ?? 0) + 1;
      // 反撃の行には「攻撃者 に N ダメージ」まで一緒に入っている
      const ids = allIdsOf(line);
      const damage = /に (\d+) ダメージ/.exec(line);
      if (ids[1] && damage) {
        const amount = Number(damage[1]);
        bump(actor, "damageDealt", amount);
        bump(ids[1], "damageTaken", amount);
        const entry = skillTally();
        if (entry) { entry.damage += amount; entry.hits += 1; }
      }
      continue;
    }

    const target = idOf(line);
    if (!target) continue;

    const damage = /^ {2}→ .+ に (\d+) ダメージ！/.exec(line);
    if (damage) {
      const amount = Number(damage[1]);
      bump(target, "damageTaken", amount);
      if (actor && actor !== target) bump(actor, "damageDealt", amount);
      const entry = skillTally();
      if (entry) {
        entry.damage += amount;
        entry.hits += 1;
        if (line.includes("会心の一撃")) entry.crits += 1;
      }
      const hp = /残りHP (\d+)\/(\d+)/.exec(line);
      if (hp) lastHp.set(target, [Number(hp[1]), Number(hp[2])]);
      continue;
    }

    if (line.includes("は倒れた！")) {
      const tally = tallies.get(target);
      if (tally && tally.alive) { tally.alive = false; deaths += 1; tally.deathOrder = deaths; tally.hpLeft = 0; }
      continue;
    }
    if (/HPが (\d+) 回復/.test(line)) {
      const amount = Number(/HPが (\d+) 回復/.exec(line)![1]);
      bump(target, "healed", amount);
      const hp = /\((\d+)\/(\d+)\)/.exec(line);
      if (hp) lastHp.set(target, [Number(hp[1]), Number(hp[2])]);
      continue;
    }
    if (line.includes("が上昇！") || line.includes("の強化が")) { if (actor) bump(actor, "buffsGiven"); continue; }
    if (/ が低下！/.test(line)) {
      if (actor) bump(actor, "debuffsLanded");
      const entry = skillTally();
      if (entry) entry.debuffs += 1;
      continue;
    }
    if (line.includes("はスタンした！")) { if (actor) bump(actor, "stunsLanded"); continue; }
    if (line.includes("有利な効果が剥がされた") || line.includes("有利な効果を")) {
      if (actor) bump(actor, "stripsLanded");
      const entry = skillTally();
      if (entry) entry.strips += 1;
      continue;
    }
    if (line.includes("は効果を抵抗した！")) { bump(target, "resisted"); continue; }
    /*
     * ゲージまわり。**行の主語が違う**ので分けて数える。
     *   吸収した   … 主語は吸った側(名札はその1体だけ)
     *   進んだ     … 主語は進んだ本人
     */
    if (line.includes("行動ゲージを吸収した")) { bump(target, "gaugeDrains"); continue; }
    if (line.includes("で行動ゲージが進んだ")) { bump(target, "passiveGaugeGains"); continue; }
  }

  // 最終HPは engine の最終スナップショットが正。ログの読み落としに影響されない
  const finalSnapshot = result.turns.at(-1)?.snapshot ?? [];
  for (const snapshot of finalSnapshot) {
    const tally = tallies.get(snapshot.instanceId);
    if (!tally) continue;
    tally.alive = snapshot.alive;
    tally.hpLeft = snapshot.currentHp;
    tally.maxHp = snapshot.maxHp;
    if (!snapshot.alive && tally.deathOrder === 0) { deaths += 1; tally.deathOrder = deaths; }
  }

  const units = [...tallies.values()];
  const survivors = units.filter((u) => u.team === "PLAYER" && u.alive).length;

  return {
    winner: result.winner,
    turns: result.turnsTaken,
    survivors,
    units,
    skills: [...skills.values()],
    counters: [...counters.values()],
    lossReason: result.winner === "PLAYER" ? "" : classifyLoss(result, units, scenario),
    log: result.log,
    extra: probe?.finish() ?? {},
  };
}

/**
 * 敗因を、ログから機械的に見分ける。
 *
 * **賢い分析は目指さない。** 「ログのここにこう書いてあるから、たぶんこれ」
 * という素直な対応だけを並べる。曖昧なものは「その他」へ落とす方が、
 * それらしい嘘の分類を出すよりずっと役に立つ。
 */
function classifyLoss(result: BattleResult, units: UnitTally[], scenario: Scenario): string {
  if (result.winner === "DRAW") return "ターン上限";

  const dead = units.filter((u) => u.team === "PLAYER" && !u.alive).sort((a, b) => a.deathOrder - b.deathOrder);
  const firstDown = dead[0];

  // 最後に味方を倒した一撃を、ログを後ろから辿って探す
  let lastKiller = "";
  let lastSkill = "";
  let lastWasCrit = false;
  let lastWasCounter = false;
  let actor = "";
  let skill = "";
  let counter = false;
  let crit = false;
  for (const line of result.log) {
    const use = /^\[(?:味方|敵):(P\d+|E\d+)\][^「]*の「(.+)」！$/.exec(line);
    if (use) { actor = use[1]; skill = use[2]; counter = false; continue; }
    const counterSkill = /^ {2}→ \[(?:味方|敵):(P\d+|E\d+)\][^「]*の反撃「(.+)」！$/.exec(line);
    if (counterSkill) { actor = counterSkill[1]; skill = counterSkill[2]; counter = true; continue; }
    if (/^ {2}→ .+ に \d+ ダメージ！/.test(line)) { crit = line.includes("会心の一撃"); continue; }
    if (line.includes("は倒れた！") && /\[味方:/.test(line)) {
      lastKiller = actor; lastSkill = skill; lastWasCounter = counter; lastWasCrit = crit;
    }
  }

  const killerName = units.find((u) => u.id === lastKiller)?.name ?? "敵";
  const bossIndex = scenario.enemies.findIndex((e) => e.victoryTarget) ;
  const bossId = bossIndex >= 0 ? `E${bossIndex + 1}` : "E1";
  const bossAlive = units.find((u) => u.id === bossId)?.alive ?? true;
  const escortsAlive = units.filter((u) => u.team === "ENEMY" && u.id !== bossId && u.alive).length;

  if (lastWasCounter) return "6ヒット反撃で崩された";
  if (lastKiller === bossId && lastWasCrit) return `${killerName}「${lastSkill}」のクリティカル`;
  if (lastKiller === bossId) return `${killerName}「${lastSkill}」`;
  if (escortsAlive > 0 && bossAlive) return "取り巻きを倒しきる前に崩れた";
  if (firstDown && /ヒーラー|ウィスプ|フェアリー|回復/.test(firstDown.name)) return "回復役が最初に落ちた";
  if (firstDown) return `${firstDown.name} が最初に落ちた`;
  return "その他";
}

/** 走らせる回数ぶん、種をずらしながら繰り返す */
export function runMany(
  scenario: Scenario,
  baseSeed: number,
  runs: number,
  focus?: string[],
  grade?: GearGrade,
): BattleTally[] {
  const out: BattleTally[] = [];
  for (let i = 0; i < runs; i += 1) out.push(runBattle(scenario, runSeed(baseSeed, i), focus, grade));
  return out;
}
