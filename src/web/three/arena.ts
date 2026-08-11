import * as THREE from "three";
import { SIMPLEX_NOISE_3D } from "./shaderChunks.js";

const GROUND_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorld = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const GROUND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uBaseColor;
uniform vec3 uGridColor;
uniform vec3 uGlowColor;
varying vec2 vUv;
varying vec3 vWorld;

${SIMPLEX_NOISE_3D}

/** 等間隔の線を、距離に応じて太さを補正しながら描く(遠景でモアレが出ないように) */
float gridLine(vec2 coord, float spacing, float thickness) {
  vec2 grid = abs(fract(coord / spacing - 0.5) - 0.5) / fwidth(coord / spacing);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line * thickness, 1.0);
}

void main() {
  float distanceFromCenter = length(vWorld.xz);

  // 中央の闘技場だけを明るく残し、外周は闇に溶かす
  float arena = 1.0 - smoothstep(9.0, 24.0, distanceFromCenter);
  float vignette = 1.0 - smoothstep(3.0, 20.0, distanceFromCenter);

  vec3 color = uBaseColor * (0.25 + vignette * 0.55);

  // 二重のグリッド。細かい線と太い線を重ねて情報量を出す
  float fine = gridLine(vWorld.xz, 1.0, 1.4);
  float coarse = gridLine(vWorld.xz, 5.0, 2.2);
  color += uGridColor * fine * 0.16 * arena;
  color += uGridColor * coarse * 0.3 * arena;

  // 中心から外へ広がるエネルギーの波
  float wave = sin(distanceFromCenter * 1.1 - uTime * 1.6);
  float pulse = smoothstep(0.86, 1.0, wave) * arena;
  color += uGlowColor * pulse * 0.5;

  // 床面のざらつき
  float grain = snoise(vec3(vWorld.xz * 0.35, uTime * 0.05));
  color += grain * 0.02;

  // 闘技場の外周リング
  float edge = smoothstep(0.06, 0.0, abs(distanceFromCenter - 9.0));
  color += uGlowColor * edge * 0.8;

  gl_FragColor = vec4(color, 1.0);
}
`;

const SKY_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uHorizon;
uniform float uTime;
varying vec3 vWorld;

${SIMPLEX_NOISE_3D}

void main() {
  vec3 direction = normalize(vWorld);
  float height = direction.y * 0.5 + 0.5;

  // 地平線付近を明るくした3色グラデーション
  vec3 color = mix(uBottom, uHorizon, smoothstep(0.0, 0.5, height));
  color = mix(color, uTop, smoothstep(0.42, 1.0, height));

  // ゆっくり流れる霧状の雲
  float clouds = fbm(vec3(direction.xz * 2.4, uTime * 0.02));
  color += uHorizon * smoothstep(0.1, 0.75, clouds) * 0.14 * (1.0 - abs(direction.y));

  // 上空にうっすら星
  float stars = snoise(direction * 90.0);
  color += vec3(smoothstep(0.93, 1.0, stars)) * smoothstep(0.25, 0.9, height) * 0.5;

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface ArenaHandles {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
}

/**
 * 闘技場の背景を作る。空(内側から見る球)・床・浮遊する塵・
 * 遠景の柱で、キャラクターを引き立てる暗く重厚なステージにする。
 */
export function createArena(): ArenaHandles {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // --- 空 ---
  const skyGeometry = new THREE.SphereGeometry(90, 32, 24);
  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uTop: { value: new THREE.Color(0x05060f) },
      uHorizon: { value: new THREE.Color(0x2a1f4a) },
      uBottom: { value: new THREE.Color(0x0a0812) },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  group.add(sky);
  disposables.push(skyGeometry, skyMaterial);

  // --- 床 ---
  const groundGeometry = new THREE.PlaneGeometry(120, 120, 1, 1);
  const groundMaterial = new THREE.ShaderMaterial({
    vertexShader: GROUND_VERTEX,
    fragmentShader: GROUND_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uBaseColor: { value: new THREE.Color(0x141726) },
      uGridColor: { value: new THREE.Color(0x4a6fd8) },
      uGlowColor: { value: new THREE.Color(0x5c7cff) },
    },
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundGeometry, groundMaterial);

  // --- 遠景の柱(奥行きとスケール感を出す) ---
  const pillarGeometry = new THREE.CylinderGeometry(0.55, 0.85, 16, 6, 1, true);
  const pillarMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1c30,
    roughness: 0.85,
    metalness: 0.25,
    emissive: new THREE.Color(0x2b3570),
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  disposables.push(pillarGeometry, pillarMaterial);
  const pillarCount = 10;
  for (let i = 0; i < pillarCount; i++) {
    const angle = (i / pillarCount) * Math.PI * 2 + Math.PI / pillarCount;
    const radius = 15.5;
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    pillar.position.set(Math.cos(angle) * radius, 8, Math.sin(angle) * radius);
    pillar.rotation.y = angle;
    group.add(pillar);
  }

  // --- 空中を漂う塵 ---
  const dustCount = 420;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSpeeds = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const radius = 3 + Math.random() * 16;
    const angle = Math.random() * Math.PI * 2;
    dustPositions[i * 3 + 0] = Math.cos(angle) * radius;
    dustPositions[i * 3 + 1] = Math.random() * 12;
    dustPositions[i * 3 + 2] = Math.sin(angle) * radius;
    dustSpeeds[i] = 0.15 + Math.random() * 0.45;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE.PointsMaterial({
    color: 0x9db4ff,
    size: 0.075,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  group.add(dust);
  disposables.push(dustGeometry, dustMaterial);

  function update(elapsed: number): void {
    skyMaterial.uniforms.uTime.value = elapsed;
    groundMaterial.uniforms.uTime.value = elapsed;

    // 塵をゆっくり上昇させ、天井に達したら下から出し直す
    const positions = dustGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3 + 1] += dustSpeeds[i] * 0.016;
      if (positions[i * 3 + 1] > 12) positions[i * 3 + 1] = 0;
    }
    dustGeometry.attributes.position.needsUpdate = true;
    dust.rotation.y = elapsed * 0.012;
  }

  function dispose(): void {
    for (const item of disposables) item.dispose();
  }

  return { group, update, dispose };
}
