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
    id: "2026-09-05-monster-dense-view",
    title: "9/5 モンスター一覧に簡易表示を追加",
    message: "所持モンスター・モンスター強化素材・ランクアップ素材の一覧に、1画面でより多くのモンスターを確認できる簡易表示を追加しました。3画面の切替状態は共通で、画面を移動した後やアプリを開き直した後も維持されます。絞り込み・並び替え・ロック・編成中表示・素材選択・同種族ボーナスは通常表示と同じように利用できます。",
    kind: "UPDATE", fromDate: "2026-09-05", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-05-trial-tower-80-live",
    title: "9/5 試練の塔80階に古代聖竜が登場",
    message: "検証版に留まっていた80階の新編成を本編へ反映しました。古代聖竜と護晶・鼓舞晶・破邪獣・呪獣の5体が登場します。古代聖竜は免疫を展開し、HPが減ると攻撃が強化されます。免疫が切れた時やお供を倒した時は、本体にダメージが通りやすくなります。本体を倒せばクリアです。階一覧の80階から、全員のスキルと固有効果を確認できます。報酬・受取状態・最高到達階は変更していません。",
    kind: "UPDATE", fromDate: "2026-09-05", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-05-trial-tower-intel-reward-catalog",
    title: "9/5 試練の塔の敵情報と報酬一覧を見やすくしました",
    message: "試練の塔の階一覧で、60階以降の階を押すと、まだ到達していない階でも敵が使うスキルと固有効果を確認できるようになりました。階の右下にあるⓘが目印です。また、今月の塔報酬に「全100階の報酬を見る」を追加しました。1階から100階まで10階ずつ確認でき、各階の報酬内容と今月の受取状態、15階・30階の追加覚醒オーブも表示します。報酬内容や月次リセットの仕組み自体は変わりません。",
    kind: "UPDATE", fromDate: "2026-09-05", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-05-skill-strengthening",
    title: "9/5 スキル強化：単体支援・吸収・毒・最大レベル性能を見直しました",
    message: "【単体攻撃・妨害】ゴーレム「いわくだき」は威力1.5倍、防御低下が2ターンになり成功率も上昇。アビスリーパー「冥府の契約」はゲージ50%減少に強化阻害と毒1個を追加。コボルト「追い討ち」は威力1.75倍になり、自身のゲージ増加が敵から30%吸収へ変更。「処刑の一撃」は攻撃前の敵HPが30%以下なら防御を完全無視します。ミミック「がぶ飲み」は威力1.8倍、「食らいつく」は最大レベルのCTが3になりました。\n\n【全体攻撃・毒】マッシュルン「毒胞子の雨」は毒2個を2ターン付与。「終末胞子」は最大レベルで全体0.5倍×3回攻撃になり、各攻撃後に毒1個・3ターンを個別判定します。弱体数による威力増加も残ります。ベヒモス「大地踏み」は最大HP比例を0.04から0.05へ強化し、全体ゲージ30%減少を追加しました。\n\n【味方への支援】ウィスプ「ときわたりのひかり」は味方単体のゲージ80%増加＋速度25%上昇2ターン・CT4に変更。最大レベルではゲージ100%、速度3ターン、CT3です。ヴァルキリア「勝利への進軍」は全体ゲージ30%増加＋速度・攻撃30%上昇2ターンになり、低HP条件を廃止。グリフォン「猛禽の加護」には全体ゲージ15%増加を追加しました。ゴーレム「きょじんのふんぬ」は最大レベルで自身に反射3ターンも付与します。\n\n【通常攻撃・吸血・パッシブ】フェアリー「ちいさな一撃」は最大レベルで威力1倍＋自身HP4%回復。トレント「ようぶんきゅうしゅう」は最大レベルで攻撃力1.5倍＋最大HP×0.06になり、1回の回復上限は自身の最大HP30%です。コボルト「獲物の匂い」はLv1から敵HP50%以下へのダメージ20%増加、常時攻撃25%・速度15上昇、全攻撃への速度比例を追加。速度200で各攻撃の倍率に0.15倍ぶんを加算し、継承した攻撃技にも適用されます。\n\n最大レベルと明記したもの以外はLv1の数値です。所持済み・継承済みの対象スキルにも反映されます。",
    kind: "UPDATE", fromDate: "2026-09-05", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-05-gauge-drain-fixes",
    title: "9/5 行動ゲージ吸収の修正とスキル2強化",
    message: "闇クロノスのパッシブ「時の管理者」を修正しました。全体攻撃では、攻撃が当たって生き残った敵それぞれから行動ゲージを吸収し、スタンも敵ごとに判定します。多段攻撃で同じ敵に複数回当たった場合の吸収とスタン判定は、これまでどおり1スキルにつき1回です。あわせて、インプの「足払い」で行動ゲージ吸収が発動していなかった問題を修正しました。全モンスターのスキルを点検し、スキル2の全体攻撃が少なかったため、スライム「エレメンタルバースト」、インプ「めつぶし」、トレント「からみつくねっこ」、グリフォン「きりさく突風」、セラフ「さばきの光」、サンダービースト「連雷」を全体攻撃に変更しました。全体化に合わせて威力と追加効果の確率を調整しています。また、コボルト「急所突き」の威力と防御無視率を強化しました。",
    kind: "UPDATE", fromDate: "2026-09-05", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-04-trial-tower-intel-ranking-rewards",
    title: "9/4 試練の塔 敵情報・ランキング・報酬アップデート",
    message: "試練の塔60階以降で、挑戦前に敵のスキルと固有効果を確認できる「敵情報」を追加しました。歴代最高到達階を競う実プレイヤー専用ランキングも追加し、同じ階では先に到達したプレイヤーが上位になります。ランキングに接続できない時も塔と報酬はこれまでどおり遊べます。あわせて31階以降の通常階報酬を階層×1,000ゴールドへ変更し、40・50・60・70・80・90・100階のダイヤ報酬を増量しました。召喚書・覚醒オーブ・スキルピッグなどの追加報酬はそのままです。報酬取得状態は従来どおりJSTの毎月1日にリセットされますが、歴代最高到達階は月をまたいで残ります。",
    kind: "UPDATE", fromDate: "2026-09-04", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-04-trial-tower-100-crimoark",
    title: "9/4 試練の塔100階「クリモアーク」実装",
    message: "試練の塔の最上階に、最終ボス「クリモアーク」が登場しました。クリモアークは戦いの最中に自分の分身を生み出します。分身は攻撃型・サポート型・デバフ型の3種類があり、どれが現れるかは毎回ランダムです。同じ型が2体並ぶこともあります。分身が生きている間はクリモアーク本体が受けるダメージが1体につき10%減り、逆に分身を1体倒すとクリモアーク本体の攻撃力と速度が一時的に上がります。分身を先に片づけるか、本体を一気に狙うかが考えどころです。分身は最初は1体までですが、クリモアークのHPが7割を切ると2体まで同時に出てきます。すでに上限まで揃っている時にもう一度分身の技を使うと、生きている分身が回復して行動が早まります。分身の最大HPは生まれた瞬間のクリモアークのHPで決まり、その後は変わりません。クリモアークはHPが7割・4割・2割を切るたびに攻撃力・速度・クリティカルが積み上がり、4割を切ってからは与えるダメージそのものも増えます。4割を切った瞬間には、受けていた弱体をすべて振り払って態勢を立て直してきます。通常のスキル3つに加えて必殺技「オーバークリエイト」を持っており、こちらの強化をすべて剥がし、全体攻撃・行動ゲージ半減・防御ダウン・回復阻害をまとめて叩き込んできます。この技は生きている分身が多いほど威力が上がります。クリモアーク本体を倒せば、分身が残っていてもその階はクリアです。99階までの階は変わっていません。",
    kind: "UPDATE", fromDate: "2026-09-04", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-04-boss-emphasis",
    title: "9/4 ボスが見分けやすくなりました",
    message: "戦闘画面で、その階のボスがどれなのか分かりづらいという声をいただきました。試練の塔・装備ダンジョン（魔人のダンジョン）・魔獣のダンジョンで、ボスをひとまわり大きく表示し、立ち位置も敵の並びの真ん中へ移しました。足元の魔法陣もHPバーの位置も体の大きさに合わせて動くので、大きくなったぶんだけ存在感が出ます。並び順そのものは変えていないので、HPバーの並びや行動順はこれまでどおりです。取り巻きの大きさとカメラの引きも変えていないため、ボス以外の見え方は変わりません。通常ステージと闘技場の見た目は変更ありません。",
    kind: "UPDATE", fromDate: "2026-09-04", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-04-trial-tower-90-rage",
    title: "9/4 試練の塔90階「古代ネメシス」を作り直しました",
    message: "試練の塔90階の関門を、敵5体の新しい編成に作り替えました。ボスは古代ネメシス（闇）で、お供は古代の裂晶（火）・古代の戦鼓晶（電気）・古代の狂牙獣（火）・古代の縛晶（水）の4体です。ボスを倒せば、お供が残っていてもその階はクリアです。この階の狙いは「お供を倒すか、残すか」を選ばせることです。お供を1体倒すごとに、古代ネメシスは攻撃力とクリティカルが永久に上がっていきます。かといって放っておくと、戦鼓晶が味方全員の行動ゲージを進めて古代ネメシスだけスキルの待ち時間を縮め、狂牙獣は戦鼓晶が倒れると牙を剥いて「処刑突撃」の威力を上げてきます。古代ネメシスはHPが7割・4割・2割を切るたびに攻撃力と速度が上がり、4割を切ってからは与えるダメージそのものも増えます。スキル3「絶・終焉の波動」は全体攻撃のうえ、こちらの強化を残らず剥がし、行動ゲージを半分奪って防御を3ターン下げます。裂晶の「脆弱刻印」を受けた仲間は2ターンのあいだ受けるダメージが増えるので、その相手をかばうか、回復を厚くするかの判断が要ります。敵は全員が的中65%・抵抗50%です。90階以外の階は変わっていません。",
    kind: "UPDATE", fromDate: "2026-09-04", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-04-mission-reward-refresh",
    title: "9/4 ミッション報酬の反映とスタミナの持ち越しを修正",
    message: "期間限定ミッションの報酬を受け取っても、ホームのダイヤ・ゴールド・スタミナの表示が古いままになっていた問題を修正しました。受け取った瞬間に反映されます（デイリー・ウィークリー・マンスリー・累計・公開記念・節目・まとめて受け取りのすべて）。あわせてスタミナの扱いを変更し、配布やミッション報酬、ダイヤ50の「+100回復」で得たスタミナは、今の上限を超えたまま持ち続けられるようになりました（例：150/150 に300もらうと 450/150）。上限を超えている間も+100回復を追加で買えます。アプリを開き直しても超過分は消えず、レベルアップで上限が増えても削られません。ただし上限を超えている間は自然回復が進みません。",
    kind: "UPDATE", fromDate: "2026-09-04", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-04-cloud-recovery-warning",
    title: "9/4 アカウント復旧の案内をホームに追加",
    message: "アカウント復旧を登録していない方に、ホームの一番上で登録をおすすめする案内を出すようにしました。登録のやり方も4つの手順で書いてあり、「設定を開いて登録する」を押すとその場所まで移動します。このゲームのデータは端末のブラウザの中だけに保存されているため、履歴やサイトデータを消すと一緒に消えてしまい、機種変更でも引き継げません。復旧IDとパスワードを登録しておけば、別の端末からでもデータを取り戻せます。メールアドレスは必要ありません。案内は登録が終わると自動で消えます。",
    kind: "UPDATE", fromDate: "2026-09-04", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-name-display-fix",
    title: "9/3 名前の表示不具合の修正",
    message: "アリーナのランキングで、代表モンスターを登録していないプレイヤーの名前が「ド…」のように2文字目で切れて読めなくなっていた問題を修正しました。あわせてモンスター図鑑で、カードにモンスターの名前がまったく表示されていなかった問題も修正しました。図鑑の各カードに名前が出るようになります。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-trial-tower-51-99",
    title: "9/3 試練の塔 51〜99階アップデート",
    message: "試練の塔の51〜99階を作り直しました。51〜59階は敵4体、61〜99階は敵5体になり、「群れの階」は51階以降では出なくなりました。階ごとに通常・癒やし・守り・疾風・妨害・弱体・鉄壁・加速・強敵といった狙いを持たせ、その狙いを実際に持つスキルの敵を配置しています。マッシュルン・シェルタートル・コボルト・バジリスク・ミミック・ヴァルキリア・サンダービースト・アビスリーパー・フェンリル・クロノス・ベヒモスの11種も敵として登場し、上の階ほど数が増えます。敵のステータスの伸び方も見直し、上層で数値だけが急に跳ね上がらないようにしました。疾風の階の敵も、手番が回ってこないほどの速度にはなりません。60階には新しい関門「古代の豪魔人」が登場します。古代の魔晶・古代の呪晶を連れており、呪晶は全体に回復不能をまいてきます。豪魔人は5回攻撃を受けるごとにスキル3で反撃し、取り巻きを倒すと豪魔人自身が強くなります。豪魔人を倒せば、取り巻きが残っていてもその階はクリアです。70・80・90・100階の関門は変わっていません。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-x-release-campaign-update",
    title: "CRIMON公開記念キャンペーン開催",
    message: "Xでの公開を記念して、10月3日までの1か月限定キャンペーンを開催します。ミッションに「公開記念」タブを追加し、ログイン・育成・召喚・ダンジョン・アリーナ・試練の塔を遊ぶと全30個の報酬を受け取れます。10個・20個・25個・30個達成時には、さらに豪華な節目報酬があります。毎日欠かさず遊ばなくても全達成を目指せる内容です。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-x-release-gift",
    title: "X公開記念プレゼント",
    message: "CRIMONの公開を記念して、9月10日までに一度だけ受け取れるプレゼントです。ダイヤ2,000個・500,000ゴールド・召喚の書10枚をお贈りします。",
    kind: "CELEBRATION", fromDate: "2026-09-03", toDate: "2026-09-10", crystal: 2_000, gold: 500_000, summonScrolls: 10,
  },
  {
    id: "2026-09-03-crystal-shop",
    title: "9/3 ダイヤショップ登場",
    message: "ショップにダイヤの棚を追加しました。ゴールド交換（200,000G / 1,200,000G / 3,000,000G）は回数制限なしで、まとめて交換するほどダイヤ1個あたりのゴールドが増えます。育成では★3MAX転生ピッグを週に1回、★4MAX転生ピッグを月に1回。召喚では★4以上召喚書を月に2回、★4以上光闇召喚書を月に1回まで交換できます。残りの回数は札に出るので、買う前に確認できます。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-economy-rebalance",
    title: "9/3 ゴールドまわりの見直しアップデート",
    message: "ゴールドダンジョンの報酬を大きく引き上げました。1階50,000G / 2階100,000G / 3階180,000G / 4階250,000G / 5階380,000G です（5階建て・1日3回は変わりません）。あわせて装備の強化費用を★と強化値ごとの表に作り直し、+0から+15までの合計は★3で141,000G、★4で270,000G、★5で878,000G、★6で1,346,000Gになります。強化は必ず成功し、失敗も破壊も強化値の低下もありません。装備ショップの値段は★とサブオプションの初期数だけで決まるようになり、中身の良し悪しでは変わりません。クリエイトの費用は、タイプ転生300,000G / 能力リセット300,000G / 潜在覚醒500,000G / スキル継承は一律500,000Gに統一しました。能力の振り分けは「この配分で確定する」を押すまで何度でもやり直せ、確定した後の変更は能力リセットで行います。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-arena-shop-goals-defense-coins",
    title: "9/3 アリーナショップ拡張アップデート",
    message: "アリーナショップに経験ピッグ★4、スキルピッグ、転生ピッグ★5、★5召喚書などを追加しました。★5召喚書とスキルピッグセットは、コインを貯めて狙えるシーズン商品です。覚醒オーブは価値に合わせて価格と交換上限を見直しました。また、オンラインの防衛成功でもアリーナコインを受け取れるようになりました。",
    kind: "UPDATE", fromDate: "2026-09-03", toDate: "9999-12-31", crystal: 0, gold: 0, summonScrolls: 0,
  },
  {
    id: "2026-09-03-arena-rematch-and-reroll",
    title: "9/3 アリーナの操作アップデート",
    message: "対戦の結果画面を整理しました。勝った時は「相手を選び直す」から、すぐ挑戦相手の一覧へ戻れます。負けた時は「同じ相手にもう一度」で挑み直せます。挑戦相手の一覧では「相手を変える」を一覧の下にも置き、1戦につき3回まで使えるようにしました。使い切っても1戦すればまた変えられます。あわせて、ランキングの全国順位が配信版でも表示されるようになりました。",
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
    message: "所持モンスター・所持装備・モンスター強化の素材一覧・ランクアップの素材一覧を軽量化しました。大量に所持している場合でも全カードを一度に画面へ生成せず、最初の24件から段階的に表示する方式へ変更しています。所持数やセーブデータの形式は変更していません。",
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
