import MonEluCore
import MonEluUI
import SwiftUI

// Accueil's pieces shared with the feed and the profile (#477, #565), each
// taking plain models so they are snapshot-tested without a network.

/// The line under the title, on every state of the home.
struct HomeTagline: View {
    var body: some View {
        Text("Le Parlement, près de vous.")
            .font(.subheadline)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// One scrutin: how it ended, when, what it was, and the deputy's position,
/// which is theirs and not the result. The title says what was voted ("L'ensemble
/// du projet de loi…", "L'amendement n° 12…"), so the row has no separate scope line.
struct HomeVoteRow: View {
    @Environment(\.today) private var today
    let vote: DeputyVote
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    if let result = vote.result { VoteResultBadge(result: result) }
                    if let date = vote.date {
                        Text(MonEluFormat.listDay(date, today: today))
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
                position
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textMuted)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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

/// Vote rows in one card, divided by inset lines, as on Explorer and the profile.
struct HomeVoteList<Item: Identifiable, Row: View>: View {
    let items: [Item]
    let row: (Item) -> Row

    init<S: Sequence>(_ items: S, @ViewBuilder row: @escaping (Item) -> Row) where S.Element == Item {
        self.items = Array(items)
        self.row = row
    }

    var body: some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { Divider().overlay(Palette.border).padding(.leading, 16) }
                    row(item)
                }
            }
        }
    }
}

/// When a séance item starts, what it is about and its theme.
struct HomeAgendaCard: View {
    let entry: AgendaEntry
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(MonEluFormat.shortSitting(entry.start))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.accent)
            Text(entry.headline.lead)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .multilineTextAlignment(.leading)
                .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
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

/// Under the feed, a way into another tab: a question to the assistant, or
/// the quiz.
struct HomeInvitation: View {
    let tab: AppTab
    let title: String
    let message: String
    let hint: String
    let identifier: String
    @Environment(\.openTab) private var openTab
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Opens the Quiz: the user's own answers on real scrutins.
    static let quiz = HomeInvitation(
        tab: .quiz, title: "Et si vous votiez ?",
        message: "Répondez à de vrais scrutins et découvrez quels députés votent comme vous.",
        hint: "Ouvre le quiz", identifier: "home.quiz"
    )

    /// Opens Questions, the assistant over the votes; shown only while
    /// `features.chat` is on (#573).
    static let ask = HomeInvitation(
        tab: .ask, title: "Une question sur leurs votes ?",
        message: "Posez-la en français : les réponses citent les scrutins.",
        hint: "Ouvre l'onglet Demander", identifier: "home.ask"
    )

    var body: some View {
        Button { openTab(tab) } label: {
            HStack(spacing: 14) {
                // Decorative; at large text it would leave the words a sliver.
                if !typeSize.isAccessibilitySize {
                    Image(systemName: tab.systemImage)
                        .font(.title2)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(Typography.heading(.headline))
                        .foregroundStyle(Palette.textPrimary)
                    Text(message)
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
        .accessibilityHint(hint)
        .accessibilityIdentifier(identifier)
    }
}
