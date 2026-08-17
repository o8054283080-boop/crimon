/**
 * 効果音の設計。
 *
 * どの音も **アタック(極短い破裂) + ボディ(共鳴) + テイル(減衰する残響)** の
 * 3層で組み立てる。主成分はノイズで、音程のある層はその下に敷く「芯」でしかない。
 *
 * - **役割で当たり方を変える**(斬撃・打撃・刺突・魔法)
 * - **属性は音程ではなく質で分ける**
 *   火=乾いた破裂とはぜる粒 / 水=湿った衝撃と尾を引く滴 / 電気=極短い破裂と高域のジリつき /
 *   草=中域のざらつき / 光=伸びる倍音 / 闇=沈む低音と遅い減衰
 * - 1発ごとに周波数・長さ・ノイズ読み出し位置を散らす(`synth.ts` 側で実施)
 */
import { SoundBus, bellLayer, grainBurst, noiseLayer, toneLayer, vary } from "./synth.js";

export type SfxElement = "FIRE" | "WATER" | "ELECTRIC" | "GRASS" | "LIGHT" | "DARK" | "NEUTRAL";
export type HitStyle = "slash" | "blunt" | "pierce" | "magic";

export interface HitOptions {
  element?: SfxElement;
  style?: HitStyle;
  /** 会心の一撃。通常ヒットとは別物として鳴らす */
  crit?: boolean;
  /** 全体技。少しだけ規模を上げる */
  aoe?: boolean;
  /** 味方が受けた打撃。鈍く重い方向へ寄せる */
  taken?: boolean;
}

interface StyleProfile {
  /** アタックの帯域(開始→終了) */
  attackFrom: number;
  attackTo: number;
  attackDecay: number;
  attackGain: number;
  attackQ: number;
  /** ボディの帯域 */
  bodyFrom: number;
  bodyTo: number;
  bodyDecay: number;
  bodyGain: number;
  bodyFilter: BiquadFilterType;
  bodyQ: number;
  /** 芯になる低音 */
  subFrom: number;
  subTo: number;
  subDecay: number;
  subGain: number;
  wet: number;
}

const STYLE: Record<HitStyle, StyleProfile> = {
  // 斬撃。高い帯域が一気に下へ抜ける「シュッ」を主に、胴鳴りは薄く
  slash: {
    attackFrom: 9500,
    attackTo: 1400,
    attackDecay: 0.085,
    attackGain: 0.5,
    attackQ: 0.8,
    bodyFrom: 2600,
    bodyTo: 420,
    bodyDecay: 0.17,
    bodyGain: 0.26,
    bodyFilter: "lowpass",
    bodyQ: 1.1,
    subFrom: 165,
    subTo: 72,
    subDecay: 0.13,
    subGain: 0.2,
    wet: 0.3,
  },
  // 打撃。低い胴鳴りが主役。アタックは短く潰す
  blunt: {
    attackFrom: 4200,
    attackTo: 700,
    attackDecay: 0.042,
    attackGain: 0.4,
    attackQ: 0.7,
    bodyFrom: 950,
    bodyTo: 170,
    bodyDecay: 0.3,
    bodyGain: 0.46,
    bodyFilter: "lowpass",
    bodyQ: 2.2,
    subFrom: 118,
    subTo: 38,
    subDecay: 0.3,
    subGain: 0.5,
    wet: 0.34,
  },
  // 刺突。細く鋭い。帯域を絞ってQを上げる
  pierce: {
    attackFrom: 12000,
    attackTo: 3200,
    attackDecay: 0.034,
    attackGain: 0.44,
    attackQ: 2.4,
    bodyFrom: 3100,
    bodyTo: 950,
    bodyDecay: 0.12,
    bodyGain: 0.3,
    bodyFilter: "bandpass",
    bodyQ: 6,
    subFrom: 210,
    subTo: 95,
    subDecay: 0.09,
    subGain: 0.19,
    wet: 0.28,
  },
  // 魔法。立ち上がりに角を作らず、空間へ広げる
  magic: {
    attackFrom: 5200,
    attackTo: 1500,
    attackDecay: 0.13,
    attackGain: 0.3,
    attackQ: 1.1,
    bodyFrom: 1300,
    bodyTo: 320,
    bodyDecay: 0.26,
    bodyGain: 0.32,
    bodyFilter: "lowpass",
    bodyQ: 3,
    subFrom: 96,
    subTo: 44,
    subDecay: 0.26,
    subGain: 0.3,
    wet: 0.5,
  },
};

/** 属性ごとの「質」。倍率と、その属性だけの追加層で分ける */
interface ElementProfile {
  /** アタックの帯域倍率 */
  attackScale: number;
  /** ボディの帯域倍率 */
  bodyScale: number;
  /** 減衰の長さ倍率 */
  decayScale: number;
  /** 残響送りの加算 */
  wetAdd: number;
  /** 属性固有の層 */
  texture?: (bus: SoundBus, time: number, level: number, wet: number) => void;
}

const ELEMENT: Record<SfxElement, ElementProfile> = {
  // 乾いた破裂。はぜる粒が後を引く。残響は控えめ(乾いた音にするため)
  FIRE: {
    attackScale: 0.86,
    bodyScale: 0.9,
    decayScale: 1.05,
    wetAdd: -0.06,
    texture: (bus, t, level, wet) => {
      grainBurst(bus, t + 0.012, {
        kind: "crackle",
        count: 13,
        spread: 0.3,
        grain: 0.02,
        gain: level * 0.3,
        from: 2600,
        to: 900,
        q: 3.2,
        wet: wet * 0.6,
      });
      // 燃え広がるノイズ。低めの帯域が遅れて膨らむ
      noiseLayer(bus, t + 0.02, {
        kind: "pink",
        attack: 0.05,
        decay: 0.34,
        gain: level * 0.2,
        filter: "lowpass",
        from: 900,
        to: 220,
        q: 1.4,
        wet: wet * 0.8,
      });
    },
  },
  // 湿った衝撃。帯域が丸く、尾に滴が残る
  WATER: {
    attackScale: 0.62,
    bodyScale: 0.72,
    decayScale: 1.15,
    wetAdd: 0.18,
    texture: (bus, t, level, wet) => {
      // 水膜が弾けて閉じる音。共振を強めに
      noiseLayer(bus, t + 0.008, {
        kind: "pink",
        attack: 0.004,
        decay: 0.26,
        gain: level * 0.26,
        filter: "lowpass",
        from: 1700,
        to: 260,
        q: 5.5,
        wet: wet,
      });
      // 尾を引く滴。短い下降が2つ、時間差で落ちる
      const drops = 1 + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < drops; i++) {
        toneLayer(bus, t + 0.09 + i * (0.07 + Math.random() * 0.06), {
          type: "sine",
          from: vary(1150, 0.18),
          to: vary(520, 0.18),
          attack: 0.003,
          decay: 0.1,
          gain: level * 0.1,
          lowpass: 2600,
          wet: wet * 1.3,
        });
      }
    },
  },
  // 極短い破裂と高域のジリつき。ボディはほぼ無い
  ELECTRIC: {
    attackScale: 1.35,
    bodyScale: 1.25,
    decayScale: 0.62,
    wetAdd: 0.02,
    texture: (bus, t, level, wet) => {
      grainBurst(bus, t, {
        kind: "crackle",
        count: 20,
        spread: 0.15,
        grain: 0.005,
        gain: level * 0.3,
        from: 6200,
        to: 3000,
        q: 7,
        wet: wet * 0.5,
      });
      // 放電のジリつき。狭い帯域が不規則に鳴る
      noiseLayer(bus, t + 0.004, {
        kind: "white",
        attack: 0.001,
        decay: 0.12,
        gain: level * 0.22,
        filter: "bandpass",
        from: 4200,
        to: 7200,
        q: 9,
        wet: wet * 0.7,
      });
    },
  },
  // ざらつき。中域に粒が詰まっている
  GRASS: {
    attackScale: 0.7,
    bodyScale: 0.82,
    decayScale: 0.95,
    wetAdd: -0.04,
    texture: (bus, t, level, wet) => {
      grainBurst(bus, t + 0.004, {
        kind: "crackle",
        count: 14,
        spread: 0.19,
        grain: 0.012,
        gain: level * 0.26,
        from: 1900,
        to: 700,
        q: 4.5,
        wet: wet * 0.5,
      });
      noiseLayer(bus, t + 0.01, {
        kind: "pink",
        attack: 0.01,
        decay: 0.2,
        gain: level * 0.2,
        filter: "bandpass",
        from: 1400,
        to: 600,
        q: 2.4,
        wet: wet * 0.6,
      });
    },
  },
  // 伸びる倍音。減衰が遅く、空間へ広がる
  LIGHT: {
    attackScale: 1.12,
    bodyScale: 1.0,
    decayScale: 1.2,
    wetAdd: 0.24,
    texture: (bus, t, level, wet) => {
      bellLayer(bus, t + 0.006, {
        root: vary(1180, 0.05),
        partials: [1, 2.02, 3.01, 4.5],
        decay: 0.75,
        gain: level * 0.14,
        wet: wet * 1.4,
        attack: 0.008,
      });
      noiseLayer(bus, t, {
        kind: "white",
        attack: 0.002,
        decay: 0.45,
        gain: level * 0.14,
        filter: "highpass",
        from: 4200,
        to: 9000,
        q: 0.8,
        wet: wet * 1.2,
      });
    },
  },
  // 沈む低音。減衰が遅い残響を長く引く
  DARK: {
    attackScale: 0.6,
    bodyScale: 0.62,
    decayScale: 1.35,
    wetAdd: 0.3,
    texture: (bus, t, level, wet) => {
      toneLayer(bus, t, {
        type: "sine",
        from: vary(88, 0.06),
        to: vary(31, 0.06),
        attack: 0.006,
        decay: 0.62,
        gain: level * 0.42,
        lowpass: 320,
        drive: 9,
        wet: wet * 0.8,
      });
      noiseLayer(bus, t + 0.01, {
        kind: "pink",
        attack: 0.02,
        decay: 0.6,
        gain: level * 0.2,
        filter: "lowpass",
        from: 620,
        to: 110,
        q: 2.2,
        wet: wet * 1.2,
      });
    },
  },
  NEUTRAL: { attackScale: 1, bodyScale: 1, decayScale: 1, wetAdd: 0 },
};

/** 攻撃が当たった音 */
export function playHit(bus: SoundBus, time: number, options: HitOptions = {}): void {
  const style = STYLE[options.style ?? "magic"];
  const element = ELEMENT[options.element ?? "NEUTRAL"];
  const crit = options.crit === true;
  const level = (crit ? 1.28 : 1) * (options.aoe ? 1.08 : 1) * (options.taken ? 0.92 : 1);
  const decayScale = element.decayScale * (crit ? 1.35 : 1) * (options.taken ? 1.15 : 1);
  const wet = Math.max(0.05, Math.min(0.9, style.wet + element.wetAdd + (options.aoe ? 0.08 : 0)));

  if (crit) {
    // 会心は「間」で別物にする。着弾の手前に短い立ち上がりを置く
    noiseLayer(bus, time - 0.075, {
      kind: "pink",
      attack: 0.055,
      decay: 0.03,
      gain: 0.22,
      filter: "bandpass",
      from: 420,
      to: 5200,
      q: 1.6,
      wet: wet * 0.5,
    });
  }

  // 1. アタック: 極短い破裂。ここだけは白色ノイズで角を立てる
  noiseLayer(bus, time, {
    kind: "white",
    attack: 0.0012,
    decay: style.attackDecay * decayScale,
    gain: style.attackGain * level,
    filter: "bandpass",
    from: style.attackFrom * element.attackScale,
    to: style.attackTo * element.attackScale,
    q: style.attackQ,
    highpass: 180,
    wet: wet * 0.5,
  });

  // 2. ボディ: 共鳴。カットオフが下へ動くことで「潰れる」感じが出る
  noiseLayer(bus, time + 0.004, {
    kind: "pink",
    attack: 0.004,
    decay: style.bodyDecay * decayScale,
    gain: style.bodyGain * level * (options.taken ? 1.15 : 1),
    filter: style.bodyFilter,
    from: style.bodyFrom * element.bodyScale,
    to: style.bodyTo * element.bodyScale,
    q: style.bodyQ,
    wet,
  });

  // 3. 芯: フィルタした低音の短い落下。派手さではなく「重さ」を担う
  toneLayer(bus, time + 0.002, {
    type: "sine",
    from: style.subFrom * (options.taken ? 0.85 : 1),
    to: style.subTo * (options.taken ? 0.85 : 1),
    attack: 0.003,
    decay: style.subDecay * decayScale,
    gain: style.subGain * level,
    lowpass: 420,
    drive: crit ? 10 : 6,
    wet: wet * 0.4,
  });

  // 4. 属性の質感
  element.texture?.(bus, time, level, wet);

  if (crit) {
    // 会心だけの追い討ち。低い方へ抜ける第二打と、金属質の割れ
    toneLayer(bus, time + 0.008, {
      type: "sine",
      from: 74,
      to: 27,
      attack: 0.004,
      decay: 0.55 * element.decayScale,
      gain: 0.5,
      lowpass: 260,
      drive: 12,
      wet: wet * 0.6,
    });
    noiseLayer(bus, time + 0.055, {
      kind: "white",
      attack: 0.001,
      decay: 0.2,
      gain: 0.3,
      filter: "bandpass",
      from: 5400,
      to: 2100,
      q: 5.5,
      wet: wet * 1.1,
    });
    noiseLayer(bus, time + 0.02, {
      kind: "pink",
      attack: 0.012,
      decay: 0.75,
      gain: 0.22,
      filter: "lowpass",
      from: 1500,
      to: 200,
      q: 1.4,
      wet: Math.min(1, wet * 1.6),
    });
  }

  if (options.taken) {
    // 受け手側の鈍さ。胴に籠もる成分を足す
    noiseLayer(bus, time + 0.012, {
      kind: "pink",
      attack: 0.01,
      decay: 0.26,
      gain: 0.2,
      filter: "lowpass",
      from: 520,
      to: 140,
      q: 3.4,
      wet: wet * 0.9,
    });
  }
}

/** 攻撃が外れた/抵抗された */
export function playWhiff(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  const profile = ELEMENT[element];
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.02,
    decay: 0.17,
    gain: 0.2,
    filter: "bandpass",
    from: 2400 * profile.attackScale,
    to: 700 * profile.attackScale,
    q: 1.5,
    wet: 0.35,
  });
  noiseLayer(bus, time + 0.03, {
    kind: "white",
    attack: 0.03,
    decay: 0.1,
    gain: 0.08,
    filter: "highpass",
    from: 3200,
    to: 6000,
    wet: 0.3,
  });
}

/** シールドで受け止めた */
export function playShield(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  noiseLayer(bus, time, {
    kind: "white",
    attack: 0.0015,
    decay: 0.06,
    gain: 0.3,
    filter: "bandpass",
    from: 5200,
    to: 1800,
    q: 2,
    wet: 0.4,
  });
  bellLayer(bus, time + 0.004, {
    root: vary(680, 0.04),
    partials: [1, 1.51, 2.34],
    decay: 0.5,
    gain: 0.11,
    wet: 0.8,
  });
  toneLayer(bus, time, {
    type: "sine",
    from: 190,
    to: 90,
    attack: 0.004,
    decay: 0.2,
    gain: 0.22,
    lowpass: 500,
    drive: 5,
    wet: 0.3,
  });
  ELEMENT[element].texture?.(bus, time + 0.01, 0.4, 0.4);
}

/** 撃破 */
export function playDeath(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  const profile = ELEMENT[element];
  // 崩れる: 中域の粒が落ちていく
  grainBurst(bus, time, {
    kind: "crackle",
    count: 18,
    spread: 0.5,
    grain: 0.02,
    gain: 0.24,
    from: 2200 * profile.bodyScale,
    to: 500,
    q: 3,
    wet: 0.55,
  });
  // 落ちる: 帯域が下へ抜ける
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.01,
    decay: 0.85 * profile.decayScale,
    gain: 0.34,
    filter: "lowpass",
    from: 2600,
    to: 150,
    q: 2.4,
    wet: 0.7,
  });
  // 沈む: 低音がゆっくり消える
  toneLayer(bus, time + 0.02, {
    type: "sine",
    from: 128,
    to: 34,
    attack: 0.02,
    decay: 0.95,
    gain: 0.42,
    lowpass: 300,
    drive: 8,
    wet: 0.5,
  });
}

/** 回復 */
export function playHeal(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  // 立ち上がりの息。ノイズが上へ抜ける
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.12,
    decay: 0.4,
    gain: 0.16,
    filter: "bandpass",
    from: 900,
    to: 4200,
    q: 1.2,
    wet: 0.8,
  });
  const root = vary(523, 0.02);
  bellLayer(bus, time + 0.03, { root, partials: [1, 1.5, 2.01, 3.02], decay: 0.9, gain: 0.13, wet: 0.9, attack: 0.05 });
  bellLayer(bus, time + 0.19, { root: root * 1.5, partials: [1, 2.01, 3.0], decay: 0.7, gain: 0.09, wet: 1.0, attack: 0.06 });
  // 粒の煌めき。数を絞って散らす
  grainBurst(bus, time + 0.05, {
    count: 7,
    spread: 0.4,
    grain: 0.012,
    gain: 0.07,
    from: 5200,
    to: 7800,
    q: 8,
    wet: 1.0,
  });
  ELEMENT[element].texture?.(bus, time + 0.02, 0.22, 0.7);
}

/** 強化(バフ) */
export function playBuff(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.16,
    decay: 0.28,
    gain: 0.18,
    filter: "bandpass",
    from: 500,
    to: 3600,
    q: 2.2,
    wet: 0.7,
  });
  toneLayer(bus, time + 0.02, {
    type: "triangle",
    from: 196,
    to: 392,
    attack: 0.09,
    decay: 0.45,
    gain: 0.14,
    lowpass: 1400,
    wet: 0.7,
    sweep: "exp",
  });
  bellLayer(bus, time + 0.12, { root: vary(784, 0.02), partials: [1, 2.01, 2.98], decay: 0.55, gain: 0.09, wet: 0.9, attack: 0.03 });
  ELEMENT[element].texture?.(bus, time + 0.04, 0.2, 0.6);
}

/** 弱体(デバフ) */
export function playDebuff(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.09,
    decay: 0.42,
    gain: 0.2,
    filter: "lowpass",
    from: 2600,
    to: 260,
    q: 3.2,
    wet: 0.65,
  });
  toneLayer(bus, time + 0.03, {
    type: "triangle",
    from: 233,
    to: 104,
    attack: 0.06,
    decay: 0.5,
    gain: 0.16,
    lowpass: 900,
    drive: 4,
    wet: 0.6,
  });
  // わずかにずらした低音を重ねてうねらせる。不安な響きを作る
  toneLayer(bus, time + 0.03, {
    type: "sine",
    from: 231,
    to: 103,
    attack: 0.06,
    decay: 0.5,
    gain: 0.1,
    lowpass: 700,
    wet: 0.6,
    detune: 24,
  });
  ELEMENT[element].texture?.(bus, time + 0.02, 0.2, 0.6);
}

/** 必殺技の溜め */
export function playCharge(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  const profile = ELEMENT[element];
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.42,
    decay: 0.1,
    gain: 0.26,
    filter: "bandpass",
    from: 260,
    to: 4600 * profile.attackScale,
    q: 3.4,
    wet: 0.55,
  });
  toneLayer(bus, time, {
    type: "sine",
    from: 48,
    to: 132,
    attack: 0.38,
    decay: 0.16,
    gain: 0.3,
    lowpass: 380,
    drive: 6,
    wet: 0.4,
  });
  grainBurst(bus, time + 0.16, {
    kind: "crackle",
    count: 10,
    spread: 0.34,
    grain: 0.01,
    gain: 0.12,
    from: 2600,
    to: 5200,
    q: 6,
    wet: 0.7,
    fade: -0.6,
  });
}

/** ターン開始(手番が回ってきた合図)。主張しすぎないこと */
export function playTurnStart(bus: SoundBus, time: number, ally: boolean): void {
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.006,
    decay: 0.16,
    gain: 0.12,
    filter: "bandpass",
    from: ally ? 1800 : 1100,
    to: ally ? 3400 : 520,
    q: 2.6,
    wet: 0.5,
  });
  toneLayer(bus, time + 0.004, {
    type: "sine",
    from: ally ? 320 : 180,
    to: ally ? 420 : 128,
    attack: 0.008,
    decay: 0.22,
    gain: 0.1,
    lowpass: 1200,
    wet: 0.55,
  });
}

/** UI: 軽い操作音 */
export function playTap(bus: SoundBus, time: number): void {
  noiseLayer(bus, time, {
    kind: "white",
    attack: 0.001,
    decay: 0.035,
    gain: 0.16,
    filter: "bandpass",
    from: 3200,
    to: 1500,
    q: 2.6,
    highpass: 600,
    wet: 0.25,
  });
  toneLayer(bus, time, {
    type: "sine",
    from: 640,
    to: 420,
    attack: 0.002,
    decay: 0.05,
    gain: 0.07,
    lowpass: 1800,
    wet: 0.3,
  });
}

/** UI: スキルを選んだ。tap より少し華やかに */
export function playSelect(bus: SoundBus, time: number, element: SfxElement = "NEUTRAL"): void {
  noiseLayer(bus, time, {
    kind: "white",
    attack: 0.0012,
    decay: 0.05,
    gain: 0.2,
    filter: "bandpass",
    from: 4600,
    to: 2000,
    q: 2.2,
    highpass: 700,
    wet: 0.35,
  });
  bellLayer(bus, time + 0.002, { root: vary(880, 0.02), partials: [1, 2.01, 3.02], decay: 0.28, gain: 0.09, wet: 0.6 });
  ELEMENT[element].texture?.(bus, time + 0.01, 0.16, 0.4);
}

/** 決着(勝ち) */
export function playVictory(bus: SoundBus, time: number): void {
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.25,
    decay: 0.9,
    gain: 0.18,
    filter: "bandpass",
    from: 700,
    to: 2800,
    q: 1.2,
    wet: 0.9,
  });
  // 和音は同時に鳴らさず、下から順に積む。一気に鳴らすと合成らしさが出る
  const root = 196;
  [1, 1.5, 2, 3].forEach((ratio, i) => {
    bellLayer(bus, time + i * 0.09, {
      root: vary(root * ratio, 0.01),
      partials: [1, 2.01, 3.0],
      decay: 1.5 - i * 0.15,
      gain: 0.12 - i * 0.015,
      wet: 0.95,
      attack: 0.04,
    });
  });
}

export type SfxName =
  | "hit"
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

/**
 * 名前で効果音を組み立てる。実際の再生(`engine.ts`)と
 * オフラインでの測定(`debug.ts`)の両方がここを通るので、
 * **測った音と鳴っている音が必ず一致する。**
 */
export function renderSfx(bus: SoundBus, time: number, name: SfxName, options: HitOptions = {}): void {
  const element = options.element ?? "NEUTRAL";
  switch (name) {
    case "hit":
      playHit(bus, time, options);
      break;
    case "whiff":
      playWhiff(bus, time, element);
      break;
    case "shield":
      playShield(bus, time, element);
      break;
    case "death":
      playDeath(bus, time, element);
      break;
    case "heal":
      playHeal(bus, time, element);
      break;
    case "buff":
      playBuff(bus, time, element);
      break;
    case "debuff":
      playDebuff(bus, time, element);
      break;
    case "charge":
      playCharge(bus, time, element);
      break;
    case "turnAlly":
      playTurnStart(bus, time, true);
      break;
    case "turnEnemy":
      playTurnStart(bus, time, false);
      break;
    case "tap":
      playTap(bus, time);
      break;
    case "select":
      playSelect(bus, time, element);
      break;
    case "victory":
      playVictory(bus, time);
      break;
    case "defeat":
      playDefeat(bus, time);
      break;
  }
}

/** 決着(負け) */
export function playDefeat(bus: SoundBus, time: number): void {
  noiseLayer(bus, time, {
    kind: "pink",
    attack: 0.1,
    decay: 1.4,
    gain: 0.22,
    filter: "lowpass",
    from: 1800,
    to: 130,
    q: 2,
    wet: 0.85,
  });
  toneLayer(bus, time + 0.05, {
    type: "sine",
    from: 146,
    to: 58,
    attack: 0.08,
    decay: 1.5,
    gain: 0.3,
    lowpass: 320,
    drive: 7,
    wet: 0.7,
  });
  toneLayer(bus, time + 0.28, {
    type: "sine",
    from: 110,
    to: 44,
    attack: 0.1,
    decay: 1.3,
    gain: 0.2,
    lowpass: 260,
    drive: 6,
    wet: 0.8,
    detune: -14,
  });
}
