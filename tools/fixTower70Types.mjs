import fs from 'node:fs';

const enginePath = 'src/battle/engine.ts';
let engine = fs.readFileSync(enginePath, 'utf8');
engine = engine.replace(
  '    const before = boss.currentHp;\n    const healed = applyHeal(boss, Math.round(boss.maxHp * rate));\n    if (healed > 0) {',
  '    const before = boss.currentHp;\n    applyHeal(boss, Math.round(boss.maxHp * rate));\n    const healed = boss.currentHp - before;\n    if (healed > 0) {'
);
fs.writeFileSync(enginePath, engine);

const floorPath = 'src/data/trialTowerFloor70.ts';
let floor = fs.readFileSync(floorPath, 'utf8');
floor = floor.replace('import { ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE, BEHEMOTH } from "./monsters.js";', 'import { ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE } from "./monsters.js";');
floor = floor.replace('export const TOWER70_BOSS_TEMPLATE_ID = BEHEMOTH.templateId;', 'export const TOWER70_BOSS_TEMPLATE_ID = "behemoth";');
fs.writeFileSync(floorPath, floor);
