import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The theme page's mapping from a recorded response, its 404 and the slug
/// lookup (#485).
struct ThemesTests {
    static func page() async throws -> ThemePage {
        try #require(try await LiveThemesService(client: stubClient(try fixture("theme"))).theme(slug: "justice-securite"))
    }

    @Test func mapsTheTheme() async throws {
        let theme = try await Self.page()
        #expect(theme.name == "Justice & Sécurité")
        #expect(theme.voteCount == 1474)
        #expect(theme.adoptionRate == 0.3073270013568521)
        let divided = try #require(theme.mostDivided)
        #expect((divided.votesFor, divided.votesAgainst) == (49, 49))
        #expect(divided.result == "rejeté")
        // The API's order, with the deputies who belong to no group last.
        #expect(theme.partyPositions.map(\.short) == ["RN", "EPR", "LFI", "SOC", nil])
        // The chart reads by share of "pour", highest first (#527).
        #expect(theme.byPourRate.map(\.short) == ["LFI", "SOC", "RN", nil, "EPR"])
        #expect(theme.votes.count == 2)
        #expect(theme.votes.first?.theme == "Justice & Sécurité")
    }

    @Test func anUnknownThemeIsNil() async throws {
        let service = LiveThemesService(client: stubClient(Data(#"{"detail":"Not found"}"#.utf8), status: .notFound))
        #expect(try await service.theme(slug: "inconnu") == nil)
    }

    @Test func themeSlugsComeFromTheReferenceTable() {
        #expect(ReferenceData.themeSlug(named: "Justice & Sécurité") == "justice-securite")
        #expect(ReferenceData.themeSlug(named: "Thème inconnu") == nil)
    }

    /// Equal rates keep the API's order.
    @Test func equalRatesKeepTheAPIOrder() {
        let page = ThemePage(
            slug: "x", name: "x", voteCount: 1, adoptionRate: nil, mostDivided: nil,
            partyPositions: [
                ThemePartyPosition(short: "A", pourRate: 0.5, expressed: 1),
                ThemePartyPosition(short: "B", pourRate: 0.8, expressed: 1),
                ThemePartyPosition(short: "C", pourRate: 0.5, expressed: 1),
            ],
            votes: []
        )
        #expect(page.byPourRate.map(\.short) == ["B", "A", "C"])
    }
}
