import MonEluAPI
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
