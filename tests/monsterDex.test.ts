import { describe, expect, it } from "vitest";
import { ALL_DISPLAYABLE_MONSTERS_DEX } from "../src/data/monsters.js";
import { latentAbilitiesForDex, resolveDexSelection } from "../src/web/views/monsterDex.js";

describe("モンスター図鑑の安全なデータ参照", () => {
  it("潜在覚醒ありモンスターの候補を静的データから表示できる", () => {
    const dex = ALL_DISPLAYABLE_MONSTERS_DEX[0];
    const abilities = latentAbilitiesForDex(dex.id);
    expect(abilities).toHaveLength(3);
    expect(abilities.every((ability) => ability.name.length > 0 && ability.description.length > 0)).toBe(true);
  });

  it("潜在覚醒データが無いIDは例外ではなく空配列になる", () => {
    expect(latentAbilitiesForDex("__missing_latent__")).toEqual([]);
  });

  it("保存された図鑑IDが不明でもundefinedを詳細描画へ渡さない", () => {
    expect(resolveDexSelection("__missing_dex__")).toBeNull();
    expect(resolveDexSelection(null)).toBeNull();
  });
});
