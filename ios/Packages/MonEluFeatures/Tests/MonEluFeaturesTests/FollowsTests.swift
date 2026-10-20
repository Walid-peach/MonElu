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

    /// A theme lights up only for a scrutin after the last one its filter
    /// showed, and never on the visit it is first seen (#573).
    @Test func aThemeLightsUpOnlyForAScrutinAfterTheLastSeen() {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults(), known: known)
        store.follow("justice-securite")
        store.follow("sante-social")
        let first = Date(timeIntervalSince1970: 1_000)
        let later = Date(timeIntervalSince1970: 2_000)

        store.startReading(latest: ["justice-securite": first])
        #expect(store.themesWithNews(latest: ["justice-securite": first]).isEmpty)
        #expect(store.lastSeen(theme: "sante-social") == nil)

        #expect(store.themesWithNews(latest: ["justice-securite": later]) == ["justice-securite"])
        // A later load does not move a position already started.
        store.startReading(latest: ["justice-securite": later])
        #expect(store.lastSeen(theme: "justice-securite") == first)

        store.markSeen("justice-securite", latest: ["justice-securite": later])
        #expect(store.themesWithNews(latest: ["justice-securite": later]).isEmpty)
        // Seeing an older report never moves the position back.
        store.markSeen("justice-securite", latest: ["justice-securite": first])
        #expect(store.lastSeen(theme: "justice-securite") == later)
    }

    @Test func aThemeNoLongerFollowedNeverLightsUp() {
        let store = UserDefaultsFollowedThemesStore(defaults: freshDefaults(), known: known)
        store.follow("sante-social")
        store.setLastSeen(Date(timeIntervalSince1970: 1_000), theme: "sante-social")
        store.unfollow("sante-social")
        #expect(store.themesWithNews(latest: ["sante-social": Date(timeIntervalSince1970: 2_000)]).isEmpty)
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

    @Test func theDeputiesComeFirstThenThemesInFollowOrder() {
        let circles = FollowCircle.circles(
            deputies: [.sample, .sampleOther], themeSlugs: ["justice-securite", "sante-social"], themes: themes,
            news: ["deputy:PA2", "theme:sante-social"]
        )
        #expect(circles.map(\.id) == [
            "deputy:PA1008", "deputy:PA2", "theme:justice-securite", "theme:sante-social",
        ])
        #expect(circles.map(\.hasNews) == [false, true, false, true])
        #expect(circles.map(\.filter) == [
            .deputy("PA1008"), .deputy("PA2"), .theme("justice-securite"), .theme("sante-social"),
        ])
        // Each deputy under their own name: all follows are equal.
        #expect(circles.prefix(2).map(\.label) == ["Nadège Abomangoli", "Marie Dupont"])
    }

    @Test func aSlugWithoutATableEntryHasNoCircle() {
        let circles = FollowCircle.circles(deputies: [], themeSlugs: ["budget"], themes: themes)
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

    static let sampleOther = DeputyItem(
        id: "PA2", name: "Marie Dupont", group: "Ensemble pour la République",
        groupShort: "EPR", department: "Gironde", circonscription: "1", photoURL: nil, lastName: "Dupont"
    )
}
