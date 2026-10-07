import MonEluAPI
import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI
import UIKit

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
    let services: AppServices
    let appVersion: String

    @Environment(\.scenePhase) private var scenePhase
    @State private var configuration: AppConfiguration
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system

    init(service: AppConfigService, services: AppServices, appVersion: String) {
        self.service = service
        self.services = services
        self.appVersion = appVersion
        _configuration = State(initialValue: service.cached())
    }

    private func applyAppearance() {
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows { window.overrideUserInterfaceStyle = appearance.interfaceStyle }
        }
    }

    var body: some View {
        Group {
            if configuration.requiresUpdate(appVersion: appVersion) {
                UpdateRequiredScreen()
            } else {
                RootTabView(services: services)
            }
        }
        .environment(\.appConfiguration, configuration)
        // On the windows themselves, so sheets and alerts follow too, and the
        // change applies at once from Réglages.
        .onChange(of: appearance, initial: true) { applyAppearance() }
        // Again on activation: at a cold launch the window may not exist yet
        // when the first change fires.
        .onChange(of: scenePhase) { if scenePhase == .active { applyAppearance() } }
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            configuration = await service.refresh()
        }
    }
}
