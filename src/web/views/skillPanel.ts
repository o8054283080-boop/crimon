import { MAX_SKILL_LEVEL, Skill, computeLeveledSkill, describeSkillEffect } from "../../core/skill.js";
import { el } from "../dom.js";

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
      el("div", { className: "skill-row__desc" }, [skill.description]),
      el(
        "div",
        { className: "skill-row__effects" },
        leveled.effects.map((effect) => el("div", {}, [describeSkillEffect(effect)])),
      ),
    ]);
  });
}
