import MonEluCore
import MonEluUI
import SwiftUI

/// A bill's page: its status, where it is in the AN, Sénat, CMP, loi
/// sequence, its next séance, and the parcours with the scrutins held at each
/// step (ADR-035; design A, Loi). Opened from a vote's "Le texte" and from links.
public struct LoiScreen: View {
    @State private var loader: Loader<LoiPage?>
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any LoisService) {
        _loader = State(initialValue: Loader(isEmpty: { $0 == nil }) {
            try await service.page(id: id, now: .now)
        })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(
                title: "Texte introuvable",
                message: "MonÉlu n'a pas de page pour ce texte : aucun de ses scrutins n'est rattaché à un dossier.",
                systemImage: "doc.text.magnifyingglass"
            )
        ) { page in
            if let page {
                ScrollView {
                    LoiContent(page: page, configuration: configuration, today: .now)
                        .padding(16)
                }
            }
        }
        .navigationTitle("Texte")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The page's content, separate from loading so it can be snapshot-tested.
/// `today` decides which dated steps are still to come.
struct LoiContent: View {
    let page: LoiPage
    let configuration: AppConfiguration
    let today: Date

    private var loi: Loi { page.loi }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            LoiOverview(page: page)
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Parcours")
                if loi.predatesCoverage {
                    CaveatNote(id: "bill_coverage", in: configuration)
                }
                ForEach(loi.sections) { section in
                    ParcoursSectionView(loiID: loi.id, section: section, today: today)
                }
                if !loi.unattachedScrutins.isEmpty {
                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            StageTitle(text: "Autres scrutins sur ce texte")
                            ForEach(loi.unattachedScrutins) { LoiScrutinLink(scrutin: $0) }
                        }
                    }
                }
            }
            if let url = loi.anURL {
                Link(destination: url) {
                    Label("Dossier complet sur assemblee-nationale.fr", systemImage: "arrow.up.right.square")
                        .font(.footnote)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .tint(Palette.textSecondary)
                .accessibilityHint("Ouvre le site de l'Assemblée nationale")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("loi.page")
    }
}

/// What the bill is and where it stands: procedure, title, status, the
/// stage strip and the next séance.
struct LoiOverview: View {
    let page: LoiPage
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var loi: Loi { page.loi }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 10) {
                if let procedure = loi.procedure {
                    Text(procedure.uppercased())
                        .font(.caption.weight(.bold))
                        .tracking(0.6)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text(loi.title)
                    .font(Typography.heading(.title))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let status = loi.status {
                    let layout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
                        : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
                    layout {
                        LoiStatusBadge(status: status)
                        if let label = loi.statusLabel {
                            Text("Dernière décision : « \(label) »")
                                .font(.footnote)
                                .foregroundStyle(Palette.textSecondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            if let strip = LoiStageStrip(currentStage: loi.currentStage, parcours: loi.parcours) {
                StageStripView(strip: strip)
            }
            if let sitting = page.nextSitting {
                NextSittingCard(sitting: sitting)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The derived status in words, colored by outcome.
struct LoiStatusBadge: View {
    let status: String

    var body: some View {
        let (foreground, background): (Color, Color) = switch status {
        case "promulguee", "adoptee_definitivement": (Palette.positiveText, Palette.positiveBackground)
        case "rejetee": (Palette.negativeText, Palette.negativeBackground)
        default: (Palette.textPrimary, Palette.trackBackground)
        }
        Text(LoiStatus.label(status))
            .font(.caption.weight(.semibold))
            .foregroundStyle(foreground)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// AN, Sénat, CMP, Loi, with the current step in the accent color.
struct StageStripView: View {
    let strip: LoiStageStrip
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 4))
        layout {
            ForEach(strip.steps) { step in
                VStack(alignment: .leading, spacing: 4) {
                    Capsule(style: .circular)
                        .fill(color(step.state))
                        .frame(height: 6)
                    Text(step.title)
                        .font(.footnote.weight(step.state == .current ? .bold : .medium))
                        .foregroundStyle(step.state == .upcoming ? Palette.textSecondary : Palette.textPrimary)
                    if let label = step.label {
                        Text(label)
                            .font(.caption2)
                            .foregroundStyle(Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .accessibilityElement(children: .combine)
                .accessibilityValue(accessibilityState(step.state))
            }
        }
    }

    private func color(_ state: LoiStageStrip.State) -> Color {
        switch state {
        case .current: Palette.accent
        case .reached: Palette.textPrimary
        case .upcoming: Palette.border
        }
    }

    private func accessibilityState(_ state: LoiStageStrip.State) -> String {
        switch state {
        case .current: "étape en cours"
        case .reached: "étape passée"
        case .upcoming: "à venir"
        }
    }
}

/// The bill's next séance on the agenda.
struct NextSittingCard: View {
    let sitting: LoiNextSitting

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "calendar")
                .font(.title3)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("PROCHAINE SÉANCE")
                    .font(.caption.weight(.bold))
                    .tracking(0.6)
                    .fixedSize(horizontal: false, vertical: true)
                Text([sitting.pointType, MonEluFormat.sitting(sitting.start)].compactMap { $0 }.joined(separator: " · "))
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(Palette.onIdentity)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Palette.identityBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// One top-level stage of the parcours, as a card.
struct ParcoursSectionView: View {
    let loiID: String
    let section: ParcoursSection
    let today: Date

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                if let stage = section.stage {
                    StageTitle(text: stage.label ?? stage.code)
                }
                ForEach(section.rows) { row in
                    switch row {
                    case .group(let acte):
                        Text(acte.label ?? acte.code)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.leading, indent(acte))
                            .accessibilityAddTraits(.isHeader)
                    case .acte(let acte, let repeats):
                        ActeRow(loiID: loiID, acte: acte, repeats: repeats, today: today)
                            .padding(.leading, indent(acte))
                    }
                }
            }
        }
    }

    /// Depth 1 sits at the card's edge; each deeper level steps in.
    private func indent(_ acte: LoiActe) -> CGFloat {
        CGFloat(max(0, acte.depth - 1)) * 14
    }
}

struct StageTitle: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold))
            .tracking(0.6)
            .foregroundStyle(Palette.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }
}

/// A dated step: its date, what happened, and the votes held there.
struct ActeRow: View {
    let loiID: String
    let acte: LoiActe
    /// Identical later steps folded into this one; their dates are listed.
    let repeats: [LoiActe]
    let today: Date

    private var isUpcoming: Bool {
        guard let date = (repeats.last ?? acte).date else { return false }
        return Calendar.current.startOfDay(for: date) > Calendar.current.startOfDay(for: today)
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(dotColor)
                .frame(width: 10, height: 10)
                .padding(.top, 4)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(dateText)
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(labelText)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if let outcome = acte.outcome {
                    Text("Résultat : \(outcome)")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                ForEach(acte.scrutins) { LoiScrutinLink(scrutin: $0).padding(.top, 4) }
                if let collapsed = acte.collapsedVotesLabel {
                    NavigationLink(value: AppRoute.loiAmendements(id: loiID, acteID: acte.id)) {
                        HStack {
                            Text(collapsed)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 4)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .accessibilityHidden(true)
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.accent)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("loi.amendements")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var dotColor: Color {
        if isUpcoming { return Palette.border }
        return acte.hasVotes ? Palette.accent : Palette.textPrimary
    }

    private var dateText: String {
        let dates = ([acte] + repeats).compactMap(\.date)
        guard let first = dates.first else { return "" }
        guard let last = dates.last, dates.count > 1 else { return MonEluFormat.shortDay(first) }
        if MonEluFormat.shortDay(first) == MonEluFormat.shortDay(last) {
            return "\(MonEluFormat.shortDay(first)) · \(dates.count) fois"
        }
        return "Du \(MonEluFormat.shortDay(first)) au \(MonEluFormat.shortDay(last)) · \(dates.count) fois"
    }

    private var labelText: String {
        let label = acte.label ?? acte.code
        return isUpcoming ? "\(label) (à venir)" : label
    }
}

/// A headline scrutin on the parcours: result, title, counts and split bar.
struct LoiScrutinLink: View {
    let scrutin: LoiScrutin

    var body: some View {
        NavigationLink(value: AppRoute.vote(id: scrutin.id)) {
            LoiScrutinRow(scrutin: scrutin)
                .padding(12)
                .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Palette.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

/// A scrutin's result, title and tally, as the API returned them.
struct LoiScrutinRow: View {
    let scrutin: LoiScrutin

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if let result = scrutin.result {
                    VoteResultBadge(result: result)
                }
                if let date = scrutin.date {
                    Text(MonEluFormat.shortDay(date))
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Text(scrutin.title.capitalizingFirstLetter)
                .font(.subheadline)
                .foregroundStyle(Palette.textPrimary)
                .lineLimit(3)
            if let votesFor = scrutin.votesFor, let votesAgainst = scrutin.votesAgainst, let abstentions = scrutin.abstentions {
                let bar = VoteSplitBar(pour: votesFor, contre: votesAgainst, abstention: abstentions)
                // The counts as text too, so they are read and not only drawn.
                Text(bar.accessibilityText)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                bar.accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
