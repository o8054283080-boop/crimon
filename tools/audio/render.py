"""効果音を焼く。

ブラウザ上でその都度合成するのをやめ、ここで作った音を ogg で同梱する。
理由は、リアルタイム合成だとリバーブなどの重い処理が使えず、
どう作っても「安っぽい」側から抜けられなかったため。

**組み合わせで水増しする方針**にしてある。当たり方(4種)と属性(6種)を
全部焼くと24通りになるが、当たりの芯と属性の色を別ファイルにして
再生時に重ねれば、10ファイルで24通りが出せる。

## 作る時の決まりごと

1. **打撃はアタック/ボディ/テイルの3層で組む。** どれかが欠けると
   「短い雑音」か「こもった塊」にしかならない。
2. **低音を削らない。** 200Hz 以下が痩せた打撃は、鳴らしても当たった感じがしない。
   焼いたあとの `低域比` を見て判断する。
3. **同じ音の作り分けは、種を変えるだけでは足りない。** 帯域も減衰も同じまま
   ノイズの種だけ変えても、人の耳にはまったく同じ音に聞こえる。
   長さ・高さ・減衰・層の配合そのものを `rng` から引くこと。
4. **長く伸びる響きにだけ `sines` を使う。** それ以外は `modal`(ノイズで叩いた
   共振)にする。`純音らしさ` が上がるのはほぼ `sines` の使いすぎが原因。

  tools/audio/.venv/bin/python tools/audio/render.py
"""

from __future__ import annotations

import json
import zlib
from pathlib import Path

import numpy as np
from pedalboard import Compressor, HighpassFilter, HighShelfFilter, LowShelfFilter, Pedalboard, Reverb

from dsp import (
    SR,
    analyze,
    write_ogg,
    bandpass,
    brown,
    click,
    env_exp,
    fade_out,
    grains,
    highpass,
    lowpass,
    mix,
    modal,
    noise,
    normalize,
    pink,
    saturate,
    secs,
    sines,
    sweep_filter,
)

OUT_DIR = Path(__file__).resolve().parents[2] / "public" / "audio"

# 1つの音につき何通り焼くか。既定は3で、戦闘中に何度も鳴るものだけ増やす。
# 同じ波形が続けて鳴ると、何よりも先に「機械が鳴らしている」と分かってしまう
VARIATIONS = 3

# 焼き直しで実際に中身が変わったファイル。最後に一覧で出す
CHANGED: list[str] = []

VARIATIONS_OF = {
    "tap": 5,
    "select": 5,
    "turnAlly": 5,
    "turnEnemy": 5,
    "impact_slash": 5,
    "impact_blunt": 5,
    "impact_pierce": 5,
    "impact_magic": 5,
    "crit": 4,
    "charge": 4,
    "heal": 4,
    "buff": 4,
    "debuff": 4,
    "shield": 4,
    "flavor_FIRE": 4,
    "flavor_WATER": 4,
    "flavor_ELECTRIC": 4,
    "flavor_GRASS": 4,
    "flavor_LIGHT": 4,
    "flavor_DARK": 4,
}


# ---------------------------------------------------------------- 当たりの芯
# どれも アタック(子音) / ボディ(質量) / テイル(余韻) の3層で組む


def impact_slash(rng: np.random.Generator) -> np.ndarray:
    """斬撃。空気を切る短い上昇と、肉/装甲に入る一瞬の破裂。"""
    n = secs(rng.uniform(0.38, 0.48))
    # アタック: 刃が触れた瞬間。ごく短く、明るい
    attack = click(n, rng, rng.uniform(8000, 12000)) * rng.uniform(0.45, 0.6)
    # ボディ(1): 切る空気。帯域ノイズのカットオフを上へ走らせる
    air = bandpass(noise(n, rng), rng.uniform(700, 1100), rng.uniform(7000, 10000))
    air = sweep_filter(air, rng.uniform(1100, 1700), rng.uniform(5500, 8000), "high")
    air *= env_exp(n, rng.uniform(28.0, 40.0), attack_ms=2.0)
    # ボディ(2): 入る肉。これが無いと「シャッ」だけで手応えが出ない
    meat = lowpass(brown(n, rng), rng.uniform(230, 360)) * env_exp(n, rng.uniform(22.0, 32.0), attack_ms=0.8)
    # テイル: 傷口の余韻。減衰を速く取ってあるので響きに幅があり、音程には聞こえない
    tail = modal(n, [rng.uniform(1700, 2400), rng.uniform(3100, 4300)], [150.0, 200.0], rng, 0.35)
    tail *= env_exp(n, 12.0, attack_ms=6.0)
    return mix(attack, air * 0.75, meat * 1.6, tail * 0.28)


def impact_blunt(rng: np.random.Generator) -> np.ndarray:
    """打撃。重い低域が主役。速度は遅く、余韻は長い。"""
    n = secs(rng.uniform(0.55, 0.72))
    # アタック: 打面が触れた音。斬撃ほど明るくしない(明るいと金属の当たりになる)
    attack = bandpass(noise(n, rng), 600, rng.uniform(3500, 5200)) * env_exp(n, 300.0, attack_ms=0.4)
    # ボディ: 質量そのもの。ブラウンノイズを低く絞って軽く潰す
    body = lowpass(brown(n, rng), rng.uniform(120, 190)) * env_exp(n, rng.uniform(14.0, 20.0), attack_ms=1.6)
    # 当たった面の硬さ。中域を上から下へ掃いて「めり込み」を作る
    face = sweep_filter(bandpass(noise(n, rng), 250, 2600), rng.uniform(2200, 3000), rng.uniform(380, 560), "low")
    face *= env_exp(n, rng.uniform(26.0, 36.0), attack_ms=1.0)
    # テイル: 胴鳴りと地鳴り
    # 胴鳴り。減衰を速く取る(遅いと音程になり、殴打がドラムの音階に聞こえる)
    hide = modal(n, [rng.uniform(78, 104), rng.uniform(139, 176)], [58.0, 84.0], rng, 0.6) * env_exp(n, 6.0, attack_ms=4.0)
    rumble = lowpass(noise(n, rng), 150) * env_exp(n, rng.uniform(6.0, 9.0)) * 0.45
    return saturate(mix(attack * 0.35, body * 1.35, face * 0.5, hide * 0.5, rumble), 1.8)


def impact_pierce(rng: np.random.Generator) -> np.ndarray:
    """刺突。細く、速く、余韻が短い。中域に芯を置く。"""
    n = secs(rng.uniform(0.26, 0.34))
    attack = click(n, rng, rng.uniform(6000, 9000)) * rng.uniform(0.4, 0.55)
    # ボディ: 貫く軸。狭い中域を速く落とす
    shaft = bandpass(noise(n, rng), rng.uniform(1500, 2100), rng.uniform(5500, 7500))
    shaft *= env_exp(n, rng.uniform(55.0, 75.0), attack_ms=0.4)
    # 入った重み。細い音でも低域が少し無いと、刺さらず「かすった」ように聞こえる
    stab = lowpass(brown(n, rng), rng.uniform(280, 420)) * env_exp(n, rng.uniform(38.0, 52.0), attack_ms=0.4)
    tail = modal(n, [rng.uniform(2600, 3600)], [260.0], rng, 0.3) * env_exp(n, 24.0, attack_ms=3.0)
    return mix(attack, shaft * 0.7, stab * 1.5, tail * 0.25)


def impact_magic(rng: np.random.Generator) -> np.ndarray:
    """術の着弾。ノイズの塊に、非整数比の共振を薄く重ねる。"""
    n = secs(rng.uniform(0.48, 0.62))
    attack = click(n, rng, rng.uniform(4000, 6500)) * rng.uniform(0.3, 0.42)
    # ボディ: 上から下へ落ちる広帯域の塊
    burst = sweep_filter(noise(n, rng), rng.uniform(4500, 6500), rng.uniform(550, 850), "low")
    burst *= env_exp(n, rng.uniform(22.0, 30.0), attack_ms=1.2)
    # 押し出される空気。術の「重さ」はここで決まる
    push = lowpass(brown(n, rng), rng.uniform(150, 240)) * env_exp(n, rng.uniform(18.0, 26.0), attack_ms=2.0)
    # テイル: 非整数比の共振。減衰を速めにして音程には聞こえないようにする
    base = rng.uniform(380, 500)
    ring = modal(n, [base, base * 1.47, base * 2.27, base * 3.51], [110.0, 140.0, 180.0, 240.0], rng, 0.5)
    ring *= env_exp(n, 8.0, attack_ms=4.0)
    return mix(attack, burst * 0.9, push * 1.5, ring * 0.4)


IMPACTS = {
    "slash": impact_slash,
    "blunt": impact_blunt,
    "pierce": impact_pierce,
    "magic": impact_magic,
}


# ------------------------------------------------------------- 属性の色づけ
# 芯の上に重ねる薄い層。単体では効果音として成立しなくてよい。
#
# **芯と同じ帯域・同じ時刻に置かない。** 以前はどれも芯の真下に潜っていて、
# 属性を変えても違いが聞き取れなかった。属性ごとに帯域と鳴る時刻をずらし、
# 再生側(player.ts)でも属性ごとの遅延を持たせている。


def flavor_fire(rng: np.random.Generator) -> np.ndarray:
    """火。芯より遅れて来る、はぜる粒と低い唸り。"""
    n = secs(rng.uniform(0.55, 0.7))
    roar = bandpass(noise(n, rng), 120, rng.uniform(900, 1300)) * env_exp(n, rng.uniform(7.5, 10.5), attack_ms=6.0)
    crackle = bandpass(noise(n, rng), rng.uniform(1900, 2600), 8000, 3)
    # 火のはぜは不規則な粒。一様に鳴らすとホワイトノイズになる
    crackle = crackle * grains(n, rng, rng.uniform(0.0016, 0.003)) * 3.2 * env_exp(n, 5.0, attack_ms=10.0)
    return mix(roar * 0.7, crackle * 0.62)


def flavor_water(rng: np.random.Generator) -> np.ndarray:
    """水。芯とほぼ同時に弾ける飛沫と、後を引く滴り。"""
    n = secs(rng.uniform(0.48, 0.62))
    splash = sweep_filter(bandpass(noise(n, rng), 350, 6500), rng.uniform(5000, 7000), rng.uniform(680, 950), "low")
    splash *= env_exp(n, rng.uniform(15.0, 22.0), attack_ms=2.0)
    # 滴りは短い共振。減衰を速くして「ポチャ」の粒に留める
    drip = modal(n, [rng.uniform(950, 1250), rng.uniform(1700, 2100)], [90.0, 130.0], rng, 0.5)
    drip *= env_exp(n, 14.0, attack_ms=8.0)
    body = lowpass(brown(n, rng), rng.uniform(260, 400)) * env_exp(n, 22.0, attack_ms=3.0)
    return mix(splash * 0.8, drip * 0.35, body * 0.45)


def flavor_electric(rng: np.random.Generator) -> np.ndarray:
    """雷。芯より先に来る鋭い放電。高域に置くので芯と喧嘩しない。"""
    n = secs(rng.uniform(0.34, 0.46))
    # 高域ノイズを細かく断続させる。連続だとただのシャーになる
    z = highpass(noise(n, rng), rng.uniform(2000, 3000))
    z = z * (0.3 + grains(n, rng, rng.uniform(0.03, 0.08), 2) * 1.1) * env_exp(n, rng.uniform(20.0, 32.0), attack_ms=0.3)
    snap = click(n, rng, rng.uniform(9000, 14000)) * 0.7
    # 放電の芯。ごく短い中低域を足して「ばちっ」の実体を作る
    core = bandpass(noise(n, rng), rng.uniform(330, 500), rng.uniform(1300, 2000)) * env_exp(n, 90.0, attack_ms=0.3)
    return mix(z * 0.85, snap, core * 0.5)


def flavor_grass(rng: np.random.Generator) -> np.ndarray:
    """草。葉ずれと木の胴。中域に置く。"""
    n = secs(rng.uniform(0.52, 0.68))
    rustle = bandpass(noise(n, rng), rng.uniform(1200, 1700), 7000) * env_exp(n, rng.uniform(10.0, 14.0), attack_ms=6.0)
    rustle = rustle * (0.35 + grains(n, rng, rng.uniform(0.014, 0.028), 2) * 1.6)
    woody = modal(n, [rng.uniform(190, 250), rng.uniform(340, 430)], [88.0, 120.0], rng, 0.55)
    woody *= env_exp(n, rng.uniform(6.0, 8.5), attack_ms=4.0)
    return mix(rustle * 0.75, woody * 0.5)


def flavor_light(rng: np.random.Generator) -> np.ndarray:
    """光。芯のあとに広がる高い響き。長さで存在を出す。"""
    n = secs(rng.uniform(0.7, 0.9))
    # 減衰を速く取る。遅いと澄んだ音程になり、属性の色ではなく「鐘の音」になる
    base = rng.uniform(1180, 1420)
    shimmer = modal(n, [base, base * 1.54, base * 2.25, base * 3.34], [130.0, 165.0, 210.0, 280.0], rng, 0.6)
    shimmer *= env_exp(n, rng.uniform(3.6, 5.0), attack_ms=10.0)
    air = highpass(noise(n, rng), rng.uniform(3000, 4200)) * (0.3 + grains(n, rng, rng.uniform(0.008, 0.018), 4) * 1.6)
    air *= env_exp(n, 6.0, attack_ms=12.0)
    beam = bandpass(noise(n, rng), rng.uniform(750, 1150), 5000) * env_exp(n, rng.uniform(6.5, 9.5), attack_ms=8.0)
    return mix(shimmer * 0.55, air * 0.45, beam * 0.4)


def flavor_dark(rng: np.random.Generator) -> np.ndarray:
    """闇。着弾のあとに広がって吸い込む影。低域に置く。

    **山を終端に置かないこと。** 逆包絡をそのまま使うと、いちばん大きいところが
    ファイルの最後になり、着弾から800ms も遅れて鳴っていた。
    芯の直後(0.3秒あたり)を山にして、そこから引いていく形にする。
    """
    n = secs(rng.uniform(0.75, 0.95))
    sub = lowpass(brown(n, rng), rng.uniform(110, 155)) * env_exp(n, rng.uniform(4.2, 6.0), attack_ms=8.0)
    breath = bandpass(noise(n, rng), rng.uniform(150, 220), rng.uniform(700, 1000)) * env_exp(n, 7.0, attack_ms=14.0)
    # 0.3秒あたりで山になる非対称の膨らみ。吸い込んでから引く動きを作る
    peak = secs(rng.uniform(0.24, 0.36))
    shape = np.concatenate([
        np.linspace(0.0, 1.0, peak) ** 2.2,
        np.exp(-np.linspace(0.0, 4.0, n - peak)),
    ])
    swell = bandpass(noise(n, rng), rng.uniform(250, 380), rng.uniform(1900, 2600)) * shape
    return mix(sub * 1.0, breath * 0.55, swell * 0.6)


FLAVORS = {
    "FIRE": flavor_fire,
    "WATER": flavor_water,
    "ELECTRIC": flavor_electric,
    "GRASS": flavor_grass,
    "LIGHT": flavor_light,
    "DARK": flavor_dark,
}


# ------------------------------------------------------------------ その他


def sfx_crit(rng: np.random.Generator) -> np.ndarray:
    """会心の追加層。芯に重ねて「刺さった」感を足す。"""
    n = secs(rng.uniform(0.42, 0.55))
    crack = saturate(lowpass(brown(n, rng), rng.uniform(280, 420)) * env_exp(n, 38.0, attack_ms=0.4), 3.0)
    shine = highpass(noise(n, rng), rng.uniform(4500, 6500)) * env_exp(n, 22.0, attack_ms=0.3)
    ring = modal(n, [rng.uniform(700, 860), rng.uniform(1200, 1450)], [70.0, 95.0], rng, 0.45)
    ring *= env_exp(n, 10.0, attack_ms=2.0)
    return mix(crack * 1.1, shine * 0.45, ring * 0.35)


def sfx_shield(rng: np.random.Generator) -> np.ndarray:
    """守り。張られる過程(ノイズ)が主で、張り終わった響き(共振)は薄く。"""
    n = secs(rng.uniform(0.62, 0.8))
    # 立ち上がり: 空気が集まってくる
    gather = sweep_filter(bandpass(noise(n, rng), 250, 4000), rng.uniform(300, 430), rng.uniform(2000, 2900), "high")
    gather *= env_exp(n, rng.uniform(4.6, 6.5), attack_ms=24.0)
    # 張られた瞬間の子音。これが無いと「いつの間にか鳴っていた」音になる
    at = secs(rng.uniform(0.08, 0.15))
    snap = np.zeros(n)
    snap[at:] = bandpass(noise(n - at, rng), 700, 6000) * env_exp(n - at, 70.0, attack_ms=0.6)
    # 膜の響き。ノイズで叩いた共振なので、正弦を並べたのとは違って幅がある
    base = rng.uniform(190, 245)
    dome = modal(n, [base, base * 1.57, base * 2.43, base * 3.78, base * 5.78], [55.0, 70.0, 90.0, 118.0, 154.0], rng, 0.65)
    dome *= env_exp(n, rng.uniform(3.4, 4.8), attack_ms=12.0)
    body = lowpass(brown(n, rng), rng.uniform(180, 280)) * env_exp(n, 8.0, attack_ms=16.0)
    return mix(gather * 0.7, snap * 0.45, dome * 0.5, body * 0.55)


def sfx_death(rng: np.random.Generator) -> np.ndarray:
    """崩れ落ちる。上から下へ落ちる帯域と、地に着く低域、そして瓦礫。"""
    n = secs(rng.uniform(0.9, 1.15))
    collapse = sweep_filter(bandpass(noise(n, rng), 90, 4000), rng.uniform(2200, 3200), rng.uniform(140, 210), "low")
    collapse *= env_exp(n, rng.uniform(5.0, 7.2), attack_ms=2.0)
    sub = lowpass(brown(n, rng), rng.uniform(85, 125)) * env_exp(n, rng.uniform(3.6, 5.0), attack_ms=6.0)
    debris = bandpass(noise(n, rng), 700, 5000) * grains(n, rng, rng.uniform(0.006, 0.013), 3) * 3.0 * env_exp(n, 3.4)
    base = rng.uniform(52, 72)
    groan = modal(n, [base, base * 1.59, base * 2.43], [28.0, 38.0, 50.0], rng, 0.5) * env_exp(n, 3.0, attack_ms=10.0)
    return saturate(mix(collapse * 0.95, sub * 1.05, debris * 0.45, groan * 0.4), 1.5)


def sfx_heal(rng: np.random.Generator) -> np.ndarray:
    """回復。上へ向かう動き。**うなりを持つ響き**で、和音にはしない。"""
    n = secs(rng.uniform(0.85, 1.05))
    # 主役はノイズの「ふくらみ」。ここを共振にすると途端に安いシンセになる
    bloom = sweep_filter(bandpass(noise(n, rng), 260, 4200), rng.uniform(600, 850), rng.uniform(2200, 3100), "high")
    bloom *= env_exp(n, rng.uniform(3.4, 4.8), attack_ms=40.0)
    # 温度。非整数比・うなり付き。全体の3割程度に留める
    base = rng.uniform(178, 214)
    warm = sines(n, [base, base * 1.5, base * 2.25, base * 3.38], [2.4, 3.0, 3.9, 5.2], rng, 0.6)
    warm *= env_exp(n, 2.6, attack_ms=34.0)
    sparkle = highpass(noise(n, rng), 4000) * grains(n, rng, rng.uniform(0.004, 0.009), 5) * 2.2 * env_exp(n, 3.4, attack_ms=40.0)
    return mix(bloom * 0.9, warm * 0.55, sparkle * 0.3)


def sfx_buff(rng: np.random.Generator) -> np.ndarray:
    """強化。持ち上がる動き。"""
    n = secs(rng.uniform(0.6, 0.76))
    lift = sweep_filter(bandpass(noise(n, rng), 300, 6000), rng.uniform(430, 590), rng.uniform(3400, 4700), "high")
    lift *= env_exp(n, rng.uniform(5.2, 7.0), attack_ms=14.0)
    base = rng.uniform(236, 292)
    core = modal(n, [base, base * 1.52, base * 2.28, base * 3.45], [70.0, 90.0, 118.0, 155.0], rng, 0.6)
    core *= env_exp(n, rng.uniform(3.8, 5.2), attack_ms=16.0)
    body = lowpass(brown(n, rng), rng.uniform(210, 320)) * env_exp(n, 7.0, attack_ms=18.0)
    return mix(lift * 0.6, core * 0.5, body * 0.6)


def sfx_debuff(rng: np.random.Generator) -> np.ndarray:
    """弱化。バフの反転として作ると、対だと分かる。"""
    n = secs(rng.uniform(0.7, 0.88))
    fall = sweep_filter(bandpass(noise(n, rng), 160, 4200), rng.uniform(2900, 4000), rng.uniform(270, 390), "low")
    fall *= env_exp(n, rng.uniform(4.8, 6.4), attack_ms=10.0)
    murk = lowpass(noise(n, rng), rng.uniform(340, 520)) * env_exp(n, 4.5, attack_ms=18.0)
    base = rng.uniform(78, 100)
    drag = modal(n, [base, base * 1.51, base * 2.35], [48.0, 64.0, 86.0], rng, 0.45) * env_exp(n, 4.0, attack_ms=20.0)
    return mix(fall * 0.8, murk * 0.55, drag * 0.35)


def sfx_charge(rng: np.random.Generator) -> np.ndarray:
    """必殺技の溜め。**塊はノイズで作る。** 唸りだけだと発振器そのものになる。"""
    n = secs(rng.uniform(0.9, 1.1))
    rise = bandpass(noise(n, rng), 180, rng.uniform(4800, 6200)) * env_exp(n, rng.uniform(3.0, 4.4))[::-1]
    rise = sweep_filter(rise, rng.uniform(220, 320), rng.uniform(2500, 3600), "high")
    # 集まってくる粒。だんだん密になる門を掛ける
    density = np.linspace(0.0015, rng.uniform(0.035, 0.065), n)
    grain = bandpass(noise(n, rng), 500, 5000) * (rng.random(n) < density).astype(float)
    for _ in range(3):
        grain = np.maximum(grain, np.roll(grain, 1) * 0.7)
    # 低い唸り。うなり付きで、全体の2割程度
    base = rng.uniform(50, 66)
    hum = sines(n, [base, base * 1.53, base * 2.43], [0.9, 1.2, 1.7], rng, 0.55) * env_exp(n, 1.1)[::-1]
    sub = lowpass(brown(n, rng), rng.uniform(120, 165)) * env_exp(n, 2.2)[::-1]
    return mix(rise * 0.8, grain * 0.5, hum * 0.35, sub * 0.6)


def sfx_turn_ally(rng: np.random.Generator) -> np.ndarray:
    """味方の手番。**戦闘中いちばん多く鳴る音。**

    ここを共振で作ると、繰り返し聞いた時に真っ先に安っぽく感じる。
    ノイズの子音を主役にして、響きは「合図の色」を付ける程度に留める。
    減衰を速く取ってあるので、共振の帯域が広く、音程には聞こえない。
    """
    n = secs(rng.uniform(0.3, 0.38))
    onset = sweep_filter(bandpass(noise(n, rng), 800, 8000), rng.uniform(5000, 7000), rng.uniform(1400, 2200), "low")
    onset *= env_exp(n, rng.uniform(34.0, 46.0), attack_ms=0.6)
    base = rng.uniform(600, 720)
    ping = modal(n, [base, base * 1.53, base * 2.39], [110.0, 145.0, 190.0], rng, 0.55)
    ping *= env_exp(n, rng.uniform(16.0, 22.0), attack_ms=3.0)
    body = lowpass(pink(n, rng), rng.uniform(500, 750)) * env_exp(n, 44.0, attack_ms=1.0)
    return mix(onset * 0.7, ping * 0.42, body * 0.45)


def sfx_turn_enemy(rng: np.random.Generator) -> np.ndarray:
    """敵の手番。味方側と対になるよう低く濁らせる。こちらも共振に頼らない。"""
    n = secs(rng.uniform(0.34, 0.44))
    onset = sweep_filter(bandpass(noise(n, rng), 180, 4000), rng.uniform(2600, 3400), rng.uniform(450, 700), "low")
    onset *= env_exp(n, rng.uniform(22.0, 30.0), attack_ms=1.2)
    base = rng.uniform(150, 190)
    low = modal(n, [base, base * 1.58, base * 2.43], [60.0, 82.0, 108.0], rng, 0.55)
    low *= env_exp(n, rng.uniform(10.0, 15.0), attack_ms=4.0)
    grit = bandpass(noise(n, rng), 280, 1700) * env_exp(n, 13.0, attack_ms=2.0)
    body = lowpass(brown(n, rng), 190) * env_exp(n, 16.0, attack_ms=2.0)
    return mix(onset * 0.7, low * 0.45, grit * 0.35, body * 0.6)


def sfx_tap(rng: np.random.Generator) -> np.ndarray:
    """押した合図。**UIで最も多く鳴る。** 短く、低く、共振なし。"""
    n = secs(rng.uniform(0.11, 0.16))
    tick = bandpass(noise(n, rng), rng.uniform(1000, 1500), rng.uniform(5000, 7000))
    tick *= env_exp(n, rng.uniform(80.0, 110.0), attack_ms=0.3)
    body = lowpass(pink(n, rng), rng.uniform(600, 950)) * env_exp(n, rng.uniform(60.0, 85.0), attack_ms=0.5)
    thump = lowpass(brown(n, rng), rng.uniform(180, 260)) * env_exp(n, rng.uniform(45.0, 65.0), attack_ms=0.6)
    return mix(tick * 0.6, body * 0.6, thump * 0.7)


def sfx_select(rng: np.random.Generator) -> np.ndarray:
    """選ぶ合図。tap より少しだけ明るく、少しだけ長い。"""
    n = secs(rng.uniform(0.2, 0.28))
    tick = bandpass(noise(n, rng), rng.uniform(1800, 2400), rng.uniform(6500, 9000))
    tick *= env_exp(n, rng.uniform(60.0, 85.0), attack_ms=0.3)
    # 響きは短い共振で香り付け。正弦は使わない(繰り返すと真っ先に安く聞こえる)
    ping = modal(n, [rng.uniform(820, 960), rng.uniform(1330, 1560)], [150.0, 200.0], rng, 0.5)
    ping *= env_exp(n, rng.uniform(24.0, 34.0), attack_ms=1.5)
    body = lowpass(pink(n, rng), rng.uniform(900, 1400)) * env_exp(n, rng.uniform(45.0, 62.0), attack_ms=0.5)
    return mix(tick * 0.62, ping * 0.32, body * 0.6)


def sfx_victory(rng: np.random.Generator) -> np.ndarray:
    """勝利。**旋律にはしない。** 広がる響きと空気だけで「終わった」を伝える。"""
    n = secs(1.9)
    # 底を支える一撃。これが無いと、上の響きだけが浮いて薄っぺらくなる
    thump = lowpass(brown(n, rng), 130) * env_exp(n, 3.6, attack_ms=3.0)
    # 開ける響き。非整数比・うなり付き。全体の半分弱に留める
    swell = sines(n, [131.0, 197.0, 296.0, 449.0, 671.0], [1.1, 1.4, 1.8, 2.4, 3.2], rng, 0.65)
    swell *= env_exp(n, 1.1, attack_ms=45.0)
    # 空気。まばらな粒にして、一様なシャーにしない
    air = highpass(noise(n, rng), 2600) * (0.25 + grains(n, rng, 0.004, 6) * 2.0)
    air *= env_exp(n, 1.9, attack_ms=70.0)
    wash = sweep_filter(bandpass(noise(n, rng), 200, 3500), 500, 2200, "high") * env_exp(n, 2.0, attack_ms=60.0)
    return mix(thump * 0.9, swell * 0.62, air * 0.22, wash * 0.5)


def sfx_defeat(rng: np.random.Generator) -> np.ndarray:
    """敗北。落ちていく動き。低く、暗く、長い。"""
    n = secs(2.0)
    sink = sweep_filter(bandpass(noise(n, rng), 90, 3000), 2200, 130, "low") * env_exp(n, 1.8, attack_ms=30.0)
    sub = lowpass(brown(n, rng), 110) * env_exp(n, 1.5, attack_ms=40.0)
    low = sines(n, [49.0, 74.0, 116.0], [0.9, 1.2, 1.7], rng, 0.55) * env_exp(n, 1.1, attack_ms=60.0)
    dust = bandpass(noise(n, rng), 500, 3000) * grains(n, rng, 0.004, 4) * 2.4 * env_exp(n, 1.6)
    return mix(sink * 0.85, sub * 0.9, low * 0.5, dust * 0.3)


# ----- ここから下は今回足した音 -----


def sfx_summon(rng: np.random.Generator) -> np.ndarray:
    """召喚。集まる → 開く → 着地、の3段。長さで儀式らしさを出す。"""
    n = secs(1.7)
    open_at = secs(0.85)
    # 集まる: 逆包絡で吸い上げる
    gather = sweep_filter(bandpass(noise(open_at, rng), 200, 6000), 300, 3400, "high")
    gather *= env_exp(open_at, 2.6)[::-1]
    # 開く: 一瞬の破裂と、広がる空気
    m = n - open_at
    burst = sweep_filter(noise(m, rng), 7000, 900, "low") * env_exp(m, 14.0, attack_ms=1.0)
    boom = lowpass(brown(m, rng), 140) * env_exp(m, 5.0, attack_ms=3.0)
    halo = modal(m, [327.0, 503.0, 781.0, 1193.0], [9.0, 12.0, 16.0, 21.0], rng, 0.6) * env_exp(m, 2.6, attack_ms=20.0)
    tail = highpass(noise(m, rng), 3000) * grains(m, rng, 0.005, 6) * 2.0 * env_exp(m, 2.4, attack_ms=30.0)
    after = mix(burst * 0.9, boom * 1.0, halo * 0.45, tail * 0.3)
    out = np.zeros(n)
    out[:open_at] += gather * 0.55
    out[open_at:] += after
    return out


def sfx_summon_rare(rng: np.random.Generator) -> np.ndarray:
    """高レアの追加層。召喚に重ねる。単体では成立しなくてよい。"""
    n = secs(1.9)
    # 遅れて開く2枚目。重ねると「もう一段来た」と分かる
    shine = modal(n, [523.0, 809.0, 1249.0, 1931.0, 2986.0], [5.0, 6.5, 8.5, 11.0, 15.0], rng, 0.7)
    shine *= env_exp(n, 1.5, attack_ms=60.0)
    sparkle = highpass(noise(n, rng), 5000) * grains(n, rng, 0.01, 8) * 2.4 * env_exp(n, 1.8, attack_ms=40.0)
    lift = sweep_filter(bandpass(noise(n, rng), 400, 9000), 700, 6000, "high") * env_exp(n, 2.0, attack_ms=80.0)
    return mix(shine * 0.55, sparkle * 0.4, lift * 0.4)


def sfx_level_up(rng: np.random.Generator) -> np.ndarray:
    """レベルアップ。短く、上へ。勝利より軽く、バフより明確に。"""
    n = secs(0.85)
    lift = sweep_filter(bandpass(noise(n, rng), 400, 7000), 600, 5000, "high") * env_exp(n, 5.0, attack_ms=10.0)
    ring = modal(n, [392.0, 601.0, 923.0, 1417.0], [13.0, 17.0, 23.0, 30.0], rng, 0.65) * env_exp(n, 3.4, attack_ms=12.0)
    body = lowpass(brown(n, rng), 230) * env_exp(n, 6.5, attack_ms=6.0)
    spark = highpass(noise(n, rng), 4500) * grains(n, rng, 0.008, 5) * 2.0 * env_exp(n, 4.0, attack_ms=14.0)
    return mix(lift * 0.6, ring * 0.5, body * 0.7, spark * 0.3)


def sfx_enhance(rng: np.random.Generator) -> np.ndarray:
    """強化成功。金床を打つ音。硬く、短く、余韻に金属の響き。"""
    n = secs(0.9)
    attack = click(n, rng, 5500) * 0.45
    strike = lowpass(brown(n, rng), 200) * env_exp(n, 24.0, attack_ms=0.8)
    # 金床は鳴るが、減衰を遅く取ると鍛冶ではなく鐘の音階になる。
    # 減衰100前後が「幅のある鳴り」と「音程」の境目(dsp.tonality の目安を参照)
    anvil = modal(n, [610.0, 943.0, 1471.0, 2288.0, 3547.0], [95.0, 120.0, 155.0, 200.0, 260.0], rng, 0.7)
    anvil *= env_exp(n, 3.0, attack_ms=2.0)
    # 焼けた金属が鳴らす中域。ここが無いと金床が薄い板に聞こえる
    plate = bandpass(noise(n, rng), 700, 3500) * env_exp(n, 16.0, attack_ms=1.0)
    steam = highpass(noise(n, rng), 3000) * env_exp(n, 9.0, attack_ms=4.0)
    return saturate(mix(attack, strike * 1.35, anvil * 0.5, plate * 0.4, steam * 0.18), 1.6)


def sfx_stage_clear(rng: np.random.Generator) -> np.ndarray:
    """ステージ踏破。勝利より短く、報酬を受け取る場面に置く。"""
    n = secs(1.3)
    thump = lowpass(brown(n, rng), 150) * env_exp(n, 5.0, attack_ms=3.0)
    open_up = sweep_filter(bandpass(noise(n, rng), 300, 6000), 600, 3600, "high") * env_exp(n, 3.4, attack_ms=20.0)
    ring = modal(n, [294.0, 449.0, 691.0, 1063.0], [8.0, 11.0, 14.0, 19.0], rng, 0.65) * env_exp(n, 2.4, attack_ms=16.0)
    air = highpass(noise(n, rng), 3500) * grains(n, rng, 0.006, 6) * 2.0 * env_exp(n, 2.8, attack_ms=30.0)
    return mix(thump * 0.85, open_up * 0.6, ring * 0.5, air * 0.28)


def sfx_denied(rng: np.random.Generator) -> np.ndarray:
    """できない、の合図。**耳障りなブザーにしない。**

    短く鈍い音を2つ続けるだけで「はじかれた」は伝わる。
    高い音を鳴らすと、それだけで安っぽく聞こえるうえに不快になる。
    """
    n = secs(0.28)
    def knock(offset: int) -> np.ndarray:
        m = n - offset
        k = lowpass(brown(m, rng), 300) * env_exp(m, 55.0, attack_ms=0.6)
        t = bandpass(noise(m, rng), 400, 2600) * env_exp(m, 90.0, attack_ms=0.4)
        out = np.zeros(n)
        out[offset:] = k * 0.9 + t * 0.4
        return out
    return mix(knock(0), knock(secs(0.1)) * 0.8)


OTHERS = {
    "crit": sfx_crit,
    "shield": sfx_shield,
    "death": sfx_death,
    "heal": sfx_heal,
    "buff": sfx_buff,
    "debuff": sfx_debuff,
    "charge": sfx_charge,
    "turnAlly": sfx_turn_ally,
    "turnEnemy": sfx_turn_enemy,
    "tap": sfx_tap,
    "select": sfx_select,
    "victory": sfx_victory,
    "defeat": sfx_defeat,
    "summon": sfx_summon,
    "summonRare": sfx_summon_rare,
    "levelUp": sfx_level_up,
    "enhance": sfx_enhance,
    "stageClear": sfx_stage_clear,
    "denied": sfx_denied,
}


# ------------------------------------------------------------------ 仕上げ

# 場所によって残響を変える。全部同じリバーブを掛けると、
# UIの音まで闘技場で鳴っているように聞こえる。
#
# 圧縮の attack は **遅くする**。1ms で掛けると当たった瞬間の頭を潰してしまい、
# 音量は揃うが「当たった」感じが消える。頭を通してから締める。
SPACES = {
    "arena": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=32),
        Compressor(threshold_db=-14, ratio=2.6, attack_ms=9.0, release_ms=130),
        Reverb(room_size=0.4, damping=0.6, wet_level=0.17, dry_level=0.92, width=1.0),
    ]),
    "wide": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=30),
        LowShelfFilter(cutoff_frequency_hz=190, gain_db=2.0),
        HighShelfFilter(cutoff_frequency_hz=7000, gain_db=-2.5),
        Reverb(room_size=0.68, damping=0.45, wet_level=0.28, dry_level=0.84, width=1.0),
    ]),
    "ui": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=70),
        Compressor(threshold_db=-11, ratio=2.2, attack_ms=4.0, release_ms=60),
        Reverb(room_size=0.11, damping=0.82, wet_level=0.05, dry_level=0.98, width=0.6),
    ]),
}

SPACE_OF = {
    "tap": "ui",
    "select": "ui",
    "denied": "ui",
    "turnAlly": "ui",
    "turnEnemy": "ui",
    "victory": "wide",
    "defeat": "wide",
    "death": "wide",
    "charge": "wide",
    "summon": "wide",
    "summonRare": "wide",
    "stageClear": "wide",
    "levelUp": "wide",
}


def finish(x: np.ndarray, space: str, peak: float = 0.9) -> np.ndarray:
    x = normalize(x, 0.85)
    wet = SPACES[space](x.astype(np.float32), SR)
    wet = np.asarray(wet, dtype=np.float64).reshape(-1)
    return fade_out(normalize(wet, peak))


def seed_of(name: str, index: int) -> int:
    """名前から種を作る。

    以前は `hash()` を使っていたが、Python の文字列ハッシュはプロセスごとに
    塩が変わるため、**焼き直すたびに違う音が出ていた**。
    音を直した効果を測るには、直していない音が変わらないことが要る。
    """
    return zlib.crc32(f"{name}/{index}".encode()) & 0xFFFFFFFF


def write(name: str, index: int, audio: np.ndarray) -> tuple[str, dict]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{name}_{index}.ogg"
    # 中身が同じなら触らない(容器の数バイトだけが変わって差分が埋もれるため)
    if write_ogg(OUT_DIR / filename, audio):
        CHANGED.append(filename)
    return filename, analyze(audio)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # BGM は別の道具(render_bgm.py)が焼くので、消してよいのは効果音だけ
    manifest_path = OUT_DIR / "manifest.json"
    previous: dict[str, list[str]] = {}
    if manifest_path.exists():
        previous = json.loads(manifest_path.read_text())

    manifest: dict[str, list[str]] = {}
    report: list[tuple[str, dict, int]] = []

    def bake(name: str, fn, space: str, peak: float = 0.9) -> None:
        files = []
        for i in range(VARIATIONS_OF.get(name, VARIATIONS)):
            rng = np.random.default_rng(seed_of(name, i))
            audio = finish(fn(rng), space, peak)
            filename, stats = write(name, i, audio)
            files.append(filename)
            if i == 0:
                report.append((name, stats, (OUT_DIR / filename).stat().st_size))
        manifest[name] = files

    for style, fn in IMPACTS.items():
        bake(f"impact_{style}", fn, "arena")
    for element, fn in FLAVORS.items():
        # 属性の色は芯に重ねる薄い層。芯を食わないよう控えめに焼く
        bake(f"flavor_{element}", fn, "arena", peak=0.7)
    for name, fn in OTHERS.items():
        bake(name, fn, SPACE_OF.get(name, "arena"))

    # BGM の項目は別の道具が持っているので、そのまま引き継ぐ
    for name, files in previous.items():
        if name.startswith("bgm_"):
            manifest.setdefault(name, files)

    written = {f for files in manifest.values() for f in files}
    for stale in OUT_DIR.glob("*.ogg"):
        if stale.name not in written:
            stale.unlink()

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.ogg"))
    print(f"{len(list(OUT_DIR.glob('*.ogg')))}個 / 合計 {total/1024:.0f} KB")
    print(f"中身が変わったもの: {len(CHANGED)}個" + (f" ({', '.join(CHANGED[:8])}...)" if len(CHANGED) > 8 else f" ({', '.join(CHANGED)})" if CHANGED else ""))
    print()
    print(f"{'名前':<18}{'重心Hz':>8}{'純音らしさ':>10}{'低域比':>8}{'立上ms':>8}{'長さms':>8}{'KB':>7}")
    for name, s, size in report:
        flag = "  ←純音寄り" if s["純音らしさ"] > 0.5 else ""
        print(
            f"{name:<18}{s['重心']:>8.0f}{s['純音らしさ']:>10.3f}{s['低域比']:>8.2f}"
            f"{s['立ち上がり(ms)']:>8.1f}{s['長さ(ms)']:>8.0f}{size/1024:>7.1f}{flag}"
        )


if __name__ == "__main__":
    main()
