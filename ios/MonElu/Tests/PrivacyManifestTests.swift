import Foundation
import Testing

/// The privacy manifest ships inside the app (#703): App Store Connect refuses
/// an upload that reads `UserDefaults` without declaring the reason there.
struct PrivacyManifestTests {
    private func manifest() throws -> [String: Any] {
        let url = try #require(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let plist = try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil)
        return try #require(plist as? [String: Any])
    }

    @Test func theAppDoesNotTrack() throws {
        let manifest = try manifest()
        #expect(manifest["NSPrivacyTracking"] as? Bool == false)
        #expect((manifest["NSPrivacyTrackingDomains"] as? [String])?.isEmpty == true)
    }

    @Test func userDefaultsIsDeclaredForTheAppsOwnData() throws {
        let types = try #require(try manifest()["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        let userDefaults = types.first { $0["NSPrivacyAccessedAPIType"] as? String == "NSPrivacyAccessedAPICategoryUserDefaults" }
        #expect(userDefaults?["NSPrivacyAccessedAPITypeReasons"] as? [String] == ["CA92.1"])
    }

    @Test func nothingCollectedIsLinkedToAnIdentityOrUsedForTracking() throws {
        let collected = try #require(try manifest()["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        #expect(!collected.isEmpty)
        for entry in collected {
            #expect(entry["NSPrivacyCollectedDataTypeLinked"] as? Bool == false)
            #expect(entry["NSPrivacyCollectedDataTypeTracking"] as? Bool == false)
        }
    }
}
