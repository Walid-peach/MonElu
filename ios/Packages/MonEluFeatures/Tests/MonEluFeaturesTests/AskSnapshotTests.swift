import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The Demander tab in light and dark, at the default and an accessibility
/// text size (#464). Answers are responses recorded from the production API;
/// the verdict, which the API stores, is written from its schema.
@MainActor
@Suite(.snapshots(record: .missing))
struct AskSnapshotTests {
    /// Sources and verdict citations are links, so the conversation sits in a
    /// stack and a scroll view as in the app.
    func conversation(_ exchanges: [ChatExchange], features: AppConfiguration.Features = allOn) -> some View {
        let model = AskModel(service: RecordingAskService(answer: .failure(URLError(.badServerResponse))), features: features)
        return NavigationStack {
            ScrollView {
                AskConversation(
                    exchanges: exchanges, offersVerification: { model.offersVerification($0) },
                    onRetry: { _ in }, onVerify: { _ in }, onShare: { _ in }, onFeedback: { _, _ in }
                )
                .padding(16)
            }
            .background(Palette.pageBackground)
        }
    }

    func exchange(_ answer: ChatExchange.Answer, question: String) -> ChatExchange {
        var exchange = ChatExchange(id: 1, question: question)
        exchange.answer = answer
        return exchange
    }

    @Test(arguments: Variant.all)
    func askIntro(_ variant: Variant) {
        checkSnapshot(AskIntro().padding(16), variant)
    }

    @Test(arguments: Variant.all)
    func askUnavailable(_ variant: Variant) {
        checkSnapshot(AskUnavailable(), variant, height: 420)
    }

    /// A claim: the answer, its sources, and the nudge (not yet tapped).
    @Test(arguments: Variant.all)
    func askClaimWithNudge(_ variant: Variant) async throws {
        let answer = try await AskFixtures.claimAnswer()
        checkSnapshot(
            conversation([exchange(.answered(answer), question: answer.question)]),
            variant,
            height: variant.size.isAccessibilityCategory ? 2000 : 900
        )
    }

    /// An answer written as a table becomes one card per row.
    @Test(arguments: Variant.all)
    func askTableAnswer(_ variant: Variant) async throws {
        let full = try await AskFixtures.tableAnswer()
        // Two rows, and no sources (the claim's snapshot shows them), keep
        // the image a reviewable length.
        let lines = full.answer.components(separatedBy: "\n")
        let trimmed = ChatAnswer(
            question: full.question, answer: lines.prefix(6).joined(separator: "\n"),
            sources: [], confidence: full.confidence,
            dataSource: full.dataSource, caveat: full.caveat, suggestsVerify: false
        )
        checkSnapshot(
            conversation([exchange(.answered(trimmed), question: full.question)]),
            variant,
            height: variant.size.isAccessibilityCategory ? 2000 : 860
        )
    }

    /// After the nudge was tapped: the verdict with its citation.
    @Test(arguments: Variant.all)
    func askVerdict(_ variant: Variant) async throws {
        let verdict = try await AskFixtures.service().verify("x")
        checkSnapshot(
            NavigationStack { ScrollView { VerdictCard(verdict: verdict).padding(16) }.background(Palette.pageBackground) },
            variant,
            height: variant.size.isAccessibilityCategory ? 1500 : 560
        )
    }

    /// Waiting for an answer, and a busy API after the retries gave up.
    @Test(arguments: Variant.all)
    func askPendingAndBusy(_ variant: Variant) {
        var busy = ChatExchange(id: 2, question: "Quels textes ont été votés cette semaine ?")
        busy.answer = .failed(.busy)
        checkSnapshot(
            AskConversation(
                exchanges: [ChatExchange(id: 1, question: "Qui est mon député ?"), busy],
                offersVerification: { _ in false },
                onRetry: { _ in }, onVerify: { _ in }, onShare: { _ in }, onFeedback: { _, _ in }
            )
            .padding(16),
            variant
        )
    }
}
