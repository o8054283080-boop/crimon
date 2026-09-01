/**
 * 音声文脈を1つだけ持つ場所。
 *
 * **効果音とBGMで別々に AudioContext を作ってはいけない。** ブラウザが音を
 * 許すのは「利用者の操作の中で音を出した」文脈だけで、後から作った2つ目は
 * 止まったままになる。片方だけ鳴って片方は無音、という切り分けの難しい
 * 不具合になるので、入口をここに集約する。
 */

type Listener = () => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private starting: Promise<AudioContext | null> | null = null;
  /** 無音を鳴らして解錠済みか(操作のたびに鳴らす必要はない) */
  private primed = false;
  private readyListeners = new Set<Listener>();
  private unlockInstalled = false;

  /**
   * 音を使えるようにする。iPhone/PWAでは一度 running になっても、
   * 画面ロック・バックグラウンド移動・出力先変更などで後から suspended に戻る。
   * そのため解錠イベントは一度成功しても外さず、以後の操作でも必要なら resume する。
   */
  installUnlock(): void {
    if (typeof window === "undefined" || this.unlockInstalled) return;
    this.unlockInstalled = true;
    const start = () => {
      void this.ensure();
      this.unlockInGesture();
    };
    window.addEventListener("pointerdown", start, { passive: true });
    window.addEventListener("keydown", start, { passive: true });

    // iOSはホーム画面PWAへ戻った時に AudioContext を suspended にすることがある。
    // gesture外なので必ず成功するとは限らないが、成功した端末はここで即復帰できる。
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.resume();
    });
    window.addEventListener("pageshow", () => void this.resume());
  }

  /** 利用者の操作の中で同期的に解錠を試す。 */
  private unlockInGesture(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume().then(() => this.notifyReady()).catch(() => undefined);
    if (this.primed) return;
    this.primed = true;
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start(0);
  }

  /** 文脈を用意する。まだ操作されていなければ止まった状態で返ることがある */
  ensure(): Promise<AudioContext | null> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const Ctor =
        typeof window === "undefined"
          ? undefined
          : window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
      this.notifyReady();
      return this.ctx;
    })();
    return this.starting;
  }

  /** 停止している既存文脈を再開する。BGMの再試行通知もここで行う。 */
  async resume(): Promise<AudioContext | null> {
    const ctx = await this.ensure();
    if (!ctx) return null;
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    if (ctx.state === "running") this.notifyReady();
    return ctx.state === "running" ? ctx : null;
  }

  /** 鳴らす直前にも毎回起こす。 */
  async running(): Promise<AudioContext | null> {
    return this.resume();
  }

  /** 解錠・再開されたら呼ばれる。 */
  onReady(listener: Listener): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  /** 再入を避けるため通知は必ずmicrotaskへ送る。 */
  private notifyReady(): void {
    if (this.ctx?.state !== "running") return;
    const listeners = [...this.readyListeners];
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

export async function loadAudioBuffer(ctx: AudioContext, file: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(`${AUDIO_BASE_URL}${file}`);
    if (!response.ok) return null;
    return await ctx.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export interface AudioManifest {
  [name: string]: string[];
}

let manifestPromise: Promise<AudioManifest | null> | null = null;

export function loadAudioManifest(): Promise<AudioManifest | null> {
  if (!manifestPromise) {
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
