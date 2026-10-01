import Foundation
import MonEluAPI
import MonEluCore

/// The Quiz tab's calls, behind a protocol so the screen is tested with a
/// stub. `share` stores a snapshot in production; `questions` and `match`
/// store nothing (`match` is stateless by design, ADR-025).
public protocol QuizService: Sendable {
    func questions() async throws -> [QuizQuestion]
    func match(_ answers: [QuizAnswer]) async throws -> QuizResult
    /// The share URL the API built. `includeAnswers` stores the answers in
    /// the public snapshot (ADR-028) and must come from the user's choice.
    func share(_ answers: [QuizAnswer], includeAnswers: Bool) async throws -> URL
}

/// `QuizService` on the generated client (`getQuestions`, `match`, `shareResult`).
public struct LiveQuizService: QuizService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func questions() async throws -> [QuizQuestion] {
        try await client.getQuestions().ok.body.json.questions.map {
            QuizQuestion(
                voteID: $0.voteId, theme: $0.theme, question: $0.question, context: $0.context,
                votesFor: $0.votesFor, votesAgainst: $0.votesAgainst, abstentions: $0.abstentions,
                result: $0.result, voteDate: $0.voteDate.flatMap(MonEluFormat.calendarDate)
            )
        }
    }

    public func match(_ answers: [QuizAnswer]) async throws -> QuizResult {
        let body = try await client.match(body: .json(.init(answers: Self.answers(answers)))).ok.body.json
        return QuizResult(
            answered: body.answered,
            eligibleDeputies: body.eligibleDeputies,
            topMatches: body.topMatches.map(QuizDeputyMatch.init),
            opposite: body.opposite.map(QuizDeputyMatch.init),
            groups: body.groups.map {
                QuizGroupMatch(
                    group: $0.party, groupShort: $0.partyShort, agreementPct: $0.agreementPct,
                    matches: $0.matches, compared: $0.compared, deputyCount: $0.deputyCount
                )
            },
            supportedThemes: body.themes?.supported ?? [],
            opposedThemes: body.themes?.opposed ?? []
        )
    }

    public func share(_ answers: [QuizAnswer], includeAnswers: Bool) async throws -> URL {
        let response = try await client.shareResult(body: .json(.init(
            answers: Self.answers(answers), includeAnswers: includeAnswers
        )))
        guard let url = URL(string: try response.ok.body.json.shareUrl) else { throw URLError(.badURL) }
        return url
    }

    static func answers(_ answers: [QuizAnswer]) -> [Components.Schemas.QuizAnswer] {
        answers.compactMap { answer in
            Components.Schemas.QuizAnswer.PositionPayload(rawValue: answer.position.rawValue).map {
                .init(voteId: answer.voteID, position: $0)
            }
        }
    }
}

extension QuizDeputyMatch {
    init(_ match: Components.Schemas.QuizDeputyMatch) {
        self.init(
            deputy: DeputyItem(
                id: match.deputyId, name: match.fullName ?? "Député", group: match.party, groupShort: match.partyShort,
                department: match.department, circonscription: nil, photoURL: match.photoUrl.flatMap(URL.init(string:))
            ),
            agreementPct: match.agreementPct,
            matches: match.matches,
            compared: match.compared
        )
    }
}
