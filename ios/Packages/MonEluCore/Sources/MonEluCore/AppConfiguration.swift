import Foundation

/// What the app reads from `GET /app/config` at launch (ADR-041 §5).
///
/// The app keeps the last value it fetched and falls back to `defaults` when it
/// has none, so a launch without network never blocks and never loses the
/// caveats.
public struct AppConfiguration: Codable, Hashable, Sendable {
    public struct Features: Codable, Hashable, Sendable {
        /// Whether to offer the assistant (`POST /search/`).
        public var chat: Bool
        /// Whether to offer claim verification (`POST /verify/`).
        public var verify: Bool

        public init(chat: Bool, verify: Bool) {
            self.chat = chat
            self.verify = verify
        }
    }

    public struct Caveat: Codable, Hashable, Sendable, Identifiable {
        public var id: String
        /// French, with inline Markdown.
        public var text: String

        public init(id: String, text: String) {
            self.id = id
            self.text = text
        }
    }

    /// The oldest app version the API still serves, as the API sent it.
    public var minIOSVersion: String
    public var features: Features
    /// ISO date of the first scrutin production holds.
    public var dataHorizon: String
    public var caveats: [Caveat]
    /// The website's origin (`site_url`), the base of every link the app
    /// shares. Nil before the API sent it: the app then shares nothing
    /// rather than guess a host.
    public var siteURL: String?

    public init(
        minIOSVersion: String, features: Features, dataHorizon: String, caveats: [Caveat], siteURL: String? = nil
    ) {
        self.minIOSVersion = minIOSVersion
        self.features = features
        self.dataHorizon = dataHorizon
        self.caveats = caveats
        self.siteURL = siteURL
    }

    /// `<site_url>/<path>`, or nil while the site's origin is unknown.
    public func siteLink(_ path: String) -> URL? {
        guard let siteURL, !siteURL.isEmpty else { return nil }
        return URL(string: siteURL + "/" + path)
    }

    /// Used before the first successful fetch: nothing blocked, every feature
    /// on (the API's own defaults), and no caveat text, since the wording is
    /// the API's to supply.
    public static let defaults = AppConfiguration(
        minIOSVersion: "0.0.0",
        features: Features(chat: true, verify: true),
        dataHorizon: "2025-07-01",
        caveats: []
    )

    /// True when `appVersion` is below the minimum this configuration names.
    ///
    /// A version that does not parse, on either side, never blocks: the API
    /// already refuses to serve a malformed minimum, and locking every user out
    /// over a formatting slip is the worse failure.
    public func requiresUpdate(appVersion: String) -> Bool {
        guard let minimum = AppVersion(minIOSVersion), let current = AppVersion(appVersion) else {
            return false
        }
        return current < minimum
    }
}
