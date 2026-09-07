/**
 * `inspect.mjs` の型。**中身はブラウザで評価される1本の文字列。**
 *
 * ここが要るのは、検査そのものが壊れていないかをテストから確かめるため
 * (`tests/inspectScript.test.ts`)。壊れても型チェックは何も言わないので、
 * 読み込めること・文法が通ることをテスト側で見張っている。
 */
export declare const INSPECT: string;
