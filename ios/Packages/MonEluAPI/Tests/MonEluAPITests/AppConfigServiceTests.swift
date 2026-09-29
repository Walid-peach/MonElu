import Foundation
@testable import MonEluAPI
import MonEluCore
import Testing

private final class MemoryCache: AppConfigCache, @unchecked Sendable {
    private let lock = NSLock()
    private var stored: AppConfiguration?

    init(_ stored: AppConfiguration? = nil) { self.stored = stored }
    func load() -> AppConfiguration? { lock.withLock { stored } }
    func save(_ configuration: AppConfiguration) { lock.withLock { stored = configuration } }
}

private struct Offline: Error {}

private func configuration(minimum: String, chat: Bool = true) -> AppConfiguration {
    AppConfiguration(
        minIOSVersion: minimum,
        features: .init(chat: chat, verify: true),
        dataHorizon: "2025-07-01",
        caveats: [.init(id: "non_votant", text: "…")]
    )
}

struct AppConfigServiceTests {
    @Test func freshValueIsReturnedAndCached() async {
        let cache = MemoryCache()
        let fresh = configuration(minimum: "1.2.0", chat: false)
        let service = AppConfigService(fetch: { fresh }, cache: cache)

        #expect(await service.refresh() == fresh)
        #expect(cache.load() == fresh)
        #expect(service.cached() == fresh)
    }

    @Test func offlineFallsBackToTheLastCachedValue() async {
        let cached = configuration(minimum: "1.1.0")
        let service = AppConfigService(fetch: { throw Offline() }, cache: MemoryCache(cached))

        #expect(await service.refresh() == cached)
    }

    @Test func offlineWithNoCacheFallsBackToDefaults() async {
        let service = AppConfigService(fetch: { throw Offline() }, cache: MemoryCache())

        #expect(await service.refresh() == .defaults)
        #expect(service.cached() == .defaults)
    }

    @Test func failedFetchDoesNotOverwriteTheCache() async {
        let cached = configuration(minimum: "1.1.0")
        let cache = MemoryCache(cached)
        _ = await AppConfigService(fetch: { throw Offline() }, cache: cache).refresh()
        #expect(cache.load() == cached)
    }

    @Test func userDefaultsCacheRoundTrips() throws {
        let suite = "monelu.tests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let cache = UserDefaultsAppConfigCache(defaults: defaults)

        #expect(cache.load() == nil)
        cache.save(configuration(minimum: "2.0.0"))
        #expect(cache.load() == configuration(minimum: "2.0.0"))
    }

    @Test func generatedResponseMapsToTheAppModel() {
        let generated = Components.Schemas.AppConfig(
            minIosVersion: "1.0.0",
            features: .init(chat: false, verify: nil),
            dataHorizon: "2025-07-01",
            caveats: [.init(id: "vote_result", text: "Repris tel quel.")]
        )
        let mapped = AppConfiguration(generated)
        #expect(mapped.minIOSVersion == "1.0.0")
        #expect(mapped.features == .init(chat: false, verify: true))
        #expect(mapped.caveats.map(\.id) == ["vote_result"])
    }
}
