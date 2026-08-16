import * as THREE from "three";
import { BillboardField } from "./fx/billboards.js";
import {
  SPRITE,
  chevronTexture,
  crackDecalTexture,
  fireballTexture,
  flashStarTexture,
  godRayTexture,
  hexPanelTexture,
  impactStarTexture,
  lightPillarTexture,
  rippleRingsTexture,
  runeCircleTexture,
  shockRingTexture,
  smokePuffTexture,
  voidCoreTexture,
  vortexTexture,
} from "./fx/fxTextures.js";
import { ParticleField } from "./fx/particles.js";
import { StatusAura, StatusAuraKind } from "./fx/statusAuras.js";
import { StripField, arcPath, helixPath, ringPath, wavyPath, zigzagPath } from "./fx/strips.js";

export type { StatusAuraKind } from "./fx/statusAuras.js";

/** VFXの属性。ゲームのElementに加えて無属性を持つ */
export type VfxElement = "FIRE" | "WATER" | "ELECTRIC" | "GRASS" | "LIGHT" | "DARK" | "NEUTRAL";

/** 当たり方の質感。斬撃なら弧、刺突なら直線というように形が変わる */
export type HitStyle = "slash" | "blunt" | "pierce" | "magic";

export interface ImpactOptions {
  element?: VfxElement;
  hitStyle?: HitStyle;
  /** 全体攻撃。規模と余韻が大きくなる */
  aoe?: boolean;
  /** クリティカル。spawnCriticalImpactからも内部的に使う */
  crit?: boolean;
  /** 追加の大きさ倍率 */
  scale?: number;
  /** 攻撃が飛んできた方向(飛散を指向性にする) */
  direction?: THREE.Vector3;
}

/** 属性だけを渡す簡易形も受け付ける */
export type ImpactArg = ImpactOptions | VfxElement;

export interface ProjectileOptions {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  /** 山なりの高さ。0で直線 */
  arcHeight?: number;
  durationSec?: number;
  onArrive?: () => void;
  /** 属性ごとに弾の見た目と軌跡が変わる */
  element?: VfxElement;
  /** 弾の大きさ倍率 */
  scale?: number;
}

export interface SupportFxOptions {
  element?: VfxElement;
  /** 効果の規模 */
  scale?: number;
  /** 全体対象 */
  aoe?: boolean;
}

interface Projectile {
  sprite: THREE.Sprite;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  element: VfxElement;
  arcHeight: number;
  elapsed: number;
  duration: number;
  scale: number;
  onArrive?: () => void;
}

const GROUND_Y = 0.07;

/** 地面に寝かせた輪を作るための基底(XZ平面) */
const GROUND_RIGHT = new THREE.Vector3(1, 0, 0);
const GROUND_UP = new THREE.Vector3(0, 0, 1);

const WHITE = new THREE.Color(0xffffff);

/** 属性ごとのアクセント色。渡された主色に対して、副次的な色を足して個性を出す */
const ACCENT: Record<VfxElement, { hot: number; deep: number; dust: number }> = {
  FIRE: { hot: 0xffe3a0, deep: 0xff3a10, dust: 0x2a2028 },
  WATER: { hot: 0xe6fbff, deep: 0x1668c8, dust: 0x9fd8ef },
  ELECTRIC: { hot: 0xffffe8, deep: 0xffc21f, dust: 0xfff0a8 },
  GRASS: { hot: 0xdcffc0, deep: 0x1f9b46, dust: 0x7ac26a },
  LIGHT: { hot: 0xffffff, deep: 0xffd873, dust: 0xfff0c8 },
  DARK: { hot: 0xe2b8ff, deep: 0x4a1370, dust: 0x2b1240 },
  NEUTRAL: { hot: 0xffffff, deep: 0x8899bb, dust: 0xa8b0c0 },
};

function normalizeImpactOptions(arg: ImpactArg | undefined): ImpactOptions {
  if (!arg) return {};
  if (typeof arg === "string") return { element: arg };
  return arg;
}

/**
 * バトル演出の総合システム。
 *
 * - 粒(ParticleField): 火花・煙・葉・泡など細かいもの
 * - 板(BillboardField): 閃光・火球・衝撃波・光の柱など大きな面
 * - 帯(StripField): 稲妻のジグザグ・斬撃の弧・蔦のうねり
 * - オーラ(StatusAura): 状態異常の継続ループ
 *
 * 属性ごとに使う道具の組み合わせを変えることで、
 * 「どのスキルも同じ光の粒」にならないようにしている。
 */
export class VfxSystem {
  readonly root = new THREE.Group();

  // 粒も同じ理由で上限を絞る。加算合成では同時に生きている数がそのまま
  // 明るさになるため、多すぎると画面全体が白く飽和してしまう。
  private readonly particles = new ParticleField(170, 110);
  // 同時に存在できる枚数の上限。加算合成では枚数がそのまま明るさになるため、
  // ここを小さく保つことが「画面が白く飽和しない」ことの最終的な保証になる。
  // 上限に達すると古いものから順に置き換わるので、演出自体は途切れない。
  private readonly billboards = new BillboardField(14);
  private readonly strips = new StripField(10);
  private readonly auras = new Map<string, Map<StatusAuraKind, StatusAura>>();
  private readonly auraRoot = new THREE.Group();

  private readonly projectiles: Projectile[] = [];
  private readonly spritePool: THREE.Sprite[] = [];
  private readonly disposables: { dispose: () => void }[] = [];
  private readonly scheduled: { delay: number; fn: () => void }[] = [];

  private camera: THREE.Camera | null = null;
  private readonly cameraPosition = new THREE.Vector3(0, 7.2, 13.2);
  private readonly cameraQuaternion = new THREE.Quaternion();
  private readonly camRight = new THREE.Vector3(1, 0, 0);
  private readonly camUp = new THREE.Vector3(0, 1, 0);

  private quality = 1;
  private elapsed = 0;

  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.root.add(this.particles.root, this.billboards.root, this.strips.root, this.auraRoot);
    this.disposables.push(this.particles, this.billboards, this.strips);
  }

  /** パーティクル量の調整(0.5=省電力, 1=標準, 1.5=リッチ) */
  setQuality(quality: number): void {
    this.quality = Math.max(0.25, Math.min(1.5, quality));
  }

  /**
   * エフェクト全体の大きさ倍率。
   *
   * 個々の演出はキャラクターの背丈(約2.2)を基準に組んであるが、
   * カメラの画角と距離によっては、その大きさが画面の縦幅に対して
   * 大きすぎることがある。加算合成のため、画面を覆うほど大きいと
   * 全体が白く飽和して何も見えなくなるので、構図に合わせてここで絞る。
   */
  setSizeScale(scale: number): void {
    const clamped = Math.max(0.15, Math.min(2, scale));
    this.billboards.sizeScale = clamped;
    this.strips.sizeScale = clamped;
    this.particles.setSizeScale(clamped);
  }

  /**
   * 1枚の板の大きさの上限(ワールド単位)。
   * 画面に映る高さの一部に収まるよう外から指定することで、
   * どの演出も画面を覆い尽くせなくなる。
   */
  setMaxBillboardScale(maxScale: number): void {
    this.billboards.maxScale = Math.max(0.5, maxScale);
  }

  /** エフェクト板1枚あたりの濃さ。重なった時の飽和を抑えるために使う */
  setOpacityScale(scale: number): void {
    this.billboards.opacityScale = Math.max(0.05, Math.min(1, scale));
  }

  private count(base: number): number {
    return Math.max(1, Math.round(base * this.quality));
  }

  private schedule(delay: number, fn: () => void): void {
    this.scheduled.push({ delay, fn });
  }

  private ground(position: THREE.Vector3): THREE.Vector3 {
    return this.tmp.set(position.x, GROUND_Y, position.z);
  }

  private accent(element: VfxElement, key: "hot" | "deep" | "dust"): THREE.Color {
    return new THREE.Color(ACCENT[element][key]);
  }

  // -------------------------------------------------------------------------
  // 打撃感の共通土台
  // -------------------------------------------------------------------------

  /** カメラ基準の平面ベクトル(斬撃やリングの向きに使う) */
  private updateCameraBasis(): void {
    this.camRight.set(1, 0, 0).applyQuaternion(this.cameraQuaternion);
    this.camUp.set(0, 1, 0).applyQuaternion(this.cameraQuaternion);
  }

  /**
   * 広がる(あるいは収束する)輪。
   *
   * 板ではなく帯で描く。板は面なので大きくすると加算合成で画面が白く飛ぶが、
   * 輪は線なので半径をいくら広げても加算される面積はほとんど増えない。
   * 打撃の「重さ」は、この輪がどれだけ速く出てどう減速するかで決まる。
   */
  private shockRing(
    center: THREE.Vector3,
    color: THREE.Color,
    o: {
      radius: number;
      /** 寿命の終わりまでに半径が何倍になるか。1未満で収束する */
      grow: number;
      width: number;
      life: number;
      /** カメラ正対か、地面に寝かせるか、任意の面か */
      plane?: "camera" | "ground";
      basis?: { right: THREE.Vector3; up: THREE.Vector3 };
      opacity?: number;
      coreWhite?: number;
      fadePower?: number;
      jitter?: number;
      segments?: number;
      delay?: number;
      /** 輪が一周描かれるまでの秒数(流れを見せたい時) */
      revealSec?: number;
      band?: number;
    },
  ): void {
    const anchor =
      o.plane === "ground" ? new THREE.Vector3(center.x, GROUND_Y + 0.03, center.z) : center.clone();
    const emit = () => {
      this.updateCameraBasis();
      const basis =
        o.basis ??
        (o.plane === "ground"
          ? { right: GROUND_RIGHT, up: GROUND_UP }
          : { right: this.camRight, up: this.camUp });
      this.strips.spawn(
        {
          points: ringPath(anchor, o.radius, basis, o.segments ?? 36, o.jitter ?? 0.07),
          color,
          width: o.width,
          life: o.life,
          opacity: o.opacity ?? 1,
          grow: o.grow,
          origin: anchor,
          coreWhite: o.coreWhite ?? 0.55,
          glow: o.revealSec ? 0.8 : 0,
          revealSec: o.revealSec ?? 0,
          band: o.band ?? 1.3,
          fadePower: o.fadePower ?? 1.6,
          widthProfile: "even",
        },
        this.cameraPosition,
      );
    };
    if (o.delay) this.schedule(o.delay, emit);
    else emit();
  }

  /**
   * 外へ放射する尾を引いた粒。
   * 粒の絵を進行方向へ倒すことで、同じ数でも「飛んでいる」ように見える。
   */
  private radialStreaks(
    origin: THREE.Vector3,
    color: THREE.Color,
    o: {
      count: number;
      speed: number;
      size: number;
      life: number;
      cell?: number;
      direction?: THREE.Vector3 | null;
      focus?: number;
      gravity?: number;
      drag?: number;
      upBias?: number;
      spread?: number;
      fadePower?: number;
    },
  ): void {
    this.updateCameraBasis();
    const velocity = new THREE.Vector3();
    for (let i = 0; i < o.count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      velocity.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      if (o.direction && o.focus) velocity.lerp(o.direction, o.focus);
      velocity.normalize().multiplyScalar(o.speed * (0.55 + Math.random() * 0.9));
      velocity.y += o.upBias ?? 0;
      // 速度をカメラ平面へ落として、画面上での向きを求める
      const dx = velocity.dot(this.camRight);
      const dy = velocity.dot(this.camUp);
      this.particles.spawn({
        position: new THREE.Vector3(
          origin.x + (Math.random() - 0.5) * (o.spread ?? 0.2),
          origin.y + (Math.random() - 0.5) * (o.spread ?? 0.2),
          origin.z + (Math.random() - 0.5) * (o.spread ?? 0.2),
        ),
        velocity: velocity.clone(),
        color,
        size: o.size * (0.6 + Math.random() * 0.8),
        life: o.life * (0.65 + Math.random() * 0.7),
        cell: o.cell ?? SPRITE.STREAK,
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 0.88,
        rotation: -Math.atan2(dy, dx),
        fadePower: o.fadePower ?? 1.2,
      });
    }
  }

  /**
   * どの属性でも共通で走る「効いた」感の土台。
   *
   * 見せ方は三段に分けている。
   *   衝撃(0〜0.1秒)  一点に集中した硬く白い形。ここが一番強い
   *   波 (0.05〜0.35秒) 外へ抜けていく輪と破片。規模を伝える
   *   余韻(0.2〜1.2秒) 落ちる破片・立ちのぼる煙。重さを残す
   * 段が重ならないよう、それぞれの寿命を意図的にずらしてある。
   */
  private impactCore(position: THREE.Vector3, color: THREE.Color, s: number, options: ImpactOptions): void {
    const element = options.element ?? "NEUTRAL";
    const hot = this.accent(element, "hot");
    const dust = this.accent(element, "dust");
    const direction = options.direction ? options.direction.clone().normalize() : null;

    // --- 衝撃 ---
    // 十字の閃光。2〜4フレームだけ出る。長く残すと「爆発」になってしまい、
    // 「叩かれた瞬間」の鋭さが消える
    this.billboards.spawn({
      position,
      texture: flashStarTexture(),
      color: hot,
      life: 0.075,
      startScale: 2.6 * s,
      endScale: 4.3 * s,
      opacity: 1,
      roll: (Math.random() - 0.5) * 0.7,
      fadePower: 2.4,
    });
    // とがった星形。丸い光だけでは「硬いものが当たった」に読めない
    this.billboards.spawn({
      position,
      texture: impactStarTexture(),
      color: color.clone().lerp(WHITE, 0.75),
      life: 0.15,
      startScale: 0.6 * s,
      endScale: 3.1 * s,
      spin: (Math.random() - 0.5) * 2.2,
      scaleEase: "pop",
      fadePower: 2.0,
    });
    // 芯だけは逆に縮む。外へ広がるものと逆向きの動きを1つ混ぜると、
    // 「一点に力が集まった」ように見える
    this.billboards.spawn({
      position,
      texture: fireballTexture(),
      color: color.clone().lerp(WHITE, 0.5),
      life: 0.22,
      startScale: 1.7 * s,
      endScale: 0.3 * s,
      fadePower: 1.2,
    });

    // --- 波 ---
    this.shockRing(position, hot, {
      radius: 0.45 * s,
      grow: 4.2,
      width: 1.5 * s,
      life: 0.22,
      coreWhite: 0.85,
      fadePower: 1.7,
    });
    this.shockRing(position, color, {
      radius: 0.4 * s,
      grow: 5.4,
      width: 0.9 * s,
      life: 0.3,
      opacity: 0.65,
      delay: 0.06,
      fadePower: 1.4,
    });
    // 地面へ抜ける衝撃。接地感はここで出る
    this.shockRing(position, color.clone().lerp(WHITE, 0.3), {
      radius: 0.7 * s,
      grow: 4.0,
      width: 1.8 * s,
      life: 0.38,
      plane: "ground",
      opacity: 0.75,
      fadePower: 1.3,
    });

    // 火花。指向性がある場合は攻撃方向へ抜ける
    this.radialStreaks(position, color.clone().lerp(hot, 0.6), {
      count: this.count(16 * s),
      speed: 8.5 * s,
      size: 11 * s,
      life: 0.34,
      direction,
      focus: direction ? 0.5 : 0,
      gravity: -9,
      drag: 0.84,
    });

    // --- 余韻 ---
    // 破片(通常合成なので「物」として見える)
    this.particles.burst(position, dust, {
      count: this.count(8 * s),
      speed: 5.5 * s,
      size: 9 * s,
      life: 0.75,
      cell: SPRITE.SHARD,
      layer: "alpha",
      gravity: -12,
      drag: 0.94,
      randomSpin: 14,
      alpha: 0.9,
    });
    // 足元の砂埃
    this.particles.ringBurst(this.ground(position), dust, {
      count: this.count(9 * s),
      speed: 3.6 * s,
      radius: 0.25,
      upBias: 0.5,
      size: 26 * s,
      life: 0.7,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.35,
      drag: 0.9,
      growth: 2.2,
      fadeIn: 0.06,
      randomSpin: 1.6,
    });
    // 当たった点の背後に暗い塊を置く。加算の光は、暗いものが隣にあって
    // はじめて「明るい」と読める。ここを抜くと全部が同じ灰色に見える
    this.particles.burst(position, dust.clone().multiplyScalar(0.5), {
      count: this.count(5 * s),
      speed: 1.6 * s,
      upBias: 0.8,
      size: 32 * s,
      life: 1.0,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.4,
      drag: 0.93,
      growth: 2.6,
      fadeIn: 0.1,
      randomSpin: 1.2,
    });
  }

  // -------------------------------------------------------------------------
  // 属性別のヒット表現
  //
  // 色を変えるだけでは属性の違いは伝わらない。動きの質を変える。
  //   炎  舐めるように外へ広がり、長く残る
  //   水  流れる。速い立ち上がりを持たず、輪が滑る
  //   雷  一瞬で刺さって消える。溜めも余韻もない
  //   草  地面から生えて絡む
  //   光  外から中心へ差し込む(唯一、収束する属性)
  //   闇  吸い込んでから喰う
  // -------------------------------------------------------------------------

  private impactFire(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("FIRE", "hot");
    const deep = this.accent("FIRE", "deep");
    this.updateCameraBasis();

    // 火の舌。外へ向かって舐めるように伸びる。
    // 伸びきる時間をずらすと、炎が「広がっていく」ように見える
    const tongues = this.count(5);
    for (let i = 0; i < tongues; i++) {
      const angle = (i / tongues) * Math.PI * 2 + Math.random() * 0.8;
      const length = (1.6 + Math.random() * 1.4) * s;
      const end = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * length)
        .addScaledVector(this.camUp, Math.sin(angle) * length * 0.75 + 0.5 * s);
      this.schedule(i * 0.035, () => {
        this.strips.spawn(
          {
            points: wavyPath(position, end, 9, 0.28 * s, this.cameraPosition, 1.2),
            color: i % 2 === 0 ? hot : color.clone().lerp(deep, 0.4),
            width: (1.5 - i * 0.12) * s,
            life: 0.34,
            revealSec: 0.12,
            band: 0.9,
            coreWhite: 0.45,
            glow: 0.7,
            widthProfile: "taperEnd",
            fadePower: 1.9,
          },
          this.cameraPosition,
        );
      });
    }
    // 膨らむ火球。少し遅れて上へ抜ける
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, position.y + 0.15 * s, position.z),
      texture: fireballTexture(),
      color: color.clone().lerp(hot, 0.35),
      life: 0.42,
      startScale: 0.9 * s,
      endScale: 3.4 * s,
      roll: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.6,
      fadePower: 1.6,
      velocity: new THREE.Vector3(0, 0.9, 0),
    });
    // 地面の焦げ跡。1秒以上残るものが1つあると、爆発に重さが出る
    this.billboards.spawn({
      position: this.ground(position).clone(),
      texture: crackDecalTexture(),
      color: deep,
      life: 1.3,
      startScale: 1.6 * s,
      endScale: 2.4 * s,
      orient: "ground",
      opacity: 0.7,
      roll: Math.random() * Math.PI,
      fadePower: 1.8,
    });
    // 火の粉。ゆっくり漂って落ちる
    this.particles.burst(position, color.clone().lerp(hot, 0.35), {
      count: this.count(20 * s),
      speed: 4.6 * s,
      upBias: 2.0,
      size: 14 * s,
      life: 0.9,
      cell: SPRITE.FLAME,
      gravity: -1.2,
      drag: 0.9,
      growth: 0.5,
      randomSpin: 3,
      fadePower: 1.3,
    });
    // 黒煙。炎の明るさは、この煙があってはじめて出る
    this.particles.burst(position, new THREE.Color(0x2c2028), {
      count: this.count(7 * s),
      speed: 2.2 * s,
      upBias: 1.8,
      size: 34 * s,
      life: 1.3,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.5,
      drag: 0.95,
      growth: 2.4,
      fadeIn: 0.12,
      randomSpin: 1.1,
    });
  }

  private impactWater(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("WATER", "hot");
    // 水は「弾ける」より「流れる」。輪を一周ぶん走らせて、
    // 一気に開くのではなく回り込むように見せる
    this.shockRing(position, hot, {
      radius: 1.1 * s,
      grow: 2.4,
      width: 1.3 * s,
      life: 0.55,
      plane: "ground",
      revealSec: 0.28,
      band: 0.55,
      opacity: 0.9,
      fadePower: 1.2,
      jitter: 0.03,
    });
    // 水面の波紋。細い輪が三重に広がる
    this.billboards.spawn({
      position: this.ground(position).clone(),
      texture: rippleRingsTexture(),
      color: hot,
      life: 0.7,
      startScale: 0.8 * s,
      endScale: 4.6 * s,
      orient: "ground",
      opacity: 0.85,
      scaleEase: "linear",
      fadePower: 1.5,
    });
    // 水冠。上へ跳ね上がってから落ちてくる
    this.particles.ringBurst(position, hot, {
      count: this.count(20 * s),
      speed: 3.2 * s,
      radius: 0.25 * s,
      upBias: 5.6 * s,
      upJitter: 0.5,
      size: 12 * s,
      life: 0.9,
      cell: SPRITE.DROP,
      layer: "alpha",
      gravity: -14,
      drag: 0.99,
      alpha: 0.95,
    });
    this.particles.burst(position, color, {
      count: this.count(14 * s),
      speed: 6.0 * s,
      size: 10 * s,
      life: 0.65,
      cell: SPRITE.DROP,
      layer: "alpha",
      gravity: -13,
      drag: 0.98,
      alpha: 0.8,
      randomSpin: 3,
    });
    // 氷片
    this.particles.burst(position, hot, {
      count: this.count(9 * s),
      speed: 4.5 * s,
      size: 14 * s,
      life: 0.7,
      cell: SPRITE.CRYSTAL,
      gravity: -3,
      drag: 0.92,
      randomSpin: 4,
      growth: 0.6,
    });
    // 霧。横へ流れて消える
    this.particles.burst(position, color.clone().lerp(WHITE, 0.55), {
      count: this.count(6 * s),
      speed: 2.6 * s,
      flatten: 0.75,
      size: 30 * s,
      life: 0.95,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.32,
      drag: 0.94,
      growth: 2.2,
      fadeIn: 0.1,
      randomSpin: 0.8,
    });
  }

  private impactElectric(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("ELECTRIC", "hot");
    this.updateCameraBasis();
    // 雷は溜めも余韻も持たない。0.2秒で始まって終わる。
    // 数を出すと帯の上限に当たって間引かれ、かえって弱くなるので3本に絞る
    const bolts = this.count(3);
    for (let i = 0; i < bolts; i++) {
      const theta = (i / bolts) * Math.PI * 2 + Math.random() * 0.9;
      const length = (2.2 + Math.random() * 1.4) * s;
      const target = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(theta) * length)
        .addScaledVector(this.camUp, Math.sin(theta) * length);
      const points = zigzagPath(position, target, 9, 0.45 * s, this.cameraPosition);
      this.strips.spawn(
        {
          points,
          color: i === 0 ? hot : color.clone().lerp(hot, 0.5),
          width: 0.62 * s,
          life: 0.15 + Math.random() * 0.08,
          coreWhite: 0.95,
          glow: 0.5,
          flicker: 0.35,
          fadePower: 1.0,
          widthProfile: "taperEnd",
        },
        this.cameraPosition,
      );
      // 枝分かれ
      if (i === 0) {
        const mid = points[Math.floor(points.length * 0.5)];
        const branch = new THREE.Vector3()
          .copy(mid)
          .addScaledVector(this.camRight, (Math.random() - 0.5) * 2.2 * s)
          .addScaledVector(this.camUp, (Math.random() - 0.5) * 2.2 * s);
        this.strips.spawn(
          {
            points: zigzagPath(mid, branch, 5, 0.3 * s, this.cameraPosition),
            color: hot,
            width: 0.34 * s,
            life: 0.11,
            coreWhite: 1,
            flicker: 0.5,
            widthProfile: "taperEnd",
          },
          this.cameraPosition,
        );
      }
    }
    // 明滅。ひと呼吸おいてもう一度光ると、電気らしい神経質さが出る
    this.schedule(0.06, () => {
      this.billboards.spawn({
        position,
        texture: flashStarTexture(),
        color: hot,
        life: 0.06,
        startScale: 3.6 * s,
        endScale: 2.2 * s,
        roll: Math.PI / 4,
        fadePower: 1.1,
      });
    });
    // 帯電した細かい火花。速く、短く
    this.radialStreaks(position, hot, {
      count: this.count(22 * s),
      speed: 12 * s,
      size: 7 * s,
      life: 0.22,
      cell: SPRITE.SPARK,
      gravity: -2,
      drag: 0.78,
      fadePower: 0.8,
    });
    // 残響。消えたと思った直後に一度だけ弾ける
    this.schedule(0.22, () => {
      const theta = Math.random() * Math.PI * 2;
      const end = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(theta) * 1.9 * s)
        .addScaledVector(this.camUp, Math.sin(theta) * 1.9 * s);
      this.strips.spawn(
        {
          points: zigzagPath(position, end, 7, 0.4 * s, this.cameraPosition),
          color: hot,
          width: 0.4 * s,
          life: 0.1,
          coreWhite: 1,
          flicker: 0.5,
          widthProfile: "taperEnd",
        },
        this.cameraPosition,
      );
    });
  }

  private impactGrass(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("GRASS", "hot");
    const deep = this.accent("GRASS", "deep");
    // 地面から蔦が巻き上がる。生える速さをずらすと絡みつくように見える
    const vines = this.count(3);
    for (let i = 0; i < vines; i++) {
      const base = new THREE.Vector3(
        position.x + (Math.random() - 0.5) * 0.9 * s,
        GROUND_Y,
        position.z + (Math.random() - 0.5) * 0.9 * s,
      );
      this.schedule(i * 0.05, () => {
        this.strips.spawn(
          {
            points: helixPath(base, (0.7 + Math.random() * 0.5) * s, (2.4 + Math.random() * 0.9) * s, 1.1 + Math.random() * 0.6, 26, Math.random() * 6.28),
            color: i % 2 === 0 ? color : deep,
            width: 0.75 * s,
            life: 0.8,
            revealSec: 0.22,
            band: 1.4,
            coreWhite: 0.25,
            glow: 0.5,
            widthProfile: "taperEnd",
            fadePower: 1.8,
          },
          this.cameraPosition,
        );
      });
    }
    // 葉が舞う
    this.particles.burst(position, color, {
      count: this.count(16 * s),
      speed: 4.2 * s,
      upBias: 1.2,
      size: 16 * s,
      life: 1.2,
      cell: SPRITE.LEAF,
      layer: "alpha",
      gravity: -2.2,
      drag: 0.95,
      randomSpin: 5,
      wobble: 0.8,
      alpha: 0.95,
    });
    // 花粉のような細かい光
    this.particles.burst(position, hot, {
      count: this.count(14 * s),
      speed: 3.4 * s,
      size: 8 * s,
      life: 0.9,
      cell: SPRITE.MOTE,
      gravity: -0.6,
      drag: 0.94,
      wobble: 0.5,
    });
    this.shockRing(position, hot, {
      radius: 0.9 * s,
      grow: 3.0,
      width: 1.2 * s,
      life: 0.5,
      plane: "ground",
      opacity: 0.8,
      fadePower: 1.4,
    });
  }

  private impactLight(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("LIGHT", "hot");
    // 光だけは外から中へ「差し込む」。他の属性が広がるなかで
    // 1つだけ収束するものがあると、それだけで別物に見える
    for (let i = 0; i < 2; i++) {
      this.shockRing(position, hot, {
        radius: (3.2 + i * 1.1) * s,
        grow: 0.12,
        width: (1.1 - i * 0.3) * s,
        life: 0.3,
        coreWhite: 0.9,
        opacity: 0.9 - i * 0.25,
        delay: i * 0.07,
        fadePower: 0.8,
        jitter: 0.02,
      });
    }
    // 放射する光条
    this.billboards.spawn({
      position,
      texture: godRayTexture(),
      color: color.clone().lerp(hot, 0.6),
      life: 0.45,
      startScale: 1.0 * s,
      endScale: 4.4 * s,
      spin: 0.5,
      scaleEase: "pop",
      fadePower: 2.2,
    });
    // 天から降りる柱。遅れて着くことで「差した」順序が読める
    this.schedule(0.05, () => {
      this.billboards.spawn({
        position: new THREE.Vector3(position.x, GROUND_Y + 2.6 * s, position.z),
        texture: lightPillarTexture(),
        color: color.clone().lerp(hot, 0.55),
        life: 0.5,
        startScale: 1.9 * s,
        endScale: 1.2 * s,
        aspect: 3.2,
        orient: "upright",
        opacity: 0.95,
        fadePower: 2.2,
        scaleEase: "pop",
      });
    });
    // 足元の陣
    this.billboards.spawn({
      position: this.ground(position).clone(),
      texture: runeCircleTexture(),
      color: color.clone().lerp(hot, 0.3),
      life: 0.7,
      startScale: 3.6 * s,
      endScale: 2.2 * s,
      orient: "ground",
      opacity: 0.85,
      spin: 0.9,
      fadePower: 1.6,
    });
    // 抜けていく光の粒
    this.particles.burst(position, hot, {
      count: this.count(20 * s),
      speed: 2.0 * s,
      upBias: 2.6,
      size: 11 * s,
      life: 1.1,
      cell: SPRITE.FLARE,
      gravity: 1.2,
      drag: 0.97,
      randomSpin: 2,
      fadePower: 1.6,
    });
  }

  private impactDark(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("DARK", "hot");
    const deep = this.accent("DARK", "deep");
    this.updateCameraBasis();

    // 1) 吸い込む。周囲の粒が中心へ落ちていく
    for (let i = 0; i < this.count(16 * s); i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (1.8 + Math.random() * 1.2) * s;
      const height = (Math.random() - 0.5) * 2 * s;
      this.particles.spawn({
        position: new THREE.Vector3(position.x + Math.cos(angle) * radius, position.y + height, position.z + Math.sin(angle) * radius),
        velocity: new THREE.Vector3(-Math.cos(angle) * 2.4, -height * 0.8, -Math.sin(angle) * 2.4),
        color: hot,
        size: 9 * s,
        life: 0.32,
        cell: SPRITE.MOTE,
        attractor: position.clone(),
        attract: 9,
        drag: 1,
        fadePower: 0.6,
      });
    }
    // 収束する輪。閉じきったところで喰う
    this.shockRing(position, hot, {
      radius: 2.8 * s,
      grow: 0.1,
      width: 0.9 * s,
      life: 0.17,
      coreWhite: 0.4,
      fadePower: 0.7,
    });

    // 2) 喰う。背景を黒く抜く塊を通常合成で置く。
    // 加算の光だけでは「闇」は描けない。暗いものを実際に置く必要がある
    this.schedule(0.15, () => {
      this.billboards.spawn({
        position,
        texture: voidCoreTexture(),
        color: new THREE.Color(0x0a0410),
        life: 0.5,
        startScale: 0.4 * s,
        endScale: 3.0 * s,
        blending: THREE.NormalBlending,
        opacity: 0.9,
        fadePower: 1.6,
      });
      this.billboards.spawn({
        position,
        texture: vortexTexture(),
        color: color.clone().lerp(hot, 0.5),
        life: 0.45,
        startScale: 0.5 * s,
        endScale: 3.6 * s,
        spin: 5.0,
        fadePower: 1.8,
      });
      // 縁だけが光る
      this.shockRing(position, hot, {
        radius: 0.5 * s,
        grow: 5.0,
        width: 1.2 * s,
        life: 0.28,
        coreWhite: 0.7,
        fadePower: 1.5,
      });
      this.radialStreaks(position, hot, {
        count: this.count(14 * s),
        speed: 8 * s,
        size: 10 * s,
        life: 0.4,
        gravity: -6,
        drag: 0.88,
      });
      this.particles.burst(position, deep, {
        count: this.count(12 * s),
        speed: 6.5 * s,
        size: 28 * s,
        life: 0.8,
        cell: SPRITE.SMOKE,
        layer: "alpha",
        alpha: 0.75,
        drag: 0.86,
        growth: 1.8,
        randomSpin: 3,
      });
    });

    // 内向きに喰いつく牙
    for (let i = 0; i < this.count(4); i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.random();
      const outer = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * 2.8 * s)
        .addScaledVector(this.camUp, Math.sin(angle) * 2.8 * s);
      this.strips.spawn(
        {
          points: wavyPath(outer, position.clone(), 8, 0.35 * s, this.cameraPosition, 0.6),
          color: hot,
          width: 0.85 * s,
          life: 0.3,
          revealSec: 0.12,
          band: 0.7,
          widthProfile: "taperEnd",
          coreWhite: 0.5,
          glow: 0.6,
          fadePower: 2,
        },
        this.cameraPosition,
      );
    }
  }

  private impactNeutral(position: THREE.Vector3, color: THREE.Color, s: number): void {
    this.radialStreaks(position, color, {
      count: this.count(12 * s),
      speed: 7 * s,
      size: 10 * s,
      life: 0.4,
      gravity: -7,
      drag: 0.87,
    });
  }

  private elementImpact(element: VfxElement, position: THREE.Vector3, color: THREE.Color, s: number): void {
    switch (element) {
      case "FIRE":
        this.impactFire(position, color, s);
        break;
      case "WATER":
        this.impactWater(position, color, s);
        break;
      case "ELECTRIC":
        this.impactElectric(position, color, s);
        break;
      case "GRASS":
        this.impactGrass(position, color, s);
        break;
      case "LIGHT":
        this.impactLight(position, color, s);
        break;
      case "DARK":
        this.impactDark(position, color, s);
        break;
      default:
        this.impactNeutral(position, color, s);
    }
  }

  // -------------------------------------------------------------------------
  // 当たり方(役割)別の表現
  //
  // 属性が「何で殴られたか」なら、こちらは「どう殴られたか」。
  //   斬撃 面で切り裂く。弧が残る
  //   打撃 一点で潰す。地面が割れ、遅れてもう一度響く
  //   刺突 線で貫く。向きが全て
  //   魔法 物理的な破片が出ない。幾何学的な記号が出る
  // -------------------------------------------------------------------------

  private styleImpact(style: HitStyle, position: THREE.Vector3, color: THREE.Color, s: number, options: ImpactOptions): void {
    const element = options.element ?? "NEUTRAL";
    switch (style) {
      case "slash":
        this.spawnSlash(position, color, { element, scale: s, count: options.crit ? 3 : 2 });
        break;
      case "blunt":
        this.impactBlunt(position, color, s, options.direction);
        break;
      case "pierce":
        this.spawnPierce(position, color, s, options.direction);
        break;
      default:
        this.impactMagicStyle(position, color, s, element);
    }
  }

  /** 打撃。潰す方向へ輪がつぶれ、地面が割れ、遅れてもう一度響く */
  private impactBlunt(position: THREE.Vector3, color: THREE.Color, s: number, direction?: THREE.Vector3): void {
    this.updateCameraBasis();
    // 打撃方向へ押しつぶれた楕円の輪。真円だと「爆発」に見えてしまう
    const dir = direction ? direction.clone().normalize() : null;
    const right = dir ? this.camRight.clone().multiplyScalar(1.0) : this.camRight.clone();
    const up = this.camUp.clone().multiplyScalar(0.45);
    this.shockRing(position, WHITE, {
      radius: 0.7 * s,
      grow: 3.6,
      width: 1.6 * s,
      life: 0.24,
      basis: { right, up },
      coreWhite: 0.9,
      fadePower: 1.8,
    });
    // 地面の亀裂。1秒残る「跡」が、打撃だけの手札
    this.billboards.spawn({
      position: this.ground(position).clone(),
      texture: crackDecalTexture(),
      color: color.clone().lerp(WHITE, 0.25),
      life: 1.1,
      startScale: 1.2 * s,
      endScale: 2.8 * s,
      orient: "ground",
      opacity: 0.85,
      roll: Math.random() * Math.PI,
      fadePower: 2.2,
    });
    // 重い破片
    this.particles.burst(position, this.accent("NEUTRAL", "dust"), {
      count: this.count(9 * s),
      speed: 6.5 * s,
      upBias: 1.4,
      size: 12 * s,
      life: 0.9,
      cell: SPRITE.SHARD,
      layer: "alpha",
      gravity: -16,
      drag: 0.96,
      randomSpin: 16,
      alpha: 0.95,
    });
    // 遅れて響く二度目。打撃はここが効く
    this.schedule(0.11, () => {
      this.shockRing(position, color, {
        radius: 0.5 * s,
        grow: 4.4,
        width: 1.0 * s,
        life: 0.3,
        plane: "ground",
        opacity: 0.6,
        fadePower: 1.2,
      });
      this.billboards.spawn({
        position,
        texture: impactStarTexture(),
        color: color.clone().lerp(WHITE, 0.4),
        life: 0.14,
        startScale: 1.0 * s,
        endScale: 2.4 * s,
        spin: (Math.random() - 0.5) * 2,
        fadePower: 2.2,
      });
    });
  }

  /** 魔法。物理的な破片ではなく、幾何学的な記号で当てる */
  private impactMagicStyle(position: THREE.Vector3, color: THREE.Color, s: number, element: VfxElement): void {
    const hot = this.accent(element, "hot");
    // カメラへ正対する呪印が一瞬だけ立つ
    this.billboards.spawn({
      position,
      texture: runeCircleTexture(),
      color: hot,
      life: 0.26,
      startScale: 3.0 * s,
      endScale: 1.2 * s,
      opacity: 0.9,
      spin: -1.6,
      fadePower: 2.4,
    });
    // 同心の二重輪
    this.shockRing(position, color.clone().lerp(hot, 0.5), {
      radius: 1.5 * s,
      grow: 2.2,
      width: 0.8 * s,
      life: 0.34,
      opacity: 0.8,
      delay: 0.04,
      fadePower: 1.3,
      jitter: 0.02,
      segments: 30,
    });
    this.particles.burst(position, hot, {
      count: this.count(10 * s),
      speed: 4.5 * s,
      size: 9 * s,
      life: 0.55,
      cell: SPRITE.RUNE,
      drag: 0.9,
      randomSpin: 5,
      fadePower: 1.4,
    });
  }

  // -------------------------------------------------------------------------
  // 公開API: ヒット
  // -------------------------------------------------------------------------

  /**
   * 通常ヒット。
   * @param power 0.6〜2程度。ダメージの大きさに応じて渡す
   * @param options 属性・当たり方・全体攻撃かどうか。文字列で属性だけ渡すことも可
   */
  spawnImpact(position: THREE.Vector3, color: THREE.Color, power = 1, options?: ImpactArg): void {
    const opt = normalizeImpactOptions(options);
    const element = opt.element ?? "NEUTRAL";
    const s = Math.max(0.35, power) * (opt.aoe ? 1.3 : 1) * (opt.scale ?? 1) * (opt.crit ? 1.25 : 1);

    this.impactCore(position, color, s, opt);
    this.elementImpact(element, position, color, s);
    this.styleImpact(opt.hitStyle ?? "magic", position, color, s, opt);
  }

  /** クリティカル。別格に見えるよう、三段の輪と放射線を足す */
  spawnCriticalImpact(position: THREE.Vector3, color: THREE.Color, options?: ImpactArg): void {
    const opt = normalizeImpactOptions(options);
    const element = opt.element ?? "NEUTRAL";
    const s = 1.45 * (opt.aoe ? 1.25 : 1) * (opt.scale ?? 1);
    const hot = this.accent(element, "hot");
    this.updateCameraBasis();

    // 白い一撃。通常ヒットより短く、より白い
    this.billboards.spawn({
      position,
      texture: flashStarTexture(),
      color: WHITE,
      life: 0.11,
      startScale: 3.4 * s,
      endScale: 5.4 * s,
      fadePower: 2.6,
      roll: (Math.random() - 0.5) * 0.6,
    });
    // 放射状の集中線。クリティカル固有の記号。
    // 帯の同時生存数には上限があるので、本数ではなく長さで見せる
    const lines = this.count(6);
    for (let i = 0; i < lines; i++) {
      const angle = (i / lines) * Math.PI * 2 + Math.random() * 0.3;
      const inner = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * 0.8 * s)
        .addScaledVector(this.camUp, Math.sin(angle) * 0.8 * s);
      const outer = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * (4.2 + Math.random() * 2.4) * s)
        .addScaledVector(this.camUp, Math.sin(angle) * (4.2 + Math.random() * 2.4) * s);
      this.strips.spawn(
        {
          points: [inner, outer],
          color: i % 3 === 0 ? WHITE : color.clone().lerp(hot, 0.5),
          width: 0.9 * s,
          life: 0.28,
          revealSec: 0.05,
          band: 1.1,
          widthProfile: "taperEnd",
          coreWhite: 0.7,
          glow: 0.9,
          fadePower: 2.2,
        },
        this.cameraPosition,
      );
    }

    this.impactCore(position, color, s, { ...opt, element, crit: true });
    this.elementImpact(element, position, color, s * 1.1);
    this.styleImpact(opt.hitStyle ?? "magic", position, color, s, { ...opt, element, crit: true });

    // 三段目の輪。通常ヒットは二段までなので、ここで格の違いが出る
    this.schedule(0.16, () => {
      this.shockRing(position, WHITE, {
        radius: 0.6 * s,
        grow: 7.0,
        width: 1.1 * s,
        life: 0.4,
        opacity: 0.7,
        coreWhite: 0.9,
        fadePower: 1.2,
      });
      this.radialStreaks(position, hot, {
        count: this.count(14 * s),
        speed: 10 * s,
        size: 10 * s,
        life: 0.55,
        gravity: -10,
        drag: 0.88,
      });
    });
  }

  /** 斬撃。カメラに正対する弧のリボンを振る */
  spawnSlash(
    position: THREE.Vector3,
    color: THREE.Color,
    options?: { element?: VfxElement; scale?: number; count?: number; cross?: boolean; angle?: number },
  ): void {
    const s = options?.scale ?? 1;
    const count = options?.count ?? 2;
    const element = options?.element ?? "NEUTRAL";
    const hot = this.accent(element, "hot");
    this.updateCameraBasis();

    const baseAngle = options?.angle ?? Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = options?.cross ? baseAngle + (i * Math.PI) / 2 + 0.4 : baseAngle + i * 0.55;
      const radius = (1.7 + Math.random() * 0.5) * s;
      const sweep = 1.9 + Math.random() * 0.8;
      const points = arcPath(position, radius, angle - sweep / 2, sweep, 24, { right: this.camRight, up: this.camUp }, 0.14);
      // 振り抜く速さを1枚ごとにずらす。同時に出すと「模様」になってしまう
      this.schedule(i * 0.055, () => {
        this.strips.spawn(
          {
            points,
            color: i === 0 ? WHITE : color.clone().lerp(hot, 0.55),
            width: (1.5 - i * 0.3) * s,
            life: 0.3,
            revealSec: 0.06,
            band: 0.8,
            widthProfile: "blade",
            coreWhite: 0.75,
            glow: 1.0,
            fadePower: 2.3,
          },
          this.cameraPosition,
        );
        // 刃が通った線に沿って火花が散る
        for (let p = 0; p < this.count(5); p++) {
          const point = points[Math.floor(Math.random() * points.length)];
          this.particles.spawn({
            position: point,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.3) * 5, (Math.random() - 0.5) * 5),
            color: hot,
            size: 8 * s,
            life: 0.3,
            cell: SPRITE.CRESCENT,
            gravity: -8,
            drag: 0.85,
            spin: (Math.random() - 0.5) * 10,
          });
        }
      });
    }
  }

  /** 刺突。攻撃方向へ細長い衝撃を貫通させる */
  private spawnPierce(position: THREE.Vector3, color: THREE.Color, s: number, direction?: THREE.Vector3): void {
    this.updateCameraBasis();
    const dir = direction ? direction.clone().normalize() : this.camRight.clone();
    const from = position.clone().addScaledVector(dir, -2.6 * s);
    const to = position.clone().addScaledVector(dir, 3.0 * s);
    // 貫く線。走らせて見せるので revealSec を短く取る
    this.strips.spawn(
      {
        points: wavyPath(from, to, 10, 0.04 * s, this.cameraPosition, 1),
        color: color.clone().lerp(WHITE, 0.65),
        width: 1.2 * s,
        life: 0.26,
        revealSec: 0.05,
        band: 0.7,
        widthProfile: "spindle",
        coreWhite: 0.85,
        glow: 1.0,
        fadePower: 2.2,
      },
      this.cameraPosition,
    );
    // 進行方向に垂直な輪。「貫通した面」がここで見える
    const side = new THREE.Vector3().crossVectors(dir, this.camUp).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    this.shockRing(position, color.clone().lerp(WHITE, 0.4), {
      radius: 0.4 * s,
      grow: 3.4,
      width: 1.0 * s,
      life: 0.24,
      basis: { right: side, up },
      coreWhite: 0.8,
      fadePower: 1.8,
      segments: 28,
    });
    // 抜けた先へ吹き出す
    this.radialStreaks(position, color.clone().lerp(WHITE, 0.3), {
      count: this.count(14 * s),
      speed: 11 * s,
      size: 9 * s,
      life: 0.32,
      direction: dir,
      focus: 0.85,
      gravity: -5,
      drag: 0.86,
    });
  }

  /**
   * 全体攻撃の着弾。中心から地面を走る大波と、周囲の小爆発で規模を見せる。
   * 個々の対象へのヒットは spawnImpact(..., { aoe: true }) を併用する。
   */
  spawnAoeImpact(center: THREE.Vector3, color: THREE.Color, options?: ImpactArg & { radius?: number }): void {
    const opt = normalizeImpactOptions(options);
    const radius = (typeof options === "object" && options && "radius" in options ? options.radius : undefined) ?? 5;
    const element = opt.element ?? "NEUTRAL";
    const hot = this.accent(element, "hot");
    const ground = new THREE.Vector3(center.x, GROUND_Y, center.z);

    // 地面を走る大波。板だと画面を覆って白飛びするが、輪なら広げられる
    this.shockRing(ground, color.clone().lerp(WHITE, 0.4), {
      radius: 0.8,
      grow: radius * 1.9,
      width: 2.6,
      life: 0.75,
      plane: "ground",
      opacity: 0.95,
      coreWhite: 0.7,
      fadePower: 1.3,
      jitter: 0.05,
    });
    this.shockRing(ground, hot, {
      radius: 0.6,
      grow: radius * 2.6,
      width: 1.6,
      life: 0.9,
      plane: "ground",
      opacity: 0.6,
      delay: 0.12,
      fadePower: 1.1,
    });
    this.particles.ringBurst(ground, this.accent(element, "dust"), {
      count: this.count(24),
      speed: 8,
      radius: 0.6,
      upBias: 1.8,
      size: 34,
      life: 1.1,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.42,
      drag: 0.92,
      growth: 2.4,
      fadeIn: 0.08,
      randomSpin: 1.4,
    });
    // 周囲に散る小爆発。外側ほど遅らせて、波が届いた順に見せる
    for (let i = 0; i < 4; i++) {
      const distance = radius * (0.35 + (i / 4) * 0.5);
      this.schedule(0.04 + distance * 0.055, () => {
        const angle = Math.random() * Math.PI * 2;
        const spot = new THREE.Vector3(center.x + Math.cos(angle) * distance, center.y * 0.7 + 0.3, center.z + Math.sin(angle) * distance);
        this.elementImpact(element, spot, color, 0.7);
      });
    }
  }


  /** 連鎖する稲妻。チェイン攻撃や電撃スキルの見せ場に使う */
  spawnLightningBolt(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: THREE.Color,
    options?: { width?: number; branches?: number; life?: number; strikes?: number },
  ): void {
    const width = options?.width ?? 0.22;
    const branches = options?.branches ?? 2;
    const life = options?.life ?? 0.2;
    const strikes = options?.strikes ?? 2;
    const hot = new THREE.Color(0xfffbe0);

    for (let strike = 0; strike < strikes; strike++) {
      this.schedule(strike * 0.05, () => {
        const points = zigzagPath(from, to, 14, 0.55, this.cameraPosition);
        this.strips.spawn(
          {
            points,
            color: strike === 0 ? hot : color,
            width: width * (1 - strike * 0.25),
            life,
            coreWhite: 0.95,
            glow: 0.6,
            flicker: 0.4,
            fadePower: 1.2,
            widthProfile: "even",
          },
          this.cameraPosition,
        );
        for (let b = 0; b < branches; b++) {
          const index = Math.floor(points.length * (0.25 + Math.random() * 0.5));
          const origin = points[index];
          const end = new THREE.Vector3(
            origin.x + (Math.random() - 0.5) * 2.6,
            origin.y + (Math.random() - 0.3) * 2.0,
            origin.z + (Math.random() - 0.5) * 2.6,
          );
          this.strips.spawn(
            {
              points: zigzagPath(origin, end, 6, 0.3, this.cameraPosition),
              color: hot,
              width: width * 0.55,
              life: life * 0.7,
              coreWhite: 1,
              flicker: 0.5,
              widthProfile: "taperEnd",
            },
            this.cameraPosition,
          );
        }
      });
    }
    // 経路上に火花を散らして「通った」痕跡を残す
    for (let i = 0; i < this.count(10); i++) {
      const t = Math.random();
      this.particles.spawn({
        position: new THREE.Vector3().lerpVectors(from, to, t),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4),
        color: hot,
        size: 8,
        life: 0.3,
        cell: SPRITE.SPARK,
        gravity: -3,
        drag: 0.85,
      });
    }
  }

  /** 光の奔流。詠唱からの太い直線ビーム */
  spawnBeam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, options?: { width?: number; life?: number; element?: VfxElement }): void {
    const width = options?.width ?? 0.9;
    const life = options?.life ?? 0.35;
    const element = options?.element ?? "LIGHT";
    const hot = this.accent(element, "hot");
    this.strips.spawn(
      {
        points: [from.clone(), new THREE.Vector3().lerpVectors(from, to, 0.5), to.clone()],
        color: hot,
        width,
        life,
        revealSec: 0.06,
        band: 2,
        coreWhite: 0.85,
        glow: 0.8,
        widthProfile: "even",
        fadePower: 2,
      },
      this.cameraPosition,
    );
    this.strips.spawn(
      {
        points: [from.clone(), to.clone()],
        color,
        width: width * 2.1,
        life: life * 1.2,
        coreWhite: 0.2,
        glow: 0.3,
        widthProfile: "even",
        fadePower: 2.4,
        opacity: 0.5,
      },
      this.cameraPosition,
    );
    for (let i = 0; i < this.count(14); i++) {
      const t = Math.random();
      this.particles.spawn({
        position: new THREE.Vector3().lerpVectors(from, to, t),
        velocity: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
        color: hot,
        size: 9,
        life: 0.4,
        cell: SPRITE.FLARE,
        drag: 0.9,
        spin: 3,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 公開API: 補助系
  // -------------------------------------------------------------------------

  /** 回復。足元から光が立ち上り、癒しの陣が閉じる */
  spawnHeal(position: THREE.Vector3, color: THREE.Color, options?: SupportFxOptions): void {
    const s = options?.scale ?? 1;
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);
    this.billboards.spawn({
      position: ground,
      texture: runeCircleTexture(),
      color: color.clone().lerp(WHITE, 0.35),
      life: 0.9,
      startScale: 3.4 * s,
      endScale: 1.4 * s,
      orient: "ground",
      opacity: 0.9,
      spin: -0.9,
      fadePower: 1.4,
    });
    // 螺旋を描いて昇る光
    for (let i = 0; i < this.count(3); i++) {
      this.strips.spawn(
        {
          points: helixPath(ground, 1.0 * s, 3.2 * s, 1.2, 24, (i / 3) * Math.PI * 2, 0.5),
          color: color.clone().lerp(WHITE, 0.4),
          width: 0.16 * s,
          life: 0.8,
          revealSec: 0.3,
          band: 0.7,
          coreWhite: 0.6,
          fadePower: 1.6,
        },
        this.cameraPosition,
      );
    }
    this.particles.ringBurst(ground, color, {
      count: this.count(26 * s),
      speed: 0.5,
      radius: 1.0 * s,
      upBias: 2.6,
      upJitter: 0.2,
      size: 12 * s,
      life: 1.2,
      cell: SPRITE.FLARE,
      drag: 0.99,
      wobble: 0.3,
      fadePower: 1.5,
      randomSpin: 2,
    });
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, position.y + 0.3, position.z),
      texture: flashStarTexture(),
      color: color.clone().lerp(WHITE, 0.5),
      life: 0.4,
      startScale: 0.4 * s,
      endScale: 2.6 * s,
      fadePower: 2,
    });
  }

  /** 強化バフ。足元の陣から力が集まって身体を包む */
  spawnBuff(position: THREE.Vector3, color: THREE.Color, options?: SupportFxOptions): void {
    const s = options?.scale ?? 1;
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);
    this.billboards.spawn({
      position: ground,
      texture: runeCircleTexture(),
      color,
      life: 0.8,
      startScale: 1.0 * s,
      endScale: 3.2 * s,
      orient: "ground",
      opacity: 0.95,
      spin: 1.4,
      fadePower: 1.6,
    });
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, position.y + 0.2, position.z),
      texture: lightPillarTexture(),
      color: color.clone().lerp(WHITE, 0.3),
      life: 0.55,
      startScale: 1.4 * s,
      endScale: 2.2 * s,
      aspect: 2.2,
      orient: "upright",
      opacity: 0.7,
      fadePower: 2,
    });
    this.particles.ringBurst(ground, color, {
      count: this.count(22 * s),
      speed: 0.6,
      radius: 1.2 * s,
      upBias: 3.2,
      upJitter: 0.15,
      size: 11 * s,
      life: 0.9,
      cell: SPRITE.STREAK,
      drag: 0.98,
      swirl: 3.2,
      rotation: Math.PI / 2,
      fadePower: 1.4,
    });
    // 上向きの矢羽のような光条
    for (let i = 0; i < this.count(3); i++) {
      this.schedule(i * 0.07, () => {
        this.billboards.spawn({
          position: new THREE.Vector3(position.x, position.y - 1.0 + i * 0.4, position.z),
          texture: shockRingTexture(),
          color: color.clone().lerp(WHITE, 0.4),
          life: 0.45,
          startScale: 2.6 * s,
          endScale: 0.9 * s,
          orient: "ground",
          opacity: 0.85,
          velocity: new THREE.Vector3(0, 2.6, 0),
        });
      });
    }
  }

  /** 弱体デバフ。上から押し潰すように暗い力が落ちてくる */
  spawnDebuff(position: THREE.Vector3, color: THREE.Color, options?: SupportFxOptions): void {
    const s = options?.scale ?? 1;
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, position.y + 1.6 * s, position.z),
      texture: runeCircleTexture(),
      color,
      life: 0.7,
      startScale: 2.6 * s,
      endScale: 1.0 * s,
      orient: "ground",
      opacity: 0.9,
      spin: -1.8,
      velocity: new THREE.Vector3(0, -2.2, 0),
      fadePower: 1.5,
    });
    this.billboards.spawn({
      position: ground,
      texture: vortexTexture(),
      color: color.clone().multiplyScalar(0.8),
      life: 0.9,
      startScale: 0.6 * s,
      endScale: 3.2 * s,
      orient: "ground",
      opacity: 0.7,
      spin: -2.4,
      fadePower: 1.4,
    });
    // 上から降りてくる靄
    for (let i = 0; i < this.count(14 * s); i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 1.2 * s;
      this.particles.spawn({
        position: new THREE.Vector3(position.x + Math.cos(angle) * radius, position.y + 1.6 * s, position.z + Math.sin(angle) * radius),
        velocity: new THREE.Vector3(0, -1.6 - Math.random(), 0),
        color,
        size: (18 + Math.random() * 14) * s,
        life: 0.9,
        cell: SPRITE.SMOKE,
        layer: "alpha",
        alpha: 0.55,
        drag: 0.96,
        growth: 1.6,
        fadeIn: 0.1,
        spin: (Math.random() - 0.5) * 1.4,
      });
    }
    this.particles.burst(position, color, {
      count: this.count(10 * s),
      speed: 2.0 * s,
      size: 10 * s,
      life: 0.6,
      cell: SPRITE.RUNE,
      alpha: 0.9,
      drag: 0.92,
      randomSpin: 3,
      gravity: -2,
    });
  }

  /** シールド展開。六角形の結界が組み上がる */
  spawnShield(position: THREE.Vector3, color: THREE.Color, options?: SupportFxOptions): void {
    const s = options?.scale ?? 1;
    // 六角パネルが球面に張り付いていく
    for (let i = 0; i < this.count(26 * s); i++) {
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y)) * 1.9 * s;
      const target = new THREE.Vector3(position.x + Math.cos(angle) * r, position.y + y * 1.7 * s, position.z + Math.sin(angle) * r);
      const start = new THREE.Vector3().lerpVectors(position, target, 2.0);
      this.particles.spawn({
        position: start,
        velocity: new THREE.Vector3().subVectors(target, start).multiplyScalar(2.2),
        color,
        size: 16 * s,
        life: 0.6,
        cell: SPRITE.HEX,
        drag: 0.86,
        alpha: 0.95,
        spin: (Math.random() - 0.5) * 2,
        fadePower: 1.2,
      });
    }
    this.billboards.spawn({
      position,
      texture: shockRingTexture(),
      color: color.clone().lerp(WHITE, 0.4),
      life: 0.5,
      startScale: 4.4 * s,
      endScale: 2.0 * s,
      opacity: 0.9,
      fadePower: 1.4,
    });
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, GROUND_Y, position.z),
      texture: runeCircleTexture(),
      color,
      life: 0.7,
      startScale: 3.6 * s,
      endScale: 2.6 * s,
      orient: "ground",
      opacity: 0.8,
      spin: 1.0,
    });
  }

  /** 撃破。内部から崩壊して砕け散る */
  spawnDeath(position: THREE.Vector3, color: THREE.Color, options?: SupportFxOptions): void {
    const s = options?.scale ?? 1;
    this.billboards.spawn({
      position,
      texture: flashStarTexture(),
      color: WHITE,
      life: 0.2,
      startScale: 1.0 * s,
      endScale: 6.0 * s,
      fadePower: 2.4,
    });
    this.billboards.spawn({
      position,
      texture: shockRingTexture(),
      color: color.clone().lerp(WHITE, 0.3),
      life: 0.5,
      startScale: 0.6 * s,
      endScale: 6.5 * s,
      fadePower: 1.5,
    });
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, GROUND_Y, position.z),
      texture: shockRingTexture(),
      color,
      life: 0.8,
      startScale: 0.8 * s,
      endScale: 8.0 * s,
      orient: "ground",
      opacity: 0.8,
    });
    // 砕けた破片
    this.particles.burst(position, color, {
      count: this.count(34 * s),
      speed: 8 * s,
      size: 14 * s,
      life: 1.1,
      cell: SPRITE.SHARD,
      layer: "alpha",
      gravity: -13,
      drag: 0.95,
      randomSpin: 12,
      alpha: 0.95,
    });
    // 抜けていく魂のような光
    this.particles.burst(position, color.clone().lerp(WHITE, 0.5), {
      count: this.count(26 * s),
      speed: 3.0 * s,
      upBias: 2.6,
      size: 12 * s,
      life: 1.3,
      cell: SPRITE.FLARE,
      gravity: 0.8,
      drag: 0.97,
      wobble: 0.5,
      randomSpin: 3,
      fadePower: 1.6,
    });
    for (let i = 0; i < 3; i++) {
      this.billboards.spawn({
        position: new THREE.Vector3(position.x + (Math.random() - 0.5) * 1.4, position.y, position.z + (Math.random() - 0.5) * 1.4),
        texture: smokePuffTexture(),
        color: new THREE.Color(0x2b2233),
        life: 1.4,
        startScale: 1.2 * s,
        endScale: 4.0 * s,
        blending: THREE.NormalBlending,
        opacity: 0.45,
        fadeIn: 0.1,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.9, (Math.random() - 0.5) * 0.5),
        spin: (Math.random() - 0.5) * 0.8,
      });
    }
  }

  /** 詠唱の溜め。属性の力が術者へ集まってくる */
  spawnCastCharge(position: THREE.Vector3, color: THREE.Color, options?: SupportFxOptions): void {
    const s = options?.scale ?? 1;
    const element = options?.element ?? "NEUTRAL";
    const hot = this.accent(element, "hot");
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);

    this.billboards.spawn({
      position: ground,
      texture: runeCircleTexture(),
      color: color.clone().lerp(hot, 0.3),
      life: 0.8,
      startScale: 0.6 * s,
      endScale: 3.0 * s,
      orient: "ground",
      opacity: 0.9,
      spin: 1.6,
      fadeIn: 0.1,
      fadePower: 1.6,
    });
    // 外側から吸い込まれてくる光
    for (let i = 0; i < this.count(34); i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (2.0 + Math.random() * 1.6) * s;
      const height = (Math.random() - 0.3) * 2 * s;
      this.particles.spawn({
        position: new THREE.Vector3(position.x + Math.cos(angle) * radius, position.y + height, position.z + Math.sin(angle) * radius),
        velocity: new THREE.Vector3(-Math.cos(angle) * 1.2, -height * 0.4, -Math.sin(angle) * 1.2),
        color: i % 3 === 0 ? hot : color,
        size: (8 + Math.random() * 7) * s,
        life: 0.7,
        cell: element === "ELECTRIC" ? SPRITE.SPARK : SPRITE.GLOW,
        attractor: position.clone(),
        attract: 7,
        drag: 1,
        swirl: 2.4,
        fadePower: 0.7,
      });
    }
    // 溜めの芯
    this.billboards.spawn({
      position,
      texture: fireballTexture(),
      color: color.clone().lerp(hot, 0.5),
      life: 0.7,
      startScale: 0.2 * s,
      endScale: 1.5 * s,
      spin: 2.2,
      fadeIn: 0.25,
      fadePower: 0.7,
      scaleEase: "linear",
    });
    if (element === "ELECTRIC") {
      for (let i = 0; i < this.count(3); i++) {
        this.schedule(i * 0.12, () => {
          const a = Math.random() * Math.PI * 2;
          const from = new THREE.Vector3(position.x + Math.cos(a) * 1.6 * s, position.y + 1.2 * s, position.z + Math.sin(a) * 1.6 * s);
          this.strips.spawn(
            {
              points: zigzagPath(from, position, 7, 0.25 * s, this.cameraPosition),
              color: hot,
              width: 0.1 * s,
              life: 0.15,
              coreWhite: 0.9,
              flicker: 0.4,
              widthProfile: "taperEnd",
            },
            this.cameraPosition,
          );
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 公開API: 飛び道具
  // -------------------------------------------------------------------------

  /** 飛び道具。到達時にonArriveでヒット演出へつなぐ */
  spawnProjectile(options: ProjectileOptions): void {
    const element = options.element ?? "NEUTRAL";
    const duration = options.durationSec ?? 0.32;
    const scale = options.scale ?? 1;

    // 電気属性は「飛ぶ」のではなく一瞬で走る雷にする
    if (element === "ELECTRIC") {
      this.spawnLightningBolt(options.from, options.to, options.color, { strikes: 3, branches: 2, width: 0.24 * scale });
      this.schedule(Math.min(0.12, duration), () => options.onArrive?.());
      return;
    }

    let sprite = this.spritePool.pop();
    if (!sprite) {
      const material = new THREE.SpriteMaterial({
        map: fireballTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      sprite = new THREE.Sprite(material);
      this.disposables.push(material);
    }
    const material = sprite.material as THREE.SpriteMaterial;
    material.color.copy(options.color).lerp(this.accent(element, "hot"), 0.45);
    material.opacity = 1;
    const headScale = (element === "LIGHT" ? 1.5 : element === "DARK" ? 1.4 : 1.2) * scale;
    sprite.scale.set(headScale, headScale, 1);
    sprite.position.copy(options.from);
    sprite.visible = true;
    this.root.add(sprite);

    this.projectiles.push({
      sprite,
      from: options.from.clone(),
      to: options.to.clone(),
      color: options.color.clone(),
      element,
      arcHeight: options.arcHeight ?? 1.2,
      elapsed: 0,
      duration,
      scale,
      onArrive: options.onArrive,
    });
  }

  /** 弾の軌跡。属性ごとに残すものを変える */
  private emitProjectileTrail(projectile: Projectile): void {
    const position = projectile.sprite.position;
    const element = projectile.element;
    const hot = this.accent(element, "hot");
    const s = projectile.scale;
    switch (element) {
      case "FIRE":
        this.particles.spawn({
          position,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random(), (Math.random() - 0.5) * 0.6),
          color: projectile.color.clone().lerp(hot, Math.random() * 0.5),
          size: 14 * s,
          life: 0.35,
          cell: SPRITE.FLAME,
          drag: 0.9,
          growth: 0.5,
        });
        if (Math.random() < 0.4) {
          this.particles.spawn({
            position,
            velocity: new THREE.Vector3(0, 0.4, 0),
            color: new THREE.Color(0x3a2f38),
            size: 18 * s,
            life: 0.6,
            cell: SPRITE.SMOKE,
            layer: "alpha",
            alpha: 0.3,
            growth: 2,
            drag: 0.95,
            fadeIn: 0.1,
            spin: 1,
          });
        }
        break;
      case "WATER":
        this.particles.spawn({
          position,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.4, (Math.random() - 0.5) * 0.8),
          color: hot,
          size: 9 * s,
          life: 0.4,
          cell: Math.random() < 0.4 ? SPRITE.CRYSTAL : SPRITE.DROP,
          layer: "alpha",
          gravity: -6,
          alpha: 0.85,
          spin: (Math.random() - 0.5) * 4,
        });
        break;
      case "GRASS":
        this.particles.spawn({
          position,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2),
          color: projectile.color,
          size: 12 * s,
          life: 0.6,
          cell: Math.random() < 0.5 ? SPRITE.LEAF : SPRITE.MOTE,
          layer: Math.random() < 0.5 ? "alpha" : "add",
          gravity: -1.5,
          drag: 0.94,
          spin: (Math.random() - 0.5) * 6,
          wobble: 0.6,
        });
        break;
      case "LIGHT":
        this.particles.spawn({
          position,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5),
          color: hot,
          size: 11 * s,
          life: 0.45,
          cell: SPRITE.FLARE,
          drag: 0.92,
          spin: 3,
          fadePower: 1.4,
        });
        break;
      case "DARK":
        this.particles.spawn({
          position,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7),
          color: projectile.color,
          size: 20 * s,
          life: 0.5,
          cell: SPRITE.SMOKE,
          layer: "alpha",
          alpha: 0.55,
          growth: 1.6,
          drag: 0.92,
          spin: (Math.random() - 0.5) * 2,
        });
        break;
      default:
        this.particles.spawn({
          position,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6),
          color: projectile.color,
          size: 10 * s,
          life: 0.3,
          cell: SPRITE.GLOW,
          drag: 0.9,
        });
    }
  }

  // -------------------------------------------------------------------------
  // 公開API: 状態異常の継続エフェクト
  // -------------------------------------------------------------------------

  /**
   * 状態異常オーラを取り付ける。効果が切れるまで出しっぱなしになる。
   * 同じ id + kind で複数回呼んでも二重にはならず、位置だけ更新される。
   *
   * @param id ユニットの識別子(instanceId をそのまま渡してよい)
   * @param kind 表現の種類
   * @param position ユニットの基準位置(アンカー)
   */
  attachStatusAura(
    id: string,
    kind: StatusAuraKind,
    position: THREE.Vector3,
    options?: { color?: THREE.Color; scale?: number },
  ): void {
    let byKind = this.auras.get(id);
    if (!byKind) {
      byKind = new Map();
      this.auras.set(id, byKind);
    }
    const existing = byKind.get(kind);
    if (existing) {
      existing.setPosition(position);
      return;
    }
    const aura = new StatusAura(kind, position, options);
    byKind.set(kind, aura);
    this.auraRoot.add(aura.root);
  }

  /** ユニットが動いた時に、そのユニットの全オーラを追従させる */
  updateStatusAura(id: string, position: THREE.Vector3): void {
    const byKind = this.auras.get(id);
    if (!byKind) return;
    for (const aura of byKind.values()) aura.setPosition(position);
  }

  /** オーラを外す。kindを省略するとそのユニットの全オーラを外す */
  detachStatusAura(id: string, kind?: StatusAuraKind): void {
    const byKind = this.auras.get(id);
    if (!byKind) return;
    if (kind) byKind.get(kind)?.beginDetach();
    else for (const aura of byKind.values()) aura.beginDetach();
  }

  /** 全ユニットのオーラを一括で外す(バトル終了時など) */
  detachAllStatusAuras(): void {
    for (const byKind of this.auras.values()) for (const aura of byKind.values()) aura.beginDetach();
  }

  /** シールドが攻撃を受けた時など、オーラを一瞬強く光らせる */
  pulseStatusAura(id: string, kind: StatusAuraKind, strength = 1): void {
    this.auras.get(id)?.get(kind)?.pulse(strength);
  }

  hasStatusAura(id: string, kind: StatusAuraKind): boolean {
    const aura = this.auras.get(id)?.get(kind);
    return !!aura && !aura.isDetaching;
  }

  /** 現在ついているオーラの種類一覧 */
  listStatusAuras(id: string): StatusAuraKind[] {
    const byKind = this.auras.get(id);
    if (!byKind) return [];
    return [...byKind.entries()].filter(([, aura]) => !aura.isDetaching).map(([kind]) => kind);
  }

  // -------------------------------------------------------------------------
  // 更新
  // -------------------------------------------------------------------------

  update(dt: number): void {
    this.elapsed += dt;

    // 予約された遅延処理(多段演出のタイミング制御)
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const task = this.scheduled[i];
      task.delay -= dt;
      if (task.delay <= 0) {
        this.scheduled.splice(i, 1);
        task.fn();
      }
    }

    this.particles.update(dt);
    this.billboards.update(dt, this.camera);
    this.strips.update(dt);

    // --- 状態異常オーラ ---
    const auraContext = {
      particles: this.particles,
      billboards: this.billboards,
      strips: this.strips,
      cameraPosition: this.cameraPosition,
      quality: this.quality,
    };
    for (const [id, byKind] of this.auras) {
      for (const [kind, aura] of byKind) {
        if (!aura.update(dt, this.elapsed, auraContext, this.cameraQuaternion)) {
          this.auraRoot.remove(aura.root);
          aura.dispose();
          byKind.delete(kind);
        }
      }
      if (byKind.size === 0) this.auras.delete(id);
    }

    // --- 飛び道具 ---
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.elapsed += dt;
      const t = Math.min(1, projectile.elapsed / projectile.duration);
      projectile.sprite.position.lerpVectors(projectile.from, projectile.to, t);
      projectile.sprite.position.y += Math.sin(t * Math.PI) * projectile.arcHeight;
      // 近づくほど大きく見せて、迫ってくる感じを出す
      const grow = (0.85 + t * 0.5) * projectile.scale * (projectile.element === "LIGHT" ? 1.5 : 1.2);
      projectile.sprite.scale.set(grow, grow, 1);
      projectile.sprite.material.rotation += dt * 4;
      this.emitProjectileTrail(projectile);
      if (t >= 1) {
        projectile.sprite.visible = false;
        this.root.remove(projectile.sprite);
        this.spritePool.push(projectile.sprite);
        this.projectiles.splice(i, 1);
        projectile.onArrive?.();
      }
    }
  }

  /** ビルボード類を常にカメラへ向ける。毎フレーム呼ばれる想定 */
  faceCamera(camera: THREE.Camera): void {
    this.camera = camera;
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldQuaternion(this.cameraQuaternion);
  }

  /** デバッグ用。現在の粒/板/帯の数 */
  stats(): { particles: number; billboards: number; strips: number; auras: number } {
    let auras = 0;
    for (const byKind of this.auras.values()) auras += byKind.size;
    return {
      particles: this.particles.activeCount,
      billboards: this.billboards.activeCount,
      strips: this.strips.activeCount,
      auras,
    };
  }

  dispose(): void {
    for (const byKind of this.auras.values()) {
      for (const aura of byKind.values()) {
        this.auraRoot.remove(aura.root);
        aura.dispose();
      }
    }
    this.auras.clear();
    for (const item of this.disposables) item.dispose();
    this.scheduled.length = 0;
  }
}
