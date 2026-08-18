/** 装備ダンジョンの各階のボスHPを表示する(反映確認用) */
import { EQUIPMENT_DUNGEON_FLOORS } from "../src/data/equipmentDungeon.js";
import { buildDungeonEnemyTeam } from "../src/game/dungeonRunner.js";

for (const floor of EQUIPMENT_DUNGEON_FLOORS) {
  const [boss, ...rest] = buildDungeonEnemyTeam(floor);
  console.log(`${floor.floor}階  ボス ${boss.name}  HP ${boss.stats.hp}  速さ ${boss.stats.spd}  / お供HP ${rest[0].stats.hp}`);
}
