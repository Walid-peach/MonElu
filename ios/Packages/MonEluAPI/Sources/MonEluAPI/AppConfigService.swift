import Foundation
import MonEluCore

/// Where the last fetched `AppConfiguration` is kept between launches.
public protocol AppConfigCache: Sendable {
    func load() -> AppConfiguration?
    func save(_ configuration: AppConfiguration)
}

/// `AppConfigCache` in `UserDefaults`, as JSON under one key.
public struct UserDefaultsAppConfigCache: AppConfigCache, @unchecked Sendable {
    // UserDefaults is documented as thread-safe; it is not marked Sendable.
    private let defaults: UserDefaults
    private let key: String

    public init(defaults: UserDefaults = .standard, key: String = "monelu.appConfiguration") {
        self.defaults = defaults
        self.key = key
    }

    public func load() -> AppConfiguration? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(AppConfiguration.self, from: $0) }
    }

    public func save(_ configuration: AppConfiguration) {
        if let data = try? JSONEncoder().encode(configuration) {
            defaults.set(data, forKey: key)
        }
    }
}

/// Loads the launch configuration (`GET /app/config`), falling back to the
/// last cached value and then to `AppConfiguration.defaults`, so a launch with
/// no network still opens the app (#448).
public struct AppConfigService: Sendable {
    private let fetch: @Sendable () async throws -> AppConfiguration
    private let cache: any AppConfigCache

    public init(client: Client, cache: any AppConfigCache = UserDefaultsAppConfigCache()) {
        self.init(fetch: { try await Self.fetch(from: client) }, cache: cache)
    }

    init(fetch: @escaping @Sendable () async throws -> AppConfiguration, cache: any AppConfigCache) {
        self.fetch = fetch
        self.cache = cache
    }

    /// What to show before the network answers: the cached value or defaults.
    public func cached() -> AppConfiguration {
        cache.load() ?? .defaults
    }

    /// The fresh configuration, cached for next time; the cached value or the
    /// defaults when the API cannot be reached or answers with an error.
    public func refresh() async -> AppConfiguration {
        do {
            let configuration = try await fetch()
            cache.save(configuration)
            return configuration
        } catch {
            return cached()
        }
    }

    enum FetchError: Error {
        case unexpectedResponse
    }

    static func fetch(from client: Client) async throws -> AppConfiguration {
        guard case .ok(let ok) = try await client.getAppConfig(),
              case .json(let body) = ok.body
        else { throw FetchError.unexpectedResponse }
        return AppConfiguration(body)
    }
}

extension AppConfiguration {
    /// The generated response type, as the app's own model.
    init(_ config: Components.Schemas.AppConfig) {
        self.init(
            minIOSVersion: config.minIosVersion,
            // A switch the API leaves out is on, as it is on the API's side.
            features: Features(chat: config.features.chat ?? true, verify: config.features.verify ?? true),
            dataHorizon: config.dataHorizon,
            caveats: (config.caveats ?? []).map { Caveat(id: $0.id, text: $0.text) },
            siteURL: config.siteUrl
        )
    }
}
