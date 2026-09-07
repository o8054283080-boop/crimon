/**
 * 音声文脈を1つだけ持つ場所。
 *
 * **効果音とBGMで別々に AudioContext を作ってはいけない。** ブラウザが音を
 * 許すのは「利用者の操作の中で音を出した」文脈だけで、後から作った2つ目は
 * 止まったままになる。片方だけ鳴って片方は無音、という切り分けの難しい
 * 不具合になるので、入口をここに集約する。
 */

import {
  AudioFormat,
  audioLoadReport,
  effectiveAudioFormat,
  noteAudioLoadFailure,
  noteAudioLoadSuccess,
  resolveAudioFile,
} from "./format.js";

type Listener = () => void;

/**
 * 音の扱い方をiPhoneへ伝える。**必ずAudioContextを作る前に呼ぶ。**
 *
 * `ambient` を指定すると
 *   ・本体横の消音スイッチ(マナーモード)に従う
 *   ・他アプリの音楽を止めない(混ぜて鳴る)
 * という、ゲームとして正しい振る舞いになる。
 *
 * **`playback` は使わない。**あれは音楽・動画アプリ向けで、
 * 消音スイッチを無視し、ホームへ戻った後もBGMが鳴り続ける。
 * 既定の `auto` はWeb Audioを使った時点で `playback` 相当に倒れるので、
 * 「指定しない」は「playbackでよい」と同じ意味になってしまう。必ず明示すること。
 *
 * 同じ端末で正常に鳴っている Monster-farm も、これを明示している。
 */
export function applyAmbientAudioSession(): void {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "ambient") session.type = "ambient";
  } catch {
    // 非対応の端末。ブラウザ既定の扱いに任せる
  }
}

/** Audio Session の状態。診断表示に出す */
export function audioSessionType(): string {
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    return session?.type ?? "非対応";
  } catch {
    return "非対応";
  }
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private starting: Promise<AudioContext | null> | null = null;
  /** 無音を鳴らして解錠済みか(操作のたびに鳴らす必要はない) */
  private primed = false;
  private readyListeners = new Set<Listener>();
  private stateListeners = new Set<Listener>();
  private gestureListeners = new Set<Listener>();
  private unlockInstalled = false;

  /**
   * 音を使えるようにする。iPhone/PWAでは一度 running になっても、
   * 画面ロック・バックグラウンド移動・出力先変更などで後から suspended に戻る。
   * そのため解錠イベントは一度成功しても外さず、以後の操作でも必要なら resume する。
   *
   * **audioSession.type = "playback" は使わない。**
   * これを指定するとiPhoneで音楽アプリ扱いになり、マナーモードを貫通し、
   * ホームへ戻った後もBGMが鳴り続ける。CRIMONはゲームなので、端末の消音と
   * フォアグラウンド/バックグラウンドの境界を尊重する。
   */
  installUnlock(): void {
    if (typeof window === "undefined" || this.unlockInstalled) return;
    this.unlockInstalled = true;

    const start = () => {
      if (document.visibilityState !== "visible") return;
      void this.ensure();
      this.unlockInGesture();
      for (const listener of [...this.gestureListeners]) listener();
    };
    /*
     * **`pointerdown` だけに頼らない。**
     *
     * iPhoneは端末や設定によって届くイベントが揺れる。同じ端末で正常に鳴っている
     * Monster-farm は pointerdown / touchstart / click の3つすべてで音を起こし直しており、
     * こちらは pointerdown 1つだけだった。取りこぼすと**一度も解錠されない**。
     *
     * **`once: true` にしてはいけない。**画面ロック・他アプリへの切り替え・着信で
     * AudioContextはいつでも止められる。1回きりの購読だと二度と起こし直せず、
     * そのまま永久に無音になる。
     */
    for (const type of ["pointerdown", "touchstart", "click"] as const) {
      window.addEventListener(type, start, { passive: true });
    }
    window.addEventListener("keydown", start, { passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        void this.suspend();
      } else {
        // iOSは復帰だけでは resume を拒むことがある。その場合でも次のタップで再試行する。
        void this.resume();
      }
    });
    window.addEventListener("pagehide", () => void this.suspend());
    window.addEventListener("pageshow", () => {
      if (document.visibilityState === "visible") void this.resume();
    });
  }

  /** 利用者の操作の中で同期的に解錠を試す。 */
  private unlockInGesture(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return;
    void ctx.resume().then(() => {
      this.notifyState();
      this.notifyReady();
    }).catch(() => undefined);
    if (this.primed) return;
    this.primed = true;
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start(0);
  }

  /** 文脈を用意する。まだ操作されていなければ止まった状態で返ることがある */
  ensure(): Promise<AudioContext | null> {
    if (this.ctx && this.ctx.state !== "closed") return Promise.resolve(this.ctx);
    if (this.starting) return this.starting;
    this.starting = (async () => {
      try {
        const Ctor =
          typeof window === "undefined"
            ? undefined
            : window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return null;
        // **作る前に指定する。**後から変えてもその文脈には効かない
        applyAmbientAudioSession();
        this.ctx = new Ctor();
        this.primed = false;
        this.ctx.onstatechange = () => {
          this.notifyState();
          if (this.ctx?.state === "running") this.notifyReady();
        };
        this.notifyState();
        if (document.visibilityState === "visible" && this.ctx.state !== "running") {
          await this.ctx.resume().catch(() => undefined);
        }
        this.notifyState();
        this.notifyReady();
        return this.ctx;
      } finally {
        // closedになったAudioContextを次回作り直せるよう、完了Promiseを永久保持しない。
        this.starting = null;
      }
    })();
    return this.starting;
  }

  /** 停止している既存文脈を再開する。BGMの再試行通知もここで行う。 */
  async resume(): Promise<AudioContext | null> {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return null;
    const ctx = await this.ensure();
    if (!ctx || ctx.state === "closed") return null;
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    this.notifyState();
    if (ctx.state === "running") this.notifyReady();
    return ctx.state === "running" ? ctx : null;
  }

  /** バックグラウンドへ移った時は明示的に止める。 */
  async suspend(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed" || ctx.state === "suspended") return;
    await ctx.suspend().catch(() => undefined);
    this.notifyState();
  }

  /** 鳴らす直前にも毎回起こす。バックグラウンド中は絶対に鳴らさない。 */
  async running(): Promise<AudioContext | null> {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return null;
    return this.resume();
  }

  /** 解錠・再開されたら呼ばれる。 */
  onReady(listener: Listener): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  /** AudioContextの状態が変わったら呼ばれる。設定画面の診断表示に使う。 */
  onStateChange(listener: Listener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * 利用者が画面を触るたびに呼ばれる。
   *
   * **iPhoneは「操作の中で呼ばれた再生」しか通さないことがある。**
   * 操作の外で `play()` が拒まれた側は、ここで次の操作を待って再試行する。
   */
  onGesture(listener: Listener): () => void {
    this.gestureListeners.add(listener);
    return () => this.gestureListeners.delete(listener);
  }

  /** 再入を避けるため通知は必ずmicrotaskへ送る。 */
  private notifyReady(): void {
    if (this.ctx?.state !== "running") return;
    const listeners = [...this.readyListeners];
    queueMicrotask(() => {
      for (const listener of listeners) listener();
    });
  }

  private notifyState(): void {
    const listeners = [...this.stateListeners];
    queueMicrotask(() => {
      for (const listener of listeners) listener();
    });
  }

  /** 鳴らない時に真っ先に見る値。"running" 以外なら、まだ音を出せていない */
  state(): string {
    return this.ctx?.state ?? "未作成";
  }
}

export const audioEngine = new AudioEngine();

/**
 * 焼いた音を読む。読めなくてもゲームは動くべきなので、失敗は静かに握る。
 * Vite の base は GitHub Pages のサブパス配信で空でない値になるため、絶対パスを直書きしない。
 */
export const AUDIO_BASE_URL = `${import.meta.env.BASE_URL ?? "/"}audio/`.replace(/\/{2,}/g, "/");

/**
 * 最後に音を読めなかった理由。**握り潰さずに残す。**
 *
 * ここを黙って null で返していたため、「BGMだけ鳴らない」と言われても
 * 通信で落ちたのか、復号できない形式なのか、そもそも配信されていないのかを
 * 誰も切り分けられなかった。設定画面がこれを読んで画面へ出す。
 */
let lastAudioError: string | null = null;

export function lastAudioLoadError(): string | null {
  return lastAudioError;
}

/** 音源の絶対URL。互換再生(HTML Audio)側と同じ道筋で組み立てる */
export function audioFileUrl(file: string, format?: AudioFormat): string {
  return `${AUDIO_BASE_URL}${resolveAudioFile(file, format ?? effectiveAudioFormat())}`;
}

/**
 * 音を1つ読む。
 *
 * **manifest に書いてある拡張子をそのまま使わない。**端末が再生できる形式へ
 * 差し替えてから取りに行く(`format.ts`)。iPhoneはOGGを復号できないので、
 * ここでM4Aへ倒れる。
 *
 * 失敗の理由は握り潰さずに残す。**ただし「取得できない」と「復号できない」を
 * 区別する。**前者は通信や配信の問題で、形式を変えても直らない。
 * 後者だけが「この端末はこの形式を読めない」の証拠になる。
 */
export async function loadAudioBuffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  const target = resolveAudioFile(file);
  let response: Response;
  try {
    response = await fetch(`${AUDIO_BASE_URL}${target}`);
  } catch (error) {
    lastAudioError = `${target}: 取得できない (${(error as Error)?.name ?? "不明"})`;
    noteAudioLoadFailure(target, lastAudioError, false);
    return null;
  }
  if (!response.ok) {
    lastAudioError = `${target}: 取得できない (HTTP ${response.status})`;
    noteAudioLoadFailure(target, lastAudioError, false);
    return null;
  }
  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    lastAudioError = `${target}: 読み取れない (${(error as Error)?.name ?? "不明"})`;
    noteAudioLoadFailure(target, lastAudioError, false);
    return null;
  }
  try {
    const buffer = await ctx.decodeAudioData(bytes);
    lastAudioError = null;
    noteAudioLoadSuccess(target);
    return buffer;
  } catch (error) {
    lastAudioError = `${target}: 音を復号できない (${(error as Error)?.name ?? "不明"} / ${Math.round(bytes.byteLength / 1024)}KB)`;
    noteAudioLoadFailure(target, lastAudioError, true);
    /*
     * **形式を変えてもう一度だけ試す。**
     *
     * `canPlayType` は "maybe" と答えておきながら実際には復号できないことがある。
     * ここで乗り換えておかないと、その端末は永久に同じ形式を掴み続ける。
     */
    const fallbackFormat: AudioFormat = formatOfTarget(target) === "ogg" ? "m4a" : "ogg";
    const retry = resolveAudioFile(file, fallbackFormat);
    if (retry === target) return null;
    try {
      const response2 = await fetch(`${AUDIO_BASE_URL}${retry}`);
      if (!response2.ok) return null;
      const buffer = await ctx.decodeAudioData(await response2.arrayBuffer());
      lastAudioError = null;
      noteAudioLoadSuccess(retry);
      return buffer;
    } catch {
      return null;
    }
  }
}

function formatOfTarget(file: string): AudioFormat {
  return file.toLowerCase().endsWith(".m4a") ? "m4a" : "ogg";
}

/** 読み込みの記録。設定画面の診断へそのまま出す */
export { audioLoadReport };

export interface AudioManifest {
  [name: string]: string[];
}

let manifestPromise: Promise<AudioManifest | null> | null = null;
let manifestState: "未取得" | "読込中" | "読込済み" | "失敗" = "未取得";

/** 音の一覧を取れているか。診断表示に出す */
export function audioManifestState(): string {
  return manifestState;
}

export function loadAudioManifest(): Promise<AudioManifest | null> {
  if (!manifestPromise) {
    manifestState = "読込中";
    manifestPromise = (async () => {
      try {
        const response = await fetch(`${AUDIO_BASE_URL}manifest.json`);
        if (!response.ok) return null;
        return (await response.json()) as AudioManifest;
      } catch {
        return null;
      }
    })().then((manifest) => {
      // 一時的な通信失敗を永久キャッシュしない。次の描画/タップで取り直せるようにする。
      manifestState = manifest ? "読込済み" : "失敗";
      if (!manifest) manifestPromise = null;
      return manifest;
    });
  }
  return manifestPromise;
}

/**
 * 実際に出力へ届いた音を測る。
 */
export async function measureOutput(
  ctx: AudioContext,
  master: AudioNode,
  trigger: () => void,
  ms: number,
): Promise<Record<string, number> | null> {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0;
  master.connect(analyser);

  trigger();

  const bins = new Float32Array(analyser.frequencyBinCount);
  let peakRms = 0;
  let worstTonality = 0;
  const started = performance.now();
  while (performance.now() - started < ms) {
    await new Promise((resolve) => setTimeout(resolve, 16));
    analyser.getFloatFrequencyData(bins);
    const power = Array.from(bins, (db) => 10 ** (db / 10));
    const rms = Math.sqrt(power.reduce((sum, v) => sum + v, 0) / power.length);
    if (rms > peakRms) peakRms = rms;
    if (rms < peakRms * 0.3) continue;
    worstTonality = Math.max(worstTonality, tonalityOf(power, ctx.sampleRate, analyser.fftSize));
  }
  master.disconnect(analyser);
  if (peakRms <= 0) return null;
  return { 純音らしさ: +worstTonality.toFixed(3), 最大音量: +peakRms.toFixed(5) };
}

const TONALITY_FLOOR_HZ = 150;
const ENVELOPE_MIN_HALF_HZ = 234;
const SMOOTH_HZ = 58;

function tonalityOf(power: number[], sampleRate: number, fftSize: number): number {
  const binHz = sampleRate / fftSize;
  const span = Math.max(1, Math.round(SMOOTH_HZ / binHz));
  const smooth = power.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - span); j <= Math.min(power.length - 1, i + span); j += 1) {
      sum += power[j];
      count += 1;
    }
    return sum / count;
  });

  const first = Math.ceil(TONALITY_FLOOR_HZ / binHz);
  let excess = 0;
  let total = 0;
  for (let i = first; i < smooth.length; i += 1) {
    const halfHz = Math.max(ENVELOPE_MIN_HALF_HZ, i * binHz * 0.2);
    const half = Math.max(2, Math.round(halfHz / binHz));
    const window: number[] = [];
    for (let j = Math.max(0, i - half); j < Math.min(smooth.length, i + half + 1); j += 1) {
      window.push(smooth[j]);
    }
    window.sort((a, b) => a - b);
    const floorLevel = window[window.length >> 1];
    excess += Math.max(0, smooth[i] - 4 * floorLevel);
    total += smooth[i];
  }
  return total > 0 ? excess / total : 0;
}
