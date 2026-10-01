#!/usr/bin/env bash
# The only build entry point for the iOS app (ADR-041). The root Makefile's
# ios-* targets call this; agents and CI never call xcodebuild directly.
#
#   ios.sh generate   generate MonElu.xcworkspace from Project.swift
#   ios.sh build      build the app for the Simulator
#   ios.sh test [TARGET...]
#                     run the tests of `app` and of each named package on the
#                     Simulator; every target when none is named
#   ios.sh run        build, install and launch the app in the Simulator
#   ios.sh flow NAME  build, install, and run maestro/NAME.yaml in each
#                     appearance, saving its screenshots to build/screenshots/NAME/
#   ios.sh smoke      every flow in SMOKE_FLOWS, as ios.yml runs them
#
# IOS_SIMULATOR_ID picks a Simulator by UDID. Otherwise each checkout gets its
# own, named after it and cloned on first use from a per-machine template, so
# parallel worktrees never install over each other's app (#469).
# IOS_APPEARANCES lists the appearances flows run in: "light dark" by default.
set -euo pipefail

IOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$IOS_DIR"

# Build products live outside the repository: the checkout may sit in an
# iCloud-synced folder, whose extended attributes make codesign refuse the
# bundle ("resource fork, Finder information, or similar detritus not
# allowed"). Keyed by checkout path so parallel worktrees never share one.
CHECKOUT_KEY="$(printf '%s' "$IOS_DIR" | shasum | cut -c1-12)"
BUILD_ROOT="${IOS_BUILD_ROOT:-$HOME/Library/Caches/MonElu-ios/$CHECKOUT_KEY}"
DERIVED_DATA="$BUILD_ROOT/DerivedData"

# The device and runtime the snapshot references are rendered on (ios.yml
# pins the same pair); another one renders text differently.
SIMULATOR_DEVICE="${IOS_SIMULATOR_DEVICE:-iPhone 18 Pro}"
SIMULATOR_RUNTIME="${IOS_SIMULATOR_RUNTIME:-com.apple.CoreSimulator.SimRuntime.iOS-27-0}"

tuist() {
    if ! command -v mise >/dev/null 2>&1; then
        echo "mise is required to run the pinned Tuist (brew install mise)." >&2
        exit 1
    fi
    mise install --quiet
    mise exec -- tuist "$@"
}

# Prints the UDID of the available Simulator named $1, if any.
simulator_named() {
    xcrun simctl list devices available | awk -v name="$1" '
        index($0, "    " name " (") == 1 {
            if (match($0, /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/)) {
                print substr($0, RSTART, RLENGTH)
                exit
            }
        }'
}

# True when the Simulator $1 has reached its home screen at least once. A
# device that has only been created, or booted briefly, still has minutes of
# first-boot work ahead, and so do its clones.
has_finished_first_boot() {
    [[ -e "$HOME/Library/Developer/CoreSimulator/Devices/$1/data/Library/Preferences/com.apple.springboard.plist" ]]
}

# One Simulator per machine that has finished its first boot; each checkout's
# own Simulator is a clone of it, which boots in seconds. A brand-new device
# spends many minutes on that first boot, and on this runtime a clone of one
# that has not finished it does the same work again.
template_id() {
    local name="MonElu template" id candidate
    id="$(simulator_named "$name")"
    [[ -n "$id" ]] && { echo "$id"; return; }
    if ! xcrun simctl list runtimes | grep -q "$SIMULATOR_RUNTIME"; then
        echo "The iOS runtime the snapshots need is missing ($SIMULATOR_RUNTIME)." >&2
        echo "Install it with: xcodebuild -downloadPlatform iOS" >&2
        exit 1
    fi
    # Prefer a device of the snapshot model that has already been used and is
    # shut down: a clone needs its source shut down, and one that is booted may
    # be in use. simctl's text listing cannot be filtered by runtime; its JSON
    # is keyed by it.
    for candidate in $(xcrun simctl list devices available -j | /usr/bin/python3 -c '
import json, sys
runtime, device = sys.argv[1], sys.argv[2]
for d in json.load(sys.stdin)["devices"].get(runtime, []):
    if d["name"] == device and d["state"] == "Shutdown":
        print(d["udid"])
' "$SIMULATOR_RUNTIME" "$SIMULATOR_DEVICE"); do
        if has_finished_first_boot "$candidate"; then
            id="$(xcrun simctl clone "$candidate" "$name")"
            echo "Created the template Simulator from $SIMULATOR_DEVICE ($candidate)." >&2
            echo "$id"
            return
        fi
    done
    # None: boot a new one until it reaches its home screen, once per machine.
    id="$(xcrun simctl create "$name" "$SIMULATOR_DEVICE" "$SIMULATOR_RUNTIME")"
    echo "Creating the template Simulator ($SIMULATOR_DEVICE); its first boot is slow, once per machine." >&2
    echo "(Shutting down a used $SIMULATOR_DEVICE first lets it be cloned instead.)" >&2
    xcrun simctl boot "$id"
    local waited=0
    until has_finished_first_boot "$id"; do
        sleep 10
        waited=$((waited + 10))
        if [[ "$waited" -ge 1800 ]]; then
            echo "The template Simulator did not reach its home screen in 30 minutes." >&2
            exit 1
        fi
    done
    xcrun simctl shutdown "$id"
    echo "$id"
}

simulator_id() {
    if [[ -n "${IOS_SIMULATOR_ID:-}" ]]; then
        echo "$IOS_SIMULATOR_ID"
        return
    fi
    # This checkout's own Simulator, found by name or cloned from the template.
    local name="MonElu $CHECKOUT_KEY" id template
    id="$(simulator_named "$name")"
    if [[ -z "$id" ]]; then
        template="$(template_id)"
        # A clone needs its source shut down.
        xcrun simctl shutdown "$template" 2>/dev/null || true
        id="$(xcrun simctl clone "$template" "$name")"
        echo "Created Simulator \"$name\" for this checkout: $id" >&2
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

# Tests the given targets, `app` or a package under Packages/, or all of them
# when none is given. ios.yml splits them across parallel jobs, and
# tests/unit/test_ios_ci_paths.py checks that those jobs cover every target.
test_all() {
    local all=(app) manifest target
    for manifest in Packages/*/Package.swift; do
        all+=("$(basename "$(dirname "$manifest")")")
    done
    local targets=("$@")
    [[ ${#targets[@]} -eq 0 ]] && targets=("${all[@]}")
    for target in "${targets[@]}"; do
        if [[ " ${all[*]} " != *" $target "* ]]; then
            echo "Unknown test target: $target (one of: ${all[*]})" >&2
            exit 1
        fi
    done
    local dest
    dest="platform=iOS Simulator,id=$(simulator_id)"
    for target in "${targets[@]}"; do
        if [[ "$target" == app ]]; then
            generate
            echo "==> MonElu (app)"
            xcb_test \
                -workspace MonElu.xcworkspace \
                -scheme MonElu \
                -destination "$dest" \
                -derivedDataPath "$DERIVED_DATA"
            continue
        fi
        # Each package keeps its own build folder: a shared one compiles shared
        # dependencies once, but hung the MonEluFeatures tests indefinitely when
        # tried (#469).
        echo "==> $target"
        (cd "Packages/$target" && xcb_test \
            -scheme "$target" \
            -destination "$dest" \
            -derivedDataPath "$BUILD_ROOT/Packages/$target")
    done
    echo "iOS tests passed: ${targets[*]}"
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

# Runs the given flows in each of IOS_APPEARANCES ("light dark" by default),
# in one Maestro launch per appearance (each launch costs about a minute of
# driver start-up).
# Screenshots land in build/screenshots/<flow>/, prefixed `light-` and
# `dark-`, replacing any from a previous run, so an agent always knows where
# to find them.
run_flows() {
    local bundle_id="$1"
    shift
    local id files=() name appearance debug png flow_name
    id="$(simulator_id)"
    for name in "$@"; do
        [[ -f "$IOS_DIR/maestro/$name.yaml" ]] || { echo "No such flow: maestro/$name.yaml" >&2; exit 2; }
        files+=("$IOS_DIR/maestro/$name.yaml")
        rm -rf "$IOS_DIR/build/screenshots/$name"
        mkdir -p "$IOS_DIR/build/screenshots/$name"
    done
    # Maestro's own output (logs, view hierarchy, screenshots) per run; ios.yml
    # uploads it when a flow fails. Maestro ignores the working directory, so
    # each flow's screenshots are moved out of it afterwards.
    debug="$BUILD_ROOT/maestro"
    rm -rf "$debug"
    # A failing flow must not skip what follows: the screenshots taken up to
    # the failure are the evidence, and the Simulator goes back to light mode.
    local status=0 appearances
    read -r -a appearances <<< "${IOS_APPEARANCES:-light dark}"
    for appearance in "${appearances[@]}"; do
        xcrun simctl ui "$id" appearance "$appearance"
        maestro --device "$id" test --test-output-dir "$debug/$appearance" \
            -e APP_ID="$bundle_id" -e SCREENSHOT_PREFIX="$appearance-" "${files[@]}" || status=$?
        while IFS= read -r png; do
            # .../<flow>/takeScreenshot/<name>.png
            flow_name="$(basename "$(dirname "$(dirname "$png")")")"
            if [[ -d "$IOS_DIR/build/screenshots/$flow_name" ]]; then
                mv "$png" "$IOS_DIR/build/screenshots/$flow_name/"
            fi
        done < <(find "$debug/$appearance" -name '*.png' -path '*takeScreenshot*' 2>/dev/null)
        [[ "$status" -eq 0 ]] || break
    done
    xcrun simctl ui "$id" appearance light
    for name in "$@"; do
        echo "Screenshots: $IOS_DIR/build/screenshots/$name"
        ls "$IOS_DIR/build/screenshots/$name"
    done
    return "$status"
}

flow() {
    local name="${1:?usage: ios.sh flow NAME}"
    run_flows "$(install_app)" "$name"
}

# Every flow ios.yml runs on each PR, against one build and one install.
SMOKE_FLOWS=(tabs routes votes deputies)

smoke() {
    run_flows "$(install_app)" "${SMOKE_FLOWS[@]}"
}

case "${1:-}" in
    generate) generate ;;
    build) build ;;
    test) shift; test_all "$@" ;;
    run) run ;;
    flow) flow "${2:-}" ;;
    smoke) smoke ;;
    *)
        echo "usage: $0 {generate|build|test|run|flow NAME|smoke}" >&2
        exit 2
        ;;
esac
