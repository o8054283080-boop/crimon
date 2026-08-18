/**
 * 音の入口。ゲーム側はこのファイルだけを見ればよい。
 *
 * 効果音は `tools/audio/render.py` で事前に焼いた ogg を同梱している。
 * 以前はブラウザ上で毎回合成していたが、リアルタイムでは畳み込みリバーブなどの
 * 重い処理が使えず、どう作っても安っぽさから抜けられなかったため方式を変えた。
 *
 * BGMはまだ入れていない。**質を確かめられないものは出さない**方針で、
 * 安っぽいBGMを付けるくらいなら無い方がよい。
 */
import { HitOptions, HitStyle, SfxElement, SfxName, sfxPlayer } from "./player.js";
import { getAudioSettings, onAudioSettingsChange, updateAudioSettings } from "./settings.js";

export type { SfxName, SfxElement, HitStyle, HitOptions };
export { getAudioSettings, updateAudioSettings, onAudioSettingsChange };

let initialized = false;

/**
 * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
 * ここでは仕掛けを置くだけで、実際に鳴り始めるのは最初のタップから。
 */
export function initAudio(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  sfxPlayer.unlock();

  // 音は画面を見ても確かめられない。開発中は手元で鳴らせる窓口を出しておく
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__crimonAudio = {
      play: (name: SfxName, gain?: number) => sfxPlayer.play(name, gain),
      hit: (options?: HitOptions) => sfxPlayer.playHit(options),
      settings: getAudioSettings,
      update: updateAudioSettings,
      /** 実際の再生経路を通った音を測る(焼いたファイル単体ではなく、鳴っている音) */
      measure: (name: SfxName, ms?: number) => sfxPlayer.measure(name, ms),
    };
  }
}

/** 効果音を鳴らす。まだ操作されていない/設定で切られている時は静かに何もしない */
export function playSfx(name: SfxName, gain = 1): void {
  sfxPlayer.play(name, gain);
}

/** 攻撃の着弾。当たり方・属性・会心を重ねて鳴らす */
export function playHitSfx(options: HitOptions = {}): void {
  sfxPlayer.playHit(options);
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
