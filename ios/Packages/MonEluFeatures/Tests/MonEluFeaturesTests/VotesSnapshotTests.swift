import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The Votes tab's screens in light and dark, at the default and an
/// accessibility text size (#460). The detail is built from a response
/// recorded from the production API.
@MainActor
@Suite(.snapshots(record: .missing))
struct VotesSnapshotTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0",
        features: .init(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [
            .init(id: "non_votant", text: "`nonVotant` n'est pas `abstention`. Un non-votant était présent dans l'hémicycle sans exprimer de vote."),
            .init(id: "llm_generated", text: "Les résumés en langage clair sont générés par un LLM. Le scrutin d'origine fait foi."),
        ]
    )

    @Test(arguments: Variant.all)
    func voteRow(_ variant: Variant) {
        checkSnapshot(VoteRowView(vote: item("V1")).padding(16), variant)
    }

    @Test(arguments: Variant.all)
    func votesList(_ variant: Variant) {
        let votes = [
            item("V1"),
            item("V2", title: "l'amendement n° 12 de M. Dupont à l'article 3", result: "rejeté"),
            item("V3", title: "la motion de rejet préalable", result: nil),
        ]
        // In a stack, as in the app: a NavigationLink outside one renders disabled.
        checkSnapshot(NavigationStack { VotesList(votes: votes, isLoadingMore: false) {} }, variant, height: 640)
    }

    @Test(arguments: Variant.all)
    func votesListNextPageFailed(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                VotesList(votes: [item("V1")], isLoadingMore: false, loadMoreFailure: .offline) {}
            },
            variant,
            height: 420
        )
    }

    @Test(arguments: Variant.all)
    func voteDetail(_ variant: Variant) async throws {
        let full = try await LiveVotesService(client: stubClient(try fixture("vote_detail"))).vote(id: "VTANR5L17V8434")
        // Two groups show both bar cases (one position, and several with
        // non-votants) and keep the image under the repository's size limit.
        let groups = Set(full.positionsByGroup.prefix(2).map(\.group))
        let vote = VoteDetail(
            item: full.item, votesFor: full.votesFor, votesAgainst: full.votesAgainst, abstentions: full.abstentions,
            positions: full.positions.filter { groups.contains($0.group ?? GroupPositions.nonInscrit) },
            dossierTitle: full.dossierTitle, dossierURL: full.dossierURL,
            totalVoters: full.totalVoters, dossierID: full.dossierID, dossierStatus: full.dossierStatus
        )
        // The theme and the bill are links, so the page sits in a stack
        // (outside one a link renders disabled), sized explicitly. The
        // first deputy listed stands for the one the user follows.
        checkSnapshot(
            NavigationStack {
                ScrollView {
                    VoteDetailContent(
                        vote: vote, configuration: Self.configuration, followedDeputyID: vote.positions.first?.deputyID
                    )
                    .padding(16)
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 4140 : 1450
        )
    }
}
