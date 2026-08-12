import * as THREE from "three";
import { Element } from "../../core/element.js";

/**
 * 3Dバトルシーンの属性別アートディレクション。
 * 2D UI用のELEMENT_COLOR(単色)とは別に、3D表現では
 * コア/リム/発光/パーティクルで色を作り分けることで
 * 立体感と属性ごとの「らしさ」を出す。
 */
export interface ElementTheme {
  /** body内部の発光コア色 */
  core: THREE.Color;
  /** 外殻のベース色 */
  shell: THREE.Color;
  /** フレネルリムライトの色(輪郭の光) */
  rim: THREE.Color;
  /** スキル演出・パーティクルの主色 */
  vfx: THREE.Color;
  /** キャラを照らす属性ライトの色 */
  light: THREE.Color;
  /** 足元の魔法陣の色 */
  ground: THREE.Color;
}

function theme(core: number, shell: number, rim: number, vfx: number, light: number, ground: number): ElementTheme {
  return {
    core: new THREE.Color(core),
    shell: new THREE.Color(shell),
    rim: new THREE.Color(rim),
    vfx: new THREE.Color(vfx),
    light: new THREE.Color(light),
    ground: new THREE.Color(ground),
  };
}

export const ELEMENT_THEME: Record<Element, ElementTheme> = {
  FIRE: theme(0xfff1c9, 0x8c2118, 0xff6b2c, 0xff7a1a, 0xff8a3d, 0xff5a1f),
  WATER: theme(0xd8f4ff, 0x15406e, 0x36b6ff, 0x2fa8ff, 0x4fb8ff, 0x2b9bff),
  ELECTRIC: theme(0xfffbe0, 0x6b5410, 0xffd93b, 0xffe14d, 0xffd75e, 0xffd11f),
  GRASS: theme(0xe6ffd9, 0x1d5a2a, 0x53e06b, 0x4ade5f, 0x6ee07e, 0x3fd45c),
  LIGHT: theme(0xfffdf2, 0x8a7a3a, 0xffe9a6, 0xfff2c4, 0xfff4d2, 0xffe9a0),
  DARK: theme(0xe9d4ff, 0x2e1245, 0xa855f7, 0x9b4dff, 0xb06bff, 0x8b3dff),
};

export function themeFor(element: Element): ElementTheme {
  return ELEMENT_THEME[element];
}
