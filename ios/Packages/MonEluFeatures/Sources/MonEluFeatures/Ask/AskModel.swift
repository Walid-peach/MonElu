import Foundation
import MonEluCore
import Observation

/// Why a request failed, in the terms the conversation shows.
public enum AskFailure: Equatable, Sendable {
    case offline, server
    /// Too many requests; wait a minute.
    case busy
    /// The AI service is switched off or unavailable.
    case unavailable

    init(_ error: any Error) {
        switch error as? AskError {
        case .busy: self = .busy
        case .unavailable: self = .unavailable
        case nil: self = LoadFailure(error) == .offline ? .offline : .server
        }
    }
}

/// One question and everything that followed it.
public struct ChatExchange: Identifiable, Sendable {
    public enum Answer: Sendable {
        /// A claim sent in "Vérifier une affirmation": no answer is asked
        /// for, only the verdict.
        case notAsked
        case pending
        case answered(ChatAnswer)
        case failed(AskFailure)
    }

    public enum Verification: Sendable {
        case none, pending
        case done(Verdict)
        case failed(AskFailure)
    }

    public enum Feedback: Sendable, Equatable {
        case none, sending
        case sent(ChatFeedback)
        case failed
    }

    public let id: Int
    public let question: String
    /// Sent as a claim to verify rather than a question to answer.
    public let isClaim: Bool
    public internal(set) var answer: Answer = .pending
    public internal(set) var verification: Verification = .none
    public internal(set) var feedback: Feedback = .none
    public internal(set) var isSharing = false
    public internal(set) var shareFailed = false

    public init(id: Int, question: String, isClaim: Bool = false) {
        self.id = id
        self.question = question
        self.isClaim = isClaim
        if isClaim { answer = .notAsked }
    }

    var answered: ChatAnswer? {
        if case .answered(let answer) = answer { answer } else { nil }
    }
}

/// A URL the share sheet presents, identified so `.sheet(item:)` can show it.
public struct SharedLink: Identifiable, Hashable, Sendable {
    public let url: URL
    public var id: URL { url }
}

/// The Demander tab's state: the conversation, in memory only, and the
/// feature switches from `/app/config` that gate it.
@MainActor
@Observable
public final class AskModel {
    /// The `search` input bounds.
    public static let questionLength = 5...500

    /// What the composer sends: a question to answer, or a claim to verify
    /// directly (ADR-023), without waiting for the nudge.
    public enum Mode: String, CaseIterable, Sendable {
        case question, claim

        public var title: String {
            switch self {
            case .question: "Question"
            case .claim: "Vérifier une affirmation"
            }
        }
    }

    public var draft = ""
    public var mode: Mode = .question
    public private(set) var exchanges: [ChatExchange] = []
    /// Set when the API returned a share URL; the share sheet presents it.
    public var sharedLink: SharedLink?
    /// From `/app/config`; the screen keeps it current.
    public var features: AppConfiguration.Features

    private let service: any AskService
    private var nextID = 0

    public init(service: any AskService, features: AppConfiguration.Features) {
        self.service = service
        self.features = features
    }

    public var isWaiting: Bool {
        exchanges.contains {
            if case .pending = $0.answer { return true }
            if case .pending = $0.verification { return true }
            return false
        }
    }

    public var canSend: Bool {
        guard features.chat, !isWaiting else { return false }
        switch effectiveMode {
        case .question: return Self.questionLength.contains(trimmedDraft.count)
        case .claim: return ChatAnswer.claimLength.contains(trimmedDraft.count)
        }
    }

    /// The mode in force: "Vérifier" falls back to a question while
    /// verification is switched off (`/app/config`).
    public var effectiveMode: Mode { features.verify ? mode : .question }

    private var trimmedDraft: String { draft.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Asks the draft. Does nothing while the assistant is switched off: the
    /// screen shows why instead of an input.
    public func send() async {
        guard canSend else { return }
        let text = trimmedDraft
        let isClaim = effectiveMode == .claim
        draft = ""
        nextID += 1
        exchanges.append(ChatExchange(id: nextID, question: text, isClaim: isClaim))
        if isClaim {
            await runVerification(nextID)
        } else {
            await answer(nextID)
        }
    }

    public func retry(_ id: Int) async {
        guard features.chat, let index = index(id) else { return }
        if exchanges[index].isClaim {
            guard features.verify, case .failed = exchanges[index].verification else { return }
            await runVerification(id)
            return
        }
        guard case .failed = exchanges[index].answer else { return }
        exchanges[index].answer = .pending
        await answer(id)
    }

    /// Starts a new conversation; not while a request is under way.
    public func clear() {
        guard !isWaiting else { return }
        exchanges = []
    }

    /// Whether to offer verifying this exchange's question (ADR-023): the
    /// API flagged it as a claim, verification is switched on, its length is
    /// one `verify` accepts, and it has not been verified yet.
    public func offersVerification(_ exchange: ChatExchange) -> Bool {
        guard features.verify, let answer = exchange.answered, answer.canBeVerified else { return false }
        if case .none = exchange.verification { return true }
        if case .failed = exchange.verification { return true }
        return false
    }

    /// Runs `verify` on the exchange's question. Only ever called from the
    /// nudge the user tapped.
    public func verify(_ id: Int) async {
        guard let index = index(id), offersVerification(exchanges[index]) else { return }
        await runVerification(id)
    }

    /// Runs `verify` on the exchange's text: a claim the user sent as one, or
    /// a question whose nudge they tapped.
    private func runVerification(_ id: Int) async {
        guard let index = index(id) else { return }
        let claim = exchanges[index].question
        exchanges[index].verification = .pending
        let result: ChatExchange.Verification
        do {
            result = .done(try await service.verify(claim))
        } catch {
            result = .failed(AskFailure(error))
        }
        if let index = self.index(id) { exchanges[index].verification = result }
    }

    /// Asks the API for this answer's share URL, then hands it to the share sheet.
    public func share(_ id: Int) async {
        guard let index = index(id), let answer = exchanges[index].answered, !exchanges[index].isSharing else { return }
        exchanges[index].isSharing = true
        exchanges[index].shareFailed = false
        do {
            let url = try await service.share(answer)
            sharedLink = SharedLink(url: url)
            if let index = self.index(id) { exchanges[index].isSharing = false }
        } catch {
            if let index = self.index(id) {
                exchanges[index].isSharing = false
                exchanges[index].shareFailed = true
            }
        }
    }

    public func sendFeedback(_ vote: ChatFeedback, on id: Int) async {
        guard let index = index(id), let answer = exchanges[index].answered else { return }
        switch exchanges[index].feedback {
        case .none, .failed: break
        case .sending, .sent: return
        }
        exchanges[index].feedback = .sending
        let result: ChatExchange.Feedback
        do {
            try await service.feedback(vote, on: answer)
            result = .sent(vote)
        } catch {
            result = .failed
        }
        if let index = self.index(id) { exchanges[index].feedback = result }
    }

    private func answer(_ id: Int) async {
        guard let index = index(id) else { return }
        let question = exchanges[index].question
        let result: ChatExchange.Answer
        do {
            result = .answered(try await service.ask(question))
        } catch {
            result = .failed(AskFailure(error))
        }
        if let index = self.index(id) { exchanges[index].answer = result }
    }

    private func index(_ id: Int) -> Int? {
        exchanges.firstIndex { $0.id == id }
    }
}
