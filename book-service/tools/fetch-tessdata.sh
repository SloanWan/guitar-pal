#!/usr/bin/env sh
# Tesseract language data for OCR on scanned uploads, into ./tessdata
# (gitignored). The Dockerfile does the same for the image. `tessdata_fast`
# on purpose: docs/calibration.md has the fast-vs-best numbers.
set -eu
dir="${1:-$(dirname "$0")/../tessdata}"
mkdir -p "$dir"
for lang in chi_sim eng; do
  if [ ! -f "$dir/$lang.traineddata" ]; then
    echo "fetching $lang.traineddata"
    curl -fsSL -o "$dir/$lang.traineddata" \
      "https://github.com/tesseract-ocr/tessdata_fast/raw/main/$lang.traineddata"
  fi
done
echo "tessdata ready in $dir — export TESSDATA_PREFIX=$(cd "$dir" && pwd)"
