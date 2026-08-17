"""音の焼き込み経路が本当に通るかを確かめるだけの最小スクリプト。

ここで確かめたいのは「良い音か」ではなく、
ノイズ生成 → フィルタ → エンベロープ → リバーブ → ogg書き出し が
一続きで動くかどうか。実制作は render.py 側で行う。
"""

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, Reverb, Compressor, HighpassFilter
from scipy.signal import butter, sosfilt

SR = 48000


def impact(seed: int) -> np.ndarray:
    """打撃音。3層(アタック/ボディ/テイル)をノイズから作る。"""
    rng = np.random.default_rng(seed)
    n = int(SR * 0.5)
    t = np.arange(n) / SR

    # アタック: 広帯域ノイズを一瞬だけ。子音にあたる部分
    attack = rng.standard_normal(n) * np.exp(-t * 420.0)

    # ボディ: 低域へ落ちるノイズ。フィルタを掃引して「当たった質量」を出す
    body_src = rng.standard_normal(n)
    sos = butter(2, 900, btype="low", fs=SR, output="sos")
    body = sosfilt(sos, body_src) * np.exp(-t * 26.0)

    # テイル: 帯域を絞ったノイズを長めに残す。余韻の芯
    tail_src = rng.standard_normal(n)
    sos_t = butter(2, [1800, 6000], btype="band", fs=SR, output="sos")
    tail = sosfilt(sos_t, tail_src) * np.exp(-t * 9.0) * 0.35

    mix = attack * 0.5 + body * 1.0 + tail
    return mix / np.max(np.abs(mix))


def main() -> None:
    dry = impact(1)
    board = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=45),
        Compressor(threshold_db=-14, ratio=3.2, attack_ms=1.0, release_ms=90),
        Reverb(room_size=0.34, damping=0.62, wet_level=0.17, dry_level=0.92, width=0.9),
    ])
    wet = board(dry.astype(np.float32), SR)
    wet = wet / np.max(np.abs(wet)) * 0.89

    sf.write("/tmp/smoke.ogg", wet, SR, format="OGG", subtype="VORBIS")
    sf.write("/tmp/smoke.wav", wet, SR)

    # 測る: 安っぽい音は「倍音列がむき出しの純音」になる。
    # ノイズ由来なら、スペクトルのピークが1本に立たず広く散る
    spec = np.abs(np.fft.rfft(wet[: SR // 4]))
    freqs = np.fft.rfftfreq(SR // 4, 1 / SR)
    peak = spec.max()
    # ピークの半分以上のエネルギーを持つビンの数(純音なら数本、ノイズなら多数)
    wide = int(np.sum(spec > peak * 0.5))
    centroid = float(np.sum(freqs * spec) / np.sum(spec))
    # 減衰時間: 包絡が最大の1/1000(-60dB)まで落ちる時刻
    env = np.abs(wet)
    above = np.where(env > env.max() * 0.001)[0]
    decay_ms = (above[-1] - above[0]) / SR * 1000

    import os

    print(f"ピーク周波数     : {freqs[int(np.argmax(spec))]:.0f} Hz")
    print(f"重心             : {centroid:.0f} Hz")
    print(f"ピーク付近のビン数: {wide}  (純音なら1〜3本、ノイズなら数十以上)")
    print(f"減衰時間(-60dB)  : {decay_ms:.0f} ms")
    print(f"ogg のサイズ     : {os.path.getsize('/tmp/smoke.ogg') / 1024:.1f} KB")


if __name__ == "__main__":
    main()
