import { PlayerState } from "./playerState.js";

/**
 * 配布・お知らせ。
 *
 * 期間中に一度アプリを開けば自動で受け取れる。受け取った記録は id で残すので、
 * 何度開いても重複して配られることはない。
 *
 * **日付は端末のローカル日付で判定する。** UTCで判定すると、時差のある地域では
 * 「その日に開いたのに受け取れない」「日付が変わる前に打ち切られる」が起きる。
 *
 * 元はお詫び専用だったが、**追加の記念やアップデート告知にも同じ仕組みを使う。**
 * 「1アカウントにつき1度だけ」「表示済みを id で覚える」という
 * いちばん間違えやすい部分が、既にここで解けているため。
 * ただし帯の見出しだけは種別ごとに分ける。
 */

export type CompensationKind = "APOLOGY" | "CELEBRATION" | "UPDATE";

export interface Compensation {
  id: string;
  title: string;
  /** 配布・告知の説明。受け取った本人が理由を分かるようにする */
  message: string;
  /** お詫び・記念・アップデート。省略時はお詫び */
  kind?: CompensationKind;
  /** 受け取れる期間(端末のローカル日付 YYYY-MM-DD、両端を含む) */
  fromDate: string;
  toDate: string;
  crystal: number;
  gold: number;
  summonScrolls: number;
  /** ★4以上召喚書。省略時は0 */
  fourStarSummonScrolls?: number;
}

/**
 * 配布・お知らせの一覧。
 *
 * 2026-08-18: キャッシュの不具合を直す手順として「サイトのデータを削除」を案内した際、
 * その操作でセーブデータごと消えることを警告していなかった。実際に手持ちが全て失われた。
 */
export const COMPENSATIONS: Compensation[] = [
  {
    id: "2026-09-01-monster-management-back-equipment-enhance",
    title: "9/1 モンスター管理・装備変更の操作改善",
    message: "モンスター強化・ランクアップから戻った直後に、左上の戻る操作が二重に現れて編成画面まで戻ってしまう場合があった問題を修正しました。あわせて、モンスターの装備変更画面で候補装備ごとに強化ボタンを追加し、装着する前でもその場で装備を強化できるようにしました。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-stage-late-monster-japanese-names",
    title: "9/1 ステージ敵名の表示修正",
    message: "第5章以降のステージ詳細にある「出現する敵」で、追加モンスターの名前が mushroon・kobold など内部IDの英字で表示されていた不具合を修正しました。マッシュルン・コボルトなど正式な日本語名と本来のアイコンで表示されます。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-stage-wave-auto-advance",
    title: "9/1 ステージ進行テンポ改善",
    message: "通常ステージでウェーブ勝利後に表示していた「次のウェーブへ」ボタンをなくし、勝利表示のあと次のウェーブへ自動で進むようにしました。最終ウェーブ後の報酬受け取りや、敗北時のステージ終了はこれまで通りです。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-bgm-home-battle-boss-volume",
    title: "9/1 BGM・音量調整アップデート",
    message: "新しいBGMとして、ホーム用・通常戦闘用・ボス戦用の3曲を追加しました。通常戦闘では専用曲を再生し、戦闘画面にBOSSが登場するバトルではボス戦用BGMへ自動で切り替わります。あわせて音量スライダーを5%刻みから1%刻みに変更し、小さい音量へより細かく調整できるようにしました。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-result-party-level-reward-fx",
    title: "9/1 リザルト・報酬演出アップデート",
    message: "バトルのリザルト画面に、戦闘後の現在パーティ4体のレベルを一覧表示するようにしました。レベルMAXのメンバーも確認できます。あわせてミッション報酬を受け取った時に、獲得内容が中央に浮かび上がる専用の入手演出を追加しました。演出は表示専用で、報酬の付与処理や受取済み判定には影響しません。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-pwa-app-icon-blue-dragon",
    title: "9/1 アプリアイコン刷新のお知らせ",
    message: "スマホのホーム画面に追加した時に表示されるCRIMONのアプリアイコンを、青いドラゴンを主役にした新デザインへ刷新しました。iPhone用のホーム画面アイコンに加え、PWA用の192px・512pxアイコンとブラウザ用ファビコンも同じデザインへ統一しています。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-inventory-list-performance",
    title: "9/1 所持品一覧 軽量化アップデート",
    message: "所持モンスター・所持装備・モンスター強化の素材一覧・ランクアップの素材一覧を軽量化しました。大量に所持している場合でも全カードを一度に画面へ生成せず、最初の48件から段階的に表示する方式へ変更しています。所持数やセーブデータの形式は変更していません。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-adventure-chapter5-8",
    title: "9/1 冒険アップデートのお知らせ",
    message: "冒険に第5〜8章を追加し、全40ステージへ拡張しました。5〜8章では新モンスター11種が道中に登場し、各章の最終ステージには専用ボスを配置しています。古代守護ゴーレムには難易度別の反撃ギミック、腐食トレントには毎ターンの自己再生を追加しました。あわせてスライム・ウルフ・インプ・ウィスプ・フェアリー・グレイヴナイト・クロノスなど、旧モンスターの一部スキルを上方調整し、クロノスの「時空崩壊」はダメージ後70%で敵の行動ゲージを100%減少させる効果へ変更しました。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    // お知らせ一覧から後でも確認できるよう、終了日は設けない
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-update-missions-and-training",
    title: "9/1 アップデートのお知らせ",
    message: "新モンスター11種を追加しました。さらに、デイリー・ウィークリー・マンスリー・累計ミッションを追加し、累計ミッションは上限なく継続します。素材モンスター一覧には「経験豚優先」「転生豚優先」を追加し、転生ピッグの必要経験値を通常の1/3へ緩和しました。",
    kind: "UPDATE",
    fromDate: "2026-09-01",
    // 後から始めた人にも更新内容が分かるよう、終了日は設けない
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-new-monsters",
    title: "新モンスター11種 追加記念",
    message: "マッシュルンからベヒモスまで、11種66体の追加を記念した配布です。",
    kind: "CELEBRATION",
    fromDate: "2026-09-01",
    // 新規・既存を問わず1アカウントにつき1度受け取れるよう、終了日は設けない
    toDate: "9999-12-31",
    crystal: 1500,
    gold: 0,
    summonScrolls: 30,
    fourStarSummonScrolls: 2,
  },
  {
    id: "2026-08-30-2d-transition",
    title: "2D化のお詫び",
    message: "モンスターグラフィックの2D化に伴うお詫びです。",
    fromDate: "2026-08-30",
    // 新規・既存を問わず1アカウントにつき1度受け取れるよう、終了日は設けない。
    toDate: "9999-12-31",
    crystal: 3000,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-08-28-autofarm-summon-freeze",
    title: "不具合のお詫び",
    message: "自動周回中に召喚を行うと操作できなくなる場合があった不具合のお詫びです。",
    fromDate: "2026-08-28",
    toDate: "2026-09-30",
    crystal: 900,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-08-18-save-loss",
    title: "お詫びの配布",
    message: "更新の案内の不備でデータが失われた件のお詫びです。ご迷惑をおかけしました。",
    fromDate: "2026-08-18",
    toDate: "2026-08-18",
    crystal: 10000,
    gold: 1000000,
    summonScrolls: 50,
  },
];

/** 端末のローカル日付を YYYY-MM-DD で返す */
export function localDateString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isWithinPeriod(compensation: Compensation, today: string): boolean {
  return today >= compensation.fromDate && today <= compensation.toDate;
}

/** いま受け取れる配布・お知らせ(期間中で、まだ表示・受取していないもの) */
export function pendingCompensations(state: PlayerState, now: Date = new Date()): Compensation[] {
  const today = localDateString(now);
  const claimed = new Set(state.claimedCompensationIds ?? []);
  return COMPENSATIONS.filter((c) => isWithinPeriod(c, today) && !claimed.has(c.id));
}

export interface CompensationClaim {
  compensation: Compensation;
}

/**
 * 帯の見出し。
 *
 * 同じ日に複数種別が重なることがある。異なる種別が混ざった時に片方だけの言葉を
 * 使うと、もう片方が嘘になるので、その時だけ中立の言葉にする。
 */
export function compensationBannerLabel(claims: readonly CompensationClaim[]): string {
  const kinds = new Set(claims.map(({ compensation }) => compensation.kind ?? "APOLOGY"));
  if (kinds.size !== 1) return kinds.has("UPDATE") ? "お知らせ" : "配布のお知らせ";
  if (kinds.has("UPDATE")) return "アップデートのお知らせ";
  return kinds.has("CELEBRATION") ? "記念の配布" : "お詫びの配布";
}

/**
 * 受け取れる配布・お知らせをすべて処理する。処理したものを返す(無ければ空)。
 * 画面を開くたびに呼んでよい(重複しない)。
 */
export function claimCompensations(state: PlayerState, now: Date = new Date()): CompensationClaim[] {
  const claims: CompensationClaim[] = [];
  for (const compensation of pendingCompensations(state, now)) {
    state.crystal += compensation.crystal;
    state.gold += compensation.gold;
    state.summonScrolls += compensation.summonScrolls;
    state.fourStarSummonScrolls += compensation.fourStarSummonScrolls ?? 0;
    state.claimedCompensationIds.push(compensation.id);
    claims.push({ compensation });
  }
  return claims;
}
