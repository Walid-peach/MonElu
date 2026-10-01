import Foundation
import MonEluAPI
import MonEluCore
import OpenAPIRuntime

/// The Demander tab's calls, behind a protocol so the screen is tested with a
/// stub. `verify`, `share` and `feedback` each store something in production,
/// which is one more reason tests never reach the network.
public protocol AskService: Sendable {
    func ask(_ question: String) async throws -> ChatAnswer
    func verify(_ claim: String) async throws -> Verdict
    /// The share URL the API built for this answer.
    func share(_ answer: ChatAnswer) async throws -> URL
    func feedback(_ vote: ChatFeedback, on answer: ChatAnswer) async throws
}

public enum ChatFeedback: String, Sendable {
    case up, down
}

/// `AskService` on the generated client (`search`, `verify`, `shareAnswer`,
/// `submitChatFeedback`).
public struct LiveAskService: AskService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func ask(_ question: String) async throws -> ChatAnswer {
        let response = try await client.search(body: .json(.init(question: question)))
        if case .undocumented(let code, _) = response { try Self.fail(code) }
        let body = try response.ok.body.json
        return ChatAnswer(
            question: body.question,
            answer: body.answer,
            sources: body.sources.enumerated().map {
                ChatSource(id: $0.offset, content: $0.element.content, similarity: $0.element.similarity,
                           metadata: $0.element.metadata.additionalProperties)
            },
            confidence: body.confidence,
            dataSource: body.dataSource,
            caveat: body.caveat,
            suggestsVerify: body.suggestedAction != nil
        )
    }

    public func verify(_ claim: String) async throws -> Verdict {
        let response = try await client.verify(body: .json(.init(claim: claim)))
        if case .undocumented(let code, _) = response { try Self.fail(code) }
        let body = try response.ok.body.json
        return Verdict(
            claim: body.claim,
            verdict: body.verdict.rawValue,
            explanation: body.explanation,
            deputyID: body.deputy?.deputyId,
            deputyName: body.deputy?.name,
            deputyParty: body.deputy?.party,
            citations: body.citations.map {
                VerdictCitation(
                    voteID: $0.voteId, title: $0.title, date: MonEluFormat.calendarDate(String($0.votedAt.prefix(10))),
                    result: $0.result, deputyPosition: $0.deputyPosition
                )
            },
            confidence: body.confidence.rawValue,
            shareURL: URL(string: body.shareUrl)
        )
    }

    public func share(_ answer: ChatAnswer) async throws -> URL {
        let response = try await client.shareAnswer(body: .json(.init(
            question: answer.question,
            answer: answer.answer,
            sources: Self.shareSources(answer.sources, limit: 20),
            confidence: answer.confidence,
            dataSource: answer.dataSource,
            caveat: answer.caveat
        )))
        if case .undocumented(let code, _) = response { try Self.fail(code) }
        guard let url = URL(string: try response.ok.body.json.shareUrl) else { throw URLError(.badURL) }
        return url
    }

    public func feedback(_ vote: ChatFeedback, on answer: ChatAnswer) async throws {
        let response = try await client.submitChatFeedback(body: .json(.init(
            vote: vote.rawValue,
            question: answer.question,
            answer: answer.answer,
            sources: Self.shareSources(answer.sources, limit: 10)
        )))
        if case .undocumented(let code, _) = response { try Self.fail(code) }
        _ = try response.ok
    }

    /// The sources as the write endpoints accept them: capped in number and
    /// in content length, similarity within 0...1.
    static func shareSources(_ sources: [ChatSource], limit: Int) -> [Components.Schemas.ShareSourceItem] {
        sources.prefix(limit).map {
            .init(
                content: String($0.content.prefix(4000)),
                metadata: .init(additionalProperties: $0.metadata),
                similarity: min(max(0, $0.similarity), 1)
            )
        }
    }

    /// 429 and 503 are not in the spec, so the client reports them as
    /// undocumented; they mean "busy" and "switched off", not a broken API.
    /// Any other undocumented status falls through to `.ok`, which throws.
    static func fail(_ code: Int) throws {
        switch code {
        case 429: throw AskError.busy
        case 503: throw AskError.unavailable
        default: return
        }
    }
}
