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
import { AUDIO_BASE_URL, audioEngine, lastAudioLoadError, loadAudioManifest } from "./context.js";
import { HitOptions, HitStyle, SfxElement, SfxName, sfxPlayer } from "./player.js";
import { getAudioSettings, onAudioSettingsChange, updateAudioSettings } from "./settings.js";

export type { SfxName, SfxElement, HitStyle, HitOptions, BgmScene };
export { getAudioSettings, updateAudioSettings, onAudioSettingsChange };

let initialized = false;

/**
 * iOS 18系の一部WebKitでは `<audio>` で再生できるOGGでも
 * `AudioContext.decodeAudioData()` が EncodingError になる端末がある。
 * Web Audio一本にするとBGM/SEがまとめて全滅するため、復号エラー時だけ
 * HTMLMediaElementの再生経路へ退避する。
 */
let fallbackWantedBgm: BgmScene | null = null;
let fallbackBgm: { scene: BgmScene; audio: HTMLAudioElement } | null = null;
const fallbackSfx = new Set<HTMLAudioElement>();

function needsMediaFallback(): boolean {
  return (lastAudioLoadError() ?? "").includes("音を復号できない");
}

function resolvedBgmScene(scene: BgmScene | null): BgmScene | null {
  if (scene !== "battle" || typeof document === "undefined") return scene;
  return document.querySelector(".unit-hud--enemy.unit-hud--boss") ? "boss" : "battle";
}

function stopFallbackBgm(): void {
  const current = fallbackBgm;
  fallbackBgm = null;
  if (!current) return;
  current.audio.pause();
  current.audio.removeAttribute("src");
  current.audio.load();
}

function stopFallbackSfx(): void {
  for (const audio of fallbackSfx) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  fallbackSfx.clear();
}

async function manifestFile(key: string): Promise<string | null> {
  const manifest = await loadAudioManifest();
  return manifest?.[key]?.[0] ?? null;
}

async function syncFallbackBgm(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return;
  const wanted = resolvedBgmScene(fallbackWantedBgm);
  if (!wanted || !needsMediaFallback()) {
    if (!wanted) stopFallbackBgm();
    return;
  }

  const settings = getAudioSettings();
  const volume = settings.bgmEnabled ? settings.masterVolume * settings.bgmVolume : 0;
  if (volume <= 0) {
    stopFallbackBgm();
    return;
  }

  if (fallbackBgm?.scene === wanted) {
    fallbackBgm.audio.volume = Math.max(0, Math.min(1, volume));
    if (fallbackBgm.audio.paused) void fallbackBgm.audio.play().catch(() => undefined);
    return;
  }

  const file = await manifestFile(`bgm_${wanted}`);
  if (!file) return;
  stopFallbackBgm();

  const audio = new Audio(`${AUDIO_BASE_URL}${file}`);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, volume));
  fallbackBgm = { scene: wanted, audio };
  try {
    await audio.play();
  } catch {
    // iOSがユーザー操作外のplayを拒否した時は、次のpointerdownで再試行する。
  }
}

async function playFallbackKey(key: string, gain = 1, delaySec = 0, playbackRate = 1): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "visible" || !needsMediaFallback()) return;
  const settings = getAudioSettings();
  if (!settings.sfxEnabled) return;
  const volume = settings.masterVolume * settings.sfxVolume * gain;
  if (volume <= 0) return;

  const file = await manifestFile(key);
  if (!file) return;
  const audio = new Audio(`${AUDIO_BASE_URL}${file}`);
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.playbackRate = Math.max(0.5, Math.min(2, playbackRate));
  fallbackSfx.add(audio);
  const cleanup = () => fallbackSfx.delete(audio);
  audio.onended = cleanup;
  audio.onerror = cleanup;
  const start = () => void audio.play().catch(cleanup);
  if (delaySec > 0) window.setTimeout(start, delaySec * 1000);
  else start();
}

/**
 * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
 * ここでは仕掛けを置くだけで、実際に鳴り始めるのは最初のタップから。
 */
export function initAudio(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  sfxPlayer.unlock();
  // manifestは小さいので先に取っておく。iOSでWeb Audio復号に失敗した後、
  // 次のタップのユーザー操作権限を失わずHTML Audioを開始しやすくする。
  void loadAudioManifest();

  window.addEventListener("pointerdown", () => {
    if (needsMediaFallback()) void syncFallbackBgm();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (fallbackBgm) fallbackBgm.audio.pause();
      stopFallbackSfx();
    }
  });
  window.addEventListener("pagehide", () => {
    if (fallbackBgm) fallbackBgm.audio.pause();
    stopFallbackSfx();
  });

  onAudioSettingsChange(() => {
    const settings = getAudioSettings();
    if (fallbackBgm) {
      fallbackBgm.audio.volume = settings.bgmEnabled
        ? Math.max(0, Math.min(1, settings.masterVolume * settings.bgmVolume))
        : 0;
    }
  });

  // 音は画面を見ても確かめられない。手元で鳴らして状態を見られる窓口を出しておく。
  // **本番でも出す。** 「音が鳴らない」と言われた時、これが無いと
  // 端末の音量なのか解錠なのか読み込み失敗なのかを切り分けられない
  (window as unknown as Record<string, unknown>).__crimonAudio = {
    play: (name: SfxName, gain?: number) => playSfx(name, gain),
    hit: (options?: HitOptions) => playHitSfx(options),
    settings: getAudioSettings,
    update: updateAudioSettings,
    /** 実際の再生経路を通った音を測る(焼いたファイル単体ではなく、鳴っている音) */
    measure: (name: SfxName, ms?: number) => sfxPlayer.measure(name, ms),
    /** 着弾を測る。属性の層が芯に埋もれていないかを確かめる時に使う */
    measureHit: (options?: HitOptions, ms?: number) => sfxPlayer.measureHit(options, ms),
    /** BGMの場面を切り替える。null で止まる */
    bgm: (scene: BgmScene | null) => playBgm(scene),
    /** いま鳴っているBGMの場面 */
    bgmScene: () => fallbackBgm?.scene ?? bgmPlayer.currentScene(),
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

/** AudioContextの状態変化を購読する。設定画面の診断を古い値のままにしないために使う。 */
export function onAudioContextStateChange(listener: () => void): () => void {
  return audioEngine.onStateChange(listener);
}

/** BGMがいま鳴っていない理由を一言で。設定画面に出す */
export function bgmDiagnosis(): string {
  if (fallbackBgm && !fallbackBgm.audio.paused) return `互換再生中（HTML Audio / ${fallbackBgm.scene}）`;
  const error = lastAudioLoadError();
  if (error?.includes("音を復号できない")) {
    return `Web AudioでOGGを復号できません。画面をタップして互換再生を試します — ${error}`;
  }
  return bgmPlayer.diagnosis();
}

/** 効果音を鳴らす。まだ操作されていない/設定で切られている時は静かに何もしない */
export function playSfx(name: SfxName, gain = 1): void {
  sfxPlayer.play(name, gain);
  if (needsMediaFallback()) void playFallbackKey(name, gain);
}

/** 攻撃の着弾。当たり方・属性・会心を重ねて鳴らす */
export function playHitSfx(options: HitOptions = {}): void {
  sfxPlayer.playHit(options);
  if (!needsMediaFallback()) return;
  const style = options.hitStyle ?? "magic";
  const element = options.element ?? "NEUTRAL";
  const power = Math.max(0.4, Math.min(2, options.power ?? 1));
  const detune = (1 - power) * 140;
  const rate = 2 ** (detune / 1200);
  void playFallbackKey(`impact_${style}`, 0.55 + power * 0.3, 0, rate);
  if (element !== "NEUTRAL") {
    const placement: Record<Exclude<SfxElement, "NEUTRAL">, { delay: number; gain: number }> = {
      FIRE: { delay: 0.045, gain: 1.15 },
      WATER: { delay: 0.012, gain: 1.0 },
      ELECTRIC: { delay: 0, gain: 0.8 },
      GRASS: { delay: 0.03, gain: 1.15 },
      LIGHT: { delay: 0.035, gain: 0.85 },
      DARK: { delay: 0, gain: 1.2 },
    };
    const p = placement[element];
    void playFallbackKey(`flavor_${element}`, (0.34 + power * 0.12) * p.gain, p.delay, 2 ** ((detune * 0.5) / 1200));
  }
  if (options.crit) void playFallbackKey("crit", 0.5, 0.008, 2 ** (-60 / 1200));
}

/**
 * BGMの場面を敷く。`null` で止める。
 *
 * 同じ場面を何度渡しても鳴らし直さないので、画面の再描画のたびに
 * 呼んで構わない(むしろ、そう呼ぶ前提で作ってある)。
 */
export function playBgm(scene: BgmScene | null): void {
  fallbackWantedBgm = scene;
  bgmPlayer.play(scene);
  if (scene === null) {
    stopFallbackBgm();
    return;
  }
  if (needsMediaFallback()) void syncFallbackBgm();
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
