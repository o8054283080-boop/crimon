/**
 * 1つの画面を、狙った状態で開いて確かめる。
 *
 * ## なぜ要るか
 *
 * 画面を1つ見るのに、毎回これだけ叩いていた:
 *
 *   常駐サーバを起こす → 画面の大きさを決める → 開く → STARTを押す →
 *   DEVの引き出しを開く → 手持ちを盛る → 装備を配る → 編成に入れる →
 *   タブを押す → 一覧の枠を押す → 撮る → 画像を読む
 *
 * **10回以上のやり取りが、1画面を見るたびに要る。**しかも保存データの作り方が
 * その場しのぎなので、前回と同じ条件を再現できない(「★6装備の時はどうだったか」
 * を確かめ直せない)。ここはそれを1行にまとめる。
 *
 * ## 使い方
 *
 *   npx tsx tools/scene.mts --list                     どの画面と状態が指定できるか
 *   npx tsx tools/scene.mts tower --state maxed        塔の画面を、育て切った状態で
 *   npx tsx tools/scene.mts training --state maxed     強化画面
 *   npx tsx tools/scene.mts home --state fresh --size 横
 *   npx tsx tools/scene.mts tower --state tower-mid --shot out.png
 *
 * 画像は `--shot` を付けた時だけ撮る。**既定では撮らない。**
 * 機械で拾える崩れは文字で出るので、そちらで足りる時に画像を読むのは
 * 時間とトークンの無駄になる。目で見たい時だけ付けること。
 */
import { EQUIP_SLOTS, generateEquipment } from "../src/core/equipment.js";
import { createMonsterInstance } from "../src/core/monsterInstance.js";
import { STAR_MAX_LEVEL, Star } from "../src/core/rarity.js";
import { MONSTER_TEMPLATES } from "../src/data/monsters.js";
import { ELEMENTS } from "../src/core/element.js";
import {
  MAX_TOWER_PARTY_SIZE,
  PlayerState,
  addEquipment,
  createInitialState,
  equipToMonster,
} from "../src/game/playerState.js";
// @ts-expect-error -- 素のJSの道具。型定義は無いが中身は文字列1つ
import { INSPECT } from "./lib/inspect.mjs";

const PORT = process.env.HARNESS_PORT ?? "5391";

async function call(command: string, body: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${PORT}/${command}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/* ============================================================
 * 保存データの雛形
 *
 * **同じ条件をいつでも作り直せることが要点。**その場でDEVの引き出しを
 * 押して作ると、前回と同じ状態にならず、前後の比較が成り立たない。
 * ここはゲーム本体の関数で組み立てるので、本物と同じ形になる。
 * ============================================================ */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 通常モンスターを全種そろえ、指定の星・レベル・装備で仕上げる */
function stock(state: PlayerState, star: Star, gear: Star | null, seed = 7): void {
  const rng = mulberry32(seed);
  state.monsters = [];
  state.equipment = [];
  for (const template of MONSTER_TEMPLATES) {
    for (const element of ELEMENTS) {
      const instance = createMonsterInstance(`${template.templateId}_${element}`, star, STAR_MAX_LEVEL[star]);
      state.monsters.push(instance);
      if (!gear) continue;
      for (const slot of EQUIP_SLOTS) {
        const equipment = generateEquipment({ slot, star: gear, subStatCount: 3, rng });
        addEquipment(state, equipment);
        equipToMonster(state, instance.id, equipment.id);
      }
    }
  }
}

/** 先頭から何体かを、それぞれの編成へ入れる */
function fillParties(state: PlayerState): void {
  const ids = state.monsters.map((m) => m.id);
  state.partyIds = ids.slice(0, 4);
  state.dungeonPartyIds = ids.slice(0, MAX_TOWER_PARTY_SIZE);
  state.towerPartyIds = ids.slice(0, MAX_TOWER_PARTY_SIZE);
}

const STATES: Record<string, { note: string; build: () => PlayerState }> = {
  fresh: {
    note: "始めたばかり(★1が4体・装備なし)",
    build: () => createInitialState(),
  },
  mid: {
    note: "育成の途中(★4 全種・★3装備)",
    build: () => {
      const s = createInitialState();
      stock(s, 4, 3);
      fillParties(s);
      s.gold = 200_000;
      s.crystal = 5_000;
      s.stamina = s.maxStamina = 500;
      return s;
    },
  },
  maxed: {
    note: "育て切った状態(★6 Lv60 全種・★6装備・資源潤沢)",
    build: () => {
      const s = createInitialState();
      stock(s, 6, 6);
      fillParties(s);
      s.gold = 9_000_000;
      s.crystal = 90_000;
      s.summonScrolls = 50;
      s.stamina = s.maxStamina = 900;
      s.fighterLevel = 50;
      return s;
    },
  },
  "tower-mid": {
    note: "塔の登坂の途中(14階・1体が倒れ、2体が半分以下)",
    build: () => {
      const s = STATES.maxed.build();
      const members = s.towerPartyIds.map((id, i) => ({
        instanceId: id,
        // -1 は満タンの印。倒れているものは 0
        hp: i === 0 ? 0 : i < 3 ? 4200 : -1,
        cooldowns: [0, i, 0] as [number, number, number],
      }));
      s.trialTowerBestFloor = 12;
      s.trialTowerClaimedFloors = Array.from({ length: 13 }, (_, i) => i + 1);
      s.trialTowerRun = { floor: 14, members };
      return s;
    },
  },
  "no-party": {
    note: "編成が空(挑めない時の見た目を確かめる用)",
    build: () => {
      const s = STATES.maxed.build();
      s.partyIds = [];
      s.dungeonPartyIds = [];
      s.towerPartyIds = [];
      return s;
    },
  },
  "no-stamina": {
    note: "スタミナ切れ",
    build: () => {
      const s = STATES.maxed.build();
      s.stamina = 0;
      return s;
    },
  },
};

/* ============================================================
 * 画面
 *
 * タブと一覧の枠は `data-tour` の印で辿る。巡回(tour.mjs)と同じ道なので、
 * 印を消すと両方が同時に壊れる ―― それは意図した縛りで、
 * **画面への行き方が1本しかない**ことを保つためのもの。
 * ============================================================ */
interface Scene {
  tab: string;
  tile?: string;
  /** 着いた後に押すボタン(文言の先頭一致) */
  then?: string;
  note: string;
}

const SCENES: Record<string, Scene> = {
  home: { tab: "HOME", note: "ホーム" },
  stages: { tab: "STAGES", note: "ステージ一覧" },
  monsters: { tab: "MONSTERS", note: "所持モンスター" },
  equipment: { tab: "EQUIPMENT", note: "装備一覧" },
  party: { tab: "PARTY", note: "パーティ編成" },
  summon: { tab: "HOME", tile: "summon", note: "召喚" },
  shop: { tab: "HOME", tile: "shop", note: "ショップ" },
  "equip-dungeon": { tab: "HOME", tile: "equipDungeon", note: "装備ダンジョン" },
  "level-dungeon": { tab: "HOME", tile: "trainDungeon", note: "育成ダンジョン" },
  "gold-dungeon": { tab: "HOME", tile: "goldDungeon", note: "ゴールドダンジョン" },
  arena: { tab: "HOME", tile: "arena", note: "アリーナ" },
  tower: { tab: "HOME", tile: "tower", note: "試練の塔" },
  howto: { tab: "HOME", tile: "info", note: "遊び方" },
  training: { tab: "MONSTERS", then: "モンスター強化", note: "強化の素材選び(モンスターを1体選んでから)" },
  rankup: { tab: "MONSTERS", then: "ランクアップ", note: "ランクアップの素材選び(モンスターを1体選んでから)" },
};

const SIZES: Record<string, { width: number; height: number }> = {
  縦: { width: 390, height: 844 },
  縦大: { width: 430, height: 932 },
  横: { width: 900, height: 430 },
};

/* ============================================================ */

function usage(): void {
  console.log("\n=== 指定できる画面 ===");
  for (const [key, s] of Object.entries(SCENES)) console.log(`  ${key.padEnd(16)} ${s.note}`);
  console.log("\n=== 指定できる状態(--state)===");
  for (const [key, s] of Object.entries(STATES)) console.log(`  ${key.padEnd(16)} ${s.note}`);
  console.log("\n=== 画面の大きさ(--size)===");
  console.log("  縦 (390x844) / 縦大 (430x932) / 横 (900x430)  ※既定は縦\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--list") || args.length === 0) return usage();

  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const sceneKey = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true) ?? args[0];
  const scene = SCENES[sceneKey];
  if (!scene) {
    console.error(`そんな画面はありません: ${sceneKey}`);
    return usage();
  }

  const stateKey = valueOf("--state") ?? "maxed";
  const state = STATES[stateKey];
  if (!state) {
    console.error(`そんな状態はありません: ${stateKey}`);
    return usage();
  }

  const size = SIZES[valueOf("--size") ?? "縦"];
  const shotPath = valueOf("--shot");

  const health = await call("health").catch(() => null);
  if (!health?.ok) {
    console.error(`常駐サーバへ繋がりません(ポート${PORT})。先に \`node tools/harness.mjs\` を起動してください。`);
    process.exit(1);
  }

  // 1. 保存データを差し込んでから開く。開いてから差し込むと、
  //    起動時のログインボーナスや控えの移行がもう一度走って条件がぶれる
  await call("size", size);
  await call("goto", { path: "/", fresh: true, ...size });
  const save = JSON.stringify(state.build());
  await call("eval", {
    expression: `(() => {
      localStorage.setItem("crimon_save_v1", ${JSON.stringify(save)});
      localStorage.setItem("crimon_monster_list_dense_v1", ${args.includes("--dense") ? '"1"' : '"0"'});
      return "ok";
    })()`,
  });
  await call("goto", { path: "/", ...size });

  // 2. タイトルを抜けて、目当ての画面まで進む
  const moved = await call("eval", {
    expression: `(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      document.querySelector(".title-start")?.click();
      await wait(900);
      const tab = document.querySelector('[data-tour="tab:${scene.tab}"]');
      if (!tab) return "タブが無い: ${scene.tab}";
      tab.click();
      await wait(300);
      ${
        scene.tile
          ? `const tile = document.querySelector('[data-tour="tile:${scene.tile}"]');
             if (!tile) return "一覧の枠が無い: ${scene.tile}";
             tile.click();
             await wait(400);`
          : ""
      }
      ${
        scene.then
          ? `const card = document.querySelector(".mcard");
             if (card) { card.click(); await wait(400); }
             const want = ${JSON.stringify(scene.then)};
             const btn = [...document.querySelectorAll("button")].find(b => b.textContent.trim().startsWith(want));
             if (!btn) return "ボタンが無い: " + want;
             btn.click();
             await wait(400);`
          : ""
      }
      return "ok";
    })()`,
  });

  if (moved.value !== "ok") {
    console.error(`画面まで進めませんでした: ${moved.value ?? moved.error}`);
    process.exit(1);
  }

  // 素材画面は1体選んだ状態も撮り、金枠・暗幕・✓が小型カードでも読めるか見る。
  if (sceneKey === "training" || sceneKey === "rankup") {
    await call("eval", {
      expression: `(async () => {
        document.querySelector('.monster-grid .mcard')?.click();
        await new Promise(r => setTimeout(r, 300));
        return document.querySelectorAll('.monster-grid .mcard--selected').length;
      })()`,
    });
  }

  // 3. 機械で拾える崩れを見る
  const inspected = await call("eval", { expression: INSPECT });
  const runtime = (await call("problems")).problems ?? [];
  const problems = [...(inspected.value?.problems ?? []), ...runtime];

  const gridMetrics = await call("eval", {
    expression: `(() => {
      const cards = [...document.querySelectorAll('.monster-grid .mcard')];
      if (!cards.length) return null;
      const rects = cards.map(card => card.getBoundingClientRect());
      const firstTop = rects[0].top;
      const columns = rects.filter(rect => Math.abs(rect.top - firstTop) < 2).length;
      return {
        columns,
        cardWidth: Math.round(rects[0].width),
        cardHeight: Math.round(rects[0].height),
        dense: cards[0].classList.contains('mcard--dense'),
      };
    })()`,
  });

  console.log(`\n${scene.note} / ${state.note} / ${valueOf("--size") ?? "縦"}(${size.width}x${size.height})`);
  console.log(problems.length === 0 ? "  機械で拾える崩れ: 無し" : `  指摘 ${problems.length}件:`);
  for (const p of problems) console.log(`    ！ ${p}`);
  if (gridMetrics.value) console.log(`  一覧: ${gridMetrics.value.columns}列 / カード ${gridMetrics.value.cardWidth}x${gridMetrics.value.cardHeight}px / ${gridMetrics.value.dense ? "簡易" : "通常"}`);

  if (shotPath) {
    await call("shot", { path: shotPath.startsWith("/") ? shotPath : `${process.cwd()}/${shotPath}` });
    console.log(`  画像: ${shotPath}`);
  } else {
    console.log("  ※ 目で見たい時は --shot <path> を付けてください");
  }
  console.log("");

  process.exit(problems.length > 0 ? 2 : 0);
}

void main();
