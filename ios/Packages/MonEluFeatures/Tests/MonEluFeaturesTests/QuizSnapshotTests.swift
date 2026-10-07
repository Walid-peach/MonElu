import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The Quiz tab in light and dark, at the default and an accessibility text
/// size (#465, design A in #492), from the questions and a `match` result recorded from the
/// production API.
@MainActor
@Suite(.snapshots(record: .missing))
struct QuizSnapshotTests {
    /// The intro, here with a deck left part-way, so "Reprendre" shows.
    @Test(arguments: Variant.all)
    func quizIntro(_ variant: Variant) async throws {
        let questions = try await QuizFixtures.deck()
        checkSnapshot(
            ScrollView { QuizIntroView(questions: questions, resume: (4, {})) {}.padding(16) }
                .background(Palette.pageBackground),
            variant,
            height: variant.size.isAccessibilityCategory ? 2600 : 900
        )
    }

    /// The deck on its second question: progress, the first answer beside
    /// the Assemblée's real vote, the card, and the three answers.
    @Test(arguments: Variant.all)
    func quizDeck(_ variant: Variant) async throws {
        let deck = try await QuizFixtures.deck()
        checkSnapshot(
            QuizDeckView(
                question: deck[1], number: 2, total: deck.count, canGoBack: true,
                lastAnswer: QuizAnswered(question: deck[0], position: .pour),
                onAnswer: { _ in }, onSkip: {}, onBack: {}
            )
            .padding(16),
            variant,
            // A phone's height: at large text the deck scrolls.
            height: 760
        )
    }

    /// The first question: no answer to reveal yet, no way back.
    @Test(arguments: Variant.all)
    func quizDeckFirst(_ variant: Variant) async throws {
        let deck = try await QuizFixtures.deck()
        checkSnapshot(
            QuizDeckView(
                question: deck[0], number: 1, total: deck.count, canGoBack: false,
                onAnswer: { _ in }, onSkip: {}, onBack: {}
            )
            .padding(16),
            variant,
            height: 760
        )
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
            height: variant.size.isAccessibilityCategory ? 2400 : 760
        )
    }

    /// The header and the poster card: the closest deputy and the themes.
    @Test(arguments: Variant.all)
    func quizPoster(_ variant: Variant) async throws {
        let result = try await QuizFixtures.result()
        checkSnapshot(
            QuizResultHeader(result: result).padding(16),
            variant
        )
    }

    /// The share block before and after opting in to include the answers.
    @Test(arguments: Variant.all)
    func quizShare(_ variant: Variant) {
        checkSnapshot(
            VStack(spacing: 32) {
                QuizShareSection(
                    includeAnswers: .constant(false), hasLink: false, isSharing: false, failed: false,
                    onShare: {}
                )
                QuizShareSection(
                    includeAnswers: .constant(true), hasLink: false, isSharing: false, failed: false,
                    onShare: {}
                )
            }
            .padding(16),
            variant
        )
    }
}
