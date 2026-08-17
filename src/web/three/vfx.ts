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

const WHITE = new THREE.Color(0xffffff);

/** 地面に寝かせた輪を作るときの基底。X-Z 平面 */
const GROUND_RIGHT = new THREE.Vector3(1, 0, 0);
const GROUND_UP = new THREE.Vector3(0, 0, 1);

/**
 * 溜めから衝撃までの間(秒)。
 *
 * 打撃の「一点集中」は明るさではなくこの間で作る。加算合成では
 * 同時に出せる枚数に上限があるため、同じ瞬間に足すのではなく
 * 時間をずらすことでしか密度は増やせない。
 *
 * 属性差もここに出す。雷だけは0で、溜めずに一撃で入る。
 * 闇はいちばん長く吸い込んでから弾ける。
 */
const WINDUP_SEC: Record<VfxElement, number> = {
  FIRE: 0.09,
  WATER: 0.08,
  ELECTRIC: 0,
  GRASS: 0.1,
  LIGHT: 0.09,
  DARK: 0.14,
  NEUTRAL: 0.07,
};

interface RingWaveSpec {
  startRadius: number;
  endRadius: number;
  life: number;
  /** 帯の太さ。共通の sizeScale が掛かるので、線として見せたいなら 0.3 以上 */
  width: number;
  /** "ground" は地面に寝た輪、既定はカメラ正対 */
  orient?: "ground" | "camera";
  /** 真円からの崩し。手描きの勢いが出る */
  jitter?: number;
  segments?: number;
  opacity?: number;
  coreWhite?: number;
  fadePower?: number;
  glow?: number;
  delay?: number;
}

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
  // 帯は板と違って「線」なので、枚数が増えても加算される面積はほとんど増えない。
  // 大きな輪・集中線・斬撃をすべて帯へ寄せた分、ここは板より緩くしてよい。
  private readonly strips = new StripField(20);
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

  /** 遅延0なら即時。1フレーム遅らせたくない「溜めなしの一撃」に使う */
  private after(delay: number, fn: () => void): void {
    if (delay <= 0) fn();
    else this.scheduled.push({ delay, fn });
  }

  private ground(position: THREE.Vector3): THREE.Vector3 {
    return this.tmp.set(position.x, GROUND_Y, position.z);
  }

  private accent(element: VfxElement, key: "hot" | "deep" | "dust"): THREE.Color {
    return new THREE.Color(ACCENT[element][key]);
  }

  /**
   * 輪や放射線の半径に使う倍率。
   *
   * 帯の座標はワールド単位そのままで、板のような上限が効かない。
   * power やクリティカルの倍率をそのまま掛けると、輪が隣の味方まで
   * 届く大きさになってしまう。効きを鈍らせて、常にキャラクター
   * (背丈およそ2.2)に対して読める範囲へ収める。
   */
  private radiusScale(s: number): number {
    return Math.pow(Math.max(0.3, s), 0.55);
  }

  // -------------------------------------------------------------------------
  // 打撃感の共通土台
  // -------------------------------------------------------------------------

  /**
   * 広がる(あるいは締まる)輪を帯で描く。
   *
   * 板は加算合成で画面を覆うと白飛びするため大きさに上限があり、
   * どれだけ大きな値を指定しても頭打ちになる。輪だけは帯で描く。
   * 帯は線であって面ではないので、半径をいくら大きくしても
   * 加算される面積がほとんど増えず、上限にも当たらない。
   * 大きく鋭い輪が欲しい場合はこれを使うこと。
   *
   * 半径はワールド単位でそのまま効く(キャラクターの背丈が約2.2)。
   * 太さのほうには共通の sizeScale が掛かる点に注意。
   */
  private ringWave(center: THREE.Vector3, color: THREE.Color, spec: RingWaveSpec): void {
    const emit = (): void => {
      const onGround = (spec.orient ?? "camera") === "ground";
      if (!onGround) this.updateCameraBasis();
      const basis = onGround ? { right: GROUND_RIGHT, up: GROUND_UP } : { right: this.camRight, up: this.camUp };
      const start = Math.max(0.06, spec.startRadius);
      this.strips.spawn(
        {
          points: ringPath(center, start, basis, spec.segments ?? 40, spec.jitter ?? 0.06, Math.random() * Math.PI * 2),
          color,
          width: spec.width,
          life: spec.life,
          grow: spec.endRadius / start,
          origin: center.clone(),
          band: 1.6,
          widthProfile: "even",
          coreWhite: spec.coreWhite ?? 0.45,
          glow: spec.glow ?? 0,
          opacity: spec.opacity ?? 1,
          fadePower: spec.fadePower ?? 1.6,
        },
        this.cameraPosition,
      );
    };
    if (spec.delay && spec.delay > 0) {
      // 呼び出し側が使い回している一時ベクトルを掴んだままにしないよう複製する
      const frozen = center.clone();
      const frozenColor = color.clone();
      this.schedule(spec.delay, () => this.ringWave(frozen, frozenColor, { ...spec, delay: 0 }));
      return;
    }
    emit();
  }

  /**
   * 打撃の一段目: 溜め。
   *
   * 衝撃の直前に、外から中心へ締まる輪と吸い込みを一度だけ見せる。
   * ここで一瞬ためることで、次の一撃が「一点に集中した」に読める。
   * 明るさを足さずに打撃感を作れる、いちばん安い手札。
   */
  private impactWindup(position: THREE.Vector3, s: number, element: VfxElement, windup: number): void {
    if (windup <= 0) return;
    const hot = this.accent(element, "hot");
    const r = this.radiusScale(s);
    this.ringWave(position, hot, {
      startRadius: 1.9 * r,
      endRadius: 0.3 * r,
      life: windup + 0.06,
      width: 0.3 * s,
      segments: 32,
      jitter: 0.07,
      coreWhite: 0.15,
      opacity: 0.5,
      fadePower: 0.35,
    });
    for (let i = 0; i < this.count(6); i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.random();
      const radius = (1.5 + Math.random() * 0.9) * s;
      this.particles.spawn({
        position: new THREE.Vector3(
          position.x + Math.cos(angle) * radius,
          position.y + (Math.random() - 0.5) * 1.2 * s,
          position.z + Math.sin(angle) * radius,
        ),
        velocity: new THREE.Vector3(-Math.cos(angle) * 2.6, 0, -Math.sin(angle) * 2.6),
        color: hot,
        size: 8 * s,
        life: windup + 0.04,
        cell: SPRITE.MOTE,
        attractor: position.clone(),
        attract: 14,
        drag: 1,
        fadePower: 0.4,
      });
    }
  }

  /**
   * 打撃の二段目: 衝撃。
   *
   * 角のある形を極短命で刺してから、輪が広がる。
   * 輪は板ではなく帯なので、加算面積を増やさずに大きく鋭くできる。
   */
  private impactBurst(position: THREE.Vector3, color: THREE.Color, s: number, options: ImpactOptions): void {
    const element = options.element ?? "NEUTRAL";
    const hot = this.accent(element, "hot");
    const direction = options.direction ? this.tmp2.copy(options.direction).normalize() : null;
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);

    // 1) 角のある星。丸い閃光だけだと「光った」で終わるが、
    //    尖った形が一瞬重なると「硬いものがぶつかった」に読み替わる
    this.billboards.spawn({
      position,
      texture: impactStarTexture(),
      color: hot,
      life: 0.08,
      startScale: 1.0 * s,
      endScale: 4.4 * s,
      roll: Math.random() * Math.PI,
      fadePower: 2.8,
      scaleEase: "pop",
    });
    // 2) 白熱の閃光。ごく短時間だけ画面を刺す
    this.billboards.spawn({
      position,
      texture: flashStarTexture(),
      color: hot,
      life: 0.13,
      startScale: 0.8 * s,
      endScale: 4.6 * s,
      opacity: 0.9,
      roll: Math.random() * Math.PI,
      fadePower: 2.4,
    });
    // 3) 芯の光球。すぐ縮んで消える
    this.billboards.spawn({
      position,
      texture: fireballTexture(),
      color: color.clone().lerp(WHITE, 0.55),
      life: 0.18,
      startScale: 1.5 * s,
      endScale: 0.3 * s,
      fadePower: 1.6,
    });
    // 4) カメラ正対の衝撃輪
    const r = this.radiusScale(s);
    this.ringWave(position, color.clone().lerp(WHITE, 0.5), {
      startRadius: 0.28 * r,
      endRadius: 1.55 * r,
      life: 0.3,
      width: 0.42 * s,
      segments: 44,
      jitter: 0.05,
      coreWhite: 0.7,
      fadePower: 2,
    });
    // 5) 地面へ抜ける輪(接地感)
    this.ringWave(ground, color.clone().lerp(WHITE, 0.25), {
      orient: "ground",
      startRadius: 0.35 * r,
      endRadius: 2.1 * r,
      life: 0.44,
      width: 0.5 * s,
      segments: 44,
      jitter: 0.07,
      coreWhite: 0.35,
      opacity: 0.8,
      fadePower: 1.5,
    });

    // 6) 火花。指向性がある場合は攻撃方向へ抜ける
    this.particles.burst(position, color.clone().lerp(hot, 0.5), {
      count: this.count(20 * s),
      speed: 7.5 * s,
      focus: direction ? 0.45 : 0,
      direction: direction ?? undefined,
      size: 11 * s,
      life: 0.42,
      cell: SPRITE.SPARK,
      gravity: -9,
      drag: 0.85,
      growth: 0.4,
      fadePower: 1.5,
    });
    // 7) 破片(通常合成なので「物」として見える)
    this.particles.burst(position, this.accent(element, "dust"), {
      count: this.count(8 * s),
      speed: 5.5 * s,
      size: 9 * s,
      life: 0.7,
      cell: SPRITE.SHARD,
      layer: "alpha",
      gravity: -12,
      drag: 0.94,
      randomSpin: 14,
      alpha: 0.9,
    });
    // 8) 足元の砂埃
    this.particles.ringBurst(ground, this.accent(element, "dust"), {
      count: this.count(9 * s),
      speed: 3.4 * s,
      radius: 0.25,
      upBias: 0.5,
      size: 26 * s,
      life: 0.65,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.35,
      drag: 0.9,
      growth: 2.2,
      fadeIn: 0.06,
      randomSpin: 1.6,
    });
  }

  /**
   * 打撃の三段目: 余韻。
   *
   * 地面に亀裂を1.2秒残す。跡は光ではないので、加算の飽和を
   * まったく増やさずに時間を稼げる。通常合成で地面を暗く彫るため、
   * むしろ周囲の加算光が締まって見える。
   */
  private impactAftermath(position: THREE.Vector3, s: number, element: VfxElement, strength = 1): void {
    const dust = this.accent(element, "dust");
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);
    this.billboards.spawn({
      position: ground,
      texture: crackDecalTexture(),
      color: new THREE.Color(0x07060b).lerp(dust, 0.22),
      life: 1.25,
      startScale: 3.4 * s * strength,
      endScale: 4.6 * s * strength,
      orient: "ground",
      roll: Math.random() * Math.PI,
      opacity: 1,
      blending: THREE.NormalBlending,
      fadeIn: 0.04,
      fadePower: 0.85,
      renderOrder: 3,
    });
    // ゆっくり上がって消える煙。亀裂と合わせて着弾点を見失わせない
    this.particles.burst(position, dust, {
      count: this.count(4 * s),
      speed: 1.1 * s,
      upBias: 0.7,
      size: 30 * s,
      life: 1.0,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.28,
      drag: 0.94,
      growth: 2.4,
      fadeIn: 0.12,
      randomSpin: 1.2,
    });
  }

  /** カメラ基準の平面ベクトル(斬撃やリングの向きに使う) */
  private updateCameraBasis(): void {
    this.camRight.set(1, 0, 0).applyQuaternion(this.cameraQuaternion);
    this.camUp.set(0, 1, 0).applyQuaternion(this.cameraQuaternion);
  }

  // -------------------------------------------------------------------------
  // 属性別のヒット表現
  // -------------------------------------------------------------------------

  private impactFire(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("FIRE", "hot");
    const deep = this.accent("FIRE", "deep");
    // 膨らむ火球を複数重ねて、輪郭が乱れた爆炎にする
    for (let i = 0; i < 3; i++) {
      const offset = new THREE.Vector3((Math.random() - 0.5) * 0.7 * s, (Math.random() - 0.2) * 0.6 * s, (Math.random() - 0.5) * 0.7 * s).add(position);
      this.billboards.spawn({
        position: offset,
        texture: fireballTexture(),
        color: i === 0 ? hot : color.clone().lerp(deep, i * 0.35),
        life: 0.34 + i * 0.09,
        startScale: 0.7 * s,
        endScale: (2.6 + i * 0.7) * s,
        roll: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 2.2,
        fadePower: 1.5,
        velocity: new THREE.Vector3(0, 0.7 + i * 0.3, 0),
      });
    }
    // 立ち上る黒煙(爆発の後に残る重さ)
    for (let i = 0; i < 3; i++) {
      this.billboards.spawn({
        position: new THREE.Vector3(position.x + (Math.random() - 0.5) * 1.2 * s, position.y + 0.2, position.z + (Math.random() - 0.5) * 1.2 * s),
        texture: smokePuffTexture(),
        color: new THREE.Color(0x322730),
        life: 1.3 + Math.random() * 0.5,
        startScale: 1.0 * s,
        endScale: 3.6 * s,
        blending: THREE.NormalBlending,
        opacity: 0.5,
        fadeIn: 0.12,
        fadePower: 1.2,
        spin: (Math.random() - 0.5) * 0.9,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.1, (Math.random() - 0.5) * 0.4),
        drag: 0.97,
      });
    }
    // 火の粉。ゆっくり漂って落ちる
    this.particles.burst(position, color.clone().lerp(hot, 0.35), {
      count: this.count(22 * s),
      speed: 5.2 * s,
      upBias: 1.6,
      size: 13 * s,
      life: 0.8,
      cell: SPRITE.FLAME,
      gravity: -1.4,
      drag: 0.9,
      growth: 0.5,
      randomSpin: 3,
      fadePower: 1.3,
    });
    this.particles.burst(position, hot, {
      count: this.count(10 * s),
      speed: 9 * s,
      size: 9 * s,
      life: 0.55,
      cell: SPRITE.STREAK,
      gravity: -6,
      drag: 0.88,
      randomSpin: 6,
    });
    // 地面の焦げ跡
    this.billboards.spawn({
      position: this.ground(position),
      texture: smokePuffTexture(),
      color: deep,
      life: 1.1,
      startScale: 1.4 * s,
      endScale: 3.0 * s,
      orient: "ground",
      opacity: 0.55,
      fadePower: 1.6,
    });
  }

  private impactWater(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("WATER", "hot");
    // 水冠(クラウン)。上へ跳ね上がる飛沫
    this.particles.ringBurst(position, hot, {
      count: this.count(20 * s),
      speed: 3.6 * s,
      radius: 0.2 * s,
      upBias: 5.2 * s,
      upJitter: 0.5,
      size: 12 * s,
      life: 0.8,
      cell: SPRITE.DROP,
      layer: "alpha",
      gravity: -14,
      drag: 0.99,
      alpha: 0.95,
    });
    this.particles.burst(position, color, {
      count: this.count(16 * s),
      speed: 6.5 * s,
      size: 10 * s,
      life: 0.6,
      cell: SPRITE.DROP,
      layer: "alpha",
      gravity: -13,
      drag: 0.98,
      alpha: 0.8,
      randomSpin: 3,
    });
    // 氷片。ゆっくり回りながら散る
    this.particles.burst(position, hot, {
      count: this.count(10 * s),
      speed: 4.5 * s,
      size: 14 * s,
      life: 0.7,
      cell: SPRITE.CRYSTAL,
      gravity: -3,
      drag: 0.92,
      randomSpin: 4,
      growth: 0.6,
    });
    // 波紋。時間差で2枚出して水面らしさを出す
    for (let i = 0; i < 2; i++) {
      this.schedule(i * 0.09, () => {
        this.billboards.spawn({
          position: new THREE.Vector3(position.x, GROUND_Y + 0.01 * i, position.z),
          texture: shockRingTexture(),
          color: hot,
          life: 0.55,
          startScale: 0.6 * s,
          endScale: (4.2 + i * 1.8) * s,
          orient: "ground",
          opacity: 0.8 - i * 0.25,
          fadePower: 1.4,
        });
      });
    }
    // 霧
    for (let i = 0; i < 2; i++) {
      this.billboards.spawn({
        position: new THREE.Vector3(position.x + (Math.random() - 0.5) * s, position.y - 0.2, position.z + (Math.random() - 0.5) * s),
        texture: smokePuffTexture(),
        color: color.clone().lerp(WHITE, 0.6),
        life: 0.9,
        startScale: 0.8 * s,
        endScale: 2.8 * s,
        opacity: 0.45,
        fadeIn: 0.08,
        blending: THREE.NormalBlending,
        spin: (Math.random() - 0.5) * 0.6,
      });
    }
  }

  private impactElectric(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("ELECTRIC", "hot");
    const bolts = this.count(6 * Math.min(1.6, s));
    const target = new THREE.Vector3();
    for (let i = 0; i < bolts; i++) {
      const theta = (i / bolts) * Math.PI * 2 + Math.random() * 0.6;
      const phi = (Math.random() - 0.35) * 1.6;
      const length = (1.6 + Math.random() * 1.6) * s;
      target.set(Math.cos(theta) * Math.cos(phi), Math.sin(phi) + 0.15, Math.sin(theta) * Math.cos(phi)).multiplyScalar(length).add(position);
      const points = zigzagPath(position, target, 8, 0.3 * s, this.cameraPosition);
      this.strips.spawn(
        {
          points,
          color: color.clone().lerp(hot, 0.4),
          width: 0.16 * s,
          life: 0.16 + Math.random() * 0.1,
          coreWhite: 0.9,
          glow: 0.5,
          flicker: 0.45,
          fadePower: 1.1,
          widthProfile: "taperEnd",
        },
        this.cameraPosition,
      );
      // 枝分かれ
      if (Math.random() < 0.6) {
        const mid = points[Math.floor(points.length * 0.55)];
        const branch = new THREE.Vector3(
          mid.x + (Math.random() - 0.5) * 1.6 * s,
          mid.y + (Math.random() - 0.2) * 1.2 * s,
          mid.z + (Math.random() - 0.5) * 1.6 * s,
        );
        this.strips.spawn(
          {
            points: zigzagPath(mid, branch, 5, 0.22 * s, this.cameraPosition),
            color: hot,
            width: 0.1 * s,
            life: 0.13,
            coreWhite: 0.95,
            flicker: 0.5,
            widthProfile: "taperEnd",
          },
          this.cameraPosition,
        );
      }
    }
    // 残響のように、少し遅れてもう一度弾ける
    this.schedule(0.12, () => {
      for (let i = 0; i < this.count(3); i++) {
        const theta = Math.random() * Math.PI * 2;
        const end = new THREE.Vector3(Math.cos(theta), Math.random() * 0.8, Math.sin(theta)).multiplyScalar(2.2 * s).add(position);
        this.strips.spawn(
          {
            points: zigzagPath(position, end, 7, 0.34 * s, this.cameraPosition),
            color: hot,
            width: 0.11 * s,
            life: 0.12,
            coreWhite: 1,
            flicker: 0.5,
            widthProfile: "taperEnd",
          },
          this.cameraPosition,
        );
      }
    });
    // 帯電した細かい火花
    this.particles.burst(position, hot, {
      count: this.count(24 * s),
      speed: 10 * s,
      size: 7 * s,
      life: 0.25,
      cell: SPRITE.SPARK,
      gravity: -2,
      drag: 0.82,
      fadePower: 0.7,
    });
    // 二度光るフラッシュ(電気らしい明滅)
    this.schedule(0.07, () => {
      this.billboards.spawn({
        position,
        texture: flashStarTexture(),
        color: hot,
        life: 0.09,
        startScale: 3.4 * s,
        endScale: 1.6 * s,
        roll: Math.PI / 4,
        fadePower: 1.2,
      });
    });
  }

  private impactGrass(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("GRASS", "hot");
    const deep = this.accent("GRASS", "deep");
    // 地面から蔦が巻き上がる
    const vines = this.count(4);
    for (let i = 0; i < vines; i++) {
      const base = new THREE.Vector3(
        position.x + (Math.random() - 0.5) * 0.8 * s,
        GROUND_Y,
        position.z + (Math.random() - 0.5) * 0.8 * s,
      );
      this.strips.spawn(
        {
          points: helixPath(base, (0.75 + Math.random() * 0.5) * s, (2.2 + Math.random() * 1.0) * s, 1.1 + Math.random() * 0.6, 26, Math.random() * 6.28),
          color: i % 2 === 0 ? color : deep,
          width: 0.2 * s,
          life: 0.75,
          revealSec: 0.2,
          band: 1.4,
          coreWhite: 0.25,
          glow: 0.5,
          widthProfile: "taperEnd",
          fadePower: 1.8,
        },
        this.cameraPosition,
      );
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
    this.billboards.spawn({
      position: this.ground(position),
      texture: shockRingTexture(),
      color: hot,
      life: 0.6,
      startScale: 0.5 * s,
      endScale: 4.0 * s,
      orient: "ground",
      opacity: 0.8,
    });
  }

  private impactLight(position: THREE.Vector3, color: THREE.Color, s: number): void {
    const hot = this.accent("LIGHT", "hot");
    // 神々しい光の柱。地面から天へ抜ける
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, GROUND_Y + 3.0 * s, position.z),
      texture: lightPillarTexture(),
      color: color.clone().lerp(hot, 0.5),
      life: 0.6,
      startScale: 0.8 * s,
      endScale: 2.4 * s,
      aspect: 3.0,
      orient: "upright",
      opacity: 0.95,
      fadePower: 1.8,
      scaleEase: "pop",
    });
    // 足元の魔法陣
    this.billboards.spawn({
      position: this.ground(position),
      texture: runeCircleTexture(),
      color: color.clone().lerp(hot, 0.3),
      life: 0.85,
      startScale: 1.2 * s,
      endScale: 4.2 * s,
      orient: "ground",
      opacity: 0.9,
      spin: 0.8,
      fadePower: 1.5,
    });
    // 上昇する光輪(3枚を時間差で)
    for (let i = 0; i < 3; i++) {
      this.schedule(i * 0.08, () => {
        this.billboards.spawn({
          position: new THREE.Vector3(position.x, position.y - 0.8 * s + i * 0.5 * s, position.z),
          texture: shockRingTexture(),
          color: hot,
          life: 0.5,
          startScale: 3.2 * s,
          endScale: 0.8 * s,
          orient: "ground",
          opacity: 0.9,
          velocity: new THREE.Vector3(0, 2.4, 0),
          fadePower: 1.4,
        });
      });
    }
    // 大きな十字のフレア
    this.billboards.spawn({
      position,
      texture: flashStarTexture(),
      color: hot,
      life: 0.35,
      startScale: 1.2 * s,
      endScale: 6.5 * s,
      fadePower: 2.4,
    });
    // ゆっくり昇る光の粒
    this.particles.burst(position, hot, {
      count: this.count(22 * s),
      speed: 2.2 * s,
      upBias: 2.4,
      size: 11 * s,
      life: 1.2,
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
    // 収縮 → 破裂。まず外から中心へ吸い込む
    for (let i = 0; i < this.count(18 * s); i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = (1.8 + Math.random() * 1.2) * s;
      const height = (Math.random() - 0.5) * 2 * s;
      this.particles.spawn({
        position: new THREE.Vector3(position.x + Math.cos(angle) * radius, position.y + height, position.z + Math.sin(angle) * radius),
        velocity: new THREE.Vector3(-Math.cos(angle) * 2.4, -height * 0.8, -Math.sin(angle) * 2.4),
        color: hot,
        size: 9 * s,
        life: 0.3,
        cell: SPRITE.MOTE,
        attractor: position.clone(),
        attract: 9,
        drag: 1,
        fadePower: 0.6,
      });
    }
    // 遅れて弾ける
    this.schedule(0.16, () => {
      this.billboards.spawn({
        position,
        texture: vortexTexture(),
        color: color,
        life: 0.5,
        startScale: 0.4 * s,
        endScale: 4.2 * s,
        spin: 4.5,
        fadePower: 1.5,
      });
      this.particles.burst(position, color, {
        count: this.count(18 * s),
        speed: 7 * s,
        size: 26 * s,
        life: 0.75,
        cell: SPRITE.SMOKE,
        layer: "alpha",
        alpha: 0.7,
        drag: 0.86,
        growth: 1.8,
        randomSpin: 3,
      });
      this.particles.burst(position, hot, {
        count: this.count(14 * s),
        speed: 8 * s,
        size: 10 * s,
        life: 0.45,
        cell: SPRITE.SPARK,
        gravity: -6,
        drag: 0.88,
      });
    });
    // 呪印が浮かんで消える
    this.billboards.spawn({
      position: new THREE.Vector3(position.x, position.y, position.z),
      texture: runeCircleTexture(),
      color: hot,
      life: 0.6,
      startScale: 2.6 * s,
      endScale: 1.2 * s,
      opacity: 0.85,
      spin: -1.2,
      fadePower: 2,
    });
    // 濃い靄が地面に溜まる
    this.billboards.spawn({
      position: this.ground(position),
      texture: smokePuffTexture(),
      color: deep,
      life: 1.2,
      startScale: 1.0 * s,
      endScale: 4.0 * s,
      orient: "ground",
      opacity: 0.75,
      blending: THREE.NormalBlending,
      fadePower: 1.3,
    });
    // 内向きに刺す棘
    this.updateCameraBasis();
    for (let i = 0; i < this.count(5); i++) {
      const angle = (i / 5) * Math.PI * 2 + Math.random();
      const outer = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * 2.6 * s)
        .addScaledVector(this.camUp, Math.sin(angle) * 2.6 * s);
      this.strips.spawn(
        {
          points: [outer, position.clone()],
          color: hot,
          width: 0.3 * s,
          life: 0.28,
          revealSec: 0.09,
          band: 1.2,
          widthProfile: "taperEnd",
          coreWhite: 0.5,
          fadePower: 2,
        },
        this.cameraPosition,
      );
    }
  }

  private impactNeutral(position: THREE.Vector3, color: THREE.Color, s: number): void {
    this.particles.burst(position, color, {
      count: this.count(14 * s),
      speed: 6 * s,
      size: 12 * s,
      life: 0.5,
      cell: SPRITE.GLOW,
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
    const s = Math.max(0.35, power) * (opt.aoe ? 1.35 : 1) * (opt.scale ?? 1) * (opt.crit ? 1.3 : 1);
    // 打撃は重いぶん長くためる。斬撃・刺突は素早く入る
    const windup = WINDUP_SEC[element] * (opt.hitStyle === "blunt" ? 1.9 : opt.hitStyle === "pierce" ? 0.7 : 1);
    // 呼び出し側が使い回しているベクトルを掴んだままにしない
    const at = position.clone();
    const tint = color.clone();

    // 溜め → 衝撃 → 余韻。同時に足すのではなく時間をずらすことで、
    // 加算の飽和を増やさずに一撃の密度を上げる
    this.impactWindup(at, s, element, windup);
    this.after(windup, () => {
      this.impactBurst(at, tint, s, opt);
      this.elementImpact(element, at, tint, s);
      if (opt.hitStyle === "slash") this.spawnSlash(at, tint, { element, scale: s, count: opt.crit ? 3 : 2 });
      else if (opt.hitStyle === "pierce") this.spawnPierce(at, tint, s, opt.direction);
      else if (opt.hitStyle === "blunt") this.spawnBlunt(at, tint, s, element, opt.direction);
    });
    this.schedule(windup + 0.09, () => this.impactAftermath(at, s, element, opt.hitStyle === "blunt" ? 1.4 : 1));
  }

  /** クリティカル。溜めを長く取り、放射・二重の輪・交差斬撃で別格に見せる */
  spawnCriticalImpact(position: THREE.Vector3, color: THREE.Color, options?: ImpactArg): void {
    const opt = normalizeImpactOptions(options);
    const element = opt.element ?? "NEUTRAL";
    const s = 1.5 * (opt.aoe ? 1.3 : 1) * (opt.scale ?? 1);
    const hot = this.accent(element, "hot");
    const at = position.clone();
    const tint = color.clone();
    // 通常より長くためる。ためた分だけ一撃が重く見える
    const windup = Math.max(0.11, WINDUP_SEC[element] * 1.7);

    const r = this.radiusScale(s);
    this.impactWindup(at, s * 1.15, element, windup);
    // 溜めの間に外から刺さってくる収束線。ここが「一点集中」の記号
    this.updateCameraBasis();
    const lines = this.count(6);
    for (let i = 0; i < lines; i++) {
      const angle = (i / lines) * Math.PI * 2 + Math.random() * 0.3;
      const reach = (2.0 + Math.random() * 1.1) * r;
      const inner = new THREE.Vector3()
        .copy(at)
        .addScaledVector(this.camRight, Math.cos(angle) * 0.45 * r)
        .addScaledVector(this.camUp, Math.sin(angle) * 0.45 * r);
      const outer = new THREE.Vector3()
        .copy(at)
        .addScaledVector(this.camRight, Math.cos(angle) * reach)
        .addScaledVector(this.camUp, Math.sin(angle) * reach);
      this.strips.spawn(
        {
          points: [outer, inner],
          color: i % 3 === 0 ? WHITE : tint.clone().lerp(hot, 0.5),
          width: 0.4 * s,
          life: windup + 0.08,
          revealSec: windup * 0.9,
          band: 0.9,
          widthProfile: "taperEnd",
          coreWhite: 0.7,
          fadePower: 2.2,
        },
        this.cameraPosition,
      );
    }

    this.after(windup, () => {
      // 画面を刺す白い閃光
      this.billboards.spawn({
        position: at,
        texture: flashStarTexture(),
        color: WHITE,
        life: 0.16,
        startScale: 1.6 * s,
        endScale: 8.0 * s,
        fadePower: 2.6,
        roll: Math.random() * Math.PI,
      });
      // 放射状の光条。板1枚で集中線の密度を出す(帯で描くと本数ぶん枠を食う)
      this.billboards.spawn({
        position: at,
        texture: godRayTexture(),
        color: tint.clone().lerp(hot, 0.6),
        life: 0.3,
        startScale: 1.0 * s,
        endScale: 6.0 * s,
        opacity: 0.85,
        spin: 1.6,
        roll: Math.random() * Math.PI,
        fadePower: 2.2,
      });
      // 二重の衝撃輪。二枚目を遅らせて外へ抜けさせる
      this.ringWave(at, WHITE, {
        startRadius: 0.35 * r,
        endRadius: 1.9 * r,
        life: 0.26,
        width: 0.5 * s,
        segments: 44,
        jitter: 0.04,
        coreWhite: 0.85,
        fadePower: 2.1,
      });
      this.ringWave(at, tint.clone().lerp(hot, 0.4), {
        delay: 0.07,
        startRadius: 0.4 * r,
        endRadius: 2.8 * r,
        life: 0.42,
        width: 0.34 * s,
        segments: 44,
        jitter: 0.08,
        coreWhite: 0.4,
        opacity: 0.85,
        fadePower: 1.5,
      });

      this.impactBurst(at, tint, s, { ...opt, element, crit: true });
      this.elementImpact(element, at, tint, s * 1.15);
      // 交差する斬撃で「叩き込んだ」感を出す
      this.spawnSlash(at, WHITE, { element, scale: s * 1.1, count: 2, cross: true });
      // 遅れて散る二次破片
      this.schedule(0.1, () => {
        this.particles.burst(at, hot, {
          count: this.count(16 * s),
          speed: 9 * s,
          size: 10 * s,
          life: 0.6,
          cell: SPRITE.STREAK,
          gravity: -10,
          drag: 0.88,
          randomSpin: 8,
        });
      });
    });
    this.schedule(windup + 0.1, () => this.impactAftermath(at, s, element, 1.5));
  }

  /**
   * 打撃。鋭さではなく重さで見せる。
   *
   * 斬撃が「線」なのに対し、打撃は「潰す圧」。中心から短く太い帯を
   * 押し出し、遅れて地面が沈む。余韻の亀裂もひと回り大きくする。
   */
  private spawnBlunt(position: THREE.Vector3, color: THREE.Color, s: number, element: VfxElement, direction?: THREE.Vector3): void {
    const hot = this.accent(element, "hot");
    const dust = this.accent(element, "dust");
    const ground = new THREE.Vector3(position.x, GROUND_Y, position.z);
    this.updateCameraBasis();

    // 押し潰された方向へ短く太い圧の帯。線としてではなく塊として見せる
    const r = this.radiusScale(s);
    const push = direction ? direction.clone().normalize() : null;
    const bias = push ? Math.atan2(push.y, push.x) : Math.random() * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const angle = bias + (i / 4) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const reach = (1.0 + Math.random() * 0.5) * r;
      const inner = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * 0.25 * r)
        .addScaledVector(this.camUp, Math.sin(angle) * 0.25 * r);
      const outer = new THREE.Vector3()
        .copy(position)
        .addScaledVector(this.camRight, Math.cos(angle) * reach)
        .addScaledVector(this.camUp, Math.sin(angle) * reach);
      this.strips.spawn(
        {
          points: [inner, outer],
          color: i % 2 === 0 ? color.clone().lerp(hot, 0.6) : WHITE,
          width: 0.9 * s,
          life: 0.17,
          revealSec: 0.045,
          band: 1.0,
          widthProfile: "blade",
          coreWhite: 0.5,
          fadePower: 2.6,
        },
        this.cameraPosition,
      );
    }
    // 遅れて地面が沈む。低くて速い砂の輪
    this.schedule(0.06, () => {
      this.ringWave(ground, dust, {
        orient: "ground",
        startRadius: 0.5 * r,
        endRadius: 2.6 * r,
        life: 0.5,
        width: 0.8 * s,
        jitter: 0.14,
        segments: 36,
        coreWhite: 0.05,
        opacity: 0.6,
        fadePower: 1.2,
      });
      this.particles.ringBurst(ground, dust, {
        count: this.count(12 * s),
        speed: 6.0 * s,
        radius: 0.4,
        upBias: 0.25,
        size: 30 * s,
        life: 0.8,
        cell: SPRITE.SMOKE,
        layer: "alpha",
        alpha: 0.4,
        drag: 0.9,
        growth: 2.6,
        fadeIn: 0.05,
        randomSpin: 1.4,
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

    for (let i = 0; i < count; i++) {
      const baseAngle = options?.angle ?? Math.random() * Math.PI * 2;
      const angle = options?.cross ? baseAngle + (i * Math.PI) / 2 + 0.4 : baseAngle + i * 0.7;
      const radius = (1.5 + Math.random() * 0.6) * s;
      const sweep = 1.7 + Math.random() * 0.9;
      const points = arcPath(position, radius, angle - sweep / 2, sweep, 22, { right: this.camRight, up: this.camUp }, 0.12);
      this.strips.spawn(
        {
          points,
          color: i === 0 ? WHITE : color.clone().lerp(hot, 0.5),
          width: (0.75 - i * 0.18) * s,
          life: 0.3,
          revealSec: 0.075,
          band: 0.85,
          widthProfile: "blade",
          coreWhite: 0.75,
          glow: 0.9,
          fadePower: 2.2,
        },
        this.cameraPosition,
      );
      // 弧に沿って火花を散らす
      for (let p = 0; p < this.count(6); p++) {
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
    }
  }

  /** 刺突。攻撃方向へ細長い衝撃を貫通させる */
  private spawnPierce(position: THREE.Vector3, color: THREE.Color, s: number, direction?: THREE.Vector3): void {
    const dir = direction ? direction.clone().normalize() : new THREE.Vector3(0, 0, 1);
    const from = position.clone().addScaledVector(dir, -2.2 * s);
    const to = position.clone().addScaledVector(dir, 2.2 * s);
    this.strips.spawn(
      {
        points: wavyPath(from, to, 10, 0.05 * s, this.cameraPosition, 1),
        color: color.clone().lerp(WHITE, 0.6),
        width: 0.4 * s,
        life: 0.24,
        revealSec: 0.05,
        band: 0.8,
        widthProfile: "spindle",
        coreWhite: 0.8,
        fadePower: 2.2,
      },
      this.cameraPosition,
    );
    this.particles.burst(position, color, {
      count: this.count(12 * s),
      speed: 9 * s,
      focus: 0.75,
      direction: dir,
      size: 9 * s,
      life: 0.35,
      cell: SPRITE.STREAK,
      gravity: -5,
      drag: 0.86,
      randomSpin: 4,
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

    this.billboards.spawn({
      position: ground,
      texture: shockRingTexture(),
      color: color.clone().lerp(WHITE, 0.35),
      life: 0.7,
      startScale: 1.0,
      endScale: radius * 2.4,
      orient: "ground",
      opacity: 0.95,
      fadePower: 1.3,
    });
    this.schedule(0.1, () => {
      this.billboards.spawn({
        position: ground,
        texture: shockRingTexture(),
        color: hot,
        life: 0.8,
        startScale: 0.8,
        endScale: radius * 1.7,
        orient: "ground",
        opacity: 0.6,
        fadePower: 1.2,
      });
    });
    this.particles.ringBurst(ground, this.accent(element, "dust"), {
      count: this.count(26),
      speed: 7,
      radius: 0.6,
      upBias: 1.6,
      size: 34,
      life: 1.0,
      cell: SPRITE.SMOKE,
      layer: "alpha",
      alpha: 0.4,
      drag: 0.92,
      growth: 2.4,
      fadeIn: 0.08,
      randomSpin: 1.4,
    });
    // 周囲に散る小爆発。属性の絵を広い範囲に散らす
    for (let i = 0; i < 4; i++) {
      this.schedule(0.05 + i * 0.06, () => {
        const angle = Math.random() * Math.PI * 2;
        const distance = radius * (0.35 + Math.random() * 0.5);
        const spot = new THREE.Vector3(center.x + Math.cos(angle) * distance, center.y * 0.7 + 0.3, center.z + Math.sin(angle) * distance);
        this.elementImpact(element, spot, color, 0.75);
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
