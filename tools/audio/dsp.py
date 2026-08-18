"""効果音を組み立てるための部品。

**方針: 音の芯はノイズで作る。** 発振器の純音を鳴らすと、どれだけ包絡を
凝っても「ピコピコ」から抜けられない。打撃・爆発・風はすべて帯域を絞った
ノイズで、金属や魔法の響きだけを非整数比の共振で足す。

安っぽさを数値で判定できるように、`analyze()` で
「ピーク付近のビン数」(純音なら1〜3本、ノイズなら数十以上)と
「上位1%のビンが持つエネルギー比」(純音ほど高い)を測る。
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

SR = 48000
RNG_STREAM = np.random.default_rng


def t_of(n: int) -> np.ndarray:
    return np.arange(n) / SR


def secs(seconds: float) -> int:
    return int(SR * seconds)


def noise(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n)


def pink(n: int, rng: np.random.Generator) -> np.ndarray:
    """ピンクノイズ。白より低域が厚く、打撃の胴として自然に聞こえる。"""
    white = rng.standard_normal(n)
    # Voss-McCartney の簡易版(一次フィルタの重ね合わせ)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    out = lfilter(b, a, white)
    return out / (np.max(np.abs(out)) + 1e-9)


def lowpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, min(hz, SR / 2 - 100), btype="low", fs=SR, output="sos"), x)


def highpass(x: np.ndarray, hz: float, order: int = 2) -> np.ndarray:
    return sosfilt(butter(order, max(hz, 10), btype="high", fs=SR, output="sos"), x)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    lo = max(lo, 10)
    hi = min(hi, SR / 2 - 100)
    if hi <= lo:
        hi = lo * 1.5
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def sweep_filter(x: np.ndarray, hz0: float, hz1: float, kind: str = "low", chunks: int = 64) -> np.ndarray:
    """カットオフを時間方向に動かす。

    打撃音の「当たった瞬間は明るく、すぐ暗くなる」は、包絡だけでは出ない。
    固定フィルタで作った音は、何度聞いても同じ位置で同じ色に聞こえてしまう。
    """
    n = len(x)
    out = np.zeros(n)
    size = max(1, n // chunks)
    for i in range(0, n, size):
        end = min(n, i + size)
        p = i / max(1, n - 1)
        hz = hz0 * (hz1 / hz0) ** p
        seg = x[max(0, i - 256) : end]
        filtered = lowpass(seg, hz, 2) if kind == "low" else highpass(seg, hz, 2)
        out[i:end] = filtered[len(filtered) - (end - i) :]
    return out


def env_exp(n: int, decay: float, attack_ms: float = 1.0) -> np.ndarray:
    """指数減衰。attack_ms だけ立ち上がりを鈍らせる(0だとプチッと鳴る)。"""
    t = t_of(n)
    e = np.exp(-t * decay)
    a = secs(attack_ms / 1000.0)
    if a > 1:
        e[:a] *= np.linspace(0, 1, a) ** 0.6
    return e


def env_ar(n: int, attack_ms: float, decay: float) -> np.ndarray:
    return env_exp(n, decay, attack_ms)


def saturate(x: np.ndarray, drive: float = 1.6) -> np.ndarray:
    """柔らかく潰す。倍音が増えて、小さい音でも「当たった重み」が出る。"""
    return np.tanh(x * drive) / np.tanh(drive)


def resonance(n: int, freqs: list[float], decays: list[float], rng: np.random.Generator, amp: float = 1.0) -> np.ndarray:
    """非整数比の共振。

    整数倍音(1:2:3...)で重ねると楽器の音程になってしまい、
    効果音としては「安いシンセ」に聞こえる。金属や結晶は非整数比で鳴るので、
    比率をわざと外して重ねる。
    """
    t = t_of(n)
    out = np.zeros(n)
    for f, d in zip(freqs, decays):
        detune = 1.0 + rng.uniform(-0.012, 0.012)
        phase = rng.uniform(0, 2 * np.pi)
        out += np.sin(2 * np.pi * f * detune * t + phase) * np.exp(-t * d)
    return out / (len(freqs) ** 0.5) * amp


def click(n: int, rng: np.random.Generator, brightness: float = 6000.0) -> np.ndarray:
    """アタック層。ごく短い広帯域ノイズ。子音にあたる部分。"""
    x = noise(n, rng) * env_exp(n, 420.0, attack_ms=0.2)
    return highpass(x, brightness * 0.25)


def normalize(x: np.ndarray, peak: float = 0.92) -> np.ndarray:
    m = np.max(np.abs(x))
    return x * (peak / m) if m > 1e-9 else x


def fade_out(x: np.ndarray, ms: float = 12.0) -> np.ndarray:
    a = min(len(x), secs(ms / 1000.0))
    if a > 1:
        x[-a:] *= np.linspace(1, 0, a) ** 0.7
    return x


def mix(*layers: np.ndarray) -> np.ndarray:
    n = max(len(l) for l in layers)
    out = np.zeros(n)
    for l in layers:
        out[: len(l)] += l
    return out


def delay(x: np.ndarray, ms: float, gain: float, total: int | None = None) -> np.ndarray:
    d = secs(ms / 1000.0)
    n = total or (len(x) + d)
    out = np.zeros(n)
    out[: len(x)] += x
    end = min(n, d + len(x))
    out[d:end] += x[: end - d] * gain
    return out


def analyze(x: np.ndarray) -> dict:
    """安っぽさの判定材料を数値で返す。耳の代わりではなく、耳の裏付けに使う。"""
    seg = x[: min(len(x), SR // 4)]
    spec = np.abs(np.fft.rfft(seg))
    freqs = np.fft.rfftfreq(len(seg), 1 / SR)
    peak = spec.max() + 1e-12
    total = float(np.sum(spec**2)) + 1e-12

    order = np.sort(spec)[::-1]
    top = max(1, len(order) // 100)
    tonal_ratio = float(np.sum(order[:top] ** 2) / total)

    env = np.abs(x)
    above = np.where(env > env.max() * 0.001)[0]
    length_ms = (above[-1] - above[0]) / SR * 1000 if len(above) > 1 else 0.0
    peak_i = int(np.argmax(env))
    attack_ms = peak_i / SR * 1000

    return {
        "ピーク周波数": float(freqs[int(np.argmax(spec))]),
        "重心": float(np.sum(freqs * spec) / (np.sum(spec) + 1e-12)),
        "ピーク付近のビン数": int(np.sum(spec > peak * 0.5)),
        "上位1%のエネルギー比": tonal_ratio,
        "立ち上がり(ms)": attack_ms,
        "長さ(ms)": length_ms,
    }
