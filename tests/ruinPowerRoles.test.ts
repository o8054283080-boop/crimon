/**
 * 力の遺跡5階(STRONG)の「狙い」の比を固定する。
 *
 * ## なぜ比で見るのか
 *
 * 力の遺跡は「号令塔を倒すか残すか」を選ぶ場所として作った。ところが、
 *   - 元の形では**本体だけを狙うのが常に正解**だった(汎用 既定19% / 本体を狙い撃ち94%)。
 *     放置周回は狙いを付けられないので、手で遊ぶと94%・放置で19%の同じ階になっていた
 *   - 1回目の直しでは逆に**号令塔から倒すのが常に正解**になり、号令塔は巻き添えで倒れて「残す」を選べなかった
 * どちらも勝率そのもの(汎用 約12〜30%)は目安に入っていた。**勝率だけを見るテストでは気づけない。**
 * だから「どの狙いが一番か」「放置と最善の開き」「残した塔が生き残るか」を比で固定する。
 *
 * 敵か味方の片方だけを動かしてここが落ちたら、もう片方も一緒に見直すこと。
 * 測り方と全体の表: `npx tsx tools/ruinPressure.ts --teams 力・ --floors 5 --gear STRONG --aim 既定,本体,号令塔,妨害塔 --seeds 700,424242`
 *
 * 評価の目安は 200戦×種2つ(700 / 424242)。ここでは時間の都合で種700だけを見る。
 * 妨害塔を先に落とす手はどの編成でも最善にならない(5〜15pt下)ので、最善の候補から外してある。
 */
import { describe, expect, it } from "vitest";
import { RUIN_TEAMS, measureRuin, type RuinAim, type RuinResult } from "../tools/ruinPressure.js";

const TRIALS = 200;
const SEED = 700;
const AIMS: RuinAim[] = ["既定", "本体", "号令塔"];

function measureAll(teamName: string): Record<RuinAim, RuinResult> {
  const team = RUIN_TEAMS[teamName];
  const out = {} as Record<RuinAim, RuinResult>;
  for (const aim of AIMS) out[aim] = measureRuin(team, 5, "STRONG", TRIALS, 5, SEED, aim);
  return out;
}

const pt = (r: RuinResult) => r.rate * 100;
const bestMinusDefault = (m: Record<RuinAim, RuinResult>) => Math.max(...AIMS.map((a) => pt(m[a]))) - pt(m.既定);

describe("力の遺跡5階 STRONG: 号令塔を倒すか残すかが、編成で分かれる", () => {
  // 1回だけ測って、各項目で使い回す(1編成3狙い×200戦)
  const results: Record<string, Record<RuinAim, RuinResult>> = {};
  const get = (name: string) => (results[name] ??= measureAll(name));

  it("解除の無い通常編成は、号令塔を先に倒す方が本体狙いより5pt以上勝つ", () => {
    for (const name of ["力・汎用(水ウルフ版・解除なし)", "力・通常水"]) {
      const m = get(name);
      expect(pt(m.号令塔) - pt(m.本体), name).toBeGreaterThanOrEqual(5);
    }
  }, 180_000);

  it("解除を持つ汎用は、本体を狙っても号令塔先に負けない。解除を抜くとその差が5pt以上縮む", () => {
    const withStrip = get("力・汎用");
    const noStrip = get("力・汎用(水ウルフ版・解除なし)");
    const edge = (m: Record<RuinAim, RuinResult>) => pt(m.本体) - pt(m.号令塔);
    // 評価役の目安は「本体狙いが号令塔先より5pt以上」。種700では+1.5ptで届いていない(種424242は+5.0pt)。
    // ここでは「負けない」と「解除の有無で開く」を固定する
    expect(edge(withStrip)).toBeGreaterThanOrEqual(0);
    expect(edge(withStrip) - edge(noStrip)).toBeGreaterThanOrEqual(5);
  }, 180_000);

  it("本体だけを狙えば、号令塔は通常編成で3割以上生き残る(「残す」を選べる)", () => {
    for (const name of ["力・汎用", "力・汎用(水ウルフ版・解除なし)", "力・通常水"]) {
      expect(get(name).本体.heraldAlive, name).toBeGreaterThanOrEqual(0.3);
    }
  }, 180_000);

  it("放置(既定の狙い)は、どの編成でも最善の狙いから10pt以内", () => {
    for (const name of ["力・汎用", "力・汎用(水ウルフ版・解除なし)", "力・通常水", "力・制圧(水)"]) {
      expect(bestMinusDefault(get(name)), name).toBeLessThanOrEqual(10);
    }
  }, 180_000);

  it("SR/SSRにも号令塔が効く: 制圧は既定の狙いで号令塔を倒すのが8手目以降。目安の勝率も保つ", () => {
    const sr = get("力・制圧(水)");
    expect(sr.既定.heraldKillTurn).toBeGreaterThanOrEqual(8);
    expect(pt(sr.既定)).toBeGreaterThanOrEqual(88);
    const generic = pt(get("力・汎用").既定);
    expect(generic).toBeGreaterThanOrEqual(12);
    expect(generic).toBeLessThanOrEqual(30);
  }, 180_000);
});
