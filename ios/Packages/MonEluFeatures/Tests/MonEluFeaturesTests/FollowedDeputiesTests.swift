import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// A `DeputiesService` answering each deputy's profile by id, with scripted
/// votes since the reading position.
final class FollowedDeputiesStub: DeputiesService, @unchecked Sendable {
    private let lock = NSLock()
    var known: [String: DeputyItem]
    var newVotes: [String: [DeputyVote]] = [:]
    var recent: [DeputyVote] = []
    private var profileCalls: [String] = []

    init(_ deputies: [DeputyItem]) {
        known = Dictionary(uniqueKeysWithValues: deputies.map { ($0.id, $0) })
    }

    var profilesLoaded: [String] { lock.withLock { profileCalls } }

    func deputies(_ query: DeputyQuery) async throws -> DeputyPage { DeputyPage(items: [], total: 0, offset: 0) }
    func profile(id: String) async throws -> DeputyProfile {
        lock.withLock { profileCalls.append(id) }
        guard let deputy = known[id] else { throw DeputyNotFound(id: id) }
        return DeputyProfile(deputy: deputy, mandateStart: nil, mandateEnd: nil)
    }
    func scorecard(id: String) async throws -> DeputyScorecard { throw URLError(.badServerResponse) }
    func recentVotes(id: String) async throws -> [DeputyVote] { recent }
    func votes(id: String, since: Date) async throws -> [DeputyVote] { newVotes[id] ?? [] }
    func departmentDeputies(code: String) async throws -> [DeputyItem] { [] }
}

/// The follows row's deputies (#585): one circle per followed deputy, its red
/// ring from that deputy's own reading position.
@MainActor
struct FollowedDeputiesModelTests {
    @Test func everyFollowedDeputyLoadsInTheFollowedOrder() async {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA2")
        store.follow("PA1008")
        let model = FollowedDeputiesModel(service: FollowedDeputiesStub([.sample, .sampleOther]), store: store)
        await model.load()
        #expect(model.loaded.map(\.id) == ["PA2", "PA1008"])
    }

    @Test func eachDeputyLoadsOncePerLaunch() async {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1008")
        let service = FollowedDeputiesStub([.sample, .sampleOther])
        let model = FollowedDeputiesModel(service: service, store: store)
        await model.load()
        store.follow("PA2")
        await model.load()
        #expect(service.profilesLoaded == ["PA1008", "PA2"])
    }

    /// The ring shows votes since the last visit, per deputy; a first visit
    /// has none and sets the reading position.
    @Test func theRingIsPerDeputy() async throws {
        let defaults = freshDefaults()
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        store.follow("PA1008")
        store.follow("PA2")
        store.setLastSeenVote(try APIDay.date("2026-10-01"), for: "PA1008")
        store.setLastSeenVote(try APIDay.date("2026-10-01"), for: "PA2")
        let service = FollowedDeputiesStub([.sample, .sampleOther])
        service.newVotes["PA2"] = [vote("V1", day: "2026-10-14")]
        let model = FollowedDeputiesModel(service: service, store: store)
        await model.load()
        #expect(model.news == ["PA2"])
        #expect(store.lastSeenVote(for: "PA2") == (try APIDay.date("2026-10-14")))
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-10-01")))
    }

    @Test func aFirstVisitHasNoRingAndSetsThePosition() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1008")
        let service = FollowedDeputiesStub([.sample])
        service.recent = [vote("V1", day: "2026-10-14"), vote("V0", day: "2026-10-13")]
        let model = FollowedDeputiesModel(service: service, store: store)
        await model.load()
        #expect(model.news.isEmpty)
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-10-14")))
    }

    /// A deputy the API no longer knows is unfollowed, since `GET /feed`
    /// answers 404 for the whole set while they stay in it.
    @Test func aDeputyWhoDisappearedIsUnfollowed() async {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1008")
        store.follow("PA0")
        let model = FollowedDeputiesModel(service: FollowedDeputiesStub([.sample]), store: store)
        await model.load()
        #expect(store.deputyIDs == ["PA1008"])
        #expect(model.loaded.map(\.id) == ["PA1008"])
    }
}
