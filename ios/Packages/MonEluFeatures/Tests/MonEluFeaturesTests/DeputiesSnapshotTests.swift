import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The Députés tab's screens in light and dark, at the default and an
/// accessibility text size (#462). The profile is built from responses
/// recorded from the production API. Snapshots never reach the network, so
/// every portrait shows its initials, which is also what a missing or
/// failing photo shows.
@MainActor
@Suite(.snapshots(record: .missing))
struct DeputiesSnapshotTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0",
        features: .init(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [
            .init(
                id: "presence_rate",
                text: "Le taux de présence compte le `nonVotant` comme présent, et son dénominateur est limité aux scrutins tenus pendant le mandat du député."
            ),
            .init(
                id: "president_presence",
                text: "Yaël Braun-Pivet affiche 100 % de présence parce qu'elle préside l'Assemblée et figure sur chaque scrutin par construction des données source."
            ),
            .init(
                id: "group_alignment",
                text: "L'alignement de groupe compare tout l'historique d'un député à son groupe **actuel**, même s'il en a changé en cours de mandat."
            ),
        ]
    )

    @Test(arguments: Variant.all)
    func deputyRow(_ variant: Variant) {
        checkSnapshot(DeputyRowView(deputy: deputy("PA1008")).padding(16), variant)
    }

    @Test(arguments: Variant.all)
    func deputiesList(_ variant: Variant) async throws {
        let page = try await LiveDeputiesServiceTests.service().deputies(DeputyQuery())
        // In a stack, as in the app: a NavigationLink outside one renders disabled.
        checkSnapshot(
            NavigationStack {
                DeputiesList(deputies: page.items, isLoadingMore: false) {}
                    .safeAreaInset(edge: .top, spacing: 0) {
                        GroupFilter(groups: testGroups, selection: .constant(nil), selectedName: nil)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                    }
            },
            variant,
            height: 560
        )
    }

    /// The header and scorecard, from the recorded responses. They hold no
    /// link, so they need no navigation stack, which has no size of its own.
    @Test(arguments: Variant.all)
    func deputyProfile(_ variant: Variant) async throws {
        let full = try await LiveDeputiesServiceTests.service().profilePage(id: "PA1008")
        let page = DeputyProfilePage(
            profile: full.profile, scorecard: full.scorecard, recentVotes: nil, alignment: full.alignment
        )
        // The group, the département and the actions are links, so the
        // profile sits in a stack (outside one a link renders disabled),
        // sized explicitly.
        checkSnapshot(
            NavigationStack {
                ScrollView {
                    DeputyProfileContent(page: page, configuration: Self.configuration, onFollow: {}).padding(16)
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2980 : 1040
        )
    }

    /// Three recorded dissident votes, each with both positions.
    @Test(arguments: Variant.all)
    func dissidentVotes(_ variant: Variant) async throws {
        let votes = try await LiveDeputiesServiceTests.service().dissidentVotes(id: "PA1008")
        checkSnapshot(
            NavigationStack { DissidentVotesList(votes: votes) },
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 760
        )
    }

    /// Three recorded votes show every row case. Rows are links, so they sit
    /// in a stack (outside one a link renders disabled), sized explicitly, and
    /// in a scroll view as on the profile.
    @Test(arguments: Variant.all)
    func deputyRecentVotes(_ variant: Variant) async throws {
        let votes = try await LiveDeputiesServiceTests.service().recentVotes(id: "PA1008")
        checkSnapshot(
            NavigationStack {
                ScrollView { DeputyRecentVotesSection(votes: Array(votes.prefix(3))).padding(16) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1500 : 560
        )
    }

    /// A former deputy with no photo, whose scorecard and votes failed to
    /// load: no placeholder date, no broken image, no empty section.
    @Test(arguments: Variant.all)
    func deputyProfileEndedMandate(_ variant: Variant) {
        let profile = DeputyProfile(
            deputy: DeputyItem(
                id: "PA1", name: "Jean-Noël Barrot", group: nil, groupShort: nil,
                department: "Yvelines", circonscription: "2", photoURL: nil
            ),
            mandateStart: MonEluFormat.calendarDate("2024-07-07"),
            mandateEnd: MonEluFormat.calendarDate("2024-10-21")
        )
        // The constituency links to its département, so the profile sits in
        // a stack, sized explicitly.
        checkSnapshot(
            NavigationStack {
                ScrollView {
                    DeputyProfileContent(
                        page: DeputyProfilePage(profile: profile, scorecard: nil, recentVotes: nil),
                        configuration: Self.configuration
                    )
                    .padding(16)
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 900 : 340
        )
    }
}
