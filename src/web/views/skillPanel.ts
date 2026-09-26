import { MAX_SKILL_LEVEL, Skill, computeLeveledSkill, describeSkillGrowth, describeSkillLines, skillDescriptionNote } from "../../core/skill.js";
import { el } from "../dom.js";
import "../ui/skillGrowth.css";

const TARGET_LABEL: Record<Skill["target"], string> = {
  SINGLE_ENEMY: "敵単体",
  ALL_ENEMIES: "敵全体",
  SINGLE_ALLY: "味方単体",
  ALL_ALLIES: "味方全体",
  SELF: "自身",
};

/**
 * そのスキルがどこへ当たるか。
 *
 * **画面によって出たり出なかったりしていた。**ここ(スキル一覧)には出ていたが、
 * 図鑑・所持モンスターの詳細・クリエイトには無く、
 * **全体攻撃なのか単体攻撃なのかが読めなかった**(依頼主の指摘)。
 * 同じ言葉を全部の画面で使うために、ここから配る。
 */
export function describeSkillTarget(skill: Skill): string {
  return `対象：${TARGET_LABEL[skill.target]}`;
}

/**
 * 説明文の行。
 *
 * **生成文で始まる説明は、その先の一言だけを出す。**
 * そのまま出すと、すぐ下に並ぶ効果の行とまったく同じ文が二度出る。
 * しかも説明文の数字はLv1で焼いてあるので、育てると
 * **同じ項目に違う数字が2つ並ぶ**(依頼主の指摘)。
 */
export function skillDescriptionText(skill: Skill): string[] {
  const note = skillDescriptionNote(skill);
  const text = note !== null ? note : skill.description;
  return text ? [text] : [];
}

/** 上の文を、スキル一覧の形(`skill-row__desc`)で包んだもの */
export function descriptionNodes(skill: Skill): HTMLElement[] {
  return skillDescriptionText(skill).map((text) => el("div", { className: "skill-row__desc" }, [text]));
}

/**
 * スキル1〜3の一覧を表示する行を作る。levelsを渡すと、そのレベルを反映した実効値
 * (ダメージ倍率・回復量・クールタイム・バフ継続ターンなど)とレベル表示が付く。
 * levelsを渡さない場合は図鑑用にレベル1(基礎値)の表示になる。
 */
export function renderSkillRows(skills: readonly Skill[], levels?: readonly number[]): HTMLElement[] {
  return skills.map((skill, i) => {
    const level = levels ? levels[i] : 1;
    const leveled = levels ? computeLeveledSkill(skill, level) : skill;
    const nameText = levels ? `スキル${i + 1}: ${skill.name} (Lv.${level}/${MAX_SKILL_LEVEL})` : `スキル${i + 1}: ${skill.name}`;

    return el("div", { className: "skill-row" }, [
      el("div", { className: "skill-row__header" }, [
        el("span", { className: "skill-row__name" }, [nameText]),
        el("span", { className: "skill-row__cooldown" }, [leveled.cooldownTurns > 0 ? `CT ${leveled.cooldownTurns}ターン` : "CTなし"]),
      ]),
      ...descriptionNodes(skill),
      el(
        "div",
        { className: "skill-row__effects" },
        [describeSkillTarget(leveled), ...describeSkillLines(leveled)].map((line) => el("div", {}, [line])),
      ),
    ]);
  });
}

/**
 * 「レベルを上げると何が変わるか」の要約。
 *
 * **図鑑と所持モンスターの両方で同じものを出す。**
 * 育てるかどうかを決めるのは手持ちの画面なので、
 * そちらで見られないと意味が薄い(依頼主の指摘)。
 *
 * `currentLevel` を渡すと、**もう通った段と次の段**が分かる印が付く。
 */
export function renderSkillGrowthSummary(skill: Skill, currentLevel?: number): HTMLElement {
  const rows = describeSkillGrowth(skill).map((step) => {
    const done = currentLevel !== undefined && step.level <= currentLevel;
    const next = currentLevel !== undefined && step.level === currentLevel + 1;
    return el("div", { className: `skill-growth-diff${done ? " is-done" : ""}${next ? " is-next" : ""}` }, [
      el("span", { className: "skill-growth-diff__level" }, [`Lv.${step.level}`]),
      el("span", { className: "skill-growth-diff__change" }, [
        step.changes.length > 0 ? step.changes.join(" / ") : "変化なし",
      ]),
    ]);
  });
  return el("div", { className: "skill-growth-summary" }, [
    el("div", { className: "skill-growth-summary__head" }, ["レベルを上げると"]),
    ...rows,
  ]);
}

/** 図鑑用: スキルレベルを上げると何がどう変わるかを、Lv.1/Lv.4/Lv.5の実効値を並べて見せるプレビュー行 */
const GROWTH_PREVIEW_LEVELS = [1, 4, 5] as const;

export function renderSkillGrowthRows(skills: readonly Skill[]): HTMLElement[] {
  return skills.map((skill, i) => el("div", { className: "skill-row" }, [
    el("div", { className: "skill-row__header" }, [el("span", { className: "skill-row__name" }, [`スキル${i + 1}: ${skill.name}`])]),
    ...descriptionNodes(skill),
    ...renderSkillLevelDetail(skill),
  ]));
}

/**
 * スキル1つの「レベルを上げると」と、Lv別の全文。モンスター図鑑とスキル図鑑で同じものを出す。
 *
 * **「何が変わったか」を先に出す。**
 * Lv別の全文を5段ぶん並べても、どこが動いたのかは読み取れない
 * (依頼主の指摘)。1段につき変わった一点だけを短く並べて、
 * 細かい値を見たい時のために全文をその下へ残す。
 */
export function renderSkillLevelDetail(skill: Skill): HTMLElement[] {
  const previewRows = (skill.levelOverrides ? [1, 2, 3, 4, 5] : GROWTH_PREVIEW_LEVELS).map((level) => {
    const leveled = computeLeveledSkill(skill, level);
    // パッシブは手番で使わないので、CTの表記を付けない(「CTなし」は使える技に見える)
    const cooldownText = skill.passive ? "" : leveled.cooldownTurns > 0 ? ` (CT ${leveled.cooldownTurns}ターン)` : " (CTなし)";
    const effectText = [describeSkillTarget(leveled), ...describeSkillLines(leveled)].join(" / ");
    const levelLabel = level === 1 ? "Lv.1(初期)" : level === MAX_SKILL_LEVEL ? `Lv.${level}(最大)` : `Lv.${level}`;

    return el("div", { className: "skill-growth-row" }, [
      el("span", { className: "skill-growth-row__level" }, [levelLabel]),
      el("span", { className: "skill-growth-row__value" }, [`${effectText}${cooldownText}`]),
    ]);
  });

  return [renderSkillGrowthSummary(skill), el("div", { className: "skill-growth" }, previewRows)];
}
