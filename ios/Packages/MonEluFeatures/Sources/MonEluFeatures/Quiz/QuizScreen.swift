import MonEluCore
import MonEluUI
import SwiftUI

/// The Quiz tab (web: `/quiz`, ADR-025, ADR-028): answer the curated
/// scrutins, see which deputies and groups vote like you, share the result.
public struct QuizScreen: View {
    @State private var model: QuizModel

    public init(service: any QuizService) {
        _model = State(initialValue: QuizModel(service: service))
    }

    public var body: some View {
        LoadStateView(
            model.questions,
            empty: EmptyStateView(title: "Quiz indisponible", message: "Aucune question n'est disponible pour le moment.")
        ) { questions in
            content(questions)
        }
        .navigationTitle("Quiz")
        .accessibilityIdentifier("screen.quiz")
        .sheet(item: $model.sharedLink) { link in
            ActivitySheet(url: link.url)
                .presentationDetents([.medium, .large])
        }
    }

    @ViewBuilder private func content(_ questions: [QuizQuestion]) -> some View {
        switch model.phase {
        case .intro:
            ScrollView {
                QuizIntroView(count: questions.count) { model.start() }
                    .padding(16)
            }
        case .questions:
            if let question = model.current {
                QuizDeckView(
                    question: question, number: model.index + 1, total: questions.count, canGoBack: model.canGoBack,
                    onAnswer: { model.answer($0) }, onSkip: { model.skip() }, onBack: { model.back() }
                )
                .padding(16)
            }
        case .notEnough:
            ScrollView {
                QuizNotEnoughView(answered: model.answers.count) { model.resume() }
                    .padding(16)
            }
        case .result:
            if let result = model.result {
                LoadStateView(
                    result,
                    empty: EmptyStateView(title: "Aucun résultat", message: "Le résultat n'a pas pu être calculé.")
                ) { result in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 28) {
                            QuizResultContent(result: result)
                            QuizShareSection(
                                includeAnswers: $model.includeAnswers, hasLink: model.hasShareLink,
                                isSharing: model.isSharing, failed: model.shareFailed,
                                onShare: { Task { await model.share() } }, onRestart: { model.restart() }
                            )
                        }
                        .padding(16)
                    }
                }
            }
        }
    }
}
