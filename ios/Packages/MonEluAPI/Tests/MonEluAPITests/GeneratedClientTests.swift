import Foundation
import HTTPTypes
@testable import MonEluAPI
import OpenAPIRuntime
import Testing

/// Answers every request with one canned JSON body.
private struct StubTransport: ClientTransport {
    let json: Data

    func send(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var response = HTTPResponse(status: .ok)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}

private func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
}

private func client(returning json: Data) -> Client {
    MonEluAPI.client(
        baseURL: URL(string: "https://api.test")!,
        transport: StubTransport(json: json),
        retry: RetryMiddleware(maxAttempts: 1)
    )
}

/// Decodes real API responses through the generated client, the path that
/// broke twice while writing it: FastAPI's nullable unions (fixed in
/// scripts/export_openapi.py) and its zone-less timestamps (APIDateTranscoder).
struct GeneratedClientTests {
    @Test func decodesARecordedVoteList() async throws {
        let response = try await client(returning: fixture("votes")).listVotes()
        let list = try response.ok.body.json
        #expect(list.items.count == 3)
        let first = try #require(list.items.first)
        #expect(first.voteId == "VTANR5L17V8434")
        #expect(first.result == "adopté")
        #expect(first.votesFor == 276)
        #expect(first.votedAt == Date(timeIntervalSince1970: 1_784_592_000)) // 2026-07-21T00:00:00Z
    }

    @Test func nullAndMissingOptionalFieldsDecodeAsNil() async throws {
        var document = try #require(try JSONSerialization.jsonObject(with: fixture("votes")) as? [String: Any])
        var items = try #require(document["items"] as? [[String: Any]])
        items[0]["summary_plain"] = NSNull()
        items[0]["result"] = NSNull()
        items[0].removeValue(forKey: "theme")
        document["items"] = items
        let json = try JSONSerialization.data(withJSONObject: document)

        let first = try #require(try await client(returning: json).listVotes().ok.body.json.items.first)
        #expect(first.summaryPlain == nil)
        #expect(first.result == nil)
        #expect(first.theme == nil)
        #expect(first.voteTitle.isEmpty == false)
    }
}

struct APIDateTranscoderTests {
    private let transcoder = APIDateTranscoder()
    private let noon = Date(timeIntervalSince1970: 1_790_000_000) // 2026-09-21T14:13:20Z

    @Test(arguments: [
        "2026-09-21T14:13:20Z",
        "2026-09-21T14:13:20+00:00",
        "2026-09-21T14:13:20",
        "2026-09-21T16:13:20+02:00",
        "2026-09-21T10:13:20-04:00",
    ])
    func readsEveryShapeTheAPISends(_ value: String) throws {
        #expect(try transcoder.decode(value) == noon)
    }

    @Test func keepsFractionalSeconds() throws {
        let date = try transcoder.decode("2026-09-21T14:13:20.250000+00:00")
        #expect(abs(date.timeIntervalSince(noon) - 0.25) < 0.000_001)
    }

    @Test(arguments: ["", "2026-09-21", "2026-02-31T00:00:00", "21/09/2026 14:13", "2026-09-21T14:13:20+2"])
    func rejectsAnythingElse(_ value: String) {
        #expect(throws: (any Error).self) { try transcoder.decode(value) }
    }

    @Test func writesUTC() throws {
        #expect(try transcoder.encode(noon) == "2026-09-21T14:13:20Z")
    }
}
