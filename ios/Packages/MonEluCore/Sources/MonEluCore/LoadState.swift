import Foundation
import Observation

/// Why a load failed, in the terms a screen shows to the user.
public enum LoadFailure: Equatable, Sendable {
    /// The device could not reach the network: say so and offer a retry.
    case offline
    /// The API answered with an error or could not be read: offer a retry.
    case server

    /// Classifies any error a load can throw. Wrapping errors (the generated
    /// client's `ClientError`) are unwrapped through `WrapsUnderlyingError`.
    public init(_ error: any Error) {
        var current: any Error = error
        while let wrapper = current as? any WrapsUnderlyingError {
            current = wrapper.underlyingError
        }
        if let urlError = current as? URLError, Self.offlineCodes.contains(urlError.code) {
            self = .offline
        } else {
            self = .server
        }
    }

    static let offlineCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed,
        .internationalRoamingOff, .cannotFindHost, .cannotConnectToHost, .timedOut, .dnsLookupFailed,
    ]

    /// Whether a load stopped because its task was cancelled (its `.task`
    /// view left the screen, or its tab went behind another) rather than
    /// because it failed. Nothing went wrong, so `Loader` shows no failure
    /// for it (#579).
    public static func isCancellation(_ error: any Error) -> Bool {
        if Task.isCancelled { return true }
        var current: any Error = error
        while true {
            if current is CancellationError { return true }
            if let urlError = current as? URLError, urlError.code == .cancelled { return true }
            guard let wrapper = current as? any WrapsUnderlyingError else { return false }
            current = wrapper.underlyingError
        }
    }
}

/// An error that carries the one that caused it, like the generated client's
/// `ClientError`. `MonEluAPI` makes `ClientError` conform.
public protocol WrapsUnderlyingError: Error {
    var underlyingError: any Error { get }
}

/// Where a screen's data is. Every Phase 2 screen renders this and nothing
/// else, so loading, empty, offline and error look the same everywhere (#459).
public enum LoadState<Value: Sendable>: Sendable {
    case idle
    case loading
    case loaded(Value)
    case empty
    case failed(LoadFailure)

    public var value: Value? {
        if case .loaded(let value) = self { value } else { nil }
    }

    public var failure: LoadFailure? {
        if case .failed(let failure) = self { failure } else { nil }
    }

    public var isEmptyState: Bool {
        if case .empty = self { true } else { false }
    }

    public var isIdle: Bool {
        if case .idle = self { true } else { false }
    }
}

/// Runs a screen's load and keeps its `LoadState`.
///
/// A refresh keeps the loaded content on screen while it runs, and a failed
/// refresh keeps it too: pulling to refresh offline must not blank a page the
/// user was reading.
///
/// A cancelled load is not a failure: the loader goes back to the state it
/// had, so the next `loadIfNeeded()` (a `.task` running again when its view
/// returns) loads again instead of showing an error nobody caused (#579).
///
/// A loader with a cache key starts on what that page last showed
/// (`LoadCache`) and fetches again behind it, so a page opened a second time
/// never waits on a spinner. A progressive fetch can also show a first part of
/// the page before the rest arrives.
@MainActor
@Observable
public final class Loader<Value: Sendable> {
    /// Shows a part of the value before the fetch returns all of it.
    public typealias Partial = @Sendable (Value) async -> Void

    public private(set) var state: LoadState<Value> = .idle
    /// True while a refresh runs over content that is already on screen.
    public private(set) var isRefreshing = false
    /// Set when a refresh failed over loaded content; the content stays.
    public private(set) var refreshFailure: LoadFailure?

    private let fetch: @Sendable (@escaping Partial) async throws -> Value
    private let isEmpty: @Sendable (Value) -> Bool
    private let cache: LoadCache?
    private let key: @MainActor () -> String?
    /// The content on screen came from the cache and has not been fetched yet.
    private var isStale = false
    /// Counts loads, so a part published by an abandoned one is dropped.
    private var generation = 0
    private let trace = LoadTrace()

    /// A loader that keeps nothing between screens.
    public convenience init(
        isEmpty: @escaping @Sendable (Value) -> Bool = { _ in false },
        fetch: @escaping @Sendable () async throws -> Value
    ) {
        self.init(cache: nil, key: { nil }, isEmpty: isEmpty, progressive: { _ in try await fetch() })
    }

    /// A loader whose value is kept under `cacheKey` for the next screen that
    /// asks for the same page.
    public convenience init(
        cacheKey: String,
        cache: LoadCache = .shared,
        isEmpty: @escaping @Sendable (Value) -> Bool = { _ in false },
        fetch: @escaping @Sendable () async throws -> Value
    ) {
        self.init(cache: cache, key: { cacheKey }, isEmpty: isEmpty, progressive: { _ in try await fetch() })
    }

    /// The full form. `key` is read when the loader is created, before each
    /// load and after each fetch, so a list whose criteria change keeps one
    /// value per criteria; nil keeps nothing. `progressive` may call its
    /// argument with a part of the value to show it while the rest loads; the
    /// parts are shown only by a load that started without content, never over
    /// a page already on screen.
    public init(
        cache: LoadCache?,
        key: @escaping @MainActor () -> String?,
        isEmpty: @escaping @Sendable (Value) -> Bool = { _ in false },
        progressive: @escaping @Sendable (@escaping Partial) async throws -> Value
    ) {
        self.fetch = progressive
        self.isEmpty = isEmpty
        self.cache = cache
        self.key = key
        if let cached = cachedValue() {
            state = settle(cached)
            isStale = true
        }
    }

    /// Loads once; later calls do nothing while content or a load is present.
    /// Content that came from the cache is fetched again, once, behind it.
    public func loadIfNeeded() async {
        if isStale {
            // On screen since the view's first frame, before this task ran.
            trace.shownAtOnce(key())
            return await revalidate()
        }
        guard case .idle = state else { return }
        await load()
    }

    /// Loads from scratch (the retry action, and a list whose criteria
    /// changed). Shows what the cache holds for the current key while the
    /// fetch runs, and the loading state when it holds nothing.
    public func load() async {
        refreshFailure = nil
        if let cached = cachedValue() {
            state = settle(cached)
            trace.restart()
            trace.shownAtOnce(key())
            return await revalidate()
        }
        let previous = state
        state = .loading
        isStale = false
        generation += 1
        let generation = generation
        trace.restart()
        do {
            let value = try await fetch { [weak self] part in await self?.show(part, of: generation) }
            finish(value)
        } catch let error where LoadFailure.isCancellation(error) {
            state = previous
        } catch {
            state = .failed(LoadFailure(error))
        }
    }

    /// Reloads for pull-to-refresh, keeping loaded content visible.
    public func refresh() async {
        guard case .loaded = state else { return await load() }
        await revalidate()
    }

    /// Changes the loaded content in place, for a list appending its next
    /// page. Does nothing unless content is loaded. The cache keeps what the
    /// fetch returned, not the appended pages.
    public func update(_ transform: (inout Value) -> Void) {
        guard case .loaded(var value) = state else { return }
        transform(&value)
        state = .loaded(value)
    }

    /// Fetches over the content on screen: it stays whatever happens, and a
    /// failure is reported beside it.
    private func revalidate() async {
        isStale = false
        isRefreshing = true
        generation += 1
        defer { isRefreshing = false }
        do {
            finish(try await fetch { _ in })
            refreshFailure = nil
        } catch let error where LoadFailure.isCancellation(error) {
            // The content stays, and nothing failed that the user should hear
            // of; it is still unfetched, so the next visit tries again.
            isStale = true
        } catch {
            refreshFailure = LoadFailure(error)
        }
    }

    private func show(_ part: Value, of generation: Int) {
        guard generation == self.generation else { return }
        state = settle(part)
        trace.shown(key(), from: "network, first part")
    }

    private func finish(_ value: Value) {
        state = settle(value)
        if let key = key() { cache?.store(value, for: key) }
        trace.complete(key())
    }

    private func cachedValue() -> Value? {
        guard let cache, let key = key() else { return nil }
        return cache.value(for: key)
    }

    private func settle(_ value: Value) -> LoadState<Value> {
        isEmpty(value) ? .empty : .loaded(value)
    }
}
