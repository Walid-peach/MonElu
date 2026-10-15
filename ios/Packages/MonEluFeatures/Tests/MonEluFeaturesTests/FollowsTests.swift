import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The followed themes stay on the device and only hold slugs the API knows
/// (#564, ADR-042 §2).
struct FollowedThemesStoreTests {
    let known: Set<String> = ["sante-social", "justice-securite", "economie-budget"]

    @Test func followsInOrderAndOnce() {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults(), known: known)
        store.follow("justice-securite")
        store.follow("sante-social")
        store.follow("justice-securite")
        #expect(store.themeSlugs == ["justice-securite", "sante-social"])
        #expect(store.isFollowing("sante-social"))
    }

    @Test func anUnknownSlugIsIgnored() {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults(), known: known)
        store.follow("budget")
        #expect(store.themeSlugs.isEmpty)
    }

    @Test func unfollowForgetsTheReadingPosition() {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults(), known: known)
        store.follow("sante-social")
        store.setLastSeen(Date(timeIntervalSince1970: 1_000), theme: "sante-social")
        store.unfollow("sante-social")
        #expect(store.themeSlugs.isEmpty)
        #expect(store.lastSeen(theme: "sante-social") == nil)
    }

    @Test func toggleFollowsThenUnfollows() {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults(), known: known)
        store.toggle("economie-budget")
        #expect(store.themeSlugs == ["economie-budget"])
        store.toggle("economie-budget")
        #expect(store.themeSlugs.isEmpty)
    }

    /// A relaunch reads the same follows back.
    @Test func followsSurviveARelaunch() {
        let defaults = freshDefaults()
        UserDefaultsFollowedThemesStore(defaults: defaults, known: known).follow("sante-social")
        #expect(UserDefaultsFollowedThemesStore(defaults: defaults, known: known).themeSlugs == ["sante-social"])
    }

    /// A slug a later `themes.json` no longer carries drops out instead of
    /// making every feed request a 422.
    @Test func aSlugNoLongerKnownDropsOut() {
        let defaults = freshDefaults()
        UserDefaultsFollowedThemesStore(defaults: defaults, known: known).follow("sante-social")
        #expect(UserDefaultsFollowedThemesStore(defaults: defaults, known: ["justice-securite"]).themeSlugs.isEmpty)
    }

    /// By default the store knows exactly the bundled themes.
    @Test func theDefaultKnowsTheBundledThemes() throws {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults())
        for theme in try ReferenceData.themes() { store.follow(theme.slug) }
        #expect(store.themeSlugs == (try ReferenceData.themes()).map(\.slug))
    }
}

struct FollowCircleTests {
    /// The bundled table, which `FollowCircle.circles` is given in the app.
    let themes = (try? ReferenceData.themes()) ?? []

    @Test func theDeputyComesFirstThenThemesInFollowOrder() {
        let deputy = DeputyItem.sample
        let circles = FollowCircle.circles(
            deputy: deputy, themeSlugs: ["justice-securite", "sante-social"], themes: themes,
            news: ["theme:sante-social"]
        )
        #expect(circles.map(\.id) == ["deputy", "theme:justice-securite", "theme:sante-social"])
        #expect(circles.map(\.hasNews) == [false, false, true])
        #expect(circles.map(\.filter) == [.deputy, .theme("justice-securite"), .theme("sante-social")])
    }

    @Test func aSlugWithoutATableEntryHasNoCircle() {
        let circles = FollowCircle.circles(deputy: nil, themeSlugs: ["budget"], themes: themes)
        #expect(circles.isEmpty)
    }

    @Test func everyBundledThemeHasItsOwnSymbol() throws {
        let symbols = try ReferenceData.themes().map { ThemeSymbol.name(for: $0.slug) }
        #expect(!symbols.contains("tag"))
        #expect(Set(symbols).count == symbols.count)
    }
}

extension DeputyItem {
    static let sample = DeputyItem(
        id: "PA1008", name: "Nadège Abomangoli", group: "La France insoumise - Nouveau Front Populaire",
        groupShort: "LFI", department: "Seine-Saint-Denis", circonscription: "10", photoURL: nil, lastName: "Abomangoli"
    )
}
