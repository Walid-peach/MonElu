import Foundation
import MonEluCore
import Observation

/// The Quiz tab's state: where the user is in the deck, their answers (in
/// memory only, for the session), the result, and the share opt-in.
@MainActor
@Observable
public final class QuizModel {
    /// The fewest answers `match` accepts.
    public static let minimumAnswers = 3

    public enum Phase: Equatable, Sendable {
        case intro
        case questions
        /// Fewer than `minimumAnswers` answers at the end of the deck.
        case notEnough
        case result
    }

    public let questions: Loader<[QuizQuestion]>
    public private(set) var phase: Phase = .intro
    /// The question on top of the deck.
    public private(set) var index = 0
    public private(set) var answers: [String: QuizPosition] = [:]
    public private(set) var result: Loader<QuizResult>?
    /// Off unless the user turns it on (ADR-028); it stores the answers in
    /// the public snapshot.
    public var includeAnswers = false
    public private(set) var isSharing = false
    public private(set) var shareFailed = false
    /// Set when the API returned a share URL; the share sheet presents it.
    public var sharedLink: SharedLink?
    /// The question just answered and the answer, so the next card can show
    /// how the Assemblée really voted: the tallies are revealed only once the
    /// user has answered.
    public private(set) var lastAnswer: QuizAnswered?

    private let service: any QuizService
    /// The indexes visited, so Back returns along the same path.
    private var history: [Int] = []
    /// The share URL already created for these answers, reused on a second tap.
    private var shareURL: URL?

    public init(service: any QuizService) {
        self.service = service
        questions = Loader(isEmpty: { $0.isEmpty }, fetch: { try await service.questions() })
    }

    var deck: [QuizQuestion] { questions.state.value ?? [] }

    public var current: QuizQuestion? {
        deck.indices.contains(index) ? deck[index] : nil
    }

    public var canGoBack: Bool { !history.isEmpty }

    /// The answers in question order, as `match` and `share` receive them.
    public var orderedAnswers: [QuizAnswer] {
        deck.compactMap { question in answers[question.voteID].map { QuizAnswer(voteID: question.voteID, position: $0) } }
    }

    /// Whether the share link exists already, which fixes what it holds.
    public var hasShareLink: Bool { shareURL != nil }

    /// Whether the intro offers to pick the deck up again: the user left it
    /// part-way, with answers kept in memory for the session.
    public var canResume: Bool { phase == .intro && current != nil && !answers.isEmpty }

    public func start() {
        reset()
        phase = .questions
    }

    public func answer(_ position: QuizPosition) {
        guard let current else { return }
        answers[current.voteID] = position
        lastAnswer = QuizAnswered(question: current, position: position)
        advance()
    }

    /// Moves on without answering; the question does not count.
    public func skip() {
        guard let current else { return }
        answers[current.voteID] = nil
        lastAnswer = nil
        advance()
    }

    /// Returns to the previous question and clears its answer.
    public func back() {
        guard let previous = history.popLast() else { return }
        index = previous
        if let question = current { answers[question.voteID] = nil }
        lastAnswer = nil
        phase = .questions
    }

    /// Leaves the deck for the intro, keeping the answers so far.
    public func quit() {
        phase = .intro
    }

    /// Back into the deck where the user left it.
    public func continueDeck() {
        guard current != nil else { return }
        phase = .questions
    }

    /// Back to the deck from "not enough", at its first question.
    public func resume() {
        history = []
        index = 0
        phase = .questions
    }

    public func restart() {
        reset()
        phase = .intro
    }

    public func share() async {
        guard !isSharing, phase == .result else { return }
        if let shareURL {
            sharedLink = SharedLink(url: shareURL)
            return
        }
        isSharing = true
        shareFailed = false
        defer { isSharing = false }
        do {
            let url = try await service.share(orderedAnswers, includeAnswers: includeAnswers)
            shareURL = url
            sharedLink = SharedLink(url: url)
        } catch {
            shareFailed = true
        }
    }

    private func advance() {
        history.append(index)
        index += 1
        if index >= deck.count { finish() }
    }

    private func finish() {
        guard answers.count >= Self.minimumAnswers else {
            phase = .notEnough
            return
        }
        let answers = orderedAnswers, service = service
        result = Loader { try await service.match(answers) }
        phase = .result
    }

    private func reset() {
        lastAnswer = nil
        index = 0
        history = []
        answers = [:]
        result = nil
        includeAnswers = false
        shareURL = nil
        shareFailed = false
        sharedLink = nil
    }
}
