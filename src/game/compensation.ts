import { PlayerState } from "./playerState.js";

/**
 * 配布・お知らせ。
 *
 * 期間中に一度アプリを開けば自動で受け取れる。受け取った記録は id で残すので、
 * 何度開いても重複して配られることはない。
 */
export type CompensationKind = "APOLOGY" | "CELEBRATION" | "UPDATE";

export interface Compensation {
  id: string;
  title: string;
  message: string;
  kind?: CompensationKind;
  fromDate: string;
  toDate: string;
  crystal: number;
  gold: number;
  summonScrolls: number;
  fourStarSummonScrolls?: number;
}

export const COMPENSATIONS: Compensation[] = [
  {
    id: "2026-09-03-arena-shop-goals-defense-coins",
    title: "9/3 アリーナショップ拡張アップデート",
    message: "アリーナショップに経験ピッグ★4、スキルピッグ、転生ピッグ★5、★5召喚書などを追加しました。★5召喚書とスキルピッグセットは、コインを貯めて狙えるシーズン商品です。覚醒オーブは価値に合わせて価格と交換上限を見直しました。また、オンラインの防衛成功でもアリーナコインを受け取れるようになりました。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-arena-release-safety",
    title: "9/3 アリーナ安定化アップデート",
    message: "実プレイヤーとNPCが混ざる対戦候補で、表示したNPCと実際の対戦相手がずれる場合がある問題を修正しました。シーズン更新と報酬受取、週間報酬・ショップの更新時刻を統一し、シーズン終了をまたいだ対戦は挑戦券を返すようにしました。オンライン購入は通信が途切れても、未受取の商品を次回接続時に受け取れるようになりました。通信できない時はオンライン表示にせず、これまでどおりオフラインのアリーナを遊べます。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-stage-5-8-rebalance",
    title: "9/2 魔獣のダンジョン・第5〜8章アップデート",
    message: "装備ダンジョンに「魔獣のダンジョン」を追加しました。古代の魔獣・古代の護獣・古代の牙獣が登場し、加護・暴走・免疫・崩壊・祝福の新しい5種類の装備セットを獲得できます。既存の装備ダンジョンは「魔人のダンジョン」へ名称を変更し、両ダンジョンで獲得できる装備セットを確認できるようにしました。あわせて各階層の装備レアリティ下限を引き上げ、最高レアリティの出現しやすさは維持しています。第5〜8章の経験値・ゴールド・装備・モンスタードロップも見直し、後半の章ほど周回報酬が増えるようにしました。第8章の獲得経験値はNORMALで15,000、HARDで22,500、HELLで30,000です。通常ステージの装備は最大★5とし、各章のボスステージでは★3転生ピッグもまれに獲得できます。あわせて8-5 HELLの敵を、育成した編成で周回できる範囲に調整しました。",
    kind: "UPDATE", fromDate: "2026-09-02", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-home-party-and-dex-sort",
    title: "9/2 ホーム・図鑑の操作アップデート",
    message: "ホーム画面で「CURRENT PARTY」を世界の絵より上へ移動しました。お知らせやオート周回の表示が出ている時に編成が画面の下へ押し出され、スクロールしないと見えない場合があった問題への対応です。あわせてモンスター図鑑に並べ替えを追加し、図鑑順・属性・種族・役割・能力で並べ替えられるようにしました。図鑑番号は並べ替えても変わりません。",
    kind: "UPDATE", fromDate: "2026-09-02", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-equipment-card-readability",
    title: "9/2 装備画面の見やすさアップデート",
    message: "装備変更画面で、装備の札・今の装備との差・強化を1つの枠にまとめました。差は「名前 / 変化 / 差」の3列に整え、増減を色で分けています。強化ボタンは枠の中の小さな札にして、装備を選ぶ操作の邪魔にならないようにしました。所持装備の一覧でもサブステータスの名前と数値を左右に分け、数値の列が縦に揃うようにしています。",
    kind: "UPDATE", fromDate: "2026-09-02", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-auto-farm-bar",
    title: "9/2 オート周回の表示アップデート",
    message: "オート周回の進捗表示を、ドラッグできる小窓から画面上部の帯へ変更しました。文字が1〜3文字ずつ折り返して読めなくなる問題と、ホームの「お知らせ」ボタンを覆っていた問題への対応です。右端のボタンで帯を畳めるようになり、畳んだ状態は次回起動時も保たれます。畳んでいる間も周回先と進み具合は表示されます。あわせて左上の「戻る」が帯に重なる問題も修正しました。",
    kind: "UPDATE", fromDate: "2026-09-02", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-home-notice-digest",
    title: "9/2 ホームのお知らせ表示アップデート",
    message: "ホーム画面に表示するお知らせを最大3件までに変更しました。始めたばかりの方が過去のお知らせをまとめて受け取ると、ホームが札で埋まってしまう問題への対応です。表示しなかったぶんは件数を1行でお知らせします。配布の受け取りはこれまでどおり自動で完了しており、内容はホーム左の「お知らせ」からすべてご確認いただけます。",
    kind: "UPDATE", fromDate: "2026-09-02", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-ios-home-screen-icon-fix",
    title: "9/2 アプリアイコンの不具合修正",
    message: "iPhoneで「ホーム画面に追加」が失敗する不具合を修正しました。配信していたアイコン画像が途中で切れた壊れたファイルになっており、iOSが読み込めずに追加そのものが失敗していました。あわせてアプリアイコンをドラゴンの紋章をあしらった新しいデザインへ差し替えています。すでにホーム画面へ追加済みの場合は、一度削除してから追加し直してください。",
    kind: "UPDATE", fromDate: "2026-09-02", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-02-ios-bgm-resume-stability",
    title: "9/2 BGM再生安定化アップデート",
    message: "一部のiPhoneやホーム画面追加版で、起動時やバックグラウンドから戻った後にBGMが鳴らない場合がある問題へ対策しました。端末側で音声が一時停止しても次の操作や画面復帰時に再開を試み、初回の音声解錠やBGM読込に失敗した場合も再試行できるようにしています。",
    kind: "UPDATE",
    fromDate: "2026-09-02",
    toDate: "9999-12-31",
    crystal: 0,
    gold: 0,
    summonScrolls: 0,
  },
  {
    id: "2026-09-01-monster-management-back-equipment-enhance",
    title: "9/1 モンスター管理・装備変更の操作改善",
    message: "モンスター強化・ランクアップから戻った直後に、左上の戻る操作が二重に現れて編成画面まで戻ってしまう場合があった問題を修正しました。あわせて、モンスターの装備変更画面で候補装備ごとに強化ボタンを追加し、装着する前でもその場で装備を強化できるようにしました。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-stage-late-monster-japanese-names",
    title: "9/1 ステージ敵名の表示修正",
    message: "第5章以降のステージ詳細にある「出現する敵」で、追加モンスターの名前が mushroon・kobold など内部IDの英字で表示されていた不具合を修正しました。マッシュルン・コボルトなど正式な日本語名と本来のアイコンで表示されます。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-stage-wave-auto-advance",
    title: "9/1 ステージ進行テンポ改善",
    message: "通常ステージでウェーブ勝利後に表示していた「次のウェーブへ」ボタンをなくし、勝利表示のあと次のウェーブへ自動で進むようにしました。最終ウェーブ後の報酬受け取りや、敗北時のステージ終了はこれまで通りです。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-bgm-home-battle-boss-volume",
    title: "9/1 BGM・音量調整アップデート",
    message: "新しいBGMとして、ホーム用・通常戦闘用・ボス戦用の3曲を追加しました。通常戦闘では専用曲を再生し、戦闘画面にBOSSが登場するバトルではボス戦用BGMへ自動で切り替わります。あわせて音量スライダーを5%刻みから1%刻みに変更し、小さい音量へより細かく調整できるようにしました。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-result-party-level-reward-fx",
    title: "9/1 リザルト・報酬演出アップデート",
    message: "バトルのリザルト画面に、戦闘後の現在パーティ4体のレベルを一覧表示するようにしました。レベルMAXのメンバーも確認できます。あわせてミッション報酬を受け取った時に、獲得内容が中央に浮かび上がる専用の入手演出を追加しました。演出は表示専用で、報酬の付与処理や受取済み判定には影響しません。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-pwa-app-icon-blue-dragon",
    title: "9/1 アプリアイコン刷新のお知らせ",
    message: "スマホのホーム画面に追加した時に表示されるCRIMONのアプリアイコンを、青いドラゴンを主役にした新デザインへ刷新しました。iPhone用のホーム画面アイコンに加え、PWA用の192px・512pxアイコンとブラウザ用ファビコンも同じデザインへ統一しています。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-inventory-list-performance",
    title: "9/1 所持品一覧 軽量化アップデート",
    message: "所持モンスター・所持装備・モンスター強化の素材一覧・ランクアップの素材一覧を軽量化しました。大量に所持している場合でも全カードを一度に画面へ生成せず、最初の48件から段階的に表示する方式へ変更しています。所持数やセーブデータの形式は変更していません。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-adventure-chapter5-8",
    title: "9/1 冒険アップデートのお知らせ",
    message: "冒険に第5〜8章を追加し、全40ステージへ拡張しました。5〜8章では新モンスター11種が道中に登場し、各章の最終ステージには専用ボスを配置しています。古代守護ゴーレムには難易度別の反撃ギミック、腐食トレントには毎ターンの自己再生を追加しました。あわせてスライム・ウルフ・インプ・ウィスプ・フェアリー・グレイヴナイト・クロノスなど、旧モンスターの一部スキルを上方調整し、クロノスの「時空崩壊」はダメージ後70%で敵の行動ゲージを100%減少させる効果へ変更しました。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-update-missions-and-training",
    title: "9/1 アップデートのお知らせ",
    message: "新モンスター11種を追加しました。さらに、デイリー・ウィークリー・マンスリー・累計ミッションを追加し、累計ミッションは上限なく継続します。素材モンスター一覧には「経験豚優先」「転生豚優先」を追加し、転生ピッグの必要経験値を通常の1/3へ緩和しました。",
    kind: "UPDATE", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-01-new-monsters",
    title: "新モンスター11種 追加記念",
    message: "マッシュルンからベヒモスまで、11種66体の追加を記念した配布です。",
    kind: "CELEBRATION", fromDate: "2026-09-01", toDate: "9999-12-31", crystal: 1500, gold: 0, summonScrolls: 30, fourStarSummonScrolls: 2,
  },
  {
    id: "2026-08-30-2d-transition",
    title: "2D化のお詫び",
    message: "モンスターグラフィックの2D化に伴うお詫びです。",
    fromDate: "2026-08-30", toDate: "9999-12-31", crystal: 3000, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-08-28-autofarm-summon-freeze",
    title: "不具合のお詫び",
    message: "自動周回中に召喚を行うと操作できなくなる場合があった不具合のお詫びです。",
    fromDate: "2026-08-28", toDate: "2026-09-30", crystal: 900, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-08-18-save-loss",
    title: "お詫びの配布",
    message: "更新の案内の不備でデータが失われた件のお詫びです。ご迷惑をおかけしました。",
    fromDate: "2026-08-18", toDate: "2026-08-18", crystal: 10000, gold: 1000000, summonScrolls: 50,
  },
];

export function localDateString(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function isWithinPeriod(compensation: Compensation, today: string): boolean {
  return today >= compensation.fromDate && today <= compensation.toDate;
}

export function pendingCompensations(state: PlayerState, now: Date = new Date()): Compensation[] {
  const today = localDateString(now);
  const claimed = new Set(state.claimedCompensationIds ?? []);
  return COMPENSATIONS.filter((c) => isWithinPeriod(c, today) && !claimed.has(c.id));
}

export interface CompensationClaim { compensation: Compensation; }

export function compensationBannerLabel(claims: readonly CompensationClaim[]): string {
  const kinds = new Set(claims.map(({ compensation }) => compensation.kind ?? "APOLOGY"));
  if (kinds.size !== 1) return kinds.has("UPDATE") ? "お知らせ" : "配布のお知らせ";
  if (kinds.has("UPDATE")) return "アップデートのお知らせ";
  return kinds.has("CELEBRATION") ? "記念の配布" : "お詫びの配布";
}

/** 受け取ったモノがあるか。ダイヤ・ゴールド・召喚の書のどれか */
export function hasReward(compensation: Compensation): boolean {
  return compensation.crystal > 0 || compensation.gold > 0
    || compensation.summonScrolls > 0 || (compensation.fourStarSummonScrolls ?? 0) > 0;
}

export interface HomeBannerSelection {
  /** ホームに札として出すもの */
  shown: CompensationClaim[];
  /** 出さずに畳んだお知らせの件数 */
  hiddenCount: number;
}

/** ホームに出す札の上限。ここを超えたら世界の絵とメニューが押し出される */
export const HOME_BANNER_LIMIT = 3;

/**
 * ホームに出す札を選ぶ。
 *
 * **始めたばかりの人は、過去のアップデート履歴を全部まとめて受け取る。**
 * 実機では11本の札がホームを埋め、世界の絵もメニューも下へ押し出されていた。
 * 初めて開いた画面が更新履歴の壁になっていて、何をする場所なのか分からない。
 *
 * ただし**単純に1件へ絞ると、配布を見落とす。** 「ダイヤ1500と召喚の書30枚を
 * 受け取った」は、読み飛ばされてよい情報ではない。そこで:
 *
 * - **モノの無いお知らせ**は、いちばん新しい1件ぶんの枠を必ず取る
 * - 残りの枠は**モノを受け取ったもの**を新しい順に埋める
 * - 合計は {@link HOME_BANNER_LIMIT} 本まで
 *
 * 上限を置くのは、**放っておくと必ず増えるから**。「全部出す」は今日は2本でも、
 * 半年後には10本になる。同じ事故を二度出さないよう本数側で止める。
 *
 * 畳んだぶんは消えるわけではない。受け取りはすでに済んでいて、
 * 中身はホーム左の「お知らせ」から全部読める。
 */
export function selectHomeBanners(claims: readonly CompensationClaim[]): HomeBannerSelection {
  // 並び順は当てにしない。日付の新しい順に見て、先頭を「最新」とする
  const byNewest = (a: CompensationClaim, b: CompensationClaim) =>
    b.compensation.fromDate.localeCompare(a.compensation.fromDate);
  const plain = claims.filter(({ compensation }) => !hasReward(compensation)).sort(byNewest);
  const gifts = claims.filter(({ compensation }) => hasReward(compensation)).sort(byNewest);

  const keep = new Set(plain.slice(0, 1).map(({ compensation }) => compensation.id));
  for (const { compensation } of gifts.slice(0, HOME_BANNER_LIMIT - keep.size)) keep.add(compensation.id);

  // 出す順は元の並びのまま。日付順に並べ替えると、見出しの位置が動いて読みにくい
  const shown = claims.filter(({ compensation }) => keep.has(compensation.id));
  return { shown, hiddenCount: claims.length - shown.length };
}

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
