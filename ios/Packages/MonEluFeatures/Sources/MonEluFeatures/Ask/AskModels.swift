import Foundation
import MonEluCore
import OpenAPIRuntime

/// One source behind an answer, kept as the API returned it so feedback and
/// sharing can send it back unchanged.
public struct ChatSource: Hashable, Sendable, Identifiable {
    public let id: Int
    public let content: String
    public let similarity: Double
    public let metadata: OpenAPIObjectContainer

    public init(id: Int, content: String, similarity: Double, metadata: OpenAPIObjectContainer = OpenAPIObjectContainer()) {
        self.id = id
        self.content = content
        self.similarity = similarity
        self.metadata = metadata
    }

    public enum Kind: Hashable, Sendable {
        case deputy, vote, other
    }

    func string(_ key: String) -> String? {
        (metadata.value[key] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    public var kind: Kind {
        switch string("chunk_type") {
        case "deputy", "notable_deputy": .deputy
        case "vote", "law_summary": .vote
        default: .other
        }
    }

    /// The screen the source opens, when it names a deputy or a scrutin.
    public var route: AppRoute? {
        switch kind {
        case .deputy: string("deputy_id").map { .deputy(id: $0) }
        case .vote: string("vote_id").map { .vote(id: $0) }
        case .other: nil
        }
    }

    /// What the card says, from the metadata the API sent, as the website's
    /// `mapSource` does.
    public var title: String {
        switch kind {
        case .deputy:
            return string("deputy_name") ?? string("full_name") ?? string("name") ?? "Député"
        case .vote:
            return string("title") ?? string("vote_title") ?? Self.firstLine(of: content)
        case .other:
            return Self.firstLine(of: content)
        }
    }

    public var subtitle: String? {
        switch kind {
        case .deputy:
            let parts = [string("department"), string("party")].compactMap { $0 }
            return parts.isEmpty ? nil : parts.joined(separator: " · ")
        case .vote, .other:
            return nil
        }
    }

    /// The scrutin's result for a vote source, `adopté` or `rejeté`.
    public var result: String? { kind == .vote ? string("result") : nil }

    /// A vote chunk starts "Vote du 17/07/2026 : <title>..", so its first line
    /// minus that prefix names the scrutin.
    static func firstLine(of content: String) -> String {
        var line = String(content.split(separator: "\n", maxSplits: 1).first ?? "")
        if let range = line.range(of: #"^Vote du [0-9/]+ : "#, options: .regularExpression) {
            line.removeSubrange(range)
        }
        while line.hasSuffix(".") { line.removeLast() }
        return line.isEmpty ? content : line
    }
}

/// An answer from `search`.
public struct ChatAnswer: Hashable, Sendable {
    public let question: String
    public let answer: String
    public let sources: [ChatSource]
    /// `high`, `medium` or `low`, derived by the API from retrieval quality.
    public let confidence: String?
    public let dataSource: String?
    public let caveat: String?
    /// The API judged the question to be a claim and suggests verifying it
    /// (ADR-023). Verification never starts on its own.
    public let suggestsVerify: Bool

    public init(
        question: String, answer: String, sources: [ChatSource], confidence: String?,
        dataSource: String?, caveat: String?, suggestsVerify: Bool
    ) {
        self.question = question
        self.answer = answer
        self.sources = sources
        self.confidence = confidence
        self.dataSource = dataSource
        self.caveat = caveat
        self.suggestsVerify = suggestsVerify
    }

    /// The `verify` input bounds; the nudge only offers a claim it accepts,
    /// and the claim is sent verbatim, never truncated.
    public static let claimLength = 10...500

    public var canBeVerified: Bool {
        suggestsVerify && Self.claimLength.contains(question.trimmingCharacters(in: .whitespacesAndNewlines).count)
    }
}

/// A scrutin a verdict cites.
public struct VerdictCitation: Hashable, Sendable, Identifiable {
    public let voteID: String
    public let title: String
    public let date: Date?
    public let result: String?
    public let deputyPosition: String?
    public var id: String { voteID }

    public init(voteID: String, title: String, date: Date?, result: String?, deputyPosition: String?) {
        self.voteID = voteID
        self.title = title
        self.date = date
        self.result = result
        self.deputyPosition = deputyPosition
    }
}

/// A verdict from `verify`.
public struct Verdict: Hashable, Sendable {
    public let claim: String
    /// `vrai`, `faux`, `trompeur` or `inverifiable`.
    public let verdict: String
    public let explanation: String
    public let deputyID: String?
    public let deputyName: String?
    public let deputyParty: String?
    public let citations: [VerdictCitation]
    /// `ÉLEVÉ`, `MOYEN` or `FAIBLE`.
    public let confidence: String
    /// The URL the API built for this verdict; never built in the app.
    public let shareURL: URL?

    public init(
        claim: String, verdict: String, explanation: String, deputyID: String?, deputyName: String?,
        deputyParty: String?, citations: [VerdictCitation], confidence: String, shareURL: URL?
    ) {
        self.claim = claim
        self.verdict = verdict
        self.explanation = explanation
        self.deputyID = deputyID
        self.deputyName = deputyName
        self.deputyParty = deputyParty
        self.citations = citations
        self.confidence = confidence
        self.shareURL = shareURL
    }
}

/// Why a question could not be answered, beyond offline and server errors.
public enum AskError: Error, Equatable {
    /// 429: too many requests, even after the retry middleware's attempts.
    case busy
    /// 503: the AI service is switched off or unavailable.
    case unavailable
}
