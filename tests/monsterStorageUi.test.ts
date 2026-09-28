/**
 * モンスター保管所の数量選び。
 *
 * 依頼主の指摘「モンスター保管所に保管できなくなっています」。
 * 数量を `window.prompt` で聞いていたため、ホーム画面へ追加したアプリ(PWA)や
 * ダイアログを止める端末では入力窓が出ずに null が返り、
 * **押しても何も起きないボタン**になっていた。数量は画面の中で選ぶ。
 *
 * このリポジトリのテストには DOM が無いので、押した時の動きは実ブラウザで確かめ、
 * ここではブラウザのダイアログへ戻っていないことだけを見張る。
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("モンスター保管所の数量選び", () => {
  it("保管所の操作はブラウザのダイアログ(prompt/confirm/alert)へ戻さない", () => {
    const main = read("../src/web/main.ts");
    const start = main.indexOf('case "MONSTER_STORAGE":');
    const end = main.indexOf('case "MONSTER_DEX":', start);
    expect(start).toBeGreaterThan(0);
    const block = main.slice(start, end);
    expect(block).not.toMatch(/window\.(prompt|confirm|alert)/);
    expect(main).not.toContain("askMonsterStorageQuantity");
    expect(read("../src/web/views/monsterStorage.ts")).not.toMatch(/\b(prompt|confirm|alert)\(/);
  });

  it("預ける・取り出す・ポイントへの確認が画面の中にある", () => {
    const view = read("../src/web/views/monsterStorage.ts");
    for (const action of ["deposit", "withdraw", "exchange", "confirm-exchange"]) {
      expect(view).toContain(`"data-storage-action": "${action}"`);
    }
    // iOS は16px未満の入力欄を押すと画面を拡大する
    expect(read("../src/web/ui/monsterStorage.css")).toMatch(/\.monster-storage-qty__input\{[^}]*font-size:16px/);
  });

  it("失敗して元に戻した時は、黙らずに理由を出す", () => {
    const main = read("../src/web/main.ts");
    const block = main.slice(main.indexOf('case "MONSTER_STORAGE":'), main.indexOf('case "MONSTER_DEX":'));
    expect(block.match(/MONSTER_STORAGE_SAVE_FAILED/g)?.length).toBe(3);
    expect(block).toContain("預けられる個体がいませんでした");
  });
});
