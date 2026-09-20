/**
 * 目覚の深域が**どの編成で戦うのか**を画面に出す。
 *
 * 編成は3つある——通常(`partyIds`)、装備ダンジョン(`dungeonPartyIds`)、
 * 試練の塔(`towerPartyIds`)。深域が使うのは通常の編成だが、
 * 画面には「編成を変更する」としか書いておらず、
 * **どれが使われるのか分からなかった**(依頼主の指摘)。
 *
 * 型検査もCSSも「書いていない」ことには気づけないので、ここで見張る。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MAX_PARTY_SIZE, createInitialState, getParty } from "../src/game/playerState.js";

const VIEW = readFileSync(new URL("../src/web/views/awakeningDepths.ts", import.meta.url), "utf8");
const PARTY_VIEW = readFileSync(new URL("../src/web/views/party.ts", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../src/web/ui/awakeningDepths.css", import.meta.url), "utf8");

describe("挑む前に編成が見える", () => {
  it("顔ぶれを並べる節がある", () => {
    expect(VIEW).toContain('className: "card depth-party"');
    expect(VIEW).toContain("この編成で挑みます");
    expect(VIEW).toContain("renderPartySlots(party, MAX_PARTY_SIZE)");
  });

  it("どの編成なのかを言い切る", () => {
    // 「編成を変更する」だけでは、3つのどれへ行くのか読めない
    expect(VIEW).toContain("通常の編成");
    expect(VIEW).toContain("装備ダンジョン・試練の塔の編成とは別です");
    expect(VIEW).toContain("通常の編成を変更する");
  });

  it("並べるのは実際に出撃する顔ぶれそのもの", () => {
    // 詳細は `getParty` の結果をそのまま渡す。別の取り方をすると表示と中身がずれる
    expect(VIEW).toContain("const party = getParty(props.player);");
    expect(getParty(createInitialState()).length).toBeLessThanOrEqual(MAX_PARTY_SIZE);
  });

  it("節の書式が用意されている", () => {
    expect(CSS).toContain(".depth-party__title");
    expect(CSS).toContain(".depth-party__note");
  });
});

describe("通常編成の上限は1か所で決める", () => {
  /*
   * 以前は `party.ts` の中だけに `const MAX_PARTY_SIZE = 4` があった。
   * 別の画面が同じ枠を描く時、そこだけ数字を書き写すと**片方だけずれる。**
   */
  it("playerState が持ち、画面は取り込んで使う", () => {
    expect(MAX_PARTY_SIZE).toBe(4);
    expect(PARTY_VIEW).not.toMatch(/const\s+MAX_PARTY_SIZE\s*=/);
    expect(PARTY_VIEW).toContain("MAX_PARTY_SIZE");
    expect(VIEW).toContain("MAX_PARTY_SIZE");
  });
});
