#!/usr/bin/env bash
# Installs the pinned Maestro CLI (#450) and prints the path of its `maestro`
# binary. Used by ios.sh and by .github/workflows/ios.yml, so local runs and CI
# use the same version. Needs Java 17 or newer on PATH (or JAVA_HOME).
#
# The archive comes from Maestro's GitHub release and is checked against the
# SHA-256 below before anything is extracted. To upgrade, change both values
# from the new release's checksums_sha256.txt.
set -euo pipefail

MAESTRO_VERSION="2.11.0"
MAESTRO_SHA256="5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a"  # pragma: allowlist secret (a public checksum)

home="${MAESTRO_INSTALL_ROOT:-$HOME/Library/Caches/MonElu-ios/maestro}/$MAESTRO_VERSION"
binary="$home/maestro/bin/maestro"

if [[ ! -x "$binary" ]]; then
    mkdir -p "$home"
    archive="$home/maestro.zip"
    curl -sfL --retry 3 -o "$archive" \
        "https://github.com/mobile-dev-inc/maestro/releases/download/cli-$MAESTRO_VERSION/maestro.zip"
    actual="$(shasum -a 256 "$archive" | cut -d' ' -f1)"
    if [[ "$actual" != "$MAESTRO_SHA256" ]]; then
        rm -f "$archive"
        echo "maestro.zip checksum mismatch: expected $MAESTRO_SHA256, got $actual" >&2
        exit 1
    fi
    unzip -q -o "$archive" -d "$home"
    rm -f "$archive"
fi

echo "$binary"
