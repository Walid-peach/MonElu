---
name: ios-device
description: Installs the MonÉlu iPhone app from master on the user's own iPhone plugged into this Mac, replacing the installed copy and keeping its data, with make ios-device. Use when the user asks to put, update or reinstall the app on their real iPhone. For the Simulator, use ios-run.
---

Put the latest `master` on the user's iPhone without losing what the installed app holds (followed deputies, preferences).
`make ios-device` is the only way to sign, build, install and launch on the phone: never call `xcodebuild` or `tuist` directly ("On a real iPhone" in `ios/CLAUDE.md`).

## Steps

1. `git status` in the checkout.
   If anything is uncommitted, stop and ask; never stash, reset or discard it.
   Then `git checkout master && git pull origin master`.
2. Find the phone and the bundle id already on it:

   ```bash
   xcrun devicectl list devices
   xcrun devicectl device info apps --device <udid> | grep -i monelu
   ```

   No `physical` row that is `available (paired)` means the phone is locked, untrusted or not in Developer Mode; tell the user, do not retry.
3. Check that the build will reuse that bundle id, since a different id installs a second app with empty data:
   - `ios/Configs/Local.xcconfig` exists: its `MONELU_BUNDLE_ID` must equal the installed id.
   - It is missing (a fresh clone): `ios/scripts/ios.sh` writes `fr.monelu.app.dev.<team, lowercased>` from the one team in Xcode's settings, so compare that with the installed id before running.
   If they differ, ask the user before going further.
4. Run it, saving the log to the scratchpad (the build output is long):

   ```bash
   make ios-device > <scratchpad>/ios-device.log 2>&1; echo "exit=$?"
   ```

   Judge success by the exit status and the final `Launched application with <bundle id>` line, not by `error:` or `warning:` lines in the middle, which Xcode prints on successful builds too.

## On failure

Fix only what is environmental, and say what you did:

- No signing team, or a provisioning error: free Apple ID installs expire after 7 days and need the Apple ID signed in under Xcode > Settings > Accounts; ask the user to check it.
- Several teams: the user picks one; the script prints how to write `Local.xcconfig`.
- `mise` or Tuist missing: `brew install mise`.
- iOS refuses to open the app ("Untrusted Developer"): the user trusts it under Settings > General > VPN & Device Management.

A compile error or a broken script is the repository's problem: report the file, line and message, and edit or push nothing.

## Reporting

Say that the app is installed, from which commit, and whether the bundle id matched (so the data is kept).
Tell the user what to look at for the change that just landed, from the merged PRs.
List new compiler warnings in the code that just landed, with `file:line`, without fixing them.
