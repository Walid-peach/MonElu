import Foundation
import HTTPTypes
@testable import MonEluAPI
import OpenAPIRuntime
import Testing

/// Records every sleep instead of waiting, and replays scripted outcomes.
private final class Script: @unchecked Sendable {
    private let lock = NSLock()
    private var outcomes: [Result<HTTPResponse, any Error>]
    private(set) var calls = 0
    private(set) var sleeps: [Duration] = []

    init(_ outcomes: [Result<HTTPResponse, any Error>]) { self.outcomes = outcomes }

    func next() throws -> HTTPResponse {
        try lock.withLock {
            calls += 1
            return try outcomes.removeFirst().get()
        }
    }

    func slept(_ duration: Duration) { lock.withLock { sleeps.append(duration) } }
}

private func status(_ code: Int, retryAfter: String? = nil) -> Result<HTTPResponse, any Error> {
    var response = HTTPResponse(status: .init(code: code))
    if let retryAfter { response.headerFields[.retryAfter] = retryAfter }
    return .success(response)
}

private func run(
    _ script: Script,
    method: HTTPRequest.Method = .get,
    body: HTTPBody? = nil,
    now: Date = Date()
) async throws -> Int {
    let middleware = RetryMiddleware(
        maxAttempts: 3,
        baseDelay: .milliseconds(500),
        maxDelay: .seconds(10),
        sleep: { script.slept($0) },
        now: { now }
    )
    let (response, _) = try await middleware.intercept(
        HTTPRequest(method: method, scheme: "https", authority: "api.test", path: "/votes/"),
        body: body,
        baseURL: URL(string: "https://api.test")!,
        operationID: "listVotes",
        next: { _, _, _ in (try script.next(), nil) }
    )
    return response.status.code
}

struct RetryMiddlewareTests {
    @Test func successIsNotRetried() async throws {
        let script = Script([status(200)])
        #expect(try await run(script) == 200)
        #expect(script.calls == 1)
    }

    @Test func serverErrorOnGetIsRetriedWithBackoff() async throws {
        let script = Script([status(503), status(502), status(200)])
        #expect(try await run(script) == 200)
        #expect(script.sleeps == [.milliseconds(500), .seconds(1)])
    }

    @Test func givesUpAfterMaxAttempts() async throws {
        let script = Script([status(503), status(503), status(503)])
        #expect(try await run(script) == 503)
        #expect(script.calls == 3)
    }

    @Test func tooManyRequestsHonoursRetryAfterSeconds() async throws {
        let script = Script([status(429, retryAfter: "2"), status(200)])
        #expect(try await run(script) == 200)
        #expect(script.sleeps == [.seconds(2)])
    }

    @Test func retryAfterHttpDateIsRelativeToNow() async throws {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let header = RetryMiddlewareTests.httpDate(now.addingTimeInterval(3))
        let script = Script([status(429, retryAfter: header), status(200)])
        #expect(try await run(script, now: now) == 200)
        #expect(script.sleeps == [.seconds(3)])
    }

    @Test func retryAfterIsCapped() async throws {
        let script = Script([status(429, retryAfter: "3600"), status(200)])
        #expect(try await run(script) == 200)
        #expect(script.sleeps == [.seconds(10)])
    }

    @Test func unparseableRetryAfterFallsBackToBackoff() async throws {
        let script = Script([status(429, retryAfter: "soon"), status(200)])
        #expect(try await run(script) == 200)
        #expect(script.sleeps == [.milliseconds(500)])
    }

    @Test func tooManyRequestsOnPostIsRetried() async throws {
        let script = Script([status(429, retryAfter: "1"), status(200)])
        #expect(try await run(script, method: .post, body: HTTPBody("{}")) == 200)
        #expect(script.calls == 2)
    }

    @Test func serverErrorOnPostIsNotRetried() async throws {
        let script = Script([status(503)])
        #expect(try await run(script, method: .post, body: HTTPBody("{}")) == 503)
        #expect(script.calls == 1)
    }

    @Test func singleUseBodyIsNeverRetried() async throws {
        let once = HTTPBody(AsyncStream<ArraySlice<UInt8>> { $0.finish() }, length: .unknown, iterationBehavior: .single)
        let script = Script([status(429)])
        #expect(try await run(script, method: .post, body: once) == 429)
        #expect(script.calls == 1)
    }

    @Test func clientErrorIsNotRetried() async throws {
        let script = Script([status(404)])
        #expect(try await run(script) == 404)
        #expect(script.calls == 1)
    }

    @Test func transientTransportErrorOnGetIsRetried() async throws {
        let script = Script([.failure(URLError(.timedOut)), status(200)])
        #expect(try await run(script) == 200)
        #expect(script.calls == 2)
    }

    @Test func permanentTransportErrorIsThrown() async throws {
        let script = Script([.failure(URLError(.badURL))])
        await #expect(throws: URLError.self) { try await run(script) }
        #expect(script.calls == 1)
    }

    static func httpDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.string(from: date)
    }
}
