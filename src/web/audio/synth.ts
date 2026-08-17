/**
 * 音を手続き的に作るための素材と部品。
 *
 * このゲームは3Dモデルもテクスチャも手続き生成なので、音も素材を持ち込まず
 * その場で合成する。安っぽくしないための決め事を、この層で守らせている。
 *
 * - **打撃音の主成分はノイズ**。発振器の生音だけで組まない
 * - **必ずフィルタを通し、カットオフを時間で動かす**。動かない音は死んで聞こえる
 * - **1発ごとに散らす**。周波数・長さ・ノイズの読み出し位置を毎回変え、
 *   連打しても同じ波形が並ばないようにする
 * - **残響へ送る**。乾いた音は画面から浮く
 *
 * すべての部品は `BaseAudioContext` を受けるので、`OfflineAudioContext` でも
 * まったく同じ音が作れる。**測って確かめられること**を最優先にした設計。
 */

/** 音を出す先。直接音と残響送りの2系統を持つ */
export interface SoundBus {
  ctx: BaseAudioContext;
  /** 直接音の入口 */
  dry: AudioNode;
  /** 残響の入口 */
  wet: AudioNode;
}

const NOISE_SECONDS = 2.5;

const whiteCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const pinkCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const crackleCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 白色ノイズ。打撃のアタックに使う */
export function whiteNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = whiteCache.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  whiteCache.set(ctx, buffer);
  return buffer;
}

/**
 * ピンクノイズ(-3dB/oct)。白色のままだと高域が刺さるので、
 * ボディや余韻など「長く鳴る層」はこちらを使う。
 * Paul Kellet の近似フィルタ。
 */
export function pinkNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = pinkCache.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  pinkCache.set(ctx, buffer);
  return buffer;
}

/**
 * まばらな衝撃の連なり。火のはぜる音、電気のジリつき、草のざらつきに使う。
 * 一定間隔で置くと機械的になるので、間隔そのものを乱数で散らしてある。
 */
export function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = crackleCache.get(ctx);
  if (cached) return cached;
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let i = 0;
  while (i < length) {
    const gap = Math.floor(ctx.sampleRate * (0.0006 + Math.random() * 0.008));
    i += gap;
    if (i >= length) break;
    // 1粒は指数的に落ちる短い破裂。長さも粒ごとに変える
    const grain = Math.floor(ctx.sampleRate * (0.0008 + Math.random() * 0.004));
    const amp = 0.35 + Math.random() * 0.65;
    for (let k = 0; k < grain && i + k < length; k++) {
      const decay = Math.exp((-5 * k) / grain);
      data[i + k] += (Math.random() * 2 - 1) * amp * decay;
    }
    i += grain;
  }
  crackleCache.set(ctx, buffer);
  return buffer;
}

export type NoiseKind = "white" | "pink" | "crackle";

function bufferOf(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  if (kind === "pink") return pinkNoiseBuffer(ctx);
  if (kind === "crackle") return crackleBuffer(ctx);
  return whiteNoiseBuffer(ctx);
}

/**
 * 残響用のインパルス応答を合成する。
 *
 * 闘技場の中で鳴っているように置きたいので、初期反射(壁からの数回の跳ね返り)を
 * 離散的に置いたうえで、指数減衰する拡散音を重ねる。高域は時間とともに
 * 落ちていく(空気と壁に吸われる)ようにしないと、金属的な安い残響になる。
 */
export function buildImpulseResponse(ctx: BaseAudioContext, seconds = 1.9, decay = 3.4): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  // 壁までの距離が左右で違うので、初期反射の時刻をずらす
  const earlyTaps: [number, number][] = [
    [0.011, 0.5],
    [0.019, 0.38],
    [0.031, 0.3],
    [0.047, 0.22],
    [0.068, 0.16],
  ];
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const skew = ch === 0 ? 1 : 1.13;
    // 一次のローパスを時間とともに強めて、高域が先に失われるようにする
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const damping = 0.55 - 0.45 * t;
      lp += damping * ((Math.random() * 2 - 1) - lp);
      data[i] = lp * Math.pow(1 - t, decay);
    }
    for (const [time, amp] of earlyTaps) {
      const index = Math.floor(time * skew * ctx.sampleRate);
      if (index < length) data[index] += amp * (Math.random() * 0.4 + 0.8) * (ch === 0 ? 1 : -1);
    }
  }
  return buffer;
}

/** 軽い飽和。生の正弦波は安っぽいので、低音の胴鳴りに歪みを少し足す */
export function saturationCurve(amount = 8): Float32Array<ArrayBuffer> {
  // **奇数長にして中央を厳密に0に置く。**
  // 偶数長だと入力0が2点の間に落ち、実測で 0.007 の直流が残った
  // (音が鳴っていないのにバスに電圧が乗り続け、無駄に頭を削る)
  const samples = 1025;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

/** 中心値のまわりに ±pct% で散らす */
export function vary(value: number, pct: number): number {
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

/** 0 に向かう指数減衰は 0 を取れないので、下限を決めておく */
const FLOOR = 0.0008;

export interface NoiseLayerOptions {
  kind?: NoiseKind;
  /** 立ち上がり(秒)。0に近いほど鋭い */
  attack: number;
  /** 減衰(秒) */
  decay: number;
  gain: number;
  filter?: BiquadFilterType;
  /** フィルタのカットオフ。時間で from → to へ動かす */
  from: number;
  to: number;
  q?: number;
  /** 低域を切る(打撃の芯を濁さないため) */
  highpass?: number;
  /** 再生速度。ノイズの粗さが変わる */
  rate?: number;
  /** 残響へ送る量 */
  wet?: number;
  /** 減衰の直線成分(打楽器らしさを足したい時) */
  hold?: number;
}

/**
 * ノイズを1層鳴らす。打撃音の主成分。
 *
 * ノイズバッファの読み出し位置を毎回変えるのが肝で、これが無いと
 * 同じ音を連打した時に完全に同じ波形が並び、機関銃のように聞こえる。
 */
export function noiseLayer(bus: SoundBus, time: number, options: NoiseLayerOptions): number {
  const { ctx } = bus;
  const kind = options.kind ?? "white";
  const source = ctx.createBufferSource();
  source.buffer = bufferOf(ctx, kind);
  source.playbackRate.value = vary(options.rate ?? 1, 0.06);

  const filter = ctx.createBiquadFilter();
  filter.type = options.filter ?? "bandpass";
  filter.Q.value = options.q ?? 1;
  const from = Math.max(30, vary(options.from, 0.05));
  const to = Math.max(30, vary(options.to, 0.05));
  const attack = Math.max(0.0005, vary(options.attack, 0.15));
  const decay = Math.max(0.01, vary(options.decay, 0.12));
  const hold = options.hold ?? 0;
  const total = attack + hold + decay;
  filter.frequency.setValueAtTime(from, time);
  filter.frequency.exponentialRampToValueAtTime(to, time + total);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(FLOOR, time);
  amp.gain.linearRampToValueAtTime(options.gain, time + attack);
  if (hold > 0) amp.gain.setValueAtTime(options.gain, time + attack + hold);
  amp.gain.exponentialRampToValueAtTime(FLOOR, time + total);

  let head: AudioNode = filter;
  source.connect(filter);
  if (options.highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = options.highpass;
    head.connect(hp);
    head = hp;
  }
  head.connect(amp);

  amp.connect(bus.dry);
  if (options.wet && options.wet > 0) {
    const send = ctx.createGain();
    send.gain.value = options.wet;
    amp.connect(send);
    send.connect(bus.wet);
  }

  // ノイズは長いバッファの途中から読む。毎回違う波形になる
  const offset = Math.random() * (NOISE_SECONDS - total - 0.05);
  source.start(time, Math.max(0, offset), total + 0.05);
  source.stop(time + total + 0.05);
  return total;
}

export interface ToneLayerOptions {
  type?: OscillatorType;
  /** 開始周波数 */
  from: number;
  /** 終了周波数(落ちる=打撃、上がる=溜め) */
  to: number;
  attack: number;
  decay: number;
  gain: number;
  /** 掛けるローパス。生の波形をそのまま出さないため既定で入れる */
  lowpass?: number;
  /** 胴鳴りの歪み量。0で無し */
  drive?: number;
  wet?: number;
  /** 周波数の動き方 */
  sweep?: "exp" | "lin";
  detune?: number;
}

/**
 * 音程のある層。**主役ではなく、ノイズの下に敷く「ドスッ」や倍音**として使う。
 * 単体で旋律や効果音を作らないこと(発振器だけの音は必ず安く聞こえる)。
 */
export function toneLayer(bus: SoundBus, time: number, options: ToneLayerOptions): number {
  const { ctx } = bus;
  const osc = ctx.createOscillator();
  osc.type = options.type ?? "sine";
  if (options.detune) osc.detune.value = options.detune;
  const from = Math.max(20, vary(options.from, 0.03));
  const to = Math.max(20, vary(options.to, 0.03));
  const attack = Math.max(0.0005, vary(options.attack, 0.15));
  const decay = Math.max(0.01, vary(options.decay, 0.1));
  const total = attack + decay;
  osc.frequency.setValueAtTime(from, time);
  if ((options.sweep ?? "exp") === "exp") osc.frequency.exponentialRampToValueAtTime(to, time + total);
  else osc.frequency.linearRampToValueAtTime(to, time + total);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(FLOOR, time);
  amp.gain.linearRampToValueAtTime(options.gain, time + attack);
  amp.gain.exponentialRampToValueAtTime(FLOOR, time + total);

  let head: AudioNode = osc;
  if (options.drive && options.drive > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(options.drive);
    head.connect(shaper);
    head = shaper;
  }
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(Math.max(120, options.lowpass ?? Math.max(400, from * 4)), time);
  lp.frequency.exponentialRampToValueAtTime(Math.max(120, (options.lowpass ?? Math.max(400, from * 4)) * 0.45), time + total);
  head.connect(lp);
  lp.connect(amp);

  amp.connect(bus.dry);
  if (options.wet && options.wet > 0) {
    const send = ctx.createGain();
    send.gain.value = options.wet;
    amp.connect(send);
    send.connect(bus.wet);
  }

  osc.start(time);
  osc.stop(time + total + 0.02);
  return total;
}

export interface GrainBurstOptions {
  kind?: NoiseKind;
  /** 粒の数 */
  count: number;
  /** ばらまく時間の幅(秒) */
  spread: number;
  /** 1粒の長さ */
  grain: number;
  gain: number;
  filter?: BiquadFilterType;
  from: number;
  to: number;
  q?: number;
  wet?: number;
  /** 後ろの粒ほど小さくする度合い */
  fade?: number;
}

/**
 * 短い粒をばらまく。火のはぜ、電気のジリつき、草のざらつきなど
 * 「質感」を作る層。1発の長い音では出せない表情が出る。
 */
export function grainBurst(bus: SoundBus, time: number, options: GrainBurstOptions): number {
  const fade = options.fade ?? 1;
  for (let i = 0; i < options.count; i++) {
    const at = time + Math.pow(Math.random(), 0.7) * options.spread;
    const progress = (at - time) / Math.max(0.0001, options.spread);
    const level = options.gain * (1 - fade * progress * 0.85) * (0.5 + Math.random() * 0.7);
    if (level <= 0.0005) continue;
    noiseLayer(bus, at, {
      kind: options.kind ?? "white",
      attack: 0.0008,
      decay: options.grain * (0.6 + Math.random() * 0.9),
      gain: level,
      filter: options.filter ?? "bandpass",
      from: vary(options.from, 0.35),
      to: vary(options.to, 0.35),
      q: options.q ?? 3,
      rate: 0.8 + Math.random() * 0.5,
      wet: options.wet,
    });
  }
  return options.spread + options.grain * 2;
}

/**
 * 倍音を重ねた響き。光や回復など「伸びる音」に使う。
 * 純音を積むだけでは薄いので、わずかにずらした音を重ねてうねりを作る。
 */
export function bellLayer(
  bus: SoundBus,
  time: number,
  options: { root: number; partials?: number[]; decay: number; gain: number; wet?: number; attack?: number },
): number {
  const partials = options.partials ?? [1, 2.01, 2.99, 4.21];
  const attack = options.attack ?? 0.006;
  let longest = 0;
  partials.forEach((ratio, index) => {
    const decay = options.decay * Math.pow(0.72, index);
    const gain = (options.gain * Math.pow(0.55, index)) / 1;
    longest = Math.max(longest, attack + decay);
    toneLayer(bus, time, {
      type: index === 0 ? "triangle" : "sine",
      from: options.root * ratio,
      to: options.root * ratio * 0.998,
      attack,
      decay,
      gain,
      lowpass: options.root * ratio * 6,
      wet: options.wet ?? 0.5,
      detune: (Math.random() * 2 - 1) * 6,
    });
  });
  return longest;
}
