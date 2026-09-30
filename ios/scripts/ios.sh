#!/usr/bin/env bash
# The only build entry point for the iOS app (ADR-041). The root Makefile's
# ios-* targets call this; agents and CI never call xcodebuild directly.
#
#   ios.sh generate   generate MonElu.xcworkspace from Project.swift
#   ios.sh build      build the app for the Simulator
#   ios.sh test       run the app's tests and every package's tests on the Simulator
#   ios.sh run        build, install and launch the app in the Simulator
#   ios.sh flow NAME  build, install, and run maestro/NAME.yaml in light and
#                     dark mode, saving its screenshots to build/screenshots/NAME/
#   ios.sh smoke      the `tabs` flow, as ios.yml runs it
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

APP="$DERIVED_DATA/Build/Products/Debug-iphonesimulator/MonElu.app"

# Builds the app and installs it on the booted Simulator; prints its bundle id.
install_app() {
    build >&2
    local id
    id="$(simulator_id)"
    xcrun simctl boot "$id" 2>/dev/null || true
    # The window is for a human watching; a headless run carries on without it.
    open -b com.apple.iphonesimulator --args -CurrentDeviceUDID "$id" 2>/dev/null || true
    xcrun simctl bootstatus "$id" -b >/dev/null
    xcrun simctl install "$id" "$APP"
    /usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist"
}

run() {
    local bundle_id
    bundle_id="$(install_app)"
    xcrun simctl launch "$(simulator_id)" "$bundle_id"
}

maestro() {
    # macOS ships a /usr/bin/java stub with no runtime behind it, so ask java
    # to run rather than whether it exists.
    if [[ -z "${JAVA_HOME:-}" ]] && ! java -version >/dev/null 2>&1; then
        # Homebrew's keg-only JDK is not on PATH by default.
        local brew_java=/opt/homebrew/opt/openjdk@17
        if [[ -x "$brew_java/bin/java" ]]; then
            export JAVA_HOME="$brew_java" PATH="$brew_java/bin:$PATH"
        else
            echo "Maestro needs Java 17 or newer (brew install openjdk@17)." >&2
            exit 1
        fi
    fi
    "$("$IOS_DIR/scripts/install-maestro.sh")" "$@"
}

# Runs maestro/NAME.yaml in light then dark mode. Screenshots are written to
# build/screenshots/NAME/, prefixed `light-` and `dark-`, replacing any from a
# previous run, so an agent always knows where to find them.
flow() {
    local name="${1:?usage: ios.sh flow NAME}"
    local file="$IOS_DIR/maestro/$name.yaml"
    [[ -f "$file" ]] || { echo "No such flow: maestro/$name.yaml" >&2; exit 2; }
    local bundle_id id out debug appearance
    bundle_id="$(install_app)"
    id="$(simulator_id)"
    out="$IOS_DIR/build/screenshots/$name"
    # Maestro's own output (logs, view hierarchy, screenshots) per run; ios.yml
    # uploads it when a flow fails. It ignores the working directory, so the
    # screenshots are moved out of it into $out.
    debug="$BUILD_ROOT/maestro/$name"
    rm -rf "$out" "$debug" && mkdir -p "$out"
    for appearance in light dark; do
        xcrun simctl ui "$id" appearance "$appearance"
        maestro --device "$id" test --test-output-dir "$debug/$appearance" \
            -e APP_ID="$bundle_id" -e SCREENSHOT_PREFIX="$appearance-" "$file"
        find "$debug/$appearance" -name '*.png' -path '*takeScreenshot*' -exec mv {} "$out/" \;
    done
    xcrun simctl ui "$id" appearance light
    echo "Screenshots: $out"
    ls "$out"
}

case "${1:-}" in
    generate) generate ;;
    build) build ;;
    test) test_all ;;
    run) run ;;
    flow) flow "${2:-}" ;;
    smoke) flow tabs ;;
    *)
        echo "usage: $0 {generate|build|test|run|flow NAME|smoke}" >&2
        exit 2
        ;;
esac
