@testable import MonEluUI
import Testing

@MainActor
struct DeputyPortraitTests {
    @Test(arguments: [
        ("Audrey Abadie-Amiel", "AA"),
        ("Yaël Braun-Pivet", "YB"),
        ("Jean-Noël Barrot", "JB"),
        ("Marie", "M"),
        ("", ""),
    ])
    func initialsAreTheFirstAndLastWords(_ name: String, _ expected: String) {
        #expect(DeputyPortrait.initials(of: name) == expected)
    }
}
