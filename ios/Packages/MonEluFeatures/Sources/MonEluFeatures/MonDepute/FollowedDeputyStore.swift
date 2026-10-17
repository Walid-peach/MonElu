import Foundation
import Observation

/// The deputy the user follows and how far they have read, kept on the
/// device only: there is no account (ADR-040 §6). The postal code used to
/// find the deputy is never part of it.
///
/// Observable, because several screens follow from the same store (Accueil,
/// a deputy's profile): a view or model reading `deputyID` must hear of a
/// follow made on another screen, not keep the value it read first (#576).
public protocol FollowedDeputyStore: AnyObject, Sendable, Observable {
    var deputyID: String? { get }
    func follow(_ deputyID: String)
    /// Stops following, and forgets that deputy's reading position.
    func clear()
    /// The `voted_at` of the newest vote already shown for this deputy.
    func lastSeenVote(for deputyID: String) -> Date?
    func setLastSeenVote(_ date: Date, for deputyID: String)
}

/// `FollowedDeputyStore` in `UserDefaults`, which survives relaunches.
///
/// `UserDefaults` stays the only copy of the value; the registrar only
/// reports reads and writes of `deputyID` to observers. The app holds one
/// instance (`AppServices.followedDeputy`): a second instance on the same
/// defaults would write the same value without telling the first one's
/// observers.
public final class UserDefaultsFollowedDeputyStore: FollowedDeputyStore, @unchecked Sendable {
    // UserDefaults and ObservationRegistrar are thread-safe; this class holds
    // no other state.
    private let defaults: UserDefaults
    private let registrar = ObservationRegistrar()

    static let deputyKey = "monelu.followedDeputyID"
    static let lastSeenPrefix = "monelu.lastSeenVoteAt."

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var deputyID: String? {
        registrar.access(self, keyPath: \.deputyID)
        return defaults.string(forKey: Self.deputyKey)
    }

    public func follow(_ deputyID: String) {
        registrar.withMutation(of: self, keyPath: \.deputyID) {
            defaults.set(deputyID, forKey: Self.deputyKey)
        }
    }

    public func clear() {
        registrar.withMutation(of: self, keyPath: \.deputyID) {
            if let deputyID = defaults.string(forKey: Self.deputyKey) {
                defaults.removeObject(forKey: Self.lastSeenPrefix + deputyID)
            }
            defaults.removeObject(forKey: Self.deputyKey)
        }
    }

    public func lastSeenVote(for deputyID: String) -> Date? {
        defaults.object(forKey: Self.lastSeenPrefix + deputyID) as? Date
    }

    public func setLastSeenVote(_ date: Date, for deputyID: String) {
        defaults.set(date, forKey: Self.lastSeenPrefix + deputyID)
    }
}

public extension FollowedDeputyStore {
    /// Follows `newID` in place of the current deputy, forgetting the
    /// previous one's reading position so a later return starts afresh.
    func switchTo(_ newID: String) {
        if let current = deputyID, current != newID { clear() }
        follow(newID)
    }
}
