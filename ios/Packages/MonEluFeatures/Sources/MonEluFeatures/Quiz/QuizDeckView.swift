import MonEluCore
import MonEluUI
import SwiftUI

/// One question card (design A): theme, the question and its context, with
/// the swipe directions at the foot. The scrutin's real tallies are not on
/// it: they are revealed only once the user has answered (`QuizRevealView`).
struct QuizCardView: View {
    let question: QuizQuestion

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(question.theme)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text(question.question)
                .font(Typography.heading(.title))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(question.context)
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            ViewThatFits(in: .horizontal) {
                HStack {
                    Label("Contre", systemImage: "chevron.left")
                    Spacer(minLength: 8)
                    Text("Glissez ou touchez")
                    Spacer(minLength: 8)
                    HStack(spacing: 4) {
                        Text("Pour")
                        Image(systemName: "chevron.right")
                    }
                }
                Text("Glissez ou touchez")
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Palette.textSecondary)
            .accessibilityHidden(true)
        }
        .padding(22)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
    }
}

/// How the Assemblée really voted on the question just answered, beside the
/// user's own answer. The tallies are the API's; no percentage is derived.
struct QuizRevealView: View {
    let answered: QuizAnswered

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            // Each label stays with its badge, and the pairs wrap at large text.
            FlowLayout(spacing: 10) {
                HStack(spacing: 6) {
                    Text("Vous :")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                    VotePositionBadge(position: answered.position.rawValue)
                }
                .fixedSize()
                if let result = answered.question.result {
                    HStack(spacing: 6) {
                        Text("L'Assemblée :")
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                        VoteResultBadge(result: result)
                    }
                    .fixedSize()
                }
            }
            if let pour = answered.question.votesFor, let contre = answered.question.votesAgainst {
                Text(tallies(pour, contre, answered.question.abstentions))
                    .font(.footnote.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("quiz.reveal")
        // An answer given through a VoiceOver action moves straight to the
        // next card, so the real vote is read out.
        .onAppear { announce() }
        .onChange(of: answered) { announce() }
    }

    private func announce() {
        var text = "Vous : \(VotePositionBadge.label(answered.position.rawValue))."
        if let result = answered.question.result { text += " L'Assemblée : \(result)." }
        if let pour = answered.question.votesFor, let contre = answered.question.votesAgainst {
            text += " " + tallies(pour, contre, answered.question.abstentions)
        }
        AccessibilityNotification.Announcement(text).post()
    }

    /// "291 pour · 241 contre · 12 abstentions".
    private func tallies(_ pour: Int, _ contre: Int, _ abstentions: Int?) -> String {
        var parts = ["\(MonEluFormat.count(pour)) pour", "\(MonEluFormat.count(contre)) contre"]
        if let abstentions {
            parts.append("\(MonEluFormat.count(abstentions)) abstention\(abstentions > 1 ? "s" : "")")
        }
        return parts.joined(separator: " · ")
    }
}

/// The deck: swipe right for pour, left for contre, down for abstention, as
/// on the website (MON-186). The buttons, and VoiceOver's actions, answer the
/// same way, so a swipe is never required.
struct QuizDeckView: View {
    let question: QuizQuestion
    let number: Int
    let total: Int
    let canGoBack: Bool
    var lastAnswer: QuizAnswered?
    let onAnswer: (QuizPosition) -> Void
    let onSkip: () -> Void
    let onBack: () -> Void
    var onQuit: () -> Void = {}

    @State private var offset: CGSize = .zero
    @State private var committing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    /// A drag commits past this distance, or when flung past `flingDistance`.
    static let commitDistance: CGFloat = 100
    static let flingDistance: CGFloat = 300

    var body: some View {
        // At large text the deck no longer fits a screen: it scrolls, and the
        // card takes its natural height instead of the space left.
        if typeSize.isAccessibilitySize {
            ScrollView { content }
        } else {
            content
        }
    }

    private var content: some View {
        VStack(spacing: 14) {
            header
            if let lastAnswer { QuizRevealView(answered: lastAnswer) }
            deck
            buttons
            Button("Passer cette question", action: onSkip)
                .font(.subheadline.weight(.semibold))
                .tint(Palette.textSecondary)
                .frame(minHeight: 44)
                .accessibilityIdentifier("quiz.skip")
        }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 8) {
            // Always laid out, so the progress keeps its width from question 1.
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .frame(width: 44, height: 44)
            }
            .tint(Palette.textPrimary)
            .opacity(canGoBack ? 1 : 0)
            .disabled(!canGoBack)
            .accessibilityHidden(!canGoBack)
            .accessibilityLabel("Revenir à la question précédente")
            VStack(alignment: .leading, spacing: 6) {
                Text("Question \(number) sur \(total)")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textSecondary)
                QuizProgress(current: number, total: total)
            }
            Button(action: onQuit) {
                Image(systemName: "xmark")
                    .font(.body.weight(.medium))
                    .frame(width: 44, height: 44)
            }
            .tint(Palette.textSecondary)
            .accessibilityLabel("Quitter le quiz")
            .accessibilityIdentifier("quiz.quit")
        }
    }

    /// The card on two ghost cards, so it reads as a deck.
    private var deck: some View {
        ZStack {
            if !typeSize.isAccessibilitySize {
                ghost(inset: 20, drop: 16, opacity: 0.55)
                ghost(inset: 10, drop: 8, opacity: 0.8)
            }
            QuizCardView(question: question)
                .id(question.id)
                .overlay(alignment: .topLeading) { stamp("pour", opacity: offset.width / Self.commitDistance, angle: -12) }
                .overlay(alignment: .topTrailing) { stamp("contre", opacity: -offset.width / Self.commitDistance, angle: 12) }
                .overlay(alignment: .bottom) { stamp("abstention", opacity: abstentionOpacity, angle: 0) }
                .offset(offset)
                .rotationEffect(.degrees(Double(offset.width) / 20))
                .gesture(drag)
                .accessibilityElement(children: .contain)
                .accessibilityHint("Balayez à droite pour, à gauche contre, vers le bas abstention.")
                .accessibilityActions {
                    ForEach(QuizPosition.allCases, id: \.self) { position in
                        Button(VotePositionBadge.label(position.rawValue)) { onAnswer(position) }
                    }
                    Button("Passer cette question", action: onSkip)
                }
                .accessibilityIdentifier("quiz.card")
        }
        .padding(.bottom, typeSize.isAccessibilitySize ? 0 : 16)
        .frame(maxHeight: typeSize.isAccessibilitySize ? nil : .infinity)
    }

    private func ghost(inset: CGFloat, drop: CGFloat, opacity: Double) -> some View {
        RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(Palette.cardBackground)
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
            .padding(.horizontal, inset)
            .offset(y: drop)
            .opacity(opacity)
            .accessibilityHidden(true)
    }

    /// Contre, Abstention, Pour side by side; at large text, three rows.
    private var buttons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { answerButtons }
            VStack(spacing: 10) { answerButtons }
        }
    }

    @ViewBuilder private var answerButtons: some View {
        answerButton(.contre)
        answerButton(.abstention)
        answerButton(.pour)
    }

    /// Contre and Pour filled, as the design draws them, Abstention outlined.
    /// Pour fills with `positiveText`, not the lighter `positive`: white on
    /// that misses 4.5:1 (#530). `onAccent` turns navy in dark mode, where
    /// the fills are lighter.
    private func answerButton(_ position: QuizPosition) -> some View {
        let (foreground, background): (Color, Color) = switch position {
        case .contre: (Palette.onAccent, Palette.negative)
        case .pour: (Palette.onAccent, Palette.positiveText)
        default: (Palette.textPrimary, Palette.cardBackground)
        }
        return Button { commit(position) } label: {
            Text(VotePositionBadge.label(position.rawValue))
                .font(.body.weight(.semibold))
                .fixedSize()
                .padding(.horizontal, 8)
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(foreground)
                .background(background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(position == .abstention ? Palette.border : .clear, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .disabled(committing)
        .accessibilityIdentifier("quiz.answer.\(position.rawValue)")
    }

    private func stamp(_ position: String, opacity: CGFloat, angle: Double) -> some View {
        let (foreground, _) = VotePositionBadge.colors(position)
        return Text(VotePositionBadge.label(position).uppercased())
            .font(.title.weight(.heavy))
            .foregroundStyle(foreground)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(foreground, lineWidth: 3))
            .rotationEffect(.degrees(angle))
            .padding(18)
            .opacity(Double(min(max(opacity, 0), 1)))
            .accessibilityHidden(true)
    }

    /// Down only counts while the drag is mostly vertical.
    private var abstentionOpacity: CGFloat {
        abs(offset.width) < 60 ? (offset.height - 30) / (Self.commitDistance - 30) : 0
    }

    private var drag: some Gesture {
        DragGesture()
            .onChanged { value in
                guard !committing else { return }
                offset = value.translation
            }
            .onEnded { value in
                guard !committing else { return }
                if let position = Self.position(for: value.translation, predicted: value.predictedEndTranslation) {
                    commit(position)
                } else {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.7)) { offset = .zero }
                }
            }
    }

    /// Which answer a drag means, if any. Horizontal wins when it dominates,
    /// so a diagonal fling is never read as abstention.
    static func position(for translation: CGSize, predicted: CGSize) -> QuizPosition? {
        let horizontal = abs(translation.width) >= translation.height
        if horizontal, translation.width > commitDistance || predicted.width > flingDistance { return .pour }
        if horizontal, translation.width < -commitDistance || predicted.width < -flingDistance { return .contre }
        if !horizontal, translation.height > commitDistance || predicted.height > flingDistance { return .abstention }
        return nil
    }

    /// Sends the card off in its direction, then answers. With Reduce Motion
    /// the answer is immediate.
    private func commit(_ position: QuizPosition) {
        guard !reduceMotion else {
            offset = .zero
            onAnswer(position)
            return
        }
        committing = true
        let target: CGSize = switch position {
        case .pour: CGSize(width: 600, height: offset.height)
        case .contre: CGSize(width: -600, height: offset.height)
        case .abstention: CGSize(width: offset.width, height: 900)
        }
        withAnimation(.easeIn(duration: 0.22)) { offset = target }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(220))
            onAnswer(position)
            offset = .zero
            committing = false
        }
    }
}

/// One segment per question, those reached in the accent.
struct QuizProgress: View {
    let current: Int
    let total: Int

    var body: some View {
        HStack(spacing: 3) {
            ForEach(0..<max(total, 1), id: \.self) { index in
                Capsule(style: .circular)
                    .fill(index < current ? Palette.accent : Palette.trackBackground)
                    .frame(height: 4)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Question \(current) sur \(total)")
    }
}
