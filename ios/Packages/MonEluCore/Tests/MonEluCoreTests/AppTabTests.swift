import MonEluCore
import Testing

struct AppTabTests {
    @Test func tabsAreInTabBarOrder() {
        #expect(AppTab.allCases.map(\.title) == ["Mon député", "Députés", "Votes", "Demander", "Quiz"])
    }

    @Test func identifiersAreUnique() {
        let ids = AppTab.allCases.map(\.id)
        #expect(Set(ids).count == ids.count)
    }
}
