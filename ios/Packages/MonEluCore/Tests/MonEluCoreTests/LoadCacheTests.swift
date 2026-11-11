import Foundation
@testable import MonEluCore
import Testing

private struct Boom: Error {}

/// Scripted results, consumed one per fetch, counting the fetches.
private final class Script<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<Value, any Error>]
    private var calls = 0
    init(_ results: [Result<Value, any Error>]) { self.results = results }
    var count: Int { lock.withLock { calls } }
    func next() throws -> Value {
        try lock.withLock {
            calls += 1
            return try results.removeFirst().get()
        }
    }
}

@MainActor
struct LoadCacheTests {
    @Test func returnsWhatWasStoredUnderTheKey() {
        let cache = LoadCache()
        cache.store([1, 2], for: "a")
        #expect(cache.value(for: "a", as: [Int].self) == [1, 2])
        #expect(cache.value(for: "b", as: [Int].self) == nil)
    }

    @Test func aValueOfAnotherTypeIsAMiss() {
        let cache = LoadCache()
        cache.store("text", for: "a")
        #expect(cache.value(for: "a", as: [Int].self) == nil)
    }

    @Test func dropsTheEntryUsedLongestAgoPastItsCapacity() {
        let cache = LoadCache(capacity: 2)
        cache.store(1, for: "a")
        cache.store(2, for: "b")
        _ = cache.value(for: "a", as: Int.self)
        cache.store(3, for: "c")
        #expect(cache.count == 2)
        #expect(cache.value(for: "a", as: Int.self) == 1)
        #expect(cache.value(for: "b", as: Int.self) == nil)
        #expect(cache.value(for: "c", as: Int.self) == 3)
    }

    @Test func disabledItKeepsAndReturnsNothing() {
        let cache = LoadCache()
        cache.isEnabled = false
        cache.store(1, for: "a")
        #expect(cache.value(for: "a", as: Int.self) == nil)
        cache.isEnabled = true
        #expect(cache.value(for: "a", as: Int.self) == nil)
    }
}

@MainActor
struct CachedLoaderTests {
    private func loader(
        _ script: Script<[Int]>, cache: LoadCache, key: String = "page"
    ) -> Loader<[Int]> {
        Loader(cacheKey: key, cache: cache, isEmpty: { $0.isEmpty }, fetch: { try script.next() })
    }

    @Test func theFirstVisitLoadsAndKeepsTheValue() async {
        let cache = LoadCache()
        let first = loader(Script([.success([1])]), cache: cache)
        #expect(first.state.isIdle)
        await first.loadIfNeeded()
        #expect(first.state.value == [1])
        #expect(cache.value(for: "page", as: [Int].self) == [1])
    }

    @Test func aSecondVisitStartsOnTheCachedValueThenShowsTheFreshOne() async {
        let cache = LoadCache()
        await loader(Script([.success([1])]), cache: cache).loadIfNeeded()

        let script = Script<[Int]>([.success([2])])
        let second = loader(script, cache: cache)
        // On screen before any fetch: no loading state.
        #expect(second.state.value == [1])
        #expect(script.count == 0)

        await second.loadIfNeeded()
        #expect(second.state.value == [2])
        #expect(cache.value(for: "page", as: [Int].self) == [2])

        // Fetched once behind the cached value, not on every later call.
        await second.loadIfNeeded()
        #expect(script.count == 1)
    }

    @Test func aFailedFetchBehindTheCachedValueKeepsItAndSaysWhy() async {
        let cache = LoadCache()
        cache.store([1], for: "page")
        let loader = loader(Script([.failure(URLError(.notConnectedToInternet))]), cache: cache)
        await loader.loadIfNeeded()
        #expect(loader.state.value == [1])
        #expect(loader.refreshFailure == .offline)
        #expect(cache.value(for: "page", as: [Int].self) == [1])
    }

    @Test func aCancelledFetchBehindTheCachedValueIsTriedAgainNextTime() async {
        let cache = LoadCache()
        cache.store([1], for: "page")
        let script = Script<[Int]>([.failure(CancellationError()), .success([2])])
        let loader = loader(script, cache: cache)
        await loader.loadIfNeeded()
        #expect(loader.state.value == [1])
        #expect(loader.refreshFailure == nil)
        await loader.loadIfNeeded()
        #expect(loader.state.value == [2])
    }

    @Test func aCachedEmptyValueShowsTheEmptyState() {
        let cache = LoadCache()
        cache.store([Int](), for: "page")
        #expect(loader(Script([]), cache: cache).state.isEmptyState)
    }

    @Test func screensWithDifferentKeysDoNotShareAValue() async {
        let cache = LoadCache()
        await loader(Script([.success([1])]), cache: cache, key: "a").loadIfNeeded()
        #expect(loader(Script([]), cache: cache, key: "b").state.isIdle)
    }

    @Test func aLoaderWithoutAKeyKeepsNothing() async {
        let script = Script<[Int]>([.success([1])])
        let loader = Loader(isEmpty: { $0.isEmpty }, fetch: { try script.next() })
        await loader.load()
        #expect(LoadCache.shared.count == 0)
    }

    /// A list whose criteria change: one value per key, and going back to
    /// criteria seen before shows their value while it is fetched again.
    @Test func loadShowsTheValueOfTheCurrentKey() async {
        let cache = LoadCache()
        let key = Key("all")
        let script = Script<[Int]>([.success([1]), .success([2]), .success([10])])
        let loader = Loader<[Int]>(
            cache: cache, key: { key.value }, isEmpty: { $0.isEmpty }, progressive: { _ in try script.next() }
        )
        await loader.load()
        key.value = "adopted"
        await loader.load()
        #expect(loader.state.value == [2])
        #expect(cache.value(for: "all", as: [Int].self) == [1])

        key.value = "all"
        await loader.load()
        #expect(loader.state.value == [10])
        #expect(cache.value(for: "all", as: [Int].self) == [10])
        #expect(cache.value(for: "adopted", as: [Int].self) == [2])
    }

    @Test func appendedPagesAreNotCached() async {
        let cache = LoadCache()
        let loader = loader(Script([.success([1])]), cache: cache)
        await loader.load()
        loader.update { $0 += [2] }
        #expect(loader.state.value == [1, 2])
        #expect(cache.value(for: "page", as: [Int].self) == [1])
    }
}

@MainActor
private final class Key {
    var value: String
    init(_ value: String) { self.value = value }
}

@MainActor
struct ProgressiveLoaderTests {
    @Test func aFirstLoadShowsEachPartThenTheWholeValue() async {
        let seen = Seen()
        let box = LoaderBox()
        let loader = Loader<[Int]>(cache: nil, key: { nil }, progressive: { part in
            await part([1])
            await seen.add(box.loader?.state.value)
            await part([1, 2])
            await seen.add(box.loader?.state.value)
            return [1, 2, 3]
        })
        box.loader = loader
        await loader.load()
        #expect(await seen.values == [[1], [1, 2]])
        #expect(loader.state.value == [1, 2, 3])
    }

    @Test func aRefreshNeverReplacesThePageWithAPart() async {
        let seen = Seen()
        let box = LoaderBox()
        let loader = Loader<[Int]>(cache: nil, key: { nil }, progressive: { part in
            await part([0])
            await seen.add(box.loader?.state.value)
            return [1, 2, 3]
        })
        box.loader = loader
        await loader.load()
        await loader.refresh()
        // During the refresh the whole page stayed on screen.
        #expect(await seen.values == [[0], [1, 2, 3]])
    }

    @Test func onlyTheWholeValueIsCached() async {
        let cache = LoadCache()
        let loader = Loader<[Int]>(cache: cache, key: { "page" }, progressive: { part in
            await part([1])
            throw Boom()
        })
        await loader.load()
        #expect(cache.count == 0)
        #expect(loader.state.failure == .server)
    }
}

@MainActor
private final class LoaderBox: Sendable {
    var loader: Loader<[Int]>?
}

private actor Seen {
    var values: [[Int]?] = []
    func add(_ value: [Int]?) { values.append(value) }
}
