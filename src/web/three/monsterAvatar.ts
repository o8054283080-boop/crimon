import * as THREE from "three";
import { Element } from "../../core/element.js";
import { CreatureKit } from "./creature/kit.js";
import { CreatureRig, finalizeRig } from "./creature/rig.js";
import { applyTemplateTraits, builderFor } from "./creature/roles.js";
import { CreatureUniforms, SurfaceSet, createCreatureUniforms, paletteFor } from "./creature/surface.js";
import { ElementTheme, themeFor } from "./elementTheme.js";
import { radialGlowTexture, shadowTexture, sigilTexture } from "./textures.js";

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

/** 立ち上がりが速く、余韻を引きずる打撃のカーブ */
function strikeCurve(t: number): number {
  if (t < 0.3) return 0;
  return Math.pow(Math.sin(((t - 0.3) / 0.7) * Math.PI), 0.55);
}

/** 溜めの山。踏み込みの直前に一度引く動き */
function windupCurve(t: number): number {
  if (t > 0.36) return 0;
  return Math.sin((t / 0.36) * Math.PI);
}

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
  private readonly shadowMesh: THREE.Mesh;
  private readonly disposables: { dispose: () => void }[] = [];

  private readonly phase = Math.random() * Math.PI * 2;
  private readonly attackTrack = newTrack();
  private readonly hitTrack = newTrack();
  private readonly castTrack = newTrack();

  /** 前フレームの重心。尾や布を遅れて振るための慣性計算に使う */
  private readonly previousOffset = new THREE.Vector3();
  private readonly lag = new THREE.Vector3();
  private deathProgress = 0;
  private dying = false;
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

    const builder = builderFor(role);
    builder.build(this.kit, this.rig);
    // 役割で組んだ骨格に、種別固有の特徴(翼・光輪・羽根飾りなど)を足す
    applyTemplateTraits(templateId, this.kit, this.rig);
    finalizeRig(this.rig, this.kit, builder.height, builder.float);
    this.uniforms.uHeight.value = this.rig.height;

    // 正面(-Z)を敵へ向けたうえで、少しだけ斜に構えて立体感を出す。
    // 四足のように前後へ長い骨格は、正面からだと胴が見えないので深く構える
    this.rig.root.rotation.y = (facing > 0 ? 0 : Math.PI) + 0.3 + this.rig.yawBias;
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
    target.y += this.rig.height * 0.7;
    return target;
  }

  /** 行動順が回ってきた時のハイライト */
  setActive(active: boolean): void {
    this.targetActiveGlow = active ? 1 : 0;
  }

  /** HP割合。低いほど表面の亀裂が強く光る */
  setHpRatio(ratio: number): void {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
  }

  playAttack(): void {
    trigger(this.attackTrack, 0.66);
  }

  /** 支援・バフスキルなど、その場で力を溜める演出 */
  playCast(): void {
    trigger(this.castTrack, 0.8);
  }

  playHit(): void {
    trigger(this.hitTrack, 0.4);
    this.flash = 1;
  }

  playDeath(): void {
    this.dying = true;
  }

  /** 撃破状態から復帰させる(復活・再挑戦時) */
  revive(): void {
    this.dying = false;
    this.deathProgress = 0;
  }

  isDying(): boolean {
    return this.dying;
  }

  update(dt: number, elapsed: number): void {
    const rig = this.rig;
    const anim = rig.anim;
    const t = elapsed * anim.idleSpeed + this.phase;

    // === 待機モーション ===================================================
    // 呼吸。胸が膨らみ、わずかに反る
    const breath = Math.sin(t * 1.55);
    const breathStrength = anim.breath * (0.55 + this.hpRatio * 0.45);
    rig.torso.rotation.set(
      rig.torsoRest.x + breath * 0.035 * breathStrength,
      rig.torsoRest.y,
      rig.torsoRest.z + Math.sin(t * 0.73) * 0.02 * anim.sway,
    );
    rig.torso.scale.set(1 + breath * 0.022 * breathStrength, 1 + breath * 0.03 * breathStrength, 1 + breath * 0.022 * breathStrength);

    // 全身の上下動と体重移動
    let offsetY = Math.sin(t * (rig.floats ? 0.9 : 1.55)) * anim.bob;
    let offsetZ = 0;
    let offsetX = Math.sin(t * 0.62) * 0.02 * anim.sway;
    let leanX = 0;
    let leanZ = Math.sin(t * 0.62) * 0.012 * anim.sway;

    // 首と頭。生き物らしさが一番出るので、周期をずらして複数の波を重ねる
    rig.neck.rotation.set(
      rig.neckRest.x + Math.sin(t * 1.55 + 0.6) * 0.03 * anim.headSway,
      rig.neckRest.y + Math.sin(t * 0.51) * 0.05 * anim.headSway,
      rig.neckRest.z,
    );
    let headX = rig.headRest.x + Math.sin(t * 1.21 + 1.1) * 0.05 * anim.headSway;
    let headY = rig.headRest.y + Math.sin(t * 0.67) * 0.13 * anim.headSway;
    let headZ = rig.headRest.z + Math.sin(t * 0.89) * 0.04 * anim.headSway;
    let jawOpen = 0;

    // 尾: 根元から先端へ遅れて伝わる波
    for (let i = 0; i < rig.tail.length; i++) {
      const joint = rig.tail[i];
      const delay = i * 0.62;
      joint.group.rotation.set(
        joint.rest.x + Math.sin(t * 1.1 - delay) * 0.05 * anim.tailWave,
        joint.rest.y + Math.sin(t * 1.45 - delay) * 0.13 * anim.tailWave,
        joint.rest.z,
      );
    }

    // 翼: 羽ばたき
    for (const wing of rig.wings) {
      const flap = Math.sin(t * 1.25) * anim.wingFlap;
      wing.root.rotation.set(
        wing.rootRest.x + Math.sin(t * 1.25 + 0.9) * 0.12 * anim.wingFlap,
        wing.rootRest.y,
        wing.rootRest.z - wing.side * flap * 0.55,
      );
    }

    // 手足の微動
    for (const arm of rig.arms) {
      arm.root.rotation.set(
        arm.rootRest.x + Math.sin(t * 1.05 + arm.phase) * 0.06,
        arm.rootRest.y,
        arm.rootRest.z + arm.side * Math.sin(t * 0.83 + arm.phase) * 0.04,
      );
      if (arm.lower && arm.lowerRest) {
        arm.lower.rotation.x = arm.lowerRest.x + Math.sin(t * 1.05 + arm.phase + 0.8) * 0.05;
      }
    }
    for (const leg of rig.legs) {
      leg.root.rotation.x = leg.rootRest.x + Math.sin(t * 0.78 + leg.phase) * 0.025;
    }

    // 布は本体より遅れて揺れる
    for (const cloth of rig.cloth) {
      cloth.group.rotation.set(
        cloth.rest.x + Math.sin(t * 0.95 + cloth.phase) * 0.1 * cloth.amount,
        cloth.rest.y + Math.sin(t * 0.71 + cloth.phase) * 0.08 * cloth.amount,
        cloth.rest.z + Math.sin(t * 1.13 + cloth.phase) * 0.06 * cloth.amount,
      );
    }

    for (const spinner of rig.spinners) {
      spinner.object.rotation[spinner.axis] += dt * spinner.speed;
    }
    for (const orbiter of rig.orbiters) {
      const angle = elapsed * orbiter.speed + orbiter.phase;
      orbiter.object.position.set(
        Math.cos(angle) * orbiter.radius,
        orbiter.height + Math.sin(angle * 1.6 + orbiter.phase) * 0.18,
        Math.sin(angle) * orbiter.radius * Math.cos(orbiter.tilt),
      );
      orbiter.object.rotation.y += dt * orbiter.spin;
      orbiter.object.rotation.x += dt * orbiter.spin * 0.6;
    }

    // === 攻撃 =============================================================
    const attackT = advance(this.attackTrack, dt);
    if (attackT !== null) {
      const windup = windupCurve(attackT);
      const strike = strikeCurve(attackT);
      jawOpen = Math.max(jawOpen, strike * 0.9);

      if (anim.attack === "slam") {
        // 振り上げてから叩きつける。体は前へ出ず、上下に大きく動く
        offsetY += windup * 0.16 - strike * 0.1;
        offsetZ -= strike * anim.lunge * 0.5;
        leanX += -windup * 0.18 + strike * 0.42;
        headX += -windup * 0.25 + strike * 0.45;
        for (const arm of rig.arms) {
          arm.root.rotation.x += -windup * 1.5 + strike * 1.7;
          arm.root.rotation.z += arm.side * windup * 0.5;
          if (arm.lower && arm.lowerRest) arm.lower.rotation.x += -windup * 0.9 + strike * 0.6;
        }
      } else if (anim.attack === "dash") {
        // 小さく跳ねて突っ込む
        offsetZ += windup * 0.2 - strike * anim.lunge * 1.1;
        offsetY += arc(attackT) * 0.28;
        leanX += -strike * 0.5;
        headY += strike * 0.4;
        for (const arm of rig.arms) arm.root.rotation.x += strike * 1.3;
      } else if (anim.attack === "pounce") {
        // 四足の跳びかかり。腕を振るのではなく、体を沈めてから前へ跳ぶ。
        // 着地の頭突き・噛みつきに重心が乗るよう、頭を大きく振り下ろす
        offsetY += -windup * 0.1 + arc(attackT) * 0.3;
        offsetZ += windup * 0.24 - strike * anim.lunge * 1.05;
        leanX += windup * 0.24 - strike * 0.32;
        headX += -windup * 0.4 + strike * 0.5;
        for (const leg of rig.legs) {
          // 前脚は伸ばして掴みかかり、後脚は蹴り出して畳む
          leg.root.rotation.x += leg.front ? -windup * 0.5 + strike * 1.1 : windup * 0.4 - strike * 0.7;
          if (leg.lower && leg.lowerRest) leg.lower.rotation.x += leg.front ? windup * 0.4 - strike * 0.6 : -windup * 0.3;
        }
        for (const wing of rig.wings) wing.root.rotation.z -= wing.side * (windup * 0.5 + strike * 0.3);
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
        for (const arm of rig.arms) {
          arm.root.rotation.x += -windup * 0.8 + strike * 1.5;
          arm.root.rotation.z += arm.side * windup * 0.4;
          if (arm.lower && arm.lowerRest) arm.lower.rotation.x += windup * 0.5 - strike * 0.7;
        }
        for (const leg of rig.legs) leg.root.rotation.x += -windup * 0.2 + strike * 0.4;
        for (const wing of rig.wings) wing.root.rotation.z -= wing.side * strike * 0.5;
      }

      // 尾は体の動きに遅れて振られる
      for (let i = 0; i < rig.tail.length; i++) {
        rig.tail[i].group.rotation.x += (windup * 0.12 - strike * 0.16) * (1 + i * 0.25);
      }
    }

    // === 詠唱 =============================================================
    const castT = advance(this.castTrack, dt);
    if (castT !== null) {
      const rise = arc(castT);
      offsetY += rise * (rig.floats ? 0.38 : 0.24);
      leanX -= rise * 0.16;
      headX -= rise * 0.3;
      jawOpen = Math.max(jawOpen, rise * 0.4);
      for (const arm of rig.arms) {
        arm.root.rotation.z += arm.side * rise * 1.0;
        arm.root.rotation.x += rise * 0.5;
        if (arm.lower && arm.lowerRest) arm.lower.rotation.x -= rise * 0.5;
      }
      for (const wing of rig.wings) {
        wing.root.rotation.z -= wing.side * rise * 0.6;
        wing.root.rotation.x -= rise * 0.2;
      }
      for (let i = 0; i < rig.tail.length; i++) rig.tail[i].group.rotation.x -= rise * 0.1;
    }

    // === 被弾 =============================================================
    const hitT = advance(this.hitTrack, dt);
    if (hitT !== null) {
      const recoil = Math.sin(hitT * Math.PI * 3) * (1 - hitT);
      offsetZ += recoil * 0.3;
      offsetY -= Math.abs(recoil) * 0.05;
      leanX += recoil * 0.4;
      headX += recoil * 0.55;
      headZ += recoil * 0.2;
      jawOpen = Math.max(jawOpen, Math.abs(recoil) * 0.7);
      for (const arm of rig.arms) {
        arm.root.rotation.z += arm.side * Math.abs(recoil) * 0.5;
        arm.root.rotation.x -= recoil * 0.4;
      }
      for (const leg of rig.legs) leg.root.rotation.x -= recoil * 0.25;
      for (const wing of rig.wings) wing.root.rotation.z -= wing.side * Math.abs(recoil) * 0.6;
      for (let i = 0; i < rig.tail.length; i++) rig.tail[i].group.rotation.x += recoil * 0.2;
    }

    // === 撃破 =============================================================
    if (this.dying && this.deathProgress < 1) {
      this.deathProgress = Math.min(1, this.deathProgress + dt * 0.95);
    }
    const death = this.deathProgress;
    if (death > 0) {
      const fall = Math.min(1, death * 1.6);
      offsetY -= fall * (rig.floats ? 0.5 : 0.35) * this.rig.height * 0.28;
      leanX += fall * 0.5;
      leanZ += fall * 0.35;
      headX += fall * 0.7;
      jawOpen = Math.max(jawOpen, fall * 0.5);
      for (const leg of rig.legs) {
        leg.root.rotation.x += fall * 0.9;
        if (leg.lower && leg.lowerRest) leg.lower.rotation.x -= fall * 1.4;
      }
      for (const arm of rig.arms) {
        arm.root.rotation.x -= fall * 0.6;
        arm.root.rotation.z += arm.side * fall * 0.3;
      }
      for (const wing of rig.wings) wing.root.rotation.z += wing.side * fall * 0.7;
      for (let i = 0; i < rig.tail.length; i++) rig.tail[i].group.rotation.x += fall * 0.25;
    }

    // === 姿勢の確定 =======================================================
    rig.core.position.set(offsetX, offsetY, offsetZ);
    rig.core.rotation.set(leanX * 0.45, 0, leanZ);
    rig.torso.rotation.x += leanX * 0.55;
    rig.head.rotation.set(headX, headY, headZ);
    if (rig.jaw) rig.jaw.rotation.x = rig.jawRest.x - jawOpen * 0.5;

    // === 光まわり =========================================================
    this.activeGlow += (this.targetActiveGlow - this.activeGlow) * Math.min(1, dt * 7);
    // 素早く消す。長く残ると、全体攻撃で全員が同時に光った時に
    // 画面がしばらく白いままになる
    this.flash = Math.max(0, this.flash - dt * 9);

    const fade = 1 - death;
    const sigilMaterial = this.sigilMesh.material as THREE.MeshBasicMaterial;
    sigilMaterial.opacity = (0.26 + this.activeGlow * 0.55 + Math.sin(elapsed * 2.2) * 0.03) * fade;
    this.sigilMesh.rotation.z += dt * (0.16 + this.activeGlow * 0.65);
    this.sigilMesh.scale.setScalar(1 + this.activeGlow * 0.06);

    const auraMaterial = this.auraSprite.material as THREE.SpriteMaterial;
    auraMaterial.opacity = (0.22 + this.activeGlow * 0.3 + Math.sin(elapsed * 1.8 + this.phase) * 0.03) * fade;
    (this.shadowMesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;

    this.uniforms.uTime.value = elapsed;
    this.uniforms.uFlash.value = this.flash;
    this.uniforms.uActive.value = this.activeGlow;
    this.uniforms.uWound.value = 1 - this.hpRatio;
    this.uniforms.uDissolve.value = death;
  }

  dispose(): void {
    this.kit.dispose();
    for (const item of this.disposables) item.dispose();
    this.tmpVector.set(0, 0, 0);
  }
}
