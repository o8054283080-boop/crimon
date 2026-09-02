import { describe, expect, it } from "vitest";
import { ARENA_NPC_TEAMS, ArenaTeamClaim } from "../src/data/arena/npcTeams.js";
import { buildArenaNpcs } from "../src/game/arena/npc.js";
import { ALL_DISPLAYABLE_MONSTERS_DEX, findMonsterById } from "../src/data/monsters.js";
import { Skill, SkillEffect } from "../src/core/skill.js";

/*
 * NPCの編成が、名乗ったとおりのことを**実際にできる**か。
 *
 * ## なぜこれが要るのか
 *
 * 名前と説明は飾りにできてしまう。「毒編成」と名乗る4体が毒を1つも
 * 持っていなくても、型もテストも何も言わない。
 *
 * この案件では実際にそれをやっている——**毒を1体も持たない3体を
 * 「毒編成」として測り、まるごと嘘の結論を出した**(CLAUDE.md)。
 * 試練の塔でも「解除で答えるはずの階で、解除を持っていく編成が止まっていた」。
 *
 * 顔ぶれを変えた時にいちばん壊れやすいのがここなので、
 * **説明文ではなくスキルの中身をたどって**裏を取る。
 */

/** その効果が主張を満たすか。`GAUGE` は符号で意味が変わるので個別に見る */
function effectSatisfies(claim: ArenaTeamClaim, effect: SkillEffect): boolean {
  const kind = effect.kind;
  switch (claim) {
    case "POISON":
      return kind === "POISON" || kind === "BURN";
    case "STRIP":
      return kind === "STRIP" || kind === "STEAL_BUFF";
    case "HEAL":
      return kind === "HEAL" || kind === "REGEN" || kind === "LIFESTEAL";
    case "CONTROL":
      // 手番を奪う。ゲージは**減らす向きだけ**が該当する
      if (kind === "STUN" || kind === "COOLDOWN_EXTEND") return true;
      return kind === "GAUGE" && (effect as { amount?: number }).amount !== undefined
        && (effect as { amount: number }).amount < 0;
    case "GUARD":
      return kind === "SHIELD" || kind === "IMMUNITY" || kind === "CLEANSE"
        || kind === "PROTECT" || kind === "MITIGATE" || kind === "COUNTER_STANCE";
    case "DEBUFF":
      return kind === "DEBUFF" || kind === "BLIND" || kind === "HEAL_BLOCK";
    case "SPEED":
      // 先に動く。素早さ上昇か、ゲージを進める効果
      if (kind === "BUFF" && (effect as { stat?: string }).stat === "spd") return true;
      return kind === "GAUGE" && (effect as { amount?: number }).amount !== undefined
        && (effect as { amount: number }).amount > 0;
    case "BURST":
      return kind === "DAMAGE" && ((effect as { multiplier?: number }).multiplier ?? 0) >= 2.0;
  }
}

function teamSatisfies(claim: ArenaTeamClaim, skills: readonly Skill[]): number {
  let count = 0;
  for (const skill of skills) {
    if (skill.effects.some((effect) => effectSatisfies(claim, effect))) count += 1;
  }
  return count;
}

function skillsOf(dexIds: readonly string[]): Skill[] {
  return dexIds.flatMap((dexId) => findMonsterById(dexId)?.skills ?? []);
}

describe("NPCの編成テンプレート", () => {
  it("書いてある図鑑IDが全部実在する", () => {
    // 存在しないIDは戦闘の直前まで気づけない
    for (const team of ARENA_NPC_TEAMS) {
      for (const member of team.members) {
        expect(findMonsterById(member.dexId), `${team.id} の ${member.dexId}`).toBeDefined();
      }
    }
  });

  it("戦力になるモンスターだけで組んである", () => {
    // 素材(ピッグ)や装備ダンジョン専用の敵が紛れ込むと、相手が成立しない
    const playable = new Set(ALL_DISPLAYABLE_MONSTERS_DEX.map((dex) => dex.id));
    for (const team of ARENA_NPC_TEAMS) {
      for (const member of team.members) {
        expect(playable, `${team.id} の ${member.dexId}`).toContain(member.dexId);
      }
    }
  });

  it("**名乗ったことを実際にできる顔ぶれである**", () => {
    /*
     * ここが本題。「毒と弱体を重ねて削り切る」と書いた編成に
     * 毒が1つも無ければ、その編成は嘘をついている。
     */
    const failures: string[] = [];
    for (const team of ARENA_NPC_TEAMS) {
      const skills = skillsOf(team.members.map((m) => m.dexId));
      for (const claim of team.claims) {
        const count = teamSatisfies(claim, skills);
        if (count === 0) failures.push(`${team.id}(${team.name}): ${claim} を持つスキルが1つも無い`);
      }
    }
    expect(failures, `名乗りと中身が合っていない編成:\n${failures.join("\n")}`).toEqual([]);
  });

  it("説明文に出てくる言葉は、必ず名乗りとして書いてある", () => {
    /*
     * 説明文だけ書き換えて `claims` を足し忘れると、上の検査を素通りする。
     * 文章の側からも引っ掛ける。
     */
    const wordToClaim: [string, ArenaTeamClaim][] = [
      ["毒", "POISON"],
      ["剥が", "STRIP"],
      ["回復", "HEAL"],
      ["手番を奪", "CONTROL"],
    ];
    const failures: string[] = [];
    for (const team of ARENA_NPC_TEAMS) {
      for (const [word, claim] of wordToClaim) {
        if (team.note.includes(word) && !team.claims.includes(claim)) {
          failures.push(`${team.id}: 説明に「${word}」とあるのに claims に ${claim} が無い`);
        }
      }
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("段が上がるほど、噛み合った役割が増える", () => {
    /*
     * 段は「編成の質」であって強さの倍率ではない。質が上がるとは
     * **できることの種類が増える**こと。段3が段0より狭かったら、
     * 上の帯へ行くほど戦い方が単調になる。
     */
    const byTier = new Map<number, number[]>();
    for (const team of ARENA_NPC_TEAMS) {
      const skills = skillsOf(team.members.map((m) => m.dexId));
      const kinds: ArenaTeamClaim[] = ["POISON", "STRIP", "HEAL", "CONTROL", "GUARD", "DEBUFF", "SPEED", "BURST"];
      const covered = kinds.filter((claim) => teamSatisfies(claim, skills) > 0).length;
      byTier.set(team.tier, [...(byTier.get(team.tier) ?? []), covered]);
    }
    const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    const tier0 = average(byTier.get(0) ?? [0]);
    const tier3 = average(byTier.get(3) ?? [0]);
    expect(tier3, `段0の平均 ${tier0.toFixed(1)} / 段3の平均 ${tier3.toFixed(1)}`).toBeGreaterThan(tier0);
  });

  it("どの段にも複数の編成がある", () => {
    // 1つしか無いと、その帯の相手が全員同じ顔ぶれになる
    for (const tier of [0, 1, 2, 3]) {
      const teams = ARENA_NPC_TEAMS.filter((team) => team.tier === tier);
      expect(teams.length, `段${tier}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("最上段にも通常モンスターだけの編成が残っている", () => {
    /*
     * `docs/design-concept.md` の芯は「ふつうのモンスターでも、育てて
     * 装備を整えれば奥まで行ける」。最上段を高レアだけで埋めると、
     * **相手編成そのものが「ここから先は引き次第だ」と言ってしまう。**
     */
    const gachaOnly = new Set(["griffon", "dragon", "seraph", "nemesis"]);
    const topTier = ARENA_NPC_TEAMS.filter((team) => team.tier === 3);
    const normalOnly = topTier.filter((team) =>
      team.members.every((member) => !gachaOnly.has(findMonsterById(member.dexId)!.templateId)),
    );
    expect(normalOnly.length, "段3が高レアだけで埋まっている").toBeGreaterThan(0);
  });

  it("編成IDも表示名も重複していない", () => {
    // 表示名は並べる時の識別にも使う。重なると「同じ編成」と誤判定する
    expect(new Set(ARENA_NPC_TEAMS.map((t) => t.id)).size).toBe(ARENA_NPC_TEAMS.length);
    expect(new Set(ARENA_NPC_TEAMS.map((t) => t.name)).size).toBe(ARENA_NPC_TEAMS.length);
  });

  it("並べた相手の編成が重ならない", () => {
    /*
     * **実機で5人中3人が同じ編成になった。** 1人ずつ独立に抽選していたため、
     * 候補が3つしかない帯では衝突が普通に起きる。並んだ相手がどれも同じ
     * 顔ぶれだと、「どれに挑むか」を選ぶ意味そのものが消える。
     */
    for (const rating of [900, 1000, 1350, 1650, 1950, 2250, 2600]) {
      const npcs = buildArenaNpcs(rating, 12345, 5);
      const names = npcs.map((entry) => entry.archetypeName ?? "");
      const distinct = new Set(names).size;
      expect(distinct, `レート${rating}: ${names.join(" / ")}`).toBeGreaterThanOrEqual(3);
      // 同じ編成が3回以上並ばない。使い切ったら数え直すので2周目までで収まる
      for (const name of new Set(names)) {
        const times = names.filter((entry) => entry === name).length;
        expect(times, `レート${rating}で「${name}」が${times}回: ${names.join(" / ")}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("編成を配り直しても、同じ種なら同じ結果になる", () => {
    // 描き直すたびに相手がすり替わると、「この相手に挑む」判断が成立しない
    const a = buildArenaNpcs(1500, 999, 5).map((e) => `${e.name}/${e.archetypeName}/${e.rating}`);
    const b = buildArenaNpcs(1500, 999, 5).map((e) => `${e.name}/${e.archetypeName}/${e.rating}`);
    expect(b).toEqual(a);
  });
});
