/**
 * 音の入口。ゲーム側はこのファイルだけを見ればよい。
 *
 * 効果音は `tools/audio/render.py` で事前に焼いた ogg を同梱している。
 * 以前はブラウザ上で毎回合成していたが、リアルタイムでは畳み込みリバーブなどの
 * 重い処理が使えず、どう作っても安っぽさから抜けられなかったため方式を変えた。
 *
 * BGMは旋律を持たない。「環境音 + 持続音 + まばらな出来事」だけで場の空気を
 * 敷いている。旋律を書くと8小節目で必ず「またこれか」になり、どれだけ凝っても
 * 着信音の親戚に聞こえるため。詳しくは tools/audio/render_bgm.py の冒頭。
 */
import { BgmScene, bgmPlayer } from "./bgm.js";
import { HitOptions, HitStyle, SfxElement, SfxName, sfxPlayer } from "./player.js";
import { getAudioSettings, onAudioSettingsChange, updateAudioSettings } from "./settings.js";

export type { SfxName, SfxElement, HitStyle, HitOptions, BgmScene };
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

  // 音は画面を見ても確かめられない。手元で鳴らして状態を見られる窓口を出しておく。
  // **本番でも出す。** 「音が鳴らない」と言われた時、これが無いと
  // 端末の音量なのか解錠なのか読み込み失敗なのかを切り分けられない
  (window as unknown as Record<string, unknown>).__crimonAudio = {
    play: (name: SfxName, gain?: number) => sfxPlayer.play(name, gain),
    hit: (options?: HitOptions) => sfxPlayer.playHit(options),
    settings: getAudioSettings,
    update: updateAudioSettings,
    /** 実際の再生経路を通った音を測る(焼いたファイル単体ではなく、鳴っている音) */
    measure: (name: SfxName, ms?: number) => sfxPlayer.measure(name, ms),
    /** 着弾を測る。属性の層が芯に埋もれていないかを確かめる時に使う */
    measureHit: (options?: HitOptions, ms?: number) => sfxPlayer.measureHit(options, ms),
    /** BGMの場面を切り替える。null で止まる */
    bgm: (scene: BgmScene | null) => bgmPlayer.play(scene),
    /** いま鳴っているBGMの場面 */
    bgmScene: () => bgmPlayer.currentScene(),
    /** ループが本当に閉じているか(復号後の余白と継ぎ目の跳び)を測る */
    measureBgm: (scene: BgmScene, expectedSec?: number) => bgmPlayer.measureLoop(scene, expectedSec),
    /** 鳴らない時に真っ先に見る値。"suspended" なら解錠できていない */
    contextState: () => sfxPlayer.contextState(),
  };
}

/** 音声文脈の状態。"running" 以外なら、まだ音を出せる状態になっていない */
export function audioContextState(): string {
  return sfxPlayer.contextState();
}

/** 効果音を鳴らす。まだ操作されていない/設定で切られている時は静かに何もしない */
export function playSfx(name: SfxName, gain = 1): void {
  sfxPlayer.play(name, gain);
}

/** 攻撃の着弾。当たり方・属性・会心を重ねて鳴らす */
export function playHitSfx(options: HitOptions = {}): void {
  sfxPlayer.playHit(options);
}

/**
 * BGMの場面を敷く。`null` で止める。
 *
 * 同じ場面を何度渡しても鳴らし直さないので、画面の再描画のたびに
 * 呼んで構わない(むしろ、そう呼ぶ前提で作ってある)。
 */
export function playBgm(scene: BgmScene | null): void {
  bgmPlayer.play(scene);
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
