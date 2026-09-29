import MonEluCore
import MonEluUI
import SwiftUI
import Testing

@MainActor
struct AppConfigurationEnvironmentTests {
    @Test func defaultsToTheOfflineConfiguration() {
        #expect(EnvironmentValues().appConfiguration == .defaults)
    }

    @Test func carriesAnInjectedConfiguration() {
        var values = EnvironmentValues()
        var configuration = AppConfiguration.defaults
        configuration.features.chat = false
        values.appConfiguration = configuration
        #expect(values.appConfiguration.features.chat == false)
    }

    @Test func updateScreenBuilds() {
        _ = UpdateRequiredScreen().body
    }
}
