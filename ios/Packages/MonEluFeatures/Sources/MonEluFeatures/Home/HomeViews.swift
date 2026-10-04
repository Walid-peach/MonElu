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

/// The followed deputy's home.
struct HomeDeputyContent: View {
    let home: MonDeputeHome
    /// False while the assistant is switched off (`/app/config`).
    let offersQuestions: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            HomeTagline()
            HomeIdentityCard(profile: home.profile)
            HomeRecentVotesSection(
                deputyID: home.profile.deputy.id, votes: home.recentVotes, since: home.sinceLastVisit
            )
            VStack(spacing: 12) {
                if offersQuestions { HomeAskInvitation() }
                HomeQuizInvitation()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("home.deputy")
    }
}

/// The deputy on a navy card; the whole card opens their profile.
struct HomeIdentityCard: View {
    let profile: DeputyProfile
    @Environment(\.dynamicTypeSize) private var typeSize

    private var deputy: DeputyItem { profile.deputy }

    var body: some View {
        NavigationLink(value: AppRoute.deputy(id: deputy.id)) {
            // At large text the portrait goes above, so the name keeps the
            // card's full width.
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                : AnyLayout(HStackLayout(alignment: .center, spacing: 16))
            layout {
                DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 80)
                VStack(alignment: .leading, spacing: 6) {
                    Text(deputy.name)
                        .font(Typography.heading(.title2))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(Self.role(of: deputy))
                        .font(.subheadline)
                        .opacity(0.85)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 4) {
                        Text("Voir son profil")
                        Image(systemName: "arrow.right")
                            .accessibilityHidden(true)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
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

    /// "Votre député · Gironde", or the role alone when the API has no
    /// département for them.
    static func role(of deputy: DeputyItem) -> String {
        [Optional("Votre député"), deputy.department].compactMap { $0 }.joined(separator: " · ")
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

    private var position: some View {
        let (color, _) = VotePositionBadge.colors(vote.position)
        // The dot stays on the first line when the label wraps at large text.
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] }
                .accessibilityHidden(true)
            let label = Text(VotePositionBadge.label(vote.position))
                .fontWeight(.semibold)
                .foregroundStyle(color)
            Text("Son vote : \(label)")
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(.subheadline)
    }
}

/// Marks a scrutin held since the previous visit.
private struct NewBadge: View {
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

/// Before a deputy is chosen: the Assembly's latest scrutins, so a first visit
/// shows a real decision rather than only a form.
struct HomeLatestVotesSection: View {
    static let count = 3

    let state: LoadState<[VoteItem]>
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
        Text("Les derniers votes de l'Assemblée")
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
                        HStack(spacing: 12) {
                            VoteRowView(vote: vote)
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Palette.textMuted)
                                .accessibilityHidden(true)
                        }
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
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

/// Opens Demander. Shown only while the assistant is switched on.
struct HomeAskInvitation: View {
    @Environment(\.openTab) private var openTab
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Button { openTab(.ask) } label: {
            HStack(spacing: 14) {
                // Decorative; at large text it would leave the words a sliver.
                if !typeSize.isAccessibilitySize {
                    Image(systemName: "bubble.left")
                        .font(.title3)
                        .accessibilityHidden(true)
                }
                Text("Une question sur ses votes ?")
                    .font(Typography.heading(.headline))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "arrow.right")
                    .accessibilityHidden(true)
            }
            .foregroundStyle(Palette.textPrimary)
            .padding(16)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .strokeBorder(Palette.border, lineWidth: 1.5)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Ouvre Demander")
        .accessibilityIdentifier("home.ask")
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
