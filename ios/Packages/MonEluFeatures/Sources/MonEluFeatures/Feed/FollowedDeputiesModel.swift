import Foundation
import MonEluCore
import Observation

/// What the follows row needs about each followed deputy (#585): who they are,
/// for their circle, and whether they voted since the circle was last opened,
/// for its red ring. The feed itself comes from `GET /feed`; this only dresses
/// the circles.
///
/// A circle works like a story (#692): its ring stays red, across launches,
/// until the user opens it with `markSeen`, which moves the reading position
/// to the newest vote and greys the ring. A vote after that position lights it
/// again. A first visit only sets the position, so a new follow starts grey.
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
    /// Where each ringed deputy's reading position moves when their circle is
    /// opened: the newest vote the ring stands for.
    private var pendingPosition: [String: Date] = [:]

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
                    pendingPosition[id] = summary.hasNews ? summary.position : nil
                case .failure(let error as DeputyNotFound):
                    store.unfollow(error.id)
                case .failure:
                    // Offline or a server error: try again on the next load.
                    started.remove(id)
                }
            }
        }
    }

    /// Opening a deputy's circle shows their votes: what the ring stood for is
    /// now seen, so the position moves to the newest of them and the ring goes
    /// grey. Nothing happens for a circle without a ring.
    public func markSeen(_ id: String) {
        guard let position = pendingPosition.removeValue(forKey: id) else { return }
        if position > (store.lastSeenVote(for: id) ?? .distantPast) {
            store.setLastSeenVote(position, for: id)
        }
        news.remove(id)
    }

    struct Summary: Sendable {
        let deputy: DeputyItem
        let hasNews: Bool
        /// Where opening the circle moves the reading position; nil without news.
        let position: Date?
    }

    /// One deputy's circle. A first visit sets the reading position (#463);
    /// after that it only moves in `markSeen`, so an unopened ring survives a
    /// relaunch.
    nonisolated static func summary(
        id: String, service: any DeputiesService, store: any FollowedDeputyStore, now: Date
    ) async throws -> Summary {
        let lastSeen = store.lastSeenVote(for: id)
        async let shown = shownVotes(id: id, lastSeen: lastSeen, service: service)
        let profile = try await service.profile(id: id)
        let votes = await shown
        let position = readingPosition(shown: votes, lastSeen: lastSeen, now: now)
        if lastSeen == nil, let position {
            store.setLastSeenVote(position, for: id)
        }
        let hasNews = lastSeen != nil && !(votes ?? []).isEmpty
        return Summary(deputy: profile.deputy, hasNews: hasNews, position: hasNews ? position : nil)
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
    /// when the votes failed to load: the newest vote shown, never earlier
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
