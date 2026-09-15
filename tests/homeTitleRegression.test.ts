import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { hasStartedHome, homeUtilityActions, startHome, tutorialMissionActions } from "../src/web/views/home.js";
import { TUTORIAL_MISSIONS } from "../src/game/tutorialMissions.js";

const source = readFileSync(new URL("../src/web/views/home.ts", import.meta.url), "utf8");

describe("NEW TITLE → NEW HOME regression contract", () => {
  it("shows title before the first START and persists START", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    expect(hasStartedHome(storage)).toBe(false);
    startHome(storage);
    expect(hasStartedHome(storage)).toBe(true);
  });

  /**
   * タイトルは1枚の絵になった。
   *
   * 題字も「Tap to Start」も絵の中にあるので、**上に文字を重ねない**。
   * そのぶん、次の2つが欠けると画面が丸ごと死ぬ:
   *   - 絵が無ければ、真っ黒な画面に透明なボタンだけが残る
   *   - 読み上げ用の名前が無ければ、絵の中の文字は読まれないので無名の押しものになる
   */
  it("renders the title cover art, start control and transition", () => {
    expect(source).toContain('className: "title-screen crimon-title-screen"');
    expect(source).toContain("../assets/backgrounds/title-cover.webp");
    expect(source).toContain('className: "crimon-title-screen__cover"');
    // 巡回はここを押す。無いとタイトルに覆われたホームを「問題なし」と報告する
    expect(source).toContain('"data-tour": "start"');
    expect(source).toContain('ariaLabel: "ゲームを開始"');
    expect(source).toContain("title-screen--leaving");
    expect(source).toContain("home-menu--visible");
  });

  it("絵の上に題字を重ねない（絵の中の文字と二重になる）", () => {
    expect(source).not.toContain("crimon-title-screen__logo");
    expect(source).not.toContain("crimon-title-screen__fallback");
    expect(source).not.toContain("DARK FANTASY MONSTER RPG");
  });

  it("preserves Arena, Shop, and How to Play callbacks exactly", () => {
    const callbacks = [vi.fn(), vi.fn(), vi.fn()] as const;
    const actions = homeUtilityActions({ onGoArena: callbacks[0], onGoShop: callbacks[1], onGoHowToPlay: callbacks[2] });
    actions.forEach((action) => action());
    callbacks.forEach((callback) => expect(callback).toHaveBeenCalledOnce());
    expect(source).toContain('worldButton("left", "menu-help", "遊び方", onGoHowToPlay)');
  });

  it("wires tutorial destination and claim once", () => {
    const go = vi.fn(); const claim = vi.fn();
    const actions = tutorialMissionActions({ onGoTutorialDestination: go, onClaimTutorial: claim }, TUTORIAL_MISSIONS[0]);
    actions.go(); actions.claim();
    expect(go).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledWith(TUTORIAL_MISSIONS[0].destination);
    expect(claim).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledWith(TUTORIAL_MISSIONS[0].id);
  });

  it("挑んでいる間は中身と報酬を見せ、全部終わったら札ごと引く", () => {
    expect(source).toContain("tutorialNext.condition");
    expect(source).toContain("rewardText(tutorialNext)");
    expect(source).toContain('["報酬を受け取る"]');
    /*
     * **終わった後の札は出さない。**
     *
     * ここは以前「全30ミッション達成！」の札があることを守っていた。
     * 外に置いていた頃は、終わると `position:fixed` が外れてヘッダー下の
     * 空き地に収まり目立たなかった。世界の中へ移してからは
     * **終わった後もずっとモンスターの上に居座る**ようになり、
     * 依頼主から2度指摘をいただいている(2度目は実機の画面を添えて)。
     *
     * 達成した中身はミッションの画面から見られる。案内は終わったら引く。
     */
    expect(source).toMatch(/const tutorial = !tutorialNext \? null :/);
    expect(source).not.toMatch(/ミッション達成/);
  });

  it("keeps CURRENT PARTY monster detail and moves Trial Tower after management", () => {
    expect(source).toContain("homePartyCard(member, props.onGoParty, props.onViewPartyMonster)");
    expect(source).not.toContain('className: "crimon-hero"');
    expect(source.indexOf('className: "world-party"')).toBeLessThan(source.indexOf('"activity-tower"'));
    expect(source).toContain("props.onGoTrialTower");
  });
});
