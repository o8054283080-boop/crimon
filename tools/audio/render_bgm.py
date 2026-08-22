"""BGMを焼く。

**旋律は書かない。** 場面ごとの音楽を旋律で作ると、8小節目で必ず「またこれか」
になり、どんなに凝っても着信音の親戚に聞こえる。ここで作るのは
「環境音 + 持続音 + まばらな出来事」の3層で、場の空気だけを敷くもの。

## 層の配合は実効値で決める

頭(ピーク)で合わせると正弦だけが飛び出す。実際、最初に作った版は
ピークで合わせたせいで `純音らしさ` が 0.75 と 0.98 になり、
ノイズの土台が持続音に完全に埋もれていた。`at_rms()` で決めること。

## ループの継ぎ目について

音を切ってクロスフェードでつなぐやり方は使わない。**必ずそこで何かが起きたと
分かってしまう**から。代わりに、

- 土台のノイズは `loop_noise()` で作る(スペクトルから逆変換するので、
  定義上ちょうど一周で閉じる)
- 持続音の周波数と揺れの速さを、すべて 1/ループ長 の整数倍に丸める
- 減衰する出来事はループ長より長く作り、はみ出した尾を頭に足し込む(`wrap_loop`)
- 時間とともに動くフィルタと残響は、3周ぶん並べてから掛けて真ん中を切り出す
  (どちらも因果的なので、1周ぶん助走させれば出力も周期的になる)

継ぎ目がつながったかどうかは耳で確かめにくいので、`seam_error()` で測る。

  tools/audio/.venv/bin/python tools/audio/render_bgm.py
"""

from __future__ import annotations

import json
import zlib
from pathlib import Path

import numpy as np
from pedalboard import HighpassFilter, HighShelfFilter, LowShelfFilter, Pedalboard, Reverb

from dsp import (
    SR,
    at_rms,
    bandpass,
    filter_curve,
    grains,
    highpass,
    lowpass,
    loop_noise,
    modal,
    normalize,
    rms,
    seam_error,
    secs,
    t_of,
    tonality_windows,
    wrap_loop,
    write_ogg,
)

OUT_DIR = Path(__file__).resolve().parents[2] / "public" / "audio"

# ループの長さ。短いと繰り返しに気付かれ、長いとファイルが重くなる。
# 「まばらな出来事」が同じ順で戻ってくるまでの時間がここで決まるので、
# 出来事の間隔(5〜10秒)より十分長く取る
LOOP_SEC = 32.0
LOOP_N = secs(LOOP_SEC)

# 出来事の尾を鳴らし切るための余白。ここまで作ってから頭へ折り返す
TAIL_N = secs(8.0)

# 焼き上がりの実効値。**曲どうしはここでそろえる。**
# 効果音がこの上に乗るので低めに取り、頭が 0.9 を超えないことを確かめる
TARGET_RMS = 0.1


def q(hz: float) -> float:
    """ループ長の整数倍に丸める。ここを外すと継ぎ目でプツッと鳴る。"""
    return max(1.0, round(hz * LOOP_SEC)) / LOOP_SEC


def cycles(count: int, phase: float = 0.0) -> np.ndarray:
    """ループ内でちょうど count 周する波。0..1 の範囲で返す。"""
    return 0.5 - 0.5 * np.cos(2 * np.pi * (count * np.arange(LOOP_N) / LOOP_N + phase))


def looped(x: np.ndarray, process) -> np.ndarray:
    """周期を保ったままフィルタを掛ける。

    **`lowpass()` などをループにそのまま掛けてはいけない。** フィルタは
    静止状態から始まるので、頭の数十msだけ助走中の音になり、そこが継ぎ目に
    なる。3周ぶん並べて掛け、真ん中の1周を取れば、助走が終わった状態が残る。
    """
    return process(np.tile(x, 3))[LOOP_N : 2 * LOOP_N]


def looped_curve_filter(x: np.ndarray, curve: np.ndarray, kind: str) -> np.ndarray:
    """動くフィルタ版。カットオフの曲線も一緒に3周ぶん並べる。"""
    return looped(x, lambda tiled: filter_curve(tiled, np.tile(curve, 3), kind))


def drone(freqs: list[float], rng: np.random.Generator, beat: float = 0.35) -> np.ndarray:
    """途切れない持続音。

    1本の正弦は動かないので発振器そのものに聞こえる。同じ高さを2本、
    わずかにずらして重ねると「うなり」が生まれ、音が呼吸を始める。
    ずらし幅もループ長の整数倍に丸めて、継ぎ目で位相が合うようにする。
    """
    t = t_of(LOOP_N)
    out = np.zeros(LOOP_N)
    for i, hz in enumerate(freqs):
        base = q(hz)
        offset = q(beat * (0.7 + 0.6 * rng.random()))
        pair = np.zeros(LOOP_N)
        for f in (base, base + offset):
            pair += np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
        # 成分ごとに違う速さで音量を揺らす。同じ速さだと機械的な脈になる
        lfo = 0.55 + 0.45 * cycles(int(2 + i * 3 + rng.integers(0, 3)), rng.random())
        out += pair * 0.5 * lfo / (1.0 + i * 0.4)
    return out / (len(freqs) ** 0.5)


def sparse(rng: np.random.Generator, count: int, make, gain_range=(0.5, 1.0)) -> np.ndarray:
    """まばらな出来事を並べる。ループ長より長く作って、尾を頭へ折り返す。

    等間隔に置くと拍として聞こえてしまうので、間隔も音量も散らす。

    **この層の音量は `at_rms` で決めてはいけない。** ほとんどが無音なので、
    実効値をそろえると1つ1つの出来事が途方もなく大きくなる。実際、
    最初の版は遠くの金属音の頭が土台の8倍まで膨れ、そこに正規化が
    引っ張られて曲全体が14dB小さくなっていた。頭(`normalize`)で決めること。
    """
    long = np.zeros(LOOP_N + TAIL_N)
    slots = np.sort(rng.permutation(count) + rng.random(count) * 0.8)
    for k in range(count):
        at = int((slots[k] / count) * LOOP_N)
        event = make(rng)
        end = min(len(long), at + len(event))
        long[at:end] += event[: end - at] * rng.uniform(*gain_range)
    return wrap_loop(long, LOOP_N)


# ------------------------------------------------------------------ 拠点


def bgm_home(rng: np.random.Generator) -> np.ndarray:
    """拠点。広くて静かな場所。低い持続音の上に、遠い空気とまばらな響き。

    実効値の配分(左右それぞれ):
        空気 0.14 / 低い層 0.075 / 持続音 0.055 / 高い空気 0.025
        (出来事だけは実効値ではなく頭 0.2 で決める。理由は `sparse` の説明)
    土台のノイズを持続音の倍以上にしてある。逆にすると、そのまま
    「電子音のパッド」になって安っぽく聞こえる。
    """
    def air(r: np.random.Generator) -> np.ndarray:
        # 呼吸するようにカットオフを行き来させる。動かないと「砂嵐」になる
        bed = loop_noise(LOOP_N, r, slope=1.0)
        bed = looped_curve_filter(bed, 700.0 * (2.4 ** cycles(3, r.random())), "low")
        bed = looped(bed, lambda t: highpass(t, 160))
        return at_rms(bed * (0.6 + 0.4 * cycles(2, r.random())), 0.14)

    def shelf(r: np.random.Generator) -> np.ndarray:
        """遠くの高い空気。ごく薄く敷くと、こもった塊にならずに済む。"""
        bed = looped(loop_noise(LOOP_N, r, slope=1.2), lambda t: highpass(t, 2200))
        return at_rms(bed * (0.35 + 0.65 * cycles(5, r.random())), 0.025)

    def low(r: np.random.Generator) -> np.ndarray:
        bed = looped(loop_noise(LOOP_N, r, slope=2.0), lambda t: lowpass(t, 130))
        return at_rms(bed * (0.6 + 0.4 * cycles(2, r.random())), 0.075)

    # 持続音: 5度を積んだだけの塊。和音の進行を作らないので旋律にならない
    body = at_rms(drone([55.0, 82.5, 110.0, 164.5, 220.0], rng, beat=0.32), 0.055)

    # まばらな出来事: 遠くで何かが鳴る。等間隔に置かない
    def bell(r: np.random.Generator) -> np.ndarray:
        n = secs(r.uniform(3.5, 6.0))
        base = float(r.choice([220.0, 275.0, 330.0, 412.5]))
        ring = modal(n, [base, base * 1.51, base * 2.24, base * 3.37], [2.2, 3.0, 4.0, 5.5], r, 0.7)
        return ring * np.exp(-t_of(n) * r.uniform(0.5, 0.9))

    def breath(r: np.random.Generator) -> np.ndarray:
        n = secs(r.uniform(4.0, 7.0))
        swell = bandpass(loop_noise(n, r, 1.0), 300, 2600) * np.sin(np.linspace(0, np.pi, n)) ** 2.0
        return swell

    def events(r: np.random.Generator) -> np.ndarray:
        return normalize(sparse(r, 5, bell, (0.4, 1.0)) * 1.4 + sparse(r, 4, breath, (0.3, 0.8)), 0.2)

    return np.stack([
        air(rng) + shelf(rng) + low(rng) + body + events(rng),
        air(rng) + shelf(rng) + low(rng) + body + events(rng),
    ])


# ------------------------------------------------------------------ 戦い


def bgm_battle(rng: np.random.Generator) -> np.ndarray:
    """戦い。緊張を作るのは音量ではなく、**濁りと圧**。

    旋律も打楽器の刻みも置かない。低い脈と、わずかに濁った持続音、
    そして遠くの金属音だけで「まだ終わっていない」を伝える。

    実効値の配分(左右それぞれ):
        圧 0.13 / 中域 0.075 / 脈 0.085 / 持続音 0.05 / 高域 0.015
        (金属だけは実効値ではなく頭 0.14 で決める。理由は `sparse` の説明)
    """
    def pressure(r: np.random.Generator) -> np.ndarray:
        # 低い帯域が押しては引く。ループ内で5周ぶん(=約6秒に1回)波打つ
        bed = loop_noise(LOOP_N, r, slope=2.0)
        bed = looped_curve_filter(bed, 150.0 * (3.0 ** cycles(5, r.random())), "low")
        return at_rms(bed * (0.45 + 0.55 * cycles(8, r.random())), 0.13)

    def mid(r: np.random.Generator) -> np.ndarray:
        bed = looped(loop_noise(LOOP_N, r, slope=1.4), lambda t: bandpass(t, 300, 2400))
        return at_rms(bed * (0.45 + 0.55 * cycles(3, r.random())), 0.075)

    def top(r: np.random.Generator) -> np.ndarray:
        bed = looped(loop_noise(LOOP_N, r, slope=1.2), lambda t: highpass(t, 1800))
        return at_rms(bed * (0.3 + 0.7 * cycles(6, r.random())), 0.015)

    # 持続音: 三全音ぶん濁らせる。協和した積み方だと落ち着いてしまう
    body = at_rms(drone([49.0, 69.3, 98.0, 146.9, 196.0], rng, beat=0.55), 0.05)

    # 脈: 深く、柔らかく。0.8秒ごとだが、音量を散らして機械の刻みにしない
    beats = 40
    pulse_long = np.zeros(LOOP_N + TAIL_N)
    for k in range(beats):
        at = int(k * LOOP_N / beats)
        n = secs(0.7)
        hit = lowpass(loop_noise(n, rng, 2.0), 95.0) * np.exp(-t_of(n) * 7.0)
        hit += bandpass(loop_noise(n, rng, 1.0), 200, 900) * np.exp(-t_of(n) * 26.0) * 0.25
        # 4拍に1回だけ強く。強弱がないと「機械が鳴らしている」と分かる
        gain = (0.95 if k % 4 == 0 else 0.5) * rng.uniform(0.85, 1.12)
        end = min(len(pulse_long), at + n)
        pulse_long[at:end] += hit[: end - at] * gain
    pulse = at_rms(wrap_loop(pulse_long, LOOP_N), 0.085)

    # 遠くの金属。減衰を速く取って音程に聞こえないようにする
    def scrape(r: np.random.Generator) -> np.ndarray:
        n = secs(r.uniform(2.0, 3.5))
        base = r.uniform(700, 1600)
        ring = modal(n, [base, base * 1.63, base * 2.41], [120.0, 160.0, 210.0], r, 0.6)
        ring *= np.exp(-t_of(n) * r.uniform(1.6, 2.6))
        dust = highpass(loop_noise(n, r, 1.0), 2500) * grains(n, r, 0.004, 6) * 1.6 * np.exp(-t_of(n) * 2.0)
        return ring * 0.6 + dust * 0.4

    def metal(r: np.random.Generator) -> np.ndarray:
        return normalize(sparse(r, 6, scrape, (0.3, 1.0)), 0.14)

    return np.stack([
        pressure(rng) + mid(rng) + top(rng) + body + pulse + metal(rng),
        pressure(rng) + mid(rng) + top(rng) + body + pulse + metal(rng),
    ])


TRACKS = {
    "home": bgm_home,
    "battle": bgm_battle,
}

# BGMは長く鳴り続けるので、効果音より上も下も抑える。
# 特に高域は、少しでも余ると数分で耳が痛くなる
SPACES = {
    "home": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=28),
        LowShelfFilter(cutoff_frequency_hz=140, gain_db=1.0),
        HighShelfFilter(cutoff_frequency_hz=5200, gain_db=-4.0),
        Reverb(room_size=0.85, damping=0.45, wet_level=0.3, dry_level=0.74, width=1.0),
    ]),
    "battle": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=26),
        LowShelfFilter(cutoff_frequency_hz=120, gain_db=1.5),
        HighShelfFilter(cutoff_frequency_hz=4800, gain_db=-4.5),
        Reverb(room_size=0.7, damping=0.55, wet_level=0.24, dry_level=0.8, width=1.0),
    ]),
}


def reverberate(stereo: np.ndarray, space: str) -> np.ndarray:
    """周期を保ったまま残響を掛ける。3周ぶん並べて掛け、真ん中を取る。"""
    tiled = np.concatenate([stereo, stereo, stereo], axis=1)
    wet = SPACES[space](tiled.astype(np.float32), SR)
    return np.asarray(wet, dtype=np.float64)[:, LOOP_N : 2 * LOOP_N]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT_DIR / "manifest.json"
    manifest: dict[str, list[str]] = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    # 純音らしさは、長い音では最大値ではなく分布で見る。
    # 10秒に1度だけ鳴る遠い鐘は意図したものなので、最大値だと判断を誤る
    print(f"{'名前':<10}{'純音 中央':>10}{'上位5%':>8}{'頭':>7}{'継ぎ目':>8}{'秒':>5}{'KB':>7}")
    for name, fn in TRACKS.items():
        rng = np.random.default_rng(zlib.crc32(name.encode()) & 0xFFFFFFFF)
        dry = fn(rng)
        wet = reverberate(dry, name)
        # **場面を切り替えた時に音量が変わらないよう、頭ではなく実効値でそろえる。**
        # 頭でそろえると、山の鋭い曲だけが小さく聞こえる(実際に14dBずれていた)
        wet = wet * (TARGET_RMS / (rms(wet) + 1e-12))
        filename = f"bgm_{name}.ogg"
        # 中身が同じなら触らない(容器の数バイトだけが変わって差分が埋もれるため)
        write_ogg(OUT_DIR / filename, wet.T)
        manifest[f"bgm_{name}"] = [filename]

        profile = tonality_windows(wet.mean(axis=0))
        size = (OUT_DIR / filename).stat().st_size
        print(
            f"{name:<10}{np.median(profile):>10.3f}{np.quantile(profile, 0.95):>8.3f}"
            f"{np.max(np.abs(wet)):>7.2f}{seam_error(wet):>8.2f}{LOOP_SEC:>5.0f}{size/1024:>7.0f}"
        )

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
