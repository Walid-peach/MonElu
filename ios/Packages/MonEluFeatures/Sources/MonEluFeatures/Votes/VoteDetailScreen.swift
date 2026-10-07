import MonEluCore
import MonEluUI
import SwiftUI

/// A scrutin's page (web: `/votes/[id]`; design A, Scrutin): what was voted,
/// the result and its counts, the plain-language summary, the followed
/// deputy's own position, the hemicycle, each group's split and the bill.
public struct VoteDetailScreen: View {
    let id: String
    /// The deputy the user follows on this device, if any (ADR-040 §6).
    let followedDeputyID: String?
    @State private var loader: Loader<VoteDetail>
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any VotesService, followedDeputyID: String? = nil) {
        self.id = id
        self.followedDeputyID = followedDeputyID
        _loader = State(initialValue: Loader { try await service.vote(id: id) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Scrutin introuvable", message: "Ce scrutin n'existe pas ou plus.")
        ) { vote in
            ScrollView {
                VoteDetailContent(vote: vote, configuration: configuration, followedDeputyID: followedDeputyID)
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
    var followedDeputyID: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
            ResultCard(vote: vote)
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
            if followedDeputyID != nil {
                FollowedPositionCard(position: vote.position(of: followedDeputyID))
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
                                GroupPositionsRow(group: group)
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

    /// The Assemblée as the source, and the licence its data is under.
    private var source: some View {
        Link(destination: URL(string: "https://www.assemblee-nationale.fr/dyn/scrutins/\(vote.item.id)")!) {
            Label(
                "Source : Assemblée nationale\(vote.scrutinNumber.map { ", scrutin n° \($0)" } ?? "") · Licence Ouverte 2.0",
                systemImage: "arrow.up.right.square"
            )
            .font(.footnote)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .tint(Palette.textSecondary)
        .accessibilityHint("Ouvre le scrutin sur le site de l'Assemblée nationale")
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

/// The result as the API states it, the three counts and the split bar.
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
                    count(vote.votesFor, "pour", Palette.positiveText)
                    count(vote.votesAgainst, "contre", Palette.negativeText)
                    count(vote.abstentions, vote.abstentions == 1 ? "abstention" : "abstentions", Palette.textPrimary)
                }
                if let pour = vote.votesFor, let contre = vote.votesAgainst, let abstention = vote.abstentions {
                    VoteSplitBar(pour: pour, contre: contre, abstention: abstention, size: .large)
                }
            }
        }
    }

    private func count(_ value: Int?, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value.map(MonEluFormat.count) ?? "–")
                .font(Typography.heading(.title))
                .monospacedDigit()
                .foregroundStyle(color)
            Text(label)
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// The followed deputy's own position, or that they recorded none.
struct FollowedPositionCard: View {
    let position: DeputyPosition?

    var body: some View {
        Card {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Votre député")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                    Text(position?.name ?? "Pas de position enregistrée sur ce scrutin")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let position {
                    VotePositionBadge(position: position.position)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("vote.followed")
    }
}

/// One group's split on the scrutin: its chip, a bar and the counts.
private struct GroupPositionsRow: View {
    let group: GroupPositions
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
        layout {
            PartyChip(group.group, short: group.group)
                .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 76, alignment: .leading)
            bar.accessibilityHidden(true)
            Text(summary)
                .font(.caption.monospacedDigit())
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: dynamicTypeSize.isAccessibilitySize ? false : true, vertical: true)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(group.group) : \(bar.accessibilityText)")
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
