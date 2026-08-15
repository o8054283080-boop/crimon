import * as THREE from "three";
import { CreatureKit } from "./kit.js";
import { AIM_DOWN, AIM_FORWARD, CreatureRig, markAnimated, place } from "./rig.js";
import {
  CreatureBuilder,
  addBatWing,
  addBeastHead,
  addClaws,
  addFeatherWing,
  addJoint,
  addPlating,
  addTail,
  limbFrom,
} from "./roles.js";

/**
 * モンスター種別ごとの造形。
 *
 * 役割(role)だけでシルエットを決めると、同じ役割の別モンスターが
 * 色違いにしか見えなくなる。かといって、役割の骨格が種別に対して
 * そもそも不適切なこともある(「アタッカーだからスライムが四足獣になる」)。
 *
 * そこで種別ごとに、次の2つのどちらかを選べるようにしている。
 *
 *   1. 専用骨格(TEMPLATE_BUILDERS)
 *      役割の骨格を使わず、最初から組み直す。骨格そのものが違うもの
 *      (スライム・人型の魔王・岩の巨人・豚)はこちら。
 *   2. 追加造形(TEMPLATE_TRAITS)
 *      役割の骨格はそのまま使い、翼や羽根飾りだけを足す。
 *      四足獣で正しいドラゴン・グリフォンなどはこちら。
 *
 * 座標系の約束は roles.ts と同じ。-Zが正面、+Xが右、+Yが上。
 * 実寸は finalizeRig() が体高から正規化するので、ここでは比率だけを設計する。
 */

// ---------------------------------------------------------------------------
// 共通の部品
// ---------------------------------------------------------------------------

/**
 * 大きく丸い目。素材モンスターや妖精のように「可愛さ」で見せる種別に使う。
 * 白目を持たず、暗い眼窩+発光する虹彩+小さなハイライトの3層で作る。
 * 発光部の面積を小さく保ち、加算エフェクトが重なっても白飛びさせない。
 */
function addRoundEyes(
  kit: CreatureKit,
  head: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
): void {
  const p = kit.palette;
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(radius * 1.25, radius * 1.45, radius * 0.8, "hide", p.deep, 10), side * x, y, z + radius * 0.5));
    head.add(place(kit.ball(radius, radius * 1.15, radius * 0.6, "glow", p.glow, 10), side * x, y, z));
    // ハイライト。1点入るだけで、目が球として読めるようになる
    head.add(place(kit.ball(radius * 0.3, radius * 0.3, radius * 0.2, "plate", p.plate, 6), side * (x + radius * 0.3), y + radius * 0.45, z - radius * 0.2));
  }
}

/** 毛の房。同じ向きの棘を少しずつずらして重ね、毛束の厚みを出す */
function addFurTuft(
  kit: CreatureKit,
  parent: THREE.Object3D,
  count: number,
  radius: number,
  length: number,
  origin: [number, number, number],
  spread: number,
  aim: [number, number, number],
): void {
  const p = kit.palette;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const tuft = kit.spike(radius * (1 - Math.abs(t) * 0.4), length * (1 - Math.abs(t) * 0.35), 0.55, "fur", p.fur);
    place(
      tuft,
      origin[0] + t * spread,
      origin[1],
      origin[2] + Math.abs(t) * spread * 0.3,
      aim[0],
      aim[1],
      aim[2] + t * 0.8,
    );
    parent.add(tuft);
  }
}

/** ふさふさした尾。節ごとに毛の房を巻き付け、爬虫類の尾と描き分ける */
function addFurTail(
  kit: CreatureKit,
  rig: CreatureRig,
  origin: [number, number, number],
  count: number,
  length: number,
  radius: number,
  baseAngle: number,
  curve: number,
): void {
  const p = kit.palette;
  const specs = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    specs.push({
      len: length * (1 - t * 0.2),
      r0: radius * (1 - t * 0.5),
      r1: radius * (1 - (t + 1 / count) * 0.5),
      rot: [i === 0 ? baseAngle : curve, 0, 0] as [number, number, number],
      radial: 6,
    });
  }
  const chain = kit.chain(specs, "fur", p.fur);
  chain.root.position.set(origin[0], origin[1], origin[2]);
  markAnimated(...chain.joints);
  for (let i = 0; i < chain.joints.length; i++) {
    rig.tail.push({ group: chain.joints[i], rest: chain.rests[i] });
    // 節ごとに毛を放射させる。円柱の輪郭が消えて「房」に見える
    const bulk = radius * (2.1 - i * 0.16);
    for (let k = 0; k < 5; k++) {
      const angle = (k / 5) * Math.PI * 2 + i * 0.7;
      const hair = kit.spike(radius * 0.5, bulk, 0.7, "fur", p.fur);
      place(
        hair,
        Math.cos(angle) * radius * 0.5,
        -length * 0.5,
        Math.sin(angle) * radius * 0.5,
        Math.PI / 2 + Math.sin(angle) * 0.5,
        0,
        Math.cos(angle) * 1.1,
      );
      chain.joints[i].add(hair);
    }
  }
  // 先端。丸を1つ足すだけだと「棒の先の玉」になるので、細く長い房で締める
  for (let k = 0; k < 4; k++) {
    const angle = (k / 4) * Math.PI * 2 + 0.6;
    const tipHair = kit.spike(radius * 0.55, length * 1.15, 0.8, "fur", p.fur);
    place(tipHair, Math.cos(angle) * radius * 0.3, -length * 0.1, Math.sin(angle) * radius * 0.3, Math.PI - 0.25, 0, Math.cos(angle) * 0.5);
    chain.tip.add(tipHair);
  }
  rig.pelvis.add(chain.root);
}

/**
 * 昆虫の薄翅。前後2枚1組で、翅脈だけが硬く見える。
 * 羽毛の翼(面積の塊)と違い、輪郭が透けて中身が見えるのが妖精らしさになる。
 */
function addInsectWing(kit: CreatureKit, wing: THREE.Object3D, side: number, span: number): void {
  const p = kit.palette;
  const s = side;
  const petals: { len: number; width: number; lift: number; tilt: number }[] = [
    { len: 1.0, width: 0.56, lift: 0.20, tilt: 0.1 },
    { len: 0.62, width: 0.44, lift: -0.18, tilt: -0.55 },
  ];

  for (const petal of petals) {
    const L = span * petal.len;
    const W = span * petal.width;
    // 先を尖らせると木の葉になってしまう。先端を丸く、根元を細く絞ると翅に見える
    const blade = kit.membrane(
      (shape) => {
        shape.moveTo(0, 0);
        shape.bezierCurveTo(s * L * 0.30, W * 0.86, s * L * 0.70, W * 1.02, s * L * 0.94, W * 0.44);
        shape.bezierCurveTo(s * L * 1.06, W * 0.05, s * L * 0.92, -W * 0.42, s * L * 0.60, -W * 0.50);
        shape.bezierCurveTo(s * L * 0.32, -W * 0.55, s * L * 0.12, -W * 0.22, 0, 0);
      },
      "membrane",
      p.membrane,
      // 外へ行くほど反らせて、平らな板に見えないようにする
      -0.1 / Math.max(0.001, span),
    );
    place(blade, 0, span * petal.lift, 0, 0, 0, s * petal.tilt);
    wing.add(blade);

    // 翅脈。前縁の1本だけだと葉脈に見えるので、根元から扇状に3本走らせる。
    // 面を分割する線が入ることで、膜が骨組みに張られているように読める
    const veins: [number, number][] = [
      [0.94, 0.44],
      [0.80, -0.10],
      [0.52, -0.42],
    ];
    for (const [vx, vy] of veins) {
      // 膜の縁からはみ出すと「触角の束」に見えるので、内側で止める
      wing.add(
        place(
          kit.taperedTube(
            [
              { x: 0, y: 0, z: 0 },
              { x: s * L * vx * 0.42, y: W * (vy * 0.42 + 0.15), z: 0 },
              { x: s * L * vx * 0.80, y: W * vy * 0.78, z: 0 },
            ],
            span * 0.016,
            span * 0.003,
            "plate",
            p.plate,
            4,
            8,
          ),
          0,
          span * petal.lift,
          -span * 0.012,
          0,
          0,
          s * petal.tilt,
        ),
      );
    }
  }
  // 付け根の関節
  wing.add(place(kit.ball(span * 0.07, span * 0.07, span * 0.06, "plate", p.plate, 8), 0, 0, 0));
}

/** 豚の頭。鼻先の円盤と鼻孔、垂れ耳で「豚」と読ませる */
function addPigHead(kit: CreatureKit, head: THREE.Object3D, scale: number, earDroop: number): void {
  const p = kit.palette;
  const S = scale;
  head.add(place(kit.ball(0.30 * S, 0.27 * S, 0.28 * S, "hide", p.main), 0, 0.24 * S, 0));
  // 頬。豚は横幅で読ませる
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.14 * S, 0.13 * S, 0.14 * S, "hide", p.main, 10), side * 0.22 * S, 0.19 * S, -0.05 * S));
  }
  // 鼻づら → 鼻先の円盤 → 鼻孔
  head.add(place(kit.ball(0.16 * S, 0.13 * S, 0.16 * S, "hide", p.main), 0, 0.17 * S, -0.26 * S));
  head.add(place(kit.lens(0.15 * S, 0.13 * S, 0.05 * S, "hide", p.dark, 12), 0, 0.17 * S, -0.39 * S));
  for (const side of [-1, 1]) {
    head.add(place(kit.ball(0.035 * S, 0.05 * S, 0.02 * S, "hide", p.deep, 8), side * 0.06 * S, 0.17 * S, -0.42 * S));
  }
  addRoundEyes(kit, head, 0.14 * S, 0.30 * S, -0.25 * S, 0.045 * S);
  // 垂れ耳。付け根から前へ折れる2枚重ねで、厚みのある耳にする
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    place(ear, side * 0.24 * S, 0.42 * S, -0.02 * S, earDroop, 0, -side * 0.5);
    ear.add(place(kit.lens(0.10 * S, 0.16 * S, 0.035 * S, "hide", p.main, 8), 0, 0.11 * S, 0));
    ear.add(place(kit.lens(0.07 * S, 0.11 * S, 0.025 * S, "hide", p.dark, 8), 0, 0.20 * S, -0.03 * S, 0.5, 0, 0));
    head.add(ear);
  }
}

/** くるんと巻いた尾。豚の後ろ姿を1本で決める */
function addCurlyTail(kit: CreatureKit, parent: THREE.Object3D, origin: [number, number, number], scale: number): void {
  const p = kit.palette;
  const points: THREE.Vector3Like[] = [];
  const turns = 1.8;
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const angle = t * Math.PI * 2 * turns;
    const radius = 0.13 * scale * (0.35 + t * 0.65);
    points.push({
      x: Math.sin(angle) * radius,
      y: 0.10 * scale * t + (1 - Math.cos(angle)) * radius * 0.4,
      z: origin[2] * 0 + t * 0.16 * scale + Math.cos(angle) * radius * 0.35,
    });
  }
  const tail = kit.taperedTube(points, 0.045 * scale, 0.014 * scale, "hide", p.main, 5, 20);
  place(tail, origin[0], origin[1], origin[2]);
  parent.add(tail);
}

/** 豚の四肢。短くて太い、蹄の脚 */
function addPigLegs(kit: CreatureKit, rig: CreatureRig, scale: number, spread: number, hind: boolean): void {
  const p = kit.palette;
  const S = scale;
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.20 * S, r0: 0.10 * S, r1: 0.075 * S, rot: [hind ? 0.16 : -0.10, 0, side * 0.05], radial: 7 },
        { len: 0.16 * S, r0: 0.07 * S, r1: 0.055 * S, rot: [hind ? -0.24 : 0.14, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * spread * S, -0.10 * S, (hind ? 0.24 : -0.26) * S);
    // 蹄。硬い材質を先端に1つ足すだけで、脚の終わりが締まる
    leg.tip.add(place(kit.ball(0.075 * S, 0.06 * S, 0.085 * S, "plate", p.plate, 8), 0, -0.02 * S, -0.01 * S));
    leg.tip.add(place(kit.box(0.012 * S, 0.07 * S, 0.09 * S, "hide", p.deep), 0, -0.03 * S, -0.02 * S));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * (hind ? 0.9 : 1.6), !hind));
  }
}

// ---------------------------------------------------------------------------
// slime: 粘体
// ---------------------------------------------------------------------------

/**
 * スライム。
 *
 * 以前は役割(アタッカー)の四足獣の骨格をそのまま使っていて、
 * 「牙と角のある獣」になっていた。骨も四肢も持たない生き物なので、
 * 骨格ビルダーを流用せず、床に置かれた一塊の粘体として組み直す。
 *
 * 動きは関節ではなく体積の変形で作るため、anim.squash を立てて
 * MonsterAvatar 側の潰れ・伸びを有効にする。骨格の原点(y=0)を
 * 接地面に合わせてあるので、伸縮しても足元が浮かない。
 */
function buildSlime(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0;

  // 本体。裾を一度外へ張り出させてから床へ落とし、
  // 「自重で潰れて広がっている」重さを輪郭に出す
  rig.pelvis.add(
    kit.lathe(
      [
        [0.001, 0.0],
        [0.54, 0.0],
        [0.70, 0.03],
        [0.79, 0.12],
        [0.80, 0.30],
        [0.72, 0.54],
        [0.55, 0.79],
        [0.32, 0.97],
        [0.10, 1.06],
        [0.001, 1.08],
      ],
      "hide",
      p.main,
      26,
    ),
  );

  // 床に広がった溜まり。
  // 均等な粒を輪に並べると「足の指」や「石を敷いた台座」に見えたので、
  // 大きさも位置もばらばらな平たい塊を重ねて、外周を非対称に崩す
  for (const pool of [
    { x: 0.0, z: 0.0, r: 0.86, h: 0.06 },
    { x: 0.30, z: -0.22, r: 0.52, h: 0.05 },
    { x: -0.36, z: 0.16, r: 0.46, h: 0.055 },
    { x: 0.10, z: 0.42, r: 0.40, h: 0.045 },
    { x: -0.22, z: -0.40, r: 0.36, h: 0.04 },
    { x: 0.46, z: 0.28, r: 0.26, h: 0.035 },
  ]) {
    rig.pelvis.add(place(kit.lens(pool.r, pool.h, pool.r * 0.94, "hide", p.dark, 14), pool.x, pool.h * 0.55, pool.z));
  }

  // 本体の膨らみ。真円のドームは「かまくら」に見えてしまうため、
  // 大きさの違う塊を半分めり込ませて、どの角度からも輪郭が非対称になるようにする
  for (const lump of [
    { x: -0.44, y: 0.42, z: 0.26, r: 0.34 },
    { x: 0.40, y: 0.30, z: -0.34, r: 0.38 },
    { x: 0.22, y: 0.72, z: 0.34, r: 0.28 },
    { x: -0.26, y: 0.78, z: -0.30, r: 0.24 },
    { x: 0.52, y: 0.46, z: 0.22, r: 0.26 },
  ]) {
    rig.pelvis.add(place(kit.ball(lump.r, lump.r * 0.86, lump.r, "hide", p.main, 12), lump.x, lump.y, lump.z));
  }

  // 縁から垂れ落ちる雫。溜まりのすぐ上に丸い粒を並べ、
  // 「体が床へ流れ落ちている」ことを、輪郭の途中に置いた粒で伝える
  for (const drop of [
    { angle: 1.0, y: 0.30, r: 0.13 },
    { angle: 2.4, y: 0.22, r: 0.10 },
    { angle: -1.7, y: 0.26, r: 0.115 },
    { angle: -0.4, y: 0.18, r: 0.09 },
    { angle: 3.6, y: 0.34, r: 0.10 },
  ]) {
    const radius = 0.78;
    rig.pelvis.add(
      place(
        kit.ball(drop.r, drop.r * 1.3, drop.r, "hide", p.main, 10),
        Math.cos(drop.angle) * radius,
        drop.y,
        Math.sin(drop.angle) * radius,
      ),
    );
  }

  // 濡れた照り。硬い材質の薄片を上面に寝かせると、面のハイライトだけが立ち、
  // 不透明な体でも「濡れた粘体」に見える
  for (const shine of [
    { x: -0.30, y: 0.86, z: -0.26, rx: 0.20, rz: 0.13, rot: -0.5 },
    { x: -0.44, y: 0.66, z: -0.10, rx: 0.10, rz: 0.07, rot: -0.9 },
    { x: 0.30, y: 0.80, z: 0.28, rx: 0.14, rz: 0.09, rot: 0.7 },
  ]) {
    rig.pelvis.add(place(kit.lens(shine.rx, shine.rz, 0.02, "crystal", p.accent, 10), shine.x, shine.y, shine.z, 1.1, shine.rot, 0));
  }

  // 体内に浮く核と気泡。透過する結晶を内側に置くことで、
  // 外殻が不透明でも「中身が詰まったゼリー」に見える
  rig.pelvis.add(place(kit.octa(0.17, 0.22, 0.17, "crystal", p.accent), 0, 0.36, 0.06));
  rig.pelvis.add(place(kit.octa(0.07, 0.10, 0.07, "glow", p.glow), 0, 0.36, 0.06));
  for (const bubble of [
    { x: 0.22, y: 0.62, z: 0.18, r: 0.075 },
    { x: -0.28, y: 0.42, z: -0.10, r: 0.06 },
    { x: 0.10, y: 0.80, z: -0.16, r: 0.05 },
    { x: -0.14, y: 0.24, z: 0.24, r: 0.055 },
  ]) {
    rig.pelvis.add(place(kit.ball(bubble.r, bubble.r, bubble.r, "crystal", p.accent, 8), bubble.x, bubble.y, bubble.z));
  }

  // 頭頂で揺れる雫。布として登録し、本体より遅れて振らせる
  const droop = new THREE.Group();
  markAnimated(droop);
  place(droop, 0.05, 1.02, 0.06, 0.3, 0, -0.25);
  droop.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0.03, y: 0.16, z: 0.03 },
        { x: 0.02, y: 0.28, z: 0.10 },
      ],
      0.07,
      0.02,
      "hide",
      p.main,
      6,
      6,
    ),
  );
  droop.add(place(kit.ball(0.05, 0.06, 0.05, "hide", p.main, 8), 0.02, 0.30, 0.11));
  rig.pelvis.add(droop);
  rig.cloth.push({ group: droop, rest: droop.rotation.clone(), phase: 0, amount: 1.5 });

  // 触手状の腕。体から直に生えた粘りの柱で、先へ行くほど太く垂れる。
  // 前方(-Z)寄りに付けて、正面からは手、背面からは体の膨らみとして読ませる
  const torso = rig.torso;
  place(torso, 0, 0.44, 0);
  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.26, r0: 0.17, r1: 0.12, rot: [0.3, 0, side * 1.15], radial: 8 },
        { len: 0.22, r0: 0.115, r1: 0.10, rot: [0.5, 0, -side * 0.55], radial: 8 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.48, 0.06, -0.16);
    arm.tip.add(place(kit.ball(0.115, 0.10, 0.115, "hide", p.main, 10), 0, -0.04, -0.01));
    torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.4));
  }

  // 顔。頭の原点を体の中心に置き、目が表面をゆっくり動くようにする
  place(rig.neck, 0, 0.06, 0);
  place(rig.head, 0, 0, 0);
  const head = rig.head;
  addRoundEyes(kit, head, 0.20, 0.10, -0.60, 0.10);
  // 口。逆さの笠形を薄く貼って、開いた口の暗がりにする
  head.add(place(kit.lens(0.13, 0.07, 0.05, "hide", p.deep, 10), 0, -0.12, -0.62, 0.2, 0, 0));
  head.add(place(kit.band(0.16, 0.018, Math.PI * 0.9, "hide", p.dark, 12), 0, -0.06, -0.62, 0, 0, Math.PI * 1.05));

  rig.anim = {
    idleSpeed: 1.15,
    breath: 0.25,
    bob: 0.03,
    headSway: 0.9,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.55,
    lunge: 1.5,
    squash: 1,
    attack: "dash",
  };
}

// ---------------------------------------------------------------------------
// wolf: 狼
// ---------------------------------------------------------------------------

/**
 * 狼。四足であること自体は役割(アタッカー)と同じだが、
 * 既定の四足はドラゴン寄り(背びれ・曲がった角・棘の尾)なので、
 * 細身の胴・首まわりの毛・立った耳・ふさふさの尾に組み替えて
 * 「獣」であることを毛で読ませる。
 */
function buildWolf(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.yawBias = 0.34;
  rig.pelvis.position.y = 1.0;

  // --- 腰。狼は後ろが軽く、肩が高い ---
  rig.pelvis.add(place(kit.ball(0.24, 0.24, 0.30, "hide", p.main), 0, 0, 0.04));
  rig.pelvis.add(place(kit.ball(0.19, 0.18, 0.17, "hide", p.main), 0, -0.02, 0.20));
  for (const side of [-1, 1]) {
    rig.pelvis.add(place(kit.ball(0.13, 0.17, 0.18, "hide", p.main), side * 0.19, -0.02, 0.10));
  }

  // --- 後脚(細く、踵が高いデジティグレード) ---
  // 脚を長くすると鹿に見える。狼は「胴が長く脚が短い」比率で読ませる
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.30, r0: 0.13, r1: 0.085, rot: [0.56, 0, 0], radial: 7 },
        { len: 0.30, r0: 0.085, r1: 0.055, rot: [-1.20, 0, 0], radial: 7 },
        { len: 0.21, r0: 0.055, r1: 0.045, rot: [0.80, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.18, -0.02, 0.12);
    addJoint(kit, leg.joints[1], 0, 0.075, false);
    leg.tip.add(place(kit.ball(0.075, 0.05, 0.11, "hide", p.dark), 0, -0.02, -0.04));
    addClaws(kit, leg.tip, 3, 0.10, 0.022, 0.05);
    // 腿の毛。付け根だけ房を残すと、脚の細さが際立つ
    addFurTuft(kit, leg.joints[0], 3, 0.07, 0.26, [0, -0.16, 0.10], 0.12, [1.9, 0, 0]);
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.9));
  }

  // --- 胴(深い胸、絞れた腹。前後に長く取る) ---
  const torso = rig.torso;
  place(torso, 0, 0.06, -0.54, 0.02, 0, 0);
  // 胸郭。狼は前脚の間が深く、そこから腹へ向けて一気に絞れる
  torso.add(place(kit.ball(0.25, 0.31, 0.36, "hide", p.main), 0, 0.0, -0.14));
  torso.add(place(kit.ball(0.21, 0.23, 0.34, "hide", p.main), 0, 0.0, 0.20));
  torso.add(place(kit.ball(0.18, 0.18, 0.24, "hide", p.dark), 0, -0.14, -0.14));
  torso.add(place(kit.ball(0.15, 0.12, 0.34, "hide", p.dark), 0, -0.14, 0.14));
  // 肩甲骨の張り
  for (const side of [-1, 1]) {
    torso.add(place(kit.ball(0.11, 0.16, 0.17, "hide", p.main), side * 0.22, 0.08, -0.20));
  }
  // 背の毛並み。立てると恐竜の背びれになるので、短く寝かせて並べる
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const hair = kit.spike(0.075, 0.16 - t * 0.06, 0.85, "fur", p.fur);
    place(hair, 0, 0.22 - t * 0.03, -0.34 + t * 0.74, 1.45, Math.PI / 2, 0);
    torso.add(hair);
  }

  // --- 前脚(まっすぐで細い) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.31, r0: 0.11, r1: 0.075, rot: [0.14, 0, side * 0.04], radial: 7 },
        { len: 0.28, r0: 0.07, r1: 0.05, rot: [-0.2, 0, 0], radial: 7 },
        { len: 0.11, r0: 0.05, r1: 0.045, rot: [0.16, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.19, -0.02, -0.26);
    leg.tip.add(place(kit.ball(0.07, 0.045, 0.10, "hide", p.dark), 0, -0.02, -0.04));
    addClaws(kit, leg.tip, 3, 0.10, 0.022, 0.05);
    torso.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.5, true));
  }

  // --- 首まわりの毛(狼の見分けどころ) ---
  // 首を立てると鹿になる。前へ低く送り出して、頭が肩より前に出るようにする
  place(rig.neck, 0, 0.16, -0.40, 0.34, 0, 0);
  rig.neck.add(
    kit.taperedTube(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0.16, z: -0.02 },
        { x: 0, y: 0.30, z: 0.02 },
      ],
      0.16,
      0.095,
      "hide",
      p.main,
      7,
      6,
    ),
  );
  // 襟巻き状のたてがみ。首の付け根を1周させる。
  // 断面を丸く(flatを大きく)して幅を持たせないと、棘が刺さって見える
  for (let i = 0; i < 13; i++) {
    const angle = (i / 13) * Math.PI * 2;
    const hair = kit.spike(0.085, 0.30 - Math.cos(angle) * 0.09, 0.9, "fur", p.fur);
    place(
      hair,
      Math.sin(angle) * 0.14,
      0.04,
      Math.cos(angle) * 0.14,
      Math.PI * 0.66 + Math.cos(angle) * 0.4,
      0,
      -Math.sin(angle) * 1.25,
    );
    rig.neck.add(hair);
  }

  // --- 頭(細長い鼻づら、立った耳) ---
  place(rig.head, 0, 0.30, 0, 0.22, 0, 0);
  addBeastHead(kit, rig, { skull: [0.16, 0.15, 0.21], snout: 0.36, jaw: true, horns: "none", crest: 0, eye: 0.042 });
  // 立った三角の耳。獣の種類を一番はっきり伝える部位
  for (const side of [-1, 1]) {
    const ear = new THREE.Group();
    place(ear, side * 0.125, 0.25, 0.12, -0.24, 0, -side * 0.28);
    ear.add(place(kit.spike(0.085, 0.30, 0.45, "fur", p.fur), 0, 0, 0));
    ear.add(place(kit.spike(0.05, 0.21, 0.35, "hide", p.deep), 0, 0.02, -0.03));
    rig.head.add(ear);
  }
  // 頬の毛。顔の横幅を広げて、細い鼻づらとの対比を作る
  for (const side of [-1, 1]) {
    addFurTuft(kit, rig.head, 3, 0.055, 0.22, [side * 0.13, 0.10, 0.06], 0.10, [1.4, 0, side * 1.4]);
  }

  // 長くて太い尾。後ろへ低く流すと、胴の長さがさらに強調される
  addFurTail(kit, rig, [0, 0.08, 0.22], 5, 0.22, 0.09, -1.05, -0.10);

  rig.wingAnchor.set(0.18, 0.32, -0.02);

  rig.anim = {
    idleSpeed: 1.5,
    breath: 0.85,
    bob: 0.028,
    headSway: 1.45,
    tailWave: 1.7,
    wingFlap: 0,
    sway: 0.9,
    lunge: 1.8,
    squash: 0,
    attack: "pounce",
  };
}

// ---------------------------------------------------------------------------
// nemesis: 魔王
// ---------------------------------------------------------------------------

/**
 * ネメシス(魔王)。
 *
 * 役割はアタッカーだが、四足獣にしてしまうと「主(あるじ)」に見えない。
 * 直立した人型に、巨大な角・裂けたマント・長柄の大鎌を足して、
 * 「他のモンスターを従える存在」として読めるシルエットにする。
 */
function buildNemesis(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 1.25;

  // --- 腰。重い帯と、そこから下がる裂けた腰布 ---
  rig.pelvis.add(place(kit.ball(0.26, 0.20, 0.22, "hide", p.dark), 0, -0.02, 0));
  rig.pelvis.add(place(kit.band(0.25, 0.045, Math.PI * 2, "metal", p.metal, 16), 0, 0.02, 0, Math.PI / 2, 0, 0));
  rig.pelvis.add(place(kit.octa(0.08, 0.12, 0.05, "crystal", p.accent), 0, 0.02, -0.25));
  rig.pelvis.add(place(kit.octa(0.04, 0.06, 0.03, "glow", p.glow), 0, 0.02, -0.26));
  for (let i = 0; i < 5; i++) {
    const angle = -1.15 + (i / 4) * 2.3;
    const strip = kit.spike(0.09, 0.46 + Math.abs(Math.sin(i * 2.1)) * 0.16, 0.3, "membrane", p.membrane);
    place(strip, Math.sin(angle) * 0.24, -0.08, -Math.cos(angle) * 0.23, Math.PI - 0.12, -angle, 0);
    rig.pelvis.add(strip);
  }

  // --- 脚(蹄を持つ3節。人型だが人間ではないことを脚で示す) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.44, r0: 0.16, r1: 0.12, rot: [0.40, 0, side * 0.07] },
        { len: 0.42, r0: 0.115, r1: 0.09, rot: [-0.86, 0, 0] },
        { len: 0.26, r0: 0.09, r1: 0.08, rot: [0.55, 0, 0] },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.21, -0.06, 0.02);
    leg.joints[0].add(place(kit.lens(0.15, 0.20, 0.13, "metal", p.metal), 0, -0.20, -0.04, 0.06, 0, 0));
    addJoint(kit, leg.joints[1], 0, 0.10, true);
    leg.joints[1].add(place(kit.lens(0.11, 0.18, 0.10, "metal", p.metal), 0, -0.20, -0.04));
    // 蹄
    leg.tip.add(place(kit.ball(0.11, 0.11, 0.16, "plate", p.plate), 0, -0.04, -0.05));
    leg.tip.add(place(kit.box(0.02, 0.12, 0.16, "hide", p.deep), 0, -0.06, -0.08));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.7));
  }

  // --- 胴(逆三角形。肩が広く腰が細い) ---
  const torso = rig.torso;
  place(torso, 0, 0.06, 0, -0.08, 0, 0);
  torso.add(place(kit.ball(0.22, 0.22, 0.18, "hide", p.dark), 0, 0.16, 0));
  torso.add(place(kit.ball(0.36, 0.32, 0.26, "hide", p.main), 0, 0.48, 0));
  addPlating(kit, torso, 3, 0.30, 0.60, 0.30, -0.18);
  torso.add(place(kit.lens(0.34, 0.20, 0.16, "metal", p.metal), 0, 0.64, -0.10, -0.12, 0, 0));
  torso.add(place(kit.octa(0.09, 0.14, 0.06, "crystal", p.accent), 0, 0.56, -0.24));
  torso.add(place(kit.octa(0.045, 0.07, 0.03, "glow", p.glow), 0, 0.56, -0.25));
  // 首を囲う棘の襟
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const collar = kit.spike(0.05, 0.30 - Math.abs(t) * 0.10, 0.6, "plate", p.plate);
    place(collar, t * 0.5, 0.72, 0.06 + Math.abs(t) * 0.10, -0.5, 0, -t * 1.4);
    torso.add(collar);
  }

  for (const side of [-1, 1]) {
    // 肩。岩塊ではなく、段の付いた大きな装甲にする
    for (let i = 0; i < 3; i++) {
      const w = 0.26 - i * 0.045;
      const pauldron = kit.lens(w, w * 0.66, w * 0.95, "metal", p.metal, 10);
      place(pauldron, side * (0.46 + i * 0.02), 0.70 - i * 0.11, 0, 0, 0, -side * (0.18 + i * 0.2));
      torso.add(pauldron);
    }
    for (let i = 0; i < 2; i++) {
      const spike = kit.spike(0.055, 0.34 - i * 0.08, 0.7, "plate", p.plate);
      place(spike, side * 0.54, 0.76, -0.12 + i * 0.22, -0.3 + i * 0.35, 0, -side * 0.85);
      torso.add(spike);
    }

    const arm = kit.chain(
      [
        { len: 0.42, r0: 0.13, r1: 0.10, rot: [0.16, 0, side * 0.22] },
        { len: 0.40, r0: 0.10, r1: 0.085, rot: [-0.5, 0, 0] },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.46, 0.58, 0);
    addJoint(kit, arm.joints[1], 0, 0.10, true);
    arm.joints[1].add(place(kit.lens(0.11, 0.19, 0.10, "metal", p.metal), 0, -0.20, -0.03));
    arm.tip.add(place(kit.ball(0.10, 0.10, 0.11, "hide", p.dark), 0, -0.05, -0.01));

    if (side < 0) {
      // 左手は素手の鉤爪。右手の得物と対にして、左右で情報を変える
      addClaws(kit, arm.tip, 4, 0.22, 0.032, 0.065);
    } else {
      // 右手の大鎌。
      // 「武器を持っている」ではなく「大鎌である」と一目で分かる必要があるので、
      // 柄は体高に近い長さ、刃は肩幅を超える大きさまで振り切る。
      // 湾曲した刃にすることで、直剣を持つバランス型とも混ざらない
      // 前腕の傾き(肩+肘で約 -0.34 rad)を打ち消して、柄をほぼ鉛直に立てる。
      // 寝かせると「棒を提げている」ようにしか見えず、刃が読めない
      const scythe = new THREE.Group();
      place(scythe, 0, -0.06, -0.02, 0.22, 0.12, 0.14);
      scythe.add(place(kit.link({ x: 0, y: -0.85, z: 0 }, { x: 0, y: 1.55, z: 0 }, 0.05, 0.038, "plate", p.plate, 6), 0, 0, 0));
      scythe.add(place(kit.band(0.07, 0.024, Math.PI * 2, "metal", p.metal, 12), 0, 0.5, 0, Math.PI / 2, 0, 0));
      scythe.add(place(kit.band(0.07, 0.024, Math.PI * 2, "metal", p.metal, 12), 0, -0.35, 0, Math.PI / 2, 0, 0));
      scythe.add(place(kit.octa(0.07, 0.14, 0.06, "crystal", p.accent), 0, -0.94, 0));
      // 刃の付け根の金具。柄と刃が「繋がっている」ように見せる
      scythe.add(place(kit.octa(0.09, 0.16, 0.08, "metal", p.metal), 0, 1.5, 0));
      // 刃(内側へ湾曲した爪を大きく使う)。峰の光は細い線に留める
      const blade = kit.claw(1.45, 0.13, 0.75, "metal", p.metal);
      place(blade, 0, 1.52, 0, 0, 0, -1.42);
      scythe.add(blade);
      const edge = kit.claw(1.36, 0.035, 0.8, "glow", p.glow);
      place(edge, 0.0, 1.55, -0.05, 0, 0, -1.48);
      scythe.add(edge);
      // 逆側の小刃。刃が一方向に伸びるだけの棒に見えないようにする
      const spur = kit.claw(0.38, 0.06, 0.5, "metal", p.metal);
      place(spur, 0, 1.46, 0.02, 0, 0, 1.85);
      scythe.add(spur);
      arm.tip.add(scythe);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.9));
  }

  // --- マント(裾が裂けた長い膜) ---
  const cape = new THREE.Group();
  markAnimated(cape);
  place(cape, 0, 0.72, 0.16, 0.1, 0, 0);
  cape.add(
    kit.membrane(
      (shape) => {
        shape.moveTo(-0.4, 0.06);
        shape.lineTo(0.4, 0.06);
        shape.lineTo(0.62, -1.35);
        shape.lineTo(0.42, -1.12);
        shape.lineTo(0.24, -1.42);
        shape.lineTo(0.05, -1.1);
        shape.lineTo(-0.16, -1.46);
        shape.lineTo(-0.38, -1.14);
        shape.lineTo(-0.6, -1.32);
      },
      "membrane",
      p.membrane,
      0.42,
    ),
  );
  // 肩で留める金具
  for (const side of [-1, 1]) {
    cape.add(place(kit.octa(0.07, 0.10, 0.05, "metal", p.metal), side * 0.32, 0.04, -0.04));
  }
  rig.torso.add(cape);
  rig.cloth.push({ group: cape, rest: cape.rotation.clone(), phase: 0, amount: 1 });

  // --- 頭(獣面ではなく、面を被った人型の顔) ---
  place(rig.neck, 0, 0.76, -0.02, -0.05, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.16, z: 0 }, 0.10, 0.09, "hide", p.dark));
  place(rig.head, 0, 0.18, 0, 0.08, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.16, 0.19, 0.17, "hide", p.deep), 0, 0.10, 0));
  // 面。目の高さで前へせり出す板が、影を落として表情を作る
  head.add(place(kit.lens(0.16, 0.17, 0.10, "metal", p.metal), 0, 0.14, -0.09, -0.06, 0, 0));
  head.add(place(kit.box(0.20, 0.04, 0.05, "glow", p.glow), 0, 0.11, -0.18));
  head.add(place(kit.box(0.09, 0.10, 0.04, "metal", p.metal), 0, 0.11, -0.19));
  // 顎の牙
  for (const side of [-1, 1]) {
    const fang = kit.spike(0.022, 0.09, 0.7, "plate", p.plate);
    place(fang, side * 0.055, 0.0, -0.13, AIM_DOWN, 0, 0);
    head.add(fang);
  }
  head.add(place(kit.lens(0.13, 0.07, 0.09, "hide", p.dark, 8), 0, 0.0, -0.10, 0.2, 0, 0));

  // 巨大な角。外へ回り込みながら上へ立ち上がり、正面幅を稼ぐ
  for (const side of [-1, 1]) {
    const curve: THREE.Vector3Like[] = [
      { x: side * 0.11, y: 0.22, z: 0.04 },
      { x: side * 0.26, y: 0.30, z: 0.22 },
      { x: side * 0.34, y: 0.56, z: 0.24 },
      { x: side * 0.26, y: 0.80, z: 0.04 },
      { x: side * 0.20, y: 0.92, z: -0.14 },
    ];
    head.add(kit.taperedTube(curve, 0.075, 0.006, "plate", p.plate, 6, 12));
    // 年輪の節
    for (let i = 0; i < 3; i++) {
      const ring = kit.band(0.075 - i * 0.012, 0.014, Math.PI * 2, "plate", p.plate, 8);
      place(ring, side * (0.16 + i * 0.06), 0.26 + i * 0.10, 0.14 + i * 0.05, 1.0, side * 0.6, 0);
      head.add(ring);
    }
    // 小さな副角
    head.add(
      kit.taperedTube(
        [
          { x: side * 0.13, y: 0.16, z: 0.10 },
          { x: side * 0.19, y: 0.10, z: 0.24 },
          { x: side * 0.17, y: 0.14, z: 0.36 },
        ],
        0.035,
        0.005,
        "plate",
        p.plate,
        5,
        7,
      ),
    );
  }

  // 背後に漂う破片。魔力を纏っていることを、体を明るくせずに示す
  for (let i = 0; i < 4; i++) {
    const shard = kit.octa(0.05, 0.13, 0.05, "crystal", p.accent);
    rig.core.add(shard);
    rig.orbiters.push({
      object: shard,
      radius: 0.9 + (i % 2) * 0.24,
      height: 1.3 + i * 0.28,
      speed: -0.35 - i * 0.06,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.3,
      spin: 0.8,
    });
  }

  addTail(kit, rig, [0, 0.0, 0.2], 5, 0.19, 0.075, -1.4, -0.18, true);

  rig.anim = {
    idleSpeed: 0.82,
    breath: 1.1,
    bob: 0.028,
    headSway: 0.75,
    tailWave: 1.0,
    wingFlap: 0,
    sway: 0.8,
    lunge: 1.5,
    squash: 0,
    attack: "lunge",
  };
}

// ---------------------------------------------------------------------------
// golem: 岩の巨人
// ---------------------------------------------------------------------------

/**
 * ゴーレム。
 *
 * 役割(ディフェンダー)の骨格は「装甲を着た人型」に寄っていて、
 * 岩そのものが動いている感じが出ていなかった。
 * ここでは首を無くし、肩を極端に広げ、腕を膝下まで伸ばして、
 * 「積み上がった岩塊が歩いている」比率に組み直す。
 */
function buildGolem(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0.92;

  // --- 腰(横に広い岩の台) ---
  rig.pelvis.add(place(kit.rock(0.52, 0.26, 0.42, "hide", p.main, 0.26), 0, -0.04, 0));
  rig.pelvis.add(place(kit.rock(0.30, 0.16, 0.26, "hide", p.dark, 0.3), 0, -0.14, 0.16));

  // --- 脚(太く短い柱) ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.34, r0: 0.30, r1: 0.27, rot: [0.06, 0, side * 0.05], radial: 6 },
        { len: 0.32, r0: 0.26, r1: 0.29, rot: [-0.08, 0, 0], radial: 6 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.34, -0.08, 0);
    leg.joints[0].add(place(kit.rock(0.30, 0.20, 0.28, "hide", p.main, 0.24), 0, -0.18, 0));
    addJoint(kit, leg.joints[1], 0, 0.24, false);
    leg.joints[1].add(place(kit.rock(0.28, 0.20, 0.26, "hide", p.main, 0.24), 0, -0.18, -0.02));
    leg.tip.add(place(kit.rock(0.34, 0.17, 0.44, "hide", p.dark, 0.2), 0, -0.08, -0.08));
    // 爪先の岩の指
    for (let i = -1; i <= 1; i++) {
      leg.tip.add(place(kit.rock(0.10, 0.08, 0.12, "hide", p.dark, 0.3), i * 0.17, -0.10, -0.28));
    }
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.5));
  }

  // --- 胴(下から上へ大きくなる3段の岩。段の隙間から光が漏れる) ---
  const torso = rig.torso;
  place(torso, 0, 0.02, 0, -0.05, 0, 0);
  const stack: { y: number; size: [number, number, number]; jitter: number }[] = [
    { y: 0.24, size: [0.46, 0.24, 0.38], jitter: 0.26 },
    { y: 0.60, size: [0.62, 0.28, 0.48], jitter: 0.24 },
    { y: 0.96, size: [0.84, 0.30, 0.54], jitter: 0.22 },
  ];
  for (const [index, block] of stack.entries()) {
    torso.add(place(kit.rock(block.size[0], block.size[1], block.size[2], "hide", p.main, block.jitter), 0, block.y, 0, 0, index * 0.4, 0));
    // 段の継ぎ目。細い線なので、光っても画面全体を持ち上げない
    torso.add(
      place(
        kit.box(block.size[0] * 1.2, 0.022, 0.05, "glow", p.glow),
        0,
        block.y - block.size[1] * 0.95,
        -block.size[2] * 0.72,
        0.1,
        0,
        0.04,
      ),
    );
  }
  // 胸の動力核。岩の隙間に埋まった結晶
  torso.add(place(kit.rock(0.26, 0.24, 0.16, "hide", p.dark, 0.3), 0, 0.62, -0.44));
  torso.add(place(kit.octa(0.14, 0.20, 0.12, "crystal", p.accent), 0, 0.62, -0.48));
  torso.add(place(kit.octa(0.06, 0.10, 0.05, "glow", p.glow), 0, 0.62, -0.50));
  // 背に生えた結晶柱
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const shard = kit.octa(0.09, 0.30 - Math.abs(t - 0.5) * 0.28, 0.09, "crystal", p.accent);
    place(shard, (t - 0.5) * 0.78, 1.02 + Math.sin(t * Math.PI) * 0.16, 0.30, 0.55, 0, (t - 0.5) * 1.5);
    torso.add(shard);
  }
  // 肩に載る大岩
  for (const side of [-1, 1]) {
    torso.add(place(kit.rock(0.34, 0.32, 0.34, "hide", p.main, 0.3), side * 0.90, 1.02, 0));
    torso.add(place(kit.rock(0.20, 0.16, 0.20, "hide", p.dark, 0.34), side * 0.98, 1.24, 0.02));
    for (let i = 0; i < 2; i++) {
      const crag = kit.rock(0.13, 0.20, 0.13, "hide", p.main, 0.32);
      place(crag, side * (0.80 + i * 0.2), 1.30 + i * 0.06, -0.14 + i * 0.24, 0, 0, -side * 0.4);
      torso.add(crag);
    }
  }

  // --- 腕(膝下まで届く。ゴリラのような重心の低さを出す) ---
  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.58, r0: 0.27, r1: 0.23, rot: [0.16, 0, side * 0.12], radial: 6 },
        { len: 0.56, r0: 0.23, r1: 0.26, rot: [-0.14, 0, 0], radial: 6 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.90, 0.96, 0);
    arm.joints[0].add(place(kit.rock(0.28, 0.24, 0.26, "hide", p.main, 0.24), 0, -0.28, 0));
    addJoint(kit, arm.joints[1], 0, 0.24, false);
    arm.joints[1].add(place(kit.rock(0.27, 0.26, 0.25, "hide", p.main, 0.26), 0, -0.28, -0.02));
    // 拳。前腕より一回り大きい岩にすると、重さが読める
    arm.tip.add(place(kit.rock(0.34, 0.30, 0.34, "hide", p.main, 0.22), 0, -0.18, -0.02));
    for (let i = -1; i <= 1; i++) {
      arm.tip.add(place(kit.rock(0.11, 0.10, 0.12, "hide", p.dark, 0.3), i * 0.19, -0.20, -0.28));
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 0.6));
  }

  // --- 頭(首を持たず、肩の間に沈む小さな岩) ---
  // 完全に埋めると顔が読めないので、肩の稜線からわずかに出す高さで止める
  place(rig.neck, 0, 1.20, -0.10, -0.08, 0, 0);
  place(rig.head, 0, 0.08, 0, 0.16, 0, 0);
  const head = rig.head;
  head.add(place(kit.rock(0.30, 0.24, 0.28, "hide", p.main, 0.26), 0, 0.10, 0));
  head.add(place(kit.rock(0.32, 0.11, 0.22, "hide", p.dark, 0.3), 0, 0.26, 0.02));
  // 目は一本の光る裂け目。顔のパーツを作り込まない方が石らしい。
  // 眉庇を前へ張り出させ、その影の中で光らせることで、小さくても顔の位置が分かる
  head.add(place(kit.rock(0.30, 0.13, 0.10, "hide", p.deep, 0.2), 0, 0.06, -0.24));
  head.add(place(kit.box(0.32, 0.055, 0.04, "glow", p.glow), 0, 0.07, -0.29));
  head.add(place(kit.rock(0.34, 0.12, 0.20, "hide", p.main, 0.24), 0, 0.20, -0.20, -0.3, 0, 0));
  for (const side of [-1, 1]) {
    const crag = kit.rock(0.10, 0.17, 0.10, "hide", p.main, 0.3);
    place(crag, side * 0.20, 0.24, 0.04, 0, 0, -side * 0.5);
    head.add(crag);
  }

  // 周囲を漂う岩片。重い体が動かない分、周りが動いて生気を作る
  for (let i = 0; i < 4; i++) {
    const chunk = kit.rock(0.10, 0.09, 0.10, "hide", p.dark, 0.4);
    rig.core.add(chunk);
    rig.orbiters.push({
      object: chunk,
      radius: 1.05 + (i % 2) * 0.2,
      height: 0.8 + i * 0.3,
      speed: 0.3 + i * 0.05,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.4,
      spin: 0.5,
    });
  }

  rig.anim = {
    idleSpeed: 0.5,
    breath: 1.5,
    bob: 0.016,
    headSway: 0.3,
    tailWave: 0,
    wingFlap: 0,
    sway: 0.45,
    lunge: 0.7,
    squash: 0,
    attack: "slam",
  };
}

// ---------------------------------------------------------------------------
// fairy: 妖精
// ---------------------------------------------------------------------------

/**
 * 妖精。
 *
 * 役割(ヒーラー)の骨格は「裾の長い僧衣+杖」で、体格も他と同じ大きさだった。
 * 妖精は小柄であること自体が特徴なので、頭身を下げ、薄い翅で浮かせ、
 * 足を出して宙にぶら下げる。杖ではなく小さな花の錫杖を持たせる。
 */
function buildFairy(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.floats = true;
  rig.pelvis.position.y = 1.0;

  // --- 短い衣。裾から脚が出ているので、丈は膝上で止める ---
  rig.pelvis.add(place(kit.ball(0.18, 0.16, 0.16, "hide", p.main), 0, 0, 0));
  rig.pelvis.add(
    kit.lathe(
      [
        [0.20, -0.42],
        [0.30, -0.30],
        [0.26, -0.12],
        [0.19, 0.04],
        [0.14, 0.14],
      ],
      "cloth",
      p.cloth,
      18,
    ),
  );
  // 裾の花弁。円錐の縁を割って、布の柔らかさを出す
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + 0.3;
    const petal = kit.spike(0.10, 0.24, 0.4, "cloth", p.cloth);
    place(petal, Math.cos(angle) * 0.26, -0.34, Math.sin(angle) * 0.26, Math.PI - 0.35, -angle, 0);
    rig.pelvis.add(petal);
  }
  rig.pelvis.add(place(kit.band(0.19, 0.022, Math.PI * 2, "metal", p.metal, 14), 0, 0.06, 0, Math.PI / 2, 0, 0));

  // --- 細い脚。浮いているので、爪先が下を向いたまま垂れる ---
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.30, r0: 0.055, r1: 0.042, rot: [0.22, 0, side * 0.10], radial: 6 },
        { len: 0.26, r0: 0.04, r1: 0.03, rot: [-0.2, 0, 0], radial: 6 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.11, -0.16, 0);
    leg.tip.add(place(kit.ball(0.045, 0.05, 0.09, "hide", p.dark, 8), 0, -0.02, -0.03));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 1.3));
  }

  // --- 胴。小柄なので細く短く ---
  const torso = rig.torso;
  place(torso, 0, 0.10, 0, -0.04, 0, 0);
  torso.add(place(kit.ball(0.15, 0.19, 0.12, "hide", p.main), 0, 0.14, 0));
  torso.add(place(kit.lathe([[0.13, 0.02], [0.19, 0.16], [0.13, 0.30]], "cloth", p.cloth, 16), 0, 0, 0));
  torso.add(place(kit.band(0.19, 0.016, Math.PI * 2, "plate", p.plate, 16), 0, 0.16, 0, Math.PI / 2, 0, 0));
  torso.add(place(kit.octa(0.05, 0.07, 0.035, "glow", p.glow), 0, 0.22, -0.13));

  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.22, r0: 0.045, r1: 0.035, rot: [0.16, 0, side * 0.62], radial: 6 },
        { len: 0.20, r0: 0.033, r1: 0.026, rot: [0.4, 0, -side * 0.3], radial: 6 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.15, 0.26, -0.02);
    arm.tip.add(place(kit.ball(0.04, 0.038, 0.04, "hide", p.dark, 8), 0, -0.02, 0));

    if (side < 0) {
      // 花の錫杖。小さいので、輪郭が読めるよう先端だけを大きくする
      const wand = new THREE.Group();
      place(wand, 0, -0.03, -0.02, -0.5, 0, -side * 0.35);
      wand.add(place(kit.link({ x: 0, y: -0.16, z: 0 }, { x: 0, y: 0.36, z: 0 }, 0.016, 0.012, "plate", p.plate, 6), 0, 0, 0));
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const petal = kit.lens(0.055, 0.085, 0.02, "cloth", p.cloth, 8);
        place(petal, Math.cos(angle) * 0.06, 0.40, Math.sin(angle) * 0.06, 0, -angle, 0.9);
        wand.add(petal);
      }
      wand.add(place(kit.octa(0.035, 0.05, 0.035, "glow", p.glow), 0, 0.42, 0));
      arm.tip.add(wand);
    }
    rig.torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.5));
  }

  // --- 頭(頭身を下げて、目を大きく) ---
  place(rig.neck, 0, 0.34, 0);
  place(rig.head, 0, 0.06, 0, 0.04, 0, 0);
  const head = rig.head;
  head.add(place(kit.ball(0.20, 0.21, 0.19, "hide", p.main), 0, 0.14, 0));
  addRoundEyes(kit, head, 0.085, 0.14, -0.18, 0.062);
  // 髪。房を後ろへ流して、丸い頭の輪郭を割る。
  // 上へ立てるとトサカになってしまうので、寝かせて後頭部から垂らす
  head.add(place(kit.ball(0.21, 0.19, 0.20, "fur", p.fur, 12), 0, 0.19, 0.03));
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const strand = kit.spike(0.07, 0.30 - Math.abs(t) * 0.10, 0.8, "fur", p.fur);
    place(strand, t * 0.28, 0.20, 0.12 + Math.abs(t) * 0.04, 2.9, 0, -t * 1.0);
    head.add(strand);
  }
  // 触角。先端の光点が視線を頭へ集める
  for (const side of [-1, 1]) {
    head.add(
      kit.taperedTube(
        [
          { x: side * 0.05, y: 0.30, z: 0.02 },
          { x: side * 0.12, y: 0.44, z: -0.04 },
          { x: side * 0.15, y: 0.54, z: -0.14 },
        ],
        0.014,
        0.004,
        "plate",
        p.plate,
        4,
        7,
      ),
    );
    head.add(place(kit.ball(0.03, 0.03, 0.03, "glow", p.glow, 8), side * 0.15, 0.55, -0.15));
  }
  // 花冠
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    const bloom = kit.lens(0.05, 0.03, 0.05, "cloth", p.cloth, 8);
    place(bloom, Math.cos(angle) * 0.19, 0.30, Math.sin(angle) * 0.19, 0.5, -angle, 0);
    head.add(bloom);
  }

  // --- 翅(前後2枚1組を左右に。薄さで妖精と分かる) ---
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.10, 0.26, 0.10, 0.12, -side * 0.62, side * 0.30);
    addInsectWing(kit, wing, side, 0.92);
    rig.torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  // 鱗粉。小さな光点が周回して、浮遊感を補強する
  for (let i = 0; i < 6; i++) {
    const mote = kit.octa(0.028, 0.05, 0.028, "glow", p.glow);
    rig.core.add(mote);
    rig.orbiters.push({
      object: mote,
      radius: 0.5 + (i % 3) * 0.16,
      height: 0.5 + i * 0.16,
      speed: 0.7 + i * 0.08,
      phase: (i / 6) * Math.PI * 2,
      tilt: 0.5,
      spin: 1.4,
    });
  }

  rig.anim = {
    idleSpeed: 1.35,
    breath: 0.5,
    bob: 0.11,
    headSway: 1.15,
    tailWave: 0,
    wingFlap: 1.5,
    sway: 0.45,
    lunge: 0.6,
    squash: 0,
    attack: "cast",
  };
}

// ---------------------------------------------------------------------------
// 豚2種
// ---------------------------------------------------------------------------

/**
 * 転生ピッグ。四足で立つ丸い豚に、小さな羽根と光輪を足す。
 * 「経験値の豚」と並べた時、翼と光輪の有無・立ち姿で見分けられるようにする。
 */
function buildReincarnationPig(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.yawBias = 0.30;
  rig.pelvis.position.y = 0.62;

  // 樽のような胴。前後に長く、腹が下に垂れる
  rig.pelvis.add(place(kit.ball(0.36, 0.33, 0.50, "hide", p.main), 0, 0.02, 0));
  rig.pelvis.add(place(kit.ball(0.32, 0.26, 0.30, "hide", p.dark), 0, -0.12, -0.04));
  rig.pelvis.add(place(kit.ball(0.30, 0.28, 0.24, "hide", p.main), 0, 0.02, 0.34));
  // 背の筋
  rig.pelvis.add(place(kit.ball(0.16, 0.10, 0.42, "hide", p.main, 10), 0, 0.28, 0.02));

  addPigLegs(kit, rig, 1.0, 0.22, true);
  addPigLegs(kit, rig, 1.0, 0.23, false);
  addCurlyTail(kit, rig.pelvis, [0, 0.18, 0.44], 1.0);

  const torso = rig.torso;
  place(torso, 0, 0.06, -0.30, 0.02, 0, 0);

  // 小さな羽根。体に対して小さいほど「おまけで飛んでいる」愛嬌が出る。
  // 枚数が少ないと1枚が大きくなって木の葉に見えるので、細かく多めに刻む
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    markAnimated(wing);
    place(wing, side * 0.14, 0.30, 0.24, 0.1, -side * 0.75, side * 0.2);
    addFeatherWing(kit, wing, side, 9, 0.46);
    torso.add(wing);
    rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
  }

  // 首。豚は首が無いに等しいので、頭を胴に食い込ませて繋ぐ。
  // 離すと「胴の上に頭が浮いている」ように見えてしまう
  place(rig.neck, 0, 0.02, -0.38, 0.30, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: -0.06, z: 0.04 }, { x: 0, y: 0.14, z: -0.02 }, 0.26, 0.24, "hide", p.main));
  place(rig.head, 0, 0.10, -0.02, 0.14, 0, 0);
  addPigHead(kit, rig.head, 0.92, 0.7);

  // 光輪。輪は細く小さく保ち、体表を明るくせずに「転生」の記号だけを置く
  const halo = kit.ring(0.20, 0.018, "glow", p.glow, 26);
  place(halo, 0, 0.62, 0.04, Math.PI / 2 - 0.2, 0, 0);
  rig.head.add(halo);
  rig.spinners.push({ object: halo, axis: "z", speed: 0.7 });

  // 巡る光の粒
  for (let i = 0; i < 4; i++) {
    const mote = kit.octa(0.035, 0.06, 0.035, "crystal", p.accent);
    rig.core.add(mote);
    rig.orbiters.push({
      object: mote,
      radius: 0.62,
      height: 0.5 + i * 0.16,
      speed: 0.6 + i * 0.06,
      phase: (i / 4) * Math.PI * 2,
      tilt: 0.35,
      spin: 1.0,
    });
  }

  rig.anim = {
    idleSpeed: 1.7,
    breath: 1.1,
    bob: 0.05,
    headSway: 1.4,
    tailWave: 1.0,
    wingFlap: 1.1,
    sway: 1.1,
    lunge: 1.2,
    squash: 0,
    attack: "dash",
  };
}

/**
 * 経験値ピッグ。同じ豚だが、後ろ脚で座り、背中に経験値の結晶を背負う。
 * 転生ピッグ(四足・翼・光輪)と、立ち姿からして別物に見えるようにする。
 */
function buildExpPig(kit: CreatureKit, rig: CreatureRig): void {
  const p = kit.palette;
  rig.pelvis.position.y = 0.66;

  // 座った下半身。床に接する尻を大きく取る
  rig.pelvis.add(place(kit.ball(0.42, 0.32, 0.40, "hide", p.main), 0, -0.06, 0.06));
  rig.pelvis.add(place(kit.ball(0.34, 0.22, 0.30, "hide", p.dark), 0, -0.18, 0.10));
  addCurlyTail(kit, rig.pelvis, [0, 0.06, 0.34], 1.05);

  // 折り畳んだ後ろ脚。座っているので前へ投げ出す
  for (const side of [-1, 1]) {
    const leg = kit.chain(
      [
        { len: 0.26, r0: 0.13, r1: 0.11, rot: [1.15, 0, side * 0.2], radial: 7 },
        { len: 0.22, r0: 0.10, r1: 0.085, rot: [-1.05, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    leg.root.position.set(side * 0.26, -0.14, -0.06);
    leg.tip.add(place(kit.ball(0.10, 0.075, 0.13, "plate", p.plate, 8), 0, -0.02, -0.05));
    rig.pelvis.add(leg.root);
    rig.legs.push(limbFrom(leg, side, side * 0.8));
  }

  // 前に突き出た腹
  const torso = rig.torso;
  place(torso, 0, 0.12, 0, -0.04, 0, 0);
  torso.add(place(kit.ball(0.40, 0.36, 0.38, "hide", p.main), 0, 0.20, -0.04));
  torso.add(place(kit.ball(0.34, 0.26, 0.30, "hide", p.dark), 0, 0.06, -0.14));
  torso.add(place(kit.band(0.34, 0.03, Math.PI * 1.2, "metal", p.metal, 14), 0, 0.10, -0.06, Math.PI / 2, -Math.PI * 0.6, 0));

  // 背負った経験値の結晶。転生ピッグとの一番の見分けどころなので、
  // 後ろ姿だけでも「何かを背負っている」と分かる大きさまで持ち上げる
  torso.add(place(kit.ball(0.30, 0.22, 0.20, "hide", p.dark, 10), 0, 0.34, 0.28));
  torso.add(place(kit.band(0.26, 0.035, Math.PI * 2, "metal", p.metal, 14), 0, 0.36, 0.28, 0.35, 0, 0));
  for (let i = 0; i < 3; i++) {
    const t = i - 1;
    const gem = kit.octa(0.15 - Math.abs(t) * 0.04, 0.42 - Math.abs(t) * 0.14, 0.15 - Math.abs(t) * 0.04, "crystal", p.accent);
    place(gem, t * 0.24, 0.62 - Math.abs(t) * 0.14, 0.32, -0.35, 0, -t * 0.5);
    torso.add(gem);
  }
  torso.add(place(kit.octa(0.05, 0.16, 0.05, "glow", p.glow), 0, 0.64, 0.34, -0.35, 0, 0));

  // 短い前脚。座っているので胸の前に垂らす
  for (const side of [-1, 1]) {
    const arm = kit.chain(
      [
        { len: 0.20, r0: 0.10, r1: 0.08, rot: [0.5, 0, side * 0.55], radial: 7 },
        { len: 0.16, r0: 0.075, r1: 0.06, rot: [-0.55, 0, 0], radial: 7 },
      ],
      "hide",
      p.main,
    );
    arm.root.position.set(side * 0.32, 0.22, -0.12);
    arm.tip.add(place(kit.ball(0.08, 0.07, 0.09, "plate", p.plate, 8), 0, -0.02, -0.02));
    torso.add(arm.root);
    rig.arms.push(limbFrom(arm, side, side * 1.8));
  }

  // 首。座り姿なので頭は腹の真上。二段の球に見えないよう、
  // 顎の下に肉を足して胴と繋げる
  place(rig.neck, 0, 0.40, -0.12, 0.04, 0, 0);
  rig.neck.add(kit.link({ x: 0, y: -0.06, z: 0.02 }, { x: 0, y: 0.10, z: -0.02 }, 0.26, 0.24, "hide", p.main));
  place(rig.head, 0, 0.06, -0.02, 0.04, 0, 0);
  rig.head.add(place(kit.ball(0.24, 0.14, 0.22, "hide", p.dark, 10), 0, 0.06, -0.04));
  addPigHead(kit, rig.head, 1.0, 0.35);

  // とんがり帽子。座り姿と合わせて、遠目のシルエットを転生ピッグから分ける
  const hat = new THREE.Group();
  place(hat, 0, 0.50, 0.04, -0.16, 0, 0.1);
  hat.add(place(kit.cone(0.24, 0.46, "cloth", p.cloth, 10), 0, 0, 0));
  hat.add(place(kit.band(0.24, 0.03, Math.PI * 2, "metal", p.metal, 14), 0, 0.03, 0, Math.PI / 2, 0, 0));
  hat.add(place(kit.octa(0.05, 0.08, 0.05, "glow", p.glow), 0, 0.50, 0));
  rig.head.add(hat);

  rig.anim = {
    idleSpeed: 1.45,
    breath: 1.5,
    bob: 0.06,
    headSway: 1.2,
    tailWave: 1.2,
    wingFlap: 0,
    sway: 1.2,
    lunge: 0.9,
    squash: 0,
    attack: "dash",
  };
}

// ---------------------------------------------------------------------------
// 登録
// ---------------------------------------------------------------------------

/**
 * 専用骨格を持つ種別。
 * ここに載っている種別は、役割ビルダーを一切通さずにこちらで組む。
 */
const TEMPLATE_BUILDERS: Record<string, CreatureBuilder> = {
  slime: { build: buildSlime, height: 1.72, float: 0 },
  wolf: { build: buildWolf, height: 2.05, float: 0 },
  nemesis: { build: buildNemesis, height: 2.72, float: 0 },
  golem: { build: buildGolem, height: 2.5, float: 0 },
  fairy: { build: buildFairy, height: 1.72, float: 0.62 },
  reincarnation_pig: { build: buildReincarnationPig, height: 1.42, float: 0.08 },
  exp_pig: { build: buildExpPig, height: 1.34, float: 0 },
};

/** 種別専用の骨格。無ければ null(役割の骨格を使う) */
export function templateBuilderFor(templateId: string): CreatureBuilder | null {
  return TEMPLATE_BUILDERS[templateId] ?? null;
}

/**
 * 役割の骨格へ足す、種別固有の造形。
 * 骨格そのものは役割のままでよく、翼や飾りだけで見分けが付く種別に使う。
 */
const TEMPLATE_TRAITS: Record<string, (kit: CreatureKit, rig: CreatureRig) => void> = {
  /** ドラゴン: 大きな皮膜の翼。畳まずに広げて、横幅のあるシルエットにする */
  dragon: (kit, rig) => {
    const a = rig.wingAnchor;
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      markAnimated(wing);
      place(wing, side * a.x, a.y, a.z, 0.16, -side * 0.42, side * 0.12);
      addBatWing(kit, wing, side, 1.3);
      rig.torso.add(wing);
      rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
    }
    rig.anim.wingFlap = 0.55;
  },

  /** グリフォン: 羽毛の翼と、頭の羽根飾り。鳥類寄りのシルエットにする */
  griffon: (kit, rig) => {
    const p = kit.palette;
    const a = rig.wingAnchor;
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      markAnimated(wing);
      place(wing, side * a.x, a.y, a.z - 0.04, 0.24, -side * 0.5, 0);
      addFeatherWing(kit, wing, side, 8, 1.15);
      rig.torso.add(wing);
      rig.wings.push({ root: wing, rootRest: wing.rotation.clone(), lower: null, lowerRest: null, tip: wing, side, phase: 0 });
    }
    // 後頭部の羽根飾り
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const crest = kit.spike(0.028, 0.2 + Math.sin(t * Math.PI) * 0.12, 0.5, "plate", p.plate);
      place(crest, (t - 0.5) * 0.13, 0.13, 0.1, -0.5, Math.PI / 2, 0);
      rig.head.add(crest);
    }
    rig.anim.wingFlap = 0.85;
  },

  /** セラフ: 二対の光の翼と光輪。天使的なシルエットで他と明確に分ける */
  seraph: (kit, rig) => {
    const p = kit.palette;
    for (const side of [-1, 1]) {
      for (const [index, spec] of [
        { y: 0.72, span: 1.15, pitch: 0.1 },
        { y: 0.44, span: 0.86, pitch: 0.5 },
      ].entries()) {
        const wing = new THREE.Group();
        markAnimated(wing);
        place(wing, side * 0.24, rig.wingAnchor.y - 0.28 + spec.y, 0.14, spec.pitch, -side * 0.46, 0);
        addFeatherWing(kit, wing, side, 7, spec.span);
        rig.torso.add(wing);
        rig.wings.push({
          root: wing,
          rootRest: wing.rotation.clone(),
          lower: null,
          lowerRest: null,
          tip: wing,
          side,
          // 上下の翼で位相をずらし、順に羽ばたいて見えるようにする
          phase: index * 0.9,
        });
      }
    }
    const halo = kit.ring(0.26, 0.026, "glow", p.glow, 30);
    place(halo, 0, 0.46, 0.04, Math.PI / 2, 0, 0);
    rig.head.add(halo);
    rig.spinners.push({ object: halo, axis: "z", speed: 0.5 });
    rig.anim.wingFlap = 0.4;
  },

  /** 古代の魔人: 顔の周りに漂う呪符状の破片で、同じボス骨格の中でも「主」に見せる */
  ancient_demon: (kit, rig) => {
    const p = kit.palette;
    for (let i = 0; i < 6; i++) {
      const shard = kit.octa(0.07, 0.18, 0.05, "crystal", p.accent);
      rig.core.add(shard);
      rig.orbiters.push({
        object: shard,
        radius: 1.15 + (i % 2) * 0.3,
        height: 1.5 + i * 0.22,
        speed: -0.28 - i * 0.04,
        phase: (i / 6) * Math.PI * 2,
        tilt: 0.35,
        spin: 0.6,
      });
    }
    // 額の第三の目
    rig.head.add(place(kit.ball(0.06, 0.09, 0.04, "glow", p.glow, 10), 0, 0.34, -0.24));
    rig.head.add(place(kit.lens(0.11, 0.14, 0.06, "plate", p.plate, 8), 0, 0.34, -0.20, 0, 0, 0));
  },

  /** 古代の呪晶: 本体を縛る拘束環。同じ結晶系のサポートと役割の差を形で出す */
  ancient_crystal_curse: (kit, rig) => {
    const p = kit.palette;
    for (let i = 0; i < 3; i++) {
      const ring = kit.ring(0.42 - i * 0.06, 0.03, "metal", p.metal, 20);
      place(ring, 0, 0.2 + i * 0.3, 0, Math.PI / 2 + (i - 1) * 0.4, i * 0.6, 0);
      rig.torso.add(ring);
      rig.spinners.push({ object: ring, axis: i % 2 === 0 ? "z" : "y", speed: (i % 2 === 0 ? 1 : -1) * (0.3 + i * 0.15) });
    }
  },
};

/** 種別固有の造形を足す。該当がなければ何もしない(役割ビルダーのままになる) */
export function applyTemplateTraits(templateId: string, kit: CreatureKit, rig: CreatureRig): void {
  TEMPLATE_TRAITS[templateId]?.(kit, rig);
}
