import Foundation
import Testing

/// The app declares that it uses no encryption beyond Apple's own HTTPS
/// (#705), so App Store Connect does not stop every upload on the export
/// compliance question.
struct ExportComplianceTests {
    @Test func theAppUsesOnlyExemptEncryption() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "ITSAppUsesNonExemptEncryption") as? Bool == false)
    }
}
