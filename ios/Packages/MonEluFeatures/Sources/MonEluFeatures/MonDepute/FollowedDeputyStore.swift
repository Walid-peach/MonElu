import Foundation
import Observation

/// The deputies the user follows and how far they have read each one, kept on
/// the device only: there is no account (ADR-040 §6). The postal code used to
/// find a deputy is never part of it.
///
/// Several deputies can be followed, all equal, up to `FollowedDeputies.cap`
/// (ADR-042 amendment, #582). The list keeps the order they were followed in.
///
/// Observable, because several screens follow from the same store (Accueil,
/// a deputy's profile): a view or model reading `deputyIDs` must hear of a
/// follow made on another screen, not keep the value it read first (#576).
public protocol FollowedDeputyStore: AnyObject, Sendable, Observable {
    /// The followed deputies, in the order they were followed.
    var deputyIDs: [String] { get }
    /// Adds `deputyID` at the end of the list. Returns false, changing nothing,
    /// when the list is already at the cap; following a deputy already
    /// followed changes nothing and returns true.
    @discardableResult func follow(_ deputyID: String) -> Bool
    /// Stops following one deputy, and forgets their reading position.
    func unfollow(_ deputyID: String)
    /// The `voted_at` of the newest vote already shown for this deputy.
    func lastSeenVote(for deputyID: String) -> Date?
    func setLastSeenVote(_ date: Date, for deputyID: String)
}

/// The rule every store and screen shares.
public enum FollowedDeputies {
    /// The most deputies the app follows, the same cap `GET /feed` enforces
    /// (ADR-042 amendment §2).
    public static let cap = 10
}

public extension FollowedDeputyStore {
    /// The first followed deputy: what screens built for one deputy still show
    /// until they list them all (#585).
    var deputyID: String? { deputyIDs.first }

    func isFollowing(_ deputyID: String) -> Bool {
        deputyIDs.contains(deputyID)
    }

    /// Whether « Suivre » can add another deputy.
    var canFollowMore: Bool { deputyIDs.count < FollowedDeputies.cap }
}

/// `FollowedDeputyStore` in `UserDefaults`, which survives relaunches.
///
/// `UserDefaults` stays the only copy of the list; the registrar only reports
/// reads and writes of `deputyIDs` to observers. The app holds one instance
/// (`AppServices.followedDeputy`): a second instance on the same defaults
/// would write the same value without telling the first one's observers.
public final class UserDefaultsFollowedDeputyStore: FollowedDeputyStore, @unchecked Sendable {
    // UserDefaults and ObservationRegistrar are thread-safe; this class holds
    // no other state.
    private let defaults: UserDefaults
    private let registrar = ObservationRegistrar()

    static let deputiesKey = "monelu.followedDeputyIDs"
    /// The single deputy builds before #584 kept; moved into the list once.
    static let legacyDeputyKey = "monelu.followedDeputyID"
    static let lastSeenPrefix = "monelu.lastSeenVoteAt."

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        Self.migrate(defaults)
    }

    /// Moves a follow made before the list existed into it, so no install
    /// loses its deputy. Its reading position keeps its own key.
    static func migrate(_ defaults: UserDefaults) {
        guard let legacy = defaults.string(forKey: legacyDeputyKey) else { return }
        if defaults.stringArray(forKey: deputiesKey) == nil {
            defaults.set([legacy], forKey: deputiesKey)
        }
        defaults.removeObject(forKey: legacyDeputyKey)
    }

    public var deputyIDs: [String] {
        registrar.access(self, keyPath: \.deputyIDs)
        return stored
    }

    private var stored: [String] {
        defaults.stringArray(forKey: Self.deputiesKey) ?? []
    }

    @discardableResult
    public func follow(_ deputyID: String) -> Bool {
        let current = stored
        if current.contains(deputyID) { return true }
        guard current.count < FollowedDeputies.cap else { return false }
        registrar.withMutation(of: self, keyPath: \.deputyIDs) {
            defaults.set(current + [deputyID], forKey: Self.deputiesKey)
        }
        return true
    }

    public func unfollow(_ deputyID: String) {
        guard stored.contains(deputyID) else { return }
        registrar.withMutation(of: self, keyPath: \.deputyIDs) {
            defaults.set(stored.filter { $0 != deputyID }, forKey: Self.deputiesKey)
            defaults.removeObject(forKey: Self.lastSeenPrefix + deputyID)
        }
    }

    public func lastSeenVote(for deputyID: String) -> Date? {
        defaults.object(forKey: Self.lastSeenPrefix + deputyID) as? Date
    }

    public func setLastSeenVote(_ date: Date, for deputyID: String) {
        defaults.set(date, forKey: Self.lastSeenPrefix + deputyID)
    }
}
