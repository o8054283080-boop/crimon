import { Skill, isPassiveSkill } from "../core/skill.js";
import { TOWER80_PASSIVES } from "./trialTowerFloor80.js";
import { CRIMOARK_CLONE_PROFILE, CRIMOARK_CLONE_ROLES, CRIMOARK_S4 } from "./crimoark.js";
import { findTowerFloor } from "./trialTower.js";
import { buildDungeonEnemyTeam } from "../game/dungeonRunner.js";

export interface TowerEnemyAbilityInfo {
  name: string;
  description: string;
}

export interface TowerEnemyInfo {
  name: string;
  skills: TowerEnemyAbilityInfo[];
  passives: TowerEnemyAbilityInfo[];
}

/**
 * 図鑑のスキル説明を攻略表示へ流用しつつ、ステータス倍率だけを伏せる。
 * 発動率・継続ターン・ゲージ量など「何をしてくるか」に必要な数値は残す。
 */
export function towerSkillDescription(skill: Skill): string {
  return skill.description
    .replace(/攻撃力[0-9.]+倍(?:＋自身の最大HP[0-9.]+%分)?のダメージ/g, "ダメージ")
    .replace(/攻撃力[0-9.]+倍の([0-9]+連撃)/g, "$1")
    .replace(/攻撃力[0-9.]+倍のダメージを([0-9]+)回/g, "ダメージを$1回")
    .replace(/攻撃力[0-9.]+倍の/g, "")
    .replace(/攻撃力[0-9.]+倍/g, "ダメージ")
    .replace(/\s+/g, " ")
    .trim();
}

function ability(skill: Skill): TowerEnemyAbilityInfo {
  return { name: skill.name, description: towerSkillDescription(skill) };
}

function enginePassives(floor: number, enemyIndex: number): TowerEnemyAbilityInfo[] {
  if (floor === 60) {
    if (enemyIndex === 0) return [{ name: "豪魔の反撃", description: "攻撃を5回受けるたび、スキル3「断魔の一閃」で即座に反撃する。" }];
    if (enemyIndex === 1) return [{ name: "魔晶の遺力", description: "倒されると、古代の豪魔人の攻撃力を上昇させる。" }];
    if (enemyIndex === 2) return [{ name: "呪晶の遺力", description: "倒されると、古代の豪魔人の速度を上昇させる。" }];
  }
  if (floor === 70) {
    if (enemyIndex === 0) return [
      { name: "始祖の再生", description: "行動するたびに自身を回復する。古代の生命晶が生きている間は回復量が増える。" },
      { name: "始祖の咆哮", description: "HPが75%・50%・25%を下回るたび、敵全体へ攻撃し、行動ゲージを減少させ、防御力を低下させる。自身のHPが減るほど攻撃性能も上がる。" },
    ];
    if (enemyIndex === 1) return [{ name: "生命共鳴", description: "生きている間、始祖ベヒモスの行動時の回復量を増加させる。" }];
  }
  if (floor === 80 && enemyIndex === 0) {
    return TOWER80_PASSIVES;
  }
  if (floor === 90) {
    if (enemyIndex === 0) return [
      { name: "古代の狂化", description: "HPが70%・40%・20%を下回るたびに攻撃性能と速度が上がる。40%以下では与えるダメージも増える。" },
      { name: "供物の狂気", description: "お供が倒れるたび、攻撃性能と速度が永続的に上昇する。" },
    ];
    const passives = [{ name: "狂化の供物", description: "倒されると、古代ネメシスを永続的に強化する。" }];
    if (enemyIndex === 3) passives.push({ name: "狂牙の激昂", description: "古代の戦鼓晶が倒れると攻撃力と速度が上がり、「処刑突撃」の威力が増す。" });
    return passives;
  }
  if (floor === 100 && enemyIndex === 0) return [
    { name: "超再生", description: "HPが70%以上の間、行動後に自身を大きく回復する。" },
    { name: "段階強化", description: "HPが70%・40%・20%を下回るたびに攻撃性能と速度が上がる。40%を下回った時は弱体効果をすべて解除し、即座に行動する。" },
    { name: "中層免疫", description: "HPが70%未満40%以上の間、自身の行動回数が4の倍数になるたびに3ターンの免疫を得る。" },
    { name: "分身結界", description: "生存している分身1体につき受けるダメージが減る。分身が倒れると一時的に攻撃力と速度が上がり、HP20%以下では本体と分身の行動ゲージが進む。" },
  ];
  return [];
}

/** 60階以降で、その戦闘が実際に使う定義から攻略情報を組み立てる。 */
export function trialTowerEnemyInfo(floorNumber: number): TowerEnemyInfo[] {
  if (floorNumber < 60 || floorNumber > 100) return [];
  const floor = findTowerFloor(floorNumber);
  if (!floor) return [];

  const definitions = buildDungeonEnemyTeam(floor);
  const visible = floor.enemies
    .map((enemy, index) => ({ enemy, definition: definitions[index], index }))
    .filter(({ enemy }) => !enemy.summonedInBattle);

  const result = visible.map(({ definition, index }) => {
    const skills = definition.skills.filter((skill) => !isPassiveSkill(skill)).map(ability);
    if (floorNumber === 100 && index === 0) skills.push(ability(CRIMOARK_S4));
    return {
      name: definition.name.replace(/\s*【BOSS】\s*$/, ""),
      skills,
      passives: [
        ...definition.skills.filter(isPassiveSkill).map(ability),
        ...enginePassives(floorNumber, index),
      ],
    };
  });

  // 分身は開幕にはいないが、戦闘中に3型のどれかが実際に現れる。
  if (floorNumber === 100) {
    for (const role of CRIMOARK_CLONE_ROLES) {
      const profile = CRIMOARK_CLONE_PROFILE[role];
      result.push({
        name: profile.displayName,
        skills: profile.skills.filter((skill) => !isPassiveSkill(skill)).map(ability),
        passives: profile.skills.filter(isPassiveSkill).map(ability),
      });
    }
  }
  return result;
}
