import MonEluCore
import Testing

struct AppVersionTests {
    @Test(arguments: ["1.2.3", "0.0.0", "10.20.30"])
    func parsesSemanticVersions(_ string: String) {
        #expect(AppVersion(string)?.description == string)
    }

    @Test(arguments: ["", "1", "1.2", "1.2.3.4", "1.2.x", "v1.2.3", "1.2.3-beta", "1..3", " 1.2.3", "-1.2.3"])
    func rejectsAnythingElse(_ string: String) {
        #expect(AppVersion(string) == nil)
    }

    @Test func comparesNumericallyNotLexically() {
        #expect(AppVersion("1.9.0")! < AppVersion("1.10.0")!)
        #expect(AppVersion("2.0.0")! > AppVersion("1.99.99")!)
    }
}

struct ForcedUpdateTests {
    private func config(minimum: String) -> AppConfiguration {
        var config = AppConfiguration.defaults
        config.minIOSVersion = minimum
        return config
    }

    @Test func equalVersionDoesNotBlock() {
        #expect(config(minimum: "1.2.0").requiresUpdate(appVersion: "1.2.0") == false)
    }

    @Test func lowerVersionBlocks() {
        #expect(config(minimum: "1.2.0").requiresUpdate(appVersion: "1.1.9") == true)
        #expect(config(minimum: "1.10.0").requiresUpdate(appVersion: "1.9.0") == true)
    }

    @Test func higherVersionDoesNotBlock() {
        #expect(config(minimum: "1.2.0").requiresUpdate(appVersion: "1.3.0") == false)
    }

    @Test func malformedVersionsNeverBlock() {
        #expect(config(minimum: "not-a-version").requiresUpdate(appVersion: "1.0.0") == false)
        #expect(config(minimum: "9.9.9").requiresUpdate(appVersion: "garbage") == false)
    }

    @Test func defaultsBlockNothing() {
        #expect(AppConfiguration.defaults.requiresUpdate(appVersion: "0.0.1") == false)
        #expect(AppConfiguration.defaults.features == .init(chat: true, verify: true))
    }
}
