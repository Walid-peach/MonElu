import MonEluAPI
import SwiftUI

@main
struct MonEluApp: App {
    private let configService = AppConfigService(client: MonEluAPI.client(baseURL: AppEnvironment.apiBaseURL))

    var body: some Scene {
        WindowGroup {
            LaunchGate(service: configService, appVersion: AppEnvironment.appVersion)
        }
    }
}
