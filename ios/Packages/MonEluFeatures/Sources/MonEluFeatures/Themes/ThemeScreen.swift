import MonEluCore
import MonEluUI
import SwiftUI

/// A theme's page (web: `/themes/[slug]`; design A, Thème): how many scrutins,
/// how many adopted, the closest one, how each group votes, and the latest.
public struct ThemeScreen: View {
    @State private var loader: Loader<ThemePage?>
    @Environment(\.appConfiguration) private var configuration

    public init(slug: String, service: any ThemesService) {
        _loader = State(initialValue: Loader(isEmpty: { $0 == nil }) { try await service.theme(slug: slug) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Thème introuvable", message: "Ce thème n'existe pas.", systemImage: "tag")
        ) { theme in
            if let theme {
                ScrollView {
                    ThemeContent(theme: theme, configuration: configuration)
                        .padding(.vertical, 16)
                }
            }
        }
        .navigationTitle("Thème")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The page's content, separate from loading so it can be snapshot-tested.
struct ThemeContent: View {
    let theme: ThemePage
    let configuration: AppConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
            if let vote = theme.mostDivided {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Le vote le plus serré")
                    NavigationLink(value: AppRoute.vote(id: vote.id)) {
                        Card { DividedThemeVote(vote: vote) }
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
            }
            if !theme.partyPositions.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Qui vote pour")
                    Card {
                        VStack(spacing: 0) {
                            ForEach(Array(theme.byPourRate.enumerated()), id: \.element.id) { index, position in
                                if index > 0 { Divider().overlay(Palette.border) }
                                PartyPourRow(position: position)
                            }
                        }
                    }
                    Text("Part des votes « pour » parmi les positions exprimées par les députés du groupe, sur tous les scrutins du thème.")
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 16)
            }
            if !theme.votes.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Derniers scrutins")
                        .padding(.horizontal, 16)
                    VStack(spacing: 0) {
                        ForEach(Array(theme.votes.enumerated()), id: \.element.id) { index, vote in
                            if index > 0 { Divider().overlay(Palette.border) }
                            NavigationLink(value: AppRoute.vote(id: vote.id)) {
                                HStack(spacing: 8) {
                                    VoteRowView(vote: vote)
                                    Image(systemName: "chevron.right")
                                        .font(.footnote.weight(.semibold))
                                        .foregroundStyle(Palette.textSecondary)
                                        .accessibilityHidden(true)
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("theme.vote")
                        }
                    }
                    .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
                    .padding(.horizontal, 16)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("theme.page")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("THÈME")
                .font(.caption.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(Palette.textSecondary)
            Text(theme.name)
                .font(Typography.heading(.largeTitle))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            StatTileGrid {
                StatTile(value: MonEluFormat.count(theme.voteCount), label: countLabel)
                if let rate = theme.adoptionRate {
                    StatTile(value: MonEluFormat.percent(rate, decimals: 1), label: "adoptés")
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 16)
    }

    /// "scrutins depuis le 1 juillet 2025": the data horizon from `GET /app/config`.
    private var countLabel: String {
        let noun = theme.voteCount > 1 ? "scrutins" : "scrutin"
        guard let horizon = MonEluFormat.calendarDate(configuration.dataHorizon) else { return noun }
        return "\(noun) depuis le \(MonEluFormat.day(horizon))"
    }
}

/// The closest scrutin of the theme: its counts as the API returned them.
struct DividedThemeVote: View {
    let vote: ThemeDividedVote

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            let bar = VoteSplitBar(pour: vote.votesFor, contre: vote.votesAgainst, abstention: 0)
            // The result first, as the design's meta line reads (#527).
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let result = vote.result { VoteResultBadge(result: result) }
                Text([vote.date.map(MonEluFormat.day), "\(MonEluFormat.count(vote.votesFor)) pour, \(MonEluFormat.count(vote.votesAgainst)) contre"]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(vote.title.capitalizingFirstLetter)
                .font(.subheadline)
                .foregroundStyle(Palette.textPrimary)
                .lineLimit(4)
            bar
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }
}

/// One group's share of "pour", as the API computed it.
struct PartyPourRow: View {
    let position: ThemePartyPosition
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let rate = MonEluFormat.percent(position.pourRate)
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(alignment: .center, spacing: 10))
        layout {
            PartyChip(position.short ?? "Non inscrit", short: position.short)
                // One column for every chip, "Non inscrit" included, so the bars line up.
                .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 96, alignment: .leading)
            Capsule(style: .circular)
                .fill(Palette.trackBackground)
                .frame(height: 8)
                .overlay(alignment: .leading) {
                    GeometryReader { proxy in
                        Capsule(style: .circular)
                            .fill(Palette.positive)
                            .frame(width: proxy.size.width * min(max(position.pourRate, 0), 1))
                    }
                }
                .accessibilityHidden(true)
            Text(rate)
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
                .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? nil : 48, alignment: .trailing)
        }
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(position.short ?? "Non inscrits") : \(rate) de pour")
    }
}
