import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Retries requests that failed for a reason worth waiting out.
///
/// - `429 Too Many Requests` is retried for any method, after the server's
///   `Retry-After` when it sends one: the API rejected the request without
///   running it, so repeating it is safe.
/// - `502`, `503`, `504` and transport errors (timeouts, a dropped
///   connection) are retried only for `GET` and `HEAD`, since a write may
///   already have taken effect.
///
/// A request whose body can be read only once is never retried.
public struct RetryMiddleware: ClientMiddleware {
    public var maxAttempts: Int
    /// Delay before the first retry when the server gives none; doubles after.
    public var baseDelay: Duration
    /// Upper bound on any single wait, `Retry-After` included, so a hostile or
    /// broken header cannot park the app for an hour.
    public var maxDelay: Duration
    let sleep: @Sendable (Duration) async throws -> Void
    let now: @Sendable () -> Date

    public init(
        maxAttempts: Int = 3,
        baseDelay: Duration = .milliseconds(500),
        maxDelay: Duration = .seconds(10)
    ) {
        self.init(
            maxAttempts: maxAttempts,
            baseDelay: baseDelay,
            maxDelay: maxDelay,
            sleep: { try await Task.sleep(for: $0) },
            now: { Date() }
        )
    }

    init(
        maxAttempts: Int,
        baseDelay: Duration,
        maxDelay: Duration,
        sleep: @escaping @Sendable (Duration) async throws -> Void,
        now: @escaping @Sendable () -> Date
    ) {
        self.maxAttempts = max(1, maxAttempts)
        self.baseDelay = baseDelay
        self.maxDelay = maxDelay
        self.sleep = sleep
        self.now = now
    }

    public func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        let bodyIsReplayable = body.map { $0.iterationBehavior == .multiple } ?? true
        let idempotent = request.method == .get || request.method == .head
        var attempt = 1
        while true {
            let canRetry = bodyIsReplayable && attempt < maxAttempts
            let response: HTTPResponse
            let responseBody: HTTPBody?
            do {
                (response, responseBody) = try await next(request, body, baseURL)
            } catch {
                guard canRetry, idempotent, Self.isTransient(error) else { throw error }
                try await sleep(backoff(attempt: attempt))
                attempt += 1
                continue
            }

            // Not `case 502, 503, 504 where …`: a `where` clause binds only to
            // the last pattern, which would retry 502 and 503 unconditionally.
            let code = response.status.code
            if canRetry && code == 429 {
                try await sleep(retryAfter(response) ?? backoff(attempt: attempt))
            } else if canRetry && idempotent && [502, 503, 504].contains(code) {
                try await sleep(backoff(attempt: attempt))
            } else {
                return (response, responseBody)
            }
            attempt += 1
        }
    }

    func backoff(attempt: Int) -> Duration {
        min(baseDelay * (1 << (attempt - 1)), maxDelay)
    }

    /// The server's `Retry-After`, in seconds or as an HTTP date, capped at
    /// `maxDelay`; nil when absent or unparseable.
    func retryAfter(_ response: HTTPResponse) -> Duration? {
        guard let value = response.headerFields[.retryAfter]?.trimmingCharacters(in: .whitespaces) else {
            return nil
        }
        let seconds: Double
        if let delta = Double(value), delta >= 0 {
            seconds = delta
        } else if let date = Self.httpDate(value) {
            seconds = max(0, date.timeIntervalSince(now()))
        } else {
            return nil
        }
        return min(.milliseconds(Int64(seconds * 1000)), maxDelay)
    }

    static func httpDate(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value)
    }

    static func isTransient(_ error: any Error) -> Bool {
        let underlying = (error as? ClientError)?.underlyingError ?? error
        guard let urlError = underlying as? URLError else { return false }
        switch urlError.code {
        case .timedOut, .networkConnectionLost, .cannotConnectToHost, .dnsLookupFailed,
             .cannotFindHost, .notConnectedToInternet:
            return true
        default:
            return false
        }
    }
}
