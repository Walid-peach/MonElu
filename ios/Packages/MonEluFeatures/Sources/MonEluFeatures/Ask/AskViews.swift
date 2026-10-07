import MonEluCore
import MonEluUI
import SwiftUI

/// Labels for the API's values. The website writes the same words
/// (`CONFIDENCE_META` in chatFormat.ts, `VerdictCard.tsx`).
enum AskLabels {
    static func confidence(_ value: String?) -> String? {
        switch value {
        case "high": "Haute confiance"
        case "medium": "Confiance moyenne"
        case "low": "Basse confiance"
        default: nil
        }
    }

    static func verdict(_ value: String) -> String {
        switch value {
        case "vrai": "Vrai"
        case "faux": "Faux"
        case "trompeur": "Trompeur"
        default: "Invérifiable avec nos données"
        }
    }

    static func verdictConfidence(_ value: String) -> String {
        switch value {
        case "ÉLEVÉ": "Confiance élevée"
        case "MOYEN": "Confiance moyenne"
        default: "Confiance faible"
        }
    }

    static func failure(_ failure: AskFailure, verifying: Bool = false) -> String {
        switch failure {
        case .offline: "Hors connexion : réessayez une fois connecté."
        case .busy: verifying
            ? "Trop de vérifications en peu de temps. Patientez une minute et réessayez."
            : "Trop de questions en peu de temps. Patientez une minute et réessayez."
        case .unavailable: verifying
            ? "La vérification n'est pas disponible pour le moment."
            : "L'assistant n'est pas disponible pour le moment."
        case .server: verifying
            ? "La vérification a échoué. Réessayez dans quelques secondes."
            : "La réponse n'a pas pu être obtenue. Réessayez dans quelques secondes."
        }
    }
}

/// A capsule label in a token color pair.
struct Pill: View {
    let text: String
    let foreground: Color
    let background: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background, in: Capsule())
    }
}

/// The question, or the claim to verify, on the trailing side as in a
/// conversation.
struct QuestionBubble: View {
    let text: String
    var isClaim = false

    var body: some View {
        Text(isClaim ? "« \(text) »" : text)
            .font(.body)
            .foregroundStyle(Palette.onIdentity)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                UnevenRoundedRectangle(
                    topLeadingRadius: 18, bottomLeadingRadius: 18, bottomTrailingRadius: 4, topTrailingRadius: 18,
                    style: .continuous
                )
                .fill(Palette.identityBackground)
            )
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, 40)
            .accessibilityLabel(isClaim ? "Affirmation à vérifier : \(text)" : "Votre question : \(text)")
    }
}

/// An answer: confidence, the text, its caveat, its sources, then the
/// verification nudge and the actions.
struct AnswerCard: View {
    let answer: ChatAnswer
    let offersVerification: Bool
    let feedback: ChatExchange.Feedback
    let isSharing: Bool
    let shareFailed: Bool
    let onVerify: () -> Void
    let onShare: () -> Void
    let onFeedback: (ChatFeedback) -> Void

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                ChatMarkdownView(text: answer.answer)
                if let caveat = answer.caveat, !caveat.isEmpty {
                    CaveatNote(caveat)
                }
                if !answer.sources.isEmpty {
                    SourcesSection(sources: Array(answer.sources.prefix(3)))
                }
                if offersVerification {
                    Button(action: onVerify) {
                        Label("Cela ressemble à une affirmation : la vérifier contre les scrutins officiels ?",
                              systemImage: "checkmark.shield")
                            .font(.subheadline.weight(.semibold))
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .foregroundStyle(Palette.positiveText)
                            .background(Palette.positiveBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ask.verify-nudge")
                }
                VStack(alignment: .leading, spacing: 6) {
                    Divider().overlay(Palette.border)
                    confidence
                    actions
                }
            }
        }
    }

    /// The confidence badge with what it means: the quality of the sources
    /// found, not the model's opinion.
    @ViewBuilder private var confidence: some View {
        if let label = AskLabels.confidence(answer.confidence) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { confidencePill(label); confidenceNote }
                VStack(alignment: .leading, spacing: 4) { confidencePill(label); confidenceNote }
            }
            .padding(.top, 6)
        }
    }

    private func confidencePill(_ label: String) -> some View {
        Pill(
            text: label,
            foreground: answer.confidence == "low" ? Palette.negativeText
                : answer.confidence == "high" ? Palette.positiveText : Palette.textSecondary,
            background: answer.confidence == "low" ? Palette.negativeBackground
                : answer.confidence == "high" ? Palette.positiveBackground : Palette.trackBackground
        )
        .fixedSize(horizontal: false, vertical: true)
    }

    private var confidenceNote: some View {
        Text("Reflète la qualité des sources retrouvées, pas l'avis du modèle.")
            .font(.caption)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var actions: some View {
        HStack(spacing: 4) {
            switch feedback {
            case .sent:
                Text("Merci pour votre retour !")
                    .foregroundStyle(Palette.textSecondary)
            case .sending:
                ProgressView().tint(Palette.accent)
            case .none, .failed:
                Button { onFeedback(.up) } label: {
                    Image(systemName: "hand.thumbsup").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Réponse utile")
                Button { onFeedback(.down) } label: {
                    Image(systemName: "hand.thumbsdown").frame(width: 44, height: 44)
                }
                .accessibilityLabel("Réponse pas utile")
                if feedback == .failed {
                    Text("Échec de l'envoi")
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Spacer(minLength: 0)
            Button(action: onShare) {
                if shareFailed {
                    Label("Erreur, réessayez", systemImage: "square.and.arrow.up")
                } else {
                    Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44)
                }
            }
            .disabled(isSharing)
            .accessibilityLabel(shareFailed ? "Erreur, réessayez" : "Partager")
            .accessibilityIdentifier("ask.share")
        }
        .font(.subheadline)
        .tint(Palette.textSecondary)
    }
}

/// The sources an answer drew on; a deputy or a scrutin opens its screen.
struct SourcesSection: View {
    let sources: [ChatSource]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Sources")
                .font(.footnote.weight(.bold))
                .foregroundStyle(Palette.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(sources) { source in
                if let route = source.route {
                    NavigationLink(value: route) { SourceRow(source: source, isLink: true) }
                        .buttonStyle(.plain)
                } else {
                    SourceRow(source: source, isLink: false)
                }
            }
        }
    }
}

private struct SourceRow: View {
    let source: ChatSource
    let isLink: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            // Decorative; at large text the title needs the width more.
            if !typeSize.isAccessibilitySize {
                Image(systemName: source.kind == .deputy ? "person.crop.circle" : source.kind == .vote ? "checkmark.seal" : "doc.text")
                    .foregroundStyle(Palette.textSecondary)
                    .accessibilityHidden(true)
            }
            VStack(alignment: .leading, spacing: 3) {
                // Three lines in a column of sources; in full at large text,
                // which must wrap rather than truncate.
                Text(source.title.capitalizingFirstLetter)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                    .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
                if let subtitle = source.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
                if let result = source.result {
                    VoteResultBadge(result: result)
                }
            }
            Spacer(minLength: 0)
            if isLink {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Palette.textMuted)
                    .accessibilityHidden(true)
            }
        }
        .padding(10)
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// A verdict: the result as icon, word and color (never color alone), the
/// claim checked, why, the scrutins it rests on, and its share link.
struct VerdictCard: View {
    let verdict: Verdict

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { badge; checkedLine }
                    VStack(alignment: .leading, spacing: 6) { badge; checkedLine }
                }
                Text("« \(verdict.claim) »")
                    .font(Typography.heading(.title3).italic())
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let id = verdict.deputyID, let name = verdict.deputyName {
                    NavigationLink(value: AppRoute.deputy(id: id)) {
                        Label(
                            verdict.deputyParty.map { "\(name) (\($0))" } ?? name,
                            systemImage: "person.crop.circle"
                        )
                        .font(.subheadline.weight(.medium))
                        .multilineTextAlignment(.leading)
                    }
                    .tint(Palette.accent)
                }
                Text(verdict.explanation)
                    .font(.body)
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if !verdict.citations.isEmpty {
                    Text("Scrutins cités")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Palette.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(verdict.citations) { citation in
                        NavigationLink(value: AppRoute.vote(id: citation.voteID)) {
                            CitationRow(citation: citation)
                        }
                        .buttonStyle(.plain)
                    }
                }
                Text(AskLabels.verdictConfidence(verdict.confidence))
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                if let url = verdict.shareURL {
                    ShareLink(item: url) {
                        Label("Partager ce verdict", systemImage: "square.and.arrow.up")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(Palette.textPrimary)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .overlay(
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .strokeBorder(Palette.border, lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ask.share-verdict")
                }
            }
        }
        .accessibilityIdentifier("ask.verdict")
    }

    private var badge: some View {
        Label(AskLabels.verdict(verdict.verdict), systemImage: icon)
            .font(.subheadline.weight(.bold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(background, in: Capsule())
            .fixedSize(horizontal: false, vertical: true)
    }

    private var checkedLine: some View {
        Text("Vérifié contre les scrutins officiels")
            .font(.caption)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var icon: String {
        switch verdict.verdict {
        case "vrai": "checkmark.shield"
        case "faux": "xmark.shield"
        case "trompeur": "exclamationmark.shield"
        default: "questionmark.diamond"
        }
    }

    private var foreground: Color {
        switch verdict.verdict {
        case "vrai": Palette.positiveText
        case "faux": Palette.negativeText
        default: Palette.textPrimary
        }
    }

    private var background: Color {
        switch verdict.verdict {
        case "vrai": Palette.positiveBackground
        case "faux": Palette.negativeBackground
        default: Palette.trackBackground
        }
    }
}

private struct CitationRow: View {
    let citation: VerdictCitation

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                if let result = citation.result {
                    VoteResultBadge(result: result)
                }
                if let date = citation.date {
                    Text(MonEluFormat.shortDay(date))
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Text(citation.title.capitalizingFirstLetter)
                .font(.subheadline)
                .foregroundStyle(Palette.textPrimary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            if let position = citation.deputyPosition {
                HStack(spacing: 6) {
                    Text("Son vote :")
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                    VotePositionBadge(position: position)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One exchange, in order: the question, the answer or its state, then the
/// verification it led to.
struct ExchangeView: View {
    let exchange: ChatExchange
    let offersVerification: Bool
    var canRetry = true
    let onRetry: () -> Void
    let onVerify: () -> Void
    let onShare: () -> Void
    let onFeedback: (ChatFeedback) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            QuestionBubble(text: exchange.question, isClaim: exchange.isClaim)
            switch exchange.answer {
            case .notAsked:
                EmptyView()
            case .pending:
                Waiting(text: "Recherche dans les votes et profils des députés…")
            case .failed(let failure):
                FailureLine(text: AskLabels.failure(failure), actionTitle: canRetry ? "Réessayer" : nil, action: onRetry)
            case .answered(let answer):
                AnswerCard(
                    answer: answer, offersVerification: offersVerification, feedback: exchange.feedback,
                    isSharing: exchange.isSharing, shareFailed: exchange.shareFailed,
                    onVerify: onVerify, onShare: onShare, onFeedback: onFeedback
                )
            }
            switch exchange.verification {
            case .none:
                EmptyView()
            case .pending:
                Waiting(text: "Recherche des scrutins correspondants et de la position enregistrée du député…")
            case .done(let verdict):
                VerdictCard(verdict: verdict)
            case .failed(let failure):
                // A claim sent as one can be sent again; after the nudge,
                // the nudge itself offers it again.
                FailureLine(
                    text: AskLabels.failure(failure, verifying: true),
                    actionTitle: exchange.isClaim && canRetry ? "Réessayer" : nil, action: onRetry
                )
            }
        }
    }
}

private struct Waiting: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            ProgressView().tint(Palette.accent)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

private struct FailureLine: View {
    let text: String
    let actionTitle: String?
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(text, systemImage: "exclamationmark.triangle")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let actionTitle {
                Button(actionTitle, action: action)
                    .buttonStyle(.bordered)
                    .tint(Palette.accent)
            }
        }
    }
}

/// What the tab says before the first question, in each mode.
struct AskIntro: View {
    var mode: AskModel.Mode = .question

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(mode == .claim ? "Vérifiez une affirmation" : "Posez une question sur vos élus")
                .font(Typography.heading(.title2))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(mode == .claim
                ? "Collez une phrase sur le vote d'un député : elle est comparée aux scrutins officiels et à la position qu'il y a enregistrée."
                : "Les réponses s'appuient sur les votes et les profils des députés, avec leurs sources. Une affirmation peut ensuite être vérifiée contre les scrutins officiels.")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if mode == .claim {
                Label(
                    "Les verdicts possibles : \(["vrai", "faux", "trompeur", "inverifiable"].map { AskLabels.verdict($0).lowercased() }.joined(separator: ", ")).",
                    systemImage: "checkmark.shield"
                )
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Shown instead of the input when `/app/config` switches the assistant off.
struct AskUnavailable: View {
    var body: some View {
        EmptyStateView(
            title: "Assistant indisponible",
            message: "L'assistant est momentanément désactivé. Les votes et les profils des députés restent consultables dans les autres onglets.",
            systemImage: "bubble.left.and.exclamationmark.bubble.right"
        )
        .accessibilityIdentifier("ask.unavailable")
    }
}
