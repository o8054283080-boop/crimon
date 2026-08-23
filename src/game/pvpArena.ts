/**
 * 闘技場(アリーナ)の中核。
 *
 * - 防衛編成と攻撃編成を別々に持つ
 * - 挑戦相手はランク帯から**決定的に**生成する擬似プレイヤー
 * - 勝敗でランクポイントが上下し、帯ごとの報酬と週ごとのまとめ報酬が付く
 * - 戦闘そのものは既存の `BattleEngine` をそのまま使う(作り直さない)
 *
 * 挑戦相手を保存せず、その場で作り直しているのは意図的。
 * 保存すると、装備の仕様を変えるたびにセーブの中の相手が古い規則のまま残る。
 * 種(シード)だけを保存して毎回組み直せば、規則の変更が常に全員へ行き渡る。
 */
import { Equipment, EquipSlot, EQUIP_SLOTS, StatType, SLOT_MAIN_STAT_OPTIONS, enhanceEquipment, generateEquipment } from "../core/equipment.js";
import { MonsterDefinition } from "../core/monster.js";
import { MonsterInstance, createMonsterInstance, resolveEquippedItems, toBattleDefinition } from "../core/monsterInstance.js";
import { Star, STAR_MAX_LEVEL } from "../core/rarity.js";
import { MAX_SKILL_LEVEL } from "../core/skill.js";
import {
  ARENA_ARCHETYPES,
  ARENA_K_FACTOR,
  ARENA_MIN_LOSS,
  ARENA_MIN_WIN_GAIN,
  ARENA_NAME_CORES,
  ARENA_NAME_TITLES,
  ARENA_OPPONENT_COUNT,
  ARENA_OPPONENT_POINT_OFFSETS,
  ARENA_TICKET_MAX,
  ARENA_TICKET_REFILL_COST,
  ARENA_TICKET_REGEN_MINUTES,
  ArenaArchetype,
  ArenaArchetypeId,
  ArenaRank,
  ArenaRankId,
  arenaCompressedSpeed,
  arenaPeriodKey,
  arenaRankForPoints,
  findArenaArchetype,
} from "../data/pvpArena.js";
import {
  PlayerState,
  addEquipment,
  addSummonScrolls,
  equipToMonster,
} from "./playerState.js";
import { resolveDex } from "./stageRunner.js";

/* ==========================================================================
 * 乱数
 * ========================================================================== */

/** 種から決まる乱数。同じ種なら同じ相手が組み上がる */
export function arenaRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

function pickRange(range: readonly [number, number], rng: () => number): number {
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/* ==========================================================================
 * 編成(防衛 / 攻撃)
 * ========================================================================== */

/** アリーナの1編成に入れられる人数。通常パーティと同じ4体 */
export const ARENA_TEAM_SIZE = 4;

export type ArenaTeamSlot = "DEFENSE" | "OFFENSE";

function teamIds(state: PlayerState, slot: ArenaTeamSlot): string[] {
  return slot === "DEFENSE" ? state.arenaDefenseIds : state.arenaOffenseIds;
}

/** 指定した編成に入っているモンスターの実体(手持ちから消えたIDは黙って落とす) */
export function getArenaTeam(state: PlayerState, slot: ArenaTeamSlot): MonsterInstance[] {
  return teamIds(state, slot)
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter((m): m is MonsterInstance => m !== undefined);
}

/**
 * 編成へ入れる/外す。
 *
 * **防衛と攻撃で同じモンスターを使ってよい。** 攻めと守りで別の4体を
 * 揃えなければ参加できない作りにすると、手持ちが少ない人が締め出される。
 * 分けてあるのは「別の役割を組める」ようにするためで、義務にはしない。
 */
export function toggleArenaTeamMember(state: PlayerState, slot: ArenaTeamSlot, instanceId: string): boolean {
  const ids = teamIds(state, slot);
  const index = ids.indexOf(instanceId);
  if (index >= 0) {
    ids.splice(index, 1);
    return true;
  }
  if (ids.length >= ARENA_TEAM_SIZE) return false;
  ids.push(instanceId);
  return true;
}

export function clearArenaTeam(state: PlayerState, slot: ArenaTeamSlot): void {
  teamIds(state, slot).length = 0;
}

/* ==========================================================================
 * 挑戦券
 * ========================================================================== */

/**
 * 経過時間に応じて挑戦券を回復させる。
 * 端数の経過時間は次回に持ち越す(スタミナと同じ考え方)。
 */
export function applyArenaTicketRegen(state: PlayerState, now: number = Date.now()): void {
  if (state.arenaTickets >= ARENA_TICKET_MAX) {
    state.lastArenaTicketUpdateAt = now;
    return;
  }
  const intervalMs = ARENA_TICKET_REGEN_MINUTES * 60_000;
  const ticks = Math.floor((now - state.lastArenaTicketUpdateAt) / intervalMs);
  if (ticks <= 0) return;
  const gained = Math.min(ticks, ARENA_TICKET_MAX - state.arenaTickets);
  state.arenaTickets += gained;
  state.lastArenaTicketUpdateAt += ticks * intervalMs;
}

/** 次の1枚が回復する時刻(満タンなら null) */
export function arenaNextTicketAt(state: PlayerState): number | null {
  if (state.arenaTickets >= ARENA_TICKET_MAX) return null;
  return state.lastArenaTicketUpdateAt + ARENA_TICKET_REGEN_MINUTES * 60_000;
}

export interface ArenaTicketSpendResult {
  ok: boolean;
  reason?: string;
}

/** 挑戦券を1枚使う。呼ぶ前に自然回復を反映する */
export function trySpendArenaTicket(state: PlayerState, now: number = Date.now()): ArenaTicketSpendResult {
  applyArenaTicketRegen(state, now);
  if (state.arenaTickets <= 0) return { ok: false, reason: "挑戦券が足りません" };
  state.arenaTickets -= 1;
  return { ok: true };
}

/** ダイヤを払って挑戦券を全回復する */
export function tryRefillArenaTickets(state: PlayerState, now: number = Date.now()): ArenaTicketSpendResult {
  applyArenaTicketRegen(state, now);
  if (state.arenaTickets >= ARENA_TICKET_MAX) return { ok: false, reason: "挑戦券は満タンです" };
  if (state.crystal < ARENA_TICKET_REFILL_COST) return { ok: false, reason: "ダイヤが足りません" };
  state.crystal -= ARENA_TICKET_REFILL_COST;
  state.arenaTickets = ARENA_TICKET_MAX;
  state.lastArenaTicketUpdateAt = now;
  return { ok: true };
}

/* ==========================================================================
 * 挑戦相手の生成
 * ========================================================================== */

export interface ArenaOpponentUnit {
  dexId: string;
  star: Star;
  level: number;
  skillLevels: [number, number, number];
  equipment: Equipment[];
}

export interface ArenaOpponent {
  /** 候補の並びの中での位置。挑戦の対象を指すのに使う */
  index: number;
  name: string;
  points: number;
  rankId: ArenaRankId;
  rankName: string;
  rankColor: string;
  archetypeId: ArenaArchetypeId;
  archetypeName: string;
  archetypeNote: string;
  /** 高レア(SR/SSR)を軸にした編成かどうか */
  rare: boolean;
  units: ArenaOpponentUnit[];
}

/**
 * 可変スロット(2/4/6)で狙ったメインステータスを引く。
 *
 * 生成をそのまま使うと、速攻の型でも速度のメインがまったく出ないことがある。
 * それでは「速攻の相手」と名乗れない。何度か振って、狙いに合うものを取る。
 */
function generateTunedEquipment(
  slot: EquipSlot,
  star: Equipment["star"],
  subStatCount: number,
  set: Equipment["set"],
  wanted: StatType[],
  rng: () => number,
): Equipment {
  const options = SLOT_MAIN_STAT_OPTIONS[slot];
  const target = wanted.find((w) => options.includes(w));
  let best = generateEquipment({ slot, star, subStatCount, set, rng });
  if (!target) return best;
  for (let i = 0; i < 12 && best.mainStat.type !== target; i += 1) {
    best = generateEquipment({ slot, star, subStatCount, set, rng });
  }
  return best;
}

function buildOpponentGear(
  archetype: ArenaArchetype,
  star: Equipment["star"],
  subStats: number,
  enhance: number,
  rng: () => number,
): Equipment[] {
  const gear: Equipment[] = [];
  for (const slot of EQUIP_SLOTS) {
    const equipment = generateTunedEquipment(slot, star, subStats, archetype.set, archetype.preferredMains, rng);
    for (let i = 0; i < enhance; i += 1) enhanceEquipment(equipment, rng);
    gear.push(equipment);
  }
  return gear;
}

/** 擬似プレイヤーの名前。称号と名前の組み合わせで作る */
function buildOpponentName(rng: () => number): string {
  return `${pick(ARENA_NAME_TITLES, rng)}${pick(ARENA_NAME_CORES, rng)}`;
}

function clampSkillLevel(level: number): number {
  return Math.max(1, Math.min(MAX_SKILL_LEVEL, level));
}

/** 1人分の挑戦相手を組む */
function buildOpponent(index: number, points: number, seed: number): ArenaOpponent {
  const rng = arenaRng(seed);
  const rank = arenaRankForPoints(points);
  const build = rank.build;
  const archetype = pick(ARENA_ARCHETYPES, rng);
  const rare = rng() < build.rareRatio;

  // 通常軸の相手には育成の差を上乗せする。
  // 「素の能力で劣るぶんを、装備と技のレベルで埋めている相手」を置くことで、
  // 通常モンスターでもこの帯に居られるということを、相手編成そのもので示す
  const bonus = rare ? { equipEnhance: 0, skillLevel: 0 } : build.normalTeamBonus;

  const roster = rare ? archetype.rareTeam : archetype.normalTeam;
  const star = build.star;
  const units: ArenaOpponentUnit[] = roster.map((dexId) => {
    const level = Math.min(pickRange(build.level, rng), STAR_MAX_LEVEL[star]);
    const skillLevel = clampSkillLevel(pickRange(build.skillLevel, rng) + bonus.skillLevel);
    const enhance = Math.min(15, pickRange(build.equipEnhance, rng) + bonus.equipEnhance);
    const subStats = pickRange(build.equipSubStats, rng);
    return {
      dexId,
      star,
      level,
      skillLevels: [skillLevel, skillLevel, skillLevel],
      equipment: buildOpponentGear(archetype, build.equipStar, subStats, enhance, rng),
    };
  });

  return {
    index,
    name: buildOpponentName(rng),
    points,
    rankId: rank.id,
    rankName: rank.name,
    rankColor: rank.color,
    archetypeId: archetype.id,
    archetypeName: archetype.name,
    archetypeNote: archetype.note,
    rare,
    units,
  };
}

/**
 * 挑戦相手の候補を並べる。
 *
 * 種(seed)が同じなら必ず同じ顔ぶれになる。画面を描き直すたびに相手が
 * すり替わると、「この相手に挑む」という判断そのものが成立しない。
 */
export function generateArenaOpponents(points: number, seed: number, count = ARENA_OPPONENT_COUNT): ArenaOpponent[] {
  return Array.from({ length: count }, (_, i) => {
    const offset = ARENA_OPPONENT_POINT_OFFSETS[i % ARENA_OPPONENT_POINT_OFFSETS.length];
    // 同じ帯の中でも相手ごとに少し揺らす。3人が並んだ時に順位が読めるようにする
    const jitter = Math.floor(arenaRng(seed * 31 + i * 7 + 13)() * 40) - 20;
    const opponentPoints = Math.max(0, points + offset + jitter);
    return buildOpponent(i, opponentPoints, seed * 1000003 + i * 7919);
  });
}

/* ==========================================================================
 * 戦闘の組み立て
 * ========================================================================== */

/** 速度だけをアリーナの規則で置き換えた定義を返す(それ以外は一切変えない) */
function withArenaSpeed(def: MonsterDefinition): MonsterDefinition {
  return { ...def, stats: { ...def.stats, spd: arenaCompressedSpeed(def.stats.spd) } };
}

function opponentUnitToDefinition(unit: ArenaOpponentUnit): MonsterDefinition {
  const dex = resolveDex(unit.dexId);
  const instance: MonsterInstance = {
    id: `arena_${unit.dexId}`,
    dexId: unit.dexId,
    star: unit.star,
    level: unit.level,
    exp: 0,
    equipment: {},
    skillLevels: unit.skillLevels,
  };
  const def = toBattleDefinition(instance, dex, unit.equipment);
  return { ...def, name: `${dex.name}★${unit.star} Lv${unit.level}` };
}

export interface ArenaBattleSetup {
  playerDefs: MonsterDefinition[];
  enemyDefs: MonsterDefinition[];
}

/**
 * アリーナの1戦を組み立てる。
 *
 * 速度の圧縮は**両陣営に同じ式で**掛かる(`data/pvpArena.ts` の
 * `arenaCompressedSpeed` に理由を書いてある)。HPも攻撃力も触らない。
 */
export function setupArenaBattle(
  offenseInstances: readonly MonsterInstance[],
  opponent: ArenaOpponent,
  allEquipment: Equipment[] = [],
): ArenaBattleSetup {
  const playerDefs = offenseInstances.map((instance) =>
    withArenaSpeed(toBattleDefinition(instance, resolveDex(instance.dexId), resolveEquippedItems(instance, allEquipment))),
  );
  const enemyDefs = opponent.units.map((unit) => withArenaSpeed(opponentUnitToDefinition(unit)));
  return { playerDefs, enemyDefs };
}

/* ==========================================================================
 * ポイントの増減
 * ========================================================================== */

/**
 * 勝敗によるポイントの増減。
 *
 * 格上に勝てば大きく上がり、格下に負ければ大きく下がる。
 * 逆に格下に勝っても伸びは小さい。**同じ相手を刈り続けても上がらない**ことで、
 * 上のランク帯へ行くには格上に挑むしかなくなる。
 */
export function arenaPointDelta(myPoints: number, opponentPoints: number, won: boolean): number {
  const expected = 1 / (1 + 10 ** ((opponentPoints - myPoints) / 400));
  if (won) return Math.max(ARENA_MIN_WIN_GAIN, Math.round(ARENA_K_FACTOR * (1 - expected)));
  return Math.min(-ARENA_MIN_LOSS, Math.round(ARENA_K_FACTOR * (0 - expected)));
}

/**
 * 挑戦相手を引き直すために種を進める。
 *
 * 対戦後に自動で進めるほか、画面の「相手を変える」からも呼ぶ。
 * **挑戦券を減らさずに引き直せる**のは意図した設計。並んだ3人が
 * どれも噛み合わない時に、券を捨てて選び直させるのは理不尽なので。
 */
export function advanceArenaOpponentSeed(state: PlayerState): void {
  state.arenaOpponentSeed = (state.arenaOpponentSeed * 1103515245 + 12345) & 0x7fffffff;
}

/* ==========================================================================
 * 対戦の決着
 * ========================================================================== */

export interface ArenaMatchResult {
  won: boolean;
  opponentName: string;
  pointDelta: number;
  pointsBefore: number;
  pointsAfter: number;
  rankBefore: ArenaRank;
  rankAfter: ArenaRank;
  /** 帯が変わったか(上がった/下がった) */
  rankChange: "UP" | "DOWN" | "NONE";
  goldEarned: number;
  crystalEarned: number;
  scrollEarned: number;
}

/**
 * 対戦の結果を反映する。
 *
 * 報酬は**勝った時だけ**。負けても挑戦券とポイントだけが減る。
 * 負けても報酬が出る作りにすると、勝てない相手にわざと負けて回すのが
 * 最短の稼ぎになってしまう。
 */
export function resolveArenaMatch(
  state: PlayerState,
  opponent: ArenaOpponent,
  won: boolean,
  rng: () => number = Math.random,
): ArenaMatchResult {
  const pointsBefore = state.arenaPoints;
  const rankBefore = arenaRankForPoints(pointsBefore);
  const delta = arenaPointDelta(pointsBefore, opponent.points, won);
  const pointsAfter = Math.max(0, pointsBefore + delta);
  state.arenaPoints = pointsAfter;
  state.arenaSeasonBestPoints = Math.max(state.arenaSeasonBestPoints, pointsAfter);
  state.arenaSeasonBattles += 1;
  if (won) state.arenaSeasonWins += 1;

  const rankAfter = arenaRankForPoints(pointsAfter);
  const rankChange = rankAfter.minPoints > rankBefore.minPoints ? "UP" : rankAfter.minPoints < rankBefore.minPoints ? "DOWN" : "NONE";

  let goldEarned = 0;
  let crystalEarned = 0;
  let scrollEarned = 0;
  if (won) {
    // 報酬は「勝った時に居た帯」で決まる。上がった直後の帯で先に払うと、
    // 昇格した1戦だけ二重に得をする形になる
    const reward = rankBefore.winReward;
    goldEarned = reward.gold;
    if (rng() < reward.crystalChance) crystalEarned = reward.crystal;
    if (rng() < reward.scrollChance) scrollEarned = 1;
    state.gold += goldEarned;
    state.crystal += crystalEarned;
    if (scrollEarned > 0) addSummonScrolls(state, scrollEarned);
  }

  // 次に並ぶ相手を変える。同じ相手が残り続けると、
  // 勝てる1人だけを繰り返し殴る形になる
  advanceArenaOpponentSeed(state);

  return {
    won,
    opponentName: opponent.name,
    pointDelta: delta,
    pointsBefore,
    pointsAfter,
    rankBefore,
    rankAfter,
    rankChange,
    goldEarned,
    crystalEarned,
    scrollEarned,
  };
}

/* ==========================================================================
 * 期間(週)のまとめ報酬
 * ========================================================================== */

export interface ArenaPeriodSettlement {
  rankName: string;
  bestPoints: number;
  wins: number;
  battles: number;
  crystal: number;
  gold: number;
  scrolls: number;
}

/**
 * 期間が変わっていたら、前の期間のまとめ報酬を精算する。
 *
 * まとめ報酬は**その期間に届いた最高ポイント**で決まる。期末の順位で決めると、
 * 上がったあとは1戦もせずに閉じこもるのが最善手になってしまう。
 * 最高到達で決めれば、挑み続けても損をしない。
 *
 * 前の期間に1戦もしていなければ何も出さない(触っていない週にまで配らない)。
 */
export function settleArenaPeriod(state: PlayerState, now: number = Date.now()): ArenaPeriodSettlement | null {
  const key = arenaPeriodKey(now);
  if (state.arenaPeriodKey === key) return null;

  const firstTime = state.arenaPeriodKey < 0;
  const battles = state.arenaSeasonBattles;
  const wins = state.arenaSeasonWins;
  const bestPoints = state.arenaSeasonBestPoints;

  state.arenaPeriodKey = key;
  state.arenaSeasonBattles = 0;
  state.arenaSeasonWins = 0;
  state.arenaSeasonBestPoints = state.arenaPoints;

  if (firstTime || battles <= 0) return null;

  const rank = arenaRankForPoints(bestPoints);
  const reward = rank.periodReward;
  state.crystal += reward.crystal;
  state.gold += reward.gold;
  if (reward.scrolls > 0) addSummonScrolls(state, reward.scrolls);

  return {
    rankName: rank.name,
    bestPoints,
    wins,
    battles,
    crystal: reward.crystal,
    gold: reward.gold,
    scrolls: reward.scrolls,
  };
}

/* ==========================================================================
 * 検査用の補助
 *
 * バランスを測る時に「その編成が狙った戦術を本当に実行できているか」を
 * 先に確かめるための道具。過去に、毒を1体も持たない編成を「毒編成」として
 * 測り、まるごと嘘の結論を出した事故があるので、ここに置いてある。
 * ========================================================================== */

/** その型の顔ぶれが、狙った戦術の技を実際に持っているかを数える */
export function countArchetypeSkillEvidence(archetypeId: ArenaArchetypeId, rare: boolean): {
  debuffLike: number;
  healLike: number;
  guardLike: number;
} {
  const archetype = findArenaArchetype(archetypeId);
  const roster = rare ? archetype.rareTeam : archetype.normalTeam;
  let debuffLike = 0;
  let healLike = 0;
  let guardLike = 0;
  for (const dexId of roster) {
    const dex = resolveDex(dexId);
    for (const skill of dex.skills) {
      for (const effect of skill.effects) {
        if (["DEBUFF", "STUN", "POISON", "BLIND", "BURN", "HEAL_BLOCK", "STRIP", "COOLDOWN_EXTEND"].includes(effect.kind)) {
          debuffLike += 1;
        }
        if (effect.kind === "HEAL" || effect.kind === "REGEN" || effect.kind === "LIFESTEAL") healLike += 1;
        if (effect.kind === "SHIELD" || effect.kind === "IMMUNITY" || effect.kind === "CLEANSE") guardLike += 1;
      }
    }
  }
  return { debuffLike, healLike, guardLike };
}

/**
 * 相手編成をプレイヤーの手持ちとして取り込む(測定専用)。
 *
 * バランスを測る時に、相手側の編成をそのまま「こちら側」として使いたいことがある。
 * 本編からは呼ばない。
 */
export function materializeOpponentAsParty(state: PlayerState, opponent: ArenaOpponent): MonsterInstance[] {
  const party: MonsterInstance[] = [];
  for (const unit of opponent.units) {
    const instance = createMonsterInstance(unit.dexId, unit.star, unit.level);
    instance.skillLevels = [...unit.skillLevels] as [number, number, number];
    state.monsters.push(instance);
    for (const equipment of unit.equipment) {
      addEquipment(state, equipment);
      equipToMonster(state, instance.id, equipment.id);
    }
    party.push(instance);
  }
  return party;
}
