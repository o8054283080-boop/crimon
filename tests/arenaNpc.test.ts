/**
 * アリーナNPCの見張り。
 *
 * ここで見るのは「NPCが強いか」ではなく、
 * **NPCがプレイヤーと同じ規則の中で作られているか**の一点に尽きる。
 *
 * NPC専用の倍率を1つ足すだけで、この場所は「どう育てても届かない相手が並ぶ場所」に
 * 変わる。しかも型チェックもテストも、倍率そのものは素通りさせる。
 * だから上限(強化15・星別の能力ポイント・星ごとの最大レベル)と、
 * 実在しないデータ(架空の図鑑ID・存在しない潜在覚醒ID・そのスロットに
 * 出ないメインOP)を、ここで機械的に落とす。
 */
import { describe, expect, it } from "vitest";
import { EQUIP_MAX_LEVEL, EQUIP_SLOTS, SLOT_MAIN_STAT_OPTIONS } from "../src/core/equipment.js";
import { ABILITY_POINT_BUDGETS } from "../src/core/monsterDevelopment.js";
import { toBattleDefinition } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../src/core/rarity.js";
import { MAX_SKILL_LEVEL } from "../src/core/skill.js";
import { LATENT_ABILITY_CANDIDATES } from "../src/data/latentAbilities.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, findMonsterById } from "../src/data/monsters.js";
import {
  ARENA_NPC_BANDS,
  ARENA_NPC_ROLE_PLANS,
  ARENA_NPC_TEAM_SIZE,
  VARIABLE_SLOTS,
  VariableSlot,
} from "../src/data/arena/npcConfig.js";
import { ARENA_NPC_TEAMS } from "../src/data/arena/npcTeams.js";
import { buildArenaNpc, buildArenaNpcs } from "../src/game/arena/npc.js";
import type { ArenaOpponentEntry } from "../src/game/arena/types.js";

/** 帯の代表レート。境界から十分離した値を使う(揺らぎで隣の帯へ落ちないように) */
const BAND_SAMPLE_RATINGS = ARENA_NPC_BANDS.map((band) => band.minRating + 150);

/** 検査に使う種。1つの抽選で判断すると、揺らぎをそのまま結論にしてしまう */
const SEEDS = Array.from({ length: 25 }, (_, i) => i * 7919 + 17);

function everyNpc(rating: number): ArenaOpponentEntry[] {
  return SEEDS.flatMap((seed) => buildArenaNpcs(rating, seed, 3));
}

/** すべての帯・すべての種のNPC。上限や実在性の検査はこれ1本で回す */
const ALL_NPCS: ArenaOpponentEntry[] = BAND_SAMPLE_RATINGS.flatMap((rating) => everyNpc(rating));

/**
 * 最終ステータスの目安。**必ず `toBattleDefinition` を通した値で測る。**
 * 個体や装備の中身を自前で足し合わせて測ると、
 * 「本当に戦闘へ届いているのか」を確かめたことにならない。
 */
function powerOf(unit: ArenaOpponentEntry["defense"]["units"][number], withEquipment = true): number {
  const dex = findMonsterById(unit.instance.dexId);
  expect(dex, `図鑑に無い: ${unit.instance.dexId}`).toBeTruthy();
  const stats = toBattleDefinition(unit.instance, dex!, withEquipment ? unit.equipment : []).stats;
  return stats.hp / 10 + stats.atk + stats.def + stats.spd;
}

describe("アリーナNPC", () => {
  it("同じ種なら必ず同じNPCになる", () => {
    // 画面を描き直すたびに相手がすり替わると、「この相手に挑む」という
    // 判断そのものが成立しない。装備IDまで含めて一致していること
    const a = buildArenaNpcs(1650, 12345, 3);
    const b = buildArenaNpcs(1650, 12345, 3);
    expect(a).toEqual(b);
    // 種が違えば違う相手になる(同じ種を無視して固定値を返していないか)
    const c = buildArenaNpcs(1650, 12346, 3);
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it("編成テンプレートの図鑑IDがすべて実在する", () => {
    // 存在しないIDを書くと、生成時ではなく戦闘の直前に落ちる。
    // 表を書き換えた瞬間にここで落とす
    const known = new Set(ALL_DISPLAYABLE_MONSTERS_DEX.map((m) => m.id));
    for (const team of ARENA_NPC_TEAMS) {
      expect(team.members).toHaveLength(ARENA_NPC_TEAM_SIZE);
      for (const member of team.members) {
        expect(known.has(member.dexId), `${team.id} の ${member.dexId} が図鑑に無い`).toBe(true);
      }
    }
  });

  it("組み上がったNPCの図鑑IDが実在する", () => {
    const known = new Set(ALL_DISPLAYABLE_MONSTERS_DEX.map((m) => m.id));
    for (const npc of ALL_NPCS) {
      expect(npc.kind).toBe("NPC");
      expect(npc.name.length).toBeGreaterThan(0);
      expect(npc.defense.units).toHaveLength(ARENA_NPC_TEAM_SIZE);
      for (const unit of npc.defense.units) {
        expect(known.has(unit.instance.dexId), `${unit.instance.dexId} が図鑑に無い`).toBe(true);
      }
    }
  });

  it("能力ポイントが星別上限を超えない", () => {
    // 星4:20 / 星5:50 / 星6:100。ここを超えた相手は、
    // どれだけ育てても再現できない=負けた理由が育成の差でなくなる
    for (const npc of ALL_NPCS) {
      for (const { instance } of npc.defense.units) {
        const points = instance.development.abilityPoints;
        const total = points.hp + points.atk + points.def + points.spd;
        expect(total).toBeLessThanOrEqual(ABILITY_POINT_BUDGETS[instance.star]);
        for (const value of Object.values(points)) expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("レベルが星ごとの上限を超えない", () => {
    for (const npc of ALL_NPCS) {
      for (const { instance } of npc.defense.units) {
        expect(instance.level).toBeGreaterThanOrEqual(1);
        expect(instance.level).toBeLessThanOrEqual(STAR_MAX_LEVEL[instance.star]);
      }
    }
  });

  it("スキルレベルが上限を超えない", () => {
    for (const npc of ALL_NPCS) {
      for (const { instance } of npc.defense.units) {
        expect(instance.skillLevels).toHaveLength(3);
        for (const level of instance.skillLevels) {
          expect(level).toBeGreaterThanOrEqual(1);
          expect(level).toBeLessThanOrEqual(MAX_SKILL_LEVEL);
        }
      }
    }
  });

  it("装備がプレイヤーと同じ6スロットで、強化値が上限を超えない", () => {
    // スロット数を勝手に増やせば、それだけで到達不可能な相手が作れてしまう
    for (const npc of ALL_NPCS) {
      for (const { equipment } of npc.defense.units) {
        expect(equipment).toHaveLength(EQUIP_SLOTS.length);
        expect(new Set(equipment.map((e) => e.slot)).size).toBe(EQUIP_SLOTS.length);
        for (const item of equipment) {
          expect(item.level).toBeGreaterThanOrEqual(0);
          expect(item.level).toBeLessThanOrEqual(EQUIP_MAX_LEVEL);
          expect(item.subStats.length).toBeLessThanOrEqual(4);
        }
      }
    }
  });

  it("装備のメインOPが、そのスロットで実際に出うるものである", () => {
    // 狙ったOPを後から書き換えると、生成規則の外の装備が生まれる。
    // 「スロット1にクリダメ」のような、拾ってきようのない装備を作らせない
    for (const npc of ALL_NPCS) {
      for (const { equipment } of npc.defense.units) {
        for (const item of equipment) {
          expect(SLOT_MAIN_STAT_OPTIONS[item.slot]).toContain(item.mainStat.type);
        }
      }
    }
  });

  it("instance.equipment が、同じスナップショットの装備IDを指している", () => {
    // 手持ちの装備IDを指したままだと、本人が売った瞬間に相手が壊れる。
    // 契約(`ArenaUnitSnapshot`)として閉じていることを見る
    for (const npc of ALL_NPCS) {
      for (const { instance, equipment } of npc.defense.units) {
        const ids = new Set(equipment.map((e) => e.id));
        const mapped = Object.entries(instance.equipment);
        expect(mapped).toHaveLength(EQUIP_SLOTS.length);
        for (const [slot, id] of mapped) {
          expect(ids.has(id as string), `スロット${slot}の装備IDが配列に無い`).toBe(true);
          expect(equipment.find((e) => e.id === id)!.slot).toBe(Number(slot));
        }
      }
    }
  });

  it("潜在覚醒IDが、そのモンスターの候補に実在する", () => {
    // それらしいIDを組み立てて書くと、解決が黙って undefined を返し、
    // 「覚醒しているのに何も起きない相手」になる
    let awakened = 0;
    for (const npc of ALL_NPCS) {
      for (const { instance } of npc.defense.units) {
        const id = instance.development.latentAbilityId;
        if (id === null) continue;
        awakened += 1;
        const candidates = LATENT_ABILITY_CANDIDATES[instance.dexId] ?? [];
        expect(candidates.some((c) => c.id === id), `${instance.dexId} に ${id} が無い`).toBe(true);
      }
    }
    // 上の帯は潜在覚醒を持つ設定なので、1体も覚醒していないなら
    // 「候補が引けずに黙って未覚醒へ落ちている」ことを疑う
    expect(awakened).toBeGreaterThan(0);
  });

  it("高レート帯ほど最終ステータスが高い(帯ごとの平均で比べる)", () => {
    /*
     * 1回の抽選で比べると、星の抽選や装備のばらつきだけで順序が入れ替わる。
     * **複数の種で平均を取ってから**比べること。
     * また、比べる値は必ず `toBattleDefinition` を通したもの——
     * 設定表の数字を比べても、それが戦闘へ届いている証拠にはならない。
     */
    const averages = BAND_SAMPLE_RATINGS.map((rating) => {
      const units = everyNpc(rating).flatMap((npc) => npc.defense.units);
      return units.reduce((sum, unit) => sum + powerOf(unit), 0) / units.length;
    });
    for (let i = 1; i < averages.length; i += 1) {
      expect(
        averages[i],
        `${ARENA_NPC_BANDS[i].id} が ${ARENA_NPC_BANDS[i - 1].id} を上回っていない: ${averages.join(" / ")}`,
      ).toBeGreaterThan(averages[i - 1]);
    }
  });

  it("装備が実際に最終ステータスへ届いている", () => {
    // 装備を配列に持たせただけで `toBattleDefinition` へ渡し忘れる、という
    // 抜け方をする。装備あり/なしで差が出ることを直接見る
    for (const rating of BAND_SAMPLE_RATINGS) {
      const units = everyNpc(rating).flatMap((npc) => npc.defense.units);
      const withGear = units.reduce((sum, u) => sum + powerOf(u, true), 0);
      const without = units.reduce((sum, u) => sum + powerOf(u, false), 0);
      expect(withGear).toBeGreaterThan(without * 1.05);
    }
  });

  it("役割に合ったメインOPが、上の帯ほど多く出る", () => {
    /*
     * 完全ランダムだと「速攻」を名乗る相手が速度を1つも持たない。
     * ただし**下の帯は合っていない方が自然**なので、厳しく縛らない。
     * 見るのは「最上位でほぼ合っていること」と「下から上へ増えること」の2点。
     */
    const rates = BAND_SAMPLE_RATINGS.map((rating) => {
      let matched = 0;
      let total = 0;
      for (const npc of everyNpc(rating)) {
        const team = ARENA_NPC_TEAMS.find((t) => t.name === npc.archetypeName);
        expect(team, `編成名 ${npc.archetypeName} が表に無い`).toBeTruthy();
        npc.defense.units.forEach((unit, i) => {
          const plan = ARENA_NPC_ROLE_PLANS[team!.members[i].role];
          for (const item of unit.equipment) {
            if (!VARIABLE_SLOTS.includes(item.slot as VariableSlot)) continue;
            total += 1;
            if (plan.mainStats[item.slot as VariableSlot].includes(item.mainStat.type)) matched += 1;
          }
        });
      }
      return matched / total;
    });
    // 最下位の帯は運任せ(振り直し0回)なので、下限だけを見る
    expect(rates[0]).toBeGreaterThan(0.15);
    // 最上位は「役割に合った装備」を名乗れる水準まで来ていること
    expect(rates[rates.length - 1]).toBeGreaterThan(0.9);
    expect(rates[rates.length - 1]).toBeGreaterThan(rates[0]);
  });

  it("レート帯の表が昇順で、境界に穴が無い", () => {
    // 表の並びが崩れると `arenaNpcBandForRating` が静かに間違う
    for (let i = 1; i < ARENA_NPC_BANDS.length; i += 1) {
      expect(ARENA_NPC_BANDS[i].minRating).toBeGreaterThan(ARENA_NPC_BANDS[i - 1].minRating);
    }
    expect(ARENA_NPC_BANDS[0].minRating).toBe(0);
  });

  it("並べたNPCに勝てそうな相手・互角・格上が混ざる", () => {
    // 3人とも同じ強さだと、選ぶという操作そのものに意味が無くなる
    const npcs = buildArenaNpcs(1650, 4242, 3);
    const ratings = npcs.map((n) => n.rating);
    expect(Math.max(...ratings) - Math.min(...ratings)).toBeGreaterThan(50);
    expect(npcs.map((n) => n.index)).toEqual([0, 1, 2]);
    expect(new Set(npcs.map((n) => n.id)).size).toBe(3);
  });

  it("1人だけ組む口も、並べた時と同じ相手を返す", () => {
    // 画面が1人ずつ引き直す作りになっても、種と位置が同じなら同じ相手であること
    const list = buildArenaNpcs(2250, 999, 3);
    expect(buildArenaNpc(2250, 999, 1)).toEqual(list[1]);
  });
});
