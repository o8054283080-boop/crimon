import fs from "node:fs";

const path = "src/battle/engine.ts";
let text = fs.readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, got ${count}`);
  text = text.replace(before, after);
}

replaceOnce(
  '    const lifeAlive = this.units.some((unit) => unit.team === "ENEMY" && unit.alive && unit.def.name === "古代の生命晶");',
  '    const lifeAlive = this.units.some((unit) => unit.team === "ENEMY" && unit.alive && unit.def.skills.some((skill) => skill.id === "tower70_life_s2"));',
  "life crystal identification",
);

replaceOnce(
  `        target.effects.push({\n          kind: "DEBUFF",\n          stat: "def",\n          amount: -TOWER70_ROAR_DEF_DOWN,\n          remainingTurns: TOWER70_ROAR_DEF_DOWN_TURNS,\n        });`,
  `        if (target.alive) {\n          const existingDefDown = target.effects.find((effect) =>\n            effect.kind === "DEBUFF"\n            && effect.stat === "def"\n            && effect.amount === -TOWER70_ROAR_DEF_DOWN\n          );\n          if (existingDefDown) {\n            existingDefDown.remainingTurns = Math.max(existingDefDown.remainingTurns, TOWER70_ROAR_DEF_DOWN_TURNS);\n          } else {\n            target.effects.push({\n              kind: "DEBUFF",\n              stat: "def",\n              amount: -TOWER70_ROAR_DEF_DOWN,\n              remainingTurns: TOWER70_ROAR_DEF_DOWN_TURNS,\n            });\n          }\n        }`,
  "roar def-down refresh",
);

fs.writeFileSync(path, text);
