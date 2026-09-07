/**
 * 焼いた効果音を読めなかった時の、その場で作る代役。
 *
 * **完全な無音を避けるためだけのもの。**焼いた音源が読める端末では
 * 一度も鳴らない。押した手応えが何も返ってこない状態は、
 * 音が安っぽいことより悪い——押せたのかどうかすら分からなくなる。
 *
 * 同じ端末で正常に鳴っている Monster-farm も、音声ファイルの復号に失敗した
 * SEだけを合成音で代用する作りになっている(`playSeBuffer()` が false を返したら
 * `tone()` / `hit()` を鳴らす)。ここはその考え方を移したもの。
 *
 * **これは音作りではない。**手触りを最低限つなぐ配線であって、
 * 「安っぽい音を入れる」こととは別のこと。読める端末では鳴らないので、
 * 音の品質そのものは1ミリも下がらない。
 */
import type { SfxName } from "./player.js";

/** 代役を用意してある音。ここに無い音は、読めなければ黙る */
export type SynthSfxName = "tap" | "select" | "denied" | "victory" | "damage";

interface Tone {
  /** Hz */
  freq: number;
  /** 鳴り始め(秒) */
  start: number;
  /** 長さ(秒) */
  dur: number;
  wave: OscillatorType;
  gain: number;
  /** 終わりの周波数。指定すると滑らせる */
  freqEnd?: number;
}

/**
 * 代役の中身。
 *
 * 押した手応え(tap/select)は短く高く、断り(denied)は低く、
 * 勝ちは上がる3音、被弾は落ちるノイズ寄りの1音。
 */
const RECIPES: Record<SynthSfxName, Tone[]> = {
  tap: [{ freq: 660, start: 0, dur: 0.045, wave: "square", gain: 0.05 }],
  select: [{ freq: 760, start: 0, dur: 0.05, wave: "square", gain: 0.055 }],
  denied: [{ freq: 170, start: 0, dur: 0.14, wave: "square", gain: 0.08, freqEnd: 95 }],
  victory: [
    { freq: 523, start: 0, dur: 0.1, wave: "triangle", gain: 0.13 },
    { freq: 659, start: 0.1, dur: 0.1, wave: "triangle", gain: 0.13 },
    { freq: 784, start: 0.2, dur: 0.2, wave: "triangle", gain: 0.15 },
  ],
  damage: [{ freq: 220, start: 0, dur: 0.09, wave: "sawtooth", gain: 0.12, freqEnd: 90 }],
};

/** 焼いた音の名前から、代役の名前へ。対応が無ければ null */
export function synthNameFor(name: SfxName | string): SynthSfxName | null {
  if (name === "tap" || name === "select" || name === "denied" || name === "victory") return name;
  // 着弾は当たり方ごとに名前が分かれる。どれも被弾の代役でつなぐ
  if (name.startsWith("impact_") || name === "death" || name === "defeat") return "damage";
  return null;
}

/**
 * 代役を鳴らす。鳴らせたら true。
 *
 * `destination` には効果音の音量がかかった枝を渡すこと。
 * ここで音量を掛け直すと二重になる。
 */
export function playSynthSfx(
  ctx: AudioContext,
  destination: AudioNode,
  name: SynthSfxName,
  gain = 1,
): boolean {
  const recipe = RECIPES[name];
  if (!recipe) return false;
  const now = ctx.currentTime;
  try {
    for (const tone of recipe) {
      const osc = ctx.createOscillator();
      const envelope = ctx.createGain();
      osc.type = tone.wave;
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);
      if (tone.freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, tone.freqEnd), now + tone.start + tone.dur);
      }
      const peak = Math.max(0.0002, tone.gain * gain);
      envelope.gain.setValueAtTime(0.0001, now + tone.start);
      envelope.gain.exponentialRampToValueAtTime(peak, now + tone.start + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.dur);
      osc.connect(envelope).connect(destination);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.03);
    }
    return true;
  } catch {
    return false;
  }
}
