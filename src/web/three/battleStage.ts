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

/** 指を横へ画面幅いっぱい滑らせた時に回る角度(ラジアン) */
const ORBIT_SPEED = Math.PI * 1.1;
/**
 * 手で回せる範囲。真後ろまで回れると自陣と敵陣が入れ替わって
 * どちらが自分か分からなくなるので、左右それぞれ100度で止める。
 * 自分のモンスターの顔を覗き込むには十分な角度。
 */
const ORBIT_LIMIT = THREE.MathUtils.degToRad(100);

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
  /** 闘技場から焼いた映り込み用の環境マップ。破棄時に手放す */
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
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
  /** 画面のタップ位置から3Dの本体を拾うための道具 */
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  /** 両チームが必ず収まる箱。setupUnitsで実際のスロット位置から作る */
  private frameBox: FrameBox = { halfWidth: 5.4, zNear: 4.4, zFar: -4.9, yBottom: -0.1, yTop: 3.3 };
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
    this.setupEnvironment();
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

    // 環境光。天が冷たい青、地が篝火の照り返しで暖色。
    // 上下で色温度が割れていると、丸い面が回り込むだけで色が変わる
    this.scene.add(new THREE.HemisphereLight(0x8ea6ee, 0x3a2418, 0.42));

    // キーライト: 体表シェーダの KEY_DIR と同じ方向(右手前・高め)。
    // 影は左奥へ伸び、カメラからは真横に見えるので接地が読める
    const key = new THREE.DirectionalLight(0xffe7c2, 2.45);
    key.position.set(8.8, 17.6, 9.7);
    key.castShadow = true;
    // 影の解像度は「影が硬すぎない」ことより先に「輪郭が階段状にならない」
    // ことを優先する。錐台を闘技床の広さまで絞ってテクセルを稼ぐ
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 52;
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.028;
    this.scene.add(key);

    // フィルライト: キーの反対側から回り込む冷たい光。
    // キーの陰になった面を「見える暗さ」に留めるためだけの弱い光で、
    // ここを強くするとキーの方向感が消える
    const fill = new THREE.DirectionalLight(0x8fa8f0, 0.62);
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
    const rim = new THREE.DirectionalLight(0xff86c8, 1.45);
    rim.position.set(-5.6, 1.5, -18);
    this.scene.add(rim);

    // 逆リム: 反対の肩側にもう一本。片側だけだと輪郭の抜けが半分で終わる。
    // 色は篝火寄りの暖色にして、赤紫のリムと寒暖で対にする
    const rimWarm = new THREE.DirectionalLight(0xffab6a, 1.0);
    rimWarm.position.set(16, 1.4, -12);
    this.scene.add(rimWarm);

    // 闘技床へ落とす天井光。中央だけを持ち上げて、戦う場所に視線を集める。
    // 減衰を持つライトなので、周辺の観客席までは届かない。
    //
    // **ここは「床を明るくする灯り」ではなく「中央と周辺の差」を作る灯り。**
    // 強いと足元が白く飛び、そこに立つモンスターの下半身から色が抜ける。
    // 届く範囲を狭めて減衰を急にし、明るさそのものは落とす。
    // 中央が明るく見えるかどうかは絶対量ではなく周辺との比で決まるので、
    // 周辺(霧とビネット)を沈めるほうで差を作る
    const centerPool = new THREE.PointLight(0xdfe7ff, 15, 14, 2.4);
    centerPool.position.set(0.5, 9.5, 0.5);
    this.scene.add(centerPool);
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
    //
    // 手で回した角度もここに含める。回すと2つの列が横並びになって必要な幅が
    // 変わるので、距離を測り直さないとユニットが画面の外へ押し出される
    const azimuth = THREE.MathUtils.degToRad(CAMERA_AZIMUTH_DEG) + this.orbitYaw;
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
    this.viewWidth = width;
    this.viewHeight = height;
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
    this.environmentTarget?.dispose();
    this.environmentTarget = null;
    this.scene.environment = null;
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
