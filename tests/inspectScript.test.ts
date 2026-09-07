import { describe, expect, it } from "vitest";
import { INSPECT } from "../tools/lib/inspect.mjs";

/**
 * 巡回の検査そのものを見張る。
 *
 * **`INSPECT` は1本の長いテンプレートリテラル**で、ブラウザの中で評価される。
 * つまり中身が壊れていても、型チェックもテストも何も言わない——
 * 壊れたまま巡回を回すと「読み込めません」で全画面が素通りする。
 * **この案件で唯一の安全網が、黙って無効になる。**
 *
 * 実際にやった。注釈の中へバッククォートを1つ書いただけで、
 * 文字列がそこで閉じ、ファイル全体が構文エラーになった。
 * 巡回もscene.mtsも起動しなくなり、原因は
 * 「Unexpected identifier 'data'」という、場所の見当もつかない一言だけだった。
 */
describe("巡回の検査が壊れていないこと", () => {
  it("読み込めて、中身がある", () => {
    expect(typeof INSPECT).toBe("string");
    expect(INSPECT.length).toBeGreaterThan(1000);
  });

  it("ブラウザで評価できる形になっている", () => {
    // ここで文法を確かめる。実行はしない(documentが無い)
    expect(() => new Function(`return ${INSPECT}`)).not.toThrow();
  });

  it("拾うべき4種類が揃っている", () => {
    // 減っていたら、その分だけ黙って見逃すようになる
    for (const kind of ["横にはみ出している", "押せないボタン", "指で押すには小さい", "文字が小さすぎる"]) {
      expect(INSPECT).toContain(kind);
    }
  });

  it("小ささの例外は、理由を書いた要素だけに効く", () => {
    // data-tap-small を付けた要素だけを外す。無条件に外さない
    expect(INSPECT).toContain("b.dataset.tapSmall");
    expect(INSPECT).not.toMatch(/if \(b\.closest\('\.mcard'\)\) continue/);
  });
});
