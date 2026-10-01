import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// A `QuizService` that records what it is asked and replays scripted results.
final class RecordingQuizService: QuizService, @unchecked Sendable {
    private let lock = NSLock()
    let deck: [QuizQuestion]
    var result: Result<QuizResult, any Error> = .failure(URLError(.badServerResponse))
    var shareURL: Result<URL, any Error> = .failure(URLError(.badServerResponse))
    private(set) var matched: [[QuizAnswer]] = []
    private(set) var shared: [(answers: [QuizAnswer], includeAnswers: Bool)] = []

    init(deck: [QuizQuestion]) { self.deck = deck }

    func questions() async throws -> [QuizQuestion] { deck }
    func match(_ answers: [QuizAnswer]) async throws -> QuizResult {
        try lock.withLock { matched.append(answers); return try result.get() }
    }
    func share(_ answers: [QuizAnswer], includeAnswers: Bool) async throws -> URL {
        try lock.withLock { shared.append((answers, includeAnswers)); return try shareURL.get() }
    }
}

enum QuizFixtures {
    static func service() throws -> LiveQuizService {
        LiveQuizService(client: operationClient([
            "getQuestions": try fixture("quiz_questions"),
            "match": try fixture("quiz_match"),
            "shareResult": try fixture("quiz_share"),
        ]))
    }

    static func deck() async throws -> [QuizQuestion] { try await service().questions() }
    static func result() async throws -> QuizResult { try await service().match([]) }
}

@MainActor
struct QuizModelTests {
    func ready(_ service: RecordingQuizService) async -> QuizModel {
        let model = QuizModel(service: service)
        await model.questions.loadIfNeeded()
        model.start()
        return model
    }

    @Test func answeringTheWholeDeckSendsTheAnswersInOrder() async throws {
        let service = RecordingQuizService(deck: try await QuizFixtures.deck())
        service.result = .success(try await QuizFixtures.result())
        let model = await ready(service)
        for index in 0..<service.deck.count {
            index == 1 ? model.skip() : model.answer(index.isMultiple(of: 2) ? .pour : .contre)
        }
        #expect(model.phase == .result)
        await model.result?.loadIfNeeded()
        #expect(service.matched.count == 1)
        let sent = try #require(service.matched.first)
        #expect(sent.count == service.deck.count - 1)
        #expect(sent.map(\.voteID) == service.deck.map(\.voteID).enumerated().filter { $0.offset != 1 }.map(\.element))
        #expect(sent.first?.position == .pour)
    }

    @Test func backReturnsAndClearsThatAnswer() async throws {
        let model = await ready(RecordingQuizService(deck: try await QuizFixtures.deck()))
        model.answer(.pour)
        model.answer(.contre)
        #expect(model.index == 2)
        model.back()
        #expect(model.index == 1)
        #expect(model.answers.count == 1)
        model.back()
        #expect(model.index == 0)
        #expect(model.answers.isEmpty)
        #expect(model.canGoBack == false)
    }

    @Test func fewerThanThreeAnswersAskForMore() async throws {
        let service = RecordingQuizService(deck: try await QuizFixtures.deck())
        let model = await ready(service)
        model.answer(.pour)
        model.answer(.abstention)
        while model.current != nil { model.skip() }
        #expect(model.phase == .notEnough)
        #expect(service.matched.isEmpty)
        model.resume()
        #expect(model.phase == .questions)
        #expect(model.index == 0)
        #expect(model.answers.count == 2)
    }

    /// ADR-028: the answers go into the public snapshot only when the user
    /// turns the option on.
    @Test func includeAnswersIsOffUnlessTurnedOn() async throws {
        let service = RecordingQuizService(deck: try await QuizFixtures.deck())
        service.result = .success(try await QuizFixtures.result())
        service.shareURL = .success(URL(string: "https://mon-elu.vercel.app/quiz/s/a")!)
        let model = await ready(service)
        #expect(model.includeAnswers == false)
        while model.current != nil { model.answer(.pour) }
        await model.share()
        #expect(service.shared.map(\.includeAnswers) == [false])

        model.restart()
        #expect(model.includeAnswers == false)
        model.start()
        while model.current != nil { model.answer(.contre) }
        model.includeAnswers = true
        await model.share()
        #expect(service.shared.map(\.includeAnswers) == [false, true])
    }

    /// The share sheet gets exactly the URL the API returned, and a second
    /// tap reuses it rather than storing another snapshot.
    @Test func theShareSheetReceivesTheAPIsURL() async throws {
        let service = RecordingQuizService(deck: try await QuizFixtures.deck())
        service.result = .success(try await QuizFixtures.result())
        service.shareURL = .success(try await QuizFixtures.service().share([], includeAnswers: false))
        let model = await ready(service)
        while model.current != nil { model.answer(.pour) }
        await model.share()
        #expect(model.sharedLink?.url.absoluteString == "https://mon-elu.vercel.app/quiz/s/5b6c7d8e-0000-4000-8000-000000000003")
        model.sharedLink = nil
        await model.share()
        #expect(service.shared.count == 1)
        #expect(model.sharedLink != nil)
        #expect(model.hasShareLink)
    }
}

struct QuizResultTests {
    /// The percentages shown are the `match` response's values, decimal
    /// included; the ranking is the API's order (ADR-025).
    @Test func percentagesOnScreenAreTheAPIsValues() async throws {
        let result = try await QuizFixtures.result()
        let json = try #require(try JSONSerialization.jsonObject(with: fixture("quiz_match")) as? [String: Any])
        let deputies = try #require(json["top_matches"] as? [[String: Any]])
        let groups = try #require(json["groups"] as? [[String: Any]])
        #expect(result.topMatches.map(\.deputy.id) == deputies.map { $0["deputy_id"] as? String })
        #expect(result.topMatches.map(\.agreementPct) == deputies.map { $0["agreement_pct"] as? Double })
        #expect(result.groups.map(\.agreementPct) == groups.compactMap { $0["agreement_pct"] as? Double })
        for (shown, value) in zip(result.topMatches.compactMap(\.agreementPct), deputies.compactMap { $0["agreement_pct"] as? Double }) {
            // "88,9 %" on screen is 88.9 in the response.
            let text = MonEluFormat.percentage(shown).filter { !$0.isWhitespace && $0 != "%" }.replacingOccurrences(of: ",", with: ".")
            #expect(Double(text) == value)
        }
        #expect(result.opposite?.agreementPct == 11.1)
        #expect(result.supportedThemes.count == 5)
    }

    @Test func questionsCarryTheirLiveTallies() async throws {
        let deck = try await QuizFixtures.deck()
        #expect(deck.count == 10)
        let first = try #require(deck.first)
        #expect(first.theme == "Fin de vie")
        #expect(first.votesFor == 291)
        #expect(first.voteDate.map(MonEluFormat.day) == "15 juillet 2026")
    }
}

struct QuizSwipeTests {
    @Test(arguments: [
        (CGSize(width: 140, height: 10), CGSize(width: 150, height: 10), QuizPosition?.some(.pour)),
        (CGSize(width: -140, height: 20), CGSize(width: -150, height: 20), .some(.contre)),
        (CGSize(width: 10, height: 140), CGSize(width: 10, height: 150), .some(.abstention)),
        (CGSize(width: 40, height: 5), CGSize(width: 400, height: 5), .some(.pour)),
        (CGSize(width: 40, height: 30), CGSize(width: 60, height: 40), nil),
        (CGSize(width: 120, height: 110), CGSize(width: 130, height: 120), .some(.pour)),
    ])
    func aDragMeansAnAnswerOnlyPastTheThreshold(_ translation: CGSize, _ predicted: CGSize, _ expected: QuizPosition?) {
        #expect(QuizDeckView.position(for: translation, predicted: predicted) == expected)
    }
}
