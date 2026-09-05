import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Element } from "../../core/element.js";
import { MonsterDefinition } from "../../core/monster.js";
import { ArenaHandles, createArena } from "./arena.js";
import { BackdropHandles, BattleVenue, backdropUrlFor, createBackdrop } from "./stageBackdrop.js";
import { SPRITE_MAX_HEIGHT } from "./spriteAvatar.js";
import { dominantElement, moodFor, StageMood } from "./elementTheme.js";
import { BattleAvatar, createBattleAvatar } from "./avatarFactory.js";
import { CinematicPass } from "./postfx/cinematicPass.js";
import { HitStyle, StatusAuraKind, VfxElement, VfxSystem } from "./vfx.js";

export interface StageUnitInit {
  instanceId: string;
  def: MonsterDefinition;
  team: "PLAYER" | "ENEMY";
}

/** バトル画面のHTML側が知りたい、各ユニットの画面上の位置(HPバー等の追従用) */
export interface ScreenAnchor {
  instanceId: string;
  /** いまの本体の頭上。**モーションで動く。**ダメージの数字はここへ出す */
  x: number;
  y: number;
  /**
   * 立ち位置から見た頭上。**モーションで動かない。**
   *
   * HPの札はこちらを使う。動く方に合わせていたら、待機の漂いと
   * 攻撃の踏み込みがそのまま札へ伝わり、**画面全体がガタついて読めなかった**
   * (依頼主から「キャラの位置が動いていて見づらい」と指摘を受けた)。
   */
  slotX: number;
  slotY: number;
  /** カメラ後方など、画面に映っていない場合はfalse */
  visible: boolean;
  /** 遠いユニットのUIを少し小さくするための倍率 */
  scale: number;
}

/**
 * カメラの方位角(度)。
 *
 * **左右に分かれた配置になったので0にしてある。**
 * 以前は手前が味方・奥が敵という奥行きの配置で、真正面から見ると
 * 自軍が真後ろからしか映らなかったため、回り込んで斜めから見ていた。
 * いま両チームは左右に立ち、どちらも横向きの姿を見せているので、
 * 回すと**列が斜めに傾いて左右の対称が崩れる**だけになる。
 *
 * 手で回す `orbitYaw` はそのまま効く(自分のモンスターを覗き込むため)。
 */
const CAMERA_AZIMUTH_DEG = 0;

/** 指を横へ画面幅いっぱい滑らせた時に回る角度(ラジアン) */
const ORBIT_SPEED = Math.PI * 1.1;
/**
 * 手で回せる範囲。真後ろまで回れると自陣と敵陣が入れ替わって
 * どちらが自分か分からなくなるので、左右それぞれ100度で止める。
 * 自分のモンスターの顔を覗き込むには十分な角度。
 */
const ORBIT_LIMIT = THREE.MathUtils.degToRad(100);

/** 演出の中心に使う、盤面のおおよその奥行き */
const FIELD_DEPTH = 4.0;

/**
 * 画面の縦長さの度合い(0=横長、1=かなり縦長)。
 *
 * 左右に分かれた配置では、必要な幅は「2つの列の間隔」で決まって動かない。
 * 余るのは常に縦方向なので、**縦長の画面ほど前後の間隔を広げて**
 * 余った縦を使う。逆に横長の画面では詰める。
 */
function portraitAmount(aspect: number): number {
  return THREE.MathUtils.clamp((0.8 - aspect) / 0.4, 0, 1);
}

/**
 * 1チームの最大人数。**装備ダンジョンは敵が5体。**
 *
 * 4体しか想定していないと、5体目が画面の外へ出る。
 * 盤面の大きさは常にこの人数で決めるので、
 * 4体の戦いでも5体の戦いでもモンスターの大きさが変わらない。
 * 戦うたびに縮んだり伸びたりすると、格が変わったように見える。
 */
const MAX_TEAM_SIZE = 5;

/**
 * 味方と敵を分ける左右の距離。**味方が左、敵が右。**
 *
 * 以前は手前(+Z)が味方・奥(-Z)が敵という奥行きの配置だった。
 * 3Dモデルなら成立するが、2Dの絵は横向きの姿しか持たないので、
 * 奥行きで分けると**両チームが同じ方を向いて並ぶ**ことになる。
 * 左右に分ければ、絵の向きがそのまま「向かい合っている」に読める。
 *
 * ## 1列ではなく、片側2列の千鳥にする
 *
 * 依頼主の示した参考画面(AFK Arena)は、**片側が2列で、
 * 手前の列が奥の列の半歩ぶん下へずれている。** 一列に縦へ並べていた時と比べて
 *
 *   - 盤面の縦が半分になる。カメラが寄れるので**1体が大きく映る**
 *   - 前衛と後衛が絵として読める
 *   - 隣どうしが少し重なる。参考画面でも重なっていて、それが密度になっている
 *
 * `LANE_INNER` が中央寄りの列、`LANE_INNER + LANE_GAP` が外側の列。
 * 画面の左右の端はHPと行動ゲージの札が使うので、外側の列でも端までは出さない。
 */
const LANE_INNER = 1.0;
/** 内側の列と外側の列の隔たり */
const LANE_GAP = 1.15;
/** 横長の画面で左右へ広げる追加ぶん。横に余るので、その余りを列の間隔に使う */
const LANE_X_WIDE = 2.4;

/**
 * 千鳥の段の間隔(前後方向)。
 *
 * **隣り合う段は別の列に入る**ので、ここは「同じ列の間隔の半分」にあたる。
 *
 * **札が本体に重ならない値にしてある。**依頼主から
 * 「HPバーがモンスターと被っている」という指摘を受けた。
 * 段の間隔(画面上で約124px)から本体の背丈(約72px)を引いた残り52pxに、
 * 細い帯の札(状態異常18px + HP 7px + ゲージ4px + 内側の隙間4px = 33px)と、
 * 本体の頭との隙間16pxが入る。
 *
 * `SPRITE_SCALE` と対で決まる。**片方だけ触ると必ずまた重なる。**
 * `tests/stageBackdrop.test.ts` が両者の比を見張っている。
 */
const RUNG = 3.15;

/**
 * 見下ろし角(44〜48度)の cos の見込み。
 *
 * 盤面の枠を決める時、まだカメラの角度が確定していない
 * (角度は表示範囲から決まり、表示範囲は枠から決まる)。
 * 角度の振れ幅は4度しかないので、真ん中の値で見込んでおけば足りる。
 */
const TILT_COS = 0.70;

/**
 * その階の主を大きくする倍率。
 *
 * ## なぜ要るか
 *
 * 依頼主から「ボスが分かりづらい」と指摘を受けた。実際、名前は
 * 【BOSS】と付くが**盤面の絵は取り巻きと同じ大きさ**で、
 * 5体が縦に並ぶ試練の塔と装備ダンジョンでは、どれが主なのか絵から読めない。
 *
 * 役割の背丈(`spriteAvatar.ts` の ROLE_HEIGHT)を上げる手もあるが、
 * あれは図鑑の役割そのもので、**古代ネメシスの役割は「アタッカー」**。
 * 役割を書き換えると図鑑とAIの当たり方まで変わる。
 * 見た目だけの話なので、盤面の側で倍率を掛ける。
 *
 * ## 1.3 が上限すれすれではない理由 —— 枠(`yTop`)を1mmも動かさずに済む
 *
 * **最初は枠も一緒に上げた。それは間違いだった。**
 * `yTop` を 1.3倍にしたら、カメラが引いて**取り巻きが4.2%小さくなった**
 * (味方の段の間隔が実測111.7px → 107.0px)。
 * 主を大きくしたつもりで盤面全体が縮むのでは、意味が逆になる。
 *
 * 上げなくてよい。枠の天井は `SPRITE_MAX_HEIGHT / TILT_COS` で、
 * 見下ろし角ぶん(0.70)の割り戻しが**もともと1.43倍の余裕として入っている。**
 * いちばん背の高い役割(ボス2.95)を1.3倍しても
 *
 *   2.95 × 1.3 × SPRITE_SCALE = 1.99  <  2.95 × SPRITE_SCALE / 0.70 = 2.19
 *
 * で天井に届かない。**つまり 1/TILT_COS = 1.428 までなら枠は動かさなくてよい。**
 * ここを超える値にする時は、枠と取り巻きの大きさを対で測り直すこと
 * (`tests/bossEmphasis.test.ts` が両者の関係を見張っている)。
 *
 * 実測(390×844・試練の塔90階)で、カメラの写す高さは main と同じ 7.5647。
 * **取り巻きは1pxも縮んでいない。**
 */
const BOSS_BODY_SCALE = 1.3;

/**
 * 板の半幅の見込み。
 *
 * 実際の幅は絵の縦横比で決まる。最大は横長のゴーレム(512×420)で、
 * 背丈2.45 × 表示倍率0.52 × 縦横比1.22 ÷ 2 = 0.78。少し余裕を足してある。
 * ここが足りないと、列が画面の端で切れる(実際にゴーレムが切れた)。
 *
 * **`spriteAvatar.ts` の `SPRITE_SCALE` と対で決まる。**片方だけ触らない。
 */
const SPRITE_HALF_WIDTH = 0.80;

/**
 * 背景の絵を暗く落とす量。
 *
 * 最初に届いた闘技場は床の明るさが0.75あり(`tools/prepareBackgrounds.mjs` が測る)、
 * 砂色の石畳の上でモンスターの輪郭が埋もれたので0.24まで落としていた。
 *
 * **8属性ぶんが揃った時、絵の側が既に暗く描かれていた**(明るさ0.62以下)。
 * 落としすぎると今度は舞台が真っ黒になり、せっかくの絵が見えない。
 * 明るい絵が1枚混ざっても耐えられる程度に留める。
 */
const BACKDROP_DIM = 0.10;
/**
 * 背景の左右の端と下を落とす量。
 *
 * 最初に届いた1枚は端が落ちておらず、載せる側で0.34まで落としていた。
 * **8属性ぶんは絵の側で落として描かれていた**ので、二重に落とすと
 * 画面の左右が黒い帯になる。ここは仕上げの締めだけに使う。
 *
 * 札も細い帯になり、端に固定するのをやめた(本体の頭の上へ移した)ので、
 * 「札を読ませるために端を暗くする」という当初の理由自体が薄れている。
 */
const BACKDROP_EDGE = 0.14;

/**
 * 画面の上でUIが覆う割合。盤面はここを避けて収める。
 *
 * 上は階層名と自動・速度・再生の並び(`.battle-topbar` の実測が76px = 0.090)。
 * 下はスキルの操作欄(`.skill-dock` の手動時が約110px = 0.130)。
 *
 * **手動戦闘での高さで測る。**自動では操作欄が22pxまで畳まれるが、
 * 畳まれた高さで組むと、自動へ切り替えた瞬間に盤面が跳ねる。
 */
const SAFE_BAND_TOP = 0.09;
const SAFE_BAND_BOTTOM = 0.13;

/**
 * 立ち位置。**左右に分かれ、片側は2列の千鳥に並ぶ。**
 *
 * 味方は左、敵は右。片側の中は「段」を手前(+Z)から奥(-Z)へ数え、
 * **段ごとに外側の列と内側の列を交互に使う。**
 *
 * ```
 *   外側の列  内側の列              ← 味方(左)
 *     ●                            段0(手前)
 *              ●                   段1
 *     ●                            段2
 *              ●                   段3
 *     ●                            段4(奥)
 * ```
 *
 * 5体なら外側に3体・内側に2体が入り、参考画面(AFK Arena)と同じ形になる。
 * 4体なら2体ずつ。**人数が変わっても段の間隔は変えない**ので、
 * 4体の戦いと5体の戦いでモンスターの大きさが変わらない。
 *
 * カメラは正投影(遠近なし)なので、奥に立っても小さくならず、
 * 画面中央へ寄りもしない。どの段の1体も同じ大きさで映る。
 */
function slotPositions(
  count: number,
  team: "PLAYER" | "ENEMY",
  /** 段の間隔(前後方向) */
  rung = RUNG,
  /** 中央寄りの列までの距離 */
  laneInner = LANE_INNER,
  /** 内側の列と外側の列の隔たり */
  laneGap = LANE_GAP,
): { x: number; z: number }[] {
  if (count <= 0) return [];
  const side = team === "PLAYER" ? -1 : 1;
  const total = (count - 1) * rung;

  return Array.from({ length: count }, (_, i) => {
    // 先頭(i=0)が手前。奥へ向かって段が進む
    const z = total / 2 - i * rung;
    /*
     * 偶数段を外側、奇数段を内側へ。
     *
     * **先頭を外側から始める。** 内側から始めると5体の時に
     * 内側が3体・外側が2体になり、内側の列が中央へ寄りすぎて
     * 敵の列とぶつかる(390pxの画面では実際にぶつかる)。
     */
    const x = side * (laneInner + (i % 2 === 0 ? laneGap : 0));
    return { x, z };
  });
}

/**
 * その階の主を、隊列の**真ん中の席**へ入れ替える。
 *
 * 返すのは「その並び順の何番目が、どの席に立つか」。
 * 席そのもの(`slotPositions`)は動かさない。**動かすのは誰がどこに立つかだけ。**
 *
 * ## 並びを入れ替えず、席の割り当てだけを入れ替える理由
 *
 * `list` の順番は、HPの札・行動順・狙う相手の選択と全部つながっている。
 * ここで配列そのものを並べ替えると、絵は真ん中に来るのに
 * **札と行動順だけ元の位置に残る。**入れ替えるのは席だけにする。
 *
 * 主が居ない盤面(通常ステージ・アリーナ)では何もしない。
 */
function slotOrderWithBossCentered(units: { def: { isBoss?: boolean } }[]): number[] {
  const order = units.map((_, index) => index);
  // 3体未満だと「真ん中」が端と同じになる。入れ替える意味が無い
  if (units.length < 3) return order;
  const bossIndex = units.findIndex((unit) => unit.def.isBoss);
  if (bossIndex < 0) return order;
  const middle = Math.floor(units.length / 2);
  [order[bossIndex], order[middle]] = [order[middle], order[bossIndex]];
  return order;
}

/**
 * 主の立ち位置。**真ん中の段の、内側の列。**
 *
 * ## 段だけ真ん中にして、列を放っておくと画面から切れる
 *
 * 段(前後)と列(左右)は `slotPositions` で連動していて、段が偶数番なら外側の列。
 * 3体の階では真ん中の段がちょうど外側にあたる。そこへ1.3倍の主を置いたら、
 * **画面の右端から56pxはみ出した**(390px幅・装備ダンジョン1階で実測)。
 *
 * 枠(`halfWidth`)を広げて逃げると、今度はカメラが引いて取り巻きが縮む。
 * 主は大きいのだから、**列は内側に置く**のが素直で、
 * 依頼の「真ん中に」にも近い。段は真ん中のまま動かさない。
 */
function bossStandPosition(slot: { x: number; z: number }, laneInner: number): { x: number; z: number } {
  return { x: Math.sign(slot.x) * laneInner, z: slot.z };
}

/**
 * 役割ごとの当たり方の質感。
 * 前衛の物理職は斬撃(弧を描く軌跡)、重量級は打撃(放射状の衝撃)、
 * 支援・術者系は魔法(粒子と紋様)で、同じダメージでも印象を変える。
 */
const HIT_STYLE_BY_ROLE: Record<string, HitStyle> = {
  アタッカー: "slash",
  ディフェンダー: "blunt",
  ボス: "blunt",
  ヒーラー: "magic",
  サポート: "magic",
  デバッファー: "magic",
  バランス型: "pierce",
  素材: "blunt",
};

/**
 * エフェクトの大きさを、**モンスターの背丈から**決める係数。
 *
 * ## 画面の縦を基準にするのをやめた理由
 *
 * 以前は「画面の縦がワールド何単位ぶん映っているか」を基準にしていた。
 * これだと**構図を変えるたびにエフェクトの大きさが勝手に動く。**
 * 実際に2回続けて壊した。
 *
 *   1. UIの帯を避けて表示範囲を1.35倍に広げたら、エフェクトだけが1.35倍になり、
 *      守りのドームが本体を丸ごと覆う白い泡になった
 *   2. 隊列を千鳥にして表示範囲が半分になったら、今度は全部が半分になった
 *
 * エフェクトは**本体に付くもの**なので、本体の背丈に比例させる。
 * こうすれば構図をどう変えても、本体との釣り合いは動かない。
 * 画面を覆わないための上限だけは、引き続き画面の縦から掛ける。
 *
 * 値は、3Dモデル(背丈2.45)の頃に見て決めた寸法から逆算してある。
 */
const VFX_PER_SPRITE_HEIGHT = 0.175;

/**
 * 状態異常のオーラ(守りのドーム・免疫・気絶・継続回復)の大きさ。
 *
 * **ここだけ、画面にもモンスターにも一切追従していなかった。**
 * 大きさを渡さずに呼んでいたので、既定の1のまま固定されていた。
 * 守りのドームは半径1.35で、絵を0.52倍にした本体(背丈1.27)の
 * **2倍以上の白い球**になり、味方5体が丸ごと泡に包まれた。
 *
 * 基準は3Dの骨格でいちばん背の高いボス(2.95)。
 * そこからの縮み具合をそのままオーラへ渡せば、本体を軽く包む大きさになる。
 */
const AURA_SCALE = SPRITE_MAX_HEIGHT / 2.95;

/**
 * パーティクルの密度。1未満にすると粒の数が減る。
 * 加算合成のエフェクトは重なるほど明るくなるので、
 * 画面が白く飽和しない範囲に密度を落としてある。
 */
const VFX_DENSITY = 0.5;

/** エフェクト板1枚あたりの濃さ。重なりでの飽和を抑えるため薄くしてある */
const VFX_OPACITY = 0.42;

/** 1枚のエフェクト板が占めてよい、画面の高さに対する最大割合 */
const VFX_MAX_SCREEN_RATIO = 0.16;

/** そのユニットに今かかっている状態。継続エフェクトの出し分けに使う */
export interface UnitStatusFlags {
  poison: boolean;
  burn: boolean;
  shield: boolean;
  immune: boolean;
  stun: boolean;
  regen: boolean;
  buff: boolean;
  debuff: boolean;
}

/** カメラに必ず収めたい領域(ワールド座標) */
interface FrameBox {
  halfWidth: number;
  zNear: number;
  zFar: number;
  yBottom: number;
  yTop: number;
}

export class BattleStage {
  readonly element: HTMLElement;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  /**
   * 見る目。**正投影(遠近なし)。**
   *
   * 透視投影では、奥に立つモンスターほど小さく映る。左右2列の隊列だと
   * 「同じ列なのに1番目と4番目で大きさが違う」ことになり、
   * 実測で手前のスライムが奥のフェアリーの2.5倍あった。
   * 望遠に寄せて誤魔化していたが、寄せるほどカメラが遠のいて舞台が窮屈になる。
   *
   * 正投影なら**距離が大きさに一切関係しない。**
   * 4体が同じ大きさで、列がまっすぐ縦に並ぶ。
   * 2Dの絵を並べる画面には、そもそもこちらが正しい。
   */
  private readonly camera: THREE.OrthographicCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly cinematicPass: CinematicPass;
  /** そのバトルの空気(空・霞・石・灯りの色)。敵の顔ぶれから決まる */
  private readonly mood: StageMood;
  /** 3Dで組んだ闘技場。**1枚絵の舞台がある時は組まない**ので null */
  private readonly arena: ArenaHandles | null;
  /**
   * 1枚絵の舞台。絵がある時だけ作られ、その時は3Dの闘技場を出さない。
   *
   * **どちらを出すかは「絵があるかどうか」で決める。**
   * 旗で切り替える形にすると、絵が1枚も無い状態で旗を立てて
   * 真っ黒な戦闘画面になる。絵の有無で決めれば、その事故が起きない。
   */
  private readonly backdrop: BackdropHandles | null;
  /**
   * 接地影。**モンスターが床に立って見えるかは、ほぼこれで決まる。**
   *
   * 平行光の影だけだと、足元に集まる各種の光(属性ライト・足元のオーラ・
   * 加算の霞)に持ち上げられて消える。乗算合成の板を1枚ずつ足元へ敷き、
   * どんな光が来ても必ず床が暗くなるようにしている。
   * (乗算は「掛け算」なので、上に光を足しても比率として残る)
   */
  private readonly contactShadows: { mesh: THREE.Mesh; avatar: BattleAvatar }[] = [];
  /** 闘技場から焼いた映り込み用の環境マップ。破棄時に手放す */
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private readonly vfx = new VfxSystem();
  private readonly avatars = new Map<string, BattleAvatar>();
  /** その席が今どの姿で組まれているか。同じ姿での組み直しを避けるための控え */
  private readonly avatarStyles = new Map<string, string>();
  /** エフェクトの出し分けに使う、ユニットごとの属性 */
  private readonly unitElements = new Map<string, VfxElement>();
  /** 当たり方の質感。役割から決める(前衛は斬撃、重量級は打撃、後衛は魔法) */
  private readonly unitHitStyles = new Map<string, HitStyle>();
  /** 現在そのユニットに出している継続エフェクトの種類 */
  private readonly activeAuras = new Map<string, Set<StatusAuraKind>>();
  private readonly resizeObserver: ResizeObserver;
  private readonly clock = new THREE.Clock();

  /** 見下ろし角と距離から毎回組み立てる、フレーミング後のカメラ基準位置 */
  private readonly cameraBase = new THREE.Vector3(0, 5.4, 20);
  private readonly cameraTarget = new THREE.Vector3(0, 1.42, -0.25);
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraLookOffset = new THREE.Vector3();
  private readonly desiredCameraOffset = new THREE.Vector3();
  private readonly desiredLookOffset = new THREE.Vector3();
  private readonly tmpVector = new THREE.Vector3();
  private readonly tmpRelative = new THREE.Vector3();
  /** 画面のタップ位置から3Dの本体を拾うための道具 */
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  /** 両チームが必ず収まる箱。setupUnitsで実際のスロット位置から作る */
  private frameBox: FrameBox = { halfWidth: 5.4, zNear: 4.4, zFar: -4.9, yBottom: -0.1, yTop: 3.3 };
  /** 画面比が変わった時に隊列を組み直すための控え */
  private formation: {
    avatar: BattleAvatar;
    light: THREE.PointLight;
    team: "PLAYER" | "ENEMY";
    index: number;
    count: number;
    /** その階の主。画面比が変わって組み直す時も、内側の列へ置き直すために要る */
    isBoss: boolean;
  }[] = [];
  /** 最後に隊列を組んだ時の縦長さ。変わっていなければ組み直さない */
  private formationPortrait = -1;
  /** いまアバターへ渡している見下ろし角。途中で組み直した1体にも同じ角度を渡す */
  private avatarPitch = 0;
  /** フレーミングで決まったカメラ距離。UIの遠近スケールの基準にも使う */
  private frameDistance = 20;

  /** 手で回した角度(実際に適用されている値。目標へ滑らかに寄る) */
  private orbitYaw = 0;
  /** 手で回した角度の目標値 */
  private orbitYawTarget = 0;
  private dragPointerId: number | null = null;
  private dragLastX = 0;
  /** 最後にフレーミングをやり直した時の回り込み角 */
  private framedYaw = 0;
  private viewWidth = 1;
  private viewHeight = 1;

  private shakeStrength = 0;
  private hitStopRemaining = 0;
  private frameHandle: number | null = null;
  /**
   * 描く画素の倍率。**端末の性能に合わせて動かす。**
   *
   * 以前は端末の値をそのまま(上限2)使っていた。今どきのスマホは3倍なので
   * 2倍で描くことになり、430x932の画面が 860x1864 = 約160万画素。
   * そこへHDRバッファ・ブルームの多段・ACESが乗るので、**画素の数がそのまま
   * 重さになる。**見た目の差より、動きの滑らかさの方がずっと効く。
   */
  private pixelScale = 1;
  /** 直近のフレーム時間の移動平均(ミリ秒)。可変解像度の判断に使う */
  private frameMs = 16.7;
  /** 解像度を下げた後、次に触るまでの猶予。毎フレーム上下すると画面がちらつく */
  private pixelCooldown = 0;
  /** 構図から決まる演出の基準の大きさ。重い端末ではここから更に絞る */
  private vfxSizeScale = 1;
  /**
   * 今の軽量化の段。0=そのまま / 1=後処理の飾りを止める / 2=にじみも止める。
   *
   * 画素を下限まで落としても追いつかない端末があるので、段を分けて更に降ろす。
   * **見た目より、動きの滑らかさを優先する。**カクつく画面はどんなに綺麗でも
   * 気持ちよく遊べない。
   */
  private downgradeStep = 0;
  private disposed = false;
  private elapsed = 0;

  constructor(container: HTMLElement, units: StageUnitInit[], venue?: BattleVenue) {
    this.element = container;

    /*
     * **MSAAは切る。**描画はEffectComposerの自前バッファへ行くので、
     * キャンバス側のアンチエイリアスはほぼ効かない。効かないものに
     * サンプル数ぶんの帯域を払うことになる。輪郭はブルームと
     * cinematicPass のコントラストで足りている。
     */
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(this.targetPixelRatio());
    this.renderer.shadowMap.enabled = true;
    /*
     * PCFSoft はいちばん重い絞り方。影は接地の役目が果たせれば十分で、
     * 縁の柔らかさに払う価値はスマホでは無い。
     */
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // 露出は「白飛びしない」ことを最優先に、やや低めで固定する
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "battle-stage__canvas";
    container.append(this.renderer.domElement);

    const { width, height } = this.measure();
    // 表示範囲は frameCamera が毎回決める。ここは仮の値
    this.camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 340);
    void width;
    void height;

    // その戦いの空気を、敵チームで最も多い属性から決める。
    // 空・霞・石・灯り・グレーディングまで一式がここから流れる。
    // (以前は全ステージが同じ紫の室内で、どの戦いも同じ絵に見えていた)
    const enemyElements = units.filter((u) => u.team === "ENEMY").map((u) => u.def.element as Element);
    this.mood = moodFor(enemyElements);
    const stageElement = dominantElement(enemyElements);

    // 霧の色は空のシェーダの地平線色(arena.ts の uHaze)と合わせてある。
    // 遠景がそのまま霞へ溶ける。**両方を同時に変えること。**
    // どちらも StageMood から来るので、ここを固定色に戻さないこと。
    //
    // 体表シェーダは fog を組み込んでいないので、濃くしても手前の
    // モンスターは白まず、闘技場だけが奥へ退く。空気遠近が付いて、
    // 観客席と列柱が「遠い」と読めるようになる
    this.scene.fog = new THREE.FogExp2(this.mood.haze.getHex(), this.mood.fogDensity);

    /*
     * 舞台。**1枚絵があればそちらを出し、3Dの闘技場は出さない。**
     *
     * 両方出すと、絵の後ろに隠れる列柱や観客席を描き続けることになる。
     * 見えないものに描画回数を払うのは、この案件でいちばん避けたい形
     * (実効31.5fpsまで落ちた原因がまさにそれだった)。
     */
    const backdropUrl = backdropUrlFor(stageElement, venue);
    this.backdrop = backdropUrl
      ? createBackdrop({ url: backdropUrl, dim: BACKDROP_DIM, edge: BACKDROP_EDGE })
      : null;
    /*
     * 3Dの闘技場は**絵が無い時だけ組む。**
     * 作ってから足さない選択にすると、床のテクスチャを毎回焼き、
     * 観客席のインスタンスを積んだうえで捨てることになる。
     */
    this.arena = this.backdrop ? null : createArena(this.mood);
    if (this.backdrop) {
      /*
       * カメラの子にする。カメラ自身は scene に入っていないので、
       * **カメラも scene へ足す。**忘れると背景だけが描かれない
       * (three は scene の木を辿って描くものを集める)。
       */
      this.camera.add(this.backdrop.mesh);
      this.scene.add(this.camera);
      // 霧は3Dの闘技場を奥へ退かせるための仕掛け。絵にすると全体が霞むだけ
      this.scene.fog = null;
    } else if (this.arena) {
      this.scene.add(this.arena.group);
    }
    this.scene.add(this.vfx.root);

    this.setupLights();
    this.setupEnvironment();
    this.setupUnits(units);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.targetPixelRatio());
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // ブルームは RenderPass 直後(=トーンマッピング前のリニアHDR)にかかる。
    // しきい値を1超えに置くことで、本当に明るい部分だけが滲むようにしている。
    //
    // **上げるなら threshold ではなく strength。** しきい値を下げると、
    // それまで滲まなかった中間調まで一斉に滲みだし、加算合成のVFXと
    // 重なった瞬間に飽和する。強度なら「もともと滲んでいたもの」が
    // 少し広がるだけなので、増え方が上限に対して線形で読める
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.24, 0.5, 1.15);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // 仕上げはトーンマッピング後(sRGB)に適用する。
    //
    // **色調の設計はここで行う。** ライト側で寒暖を割ろうとすると、
    // モンスターの体表シェーダが自前の固定光源で陰影を焼いている都合で
    // キャラと背景の光がずれる(合成写真のように浮く)。合成後の1枚に
    // 掛けるこちらなら、キャラも闘技場も同じ色調に乗る。
    //
    // 暗部は青緑寄りの冷たい色、明部は琥珀。以前は暗部が青紫で、
    // 空の紫・桃色のリムと同じ方向を向いていたため、寒暖が割れずに
    // 画面全体が「青紫一色」になっていた。暗部を紫から離すだけで、
    // 明るさを一切足さずに寒暖の対が立つ
    this.cinematicPass = new CinematicPass({
      vignette: 0.44,
      aberration: 1.0,
      grain: 0.045,
      // 中間調の彩度はモンスターの属性色がいちばん効くところ。
      // ライト側の色かぶりを落としたぶん、ここで少し戻す
      saturation: 1.12,
      contrast: 0.15,
      tintStrength: 0.19,
      // ステージの空気に合わせて寒暖を割る。**必ず対にすること。**
      // 暗部と明部を同じ色相にすると、彩度をいくら上げても一色の絵になる
      shadowTint: this.mood.gradeShadow,
      highlightTint: this.mood.gradeHighlight,
    });
    this.composer.addPass(this.cinematicPass);

    this.setupOrbitControl();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);
    this.handleResize();

    // 開発時だけ、シーンの中身を外から覗けるようにしておく(見た目の不具合調査用)。
    // 本番ビルドではこのブロックごと落ちる。
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__crimonStage = this;
    }

    this.start();
  }

  private measure(): { width: number; height: number } {
    const rect = this.element.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  }

  /**
   * 接地影の板。中心が暗く外へ向かって白へ抜ける乗算用の絵。
   *
   * 白(1.0)を掛けても床は変わらないので、外周は必ず白で終わらせること。
   * ここに透明を使うと乗算合成では「掛ける値が0」になり、板の四角が
   * まるごと真っ黒に落ちる。
   */
  private static readonly padTextures = new Map<string, THREE.Texture>();

  private static contactShadowTexture(rim: string): THREE.Texture {
    const cached = BattleStage.padTextures.get(rim);
    if (cached) return cached;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2Dコンテキストを取得できませんでした");
    /*
     * **暗さは色ではなくアルファで持つ。**
     *
     * 最初は「白い下地に灰色の円」を乗算合成で敷いていた。理屈の上では
     * 縁(白)は素通し・中心(灰)だけが沈むはずだが、実際には
     * **縁まで含めた四角い板が明るく塗られた**。この描画経路は
     * EffectComposer の半精度浮動小数バッファを挟んでおり、
     * 乗算合成がそのまま効かない。
     *
     * 透明な下地に黒を落としておけば、合成方法に頼らず必ず暗くなる。
     * 四角い縁が出ることも原理的に起こらない(縁のアルファが0のため)。
     */
    ctx.clearRect(0, 0, 128, 128);
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0.0, "rgba(4, 6, 14, 0.62)");
    gradient.addColorStop(0.38, "rgba(4, 6, 14, 0.42)");
    gradient.addColorStop(0.72, "rgba(4, 6, 14, 0.14)");
    gradient.addColorStop(1.0, "rgba(4, 6, 14, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    /*
     * 陣営色の縁取り。**参考画面(AFK Arena)で最も効いている部品。**
     *
     * 影だけだと、明るい石畳の上では「そこに立っている」ことは分かっても
     * **味方か敵かが分からない。**千鳥に組んで左右が近づいたぶん、
     * どちらの列かを色で言い切れる手掛かりが要る。
     *
     * 内側へ向けてぼかすので、輪(リング)ではなく淡い台座に見える。
     */
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = rim;
    ctx.lineWidth = 7;
    ctx.shadowColor = rim;
    ctx.shadowBlur = 9;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    BattleStage.padTextures.set(rim, texture);
    return texture;
  }

  /**
   * 陣営ごとの台座の縁の色。
   *
   * 味方は青緑、敵は琥珀。**属性色は使わない。**
   * 属性色にすると、火属性の味方と火属性の敵が同じ色の台座に立つ。
   * 台座に持たせたい情報は属性ではなく「どちらの側か」。
   */
  private static padRim(team: "PLAYER" | "ENEMY"): string {
    return team === "PLAYER" ? "rgba(122, 235, 205, 0.72)" : "rgba(255, 172, 88, 0.72)";
  }

  /**
   * 足元に台座を敷く。中心の影と、陣営色の縁取り。
   *
   * 取りまとめ役の指摘「床の上に貼った絵のように浮いて見える」の本体はここ。
   * 平行光の影は落ちていたが、足元には属性ライト・足元のオーラ・加算の霞が
   * 重なっていて、影の分の暗さがそのぶん持ち上げられ、結果として
   * 「足元だけ明るい」状態になっていた。乗算合成なら後から光を足されても
   * 比率として暗さが残るので、必ず接地して見える。
   */
  private addContactShadow(avatar: BattleAvatar, team: "PLAYER" | "ENEMY"): void {
    const proxy = avatar.hitArea as THREE.Mesh;
    const params = (proxy.geometry as THREE.BoxGeometry).parameters;
    // 当たり判定の箱は footprint の 1.15 倍で作られている
    const footprint = (params?.width ?? 1.4) / 1.15;
    const geometry = new THREE.PlaneGeometry(footprint * 2.0, footprint * 2.0);
    const material = new THREE.MeshBasicMaterial({
      map: BattleStage.contactShadowTexture(BattleStage.padRim(team)),
      transparent: true,
      depthWrite: false,
      // 影がブルームのしきい値を越えることはないので、トーンマップには乗せる。
      // 外すと床だけ別の明るさの世界になり、境目が出る
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    // 床の魔法陣より上、体より下。ここを上げすぎると足首の高さで切れる
    mesh.position.y = 0.02;
    // 透明の列の先頭で敷く。後から来る加算の演出はこの上に乗る
    mesh.renderOrder = -1;
    this.scene.add(mesh);
    this.contactShadows.push({ mesh, avatar });
  }

  private setupLights(): void {
    // ------------------------------------------------------------------
    // 光の設計
    //
    // モンスターの体表シェーダ(creature/surface.ts)は自前の固定光源で
    // 陰影を焼いており、シーンのライトは届かない。その固定光は
    //   キー   = 右手前やや高め   normalize(0.401, 0.802, 0.442)
    //   バック = 背後からの赤紫   vec3(1.0, 0.48, 0.85)
    // になっている。**闘技場側の光をこれに揃えないと、キャラと背景で
    // 光の来る方向が食い違い、合成写真のように浮いて見える。**
    // 以下のライトはすべて、その固定光と同じ方位・同じ色温度に合わせてある。
    //
    // 強さの比は キー : フィル = 約 4:1。ここを 2:1 まで詰めると
    // 面の向きが読めなくなり、立体が平らな絵に戻る。
    // ------------------------------------------------------------------

    // 色はすべて StageMood から来る(属性ごとに空気を割るため)。
    // ここに固定色を書き戻すと、ステージが変わっても光だけ変わらなくなる。

    // 環境光。天が空の色、地が床と篝火の照り返し。
    // 上下で色温度が割れていると、丸い面が回り込むだけで色が変わる
    this.scene.add(new THREE.HemisphereLight(this.mood.hemiSky, this.mood.hemiGround, 0.4));

    // キーライト: 体表シェーダの KEY_DIR と同じ方向(右手前・高め)。
    // 影は左奥へ伸び、カメラからは真横に見えるので接地が読める
    const key = new THREE.DirectionalLight(this.mood.keyLight, 2.6);
    key.position.set(8.8, 17.6, 9.7);
    key.castShadow = true;
    // 影の解像度は「影が硬すぎない」ことより先に「輪郭が階段状にならない」
    // ことを優先する。**錐台は隊列が入る広さまで絞る。**
    // 闘技床いっぱい(±14)まで広げるとテクセルが粗くなり、
    // 足元の影が四角い階段になって、かえって接地感を壊す
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 6;
    key.shadow.camera.far = 46;
    key.shadow.camera.left = -11;
    key.shadow.camera.right = 11;
    key.shadow.camera.top = 11;
    key.shadow.camera.bottom = -11;
    key.shadow.bias = -0.00045;
    key.shadow.normalBias = 0.024;
    this.scene.add(key);

    // フィルライト: キーの反対側から回り込む冷たい光。
    // キーの陰になった面を「見える暗さ」に留めるためだけの弱い光で、
    // ここを強くするとキーの方向感が消える
    const fill = new THREE.DirectionalLight(this.mood.fillLight, 0.58);
    fill.position.set(-13, 6.0, 6.5);
    this.scene.add(fill);

    // リムライト: 奥のゲート方向から。体表シェーダの赤紫のバックライトと
    // 同じ色にして、キャラの輪郭と闘技場の輪郭が同じ光で抜けるようにする
    //
    // 平行光は床にも一様にかかる。床が受ける量は**光の向きの縦成分だけ**で
    // 決まる(y / |position|)ので、強さを保ったまま寝かせれば
    // 「輪郭は抜けるが床は染まらない」を両立できる。
    // 以前は y=3.4(縦成分 0.18)で、床全体が桃色にかぶり、
    // 寄った時にモンスターの属性色まで食われていた。実測で、この2灯を切ると
    // 6属性の色が目に見えてはっきりした。切るのではなく、寝かせて弱める
    const rim = new THREE.DirectionalLight(this.mood.rimLight, 1.5);
    rim.position.set(-5.6, 1.5, -18);
    this.scene.add(rim);

    // 逆リム: 反対の肩側にもう一本。片側だけだと輪郭の抜けが半分で終わる。
    // 色は篝火寄りの暖色にして、奥からのリムと寒暖で対にする
    const rimWarm = new THREE.DirectionalLight(this.mood.rimWarmLight, 1.05);
    rimWarm.position.set(16, 1.4, -12);
    this.scene.add(rimWarm);

    // 闘技床へ落とす天井光。中央だけを持ち上げて、戦う場所に視線を集める。
    //
    // **以前ここは影を落とさない点光源だった。それが接地感を殺していた。**
    // 真上から降る光が影を落とさないと、足元だけが一様に明るくなり、
    // モンスターが床から浮いて見える。真上からの影は輪郭がそのまま
    // 足元に落ちるので、接地の手掛かりとして最も強い。
    //
    // 強さは「床を明るくする」ためではなく「中央と周辺の差」を作るため。
    // 強いと足元が白く飛び、そこに立つモンスターの下半身から色が抜ける
    const pool = new THREE.SpotLight(this.mood.hemiSky, 190, 42, 0.74, 0.72, 2);
    pool.position.set(1.2, 15.5, 2.2);
    pool.target.position.set(0, 0, -0.6);
    pool.castShadow = false;
    // 真上からの光なので影の面積は小さい。1024で足りる(2枚目の影マップは
    // モバイルでの負荷に直結するので、必要以上に上げないこと)
    pool.shadow.mapSize.set(512, 512);
    pool.shadow.camera.near = 4;
    pool.shadow.camera.far = 34;
    pool.shadow.bias = -0.0009;
    pool.shadow.normalBias = 0.03;
    this.scene.add(pool);
    this.scene.add(pool.target);
  }

  /**
   * 闘技場そのものを一度だけキューブマップへ焼き、映り込みの元にする。
   *
   * 平行光だけで照らした石は、どの面も同じ色の「塗り」になって質感が出ない。
   * 空・壁・篝火が映り込むと、磨いた床には空の青が、柱の丸みには
   * 壁の暖色が乗り、面の向きごとに色が変わる。これが石を石に見せる。
   *
   * 生成元がすでに暗いシーンなので、環境光としてのエネルギーは小さい。
   * 白飛びの心配はないが、強くしすぎると陰影が浅くなるので低めに留める。
   */
  private setupEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    try {
      // 霧は近景のためのもので、映り込みに効かせると全面が霧色に潰れる
      const fog = this.scene.fog;
      this.scene.fog = null;
      const target = pmrem.fromScene(this.scene, 0.04, 1, 220);
      this.scene.fog = fog;
      this.scene.environment = target.texture;
      this.scene.environmentIntensity = 0.5;
      this.environmentTarget = target;
    } catch {
      // 環境マップは「あれば良くなる」もので、無くても絵は成立する
      this.scene.environment = null;
    }
    pmrem.dispose();
  }

  private setupUnits(units: StageUnitInit[]): void {
    const players = units.filter((u) => u.team === "PLAYER");
    const enemies = units.filter((u) => u.team === "ENEMY");

    let maxAbsX = 0;
    let maxZ = -Infinity;
    let minZ = Infinity;

    const placed: { avatar: BattleAvatar; x: number; z: number; team: "PLAYER" | "ENEMY" }[] = [];
    const place = (list: StageUnitInit[], team: "PLAYER" | "ENEMY") => {
      const slots = slotPositions(list.length, team);
      // 主は真ん中の席へ。並び順(札・行動順)は動かさない
      const order = slotOrderWithBossCentered(list);
      list.forEach((unit, listIndex) => {
        const index = order[listIndex];
        const slot = unit.def.isBoss ? bossStandPosition(slots[index], LANE_INNER) : slots[index];
        const avatar = createBattleAvatar({
          element: unit.def.element,
          role: unit.def.role,
          templateId: unit.def.templateId,
          facing: team === "PLAYER" ? 1 : -1,
          bodyScale: unit.def.isBoss ? BOSS_BODY_SCALE : 1,
        });
        avatar.setSlotPosition(slot.x, slot.z);
        placed.push({ avatar, x: slot.x, z: slot.z, team });
        this.scene.add(avatar.root);
        this.avatars.set(unit.instanceId, avatar);
        this.unitElements.set(unit.instanceId, unit.def.element as VfxElement);
        this.unitHitStyles.set(unit.instanceId, HIT_STYLE_BY_ROLE[unit.def.role] ?? "magic");

        maxAbsX = Math.max(maxAbsX, Math.abs(slots[index].x));
        maxZ = Math.max(maxZ, slots[index].z);
        minZ = Math.min(minZ, slots[index].z);

        // 足元の接地影。**これが無いと床に貼った絵に見える**
        this.addContactShadow(avatar, unit.team);

        // 属性色のポイントライト。床への色移りで存在感を出すが、
        // 台数が増えるとモバイルGPUで重くなるので範囲と強さは控えめにする。
        //
        // **強さと届く範囲を絞ってある。** 以前は 4.5/6.5 で、8体ぶんの光が
        // それぞれ自分の足元を照らし、自分が落とした影を自分で消していた。
        // 属性の色移りは「床がほのかに染まる」程度で足りる
        const light = new THREE.PointLight(avatar.theme.light, 2.6, 5.0, 2);
        light.position.set(slots[index].x, 1.5, slots[index].z);
        this.scene.add(light);
        // 画面比が変わったら組み直せるよう、誰がどの列の何番目かを残しておく
        this.formation.push({ avatar, light, team, index, count: list.length, isBoss: unit.def.isBoss === true });
        // 今の姿を控える。**これが無いと、最初の同期で全員が組み直される**
        this.avatarStyles.set(unit.instanceId, `${unit.def.templateId}/${unit.def.element}/${unit.def.role}`);
      });
    };

    place(players, "PLAYER");
    place(enemies, "ENEMY");

    // 配置が確定してから、相手チームの中心へ向け直す。
    // 両チームを同じ向きへ回すと正面がすれ違って互いの脇を見てしまうので、
    // 立体感はカメラの方位角に任せ、体は素直に向かい合わせる
    for (const team of ["PLAYER", "ENEMY"] as const) {
      const own = placed.filter((entry) => entry.team === team);
      const foes = placed.filter((entry) => entry.team !== team);
      if (own.length === 0 || foes.length === 0) continue;
      const centerX = foes.reduce((sum, entry) => sum + entry.x, 0) / foes.length;
      const centerZ = foes.reduce((sum, entry) => sum + entry.z, 0) / foes.length;
      for (const entry of own) entry.avatar.faceToward(centerX, centerZ);
    }

    if (this.avatars.size > 0) {
      // 体の太さ + オーラの余白を足して、実際の配置から必要な画角を決める
      this.frameBox = {
        // 余白は体の太さ分だけ。広く取りすぎるとカメラが引いて
        // キャラが小さくなり、画面上下に無駄な空きができる
        halfWidth: maxAbsX + 0.85,
        zNear: maxZ + 1.6,
        zFar: minZ - 1.6,
        yBottom: -0.1,
        yTop: 2.9,
      };
    }
  }

  /**
   * 画面比に合わせてカメラを組み直す。
   *
   * 方針は「画角は望遠寄りで固定し、足りない分は引いて稼ぐ」。
   * 画角を広げて寄ると手前のユニットだけが極端に大きくなるので、
   * frameBox が収まる最短距離を二分探索で求めて、そこにカメラを置く。
   */
  private frameCamera(width: number, height: number): void {
    const aspect = width / height;
    const portrait = portraitAmount(aspect);
    /*
     * 見下ろし角。
     *
     * 浅いと前後の列が画面上で潰れて重なり、深いと真上からの見取り図になる。
     * 正投影では遠近が無いので、この角度が**そのまま盤面の見え方**を決める。
     * 横長の画面では縦の余地が390pxしかないので深めに、
     * 縦長の画面では縦に余裕があるので浅めにする。
     */
    /*
     * **正投影では、この角度が奥行きを縦へ変換する唯一の手段。**
     * 透視投影の頃は距離でも奥行きが読めたが、正投影には遠近が無い。
     * 浅い(24度)と sin24 = 0.41 しか縦へ変わらず、4体並べても
     * 画面上でほとんど離れなかった(実際にそうなった)。深く見下ろす。
     *
     * 深いぶん、立った板は縮んで見える。これは各アバターに
     * `setCameraPitch` で同じ角度だけ倒させて打ち消す。
     */
    const pitchDeg = 48 - 4 * portrait;
    const pitch = THREE.MathUtils.degToRad(pitchDeg);
    /*
     * 方位角。左右に分かれた配置なので0(正面)。
     * 回すと列が斜めに傾いて左右の対称が崩れる。手で回す ぶんだけは効かせる。
     */
    const azimuth = THREE.MathUtils.degToRad(CAMERA_AZIMUTH_DEG) + this.orbitYaw;

    const yAxis = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).applyAxisAngle(yAxis, azimuth);
    const forward = dir.clone().negate();
    const up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)).applyAxisAngle(yAxis, azimuth);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    /*
     * 収まりを測る。**正投影は距離で大きさが変わらないので、二分探索が要らない。**
     * 盤面の箱の8隅を画面の縦横へ投影し、その最大値がそのまま表示範囲になる。
     * 透視投影の頃はここでカメラ距離を26回の二分探索で求めていた。
     */
    const box = this.frameBox;
    /*
     * 注視点は**毎回、盤面の中心から作り直す。**
     * 前回の値へ足し込むと、画面を回すたびにずれが積み上がる。
     */
    const center = this.cameraTarget.set(0, (box.yBottom + box.yTop) / 2, (box.zFar + box.zNear) / 2);
    /*
     * 盤面の8隅を画面の縦横へ投影して、映すべき範囲を測る。
     *
     * **中心からの片側だけを見ない。** 見下ろすと盤面は画面の上下で
     * 非対称になるので、片側の最大値で対称に取ると必ず余るか切れる。
     * 上端と下端を別々に持ち、その中央へカメラを向け直す。
     */
    let minRight = Infinity;
    let maxRight = -Infinity;
    let minUp = Infinity;
    let maxUp = -Infinity;
    for (const x of [-box.halfWidth, box.halfWidth]) {
      for (const y of [box.yBottom, box.yTop]) {
        for (const z of [box.zFar, box.zNear]) {
          this.tmpRelative.set(x, y, z).sub(center);
          const r = this.tmpRelative.dot(right);
          const u = this.tmpRelative.dot(up);
          minRight = Math.min(minRight, r);
          maxRight = Math.max(maxRight, r);
          minUp = Math.min(minUp, u);
          maxUp = Math.max(maxUp, u);
        }
      }
    }
    // ずれたぶんだけ注視点を動かして、盤面を画面の中央へ置く
    center.addScaledVector(right, (minRight + maxRight) / 2);
    center.addScaledVector(up, (minUp + maxUp) / 2);
    let halfW = (maxRight - minRight) / 2;
    let halfH = (maxUp - minUp) / 2;

    // 縁ぎりぎりだと影や光がはみ出して見えるので、少しだけ広げる
    const padding = 1.06;
    halfW *= padding;
    halfH *= padding;

    /*
     * **UIが覆う帯を避ける。**
     *
     * 画面の上には階層名と操作の並び、下にはスキルの操作欄が乗る。
     * 画面いっぱいに盤面を収めると、いちばん手前と奥の1体が
     * その下へ潜って見えなくなる(実際に5体の戦いで上下が切れた)。
     *
     * 表示範囲を帯のぶんだけ広げてから、盤面を**見える帯の中央へ**寄せる。
     * 広げるので1体あたりは小さくなるが、5体が確実に見える方を取る。
     *
     * 自動戦闘では操作欄が畳まれるが、**畳まれた時の高さで測らない。**
     * 自動と手動を切り替えるたびに盤面の大きさが跳ねる。
     */
    const usable = 1 - SAFE_BAND_TOP - SAFE_BAND_BOTTOM;
    halfH /= usable;

    // 画面比に合わせて、足りない方を広げる。狭めると盤面が切れる
    if (halfW / halfH < aspect) halfW = halfH * aspect;
    else halfH = halfW / aspect;

    /*
     * 見える帯の中央へ寄せる。
     *
     * 注視点は画面の中央に来る点なので、**盤面を上げたい時は注視点を下げる。**
     * 符号を取り違えると、避けたかった帯へ盤面を押し込むことになる。
     */
    const bandCenter = (1 + SAFE_BAND_TOP - SAFE_BAND_BOTTOM) / 2;
    center.addScaledVector(up, -(0.5 - bandCenter) * 2 * halfH);

    /*
     * カメラ本体の位置。正投影なので**距離は絵に影響しない**が、
     * 近すぎると手前の物が near 面で切れる。盤面を必ず内側へ収める距離に置く。
     */
    const distance = 40;
    this.frameDistance = distance;
    this.cameraBase.copy(center).addScaledVector(dir, distance);
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.near = 0.1;
    this.camera.far = distance * 2 + 80;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.cameraTarget);

    // 背景の板を新しい表示範囲へ合わせ直す。**表示範囲を変えたら必ず呼ぶ。**
    // 忘れると、画面の回転や盤面の組み直しのあとに背景が縮んで縁が見える
    this.backdrop?.fit(this.camera);

    // 板をカメラの角度へ倒して正対させる。倒さないと縦に潰れて見える
    this.avatarPitch = pitch;
    for (const avatar of this.avatars.values()) avatar.setCameraPitch(pitch);

    // 画面の縦がワールド何単位ぶん映っているか。正投影ではそのまま表示範囲の高さ
    const visibleHeight = halfH * 2;

    // エフェクトの大きさは**本体の背丈**から決める。
    // 構図を変えても、本体との釣り合いが動かない
    this.vfxSizeScale = SPRITE_MAX_HEIGHT * VFX_PER_SPRITE_HEIGHT;
    this.vfx.setSizeScale(this.vfxSizeScale);
    // どんな演出でも、1枚の板が画面の高さのこの割合を超えないようにする
    this.vfx.setMaxBillboardScale(visibleHeight * VFX_MAX_SCREEN_RATIO);
    // 粒の「数」も抑える。大きさだけ絞っても、加算合成では重なった総量で
    // 画面が飽和するため、密度側からも下げる必要がある
    this.vfx.setQuality(VFX_DENSITY);
    this.vfx.setOpacityScale(VFX_OPACITY);
  }

  /**
   * 画面比に合わせて隊列を組み直す。
   *
   * 縦長の画面では横を詰めて必要な幅を減らし、前後を広げて余った縦を使う。
   * 幅を詰めるとカメラが寄れるので、モンスターが実際に大きく映るようになる。
   */
  private applyFormation(aspect: number): void {
    if (this.formation.length === 0) return;
    const portrait = portraitAmount(aspect);
    if (Math.abs(portrait - this.formationPortrait) < 0.02) return;
    this.formationPortrait = portrait;

    /*
     * 段の間隔。**ここがモンスターの大きさを決める。**
     *
     * 盤面が縦に長いほど、同じ画面に収めるためカメラの表示範囲が広がり、
     * 1体あたりは小さく映る。一列に縦へ並べていた頃はここが6.0あり、
     * 5体で盤面が24の深さになって、1体が画面の縦の7%まで縮んでいた。
     * 千鳥にして段を交互の列へ振ったので、同じ人数でも盤面は半分の深さで済む。
     */
    const rung = RUNG;
    /*
     * 中央寄りの列までの距離。**縦画面では詰め、横画面では離す。**
     * 縦画面は横が足りないので詰めて縦へ展開し、
     * 横画面は横が余るので離して縦の不足を補う。
     * どちらも「余っている方向へ盤面を伸ばす」という同じ考え方。
     */
    const laneInner = LANE_INNER + LANE_X_WIDE * (1 - portrait);

    let maxAbsX = 0;
    let maxZ = -Infinity;
    let minZ = Infinity;
    const placed: { avatar: BattleAvatar; x: number; z: number; team: "PLAYER" | "ENEMY" }[] = [];

    for (const team of ["PLAYER", "ENEMY"] as const) {
      const members = this.formation.filter((entry) => entry.team === team);
      if (members.length === 0) continue;
      /*
       * **人数に関わらず、常に5体ぶんの間隔で並べる。**
       * 実際の人数で詰めると、4体の戦いと5体の戦いで
       * モンスターの大きさが変わってしまう。
       * 中央に寄せて、余った席を前後に空ける。
       */
      const slots = slotPositions(MAX_TEAM_SIZE, team, rung, laneInner, LANE_GAP);
      const offset = Math.floor((MAX_TEAM_SIZE - members[0].count) / 2);
      /*
       * 盤面の広さも**席の全部**から測る。実際に立っている数で測ると、
       * 4体の戦いだけカメラが寄ってモンスターが大きくなる。
       * 席が空いていても盤面の広さは変えない。
       */
      for (const slot of slots) {
        maxAbsX = Math.max(maxAbsX, Math.abs(slot.x));
        maxZ = Math.max(maxZ, slot.z);
        minZ = Math.min(minZ, slot.z);
      }
      for (const entry of members) {
        const seat = slots[entry.index + offset];
        if (!seat) continue;
        // 主は段だけ真ん中で、列は内側。外側の列に置くと画面の端から切れる
        const slot = entry.isBoss ? bossStandPosition(seat, laneInner) : seat;
        entry.avatar.setSlotPosition(slot.x, slot.z);
        entry.light.position.set(slot.x, 1.5, slot.z);
        placed.push({ avatar: entry.avatar, x: slot.x, z: slot.z, team });
      }
    }

    // 位置が動いたので向き直させる。ここを忘れるとそっぽを向いたままになる
    for (const team of ["PLAYER", "ENEMY"] as const) {
      const own = placed.filter((entry) => entry.team === team);
      const foes = placed.filter((entry) => entry.team !== team);
      if (own.length === 0 || foes.length === 0) continue;
      const centerX = foes.reduce((sum, entry) => sum + entry.x, 0) / foes.length;
      const centerZ = foes.reduce((sum, entry) => sum + entry.z, 0) / foes.length;
      for (const entry of own) entry.avatar.faceToward(centerX, centerZ);
    }

    // 収まり判定に足す余白。縦画面では、この余白そのものが
    // カメラを引かせる原因になるので削る(実測で占有率が2倍以上変わる)
    this.frameBox = {
      // 横は2つの列の外側だけ。左右に分かれた配置では、ここが幅を決める
      /*
       * 横。**立ち位置だけでなく、板の幅を足す。**
       *
       * 板の幅は絵の縦横比で決まり、横長のゴーレムで半幅1.5ほどある。
       * 立ち位置だけで枠を決めていたら、左右の列が画面の外へはみ出した。
       * 左右に分かれた配置では、ここが盤面の大きさを決める。
       */
      /*
       * 横。**立ち位置だけでなく、板の幅を丸ごと足す。**
       *
       * 縦画面では枠を削ってカメラを寄せていた(`- 0.15 * portrait`)が、
       * 千鳥にして外側の列が画面の端まで来たので、その削りぶんだけ
       * **外側の列が画面の外へはみ出した。**寄せるための削りは、
       * 端に何も立っていなかった頃の名残。
       */
      /*
       * **見込みではなく、実際に立っている板の幅から取る。**
       *
       * `SPRITE_HALF_WIDTH` は「だいたいこのくらい」の見込みで、
       * 実測すると古代の魔獣が 1.15、主の1.3倍が乗ると 1.49 ある。
       * 見込みのままだと、広い種族が外側の列に立った盤面で
       * 枠が足りず、画面の端で切れる。
       *
       * 席ごとに `|x| + その板の半幅` を測って、いちばん外側を採る。
       * 「いちばん広い板」を全席へ見込むのとは違う——広い板が内側の列に
       * 居るだけの盤面まで、カメラが無駄に引いてしまう。
       * 見込みは**下限**として残す(狭い板ばかりの盤面で枠が縮み、
       * 今より寄ってしまうのを防ぐ)。
       */
      halfWidth: Math.max(
        maxAbsX + SPRITE_HALF_WIDTH,
        ...placed.map((entry) => Math.abs(entry.x) + entry.avatar.halfWidth),
      ),
      zNear: maxZ + 0.3,
      zFar: minZ - 0.3,
      yBottom: -0.3,
      /*
       * 上。**板はカメラへ正対するよう倒してあるので、背丈がまるごと縦へ映る。**
       *
       * 以前は「上に yTop、奥に zFar」と別々に余白を積んでいたが、
       * 枠は箱なので**その2つの角(高さも奥行きも最大)まで数えてしまう。**
       * 実際にそこには何も無いぶんカメラが引き、
       * 盤面が画面の上へ押し上げられて**下に床だけの帯ができた。**
       *
       * 一番奥の1体の頭が画面上で届く高さは、足元から背丈ぶん。
       * 見下ろし角ぶんを割り戻した高さをここへ入れれば、
       * 枠の角がちょうど頭の位置に来る。
       *
       * **大きくした主(`BOSS_BODY_SCALE`)もここに収まるので、動かさない。**
       * 割り戻しの 1/0.70 = 1.43倍 がそのまま余裕として効いていて、
       * いちばん背の高い役割を1.3倍しても天井に届かない。
       *
       * 一度ここを1.3倍にしてみたが、主の居る戦いだけカメラが引いて
       * **取り巻きが4.2%縮んだ。**主を大きくしたつもりで盤面が縮むのでは逆効果。
       */
      yTop: SPRITE_MAX_HEIGHT / TILT_COS,
    };
  }

  private handleResize(): void {
    const { width, height } = this.measure();
    this.viewWidth = width;
    this.viewHeight = height;
    this.applyFormation(width / Math.max(1, height));
    this.frameCamera(width, height);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.cinematicPass.setResolution(width * ratio, height * ratio);
    this.applyViewGrade(width / Math.max(1, height));
  }

  /**
   * 画面比に応じて露出と周辺光量を変える。
   *
   * 縦長では「モンスターが小さく暗く、互いに重なって判別しづらい」という
   * 指摘が出ていた。原因の半分は構図(隊列側で対処済み)だが、残り半分は光。
   *
   * 縦長では隊列が2段になって画面の**上下いっぱい**に広がるため、
   * 横長と同じビネットを掛けると、いちばん見せたい前列と後列の端が
   * そのまま周辺光量落ちの中に沈む。縦長ではビネットを浅くし、
   * そのぶん露出をわずかに上げて、8体すべてが同じ明るさで読めるようにする。
   */
  private applyViewGrade(aspect: number): void {
    const portrait = portraitAmount(aspect);
    this.renderer.toneMappingExposure = 0.92 + 0.13 * portrait;
    this.cinematicPass.configure({
      vignette: 0.44 - 0.16 * portrait,
      // 周辺のにじみも同じ理由で控える(端のユニットの輪郭が濁る)
      aberration: 1.0 - 0.35 * portrait,
      // 小さく映るぶん、輪郭のコントラストを少し立てて分離を助ける
      contrast: 0.15 + 0.05 * portrait,
    });
  }

  /**
   * 今フレームで使う画素倍率。
   *
   * 端末の倍率をそのまま使わない。1.5倍あれば、この画面の作り
   * (暗い地・ブルーム・被写界深度なし)では粗はほとんど見えない。
   * 2倍から1.5倍に落とすだけで**画素の数が44%減る。**
   */
  private targetPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, 1.5) * this.pixelScale;
  }

  /**
   * フレーム時間を見て、重ければ描く画素を減らす。
   *
   * 端末の性能は事前に分からない。**測って合わせるしかない。**
   * 下げる時は素早く、戻す時はゆっくりにして、境目で行ったり来たりさせない。
   */
  private adaptResolution(deltaMs: number): void {
    // 移動平均。1フレームの跳ねで判断すると、演出のたびに解像度が動く
    this.frameMs += (Math.min(deltaMs, 200) - this.frameMs) * 0.08;
    if (this.pixelCooldown > 0) {
      this.pixelCooldown -= 1;
      return;
    }

    const before = this.pixelScale;
    // 60fpsで16.7ms。24ms(約42fps)を超えたら重いと見なす
    if (this.frameMs > 24 && this.pixelScale > 0.62) {
      this.pixelScale = Math.max(0.62, this.pixelScale - 0.12);
    } else if (this.frameMs < 15 && this.pixelScale < 1) {
      // 戻すのは控えめに。上げた直後にまた重くなると振動する
      this.pixelScale = Math.min(1, this.pixelScale + 0.06);
    }

    /*
     * 画素を下限まで落としてもまだ重い時は、**後処理を段階的に止める。**
     *
     * 画面いっぱいを何度も塗り直す処理(にじみ・周辺減光・色収差)は、
     * 解像度を下げても比例して軽くなるだけで、枚数そのものは減らない。
     * 実測(実機の録画)で、解像度を44%削った後もまだ31.5fpsだった。
     */
    if (this.pixelScale <= 0.62 + 1e-6 && this.frameMs > 27 && this.downgradeStep < 2) {
      this.downgradeStep += 1;
      this.applyDowngrade();
      this.frameMs = 16.7;
      this.pixelCooldown = 90;
      return;
    }
    // 十分に軽くなっていれば飾りを戻す
    if (this.downgradeStep > 0 && this.frameMs < 13) {
      this.downgradeStep -= 1;
      this.applyDowngrade();
      this.frameMs = 16.7;
      this.pixelCooldown = 120;
      return;
    }

    if (this.pixelScale !== before) {
      /*
       * 画素だけでなく**演出の量も**落とす。
       *
       * 重さの主因は塗り直しの量で、その大半は画面を覆う半透明の板が作る。
       * 解像度を下げても、同じ枚数の板を同じ大きさで重ねれば効きが薄い。
       * 端末が苦しい時は、粒の数と板の大きさも一緒に絞る。
       */
      this.vfx.setQuality(VFX_DENSITY * this.pixelScale);
      this.vfx.setSizeScale(this.vfxSizeScale * (0.7 + 0.3 * this.pixelScale));

      const ratio = this.targetPixelRatio();
      this.renderer.setPixelRatio(ratio);
      this.composer.setPixelRatio(ratio);
      const { width, height } = this.measure();
      this.composer.setSize(width, height);
      this.bloomPass.setSize(width, height);
      // 変えた直後は測り直しが落ち着くまで待つ
      this.frameMs = 16.7;
      this.pixelCooldown = 45;
    }
  }

  /** 今の段に合わせて後処理を入切する */
  private applyDowngrade(): void {
    // 1段目: 周辺減光と色収差を止める。画作りの味だが、無くても情報は失われない
    this.cinematicPass.enabled = this.downgradeStep < 1;
    // 2段目: にじみも止める。**最後まで残すのは形が読めることの方**
    this.bloomPass.enabled = this.downgradeStep < 2;
    // 影も2段目で落とす。接地影(板)は残るので、足元が浮くことはない
    this.renderer.shadowMap.enabled = this.downgradeStep < 2;
  }

  private start(): void {
    const loop = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      this.renderFrame();
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  /** 計測用。開発時に window から描画統計を読むための一時フック */
  private exposeStats(): void {
    Object.assign(window, {
      __crimonStats: () => ({
        calls: this.renderer.info.render.calls,
        tris: this.renderer.info.render.triangles,
        programs: this.renderer.info.programs?.length ?? 0,
        textures: this.renderer.info.memory.textures,
        geometries: this.renderer.info.memory.geometries,
        pixelRatio: this.renderer.getPixelRatio(),
      }),
    });
  }

  private renderFrame(): void {
    // 合成は複数回の描画で成り立っている。自動初期化のままだと最後の1回しか見えない
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    this.adaptResolution(rawDelta * 1000);

    // ヒットストップ: 命中の瞬間だけ時間を遅くして打撃感を出す
    let delta = rawDelta;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= rawDelta;
      delta = rawDelta * 0.18;
    }
    this.elapsed += delta;

    this.arena?.update(this.elapsed);
    for (const avatar of this.avatars.values()) avatar.update(delta, this.elapsed);
    // 接地影は踏み込み・のけぞりで動く体に追従させる。
    // 追従させないと、動いた瞬間だけ足元から影が離れて浮きが目立つ
    for (const entry of this.contactShadows) {
      const position = entry.avatar.root.position;
      entry.mesh.position.set(position.x, 0.02, position.z);
      /*
       * **隠した席の影は出さない。**ここを `isDying()` だけで決めていたので、
       * まだ生まれていない100階の分身の足元に、体の無い輪だけが残っていた
       */
      entry.mesh.visible = entry.avatar.root.visible && !entry.avatar.isDying();
    }
    // 継続エフェクトは、踏み込みなどで動くキャラの位置へ毎フレーム追従させる
    for (const [instanceId, kinds] of this.activeAuras) {
      if (kinds.size === 0) continue;
      const anchor = this.anchorOf(instanceId);
      if (anchor) this.vfx.updateStatusAura(instanceId, anchor);
    }
    this.vfx.update(delta);
    this.vfx.faceCamera(this.camera);
    this.updateCamera(delta);
    this.cinematicPass.setTime(this.elapsed);

    this.composer.render();
    this.exposeStats();
  }

  /**
   * 画面を左右に滑らせて、闘技場を回り込めるようにする。
   *
   * 両チームを向かい合わせると、自軍はどうしても後ろ姿が中心になる。
   * 構図の既定値をどこに置いても誰かの顔が見えないので、
   * 「見たい角度は手で選べる」形にして解決する。
   * 2本指や2回叩く操作で既定の構図へ戻せる。
   */
  private setupOrbitControl(): void {
    const canvas = this.renderer.domElement;
    // 指で回している最中にページごとスクロールしてしまうのを止める
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";

    canvas.addEventListener("pointerdown", (event) => {
      if (this.dragPointerId !== null) return;
      this.dragPointerId = event.pointerId;
      this.dragLastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    });

    canvas.addEventListener("pointermove", (event) => {
      if (this.dragPointerId !== event.pointerId) return;
      const dx = event.clientX - this.dragLastX;
      this.dragLastX = event.clientX;
      const width = Math.max(1, canvas.clientWidth);
      this.orbitYawTarget = THREE.MathUtils.clamp(
        this.orbitYawTarget - (dx / width) * ORBIT_SPEED,
        -ORBIT_LIMIT,
        ORBIT_LIMIT,
      );
    });

    const end = (event: PointerEvent) => {
      if (this.dragPointerId !== event.pointerId) return;
      this.dragPointerId = null;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);

    // 2回叩いたら既定の構図へ戻す。回しすぎて分からなくなった時の逃げ道
    canvas.addEventListener("dblclick", () => {
      this.orbitYawTarget = 0;
    });
  }

  /** 回り込みを既定の構図へ戻す */
  resetOrbit(): void {
    this.orbitYawTarget = 0;
  }

  /**
   * 画面上の座標にいるユニットを返す。対象を文字の一覧ではなく
   * 3Dの本体そのものから選べるようにするために使う。
   * 判定は姿を持たない箱で行うので、細い脚や翼の隙間で外れることはない。
   */
  pickUnitAt(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const proxies: THREE.Object3D[] = [];
    const owners = new Map<THREE.Object3D, string>();
    for (const [instanceId, avatar] of this.avatars) {
      if (avatar.isDying()) continue;
      proxies.push(avatar.hitArea);
      owners.set(avatar.hitArea, instanceId);
    }
    const hits = this.raycaster.intersectObjects(proxies, false);
    for (const hit of hits) {
      const id = owners.get(hit.object);
      if (id) return id;
    }
    return null;
  }

  /** 対象として選ばれているユニットを光らせる。nullで全部消す */
  setTargetedUnit(instanceId: string | null): void {
    for (const [id, avatar] of this.avatars) avatar.setTargeted(id === instanceId);
  }

  private updateCamera(dt: number): void {
    // 注視点・カメラ位置ともに目標値へ滑らかに寄せる(急な切り替えを避ける)
    const follow = Math.min(1, dt * 3.2);
    this.cameraOffset.lerp(this.desiredCameraOffset, follow);
    this.cameraLookOffset.lerp(this.desiredLookOffset, follow);

    /*
     * 待機中のカメラの揺れは**やめた。**
     *
     * 3Dの頃は、揺らすと手前と奥がずれて視差が出るので「静止画に見えない」
     * 効果があった。**正投影の2Dでは視差が出ない。**画面の全部が
     * 同じだけ平行移動するだけで、背景も本体も札もまとめてずれる。
     *
     * 実測で、一時停止しているのに札が横に12px揺れていた。
     * 依頼主から「キャラの位置が動いていて見づらい」
     * 「HPバーも動いているとごちゃごちゃして見にくい」という指摘を
     * 2度受けたが、札を立ち位置へ固定してもまだ揺れていた真犯人がここ。
     *
     * 「静止画に見えない」役目は、モンスター1体ずつの呼吸と漂いが担う。
     * そちらは**個別に**動くので、画面全体は静かなまま生気が出る。
     */
    // 手で回した角度を目標へ滑らかに寄せる(指を離しても急に止まらない)
    this.orbitYaw += (this.orbitYawTarget - this.orbitYaw) * Math.min(1, dt * 9);
    // 回すと2つの列の並び方が変わり、必要な画角も変わる。
    // 一定以上動いたらフレーミングごとやり直して、端のユニットが切れないようにする
    if (Math.abs(this.orbitYaw - this.framedYaw) > 0.008) {
      this.framedYaw = this.orbitYaw;
      this.frameCamera(this.viewWidth, this.viewHeight);
    }

    this.camera.position.copy(this.cameraBase).add(this.cameraOffset);

    if (this.shakeStrength > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeStrength;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeStrength;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeStrength * 0.5;
      this.shakeStrength *= Math.pow(0.0016, dt);
    }

    this.tmpVector.copy(this.cameraTarget).add(this.cameraLookOffset);
    this.camera.lookAt(this.tmpVector);
  }

  /** 行動中のユニットへ寄る。nullで全体を見るデフォルト位置へ戻る */
  focusOn(instanceId: string | null): void {
    for (const [id, avatar] of this.avatars) avatar.setActive(id === instanceId);

    if (!instanceId) {
      this.desiredCameraOffset.set(0, 0, 0);
      this.desiredLookOffset.set(0, 0, 0);
      return;
    }
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return;

    /*
     * **行動者へのパンと寄りもやめた。**
     *
     * 行動者の方向へカメラを振ると、画面上では左右の列が25pxほど平行移動する。
     * 誰かが動くたびに**8体ぶんの札が全部ずれる**ので、
     * 何が起きたのかを追う前に目が振り回される。
     *
     * 誰の番かは本体の発光(`setActive`)と、その本体だけが踏み込む
     * モーションで足りている。カメラまで動かす必要は無かった。
     *
     * 着弾の揺れ(`shakeStrength`)は残してある。あれは一瞬で収まるし、
     * 盤面が静止しているからこそ「効いた」と分かる。
     */
    void avatar;
    this.desiredCameraOffset.set(0, 0, 0);
    this.desiredLookOffset.set(0, 0, 0);
  }

  getAvatar(instanceId: string): BattleAvatar | undefined {
    return this.avatars.get(instanceId);
  }

  private elementOf(instanceId: string): VfxElement {
    return this.unitElements.get(instanceId) ?? "NEUTRAL";
  }

  private hitStyleOf(instanceId: string): HitStyle {
    return this.unitHitStyles.get(instanceId) ?? "magic";
  }

  /** ユニットの頭上あたりのワールド座標(VFXの発生位置に使う) */
  private anchorOf(instanceId: string): THREE.Vector3 | null {
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return null;
    return avatar.getAnchorWorldPosition(new THREE.Vector3());
  }

  playAttackMotion(actorId: string): void {
    this.avatars.get(actorId)?.playAttack();
  }

  /**
   * 勝った側だけを跳ねさせる。
   *
   * **倒れているものは跳ねない。** 全滅寸前で勝った時に、
   * 倒れた仲間まで一緒に跳ねると事故に見える。
   */
  playVictoryMotion(team: "PLAYER" | "ENEMY"): void {
    for (const entry of this.formation) {
      if (entry.team !== team) continue;
      if (entry.avatar.isDying()) continue;
      entry.avatar.playVictory();
    }
  }

  /**
   * 全員の演出を畳んで素立ちへ戻す。
   * 戦闘が終わって次へ進む時に呼ぶ。**戻し忘れると次の戦闘へ姿勢が残る。**
   */
  resetAllMotions(): void {
    for (const avatar of this.avatars.values()) avatar.resetMotion();
  }

  playCastMotion(actorId: string): void {
    const avatar = this.avatars.get(actorId);
    if (!avatar) return;
    avatar.playCast();
    const anchor = this.anchorOf(actorId);
    if (anchor) this.vfx.spawnCastCharge(anchor, avatar.theme.vfx, { element: this.elementOf(actorId) });
  }

  /** 術者から対象へ飛ぶ弾。到達時にonArriveでヒット表現へつなぐ */
  playProjectile(actorId: string, targetId: string, onArrive: () => void): void {
    const from = this.anchorOf(actorId);
    const to = this.anchorOf(targetId);
    const avatar = this.avatars.get(actorId);
    if (!from || !to || !avatar) {
      onArrive();
      return;
    }
    const element = this.elementOf(actorId);
    // 電気属性だけは弾ではなく、術者から対象へ走る稲妻で表現する
    if (element === "ELECTRIC") {
      this.vfx.spawnLightningBolt(from, to, avatar.theme.vfx);
      window.setTimeout(onArrive, 90);
      return;
    }
    this.vfx.spawnProjectile({ from, to, color: avatar.theme.vfx, arcHeight: 1.1, durationSec: 0.28, onArrive, element });
  }

  /**
   * 命中演出。攻撃側の属性と役割で、弾ける形と色が変わる。
   * aoeを立てると規模と余韻が大きくなり、全体攻撃らしく見える。
   */
  playDamage(targetId: string, isCrit: boolean, attackerId?: string, aoe = false): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;

    avatar.playHit();
    const attacker = attackerId ? this.avatars.get(attackerId) : undefined;
    const color = attacker ? attacker.theme.vfx : avatar.theme.vfx;
    const element = attackerId ? this.elementOf(attackerId) : "NEUTRAL";
    const hitStyle = attackerId ? this.hitStyleOf(attackerId) : "magic";
    const options = { element, hitStyle, aoe };

    if (isCrit) {
      this.vfx.spawnCriticalImpact(anchor, color, options);
      // 斬撃系はクリティカル時だけ、追加で交差する斬り筋を出す
      if (hitStyle === "slash") this.vfx.spawnSlash(anchor, color, { element, cross: true, scale: 1.15 });
      this.shake(aoe ? 0.55 : 0.42);
      this.hitStop(0.09);
    } else {
      this.vfx.spawnImpact(anchor, color, 1, options);
      this.shake(aoe ? 0.24 : 0.16);
      this.hitStop(0.035);
    }
  }

  playHeal(targetId: string, aoe = false): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnHeal(anchor, avatar.theme.vfx, { element: this.elementOf(targetId), aoe });
  }

  playBuff(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnBuff(anchor, avatar.theme.vfx, { element: this.elementOf(targetId) });
  }

  playDebuff(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnDebuff(anchor, avatar.theme.vfx, { element: this.elementOf(targetId) });
  }

  playShield(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    this.vfx.spawnShield(anchor, avatar.theme.vfx, { element: this.elementOf(targetId) });
  }

  playDeath(targetId: string): void {
    const avatar = this.avatars.get(targetId);
    const anchor = this.anchorOf(targetId);
    if (!avatar || !anchor) return;
    avatar.playDeath();
    this.vfx.spawnDeath(anchor, avatar.theme.vfx, { element: this.elementOf(targetId) });
    this.vfx.detachStatusAura(targetId);
    this.shake(0.55);
  }

  /**
   * 必殺技の予備動作。術者へカメラを寄せ、足元に力を溜める。
   * 通常の攻撃と同じ絵にせず「ここぞ」を作るための演出。
   */
  playUltimateIntro(actorId: string): void {
    const avatar = this.avatars.get(actorId);
    const anchor = this.anchorOf(actorId);
    if (!avatar || !anchor) return;

    avatar.playCast();
    this.vfx.spawnCastCharge(anchor, avatar.theme.vfx, { element: this.elementOf(actorId), scale: 1.3 });

    /*
     * **カメラは寄せない。**
     *
     * 「通常より一段強く寄る」つもりの設定だったが、正投影では
     * **カメラを近づけても大きさが変わらない。**残るのは横の平行移動だけで、
     * 見せ場を作るどころか画面全体が振れて8体ぶんの札がずれる。
     *
     * 正投影で本当に寄るには `camera.zoom` を上げる必要がある。
     * それは別の作りなので、いまは入れない。必殺技の「ここぞ」は
     * 溜めのエフェクト(spawnCastCharge)と本体のモーション、
     * 着弾の揺れ(shakeStrength)で足りている。
     */
  }

  /** 必殺技の着弾。地面を走る衝撃と、強い揺れ・時間停止を重ねる */
  playUltimateBurst(actorId: string, aoe: boolean): void {
    const avatar = this.avatars.get(actorId);
    if (!avatar) return;

    // 衝撃は術者ではなく戦場の中央から広げ、盤面全体が揺れたように見せる
    const center = this.tmpVector.set(0, 0.12, aoe ? 0 : -FIELD_DEPTH * 0.35);
    this.vfx.spawnAoeImpact(center, avatar.theme.vfx, {
      element: this.elementOf(actorId),
      aoe: true,
      radius: aoe ? 6.5 : 4.2,
    });
    this.shake(aoe ? 0.85 : 0.62);
    this.hitStop(0.14);

    // 寄っていたカメラを戻す(次の手番のfocusOnで上書きされる)
    this.desiredCameraOffset.multiplyScalar(0.35);
    this.desiredLookOffset.multiplyScalar(0.35);
  }

  shake(strength: number): void {
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }

  hitStop(seconds: number): void {
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  /** HP割合や生死をアバターへ反映する */
  /**
   * まだ生まれていない席を、盤面から**まるごと隠す。**
   *
   * 100階の分身は開幕から席に居るが、生まれるまでは存在しない扱い。
   * 隠さないと、開幕の舞台にHP0の分身が2体立つ。
   */
  setUnitHidden(instanceId: string, hidden: boolean): void {
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return;
    avatar.root.visible = !hidden;
    // 毎フレームの追従(update)も本体の表示に従うが、最初の1枚のために here でも消す
    for (const entry of this.contactShadows) {
      if (entry.avatar === avatar) entry.mesh.visible = !hidden;
    }
    const slot = this.formation.find((entry) => entry.avatar === avatar);
    if (slot) slot.light.visible = !hidden;
  }

  /**
   * その席の姿を**丸ごと作り直す。**
   *
   * 100階の分身は、生まれた瞬間に攻撃型・サポート型・デバフ型のどれかになる。
   * 絵はアバターを組む時に決まるので、**中身を差し替えるのではなく組み直す。**
   * 立ち位置・向き・接地影・属性光は元の席のものをそのまま引き継ぐ。
   *
   * 同じ姿のまま呼ばれた時は何もしない(毎フレーム呼ばれても組み直さない)。
   */
  restyleUnit(instanceId: string, def: { element: Element; role: string; templateId: string }): void {
    const previous = this.avatars.get(instanceId);
    const slot = this.formation.find((entry) => entry.avatar === previous);
    if (!previous || !slot) return;
    if (this.avatarStyles.get(instanceId) === `${def.templateId}/${def.element}/${def.role}`) return;
    this.avatarStyles.set(instanceId, `${def.templateId}/${def.element}/${def.role}`);

    const facing = slot.team === "PLAYER" ? 1 : -1;
    const avatar = createBattleAvatar({
      element: def.element,
      role: def.role,
      templateId: def.templateId,
      facing,
      bodyScale: slot.isBoss ? BOSS_BODY_SCALE : 1,
    });
    const { x, z } = { x: previous.root.position.x, z: previous.root.position.z };
    avatar.setSlotPosition(x, z);
    avatar.setCameraPitch(this.avatarPitch);
    this.scene.add(avatar.root);

    // 接地影は体の太さから作られているので、古いものを捨てて敷き直す
    for (let i = this.contactShadows.length - 1; i >= 0; i -= 1) {
      if (this.contactShadows[i].avatar !== previous) continue;
      const entry = this.contactShadows[i];
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      this.contactShadows.splice(i, 1);
    }
    this.addContactShadow(avatar, slot.team);

    previous.dispose();
    slot.avatar = avatar;
    this.avatars.set(instanceId, avatar);
    this.unitElements.set(instanceId, def.element as VfxElement);
    this.unitHitStyles.set(instanceId, HIT_STYLE_BY_ROLE[def.role] ?? "magic");

    // 相手チームの中心へ向け直す。忘れるとそっぽを向いたまま立つ
    const foes = this.formation.filter((entry) => entry.team !== slot.team);
    if (foes.length > 0) {
      const centerX = foes.reduce((sum, entry) => sum + entry.avatar.root.position.x, 0) / foes.length;
      const centerZ = foes.reduce((sum, entry) => sum + entry.avatar.root.position.z, 0) / foes.length;
      avatar.faceToward(centerX, centerZ);
    }
  }

  syncUnitState(instanceId: string, hpRatio: number, alive: boolean, status?: UnitStatusFlags): void {
    const avatar = this.avatars.get(instanceId);
    if (!avatar) return;
    avatar.setHpRatio(hpRatio);
    if (!alive && !avatar.isDying()) avatar.playDeath();
    if (alive && avatar.isDying()) avatar.revive();
    this.syncStatusAuras(instanceId, alive, status);
  }

  /**
   * 状態異常の継続エフェクトを、いまかかっている効果に合わせて付け外しする。
   * 毎ターン呼ばれるので、既に出ているものは張り直さず、消えたものだけ外す。
   */
  private syncStatusAuras(instanceId: string, alive: boolean, status?: UnitStatusFlags): void {
    const current = this.activeAuras.get(instanceId) ?? new Set<StatusAuraKind>();
    const wanted = new Set<StatusAuraKind>();

    // 3Dで纏わせるのは「体に起きていること」が絵になる状態だけに絞る。
    //
    // 強化/弱体はほぼ全ユニットに常時かかるため、これを光らせると
    // 8体すべてが光に覆われてキャラクターの色も形も見えなくなる。
    // しかもHUDのバッジで既に一覧できているので、3D側では出さない。
    if (alive && status) {
      if (status.poison) wanted.add("poison");
      if (status.burn) wanted.add("burn");
      if (status.shield) wanted.add("shield");
      if (status.immune) wanted.add("immunity");
      if (status.stun) wanted.add("stun");
      if (status.regen) wanted.add("regen");
    }

    const anchor = this.anchorOf(instanceId);
    for (const kind of wanted) {
      if (!current.has(kind) && anchor) {
        this.vfx.attachStatusAura(instanceId, kind, anchor, { scale: AURA_SCALE });
      }
    }
    for (const kind of current) {
      if (!wanted.has(kind)) this.vfx.detachStatusAura(instanceId, kind);
    }
    this.activeAuras.set(instanceId, wanted);
  }

  /** HTMLオーバーレイ(HPバー等)を3D位置に追従させるための画面座標を返す */
  computeScreenAnchors(): ScreenAnchor[] {
    const { width, height } = this.measure();
    const anchors: ScreenAnchor[] = [];
    for (const [instanceId, avatar] of this.avatars) {
      avatar.getAnchorWorldPosition(this.tmpVector);
      const distance = this.camera.position.distanceTo(this.tmpVector);
      this.tmpVector.project(this.camera);
      const visible = this.tmpVector.z < 1;
      const x = (this.tmpVector.x * 0.5 + 0.5) * width;
      const y = (-this.tmpVector.y * 0.5 + 0.5) * height;
      void distance;

      // 札用の、モーションで動かない座標
      avatar.getSlotAnchorWorldPosition(this.tmpRelative).project(this.camera);
      anchors.push({
        instanceId,
        x,
        y,
        slotX: (this.tmpRelative.x * 0.5 + 0.5) * width,
        slotY: (-this.tmpRelative.y * 0.5 + 0.5) * height,
        visible,
        // カメラ距離を基準にした相対スケール。極端にならないよう範囲を絞る
        /*
         * **1で固定する。**
         *
         * 透視投影の頃は、奥のユニットの札を小さくして遠さを出していた。
         * 正投影にしたので**奥も手前も同じ大きさで映る**ようになり、
         * 札だけ縮める理由が無くなった。
         *
         * それ以上に悪かったのは、この距離が**本体の現在位置**までの
         * ものだったこと。待機で漂うたびに距離が変わり、札が毎フレーム
         * わずかに伸び縮みしていた。位置を固定しても、大きさが脈打てば
         * 結局ちらついて読めない(依頼主から「HPバーも動いていて
         * ごちゃごちゃして見にくい」という指摘を受けた)。
         */
        scale: 1,
      });
    }
    return anchors;
  }

  dispose(): void {
    this.disposed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    for (const entry of this.contactShadows) {
      entry.mesh.geometry.dispose();
      const material = entry.mesh.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.contactShadows.length = 0;
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.arena?.dispose();
    this.backdrop?.dispose();
    this.vfx.dispose();
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.scene.environment = null;
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
