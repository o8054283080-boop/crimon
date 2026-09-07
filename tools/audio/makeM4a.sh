#!/usr/bin/env bash
# 焼いたOGGから、iPhone用のAAC/M4Aを作る。
#
# **iPhoneのSafariはOGG(Vorbis)を再生できない。**`decodeAudioData()` は
# EncodingError になり、`<audio>` へ渡しても「再生中」の顔をしたまま無音になる。
# 同じ音をM4Aでも置いておき、再生側が端末に応じて選ぶ(`src/web/audio/format.ts`)。
#
# **変換したものは控えに入れる。**以前は公開のワークフローの中だけで変換しており、
# 別の配信先(Cloudflare Pages)から配られた本番にはM4Aが1つも無かった。
# 配信先によって届く物が変わってはいけない。
#
# 音を足したり焼き直したりしたら、これを実行して差分を一緒にコミットすること。
#
#   bash tools/audio/makeM4a.sh
#
# BGMは長いので128k、効果音は短いので96k。OGGより少し大きくなるが、
# 全部合わせても4MB弱に収まる。
set -euo pipefail

cd "$(dirname "$0")/../.."

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg がありません。apt-get install -y ffmpeg などで入れてください" >&2
  exit 1
fi

made=0
for src in public/audio/*.ogg; do
  dst="${src%.ogg}.m4a"
  # 元が新しい時だけ焼き直す。毎回全部作ると、中身が同じでも差分が出る
  if [ -s "$dst" ] && [ "$dst" -nt "$src" ]; then
    continue
  fi
  case "$(basename "$src")" in
    bgm_*) bitrate=128k ;;
    *) bitrate=96k ;;
  esac
  ffmpeg -hide_banner -loglevel error -y -i "$src" -c:a aac -b:a "$bitrate" -movflags +faststart "$dst"
  made=$((made + 1))
done

echo "M4Aを ${made} 個作りました（全 $(ls public/audio/*.m4a | wc -l) 個）"
