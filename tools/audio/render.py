"""効果音を焼く。

ブラウザ上でその都度合成するのをやめ、ここで作った音を ogg で同梱する。
理由は、リアルタイム合成だとリバーブなどの重い処理が使えず、
どう作っても「安っぽい」側から抜けられなかったため。

**組み合わせで水増しする方針**にしてある。当たり方(4種)と属性(7種)を
全部焼くと28通りになるが、当たりの芯と属性の色を別ファイルにして
再生時に重ねれば、11ファイルで28通りが出せる。ファイル数が減るぶん、
1つ1つに時間をかけられる。

  tools/audio/.venv/bin/python tools/audio/render.py
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Compressor, HighpassFilter, LowShelfFilter, Pedalboard, Reverb

from dsp import (
    SR,
    analyze,
    bandpass,
    click,
    env_exp,
    fade_out,
    highpass,
    lowpass,
    mix,
    noise,
    normalize,
    pink,
    resonance,
    saturate,
    secs,
    sweep_filter,
)

OUT_DIR = Path(__file__).resolve().parents[2] / "public" / "audio"

# 1つの音につき何通り焼くか。同じ波形が連続して鳴るとすぐに機械だと分かるので、
# 再生側でこの中から選ばせる
VARIATIONS = 3


# ---------------------------------------------------------------- 当たりの芯


def impact_slash(rng: np.random.Generator) -> np.ndarray:
    """斬撃。空気を切る短い上昇と、肉/装甲に入る一瞬の破裂。"""
    n = secs(0.42)
    # 切る音: 帯域ノイズのカットオフを上へ走らせる
    air = bandpass(noise(n, rng), 900, 9000) * env_exp(n, 34.0, attack_ms=2.0)
    air = sweep_filter(air, 1400, 7000, "high")
    # 入る音: 一瞬の低域。これが無いと「シャッ」だけで手応えが出ない
    body = lowpass(pink(n, rng), 700) * env_exp(n, 46.0, attack_ms=0.6)
    edge = click(n, rng, 9000) * 0.5
    return mix(air * 0.85, body * 1.0, edge)


def impact_blunt(rng: np.random.Generator) -> np.ndarray:
    """打撃。重い低域が主役。速度は遅く、余韻は長い。"""
    n = secs(0.62)
    thud = lowpass(pink(n, rng), 260) * env_exp(n, 17.0, attack_ms=1.4)
    # 低域だけだと「ボフ」で終わるので、中域を軽く掃引して当たった面の硬さを出す
    face = sweep_filter(bandpass(noise(n, rng), 300, 3000), 2600, 500, "low")
    face *= env_exp(n, 30.0, attack_ms=1.0)
    tail = lowpass(noise(n, rng), 160) * env_exp(n, 7.0) * 0.4
    return saturate(mix(thud * 1.2, face * 0.55, tail), 1.9)


def impact_pierce(rng: np.random.Generator) -> np.ndarray:
    """刺突。細く、速く、余韻が短い。中域に芯を置く。"""
    n = secs(0.3)
    shaft = bandpass(noise(n, rng), 1800, 6500) * env_exp(n, 62.0, attack_ms=0.4)
    stab = lowpass(pink(n, rng), 900) * env_exp(n, 70.0, attack_ms=0.3)
    return mix(shaft * 0.9, stab * 0.8, click(n, rng, 7000) * 0.45)


def impact_magic(rng: np.random.Generator) -> np.ndarray:
    """術の着弾。ノイズの塊に、非整数比の共振を薄く重ねる。"""
    n = secs(0.55)
    burst = sweep_filter(noise(n, rng), 5200, 700, "low") * env_exp(n, 26.0, attack_ms=1.2)
    ring = resonance(n, [430.0, 631.0, 977.0, 1523.0], [11.0, 14.0, 18.0, 24.0], rng, 0.5)
    ring *= env_exp(n, 9.0, attack_ms=3.0)
    return mix(burst * 1.0, ring * 0.42, click(n, rng, 5000) * 0.35)


IMPACTS = {
    "slash": impact_slash,
    "blunt": impact_blunt,
    "pierce": impact_pierce,
    "magic": impact_magic,
}


# ------------------------------------------------------------- 属性の色づけ
# 芯の上に重ねる薄い層。単体では効果音として成立しなくてよい


def flavor_fire(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.5)
    roar = lowpass(noise(n, rng), 1100) * env_exp(n, 12.0, attack_ms=4.0)
    crackle = bandpass(noise(n, rng), 2500, 8000, 3)
    # 火のはぜは不規則な粒。一様に鳴らすとホワイトノイズになる
    gate = (rng.random(n) < 0.0016).astype(float)
    for _ in range(3):
        gate = np.maximum(gate, np.roll(gate, 1) * 0.8)
    crackle = crackle * gate * 3.0 * env_exp(n, 6.0)
    return mix(roar * 0.6, crackle * 0.5)


def flavor_water(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.5)
    splash = sweep_filter(bandpass(noise(n, rng), 400, 6000), 6000, 900, "low")
    splash *= env_exp(n, 20.0, attack_ms=2.0)
    drip = resonance(n, [1180.0, 1790.0], [30.0, 42.0], rng, 0.4) * env_exp(n, 22.0, attack_ms=6.0)
    return mix(splash * 0.75, drip * 0.3)


def flavor_electric(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.42)
    # 高域ノイズを細かく断続させる。連続だとただのシャーになる
    z = highpass(noise(n, rng), 2600)
    gate = (rng.random(n) < 0.05).astype(float)
    for _ in range(2):
        gate = np.maximum(gate, np.roll(gate, 1) * 0.7)
    z = z * (0.35 + gate) * env_exp(n, 30.0, attack_ms=0.3)
    snap = click(n, rng, 11000) * 0.6
    return mix(z * 0.85, snap)


def flavor_grass(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.55)
    rustle = bandpass(noise(n, rng), 1500, 7000) * env_exp(n, 15.0, attack_ms=6.0)
    # 葉ずれは細かい粒の集合
    grain = (rng.random(n) < 0.02).astype(float)
    rustle = rustle * (0.4 + grain * 1.6)
    woody = lowpass(pink(n, rng), 500) * env_exp(n, 24.0, attack_ms=2.0)
    return mix(rustle * 0.7, woody * 0.5)


def flavor_light(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.7)
    shimmer = resonance(n, [1320.0, 1987.0, 2903.0, 4310.0], [6.0, 8.0, 11.0, 15.0], rng, 0.55)
    shimmer *= env_exp(n, 5.0, attack_ms=8.0)
    air = highpass(noise(n, rng), 4000) * env_exp(n, 11.0, attack_ms=10.0) * 0.35
    return mix(shimmer * 0.7, air)


def flavor_dark(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.75)
    sub = lowpass(noise(n, rng), 140) * env_exp(n, 6.0, attack_ms=8.0)
    breath = bandpass(noise(n, rng), 200, 900) * env_exp(n, 8.0, attack_ms=14.0)
    # 逆再生の立ち上がりで「吸い込む」感じを作る
    swell = bandpass(noise(n, rng), 300, 2000) * env_exp(n, 9.0)[::-1]
    return mix(sub * 0.9, breath * 0.5, swell * 0.45)


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
    n = secs(0.5)
    crack = saturate(lowpass(pink(n, rng), 400) * env_exp(n, 40.0, attack_ms=0.4), 3.0)
    shine = highpass(noise(n, rng), 5000) * env_exp(n, 24.0, attack_ms=0.3)
    ring = resonance(n, [780.0, 1310.0, 2190.0], [16.0, 20.0, 26.0], rng, 0.45) * env_exp(n, 12.0)
    return mix(crack * 1.0, shine * 0.5, ring * 0.35)


def sfx_whiff(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.34)
    air = bandpass(noise(n, rng), 500, 4500) * env_exp(n, 22.0, attack_ms=8.0)
    return sweep_filter(air, 900, 3800, "high")


def sfx_shield(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.66)
    dome = resonance(n, [214.0, 337.0, 521.0, 809.0], [5.0, 7.0, 9.0, 13.0], rng, 0.6)
    dome *= env_exp(n, 4.5, attack_ms=14.0)
    rise = sweep_filter(bandpass(noise(n, rng), 300, 3000), 400, 2600, "high") * env_exp(n, 6.0, attack_ms=20.0)
    return mix(dome * 0.75, rise * 0.4)


def sfx_death(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.95)
    collapse = sweep_filter(lowpass(pink(n, rng), 2500), 2400, 180, "low") * env_exp(n, 7.0, attack_ms=2.0)
    sub = lowpass(noise(n, rng), 110) * env_exp(n, 5.0, attack_ms=6.0)
    debris = bandpass(noise(n, rng), 800, 5000)
    grain = (rng.random(n) < 0.008).astype(float)
    debris = debris * grain * 3.0 * env_exp(n, 4.0)
    return saturate(mix(collapse * 1.0, sub * 0.8, debris * 0.5), 1.5)


def sfx_heal(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.85)
    # 回復は上へ向かう動き。共振の比率は非整数のままで、和音にはしない
    warm = resonance(n, [392.0, 588.0, 881.0, 1327.0], [3.4, 4.2, 5.6, 7.4], rng, 0.6)
    warm *= env_exp(n, 3.0, attack_ms=26.0)
    air = sweep_filter(highpass(noise(n, rng), 1200), 1500, 5200, "high") * env_exp(n, 5.0, attack_ms=30.0)
    return mix(warm * 0.8, air * 0.3)


def sfx_buff(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.62)
    lift = sweep_filter(bandpass(noise(n, rng), 400, 6000), 600, 4200, "high") * env_exp(n, 7.0, attack_ms=12.0)
    core = resonance(n, [523.0, 792.0, 1189.0], [5.0, 6.5, 9.0], rng, 0.5) * env_exp(n, 4.0, attack_ms=16.0)
    return mix(lift * 0.6, core * 0.6)


def sfx_debuff(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.7)
    # 下がる動き。バフの反転として作ると、対だと分かる
    fall = sweep_filter(bandpass(noise(n, rng), 200, 4000), 3200, 380, "low") * env_exp(n, 6.5, attack_ms=10.0)
    murk = lowpass(noise(n, rng), 500) * env_exp(n, 5.0, attack_ms=16.0)
    return mix(fall * 0.75, murk * 0.5)


def sfx_charge(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.9)
    # 溜め。逆包絡で持ち上げる
    rise = bandpass(noise(n, rng), 200, 5000) * env_exp(n, 4.0)[::-1]
    rise = sweep_filter(rise, 300, 3000, "high")
    hum = resonance(n, [128.0, 197.0, 311.0], [1.6, 2.0, 2.6], rng, 0.5) * env_exp(n, 1.4)[::-1]
    # 溜めは唸りだけだと発振器そのものに聞こえる。粒立ちを混ぜて質感を持たせる
    grain = bandpass(noise(n, rng), 600, 4000)
    gate = (rng.random(n) < 0.01).astype(float)
    grain = grain * (0.3 + gate * 2.0) * env_exp(n, 2.4)[::-1]
    return mix(rise * 0.7, hum * 0.4, grain * 0.4)


def sfx_turn_ally(rng: np.random.Generator) -> np.ndarray:
    """味方の手番。戦闘中いちばん多く鳴るので、純音の比率を下げてある
    (共振だけで作ると、繰り返し聞いた時に真っ先に安っぽく感じる音になる)。"""
    n = secs(0.4)
    ping = resonance(n, [660.0, 1010.0, 1580.0], [9.0, 12.0, 17.0], rng, 0.55) * env_exp(n, 7.0, attack_ms=4.0)
    # 共振の頭にノイズの子音を付けると、音程ではなく「合図」として聞こえる
    onset = sweep_filter(bandpass(noise(n, rng), 900, 8000), 6000, 1800, "low")
    onset *= env_exp(n, 40.0, attack_ms=0.6)
    air = highpass(noise(n, rng), 3000) * env_exp(n, 26.0, attack_ms=1.0) * 0.3
    return mix(ping * 0.5, onset * 0.7, air)


def sfx_turn_enemy(rng: np.random.Generator) -> np.ndarray:
    """敵の手番。味方側と対になるよう低く濁らせる。こちらも純音比率を下げる。"""
    n = secs(0.45)
    low = resonance(n, [174.0, 268.0, 409.0], [7.0, 9.0, 12.0], rng, 0.55) * env_exp(n, 6.0, attack_ms=5.0)
    onset = sweep_filter(bandpass(noise(n, rng), 200, 4000), 3000, 600, "low")
    onset *= env_exp(n, 26.0, attack_ms=1.2)
    grit = bandpass(noise(n, rng), 300, 1800) * env_exp(n, 14.0, attack_ms=2.0) * 0.35
    return mix(low * 0.5, onset * 0.75, grit)


def sfx_tap(rng: np.random.Generator) -> np.ndarray:
    n = secs(0.14)
    tick = bandpass(noise(n, rng), 1200, 6000) * env_exp(n, 90.0, attack_ms=0.3)
    body = lowpass(pink(n, rng), 900) * env_exp(n, 70.0, attack_ms=0.5)
    return mix(tick * 0.7, body * 0.6)


def sfx_select(rng: np.random.Generator) -> np.ndarray:
    """選択音。UIで最も多く鳴るので、共振は香り付け程度に留める。"""
    n = secs(0.28)
    ping = resonance(n, [880.0, 1330.0], [18.0, 24.0], rng, 0.5) * env_exp(n, 14.0, attack_ms=2.0)
    tick = bandpass(noise(n, rng), 2000, 7000) * env_exp(n, 70.0, attack_ms=0.3)
    body = lowpass(pink(n, rng), 1400) * env_exp(n, 55.0, attack_ms=0.5)
    return mix(ping * 0.35, tick * 0.7, body * 0.5)


def sfx_victory(rng: np.random.Generator) -> np.ndarray:
    n = secs(1.6)
    # 旋律にはしない。広がる響きと空気だけで「終わった」を伝える
    swell = resonance(n, [261.0, 392.0, 588.0, 883.0, 1324.0], [1.4, 1.7, 2.1, 2.8, 3.6], rng, 0.6)
    swell *= env_exp(n, 1.3, attack_ms=40.0)
    air = sweep_filter(highpass(noise(n, rng), 1500), 1800, 6000, "high") * env_exp(n, 2.2, attack_ms=60.0)
    return mix(swell * 0.8, air * 0.28)


def sfx_defeat(rng: np.random.Generator) -> np.ndarray:
    n = secs(1.7)
    sink = sweep_filter(bandpass(noise(n, rng), 120, 3000), 2400, 150, "low") * env_exp(n, 2.0, attack_ms=30.0)
    low = resonance(n, [98.0, 147.0, 233.0], [1.2, 1.6, 2.2], rng, 0.55) * env_exp(n, 1.4, attack_ms=50.0)
    return mix(sink * 0.7, low * 0.7)


OTHERS = {
    "crit": sfx_crit,
    "whiff": sfx_whiff,
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
}


# ------------------------------------------------------------------ 仕上げ

# 場所によって残響を変える。全部同じリバーブを掛けると、
# UIの音まで闘技場で鳴っているように聞こえる
SPACES = {
    "arena": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=38),
        Compressor(threshold_db=-16, ratio=3.0, attack_ms=1.0, release_ms=110),
        Reverb(room_size=0.42, damping=0.55, wet_level=0.2, dry_level=0.9, width=1.0),
    ]),
    "wide": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=42),
        LowShelfFilter(cutoff_frequency_hz=180, gain_db=1.5),
        Reverb(room_size=0.66, damping=0.42, wet_level=0.3, dry_level=0.82, width=1.0),
    ]),
    "ui": Pedalboard([
        HighpassFilter(cutoff_frequency_hz=120),
        Compressor(threshold_db=-12, ratio=2.4, attack_ms=0.5, release_ms=60),
        Reverb(room_size=0.12, damping=0.8, wet_level=0.06, dry_level=0.98, width=0.6),
    ]),
}

SPACE_OF = {
    "tap": "ui",
    "select": "ui",
    "turnAlly": "ui",
    "turnEnemy": "ui",
    "victory": "wide",
    "defeat": "wide",
    "death": "wide",
    "charge": "wide",
}


def finish(x: np.ndarray, space: str, peak: float = 0.9) -> np.ndarray:
    x = normalize(x, 0.85)
    wet = SPACES[space](x.astype(np.float32), SR)
    wet = np.asarray(wet, dtype=np.float64).reshape(-1)
    return fade_out(normalize(wet, peak))


def write(name: str, index: int, audio: np.ndarray) -> tuple[str, dict]:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{name}_{index}.ogg"
    sf.write(OUT_DIR / filename, audio, SR, format="OGG", subtype="VORBIS")
    return filename, analyze(audio)


def main() -> None:
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)

    manifest: dict[str, list[str]] = {}
    report: list[tuple[str, dict, int]] = []

    def bake(name: str, fn, space: str, peak: float = 0.9) -> None:
        files = []
        for i in range(VARIATIONS):
            rng = np.random.default_rng(abs(hash(name)) % 100000 + i)
            audio = finish(fn(rng), space, peak)
            filename, stats = write(name, i, audio)
            files.append(filename)
            if i == 0:
                size = (OUT_DIR / filename).stat().st_size
                report.append((name, stats, size))
        manifest[name] = files

    for style, fn in IMPACTS.items():
        bake(f"impact_{style}", fn, "arena")
    for element, fn in FLAVORS.items():
        # 属性の色は芯に重ねる薄い層なので、単体では控えめに焼く
        bake(f"flavor_{element}", fn, "arena", peak=0.6)
    for name, fn in OTHERS.items():
        bake(name, fn, SPACE_OF.get(name, "arena"))

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))

    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.ogg"))
    print(f"{len(list(OUT_DIR.glob('*.ogg')))}個 / 合計 {total/1024:.0f} KB\n")
    print(f"{'名前':<18}{'重心Hz':>8}{'ピーク付近':>10}{'上位1%':>8}{'立上ms':>8}{'長さms':>8}{'KB':>7}")
    for name, s, size in report:
        print(
            f"{name:<18}{s['重心']:>8.0f}{s['ピーク付近のビン数']:>10}"
            f"{s['上位1%のエネルギー比']:>8.2f}{s['立ち上がり(ms)']:>8.1f}"
            f"{s['長さ(ms)']:>8.0f}{size/1024:>7.1f}"
        )


if __name__ == "__main__":
    main()
