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
@MainActor
@Observable
public final class Loader<Value: Sendable> {
    public private(set) var state: LoadState<Value> = .idle
    /// True while a refresh runs over content that is already on screen.
    public private(set) var isRefreshing = false
    /// Set when a refresh failed over loaded content; the content stays.
    public private(set) var refreshFailure: LoadFailure?

    private let fetch: @Sendable () async throws -> Value
    private let isEmpty: @Sendable (Value) -> Bool

    public init(
        isEmpty: @escaping @Sendable (Value) -> Bool = { _ in false },
        fetch: @escaping @Sendable () async throws -> Value
    ) {
        self.fetch = fetch
        self.isEmpty = isEmpty
    }

    /// Loads once; later calls do nothing while content or a load is present.
    public func loadIfNeeded() async {
        guard case .idle = state else { return }
        await load()
    }

    /// Loads from scratch, showing the loading state (the retry action).
    public func load() async {
        state = .loading
        refreshFailure = nil
        do {
            state = settle(try await fetch())
        } catch {
            state = .failed(LoadFailure(error))
        }
    }

    /// Reloads for pull-to-refresh, keeping loaded content visible.
    public func refresh() async {
        guard case .loaded = state else { return await load() }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            state = settle(try await fetch())
            refreshFailure = nil
        } catch {
            refreshFailure = LoadFailure(error)
        }
    }

    private func settle(_ value: Value) -> LoadState<Value> {
        isEmpty(value) ? .empty : .loaded(value)
    }
}
