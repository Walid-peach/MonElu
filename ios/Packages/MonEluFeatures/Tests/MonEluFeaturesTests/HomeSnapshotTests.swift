import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Accueil and Explorer in light and dark, at the default and an
/// accessibility text size (#477), from responses recorded from the
/// production API. Views holding links sit in a stack, as in the app.
@MainActor
@Suite(.snapshots(record: .missing))
struct HomeSnapshotTests {
    func home(_ since: SinceLastVisit, offersQuestions: Bool = true) async throws -> some View {
        let service = try LiveDeputiesServiceTests.service()
        let home = MonDeputeHome(
            profile: try await service.profile(id: "PA1008"),
            recentVotes: try await service.recentVotes(id: "PA1008"),
            sinceLastVisit: since
        )
        return NavigationStack {
            ScrollView {
                HomeDeputyContent(home: home, offersQuestions: offersQuestions).padding(16)
            }
            .background(Palette.pageBackground)
        }
    }

    func height(_ variant: Variant) -> CGFloat {
        variant.size.isAccessibilityCategory ? 3600 : 1000
    }

    /// Every recorded vote was held after the previous visit: five new, the
    /// three shown marked.
    @Test(arguments: Variant.all)
    func homeWithNewVotes(_ variant: Variant) async throws {
        let recent = try await LiveDeputiesServiceTests.service().recentVotes(id: "PA1008")
        let view = try await home(.votes(recent, after: try APIDay.date("2026-07-20")))
        checkSnapshot(view, variant, height: height(variant))
    }

    /// Nothing new: the latest votes still show, under a line saying so.
    @Test(arguments: Variant.all)
    func homeNothingNew(_ variant: Variant) async throws {
        let view = try await home(.votes([], after: try APIDay.date("2026-07-21")), offersQuestions: false)
        checkSnapshot(view, variant, height: height(variant))
    }

    /// A first visit has nothing to compare with, and no "come back later".
    @Test(arguments: Variant.all)
    func homeFirstVisit(_ variant: Variant) async throws {
        checkSnapshot(try await home(.firstVisit), variant, height: height(variant))
    }

    /// The other states of the votes section: a failed list, and none yet.
    @Test(arguments: Variant.all)
    func recentVotesStates(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                VStack(alignment: .leading, spacing: 24) {
                    HomeRecentVotesSection(deputyID: "PA1008", votes: nil, since: .unavailable)
                    HomeRecentVotesSection(deputyID: "PA1008", votes: [], since: .firstVisit)
                }
                .padding(16)
                .frame(maxHeight: .infinity, alignment: .top)
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 900 : 360
        )
    }

    /// Before a deputy is chosen: the search, the Assembly's latest votes and
    /// the quiz, as `HomeScreen` lays them out.
    @Test(arguments: Variant.all)
    func homeBeforeChoosing(_ variant: Variant) async throws {
        let latest = try await LiveVotesService(client: stubClient(try fixture("votes"))).votes(VoteQuery())
        let view = NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HomeTagline()
                    PostalCodePickerContent(
                        postalCode: .constant(""), search: .idle, notice: nil, onSearch: {}, onChoose: { _ in }
                    )
                    HomeLatestVotesSection(
                        state: .loaded(Array(latest.items.prefix(HomeLatestVotesSection.count))), onRetry: {}
                    )
                    HomeQuizInvitation()
                }
                .padding(16)
            }
            .background(Palette.pageBackground)
        }
        checkSnapshot(view, variant, height: height(variant))
    }

    @Test(arguments: Variant.all)
    func latestVotesFailed(_ variant: Variant) {
        checkSnapshot(
            HomeLatestVotesSection(state: .failed(.offline), onRetry: {}).padding(16),
            variant
        )
    }

    /// Explorer on each segment, over lists already loaded.
    @Test(arguments: Variant.all)
    func exploreVotes(_ variant: Variant) async throws {
        let votes = VotesListModel(service: LiveVotesService(client: stubClient(try fixture("votes"))))
        await votes.reload()
        let deputies = DeputiesListModel(service: try LiveDeputiesServiceTests.service())
        checkSnapshot(
            NavigationStack { ExploreScreen(votes: votes, deputies: deputies, segment: .votes) },
            variant,
            height: 844
        )
    }

    @Test(arguments: Variant.all)
    func exploreDeputies(_ variant: Variant) async throws {
        let votes = VotesListModel(service: LiveVotesService(client: stubClient(try fixture("votes"))))
        let deputies = DeputiesListModel(service: try LiveDeputiesServiceTests.service())
        await deputies.reload()
        checkSnapshot(
            NavigationStack { ExploreScreen(votes: votes, deputies: deputies, segment: .deputies) },
            variant,
            height: 844
        )
    }
}
