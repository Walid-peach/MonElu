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
    let isNew: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                    : AnyLayout(HStackLayout(spacing: 8))
                layout {
                    if isNew { NewDot() }
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

/// Marks one row held since the previous visit; read as "Nouveau".
struct NewDot: View {
    var body: some View {
        Circle()
            .fill(Palette.accent)
            .frame(width: 8, height: 8)
            .accessibilityElement()
            .accessibilityLabel("Nouveau")
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

/// The week's next séance items, side by side; each opens the agenda, which
/// holds the full week.
struct HomeAgendaSection: View {
    // `nonisolated`: a `View`'s statics are main-actor isolated, and
    // `upcoming` below reads this one from outside the main actor (#579).
    nonisolated static let count = 5

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

    /// The items from today on, in order, at most `count`: a sitting already
    /// held this week is in the agenda, not on Accueil.
    nonisolated static func upcoming(_ items: [AgendaEntry], now: Date) -> [AgendaEntry] {
        let today = MonEluFormat.parisCalendar.startOfDay(for: now)
        return Array(items.filter { $0.start >= today }.sorted { $0.start < $1.start }.prefix(count))
    }

    private var title: some View {
        Text("Cette semaine à l'Assemblée")
            .font(Typography.heading(.title2))
            .foregroundStyle(Palette.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private var agendaLink: some View {
        NavigationLink(value: AppRoute.agenda()) {
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
            NavigationLink(value: AppRoute.agenda()) {
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
