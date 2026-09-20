/**
 * コラボ召喚の入口。
 *
 * 依頼主の指定は2つ。
 *
 *   1. **通常召喚の下ではなく、切り替え式にする**
 *   2. **通常の召喚の書でもコラボを引けるようにする**
 *
 * どちらも見た目の話に見えて、**外すとダイヤと書のどちらが減るかが変わる。**
 * 型検査もCSSも気づけないので、ここで配線そのものを見張る。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveSummonAgain, type SummonMethod } from "../src/web/views/summon.js";
import { createInitialState } from "../src/game/playerState.js";

const VIEW = readFileSync(new URL("../src/web/views/summon.ts", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../src/web/ui/summon.css", import.meta.url), "utf8");

function player(patch: Partial<ReturnType<typeof createInitialState>> = {}) {
  return { ...createInitialState(), ...patch };
}

describe("切り替え式になっている", () => {
  /*
   * **縦に並べない。**通常召喚の下に足すと、毎日使う導線が
   * 期間限定のもので下へ押し下げられる(依頼主の指摘で切り替えにした)。
   */
  it("通常とコラボは、選んだ方だけを出す", () => {
    expect(VIEW).toContain('tab === "COLLAB" ? collabCta : cta');
    expect(VIEW).toContain('tab === "COLLAB" ? collabScrollPanel : specialPanel');
  });

  it("切り替えの帯があり、押すと呼び出し側へ伝わる", () => {
    expect(VIEW).toContain('className: "summon-switch"');
    expect(VIEW).toContain('props.onChangeTab?.("NORMAL")');
    expect(VIEW).toContain('props.onChangeTab?.("COLLAB")');
  });

  /** 期間が終われば `onCollabSummon` が渡らない → 帯ごと消えて通常だけになる */
  it("開催していない時は帯が出ず、通常召喚が表示される", () => {
    expect(VIEW).toContain('const tab: SummonTab = props.onCollabSummon ? (props.tab ?? "NORMAL") : "NORMAL"');
    expect(VIEW).toContain("const tabBar = props.onCollabSummon ?");
  });

  /** 選んでいる方が一目で分かること。**灰色にして「押せない」に見せない** */
  it("選んでいる方に地の色が付く", () => {
    expect(CSS).toContain(".summon-switch__btn.is-active");
    expect(CSS).toContain(".summon-switch__btn--collab.is-active");
  });

  it("画面の状態が main 側に持たれていて、押すと描き直される", () => {
    expect(MAIN).toContain("summonTab: SummonTab");
    expect(MAIN).toContain('summonTab: "NORMAL"');
    expect(MAIN).toContain("state.summonTab = tab;");
  });
});

describe("通常の召喚の書でもコラボが引ける", () => {
  it("コラボ側に、書で引くボタンが2つある", () => {
    expect(VIEW).toContain("props.onCollabSummonScroll?.(10)");
    expect(VIEW).toContain("props.onCollabSummonScroll?.(1)");
  });

  /*
   * **減るのは通常の書、出るのはコラボの抽選。**
   * ここを取り違えると、コラボ限定書が減って通常の顔ぶれが出る。
   */
  it("通常の書を消費して、コラボの抽選を引く", () => {
    const fn = MAIN.slice(MAIN.indexOf("function handleCollabSummonScroll"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("trySpendSummonScrolls(state.player, count)");
    expect(body).toContain("summonCollabMany(count)");
  });

  /** 保存できなければ引かなかったことにする(他の召喚と揃える) */
  it("保存できなければ、書もモンスターも巻き戻す", () => {
    const fn = MAIN.slice(MAIN.indexOf("function handleCollabSummonScroll"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toContain("if (!savePlayerState(state.player))");
    expect(body).toContain("state.player.summonScrolls += count;");
    expect(body).toContain("removeMonsters(state.player,");
  });

  it("開催中だけ画面へ渡される", () => {
    expect(MAIN).toContain("onCollabSummonScroll: handleCollabSummonScroll");
    const wiring = MAIN.slice(MAIN.indexOf("function renderSummonScreen"));
    expect(wiring.slice(0, wiring.indexOf("\n}\n"))).toContain("isCollabEventOpen()");
  });
});

/*
 * 結果画面の「もう一度」。
 *
 * ここが通常召喚のままだと、**コラボを引いた直後の「もう一度」が
 * 通常召喚になる**(画面はコラボのままで、中身だけが入れ替わる)。
 */
describe("「もう一度」がコラボのまま続く", () => {
  it("コラボをダイヤで引いた後は、コラボをダイヤで引く", () => {
    const again = resolveSummonAgain(player({ crystal: 99_999 }), { kind: "COLLAB_CRYSTAL", count: 10 }, 10);
    expect(again.method).toEqual({ kind: "COLLAB_CRYSTAL", count: 10 });
    expect(again.costIcon).toBe("crystal");
    expect(again.enabled).toBe(true);
  });

  it("コラボを書で引いた後は、書でコラボを引く", () => {
    const again = resolveSummonAgain(player({ summonScrolls: 30 }), { kind: "COLLAB_SCROLL", count: 10 }, 10);
    expect(again.method).toEqual({ kind: "COLLAB_SCROLL", count: 10 });
    expect(again.costIcon).toBe("scroll");
    expect(again.lead).toBe("書でもう10連");
  });

  it("コラボ限定召喚書は、残っていれば同じ書で続けられる", () => {
    const has = player({ collabFourStarSummonScrolls: 2 });
    const again = resolveSummonAgain(has, { kind: "COLLAB_SPECIAL", type: "COLLAB_FOUR_STAR" }, 1);
    expect(again.method).toEqual({ kind: "COLLAB_SPECIAL", type: "COLLAB_FOUR_STAR" });
    expect(again.enabled).toBe(true);
  });

  /** **使い切ったら押せないボタンを残さない。**ダイヤの通常召喚へ落とす */
  it("コラボ限定召喚書を使い切ったら、ダイヤへ落ちる", () => {
    const none = player({ collabFiveStarSummonScrolls: 0, crystal: 99_999 });
    const again = resolveSummonAgain(none, { kind: "COLLAB_SPECIAL", type: "COLLAB_FIVE_STAR" }, 1);
    expect(again.method.kind).toBe("CRYSTAL");
  });

  it("書が足りなければ、ダイヤへ落ちる", () => {
    const again = resolveSummonAgain(player({ summonScrolls: 3, crystal: 99_999 }), { kind: "COLLAB_SCROLL", count: 10 }, 10);
    expect(again.method.kind).toBe("CRYSTAL");
  });

  /*
   * **開催が終わったら引き直せない。**
   * 結果画面を開いたまま日付をまたいだ時に、ここが効く。
   */
  it("開催が終わっていれば、コラボでは引き直せない", () => {
    const rich = player({ crystal: 99_999, summonScrolls: 30, collabFourStarSummonScrolls: 5 });
    const cases: SummonMethod[] = [
      { kind: "COLLAB_CRYSTAL", count: 10 },
      { kind: "COLLAB_SCROLL", count: 10 },
      { kind: "COLLAB_SPECIAL", type: "COLLAB_FOUR_STAR" },
    ];
    for (const last of cases) {
      expect(resolveSummonAgain(rich, last, 10, false).method.kind, `${last.kind} が残っている`).not.toContain("COLLAB");
    }
  });

  it("画面は、開催しているかどうかをそのまま渡している", () => {
    expect(VIEW).toContain("resolveSummonAgain(player, props.lastMethod, results.length, props.onCollabSummon !== undefined)");
  });

  /** 押した先が手段ごとに分かれていること(型では気づけない) */
  it("コラボの「もう一度」は、コラボの関数を呼ぶ", () => {
    const block = VIEW.slice(VIEW.indexOf("const again = resolveSummonAgain"), VIEW.indexOf("const omen ="));
    expect(block).toContain("props.onCollabSummonScroll?.(again.method.count)");
    expect(block).toContain("props.onUseCollabSummonScroll?.(again.method.type)");
    expect(block).toContain("props.onCollabSummon?.(again.method.count)");
  });
});

/** コラボで引いた印が、通常召喚の印と混ざっていないこと */
describe("引いた手段の記録", () => {
  it("main.ts がコラボ用の印を3つとも立てている", () => {
    expect(MAIN).toContain('state.lastSummonMethod = { kind: "COLLAB_CRYSTAL", count };');
    expect(MAIN).toContain('state.lastSummonMethod = { kind: "COLLAB_SCROLL", count };');
    expect(MAIN).toContain('state.lastSummonMethod = { kind: "COLLAB_SPECIAL", type };');
  });
});
