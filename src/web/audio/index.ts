/**
 * 音の入口。ゲーム側はこのファイルだけを見ればよい。
 *
 * 音源ファイルは1つも持たず、すべて Web Audio API でその場で合成している
 * (3Dモデルもテクスチャも手続き生成なので、音だけ素材を持ち込むと方針が割れる)。
 */
import { musicDirector, MusicScene } from "./bgm.js";
import { SfxOptions, audioEngine } from "./engine.js";
import { HitStyle, SfxElement, SfxName } from "./sfx.js";
import { getAudioSettings, onAudioSettingsChange, updateAudioSettings } from "./settings.js";

export type { MusicScene, SfxName, SfxOptions, SfxElement, HitStyle };
export { audioEngine, getAudioSettings, updateAudioSettings, onAudioSettingsChange };

let initialized = false;

/**
 * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
 * ここでは仕掛けを置くだけで、実際に鳴り始めるのは最初のタップから。
 */
export function initAudio(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  audioEngine.installUnlockHandlers();

  const wake = () => {
    void audioEngine.resume().then(() => musicDirector.sync());
  };
  for (const type of ["pointerdown", "touchstart", "keydown"] as const) {
    window.addEventListener(type, wake, { passive: true });
  }

  // 開発中は測定用の窓口を出しておく(音は画面では確かめられないため)
  if (import.meta.env.DEV) {
    void import("./debug.js").then((debug) => {
      (window as unknown as Record<string, unknown>).__crimonAudio = {
        engine: audioEngine,
        settings: getAudioSettings,
        update: updateAudioSettings,
        play: (name: SfxName, options?: SfxOptions) => audioEngine.play(name, options),
        measure: (ms?: number) => audioEngine.measure(ms),
        scene: (scene: MusicScene | null) => musicDirector.setScene(scene),
        analyze: debug.analyzeSfx,
        variance: debug.repeatVariance,
        render: debug.renderSfxOffline,
      };
    });
  }
}

/** 効果音を鳴らす。まだ操作されていない/設定で切られている時は静かに何もしない */
export function playSfx(name: SfxName, options: SfxOptions = {}): void {
  audioEngine.play(name, options);
}

/** 場面に合わせてBGMを切り替える。null で止める */
export function setMusicScene(scene: MusicScene | null): void {
  musicDirector.setScene(scene);
}

/** 3D側と同じ割り当て(役割で当たり方が変わる) */
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

export function hitStyleForRole(role: string | undefined): HitStyle {
  return (role && HIT_STYLE_BY_ROLE[role]) || "magic";
}

const SFX_ELEMENTS = new Set<string>(["FIRE", "WATER", "ELECTRIC", "GRASS", "LIGHT", "DARK"]);

export function sfxElementOf(element: string | undefined): SfxElement {
  return element && SFX_ELEMENTS.has(element) ? (element as SfxElement) : "NEUTRAL";
}
