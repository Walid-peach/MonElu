import MonEluCore
import MonEluUI
import SwiftUI

/// One question card: theme, the question, its context, and the scrutin's
/// real outcome on request.
struct QuizCardView: View {
    let question: QuizQuestion
    @State private var showsDetails: Bool

    init(question: QuizQuestion, showsDetails: Bool = false) {
        self.question = question
        _showsDetails = State(initialValue: showsDetails)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(question.theme.uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.2)
                .foregroundStyle(Palette.accent)
                .padding(.horizontal, 12)
                .padding(.vertical, 4)
                .overlay(Capsule().strokeBorder(Palette.accent, lineWidth: 1.5))
            Text(question.question)
                .font(Typography.heading(.title2))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(question.context)
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if showsDetails {
                details
            }
            Button {
                showsDetails.toggle()
            } label: {
                Text(showsDetails ? "Masquer les détails" : "Détails du scrutin")
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .font(.footnote.weight(.semibold))
            .buttonStyle(.bordered)
            .tint(Palette.textSecondary)
        }
        .padding(22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
    }

    /// The real vote, as the API's tallies give it; no percentage is derived.
    @ViewBuilder private var details: some View {
        if let result = question.result {
            VStack(alignment: .leading, spacing: 8) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 8) { outcome(result) }
                    VStack(alignment: .leading, spacing: 4) { outcome(result) }
                }
                // On one line when it fits, one tally per line at large text.
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) { tallies }
                    VStack(alignment: .leading, spacing: 6) { tallies }
                }
            }
        } else {
            Text("Résultat du scrutin indisponible pour ce texte.")
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
        }
    }

    @ViewBuilder private func outcome(_ result: String) -> some View {
        VoteResultBadge(result: result)
        if let date = question.voteDate {
            Text(MonEluFormat.day(date))
                .font(.caption)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize()
        }
    }

    @ViewBuilder private var tallies: some View {
        tally("pour", question.votesFor)
        tally("contre", question.votesAgainst)
        tally("abstention", question.abstentions)
    }

    @ViewBuilder private func tally(_ position: String, _ count: Int?) -> some View {
        if let count {
            HStack(spacing: 4) {
                VotePositionBadge(position: position)
                Text(MonEluFormat.count(count))
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(Palette.textPrimary)
            }
            .fixedSize()
            .accessibilityElement(children: .combine)
        }
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
    let onAnswer: (QuizPosition) -> Void
    let onSkip: () -> Void
    let onBack: () -> Void

    @State private var offset: CGSize = .zero
    @State private var committing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// A drag commits past this distance, or when flung past `flingDistance`.
    static let commitDistance: CGFloat = 100
    static let flingDistance: CGFloat = 300

    var body: some View {
        VStack(spacing: 16) {
            header
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
            Spacer(minLength: 0)
            buttons
            Button("Passer cette question", action: onSkip)
                .font(.subheadline.weight(.medium))
                .tint(Palette.textSecondary)
                .accessibilityIdentifier("quiz.skip")
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            HStack {
                Button(action: onBack) {
                    Label("Revenir à la question précédente", systemImage: "chevron.left")
                        .labelStyle(.iconOnly)
                }
                .disabled(!canGoBack)
                .tint(Palette.textPrimary)
                Spacer()
                Text("Question \(number) sur \(total)")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textSecondary)
                Spacer()
                // Balances the back button so the count stays centred.
                Image(systemName: "chevron.left").hidden().accessibilityHidden(true)
            }
            ProgressView(value: Double(number - 1), total: Double(max(total, 1)))
                .tint(Palette.accent)
                .accessibilityHidden(true)
        }
    }

    /// Three round buttons in a row; at large text, where their labels no
    /// longer fit under them, three full-width rows.
    private var buttons: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 28) { answerButtons(stacked: false) }
            VStack(spacing: 10) { answerButtons(stacked: true) }
        }
    }

    @ViewBuilder private func answerButtons(stacked: Bool) -> some View {
        answerButton(.contre, systemImage: "xmark", stacked: stacked)
        answerButton(.abstention, systemImage: "minus", stacked: stacked)
        answerButton(.pour, systemImage: "checkmark", stacked: stacked)
    }

    private func answerButton(_ position: QuizPosition, systemImage: String, stacked: Bool) -> some View {
        let (foreground, background) = VotePositionBadge.colors(position.rawValue)
        let label = Text(VotePositionBadge.label(position.rawValue)).font(.subheadline.weight(.semibold))
        return Button { commit(position) } label: {
            if stacked {
                HStack(spacing: 12) {
                    Image(systemName: systemImage).font(.title3.weight(.bold))
                    label
                    Spacer(minLength: 0)
                }
                .padding(14)
                .background(background, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .foregroundStyle(foreground)
            } else {
                VStack(spacing: 6) {
                    Image(systemName: systemImage)
                        .font(.title2.weight(.bold))
                        .frame(width: 58, height: 58)
                        .background(background, in: Circle())
                    label.fixedSize()
                }
                .foregroundStyle(foreground)
            }
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
