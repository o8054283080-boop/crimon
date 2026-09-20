import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { summarizeTalents, hasAnyTalent } from "../src/core/talentSummary.js";
import { BASIC_TALENT_BY_LINE, BATTLE_TALENT_BY_LINE, type TalentState } from "../src/core/talents.js";
import { findSkillTalent } from "../src/core/talentSkills.js";

/**
 * 才能覚醒の要約。
 *
 * **潜在覚醒は詳細に出るのに、才能覚醒は何も出ていなかった。**
 * スキルを覚醒させても強化しても、モンスターの画面からは分からず、
 * 才能覚醒の画面まで戻らないと確かめられない(依頼主の指摘)。
 *
 * ここで見るのは「取ったものが漏れなく1行になる」ことだけ。
 * 文言そのものは定義側(`effectLabel`)から引いているので、
 * **要約のために別の言い回しを書き起こさない**ことも一緒に守る。
 */

const empty: TalentState = {
  schemaVersion: 1,
  unlockedPoints: 0,
  basic: {},
  battle: {},
  skill: { 1: [], 2: [] },
  awakening: null,
};

describe("summarizeTalents", () => {
  it("何も取っていなければ空", () => {
    expect(summarizeTalents(empty)).toEqual([]);
    expect(summarizeTalents(undefined)).toEqual([]);
    expect(hasAnyTalent(empty)).toBe(false);
    expect(hasAnyTalent(undefined)).toBe(false);
  });

  it("基礎・戦闘は段の数字と定義側の文言をそのまま出す", () => {
    const lines = summarizeTalents({ ...empty, basic: { atk: 3 }, battle: { healing: 1 } });
    const atk = BASIC_TALENT_BY_LINE.get("atk")!;
    const healing = BATTLE_TALENT_BY_LINE.get("healing")!;
    expect(lines).toEqual([
      { group: "基礎", label: `${atk.name} III`, effect: atk.steps[2].effectLabel },
      { group: "戦闘", label: `${healing.name} I`, effect: healing.steps[0].effectLabel },
    ]);
  });

  it("段0は取っていないのと同じ", () => {
    expect(summarizeTalents({ ...empty, basic: { atk: 0 }, battle: { healing: 0 } })).toEqual([]);
  });

  it("スキル才能は枠ごとに1行へまとめる", () => {
    const lines = summarizeTalents({
      ...empty,
      skill: { 1: ["atk_power1", "atk_crit"], 2: ["heal_boost1"] },
    });
    // 添字1がスキル2、2がスキル3(`MonsterInstance.skills` に揃えてある)
    expect(lines).toEqual([
      {
        group: "スキル",
        label: "スキル2",
        effect: `${findSkillTalent("atk_power1")!.name} / ${findSkillTalent("atk_crit")!.name}`,
      },
      { group: "スキル", label: "スキル3", effect: findSkillTalent("heal_boost1")!.name },
    ]);
  });

  it("スキル覚醒は名前と効果を並べて出す", () => {
    const lines = summarizeTalents({ ...empty, awakening: { slot: 2, id: "awk_atk_pierce" } });
    const def = findSkillTalent("awk_atk_pierce")!;
    expect(lines).toEqual([
      { group: "覚醒", label: "スキル3", effect: `${def.name}：${def.effectLabel}` },
    ]);
    expect(hasAnyTalent({ ...empty, awakening: { slot: 2, id: "awk_atk_pierce" } })).toBe(true);
  });

  it("全部取っていれば 基礎 → 戦闘 → スキル → 覚醒 の順に並ぶ", () => {
    const groups = summarizeTalents({
      schemaVersion: 1,
      unlockedPoints: 20,
      basic: { atk: 1, spd: 2 },
      battle: { damageDealt: 1 },
      skill: { 1: ["atk_power1"], 2: ["heal_boost1"] },
      awakening: { slot: 1, id: "awk_atk_pierce" },
    }).map((line) => line.group);
    expect(groups).toEqual(["基礎", "基礎", "戦闘", "スキル", "スキル", "覚醒"]);
  });
});

/**
 * 画面側の配線。
 *
 * **型検査もCSSも「出していない」ことには気づけない。**
 * 潜在覚醒の隣に並んでいること、取っていない時に理由(★6で解放か、未取得か)が
 * 出ることを、ここで見張る。
 */
const MONSTERS_VIEW = readFileSync(new URL("../src/web/views/monsters.ts", import.meta.url), "utf8");
const DETAIL_CSS = readFileSync(new URL("../src/web/ui/monsterDetail.css", import.meta.url), "utf8");

describe("モンスター詳細に才能覚醒が出ている", () => {
  it("潜在覚醒と並ぶ節を持ち、要約をそのまま使う", () => {
    expect(MONSTERS_VIEW).toContain("monster-detail-talent");
    expect(MONSTERS_VIEW).toContain("◆ 才能覚醒");
    expect(MONSTERS_VIEW).toContain("summarizeTalents(instance.development?.talents)");
  });

  it("取っていない時は、★6待ちなのか未取得なのかが分かる", () => {
    expect(MONSTERS_VIEW).toContain("才能覚醒：未取得");
    expect(MONSTERS_VIEW).toContain("TALENT_UNLOCK_STAR");
  });

  it("潜在覚醒と同じ2列の形で並ぶ", () => {
    // 片方だけに書式が当たると、隣り合う2つの節が違う見た目になる
    expect(DETAIL_CSS).toContain(".monster-detail-latent > div,\n.monster-detail-talent > div");
    expect(DETAIL_CSS).toContain(".monster-detail-latent strong,\n.monster-detail-talent strong");
  });
});
