@testable import MonElu
import MonEluCore
import MonEluFeatures
import SwiftUI
import Testing

/// Never reach the network: the root view only needs services to hold.
private struct NoVotes: VotesService {
    func votes(_ query: VoteQuery) async throws -> VotePage { VotePage(items: [], nextCursor: nil) }
    func vote(id: String) async throws -> VoteDetail { throw URLError(.badServerResponse) }
}

private struct NoDeputies: DeputiesService {
    func deputies(_ query: DeputyQuery) async throws -> DeputyPage { DeputyPage(items: [], total: 0, offset: 0) }
    func profile(id: String) async throws -> DeputyProfile { throw URLError(.badServerResponse) }
    func scorecard(id: String) async throws -> DeputyScorecard { throw URLError(.badServerResponse) }
    func recentVotes(id: String) async throws -> [DeputyVote] { throw URLError(.badServerResponse) }
    func votes(id: String, since: Date) async throws -> [DeputyVote] { throw URLError(.badServerResponse) }
    func departmentDeputies(code: String) async throws -> [DeputyItem] { [] }
}

private struct NoAsk: AskService {
    func ask(_ question: String) async throws -> ChatAnswer { throw URLError(.badServerResponse) }
    func verify(_ claim: String) async throws -> Verdict { throw URLError(.badServerResponse) }
    func share(_ answer: ChatAnswer) async throws -> URL { throw URLError(.badServerResponse) }
    func feedback(_ vote: ChatFeedback, on answer: ChatAnswer) async throws {}
}

private struct NoQuiz: QuizService {
    func questions() async throws -> [QuizQuestion] { [] }
    func match(_ answers: [QuizAnswer]) async throws -> QuizResult { throw URLError(.badServerResponse) }
    func share(_ answers: [QuizAnswer], includeAnswers: Bool) async throws -> URL { throw URLError(.badServerResponse) }
}

private struct NoLois: LoisService {
    func loi(id: String) async throws -> Loi? { nil }
    func nextSitting(dossierID: String, after now: Date) async throws -> LoiNextSitting? { nil }
    func amendements(dossierID: String, acteID: String?) async throws -> LoiAmendements { LoiAmendements(total: 0, items: []) }
}

private struct NoAgenda: AgendaService {
    func week(from: String, to: String) async throws -> AgendaWeek { AgendaWeek(from: from, to: to, days: []) }
}

private struct NoPostalCodes: PostalCodeService {
    func departments(forPostalCode code: String) async throws -> [PostalDepartment] { [] }
}

@MainActor
struct RootTabViewTests {
    @Test func rendersInAHostingController() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let controller = UIHostingController(rootView: RootTabView(services: AppServices(
            votes: NoVotes(), deputies: NoDeputies(), lois: NoLois(), agenda: NoAgenda(), ask: NoAsk(), quiz: NoQuiz(), postalCodes: NoPostalCodes(),
            followedDeputy: UserDefaultsFollowedDeputyStore(defaults: UserDefaults(suiteName: "RootTabViewTests")!)
        )))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        #expect(controller.view.subviews.isEmpty == false)
    }

    /// Accueil, Explorer, Quiz, Demander (#477).
    @Test func showsFourTabsInOrder() {
        #expect(AppTab.allCases == [.home, .explore, .quiz, .ask])
    }
}
