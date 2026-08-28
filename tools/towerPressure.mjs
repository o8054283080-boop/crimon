/**
 * 試練の塔の難易度を、**編成ごとの到達階**で測る。
 *
 *   npx tsx tools/towerPressure.mjs            # 編成別の到達階(既定・30回ずつ登る)
 *   npx tsx tools/towerPressure.mjs --floors   # 1階ずつ全回復から挑んだ時の圧(単調性の確認)
 *   npx tsx tools/towerPressure.mjs --traits   # 傾向(癒やし/守り/群れ/疾風)が効いているか
 *   npx tsx tools/towerPressure.mjs --trace     # 階ごとに何が起きたか(突破率・越えた時の残HP)
 *   npx tsx tools/towerPressure.mjs --climbs 60 --teams 通常,毒
 *   npx tsx tools/towerPressure.mjs --gear 6 --tuned   # 装備を極めた人の目線で測る
 *
 * ## なぜ勝率で測らないか
 *
 * 勝率は上げすぎると全編成そろって0%へ張り付き、どの編成が上かすら読めなくなる
 * (装備ダンジョンで実際に起きた)。塔は落ちた階がそのまま出るので、
 * **到達階**という飽和しない指標が自然に取れる。中央値と分布で見る。
 *
 * ## 持ち越しは自前で書かない
 *
 * HPとクールタイムの持ち越し・節での全回復・倒れた仲間の扱いは
 * `src/game/trialTower.ts` の setupTowerBattle / applyTowerFloorResult をそのまま呼ぶ。
 * ここで再実装すると、実装が変わった時に**測定だけが古い規則で回り続ける**。
 *
 * ## 自己点検
 *
 * 「毒編成」と名乗る3体が毒を1つも持っておらず、まるごと嘘の結論を出したことがある。
 * この道具は測る前に、各編成が名乗った戦術を**スキル定義の上で実際に実行できるか**を
 * 確かめ、できていなければそこで止まる。さらに登坂中も、毒編成が敵に毒を入れられたか・
 * 耐久編成が実際に回復や盾を使えたかを数え、0なら警告を出す。
 */
import { BattleEngine } from "../src/battle/engine.js";
import { EQUIP_SLOTS, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance, resolveEquippedItems, toBattleDefinition } from "../src/core/monsterInstance.js";
import { MONSTER_DEX, MONSTER_TEMPLATES, findMonsterById } from "../src/data/monsters.js";
import {
  TOWER_FLOOR_COUNT,
  TOWER_TRAIT_LABEL,
  TRIAL_TOWER_FLOORS,
  buildTowerFloor,
} from "../src/data/trialTower.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";
import { addEquipment, createInitialState, equipToMonster } from "../src/game/playerState.js";
import { resolveDex } from "../src/game/stageRunner.js";
import { applyTowerFloorResult, beginTowerRun, setupTowerBattle } from "../src/game/trialTower.js";

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 測定の育成度。全編成そろって同じにする(差が育成度から出たら比較にならない)。
 *
 * 既定は★6 Lv60 + ★5装備。「装備を極めた人」は `--gear 6 --tuned` で測る。
 * 塔の上の方が★5装備で誰にも届かないのは失敗ではなく、そこが**極めた人の領域**だという意味。
 * それを確かめずに曲線を下げると、極めた人にとっての30階が消える。
 */
const PARTY_STAR = 6;
const PARTY_LEVEL = 60;
const GEAR_SUBSTATS = 4;
let gearStar = 5;
let gearTuned = false;

const NORMAL_TEMPLATE_IDS = MONSTER_TEMPLATES.map((t) => t.templateId);
const HIGH_RARITY_TEMPLATE_IDS = ["griffon", "dragon", "seraph", "nemesis"];
/** 光/闇は召喚でしか手に入らない。「通常編成」に混ぜると、持っていない人の編成ではなくなる */
const OBTAINABLE_ELEMENTS = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

/**
 * 比べる編成。
 *
 * `requires` は名乗った戦術を**実際に実行できるか**の条件で、飾りではない。
 * ここを緩めると、また「毒を持たない毒編成」を測ることになる。
 */
const TEAMS = {
  // 通常モンスターだけ。docs/design-concept.md の芯(ふつうのモンスターでも奥へ行ける)は
  // 極端な毒重ね・耐久ではなく、この編成がどこまで登れるかで見る
  通常: {
    ids: ["knight_WATER", "wolf_GRASS", "imp_ELECTRIC", "fairy_WATER"],
    requires: { templates: NORMAL_TEMPLATE_IDS, elements: OBTAINABLE_ELEMENTS },
  },
  高レア: {
    ids: ["griffon_GRASS", "dragon_FIRE", "seraph_WATER", "nemesis_ELECTRIC"],
    requires: { templates: HIGH_RARITY_TEMPLATE_IDS, elements: OBTAINABLE_ELEMENTS },
  },
  // 持ち越しの塔では、削られずに勝つことがそのまま次の階の余力になる。
  // 回復・継続回復・盾・解除を**実際に持っている**顔ぶれで組む
  耐久: {
    ids: ["golem_GRASS", "treant_ELECTRIC", "fairy_ELECTRIC", "wisp_WATER"],
    requires: {
      templates: ["treant", "golem", "fairy", "wisp"],
      elements: OBTAINABLE_ELEMENTS,
      kinds: { HEAL: 2, SHIELD: 2, REGEN: 1 },
      anyKinds: [["CLEANSE", "IMMUNITY"]],
    },
  },
  // **毒を持つのは属性違いのごく一部だけ。**適当に選ぶと毒を一度も撒けない
  毒: {
    ids: ["slime_GRASS", "slime_WATER", "imp_ELECTRIC", "wolf_ELECTRIC"],
    requires: { templates: ["slime", "imp", "wolf"], elements: OBTAINABLE_ELEMENTS, kinds: { POISON: 3 } },
  },
  // 毒を3体、癒やし手を1体。**毒が浅いのは毒のせいか、回復が無いせいか**を切り分けるための編成。
  // 上の「毒」との差が、そのまま持ち越しの塔における回復役の値打ちになる
  "毒+癒やし": {
    ids: ["slime_GRASS", "slime_WATER", "imp_ELECTRIC", "fairy_WATER"],
    requires: {
      templates: ["slime", "imp", "wolf", "fairy"],
      elements: OBTAINABLE_ELEMENTS,
      kinds: { POISON: 3, HEAL: 1 },
    },
  },
};

/**
 * 傾向が効いているかを見るための編成。傾向への「答え」を持つ側と持たない側を並べる。
 *
 * **両側とも通常モンスターだけで組む。**片方に高レアを混ぜると、出た差が
 * 傾向のせいなのかステータスのせいなのか分からなくなる。
 * 回復と盾も両側から外してある(持ち越しの強さが混ざるため)。
 */
const TRAIT_PROBE_TEAMS = {
  // 手番を奪う側。癒やし手を黙らせる/疾風の先手を崩す答えになりうる
  気絶持ち: {
    ids: ["wolf_FIRE", "knight_WATER", "knight_GRASS", "treant_WATER"],
    requires: { elements: OBTAINABLE_ELEMENTS, kinds: { STUN: 4 }, forbidKinds: ["HEAL", "SHIELD"] },
  },
  // 同じ育成度・同じ通常モンスターで、手番を奪う手段をまったく持たない側
  妨害なし: {
    ids: ["wolf_WATER", "knight_FIRE", "golem_ELECTRIC", "slime_FIRE"],
    requires: {
      elements: OBTAINABLE_ELEMENTS,
      forbidKinds: ["STUN", "GAUGE", "BLIND", "COOLDOWN_EXTEND", "HEAL", "SHIELD"],
    },
  },
  // 全体攻撃を全員が持つ側(群れの階の答え)
  全体攻撃: {
    ids: ["slime_GRASS", "slime_FIRE", "imp_FIRE", "golem_FIRE"],
    requires: { elements: OBTAINABLE_ELEMENTS, allEnemySkills: 4, forbidKinds: ["HEAL", "SHIELD"] },
  },
  // 単体攻撃しか持たない側
  単体のみ: {
    ids: ["wolf_WATER", "wolf_FIRE", "knight_FIRE", "golem_ELECTRIC"],
    requires: { elements: OBTAINABLE_ELEMENTS, allEnemySkills: 0, forbidKinds: ["HEAL", "SHIELD"] },
  },
};

/* ============================================================
 * 自己点検
 * ============================================================ */

function skillKindsOf(dexId) {
  const dex = findMonsterById(dexId) ?? MONSTER_DEX.find((m) => m.id === dexId);
  if (!dex) return null;
  const kinds = new Map();
  let allEnemySkills = 0;
  for (const skill of dex.skills) {
    if (skill.target === "ALL_ENEMIES") allEnemySkills += 1;
    for (const effect of skill.effects) kinds.set(effect.kind, (kinds.get(effect.kind) ?? 0) + 1);
  }
  return { dex, kinds, allEnemySkills };
}

/**
 * 編成が名乗った戦術を実行できるかを確かめる。問題があれば理由を並べて返す。
 * 返り値が空でなければ**測定を止める**。嘘の数字を出すより止まった方がいい。
 */
export function auditTeam(name, team) {
  const problems = [];
  const req = team.requires ?? {};
  const members = [];
  for (const id of team.ids) {
    const info = skillKindsOf(id);
    if (!info) {
      problems.push(`${id} という図鑑IDは存在しない`);
      continue;
    }
    members.push({ id, ...info });
  }
  if (req.templates) {
    for (const m of members) {
      if (!req.templates.includes(m.dex.templateId)) {
        problems.push(`${m.id} は ${name}編成の顔ぶれ(${req.templates.join("/")})に入っていない`);
      }
    }
  }
  if (req.elements) {
    for (const m of members) {
      if (!req.elements.includes(m.dex.element)) problems.push(`${m.id} の属性は測定の対象外(召喚限定)`);
    }
  }
  for (const [kind, min] of Object.entries(req.kinds ?? {})) {
    const holders = members.filter((m) => m.kinds.has(kind));
    if (holders.length < min) {
      problems.push(`${kind} を持つのが${holders.length}体しかいない(${min}体必要)`);
    }
  }
  for (const group of req.anyKinds ?? []) {
    const holders = members.filter((m) => group.some((k) => m.kinds.has(k)));
    if (holders.length === 0) problems.push(`${group.join("/")} を持つ相手が1体もいない`);
  }
  for (const kind of req.forbidKinds ?? []) {
    const holders = members.filter((m) => m.kinds.has(kind));
    if (holders.length > 0) problems.push(`${kind} を持つ ${holders.map((m) => m.id).join(",")} が混じっている`);
  }
  if (req.allEnemySkills !== undefined) {
    const count = members.filter((m) => m.allEnemySkills > 0).length;
    if (req.allEnemySkills > 0 && count < req.allEnemySkills) {
      problems.push(`全体攻撃を持つのが${count}体しかいない(${req.allEnemySkills}体必要)`);
    }
    if (req.allEnemySkills === 0 && count > 0) problems.push(`全体攻撃を持つ相手が${count}体混じっている`);
  }
  return { problems, members };
}

function printAudit(teams) {
  console.log("=== 自己点検(名乗った戦術を実際に実行できるか) ===");
  let ok = true;
  for (const [name, team] of Object.entries(teams)) {
    const { problems, members } = auditTeam(name, team);
    for (const m of members) {
      const kinds = [...m.kinds.keys()].filter((k) => k !== "DAMAGE").join(",") || "(攻撃のみ)";
      console.log(`  ${name.padEnd(6)} ${m.id.padEnd(20)} ${kinds}`);
    }
    for (const p of problems) {
      console.log(`  ⚠ ${name}: ${p}`);
      ok = false;
    }
  }
  if (!ok) {
    console.error("\n編成が名乗った戦術を実行できていない。この状態で測った数字は難易度ではなく編成ミスを測る");
    process.exit(1);
  }
  console.log("");
}

/* ============================================================
 * 登坂
 * ============================================================ */

/**
 * 速度に寄せた副効果の装備を選び直す(実際のプレイヤーがやる装備の詰め方の再現)。
 * ランダムに生成した装備をそのまま着けるだけでは、詰めた編成の強さを過小評価する。
 */
function tunedGear(rng) {
  const best = {};
  for (let r = 0; r < 30; r += 1) {
    for (const slot of EQUIP_SLOTS) {
      const eq = generateEquipment({ slot, star: gearStar, subStatCount: GEAR_SUBSTATS, rng });
      const spd = [eq.mainStat, ...eq.subStats].reduce((s, x) => s + (x.type === "SPD" ? x.value : 0), 0);
      if (!best[slot] || spd > best[slot].spd) best[slot] = { eq, spd };
    }
  }
  return Object.values(best).map((b) => b.eq);
}

function buildClimber(ids, rng) {
  const state = createInitialState();
  // スタミナは塔の難易度と関係がない。ここでは切らさないようにしておく
  state.stamina = 9999;
  const party = ids.map((id) => createMonsterInstance(id, PARTY_STAR, PARTY_LEVEL));
  state.monsters = party;
  for (const m of party) {
    const gear = gearTuned
      ? tunedGear(rng)
      : EQUIP_SLOTS.map((slot) => generateEquipment({ slot, star: gearStar, subStatCount: GEAR_SUBSTATS, rng }));
    for (const eq of gear) {
      addEquipment(state, eq);
      equipToMonster(state, m.id, eq.id);
    }
  }
  state.towerPartyIds = party.map((m) => m.id);
  return state;
}

/** 1回ぶんの登坂。実際の持ち越しの仕組み(src/game/trialTower.ts)をそのまま使う */
function climbOnce(ids, seed) {
  const rng = mulberry32(seed);
  const state = buildClimber(ids, rng);
  const perFloor = [];
  let maxPoisonOnEnemy = 0;
  let ownShieldSeen = 0;
  let ownHealSeen = 0;

  for (let guard = 0; guard < TOWER_FLOOR_COUNT * 2; guard += 1) {
    const run = state.trialTowerRun ?? beginTowerRun(state);
    if (!run) break;
    const setup = setupTowerBattle(state, run);
    if (!setup) break;
    const floorNo = run.floor;
    const engine = new BattleEngine(setup.playerDefs, setup.enemyDefs, {
      rng,
      initialPlayerHp: setup.initialPlayerHp,
      initialCooldowns: setup.initialCooldowns,
    });
    const result = engine.run();
    const cleared = result.winner === "PLAYER";

    for (const turn of result.turns) {
      for (const u of turn.snapshot) {
        if (u.team === "ENEMY") maxPoisonOnEnemy = Math.max(maxPoisonOnEnemy, u.poisonStacks);
        else ownShieldSeen = Math.max(ownShieldSeen, u.shieldValue);
      }
      for (const ev of turn.events) {
        if (ev.kind !== "HEAL") continue;
        const target = turn.snapshot.find((u) => u.instanceId === ev.targetId);
        if (target && target.team === "PLAYER") ownHealSeen += ev.amount ?? 0;
      }
    }

    const last = result.turns[result.turns.length - 1];
    const snap = last ? last.snapshot : [];
    const enemyMax = snap.filter((u) => u.team === "ENEMY").reduce((s, u) => s + u.maxHp, 0);
    const enemyLeft = snap.filter((u) => u.team === "ENEMY").reduce((s, u) => s + Math.max(0, u.currentHp), 0);
    const allyMax = snap.filter((u) => u.team === "PLAYER").reduce((s, u) => s + u.maxHp, 0);
    const allyLeft = snap.filter((u) => u.team === "PLAYER").reduce((s, u) => s + Math.max(0, u.currentHp), 0);
    perFloor.push({
      floor: floorNo,
      cleared,
      enemyHpLeft: enemyMax > 0 ? enemyLeft / enemyMax : 0,
      // 越えた直後にどれだけ余力が残っているか。持ち越しの塔ではこれが次の階の資本になる
      allyHpLeft: allyMax > 0 ? allyLeft / allyMax : 0,
      standing: setup.standingMembers.length,
      turns: result.turnsTaken,
    });

    const outcome = applyTowerFloorResult(state, run, setup, engine, cleared, rng);
    if (outcome.wiped || outcome.completed) break;
  }

  return { reached: state.trialTowerBestFloor, perFloor, maxPoisonOnEnemy, ownShieldSeen, ownHealSeen };
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[i];
}

export function measureClimbs(ids, climbs = 30, seedBase = 4200) {
  const reached = [];
  const runs = [];
  let maxPoisonOnEnemy = 0;
  let ownShieldSeen = 0;
  let ownHealSeen = 0;
  for (let i = 0; i < climbs; i += 1) {
    const r = climbOnce(ids, seedBase + i * 17);
    reached.push(r.reached);
    runs.push(r);
    maxPoisonOnEnemy = Math.max(maxPoisonOnEnemy, r.maxPoisonOnEnemy);
    ownShieldSeen = Math.max(ownShieldSeen, r.ownShieldSeen);
    ownHealSeen += r.ownHealSeen;
  }
  const sorted = [...reached].sort((a, b) => a - b);
  // 1階あたりの行動数。**長さもバランスのうち。**実測で1行動がx8再生の約1秒なので、
  // 200手を超える階は1戦5分を超える。数字の上で成立していても、そこは遊べていない
  const turns = runs.flatMap((r) => r.perFloor.map((f) => f.turns)).sort((a, b) => a - b);
  // どの階で止まったかを数える。中央値だけだと「詰まる場所」が見えない
  const stuck = new Map();
  for (const r of runs) {
    const last = r.perFloor[r.perFloor.length - 1];
    if (last && !last.cleared) stuck.set(last.floor, (stuck.get(last.floor) ?? 0) + 1);
  }
  return {
    median: quantile(sorted, 0.5),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    reach10: reached.filter((f) => f >= 10).length / reached.length,
    reach20: reached.filter((f) => f >= 20).length / reached.length,
    reach30: reached.filter((f) => f >= 30).length / reached.length,
    stuck: [...stuck.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
    turnsMedian: quantile(turns, 0.5),
    turnsMax: turns[turns.length - 1] ?? 0,
    maxPoisonOnEnemy,
    ownShieldSeen,
    ownHealSeen,
    runs,
  };
}

/* ============================================================
 * 1階ずつの圧(全回復から挑む)
 * ============================================================ */

/**
 * 持ち越し無しで1階だけ挑んだ時の圧。
 *
 * 到達階は持ち越しが混ざるので、**階そのものが単調に重くなっているか**はこちらで見る。
 * 勝率ではなく決着時点の敵残HP割合を使うので、勝てない階が続いても差が読める。
 */
export function measureFloor(ids, floor, trials = 20, seedBase = 7700, traitOverride) {
  return measureFloorDef(ids, traitOverride ? buildTowerFloor(floor, traitOverride) : TRIAL_TOWER_FLOORS[floor - 1], trials, seedBase);
}

/** 階の定義を直に渡して測る。曲線の候補を振る時(scan)に使う */
export function measureFloorDef(ids, def, trials = 20, seedBase = 7700) {
  let wins = 0;
  let enemyHpLeftSum = 0;
  let allyHpLeftSum = 0;
  let turnsSum = 0;
  let enemyHealSum = 0;
  let enemyShieldMax = 0;
  for (let i = 0; i < trials; i += 1) {
    const rng = mulberry32(seedBase + i * 31);
    const state = buildClimber(ids, rng);
    const party = state.monsters;
    const setup = {
      playerDefs: party.map((m) => toBattleDef(m, state)),
      enemyDefs: buildDungeonEnemyTeam(def),
    };
    const result = new BattleEngine(setup.playerDefs, setup.enemyDefs, { rng }).run();
    if (result.winner === "PLAYER") wins += 1;
    turnsSum += result.turnsTaken;
    for (const turn of result.turns) {
      for (const u of turn.snapshot) {
        if (u.team === "ENEMY") enemyShieldMax = Math.max(enemyShieldMax, u.shieldValue);
      }
      for (const ev of turn.events) {
        if (ev.kind !== "HEAL") continue;
        const target = turn.snapshot.find((u) => u.instanceId === ev.targetId);
        if (target && target.team === "ENEMY") enemyHealSum += ev.amount ?? 0;
      }
    }
    const last = result.turns[result.turns.length - 1];
    const snap = last ? last.snapshot : [];
    const enemyMax = snap.filter((u) => u.team === "ENEMY").reduce((s, u) => s + u.maxHp, 0);
    const enemyLeft = snap.filter((u) => u.team === "ENEMY").reduce((s, u) => s + Math.max(0, u.currentHp), 0);
    const allyMax = snap.filter((u) => u.team === "PLAYER").reduce((s, u) => s + u.maxHp, 0);
    const allyLeft = snap.filter((u) => u.team === "PLAYER").reduce((s, u) => s + Math.max(0, u.currentHp), 0);
    enemyHpLeftSum += enemyMax > 0 ? enemyLeft / enemyMax : 0;
    allyHpLeftSum += allyMax > 0 ? allyLeft / allyMax : 0;
  }
  return {
    rate: wins / trials,
    enemyHpLeft: enemyHpLeftSum / trials,
    allyHpLeft: allyHpLeftSum / trials,
    turns: turnsSum / trials,
    enemyHeal: enemyHealSum / trials,
    enemyShieldMax,
  };
}

/** 装備込みの戦闘定義。setupTowerBattle と同じ経路を通す */
function toBattleDef(instance, state) {
  return toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, state.equipment));
}

/* ============================================================
 * 出力
 * ============================================================ */

const pct = (v) => `${(v * 100).toFixed(0)}%`;

function runClimbMode(teams, climbs) {
  printAudit(teams);
  console.log(
    `=== 編成別の到達階(${climbs}回ずつ / ★${PARTY_STAR} Lv${PARTY_LEVEL} + ★${gearStar}装備${gearTuned ? "・速度に詰めたもの" : ""}) ===`,
  );
  console.log(
    "編成".padEnd(8) +
      "中央値".padStart(8) +
      "最低".padStart(6) +
      "25%".padStart(6) +
      "75%".padStart(6) +
      "最高".padStart(6) +
      "10階".padStart(7) +
      "20階".padStart(7) +
      "踏破".padStart(7) +
      "  手数".padStart(11) +
      "  詰まった階",
  );
  const results = {};
  for (const [name, team] of Object.entries(teams)) {
    const r = measureClimbs(team.ids, climbs);
    results[name] = r;
    console.log(
      name.padEnd(8) +
        String(r.median).padStart(8) +
        String(r.min).padStart(6) +
        String(r.p25).padStart(6) +
        String(r.p75).padStart(6) +
        String(r.max).padStart(6) +
        pct(r.reach10).padStart(7) +
        pct(r.reach20).padStart(7) +
        pct(r.reach30).padStart(7) +
        `${r.turnsMedian}/${r.turnsMax}`.padStart(11) +
        "  " +
        r.stuck.map(([f, n]) => `${f}階×${n}`).join(" "),
    );
    if (name.includes("毒") && r.maxPoisonOnEnemy === 0) {
      console.log("  ⚠ 毒編成が一度も毒を入れていない。この行は難易度ではなく編成ミスを測っている");
    }
    if (name.includes("耐久") && (r.ownShieldSeen === 0 || r.ownHealSeen === 0)) {
      console.log("  ⚠ 耐久編成が盾も回復も使えていない。この行は難易度ではなく編成ミスを測っている");
    }
    // 長さもバランスのうち。実測で1行動がx8再生の約1秒(装備ダンジョン5階で37手=37秒)なので、
    // 中央値120手を超えると1階に2分かかる。数字の上で成立していても、そこは遊べていない
    if (r.turnsMedian > 120) {
      console.log(`  ⚠ 1階あたり中央値${r.turnsMedian}手。x8再生でも1階に2分以上かかる`);
    }
  }
  return results;
}

function runFloorMode(teams) {
  console.log("=== 1階ずつ全回復から挑んだ時の圧(勝率 / 敵残HP / 味方残HP) ===");
  const names = Object.keys(teams);
  console.log("階".padStart(3) + " 傾向".padEnd(9) + "倍率".padStart(7) + names.map((n) => n.padStart(14)).join(""));
  for (let f = 1; f <= TOWER_FLOOR_COUNT; f += 1) {
    const def = TRIAL_TOWER_FLOORS[f - 1];
    const cells = names.map((n) => {
      const r = measureFloor(teams[n].ids, f, 12);
      return `${pct(r.rate)}/${pct(r.enemyHpLeft)}/${pct(r.allyHpLeft)}`.padStart(14);
    });
    const label = def.trait === "NONE" ? (f % 5 === 0 ? "関門" : "-") : TOWER_TRAIT_LABEL[def.trait];
    console.log(String(f).padStart(3) + " " + label.padEnd(8) + def.powerScale.toFixed(2).padStart(7) + cells.join(""));
  }
}

/**
 * 登坂中に階ごとで何が起きているかを追う。
 * 到達階だけを見ていると「どこでどれだけ削られたか」が読めず、
 * 曲線を上げるべきなのか、ボス階だけを直すべきなのかが分からない。
 */
function runTraceMode(teams, climbs) {
  for (const [name, team] of Object.entries(teams)) {
    const r = measureClimbs(team.ids, climbs);
    console.log(`\n=== ${name} の登坂(${climbs}回) 中央値${r.median}階 ===`);
    console.log("階".padStart(3) + " 傾向".padEnd(9) + "挑戦".padStart(5) + "突破".padStart(6) + "越えた時の残HP".padStart(15) + "  生存".padStart(6));
    const byFloor = new Map();
    for (const run of r.runs) {
      for (const f of run.perFloor) {
        if (!byFloor.has(f.floor)) byFloor.set(f.floor, []);
        byFloor.get(f.floor).push(f);
      }
    }
    for (const floor of [...byFloor.keys()].sort((a, b) => a - b)) {
      const rows = byFloor.get(floor);
      const cleared = rows.filter((x) => x.cleared);
      const def = TRIAL_TOWER_FLOORS[floor - 1];
      const label = def.trait === "NONE" ? (floor % 5 === 0 ? "関門" : "-") : TOWER_TRAIT_LABEL[def.trait];
      const hp = cleared.length > 0 ? cleared.reduce((s, x) => s + x.allyHpLeft, 0) / cleared.length : 0;
      const alive = cleared.length > 0 ? cleared.reduce((s, x) => s + x.standing, 0) / cleared.length : 0;
      console.log(
        String(floor).padStart(3) +
          " " +
          label.padEnd(8) +
          String(rows.length).padStart(5) +
          pct(cleared.length / rows.length).padStart(6) +
          pct(hp).padStart(15) +
          alive.toFixed(1).padStart(8),
      );
    }
  }
}

function runTraitMode() {
  printAudit(TRAIT_PROBE_TEAMS);
  const traits = ["NONE", "HEALER", "WARD", "SWARM", "SWIFT"];
  // 傾向だけを差し替え、階(=倍率)は固定する。そうしないと階の重さと混ざる
  for (const baseFloor of [12, 22]) {
    console.log(`\n=== 傾向の効き(${baseFloor}階の倍率で固定 / 味方残HP・決着手数) ===`);
    const names = Object.keys(TRAIT_PROBE_TEAMS);
    // 味方の残HPで見る。**敵残HPは勝てる階では0%に張り付いて何も語らない。**
    // 傾向は「その階がいくら高くついたか」に出る
    console.log("傾向".padEnd(10) + names.map((n) => n.padStart(16)).join("") + "  敵回復  敵盾");
    for (const trait of traits) {
      const cells = [];
      let heal = 0;
      let shield = 0;
      for (const n of names) {
        const r = measureFloor(TRAIT_PROBE_TEAMS[n].ids, baseFloor, 16, 7700, trait);
        cells.push(`${pct(r.allyHpLeft)}/${r.turns.toFixed(0)}T`.padStart(16));
        heal = Math.max(heal, r.enemyHeal);
        shield = Math.max(shield, r.enemyShieldMax);
      }
      console.log(
        (TOWER_TRAIT_LABEL[trait] || "傾向なし").padEnd(9) +
          cells.join("") +
          `  ${Math.round(heal)}`.padStart(8) +
          `  ${Math.round(shield)}`.padStart(7),
      );
      if (trait === "HEALER" && heal === 0) console.log("  ⚠ 癒やしの階なのに敵が一度も回復していない");
      if (trait === "WARD" && shield === 0) console.log("  ⚠ 守りの階なのに敵が一度も盾を張っていない");
    }
  }
}

if (process.argv[1]?.endsWith("towerPressure.mjs")) {
  const argv = process.argv.slice(2);
  const argValue = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  gearStar = Number(argValue("--gear", 5));
  gearTuned = argv.includes("--tuned");
  const picked = argValue("--teams", null);
  const teams = picked
    ? Object.fromEntries(Object.entries(TEAMS).filter(([n]) => picked.split(",").includes(n)))
    : TEAMS;

  if (argv.includes("--traits")) runTraitMode();
  else if (argv.includes("--trace")) runTraceMode(teams, Number(argValue("--climbs", 30)));
  else if (argv.includes("--floors")) runFloorMode(teams);
  else runClimbMode(teams, Number(argValue("--climbs", 30)));
}

export { TEAMS, TRAIT_PROBE_TEAMS };
