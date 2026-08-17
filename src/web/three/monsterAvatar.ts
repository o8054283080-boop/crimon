import * as THREE from "three";
import { Element } from "../../core/element.js";
import { CreatureKit } from "./creature/kit.js";
import { CreatureRig, finalizeRig } from "./creature/rig.js";
import { builderFor } from "./creature/roles.js";
import { applyTemplateTraits, templateBuilderFor } from "./creature/templates.js";
import { CreatureUniforms, SurfaceSet, createCreatureUniforms, paletteFor } from "./creature/surface.js";
import { ElementTheme, themeFor } from "./elementTheme.js";
import { radialGlowTexture, shadowTexture, sigilTexture } from "./textures.js";

/** 対象に選ばれている時の足元の紋様の色。属性色と混ざらない警告色にする */
const TARGET_SIGIL_COLOR = new THREE.Color(0xff5a4a);

/** 攻撃・被弾などの短時間アニメを、経過時間ベースで管理する簡易トラック */
interface AnimTrack {
  elapsed: number;
  duration: number;
  active: boolean;
}

function newTrack(): AnimTrack {
  return { elapsed: 0, duration: 0, active: false };
}

function trigger(track: AnimTrack, duration: number): void {
  track.elapsed = 0;
  track.duration = duration;
  track.active = true;
}

function advance(track: AnimTrack, dt: number): number | null {
  if (!track.active) return null;
  track.elapsed += dt;
  const t = track.elapsed / track.duration;
  if (t >= 1) {
    track.active = false;
    return null;
  }
  return t;
}

/** 0→1→0 と山なりに動く */
function arc(t: number): number {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 本体の速度を、垂れている部位の「遅れ角」へ変える。
 *
 * 単純な比例だと、待機の遅い動きでは角度が小さすぎて何も見えないのに、
 * 攻撃の踏み込みでは布が体を突き抜けるほど跳ねる。小さい入力には強く効かせ、
 * 大きい入力では `max` へ滑らかに頭打ちさせることで、両方を1本で成立させる。
 */
function lag(velocity: number, gain: number, max: number): number {
  const x = velocity * gain;
  return (max * x) / (max + Math.abs(x));
}

/**
 * 減衰振動する1自由度。目標へ引かれ、**行き過ぎてから戻る**。
 *
 * 二次的な動き(尾・耳・翼・布・肉)の芯。正弦波で勝手に揺らすのではなく、
 * 「本体の動き」を目標として与えると、質量のぶんだけ遅れて追従し、
 * 本体が止まった後もしばらく揺れ続ける。人形と生き物を分けるのはここ。
 */
class Spring {
  value = 0;
  velocity = 0;

  /**
   * @param freq  固有振動数(Hz)。低いほど重く、ゆっくり大きく揺れる
   * @param damp  減衰比。1で行き過ぎず、0.2前後でよく尾を引く
   */
  step(target: number, freq: number, damp: number, dt: number): number {
    const w = freq * Math.PI * 2;
    // 明示オイラーは dt*w が大きいと発散する。刻んで解く
    const steps = Math.min(6, Math.max(1, Math.ceil((dt * w) / 0.3)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.velocity += (-w * w * (this.value - target) - 2 * damp * w * this.velocity) * h;
      this.value += this.velocity * h;
    }
    // 数値が暴れた時に部位が飛ばないよう、念のため頭打ちにする
    this.value = clamp(this.value, -2.5, 2.5);
    this.velocity = clamp(this.velocity, -40, 40);
    return this.value;
  }
}

/** 1つの部位が持つ、直交する2方向の揺れ */
interface Wobble {
  a: Spring;
  b: Spring;
}

function newWobbles(count: number): Wobble[] {
  const list: Wobble[] = [];
  for (let i = 0; i < count; i++) list.push({ a: new Spring(), b: new Spring() });
  return list;
}

/** 待機中の仕草の長さ(秒)。短すぎると見落とされ、長すぎると次の行動を待たせる */
const ACCENT_DURATION: Record<string, number> = {
  none: 0,
  headShake: 0.8,
  wingRuffle: 1.1,
  tailFlick: 0.7,
  stomp: 1.0,
  shiver: 0.6,
  roar: 1.4,
  gaze: 2.0,
};

export interface MonsterAvatarOptions {
  element: Element;
  role: string;
  /** モンスター種別。同じ役割でも種別ごとに翼や角を足して見分けられるようにする */
  templateId: string;
  /** PLAYER側は+Z(手前)、ENEMY側は-Z(奥)に立つ */
  facing: 1 | -1;
}

/**
 * 1体分のモンスターを表す3Dアバター。
 *
 * 見た目はすべてプロシージャル生成で、役割ごとに骨格ビルダーを切り替えて
 * 胴・頭・四肢・翼・尾を持つ「生き物のシルエット」を組み立てる(creature/以下)。
 * このクラスは組み上がった骨格に対して、待機・攻撃・詠唱・被弾・撃破の
 * モーションを付ける役目に専念する。
 */
export class MonsterAvatar {
  readonly root = new THREE.Group();
  readonly theme: ElementTheme;

  private readonly kit: CreatureKit;
  private readonly rig: CreatureRig;
  private readonly uniforms: CreatureUniforms;

  private readonly auraSprite: THREE.Sprite;
  private readonly sigilMesh: THREE.Mesh;
  private readonly hitProxy: THREE.Mesh;
  /** スキルの対象として選ばれているか */
  private targeted = false;
  private readonly shadowMesh: THREE.Mesh;
  private readonly disposables: { dispose: () => void }[] = [];

  private readonly phase = Math.random() * Math.PI * 2;
  /**
   * 待機の位相。`elapsed * テンポ` で作ると、テンポが変わった瞬間に
   * 位相が(経過時間 × テンポ差)だけ飛ぶ。dtで積めばどう変えても連続する。
   */
  private idleClock = Math.random() * 40;
  private readonly attackTrack = newTrack();
  /** 待機中の仕草。周期運動と重ならないよう、専用のトラックで管理する */
  private readonly accentTrack = newTrack();
  /** 次に仕草を出す時刻。出すたびにばらつかせて、周期に聞こえないようにする */
  private nextAccentAt = 2 + Math.random() * 5;
  private readonly hitTrack = newTrack();
  private readonly castTrack = newTrack();

  /** 体感重量。0が羽、1が岩塊。動きの速さ・遅れ・沈み込みを一括で決める */
  private readonly mass: number;
  /** 攻撃の3段(溜め・打ち抜き・余韻)の長さ。秒で持つ */
  private attackWindup = 0.16;
  private attackStrike = 0.18;
  private attackRecover = 0.3;

  /** 二次的な動き。部位ごとに1つずつ持つ */
  private readonly tailSprings: Wobble[];
  private readonly wingSprings: Wobble[];
  private readonly clothSprings: Wobble[];
  private readonly followerSprings: Wobble[];
  private readonly limbSprings: Wobble[];
  /** 頭の据わり。体が動いても頭は遅れて追い、視線は相手に残る */
  private readonly headSpring: Wobble = { a: new Spring(), b: new Spring() };
  /** 着地・被弾の沈み込み(縦の潰れ) */
  private readonly landSpring = new Spring();
  /**
   * よろけ。打たれて後ろへ流され、踏み止まって戻る。
   *
   * 被弾の振動(hitTrack)とは別に持つ。振動だけだと「その場で震える」に
   * しかならず、押された・こらえた、が出ない。バネなので戻りに時間がかかる。
   */
  private readonly staggerSpring = new Spring();
  /** よろけの左右成分。真後ろにだけ下がると、当たる度に同じ絵になる */
  private readonly staggerSideSpring = new Spring();
  /**
   * 浮遊するものの漂い。
   *
   * 正弦波を重ねただけの漂いは、どれだけ周期をずらしても必ず同じ場所へ
   * 戻ってくるため、しばらく見ていると「決まった軌道をなぞる置物」に見える。
   * 数秒おきに行き先を選び直し、そこへ**ゆっくり引かれる**バネにすると、
   * 戻る場所が無くなり、水中を漂っているように読めるようになる。
   */
  private readonly driftX = new Spring();
  private readonly driftY = new Spring();
  private readonly driftZ = new Spring();
  private readonly driftYaw = new Spring();
  private readonly driftTarget = new THREE.Vector3();
  private driftYawTarget = 0;
  private driftTimer = Math.random() * 2;

  /** 前フレームの重心と傾き。速度を出して二次的な動きの入力にする */
  private readonly previousOffset = new THREE.Vector3();
  private previousLeanX = 0;
  private previousLeanZ = 0;
  /** 平滑化した本体の速度(x=左右 y=上下 z=前後) */
  private readonly bodyVelocity = new THREE.Vector3();
  private bodyPitchRate = 0;

  /** 視線を外している量。数秒おきに別の方向を見て、また相手へ戻す */
  private gazeYaw = 0;
  private gazePitch = 0;
  private gazeTimer = 1 + Math.random() * 2;
  /** 倒れる向き。全員が同じ方へ崩れると作り物に見える */
  private readonly deathTip = Math.random() < 0.5 ? -1 : 1;
  private deathProgress = 0;
  private dying = false;
  /** 倒れ切って地面に着いた瞬間を1度だけ拾うための印 */
  private deathLanded = false;
  private hpRatio = 1;
  private activeGlow = 0;
  private targetActiveGlow = 0;
  private flash = 0;
  private readonly tmpVector = new THREE.Vector3();

  constructor(options: MonsterAvatarOptions) {
    const { element, role, templateId, facing } = options;
    this.theme = themeFor(element);

    const palette = paletteFor(this.theme);
    this.uniforms = createCreatureUniforms();
    this.kit = new CreatureKit(new SurfaceSet(palette, this.uniforms), palette);
    this.rig = new CreatureRig();

    // 種別に専用の骨格があればそれを使い、無ければ役割の骨格を使う。
    // スライムのように、役割(アタッカー=四足獣)の骨格が種別に対して
    // そもそも不適切な場合があるため、種別側が骨格ごと差し替えられるようにしている
    const builder = templateBuilderFor(templateId) ?? builderFor(role);
    builder.build(this.kit, this.rig);
    // 役割で組んだ骨格に、種別固有の特徴(翼・光輪・羽根飾りなど)を足す
    applyTemplateTraits(templateId, this.kit, this.rig);
    finalizeRig(this.rig, this.kit, builder.height, builder.float);
    this.uniforms.uHeight.value = this.rig.height;

    // 重さは骨組みが確定してから読む(体高も重さの手がかりに使われている)
    this.mass = this.rig.anim.mass ?? 0.4;
    this.tailSprings = newWobbles(this.rig.tail.length);
    this.wingSprings = newWobbles(this.rig.wings.length);
    this.clothSprings = newWobbles(this.rig.cloth.length);
    this.followerSprings = newWobbles(this.rig.followers.length);
    this.limbSprings = newWobbles(this.rig.arms.length + this.rig.legs.length);

    // 正面(-Z)を相手チーム側へ向ける。実際の向きは配置が決まったあとに
    // faceToward() で相手チームの中心へ向け直す
    this.rig.root.rotation.y = facing > 0 ? 0 : Math.PI;
    this.root.add(this.rig.root);

    const footprint = this.rig.height * 0.62;

    // --- 足元の魔法陣 ---
    const sigilGeometry = new THREE.PlaneGeometry(footprint * 1.7, footprint * 1.7);
    const sigilMaterial = new THREE.MeshBasicMaterial({
      map: sigilTexture(),
      color: this.theme.ground,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sigilMesh = new THREE.Mesh(sigilGeometry, sigilMaterial);
    this.sigilMesh.rotation.x = -Math.PI / 2;
    this.sigilMesh.position.y = 0.02;
    this.root.add(this.sigilMesh);
    this.disposables.push(sigilGeometry, sigilMaterial);

    // --- 指の当たり判定 ---
    // 体そのもので判定すると、細い脚や翼の隙間を突いてしまい狙いにくい。
    // 姿を持たない箱を1つ被せ、その箱で受ける
    const hitGeometry = new THREE.BoxGeometry(footprint * 1.15, this.rig.height * 1.05, footprint * 1.15);
    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.hitProxy = new THREE.Mesh(hitGeometry, hitMaterial);
    this.hitProxy.position.y = this.rig.height * 0.52;
    this.hitProxy.renderOrder = -1;
    this.root.add(this.hitProxy);
    this.disposables.push(hitGeometry, hitMaterial);

    // --- 接地影 ---
    const shadowGeometry = new THREE.PlaneGeometry(footprint * 1.25, footprint * 1.25);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
    this.shadowMesh.rotation.x = -Math.PI / 2;
    this.shadowMesh.position.y = 0.012;
    this.root.add(this.shadowMesh);
    this.disposables.push(shadowGeometry, shadowMaterial);

    // --- 足元に溜まる属性光(体を覆わないよう低く小さく) ---
    const auraMaterial = new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: this.theme.vfx,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.auraSprite = new THREE.Sprite(auraMaterial);
    this.auraSprite.scale.setScalar(footprint * 1.5);
    this.auraSprite.position.y = footprint * 0.25;
    this.root.add(this.auraSprite);
    this.disposables.push(auraMaterial);
  }

  /** 台座も含めた立ち位置 */
  setSlotPosition(x: number, z: number): void {
    this.root.position.set(x, 0, z);
  }

  /** ダメージ表示などをぶら下げるための、頭上あたりのワールド座標 */
  getAnchorWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.rig.core.getWorldPosition(target);
    // HPバーがこの位置に出るため、低すぎると顔がラベルで隠れる。
    // 一方で被弾エフェクトの中心でもあるので、頭のすぐ下あたりに置く
    target.y += this.rig.height * 0.86;
    return target;
  }

  /** 行動順が回ってきた時のハイライト */
  setActive(active: boolean): void {
    this.targetActiveGlow = active ? 1 : 0;
  }

  /**
   * スキルの対象として選ばれている状態。
   * 行動中の光り方と同じ機構に乗せつつ、足元の紋様を警告色へ寄せて、
   * 「今から殴られる相手」だと一目で分かるようにする。
   */
  setTargeted(targeted: boolean): void {
    this.targeted = targeted;
  }

  /** 指の当たり判定に使う、姿を持たない箱。細かい形で判定すると狙いにくい */
  get hitArea(): THREE.Object3D {
    return this.hitProxy;
  }

  /** HP割合。低いほど表面の亀裂が強く光る */
  setHpRatio(ratio: number): void {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
  }

  /**
   * 攻撃モーション。溜め・打ち抜き・余韻を**秒で**組む。
   *
   * 割合(0〜1)で区切ると、重い個体の全長を伸ばした時に打点まで一緒に遅れ、
   * 着弾エフェクト(戦闘側は260ms前後で当てにくる)とずれてしまう。
   * 打点はどの重さでもおおむね揃え、重い個体は**溜めを長く、余韻をさらに長く**する。
   */
  playAttack(): void {
    this.attackWindup = 0.13 + this.mass * 0.08;
    // 打ち抜きは「立ち上がり(全体の45%)+抜け」。以前は全体が0.17秒しかなく、
    // 立ち上がりが4フレームで終わっていた。目で追えないほど速いと、
    // 見ている側には移動ではなく瞬間移動として届く
    this.attackStrike = 0.19 + this.mass * 0.09;
    this.attackRecover = 0.24 + this.mass * 0.6;
    trigger(this.attackTrack, this.attackWindup + this.attackStrike + this.attackRecover);
  }

  /** 支援・バフスキルなど、その場で力を溜める演出 */
  playCast(): void {
    trigger(this.castTrack, 0.8);
  }

  /** 重い個体は大きく揺れないが、揺り戻しが長く残る */
  playHit(): void {
    trigger(this.hitTrack, 0.38 + this.mass * 0.34);
    // 体が沈む。バネなので、押し込まれた後に自分で戻る
    this.landSpring.velocity -= 12 - this.mass * 4;
    // 後ろへ突き飛ばされる。重いものは動かないかわりに、戻るまでが長い
    this.staggerSpring.velocity += 7 - this.mass * 3.5;
    // 左右にも崩れる。毎回同じ向きへ下がると、連打された時に機械に見える
    this.staggerSideSpring.velocity += (Math.random() - 0.5) * (5.6 - this.mass * 2.8);
    this.flash = 1;
  }

  playDeath(): void {
    this.dying = true;
  }

  /** 撃破状態から復帰させる(復活・再挑戦時) */
  revive(): void {
    this.dying = false;
    this.deathProgress = 0;
    this.deathLanded = false;
  }

  isDying(): boolean {
    return this.dying;
  }

  /**
   * 指定した位置(相手チームの中心)へ体を向ける。
   *
   * 以前は両チームとも同じ向きへ一定角度だけ回して立体感を出していたが、
   * 同じ向きに回すと両チームの正面がすれ違い、互いの脇を見ることになる。
   * カメラ側に方位角を入れて斜めから見る構図になった今、
   * 体を捻って立体感を作る必要はないので、素直に向かい合わせる。
   * 端のユニットは相手の中心を向くぶん自然に内へ角度がつき、隊列に収束感が出る。
   */
  faceToward(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx === 0 && dz === 0) return;
    // 骨格の正面は -Z。Y軸まわりに a 回すと正面は (-sin a, 0, -cos a) を向く
    this.rig.root.rotation.y = Math.atan2(-dx, -dz);
  }

  update(dt: number, elapsed: number): void {
    const rig = this.rig;
    const anim = rig.anim;
    const mass = this.mass;
    const step = Math.max(1e-4, Math.min(dt, 0.05));
    // 撃破が進むほど生気が抜ける。倒れながら呼吸していては作り物に見える
    const alive = 1 - clamp01(this.deathProgress * 1.6);
    /**
     * 待機の速さ。
     *
     * 以前は全部の波を idleSpeed 倍していたため、遅い個体はすべての帯が
     * 同時に間延びして静止画と区別が付かなかった。個体差は ±25% ほどに留め、
     * 「重さ」の違いは帯ごとの周期(下の *Hz)で作る。
     */
    const pace = 0.78 + anim.idleSpeed * 0.24;
    // 位相は dt で積む。テンポを変えても波が飛ばない
    this.idleClock += step * pace;
    const T = (this.idleClock + this.phase) * Math.PI * 2;

    /**
     * 待機を作る波の「帯」。単位はHz(1秒あたりの往復回数)。
     *
     * 全部を1つのテンポ倍率で伸び縮みさせると、遅い個体はすべてが同時に
     * 間延びして止まって見える。呼吸・体重移動・尾・羽ばたき・微振動は
     * 実際の生き物でも周期が違うので、帯ごとに別々の速さを持たせる。
     * ここを読めば「どれくらいの速さで動いているか」が秒で分かる。
     */
    /**
     * 傷ついているほど呼吸が速く深くなり、頭が下がって構えが崩れる。
     * HPバーを見ずに、立ち姿だけで劣勢が読めるようにする。
     */
    const hurt = 1 - this.hpRatio;
    const breathHz = (0.47 - mass * 0.17) * (1 + hurt * 0.6); // 重い個体ほど深くゆっくり吸う
    const swayHz = 0.20 - mass * 0.06; // 体重の預け替え。いちばん遅い帯
    const tailHz = 0.80 - mass * 0.30; // 尾のうねり。輪郭の外なので一番目に付く
    const flapHz = 0.56 - mass * 0.18; // 翼の畳み直し
    const microHz = 2.7 - mass * 0.9; // 立ち直しの微振動。振幅は極小

    /**
     * 役割ごとの振れ幅に下限を作る。
     *
     * ビルダーの指定は 0.3〜1.5 の幅があり、0.3 台をそのまま掛けると
     * 首も腰も動かず、静止画と区別が付かなくなる(ゴーレムの頭が
     * 0.05ラジアンしか動いていなかった)。個体差は残しつつ、
     * 下限を約0.6に持ち上げる。
     */
    const swayGain = 0.42 + anim.sway * 0.62;
    const headGain = 0.42 + anim.headSway * 0.62;
    const breathGain = 0.42 + anim.breath * 0.62;

    // === 待機モーション ===================================================
    // 呼吸。吸う(速い)と吐く(遅い)を非対称にする。左右対称な正弦波のままだと
    // 「膨らんで縮む球」にしか見えず、肺の動きとして読めない
    const breathPhase = T * breathHz;
    const breath = Math.sin(breathPhase) * 0.72 + Math.sin(breathPhase * 2 + 0.9) * 0.28;
    const breathStrength = breathGain * (0.85 + hurt * 0.45) * alive;
    rig.torso.rotation.set(
      rig.torsoRest.x + breath * 0.05 * breathStrength,
      rig.torsoRest.y,
      rig.torsoRest.z,
    );
    rig.torso.scale.set(1 + breath * 0.03 * breathStrength, 1 + breath * 0.042 * breathStrength, 1 + breath * 0.03 * breathStrength);

    // 体重移動。重い個体ほどゆっくり、深く預ける。
    // 呼吸(速い)と重心移動(遅い)の2つの周期が重なることで生気が出る
    const shift = Math.sin(T * swayHz) * alive;
    // 前後の重心。接地しているものは踵と爪先の間で体重が行き来する。
    // ここが0だと、二次的な動きの入力(前後の速度)が待機中ずっと0になり、
    // 布も耳も攻撃の時しか動かない。生気の大半はこの1本から出ている
    const rock = Math.sin(T * swayHz * 1.63 + 1.1) * alive;
    // 立ち直しの微振動。重い個体ほど強く出す(支えきれずに揺り戻す)
    const micro = Math.sin(T * microHz) * (0.3 + mass * 0.7) * alive;
    let offsetY = 0;
    let offsetZ = rock * 0.03 * swayGain;
    let offsetX = shift * 0.085 * swayGain;
    let leanX = (rock * 0.07 + breath * 0.025) * swayGain;
    let leanZ = shift * 0.07 * swayGain;
    // 腰と胴の捻り。腰が体重の乗った側へ傾き、胴が逆へ返す(コントラポスト)。
    // これが無いと、腕と脚を動かしても「一枚板が横に滑っている」ように見える
    let hipZ = -shift * 0.12 * swayGain;
    let hipY = shift * 0.09 * swayGain;

    if (rig.floats) {
      // 漂いの行き先を数秒おきに選び直す。正弦波の重ね合わせだけで作ると
      // 必ず同じ場所へ戻ってくるので、長く見ていると軌道を覚えられてしまう
      this.driftTimer -= dt;
      if (this.driftTimer <= 0) {
        this.driftTimer = 1.5 + Math.random() * 2.8;
        this.driftTarget.set(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.34 + anim.bob * 1.6,
          (Math.random() - 0.5) * 0.42,
        );
        this.driftYawTarget = (Math.random() - 0.5) * 0.42;
      }
      // 引かれる速さは重さで変える。軽いものはふらふら流され、
      // 重い浮遊体(古代の魔人)は同じ場所に留まろうとする
      const driftHz = 0.34 - mass * 0.1;
      const driftDamp = 0.62 + mass * 0.2;
      offsetX += this.driftX.step(this.driftTarget.x, driftHz, driftDamp, step) * alive;
      offsetY += this.driftY.step(this.driftTarget.y, driftHz * 1.25, driftDamp, step) * alive;
      offsetZ += this.driftZ.step(this.driftTarget.z, driftHz * 0.9, driftDamp, step) * alive;
      // 向きもゆっくり流される。浮いているものが真っ直ぐ止まっていると重さが出る
      hipY += this.driftYaw.step(this.driftYawTarget, driftHz * 0.8, driftDamp, step) * alive;
      // 漂いの上に、止まらない細かい呼吸を足す。バネが目標へ着いた瞬間に
      // 完全に静止してしまうのを防ぐ(浮遊体は絶対に止まってはいけない)
      offsetY += Math.sin(T * 0.31) * anim.bob * 0.9 * alive;
      leanZ += (Math.sin(T * 0.135 + 0.8) * 0.06 - this.driftX.velocity * 0.09) * alive;
      leanX += (Math.sin(T * 0.157 + 2.1) * 0.05 + this.driftZ.velocity * 0.1) * alive;
    } else {
      // 接地するものは、体重が片脚に乗り切った時に腰が上がり、
      // 乗せ替える瞬間に沈む。体重移動の2倍の周期にすると噛み合う
      offsetY += (Math.abs(shift) - 0.62) * 0.15 * (1 - mass * 0.3) * swayGain * alive;
      offsetY += Math.sin(T * breathHz + 0.6) * anim.bob * 0.85 * alive;
      // 足が地面を捉えている感じは、この微小な上下の揺り返しから出る
      offsetY += micro * 0.011;
      leanZ += micro * 0.014;
    }

    // 首と頭。生き物らしさが一番出るので、周期をずらして複数の波を重ねる
    rig.neck.rotation.set(
      rig.neckRest.x + (breath * 0.055 - rock * 0.06) * headGain * alive,
      rig.neckRest.y + Math.sin(T * tailHz * 0.55) * 0.09 * headGain * alive,
      rig.neckRest.z - shift * 0.06 * headGain,
    );
    let headX = rig.headRest.x + Math.sin(T * breathHz * 1.7 + 1.1) * 0.06 * headGain * alive;
    // 見回す遅い波。視線が動いているだけで生き物に見える
    let headY = rig.headRest.y + Math.sin(T * swayHz * 2.1 + 0.3) * 0.16 * headGain * alive;
    let headZ = rig.headRest.z - shift * 0.085 * headGain;
    // 傷ついた分だけ頭が落ち、腰が沈む。呼吸が速くなるのと合わせて
    // 「まだ立っているが、もう長くない」が姿勢で伝わる
    headX += hurt * hurt * 0.16 * alive;
    offsetY -= hurt * hurt * 0.035 * rig.height * 0.28 * alive;
    leanX += hurt * hurt * 0.09 * alive;
    let jawOpen = 0;
    // 粘体の伸縮。呼吸より速い周期で、たぷんと戻る非対称な波にする
    let squash = anim.squash > 0 ? (Math.sin(T * breathHz * 1.8) + Math.sin(T * breathHz * 3.5) * 0.35) * 0.11 * alive : 0;

    // 尾・布・耳へ渡す「本体からの入力」。ここに溜めた値をバネで遅らせる。
    // 尾は輪郭の外に出ていて一番目に付くので、待機でもはっきり振らせる
    let tailDriveX = Math.sin(T * tailHz * 0.62 - 0.7) * 0.1 * anim.tailWave * alive;
    let tailDriveY = (Math.sin(T * tailHz) * 0.2 + Math.sin(T * tailHz * 2.35 + 1.4) * 0.055) * anim.tailWave * alive;

    // 翼: 羽ばたき。打ち下ろしが速く、戻しが遅い(空気を押している側が速い)
    const flapPhase = T * flapHz;
    const flapRaw = Math.sin(flapPhase);
    const flap = (flapRaw > 0 ? Math.pow(flapRaw, 0.6) : -Math.pow(-flapRaw, 1.5)) * anim.wingFlap;
    for (const wing of rig.wings) {
      wing.root.rotation.set(
        // 羽ばたかない(畳んでいる)翼でも、体の呼吸に合わせて必ず動かす。
        // 大きい面が完全に止まっていると、それだけで作り物に見える
        wing.rootRest.x + (Math.sin(flapPhase + 0.9) * 0.1 * anim.wingFlap + breath * 0.035) * alive,
        wing.rootRest.y,
        wing.rootRest.z - wing.side * (flap * 0.55 + Math.sin(flapPhase * 0.7 + 1.3) * 0.045) * alive,
      );
    }

    // 手足の微動。接地している脚は「支える側」と「遊ぶ側」で役割を分ける
    for (const arm of rig.arms) {
      arm.root.rotation.set(
        arm.rootRest.x + (Math.sin(T * breathHz * 1.5 + arm.phase) * 0.07 - rock * 0.05) * alive,
        arm.rootRest.y,
        arm.rootRest.z + arm.side * (Math.sin(T * breathHz * 1.2 + arm.phase) * 0.05 + breath * 0.03) * alive,
      );
      if (arm.lower && arm.lowerRest) {
        arm.lower.rotation.x = arm.lowerRest.x + Math.sin(T * breathHz * 1.5 + arm.phase + 0.8) * 0.065 * alive;
      }
    }
    for (const leg of rig.legs) {
      // 体重が乗っている脚は伸び、逆の脚は少し畳む。踏ん張りが読める。
      // 前後の重心移動(rock)も足首まで通すと、地面を掴んでいるように見える
      const load = rig.floats ? 0 : clamp(shift * leg.side, -1, 1);
      leg.root.rotation.x = leg.rootRest.x + (Math.sin(T * breathHz + leg.phase) * 0.03 - load * 0.07 - rock * 0.045) * alive;
      leg.root.rotation.z = leg.rootRest.z + load * 0.055 * alive;
      if (leg.lower && leg.lowerRest) {
        leg.lower.rotation.x = leg.lowerRest.x + (load * 0.1 + rock * 0.05 + micro * 0.012) * alive;
      }
    }

    for (const spinner of rig.spinners) {
      // 等速で回る環は時計の秒針に見える。速さをゆっくり脈打たせると、
      // 同じ回転でも「意志で回している」ように読める
      spinner.object.rotation[spinner.axis] += dt * spinner.speed * (1 + Math.sin(elapsed * 0.37 + this.phase) * 0.35);
    }
    /**
     * 周囲を漂う破片。
     *
     * 等速・真円・一定の高さで回すと、どれだけ数を増やしても機械仕掛けの
     * 飾りにしか見えない。次の3つを足すと、同じ部品のまま「引き寄せられて
     * 浮いている石」に変わる。
     *   1. 角速度をゆらす(近づくと速く、離れると遅い)
     *   2. 軌道面を歳差させ、半径をゆっくり伸び縮みさせる
     *   3. 本体が動いた分だけ遅れて付いてくる(慣性)
     */
    // 本体の速度は下で更新されるので、ここで読むのは1フレーム前の値。
    // 遅れて付いてくる表現なので、1フレーム前で構わない
    const orbitLagX = clamp(-this.bodyVelocity.x * 0.05, -0.3, 0.3);
    const orbitLagY = clamp(-this.bodyVelocity.y * 0.04, -0.24, 0.24);
    const orbitLagZ = clamp(-this.bodyVelocity.z * 0.05, -0.3, 0.3);
    for (const orbiter of rig.orbiters) {
      const base = elapsed * orbiter.speed + orbiter.phase;
      const angle = base + Math.sin(base * 0.41 + orbiter.phase) * 0.6;
      const radius = orbiter.radius * (1 + Math.sin(base * 0.53 + orbiter.phase * 1.7) * 0.18);
      const precess = Math.sin(base * 0.23 + orbiter.phase * 0.7) * 0.45;
      orbiter.object.position.set(
        Math.cos(angle) * radius + orbitLagX,
        orbiter.height + Math.sin(angle * 1.6 + orbiter.phase) * 0.18 + Math.sin(base * 0.29) * radius * 0.22 + orbitLagY,
        Math.sin(angle) * radius * Math.cos(orbiter.tilt + precess) + orbitLagZ,
      );
      orbiter.object.rotation.y += dt * orbiter.spin;
      orbiter.object.rotation.x += dt * orbiter.spin * 0.6;
      orbiter.object.rotation.z += dt * orbiter.spin * 0.23;
    }

    // === 待機中の仕草 =====================================================
    // 攻撃・詠唱・被弾の最中には割り込ませない(演出の読み取りを邪魔するため)
    const busy = this.attackTrack.active || this.castTrack.active || this.hitTrack.active;
    if (!busy && !this.dying && anim.accent !== "none" && !this.accentTrack.active && elapsed >= this.nextAccentAt) {
      const duration = ACCENT_DURATION[anim.accent];
      trigger(this.accentTrack, duration);
      // 次の間隔をばらつかせる。等間隔だと結局そこに周期を感じてしまう
      this.nextAccentAt = elapsed + duration + 3.5 + Math.random() * 5.5;
    }
    const accentT = busy || this.dying ? null : advance(this.accentTrack, dt);
    if (accentT !== null) {
      const env = arc(accentT);
      switch (anim.accent) {
        case "headShake": {
          // 素早く頭を振る。獣がひと息つく仕草
          headY += Math.sin(accentT * Math.PI * 5) * 0.4 * env;
          headZ += Math.sin(accentT * Math.PI * 5 + 0.7) * 0.16 * env;
          break;
        }
        case "wingRuffle": {
          // 翼を一度大きく開いて畳み直す
          for (const wing of rig.wings) {
            wing.root.rotation.z -= wing.side * env * 0.85;
            wing.root.rotation.x += Math.sin(accentT * Math.PI * 3) * 0.2 * env;
          }
          leanZ += env * 0.02;
          break;
        }
        case "tailFlick": {
          tailDriveY += Math.sin(accentT * Math.PI * 3) * 0.34 * env;
          headZ -= env * 0.06;
          break;
        }
        case "stomp": {
          // 片脚を上げて踏み下ろす。重量級だけが持てる「重さ」の表現
          const lift = accentT < 0.58 ? Math.sin((accentT / 0.58) * Math.PI * 0.5) : Math.pow(1 - (accentT - 0.58) / 0.42, 2);
          const impact = accentT > 0.58 && accentT < 0.8 ? Math.sin(((accentT - 0.58) / 0.22) * Math.PI) : 0;
          if (rig.legs.length > 0) rig.legs[0].root.rotation.x -= lift * 0.5;
          offsetY += lift * 0.03 - impact * 0.055;
          leanZ += lift * 0.03;
          hipZ += lift * 0.06;
          // 踏み下ろした瞬間に全身が沈む。重さはここでしか出せない
          if (impact > 0.85) this.landSpring.velocity = Math.min(this.landSpring.velocity, -8);
          break;
        }
        case "shiver": {
          // 小刻みに震える。骨を持たない粘体や小動物の生存感
          offsetX += Math.sin(accentT * Math.PI * 22) * 0.03 * env;
          squash += Math.sin(accentT * Math.PI * 14) * 0.07 * env;
          break;
        }
        case "roar": {
          // 顎を開いて吠える。首を反らせ、胸を張る
          jawOpen = Math.max(jawOpen, env);
          headX -= env * 0.36;
          offsetY += env * 0.05;
          leanX -= env * 0.13;
          tailDriveX -= env * 0.12;
          for (const wing of rig.wings) wing.root.rotation.z -= wing.side * env * 0.5;
          break;
        }
        case "gaze": {
          // ゆっくり視線を向けて、しばらく止める。無機物・術者向け
          const hold = accentT < 0.3 ? accentT / 0.3 : accentT > 0.75 ? (1 - accentT) / 0.25 : 1;
          headY += hold * 0.45;
          headX -= hold * 0.08;
          break;
        }
      }
    }

    // === 攻撃 =============================================================
    // 溜め(引く)→打ち抜き→余韻(行き過ぎてから戻る)を秒で刻む。
    // 溜めは打ち抜きが始まるまで「保持」されるので、力が溜まって見える
    const attackT = advance(this.attackTrack, dt);
    if (attackT !== null) {
      const e = this.attackTrack.elapsed;
      const w = this.attackWindup;
      const s = this.attackStrike;
      // 溜め: 引ききって、打ち抜きが始まるまで保持する。
      // 保持がある(=止まる)ことで、次に来る一撃が予告される
      const windup = e < w ? Math.pow(Math.sin((e / w) * Math.PI * 0.5), 0.5) : Math.max(0, 1 - (e - w) / (s * 0.35));
      // 打ち抜き: 立ち上がりを鋭く、抜けをゆるく。打点は打ち抜き区間の4割の位置。
      // 山なりの正弦だと打点が中央に来てしまい、当たった瞬間が読めない
      const u = clamp01((e - w) / s);
      const swing = e < w ? 0 : u < 0.45 ? Math.sin((u / 0.45) * Math.PI * 0.5) : Math.pow(1 - (u - 0.45) / 0.55, 1.5);
      // 余韻: 打ち終わりに行き過ぎ、減衰しながら揺り戻して収まる。
      // 1山で戻すと「巻き戻し」に見えるので、必ず追い越してから収める
      const r = e < w + s ? 0 : clamp01((e - w - s) / this.attackRecover);
      const follow = e < w + s ? 0 : Math.sin(r * Math.PI * 1.7) * Math.pow(1 - r, 1.5) * 0.32;
      const strike = swing - follow;
      // 予備動作の入り。動き出しの一瞬だけ逆へ沈む。
      // いきなり引き始めると「巻き戻し」に見え、力を溜めたようには見えない
      const settle = e < w * 0.5 ? Math.sin((e / (w * 0.5)) * Math.PI) : 0;
      offsetY -= settle * 0.05 * (1 + mass * 0.6);
      leanX += settle * 0.06;
      jawOpen = Math.max(jawOpen, swing * 0.9);
      // 溜めの瞬間に息を止める(呼吸を殺すと、溜めが読めるようになる)
      if (windup > 0.4) rig.torso.scale.setScalar(1);

      if (anim.attack === "slam") {
        // 振り上げてから叩きつける。体は前へ出ず、上下に大きく動く
        offsetY += windup * 0.16 - strike * 0.1;
        offsetZ -= strike * anim.lunge * 0.5;
        leanX += -windup * 0.18 + strike * 0.42;
        headX += -windup * 0.25 + strike * 0.45;
        hipZ += windup * 0.1 - strike * 0.12;
        for (const arm of rig.arms) {
          arm.root.rotation.x += -windup * 1.5 + strike * 1.7;
          arm.root.rotation.z += arm.side * windup * 0.5;
          if (arm.lower && arm.lowerRest) arm.lower.rotation.x += -windup * 0.9 + strike * 0.6;
        }
        for (const leg of rig.legs) leg.root.rotation.x += windup * 0.16 - strike * 0.1;
      } else if (anim.attack === "dash") {
        // 小さく跳ねて突っ込む
        offsetZ += windup * 0.2 - strike * anim.lunge * 1.1;
        offsetY += arc(attackT) * 0.28;
        leanX += -strike * 0.5;
        headY += strike * 0.4;
        // 沈み込んでから伸び上がる。粘体はこの1本で攻撃が読める
        squash += -windup * 0.3 + strike * 0.34;
        for (const arm of rig.arms) arm.root.rotation.x += strike * 1.3;
      } else if (anim.attack === "pounce") {
        // 四足の跳びかかり。腕を振るのではなく、体を沈めてから前へ跳ぶ。
        // 着地の頭突き・噛みつきに重心が乗るよう、頭を大きく振り下ろす
        offsetY += -windup * 0.1 + arc(attackT) * 0.3;
        offsetZ += windup * 0.24 - strike * anim.lunge * 1.05;
        leanX += windup * 0.24 - strike * 0.32;
        headX += -windup * 0.4 + strike * 0.5;
        hipY += windup * 0.12 - strike * 0.1;
        for (const leg of rig.legs) {
          // 前脚は伸ばして掴みかかり、後脚は蹴り出して畳む
          leg.root.rotation.x += leg.front ? -windup * 0.5 + strike * 1.1 : windup * 0.4 - strike * 0.7;
          if (leg.lower && leg.lowerRest) leg.lower.rotation.x += leg.front ? windup * 0.4 - strike * 0.6 : -windup * 0.3;
        }
        for (const wing of rig.wings) wing.root.rotation.z -= wing.side * (windup * 0.5 + strike * 0.3);
      } else if (anim.attack === "breath") {
        // ブレス。踏み込まず、首を大きく引いてから顎を開いて前へ吐き出す。
        // 前に出ないぶん、首と頭の振り幅で「溜めて放った」ことを読ませる
        offsetZ += windup * 0.26 - strike * anim.lunge * 0.3;
        offsetY += windup * 0.1;
        leanX += -windup * 0.3 + strike * 0.24;
        headX += -windup * 0.62 + strike * 0.72;
        jawOpen = Math.max(jawOpen, windup * 0.4 + swing);
        for (const wing of rig.wings) {
          wing.root.rotation.z -= wing.side * (windup * 0.9 + strike * 0.2);
          wing.root.rotation.x -= windup * 0.25;
        }
        for (const leg of rig.legs) leg.root.rotation.x += windup * 0.18;
      } else if (anim.attack === "swipe") {
        // 片腕(前脚)で薙ぎ払う。左右非対称に振ることで、
        // 両腕を揃えて振る lunge/slam と型が分かれる
        offsetZ += windup * 0.22 - strike * anim.lunge * 0.7;
        offsetX += (-windup * 0.1 + strike * 0.14) * 0.6;
        leanX += windup * 0.2 - strike * 0.3;
        leanZ += -windup * 0.22 + strike * 0.34;
        headX += -windup * 0.2 + strike * 0.3;
        headY += -windup * 0.24 + strike * 0.36;
        hipY += -windup * 0.18 + strike * 0.26;
        for (const limb of rig.arms.length > 0 ? rig.arms : rig.legs.filter((l) => l.front)) {
          // 利き腕(side>0)だけを大きく振り、反対側は支えに回す
          const lead = limb.side > 0 ? 1 : 0.3;
          limb.root.rotation.x += (-windup * 0.9 + strike * 1.6) * lead;
          limb.root.rotation.z += limb.side * (windup * 0.8 - strike * 1.1) * lead;
          if (limb.lower && limb.lowerRest) limb.lower.rotation.x += (windup * 0.6 - strike * 0.9) * lead;
        }
        for (const wing of rig.wings) wing.root.rotation.z -= wing.side * (windup * 0.6 + strike * 0.4);
      } else if (anim.attack === "bless") {
        // 前へ出ず、その場で両腕を高く掲げて放つ。天使・術者の型。
        // 敵に近づかないことで、支援・神聖の役どころが動きから読める
        offsetY += windup * 0.1 + arc(attackT) * 0.16;
        leanX -= windup * 0.1 + strike * 0.08;
        headX -= windup * 0.3 + strike * 0.2;
        for (const arm of rig.arms) {
          arm.root.rotation.z += arm.side * (windup * 0.5 + strike * 1.25);
          arm.root.rotation.x -= windup * 0.3 + strike * 0.55;
          if (arm.lower && arm.lowerRest) arm.lower.rotation.x -= strike * 0.4;
        }
        for (const wing of rig.wings) {
          wing.root.rotation.z -= wing.side * (windup * 0.4 + strike * 0.95);
          wing.root.rotation.x -= strike * 0.2;
        }
      } else if (anim.attack === "cast") {
        // 溜めてから前方へ放つ
        offsetZ += windup * 0.16 - strike * anim.lunge * 0.45;
        offsetY += windup * 0.12;
        leanX += windup * 0.22 - strike * 0.3;
        headX += -windup * 0.3 + strike * 0.25;
        for (const arm of rig.arms) {
          arm.root.rotation.z += arm.side * (windup * 0.7 - strike * 0.3);
          arm.root.rotation.x += windup * 0.4 + strike * 1.0;
        }
        for (const wing of rig.wings) wing.root.rotation.z -= wing.side * (windup + strike) * 0.35;
      } else {
        // 標準: 一度引いてから体ごと踏み込む
        offsetZ += windup * 0.3 - strike * anim.lunge * 0.95;
        offsetY += windup * 0.05 + strike * 0.1;
        leanX += windup * 0.3 - strike * 0.5;
        headX += -windup * 0.35 + strike * 0.4;
        hipY += windup * 0.2 - strike * 0.3;
        for (const arm of rig.arms) {
          arm.root.rotation.x += -windup * 0.8 + strike * 1.5;
          arm.root.rotation.z += arm.side * windup * 0.4;
          if (arm.lower && arm.lowerRest) arm.lower.rotation.x += windup * 0.5 - strike * 0.7;
        }
        for (const leg of rig.legs) leg.root.rotation.x += -windup * 0.2 + strike * 0.4;
        for (const wing of rig.wings) wing.root.rotation.z -= wing.side * strike * 0.5;
      }

      // 尾は溜めで逆へ張り、打ち抜きで振り抜かれる。あとはバネが引き継ぐ
      tailDriveX += windup * 0.16 - strike * 0.2;
      // 踏み込みの着地で沈む
      if (e >= w && e < w + step * 1.5) this.landSpring.velocity -= 7 - mass * 2;
    }

    // === 詠唱 =============================================================
    const castT = advance(this.castTrack, dt);
    if (castT !== null) {
      // 沈む(予備動作)→ 溜め上げて保持 → 放って余韻。
      // 山なりの正弦1本だと「上がって下がる」だけで、力を溜めた実感が出ない
      const brace = castT < 0.22 ? Math.sin((castT / 0.22) * Math.PI) : 0;
      const charge =
        castT < 0.22
          ? 0
          : castT < 0.7
            ? Math.pow(Math.sin(((castT - 0.22) / 0.48) * Math.PI * 0.5), 0.7)
            : Math.pow(1 - (castT - 0.7) / 0.3, 1.6);
      // 力を保持している間だけ震える。止まっているのに力んでいる、が読める
      const strain = castT > 0.3 && castT < 0.72 ? Math.sin(castT * Math.PI * 26) * 0.12 * charge : 0;
      const rise = charge - brace * 0.35;
      offsetY += rise * (rig.floats ? 0.38 : 0.24);
      leanX -= rise * 0.16 - brace * 0.12;
      headX -= rise * 0.3 - brace * 0.16;
      jawOpen = Math.max(jawOpen, charge * 0.4);
      for (const arm of rig.arms) {
        arm.root.rotation.z += arm.side * (rise * 1.0 + strain * 0.3);
        arm.root.rotation.x += rise * 0.5 + strain * 0.4;
        if (arm.lower && arm.lowerRest) arm.lower.rotation.x -= rise * 0.5;
      }
      for (const wing of rig.wings) {
        wing.root.rotation.z -= wing.side * (rise * 0.6 + strain * 0.25);
        wing.root.rotation.x -= rise * 0.2;
      }
      tailDriveX -= rise * 0.12;
      // 放った瞬間に体が下へ抜ける。撃ち終わりが「終わった」と読めるようになる
      if (castT > 0.7 && castT < 0.7 + step / this.castTrack.duration) {
        this.landSpring.velocity -= 6 - mass * 2;
      }
    }

    // === 被弾 =============================================================
    // 役割を2つに割る。ここ(hitTrack)は**速い震え**だけを持ち、
    // 「押されて動いた」という位置の移動は下のよろけのバネが受け持つ。
    // 以前は両方が同じくらいの強さで胴を前後させ、周期が違うために
    // 打ち消し合って、打たれても3センチしか動かない状態になっていた
    const hitT = advance(this.hitTrack, dt);
    if (hitT !== null) {
      const decay = Math.pow(1 - hitT, 2.6);
      const shake = Math.cos(hitT * Math.PI * 6);
      const power = 1 - mass * 0.5;
      const recoil = decay * shake * power;
      // 打たれた瞬間の食い込み。ここだけは短く鋭く出す
      const impact = Math.pow(1 - clamp01(hitT * 3.2), 2) * power;
      offsetZ += recoil * 0.07 + impact * 0.18;
      offsetY -= Math.abs(recoil) * 0.05;
      leanX += recoil * 0.16 + impact * 0.24;
      leanZ += recoil * 0.1 * this.deathTip;
      // 頭は体より軽いので、震えがいちばん大きく出る場所になる
      headX += recoil * 0.55 + impact * 0.3;
      headZ += recoil * 0.24;
      hipY += recoil * 0.16;
      jawOpen = Math.max(jawOpen, Math.abs(recoil) * 0.7);
      squash -= Math.abs(recoil) * 0.26;
      for (const arm of rig.arms) {
        arm.root.rotation.z += arm.side * Math.abs(recoil) * 0.5;
        arm.root.rotation.x -= recoil * 0.4;
      }
      for (const wing of rig.wings) wing.root.rotation.z -= wing.side * Math.abs(recoil) * 0.6;
      tailDriveX += recoil * 0.22;
    }

    // よろけ。振動が収まった後も、押された分を踏み止まって戻すのに時間がかかる。
    // 「打たれて動いた」ことは、震えではなくこの位置の移動でしか伝わらない
    const stagger = this.staggerSpring.step(0, 1.25 - mass * 0.35, 0.46 + mass * 0.2, step);
    const staggerSide = this.staggerSideSpring.step(0, 1.45 - mass * 0.4, 0.5 + mass * 0.18, step);
    if (Math.abs(stagger) > 1e-4 || Math.abs(staggerSide) > 1e-4) {
      offsetZ += stagger * 0.7;
      offsetX += staggerSide * 0.5;
      // のけぞってから戻る。上体は足より遅れるので、腰より胴の方が深く振れる
      leanX += stagger * 0.45;
      leanZ += staggerSide * 0.5;
      hipZ -= staggerSide * 0.22;
      offsetY -= Math.abs(stagger) * 0.08;
      for (const leg of rig.legs) {
        // 押された向きへ脚を送って踏み止まる。前脚と後脚で送る向きが逆になる
        leg.root.rotation.x += stagger * (leg.front ? 0.6 : -0.5);
        leg.root.rotation.z += leg.side * staggerSide * 0.35;
        if (leg.lower && leg.lowerRest) leg.lower.rotation.x -= stagger * 0.45;
      }
      for (const arm of rig.arms) arm.root.rotation.x -= stagger * 0.6;
      tailDriveX -= stagger * 0.35;
      tailDriveY += staggerSide * 0.4;
    }

    // === 撃破 =============================================================
    if (this.dying && this.deathProgress < 1) {
      // 重いものほどゆっくり傾き始め、いったん傾けば速く落ちる
      this.deathProgress = Math.min(1, this.deathProgress + dt * (1.15 - mass * 0.35));
    }
    const death = this.deathProgress;
    // 倒れ込みは腰から下ではなく体全体が回る。leanX は胴と腰で分け合う作りなので、
    // そこへ足すと角度が半分に薄まり「崩れた」ではなく「傾いた」で終わる
    let coreTilt = 0;
    if (death > 0) {
      // 崩れる: 膝が抜ける(速い)→ 溜め(一拍ぶら下がる)→ 倒れる(加速)→ 着地
      const buckle = clamp01(death / 0.26);
      const fall = Math.pow(clamp01((death - 0.22) / 0.78), 1.9);
      const tip = this.deathTip;
      offsetY -= (buckle * 0.16 + fall * (rig.floats ? 0.55 : 0.4)) * this.rig.height * 0.28;
      leanX += buckle * 0.18 + fall * 0.95;
      leanZ += fall * 0.5 * tip;
      coreTilt += fall * 0.95;
      headX += buckle * 0.35 + fall * 0.7;
      headZ += fall * 0.35 * tip;
      hipZ -= fall * 0.2 * tip;
      jawOpen = Math.max(jawOpen, buckle * 0.55);
      // 地面に着く瞬間に一度だけ突き上げる。ここで尾も耳も一斉に跳ねる
      if (!this.deathLanded && fall > 0.82) {
        this.deathLanded = true;
        this.landSpring.velocity -= 15 - mass * 4;
      }
      // 粘体は倒れるのではなく、その場で潰れて広がる
      squash -= buckle * 0.2 + fall * 0.3;
      for (const leg of rig.legs) {
        leg.root.rotation.x += buckle * 0.5 + fall * 0.7;
        if (leg.lower && leg.lowerRest) leg.lower.rotation.x -= buckle * 0.9 + fall * 0.7;
      }
      for (const arm of rig.arms) {
        arm.root.rotation.x -= buckle * 0.3 + fall * 0.5;
        arm.root.rotation.z += arm.side * fall * 0.3;
      }
      for (const wing of rig.wings) wing.root.rotation.z += wing.side * fall * 0.7;
      tailDriveX += buckle * 0.3 + fall * 0.3;
    }

    // === 沈み込み =========================================================
    // 着地・被弾・踏み下ろしで押し込まれた分。バネなので自分で戻り、行き過ぎる
    const sink = this.landSpring.step(0, 2.6 - mass * 1.1, 0.42 + mass * 0.16, step);
    offsetY += sink * 0.09;
    squash += sink * 0.3;
    // 沈んだ勢いは脚にも通す。膝が折れて受け止め、伸びて戻る
    for (const leg of rig.legs) {
      leg.root.rotation.x -= sink * 0.16;
      if (leg.lower && leg.lowerRest) leg.lower.rotation.x += sink * 0.3;
    }

    // === 本体の速度 =======================================================
    // 重心と傾きの変化量を平滑化して持つ。これが二次的な動きの入力になる
    const rawVx = (offsetX - this.previousOffset.x) / step;
    const rawVy = (offsetY - this.previousOffset.y) / step;
    const rawVz = (offsetZ - this.previousOffset.z) / step;
    const rawPitch = (leanX - this.previousLeanX) / step;
    this.previousOffset.set(offsetX, offsetY, offsetZ);
    this.previousLeanX = leanX;
    this.previousLeanZ = leanZ;
    // 速度は攻撃・被弾で跳ねるので頭打ちにする(暴れると布が突き抜ける)
    const smooth = Math.min(1, step * 22);
    this.bodyVelocity.x += (clamp(rawVx, -8, 8) - this.bodyVelocity.x) * smooth;
    this.bodyVelocity.y += (clamp(rawVy, -8, 8) - this.bodyVelocity.y) * smooth;
    this.bodyVelocity.z += (clamp(rawVz, -8, 8) - this.bodyVelocity.z) * smooth;
    this.bodyPitchRate += (clamp(rawPitch, -12, 12) - this.bodyPitchRate) * smooth;

    // === 二次的な動き =====================================================
    // 重い個体は低い周波数で大きくうねり、軽い個体は速く細かく震える。
    // 減衰比を1より十分小さく取ることで、目標を追い越してから戻る
    const swingFreq = 1.85 - mass * 1.0;
    const swingDamp = 0.26 + mass * 0.2;
    // 本体の速度から遅れ角を作る係数。待機の遅い動きでも見える強さにし、
    // 攻撃で跳ねた分は lag() の頭打ちで抑える
    const drag = 0.16;
    const lagZ = lag(this.bodyVelocity.z, drag, 0.42);
    const lagX = lag(this.bodyVelocity.x, drag, 0.42);
    const lagY = lag(this.bodyVelocity.y, drag, 0.32);

    // 尾: 付け根に本体の動きを入れ、節ごとにバネで受け渡す。
    // 先の節ほど遅れて、追い越して戻る。これが「鞭のようにしなる」の正体
    {
      let driveY = tailDriveY + lagX;
      let driveX = tailDriveX + lagZ + lagY * 0.6 + this.bodyPitchRate * 0.02;
      for (let i = 0; i < rig.tail.length; i++) {
        const joint = rig.tail[i];
        const spring = this.tailSprings[i];
        const freq = swingFreq * Math.pow(0.9, i);
        const ry = spring.a.step(driveY, freq, swingDamp, step);
        const rx = spring.b.step(driveX, freq, swingDamp * 1.05, step);
        joint.group.rotation.set(joint.rest.x + rx, joint.rest.y + ry, joint.rest.z);
        // 次の節は、いま振れた角度を目標として受け取る(波が外へ伝わる)
        driveY = ry * 0.92;
        driveX = rx * 0.92;
      }
    }

    // 翼: 前腕(第2関節)が付け根に遅れてしなる。膜が風を受けている感じが出る
    for (let i = 0; i < rig.wings.length; i++) {
      const wing = rig.wings[i];
      const spring = this.wingSprings[i];
      const lead = wing.root.rotation.z - wing.rootRest.z;
      const trail = spring.a.step(-lead * 0.5 + lagY * 0.25 * wing.side, swingFreq * 1.15, swingDamp + 0.06, step);
      const fold = spring.b.step(lagZ * 1.1 - this.bodyPitchRate * 0.02, swingFreq * 1.1, swingDamp + 0.06, step);
      if (wing.lower && wing.lowerRest) {
        wing.lower.rotation.set(wing.lowerRest.x + fold, wing.lowerRest.y, wing.lowerRest.z + trail);
      } else {
        wing.root.rotation.z += trail * 0.35;
        wing.root.rotation.x += fold * 0.5;
      }
    }

    // 布: 重力で戻ろうとするので、揺れの中心は常に休め姿勢。
    // 本体が動いた向きと逆へ流れ、止まった後もしばらく残る
    for (let i = 0; i < rig.cloth.length; i++) {
      const cloth = rig.cloth[i];
      const spring = this.clothSprings[i];
      const freq = swingFreq * 0.72;
      const damp = 0.2;
      const swayX = spring.a.step(
        (lagZ * 1.4 - lagY * 0.9 + Math.sin(T * tailHz * 0.63 + cloth.phase) * 0.13 * alive) * cloth.amount,
        freq,
        damp,
        step,
      );
      const swayZ = spring.b.step(
        (-lagX * 1.6 + Math.sin(T * tailHz * 0.47 + cloth.phase * 1.7) * 0.105 * alive) * cloth.amount,
        freq * 0.9,
        damp,
        step,
      );
      cloth.group.rotation.set(cloth.rest.x + swayX, cloth.rest.y, cloth.rest.z + swayZ);
    }

    // 耳・鰭・浮遊する刃など、登録されていない可動部。
    //
    // 本体の速度だけを入力にしていた時は、待機中の重心移動が遅すぎて
    // 遅れ角が0.005ラジアン(0.3度)にしかならず、一度も動いて見えなかった。
    // 垂れている物・浮いている物は「本体が止まっていても揺れている」のが
    // 自然なので、部位ごとに位相をずらした自前の波を必ず足す
    for (let i = 0; i < rig.followers.length; i++) {
      const follower = rig.followers[i];
      const spring = this.followerSprings[i];
      const freq = swingFreq * 1.25;
      const damp = 0.24 + mass * 0.12;
      const idleX = Math.sin(T * tailHz * 0.9 + follower.phase) * 0.1 * alive;
      const idleZ = Math.sin(T * tailHz * 0.66 + follower.phase * 1.6) * 0.07 * follower.side * alive;
      const swayX = spring.a.step((lagZ + lagY * 0.8 + idleX) * follower.amount, freq, damp, step);
      const swayZ = spring.b.step((-lagX * 1.2 + idleZ) * follower.amount, freq * 0.95, damp, step);
      follower.group.rotation.set(follower.rest.x + swayX, follower.rest.y, follower.rest.z + swayZ);
    }

    // 手足の肉。腕は体の動きに遅れて振られる(振り出しの主導は上のモーション側)
    for (let i = 0; i < rig.arms.length; i++) {
      const arm = rig.arms[i];
      const spring = this.limbSprings[i];
      arm.root.rotation.x += spring.a.step(lagZ * 1.1 + lagY * 0.8, swingFreq * 1.4, swingDamp + 0.12, step);
      arm.root.rotation.z += arm.side * spring.b.step(-lagX * 0.9, swingFreq * 1.4, swingDamp + 0.12, step);
    }

    // === 視線 =============================================================
    // 相手を見据えるのが基本。数秒おきに視線を外し、また戻す。
    // 行動中・狙われている時は目を離さない(緊張が動きに出る)
    this.gazeTimer -= dt;
    if (this.gazeTimer <= 0) {
      this.gazeTimer = 1.4 + Math.random() * 3.4;
      this.gazeYaw = (Math.random() - 0.5) * 0.6;
      this.gazePitch = (Math.random() - 0.5) * 0.24;
    }
    const locked = busy || this.targeted || this.activeGlow > 0.35 || death > 0;
    const gazeGain = headGain * alive;
    const wantYaw = locked ? 0 : this.gazeYaw * gazeGain;
    const wantPitch = locked ? -0.04 * gazeGain : this.gazePitch * gazeGain;
    // 頭は体より遅れて向きを変える。素早く振ると生き物の反射に見える
    headY += this.headSpring.a.step(wantYaw, locked ? 2.6 : 1.1, 0.85, step);
    headX += this.headSpring.b.step(wantPitch, locked ? 2.6 : 1.1, 0.85, step);
    // 体が前傾・横倒しになっても、頭は水平と狙いを保とうとする。
    // これが無いと、踏み込みで顔が地面や空を向いてしまい、狙いが読めない
    const gazeLock = (0.55 + this.activeGlow * 0.2) * (1 - death);
    headX -= leanX * gazeLock;
    headZ -= leanZ * gazeLock * 0.8;

    // 足を地面に残す。体が横や前後へ流れた分だけ脚を逆へ倒すと、
    // 足裏が滑らずに体重だけが動いて見える。踏み込みで大きく移動する時は
    // 実際に足も運んでいるので、lag() で補正を頭打ちにして効かせすぎない
    if (!rig.floats && rig.legs.length > 0) {
      const plantZ = lag(offsetX, 1, 0.11);
      const plantX = lag(offsetZ, 1, 0.14);
      for (const leg of rig.legs) {
        leg.root.rotation.z -= plantZ * 0.6;
        leg.root.rotation.x -= plantX * 0.5;
      }
    }

    // === 姿勢の確定 =======================================================
    rig.core.position.set(offsetX, offsetY, offsetZ);
    rig.core.rotation.set(leanX * 0.45 + coreTilt, 0, leanZ);
    rig.pelvis.rotation.set(rig.pelvisRest.x, rig.pelvisRest.y + hipY, rig.pelvisRest.z + hipZ);
    // 体積を保つ(縦に伸びた分だけ横が細る)。
    // 骨格の原点を接地面に置いてあるので、伸縮しても足元が浮かない。
    //
    // 沈み込み(sink)は粘体以外にも必ず効かせる。以前は骨を持つ個体に対して
    // 上下 0.013 単位しか動かず、着地も被弾も体で受け止めて見えなかった。
    // 縦の潰れは「重さが乗った」を最も安く出せる表現なので、全員に配る
    const stretch = clamp((anim.squash > 0 ? squash * anim.squash : 0) + sink * 0.13, -0.42, 0.5);
    if (Math.abs(stretch) > 1e-4 || rig.core.scale.y !== 1) {
      const lateral = 1 / Math.sqrt(1 + stretch);
      rig.core.scale.set(lateral, 1 + stretch, lateral);
    }
    // 腰を捻ったぶん、胴は逆へ返す。全身が一枚板で回らないようにする
    rig.torso.rotation.x += leanX * 0.55;
    rig.torso.rotation.y = rig.torsoRest.y - hipY * 0.7;
    rig.torso.rotation.z = rig.torsoRest.z - hipZ * 0.55 + Math.sin(T * breathHz * 0.8) * 0.038 * swayGain * alive;
    rig.head.rotation.set(headX, headY, headZ);
    if (rig.jaw) rig.jaw.rotation.x = rig.jawRest.x - jawOpen * 0.5;

    // === 光まわり =========================================================
    this.activeGlow += (this.targetActiveGlow - this.activeGlow) * Math.min(1, dt * 7);
    // 素早く消す。長く残ると、全体攻撃で全員が同時に光った時に
    // 画面がしばらく白いままになる
    this.flash = Math.max(0, this.flash - dt * 9);

    const fade = 1 - death;
    const sigilMaterial = this.sigilMesh.material as THREE.MeshBasicMaterial;
    // 対象に選ばれている間は、脈打たせて紋様を警告色へ寄せる。
    // 行動中の光り方と混ざらないよう、点滅の速さを変えてある
    const targetPulse = this.targeted ? 0.55 + Math.sin(elapsed * 6.5) * 0.25 : 0;
    sigilMaterial.color.copy(this.targeted ? TARGET_SIGIL_COLOR : this.theme.ground);
    sigilMaterial.opacity = (0.26 + this.activeGlow * 0.55 + targetPulse + Math.sin(elapsed * 2.2) * 0.03) * fade;
    this.sigilMesh.rotation.z += dt * (0.16 + this.activeGlow * 0.65);
    this.sigilMesh.scale.setScalar(1 + this.activeGlow * 0.06);

    const auraMaterial = this.auraSprite.material as THREE.SpriteMaterial;
    auraMaterial.opacity = (0.22 + this.activeGlow * 0.3 + Math.sin(elapsed * 1.8 + this.phase) * 0.03) * fade;
    (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;

    this.uniforms.uTime.value = elapsed;
    this.uniforms.uFlash.value = this.flash;
    this.uniforms.uActive.value = Math.max(this.activeGlow, this.targeted ? 0.85 : 0);
    this.uniforms.uWound.value = 1 - this.hpRatio;
    this.uniforms.uDissolve.value = death;
  }

  dispose(): void {
    this.kit.dispose();
    for (const item of this.disposables) item.dispose();
    this.tmpVector.set(0, 0, 0);
  }
}
