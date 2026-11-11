import MonEluAPI
import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI

@main
struct MonEluApp: App {
    private let configService: AppConfigService
    private let services: AppServices

    init() {
        Typography.registerFonts()
        NavigationBarStyle.apply()
        MonEluAPI.configureURLCache()
        #if DEBUG
        // `MonEluNoLoadCache`, passed at launch, turns the in-memory page cache
        // off, to measure a page switch with and without it.
        if ProcessInfo.processInfo.arguments.contains(where: { $0.hasSuffix("MonEluNoLoadCache") }) {
            LoadCache.shared.isEnabled = false
        }
        #endif
        let client = MonEluAPI.client(baseURL: AppEnvironment.apiBaseURL)
        configService = AppConfigService(client: client)
        services = AppServices(client: client)
    }

    var body: some Scene {
        WindowGroup {
            LaunchGate(service: configService, services: services, appVersion: AppEnvironment.appVersion)
        }
    }
}
