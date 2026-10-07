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
    /// The top of the followed deputy's home: their card with its two
    /// figures and their latest votes, from recorded responses. The rest of
    /// the home is `homeLowerSections`; one image of the whole home would pass
    /// the repository's 500 KB limit.
    func home(_ since: SinceLastVisit, offersQuestions: Bool = true) async throws -> some View {
        let service = try LiveDeputiesServiceTests.service()
        let home = MonDeputeHome(
            profile: try await service.profile(id: "PA1008"),
            recentVotes: try await service.recentVotes(id: "PA1008"),
            sinceLastVisit: since,
            scorecard: try await service.scorecard(id: "PA1008"),
            alignment: try await service.alignment(id: "PA1008")
        )
        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HomeTagline()
                    HomeIdentityCard(home: home)
                    HomeRecentVotesSection(
                        deputyID: home.profile.deputy.id, votes: home.recentVotes, since: home.sinceLastVisit
                    )
                }
                .padding(16)
            }
            .background(Palette.pageBackground)
        }
    }

    func height(_ variant: Variant) -> CGFloat {
        variant.size.isAccessibilityCategory ? 3600 : 1000
    }

    /// The rest of the followed deputy's home, in `HomeDeputyContent`'s order
    /// and in two images, each under the repository's 500 KB limit: the
    /// week's agenda, then the Assembly's latest votes (those after the
    /// previous visit marked) and the two invitations.
    @Test(arguments: Variant.all)
    func homeWeekAgenda(_ variant: Variant) async throws {
        let agenda = try await LiveAgendaService(client: stubClient(try fixture("agenda_week")))
            .week(from: "2026-09-28", to: "2026-10-04").days.flatMap(\.items)
        checkSnapshot(
            NavigationStack { lower { HomeAgendaSection(entries: agenda) } },
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 300
        )
    }

    @Test(arguments: Variant.all)
    func homeLatestVotes(_ variant: Variant) async throws {
        let latest = try await LiveVotesService(client: stubClient(try fixture("votes"))).votes(VoteQuery())
        let lastVisit = try APIDay.date("2026-07-20")
        checkSnapshot(
            NavigationStack {
                lower {
                    HomeLatestVotesSection(state: .loaded(latest.items), since: .votes([], after: lastVisit), onRetry: {})
                    HomeInvitations(offersQuestions: true)
                }
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2600 : 760
        )
    }

    private func lower<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) { content() }.padding(16)
        }
        .background(Palette.pageBackground)
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
        let lastVisit = try APIDay.date("2026-07-20")
        let view = NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    HomeTagline()
                    PostalCodePickerContent(
                        postalCode: .constant(""), search: .idle, notice: nil, onSearch: {}, onSelect: { _ in }
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
        checkSnapshot(view, variant, height: variant.size.isAccessibilityCategory ? 3600 : 1300)
    }

    /// The week with no séance, and the latest votes still loading.
    @Test(arguments: Variant.all)
    func agendaEmpty(_ variant: Variant) {
        checkSnapshot(NavigationStack { HomeAgendaSection(entries: []).padding(16) }, variant, height: 200)
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
