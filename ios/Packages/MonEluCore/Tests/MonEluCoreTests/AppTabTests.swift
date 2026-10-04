import MonEluCore
import Testing

struct AppTabTests {
    @Test func tabsAreInTabBarOrder() {
        #expect(AppTab.allCases.map(\.title) == ["Accueil", "Explorer", "Quiz", "Demander"])
    }

    @Test func identifiersAreUnique() {
        let ids = AppTab.allCases.map(\.id)
        #expect(Set(ids).count == ids.count)
    }
}
