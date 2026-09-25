/**
 * 力の遺跡5階(STRONG)の「狙い」の比を固定する。
 *
 * ## なぜ比で見るのか
 *
 * 力の遺跡は「号令塔を倒すか残すか」を選ぶ場所として作った。ところが、
 *   - 元の形では**本体だけを狙うのが常に正解**だった(汎用 既定19% / 本体を狙い撃ち94%)。
 *     放置周回は狙いを付けられないので、手で遊ぶと94%・放置で19%の同じ階になっていた
 *   - 1回目の直しでは逆に**号令塔から倒すのが常に正解**になり、号令塔は巻き添えで倒れて「残す」を選べなかった
 *   - 2回目の直しでは、汎用が本体を得とする理由が**解除ではなく属性の差**だった(解除を抜いても同じだった)
 * どれも勝率そのもの(汎用 約12〜30%)は目安に入っていた。**勝率だけを見るテストでは気づけない。**
 *
 * ## 解除の働きは「同じ編成・同じ属性で解除だけを抜いた版」と比べる
 *
 * `力・汎用(解除抜き)` は、汎用と同じ5体のまま、草ウルフの「いあつ」から解除(STRIP)だけを取り除いた版。
 * 汎用との差が、そのまま解除の働き。
 *
 * ## 種は2つ(700 / 424242)を合わせて見る
 *
 * 1つの種の200戦では、汎用の「本体−号令塔先」が種によって±5ptほど揺れる
 * (同じ設定で 種700 +11.5 / 種424242 +1.5。600戦ずつにすると +8.3 / +8.0 で揃う)。
 * 1つの種だけで固定すると、揺れの片側を固定することになる。
 *
 * 敵か味方の片方だけを動かしてここが落ちたら、もう片方も一緒に見直すこと。
 * 表: `npx tsx tools/ruinPressure.ts --teams 力・ --floors 5 --gear STRONG --aim 既定,本体,号令塔,妨害塔 --seeds 700,424242`
 * 妨害塔を先に落とす手はどの編成でも最善にならない(5〜40pt下)ので、最善の候補から外してある。
 */
import { describe, expect, it } from "vitest";
import { RUIN_TEAMS, measureRuin, type RuinAim } from "../tools/ruinPressure.js";

const TRIALS = 200;
const SEEDS = [700, 424242];
const AIMS: RuinAim[] = ["既定", "本体", "号令塔"];

interface Pooled { rate: number; timeoutRate: number; heraldAlive: number; heraldKillTurn: number; turns: number }

/** 2つの種の200戦ずつを合わせた値(%)。号令塔を倒した手は、倒れた戦闘の平均をそのまま平均する */
function measurePooled(teamName: string): Record<RuinAim, Pooled> {
  const team = RUIN_TEAMS[teamName];
  const out = {} as Record<RuinAim, Pooled>;
  for (const aim of AIMS) {
    const rs = SEEDS.map((seed) => measureRuin(team, 5, "STRONG", TRIALS, 5, seed, aim));
    const avg = (pick: (r: (typeof rs)[number]) => number) => rs.reduce((sum, r) => sum + pick(r), 0) / rs.length;
    out[aim] = {
      rate: avg((r) => r.rate) * 100, timeoutRate: avg((r) => r.timeoutRate) * 100,
      heraldAlive: avg((r) => r.heraldAlive) * 100, heraldKillTurn: avg((r) => r.heraldKillTurn), turns: avg((r) => r.turns),
    };
  }
  return out;
}

describe("力の遺跡5階 STRONG: 号令塔を倒すか残すかが、解除の有無で分かれる", () => {
  const results: Record<string, Record<RuinAim, Pooled>> = {};
  const get = (name: string) => (results[name] ??= measurePooled(name));
  const edge = (name: string) => get(name).本体.rate - get(name).号令塔.rate;
  const bestMinusDefault = (name: string) => Math.max(...AIMS.map((a) => get(name)[a].rate)) - get(name).既定.rate;

  it("解除を持つ汎用は、本体を狙う方が号令塔先より5pt以上勝つ", () => {
    expect(edge("力・汎用")).toBeGreaterThanOrEqual(5);
  }, 240_000);

  it("その伸びは解除から来ている: 同じ編成・同じ属性で解除だけを抜くと、本体狙いの伸びが2pt以上縮む", () => {
    expect(edge("力・汎用") - edge("力・汎用(解除抜き)")).toBeGreaterThanOrEqual(2);
  }, 240_000);

  it("解除の無い通常編成は、号令塔を先に倒す方が本体狙いより5pt以上勝つ", () => {
    for (const name of ["力・汎用(水ウルフ版・解除なし)", "力・通常水"]) {
      expect(-edge(name), name).toBeGreaterThanOrEqual(5);
    }
  }, 240_000);

  it("本体だけを狙えば、号令塔は通常編成で3割以上生き残る(「残す」を選べる)", () => {
    for (const name of ["力・汎用", "力・汎用(水ウルフ版・解除なし)", "力・通常水"]) {
      expect(get(name).本体.heraldAlive, name).toBeGreaterThanOrEqual(30);
    }
  }, 240_000);

  it("放置(既定の狙い)は、どの編成でも最善の狙いから10pt以内", () => {
    for (const name of ["力・汎用", "力・汎用(解除抜き)", "力・汎用(水ウルフ版・解除なし)", "力・通常水", "力・制圧(水)"]) {
      expect(bestMinusDefault(name), name).toBeLessThanOrEqual(10);
    }
  }, 240_000);

  it("SR/SSRにも号令塔が効く(号令塔を倒すのが8手目以降か、45手以上かかる)。目安の勝率を保ち、時間切れは出ない", () => {
    const sr = get("力・制圧(水)").既定;
    expect(sr.heraldKillTurn >= 8 || sr.turns >= 45).toBe(true);
    expect(sr.rate).toBeGreaterThanOrEqual(88);
    const generic = get("力・汎用").既定;
    expect(generic.rate).toBeGreaterThanOrEqual(12);
    expect(generic.rate).toBeLessThanOrEqual(30);
    // 長期戦の決着(POWER_RUIN_DAMAGE_RAMP)があるので、300手の時間切れはほぼ出ない
    for (const name of ["力・汎用", "力・汎用(水ウルフ版・解除なし)", "力・通常水"]) {
      expect(get(name).既定.timeoutRate, name).toBeLessThanOrEqual(5);
    }
  }, 240_000);
});
