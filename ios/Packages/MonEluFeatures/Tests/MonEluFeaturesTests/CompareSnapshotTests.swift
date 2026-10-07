import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The comparison in light and dark, at the default and an accessibility
/// text size (#487): before a second deputy is chosen, and with both.
@MainActor
@Suite(.snapshots(record: .missing))
struct CompareSnapshotTests {
    static func first() async throws -> CompareSide {
        let service = try LiveDeputiesServiceTests.service()
        return CompareSide(profile: try await service.profile(id: "PA1008"), scorecard: try await service.scorecard(id: "PA1008"))
    }

    /// The other side, written from the schema: a recorded second deputy
    /// would need a second set of fixtures for one image.
    static let other = CompareSide(
        profile: DeputyProfile(
            deputy: DeputyItem(
                id: "PA795228", name: "Nadège Abomangoli", group: "La France insoumise - Nouveau Front Populaire",
                groupShort: "LFI", department: "Seine-Saint-Denis", circonscription: "10", photoURL: nil
            ),
            mandateStart: MonEluFormat.calendarDate("2024-07-07"), mandateEnd: nil
        ),
        scorecard: DeputyScorecard(
            totalVotes: 2218, presenceRate: 0.3917, votesFor: 1059, votesAgainst: 1000, abstentions: 79,
            eligibleSolennels: 50, solennelsCast: 46, solennelParticipationRate: 0.92,
            eligibleVotingDays: 138, votingDaysPresent: 116, votingDaysRate: 0.8406, votesForRate: 0.4953
        )
    )

    @Test(arguments: Variant.all)
    func compareChoosing(_ variant: Variant) async throws {
        let page = ComparePage(first: try await Self.first(), other: nil, diverging: nil)
        checkSnapshot(CompareContent(page: page) {}.padding(.vertical, 16), variant)
    }

    @Test(arguments: Variant.all)
    func compareBoth(_ variant: Variant) async throws {
        let page = ComparePage(first: try await Self.first(), other: Self.other, diverging: try await CompareTests.diverging())
        checkSnapshot(
            NavigationStack {
                ScrollView { CompareContent(page: page) {}.padding(.vertical, 16) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 3800 : 1250
        )
    }
}
