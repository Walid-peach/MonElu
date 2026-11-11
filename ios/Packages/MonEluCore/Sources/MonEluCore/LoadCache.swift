import Foundation

/// What screens loaded during this launch, kept in memory so a page opened
/// again shows at once instead of starting from a spinner.
///
/// A `Loader` given a key reads its last value here when it is created, shows
/// it, and fetches again behind it; the fresh answer replaces what is on screen
/// and what is stored. Nothing is written to disk: the HTTP cache
/// (`MonEluAPI.configureURLCache`) already keeps responses between launches,
/// and this only saves a screen from waiting for it.
///
/// Keys name the page and what it was asked for (`deputy:PA1008`,
/// `votes:<criteria>`), so two screens never read each other's value; a value
/// of another type under the same key is a miss.
@MainActor
public final class LoadCache {
    /// The app's cache. Tests build their own, so they never share values.
    public static let shared = LoadCache()

    /// The most pages kept; the one read or written longest ago goes first.
    public let capacity: Int
    /// False makes every read a miss and drops every write, so a run can be
    /// measured without the cache.
    public var isEnabled = true

    private struct Entry {
        var value: any Sendable
        var lastUsed: UInt64
    }

    private var entries: [String: Entry] = [:]
    private var clock: UInt64 = 0

    public init(capacity: Int = 200) {
        self.capacity = max(1, capacity)
    }

    public var count: Int { entries.count }

    public func value<Value: Sendable>(for key: String, as type: Value.Type = Value.self) -> Value? {
        guard isEnabled, let value = entries[key]?.value as? Value else { return nil }
        entries[key]?.lastUsed = tick()
        return value
    }

    public func store<Value: Sendable>(_ value: Value, for key: String) {
        guard isEnabled else { return }
        entries[key] = Entry(value: value, lastUsed: tick())
        while entries.count > capacity, let oldest = entries.min(by: { $0.value.lastUsed < $1.value.lastUsed }) {
            entries[oldest.key] = nil
        }
    }

    public func removeAll() {
        entries.removeAll()
    }

    private func tick() -> UInt64 {
        clock += 1
        return clock
    }
}
