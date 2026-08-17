/**
 * BGM。**旋律は作らない。**
 *
 * 合成の旋律はほぼ確実に安っぽくなる(そして矩形波の旋律はレトロ風であって
 * 高品質ではない)。ここで作るのは劇伴の「場の空気」で、構成は次の4層だけ。
 *
 * 1. **持続する低音の層**: わずかに離調した波を重ね、ゆっくり動くローパスを通す
 * 2. **ノイズの層**: ピンクノイズを狭い帯域で撫でる。残響へ多めに送る
 * 3. **脈**(戦闘のみ): フィルタした低音の短い落下。打楽器というより心拍
 * 4. **まばらな響き**: 数秒に一度だけ、倍音を含む音を1つ置く。旋律にはしない
 *
 * すべての層でフィルタとゲインが常に動いている。動かないと「ループしている」
 * ことに耳が気付き、途端に安く聞こえる。
 */
import { audioEngine } from "./engine.js";
import { SoundBus, bellLayer, noiseLayer, pinkNoiseBuffer, toneLayer, vary } from "./synth.js";

export type MusicScene = "home" | "battle" | "summon";

interface SceneProfile {
  /** 低音の層の基音(Hz) */
  root: number;
  /** 重ねる音程比 */
  voicing: number[];
  /** ローパスの中心と揺れ幅 */
  cutoff: number;
  cutoffSwing: number;
  /** ローパスが一往復する速さ(Hz) */
  drift: number;
  /** 低音の層の音量 */
  droneGain: number;
  /** ノイズの層 */
  washGain: number;
  washCenter: number;
  washSwing: number;
  /** 脈の間隔(秒)。0なら鳴らさない */
  pulseSec: number;
  /** まばらな響きの間隔(秒) */
  sparseMin: number;
  sparseMax: number;
  /** 響きの基音と、そこから選ぶ音程(半音) */
  sparseRoot: number;
  sparseDegrees: number[];
  sparseGain: number;
}

const SCENES: Record<MusicScene, SceneProfile> = {
  // ホーム: 温かく、動きは最小限
  home: {
    root: 130.81,
    voicing: [1, 1.5, 2, 3.01],
    cutoff: 420,
    cutoffSwing: 180,
    drift: 0.035,
    droneGain: 0.13,
    washGain: 0.05,
    washCenter: 1400,
    washSwing: 700,
    pulseSec: 0,
    sparseMin: 6,
    sparseMax: 12,
    sparseRoot: 523.25,
    sparseDegrees: [0, 2, 4, 7, 9, 12],
    sparseGain: 0.05,
  },
  // 戦闘: 低く、脈があり、揺れが速い
  battle: {
    root: 98,
    voicing: [1, 1.5, 2, 2.997, 4.02],
    cutoff: 300,
    cutoffSwing: 190,
    drift: 0.06,
    droneGain: 0.15,
    washGain: 0.06,
    washCenter: 1000,
    washSwing: 620,
    pulseSec: 1.5,
    sparseMin: 5,
    sparseMax: 10,
    sparseRoot: 392,
    sparseDegrees: [0, 3, 5, 7, 10, 12],
    sparseGain: 0.05,
  },
  // 召喚: 高い倍音が残り、期待を作る
  summon: {
    root: 174.61,
    voicing: [1, 1.5, 2, 3.0, 4.01, 6.02],
    cutoff: 700,
    cutoffSwing: 340,
    drift: 0.05,
    droneGain: 0.12,
    washGain: 0.07,
    washCenter: 2600,
    washSwing: 1100,
    pulseSec: 0,
    sparseMin: 3.5,
    sparseMax: 7,
    sparseRoot: 698.46,
    sparseDegrees: [0, 2, 4, 7, 11, 14],
    sparseGain: 0.055,
  },
};

interface LayerGroup {
  scene: MusicScene;
  gain: GainNode;
  stop: (fadeSec: number) => void;
  /** 次に脈を鳴らす時刻 */
  nextPulse: number;
  /** 次にまばらな響きを鳴らす時刻 */
  nextSparse: number;
  profile: SceneProfile;
  bus: SoundBus;
}

const FADE_IN = 2.2;
const FADE_OUT = 1.6;

class MusicDirector {
  private group: LayerGroup | null = null;
  private desired: MusicScene | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** 鳴らしたい場面を伝える。同じ場面なら何もしない */
  setScene(scene: MusicScene | null): void {
    if (this.desired === scene) {
      this.sync();
      return;
    }
    this.desired = scene;
    this.sync();
  }

  get currentScene(): MusicScene | null {
    return this.group?.scene ?? null;
  }

  /** 文脈が開いたあとに呼ばれると、遅れて鳴り始める */
  sync(): void {
    const engine = audioEngine;
    if (!engine.ready) return;
    const bus = engine.music;
    if (!bus) return;

    if (this.group && this.group.scene !== this.desired) {
      this.group.stop(FADE_OUT);
      this.group = null;
    }
    if (this.desired && !this.group) {
      this.group = this.build(bus, this.desired);
    }
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), 400);
    }
  }

  stop(): void {
    this.desired = null;
    this.group?.stop(FADE_OUT);
    this.group = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** 先読みしてまばらな音を置く。常時鳴っている層はここでは触らない */
  private tick(): void {
    const engine = audioEngine;
    if (!engine.ready) return;
    if (this.desired && !this.group) this.sync();
    const group = this.group;
    const ctx = engine.context;
    if (!group || !ctx) return;

    const horizon = ctx.currentTime + 1.2;
    const { profile, bus } = group;

    if (profile.pulseSec > 0) {
      while (group.nextPulse < horizon) {
        const at = Math.max(group.nextPulse, ctx.currentTime + 0.05);
        // 心拍。低い落下と、そこへ被せる短い息
        toneLayer(bus, at, {
          type: "sine",
          from: vary(78, 0.03),
          to: vary(41, 0.03),
          attack: 0.012,
          decay: 0.42,
          gain: 0.22,
          lowpass: 240,
          drive: 5,
          wet: 0.35,
        });
        noiseLayer(bus, at + 0.01, {
          kind: "pink",
          attack: 0.01,
          decay: 0.22,
          gain: 0.05,
          filter: "lowpass",
          from: 900,
          to: 220,
          q: 1.6,
          wet: 0.6,
        });
        // 2拍目は弱く。等間隔に同じ強さで並べると機械に聞こえる
        group.nextPulse += profile.pulseSec * (Math.random() < 0.5 ? 0.5 : 1) * vary(1, 0.02);
      }
    }

    while (group.nextSparse < horizon) {
      const at = Math.max(group.nextSparse, ctx.currentTime + 0.05);
      const degree = profile.sparseDegrees[Math.floor(Math.random() * profile.sparseDegrees.length)];
      const root = profile.sparseRoot * Math.pow(2, degree / 12);
      bellLayer(bus, at, {
        root: vary(root, 0.004),
        partials: [1, 2.01, 3.02, 4.51],
        decay: 2.4 + Math.random() * 1.6,
        gain: profile.sparseGain * (0.6 + Math.random() * 0.6),
        wet: 1.2,
        attack: 0.08 + Math.random() * 0.2,
      });
      group.nextSparse += profile.sparseMin + Math.random() * (profile.sparseMax - profile.sparseMin);
    }
  }

  private build(bus: SoundBus, scene: MusicScene): LayerGroup {
    const profile = SCENES[scene];
    const ctx = bus.ctx;
    const now = ctx.currentTime;

    const group = ctx.createGain();
    group.gain.setValueAtTime(0.0001, now);
    group.gain.linearRampToValueAtTime(1, now + FADE_IN);
    group.connect(bus.dry);
    const wetSend = ctx.createGain();
    wetSend.gain.value = 0.9;
    group.connect(wetSend);
    wetSend.connect(bus.wet);

    const stoppables: { stop: (when: number) => void }[] = [];
    const disposables: AudioNode[] = [group, wetSend];

    // --- 1. 持続する低音の層 ---
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.Q.value = 1.6;
    droneFilter.frequency.value = profile.cutoff;
    const droneGain = ctx.createGain();
    droneGain.gain.value = profile.droneGain;
    droneFilter.connect(droneGain);
    droneGain.connect(group);
    disposables.push(droneFilter, droneGain);

    profile.voicing.forEach((ratio, index) => {
      // 同じ音程を2つ、わずかにずらして重ねる。うねりが生まれて厚くなる
      for (const detune of [-6 - index * 1.5, 6 + index * 1.5]) {
        const osc = ctx.createOscillator();
        osc.type = index === 0 ? "triangle" : "sawtooth";
        osc.frequency.value = profile.root * ratio;
        osc.detune.value = detune;
        const level = ctx.createGain();
        level.gain.value = (index === 0 ? 0.5 : 0.34 / (index + 1)) * 0.5;
        osc.connect(level);
        level.connect(droneFilter);
        osc.start(now);
        stoppables.push(osc);
        disposables.push(level);

        // 各声部の音量もゆっくり呼吸させる
        const breathe = ctx.createOscillator();
        breathe.type = "sine";
        breathe.frequency.value = 0.02 + Math.random() * 0.05;
        const depth = ctx.createGain();
        depth.gain.value = level.gain.value * 0.45;
        breathe.connect(depth);
        depth.connect(level.gain);
        breathe.start(now + Math.random());
        stoppables.push(breathe);
        disposables.push(depth);
      }
    });

    // ローパスをゆっくり往復させる。これが止まると急に安くなる
    const drift = ctx.createOscillator();
    drift.type = "sine";
    drift.frequency.value = profile.drift;
    const driftDepth = ctx.createGain();
    driftDepth.gain.value = profile.cutoffSwing;
    drift.connect(driftDepth);
    driftDepth.connect(droneFilter.frequency);
    drift.start(now);
    stoppables.push(drift);
    disposables.push(driftDepth);

    // --- 2. ノイズの層 ---
    const wash = ctx.createBufferSource();
    wash.buffer = pinkNoiseBuffer(ctx);
    wash.loop = true;
    const washFilter = ctx.createBiquadFilter();
    washFilter.type = "bandpass";
    washFilter.Q.value = 1.1;
    washFilter.frequency.value = profile.washCenter;
    const washGain = ctx.createGain();
    washGain.gain.value = profile.washGain;
    wash.connect(washFilter);
    washFilter.connect(washGain);
    washGain.connect(group);
    wash.start(now, Math.random() * 2);
    stoppables.push(wash);
    disposables.push(washFilter, washGain);

    const washDrift = ctx.createOscillator();
    washDrift.type = "sine";
    washDrift.frequency.value = profile.drift * 0.62;
    const washDepth = ctx.createGain();
    washDepth.gain.value = profile.washSwing;
    washDrift.connect(washDepth);
    washDepth.connect(washFilter.frequency);
    washDrift.start(now);
    stoppables.push(washDrift);
    disposables.push(washDepth);

    const stop = (fadeSec: number) => {
      const at = ctx.currentTime;
      group.gain.cancelScheduledValues(at);
      group.gain.setValueAtTime(Math.max(0.0001, group.gain.value), at);
      group.gain.linearRampToValueAtTime(0.0001, at + fadeSec);
      for (const node of stoppables) {
        try {
          node.stop(at + fadeSec + 0.1);
        } catch {
          // 既に止まっている
        }
      }
      setTimeout(
        () => {
          for (const node of disposables) {
            try {
              node.disconnect();
            } catch {
              // 何もしない
            }
          }
        },
        (fadeSec + 0.4) * 1000,
      );
    };

    return {
      scene,
      gain: group,
      stop,
      profile,
      bus,
      nextPulse: now + 1.0,
      nextSparse: now + 2.5 + Math.random() * 3,
    };
  }
}

export const musicDirector = new MusicDirector();
