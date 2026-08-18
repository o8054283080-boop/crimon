/**
 * 焼いた効果音を鳴らす。
 *
 * 以前はブラウザ上で毎回合成していたが、リアルタイムでは
 * リバーブなどの重い処理が使えず、どう作っても安っぽさから抜けられなかった。
 * いまは `tools/audio/render.py` で事前に焼いた ogg を読み込んで鳴らしている。
 *
 * **組み合わせで鳴らす**。当たり方(4種)と属性(6種)を全部焼くと24通りだが、
 * 当たりの芯と属性の色を別ファイルにして重ねているので、10ファイルで足りる。
 */
import { AudioSettings, getAudioSettings, onAudioSettingsChange } from "./settings.js";

export type SfxElement = "FIRE" | "WATER" | "ELECTRIC" | "GRASS" | "LIGHT" | "DARK" | "NEUTRAL";
export type HitStyle = "slash" | "blunt" | "pierce" | "magic";

/** 単体で鳴らせる音の名前。当たりの芯と属性の色は `playHit` 経由で重ねる */
export type SfxName =
  | "whiff"
  | "shield"
  | "death"
  | "heal"
  | "buff"
  | "debuff"
  | "charge"
  | "turnAlly"
  | "turnEnemy"
  | "tap"
  | "select"
  | "victory"
  | "defeat";

export interface HitOptions {
  element?: SfxElement;
  hitStyle?: HitStyle;
  /** 会心。専用の層が重なる */
  crit?: boolean;
  /** 0.5〜2程度。ダメージの大きさに応じて渡す */
  power?: number;
}

/**
 * 同時に鳴らす音の上限。
 *
 * 全体攻撃は4体に同時着弾するため、素直に鳴らすと同じ音が4重になって
 * 音量が跳ね上がり、潰れて何も聞き取れなくなる(加算合成で画面が白く飛ぶのと同じ)。
 */
const MAX_CONCURRENT = 10;

/** 同じ音がこの秒数以内に連続したら間引く。連打で音が団子になるのを防ぐ */
const RETRIGGER_GUARD_SEC = 0.02;

interface Manifest {
  [name: string]: string[];
}

class SfxPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer[]>();
  private manifest: Manifest | null = null;
  private loading: Promise<void> | null = null;
  private live = 0;
  private lastPlayedAt = new Map<string, number>();
  private settings: AudioSettings = getAudioSettings();
  /** 無音を鳴らして解錠済みか(操作のたびに鳴らす必要はない) */
  private silentPrimed = false;
  private baseUrl: string;

  constructor() {
    // Vite の base は GitHub Pages のサブパス配信で空でない値になる
    this.baseUrl = `${import.meta.env.BASE_URL ?? "/"}audio/`.replace(/\/{2,}/g, "/");
    onAudioSettingsChange((next) => {
      this.settings = next;
      if (this.master) this.master.gain.value = this.effectiveVolume();
    });
  }

  private effectiveVolume(): number {
    if (!this.settings.sfxEnabled) return 0;
    return this.settings.masterVolume * this.settings.sfxVolume;
  }

  /**
   * 音を使えるようにする。**ブラウザは操作前に音を出せない**ので、
   * 実際に鳴り始めるのは最初のタップから。
   */
  unlock(): void {
    if (typeof window === "undefined") return;
    const start = () => {
      void this.ensureReady();
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
    void ctx.resume();
    if (this.silentPrimed) return;
    this.silentPrimed = true;
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  private async ensureReady(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.effectiveVolume();
      this.master.connect(this.ctx.destination);
      // 作った直後は停止状態のことがある。**ここで動かさないと永久に鳴らない**
      if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
      try {
        const res = await fetch(`${this.baseUrl}manifest.json`);
        this.manifest = (await res.json()) as Manifest;
      } catch {
        // 音が読めなくてもゲームは動くべきなので、静かに諦める
        this.manifest = null;
      }
    })();
    return this.loading;
  }

  /** 必要になった時点で読む。全部を先読みすると初回表示が遅くなる */
  private async load(name: string): Promise<AudioBuffer[] | null> {
    const cached = this.buffers.get(name);
    if (cached) return cached;
    if (!this.ctx || !this.manifest) return null;
    const files = this.manifest[name];
    if (!files) return null;

    const decoded = await Promise.all(
      files.map(async (file) => {
        const res = await fetch(`${this.baseUrl}${file}`);
        const bytes = await res.arrayBuffer();
        return this.ctx!.decodeAudioData(bytes);
      }),
    );
    this.buffers.set(name, decoded);
    return decoded;
  }

  /**
   * 1層鳴らす。`detune` は半音ではなくセント。
   * 焼いた音は3通りしかないので、再生時にわずかに音程と音量を散らして
   * 「同じ音の繰り返し」に聞こえないようにしている。
   */
  private async emit(name: string, gain: number, delaySec = 0, detuneCents = 0): Promise<void> {
    if (this.effectiveVolume() <= 0) return;
    await this.ensureReady();
    if (!this.ctx || !this.master) return;
    // 画面を離れている間などに勝手に止まることがある。鳴らす前に必ず起こす
    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
    if (this.ctx.state !== "running") return;

    const now = this.ctx.currentTime;
    const last = this.lastPlayedAt.get(name) ?? -1;
    if (now - last < RETRIGGER_GUARD_SEC) return;
    if (this.live >= MAX_CONCURRENT) return;

    const buffers = await this.load(name);
    if (!buffers || buffers.length === 0) return;

    const source = this.ctx.createBufferSource();
    source.buffer = buffers[Math.floor(Math.random() * buffers.length)];
    source.detune.value = detuneCents + (Math.random() - 0.5) * 90;

    const node = this.ctx.createGain();
    node.gain.value = gain * (0.88 + Math.random() * 0.24);
    source.connect(node).connect(this.master);

    this.live += 1;
    source.onended = () => {
      this.live -= 1;
      node.disconnect();
    };
    this.lastPlayedAt.set(name, now);
    source.start(now + delaySec);
  }

  play(name: SfxName, gain = 1): void {
    void this.emit(name, gain);
  }

  /**
   * 音声文脈の状態。鳴らない時に真っ先に見る値。
   * "suspended" のままなら、操作による解錠ができていない。
   */
  contextState(): string {
    return this.ctx?.state ?? "未作成";
  }

  /**
   * 実際に鳴っている音を測る(焼いたファイル単体ではなく、再生経路を通った後)。
   *
   * 音は画面では確かめられないので、数値で裏を取るための窓口。
   * `純音らしさ` が高いほど「ピコピコ」寄り。打撃系で0.5を超えていたら疑うこと。
   */
  async measure(name: SfxName, ms = 900): Promise<Record<string, number> | null> {
    await this.ensureReady();
    if (!this.ctx || !this.master) return null;
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    this.master.connect(analyser);

    this.play(name);
    const bins = new Float32Array(analyser.frequencyBinCount);
    let peakRms = 0;
    let best: Float32Array | null = null;
    const started = performance.now();
    while (performance.now() - started < ms) {
      await new Promise((r) => setTimeout(r, 16));
      analyser.getFloatFrequencyData(bins);
      const linear = bins.map((db) => 10 ** (db / 20));
      const rms = Math.sqrt(linear.reduce((s, v) => s + v * v, 0) / linear.length);
      if (rms > peakRms) {
        peakRms = rms;
        best = linear.slice();
      }
    }
    this.master.disconnect(analyser);
    if (!best) return null;

    const total = best.reduce((s, v) => s + v * v, 0) + 1e-12;
    const sorted = [...best].sort((a, b) => b - a);
    const top = Math.max(1, Math.floor(sorted.length / 100));
    const tonal = sorted.slice(0, top).reduce((s, v) => s + v * v, 0) / total;
    const peak = sorted[0];
    return {
      純音らしさ: +tonal.toFixed(3),
      ピーク付近のビン数: best.filter((v) => v > peak * 0.5).length,
      最大音量: +peakRms.toFixed(5),
    };
  }

  /**
   * 攻撃の着弾。芯・属性の色・会心を重ねる。
   *
   * 属性の違いは色ではなく**間**で出している。芯より少し遅れて属性の層を置くと、
   * 同時に鳴らすより属性がはっきり聞き分けられる。
   */
  playHit(options: HitOptions = {}): void {
    const style = options.hitStyle ?? "magic";
    const element = options.element ?? "NEUTRAL";
    const power = Math.max(0.4, Math.min(2, options.power ?? 1));

    // 重い攻撃ほど低く鳴らす。音量だけで大きさを出そうとすると上限に当たる
    const detune = (1 - power) * 140;
    void this.emit(`impact_${style}`, 0.55 + power * 0.3, 0, detune);

    if (element !== "NEUTRAL") {
      void this.emit(`flavor_${element}`, 0.34 + power * 0.12, 0.022, detune * 0.5);
    }
    if (options.crit) {
      void this.emit("crit", 0.5, 0.008, -60);
    }
  }
}

export const sfxPlayer = new SfxPlayer();
