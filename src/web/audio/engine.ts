/**
 * 音の土台。
 *
 * - `AudioContext` は1つだけ作って使い回す
 * - ブラウザは操作前に音を出せないので、**最初の操作で開始**する
 * - BGMと効果音は別のバスに分け、設定から独立して音量を変えられる/切れる
 * - **同時発音数に上限**を設け、多重ヒットでも音が割れないようにする
 * - 効果音とBGMはそれぞれ残響を通す。乾いた音は画面から浮くため
 */
import { AudioSettings, getAudioSettings, onAudioSettingsChange } from "./settings.js";
import { SoundBus, buildImpulseResponse } from "./synth.js";
import { HitOptions, SfxName, renderSfx } from "./sfx.js";

export type { SfxName };

export interface SfxOptions extends HitOptions {
  /** 0..1.5 程度。音量の微調整 */
  volume?: number;
}

interface SfxSpec {
  /** 発音数が上限に達した時、どれを残すか(大きいほど優先) */
  priority: number;
  /** 同じ音が連続した時の最小間隔(ミリ秒)。機関銃化を防ぐ */
  minGapMs: number;
  /** おおよその長さ(秒)。発音数の管理に使う */
  duration: number;
}

const SPEC: Record<SfxName, SfxSpec> = {
  hit: { priority: 6, minGapMs: 28, duration: 1.1 },
  whiff: { priority: 3, minGapMs: 40, duration: 0.4 },
  shield: { priority: 5, minGapMs: 45, duration: 0.8 },
  death: { priority: 9, minGapMs: 120, duration: 1.5 },
  heal: { priority: 6, minGapMs: 45, duration: 1.3 },
  buff: { priority: 5, minGapMs: 45, duration: 1.0 },
  debuff: { priority: 5, minGapMs: 45, duration: 1.0 },
  charge: { priority: 8, minGapMs: 200, duration: 0.9 },
  turnAlly: { priority: 4, minGapMs: 90, duration: 0.4 },
  turnEnemy: { priority: 4, minGapMs: 90, duration: 0.4 },
  tap: { priority: 2, minGapMs: 30, duration: 0.15 },
  select: { priority: 3, minGapMs: 40, duration: 0.5 },
  victory: { priority: 10, minGapMs: 500, duration: 2.5 },
  defeat: { priority: 10, minGapMs: 500, duration: 2.5 },
};

/** 同時に鳴らせる効果音の数。これを超えたら古くて優先度の低いものから消す */
const MAX_VOICES = 14;

/** 予約に持たせる余裕。会心の立ち上がりを着弾の手前へ置けるだけの幅が要る */
const SCHEDULE_LEAD = 0.09;

interface Voice {
  key: SfxName;
  priority: number;
  startedAt: number;
  endsAt: number;
  dry: GainNode;
  wet: GainNode;
  cleanup: ReturnType<typeof setTimeout>;
}

/** 効果音バスの構成(直接音・残響送り)を1か所で組む。オフライン測定でも同じ形を使う */
export function buildBus(ctx: BaseAudioContext, destination: AudioNode, reverbGain = 0.85): { bus: SoundBus; dryGain: GainNode } {
  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;
  // 直流を止める。歪みや非対称な波形が直流を残すと、鳴っていない間も
  // 電圧が乗り続けて頭を削る(実測で見つけた)
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = "highpass";
  dcBlock.frequency.value = 26;
  dcBlock.Q.value = 0.7;
  dryGain.connect(dcBlock);
  dcBlock.connect(destination);

  const convolver = ctx.createConvolver();
  convolver.buffer = buildImpulseResponse(ctx, 1.9, 3.6);
  const wetIn = ctx.createGain();
  wetIn.gain.value = 1;
  // 残響に低音を溜めない。溜まると音の芯がぼやける
  const wetHp = ctx.createBiquadFilter();
  wetHp.type = "highpass";
  wetHp.frequency.value = 220;
  const wetOut = ctx.createGain();
  wetOut.gain.value = reverbGain;
  wetIn.connect(wetHp);
  wetHp.connect(convolver);
  convolver.connect(wetOut);
  wetOut.connect(destination);

  return { bus: { ctx, dry: dryGain, wet: wetIn }, dryGain };
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: SoundBus | null = null;
  private sfxGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmBus: SoundBus | null = null;
  private analyser: AnalyserNode | null = null;
  private voices: Voice[] = [];
  private lastPlayed = new Map<SfxName, number>();
  private settings: AudioSettings = getAudioSettings();
  private unlockBound = false;
  private hidden = false;

  constructor() {
    onAudioSettingsChange((settings) => {
      this.settings = settings;
      this.applyVolumes();
    });
  }

  /** 状態の確認用(測定・デバッグから読む) */
  get state(): string {
    return this.ctx?.state ?? "none";
  }

  get activeVoices(): number {
    return this.voices.length;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** BGM用のバス(残響込み)。BGM側から使う */
  get music(): SoundBus | null {
    return this.bgmBus;
  }

  get musicGain(): GainNode | null {
    return this.bgmGain;
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /**
   * 最初のタップで音を開始する。
   * ブラウザは操作前に音を出せないので、初期化時にこれを呼んでおき、
   * 実際の生成と resume は最初の操作まで遅らせる。
   */
  installUnlockHandlers(): void {
    if (this.unlockBound || typeof window === "undefined") return;
    this.unlockBound = true;
    const unlock = () => {
      void this.resume();
    };
    for (const type of ["pointerdown", "touchstart", "keydown"] as const) {
      window.addEventListener(type, unlock, { passive: true });
    }
    document.addEventListener("visibilitychange", () => {
      this.hidden = document.hidden;
      this.applyVolumes();
    });
  }

  /** 文脈を作る(または取り出す)。操作前に呼ばれても例外にはしない */
  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    // 多重ヒットで音が割れないよう、最後に必ず頭を押さえる
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.16;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    master.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ctx.destination);

    const sfxGain = ctx.createGain();
    sfxGain.connect(master);
    const bgmGain = ctx.createGain();
    bgmGain.connect(master);

    this.master = master;
    this.analyser = analyser;
    this.sfxGain = sfxGain;
    this.bgmGain = bgmGain;
    this.sfxBus = buildBus(ctx, sfxGain, 0.8).bus;
    this.bgmBus = buildBus(ctx, bgmGain, 1.0).bus;
    this.applyVolumes();
    return ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state !== "running") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxGain || !this.bgmGain) return;
    const now = ctx.currentTime;
    const master = this.settings.masterVolume;
    // 全体を少し下げておく。加算で積み上がった時に頭を打たせないため
    this.master.gain.setTargetAtTime(master * 0.85, now, 0.02);
    this.sfxGain.gain.setTargetAtTime(this.settings.sfxEnabled ? this.settings.sfxVolume * 0.62 : 0, now, 0.02);
    const bgmLevel = this.settings.bgmEnabled && !this.hidden ? this.settings.bgmVolume * 0.5 : 0;
    this.bgmGain.gain.setTargetAtTime(bgmLevel, now, 0.25);
  }

  /** 発音枠を確保する。上限を超えていたら、優先度の低い古い音を消して席を空ける */
  private acquireVoice(key: SfxName, spec: SfxSpec, level: number): SoundBus | null {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return null;
    const now = ctx.currentTime;
    this.voices = this.voices.filter((v) => v.endsAt > now);

    if (this.voices.length >= MAX_VOICES) {
      // 一番優先度が低く、その中で一番古いものを候補にする
      let worst: Voice | null = null;
      for (const voice of this.voices) {
        if (!worst || voice.priority < worst.priority || (voice.priority === worst.priority && voice.startedAt < worst.startedAt)) {
          worst = voice;
        }
      }
      if (!worst || worst.priority > spec.priority) return null;
      this.stealVoice(worst);
    }

    const dry = ctx.createGain();
    dry.gain.value = level;
    dry.connect(this.sfxBus.dry);
    const wet = ctx.createGain();
    wet.gain.value = level;
    wet.connect(this.sfxBus.wet);

    const voice: Voice = {
      key,
      priority: spec.priority,
      startedAt: now,
      endsAt: now + spec.duration + SCHEDULE_LEAD,
      dry,
      wet,
      cleanup: setTimeout(
        () => {
          this.releaseVoice(voice);
        },
        (spec.duration + SCHEDULE_LEAD + 0.3) * 1000,
      ),
    };
    this.voices.push(voice);
    return { ctx, dry, wet };
  }

  private stealVoice(voice: Voice): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const node of [voice.dry, voice.wet]) {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(0, now + 0.03);
    }
    setTimeout(() => this.releaseVoice(voice), 80);
  }

  private releaseVoice(voice: Voice): void {
    clearTimeout(voice.cleanup);
    const index = this.voices.indexOf(voice);
    if (index >= 0) this.voices.splice(index, 1);
    try {
      voice.dry.disconnect();
      voice.wet.disconnect();
    } catch {
      // 既に切れている場合は何もしない
    }
  }

  /** 効果音を鳴らす。文脈がまだ開いていない/切られている場合は静かに何もしない */
  play(name: SfxName, options: SfxOptions = {}): boolean {
    if (!this.settings.sfxEnabled || this.settings.masterVolume <= 0 || this.settings.sfxVolume <= 0) return false;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return false;

    const spec = SPEC[name];
    const nowMs = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (nowMs - last < spec.minGapMs) return false;
    this.lastPlayed.set(name, nowMs);

    const level = Math.max(0, Math.min(1.5, options.volume ?? 1));
    const voice = this.acquireVoice(name, spec, level);
    if (!voice) return false;

    const t = ctx.currentTime + SCHEDULE_LEAD;
    renderSfx(voice, t, name, options);
    return true;
  }

  /**
   * 出力レベルを測る。**音は画面で確かめられない**ので、
   * 鳴っていることをこの数値で確認する。
   */
  async measure(ms = 500): Promise<{ state: string; peak: number; rms: number; voices: number; samples: number }> {
    const analyser = this.analyser;
    if (!analyser || !this.ctx) return { state: this.state, peak: 0, rms: 0, voices: 0, samples: 0 };
    const buffer = new Float32Array(analyser.fftSize);
    let peak = 0;
    let sumSquares = 0;
    let count = 0;
    let maxVoices = 0;
    const deadline = performance.now() + ms;
    while (performance.now() < deadline) {
      analyser.getFloatTimeDomainData(buffer);
      for (let i = 0; i < buffer.length; i++) {
        const v = Math.abs(buffer[i]);
        if (v > peak) peak = v;
        sumSquares += buffer[i] * buffer[i];
        count += 1;
      }
      maxVoices = Math.max(maxVoices, this.voices.length);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    return { state: this.state, peak, rms: count > 0 ? Math.sqrt(sumSquares / count) : 0, voices: maxVoices, samples: count };
  }
}

export const audioEngine = new AudioEngine();
