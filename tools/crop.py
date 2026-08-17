"""スクリーンショットの一部を切り出して拡大する。

3Dの造形は、ステージ全体のスクリーンショットのままだと1体が小さすぎて
「効いているのか」を判断できない。過去に小さい画像で見て誤った判断をしている
(docs/battle-stage-notes.md 参照)ので、必ず拡大して確かめること。

  tools/audio/.venv/bin/python tools/crop.py <入力> <出力> <中心x> <中心y> <幅> [倍率]
"""

import sys
from PIL import Image

src, dst, cx, cy, w = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
scale = int(sys.argv[6]) if len(sys.argv) > 6 else 3

img = Image.open(src)
h = int(w * 0.75)
box = (max(0, cx - w // 2), max(0, cy - h // 2), min(img.width, cx + w // 2), min(img.height, cy + h // 2))
out = img.crop(box).resize(((box[2] - box[0]) * scale, (box[3] - box[1]) * scale), Image.LANCZOS)
out.save(dst)
print(f"切り出し {box} → {out.size} を {dst} に保存")
