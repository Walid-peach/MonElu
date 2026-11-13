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
        // Loading never moves the position: only opening the circle does.
        #expect(store.lastSeenVote(for: "PA2") == (try APIDay.date("2026-10-01")))
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-10-01")))
    }

    /// Opening a circle greys its ring and only its ring (#692).
    @Test func openingACircleGreysItsRingAlone() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1008")
        store.follow("PA2")
        for id in ["PA1008", "PA2"] { store.setLastSeenVote(try APIDay.date("2026-10-01"), for: id) }
        let service = FollowedDeputiesStub([.sample, .sampleOther])
        service.newVotes["PA1008"] = [vote("V0", day: "2026-10-10")]
        service.newVotes["PA2"] = [vote("V1", day: "2026-10-14")]
        let model = FollowedDeputiesModel(service: service, store: store)
        await model.load()
        #expect(model.news == ["PA1008", "PA2"])
        model.markSeen("PA2")
        #expect(model.news == ["PA1008"])
        #expect(store.lastSeenVote(for: "PA2") == (try APIDay.date("2026-10-14")))
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-10-01")))
    }

    /// An unopened ring is still red after a relaunch; an opened one is grey
    /// until a newer vote arrives (#692).
    @Test func aRingSurvivesRelaunchUntilOpenedThenReturnsOnANewVote() async throws {
        let defaults = freshDefaults()
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        store.follow("PA2")
        store.setLastSeenVote(try APIDay.date("2026-10-01"), for: "PA2")
        let service = FollowedDeputiesStub([.sampleOther])
        service.newVotes["PA2"] = [vote("V1", day: "2026-10-14")]

        let first = FollowedDeputiesModel(service: service, store: store)
        await first.load()
        #expect(first.news == ["PA2"])

        let relaunched = FollowedDeputiesModel(service: service, store: UserDefaultsFollowedDeputyStore(defaults: defaults))
        await relaunched.load()
        #expect(relaunched.news == ["PA2"])
        relaunched.markSeen("PA2")

        // The server now returns only votes after the stored position.
        let greyStore = UserDefaultsFollowedDeputyStore(defaults: defaults)
        service.newVotes["PA2"] = []
        let grey = FollowedDeputiesModel(service: service, store: greyStore)
        await grey.load()
        #expect(grey.news.isEmpty)

        service.newVotes["PA2"] = [vote("V2", day: "2026-10-20")]
        let again = FollowedDeputiesModel(service: service, store: UserDefaultsFollowedDeputyStore(defaults: defaults))
        await again.load()
        #expect(again.news == ["PA2"])
    }

    @Test func openingACircleWithoutARingChangesNothing() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1008")
        store.setLastSeenVote(try APIDay.date("2026-10-01"), for: "PA1008")
        let model = FollowedDeputiesModel(service: FollowedDeputiesStub([.sample]), store: store)
        await model.load()
        model.markSeen("PA1008")
        #expect(model.news.isEmpty)
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

/// Where the next visit's "since" starts (#463), now kept by the follows row.
struct FollowedDeputyReadingPositionTests {
    @Test func aFailedListKeepsThePosition() throws {
        let seen = try APIDay.date("2026-07-20")
        #expect(FollowedDeputiesModel.readingPosition(shown: nil, lastSeen: seen, now: Date()) == nil)
    }

    @Test func thePositionNeverGoesBack() throws {
        let seen = try APIDay.date("2026-07-20")
        let older = [vote("V1", day: "2026-07-10")]
        #expect(FollowedDeputiesModel.readingPosition(shown: older, lastSeen: seen, now: Date()) == seen)
    }

    /// A deputy with no vote yet starts from the start of today, so a
    /// scrutin held later today still counts as new.
    @Test func aDeputyWithNoVoteStartsFromToday() throws {
        let visit = try #require(ISO8601DateFormatter().date(from: "2026-07-21T15:00:00Z"))
        let position = FollowedDeputiesModel.readingPosition(shown: [], lastSeen: nil, now: visit)
        #expect(position == (try APIDay.date("2026-07-21")).addingTimeInterval(-1))
    }
}
