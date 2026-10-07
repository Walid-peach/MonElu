import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Explorer (#488) in light and dark, at the default and an accessibility
/// text size: the contents page and each list, from recorded responses (the
/// groups from the schema, as `GET /groups` is new). Every view holds links,
/// so each sits in a stack.
@MainActor
@Suite(.snapshots(record: .missing))
struct ExploreSnapshotTests {
    static let configuration = AppConfiguration(
        minIOSVersion: "1.0.0",
        features: .init(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [
            .init(
                id: "bill_coverage",
                text: "Seuls les textes ayant au moins un scrutin enregistré ont une page."
            ),
        ]
    )

    @Test(arguments: Variant.all)
    func exploreHub(_ variant: Variant) async throws {
        let hub = await ExploreHub.load(
            deputies: try LiveDeputiesServiceTests.service(), lois: ExploreTests.lois(), groups: ExploreTests.groups(),
            followedDeputyID: "PA1008"
        )
        checkSnapshot(
            NavigationStack {
                ScrollView { ExploreContent(hub: hub).padding(.vertical, 12) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 3200 : 1100
        )
    }

    @Test(arguments: Variant.all)
    func votesList(_ variant: Variant) async throws {
        let model = VotesListModel(service: LiveVotesService(client: stubClient(try fixture("votes"))))
        await model.reload()
        model.wholeTextsOnly = true
        // The chips and the loaded list, as the screen stacks them, without
        // the screen's next-page load, which would show its spinner.
        checkSnapshot(
            NavigationStack {
                VStack(spacing: 0) {
                    VoteChips(model: model) {}.padding(.vertical, 6)
                    VotesList(votes: model.loader.state.value ?? [], isLoadingMore: false) {}
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2200 : 844
        )
    }

    @Test(arguments: Variant.all)
    func deputiesList(_ variant: Variant) async throws {
        let model = DeputiesListModel(service: try LiveDeputiesServiceTests.service(), followedDeputyID: "PA1008")
        await model.loadMyDepartment()
        await model.reload()
        checkSnapshot(
            NavigationStack {
                VStack(spacing: 0) {
                    DeputyChips(model: model) {}.padding(.vertical, 6)
                    DeputiesList(deputies: model.loader.state.value ?? [], total: model.total, isLoadingMore: false) {}
                }
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1800 : 844
        )
    }

    @Test(arguments: Variant.all)
    func loisList(_ variant: Variant) async throws {
        let list = try await ExploreTests.lois().lois()
        checkSnapshot(
            NavigationStack {
                ScrollView { LoisList(list: list).padding(16) }
                    .background(Palette.pageBackground)
                    .environment(\.appConfiguration, Self.configuration)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2000 : 760
        )
    }

    @Test(arguments: Variant.all)
    func departmentsList(_ variant: Variant) {
        checkSnapshot(
            NavigationStack {
                DepartmentsList(
                    departments: Array(DepartmentsListScreen.all.prefix(8)),
                    mine: DepartmentRef(code: "33", name: "Gironde")
                )
                .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 1600 : 700
        )
    }
}
