import MonEluCore
import MonEluUI
import SwiftUI

/// A scrutin's page (web: `/votes/[id]`; design A, Scrutin): what was voted,
/// the result and its counts, the plain-language summary, the followed
/// deputies' own positions, the hemicycle, each group's split and the bill.
public struct VoteDetailScreen: View {
    let id: String
    /// The deputies the user follows on this device (ADR-040 §6), read on
    /// every render so a follow made on another tab shows here (#576).
    let followedDeputies: (any FollowedDeputyStore)?
    @State private var loader: Loader<VoteDetail>
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any VotesService, followedDeputies: (any FollowedDeputyStore)? = nil) {
        self.id = id
        self.followedDeputies = followedDeputies
        _loader = State(initialValue: Loader { try await service.vote(id: id) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Scrutin introuvable", message: "Ce scrutin n'existe pas ou plus.")
        ) { vote in
            ScrollView {
                VoteDetailContent(
                    vote: vote, configuration: configuration, followedDeputyIDs: followedDeputies?.deputyIDs ?? []
                )
                    .padding(16)
            }
        }
        .navigationTitle("Scrutin")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let url = configuration.siteLink("votes/\(id)") {
                ToolbarItem(placement: .primaryAction) {
                    ShareLink(item: url) { Label("Partager", systemImage: "square.and.arrow.up") }
                        .accessibilityIdentifier("vote.share")
                }
            }
        }
    }
}

/// The detail's content, separate from loading so it can be snapshot-tested.
struct VoteDetailContent: View {
    let vote: VoteDetail
    let configuration: AppConfiguration
    /// Every followed deputy, in the order they were followed (#577).
    var followedDeputyIDs: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
            ResultCard(vote: vote)
            if let turnout = vote.turnout {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Participation", subtitle: "Combien de députés ont pris part au vote.")
                    TurnoutCard(turnout: turnout, voteType: vote.voteType, configuration: configuration)
                }
            }
            if let summary = vote.item.summary, !summary.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("En clair")
                    Card {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(summary)
                                .font(.body)
                                .foregroundStyle(Palette.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                            CaveatNote(id: "llm_generated", in: configuration)
                        }
                    }
                }
            }
            if !followedDeputyIDs.isEmpty {
                FollowedPositionsCard(
                    positions: followedDeputyIDs.compactMap { vote.position(of: $0) },
                    followedCount: followedDeputyIDs.count
                )
            }
            if !vote.positions.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Dans l'hémicycle", subtitle: "Un point par député ayant une position enregistrée.")
                    Card {
                        HemicycleChart(deputies: vote.positions.map {
                            Hemicycle.Deputy(id: $0.deputyID, name: $0.name, group: $0.group, position: $0.position)
                        })
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Positions par groupe")
                    CaveatNote(id: "non_votant", in: configuration)
                    Card {
                        VStack(spacing: 0) {
                            ForEach(Array(vote.positionsByGroup.enumerated()), id: \.element.id) { index, group in
                                if index > 0 { Divider().overlay(Palette.border) }
                                GroupPositionsRow(group: group, turnout: vote.turnout(of: group))
                            }
                        }
                    }
                }
            }
            if let title = vote.dossierTitle {
                LoiCard(vote: vote, title: title)
            }
            source
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("vote.detail")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let theme = vote.item.theme {
                    ThemeTag(name: theme)
                }
                Text(metaLine)
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(vote.item.title.capitalizingFirstLetter)
                .font(Typography.heading(.title2))
                .headingLineSpacing()
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
    }

    /// "21 juillet 2026 · Scrutin n° 8441".
    private var metaLine: String {
        [vote.item.date.map(MonEluFormat.day), vote.scrutinNumber.map { "Scrutin n° \($0)" }]
            .compactMap { $0 }
            .joined(separator: " · ")
    }

    /// The Assemblée as the source, and the licence its data is under; a
    /// link to the scrutin's page when the API gave one.
    @ViewBuilder private var source: some View {
        if let url = vote.officialURL {
            Link(destination: url) { sourceLabel }
                .tint(Palette.textSecondary)
                .accessibilityHint("Ouvre le scrutin sur le site de l'Assemblée nationale")
        } else {
            sourceLabel.foregroundStyle(Palette.textSecondary)
        }
    }

    private var sourceLabel: some View {
        Label(
            "Source : Assemblée nationale\(vote.scrutinNumber.map { ", scrutin n° \($0)" } ?? "") · Licence Ouverte 2.0",
            systemImage: "arrow.up.right.square"
        )
        .font(.footnote)
        .multilineTextAlignment(.leading)
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// The theme, opening its page when the bundled table knows it.
struct ThemeTag: View {
    let name: String

    var body: some View {
        let label = Text(name)
            .font(.caption.weight(.semibold))
            .foregroundStyle(Palette.textPrimary)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .fixedSize()
        if let slug = ReferenceData.themeSlug(named: name) {
            NavigationLink(value: AppRoute.theme(slug: slug)) { label }
                .buttonStyle(.plain)
                .accessibilityHint("Ouvre la page du thème")
        } else {
            label
        }
    }
}

/// The result as the API states it, the three shares with their counts, the
/// split bar and the majority the scrutin needed.
struct ResultCard: View {
    let vote: VoteDetail
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    if let result = vote.item.result {
                        VoteResultBadge(result: result)
                    }
                    Spacer(minLength: 8)
                    if let voters = vote.totalVoters {
                        Text("\(MonEluFormat.count(voters)) votants")
                            .font(.subheadline)
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                let layout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: 8))
                layout {
                    count(vote.votesFor, share: vote.pctPour, "pour", Palette.positiveText)
                    count(vote.votesAgainst, share: vote.pctContre, "contre", Palette.negativeText)
                    count(
                        vote.abstentions, share: vote.pctAbstention,
                        vote.abstentions == 1 ? "abstention" : "abstentions", Palette.abstentionText
                    )
                }
                if let pour = vote.votesFor, let contre = vote.votesAgainst, let abstention = vote.abstentions {
                    VoteSplitBar(pour: pour, contre: contre, abstention: abstention, size: .large)
                }
                if let majority = vote.majorityRequired {
                    Text(majorityLine(majority))
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    /// "Majorité requise : 182 voix, la moitié des suffrages exprimés plus une."
    private func majorityLine(_ majority: Int) -> String {
        let rule = vote.voteType == "moc"
            ? "la majorité des 577 députés"
            : "la moitié des suffrages exprimés plus une"
        return "Majorité requise : \(MonEluFormat.count(majority)) voix, \(rule)."
    }

    /// The share as the main figure when the API sent one, the count under it.
    private func count(_ value: Int?, share: Double?, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(share.map { MonEluFormat.percent($0) } ?? value.map(MonEluFormat.count) ?? "–")
                .font(Typography.heading(.title))
                .monospacedDigit()
                .foregroundStyle(color)
            Text(share != nil ? "\(value.map(MonEluFormat.count) ?? "–") \(label)" : label)
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// How much of the chamber took part (#627): the rate as the main figure,
/// the median for the same kind of scrutin marked on the bar, and how this
/// one compares. A raw turnout means little alone: an ordinary amendment
/// vote routinely draws a fifth of the chamber, a solemn vote nearly all.
struct TurnoutCard: View {
    let turnout: VoteTurnout
    let voteType: String?
    let configuration: AppConfiguration

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        rate
                        Spacer(minLength: 8)
                        badge
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        rate
                        badge
                    }
                }
                Text("des \(MonEluFormat.count(turnout.seats)) députés ont pris part au vote")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(participantsLine)
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                TurnoutBar(rate: turnout.rate, typicalRate: turnout.typicalRate)
                    .accessibilityHidden(true)
                if let typical = turnout.typicalRate {
                    Text("\(medianLabel) : \(MonEluFormat.percent(typical))")
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(Palette.negativeText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let hint {
                    Text(hint)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                CaveatNote(id: "vote_participation", in: configuration)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("vote.turnout")
    }

    private var rate: some View {
        Text(MonEluFormat.percent(turnout.rate))
            .font(Typography.heading(.largeTitle))
            .monospacedDigit()
            .foregroundStyle(Palette.textPrimary)
    }

    @ViewBuilder private var badge: some View {
        if let comparison = TurnoutComparison(rawValue: turnout.comparison ?? "") {
            Text(comparison.label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(comparison.foreground)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(comparison.background, in: Capsule())
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// "366 députés, dont 2 non-votants."
    var participantsLine: String {
        let deputies = "\(MonEluFormat.count(turnout.participants)) député\(turnout.participants > 1 ? "s" : "")"
        guard turnout.nonVoting > 0 else { return "\(deputies)." }
        return "\(deputies), dont \(turnout.nonVoting) non-votant\(turnout.nonVoting > 1 ? "s" : "")."
    }

    private var medianLabel: String {
        switch voteType {
        case "spo": "Médiane des scrutins ordinaires"
        case "sps": "Médiane des votes solennels"
        case "moc": "Médiane des motions de censure"
        default: "Médiane"
        }
    }

    private var hint: String? {
        switch voteType {
        case "spo": "La plupart des scrutins ordinaires se tiennent devant une petite partie de l'hémicycle."
        case "sps": "Les votes solennels sont annoncés à l'avance et réunissent presque tous les députés."
        case "moc": "Sur une motion de censure, seuls les députés qui la soutiennent votent."
        default: nil
        }
    }
}

/// The API's `comparison`, as the badge shows it.
enum TurnoutComparison: String {
    case below, usual, above

    var label: String {
        switch self {
        case .below: "Nettement sous l'habitude"
        case .usual: "Dans l'habitude"
        case .above: "Nettement au-dessus de l'habitude"
        }
    }

    var foreground: Color {
        switch self {
        case .below: Palette.abstentionText
        case .usual: Palette.textSecondary
        case .above: Palette.positiveText
        }
    }

    var background: Color {
        switch self {
        case .below: Palette.abstentionBackground
        case .usual: Palette.trackBackground
        case .above: Palette.positiveBackground
        }
    }
}

/// The turnout as a filled track, with the typical rate as a tick.
private struct TurnoutBar: View {
    let rate: Double
    let typicalRate: Double?

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.trackBackground).frame(height: 10)
                Capsule().fill(Palette.textPrimary).frame(width: width * min(1, max(0, rate)), height: 10)
                if let typicalRate {
                    Rectangle()
                        .fill(Palette.negative)
                        .frame(width: 2, height: 20)
                        .offset(x: width * min(1, max(0, typicalRate)) - 1)
                }
            }
            .frame(height: 20)
        }
        .frame(height: 20)
    }
}

/// The followed deputies' own positions on the scrutin (#577): one row per
/// deputy with a recorded position, in the order they were followed, and how
/// many recorded none. A deputy with no position is not in the scrutin's
/// list, so the page counts them rather than naming them.
struct FollowedPositionsCard: View {
    /// The followed deputies' recorded positions, in the followed order.
    let positions: [DeputyPosition]
    /// How many deputies are followed, with or without a position.
    let followedCount: Int

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                Text(followedCount == 1 ? "Votre député" : "Vos députés")
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                ForEach(positions, id: \.deputyID) { position in
                    HStack(spacing: 12) {
                        Text(position.name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        VotePositionBadge(position: position.position)
                    }
                    .accessibilityElement(children: .combine)
                }
                if let missing = missingLine {
                    Text(missing)
                        .font(positions.isEmpty ? .subheadline.weight(.semibold) : .footnote)
                        .foregroundStyle(positions.isEmpty ? Palette.textPrimary : Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("vote.followed")
    }

    /// Said for the followed deputies with no recorded position.
    var missingLine: String? {
        let missing = followedCount - positions.count
        guard missing > 0 else { return nil }
        if followedCount == 1 { return "Pas de position enregistrée sur ce scrutin" }
        if missing == followedCount { return "Aucun de vos députés n'a de position enregistrée sur ce scrutin" }
        return missing == 1
            ? "1 autre député suivi sans position enregistrée"
            : "\(missing) autres députés suivis sans position enregistrée"
    }
}

/// One group's split on the scrutin: its chip, a bar and the counts, and the
/// share of its members who took part when the API sent it (#627).
struct GroupPositionsRow: View {
    let group: GroupPositions
    let turnout: GroupTurnout?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let counts = group.counts
        let bar = VoteSplitBar(
            pour: counts["pour"] ?? 0, contre: counts["contre"] ?? 0,
            abstention: counts["abstention"] ?? 0, nonVotant: counts["nonVotant"] ?? 0
        )
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(alignment: .center, spacing: 10))
        VStack(alignment: .leading, spacing: 4) {
            layout {
                PartyChip(group.group, short: group.group)
                    .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 76, alignment: .leading)
                bar.accessibilityHidden(true)
                Text(summary)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: dynamicTypeSize.isAccessibilitySize ? false : true, vertical: true)
            }
            if let turnoutLine {
                Text(turnoutLine)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            ["\(group.group) : \(bar.accessibilityText)", turnoutLine].compactMap { $0 }.joined(separator: ". ")
        )
    }

    /// "Participation : 93 % (84 sur 90)".
    private var turnoutLine: String? {
        turnout.map {
            "Participation : \(MonEluFormat.percent($0.rate)) (\(MonEluFormat.count($0.participants)) sur \(MonEluFormat.count($0.members)))"
        }
    }

    /// "24 pour · 1 nv": what the group recorded, in short.
    private var summary: String {
        let short = ["pour": "pour", "contre": "contre", "abstention": "abst.", "nonVotant": "nv"]
        return group.ordered.map { "\($0.count) \(short[$0.position] ?? $0.position)" }.joined(separator: " · ")
    }
}

/// The bill the scrutin belongs to: its page in the app when it has one.
struct LoiCard: View {
    let vote: VoteDetail
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Le texte")
            if vote.hasLoiPage, let id = vote.dossierID {
                NavigationLink(value: AppRoute.loi(id: id)) { card(link: true) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("vote.loi")
            } else {
                card(link: false)
            }
        }
    }

    private func card(link: Bool) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                if let status = vote.dossierStatus {
                    LoiStatusBadge(status: status)
                }
                Text(title)
                    .font(Typography.heading(.title3))
                    .headingLineSpacing()
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                if link {
                    HStack(spacing: 4) {
                        Text("Voir le parcours du texte")
                        Image(systemName: "chevron.right").accessibilityHidden(true)
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.accent)
                }
            }
        }
    }
}
