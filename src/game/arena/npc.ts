/**
 * アリーナのNPC対戦相手を組み立てる。
 *
 * ## NPCは「疑似プレイヤー」であって、強化された敵ではない
 *
 * ここで作るのは **プレイヤーが自分の手で作れる編成**だけ。最終ステータスは
 * `toBattleDefinition(instance, dex, equipment)` の1本でしか決まらず、
 * このファイルはそこへ渡す `MonsterInstance` と `Equipment[]` を組むだけで終わる。
 * **後からステータスへ倍率を掛ける処理を、ここに足してはいけない。**
 * 足した瞬間、NPCは「どう育てても再現できない相手」になり、
 * 負けた理由が育成の差ではなく仕様の差になる。
 *
 * 上限は既存の定数をそのまま守る。
 *   - 強化レベル …… `EQUIP_MAX_LEVEL`(15)
 *   - 能力ポイント … `ABILITY_POINT_BUDGETS`(星4:20 / 星5:50 / 星6:100)
 *   - レベル ……… `STAR_MAX_LEVEL`
 *   - スキルレベル … `MAX_SKILL_LEVEL`
 *   - 装備スロット … `EQUIP_SLOTS`(プレイヤーと同じ6枠)
 *   - 潜在覚醒 …… `LATENT_ABILITY_CANDIDATES[dexId]` に実在するIDだけ
 *
 * ## 数字はこのファイルに書かない
 *
 * レート帯ごとの育ち具合は `data/arena/npcConfig.ts`、顔ぶれは
 * `data/arena/npcTeams.ts`、名前は `data/arena/npcNames.ts`。
 * ここにあるのは「表をどう読むか」だけにしてある。
 *
 * ## 保存せず、種から毎回組み直す
 *
 * 相手を焼いて保存すると、装備や育成の仕様を変えたときに
 * **セーブの中の相手だけが古い規則のまま残る。**
 * 種(seed)だけを持てば、規則の変更が常に全員へ行き渡る。
 */
import {
  EQUIP_MAX_LEVEL,
  EQUIP_SLOTS,
  Equipment,
  EquipSlot,
  EquipStar,
  SET_TYPES,
  SLOT_MAIN_STAT_OPTIONS,
  SetType,
  StatType,
  enhanceEquipment,
  generateEquipment,
} from "../../core/equipment.js";
import { MonsterInstance } from "../../core/monsterInstance.js";
import {
  ABILITY_POINT_BUDGETS,
  AbilityPointAllocation,
  AllocatableStat,
  MonsterDevelopment,
} from "../../core/monsterDevelopment.js";
import { STAR_MAX_LEVEL, Star } from "../../core/rarity.js";
import { MAX_SKILL_LEVEL } from "../../core/skill.js";
import { LATENT_ABILITY_CANDIDATES } from "../../data/latentAbilities.js";
import { arenaTierForRating } from "../../data/arena/ranks.js";
import {
  ARENA_NPC_DEFAULT_COUNT,
  ARENA_NPC_RATING_JITTER,
  ARENA_NPC_RATING_OFFSETS,
  ARENA_NPC_ROLE_PLANS,
  ArenaNpcBand,
  VARIABLE_SLOTS,
  VariableSlot,
  arenaNpcBandForRating,
} from "../../data/arena/npcConfig.js";
import { ARENA_NPC_NAME_CLANS, ARENA_NPC_NAME_CORES, ARENA_NPC_NAME_DECORATIONS } from "../../data/arena/npcNames.js";
import { ArenaNpcTeam, ArenaNpcTeamMember, arenaNpcTeamsForTiers } from "../../data/arena/npcTeams.js";
import { ARENA_SNAPSHOT_VERSION, ArenaDefenseSnapshot, ArenaOpponentEntry, ArenaUnitSnapshot } from "./types.js";

/* ==========================================================================
 * 乱数
 *
 * 既存アリーナ(`game/pvpArena.ts`)と同じ実装を、こちらの中に持つ。
 * あちらを参照すると、旧アリーナを畳む時にこちらが道連れになる。
 * ========================================================================== */

/** 種から決まる乱数。**同じ種なら必ず同じNPCが組み上がる** */
export function arenaNpcRng(seed: number): () => number {
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
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/** 下限・上限を含む整数の抽選 */
function pickInt(range: readonly [number, number], rng: () => number): number {
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pickRatio(range: readonly [number, number], rng: () => number): number {
  const [lo, hi] = range;
  return hi <= lo ? lo : lo + rng() * (hi - lo);
}

function pickStar(band: ArenaNpcBand, rng: () => number): Star {
  const total = band.starWeights.reduce((sum, w) => sum + w.weight, 0);
  let roll = rng() * total;
  for (const option of band.starWeights) {
    if (roll < option.weight) return option.star;
    roll -= option.weight;
  }
  return band.starWeights[band.starWeights.length - 1].star;
}

/* ==========================================================================
 * 装備
 * ========================================================================== */

/**
 * 可変スロット(2/4/6)で、役割に合うメインOPを引くまで振り直す。
 *
 * 生成をそのまま使うと、速攻の型でも速度のメインが1つも出ないことがある。
 * それでは「速攻の相手」と名乗れない。ただし**振り直し回数は帯ごとの設定**で、
 * 下の帯はわざと少なくしてある。役割に合っていない装備を着ている相手が
 * 混じることが、そのまま「まだ育て切っていない人」の姿になる。
 *
 * 引けなかった場合は最後に振ったものをそのまま使う。**狙ったOPを後から
 * 書き換えることはしない**(生成規則の外の装備が生まれてしまう)。
 */
function generateRoleEquipment(
  slot: EquipSlot,
  star: EquipStar,
  subStatCount: number,
  set: SetType,
  wanted: readonly StatType[],
  rerolls: number,
  rng: () => number,
): Equipment {
  const options = SLOT_MAIN_STAT_OPTIONS[slot];
  const targets = wanted.filter((stat) => options.includes(stat));
  let equipment = generateEquipment({ slot, star, subStatCount, set, rng });
  if (targets.length === 0) return equipment;
  for (let i = 0; i < rerolls && !targets.includes(equipment.mainStat.type); i += 1) {
    equipment = generateEquipment({ slot, star, subStatCount, set, rng });
  }
  return equipment;
}

/**
 * 6スロットぶんの装備を組む。
 *
 * シリーズは 4個 + 2個 でそろえる。ただし `setCoherence` を下回った時は
 * バラバラのまま着せる——**下の帯で「セットが揃っていない相手」を再現するため。**
 * 揃えられるかどうかは装備の集まり具合そのもので、育成の進み具合の一部になる。
 */
function buildUnitEquipment(
  member: ArenaNpcTeamMember,
  team: ArenaNpcTeam,
  band: ArenaNpcBand,
  unitId: string,
  rng: () => number,
): Equipment[] {
  const plan = ARENA_NPC_ROLE_PLANS[member.role];
  const primary = team.set ?? plan.sets.primary;
  const secondary = plan.sets.secondary === primary ? plan.sets.primary : plan.sets.secondary;
  const coherent = rng() < band.setCoherence;
  // 4個セットに使う枠を決める。決定的に選びたいので、乱数で並べ替えず先頭4枠を使う
  const fourPieceSlots = new Set<EquipSlot>(EQUIP_SLOTS.slice(0, 4));

  const gear: Equipment[] = [];
  for (const slot of EQUIP_SLOTS) {
    const set: SetType = coherent
      ? (fourPieceSlots.has(slot) ? primary : secondary)
      : pick(SET_TYPES, rng);
    const star = pickInt(band.equipStar, rng) as EquipStar;
    const subStatCount = pickInt(band.equipSubStats, rng);
    const wanted = VARIABLE_SLOTS.includes(slot as VariableSlot)
      ? plan.mainStats[slot as VariableSlot]
      : [];
    const equipment = generateRoleEquipment(slot, star, subStatCount, set, wanted, band.mainStatRerolls, rng);
    // 生成側のIDは時刻とカウンタを含むので、同じ種でも一致しない。
    // **決定的であることが契約**なので、種から決まるIDへ置き換える
    equipment.id = `${unitId}_eq${slot}`;
    const enhance = Math.min(EQUIP_MAX_LEVEL, pickInt(band.equipEnhance, rng));
    for (let i = 0; i < enhance; i += 1) enhanceEquipment(equipment, rng);
    gear.push(equipment);
  }
  return gear;
}

/* ==========================================================================
 * 育成
 * ========================================================================== */

const ALLOCATABLE_STATS: readonly AllocatableStat[] = ["hp", "atk", "def", "spd"];

/**
 * 能力ポイントを役割に沿って配る。
 *
 * **星別上限(`ABILITY_POINT_BUDGETS`)を1点も超えない。** 端数は
 * いちばん重い枠へ寄せる(切り捨てで合計が予算より減るのは構わないが、
 * 増えるのは絶対にいけない)。
 */
function allocateAbilityPoints(
  role: ArenaNpcTeamMember["role"],
  star: Star,
  ratio: number,
): AbilityPointAllocation {
  const budget = ABILITY_POINT_BUDGETS[star];
  const total = Math.max(0, Math.min(budget, Math.floor(budget * ratio)));
  const weights = ARENA_NPC_ROLE_PLANS[role].abilityWeights;
  const points: AbilityPointAllocation = { hp: 0, atk: 0, def: 0, spd: 0 };
  if (total <= 0) return points;

  let assigned = 0;
  for (const stat of ALLOCATABLE_STATS) {
    const amount = Math.floor(total * weights[stat]);
    points[stat] = amount;
    assigned += amount;
  }
  // 端数は最も重い枠へ。重みが同じなら並び順の先頭が取る(決定的にする)
  let heaviest: AllocatableStat = "hp";
  for (const stat of ALLOCATABLE_STATS) {
    if (weights[stat] > weights[heaviest]) heaviest = stat;
  }
  points[heaviest] += total - assigned;
  return points;
}

/**
 * 潜在覚醒を1つ選ぶ。
 *
 * **候補は必ず `LATENT_ABILITY_CANDIDATES[dexId]` の中から取る。**
 * それらしいIDを組み立てて書くと、`toBattleDefinition` の解決が黙って
 * undefined を返し、「覚醒しているのに何も起きない相手」になる。
 * 候補が無い個体(あり得ないはずだが)は素直に未覚醒にする。
 */
function pickLatentAbilityId(dexId: string, role: ArenaNpcTeamMember["role"], rng: () => number): string | null {
  const candidates = LATENT_ABILITY_CANDIDATES[dexId];
  if (!candidates || candidates.length === 0) return null;
  for (const category of ARENA_NPC_ROLE_PLANS[role].latentCategories) {
    const matched = candidates.filter((candidate) => candidate.category === category);
    if (matched.length > 0) return pick(matched, rng).id;
  }
  return pick(candidates, rng).id;
}

/** NPC1体分。プレイヤーの手持ちと同じ形にする */
function buildUnit(
  member: ArenaNpcTeamMember,
  team: ArenaNpcTeam,
  band: ArenaNpcBand,
  unitId: string,
  rng: () => number,
): ArenaUnitSnapshot {
  const star = pickStar(band, rng);
  const maxLevel = STAR_MAX_LEVEL[star];
  const level = Math.max(1, Math.min(maxLevel, Math.round(maxLevel * pickRatio(band.levelRatio, rng))));
  const skillLevels = [0, 1, 2].map(() =>
    Math.max(1, Math.min(MAX_SKILL_LEVEL, pickInt(band.skillLevel, rng))),
  ) as [number, number, number];

  const hasType = rng() < band.typeChance;
  const hasLatent = rng() < band.latentChance;
  const development: MonsterDevelopment = {
    schemaVersion: 1,
    type: hasType ? member.role : null,
    // タイプ転生していない個体にも能力ポイントは振れる(別の育成要素なので)
    abilityPoints: allocateAbilityPoints(member.role, star, pickRatio(band.abilityPointRatio, rng)),
    latentAbilityId: hasLatent ? pickLatentAbilityId(member.dexId, member.role, rng) : null,
    latentReselectPending: false,
  };

  const equipment = buildUnitEquipment(member, team, band, unitId, rng);
  const equipMap: MonsterInstance["equipment"] = {};
  for (const item of equipment) equipMap[item.slot] = item.id;

  const instance: MonsterInstance = {
    id: unitId,
    dexId: member.dexId,
    star,
    level,
    exp: 0,
    equipment: equipMap,
    skillLevels,
    development,
  };
  return { instance, equipment };
}

/* ==========================================================================
 * 名前
 * ========================================================================== */

function buildNpcName(rng: () => number): string {
  return `${pick(ARENA_NPC_NAME_CLANS, rng)}${pick(ARENA_NPC_NAME_CORES, rng)}${pick(ARENA_NPC_NAME_DECORATIONS, rng)}`;
}

/* ==========================================================================
 * NPC1人
 * ========================================================================== */

/** 種と並び位置から、その相手専用の種を作る(隣同士が似ないように混ぜる) */
function unitSeed(seed: number, index: number): number {
  return (Math.imul(seed | 0, 1000003) + Math.imul(index + 1, 7919) + 0x5f3a) | 0;
}

/**
 * NPCを1人組み立てる。
 *
 * `rating` は**並べる基準のレート**で、そこから並び位置ごとの差と揺らぎを乗せた値が
 * その相手のレートになる。勝てそうな相手・互角・格上が必ず混ざるようにするため
 * (`ARENA_NPC_RATING_OFFSETS`)。育ち具合は**乗せたあとのレート**の帯で決まるので、
 * 帯をまたいだ相手が並ぶこともある。それは実際のプレイヤーの一覧でも起きること。
 */
export function buildArenaNpc(rating: number, seed: number, index: number): ArenaOpponentEntry {
  const rng = arenaNpcRng(unitSeed(seed, index));
  const offset = ARENA_NPC_RATING_OFFSETS[index % ARENA_NPC_RATING_OFFSETS.length];
  const jitter = Math.round((rng() * 2 - 1) * ARENA_NPC_RATING_JITTER);
  const opponentRating = Math.max(0, Math.round(rating + offset + jitter));

  const band = arenaNpcBandForRating(opponentRating);
  const team = pick(arenaNpcTeamsForTiers(band.teamTiers), rng);
  const name = buildNpcName(rng);
  const id = `npc_${seed >>> 0}_${index}`;

  const units = team.members.map((member, memberIndex) =>
    buildUnit(member, team, band, `${id}_u${memberIndex}`, rng),
  );

  const defense: ArenaDefenseSnapshot = {
    version: ARENA_SNAPSHOT_VERSION,
    // NPCは焼いた瞬間というものが無い。**0で固定する**——
    // Date.now() を入れると同じ種でも中身が変わり、決定性が壊れる
    capturedAt: 0,
    units,
  };

  return {
    index,
    kind: "NPC",
    id,
    name,
    rating: opponentRating,
    tierId: arenaTierForRating(opponentRating).id,
    archetypeName: team.name,
    archetypeNote: team.note,
    defense,
  };
}

/** NPCを並べる。種が同じなら必ず同じ顔ぶれになる */
export function buildArenaNpcs(rating: number, seed: number, count = ARENA_NPC_DEFAULT_COUNT): ArenaOpponentEntry[] {
  return Array.from({ length: count }, (_, index) => buildArenaNpc(rating, seed, index));
}
