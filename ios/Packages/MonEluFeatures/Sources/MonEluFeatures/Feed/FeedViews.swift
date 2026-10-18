import MonEluCore
import MonEluUI
import SwiftUI

// The Accueil feed's pieces (#565, design « Accueil V1 »), each taking plain
// models so the feed is snapshot-tested without a network. The API decides
// which scrutins get a card and in what order (ADR-042); these views only
// draw what it returned.

/// The feed's entries, in the API's order, then the way into the quiz.
struct FeedContent: View {
    let page: FeedPage
    let tab: FeedTab
    /// The followed deputies, in the followed order.
    var deputyIDs: [String] = []
    /// Their names by id, once their profiles loaded: a card names each
    /// deputy when more than one is followed.
    var deputyNames: [String: String] = [:]
    /// The recap card's week (`GET /feed/week`); nil leaves it out.
    var week: FeedWeek?
    /// True in « Pour vous » while no deputy is followed: the card that finds one.
    var showsFindDeputy = false
    /// True with no deputy and no theme followed: « Pour vous » is empty by
    /// design (ADR-042 §4), and says how to fill it rather than "nothing this week".
    var followsNothing = false
    var onOpenRecap: () -> Void = {}
    var onFindDeputy: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if page.noSitting {
                NoSittingNote(weekStart: page.weekStart, weekEnd: page.weekEnd)
            }
            if tab == .pourVous {
                if showsFindDeputy {
                    FindDeputyCard(onFind: onFindDeputy)
                } else if let week, !week.deputies.isEmpty {
                    FeedRecapPager(week: week, names: names, onOpen: onOpenRecap)
                }
            }
            if page.entries.isEmpty {
                FeedEmptyNote(tab: tab, followsNothing: followsNothing)
            }
            ForEach(page.entries) { entry in
                switch entry {
                case .scrutin(let card):
                    FeedScrutinCardView(card: card, names: names)
                case .agenda(let agenda):
                    NavigationLink(value: AppRoute.agenda()) {
                        HomeAgendaCard(entry: agenda)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("feed.agenda")
                case .rollup(let rollup):
                    FeedRollupView(rollup: rollup, name: rollup.deputyID.flatMap { names.name(of: $0) })
                }
            }
            HomeQuizInvitation()
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("feed.\(tab.rawValue)")
    }

    private var names: FollowedDeputyNames {
        FollowedDeputyNames(names: deputyNames, count: deputyIDs.count)
    }
}

/// How a card names a followed deputy: « Votre député » while only one is
/// followed, their own name once there are several (ADR-042 amendment §3).
struct FollowedDeputyNames: Hashable, Sendable {
    var names: [String: String] = [:]
    var count = 1

    /// Nil when one deputy is followed: the card says « Votre député ».
    func name(of id: String) -> String? {
        count > 1 ? (names[id] ?? "Député suivi") : nil
    }
}

/// Said when a tab has nothing this week.
struct FeedEmptyNote: View {
    let tab: FeedTab
    var followsNothing = false

    var body: some View {
        Text(message)
        .font(.subheadline)
        .foregroundStyle(Palette.textSecondary)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 8)
    }

    var message: String {
        switch tab {
        case .pourVous where followsNothing:
            "Vous ne suivez encore rien. Suivez votre député ou un thème avec « + Suivre » "
                + "pour voir ici leurs votes de la semaine."
        case .pourVous:
            "Rien cette semaine pour ce que vous suivez. L'onglet « À l'Assemblée » montre les grands votes."
        case .assemblee:
            "Aucun grand vote cette semaine."
        }
    }
}

/// One scrutin: what kind of vote and when, what it decided, its split, each
/// followed deputy's position, and the ways to the detail and the source.
struct FeedScrutinCardView: View {
    let card: FeedScrutinCard
    var names = FollowedDeputyNames()
    @Environment(\.today) private var today
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                header
                NavigationLink(value: AppRoute.vote(id: card.id)) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(card.summary ?? card.title.capitalizingFirstLetter)
                            .font(Typography.heading(.title3))
                            .headingLineSpacing()
                            .foregroundStyle(Palette.textPrimary)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if card.summary != nil {
                            Text(card.title.capitalizingFirstLetter)
                                .font(.subheadline)
                                .foregroundStyle(Palette.textSecondary)
                                .multilineTextAlignment(.leading)
                                .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                                .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("feed.scrutin")
                tally
                ForEach(card.positions, id: \.deputyID) { entry in
                    deputyLine(entry.position, name: names.name(of: entry.deputyID))
                }
                if card.kind == "motion" {
                    Text("Une motion adoptée rejette le texte ou le renvoie en commission ; rejetée, le débat continue.")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                links
            }
        }
    }

    private var header: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            Text(kindLabel)
                .font(.caption.weight(.bold))
                .textCase(.uppercase)
                .foregroundStyle(card.isClosest ? Palette.accent : Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let date = card.date {
                Text(MonEluFormat.listDay(date, today: today))
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            if let theme = card.theme { ThemeTag(name: theme) }
        }
    }

    /// "Texte entier", "Motion"… and "Le plus serré" on the week's closest.
    private var kindLabel: String {
        let kind = switch card.kind {
        case "ensemble": "Texte entier"
        case "motion": "Motion"
        case "amendement": "Amendement"
        case "article": "Article"
        default: "Scrutin"
        }
        return card.isClosest ? "\(kind) · le plus serré" : kind
    }

    @ViewBuilder private var tally: some View {
        if let pour = card.votesFor, let contre = card.votesAgainst {
            VStack(alignment: .leading, spacing: 6) {
                VoteSplitBar(pour: pour, contre: contre, abstention: card.abstentions ?? 0)
                // Stacked at accessibility sizes, so the counts wrap instead of truncating.
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
                    : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    Text("\(MonEluFormat.count(pour)) pour · \(MonEluFormat.count(contre)) contre")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
                    if let result = card.result { VoteResultBadge(result: result) }
                }
            }
        } else if let result = card.result {
            VoteResultBadge(result: result)
        }
    }

    private func deputyLine(_ position: String, name: String?) -> some View {
        // Stacked at accessibility sizes, so the label wraps instead of truncating.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
            : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            Text(name ?? "Votre député")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            VotePositionBadge(position: position)
            // A position on a motion is a position on the motion, not on the
            // text: say so, since "pour" here can mean against the bill.
            if card.kind == "motion", position == "pour" || position == "contre" {
                Text("la motion")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.pageBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var links: some View {
        HStack {
            NavigationLink(value: AppRoute.vote(id: card.id)) {
                HStack(spacing: 4) {
                    Text("Voir le scrutin")
                    Image(systemName: "arrow.right").accessibilityHidden(true)
                }
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            // The headline above is the same link; VoiceOver reads it once.
            .accessibilityHidden(true)
            Spacer(minLength: 8)
            if let url = card.officialURL {
                Link(destination: url) {
                    HStack(spacing: 4) {
                        Text("Source officielle")
                        Image(systemName: "arrow.up.right").accessibilityHidden(true)
                    }
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .frame(minHeight: 44)
                }
                .accessibilityHint("Ouvre la page du scrutin sur le site de l'Assemblée nationale")
            }
        }
    }
}

/// One followed deputy's other votes of the week, counted by the API.
struct FeedRollupView: View {
    let rollup: FeedRollup
    /// The deputy's name when several are followed; nil says « votre député ».
    var name: String?

    var body: some View {
        let content = VStack(alignment: .leading, spacing: 4) {
            Text(headline)
                .font(.body.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if !detail.isEmpty {
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(Palette.border, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
        )
        if let deputyID = rollup.deputyID {
            NavigationLink(value: AppRoute.deputy(id: deputyID)) { content }
                .buttonStyle(.plain)
                .accessibilityIdentifier("feed.rollup")
        } else {
            content
        }
    }

    var headline: String {
        let whose = name.map { "de \($0)" } ?? "de votre député"
        return switch rollup.total {
        case 0: "Pas d'autre vote \(whose) cette semaine"
        case 1: "Et 1 autre vote \(whose)"
        default: "Et \(MonEluFormat.count(rollup.total)) autres votes \(whose)"
        }
    }

    /// "17 amendements · 2 articles · non-votant sur 3 scrutins".
    var detail: String {
        var parts: [String] = []
        if rollup.amendements > 0 { parts.append(Self.counted(rollup.amendements, "amendement")) }
        if rollup.articles > 0 { parts.append(Self.counted(rollup.articles, "article")) }
        if rollup.autres > 0 { parts.append(Self.counted(rollup.autres, "autre scrutin", plural: "autres scrutins")) }
        if rollup.nonVotant > 0 {
            parts.append("non-votant sur \(Self.counted(rollup.nonVotant, "scrutin"))")
        }
        return parts.joined(separator: " · ")
    }

    static func counted(_ count: Int, _ singular: String, plural: String? = nil) -> String {
        "\(MonEluFormat.count(count)) \(count > 1 ? (plural ?? singular + "s") : singular)"
    }
}
