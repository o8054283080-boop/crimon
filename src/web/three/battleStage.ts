import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { MonsterDefinition } from "../../core/monster.js";
import { createArena } from "./arena.js";
import { MonsterAvatar } from "./monsterAvatar.js";
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
 * カメラの方位角(度)。負の値でユニットが向いている側へ回り込む。
 * 0にすると自軍が真後ろからしか映らなくなるので、0へ戻さないこと。
 */
const CAMERA_AZIMUTH_DEG = -15;

const PLAYER_LINE_Z = 3.8;
const ENEMY_LINE_Z = -5.0;

/**
 * 奥の列を広げる倍率。
 *
 * 遠くのものは透視投影で中央へ寄るため、両チームを同じ間隔で置くと
 * 奥の列が画面上で詰まり、手前の列の真後ろに隠れてしまう。
 * (カメラ距離 ÷ 奥の列までの距離)のおおよその比で、あらかじめ
 * 奥の列だけ横に広げておき、画面上で同じ間隔に見えるようにする。
 */
const ENEMY_SPREAD = 1.24;

/**
 * 隊列の並び。
 *
 * 望遠寄りのカメラだと前後の列が画面上で重なりやすいので、
 * 奥の列を「手前の列の隙間」に来るよう半歩ずらしたうえで、
 * 上記の ENEMY_SPREAD で遠近による詰まりを打ち消す。
 * さらに端のユニットをわずかに前後させ、直線的な整列を崩して奥行きを出す。
 */
function slotPositions(count: number, lineZ: number, team: "PLAYER" | "ENEMY"): { x: number; z: number }[] {
  if (count <= 0) return [];
  const isEnemy = team === "ENEMY";
  const baseSpacing = count <= 4 ? 2.5 : 2.24;
  const spacing = baseSpacing * (isEnemy ? ENEMY_SPREAD : 1);
  const totalWidth = (count - 1) * spacing;
  // 半スロット分ずらして、奥の列が手前の列の隙間に覗くようにする
  const shift = (isEnemy ? 1 : -1) * (baseSpacing / 4) * (isEnemy ? ENEMY_SPREAD : 1);
  return Array.from({ length: count }, (_, i) => {
    const x = -totalWidth / 2 + i * spacing + shift;
    // 手前の列は端ほど奥へ、奥の列は端ほど手前へ。ゆるい弧を描かせる
    const arc = Math.abs(x) * (isEnemy ? 0.09 : -0.1);
    return { x, z: lineZ + arc };
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
  private readonly arena = createArena();
  private readonly vfx = new VfxSystem();
  private readonly avatars = new Map<string, MonsterAvatar>();
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

  /** 両チームが必ず収まる箱。setupUnitsで実際のスロット位置から作る */
  private frameBox: FrameBox = { halfWidth: 5.4, zNear: 4.4, zFar: -4.9, yBottom: -0.1, yTop: 3.3 };
  /** フレーミングで決まったカメラ距離。UIの遠近スケールの基準にも使う */
  private frameDistance = 20;

  private shakeStrength = 0;
  private hitStopRemaining = 0;
  private frameHandle: number | null = null;
  private disposed = false;
  private elapsed = 0;

  constructor(container: HTMLElement, units: StageUnitInit[]) {
    this.element = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // 露出は「白飛びしない」ことを最優先に、やや低めで固定する
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = "battle-stage__canvas";
    container.append(this.renderer.domElement);

    const { width, height } = this.measure();
    this.camera = new THREE.PerspectiveCamera(27, width / height, 1, 320);

    // 霧の色は空のシェーダの地平線色と合わせてある。遠景がそのまま霞へ溶ける
    this.scene.fog = new THREE.FogExp2(0x2a3055, 0.0165);
    this.scene.add(this.arena.group);
    this.scene.add(this.vfx.root);

    this.setupLights();
    this.setupUnits(units);

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // ブルームは RenderPass 直後(=トーンマッピング前のリニアHDR)にかかる。
    // しきい値を1超えに置くことで、本当に明るい部分だけが滲むようにしている。
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.5, 1.15);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // 仕上げはトーンマッピング後(sRGB)に適用する
    this.cinematicPass = new CinematicPass({
      vignette: 0.4,
      aberration: 1.0,
      grain: 0.045,
      saturation: 1.06,
      contrast: 0.12,
      tintStrength: 0.15,
    });
    this.composer.addPass(this.cinematicPass);

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

  private setupLights(): void {
    // 環境光。空の青と床の暗さで色を分け、影が真っ黒に潰れない下地を作る
    this.scene.add(new THREE.HemisphereLight(0x7d92e0, 0x191526, 0.5));

    // キーライト: 右奥やや高めから。影が手前左へ伸びるので、床に立体感が出る
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(10, 12.5, -4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 46;
    key.shadow.camera.left = -17;
    key.shadow.camera.right = 17;
    key.shadow.camera.top = 17;
    key.shadow.camera.bottom = -17;
    key.shadow.bias = -0.0009;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    // フィルライト: カメラ側から。敵チームはこちらを向いて立つため、
    // この光が敵の正面を照らす主光源になる(弱すぎると敵が黒く沈んで見えなくなる)
    const fill = new THREE.DirectionalLight(0x93a7e8, 1.05);
    fill.position.set(-9, 5.5, 12);
    this.scene.add(fill);

    // リムライト: 奥のゲート方向から。キャラの輪郭を光らせ、背景から抜く
    const rim = new THREE.DirectionalLight(0xc9a6ff, 1.5);
    rim.position.set(-2, 5.5, -14);
    this.scene.add(rim);
  }

  private setupUnits(units: StageUnitInit[]): void {
    const players = units.filter((u) => u.team === "PLAYER");
    const enemies = units.filter((u) => u.team === "ENEMY");

    let maxAbsX = 0;
    let maxZ = -Infinity;
    let minZ = Infinity;

    const placed: { avatar: MonsterAvatar; x: number; z: number; team: "PLAYER" | "ENEMY" }[] = [];
    const place = (list: StageUnitInit[], lineZ: number, team: "PLAYER" | "ENEMY") => {
      const slots = slotPositions(list.length, lineZ, team);
      list.forEach((unit, index) => {
        const avatar = new MonsterAvatar({
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

        // 属性色のポイントライト。床への色移りで存在感を出すが、
        // 台数が増えるとモバイルGPUで重くなるので範囲と強さは控えめにする
        const light = new THREE.PointLight(avatar.theme.light, 4.5, 6.5, 2);
        light.position.set(slots[index].x, 1.5, slots[index].z);
        this.scene.add(light);
      });
    };

    place(players, PLAYER_LINE_Z, "PLAYER");
    place(enemies, ENEMY_LINE_Z, "ENEMY");

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
    // 横長ほど望遠に、縦長では収まりを優先して少しだけ広角にする
    const fov = THREE.MathUtils.clamp(34 - (aspect - 0.6) * 9, 24.5, 36);
    // 見下ろし角。浅いと前後の列が画面上で潰れて重なるので、
    // 奥行きが縦方向の距離に変換される程度まで見下ろす
    const pitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(fov / 2 + 6, 18, 27));

    const tanY = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const tanX = tanY * aspect;
    // 真正面から見ると、敵へ向き直った自軍は常に真後ろからしか映らず、
    // 顔・角・仮面といった見分けどころが自分のモンスターだけ見えなくなる。
    // ユニットが向いている側へカメラを回り込ませて、斜め後ろから見る構図にする。
    // 副次的に、2つの列が画面上で斜めに並ぶ(正対だと前後の列が重なりやすい)
    const azimuth = THREE.MathUtils.degToRad(CAMERA_AZIMUTH_DEG);
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
    this.vfx.setSizeScale(visibleHeight / VFX_REFERENCE_HEIGHT);
    // どんな演出でも、1枚の板が画面の高さのこの割合を超えないようにする
    this.vfx.setMaxBillboardScale(visibleHeight * VFX_MAX_SCREEN_RATIO);
    // 粒の「数」も抑える。大きさだけ絞っても、加算合成では重なった総量で
    // 画面が飽和するため、密度側からも下げる必要がある
    this.vfx.setQuality(VFX_DENSITY);
    this.vfx.setOpacityScale(VFX_OPACITY);
  }

  private handleResize(): void {
    const { width, height } = this.measure();
    this.frameCamera(width, height);
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.cinematicPass.setResolution(width * ratio, height * ratio);
  }

  private start(): void {
    const loop = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      this.renderFrame();
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  private renderFrame(): void {
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);

    // ヒットストップ: 命中の瞬間だけ時間を遅くして打撃感を出す
    let delta = rawDelta;
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= rawDelta;
      delta = rawDelta * 0.18;
    }
    this.elapsed += delta;

    this.arena.update(this.elapsed);
    for (const avatar of this.avatars.values()) avatar.update(delta, this.elapsed);
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

  getAvatar(instanceId: string): MonsterAvatar | undefined {
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
    const center = this.tmpVector.set(0, 0.12, aoe ? 0 : ENEMY_LINE_Z * 0.6);
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
    for (const avatar of this.avatars.values()) avatar.dispose();
    this.avatars.clear();
    this.arena.dispose();
    this.vfx.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
