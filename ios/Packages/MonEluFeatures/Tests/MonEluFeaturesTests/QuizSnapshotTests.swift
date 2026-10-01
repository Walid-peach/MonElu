import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The Quiz tab in light and dark, at the default and an accessibility text
/// size (#465), from the questions and a `match` result recorded from the
/// production API.
@MainActor
@Suite(.snapshots(record: .missing))
struct QuizSnapshotTests {
    @Test(arguments: Variant.all)
    func quizIntro(_ variant: Variant) {
        checkSnapshot(QuizIntroView(count: 10) {}.padding(16), variant)
    }

    /// The deck on its first question: progress, card, and the three answers.
    @Test(arguments: Variant.all)
    func quizDeck(_ variant: Variant) async throws {
        let question = try #require(try await QuizFixtures.deck().first)
        checkSnapshot(
            QuizDeckView(
                question: question, number: 1, total: 10, canGoBack: false,
                onAnswer: { _ in }, onSkip: {}, onBack: {}
            )
            .padding(16),
            variant,
            height: variant.size.isAccessibilityCategory ? 1500 : 760
        )
    }

    /// A card with the real vote opened: result, date and the API's tallies.
    @Test(arguments: Variant.all)
    func quizCardDetails(_ variant: Variant) async throws {
        let question = try #require(try await QuizFixtures.deck().first)
        checkSnapshot(QuizCardView(question: question, showsDetails: true).padding(16), variant)
    }

    @Test(arguments: Variant.all)
    func quizNotEnough(_ variant: Variant) {
        checkSnapshot(QuizNotEnoughView(answered: 2) {}.padding(16), variant)
    }

    /// Rows open the deputy's profile, so the result sits in a stack.
    @Test(arguments: Variant.all)
    func quizResult(_ variant: Variant) async throws {
        let full = try await QuizFixtures.result()
        // Two deputies and two groups show every row case at a size the
        // repository accepts.
        let result = QuizResult(
            answered: full.answered, eligibleDeputies: full.eligibleDeputies,
            topMatches: Array(full.topMatches.prefix(2)), opposite: full.opposite,
            groups: Array(full.groups.prefix(2)),
            supportedThemes: full.supportedThemes, opposedThemes: full.opposedThemes
        )
        checkSnapshot(
            NavigationStack {
                ScrollView { QuizResultContent(result: result).padding(16) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 2400 : 1180
        )
    }

    /// The share block before and after opting in to include the answers.
    @Test(arguments: Variant.all)
    func quizShare(_ variant: Variant) {
        checkSnapshot(
            VStack(spacing: 32) {
                QuizShareSection(
                    includeAnswers: .constant(false), hasLink: false, isSharing: false, failed: false,
                    onShare: {}, onRestart: {}
                )
                QuizShareSection(
                    includeAnswers: .constant(true), hasLink: false, isSharing: false, failed: false,
                    onShare: {}, onRestart: {}
                )
            }
            .padding(16),
            variant
        )
    }
}
