import Foundation

/// The deputy the user follows and how far they have read, kept on the
/// device only: there is no account (ADR-040 §6). The postal code used to
/// find the deputy is never part of it.
public protocol FollowedDeputyStore: AnyObject, Sendable {
    var deputyID: String? { get }
    func follow(_ deputyID: String)
    /// Stops following, and forgets that deputy's reading position.
    func clear()
    /// The `voted_at` of the newest vote already shown for this deputy.
    func lastSeenVote(for deputyID: String) -> Date?
    func setLastSeenVote(_ date: Date, for deputyID: String)
}

/// `FollowedDeputyStore` in `UserDefaults`, which survives relaunches.
public final class UserDefaultsFollowedDeputyStore: FollowedDeputyStore, @unchecked Sendable {
    // UserDefaults is thread-safe; this class holds no other state.
    private let defaults: UserDefaults

    static let deputyKey = "monelu.followedDeputyID"
    static let lastSeenPrefix = "monelu.lastSeenVoteAt."

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var deputyID: String? {
        defaults.string(forKey: Self.deputyKey)
    }

    public func follow(_ deputyID: String) {
        defaults.set(deputyID, forKey: Self.deputyKey)
    }

    public func clear() {
        if let deputyID {
            defaults.removeObject(forKey: Self.lastSeenPrefix + deputyID)
        }
        defaults.removeObject(forKey: Self.deputyKey)
    }

    public func lastSeenVote(for deputyID: String) -> Date? {
        defaults.object(forKey: Self.lastSeenPrefix + deputyID) as? Date
    }

    public func setLastSeenVote(_ date: Date, for deputyID: String) {
        defaults.set(date, forKey: Self.lastSeenPrefix + deputyID)
    }
}
