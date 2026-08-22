"""効果音とBGMを組み立てるための部品。

**方針: 音の芯はノイズで作る。** 発振器の純音を鳴らすと、どれだけ包絡を
凝っても「ピコピコ」から抜けられない。打撃・爆発・風はすべて帯域を絞った
ノイズで、金属や魔法の響きだけを非整数比の共振で足す。

**長く伸びる音には正弦が要る**(共振の帯域は減衰の速さで決まるので、
1秒鳴る響きはどうやっても細い帯域になる)。そこは正弦を使ってよいが、
1本で置いてはいけない。同じ高さを2〜3本わずかにずらして重ね、
うなりと遅い揺れを持たせる。動かない正弦こそが「安いシンセ」の正体。

安っぽさは `tonality()` で数値にする。詳しくはその関数の説明を読むこと。
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, lfilter, sosfilt, sosfilt_zi

SR = 48000


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


def brown(n: int, rng: np.random.Generator) -> np.ndarray:
    """ブラウンノイズ。ピンクよりさらに低域寄りで、地鳴りや胴鳴りの土台になる。"""
    out = np.cumsum(rng.standard_normal(n))
    out -= np.linspace(out[0], out[-1], n) if n > 1 else 0.0
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


def sweep_filter(x: np.ndarray, hz0: float, hz1: float, kind: str = "low", chunks: int = 96) -> np.ndarray:
    """カットオフを時間方向に動かす。

    打撃音の「当たった瞬間は明るく、すぐ暗くなる」は、包絡だけでは出ない。
    固定フィルタで作った音は、何度聞いても同じ位置で同じ色に聞こえてしまう。

    **フィルタの内部状態を区間をまたいで持ち越すこと。** 以前は区間ごとに
    フィルタを掛け直しており、1秒あたり百回以上の不連続が乗っていた。
    低いカットオフほど過渡応答が長いので、そこでジリジリという雑音になる。
    """
    n = len(x)
    if n == 0:
        return x
    out = np.zeros(n)
    size = max(1, n // chunks)
    zi: np.ndarray | None = None
    for i in range(0, n, size):
        end = min(n, i + size)
        p = i / max(1, n - 1)
        hz = hz0 * (hz1 / hz0) ** p
        hz = float(np.clip(hz, 20.0, SR / 2 - 200))
        sos = butter(2, hz, btype=kind, fs=SR, output="sos")
        if zi is None:
            zi = sosfilt_zi(sos) * x[0]
        segment, zi = sosfilt(sos, x[i:end], zi=zi)
        out[i:end] = segment
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


def resonator(x: np.ndarray, hz: float, decay: float) -> np.ndarray:
    """2極の共振器。ノイズを通すと「叩かれて鳴っている物体」になる。

    正弦を足すのとの違いは、出てくる音に幅があること。共振の帯域幅は
    おおよそ decay/π Hz なので、減衰が速い(= 短い)響きほどノイズに近づく。
    打撃の余韻や金属の当たりは、これで作ると格段に本物寄りになる。
    """
    r = float(min(np.exp(-decay / SR), 0.99999))
    theta = 2 * np.pi * min(hz, SR / 2 - 100) / SR
    y = lfilter([1.0 - r], [1.0, -2 * r * np.cos(theta), r * r], x)
    m = np.max(np.abs(y))
    return y / m if m > 1e-9 else y


def modal(n: int, freqs: list[float], decays: list[float], rng: np.random.Generator, amp: float = 1.0) -> np.ndarray:
    """ノイズで叩いた共振の束。短〜中くらいの余韻(金属・結晶・打面)に使う。

    比率は呼び出し側で非整数にしておくこと。整数倍音で重ねると音程になり、
    効果音としては「安いシンセ」に聞こえる。
    """
    out = np.zeros(n)
    strike = np.zeros(n)
    k = max(2, secs(0.0015))
    strike[:k] = rng.standard_normal(k)
    for hz, decay in zip(freqs, decays):
        detuned = hz * (1.0 + rng.uniform(-0.02, 0.02))
        # 叩く衝撃に、減衰しながら続く弱いノイズを足す。後者が響きの「揺れ」になる
        breath = rng.standard_normal(n) * np.exp(-t_of(n) * decay * 0.8) * 0.25
        out += resonator(strike + breath, detuned, decay) * rng.uniform(0.7, 1.0)
    return out / (len(freqs) ** 0.5) * amp


def sines(
    n: int,
    freqs: list[float],
    decays: list[float],
    rng: np.random.Generator,
    amp: float = 1.0,
    beat_hz: tuple[float, float] = (0.2, 1.4),
    drift: float = 0.35,
) -> np.ndarray:
    """うなりと揺れを持たせた正弦の束。**長く伸びる響きだけに使う。**

    1本の正弦は、どれだけ包絡を凝っても発振器そのものに聞こえる。
    実際の鐘や弦は、わずかに高さの違う成分が同時に鳴って「うなり」を出す。
    ここでは1つの成分につき正弦を2本、0.2〜1.4Hz ぶんずらして重ね、
    さらに成分ごとに違う速さのゆっくりした音量の揺れを掛ける。

    比率を非整数にするのは呼び出し側の責任(和音にすると旋律に聞こえる)。
    """
    t = t_of(n)
    out = np.zeros(n)
    for hz, decay in zip(freqs, decays):
        beat = rng.uniform(*beat_hz)
        pair = np.zeros(n)
        for sign in (-1.0, 1.0):
            f = hz + sign * beat * 0.5
            pair += np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
        # 成分ごとに違う速さで揺らす。全部同じ速さだと機械的な脈になる
        lfo = 1.0 - drift * 0.5 * (1.0 - np.cos(2 * np.pi * rng.uniform(0.13, 0.61) * t + rng.uniform(0, 6.28)))
        out += pair * 0.5 * lfo * np.exp(-t * decay)
    return out / (len(freqs) ** 0.5) * amp


def click(n: int, rng: np.random.Generator, brightness: float = 6000.0) -> np.ndarray:
    """アタック層。ごく短い広帯域ノイズ。子音にあたる部分。"""
    x = noise(n, rng) * env_exp(n, 420.0, attack_ms=0.2)
    return highpass(x, brightness * 0.25)


def grains(n: int, rng: np.random.Generator, density: float, spread: int = 3) -> np.ndarray:
    """まばらな粒。火のはぜ、瓦礫、葉ずれなど「不規則に鳴るもの」の門に使う。"""
    gate = (rng.random(n) < density).astype(float)
    for _ in range(spread):
        gate = np.maximum(gate, np.roll(gate, 1) * 0.78)
    return gate


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


def place(total: int, x: np.ndarray, at: int, gain: float = 1.0) -> np.ndarray:
    """長さ total の中の位置 at に x を置く。BGMのまばらな出来事を並べるのに使う。"""
    out = np.zeros(total)
    at = int(at) % total
    end = min(total, at + len(x))
    out[at:end] += x[: end - at] * gain
    return out


def delay(x: np.ndarray, ms: float, gain: float, total: int | None = None) -> np.ndarray:
    d = secs(ms / 1000.0)
    n = total or (len(x) + d)
    out = np.zeros(n)
    out[: len(x)] += x
    end = min(n, d + len(x))
    out[d:end] += x[: end - d] * gain
    return out


def wrap_loop(x: np.ndarray, length: int) -> np.ndarray:
    """はみ出した尾を頭に折り返して、継ぎ目のないループにする。

    音を切って端をなじませる(クロスフェード)やり方だと、必ず「そこで何かが
    起きた」と分かってしまう。作る側で length より長く鳴らしておき、
    余りを足し込めば、数学的に周期が閉じる。
    """
    out = np.zeros(length)
    for i in range(0, len(x), length):
        chunk = x[i : i + length]
        out[: len(chunk)] += chunk
    return out


# ------------------------------------------------------------------ 測る


TONALITY_FLOOR_HZ = 150.0


def tonality(x: np.ndarray, k: float = 4.0, win: int = 4096) -> float:
    """**純音らしさ。** 0に近いほどノイズ、1に近いほど発振器の音。

    以前は「上位1%のビンが持つエネルギー比」で測っていたが、これは
    *狭い* 音を測っているのであって *純音* を測っていなかった。
    低域だけの重い打撃(良い音)が 0.98、440Hz の正弦(悪い音)が 1.00 と
    ほとんど区別できず、「0.5を超えたら疑う」という目安に従うと
    **低音の胴を削る方向へ誘導されてしまう**(実際、既存の音は重心が
    5〜11kHz に寄っていて痩せていた)。

    ここでは「周りより飛び出た山」だけを数える。各ビンについて 1/5 オクターブ
    ほどの窓で中央値(= その辺りの地の高さ)を取り、それの k 倍を超えた分だけを
    純音成分とみなす。帯域ノイズは地が高いので数えられず、正弦だけが残る。

    150Hz 未満は数えない。この分解能では「DCから続く低い塊」と「低い正弦」を
    区別できず、しかも低音の胴は削りたくないところだから。

    **窓ごとに測って、いちばん高いところを返す。** 平均や、いちばん大きい窓
    だけを見ると、頭の一撃がノイズなら後ろで正弦が伸びていても見逃してしまう。
    ただし消え際まで見ると尻尾の残響を拾うので、山の1割より小さい窓は数えない。

    目安(実測):
        正弦1本 1.00 / 非整数比の共振4本 0.96 / 共振とノイズ半々 0.51
        帯域ノイズ 0.00〜0.01 / 低域ノイズ 0.00〜0.05
    """
    n = len(x)
    if n < win:
        x = np.pad(x, (0, win - n))
        n = win
    hop = win // 2
    starts = list(range(0, n - win + 1, hop)) or [0]
    energy = np.array([float(np.sum(x[s : s + win] ** 2)) for s in starts])
    loud = energy >= energy.max() * 0.1

    band = np.fft.rfftfreq(win, 1 / SR) >= TONALITY_FLOOR_HZ
    hann = np.hanning(win)
    worst = 0.0
    for s, keep in zip(starts, loud):
        if not keep:
            continue
        spec = np.abs(np.fft.rfft(x[s : s + win] * hann)) ** 2
        spec = np.convolve(spec, np.ones(5) / 5, mode="same")
        m = len(spec)
        env = np.empty(m)
        for i in range(m):
            half = max(20, int(i * 0.2))
            env[i] = np.median(spec[max(0, i - half) : min(m, i + half + 1)])
        excess = np.maximum(0.0, spec - k * env)[band]
        worst = max(worst, float(np.sum(excess) / (np.sum(spec[band]) + 1e-20)))
    return worst


def analyze(x: np.ndarray) -> dict:
    """安っぽさの判定材料を数値で返す。耳の代わりではなく、耳の裏付けに使う。"""
    spec = np.abs(np.fft.rfft(x[: min(len(x), SR)]))
    freqs = np.fft.rfftfreq(len(x[: min(len(x), SR)]), 1 / SR)

    env = np.abs(x)
    above = np.where(env > env.max() * 0.001)[0]
    length_ms = (above[-1] - above[0]) / SR * 1000 if len(above) > 1 else 0.0
    attack_ms = int(np.argmax(env)) / SR * 1000

    # 低域の取り分。痩せた音を見つけるための数値。
    # 200Hz 以下がほとんど無い打撃音は、鳴らしても「当たった」と感じられない
    power = spec**2
    low = float(np.sum(power[freqs < 200]) / (np.sum(power) + 1e-20))

    return {
        "重心": float(np.sum(freqs * spec) / (np.sum(spec) + 1e-12)),
        "純音らしさ": tonality(x),
        "低域比": low,
        "立ち上がり(ms)": attack_ms,
        "長さ(ms)": length_ms,
    }
