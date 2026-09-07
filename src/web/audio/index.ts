/**
 * 音の入口。ゲーム側はこのファイルだけを見ればよい。
 *
 * 効果音は `tools/audio/render.py` で事前に焼いた音源を同梱している。
 * 以前はブラウザ上で毎回合成していたが、リアルタイムでは畳み込みリバーブなどの
 * 重い処理が使えず、どう作っても安っぽさから抜けられなかったため方式を変えた。
 *
 * BGMは旋律を持たない。「環境音 + 持続音 + まばらな出来事」だけで場の空気を
 * 敷いている。旋律を書くと8小節目で必ず「またこれか」になり、どれだけ凝っても
 * 着信音の親戚に聞こえるため。詳しくは tools/audio/render_bgm.py の冒頭。
 *
 * ## 鳴らし方は2本ある
 *
 * 本筋は Web Audio(`bgmPlayer` / `sfxPlayer`)。復号できない端末だけ、
 * `<audio>` からの互換再生(`mediaBgmPlayer`)へ落ちる。どちらを使っているかは
 * 設定画面の診断に出す。**どちらの道でも「鳴っているつもり」を信じない**——
 * 実際に音が出ているかは再生位置で確かめる(`diagnostics.ts`)。
 */
import { BgmScene, bgmPlayer } from "./bgm.js";
import { audioEngine } from "./context.js";
import { audioDiagnosticLines, bgmDiagnosisSummary, bgmRoute } from "./diagnostics.js";
import { decodeFailedForCurrentFormat } from "./format.js";
import { mediaBgmPlayer } from "./mediaBgm.js";
import { HitOptions, HitStyle, SfxElement, SfxName, sfxPlayer } from "./player.js";
import { getAudioSettings, onAudioSettingsChange, updateAudioSettings } from "./settings.js";

export type { SfxName, SfxElement, HitStyle, HitOptions, BgmScene };
export type { AudioDiagnosticLine } from "./diagnostics.js";
export { getAudioSettings, updateAudioSettings, onAudioSettingsChange };
export { audioDiagnosticLines };

let initialized = false;
/** いま敷きたい場面。互換再生へ切り替わった時に拾い直す */
let wantedScene: BgmScene | null = null;

/**
 * ボス戦だけBGMを差し替える。
 * 画面に出ているHUDから見分けるので、戦闘の側へ手を入れなくてよい。
 */
function resolvedBgmScene(scene: BgmScene | null): BgmScene | null {
  if (scene !== "battle" || typeof document === "undefined") return scene;
  return document.querySelector(".unit-hud--enemy.unit-hud--boss") ? "boss" : "battle";
}

/**
 * どちらの道で鳴らすかを決めて、選ばなかった方を止める。
 *
 * **両方から同時に鳴らさない。**互換再生へ落ちた後もWeb Audio側が
 * 鳴り続けると、同じ曲が二重になる。
 */
function route(): void {
  const scene = resolvedBgmScene(wantedScene);
  if (bgmRoute() === "HTML Audio") {
    bgmPlayer.play(null);
    mediaBgmPlayer.play(scene);
  } else {
    mediaBgmPlayer.play(null);
    bgmPlayer.play(scene);
  }
}

/**
 * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
 * ここでは仕掛けを置くだけで、実際に鳴り始めるのは最初のタップから。
 */
export function initAudio(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  sfxPlayer.unlock();
  mediaBgmPlayer.install();

  /*
   * 復号に失敗して互換再生へ落ちる瞬間は、音を読みに行った後にしか分からない。
   * 操作のたびに道を選び直して、落ちた側がそのまま無音で取り残されないようにする。
   */
  audioEngine.onGesture(() => route());
  audioEngine.onStateChange(() => route());

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
    bgmScene: () => mediaBgmPlayer.currentScene() ?? bgmPlayer.currentScene(),
    /** ループが本当に閉じているか(復号後の余白と継ぎ目の跳び)を測る */
    measureBgm: (scene: BgmScene, expectedSec?: number) => bgmPlayer.measureLoop(scene, expectedSec),
    /** 鳴らない時に真っ先に見る値。"suspended" なら解錠できていない */
    contextState: () => sfxPlayer.contextState(),
    /** 設定画面に出しているのと同じ診断。1行ずつ配列で返る */
    diagnostics: () => audioDiagnosticLines(),
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
  return bgmDiagnosisSummary();
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
  wantedScene = scene;
  route();
}

/** いま互換再生(HTML Audio)を使っているか。テストと診断のために出す */
export function usingMediaFallback(): boolean {
  return decodeFailedForCurrentFormat();
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
