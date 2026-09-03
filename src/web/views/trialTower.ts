import "../ui/trialTower.css";
import { MonsterInstance } from "../../core/monsterInstance.js";
import { DungeonEnemy } from "../../data/equipmentDungeon.js";
import { findMonster, findMonsterById } from "../../data/monsters.js";
import {
  TOWER_CHECKPOINT_INTERVAL,
  TOWER_FLOOR_COUNT,
  TOWER_STAMINA_COST,
  TRIAL_TOWER_FLOORS,
  TowerFloor,
  TowerReward,
  findTowerFloor,
  isTowerBossFloor,
  isTowerCheckpoint,
} from "../../data/trialTower.js";
import { MAX_TOWER_PARTY_SIZE, PlayerState } from "../../game/playerState.js";
import { TowerRewardResult } from "../../game/trialTower.js";
import { el } from "../dom.js";
import { withPortrait } from "../three/portrait.js";

/**
 * 試練の塔の画面。
 *
 * 他のダンジョンと決定的に違うのは「HPとクールタイムを次の階へ持ち越す」ことなので、
 * 画面の主役も**残量**に置く。何階まで登ったか、今の顔ぶれがどれだけ削られているか。
 * 敵の顔ぶれや報酬は、その判断を裏付ける材料として下に置く。
 */

export interface TrialTowerProps {
  /** 最高到達階(0 = まだ一度も越えていない) */
  bestFloor: number;
  /** 次に挑む階 */
  nextFloor: number;
  /** 登坂の途中なら、その顔ぶれの今の状態。null なら登坂していない */
  run: {
    floor: number;
    members: { instanceId: string; name: string; dexId: string; hp: number; maxHp: number; fallen: boolean }[];
  } | null;
  /** 塔の編成(最大5体) */
  party: MonsterInstance[];
  player: PlayerState;
  /** 初回到達報酬を受け取り済みの階 */
  claimedFloors: number[];
  /** 挑めない理由。null なら挑める */
  blockedReason: string | null;
  /** 塔の画面に出す案内(スタミナ切れ・編成が空など)。null なら出さない */
  notice: string | null;
  /**
   * 直前の階の決着。**戦闘から塔の画面へ戻ってきた理由**を伝えるためのもの。
   * null なら、ただ塔を開いただけ。
   */
  outcome: {
    kind: "CHECKPOINT" | "WIPED" | "COMPLETED" | "PAUSED";
    /** その決着がついた階 */
    floor: number;
    reward: TowerRewardResult;
  } | null;
  /** outcome の知らせを閉じる */
  onDismissOutcome: () => void;
  onEditParty: () => void;
  /** 次の階へ挑む(登坂の開始も継続もこれ) */
  onChallenge: () => void;
  /** 登坂をやめる(途中経過を捨てて節からやり直しになる) */
  onAbandon: () => void;
  onBack: () => void;
}

function renderMonthlyRewards(props: TrialTowerProps): HTMLElement {
  const rewardRow = (floor: 15 | 30) => {
    const claimed = props.player.trialTowerMonthlyOrbClaimedFloors.includes(floor);
    return el("div", { className: `tower-monthly__row${claimed ? " is-claimed" : ""}` }, [
      el("span", { className: "tower-monthly__floor" }, [`${floor}階`]),
      el("span", { className: "tower-monthly__reward" }, ["🔮 覚醒オーブ ×1"]),
      el("span", { className: "tower-monthly__status" }, [claimed ? "受取済み" : "未受取"]),
    ]);
  };
  return el("section", { className: "panel tower-monthly" }, [
    el("div", { className: "tower-monthly__head" }, [
      el("h2", {}, ["今月の報酬"]),
      el("span", { className: "tower-monthly__season" }, [props.player.trialTowerSeason]),
    ]),
    rewardRow(15),
    rewardRow(30),
    el("p", { className: "tower-monthly__reset" }, ["毎月1日 00:00（JST）リセット"]),
  ]);
}

/** 塔の編成に入れられる上限 */


function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((n): n is HTMLElement => n !== null);
}

/**
 * 星は「★6」と数で書く。
 *
 * ★を6個並べると、編成の小さな枠でも敵の札でも横幅を食い、
 * 実際に ★6 が ★★★★(4個)に切り詰められて出ていた。
 * **星の数が見た目で減る**のは、HPが桁落ちしたのと同じ種類の嘘になる。
 */
function starText(star: number): string {
  return `★${star}`;
}

/* ============================================================
 * 報酬の見せ方
 * ============================================================ */

interface RewardItem {
  icon: string;
  text: string;
  /** 金の札にするか(素材・装備など「物」だけ強調する) */
  strong?: boolean;
}

/**
 * 報酬を並びへ崩す。
 *
 * 塔の初回報酬は**確定**なので、中身も数量もそのまま出してよい
 * (伏せるのは抽選の確率であって、確定で渡すものではない)。
 */
function rewardItems(reward: TowerReward): RewardItem[] {
  const items: RewardItem[] = [];
  if (reward.crystal) items.push({ icon: "💎", text: reward.crystal.toLocaleString("ja-JP") });
  if (reward.gold) items.push({ icon: "🪙", text: reward.gold.toLocaleString("ja-JP") });
  if (reward.summonScroll) items.push({ icon: "📜", text: `召喚の書 ${reward.summonScroll}`, strong: true });
  if (reward.equipmentStar) items.push({ icon: "⚔", text: `${starText(reward.equipmentStar)} 装備`, strong: true });
  if (reward.pigStar) items.push({ icon: "🐷", text: `転生ピッグ ${starText(reward.pigStar)}`, strong: true });
  if (reward.awakeningOrbs) items.push({ icon: "🔮", text: `覚醒オーブ ${reward.awakeningOrbs}`, strong: true });
  if (reward.fourStarSummonScrolls) items.push({ icon: "📕", text: `★4以上召喚書 ${reward.fourStarSummonScrolls}`, strong: true });
  if (reward.lightDarkFourStarSummonScrolls) items.push({ icon: "🌗", text: `光闇★4以上召喚書 ${reward.lightDarkFourStarSummonScrolls}`, strong: true });
  if (reward.fiveStarSummonScrolls) items.push({ icon: "📙", text: `★5召喚書 ${reward.fiveStarSummonScrolls}`, strong: true });
  if (reward.skillPigs) items.push({ icon: "🐽", text: `スキルピッグ ${reward.skillPigs}`, strong: true });
  return items;
}

function renderRewardChips(reward: TowerReward): HTMLElement {
  return el(
    "div",
    { className: "tower-rewards" },
    rewardItems(reward).map((item) =>
      el("span", { className: `tower-reward${item.strong ? " tower-reward--strong" : ""}` }, [
        el("span", { className: "tower-reward__icon" }, [item.icon]),
        el("span", { className: "tower-reward__text" }, [item.text]),
      ]),
    ),
  );
}

/** 実際に受け取ったものを並びへ崩す。**空なら空配列**(空欄の枠を出さないため) */
function claimedItems(reward: TowerRewardResult): RewardItem[] {
  const items: RewardItem[] = [];
  if (reward.crystal > 0) items.push({ icon: "💎", text: reward.crystal.toLocaleString("ja-JP") });
  if (reward.gold > 0) items.push({ icon: "🪙", text: reward.gold.toLocaleString("ja-JP") });
  if (reward.summonScrolls > 0) items.push({ icon: "📜", text: `召喚の書 ${reward.summonScrolls}`, strong: true });
  if (reward.equipment) items.push({ icon: "⚔", text: `${starText(reward.equipment.star)} 装備`, strong: true });
  if (reward.pigStar) items.push({ icon: "🐷", text: `転生ピッグ ${starText(reward.pigStar)}`, strong: true });
  if (reward.awakeningOrbs > 0) items.push({ icon: "🔮", text: `覚醒オーブ ${reward.awakeningOrbs}`, strong: true });
  if (reward.fourStarSummonScrolls > 0) items.push({ icon: "📕", text: `★4以上召喚書 ${reward.fourStarSummonScrolls}`, strong: true });
  if (reward.lightDarkFourStarSummonScrolls > 0) items.push({ icon: "🌗", text: `光闇★4以上召喚書 ${reward.lightDarkFourStarSummonScrolls}`, strong: true });
  if (reward.fiveStarSummonScrolls > 0) items.push({ icon: "📙", text: `★5召喚書 ${reward.fiveStarSummonScrolls}`, strong: true });
  if (reward.skillPigs > 0) items.push({ icon: "🐽", text: `スキルピッグ ${reward.skillPigs}`, strong: true });
  return items;
}

/* ============================================================
 * 戻ってきた理由
 *
 * 節を越えたのと力尽きたのを同じ見た目にすると、次に何をすればいいのか
 * 分からないまま同じボタンだけが残る。4つは別の面として書き分ける。
 * ============================================================ */

function renderOutcome(props: TrialTowerProps): HTMLElement | null {
  const outcome = props.outcome;
  if (!outcome) return null;

  const kind = outcome.kind;
  const checkpoint = Math.floor(props.bestFloor / TOWER_CHECKPOINT_INTERVAL) * TOWER_CHECKPOINT_INTERVAL;

  const copy: Record<typeof kind, { icon: string; title: string; lines: string[] }> = {
    COMPLETED: {
      icon: "👑",
      title: "塔を登り切りました",
      lines: [`${TOWER_FLOOR_COUNT}階すべてを踏破しました。`, "もう一度、下から登り直すこともできます。"],
    },
    CHECKPOINT: {
      icon: "⚑",
      title: `${outcome.floor}階の節を越えました`,
      lines: ["倒れた仲間が戻り、全員が全回復しました。", `次はここから、${props.nextFloor}階として登り始められます。`],
    },
    WIPED: {
      icon: "🕯",
      title: `${outcome.floor}階で力尽きました`,
      lines: [
        checkpoint > 0
          ? `${checkpoint}階の節までの到達は消えていません。`
          : "到達した階の記録は消えていません。",
        `次は${props.nextFloor}階から、全回復した状態で登り直せます。`,
      ],
    },
    PAUSED: {
      icon: "⏸",
      title: "登坂を中断しました",
      lines: ["削られたHPも待ち時間もそのまま残っています。", `${props.nextFloor}階から続きに入れます。`],
    },
  };

  const text = copy[kind];
  const items = claimedItems(outcome.reward);

  return el("section", { className: `tower-outcome tower-outcome--${kind.toLowerCase()}` }, nodes([
    el("div", { className: "tower-outcome__head" }, [
      el("span", { className: "tower-outcome__icon" }, [text.icon]),
      el("span", { className: "tower-outcome__title" }, [text.title]),
    ]),
    el("div", { className: "tower-outcome__lines" }, text.lines.map((line) => el("p", {}, [line]))),
    // 報酬は中身がある時だけ。空の枠が残ると、負けた画面に「獲得なし」が飾られる
    items.length > 0
      ? el("div", { className: "tower-outcome__reward" }, [
          el("span", { className: "tower-outcome__reward-label" }, ["受け取りました"]),
          el(
            "div",
            { className: "tower-rewards" },
            items.map((item) =>
              el("span", { className: `tower-reward${item.strong ? " tower-reward--strong" : ""}` }, [
                el("span", { className: "tower-reward__icon" }, [item.icon]),
                el("span", { className: "tower-reward__text" }, [item.text]),
              ]),
            ),
          ),
        ])
      : null,
    el(
      "button",
      { type: "button", className: "btn tower-outcome__close", onclick: props.onDismissOutcome },
      ["閉じる"],
    ),
  ]));
}

/* ============================================================
 * 主役:今どこにいるか
 * ============================================================ */

/**
 * 到達階と次の階。
 *
 * 数字を2つ並べるだけだと「12」と「13」が同じ重さに見えて、どちらが実績で
 * どちらが行き先なのか読めない。到達階を刻印として大きく置き、
 * 次の階はその下に矢印付きの行き先として添える。
 */
function renderHero(props: TrialTowerProps): HTMLElement {
  const { bestFloor, nextFloor } = props;
  const ratio = Math.max(0, Math.min(1, bestFloor / TOWER_FLOOR_COUNT));
  const cleared = bestFloor >= TOWER_FLOOR_COUNT;
  const nextDef = findTowerFloor(nextFloor);
  const checkpoint = Math.floor(bestFloor / TOWER_CHECKPOINT_INTERVAL) * TOWER_CHECKPOINT_INTERVAL;

  // 節の目盛り。10階ごとにどこで全回復できるかを帯の上へ刻む
  const notches = Array.from({ length: Math.floor(TOWER_FLOOR_COUNT / TOWER_CHECKPOINT_INTERVAL) }, (_, i) => {
    const floor = (i + 1) * TOWER_CHECKPOINT_INTERVAL;
    return el(
      "span",
      {
        className: `tower-hero__notch${bestFloor >= floor ? " is-passed" : ""}`,
        style: `left:${((floor / TOWER_FLOOR_COUNT) * 100).toFixed(2)}%`,
      },
      [],
    );
  });

  return el("section", { className: `tower-hero${cleared ? " tower-hero--complete" : ""}` }, [
    el("div", { className: "tower-hero__glyph" }, ["🏯"]),
    el("div", { className: "tower-hero__label" }, ["最高到達"]),
    el("div", { className: "tower-hero__best" }, [
      el("span", { className: "tower-hero__num" }, [String(bestFloor)]),
      el("span", { className: "tower-hero__unit" }, ["階"]),
      el("span", { className: "tower-hero__total" }, [`/ ${TOWER_FLOOR_COUNT}`]),
    ]),
    el("div", { className: "tower-hero__track" }, [
      el("div", { className: "tower-hero__fill", style: `width:${(ratio * 100).toFixed(1)}%` }, []),
      ...notches,
    ]),
    el("div", { className: "tower-hero__resume" }, [
      checkpoint > 0 ? `${checkpoint}階の節から再開できます` : "まだ節を越えていません",
    ]),
    el("div", { className: "tower-hero__next" }, [
      el("span", { className: "tower-hero__arrow" }, ["▲"]),
      el("span", { className: "tower-hero__next-label" }, [props.run ? "登坂中 — 次は" : "次に挑む"]),
      el("span", { className: "tower-hero__next-floor" }, [`${nextFloor}階`]),
      nextDef && isTowerBossFloor(nextFloor)
        ? el("span", { className: "tower-tag tower-tag--boss" }, ["関門"])
        // **傾向からではなく階の名札を出す。**傾向は5種類しかないので、
        // 51階以降の「妨害」「鉄壁」を名乗れず、加速の階が「疾風の階」と出ていた
        : nextDef && nextDef.label
          ? el("span", { className: "tower-tag" }, [nextDef.label])
          : null,
    ].filter((n): n is HTMLElement => n !== null)),
  ]);
}

/**
 * 塔がどういう場所かの説明。
 *
 * ここが他と違うのは2点だけ。長く書くほど読まれないので、2行に絞る。
 */
function renderRules(): HTMLElement {
  const rows: [string, string, string][] = [
    ["🩸", "持ち越し", "HPとスキルの待ち時間は次の階へ引き継ぎます。階の間に回復はありません。"],
    ["⚑", "節", `${TOWER_CHECKPOINT_INTERVAL}階ごとの節を越えると全回復。倒れた仲間が戻るのもそこまでです。`],
  ];
  return el(
    "section",
    { className: "tower-rules" },
    rows.map(([icon, title, body]) =>
      el("div", { className: "tower-rule" }, [
        el("span", { className: "tower-rule__icon" }, [icon]),
        el("span", { className: "tower-rule__body" }, [
          el("b", { className: "tower-rule__title" }, [title]),
          el("span", { className: "tower-rule__text" }, [body]),
        ]),
      ]),
    ),
  );
}

/* ============================================================
 * 登坂中の顔ぶれ
 * ============================================================ */

/**
 * 登坂中の一行。
 *
 * **HPの数字は札の中へ押し込まない。**過去に5桁のHPが枠からはみ出して
 * `16317/23440` が `6317/2344` に化け、現在値が最大値より大きいという
 * 有り得ない表示になっている。名前とは別の行に、折り返さない帯として置く。
 */
type TowerRunMember = NonNullable<TrialTowerProps["run"]>["members"][number];

function renderRunMember(member: TowerRunMember): HTMLElement {
  const dex = findMonsterById(member.dexId);
  const maxHp = Math.max(1, member.maxHp);
  const ratio = member.fallen ? 0 : Math.max(0, Math.min(1, member.hp / maxHp));
  const tone = member.fallen ? "down" : ratio > 0.5 ? "high" : ratio > 0.25 ? "mid" : "low";

  return el("div", { className: `tower-member${member.fallen ? " tower-member--fallen" : ""}` }, [
    el("span", { className: "tower-member__face" }, [
      withPortrait(el("span", { className: "tower-member__emoji" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      member.fallen ? el("span", { className: "tower-member__cross" }, ["✕"]) : null,
    ].filter((n): n is HTMLElement => n !== null)),
    el("span", { className: "tower-member__body" }, [
      el("span", { className: "tower-member__top" }, [
        el("span", { className: "tower-member__name" }, [member.name]),
        el("span", { className: `tower-member__state tower-member__state--${tone}` }, [
          member.fallen ? "戦闘不能" : `${Math.round(ratio * 100)}%`,
        ]),
      ]),
      el("span", { className: "tower-member__bar", "data-tone": tone }, [
        el("span", { className: "tower-member__fill", style: `width:${(ratio * 100).toFixed(1)}%` }, []),
      ]),
      el("span", { className: "tower-member__hp" }, [
        member.fallen
          ? `節まで戻りません`
          : `${Math.round(member.hp).toLocaleString("ja-JP")} / ${Math.round(maxHp).toLocaleString("ja-JP")}`,
      ]),
    ]),
  ]);
}

function renderRun(props: TrialTowerProps): HTMLElement | null {
  const run = props.run;
  if (!run) return null;
  const standing = run.members.filter((m) => !m.fallen);

  return el("section", { className: "panel tower-run" }, [
    el("div", { className: "tower-run__head" }, [
      el("h2", {}, ["登坂中の顔ぶれ"]),
      el("span", { className: `tower-run__count${standing.length <= 1 ? " is-thin" : ""}` }, [
        `${standing.length} / ${run.members.length} 体`,
      ]),
    ]),
    el("div", { className: "tower-run__list" }, run.members.map(renderRunMember)),
  ]);
}

/* ============================================================
 * 次の階の中身
 * ============================================================ */

/**
 * 敵の札に出す名前。
 *
 * **階が名前を持っていればそれを使う。**60階の3体は図鑑の見た目を借りているだけで、
 * 技もステータスも別物なので、図鑑名で出すと「古代の魔人[闇]」と表示され、
 * 戦闘中の「古代の豪魔人」と食い違う。名札が2つある敵はいない
 */
function enemyName(enemy: DungeonEnemy): string {
  return enemy.displayName ?? findMonster(enemy.templateId, enemy.element)?.name ?? enemy.templateId;
}

function renderEnemy(enemy: DungeonEnemy): HTMLElement {
  const dex = findMonster(enemy.templateId, enemy.element);
  return el(
    "span",
    {
      className: `tower-enemy${enemy.isBoss ? " tower-enemy--boss" : ""}`,
      style: dex ? `--elem:${dex.color}` : undefined,
    },
    [
      el("span", { className: "tower-enemy__icon" }, [
        withPortrait(el("span", { className: "tower-enemy__emoji" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      ]),
      el("span", { className: "tower-enemy__body" }, [
        el("span", { className: "tower-enemy__name" }, [`${enemy.isBoss ? "👑 " : ""}${enemyName(enemy)}`]),
        el("span", { className: "tower-enemy__meta" }, [
          `${starText(enemy.star)} Lv${enemy.level}`,
        ]),
      ]),
    ],
  );
}

function renderNextFloor(props: TrialTowerProps, floor: TowerFloor): HTMLElement {
  const boss = isTowerBossFloor(floor.floor);
  const check = isTowerCheckpoint(floor.floor);
  const claimed = props.claimedFloors.includes(floor.floor);
  const note = floor.note;

  return el("section", { className: `panel tower-floor${boss ? " tower-floor--boss" : ""}` }, nodes([
    el("div", { className: "tower-floor__head" }, nodes([
      el("span", { className: "tower-floor__no" }, [`${floor.floor}階`]),
      boss ? el("span", { className: "tower-tag tower-tag--boss" }, ["関門"]) : null,
      !boss && floor.label
        ? el("span", { className: "tower-tag" }, [floor.label])
        : null,
      check ? el("span", { className: "tower-tag tower-tag--check" }, ["節"]) : null,
    ])),
    note ? el("p", { className: "tower-floor__note" }, [note]) : null,
    boss ? el("p", { className: "tower-floor__note" }, ["塔の主が待っています。お供を連れて出てきます。"]) : null,
    check
      ? el("p", { className: "tower-floor__note tower-floor__note--check" }, [
          "越えると全員が全回復し、次はここから登り直せます。",
        ])
      : null,
    el("div", { className: "tower-floor__enemies" }, floor.enemies.map(renderEnemy)),
    el("div", { className: "tower-floor__reward" }, nodes([
      el("span", { className: "tower-floor__reward-label" }, [claimed ? "初回報酬(受取済み)" : "初回到達報酬"]),
      renderRewardChips(floor.firstClearReward),
    ])),
  ]));
}

/* ============================================================
 * 挑戦
 * ============================================================ */

function renderChallenge(props: TrialTowerProps): HTMLElement {
  const done = props.bestFloor >= TOWER_FLOOR_COUNT && !props.run;
  const label = props.run ? `${props.nextFloor}階へ進む` : `${props.nextFloor}階から登る`;

  /*
   * 誰も連れていないなら、押すべきものは「挑む」ではなく「編成する」。
   * 灰色の挑戦ボタンを主役に据えても、次にどこへ行けばいいのかが分からない。
   */
  if (props.party.length === 0) {
    return el("section", { className: "tower-cta" }, [
      el("p", { className: "tower-cta__warn" }, ["塔へ連れて行く顔ぶれがまだ決まっていません。"]),
      el(
        "button",
        { type: "button", className: "btn btn--gold btn--large tower-cta__go", onclick: props.onEditParty },
        [el("span", { className: "tower-cta__go-label" }, ["塔の編成を組む"])],
      ),
    ]);
  }

  return el("section", { className: "tower-cta" }, nodes([
    props.blockedReason ? el("p", { className: "tower-cta__warn" }, [props.blockedReason]) : null,
    done ? el("p", { className: "tower-cta__done" }, ["塔を登り切りました。もう一度登ることもできます。"]) : null,
    el(
      "button",
      {
        type: "button",
        className: "btn btn--gold btn--large tower-cta__go",
        disabled: props.blockedReason !== null,
        onclick: props.onChallenge,
      },
      [
        el("span", { className: "tower-cta__go-label" }, [label]),
        el("span", { className: "tower-cta__go-cost" }, [`⚡${TOWER_STAMINA_COST}`]),
      ],
    ),
  ]));
}

/* ============================================================
 * 編成
 * ============================================================ */

function renderParty(props: TrialTowerProps): HTMLElement {
  const locked = props.run !== null;
  const slots = Array.from({ length: MAX_TOWER_PARTY_SIZE }, (_, i) => {
    const instance = props.party[i];
    if (!instance) return el("div", { className: "tower-slot tower-slot--empty" }, ["＋"]);
    const dex = findMonsterById(instance.dexId);
    return el("div", { className: "tower-slot", style: dex ? `--elem:${dex.color}` : undefined }, [
      withPortrait(el("span", { className: "tower-slot__emoji" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      el("span", { className: "tower-slot__foot" }, [
        el("span", { className: "tower-slot__star" }, [starText(instance.star)]),
        el("span", { className: "tower-slot__lv" }, [`Lv${instance.level}`]),
      ]),
    ]);
  });

  return el("section", { className: "panel tower-party" }, [
    el("div", { className: "tower-party__head" }, [
      el("h2", {}, ["塔の編成"]),
      el("span", { className: "tower-party__count" }, [`${props.party.length} / ${MAX_TOWER_PARTY_SIZE}`]),
    ]),
    el("div", { className: "tower-party__slots" }, slots),
    locked
      ? el("p", { className: "tower-party__lock" }, ["🔒 登坂中は編成を変えられません。やめると節から登り直しになります。"])
      : el(
          "button",
          { type: "button", className: "btn btn--ghost tower-party__edit", onclick: props.onEditParty },
          [props.party.length === 0 ? "編成する" : "編成を変える"],
        ),
  ]);
}

/* ============================================================
 * 階の一覧
 * ============================================================ */

function renderLadderTile(props: TrialTowerProps, floor: TowerFloor): HTMLElement {
  const passed = floor.floor <= props.bestFloor;
  const now = floor.floor === props.nextFloor;
  const boss = isTowerBossFloor(floor.floor);
  const check = isTowerCheckpoint(floor.floor);
  const locked = floor.floor > props.nextFloor;

  const classes = [
    "tower-step",
    passed ? "tower-step--passed" : "",
    now ? "tower-step--now" : "",
    boss ? "tower-step--boss" : "",
    check ? "tower-step--check" : "",
    locked ? "tower-step--locked" : "",
  ].filter(Boolean);

  return el(
    "div",
    { className: classes.join(" "), title: `${floor.name}${passed ? "（クリア済み）" : locked ? "（未解放）" : "（次の挑戦）"}`, "aria-label": `${floor.name} ${passed ? "クリア済み" : locked ? "未解放" : "次の挑戦"}` },
    nodes([
      // 節はすべて関門でもある。片方だけ出すと、凡例と食い違って
      // 「10階は関門ではない」と読めてしまうので、両方の印を並べる
      boss || check
        ? el("span", { className: "tower-step__flag" }, [`${boss ? "👑" : ""}${check ? "⚑" : ""}`])
        : null,
      el("span", { className: "tower-step__no" }, [String(floor.floor)]),
      passed ? el("span", { className: "tower-step__check" }, ["✓"]) : null,
      now ? el("span", { className: "tower-step__now" }, ["今"]) : null,
      // 関門の名前(超再生・免疫…)はここには出さない。
      // 1辺30pxの石に入れると7pxまで縮み、実機で読めなかった。
      // 名前は節の見出し(.tower-band__boss)と、この石の title / aria-label が持つ
    ]),
  );
}

function renderLadder(props: TrialTowerProps): HTMLElement {
  const sections = Math.ceil(TOWER_FLOOR_COUNT / TOWER_CHECKPOINT_INTERVAL);
  const blocks: HTMLElement[] = [];
  for (let s = 0; s < sections; s++) {
    const from = s * TOWER_CHECKPOINT_INTERVAL + 1;
    const to = Math.min(TOWER_FLOOR_COUNT, (s + 1) * TOWER_CHECKPOINT_INTERVAL);
    const floors = TRIAL_TOWER_FLOORS.filter((f) => f.floor >= from && f.floor <= to);
    const active = props.nextFloor >= from && props.nextFloor <= to;
    const passed = props.bestFloor >= to;
    const locked = from > props.nextFloor;
    const boss = floors.find((floor) => isTowerBossFloor(floor.floor));
    // 名前を持っている関門だけ出す。**階番号で判定しない**
    // (「関門」しか名乗らない階は、節の見出しに出しても何も伝わらない)
    const bossName = boss && boss.label !== "関門" ? boss.label : "";
    blocks.push(
      el("details", { className: `tower-band${passed ? " is-passed" : ""}${active ? " is-current" : ""}${locked ? " is-locked" : ""}`, open: active }, [
        el("summary", { className: "tower-band__head" }, nodes([
          el("span", { className: "tower-band__name" }, [`第${s + 1}節`]),
          el("span", { className: "tower-band__range" }, [`${from} - ${to}階`]),
          bossName ? el("span", { className: "tower-band__boss" }, [bossName]) : null,
          el("span", { className: "tower-band__status" }, [passed ? "クリア済み" : active ? `次は${props.nextFloor}階` : "未解放"]),
        ])),
        el("div", { className: "tower-band__steps" }, floors.map((f) => renderLadderTile(props, f))),
      ]),
    );
  }

  return el("section", { className: "panel tower-ladder" }, [
    el("h2", {}, ["階の一覧"]),
    el("div", { className: "tower-legend" }, [
      el("span", { className: "tower-legend__item" }, ["✓ 到達済み"]),
      el("span", { className: "tower-legend__item" }, ["👑 関門"]),
      el("span", { className: "tower-legend__item" }, ["⚑ 節(全回復)"]),
      el("span", { className: "tower-legend__item" }, ["今 これから挑む階"]),
      el("span", { className: "tower-legend__item" }, ["暗色 未解放"]),
    ]),
    ...blocks,
  ]);
}

/* ============================================================ */

export function renderTrialTower(props: TrialTowerProps): HTMLElement {
  const floor = findTowerFloor(props.nextFloor);

  return el("div", { className: "screen tower-screen" }, nodes([
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["試練の塔"]),
      el("span", { className: "head-note" }, [`⚡${props.player.stamina}/${props.player.maxStamina}`]),
    ]),
    renderOutcome(props),
    props.notice ? el("div", { className: "tower-notice" }, [props.notice]) : null,
    renderHero(props),
    renderMonthlyRewards(props),
    renderRules(),
    renderRun(props),
    floor ? renderNextFloor(props, floor) : null,
    renderChallenge(props),
    renderParty(props),
    renderLadder(props),
    props.run
      ? el(
          "button",
          { type: "button", className: "btn btn--ghost tower-abandon", onclick: props.onAbandon },
          ["登坂をやめる(節から登り直しになります)"],
        )
      : null,
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onBack }, ["◀ 戻る"]),
  ]));
}
