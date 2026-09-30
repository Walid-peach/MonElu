import MonEluAPI
import MonEluCore
import MonEluUI
import SwiftUI

/// Opens the app on the last known launch configuration, refreshes it from
/// `GET /app/config`, and blocks on an update screen when this version is
/// below the API's minimum (#448). A launch with no network never waits: it
/// uses the cached value, or the defaults on a first launch.
///
/// It refreshes every time the app comes to the foreground, not only at
/// launch: iOS keeps an app suspended for days, and a raised minimum or a
/// switched-off feature must reach it without waiting for the process to die.
struct LaunchGate: View {
    let service: AppConfigService
    let appVersion: String

    @Environment(\.scenePhase) private var scenePhase
    @State private var configuration: AppConfiguration

    init(service: AppConfigService, appVersion: String) {
        self.service = service
        self.appVersion = appVersion
        _configuration = State(initialValue: service.cached())
    }

    var body: some View {
        Group {
            if configuration.requiresUpdate(appVersion: appVersion) {
                UpdateRequiredScreen()
            } else {
                RootTabView()
            }
        }
        .environment(\.appConfiguration, configuration)
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            configuration = await service.refresh()
        }
    }
}
