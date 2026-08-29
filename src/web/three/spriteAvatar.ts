import * as THREE from "three";
import { Element } from "../../core/element.js";
import { ElementTheme, themeFor } from "./elementTheme.js";
import { ELEMENT_TINT, SPRITE_TINT, isElementSpecific, loadSpriteTexture, spriteUrlFor } from "./spriteArt.js";

/**
 * 2Dの絵で立つモンスター。
 *
 * `MonsterAvatar`(3Dモデル)と**同じ約束事**を持つので、戦闘画面から見ると
 * どちらが立っているかを気にせず扱える(avatarFactory.ts が選ぶ)。
 *
 * ## なぜ板1枚なのか
 *
 * 3Dのモンスターは1体あたり36回前後の描画を使い、本体だけで288回あった。
 * 実機で31.5fpsしか出ておらず、造形の作り直しはどのみち必要だった。
 * 板は**1体1回**で描ける。舞台・光・エフェクト・カメラはThree.jsのまま残るので、
 * 演出を作り直さずに本体だけを軽くできる。
 *
 * ## 動きは「1枚の絵を変形させて」作る
 *
 * 依頼主の要望は待機・攻撃・被弾・サポートの4モーション。
 * **「動きがないと安っぽい」— そのとおりなので、静止画を置くだけにはしない。**
 *
 * 絵は1枚でも、板を縦横に潰し・伸ばし・撓ませれば動く。
 *   - 待機: 呼吸で潰れて伸びる / 上下に漂う / 上ほど遅れて撓む(ゼリーの追従)
 *   - 攻撃: 沈んで溜める → 踏み込んで伸びる → 当たった瞬間に潰れる → 揺り戻す
 *   - 被弾: 後ろへ流されてのけぞる / 白く光る / バネで戻る
 *   - サポート: 浮き上がって縦に伸びる / 属性色の光が乗る
 *
 * **足元(y=0)は動かさず、上ほど大きく動かす。** これを守ると、どれだけ
 * 変形させても接地が外れない。逆にすると宙に浮いた紙が揺れているだけに見える。
 *
 * 潰した時は横へ逃がして体積を保つ(`1/sqrt(squash)`)。
 * ここを省くと「縦に縮んだ絵」にしか見えず、弾力が出ない。
 */

/** 役割ごとの背丈。3Dの骨格(creature/roles.ts)と同じ値を使い、並べた時の格を揃える */
const ROLE_HEIGHT: Record<string, number> = {
  アタッカー: 2.2,
  ディフェンダー: 2.45,
  ヒーラー: 2.25,
  サポート: 2.05,
  デバッファー: 2.25,
  バランス型: 2.35,
  ボス: 2.95,
  素材: 1.35,
};

/** 地面から浮かせる高さ。妖精や結晶は足を着けない */
const ROLE_FLOAT: Record<string, number> = {
  アタッカー: 0,
  ディフェンダー: 0,
  ヒーラー: 0.32,
  サポート: 0.42,
  デバッファー: 0,
  バランス型: 0,
  ボス: 0,
  素材: 0.05,
};

/** 役割ではなく種族で浮くもの(3D側の rig.floats = true と揃える) */
const FLOATING_TEMPLATES = new Set(["fairy", "wisp", "ancient_demon", "ancient_crystal", "ancient_crystal_curse"]);

export interface SpriteAvatarOptions {
  element: Element;
  role: string;
  templateId: string;
  /** PLAYER側は+1(手前)、ENEMY側は-1(奥) */
  facing: 1 | -1;
}

/** 攻撃の3段(溜め・打ち抜き・余韻)の長さ。秒で持つ */
const ATTACK_WINDUP = 0.16;
const ATTACK_STRIKE = 0.18;
const ATTACK_RECOVER = 0.32;
const ATTACK_TOTAL = ATTACK_WINDUP + ATTACK_STRIKE + ATTACK_RECOVER;

const HIT_DURATION = 0.46;
const CAST_DURATION = 0.72;
const DEATH_DURATION = 0.9;

/** 0→1→0 の山。0.5でちょうど1になる */
function arch(t: number): number {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
}

/** 減衰する振動。被弾のよろけ戻りに使う */
function damped(t: number, cycles: number, damping: number): number {
  return Math.sin(t * Math.PI * 2 * cycles) * Math.exp(-t * damping);
}

export class SpriteAvatar {
  readonly root = new THREE.Group();
  readonly theme: ElementTheme;

  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  private readonly hitProxy: THREE.Mesh;
  private readonly height: number;
  private readonly floatHeight: number;
  private readonly facing: 1 | -1;

  /** シェーダへ渡す値。onBeforeCompile で差し込んだ uniform をここから触る */
  private readonly uniforms = {
    uSquash: { value: 1 },
    uBend: { value: 0 },
    uHeight: { value: 1 },
    uTintHue: { value: 0 },
    uTintSat: { value: 1 },
    uTintAmount: { value: 0 },
    uFlash: { value: 0 },
    uGlow: { value: 0 },
    uGlowColor: { value: new THREE.Color(1, 1, 1) },
    uDim: { value: 0 },
  };

  /** 位相をばらす。全員が同じ拍で呼吸すると機械に見える */
  private idleClock = Math.random() * 40;
  private readonly bobPhase = Math.random() * Math.PI * 2;

  private attackTimer = -1;
  private hitTimer = -1;
  private castTimer = -1;
  private deathTimer = -1;
  private dead = false;

  /** 相手チームのいる向き(正規化済み)。踏み込む先とのけぞる先を決める */
  private readonly foeDir = new THREE.Vector3(0, 0, -1);
  private slotX = 0;
  private slotZ = 0;

  private activeGlow = 0;
  private targetGlow = 0;
  private targeted = false;
  private hpRatio = 1;

  /** 倒れる向き。全員が同じ方へ崩れると作り物に見える */
  private readonly deathTip = Math.random() < 0.5 ? -1 : 1;

  private readonly disposables: { dispose: () => void }[] = [];

  constructor(options: SpriteAvatarOptions) {
    const { element, role, templateId, facing } = options;
    this.facing = facing;
    this.theme = themeFor(element);

    const url = spriteUrlFor(templateId, element, "idle");
    if (!url) throw new Error(`2Dの絵が無い: ${templateId}[${element}]`);
    const texture = loadSpriteTexture(url);

    this.height = ROLE_HEIGHT[role] ?? 2.2;
    this.floatHeight = FLOATING_TEMPLATES.has(templateId) ? Math.max(0.34, ROLE_FLOAT[role] ?? 0) : (ROLE_FLOAT[role] ?? 0);

    // 画像の縦横比から幅を出す。**全部同じ幅にすると、翼を広げた種族が潰れる。**
    // 読み込みが終わるまで比が分からないので、まず正方形で置いて後から直す
    const geometry = new THREE.PlaneGeometry(this.height, this.height, 1, 14);
    // 原点を足元へ移す。以後どれだけ変形させても y=0 が接地面のままになる
    geometry.translate(0, this.height / 2, 0);
    this.disposables.push(geometry);

    this.uniforms.uHeight.value = this.height;
    this.uniforms.uGlowColor.value = this.theme.rim.clone();
    // 属性専用に描かれた絵は、描いた人が既に色を付けている。二重に寄せると濁る
    this.uniforms.uTintAmount.value = isElementSpecific(templateId, element) ? 0 : SPRITE_TINT;
    this.uniforms.uTintHue.value = ELEMENT_TINT[element].hue;
    this.uniforms.uTintSat.value = ELEMENT_TINT[element].sat;

    this.material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // 半透明の縁どうしが前後で打ち消し合わないよう、深度書き込みは切る。
      // 代わりに renderOrder で奥から手前へ並べる
      depthWrite: false,
      side: THREE.DoubleSide,
      alphaTest: 0.004,
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = `
        uniform float uSquash;
        uniform float uBend;
        uniform float uHeight;
        ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         // 足元(y=0)を固定し、上ほど大きく動かす。
         // これを守ると、どれだけ変形させても接地が外れない
         float _t = clamp(transformed.y / uHeight, 0.0, 1.0);
         transformed.y *= uSquash;
         // 潰したぶんは横へ逃がして体積を保つ。無いと弾力が出ない
         transformed.x *= inversesqrt(max(uSquash, 0.05));
         // 撓み。上ほど大きく流れるので、鞭のようにしなる
         transformed.x += uBend * _t * _t;
        `,
      );
      shader.fragmentShader = `
        uniform float uTintHue;
        uniform float uTintSat;
        uniform float uTintAmount;
        uniform float uFlash;
        uniform float uGlow;
        uniform vec3 uGlowColor;
        uniform float uDim;

        // RGBとHSVの行き来。**色相だけを差し替える**ために要る
        vec3 _rgb2hsv(vec3 c) {
          vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
          vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
          vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
          float d = q.x - min(q.w, q.y);
          float e = 1.0e-10;
          return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
        }
        vec3 _hsv2rgb(vec3 c) {
          vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
          vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
          return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        ${shader.fragmentShader}
      `.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         {
           float _luma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
           if (uTintAmount > 0.001) {
             /*
              * 属性の色へ寄せる。**混ぜるのではなく色相を差し替える。**
              * 混ぜると、濃い青のスライムに赤を混ぜても青のままか、
              * 量を上げると明暗ごと潰れて平たくなる。
              * 色相だけ差し替えれば、描かれた陰影と艶が残る。
              *
              * 彩度の低いもの(岩のゴーレムなど)は元々色を持たないので、
              * 差し替えてもほとんど動かない。それが正しい:
              * 岩は属性が変わっても岩に見えるべきで、
              * 属性は縁の光と足元の紋様が伝える
              */
             vec3 _hsv = _rgb2hsv(diffuseColor.rgb);
             _hsv.x = uTintHue;
             _hsv.y = clamp(_hsv.y * uTintSat, 0.0, 1.0);
             diffuseColor.rgb = mix(diffuseColor.rgb, _hsv2rgb(_hsv), uTintAmount);
           }
           // 瀕死は色を落とす。3D側が亀裂を光らせていたのと同じ役目
           diffuseColor.rgb *= (1.0 - uDim * 0.42);
           // 手番が回ってきた時の淡い発光
           diffuseColor.rgb += uGlowColor * uGlow * (0.22 + 0.78 * _luma);
           // 被弾の白飛び
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), uFlash);
         }
        `,
      );
    };
    // onBeforeCompile を変えたことをThreeへ知らせる鍵。
    // 同じ既定値のままだと、別の MeshBasicMaterial とシェーダを共有してしまう
    this.material.customProgramCacheKey = () => "crimon-sprite-avatar";
    this.disposables.push(this.material);

    this.mesh = new THREE.Mesh(geometry, this.material);
    // 敵は左右反転して、両チームが同じ絵の並びに見えないようにする
    this.mesh.scale.x = facing === 1 ? 1 : -1;
    this.root.add(this.mesh);

    // 画像の比が分かった時点で幅を直す
    const applyAspect = () => {
      const image = texture.image as { width?: number; height?: number } | undefined;
      if (!image?.width || !image?.height) return;
      this.mesh.scale.x = (image.width / image.height) * (facing === 1 ? 1 : -1);
    };
    if (texture.image) applyAspect();
    else texture.addEventListener("update" as never, applyAspect as never);
    // TextureLoader は読み込み後に image を差すので、次のフレームでも試す
    requestAnimationFrame(applyAspect);

    // 指の当たり判定。細かい形で判定すると狙いにくいので、姿を持たない箱で受ける。
    // 幅は接地影の大きさの基準にもなる(battleStage.addContactShadow)
    const footprint = this.height * 0.62;
    const hitGeometry = new THREE.BoxGeometry(footprint * 1.15, this.height * 1.05, footprint * 1.15);
    const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
    this.disposables.push(hitGeometry, hitMaterial);
    this.hitProxy = new THREE.Mesh(hitGeometry, hitMaterial);
    this.hitProxy.position.y = this.height * 0.52;
    this.hitProxy.renderOrder = -1;
    this.root.add(this.hitProxy);
  }

  setSlotPosition(x: number, z: number): void {
    this.slotX = x;
    this.slotZ = z;
    this.root.position.set(x, 0, z);
    // 奥にいるものから先に描く。深度書き込みを切っているので、
    // ここを決めないと前後関係が崩れて手前の敵が奥に見えることがある
    this.mesh.renderOrder = Math.round(100 - z * 10);
  }

  /** ダメージ表示やHPバーをぶら下げる、頭上あたりのワールド座標 */
  getAnchorWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    this.root.getWorldPosition(target);
    target.y += this.height * 0.88 + this.floatHeight;
    return target;
  }

  setActive(active: boolean): void {
    this.targetGlow = active ? 1 : 0;
  }

  setTargeted(targeted: boolean): void {
    this.targeted = targeted;
  }

  /** 指の当たり判定に使う、姿を持たない箱 */
  get hitArea(): THREE.Object3D {
    return this.hitProxy;
  }

  setHpRatio(ratio: number): void {
    this.hpRatio = Math.max(0, Math.min(1, ratio));
  }

  faceToward(x: number, z: number): void {
    this.foeDir.set(x - this.slotX, 0, z - this.slotZ);
    if (this.foeDir.lengthSq() < 1e-6) this.foeDir.set(0, 0, -this.facing);
    this.foeDir.normalize();
  }

  playAttack(): void {
    this.attackTimer = 0;
  }

  playCast(): void {
    this.castTimer = 0;
  }

  playHit(): void {
    this.hitTimer = 0;
  }

  playDeath(): void {
    if (this.dead) return;
    this.dead = true;
    this.deathTimer = 0;
  }

  revive(): void {
    this.dead = false;
    this.deathTimer = -1;
    this.root.visible = true;
    this.material.opacity = 1;
  }

  isDying(): boolean {
    return this.dead && this.deathTimer >= 0 && this.deathTimer < DEATH_DURATION;
  }

  update(dt: number, _elapsed: number): void {
    this.idleClock += dt;

    // --- 待機。呼吸・漂い・撓み ---
    const floaty = this.floatHeight > 0.01;
    const breathe = Math.sin(this.idleClock * (floaty ? 1.5 : 2.15) + this.bobPhase);
    let squash = 1 + breathe * (floaty ? 0.022 : 0.042);
    let bend = Math.sin(this.idleClock * 0.85 + this.bobPhase) * (floaty ? 0.09 : 0.045);
    let lift = this.floatHeight + Math.sin(this.idleClock * (floaty ? 1.15 : 1.7) + this.bobPhase) * (floaty ? 0.11 : 0.028);
    let push = 0;
    let tilt = 0;
    let flash = 0;

    // --- 攻撃。沈む → 踏み込む → 潰れる → 戻る ---
    if (this.attackTimer >= 0) {
      this.attackTimer += dt;
      const t = this.attackTimer;
      if (t < ATTACK_WINDUP) {
        // 溜め。沈んで後ろへ引く
        const k = t / ATTACK_WINDUP;
        squash *= 1 - 0.13 * k;
        push -= 0.28 * k;
        bend -= 0.2 * k;
      } else if (t < ATTACK_WINDUP + ATTACK_STRIKE) {
        // 打ち抜き。前へ出て縦に伸び、当たる瞬間に潰れる
        const k = (t - ATTACK_WINDUP) / ATTACK_STRIKE;
        squash *= 1 + 0.16 * arch(k) - 0.1 * Math.max(0, k - 0.6) / 0.4;
        push += 1.05 * Math.min(1, k * 1.6);
        bend += 0.46 * Math.min(1, k * 1.8);
      } else if (t < ATTACK_TOTAL) {
        // 余韻。揺り戻しながら戻る
        const k = (t - ATTACK_WINDUP - ATTACK_STRIKE) / ATTACK_RECOVER;
        const back = 1 - k;
        squash *= 1 + damped(k, 1.4, 5.2) * 0.07;
        push += 1.05 * back * back;
        bend += 0.46 * back * back + damped(k, 1.6, 4.4) * 0.1;
      } else {
        this.attackTimer = -1;
      }
    }

    // --- 被弾。押されて、こらえて、戻る ---
    if (this.hitTimer >= 0) {
      this.hitTimer += dt;
      const k = this.hitTimer / HIT_DURATION;
      if (k >= 1) {
        this.hitTimer = -1;
      } else {
        const decay = Math.exp(-k * 4.2);
        push -= 0.62 * decay * (1 - k * 0.2);
        bend -= 0.34 * decay + damped(k, 2.4, 6.5) * 0.14;
        squash *= 1 - 0.1 * decay;
        // 白飛びは短く。長いと「光っている」になって痛みが出ない
        flash = Math.max(0, 1 - k * 5.5) * 0.85;
      }
    }

    // --- サポート技。浮き上がって縦に伸び、属性色が乗る ---
    let castGlow = 0;
    if (this.castTimer >= 0) {
      this.castTimer += dt;
      const k = this.castTimer / CAST_DURATION;
      if (k >= 1) {
        this.castTimer = -1;
      } else {
        const a = arch(k);
        lift += 0.34 * a;
        squash *= 1 + 0.1 * a;
        bend += Math.sin(k * Math.PI * 3) * 0.05;
        castGlow = a;
      }
    }

    // --- 撃破。崩れて薄くなる ---
    if (this.deathTimer >= 0) {
      this.deathTimer += dt;
      const k = Math.min(1, this.deathTimer / DEATH_DURATION);
      tilt = this.deathTip * k * 1.15;
      squash *= 1 - 0.28 * k;
      lift -= this.floatHeight * k;
      this.material.opacity = Math.max(0, 1 - Math.max(0, k - 0.45) / 0.55);
      if (k >= 1) this.root.visible = false;
    } else {
      this.material.opacity = 1;
    }

    // --- 手番のハイライト。急に点かないよう追いかける ---
    const glowTarget = Math.max(this.targetGlow, this.targeted ? 0.55 : 0, castGlow);
    this.activeGlow += (glowTarget - this.activeGlow) * Math.min(1, dt * 9);
    this.uniforms.uGlow.value = this.activeGlow * 0.3;
    this.uniforms.uGlowColor.value.copy(this.targeted ? this.theme.vfx : this.theme.rim);

    // --- 反映 ---
    this.uniforms.uSquash.value = squash;
    // 撓みは絵の向きに関係なく「相手の方向」を正にしたいので、反転ぶんを打ち消す
    this.uniforms.uBend.value = bend * (this.facing === 1 ? 1 : -1) * (this.mesh.scale.x < 0 ? -1 : 1);
    this.uniforms.uFlash.value = flash;
    this.uniforms.uDim.value = 1 - this.hpRatio;

    this.root.position.set(
      this.slotX + this.foeDir.x * push,
      lift,
      this.slotZ + this.foeDir.z * push,
    );
    this.mesh.rotation.z = tilt;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const item of this.disposables) item.dispose();
  }
}
