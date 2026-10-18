import Foundation
import MonEluCore

/// The themes the user follows, kept on the device only, beside the
/// followed deputy (ADR-042 §2): nothing about a follow reaches the API
/// except as a query parameter of the feed, and there is no account.
public protocol FollowedThemesStore: AnyObject, Sendable {
    /// Followed theme slugs, in the order they were followed.
    var themeSlugs: [String] { get }
    /// Follows a theme. A slug `themes.json` does not know is ignored, so the
    /// feed is never sent one the API would refuse.
    func follow(_ slug: String)
    /// Stops following, and forgets that theme's reading position.
    func unfollow(_ slug: String)
    /// When the user last saw this theme's items, for the "something new" ring.
    func lastSeen(theme slug: String) -> Date?
    func setLastSeen(_ date: Date, theme slug: String)
}

public extension FollowedThemesStore {
    func isFollowing(_ slug: String) -> Bool { themeSlugs.contains(slug) }

    func toggle(_ slug: String) {
        if isFollowing(slug) { unfollow(slug) } else { follow(slug) }
    }
}

/// `FollowedThemesStore` in `UserDefaults`, which survives relaunches.
public final class UserDefaultsFollowedThemesStore: FollowedThemesStore, @unchecked Sendable {
    // UserDefaults is thread-safe; `known` never changes after init.
    private let defaults: UserDefaults
    private let known: Set<String>

    static let themesKey = "monelu.followedThemes"
    static let lastSeenPrefix = "monelu.themeLastSeenAt."

    /// `known` defaults to the bundled `themes.json`, the slugs the API accepts.
    public init(defaults: UserDefaults = .standard, known: Set<String>? = nil) {
        self.defaults = defaults
        self.known = known ?? Set(((try? ReferenceData.themes()) ?? []).map(\.slug))
    }

    public var themeSlugs: [String] {
        // A slug dropped from `themes.json` by a later release disappears
        // rather than turning every feed request into a 422.
        (defaults.stringArray(forKey: Self.themesKey) ?? []).filter(known.contains)
    }

    public func follow(_ slug: String) {
        guard known.contains(slug), !isFollowing(slug) else { return }
        defaults.set(themeSlugs + [slug], forKey: Self.themesKey)
    }

    public func unfollow(_ slug: String) {
        defaults.set(themeSlugs.filter { $0 != slug }, forKey: Self.themesKey)
        defaults.removeObject(forKey: Self.lastSeenPrefix + slug)
    }

    public func lastSeen(theme slug: String) -> Date? {
        defaults.object(forKey: Self.lastSeenPrefix + slug) as? Date
    }

    public func setLastSeen(_ date: Date, theme slug: String) {
        defaults.set(date, forKey: Self.lastSeenPrefix + slug)
    }
}
