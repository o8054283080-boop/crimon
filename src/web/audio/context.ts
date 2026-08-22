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

  /**
   * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
   * ここでは仕掛けを置くだけで、実際に鳴り始めるのは最初のタップから。
   */
  installUnlock(): void {
    if (typeof window === "undefined") return;
    const start = () => {
      void this.ensure();
      // **操作のたびに呼ぶ。1回で外してはいけない。**
      // 音声文脈は後から勝手に停止することがあり、外してしまうと
      // 二度と鳴らせなくなる。動き出したことを確かめてから外す
      this.unlockInGesture();
      if (this.ctx?.state === "running") {
        window.removeEventListener("pointerdown", start);
        window.removeEventListener("keydown", start);
      }
    };
    window.addEventListener("pointerdown", start, { passive: true });
    window.addEventListener("keydown", start, { passive: true });
  }

  /**
   * 操作の中で同期的に呼ぶ解錠。
   *
   * `resume()` を待つ形にすると操作の文脈から外れてしまい、
   * 端末によっては解錠として認められない。無音を1粒だけ即座に鳴らして、
   * 「操作をきっかけに音を出した」という事実を作る。
   */
  private unlockInGesture(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    void ctx.resume().then(() => this.notifyReady());
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
      // 作った直後は停止状態のことがある。**ここで動かさないと永久に鳴らない**
      if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
      this.notifyReady();
      return this.ctx;
    })();
    return this.starting;
  }

  /**
   * 鳴らす直前に呼ぶ。画面を離れている間などに勝手に止まることがあるので、
   * 毎回起こしてから鳴らす。
   */
  async running(): Promise<AudioContext | null> {
    const ctx = await this.ensure();
    if (!ctx) return null;
    if (ctx.state !== "running") await ctx.resume().catch(() => undefined);
    return ctx.state === "running" ? ctx : null;
  }

  /**
   * 解錠されたら呼ばれる。BGMは「鳴らせるようになった時点で始める」必要が
   * あるので、要求された時に止まっていた場合はここで拾い直す。
   */
  onReady(listener: Listener): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  /**
   * 解錠を知らせる。**必ず今の同期処理が終わってから呼ぶこと。**
   *
   * その場で呼ぶと、`ensure()` の中から聞き手へ制御が渡る。聞き手(BGM)は
   * まだ `ensure()` が返っていないので「まだ用意されていない」と判断して
   * もう一度 `ensure()` を呼び、そこからまた聞き手へ……と無限に往復する。
   * 実際に AudioContext を数百個作って「Maximum call stack size exceeded」で
   * 止まり、音がまったく鳴らなくなった。
   *
   * 記憶(`starting` / `preparing`)への代入は同期処理の中で終わるので、
   * 一拍ずらすだけで往復は起きなくなる。
   */
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
 *
 * Vite の base は GitHub Pages のサブパス配信で空でない値になるため、
 * 絶対パスを直書きしないこと。
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
        return (await response.json()) as AudioManifest;
      } catch {
        return null;
      }
    })();
  }
  return manifestPromise;
}

/**
 * 実際に出力へ届いた音を測る。
 *
 * **焼いたファイル単体ではなく、再生経路を通った後**を測ることが要。
 * 音量・重ね方・端末の出力まで通した結果でないと裏付けにならない。
 *
 * `純音らしさ` は tools/audio/dsp.py の tonality() と同じ考え方で、
 * 「周りより飛び出た山」だけを数える。以前は「上位1%のビンのエネルギー比」で
 * 測っていたが、それは狭い音を測っているだけで純音を測っておらず、
 * 低音の効いた打撃(良い音)と正弦(悪い音)がどちらも 0.98 前後になっていた。
 */
export async function measureOutput(
  ctx: AudioContext,
  master: AudioNode,
  trigger: () => void,
  ms: number,
): Promise<Record<string, number> | null> {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  // 既定では前のフレームと混ざる。測る時は混ぜない
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
    // 静かなフレームは測らない。消え際の残響で判断を誤る
    if (rms < peakRms * 0.3) continue;
    worstTonality = Math.max(worstTonality, tonalityOf(power, ctx.sampleRate, analyser.fftSize));
  }
  master.disconnect(analyser);
  if (peakRms <= 0) return null;
  return { 純音らしさ: +worstTonality.toFixed(3), 最大音量: +peakRms.toFixed(5) };
}

/** 150Hz 未満は数えない。この分解能では低い塊と低い正弦を区別できないため */
const TONALITY_FLOOR_HZ = 150;

/**
 * 窓の幅は **ビン数ではなく Hz で決める。**
 *
 * ここを「20ビン以上」と書いていたせいで、焼いたファイルを測った値と
 * 食い違っていた。tools/audio/dsp.py 側は 1ビン 11.7Hz なので 20ビン=234Hz、
 * ブラウザ側は 1ビン 23.4Hz なので同じ 20ビンが 468Hz になる。
 * 窓が広すぎると、低い帯域の塊(良い音)まで「飛び出た山」に数えてしまい、
 * charge が 0.03(ファイル)に対し 0.67(ブラウザ)と出ていた。
 */
const ENVELOPE_MIN_HALF_HZ = 234;
const SMOOTH_HZ = 58;

function tonalityOf(power: number[], sampleRate: number, fftSize: number): number {
  const binHz = sampleRate / fftSize;
  // 1ビンごとの揺れを落とす。幅は焼く側と同じ Hz にそろえる
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
    // その辺りの「地の高さ」を、1/5オクターブほどの窓の中央値で取る
    const halfHz = Math.max(ENVELOPE_MIN_HALF_HZ, i * binHz * 0.2);
    const half = Math.max(2, Math.round(halfHz / binHz));
    const window: number[] = [];
    for (let j = Math.max(0, i - half); j < Math.min(smooth.length, i + half + 1); j += 1) {
      window.push(smooth[j]);
    }
    window.sort((a, b) => a - b);
    const floorLevel = window[window.length >> 1];
    // 地の4倍を超えた分だけを純音成分とみなす
    excess += Math.max(0, smooth[i] - 4 * floorLevel);
    total += smooth[i];
  }
  return total > 0 ? excess / total : 0;
}
