import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The 2027 tab in light and dark, at the default and an accessibility text
/// size (#718), from a page written from the API's schema. It is split into
/// three bands: a whole tab in one image would pass the repository's 500 KB
/// limit.
@MainActor
@Suite(.snapshots(record: .missing))
struct ElectionSnapshotTests {
    private static func page() async throws -> ElectionPage {
        try await LiveElectionService(client: stubClient(try fixture("election_2027"))).page()
    }

    private static let review = DeputyReview(
        deputy: DeputyItem(
            id: "PA1", name: "Camille Durand", group: "Ensemble pour la République", groupShort: "EPR",
            department: "Gironde", circonscription: "3e", photoURL: nil
        ),
        presenceRate: 0.71, votesCast: 842, alignmentRate: 0.93
    )

    private static let dated = AppConfiguration.Election(
        firstRoundLabel: "avril 2027", firstRoundDate: "2027-04-11", secondRoundDate: "2027-04-25",
        registrationDeadline: "2027-03-05"
    )

    /// The hero and the figures, while the date is not fixed.
    @Test(arguments: Variant.all)
    func heroAndFiguresWithoutADate(_ variant: Variant) async throws {
        let page = try await Self.page()
        checkSnapshot(
            VStack(alignment: .leading, spacing: Spacing.l) {
                ElectionHero(election: .undecided, coverageStart: Election2027Screen.coverage(page.figures.coverageStart))
                ElectionFiguresSection(figures: page.figures, coverage: Election2027Screen.coverage(page.figures.coverageStart))
            }
            .padding(16),
            variant,
            height: variant.size.isAccessibilityCategory ? 3200 : 900
        )
    }

    /// The hero once a decree has fixed the date: the countdown.
    @Test(arguments: [Variant.all[0], Variant.all[1]])
    func heroWithACountdown(_ variant: Variant) async throws {
        let page = try await Self.page()
        checkSnapshot(
            ElectionHero(election: Self.dated, coverageStart: Election2027Screen.coverage(page.figures.coverageStart))
                .padding(16),
            variant
        )
    }

    /// The close votes and the group grid.
    @Test(arguments: Variant.all)
    func votesAndGrid(_ variant: Variant) async throws {
        let page = try await Self.page()
        checkSnapshot(
            NavigationStack {
                VStack(alignment: .leading, spacing: Spacing.l) {
                    ElectionKeyVotesSection(votes: page.keyVotes)
                    ElectionGridSection(rows: page.grid, voteCount: page.keyVotes.count)
                }
                .padding(16)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2600 : 1000
        )
    }

    /// The verify card, the quiz, the deputy, the calendar and the footer.
    @Test(arguments: Variant.all)
    func lowerBand(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                VStack(alignment: .leading, spacing: Spacing.l) {
                    ElectionVerifyCard(claim: .constant(""), onVerify: {})
                    ElectionQuizCard(onOpen: {})
                    ElectionDeputyCard(review: Self.review)
                    ElectionCalendarSection(election: Self.dated)
                    ElectionFooter()
                }
                .padding(16)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 4200 : 1500
        )
    }

    /// With no followed deputy: the find-my-deputy entry.
    @Test(arguments: [Variant.all[0], Variant.all[1]])
    func findDeputy(_ variant: Variant) {
        checkSnapshot(ElectionFindDeputyCard(onFind: {}).padding(16), variant)
    }
}
