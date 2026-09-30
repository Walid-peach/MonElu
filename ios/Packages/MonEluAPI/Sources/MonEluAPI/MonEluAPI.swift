import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

/// The MonÉlu API, through a client generated from the committed OpenAPI
/// snapshot (ADR-041 §4, #448).
///
/// Every endpoint is called through the generated `Client`, whose methods are
/// named after the API's operationIds (`listDeputies`, `getAppConfig`, …).
/// Never hand-write a request for an endpoint the generated client covers;
/// refresh the snapshot with `python scripts/export_openapi.py` instead.
public enum MonEluAPI {
    /// A generated client for `baseURL`, retrying transient failures.
    ///
    /// `baseURL` comes from the app's build settings, never from a literal:
    /// a public build must not ship a Railway hostname (ADR-041 §5).
    public static func client(
        baseURL: URL,
        session: URLSession = .shared,
        retry: RetryMiddleware = RetryMiddleware()
    ) -> Client {
        client(
            baseURL: baseURL,
            transport: URLSessionTransport(configuration: .init(session: session)),
            retry: retry
        )
    }

    /// A generated client over any transport; tests use a stub that returns
    /// recorded responses.
    public static func client(
        baseURL: URL,
        transport: any ClientTransport,
        retry: RetryMiddleware = RetryMiddleware(maxAttempts: 1)
    ) -> Client {
        Client(
            serverURL: baseURL,
            configuration: Configuration(dateTranscoder: APIDateTranscoder()),
            transport: transport,
            middlewares: [retry]
        )
    }
}
