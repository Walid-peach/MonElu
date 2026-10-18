import Foundation
import MonEluCore
import Observation

/// What the follows row needs about each followed deputy (#585): who they are,
/// for their circle, and whether they voted since the last visit, for its red
/// ring. The feed itself comes from `GET /feed`; this only dresses the circles.
///
/// Each deputy costs two requests, once per launch: the profile, and either
/// the votes since the reading position or, on a first visit, the recent
/// votes that set it. That stays light at the cap of ten, where loading every
/// followed deputy's full home would not.
@MainActor
@Observable
public final class FollowedDeputiesModel {
    /// The loaded deputies, keyed by id; a deputy still loading is absent.
    public private(set) var deputies: [String: DeputyItem] = [:]
    /// The ids of deputies with votes since the last visit.
    public private(set) var news: Set<String> = []

    private let service: any DeputiesService
    private let store: any FollowedDeputyStore
    private var started: Set<String> = []

    public init(service: any DeputiesService, store: any FollowedDeputyStore) {
        self.service = service
        self.store = store
    }

    /// The followed deputies that have loaded, in the followed order.
    public var loaded: [DeputyItem] {
        store.deputyIDs.compactMap { deputies[$0] }
    }

    /// Loads every followed deputy not loaded yet, side by side. A deputy the
    /// API no longer knows is unfollowed, so `GET /feed`, which answers 404
    /// for the whole set, works again.
    public func load(now: Date = Date()) async {
        let pending = store.deputyIDs.filter { !started.contains($0) }
        started.formUnion(pending)
        let service = service, store = store
        await withTaskGroup(of: (String, Result<Summary, Error>).self) { group in
            for id in pending {
                group.addTask {
                    do {
                        return (id, .success(try await Self.summary(id: id, service: service, store: store, now: now)))
                    } catch {
                        return (id, .failure(error))
                    }
                }
            }
            for await (id, result) in group {
                switch result {
                case .success(let summary):
                    deputies[id] = summary.deputy
                    if summary.hasNews { news.insert(id) } else { news.remove(id) }
                case .failure(let error as DeputyNotFound):
                    store.unfollow(error.id)
                case .failure:
                    // Offline or a server error: try again on the next load.
                    started.remove(id)
                }
            }
        }
    }

    struct Summary: Sendable {
        let deputy: DeputyItem
        let hasNews: Bool
    }

    /// One deputy's circle, and the reading position moved to the newest vote
    /// it looked at, as Accueil's deputy home does (#463).
    nonisolated static func summary(
        id: String, service: any DeputiesService, store: any FollowedDeputyStore, now: Date
    ) async throws -> Summary {
        let lastSeen = store.lastSeenVote(for: id)
        async let shown = shownVotes(id: id, lastSeen: lastSeen, service: service)
        let profile = try await service.profile(id: id)
        let votes = await shown
        if let position = readingPosition(shown: votes, lastSeen: lastSeen, now: now) {
            store.setLastSeenVote(position, for: id)
        }
        let hasNews = lastSeen != nil && !(votes ?? []).isEmpty
        return Summary(deputy: profile.deputy, hasNews: hasNews)
    }

    /// The votes since the reading position, or the recent ones on a first
    /// visit; nil when the request fails.
    nonisolated static func shownVotes(
        id: String, lastSeen: Date?, service: any DeputiesService
    ) async -> [DeputyVote]? {
        if let lastSeen { return try? await service.votes(id: id, since: lastSeen) }
        return try? await service.recentVotes(id: id)
    }

    /// Where the next visit's "since" starts, or nil to keep the current one
    /// when the votes failed to load. Same rule as
    /// `MonDeputeModel.readingPosition`: the newest vote shown, never earlier
    /// than the current position.
    nonisolated static func readingPosition(shown: [DeputyVote]?, lastSeen: Date?, now: Date) -> Date? {
        guard let shown else { return nil }
        if let newest = shown.compactMap(\.date).max() { return max(newest, lastSeen ?? newest) }
        if let lastSeen { return lastSeen }
        // A deputy with no vote yet: from the start of today (scrutin dates
        // are midnight UTC), so a scrutin held later today still counts.
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.startOfDay(for: now).addingTimeInterval(-1)
    }
}
