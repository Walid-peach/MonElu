import MonEluCore
import MonEluUI
import SwiftUI

/// Before the first question.
struct QuizIntroView: View {
    let count: Int
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Le quiz".uppercased())
                .font(.caption.weight(.bold))
                .tracking(1.6)
                .foregroundStyle(Palette.accent)
            Text("Quel député vote comme vous ?")
                .font(Typography.heading(.largeTitle))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("\(count) vrais scrutins de l'Assemblée nationale, posés en français courant. Répondez pour, contre ou abstention : à la fin, on compare vos réponses aux votes réels des députés.")
                .font(.body)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Text("Sans compte. Vos réponses restent sur votre téléphone : rien n'est enregistré tant que vous ne partagez pas vos résultats.")
                .font(.footnote)
                .foregroundStyle(Palette.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: onStart) {
                Text("Commencer").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(Palette.accent)
            .padding(.top, 6)
            .accessibilityIdentifier("quiz.start")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// At the end of the deck with fewer answers than `match` needs.
struct QuizNotEnoughView: View {
    let answered: Int
    let onResume: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Encore quelques réponses")
                .font(Typography.heading(.title2))
                .foregroundStyle(Palette.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text("Il faut au moins \(QuizModel.minimumAnswers) réponses exprimées pour un résultat significatif ; vous en avez donné \(answered).")
                .font(.body)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Reprendre les questions", action: onResume)
                .buttonStyle(.borderedProminent)
                .tint(Palette.accent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The result: deputies and groups ranked by the API, with its percentages.
struct QuizResultContent: View {
    let result: QuizResult

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Vos résultats")
                    .font(Typography.heading(.title))
                    .foregroundStyle(Palette.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("Sur \(result.answered) scrutins répondus, comparés aux votes de \(MonEluFormat.count(result.eligibleDeputies)) députés.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !result.topMatches.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Les députés qui votent comme vous")
                    ForEach(result.topMatches) { QuizDeputyRow(match: $0) }
                }
            }
            if let opposite = result.opposite {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Le plus éloigné de vos votes")
                    QuizDeputyRow(match: opposite)
                }
            }
            if !result.groups.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Les groupes")
                    ForEach(result.groups) { QuizGroupRow(group: $0) }
                }
            }
            if !result.supportedThemes.isEmpty || !result.opposedThemes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Vos positions")
                    themes("Vous votez pour", result.supportedThemes, position: "pour")
                    themes("Vous votez contre", result.opposedThemes, position: "contre")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("quiz.result")
    }

    @ViewBuilder private func themes(_ title: String, _ names: [String], position: String) -> some View {
        if !names.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        VotePositionBadge(position: position)
                        Text(title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.textPrimary)
                    }
                    Text(names.joined(separator: " · "))
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

/// A deputy and their agreement, as returned; the row opens their profile.
struct QuizDeputyRow: View {
    let match: QuizDeputyMatch

    var body: some View {
        NavigationLink(value: AppRoute.deputy(id: match.deputy.id)) {
            Card {
                HStack(spacing: 12) {
                    DeputyPortrait(name: match.deputy.name, url: match.deputy.photoURL)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(match.deputy.name)
                            .font(.headline)
                            .foregroundStyle(Palette.textPrimary)
                        if let group = match.deputy.group {
                            Text(group)
                                .font(.subheadline)
                                .foregroundStyle(Palette.textSecondary)
                        }
                        Text("\(match.matches) sur \(match.compared) scrutins en commun")
                            .font(.caption)
                            .foregroundStyle(Palette.textMuted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Text(match.agreementPct.map(MonEluFormat.percentage) ?? "–")
                        .font(.title3.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize()
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

/// A group and its agreement, as returned. The bar is the API's percentage
/// drawn to scale, not a figure of its own.
struct QuizGroupRow: View {
    let group: QuizGroupMatch

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(group.group)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Text(MonEluFormat.percentage(group.agreementPct))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize()
            }
            GeometryReader { proxy in
                Capsule().fill(Palette.trackBackground)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Palette.accent)
                            .frame(width: proxy.size.width * min(max(group.agreementPct / 100, 0), 1))
                    }
            }
            .frame(height: 8)
            .accessibilityHidden(true)
            Text("\(group.matches) sur \(group.compared) scrutins · \(MonEluFormat.count(group.deputyCount)) députés")
                .font(.caption)
                .foregroundStyle(Palette.textMuted)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Sharing the result. Including the answers is an explicit opt-in, off by
/// default, with the website's wording (ADR-028).
struct QuizShareSection: View {
    @Binding var includeAnswers: Bool
    let hasLink: Bool
    let isSharing: Bool
    let failed: Bool
    let onShare: () -> Void
    let onRestart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: onShare) {
                Text(isSharing ? "Création du lien…" : failed ? "Échec, réessayer" : "Partager mes résultats")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(Palette.accent)
            .disabled(isSharing)
            .accessibilityIdentifier("quiz.share")
            Text("Le lien créé est public.")
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
            Toggle(isOn: $includeAnswers) {
                Text(includeAnswers
                    ? "Vos réponses seront aussi incluses et visibles par quiconque ouvre le lien, pour permettre à un ami de se comparer à vous. Votre carte gardera le bloc « vous votez pour »."
                    : "Inclure mes réponses pour permettre à un ami de se comparer à moi, et garder le bloc « vous votez pour » sur ma carte.")
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .tint(Palette.accent)
            // The link holds what was chosen when it was created.
            .disabled(hasLink)
            .accessibilityIdentifier("quiz.include-answers")
            Button("Recommencer le quiz", action: onRestart)
                .font(.subheadline.weight(.medium))
                .tint(Palette.accent)
                .padding(.top, 4)
        }
    }
}
