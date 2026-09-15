import { describe, expect, it } from "vitest";
import { availableBackgroundRuns, createBackgroundFarmJob, dismissFinishedBackgroundFarm, finishBackgroundFarm, parseRequestedRuns, shouldStopForJstDateChange, staminaPotionBudgetOf, staminaPotionsNeeded } from "../src/game/backgroundAutoFarm.js";
import { MIN_REFERENCE_SECONDS, addManualClearTime, manualClearKey, medianSeconds, recordManualBattle, referenceRunTime } from "../src/game/manualClearTimes.js";
import { affordableCount } from "../src/web/views/autoFarmPanel.js";
import { STAMINA_POTION_AMOUNT, applyPassiveStaminaRegen, createInitialState, normalizeLoadedState, staminaPotionsOwned, tryUseStaminaPotion } from "../src/game/playerState.js";
import { readFileSync } from "node:fs";

describe("保存型バックグラウンド周回", () => {
  it("進捗時は前景を全体renderせず周回カードだけを差分更新する", () => {
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    const processBody = source.slice(source.indexOf("function processBackgroundFarmOnce"), source.indexOf("function beginBackgroundFarm"));
    expect(processBody).toContain("refreshBackgroundFarmStatus()");
    expect(processBody).not.toMatch(/\brender\(\)/);
    expect(source).toContain("current.replaceWith(next)");
    // 召喚結果はユーザーが閉じるまでAppStateに残り、周回カード更新からは変更されない。
    expect(processBody).not.toContain("summonResults");
  });
  it.each([1, 7, 25, 47, 100])("任意の正整数 %i を受理する", (value) => expect(parseRequestedRuns(value)).toBe(value));
  it.each([0, -1, 1.5, NaN, "", "abc"])("無効値 %s を拒否する", (value) => expect(parseRequestedRuns(value)).toBeNull());
  it("固定30周上限を持たず、資源で実行可能数を示す", () => {
    expect(affordableCount(230, 10)).toBe(23);
    expect(affordableCount(100_000, 10)).toBe(10_000);
    expect(affordableCount(10_000, 10, 3)).toBe(3);
  });
  it("編成スナップショットと進行・集計を保存する", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "ステージ1-1", requestedRuns: 47, partyIds: ["a"], now: 1_700_000_000_000 });
    expect(job).toMatchObject({ requestedRuns: 47, completedRuns: 0, partyIds: ["a"], status: "RUNNING", inFlight: false });
    finishBackgroundFarm(job, "STOPPED");
    expect(job).toMatchObject({ status: "STOPPED", stopReason: "STOPPED" });
  });
});

describe("JST日付変更時の周回停止", () => {
  const beforeMidnight = Date.parse("2026-08-27T14:55:00Z"); // JST 23:55
  const afterMidnight = Date.parse("2026-08-27T15:00:00Z"); // JST 翌日 00:00

  it.each(["STAGE", "EQUIP_DUNGEON"] as const)("%s はJST 0:00を跨いでも継続する", (kind) => {
    const job = createBackgroundFarmJob({ kind, targetId: "1", targetName: "target", requestedRuns: 50, partyIds: ["a"], now: beforeMidnight });
    expect(shouldStopForJstDateChange(job, afterMidnight)).toBe(false);
  });

  it.each(["LEVEL_DUNGEON", "GOLD_DUNGEON"] as const)("%s は翌日の日次枠を使わず停止する", (kind) => {
    const job = createBackgroundFarmJob({ kind, targetId: "1", targetName: "target", requestedRuns: 50, partyIds: ["a"], now: beforeMidnight });
    expect(shouldStopForJstDateChange(job, afterMidnight)).toBe(true);
  });

  it("日次コンテンツも開始日中は停止しない", () => {
    const job = createBackgroundFarmJob({ kind: "GOLD_DUNGEON", targetId: "1", targetName: "target", requestedRuns: 2, partyIds: ["a"], now: beforeMidnight });
    expect(shouldStopForJstDateChange(job, beforeMidnight + 60_000)).toBe(false);
  });
});

describe("実戦時間を基準にした周回速度", () => {
  it("100秒の手動戦闘を100秒の基準にし、初回クリアも保存できる", () => {
    const records = {};
    expect(recordManualBattle(records, manualClearKey("STAGE", "1-1", "NORMAL"), 10_000, 110_000)).toBe(true);
    expect(referenceRunTime(records, "STAGE", "1-1", "NORMAL")).toMatchObject({ seconds: 100, fromManual: true });
  });
  it("直近5件の中央値を使い、6件目で最古を捨てる", () => {
    const records = { key: [] as number[] };
    [20, 95, 100, 104, 160, 98].forEach((value) => addManualClearTime(records, "key", value));
    expect(records.key).toEqual([95, 100, 104, 160, 98]);
    expect(medianSeconds(records.key)).toBe(100);
  });
  it("偶数件は中央2件の平均を使う", () => expect(medianSeconds([90, 100])).toBe(95));
  /*
   * 以前はここが「STAGE 30秒 / 装備45秒」の下限を確かめるテストだった。
   * **速く倒せる編成を組んでも自動周回が速くならない**原因がこれだったので外した。
   * いまの下限は暴走止めの1秒だけ。
   */
  it("実測が下限より短ければ、その実測をそのまま1周にする", () => {
    expect(referenceRunTime({ "stage_1-1_NORMAL": [12] }, "STAGE", "1-1", "NORMAL").seconds).toBe(12);
    expect(referenceRunTime({ equip_10: [20] }, "EQUIP_DUNGEON", "10").seconds).toBe(20);
    // x8で3秒なら3秒/周。1倍速へ割り戻さない
    expect(referenceRunTime({ equip_10: [3] }, "EQUIP_DUNGEON", "10").seconds).toBe(3);
  });
  it("壊れた保存で0秒が入っても、1秒を下回らない", () => {
    // 0秒だと「経過時間 ÷ 1周」が跳ね、復帰した瞬間に数万回ぶんの処理権が生まれる
    expect(referenceRunTime({ equip_10: [0.2, 0.2, 0.2] }, "EQUIP_DUNGEON", "10").seconds).toBe(MIN_REFERENCE_SECONDS);
  });
  it("記録なしは旧固定値へフォールバックする", () => {
    expect(referenceRunTime({}, "STAGE", "1-1", "NORMAL")).toMatchObject({ seconds: 120, fromManual: false });
    expect(referenceRunTime({}, "EQUIP_DUNGEON", "10").seconds).toBe(150);
  });
  it("異常値・時計逆行・10分超を保存しない", () => {
    const records = {};
    for (const value of [0, NaN, Infinity, 601]) expect(addManualClearTime(records, "x", value)).toBe(false);
    expect(recordManualBattle(records, "x", 2_000, 1_000)).toBe(false);
  });
  it("99秒で0周、100秒で1周、200秒で2周（表示中・終了中で同じ計算）", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 10, partyIds: ["a"], referenceRunSeconds: 100, now: 0 });
    expect(availableBackgroundRuns(job, 99_000)).toBe(0);
    expect(availableBackgroundRuns(job, 100_000)).toBe(1);
    expect(availableBackgroundRuns(job, 200_000)).toBe(2);
  });
  it("ジョブ開始時の基準値は後から実戦記録が増えても固定される", () => {
    const records = { "stage_1-1_NORMAL": [100] };
    const first = referenceRunTime(records, "STAGE", "1-1", "NORMAL");
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 2, partyIds: ["a"], referenceRunSeconds: first.seconds });
    addManualClearTime(records, "stage_1-1_NORMAL", 40);
    expect(job.referenceRunSeconds).toBe(100);
    expect(referenceRunTime(records, "STAGE", "1-1", "NORMAL").seconds).toBe(70);
  });
  it("実戦記録フィールドのない旧セーブを空の記録としてロードできる", () => {
    const legacy = createInitialState() as unknown as { recentManualClearTimes?: unknown };
    delete legacy.recentManualClearTimes;
    expect(normalizeLoadedState(legacy as never).recentManualClearTimes).toEqual({});
  });
});

describe("completed background farm notification", () => {
  it("dismisses only the job and keeps already awarded resources", () => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 1, partyIds: [] });
    finishBackgroundFarm(job, "COMPLETED");
    const player = { backgroundFarmJob: job, gold: 1234, diamonds: 56 };
    expect(dismissFinishedBackgroundFarm(player, job.id)).toBe(true);
    expect(player).toEqual({ backgroundFarmJob: null, gold: 1234, diamonds: 56 });
  });

  it.each(["RUNNING", "SETTLING"] as const)("does not dismiss a %s job", (status) => {
    const job = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 1, partyIds: [] });
    job.status = status;
    const holder = { backgroundFarmJob: job };
    expect(dismissFinishedBackgroundFarm(holder, job.id)).toBe(false);
    expect(holder.backgroundFarmJob).toBe(job);
  });
});

/* ==========================================================================
 * スタミナポーション
 * ========================================================================== */

describe("スタミナポーション", () => {
  it("1個で+100。上限を超えて持てる", () => {
    const player = createInitialState();
    player.staminaPotions = 1;
    player.stamina = player.maxStamina; // 満タンから使う
    expect(tryUseStaminaPotion(player).ok).toBe(true);
    expect(player.stamina).toBe(player.maxStamina + STAMINA_POTION_AMOUNT);
    expect(player.staminaPotions).toBe(0);
  });

  it("持っていなければ使えず、スタミナも減らない", () => {
    const player = createInitialState();
    player.staminaPotions = 0;
    const before = player.stamina;
    expect(tryUseStaminaPotion(player).ok).toBe(false);
    expect(player.stamina).toBe(before);
  });

  it("ダイヤには一切手を付けない", () => {
    const player = createInitialState();
    player.staminaPotions = 2;
    player.crystal = 500;
    tryUseStaminaPotion(player);
    expect(player.crystal).toBe(500);
  });

  it("超過中は自然回復で増えない(基準時刻だけ進む)", () => {
    const player = createInitialState();
    player.staminaPotions = 1;
    player.stamina = player.maxStamina;
    tryUseStaminaPotion(player);
    const over = player.stamina;
    // 丸1日ぶん時計を進めても、上限超過の間は1も増えない
    applyPassiveStaminaRegen(player, Date.now() + 24 * 60 * 60 * 1000);
    expect(player.stamina).toBe(over);
  });

  it("超過ぶんを使い切って上限を割れば、そこからは普通に自然回復する", () => {
    const player = createInitialState();
    player.staminaPotions = 1;
    player.stamina = player.maxStamina;
    tryUseStaminaPotion(player);
    player.stamina = player.maxStamina - 5; // 超過ぶんを戦闘で使い切った状態
    applyPassiveStaminaRegen(player, player.lastStaminaUpdateAt + 24 * 60 * 60 * 1000);
    expect(player.stamina).toBe(player.maxStamina);
  });

  it("ポーション欄のない旧セーブは0個・使わないで読み込める", () => {
    const legacy = createInitialState() as unknown as Record<string, unknown>;
    delete legacy.staminaPotions;
    delete legacy.staminaPotionFarmBudget;
    const loaded = normalizeLoadedState(legacy as never);
    expect(staminaPotionsOwned(loaded)).toBe(0);
    expect(loaded.staminaPotionFarmBudget).toBe(0);
  });

  it.each([-5, NaN, "3" as unknown as number])("壊れた所持数 %s は0として扱う", (value) => {
    const broken = createInitialState() as unknown as Record<string, unknown>;
    broken.staminaPotions = value;
    expect(staminaPotionsOwned(normalizeLoadedState(broken as never))).toBe(0);
  });
});

describe("自動周回でのポーション自動使用", () => {
  it("足りている時は使わない", () => {
    expect(staminaPotionsNeeded(50, 8, 9, STAMINA_POTION_AMOUNT)).toBe(0);
    expect(staminaPotionsNeeded(8, 8, 9, STAMINA_POTION_AMOUNT)).toBe(0);
  });

  it("足りない時は必要な分だけ。まとめて使わない", () => {
    // あと2足りないだけなら1個。9個持っていても1個しか使わない
    expect(staminaPotionsNeeded(6, 8, 9, STAMINA_POTION_AMOUNT)).toBe(1);
    // 250要る場面で0からなら3個(100+100+100)
    expect(staminaPotionsNeeded(0, 250, 9, STAMINA_POTION_AMOUNT)).toBe(3);
  });

  it("持っている数を超えて使わない", () => {
    expect(staminaPotionsNeeded(0, 250, 1, STAMINA_POTION_AMOUNT)).toBe(1);
    expect(staminaPotionsNeeded(0, 250, 0, STAMINA_POTION_AMOUNT)).toBe(0);
  });

  it("決めた数を超えて使わない", () => {
    // 250要る場面。9個持っていても「1個まで」なら1個
    expect(staminaPotionsNeeded(0, 250, 9, STAMINA_POTION_AMOUNT, 1)).toBe(1);
    expect(staminaPotionsNeeded(0, 250, 9, STAMINA_POTION_AMOUNT, 2)).toBe(2);
    // 予算を使い切った後は1個も使わない
    expect(staminaPotionsNeeded(0, 250, 9, STAMINA_POTION_AMOUNT, 0)).toBe(0);
    expect(staminaPotionsNeeded(0, 250, 9, STAMINA_POTION_AMOUNT, -1)).toBe(0);
  });

  it("既定は0個＝使わない。入れた時だけジョブへ乗る", () => {
    const off = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 3, partyIds: ["a"] });
    expect(off.staminaPotionBudget).toBe(0);
    const on = createBackgroundFarmJob({ kind: "STAGE", targetId: "1-1", targetName: "1-1", requestedRuns: 3, partyIds: ["a"], staminaPotionBudget: 5 });
    expect(on.staminaPotionBudget).toBe(5);
  });

  /*
   * **進行中のまま更新した人のジョブ。**
   * 入 / 切しか持っていないので、入だったなら「全部」として読む。
   * ここを0にすると、回っていた周回が更新した途端に止まる。
   */
  it("入 / 切しか持たない古いジョブも読める", () => {
    const unlimited = 9_007_199_254_740_991;
    expect(staminaPotionBudgetOf({ autoUseStaminaPotion: true }, unlimited)).toBe(unlimited);
    expect(staminaPotionBudgetOf({ autoUseStaminaPotion: false }, unlimited)).toBe(0);
    expect(staminaPotionBudgetOf({}, unlimited)).toBe(0);
    // 新しい欄があれば、そちらが勝つ
    expect(staminaPotionBudgetOf({ staminaPotionBudget: 3, autoUseStaminaPotion: true }, unlimited)).toBe(3);
    expect(staminaPotionBudgetOf({ staminaPotionBudget: 0, autoUseStaminaPotion: true }, unlimited)).toBe(0);
  });

  it("使った数を数えて、残りの予算から引いている", () => {
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    const processBody = source.slice(source.indexOf("function processBackgroundFarmOnce"), source.indexOf("function beginBackgroundFarm"));
    expect(processBody).toContain("staminaPotionBudgetOf(job");
    expect(processBody).toContain("job.staminaPotionsUsed ?? 0");
  });

  it("ダイヤの自動回復へは一切繋がない", () => {
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    const processBody = source.slice(source.indexOf("function processBackgroundFarmOnce"), source.indexOf("function beginBackgroundFarm"));
    expect(processBody).toContain("tryUseStaminaPotion");
    // 周回の中からダイヤの回復を呼ばない。切れたらSTAMINAで正常に終わる
    expect(processBody).not.toContain("tryRefillStamina");
  });

  it("切れたらSTAMINAで終わる(ダイヤを使って続けない)", () => {
    const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");
    const processBody = source.slice(source.indexOf("function processBackgroundFarmOnce"), source.indexOf("function beginBackgroundFarm"));
    // farmBlockReason が STAMINA を返し、そのまま finishBackgroundFarm へ渡る
    expect(processBody).toContain("finishBackgroundFarm(job, blocked)");
  });
});

describe("自動周回中の手動プレイ", () => {
  const source = readFileSync(new URL("../src/web/main.ts", import.meta.url), "utf8");

  it.each([
    "function startStage",
    "function startDungeonFloor",
    "function startLevelDungeonTier",
    "function startGoldDungeonFloor",
    "function startAwakeningDepthFloor",
  ])("%s は周回中でも入れる", (header) => {
    const start = source.indexOf(header);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}", start));
    expect(body).not.toContain('backgroundFarmJob?.status === "RUNNING"');
  });

  it("周回の二重起動だけは止める", () => {
    const begin = source.slice(source.indexOf("function beginBackgroundFarm"));
    expect(begin.slice(0, 600)).toContain('currentStatus === "RUNNING"');
  });

  it("1周ごとに最新のスタミナを見る(まとめて前払いしない)", () => {
    const processBody = source.slice(source.indexOf("function processBackgroundFarmOnce"), source.indexOf("function beginBackgroundFarm"));
    expect(processBody).toContain("applyPassiveStaminaRegen(state.player)");
    expect(processBody).toContain("stamina: state.player.stamina");
    expect(processBody).toContain("trySpendStamina(state.player, cost)");
  });

  it("報酬は正式なクリア報酬処理を通す(簡易テーブルを作らない)", () => {
    const processBody = source.slice(source.indexOf("function processBackgroundFarmOnce"), source.indexOf("function beginBackgroundFarm"));
    for (const fn of ["applyStageClearRewards", "applyDungeonClearRewards", "applyLevelDungeonClearRewards"]) {
      expect(processBody).toContain(fn);
    }
  });
});
