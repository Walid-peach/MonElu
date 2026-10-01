import MonEluCore
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Every shared component, in light and dark, at the default text size and at
/// an accessibility size (#447, ADR-041 §8). The reference images in
/// `__Snapshots__/` are what a reviewer who does not read Swift looks at.
///
/// A missing reference is recorded and the test fails once; commit the image
/// and re-run. A mismatch writes the failing and reference images to
/// `SNAPSHOT_ARTIFACTS` (the temporary directory by default).
@MainActor
@Suite(.snapshots(record: .missing))
struct ComponentSnapshotTests {
    struct Variant: CustomTestStringConvertible, Sendable {
        let name: String
        let style: UIUserInterfaceStyle
        let size: UIContentSizeCategory

        var testDescription: String { name }
    }

    nonisolated static let variants = [
        Variant(name: "light", style: .light, size: .large),
        Variant(name: "dark", style: .dark, size: .large),
        Variant(name: "light-ax", style: .light, size: .accessibilityExtraLarge),
        Variant(name: "dark-ax", style: .dark, size: .accessibilityExtraLarge),
    ]

    init() {
        Typography.registerFonts()
    }

    @Test(arguments: variants)
    func voteResultBadge(_ variant: Variant) {
        check(HStack(spacing: 8) {
            VoteResultBadge(result: "adopté")
            VoteResultBadge(result: "rejeté")
            VoteResultBadge(result: "retiré")
        }, variant)
    }

    @Test(arguments: variants)
    func votePositionBadge(_ variant: Variant) {
        check(HStack(spacing: 8) {
            VotePositionBadge(position: "pour")
            VotePositionBadge(position: "contre")
            VotePositionBadge(position: "abstention")
            VotePositionBadge(position: "nonVotant")
        }, variant)
    }

    @Test(arguments: variants)
    func card(_ variant: Variant) {
        check(Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Projet de loi de finances pour 2026")
                    .font(.headline)
                    .foregroundStyle(Palette.textPrimary)
                Text("Scrutin public du 21 juillet 2026")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                VoteResultBadge(result: "adopté")
            }
        }, variant)
    }

    @Test(arguments: variants)
    func sectionHeader(_ variant: Variant) {
        check(SectionHeader("Derniers scrutins", subtitle: "Les votes de la semaine à l'Assemblée"), variant)
    }

    @Test(arguments: variants)
    func loadingState(_ variant: Variant) {
        check(LoadingStateView().frame(height: 160), variant)
    }

    @Test(arguments: variants)
    func emptyState(_ variant: Variant) {
        check(EmptyStateView(title: "Aucun scrutin", message: "Aucun vote ne correspond à cette recherche.", systemImage: "magnifyingglass"), variant)
    }

    @Test(arguments: variants)
    func offlineState(_ variant: Variant) {
        check(FailureStateView(failure: .offline) {}, variant)
    }

    @Test(arguments: variants)
    func errorState(_ variant: Variant) {
        check(FailureStateView(failure: .server) {}, variant)
    }

    @Test(arguments: variants)
    func refreshFailureBanner(_ variant: Variant) {
        check(RefreshFailureBanner(failure: .offline), variant)
    }

    /// Initials only: a snapshot never reaches the network, which is also
    /// what a missing or failing photo shows.
    @Test(arguments: variants)
    func deputyPortrait(_ variant: Variant) {
        check(HStack(spacing: 12) {
            DeputyPortrait(name: "Audrey Abadie-Amiel", url: nil)
            DeputyPortrait(name: "Yaël Braun-Pivet", url: nil, size: 88)
        }, variant)
    }

    @Test(arguments: variants)
    func hemicycleChart(_ variant: Variant) {
        // 180 deputies across the chamber, positions cycling by group.
        let groups = ["LFI", "GDR", "ECS", "SOC", "LIOT", "DEM", "EPR", "HOR", "DR", "UDR", "RN", nil]
        let positions = ["contre", "contre", "contre", "abstention", "nonVotant", "pour", "pour", "pour", "pour", "contre", "pour", "nonVotant"]
        let deputies = (0..<180).map { i in
            Hemicycle.Deputy(id: "PA\(i)", name: "Député \(1000 + i)", group: groups[i % 12], position: positions[i % 12])
        }
        check(HemicycleChart(deputies: deputies), variant)
    }

    private func check<V: View>(_ view: V, _ variant: Variant, testName: String = #function) {
        let framed = view
            .padding(16)
            .frame(width: 390, alignment: .leading)
            .background(Palette.pageBackground)
            .environment(\.colorScheme, variant.style == .dark ? .dark : .light)
            .environment(\.dynamicTypeSize, DynamicTypeSize(variant.size) ?? .large)
        let traits = UITraitCollection { traits in
            traits.userInterfaceStyle = variant.style
            traits.preferredContentSizeCategory = variant.size
        }
        assertSnapshot(
            of: framed,
            as: .image(precision: 0.995, perceptualPrecision: 0.98, layout: .sizeThatFits, traits: traits),
            named: variant.name,
            testName: String(testName.prefix { $0 != "(" })
        )
    }
}
