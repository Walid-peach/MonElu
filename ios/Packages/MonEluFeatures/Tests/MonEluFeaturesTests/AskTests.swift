import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// An `AskService` that counts every call and replays scripted results.
final class RecordingAskService: AskService, @unchecked Sendable {
    private let lock = NSLock()
    var answer: Result<ChatAnswer, any Error>
    var verdict: Result<Verdict, any Error> = .failure(URLError(.badServerResponse))
    var shareURL: Result<URL, any Error> = .failure(URLError(.badServerResponse))
    private(set) var questions: [String] = []
    private(set) var claims: [String] = []
    private(set) var shares = 0
    private(set) var feedbacks: [ChatFeedback] = []

    init(answer: Result<ChatAnswer, any Error>) { self.answer = answer }

    func ask(_ question: String) async throws -> ChatAnswer {
        try lock.withLock { questions.append(question); return try answer.get() }
    }
    func verify(_ claim: String) async throws -> Verdict {
        try lock.withLock { claims.append(claim); return try verdict.get() }
    }
    func share(_ answer: ChatAnswer) async throws -> URL {
        try lock.withLock { shares += 1; return try shareURL.get() }
    }
    func feedback(_ vote: ChatFeedback, on answer: ChatAnswer) async throws {
        lock.withLock { feedbacks.append(vote) }
    }
}

/// The live service over recorded and written-from-schema responses.
enum AskFixtures {
    static func service() throws -> LiveAskService {
        LiveAskService(client: operationClient([
            "search": try fixture("search_claim"),
            "verify": try fixture("verify"),
            "shareAnswer": try fixture("share"),
            "submitChatFeedback": Data(#"{"status":"ok"}"#.utf8),
        ]))
    }

    static func claimAnswer() async throws -> ChatAnswer {
        try await service().ask("Alain David a voté contre la loi sur la protection des enfants")
    }

    static func tableAnswer() async throws -> ChatAnswer {
        try await LiveAskService(client: operationClient(["search": try fixture("search_answer")])).ask("q")
    }
}

let allOn = AppConfiguration.Features(chat: true, verify: true)

@MainActor
struct AskModelTests {
    /// "Vérifier une affirmation" sends the draft to `verify` directly, never
    /// to `search`, within the bounds `verify` accepts.
    @Test func claimModeVerifiesDirectly() async throws {
        let service = RecordingAskService(answer: .failure(URLError(.badServerResponse)))
        service.verdict = .success(try await AskFixtures.service().verify("x"))
        let model = AskModel(service: service, features: allOn)
        model.mode = .claim
        model.draft = "Trop bref"
        #expect(model.canSend == false)
        model.draft = "Alain David a voté contre la loi sur la protection des enfants"
        await model.send()
        #expect(service.questions.isEmpty)
        #expect(service.claims == ["Alain David a voté contre la loi sur la protection des enfants"])
        let exchange = try #require(model.exchanges.first)
        #expect(exchange.isClaim)
        guard case .done = exchange.verification else { Issue.record("no verdict"); return }
    }

    /// With verification switched off, the mode falls back to a question.
    @Test func claimModeNeedsVerification() async {
        let service = RecordingAskService(answer: .failure(URLError(.badServerResponse)))
        let model = AskModel(service: service, features: .init(chat: true, verify: false))
        model.mode = .claim
        #expect(model.effectiveMode == .question)
        model.draft = "Qui est mon député ?"
        await model.send()
        #expect(service.claims.isEmpty)
        #expect(service.questions == ["Qui est mon député ?"])
    }

    /// A failed claim is sent again by "Réessayer"; a new conversation empties
    /// the thread.
    @Test func aFailedClaimCanBeRetriedAndTheThreadCleared() async throws {
        let service = RecordingAskService(answer: .failure(URLError(.badServerResponse)))
        let model = AskModel(service: service, features: allOn)
        model.mode = .claim
        model.draft = "Alain David a voté contre la loi sur la protection des enfants"
        await model.send()
        let id = try #require(model.exchanges.first?.id)
        service.verdict = .success(try await AskFixtures.service().verify("x"))
        await model.retry(id)
        #expect(service.claims.count == 2)
        guard case .done = model.exchanges.first?.verification else { Issue.record("no verdict"); return }
        model.clear()
        #expect(model.exchanges.isEmpty)
    }

    /// ADR-023: the nudge shows for a claim, and `verify` runs only when tapped.
    @Test func aClaimShowsTheNudgeAndVerifiesOnlyWhenTapped() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        service.verdict = .success(try await AskFixtures.service().verify("x"))
        let model = AskModel(service: service, features: allOn)
        model.draft = "Alain David a voté contre la loi sur la protection des enfants"
        await model.send()
        let exchange = try #require(model.exchanges.first)
        #expect(model.offersVerification(exchange))
        #expect(service.claims.isEmpty)

        await model.verify(exchange.id)
        #expect(service.claims == ["Alain David a voté contre la loi sur la protection des enfants"])
        guard case .done(let verdict) = model.exchanges[0].verification else { Issue.record("no verdict"); return }
        #expect(verdict.verdict == "faux")
        #expect(model.offersVerification(model.exchanges[0]) == false)
    }

    @Test func noNudgeWhenVerificationIsSwitchedOff() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        let model = AskModel(service: service, features: .init(chat: true, verify: false))
        model.draft = "Alain David a voté contre la loi"
        await model.send()
        #expect(model.offersVerification(model.exchanges[0]) == false)
        await model.verify(model.exchanges[0].id)
        #expect(service.claims.isEmpty)
    }

    @Test func noNudgeForAnOrdinaryQuestion() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.tableAnswer()))
        let model = AskModel(service: service, features: allOn)
        model.draft = "Quels textes ont été votés ?"
        await model.send()
        #expect(model.offersVerification(model.exchanges[0]) == false)
    }

    /// With `features.chat` false nothing is sent; the screen shows
    /// `AskUnavailable` instead of an input.
    @Test func aSwitchedOffAssistantSendsNothing() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        let model = AskModel(service: service, features: .init(chat: false, verify: true))
        model.draft = "Quels textes ont été votés ?"
        #expect(model.canSend == false)
        await model.send()
        #expect(service.questions.isEmpty)
        #expect(model.exchanges.isEmpty)
    }

    @Test func tooShortOrTooLongIsNotSent() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        let model = AskModel(service: service, features: allOn)
        model.draft = "  ok  "
        await model.send()
        model.draft = String(repeating: "a", count: 501)
        await model.send()
        #expect(service.questions.isEmpty)
    }

    /// The share sheet gets exactly the URL the API returned.
    @Test func theShareSheetReceivesTheAPIsURL() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        let answer = try await AskFixtures.claimAnswer()
        service.shareURL = .success(try await AskFixtures.service().share(answer))
        let model = AskModel(service: service, features: allOn)
        model.draft = "Alain David a voté contre la loi"
        await model.send()
        await model.share(model.exchanges[0].id)
        #expect(model.sharedLink?.url.absoluteString == "https://mon-elu.vercel.app/chat/s/c3d4e5f6-0000-4000-8000-000000000002")
    }

    @Test func aFailedShareSaysSoAndOpensNoSheet() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        let model = AskModel(service: service, features: allOn)
        model.draft = "Alain David a voté contre la loi"
        await model.send()
        await model.share(model.exchanges[0].id)
        #expect(model.sharedLink == nil)
        #expect(model.exchanges[0].shareFailed)
    }

    @Test func feedbackIsSentOnce() async throws {
        let service = RecordingAskService(answer: .success(try await AskFixtures.claimAnswer()))
        let model = AskModel(service: service, features: allOn)
        model.draft = "Alain David a voté contre la loi"
        await model.send()
        await model.sendFeedback(.up, on: model.exchanges[0].id)
        await model.sendFeedback(.down, on: model.exchanges[0].id)
        #expect(service.feedbacks == [.up])
        #expect(model.exchanges[0].feedback == .sent(.up))
    }

    @Test func aBusyAPIIsTheBusyStateAndCanBeRetried() async throws {
        let service = RecordingAskService(answer: .failure(AskError.busy))
        let model = AskModel(service: service, features: allOn)
        model.draft = "Quels textes ont été votés ?"
        await model.send()
        guard case .failed(.busy) = model.exchanges[0].answer else { Issue.record("not busy"); return }
        service.answer = .success(try await AskFixtures.tableAnswer())
        await model.retry(model.exchanges[0].id)
        #expect(model.exchanges[0].answered != nil)
        #expect(service.questions.count == 2)
    }
}

struct LiveAskServiceTests {
    @Test func searchMapsTheAnswerAndTheSuggestion() async throws {
        let answer = try await AskFixtures.claimAnswer()
        #expect(answer.suggestsVerify)
        #expect(answer.confidence == "high")
        #expect(answer.sources.count == 3)
        #expect(answer.sources[0].route == .vote(id: "VTANR5L17V8414"))
        #expect(answer.sources[1].route == .deputy(id: "PA1008"))
        #expect(answer.sources[1].title == "Alain David")
        #expect(answer.sources[0].title.hasPrefix("l'amendement n° 890"))
        #expect(answer.sources[0].result == "rejeté")
    }

    @Test func verifyMapsTheVerdictAndItsCitations() async throws {
        let verdict = try await AskFixtures.service().verify("x")
        #expect(verdict.verdict == "faux")
        #expect(verdict.deputyID == "PA1008")
        #expect(verdict.citations.map(\.voteID) == ["VTANR5L17V8434"])
        #expect(verdict.citations.first?.date.map(MonEluFormat.day) == "21 juillet 2026")
        #expect(verdict.shareURL?.host() == "mon-elu.vercel.app")
    }

    @Test(arguments: [(429, AskError.busy), (503, AskError.unavailable)])
    func busyAndSwitchedOffAreTheirOwnErrors(_ status: Int, _ expected: AskError) async throws {
        let service = LiveAskService(client: stubClient(Data("{}".utf8), status: .init(code: status)))
        await #expect(throws: expected) { try await service.ask("Quels textes ont été votés ?") }
    }

    @Test func writeEndpointsGetSourcesWithinTheirLimits() {
        let long = ChatSource(id: 0, content: String(repeating: "a", count: 5000), similarity: 1.2)
        let sources = LiveAskService.shareSources(Array(repeating: long, count: 30), limit: 10)
        #expect(sources.count == 10)
        #expect(sources.allSatisfy { $0.content.count == 4000 && $0.similarity == 1 })
    }

    @Test(arguments: [(9, false), (10, true), (500, true), (501, false)])
    func theNudgeOnlyOffersAClaimVerifyAccepts(_ length: Int, _ offered: Bool) {
        let answer = ChatAnswer(
            question: String(repeating: "a", count: length), answer: "", sources: [], confidence: nil,
            dataSource: nil, caveat: nil, suggestsVerify: true
        )
        #expect(answer.canBeVerified == offered)
    }
}

struct ChatMarkdownTests {
    @Test func aTableBecomesHeaderAndRows() {
        let blocks = MarkdownBlock.parse("""
        Voici :

        | Date | Texte |
        |------|-------|
        | 21/07 | **Loi** 【source】 |
        | 17/07 | Article 12 |
        """)
        #expect(blocks == [
            .paragraph("Voici :"),
            .table(header: ["Date", "Texte"], rows: [["21/07", "**Loi**"], ["17/07", "Article 12"]]),
        ])
    }

    @Test func listsAndHeadingsAreBlocks() {
        #expect(MarkdownBlock.parse("## Titre\n- un\n- deux\n\n1. a\n2. b\nFin") == [
            .heading("Titre"), .bullets(["un", "deux"]), .numbered(["a", "b"]), .paragraph("Fin"),
        ])
    }

    @Test func plainTextIsOneParagraph() {
        #expect(MarkdownBlock.parse("Je ne dispose pas de cette information.") == [
            .paragraph("Je ne dispose pas de cette information."),
        ])
    }
}
