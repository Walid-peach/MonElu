import MonEluCore
import MonEluUI
import SwiftUI

// Accueil's pieces (#477), each taking plain models so the home is
// snapshot-tested without a network. The order follows the design review's
// option 2: the deputy as a personal anchor, then their actual decisions,
// then one route into a question and one into the quiz.

/// The line under the title, on every state of the home.
struct HomeTagline: View {
    var body: some View {
        Text("Le Parlement, près de vous.")
            .font(.title3)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// The followed deputy's home (design A, Accueil): the deputy, their latest
/// votes, the week at the Assembly, its latest votes, then the quiz and
/// Demander.
struct HomeDeputyContent: View {
    let home: MonDeputeHome
    /// False while the assistant is switched off (`/app/config`).
    let offersQuestions: Bool
    /// The current week's séance items; nil until loaded, or when they failed.
    var agenda: [AgendaEntry]?
    var latestVotes: LoadState<[VoteItem]> = .idle
    var onRetryLatest: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HomeTagline()
            HomeIdentityCard(home: home)
            HomeRecentVotesSection(
                deputyID: home.profile.deputy.id, votes: home.recentVotes, since: home.sinceLastVisit
            )
            if let agenda { HomeAgendaSection(entries: agenda) }
            HomeLatestVotesSection(state: latestVotes, since: home.sinceLastVisit, onRetry: onRetryLatest)
            HomeInvitations(offersQuestions: offersQuestions)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("home.deputy")
    }
}

/// The deputy on a navy card: who they are, two of their figures as the API
/// returns them, and the way to their profile. The whole card opens it.
struct HomeIdentityCard: View {
    let home: MonDeputeHome
    @Environment(\.dynamicTypeSize) private var typeSize

    private var deputy: DeputyItem { home.profile.deputy }

    var body: some View {
        NavigationLink(value: AppRoute.deputy(id: deputy.id)) {
            VStack(alignment: .leading, spacing: 14) {
                Text(Self.role(of: deputy))
                    .font(.footnote.weight(.semibold))
                    .opacity(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                // At large text the portrait goes above, so the name keeps the
                // card's full width.
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: 14))
                layout {
                    DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 64)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(deputy.name)
                            .font(Typography.heading(.title2))
                            .fixedSize(horizontal: false, vertical: true)
                        if let line = Self.seat(of: deputy) {
                            Text(line)
                                .font(.subheadline)
                                .opacity(0.85)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                figures
                Text("Voir son profil")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(Palette.onIdentity.opacity(0.5), lineWidth: 1)
                    )
            }
            .foregroundStyle(Palette.onIdentity)
            .multilineTextAlignment(.leading)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.identityBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("home.identity")
    }

    @ViewBuilder private var figures: some View {
        let solennel = home.scorecard.map {
            IdentityFigure(value: MonEluFormat.percent($0.solennelParticipationRate), label: "des scrutins solennels")
        }
        let aligned = home.alignment.map {
            IdentityFigure(
                value: MonEluFormat.percent($0.alignmentRate, decimals: 1), label: "de votes alignés sur son groupe"
            )
        }
        if solennel != nil || aligned != nil {
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(spacing: 8))
                : AnyLayout(HStackLayout(alignment: .top, spacing: 8))
            layout {
                solennel
                aligned
            }
        }
    }

    /// "Votre député · Gironde", or the role alone when the API has no
    /// département for them.
    static func role(of deputy: DeputyItem) -> String {
        [Optional("Votre député"), deputy.department].compactMap { $0 }.joined(separator: " · ")
    }

    /// "La France insoumise - NFP · 10e circ.", or whichever half the API returned.
    static func seat(of deputy: DeputyItem) -> String? {
        let seat = deputy.circonscription.map { $0 == "1" ? "1re circ." : "\($0)e circ." }
        let parts = [deputy.group, seat].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// One figure on the identity card.
private struct IdentityFigure: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(Typography.heading(.title))
                .monospacedDigit()
            Text(label)
                .font(.footnote)
                .opacity(0.85)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Palette.onIdentity.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

/// The deputy's three latest scrutins, the new ones marked, with a line on
/// what changed since the previous visit. Recent votes stay when nothing is
/// new, so the home never ends on "come back later".
struct HomeRecentVotesSection: View {
    static let count = 3

    let deputyID: String
    /// Nil when the list failed to load.
    let votes: [DeputyVote]?
    let since: SinceLastVisit

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) { title; Spacer(minLength: 12); seeAll }
                VStack(alignment: .leading, spacing: 6) { title; seeAll }
            }
            if let status = Self.status(since) {
                Text(status)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            rows
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: some View {
        Text("Ses derniers votes")
            .font(Typography.heading(.title2))
            .foregroundStyle(Palette.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    /// The profile lists the deputy's ten latest votes.
    private var seeAll: some View {
        NavigationLink(value: AppRoute.deputy(id: deputyID)) {
            HStack(spacing: 4) {
                Text("Tout voir")
                Image(systemName: "arrow.right")
                    .accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.textPrimary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Voir tous ses votes")
        .accessibilityIdentifier("home.see-all")
    }

    @ViewBuilder private var rows: some View {
        switch votes {
        case nil:
            note("Ses derniers votes n'ont pas pu être chargés.")
        case let votes? where votes.isEmpty:
            note("Aucun vote enregistré pour l'instant.")
        case let votes?:
            VStack(spacing: 0) {
                ForEach(Array(votes.prefix(Self.count).enumerated()), id: \.element.id) { index, vote in
                    if index > 0 { Divider().overlay(Palette.border) }
                    NavigationLink(value: AppRoute.vote(id: vote.id)) {
                        HomeVoteRow(vote: vote, isNew: since.isNew(vote))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.vote")
                }
            }
            .padding(.top, 6)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 8)
    }

    /// What changed since the previous visit; nothing on a first visit.
    static func status(_ since: SinceLastVisit) -> String? {
        switch since {
        case .firstVisit:
            nil
        case .unavailable:
            "Les nouveaux votes n'ont pas pu être vérifiés."
        case .votes(let votes, let after) where votes.isEmpty:
            "Rien de nouveau depuis le scrutin du \(MonEluFormat.day(after))."
        case .votes(let votes, _):
            "\(newCount(votes.count)) depuis votre dernière visite"
        }
    }

    /// "1 nouveau vote", "3 nouveaux votes"; the API returns at most 50.
    static func newCount(_ count: Int) -> String {
        switch count {
        case 1: "1 nouveau vote"
        case LiveDeputiesService.sinceVotesCount...: "Au moins \(count) nouveaux votes"
        default: "\(count) nouveaux votes"
        }
    }
}

/// One scrutin: when, how it ended, what it was, its scope, and the deputy's
/// position, which is theirs and not the result.
struct HomeVoteRow: View {
    let vote: DeputyVote
    let isNew: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    if isNew { NewBadge() }
                    if let date = vote.date {
                        Text(MonEluFormat.day(date))
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                    }
                    if let result = vote.result { VoteResultBadge(result: result) }
                }
                Text(vote.title.capitalizingFirstLetter)
                    .font(Typography.heading(.headline))
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                    .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
                if let scope = vote.scope {
                    Text(scope)
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                position
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textMuted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 14)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// The badge moves under the label rather than splitting it at large text.
    private var position: some View {
        FlowLayout(spacing: 6) {
            Text("Son vote :")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize()
            VotePositionBadge(position: vote.position)
        }
    }
}

/// Marks a scrutin held since the previous visit.
struct NewBadge: View {
    var body: some View {
        Text("Nouveau")
            .font(.caption.weight(.semibold))
            .foregroundStyle(Palette.onIdentity)
            .fixedSize()
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Palette.identityBackground, in: Capsule())
    }
}

/// The Assembly's latest scrutins with their split, on every state of the
/// home, so a first visit shows a real decision rather than only a form.
/// Those held since the previous visit are marked.
struct HomeLatestVotesSection: View {
    static let count = 3

    let state: LoadState<[VoteItem]>
    var since: SinceLastVisit = .firstVisit
    let onRetry: () -> Void
    @Environment(\.openTab) private var openTab

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) { title; Spacer(minLength: 12); seeAll }
                VStack(alignment: .leading, spacing: 6) { title; seeAll }
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: some View {
        Text("Les derniers votes")
            .font(Typography.heading(.title2))
            .foregroundStyle(Palette.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private var seeAll: some View {
        Button { openTab(.explore) } label: {
            HStack(spacing: 4) {
                Text("Tout voir")
                Image(systemName: "arrow.right")
                    .accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.textPrimary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Voir tous les votes")
        .accessibilityIdentifier("home.latest-see-all")
    }

    @ViewBuilder private var content: some View {
        switch state {
        case .idle, .loading:
            ProgressView()
                .tint(Palette.accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
        case .empty:
            note("Aucun scrutin pour l'instant.")
        case .failed(let failure):
            VStack(alignment: .leading, spacing: 8) {
                note(
                    failure == .offline
                        ? "Hors connexion : les derniers votes n'ont pas pu être chargés."
                        : "Les derniers votes n'ont pas pu être chargés."
                )
                Button("Réessayer", action: onRetry)
                    .buttonStyle(.bordered)
                    .tint(Palette.accent)
            }
        case .loaded(let votes):
            VStack(spacing: 0) {
                ForEach(Array(votes.enumerated()), id: \.element.id) { index, vote in
                    if index > 0 { Divider().overlay(Palette.border) }
                    NavigationLink(value: AppRoute.vote(id: vote.id)) {
                        HomeLatestVoteRow(vote: vote, isNew: since.isNew(date: vote.date))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.latest-vote")
                }
            }
            .padding(.top, 6)
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.top, 8)
    }
}

/// A scrutin of the Assembly: how it ended, when, what it was, and its split.
struct HomeLatestVoteRow: View {
    let vote: VoteItem
    let isNew: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    if isNew { NewBadge() }
                    if let result = vote.result { VoteResultBadge(result: result) }
                    if let date = vote.date {
                        Text(MonEluFormat.day(date))
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                Text(vote.title.capitalizingFirstLetter)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                    .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
                if let pour = vote.votesFor, let contre = vote.votesAgainst, let abstention = vote.abstentions {
                    VoteSplitBar(pour: pour, contre: contre, abstention: abstention)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textMuted)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The current week's séance items, side by side; each opens the agenda.
struct HomeAgendaSection: View {
    let entries: [AgendaEntry]
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline) { title; Spacer(minLength: 12); agendaLink }
                VStack(alignment: .leading, spacing: 6) { title; agendaLink }
            }
            if entries.isEmpty {
                Text("Pas de séance publique prévue cette semaine.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else if typeSize.isAccessibilitySize {
                // Cards a third of the screen wide would leave the words a sliver.
                VStack(spacing: 10) { cards }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 10) { cards }
                }
                .scrollClipDisabled()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var title: some View {
        Text("Cette semaine à l'Assemblée")
            .font(Typography.heading(.title2))
            .foregroundStyle(Palette.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private var agendaLink: some View {
        NavigationLink(value: AppRoute.agenda) {
            HStack(spacing: 4) {
                Text("Agenda")
                Image(systemName: "arrow.right").accessibilityHidden(true)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Palette.textPrimary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ouvrir l'agenda")
        .accessibilityIdentifier("home.agenda")
    }

    private var cards: some View {
        ForEach(entries) { entry in
            NavigationLink(value: AppRoute.agenda) {
                HomeAgendaCard(entry: entry)
                    .frame(width: typeSize.isAccessibilitySize ? nil : 220)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home.agenda-item")
        }
    }
}

/// When a séance item starts, what it is about and its theme.
struct HomeAgendaCard: View {
    let entry: AgendaEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(MonEluFormat.shortSitting(entry.start))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.accent)
            Text(entry.headline.lead)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if let tag = entry.theme ?? entry.pointTypeLabel {
                Text(tag)
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 130, alignment: .topLeading)
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }
}

/// The quiz and, while the assistant is on, Demander, side by side.
struct HomeInvitations: View {
    let offersQuestions: Bool
    @Environment(\.openTab) private var openTab
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 10))
        layout {
            tile("Et si vous votiez ?", "De vrais scrutins", systemImage: AppTab.quiz.systemImage, tab: .quiz, filled: true)
                .accessibilityHint("Ouvre le quiz")
                .accessibilityIdentifier("home.quiz")
            if offersQuestions {
                tile("Une question sur ses votes ?", "Réponses sourcées", systemImage: "bubble.left", tab: .ask, filled: false)
                    .accessibilityHint("Ouvre Demander")
                    .accessibilityIdentifier("home.ask")
            }
        }
    }

    private func tile(_ title: String, _ detail: String, systemImage: String, tab: AppTab, filled: Bool) -> some View {
        Button { openTab(tab) } label: {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: systemImage)
                    .font(.title3)
                    .accessibilityHidden(true)
                Text(title)
                    .font(Typography.heading(.headline))
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
            }
            .foregroundStyle(Palette.textPrimary)
            .multilineTextAlignment(.leading)
            .padding(14)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(
                filled ? Palette.trackBackground : Palette.cardBackground,
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(filled ? .clear : Palette.border, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

/// Opens the Quiz: the user's own answers on real scrutins.
struct HomeQuizInvitation: View {
    @Environment(\.openTab) private var openTab
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Button { openTab(.quiz) } label: {
            HStack(spacing: 14) {
                // Decorative; at large text it would leave the words a sliver.
                if !typeSize.isAccessibilitySize {
                    Image(systemName: AppTab.quiz.systemImage)
                        .font(.title2)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Et si vous votiez ?")
                        .font(Typography.heading(.headline))
                        .foregroundStyle(Palette.textPrimary)
                    Text("Répondez à de vrais scrutins et découvrez quels députés votent comme vous.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "arrow.right")
                    .accessibilityHidden(true)
            }
            .foregroundStyle(Palette.textPrimary)
            .padding(16)
            .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Ouvre le quiz")
        .accessibilityIdentifier("home.quiz")
    }
}
