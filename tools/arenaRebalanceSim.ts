/**
 * アリーナ改修(2026-09)の比較。**旧 = 本番で効いていた v1 / 新 = 今回の式。**
 *
 *   npx tsx tools/arenaRebalanceSim.ts
 *
 * 出すもの:
 *   1. レート差ごとの増減表(攻撃側の勝ち・負け、防衛側)
 *   2. 挑戦券 10枚/60分 と 5枚/120分 の1週間(遊ぶ頻度ごとの戦闘回数・コイン)
 *   3. 格下狩り(NPCの一番下だけを殴り続けた時)の1日あたりのレート上昇
 *   4. 実力とレートがずれた人が適正へ戻るまでの日数(格上撃破で早まるか)
 *
 * 勝率は Elo と同じロジスティック(400で10倍)。**実際の戦闘は回さない**——
 * ここで見たいのは式と供給量の釣り合いで、編成の強さではない。
 */
import {
  applyArenaDefenseRating,
  arenaAttackWinGain,
  arenaLegacyRatingDelta,
  arenaRatingDelta,
} from "../src/data/arena/rating.js";

type Model = "OLD" | "NEW";

/* --------------------------------------------------------------------- 式 */

/** 攻撃側の増減 */
function attackDelta(model: Model, my: number, opp: number, won: boolean, repeatWin = false): number {
  if (model === "OLD") return arenaLegacyRatingDelta(my, opp, won);
  return arenaRatingDelta(my, opp, won, { repeatWin });
}

/** 防衛側の増減(1日の上限は掛けない素の値)。旧も新も v1 × 0.5 */
function defenseDelta(my: number, attacker: number, defenderWon: boolean): number {
  return applyArenaDefenseRating(my, attacker, defenderWon).delta;
}

/* ------------------------------------------------------------- 1. 表 */

const pairs: Array<[number, number]> = [
  [1000, 1000], [1000, 1300], [1000, 1500], [1000, 2000], [2000, 2500],
  [2500, 3000], [2500, 3500], [2500, 4000], [3000, 4500], [4000, 6000],
];

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
console.log("## 1. レート差ごとの増減(左が低い側)\n");
console.log("| 対戦 | 差 | 低い側が勝つ: 低い側 旧→新 / 高い側(防衛) | 高い側が勝つ: 高い側 旧→新 / 低い側(防衛) | 低い側が攻めて負け | 高い側が攻めて負け |");
console.log("|---|---:|---|---|---:|---:|");
for (const [low, high] of pairs) {
  const d = high - low;
  const upsetOld = attackDelta("OLD", low, high, true);
  const upsetNew = attackDelta("NEW", low, high, true);
  const defLoss = defenseDelta(high, low, false);
  const favOld = attackDelta("OLD", high, low, true);
  const favNew = attackDelta("NEW", high, low, true);
  const defLossLow = defenseDelta(low, high, false);
  console.log(`| ${low} vs ${high} | ${d} | ${sign(upsetOld)}→**${sign(upsetNew)}** / ${sign(defLoss)} | ${sign(favOld)}→**${sign(favNew)}** / ${sign(defLossLow)} | ${sign(attackDelta("NEW", low, high, false))} | ${sign(attackDelta("NEW", high, low, false))} |`);
}

console.log("\n### 格上撃破の増加量(新)を差ごとに\n");
console.log("| 差 | 0 | 50 | 100 | 150 | 200 | 250 | 300 | 400 | 500 | 750 | 1000 | 1250 | 1500 | 2000 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const ups = [0, 50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000];
console.log(`| 新 | ${ups.map((d) => sign(arenaAttackWinGain(d))).join(" | ")} |`);
console.log(`| 旧 | ${ups.map((d) => sign(arenaLegacyRatingDelta(1000, 1000 + d, true))).join(" | ")} |`);
const downs = [0, -50, -100, -150, -200, -250, -300, -400, -600];
console.log("\n| 格下撃破の差 | " + downs.join(" | ") + " |");
console.log("|---|" + downs.map(() => "---").join("|") + "|");
console.log(`| 新 | ${downs.map((d) => sign(arenaAttackWinGain(d))).join(" | ")} |`);
console.log(`| 旧 | ${downs.map((d) => sign(arenaLegacyRatingDelta(1000, 1000 + d, true))).join(" | ")} |`);

/* ------------------------------------------------- 2. 挑戦券と供給量 */

interface TicketRule { max: number; regenMinutes: number; winCoins: number; lossCoins: number }
const OLD_TICKETS: TicketRule = { max: 10, regenMinutes: 60, winCoins: 10, lossCoins: 3 };
const NEW_TICKETS: TicketRule = { max: 5, regenMinutes: 120, winCoins: 20, lossCoins: 6 };

/**
 * 1週間、決まった時刻にだけ開いて券を使い切る人。
 * `checkHours` はその日に開く時刻(0〜24)。券は時間で回復し、満タン以上は捨てる。
 */
function weekOfPlay(rule: TicketRule, checkHours: number[], winRate: number): { battles: number; coins: number } {
  let tickets = rule.max;
  let clock = 0; // 分
  let lastRegen = 0;
  let battles = 0;
  let coins = 0;
  const regen = (now: number) => {
    if (tickets >= rule.max) { lastRegen = now; return; }
    const ticks = Math.floor((now - lastRegen) / rule.regenMinutes);
    if (ticks <= 0) return;
    tickets = Math.min(rule.max, tickets + ticks);
    lastRegen += ticks * rule.regenMinutes;
    if (tickets >= rule.max) lastRegen = now;
  };
  for (let day = 0; day < 7; day += 1) {
    for (const hour of checkHours) {
      clock = day * 1440 + hour * 60;
      regen(clock);
      while (tickets > 0) {
        tickets -= 1;
        battles += 1;
        coins += winRate * rule.winCoins + (1 - winRate) * rule.lossCoins;
      }
    }
  }
  return { battles, coins: Math.round(coins) };
}

console.log("\n## 2. 挑戦券 旧10枚/60分(1日24枚) → 新5枚/120分(1日12枚)。1週間・勝率60%\n");
console.log("| 遊び方 | 旧 戦闘 | 新 戦闘 | 比 | 旧 コイン | 新 コイン | 比 |");
console.log("|---|---:|---:|---:|---:|---:|---:|");
const patterns: Array<[string, number[]]> = [
  ["1日1回(21時)", [21]],
  ["1日2回(8時・21時)", [8, 21]],
  ["1日3回(8・13・21時)", [8, 13, 21]],
  ["起きている間2時間ごと(8〜24時)", [8, 10, 12, 14, 16, 18, 20, 22, 24]],
  ["1時間ごと(ずっと)", Array.from({ length: 24 }, (_, i) => i + 0.99)],
];
for (const [name, hours] of patterns) {
  const o = weekOfPlay(OLD_TICKETS, hours, 0.6);
  const n = weekOfPlay(NEW_TICKETS, hours, 0.6);
  console.log(`| ${name} | ${o.battles} | ${n.battles} | ${(n.battles / o.battles * 100).toFixed(0)}% | ${o.coins} | ${n.coins} | ${(n.coins / o.coins * 100).toFixed(0)}% |`);
}

/* ------------------------------------------------------ 3. 格下狩り */

console.log("\n## 3. 格下狩り(NPCの一番下 −60 だけを殴り続ける)。1日の上昇の期待値\n");
console.log("| NPCへの勝率 | 旧 1戦 | 旧 1日(24戦) | 新 1戦 | 新 1日(12戦) |");
console.log("|---:|---:|---:|---:|---:|");
for (const p of [0.5, 0.7, 0.9, 0.99]) {
  const oldEv = p * attackDelta("OLD", 3000, 2940, true) + (1 - p) * attackDelta("OLD", 3000, 2940, false);
  const newEv = p * attackDelta("NEW", 3000, 2940, true) + (1 - p) * attackDelta("NEW", 3000, 2940, false);
  console.log(`| ${(p * 100).toFixed(0)}% | ${oldEv.toFixed(1)} | ${(oldEv * 24).toFixed(0)} | ${newEv.toFixed(1)} | ${(newEv * 12).toFixed(0)} |`);
}
/*
 * 釣り合う勝率。互角の相手(差0)で期待値が0になる勝率。
 * ここより勝てる人だけが上がり続ける(= この勝率に落ち着くところまでレートが上がる)。
 */
const even = (model: Model) => {
  const w = attackDelta(model, 3000, 3000, true);
  const l = -attackDelta(model, 3000, 3000, false);
  return l / (w + l);
};
console.log(`\n互角の相手で期待値0になる勝率: 旧 ${(even("OLD") * 100).toFixed(0)}% / 新 ${(even("NEW") * 100).toFixed(0)}%`);
console.log("(旧は4割勝てば上がり続ける=インフレ側。新は5割で釣り合う)");

/* ------------------------------------------ 4. 適正レートへの収束 */

function winProb(my: number, opp: number): number {
  return 1 / (1 + 10 ** ((opp - my) / 400));
}

/**
 * 実力 `skill` の人が、レート `start` から毎日戦う。
 *
 * 相手は NPC 3種(自分のレート −60/+5/+70、NPCの実力=そのレート)と、
 * 実プレイヤー(旧は自分の ±300 に居る人だけ、新は3人を近・中・遠から)。
 * 毎戦、期待値がいちばん大きい相手を選ぶ(賢い人)。
 */
function converge(model: Model, skill: number, start: number, players: number[], days: number, seed = 1): number[] {
  let rating = start;
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const perDay = model === "OLD" ? 24 : 12;
  const trail: number[] = [];
  // 実プレイヤーに最後に勝った日(20時間の連勝判定を1日単位で近似する)
  const lastWinDay = new Map<number, number>();
  for (let day = 0; day < days; day += 1) {
    for (let i = 0; i < perDay; i += 1) {
      const npcs = [rating - 60, rating + 5, rating + 70];
      let visible: number[];
      if (model === "OLD") visible = players.filter((p) => Math.abs(p - rating) <= 300);
      else {
        const sorted = [...players].sort((a, b) => Math.abs(a - rating) - Math.abs(b - rating));
        const third = Math.max(1, Math.ceil(sorted.length / 3));
        visible = [sorted[0], sorted[third], sorted[third * 2]].filter((x): x is number => x !== undefined);
      }
      const options = [...npcs.map((r) => ({ r, player: false })), ...visible.map((r) => ({ r, player: true }))];
      let best = options[0];
      let bestEv = -Infinity;
      for (const opp of options) {
        const repeat = opp.player && lastWinDay.get(opp.r) === day;
        const p = winProb(skill, opp.r);
        const ev = p * attackDelta(model, rating, opp.r, true, repeat) + (1 - p) * attackDelta(model, rating, opp.r, false);
        if (ev > bestEv) { bestEv = ev; best = opp; }
      }
      const won = rnd() < winProb(skill, best.r);
      const repeat = best.player && lastWinDay.get(best.r) === day;
      rating = Math.max(0, rating + attackDelta(model, rating, best.r, won, repeat));
      if (won && best.player) lastWinDay.set(best.r, day);
    }
    trail.push(rating);
  }
  return trail;
}

function daysTo(trail: number[], target: number, up: boolean): string {
  const i = trail.findIndex((r) => (up ? r >= target : r <= target));
  return i < 0 ? `${trail.length}日で未到達(${trail[trail.length - 1]})` : `${i + 1}日`;
}

/** 平均をとる(乱数のばらつきを均す) */
function avgTrail(model: Model, skill: number, start: number, players: number[], days: number): number[] {
  const runs = 40;
  const sum = new Array(days).fill(0);
  for (let r = 0; r < runs; r += 1) {
    const t = converge(model, skill, start, players, days, r + 1);
    for (let d = 0; d < days; d += 1) sum[d] += t[d];
  }
  return sum.map((v) => Math.round(v / runs));
}

console.log("\n## 4. 実力とレートがずれた人が戻るまで(40回の平均)\n");
const REAL = [2961, 3914, 4425]; // 本番で防衛を置いている人のレート(2026-09-25、集計のみ)
const WIDE = Array.from({ length: 30 }, (_, i) => 1500 + i * 110);
console.log("| 状況 | 相手の実プレイヤー | 旧 | 新 |");
console.log("|---|---|---|---|");
const cases: Array<[string, number, number, number[], string]> = [
  ["実力4000・レート2500(過小評価)", 4000, 2500, REAL, "本番の3人"],
  ["実力4000・レート2500(過小評価)", 4000, 2500, WIDE, "1500〜4700に30人"],
  ["実力3000・レート1000(新規の強い人)", 3000, 1000, WIDE, "1500〜4700に30人"],
  ["実力2500・レート4000(過大評価)", 2500, 4000, WIDE, "1500〜4700に30人"],
];
for (const [name, skill, start, players, label] of cases) {
  const o = avgTrail("OLD", skill, start, players, 30);
  const n = avgTrail("NEW", skill, start, players, 30);
  const up = skill > start;
  const target = up ? skill - 150 : skill + 150;
  console.log(`| ${name}→${target}到達 | ${label} | ${daysTo(o, target, up)} | ${daysTo(n, target, up)} |`);
}
/*
 * 実力どおりのところに居る人は、どちらの式でもそこから大きく動かない方が良い。
 * 旧はNPC戦が4割で釣り合うので、実力より上へ流れていく(インフレ)。
 */
console.log("\n実力どおりのレートから30日遊んだ時の流れ(実力より上へ流れる量がインフレ):\n");
console.log("| 実力=開始レート | 旧 30日後 | 新 30日後 |");
console.log("|---:|---:|---:|");
for (const skill of [1500, 3000, 4500]) {
  const o = avgTrail("OLD", skill, skill, WIDE, 30);
  const n = avgTrail("NEW", skill, skill, WIDE, 30);
  console.log(`| ${skill} | ${sign(o[29] - skill)} | ${sign(n[29] - skill)} |`);
}
