import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// Each detail screen's loading placeholder (#699): its own content view over
/// `PagePlaceholders`, under `.skeleton()`, as `LoadStateView` shows it once a
/// first load has run for 200 ms. Only the top of a page is pinned: that is
/// what must not move when the content replaces the placeholder.
@MainActor
@Suite(.snapshots(record: .missing))
struct PlaceholderSnapshotTests {
    let configuration = AppConfiguration.defaults

    @Test(arguments: Variant.all)
    func votePlaceholder(_ variant: Variant) {
        check(VoteDetailContent(vote: PagePlaceholders.vote, configuration: configuration).padding(Spacing.m), variant)
    }

    @Test(arguments: Variant.all)
    func deputyPlaceholder(_ variant: Variant) {
        check(
            DeputyProfileContent(page: PagePlaceholders.deputy, configuration: configuration).padding(Spacing.m),
            variant
        )
    }

    @Test(arguments: Variant.all)
    func loiPlaceholder(_ variant: Variant) {
        check(
            LoiContent(page: PagePlaceholders.loi, configuration: configuration, today: PagePlaceholders.date)
                .padding(Spacing.m),
            variant
        )
    }

    @Test(arguments: Variant.all)
    func loisPlaceholder(_ variant: Variant) {
        check(LoisList(list: PagePlaceholders.lois).padding(Spacing.m), variant)
    }

    @Test(arguments: Variant.all)
    func groupPlaceholder(_ variant: Variant) {
        check(
            GroupContent(group: PagePlaceholders.group, configuration: configuration).padding(.vertical, Spacing.m),
            variant
        )
    }

    @Test(arguments: Variant.all)
    func departmentPlaceholder(_ variant: Variant) {
        check(DepartmentContent(department: PagePlaceholders.department).padding(.vertical, Spacing.m), variant)
    }

    @Test(arguments: Variant.all)
    func themePlaceholder(_ variant: Variant) {
        check(
            ThemeContent(theme: PagePlaceholders.theme, configuration: configuration).padding(.vertical, Spacing.m),
            variant
        )
    }

    @Test(arguments: Variant.all)
    func agendaPlaceholder(_ variant: Variant) {
        check(
            AgendaWeekContent(week: PagePlaceholders.agenda, theme: .constant(nil)).padding(.vertical, Spacing.xs),
            variant
        )
    }

    /// In a stack, as in the app (a link outside one renders dimmed), cut to
    /// the top of the page.
    private func check<V: View>(
        _ view: V, _ variant: Variant, testName: String = #function
    ) {
        checkSnapshot(
            NavigationStack { ScrollView { view.skeleton() }.background(Palette.pageBackground) },
            variant, height: variant.size.isAccessibilityCategory ? 1600 : 900, testName: testName
        )
    }
}
