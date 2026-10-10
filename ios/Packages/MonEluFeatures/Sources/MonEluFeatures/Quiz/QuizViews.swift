import MonEluCore
import MonEluUI
import SwiftUI

/// Before the first question (design A): the promise on a navy card, the
/// privacy note, the themes the questions cover, and the way back into a
/// deck the user left part-way.
struct QuizIntroView: View {
    let questions: [QuizQuestion]
    /// Answers given so far this session, when the user left the deck.
    var resume: (answered: Int, onResume: () -> Void)?
    let onStart: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 12) {
                hero
                CaveatNote(
                    "Sans compte. Vos réponses restent sur votre téléphone : rien n'est enregistré tant que vous ne partagez pas vos résultats."
                )
            }
            if !themes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Les \(themes.count) thèmes")
                    FlowLayout(spacing: 8) {
                        ForEach(themes, id: \.self) { theme in
                            Text(theme)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(Palette.textPrimary)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                    }
                }
            }
            if let resume {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Déjà commencé ?")
                    Button(action: resume.onResume) {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Reprendre les questions")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Palette.textPrimary)
                                Text("\(resume.answered) réponse\(resume.answered > 1 ? "s" : "") sur \(questions.count), gardée\(resume.answered > 1 ? "s" : "") le temps de la session")
                                    .font(.footnote)
                                    .foregroundStyle(Palette.textSecondary)
                            }
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Palette.textMuted)
                                .accessibilityHidden(true)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("quiz.resume")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Le quiz".uppercased())
                .font(.caption.weight(.bold))
                .tracking(1)
                .opacity(0.85)
            Text("Quel député vote comme vous ?")
                .font(Typography.heading(.largeTitle))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("\(questions.count) vrais scrutins de l'Assemblée nationale, posés en français courant. Répondez pour, contre ou abstention : à la fin, on compare vos réponses aux votes réels des députés.")
                .font(.body)
                .opacity(0.86)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: onStart) {
                Text("Commencer")
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(Palette.onAccent)
                    .background(Palette.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
            .accessibilityIdentifier("quiz.start")
        }
        .foregroundStyle(Palette.onIdentity)
        .padding(.horizontal, 18)
        .padding(.vertical, 22)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.identityBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// The questions' themes, each once, in deck order.
    private var themes: [String] {
        var seen = Set<String>()
        return questions.map(\.theme).filter { seen.insert($0).inserted }
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

/// The result (design A): the poster card, then the deputies and groups
/// ranked by the API with its percentages, and the most distant deputy.
/// The share block sits under the poster (`QuizScreen` places it).
struct QuizResultHeader: View {
    let result: QuizResult

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Vos résultats")
                    .font(Typography.heading(.title))
                    .foregroundStyle(Palette.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("Sur \(result.answered) scrutins répondus, comparés aux votes de \(MonEluFormat.count(result.eligibleDeputies)) députés.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            QuizPosterCard(result: result)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The website's poster card (`QuizResultCard`): the closest deputy and the
/// themes answered pour and contre.
struct QuizPosterCard: View {
    let result: QuizResult
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Mon résultat".uppercased())
                Spacer()
                Text("MonÉlu".uppercased()).opacity(0.7)
            }
            .font(.caption.weight(.bold))
            .tracking(1)
            if let top = result.topMatches.first {
                Text("Je vote comme \(top.deputy.name)\(top.agreementPct.map { " à \(MonEluFormat.percentage($0))" } ?? "")")
                    .font(Typography.heading(.title2))
                    .fixedSize(horizontal: false, vertical: true)
                Text(Self.detail(top))
                    .font(.footnote)
                    .opacity(0.8)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !result.supportedThemes.isEmpty || !result.opposedThemes.isEmpty {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: 10))
                layout {
                    themes("Vous votez pour", result.supportedThemes, dot: Palette.positive)
                    themes("Vous votez contre", result.opposedThemes, dot: Palette.negative)
                }
                .padding(.top, 6)
            }
        }
        .foregroundStyle(Palette.onIdentity)
        .padding(.horizontal, 18)
        .padding(.vertical, 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.identityBackground, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("quiz.poster")
    }

    @ViewBuilder private func themes(_ title: String, _ names: [String], dot: Color) -> some View {
        if !names.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Circle().fill(dot).frame(width: 8, height: 8).accessibilityHidden(true)
                    Text(title.uppercased())
                        .font(.caption.weight(.bold))
                        .tracking(0.6)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(names, id: \.self) { Text($0).font(.subheadline) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// "EPR · Isère · 6 scrutins en commun".
    static func detail(_ match: QuizDeputyMatch) -> String {
        [match.deputy.groupShort, match.deputy.department, "\(match.compared) scrutins en commun"]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}

/// The rankings under the share block.
struct QuizResultContent: View {
    let result: QuizResult

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            if !result.topMatches.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Les députés qui votent comme vous")
                    QuizRows {
                        ForEach(Array(result.topMatches.enumerated()), id: \.element.id) { index, match in
                            if index > 0 { Divider().overlay(Palette.border) }
                            QuizDeputyRow(match: match, rank: index + 1)
                        }
                    }
                }
            }
            if !result.groups.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Les groupes")
                    Card {
                        VStack(spacing: 12) {
                            ForEach(result.groups) { QuizGroupRow(group: $0) }
                        }
                    }
                }
            }
            if let opposite = result.opposite {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Le plus éloigné de vos votes")
                    QuizRows { QuizDeputyRow(match: opposite, rank: nil) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("quiz.result")
    }
}

/// Rows in one card.
struct QuizRows<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
    }
}

/// A deputy and their agreement, as returned; the row opens their profile.
struct QuizDeputyRow: View {
    let match: QuizDeputyMatch
    let rank: Int?
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        NavigationLink(value: AppRoute.deputy(id: match.deputy.id)) {
            if typeSize.isAccessibilitySize {
                // At large text the name needs the row's width: the rank and
                // the percentage go on their own line under it.
                VStack(alignment: .leading, spacing: 4) {
                    Text(match.deputy.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                    Text(Self.detail(match))
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                    Text([rank.map { "n° \($0)" }, match.agreementPct.map(MonEluFormat.percentage)].compactMap { $0 }.joined(separator: " · "))
                        .font(.headline.monospacedDigit())
                        .foregroundStyle(Palette.textPrimary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
            } else {
                row
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }

    private var row: some View {
            HStack(spacing: 12) {
                if let rank {
                    Text("\(rank)")
                        .font(.subheadline.weight(.semibold).monospacedDigit())
                        .foregroundStyle(Palette.textSecondary)
                        .frame(minWidth: 16)
                }
                DeputyPortrait(name: match.deputy.name, url: match.deputy.photoURL, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(match.deputy.name)
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                    Text(Self.detail(match))
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Text(match.agreementPct.map(MonEluFormat.percentage) ?? "–")
                    .font(.headline.monospacedDigit())
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
    }

    /// "EPR · Isère · 5 sur 5 scrutins en commun".
    static func detail(_ match: QuizDeputyMatch) -> String {
        [match.deputy.groupShort, match.deputy.department, "\(match.matches) sur \(match.compared) scrutins en commun"]
            .compactMap { $0 }
            .joined(separator: " · ")
    }
}

/// A group and its agreement, as returned. The bar is the API's percentage
/// drawn to scale, not a figure of its own.
struct QuizGroupRow: View {
    let group: QuizGroupMatch
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(spacing: 10))
        layout {
            PartyChip(group.groupShort ?? group.group, short: group.groupShort)
                .frame(minWidth: typeSize.isAccessibilitySize ? nil : 52, alignment: .leading)
            GeometryReader { proxy in
                Capsule().fill(Palette.trackBackground)
                    .overlay(alignment: .leading) {
                        Capsule().fill(Palette.textPrimary)
                            .frame(width: proxy.size.width * min(max(group.agreementPct / 100, 0), 1))
                    }
            }
            .frame(height: 8)
            .accessibilityHidden(true)
            Text(MonEluFormat.percentage(group.agreementPct))
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
                .frame(minWidth: 52, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(group.group) : \(MonEluFormat.percentage(group.agreementPct)), \(group.matches) sur \(group.compared) scrutins, \(group.deputyCount) députés"
        )
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

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                Toggle(isOn: $includeAnswers) {
                    Text(includeAnswers
                        ? "Vos réponses seront aussi incluses et visibles par quiconque ouvre le lien, pour permettre à un ami de se comparer à vous. Votre carte gardera le bloc « vous votez pour »."
                        : "Inclure mes réponses pour permettre à un ami de se comparer à moi, et garder le bloc « vous votez pour » sur ma carte.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .tint(Palette.accent)
                // The link holds what was chosen when it was created.
                .disabled(hasLink)
                .accessibilityIdentifier("quiz.include-answers")
                Button(action: onShare) {
                    Label(
                        isSharing ? "Création du lien…" : failed ? "Échec, réessayer" : "Partager mes résultats",
                        systemImage: "square.and.arrow.up"
                    )
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .foregroundStyle(Palette.onAccent)
                    .background(Palette.accent, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isSharing)
                .accessibilityIdentifier("quiz.share")
                Text("Le lien créé est public.")
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}
