import { MAX_FIGHTER_LEVEL, requiredExpForFighterLevel } from "../../core/fighterLevel.js";
import {
  getParty,
  LoginBonusResult,
  LOGIN_BONUS_MILESTONE_INTERVAL_DAYS,
  PlayerState,
  STAMINA_REFILL_FULL_COST,
  STAMINA_REFILL_PARTIAL_AMOUNT,
  STAMINA_REFILL_PARTIAL_COST,
} from "../../game/playerState.js";
import { CompensationClaim, compensationBannerLabel, selectHomeBanners } from "../../game/compensation.js";
import { hasCloudRecoveryAccount } from "../../game/cloudRecovery.js";
import { PERSIST_STATE_NOTE, PersistState } from "../../game/saveDurability.js";
import { ELEMENT_JA, ELEMENT_MARK } from "../../core/element.js";
import { MonsterInstance } from "../../core/monsterInstance.js";
import { STAR_MAX_LEVEL } from "../../core/rarity.js";
import { findMonsterById } from "../../data/monsters.js";
import { monsterPower } from "../../game/monsterSort.js";
import { withPortrait } from "../three/portrait.js";
import { partyCardAction } from "../uxHelpers.js";
import { el } from "../dom.js";
import { icon, IconName } from "../icons.js";
import { AudioSettingsProps, renderAudioSettings } from "./audioSettings.js";
import { TUTORIAL_MISSIONS, TutorialDestination, canClaimTutorialMission, nextTutorialMission } from "../../game/tutorialMissions.js";

export interface HomeProps {
  player: PlayerState;
  loginBonusResult: LoginBonusResult | null;
  compensationClaims: CompensationClaim[];
  onDismissCompensation: () => void;
  onDismissLoginBonus: () => void;
  onGoSummon: () => void;
  onGoMonsters: () => void;
  onGoEquipment: () => void;
  onGoMonsterDex: () => void;
  onGoStages: () => void;
  onGoParty: () => void;
  onViewPartyMonster: (instanceId: string) => void;
  onGoEquipDungeon: () => void;
  onGoLevelDungeon: () => void;
  onGoGoldDungeon: () => void;
  /** 目覚の深域(才能覚醒の素材) */
  onGoAwakeningDepth: () => void;
  onGoArena: () => void;
  onGoTrialTower: () => void;
  onGoHowToPlay: () => void;
  onGoShop: () => void;
  onRefillStaminaPartial: () => void;
  onRefillStaminaFull: () => void;
  onEditFighterName: () => void;
  onGoTutorialDestination: (destination: TutorialDestination) => void;
  onClaimTutorial: (id: string) => void;
  audioSettings: AudioSettingsProps;
  onExportSave: () => void;
  onImportSave: (file: File) => void;
  /** ブラウザが勝手に消さない設定になっているか */
  persistState: PersistState;
  /** 前回起動時の控えを取った時刻。無ければ null */
  backupAt: Date | null;
  onRestoreBackup: () => void;
}

export interface HomeTowerSummary {
  floor: number;
  bestFloor: number;
  progress: number;
  isRunning: boolean;
}

/** Old saves can omit tower fields; keep the home useful and the progress bounded. */
export function homeTowerSummary(player: Pick<PlayerState, "trialTowerBestFloor" | "trialTowerRun">): HomeTowerSummary {
  const best = Number.isFinite(player.trialTowerBestFloor) ? Math.max(0, Math.min(100, player.trialTowerBestFloor)) : 0;
  const runFloor = Number.isFinite(player.trialTowerRun?.floor) ? Math.max(1, Math.min(100, player.trialTowerRun!.floor)) : null;
  const floor = runFloor ?? Math.min(100, best + 1);
  return { floor, bestFloor: best, progress: Math.max(0, Math.min(100, best)), isRunning: runFloor !== null };
}

const HOME_STARTED_KEY = "crimon.started";

export function hasStartedHome(storage: Pick<Storage, "getItem"> = sessionStorage): boolean {
  return storage.getItem(HOME_STARTED_KEY) === "1";
}

export function startHome(storage: Pick<Storage, "setItem"> = sessionStorage): void {
  storage.setItem(HOME_STARTED_KEY, "1");
}

export function homeUtilityActions(props: Pick<HomeProps, "onGoArena" | "onGoShop" | "onGoHowToPlay">): readonly (() => void)[] {
  return [props.onGoArena, props.onGoShop, props.onGoHowToPlay];
}

/** Dungeon selection belongs to the Home DOM only; navigation state remains untouched. */
export function dungeonActions(
  props: Pick<HomeProps, "onGoEquipDungeon" | "onGoLevelDungeon" | "onGoGoldDungeon" | "onGoAwakeningDepth">,
): readonly (() => void)[] {
  return [props.onGoEquipDungeon, props.onGoLevelDungeon, props.onGoGoldDungeon, props.onGoAwakeningDepth];
}

export function tutorialMissionActions(
  props: Pick<HomeProps, "onGoTutorialDestination" | "onClaimTutorial">,
  mission: (typeof TUTORIAL_MISSIONS)[number],
): { go: () => void; claim: () => void } {
  return { go: () => props.onGoTutorialDestination(mission.destination), claim: () => props.onClaimTutorial(mission.id) };
}

function renderSaveDataPanel(props: HomeProps): HTMLElement {
  const input = el("input", {
    type: "file",
    accept: "application/json,.json",
    className: "save-data__input",
    onchange: (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) props.onImportSave(file);
      target.value = "";
    },
  }) as HTMLInputElement;

  /*
   * **消え方は2つあって、打てる手が違う。**それを分けて書く。
   * 一緒くたに「消えることがあります」とだけ書いても、何をすればいいのか分からない。
   */
  const rows: HTMLElement[] = [
    el("p", { className: "save-data__warning" }, [
      "このゲームのデータは、この端末のブラウザの中だけに保存されています。ブラウザの履歴やサイトデータを削除すると、いっしょに消えてしまいます。ときどき書き出して控えを取っておいてください。",
    ]),
    el("p", { className: "save-data__note" }, [PERSIST_STATE_NOTE[props.persistState]]),
  ];

  // 前回起動時の状態。読み込みを間違えた時・操作を間違えた時に戻れる
  if (props.backupAt) {
    rows.push(
      el("p", { className: "save-data__note" }, [
        `前回このアプリを開いた時の控えがあります(${props.backupAt.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })})。`,
      ]),
    );
  }

  return el("section", { className: "panel save-data" }, [
    el("div", { className: "panel-header" }, [el("h2", {}, ["データの控え"])]),
    ...rows,
    el("div", { className: "save-data__actions" }, [
      el("button", { type: "button", className: "btn btn--primary", onclick: props.onExportSave }, ["⬇ データを書き出す"]),
      el("button", { type: "button", className: "btn btn--ghost", onclick: () => input.click() }, ["⬆ データを読み込む"]),
      input,
    ]),
    props.backupAt
      ? el("button", { type: "button", className: "btn btn--ghost save-data__restore", onclick: props.onRestoreBackup }, [
          "↩ 前回起動時の状態に戻す",
        ])
      : null,
  ].filter((n): n is HTMLElement => n !== null));
}

/* ==========================================================================
 * 受け取りの帯(ログインボーナス・お詫びの配布)
 *
 * どちらもメニューの**最上段**という一等地に出る。ここが青枠に緑の文字の
 * ままだと、せっかく金と熾火で組んだ画面の頭に、前の世界の紙が1枚
 * 貼られているように見える。それ以前に、緑はこのゲームでは体力の色で、
 * 「もらえた」という意味を運んでいない。
 *
 * 作りは2つとも同じにする:**封蝋(印)+ 中身 + 閉じる**。
 * 貰った量は文中の数字ではなく、アイコンを添えた一行で立てる。
 * ========================================================================== */

interface RewardLine {
  name: IconName;
  amount: string;
  unit: string;
}

/** 貰ったものを1行ずつ。数字を大きく、単位は添える程度に */
function rewardList(lines: RewardLine[]): HTMLElement {
  return el(
    "ul",
    { className: "reward-list" },
    lines.map((line) =>
      el("li", {}, [icon(line.name), el("strong", {}, [line.amount]), el("span", {}, [line.unit])]),
    ),
  );
}

/** 封蝋。金の丸に印を1つ落とす。帯の中で目が最初に止まる場所を作る */
function rewardSeal(name: IconName): HTMLElement {
  return el("div", { className: "reward-banner__seal", "aria-hidden": "true" }, [icon(name)]);
}

/**
 * 受け取った配布の帯。**1件につき1本**にする。
 *
 * 以前は複数の配布を1本の帯へ詰め込んでいた。ホームの帯は
 * 「見出し + 数字」を横一列に並べる細い作りなので、2件を超えた瞬間に
 * **入りきらない分が黙って切り落とされていた**(実際、新モンスターの記念配布を
 * 足したら「+1,500ダイヤ」が上下に切れて重なった)。
 * 1件1本なら、増えても縦に伸びるだけで何も欠けない。
 */
function renderCompensationBanners(claims: CompensationClaim[], onDismiss: () => void): HTMLElement[] {
  /*
   * **始めたばかりの人は、過去のアップデート履歴を全部まとめて受け取る。**
   * 実機では11本の札がホームを埋め、世界の絵もメニューも下へ押し出されていた。
   * 出すのは「モノを受け取ったもの」と「いちばん新しいお知らせ1件」だけ。
   * 畳んだぶんは消えていない(ホーム左の「お知らせ」から全部読める)。
   */
  const { shown, hiddenCount } = selectHomeBanners(claims);
  const label = compensationBannerLabel(shown);
  const banners = shown.map(({ compensation }, index) => {
    const items: RewardLine[] = [];
    if (compensation.crystal > 0) items.push({ name: "crystal", amount: `+${compensation.crystal.toLocaleString("ja-JP")}`, unit: "ダイヤ" });
    if (compensation.gold > 0) items.push({ name: "coin", amount: `+${compensation.gold.toLocaleString("ja-JP")}`, unit: "ゴールド" });
    if (compensation.summonScrolls > 0) items.push({ name: "scroll", amount: `+${compensation.summonScrolls}`, unit: "召喚の書" });
    if ((compensation.fourStarSummonScrolls ?? 0) > 0) {
      items.push({ name: "scroll", amount: `+${compensation.fourStarSummonScrolls}`, unit: "★4以上召喚書" });
    }
    if ((compensation.lightDarkFourStarSummonScrolls ?? 0) > 0) {
      items.push({ name: "scroll", amount: `+${compensation.lightDarkFourStarSummonScrolls}`, unit: "★4以上光闇召喚書" });
    }
    return el("section", { className: "panel reward-banner compensation" }, [
      rewardSeal("scroll"),
      el("div", { className: "reward-banner__body" }, [
        // 見出しは先頭の1本にだけ出す。同じ言葉が縦に並ぶと、何本あるのか読みにくい
        index === 0 ? el("p", { className: "reward-banner__label" }, [label]) : null,
        el("p", { className: "compensation__title" }, [compensation.title]),
        el("p", { className: "compensation__message" }, [compensation.message]),
        items.length > 0 ? rewardList(items) : null,
      ].filter((node): node is HTMLElement => node !== null)),
      el("button", { type: "button", className: "btn btn--ghost reward-banner__close", onclick: onDismiss }, ["閉じる"]),
    ]);
  });
  return banners;
}

/**
 * アカウント復旧の登録がまだの人へ出す警告。**登録すると消える。**
 *
 * ## なぜホームの一番上なのか
 *
 * このゲームのセーブは端末のブラウザの中だけにある。ブラウザの履歴や
 * サイトデータを消せば一緒に消えるし、機種を変えれば持って行けない。
 * 気づくのはたいてい**消えた後**で、その時点では打てる手が何も無い。
 * だから設定の奥ではなく、必ず通るホームの頭に出す。
 *
 * ## 浮かせない
 *
 * `.reward-banner-stack` の中へ入れる。ここは `position` を持たず、
 * 高さを `declareBannerStackHeight` が実測して世界の枠へ申告するので、
 * **下の「試練の塔」「お知らせ」「遊び方」を覆わない**。
 * 浮遊パネルで押せないボタンを作った事故を3回出している。
 *
 * ## **背は低く保つ。ここが一番危ない**
 *
 * 最初は見出し・理由・手順4行・ボタンを縦に積んで**291px**にした。
 * 実機(390x844)で測ったら `--home-banner-h` が **640px** まで膨らみ、
 * 世界の枠が `min-height` に張り付いて y=904 —— **画面の外**。
 * 「試練の塔」も「遊び方」も `elementFromPoint` に映らず、押せなくなっていた。
 *
 * ホームは `100dvh` を分け合う縦並びで、世界の枠は縮み切ると
 * それ以上は譲らない。**上に足したぶんは、そのまま下の何かを画面外へ押し出す。**
 * だから札は横一列の2行。手順の全文は、押した先(設定シートの中の
 * クラウド復旧の欄)で読ませる。あちらは全画面の覆いなので高さに余裕がある。
 *
 * ## `reward-banner` の見た目は借りない
 *
 * あちらはホームでは `min-height:42px` の横一列に潰され、
 * `.compensation__message` が `display:none` にされる。
 * ここは**理由とやり方を読ませるのが仕事**なので、その形には乗せられない。
 *
 * ## 閉じるボタンを付けない
 *
 * 閉じられる案内は、いちばん要る人から先に消える。
 * 消し方は「登録すること」ひとつだけにしてある。
 */
function renderCloudRecoveryWarning(openSettings: () => void): HTMLElement | null {
  if (hasCloudRecoveryAccount()) return null;
  return el("section", {
    className: "cloud-warn",
    "data-cloud-recovery-warning": "",
    ariaLabel: "アカウント復旧の登録",
  }, [
    el("div", { className: "cloud-warn__mark", "aria-hidden": "true" }, ["⚠"]),
    el("div", { className: "cloud-warn__text" }, [
      el("div", { className: "cloud-warn__title" }, ["アカウント復旧の登録がまだです"]),
      /*
       * **短く書く。**最初は理由を丁寧に書いて2行で打ち切られ、
       * 肝心の「どうすれば登録できるか」が省略記号の向こうへ消えていた
       * (実機で撮って気づいた。文字数を数えただけでは分からない)。
       * 詳しい手順3つは、押した先のクラウド復旧の欄にある。
       */
      el("div", { className: "cloud-warn__lead" }, [
        "データはこの端末の中だけ。消すと戻せません。右の「登録する」から、IDとパスワードを決めるだけです（メール不要）。",
      ]),
    ]),
    el("button", {
      type: "button",
      className: "btn btn--primary cloud-warn__go",
      "data-tour": "cloud-recovery-warning",
      onclick: () => {
        openSettings();
        /*
         * 設定を開いただけでは、復旧の欄はシートの下の方にある。
         * **開いた先で自分から探させない。**描き終わりを待ってから寄せる
         * (クラウド復旧の欄は別のモジュールが後から差し込むので、
         *  見つからなければ何もしない——推測して別の場所へ飛ばさない)
         */
        window.requestAnimationFrame(() => {
          document.querySelector(".cloud-recovery")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      },
    }, ["登録する"]),
  ]);
}

/** 畳んだぶんの行。**「消えた」と読ませない**ので、受け取り済みだと明示する */
function renderHiddenNoticeLine(claims: CompensationClaim[]): HTMLElement | null {
  const { hiddenCount } = selectHomeBanners(claims);
  if (hiddenCount === 0) return null;
  return el("p", { className: "reward-banner-stack__rest" }, [
    `ほかに${hiddenCount}件のお知らせがあります（配布は受け取り済み。左の「お知らせ」から読めます）`,
  ]);
}

/**
 * 札の高さを、世界の枠へ**実測で**申告する。
 *
 * ホームは `100dvh` を分け合う縦並びで、世界の枠の高さは
 * `calc(100dvh - ... - var(--home-banner-h))` で決まる。ここが実際より小さいと
 * 世界がその分はみ出し、`overflow:hidden` に切り落とされて
 * **「試練の塔」「お知らせ」「遊び方」が押せなくなる。**
 *
 * これまでは札の枚数から `:has()` で52px刻みに当てていた。当たらない。
 * アップデート告知は本文を出すので72px以上あり、文の長さでも変わる。
 * 実際に測ったところ**申告188pxに対し本物は365px**で、右下の3つが消えていた。
 *
 * 枚数や中身が変わっても勝手に追従するよう、当てるのをやめて測る。
 * (`:has()` の指定は残してあるが、こちらのインラインが必ず優先される。
 *  ResizeObserver が無い環境での保険としてだけ効く)
 */
function declareBannerStackHeight(home: HTMLElement, stack: HTMLElement): void {
  const apply = () => {
    // 上の余白ぶん(4px)も込みで申告する
    home.style.setProperty("--home-banner-h", `${Math.ceil(stack.getBoundingClientRect().height) + 4}px`);
  };
  if (typeof ResizeObserver === "undefined") { apply(); return; }
  // observe した時点で1回発火するので、DOMへ入る前に測って0を書き込む必要は無い
  new ResizeObserver(apply).observe(stack);
}

function renderLoginBonusBanner(result: LoginBonusResult, onDismiss: () => void): HTMLElement {
  const total = result.dailyCrystal + result.milestoneCrystal + result.firstTimeCrystal;
  const isFirst = result.firstTimeCrystal > 0;
  const body: HTMLElement[] = [
    el("p", { className: "reward-banner__label" }, [isFirst ? "はじめまして" : "ログインボーナス"]),
    rewardList([{ name: "crystal", amount: `+${total.toLocaleString("ja-JP")}`, unit: "ダイヤ" }]),
  ];
  if (isFirst) {
    // 何に使えるのかまで書く。数字だけ渡されても、初めての人には多いのか少ないのか分からない
    body.push(
      el("p", { className: "reward-banner__note" }, [
        `開始のお祝いです。召喚の10連が3回ぶん引けます`,
      ]),
    );
  }
  if (result.milestoneCrystal > 0) {
    body.push(
      el("p", { className: "reward-banner__note" }, [
        `${LOGIN_BONUS_MILESTONE_INTERVAL_DAYS}日分ログインで追加ボーナス +${result.milestoneCrystal}`,
      ]),
    );
  }
  return el("section", { className: "panel reward-banner login-bonus-banner" }, [
    rewardSeal("crystal"),
    el("div", { className: "reward-banner__body" }, body),
    el("button", { type: "button", className: "btn btn--ghost reward-banner__close", onclick: onDismiss }, ["閉じる"]),
  ]);
}

/**
 * 上部の身分証。
 *
 * 以前はレベル・EXP・3種の通貨が同じ高さに並んでいて、どれが主でどれが従か
 * 分からなかった。ここでは**レベルを丸で立て、名前を主役に、EXPは帯で見せる**。
 * 数字を読ませるのではなく、伸び具合を目で分かるようにする。
 */
function renderIdentity(
  player: PlayerState,
  onEditFighterName: () => void,
  onOpenSettings: () => void,
  lead: MonsterInstance | undefined,
): HTMLElement {
  const isMax = player.fighterLevel >= MAX_FIGHTER_LEVEL;
  const needed = requiredExpForFighterLevel(player.fighterLevel);
  const ratio = isMax ? 1 : Math.max(0, Math.min(1, player.fighterExp / Math.max(1, needed)));

  return el("section", { className: "home-id" }, [
    // 肖像は円で、金の輪で囲う。ここが画面の中で唯一「自分」を指す場所なので、
    // 一番手の込んだ縁を与える
    el("div", { className: "home-id__crest" }, [
      el("span", { className: "home-id__crestring" }, []),
      // 顔は編成の先頭のモンスター。汎用のアイコンより、自分の手持ちが出る方が「自分」に見える
      withPortrait(el("span", { className: "home-id__crestface" }, []), lead ? findMonsterById(lead.dexId) : undefined, "fill"),
      el("span", { className: "home-id__level" }, [
        el("small", {}, ["Lv"]),
        el("strong", {}, [String(player.fighterLevel)]),
      ]),
    ]),
    el("div", { className: "home-id__body" }, [
      el("div", { className: "home-id__name" }, [
        el("strong", {}, [player.fighterName]),
        el("button", { type: "button", className: "home-id__edit", onclick: onEditFighterName, title: "名前を変える", ariaLabel: "プレイヤー名を編集" }, [
          icon("pencil"),
        ]),
        el("button", { type: "button", className: "home-id__edit home-id__gear", onclick: onOpenSettings, title: "設定", ariaLabel: "設定を開く" }, [
          icon("settings"),
        ]),
      ]),
      el("div", { className: "home-id__exp" }, [
        el("div", { className: "home-id__bar" }, [
          el("i", { style: `width:${(ratio * 100).toFixed(1)}%` }, []),
        ]),
        el("span", {}, [isMax ? "MAX" : `${player.fighterExp} / ${needed}`]),
      ]),
    ]),
  ]);
}

function currencyChip(name: IconName, value: number, modifier: string, suffix?: string, onClick?: () => void): HTMLElement {
  const children = [
    icon(name),
    el("strong", {}, [value.toLocaleString("ja-JP")]),
    suffix ? el("span", { className: "home-wallet__suffix" }, [suffix]) : null,
  ].filter((n): n is HTMLElement => n !== null);
  return onClick
    ? el("button", { type: "button", className: `home-wallet__chip home-wallet__chip--${modifier}`, onclick: onClick, ariaLabel: "スタミナを回復" }, children)
    : el("div", { className: `home-wallet__chip home-wallet__chip--${modifier}` }, children);
}


/* ==========================================================================
 * タイトルの紋章
 *
 * 以前のタイトルは`<span>CREATE</span><strong>MONSTERS</strong>`だけで、
 * **ただの文字**だった。字面を大きくしても紋章にはならない。輪郭も厚みも
 * 無いので背景に沈み、端末のフォントが変われば幅がはみ出して画面外へ出る。
 *
 * ここではロゴをSVGで組む。理由は3つ:
 *
 * - `paint-order="stroke"` で**外周に濃い縁**を回せる。彫った金属に見える
 * - `textLength` で**幅を固定できる**。フォントが何であれ枠から出ない
 * - 角・鉱石・罫を同じ座標系に置ける。文字と飾りがずれない
 *
 * 図柄は「2つの流れが1つの核へ集まる」形。合成してモンスターを作り替える
 * という、このゲームそのものを絵にしている(角にも見えるようにしてある)。
 * ========================================================================== */

const SVG_NS = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
}

/** 目盛りの環。1本ずつ線を引くより、角度から座標を出した方が数を変えやすい */
function ticks(radius: number, count: number, length: number, width: number, color: string): SVGElement[] {
  const out: SVGElement[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    out.push(
      svg("line", {
        x1: (250 + cos * radius).toFixed(1),
        y1: (250 + sin * radius).toFixed(1),
        x2: (250 + cos * (radius + length)).toFixed(1),
        y2: (250 + sin * (radius + length)).toFixed(1),
        stroke: color,
        "stroke-width": String(width),
      }),
    );
  }
  return out;
}

const GOLD_LINE = "rgba(226,182,110,.42)";
const GOLD_LINE_SOFT = "rgba(226,182,110,.20)";

interface MenuTile {
  name: IconName;
  label: string;
  sub: string;
  onClick: () => void;
}


/**
 * ホームのパーティ札。
 *
 * 以前は絵文字の小さな四角を4つ並べているだけで、**手持ちの主役が
 * 画面の中でいちばん貧相**という状態だった。ここは「自分の4体」を
 * 見せる場所なので、札そのものを主役の大きさにする。
 *
 * 肖像は Three.js で焼いた3Dの絵をそのまま札いっぱいに敷く。描き起こした
 * イラストは持てないが、実際のモンスターが立っている絵はこちらで作れる。
 */
function homePartyCard(instance: MonsterInstance | undefined, onGoParty: () => void, onViewMonster: (id: string) => void): HTMLElement {
  if (!instance) {
    return el("button", { type: "button", className: "hp-card hp-card--empty", onclick: onGoParty }, [
      el("span", { className: "hp-card__plus" }, ["＋"]),
      el("span", { className: "hp-card__emptytext" }, ["編成する"]),
    ]);
  }

  const dex = findMonsterById(instance.dexId);
  const stars = Array.from({ length: instance.star }, () => el("i", {}, []));

  return el(
    "button",
    {
      type: "button",
      className: "hp-card",
      style: dex ? `--el-color:${dex.color}` : undefined,
      onclick: partyCardAction(instance, onGoParty, onViewMonster),
      ariaLabel: `${dex?.name ?? instance.dexId}の詳細と装備を見る`,
    },
    [
      withPortrait(el("span", { className: "hp-card__art" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
      el("span", { className: "hp-card__shade" }, []),
      dex
        ? el("span", { className: "hp-card__gem", title: `${ELEMENT_JA[dex.element]}属性` }, [
            // 18px角の宝石なので1文字しか入らない(「電気」は溢れる)
            el("i", {}, [ELEMENT_MARK[dex.element]]),
          ])
        : null,
      // 星は数字ではなく粒で出す。並べた時に格の差が一目で分かる
      el("span", { className: "hp-card__stars" }, stars),
      el("span", { className: "hp-card__level" }, [`Lv.${instance.level}`]),
    ].filter((n): n is HTMLElement => n !== null),
  );
}

/**
 * ロビーの背景に立つ姿だけを作る(押せない)。
 *
 * `homePartyCard` と見た目は同じだが、`button` ではなく `div` で返す。
 * 重ねて配置しているので押せる的にはできない。**押せない `button` を
 * 置くくらいなら、最初から的にしない。**
 */
function homePartyFigure(instance: MonsterInstance | undefined): HTMLElement {
  const card = homePartyCard(instance, () => {}, () => {});
  const figure = el("div", { className: card.className, style: card.getAttribute("style") ?? undefined, "aria-hidden": "true" }, []);
  figure.append(...card.childNodes);
  return figure;
}

/**
 * 総戦力・所持ダイヤ・所持ゴールドと、スタミナ。
 *
 * 「今どれだけ強いか」を出す場所がどこにも無かった。手持ちを鍛えた手応えが
 * 数字で返らないと、育てた甲斐が画面に現れない。
 *
 * スタミナは**ここ1か所にしか出さない。**以前は上部の通貨欄と下部の欄の
 * 2か所にあり、片方だけ見て「回復したのに増えていない」と誤解する余地があった。
 */
function renderVitals(
  player: PlayerState,
  onPartial: () => void,
  onFull: () => void,
  party: readonly MonsterInstance[],
): HTMLElement {
  const power = party.reduce((sum, m) => sum + monsterPower(m), 0);
  const full = player.stamina >= player.maxStamina;
  const ratio = Math.max(0, Math.min(1, player.stamina / Math.max(1, player.maxStamina)));

  const stat = (name: IconName, label: string, value: number): HTMLElement =>
    el("div", { className: "home-stat" }, [
      icon(name),
      el("span", { className: "home-stat__body" }, [
        el("small", {}, [label]),
        el("strong", {}, [value.toLocaleString("ja-JP")]),
      ]),
    ]);

  return el("section", { className: "panel panel--ornate home-vitals" }, [
    el("div", { className: "home-vitals__stats" }, [
      stat("arena", "総戦力", power),
      stat("crystal", "所持ダイヤ", player.crystal),
      stat("coin", "所持ゴールド", player.gold),
    ]),
    el("div", { className: "home-vitals__stamina" }, [
      el("div", { className: "home-stamina" }, [
        icon("stamina"),
        el("span", { className: "home-stamina__body" }, [
          el("small", {}, ["スタミナ"]),
          el("span", { className: "home-stamina__num" }, [
            el("strong", {}, [String(player.stamina)]),
            el("span", {}, [`/ ${player.maxStamina}`]),
          ]),
        ]),
        el("div", { className: "home-stamina__track" }, [el("i", { style: `width:${(ratio * 100).toFixed(1)}%` }, [])]),
      ]),
      el("div", { className: "home-vitals__actions" }, [
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost",
            disabled: full || player.crystal < STAMINA_REFILL_PARTIAL_COST,
            onclick: onPartial,
          },
          [icon("crystal"), `${STAMINA_REFILL_PARTIAL_COST} で +${STAMINA_REFILL_PARTIAL_AMOUNT}`],
        ),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--ghost",
            disabled: full || player.crystal < STAMINA_REFILL_FULL_COST,
            onclick: onFull,
          },
          [icon("crystal"), `${STAMINA_REFILL_FULL_COST} で全回復`],
        ),
      ]),
    ]),
  ]);
}


/**
 * 節の見出し。
 *
 * 見出しごとに板を敷くと、画面が「札の列」になる。
 * 背景の上に**刻印だけ**を置いて、囲わずに区切る。
 */
function sectionMark(text: string, action?: HTMLElement): HTMLElement {
  return el("div", { className: "home-mark" }, [
    el("span", { className: "home-mark__lozenge" }, []),
    el("span", { className: "home-mark__text" }, [text]),
    el("span", { className: "home-mark__rule" }, []),
    action ?? null,
  ].filter((n): n is HTMLElement => n !== null));
}

function renderMenuTile(tile: MenuTile): HTMLElement {
  // data-tour は巡回(tools/tour.mjs)の目印。文言ではなくここを見てもらう
  return el("button", { type: "button", className: "home-tile", "data-tour": `tile:${tile.name}`, onclick: tile.onClick }, [
    el("span", { className: "home-tile__icon" }, [icon(tile.name)]),
    el("span", { className: "home-tile__label" }, [tile.label]),
    el("span", { className: "home-tile__sub" }, [tile.sub]),
  ]);
}

export function renderHome(props: HomeProps): HTMLElement {
  const { player } = props;
  const party = getParty(player);
  const tower = homeTowerSummary(player);
  const tutorialNext = nextTutorialMission(player);
  const hasStarted = hasStartedHome();
  const settingsSheet = el("div", { className: "home-sheet", hidden: true }, []);
  const closeSettings = () => { settingsSheet.hidden = true; };
  settingsSheet.append(
    el("div", { className: "home-sheet__scrim", onclick: closeSettings }, []),
    el("div", { className: "home-sheet__panel" }, [
      el("div", { className: "home-sheet__head" }, [el("strong", {}, ["設定"]), el("button", { type: "button", className: "btn btn--ghost", onclick: closeSettings }, ["閉じる"])]),
      renderAudioSettings(props.audioSettings), renderSaveDataPanel(props), el("p", { className: "build-id" }, [`版 ${__BUILD_ID__}`]),
    ]),
  );
  const openSettings = () => { settingsSheet.hidden = false; };
  const [onGoArena, onGoShop, onGoHowToPlay] = homeUtilityActions(props);
  const [onGoEquipDungeon, onGoLevelDungeon, onGoGoldDungeon, onGoAwakeningDepth] = dungeonActions(props);
  const homeAssets: Record<string, string> = {
    "menu-mission": new URL("../assets/home/menu-mission.svg", import.meta.url).href,
    "menu-dex": new URL("../assets/home/menu-dex.svg", import.meta.url).href,
    "menu-ranking": new URL("../assets/home/menu-ranking.svg", import.meta.url).href,
    "menu-help": new URL("../assets/home/menu-help.svg", import.meta.url).href,
    "activity-adventure": new URL("../assets/home/activity-adventure.svg", import.meta.url).href,
    "activity-dungeon": new URL("../assets/home/activity-dungeon.svg", import.meta.url).href,
    "activity-arena": new URL("../assets/home/activity-arena.svg", import.meta.url).href,
    [["activity", "tower"].join("-")]: new URL("../assets/home/activity-tower.svg", import.meta.url).href,
  };
  const homeAsset = (name: string): string => homeAssets[name] ?? "";
  const worldButton = (side: "left" | "right", asset: string, label: string, onClick?: () => void, detail?: string) =>
    el("button", {
      type: "button",
      className: `world-action world-action--${side}`,
      /*
       * 巡回(tools/tour.mjs)の目印。**文言ではなくここを見てもらう。**
       * 絵の名前(menu-dex / activity-tower)から機械的に作るので、
       * ボタンを増やしても目印の付け忘れが起きない。
       * これが外れると巡回がその画面へ辿り着けず、安全網が黙って外れる。
       */
      "data-tour": `tile:${asset.replace(/^(menu|activity)-/, "")}`,
      onclick: onClick,
      disabled: onClick ? undefined : true,
      ariaLabel: onClick ? label : `${label}（準備中）`,
    }, [
      el("img", { src: homeAsset(asset), alt: "", "aria-hidden": "true" }, []),
      el("span", {}, [el("strong", {}, [label]), detail ? el("small", {}, [detail]) : null].filter((node): node is HTMLElement => node !== null)),
    ]);
  const dungeonChooser = el("div", { className: "crimon-dungeon-chooser", hidden: true, ariaLabel: "ダンジョンを選択" }, [
    el("button", { type: "button", "data-tour": "tile:equipDungeon", onclick: onGoEquipDungeon }, [icon("equipDungeon"), el("span", {}, ["装備"])]),
    el("button", { type: "button", "data-tour": "tile:trainDungeon", onclick: onGoLevelDungeon }, [icon("trainDungeon"), el("span", {}, ["育成"])]),
    el("button", { type: "button", "data-tour": "tile:goldDungeon", onclick: onGoGoldDungeon }, [icon("goldDungeon"), el("span", {}, ["ゴールド"])]),
    /*
     * 目覚の深域。**才能覚醒の素材を集める場所。**
     * ここに置くのは、装備・育成・ゴールドと同じ「素材を取りに行く場所」だから。
     * 才能覚醒そのものはモンスターの詳細から開く。
     */
    el("button", { type: "button", "data-tour": "tile:awakeningDepth", onclick: onGoAwakeningDepth }, [icon("trainDungeon"), el("span", {}, ["目覚"])]),
  ]);
  const toggleDungeonChooser = () => { dungeonChooser.hidden = !dungeonChooser.hidden; };
  const rewardText = (mission: (typeof TUTORIAL_MISSIONS)[number]): string => [
    mission.reward.gold ? `🪙 ${mission.reward.gold.toLocaleString()}` : null,
    mission.reward.crystal ? `💎 ${mission.reward.crystal}` : null,
    mission.reward.summonScrolls ? `📜 ×${mission.reward.summonScrolls}` : null,
    mission.reward.awakeningOrbs ? `🔮 ×${mission.reward.awakeningOrbs}` : null,
    mission.reward.fourStarSummonScrolls ? `🌟 ★4以上 ×${mission.reward.fourStarSummonScrolls}` : null,
    mission.reward.lightDarkFourStarSummonScrolls ? `🌗 光闇★4以上 ×${mission.reward.lightDarkFourStarSummonScrolls}` : null,
    mission.reward.fiveStarSummonScrolls ? `✨ ★5 ×${mission.reward.fiveStarSummonScrolls}` : null,
  ].filter(Boolean).join("　");
  const tutorialClaimable = tutorialNext ? canClaimTutorialMission(player, tutorialNext) : false;
  const tutorialActions = tutorialNext ? tutorialMissionActions(props, tutorialNext) : null;
  const claimedCount = TUTORIAL_MISSIONS.filter((mission) => player.tutorialMissions.claimedIds.includes(mission.id)).length;
  const tutorial = el("section", { className: "crimon-tutorial", ariaLabel: "初心者ミッション" }, [
    el("div", { className: "crimon-tutorial__head" }, [
      el("span", {}, [el("small", {}, ["BEGINNER MISSIONS"]), el("strong", {}, [tutorialNext ? `STEP ${tutorialNext.step} / 30` : "COMPLETE 30 / 30"])]),
      el("span", { className: "crimon-tutorial__count" }, [`${claimedCount} / ${TUTORIAL_MISSIONS.length}`]),
    ]),
    tutorialNext ? el("details", { className: `crimon-tutorial__current${tutorialClaimable ? " crimon-tutorial__current--ready" : ""}` }, [
      el("summary", {}, [tutorialClaimable ? "報酬を受け取れます！" : tutorialNext.title]),
      el("p", {}, [tutorialNext.condition]),
      el("p", { className: "crimon-tutorial__rewards" }, [rewardText(tutorialNext)]),
      el("div", { className: "crimon-tutorial__actions" }, [
        el("button", { type: "button", className: "btn btn--ghost", onclick: tutorialActions!.go }, ["移動する"]),
        tutorialClaimable ? el("button", { type: "button", className: "btn btn--primary", onclick: tutorialActions!.claim }, ["報酬を受け取る"]) : null,
      ].filter((node): node is HTMLButtonElement => node !== null)),
      el("details", { className: "crimon-tutorial__details" }, [
        el("summary", {}, ["詳細"]),
        ...TUTORIAL_MISSIONS.map((mission) => el("div", { className: player.tutorialMissions.claimedIds.includes(mission.id) ? "is-complete" : "" }, [`STEP ${mission.step}　${mission.title}`])),
      ]),
    ]) : el("p", { className: "crimon-tutorial__complete" }, ["全30ミッション達成！ 基本育成ロードマップを制覇しました。"]),
  ]);
  const staminaSheet = el("div", { className: "home-sheet", hidden: true }, []);
  const closeStamina = () => { staminaSheet.hidden = true; };
  staminaSheet.append(el("div", { className: "home-sheet__scrim", onclick: closeStamina }, []), el("div", { className: "home-sheet__panel" }, [el("div", { className: "home-sheet__head" }, [el("strong", {}, ["スタミナ回復"]), el("button", { type: "button", className: "btn btn--ghost", onclick: closeStamina }, ["閉じる"])]), renderVitals(player, props.onRefillStaminaPartial, props.onRefillStaminaFull, party)]));
  const openStamina = () => { staminaSheet.hidden = false; };
  const totalPower = party.reduce((sum, monster) => sum + monsterPower(monster), 0);
  const openTutorial = () => {
    const current = tutorial.querySelector<HTMLDetailsElement>(".crimon-tutorial__current");
    if (current) current.open = true;
    tutorial.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const banners = [
    /*
     * **配布の札より先。**下に置くと、札が複数出ている日には
     * スクロールしないと見えない位置まで落ちる。
     * 消えたら戻せない話なので、受け取りの案内より優先する
     */
    renderCloudRecoveryWarning(openSettings),
    ...renderCompensationBanners(props.compensationClaims, props.onDismissCompensation),
    props.loginBonusResult ? renderLoginBonusBanner(props.loginBonusResult, props.onDismissLoginBonus) : null,
    // 畳んだ件数は札の一番下。札の途中に挟むと、下の札が別扱いに見える
    renderHiddenNoticeLine(props.compensationClaims),
  ].filter((node): node is HTMLElement => node !== null);
  const bannerStack = banners.length ? el("div", { className: "reward-banner-stack" }, banners) : null;

  /*
   * ロビーに立つ4体は**見せるだけ**。押せる的にはしない。
   *
   * 手前の1体を大きく重ねる配置なので、2〜4体目は中心を覆われていて
   * 実際には押せなかった(巡回が3件まとめて拾った)。
   * 「押せそうに見えるのに押せない」より、「見るだけ」の方がよい。
   * 触る先はすぐ下の CURRENT PARTY の札で、そちらは4体とも重なっていない。
   */
  const partyFigures = party.map((member, index) => {
    const figure = homePartyFigure(member);
    figure.classList.add("world-party__figure", `world-party__figure--${index + 1}`);
    return figure;
  });
  const menu = el("main", { className: `home-menu crimon-home ${hasStarted ? "home-menu--visible" : "home-menu--hidden"}` }, [
      el("header", { className: "crimon-resource-header" }, [
        renderIdentity(player, props.onEditFighterName, openSettings, party[0]),
        el("div", { className: "home-wallet" }, [currencyChip("crystal", player.crystal, "crystal"), currencyChip("coin", player.gold, "gold"), currencyChip("stamina", player.stamina, "stamina", `/ ${player.maxStamina}`, openStamina)]),
      ]),
      /*
       * ログインボーナスと補填の札。**世界の上へ浮かせない。**
       *
       * `position:absolute; top:78px` で世界へ被せていたため、
       * 2枚同時に出た時は下の札の「閉じる」が押せず、
       * 左右の縦列(ミッション・図鑑・冒険・ダンジョン・闘技場)も覆っていた。
       * 上から順に押し下げる並びなら、何も隠さない。
       */
      bannerStack,
      /*
       * 編成は**世界の枠より上**に置く。
       *
       * 世界の枠は `min-height: 356px` で縮まない(縮めると左右の縦列が
       * `overflow:hidden` に切り落とされ、「試練の塔」が押せなくなる。
       * 過去に出している事故なので、ここを縮める選択は取れない)。
       * その結果、**上に何か増えるたび編成が画面の外へ押し出されていた。**
       * 実測では札が出ている間はどの端末でも下端の外(390x844で944px地点)、
       * 自動周回の帯が出ている時も同じ。
       *
       * 世界を縮めずに編成を必ず見せるには、順番を入れ替えるしかない。
       * 上から「自分 → 手持ち → 行き先」と読める並びでもある。
       */
      el("section", { className: "current-party-panel" }, [
        el("span", { className: "current-party-panel__title" }, [el("strong", {}, ["CURRENT PARTY"]), el("small", {}, [`総合戦力 ${totalPower.toLocaleString("ja-JP")}`])]),
        el("div", { className: "current-party-panel__portraits" }, party.map((member) => homePartyCard(member, props.onGoParty, props.onViewPartyMonster))),
        el("button", { type: "button", className: "current-party-panel__edit", "data-tour": "tile:party", onclick: props.onGoParty, ariaLabel: "パーティ編成" }, ["編成", icon("chevron")]),
      ]),
      el("section", { className: "home-world", ariaLabel: "CRIMON ワールドロビー" }, [
        el("div", { className: "world-atmosphere", "aria-hidden": "true" }, [
          el("span", { className: "world-atmosphere__moonbeam" }, []),
          el("span", { className: "world-atmosphere__haze world-atmosphere__haze--far" }, []),
          el("span", { className: "world-atmosphere__haze world-atmosphere__haze--near" }, []),
        ]),
        el("div", { className: "world-dais", "aria-hidden": "true" }, [
          el("span", { className: "world-dais__sigil" }, []),
          el("span", { className: "world-dais__rim" }, []),
        ]),
        el("div", { className: "world-actions world-actions--left" }, [
          worldButton("left", "menu-mission", "ミッション", openTutorial),
          worldButton("left", "menu-dex", "図鑑", props.onGoMonsterDex),
          worldButton("left", "menu-ranking", "ランキング"),
          worldButton("left", "menu-help", "遊び方", onGoHowToPlay),
        ]),
        el("div", { className: "world-party", ariaLabel: "現在のパーティ" }, partyFigures),
        el("div", { className: "world-actions world-actions--right" }, [
          worldButton("right", "activity-adventure", "冒険", props.onGoStages),
          worldButton("right", "activity-dungeon", "ダンジョン", toggleDungeonChooser),
          worldButton("right", "activity-arena", "闘技場", onGoArena),
          worldButton("right", "activity-tower", "試練の塔", props.onGoTrialTower, `最高 ${tower.bestFloor}F`),
        ]),
        dungeonChooser,
        el("div", { className: "world-foreground", "aria-hidden": "true" }, [
          el("span", { className: "world-foreground__spire world-foreground__spire--left" }, []),
          el("span", { className: "world-foreground__spire world-foreground__spire--right" }, []),
        ]),
      ]),
      tutorial,
      staminaSheet,
      settingsSheet,
    ].filter((node): node is HTMLElement => node !== null));
  if (bannerStack) declareBannerStackHeight(menu, bannerStack);
  if (hasStarted) return el("div", { className: "screen home-screen home-screen--menu-only" }, [menu]);

  const homeScreen = el("div", { className: "screen home-screen" }, []);
  /*
   * タイトルは**1枚の絵**。
   *
   * 以前はロゴのSVGと、その周りの装飾(炉・輪・粉・稜線・粒子・周辺減光)を
   * CSSで積んで作っていた。依頼主から1枚の絵を受け取ったので、
   * それをそのまま敷く。題字も「Tap to Start」も絵の中にある。
   *
   * **絵の上に文字を重ねない。**重ねると、絵の中の題字と二重になる。
   * 押す場所は画面全体。絵のどこを触っても始まる。
   */
  const titleScreen = el("section", { className: "title-screen crimon-title-screen", ariaLabel: "CRIMON タイトル" }, [
    el("img", {
      src: new URL("../assets/title-cover.webp", import.meta.url).href,
      alt: "",
      "aria-hidden": "true",
      className: "crimon-title-screen__cover",
      // 最初に出る絵なので、ほかの何よりも先に取りに行かせる
      fetchPriority: "high",
      decoding: "async",
    }, []),
    // 巡回はここを押さないと、タイトルに覆われたホームを「問題なし」と報告してしまう
    el("button", { type: "button", className: "title-start crimon-title-start", "data-tour": "start", ariaLabel: "ゲームを開始", onclick: () => {
      startHome();
      titleScreen.classList.add("title-screen--leaving");
      homeScreen.classList.add("home-screen--menu-only");
      menu.classList.remove("home-menu--hidden"); menu.classList.add("home-menu--visible");
      window.scrollTo({ top: 0 });
      window.setTimeout(() => titleScreen.remove(), 320);
    } }, []),
  ]);
  homeScreen.append(titleScreen, menu);
  return homeScreen;
}
