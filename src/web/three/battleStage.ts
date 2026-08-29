import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { Element } from "../../core/element.js";
import { MonsterDefinition } from "../../core/monster.js";
import { ArenaHandles, createArena } from "./arena.js";
import { moodFor, StageMood } from "./elementTheme.js";
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
  x: number;
  y: number;
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
 * 味方と敵を分ける左右の距離。**味方が左、敵が右。**
 *
 * 以前は手前(+Z)が味方・奥(-Z)が敵という奥行きの配置だった。
 * 3Dモデルなら成立するが、2Dの絵は横向きの姿しか持たないので、
 * 奥行きで分けると**両チームが同じ方を向いて並ぶ**ことになる。
 * 左右に分ければ、絵の向きがそのまま「向かい合っている」に読める。
 *
 * 画面の左右の端はHPと行動ゲージの札が使うので、**本体はやや内側**に立たせる。
 * 外へ出すと札と場所を取り合い、モンスターが札の裏へ隠れる。
 */
const LANE_X = 1.58;
/** 横長の画面で列を離す追加ぶん。横に余るので、その余りを列の間隔に使う */
const LANE_X_WIDE = 3.1;

/**
 * 立ち位置。**左右に分かれて縦に並ぶ。**
 *
 * 味方は左の列、敵は右の列。列の中は手前(+Z)から奥(-Z)へ順に置く。
 * カメラは斜め上から見下ろすので、前後の隔たりが画面の上下になる。
 *
 * 遠近で奥のものは画面中央へ寄って見える。そのままだと列が
 * ハの字に潰れるので、**奥ほど外へ押し出して縦の列に見せる**
 * (`skew`)。押しすぎると今度は外へ開くので、実際に見て決めた値。
 */
function slotPositions(
  count: number,
  team: "PLAYER" | "ENEMY",
  /** 前後の間隔。縦に余裕のある画面では広げる */
  spacing = 2.25,
  /** 奥へ行くほど外へ押し出す量。遠近で内側へ寄るのを打ち消す */
  skew = 0.34,
  /** 2つの列の間隔。横長の画面では離す */
  laneX = LANE_X,
): { x: number; z: number }[] {
  if (count <= 0) return [];
  const side = team === "PLAYER" ? -1 : 1;
  const total = (count - 1) * spacing;

  return Array.from({ length: count }, (_, i) => {
    // 先頭(i=0)が手前。奥へ向かって並ぶ
    const z = total / 2 - i * spacing;
    // 奥(zが小さい)ほど外側へ
    const push = (total / 2 - z) * skew;
    return { x: side * (laneX + push), z };
  });
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
 * エフェクトの大きさを決める基準の高さ(ワールド単位)。
 * 画面の縦にこの高さが収まっている時、各エフェクトは指定どおりの寸法で描かれる。
 * 実際の画角がこれより狭ければ、その比率でエフェクトも小さくなる。
 * 値はキャラクターの背丈(約2.2)の10倍強で、大きめの演出でも画面の
 * 半分程度に収まるよう選んである。
 */
const VFX_REFERENCE_HEIGHT = 42;

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
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly cinematicPass: CinematicPass;
  /** そのバトルの空気(空・霞・石・灯りの色)。敵の顔ぶれから決まる */
  private readonly mood: StageMood;
  private readonly arena: ArenaHandles;
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
  }[] = [];
  /** 最後に隊列を組んだ時の縦長さ。変わっていなければ組み直さない */
  private formationPortrait = -1;
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

  constructor(container: HTMLElement, units: StageUnitInit[]) {
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
    this.camera = new THREE.PerspectiveCamera(27, width / height, 1, 340);

    // その戦いの空気を、敵チームで最も多い属性から決める。
    // 空・霞・石・灯り・グレーディングまで一式がここから流れる。
    // (以前は全ステージが同じ紫の室内で、どの戦いも同じ絵に見えていた)
    this.mood = moodFor(units.filter((u) => u.team === "ENEMY").map((u) => u.def.element as Element));
    this.arena = createArena(this.mood);

    // 霧の色は空のシェーダの地平線色(arena.ts の uHaze)と合わせてある。
    // 遠景がそのまま霞へ溶ける。**両方を同時に変えること。**
    // どちらも StageMood から来るので、ここを固定色に戻さないこと。
    //
    // 体表シェーダは fog を組み込んでいないので、濃くしても手前の
    // モンスターは白まず、闘技場だけが奥へ退く。空気遠近が付いて、
    // 観客席と列柱が「遠い」と読めるようになる
    this.scene.fog = new THREE.FogExp2(this.mood.haze.getHex(), this.mood.fogDensity);
    this.scene.add(this.arena.group);
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
  private static contactShadowTexture(): THREE.Texture {
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
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  /**
   * 足元に接地影を敷く。
   *
   * 取りまとめ役の指摘「床の上に貼った絵のように浮いて見える」の本体はここ。
   * 平行光の影は落ちていたが、足元には属性ライト・足元のオーラ・加算の霞が
   * 重なっていて、影の分の暗さがそのぶん持ち上げられ、結果として
   * 「足元だけ明るい」状態になっていた。乗算合成なら後から光を足されても
   * 比率として暗さが残るので、必ず接地して見える。
   */
  private addContactShadow(avatar: BattleAvatar): void {
    const proxy = avatar.hitArea as THREE.Mesh;
    const params = (proxy.geometry as THREE.BoxGeometry).parameters;
    // 当たり判定の箱は footprint の 1.15 倍で作られている
    const footprint = (params?.width ?? 1.4) / 1.15;
    const geometry = new THREE.PlaneGeometry(footprint * 2.0, footprint * 2.0);
    const material = new THREE.MeshBasicMaterial({
      map: BattleStage.contactShadowTexture(),
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
      list.forEach((unit, index) => {
        const avatar = createBattleAvatar({
          element: unit.def.element,
          role: unit.def.role,
          templateId: unit.def.templateId,
          facing: team === "PLAYER" ? 1 : -1,
        });
        avatar.setSlotPosition(slots[index].x, slots[index].z);
        placed.push({ avatar, x: slots[index].x, z: slots[index].z, team });
        this.scene.add(avatar.root);
        this.avatars.set(unit.instanceId, avatar);
        this.unitElements.set(unit.instanceId, unit.def.element as VfxElement);
        this.unitHitStyles.set(unit.instanceId, HIT_STYLE_BY_ROLE[unit.def.role] ?? "magic");

        maxAbsX = Math.max(maxAbsX, Math.abs(slots[index].x));
        maxZ = Math.max(maxZ, slots[index].z);
        minZ = Math.min(minZ, slots[index].z);

        // 足元の接地影。**これが無いと床に貼った絵に見える**
        this.addContactShadow(avatar);

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
        this.formation.push({ avatar, light, team, index, count: list.length });
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
    const portraitFov = portraitAmount(aspect);
    /*
     * 画角。**左右に分かれた配置では望遠寄りにする。**
     *
     * 以前は縦画面ほど広角にしていた。両チームを横一列に広げていた頃は、
     * 必要な「幅」を稼ぐために広角でないとカメラが極端に引いたため。
     * いま盤面は縦に深いので、広角のままだと**手前と奥で大きさが2倍以上変わり、
     * 奥の列が豆粒になる**(実測で手前のスライムが奥のフェアリーの2.5倍あった)。
     * 望遠に寄せると前後の大きさが揃い、列として読める。
     */
    const fov = THREE.MathUtils.clamp(34 - (aspect - 0.6) * 9 + 2 * portraitFov, 24.5, 38);
    // 見下ろし角。浅いと前後の列が画面上で潰れて重なるので、
    // 奥行きが縦方向の距離に変換される程度まで見下ろす。
    // 縦長の画面ではさらに深くする。余っている縦方向へ前後の列を展開して、
    // 床と壁だけの空白を埋めるため
    const portrait = portraitAmount(aspect);
    /*
     * 見下ろし角。浅いと前後の列が画面上で潰れて重なる。
     * 一方で深すぎると、盤面の手前に**床だけの空白**が広く映る
     * (縦画面で画面の1/4が床になっていた)。前後が分かれる程度に留める。
     */
    /*
     * 横長の画面では**深く見下ろす**。縦の余地が390pxしかないので、
     * 浅いと1チーム4体が画面上でほとんど同じ高さに重なる(実際に重なった)。
     * 縦長の画面は縦に余裕があるので、そこまで深くしなくても分かれる。
     */
    const pitchMax = 31 - 3 * portrait;
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(fov / 2 + 11 - 3 * portrait, 18, pitchMax));

    const tanY = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const tanX = tanY * aspect;
    // 真正面から見ると、敵へ向き直った自軍は常に真後ろからしか映らず、
    // 顔・角・仮面といった見分けどころが自分のモンスターだけ見えなくなる。
    // ユニットが向いている側へカメラを回り込ませて、斜め後ろから見る構図にする。
    // 副次的に、2つの列が画面上で斜めに並ぶ(正対だと前後の列が重なりやすい)
    //
    // 手で回した角度もここに含める。回すと2つの列が横並びになって必要な幅が
    // 変わるので、距離を測り直さないとユニットが画面の外へ押し出される
    // 斜めから見ると、奥行きの分だけ**横方向にも**場所を取る
    // (回した軸で見ると、遠くの列が横にはみ出す)。
    // 縦画面は幅が足りないので、正面寄りに戻して奥行きが幅を食わないようにする
    const azimuth = THREE.MathUtils.degToRad(CAMERA_AZIMUTH_DEG * (1 - 0.72 * portrait)) + this.orbitYaw;
    const yAxis = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).applyAxisAngle(yAxis, azimuth);
    const forward = dir.clone().negate();
    const up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)).applyAxisAngle(yAxis, azimuth);
    // 収まり判定に使う画面横方向。方位角を入れるとワールドXとは一致しなくなる
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    const box = this.frameBox;
    const corners: THREE.Vector3[] = [];
    for (const x of [-box.halfWidth, box.halfWidth]) {
      for (const y of [box.yBottom, box.yTop]) {
        for (const z of [box.zFar, box.zNear]) corners.push(new THREE.Vector3(x, y, z));
      }
    }

    const padding = 1.04;
    const camera = new THREE.Vector3();
    const fits = (distance: number): boolean => {
      camera.copy(this.cameraTarget).addScaledVector(dir, distance);
      for (const corner of corners) {
        this.tmpRelative.copy(corner).sub(camera);
        const depth = this.tmpRelative.dot(forward);
        if (depth < 0.5) return false;
        if (Math.abs(this.tmpRelative.dot(right)) * padding > tanX * depth) return false;
        if (Math.abs(this.tmpRelative.dot(up)) * padding > tanY * depth) return false;
      }
      return true;
    };

    let low = 4;
    let high = 120;
    for (let i = 0; i < 26; i++) {
      const mid = (low + high) / 2;
      if (fits(mid)) high = mid;
      else low = mid;
    }

    this.frameDistance = high;
    this.cameraBase.copy(this.cameraTarget).addScaledVector(dir, high);
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.cameraBase);
    this.camera.lookAt(this.cameraTarget);

    // エフェクトの大きさを、いまの構図に対して相対的に決める。
    // 画面の縦がワールド何単位ぶん映っているかを求め、その一定割合を
    // 「大きめのエフェクト1つ分」の基準にする。こうしておくと、
    // 画角や距離を変えても演出が画面を覆って白飛びすることがない。
    const visibleHeight = 2 * high * tanY;
    this.vfxSizeScale = visibleHeight / VFX_REFERENCE_HEIGHT;
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

    const lateral = 1 - 0.18 * portrait;
    /*
     * 縦画面で前後を大きく広げて縦の余りを使わせる案を試したが、**逆効果だった。**
     * 0.1 → 0.45 にすると2つの列の間に空の床の帯ができ、1体ずつも小さくなる。
     * 縦が余って見えるのは隊列の広がりが足りないからではなく、
     * 闘技場の客席が上に写り込んでいるため。直すならそちら側。
     */
    /*
     * 縦に余裕のある画面では前後の間隔を広げる。
     * 左右に分かれた配置では、**余る方向は常に縦**なので、
     * 横を詰めて縦へ展開するのが素直になった。
     */
    // 縦長の画面ほど前後を広げる。左右に分かれた配置では余るのは常に縦なので、
    // ここを広げるほど画面が埋まり、モンスターも大きく映る
    const spacing = 2.75 + 0.9 * portrait;
    /*
     * 奥へ行くほど外へ押し出す量。
     *
     * **強くしすぎると必要な横幅が膨らみ、カメラが引いてモンスターが豆粒になる。**
     * 実際に0.3で試したら、盤面の幅が7を超えて画面の上半分に小さく固まった。
     * 遠近による内寄りを完全に打ち消す必要はない。ゆるい台形で十分に列に見える。
     */
    const skew = 0.085;
    /*
     * 2つの列の間隔。**縦画面では詰め、横画面では離す。**
     * 縦画面は横が足りないので詰めて縦へ展開し、
     * 横画面は横が余るので離して縦の不足を補う。
     * どちらも「余っている方向へ盤面を伸ばす」という同じ考え方。
     */
    const laneX = LANE_X + LANE_X_WIDE * (1 - portrait);

    let maxAbsX = 0;
    let maxZ = -Infinity;
    let minZ = Infinity;
    const placed: { avatar: BattleAvatar; x: number; z: number; team: "PLAYER" | "ENEMY" }[] = [];

    for (const team of ["PLAYER", "ENEMY"] as const) {
      const members = this.formation.filter((entry) => entry.team === team);
      if (members.length === 0) continue;
      const slots = slotPositions(members[0].count, team, spacing, skew, laneX);
      for (const entry of members) {
        const slot = slots[entry.index];
        if (!slot) continue;
        entry.avatar.setSlotPosition(slot.x, slot.z);
        entry.light.position.set(slot.x, 1.5, slot.z);
        placed.push({ avatar: entry.avatar, x: slot.x, z: slot.z, team });
        maxAbsX = Math.max(maxAbsX, Math.abs(slot.x));
        maxZ = Math.max(maxZ, slot.z);
        minZ = Math.min(minZ, slot.z);
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
      halfWidth: maxAbsX + 0.7 - 0.32 * portrait,
      zNear: maxZ + 1.1 - 0.7 * portrait,
      zFar: minZ - 1.1 + 0.5 * portrait,
      yBottom: -0.1,
      yTop: 2.7 - 0.4 * portrait,
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

    this.arena.update(this.elapsed);
    for (const avatar of this.avatars.values()) avatar.update(delta, this.elapsed);
    // 接地影は踏み込み・のけぞりで動く体に追従させる。
    // 追従させないと、動いた瞬間だけ足元から影が離れて浮きが目立つ
    for (const entry of this.contactShadows) {
      const position = entry.avatar.root.position;
      entry.mesh.position.set(position.x, 0.02, position.z);
      entry.mesh.visible = !entry.avatar.isDying();
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

    // 待機中もわずかに揺らして静止画に見せない。
    // フレーミングを壊さないよう、振れ幅は構図に影響しない範囲に抑える
    const idleX = Math.sin(this.elapsed * 0.19) * 0.16;
    const idleY = Math.sin(this.elapsed * 0.27 + 1.2) * 0.08;

    // 手で回した角度を目標へ滑らかに寄せる(指を離しても急に止まらない)
    this.orbitYaw += (this.orbitYawTarget - this.orbitYaw) * Math.min(1, dt * 9);
    // 回すと2つの列の並び方が変わり、必要な画角も変わる。
    // 一定以上動いたらフレーミングごとやり直して、端のユニットが切れないようにする
    if (Math.abs(this.orbitYaw - this.framedYaw) > 0.008) {
      this.framedYaw = this.orbitYaw;
      this.frameCamera(this.viewWidth, this.viewHeight);
    }

    this.camera.position.copy(this.cameraBase).add(this.cameraOffset);
    this.camera.position.x += idleX;
    this.camera.position.y += idleY;

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

    const position = avatar.root.position;
    // 行動者の方向へ少しだけパン+寄り。全員が読める構図を壊さない程度に留める
    this.desiredCameraOffset.set(position.x * 0.12, -0.12, -0.9);
    this.desiredLookOffset.set(position.x * 0.2, 0.12, position.z * 0.1);
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

    // 通常のfocusOnより一段強く寄る。着弾時にshakeが入ると自然に戻る
    const position = avatar.root.position;
    this.desiredCameraOffset.set(position.x * 0.3, -1.1, position.z * 0.16 - 2.4);
    this.desiredLookOffset.set(position.x * 0.36, 0.25, position.z * 0.22);
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
        this.vfx.attachStatusAura(instanceId, kind, anchor);
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
      anchors.push({
        instanceId,
        x: (this.tmpVector.x * 0.5 + 0.5) * width,
        y: (-this.tmpVector.y * 0.5 + 0.5) * height,
        visible,
        // カメラ距離を基準にした相対スケール。極端にならないよう範囲を絞る
        scale: THREE.MathUtils.clamp(this.frameDistance / distance, 0.78, 1.12),
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
    this.arena.dispose();
    this.vfx.dispose();
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.scene.environment = null;
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
