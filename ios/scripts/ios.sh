#!/usr/bin/env bash
# The only build entry point for the iOS app (ADR-041). The root Makefile's
# ios-* targets call this; agents and CI never call xcodebuild directly.
#
#   ios.sh generate   generate MonElu.xcworkspace from Project.swift
#   ios.sh build      build the app for the Simulator
#   ios.sh test       run the app's tests and every package's tests on the Simulator
#   ios.sh run        build, install and launch the app in the Simulator
#
# IOS_SIMULATOR_ID picks a Simulator by UDID; otherwise the first available
# iPhone on the newest installed iOS runtime is used.
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$IOS_DIR"

# Build products live outside the repository: the checkout may sit in an
# iCloud-synced folder, whose extended attributes make codesign refuse the
# bundle ("resource fork, Finder information, or similar detritus not
# allowed"). Keyed by checkout path so parallel worktrees never share one.
BUILD_ROOT="${IOS_BUILD_ROOT:-$HOME/Library/Caches/MonElu-ios/$(printf '%s' "$IOS_DIR" | shasum | cut -c1-12)}"
DERIVED_DATA="$BUILD_ROOT/DerivedData"

tuist() {
    if ! command -v mise >/dev/null 2>&1; then
        echo "mise is required to run the pinned Tuist (brew install mise)." >&2
        exit 1
    fi
    mise install --quiet
    mise exec -- tuist "$@"
}

simulator_id() {
    if [[ -n "${IOS_SIMULATOR_ID:-}" ]]; then
        echo "$IOS_SIMULATOR_ID"
        return
    fi
    # Runtimes are listed oldest first; keep the first iPhone of the last one.
    local id
    id="$(xcrun simctl list devices available | awk '
        /^-- iOS / { section = 1; first = ""; next }
        /^-- / { section = 0; next }
        section && first == "" && /iPhone/ {
            if (match($0, /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/)) {
                first = substr($0, RSTART, RLENGTH)
                last = first
            }
        }
        END { print last }')"
    if [[ -z "$id" ]]; then
        echo "No iPhone Simulator found. Install one with: xcodebuild -downloadPlatform iOS" >&2
        exit 1
    fi
    echo "$id"
}

xcb() {
    # -quiet keeps the log to warnings and errors; failures still print in full.
    # -skipPackagePluginValidation lets Swift OpenAPI Generator's build plugin
    # run without the interactive trust prompt Xcode shows for it (#448); the
    # plugin's version is pinned exactly in Packages/MonEluAPI/Package.swift.
    xcodebuild -quiet -skipPackagePluginValidation "$@"
}

xcb_test() {
    # Simulator diagnostics collection can stall for ten minutes after a run
    # that reported runtime issues; the .xcresult already holds what a
    # failure needs.
    xcb test -collect-test-diagnostics never "$@"
}

generate() {
    tuist generate --no-open
}

build() {
    generate
    xcb build \
        -workspace MonElu.xcworkspace \
        -scheme MonElu \
        -configuration Debug \
        -destination "platform=iOS Simulator,id=$(simulator_id)" \
        -derivedDataPath "$DERIVED_DATA"
}

test_all() {
    generate
    local dest
    dest="platform=iOS Simulator,id=$(simulator_id)"
    echo "==> MonElu (app)"
    xcb_test \
        -workspace MonElu.xcworkspace \
        -scheme MonElu \
        -destination "$dest" \
        -derivedDataPath "$DERIVED_DATA"
    # Every package under Packages/ is tested, so one added to Project.swift
    # cannot ship without its tests running here.
    local manifest package
    for manifest in Packages/*/Package.swift; do
        package="$(basename "$(dirname "$manifest")")"
        echo "==> $package"
        (cd "Packages/$package" && xcb_test \
            -scheme "$package" \
            -destination "$dest" \
            -derivedDataPath "$BUILD_ROOT/Packages/$package")
    done
    echo "All iOS tests passed."
}

run() {
    build
    local id app bundle_id
    id="$(simulator_id)"
    app="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/MonElu.app"
    bundle_id="$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")"
    xcrun simctl boot "$id" 2>/dev/null || true
    # The window is for a human watching; a headless run carries on without it.
    open -b com.apple.iphonesimulator --args -CurrentDeviceUDID "$id" 2>/dev/null || true
    xcrun simctl bootstatus "$id" -b >/dev/null
    xcrun simctl install "$id" "$app"
    xcrun simctl launch "$id" "$bundle_id"
}

case "${1:-}" in
    generate) generate ;;
    build) build ;;
    test) test_all ;;
    run) run ;;
    *)
        echo "usage: $0 {generate|build|test|run}" >&2
        exit 2
        ;;
esac
