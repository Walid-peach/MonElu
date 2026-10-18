import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The follows row at the top of Accueil (#564) and its « Suivre » sheet,
/// in light and dark at the default and an accessibility text size.
@MainActor
@Suite(.snapshots(record: .missing))
struct FollowsSnapshotTests {
    let themes = (try? ReferenceData.themes()) ?? []

    func row(_ circles: [FollowCircle], filter: FeedFilter = .all) -> some View {
        FollowsRow(circles: circles, filter: .constant(filter), onAdd: {})
            .padding(.vertical, 12)
            .background(Palette.pageBackground)
    }

    func height(_ variant: Variant) -> CGFloat {
        variant.size.isAccessibilityCategory ? 420 : 140
    }

    /// Nothing followed yet: only the way to follow.
    @Test(arguments: Variant.all)
    func followsNothing(_ variant: Variant) {
        checkSnapshot(row([]), variant, height: height(variant))
    }

    @Test(arguments: Variant.all)
    func followsTheDeputyOnly(_ variant: Variant) {
        let circles = FollowCircle.circles(deputies: [.sample], themeSlugs: [], themes: themes)
        checkSnapshot(row(circles), variant, height: height(variant))
    }

    /// Two deputies and three themes, two with something new (the red ring),
    /// and the feed filtered to one of them.
    @Test(arguments: Variant.all)
    func followsDeputyAndThemes(_ variant: Variant) {
        let circles = FollowCircle.circles(
            deputies: [.sample, .sampleOther], themeSlugs: ["economie-budget", "justice-securite", "sante-social"],
            themes: themes, news: ["deputy:PA1008", "theme:economie-budget"]
        )
        checkSnapshot(row(circles, filter: .theme("justice-securite")), variant, height: height(variant))
    }

    @Test(arguments: Variant.all)
    func followsSheet(_ variant: Variant) {
        checkSnapshot(
            FollowsSheet(
                deputies: [.sample, .sampleOther], themes: themes, followed: ["justice-securite", "sante-social"],
                onToggle: { _ in }, onChooseDeputy: {}, onDone: {}
            ),
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 900
        )
    }
}
