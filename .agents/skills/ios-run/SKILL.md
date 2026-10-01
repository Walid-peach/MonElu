---
name: ios-run
description: Launches the MonÉlu iPhone app in the iOS Simulator, walks a Maestro flow, and saves light and dark screenshots of each step to ios/build/screenshots/<flow>/. Use to see an iOS change working, to check a screen, or to produce the screenshots a UI PR must carry (ADR-041 §8). Use as /ios-run or /ios-run <flow>.
---

Run the app and look at it, so an iOS PR carries evidence a reviewer who does not read Swift can check (ADR-041 §8, #450).

ARGUMENTS: a flow name from `ios/maestro/` (without `.yaml`). Default: `tabs`, which visits every tab.

## Run

1. Check the prerequisites once per machine: Xcode 27 with an iOS Simulator runtime, `mise` (`brew install mise`) and Java 17 (`brew install openjdk@17`).
   `ios/scripts/ios.sh` finds Homebrew's JDK on its own and installs the pinned Maestro CLI on first use.
2. Run the flow from the repository root:

   ```bash
   make ios-flow FLOW=<flow>
   ```

   It builds the Debug app, installs it on this checkout's own Simulator (`IOS_SIMULATOR_ID` picks another), and runs `ios/maestro/<flow>.yaml` once in light mode and once in dark mode.
   While iterating, run light mode only, which halves the time:

   ```bash
   IOS_APPEARANCES=light make ios-flow FLOW=<flow>
   ```

   Run both appearances once before pushing a change to a screen, and look at the dark screenshots too (the local loop in `ios/CLAUDE.md`).
3. The screenshots are in `ios/build/screenshots/<flow>/`, named `light-<step>.png` and `dark-<step>.png` (only the appearances that ran), and replaced on every run.
   Look at every one before reporting: a flow that passes can still show a broken layout.

## Writing a flow

- One file per journey in `ios/maestro/`, starting with `appId: ${APP_ID}`.
- Tap by the visible French label (`tapOn: "Votes"`), assert what the user should see, and `takeScreenshot: ${SCREENSHOT_PREFIX}<n>-<step>` at each state worth reviewing, so the light and dark runs do not overwrite each other.
- Start with `launchApp: clearState: true`, so a flow never depends on a previous run.
- A flow that `ios.yml` should run on every PR is added to `SMOKE_FLOWS` in `ios/scripts/ios.sh`.

## Reporting

- In a PR that changes a screen, say which flow you ran, and list the screenshots that show the change.
  CI's `smoke` job uploads the smoke flows' screenshots as the `smoke-screenshots` artifact on every run, in light mode only on a PR, so link that run for light and attach the dark screenshots from your local run.
- When working with the user, share the relevant screenshots with them.
- If the flow fails, Maestro's logs and view hierarchy are under `~/Library/Caches/MonElu-ios/<checkout hash>/maestro/<flow>/`; read them before changing the flow.
