/**
 * 音の測定。**音は画面で確かめられない**ので、ここで数値にする。
 *
 * 実際に鳴らす経路(`renderSfx`)をそのまま `OfflineAudioContext` で走らせるので、
 * 測った音と鳴っている音は必ず一致する。測るのは次の4点。
 *
 * - **スペクトル平坦度**: 1に近いほどノイズ的、0に近いほど純音的。
 *   打撃音が単一の倍音列(=ファミコン風)になっていないことの証拠になる
 * - **立ち上がり(ms)** と **減衰(ms)**: 立ち上がりに表情があるか、
 *   減衰が指数的か(対数目盛で直線に近いか)
 * - **繰り返しの相関**: 同じ音を何度も鳴らして、波形が毎回違うことを確かめる
 * - **ピーク/RMS**: 単に鳴っているか、割れていないか
 */
import { buildBus } from "./engine.js";
import { HitOptions, SfxName, renderSfx } from "./sfx.js";

export interface SfxAnalysis {
  name: SfxName;
  peak: number;
  rms: number;
  /** 無音から山までの時間(ミリ秒) */
  attackMs: number;
  /** 山から -20dB まで落ちるのに要した時間(ミリ秒) */
  decayMs: number;
  /** 全体の長さ(ミリ秒。-60dBを下回るまで) */
  lengthMs: number;
  /** スペクトル平坦度 0..1(高いほどノイズ的) */
  flatness: number;
  /** 低域(<300Hz)/中域/高域(>4kHz)のエネルギー比 */
  band: { low: number; mid: number; high: number };
  /** 減衰が指数的か(対数振幅の直線当てはめの決定係数 R^2) */
  decayFitR2: number;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** 実数FFT(radix-2)。測定にしか使わないので素朴な実装で足りる */
function fftMagnitudes(input: Float32Array): Float32Array {
  const n = nextPow2(input.length);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < input.length; i++) {
    // ハン窓。窓を掛けないと漏れで平坦度が過大になる
    re[i] = input[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / input.length));
  }
  // ビット反転並べ替え
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
  const mags = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) mags[i] = Math.hypot(re[i], im[i]);
  return mags;
}

/** 指定の効果音をオフラインで描画して波形を得る */
export async function renderSfxOffline(name: SfxName, options: HitOptions = {}, seconds = 2.2): Promise<Float32Array> {
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(1, Math.floor(sampleRate * seconds), sampleRate);
  const { bus } = buildBus(ctx, ctx.destination, 0.8);
  // 会心は着弾の手前から鳴り始めるので、頭に余白を取る
  renderSfx(bus, 0.15, name, options);
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

export function analyzeWaveform(name: SfxName, data: Float32Array, sampleRate = 44100): SfxAnalysis {
  let peak = 0;
  let peakIndex = 0;
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > peak) {
      peak = v;
      peakIndex = i;
    }
    sumSquares += data[i] * data[i];
  }
  const rms = Math.sqrt(sumSquares / data.length);

  // 立ち上がり: 山の1%を超えた最初の点から山まで
  const onsetThreshold = peak * 0.01;
  let onset = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) >= onsetThreshold) {
      onset = i;
      break;
    }
  }

  // 減衰は包絡線で測る。素の波形は山谷が激しく、そのままでは測れない
  const win = Math.floor(sampleRate * 0.005);
  const envelope: number[] = [];
  for (let i = 0; i < data.length; i += win) {
    let localPeak = 0;
    for (let k = i; k < Math.min(i + win, data.length); k++) localPeak = Math.max(localPeak, Math.abs(data[k]));
    envelope.push(localPeak);
  }
  const envPeakIndex = Math.floor(peakIndex / win);
  const dropTo = (ratio: number): number => {
    for (let i = envPeakIndex; i < envelope.length; i++) {
      if (envelope[i] <= peak * ratio) return ((i - envPeakIndex) * win * 1000) / sampleRate;
    }
    return (((envelope.length - envPeakIndex) * win) / sampleRate) * 1000;
  };

  // 指数減衰なら、対数振幅は時間に対して直線になる
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = envPeakIndex; i < envelope.length; i++) {
    if (envelope[i] <= peak * 0.002) break;
    xs.push(((i - envPeakIndex) * win) / sampleRate);
    ys.push(Math.log(Math.max(1e-6, envelope[i])));
  }
  let r2 = 0;
  if (xs.length > 4) {
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    r2 = syy > 0 && sxx > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  }

  // スペクトルは山の直後(音の芯)を見る
  const frameStart = Math.max(0, peakIndex - 256);
  const frame = data.slice(frameStart, frameStart + 4096);
  const mags = fftMagnitudes(frame);
  let logSum = 0;
  let linSum = 0;
  let count = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  const binHz = sampleRate / (mags.length * 2);
  for (let i = 1; i < mags.length; i++) {
    const power = mags[i] * mags[i] + 1e-12;
    logSum += Math.log(power);
    linSum += power;
    count += 1;
    const hz = i * binHz;
    if (hz < 300) low += power;
    else if (hz < 4000) mid += power;
    else high += power;
  }
  const flatness = count > 0 ? Math.exp(logSum / count) / (linSum / count) : 0;
  const total = low + mid + high + 1e-12;

  return {
    name,
    peak,
    rms,
    attackMs: ((peakIndex - onset) * 1000) / sampleRate,
    decayMs: dropTo(0.1),
    lengthMs: dropTo(0.001),
    flatness,
    band: { low: low / total, mid: mid / total, high: high / total },
    decayFitR2: r2,
  };
}

export async function analyzeSfx(name: SfxName, options: HitOptions = {}, seconds = 2.2): Promise<SfxAnalysis> {
  const data = await renderSfxOffline(name, options, seconds);
  return analyzeWaveform(name, data);
}

/**
 * 同じ音を何度も鳴らして、**毎回違う波形になっている**ことを確かめる。
 * 返すのは総当たりの正規化相互相関の最大値で、1に近ければ「毎回同じ音」。
 */
export async function repeatVariance(
  name: SfxName,
  options: HitOptions = {},
  times = 6,
): Promise<{ maxCorrelation: number; peakSpreadPct: number; lengthSpreadPct: number }> {
  const takes: Float32Array[] = [];
  const analyses: SfxAnalysis[] = [];
  for (let i = 0; i < times; i++) {
    const data = await renderSfxOffline(name, options, 1.6);
    takes.push(data);
    analyses.push(analyzeWaveform(name, data));
  }
  let maxCorrelation = 0;
  for (let a = 0; a < takes.length; a++) {
    for (let b = a + 1; b < takes.length; b++) {
      const x = takes[a];
      const y = takes[b];
      let dot = 0;
      let nx = 0;
      let ny = 0;
      const n = Math.min(x.length, y.length, 44100);
      for (let i = 0; i < n; i++) {
        dot += x[i] * y[i];
        nx += x[i] * x[i];
        ny += y[i] * y[i];
      }
      const corr = nx > 0 && ny > 0 ? Math.abs(dot) / Math.sqrt(nx * ny) : 0;
      maxCorrelation = Math.max(maxCorrelation, corr);
    }
  }
  const spread = (values: number[]): number => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return mean > 0 ? ((max - min) / mean) * 100 : 0;
  };
  return {
    maxCorrelation,
    peakSpreadPct: spread(analyses.map((a) => a.peak)),
    lengthSpreadPct: spread(analyses.map((a) => a.lengthMs)),
  };
}
