import MonEluCore
import MonEluUI
import SwiftUI

// The pieces of a deputy's profile. Mon député (#463) shows the same deputy,
// so each section is its own view taking plain models.

/// Portrait, name, group, constituency and mandate.
struct DeputyHeader: View {
    let profile: DeputyProfile
    @Environment(\.dynamicTypeSize) private var typeSize

    private var deputy: DeputyItem { profile.deputy }

    var body: some View {
        // Beside the text, the portrait would leave large text a column too
        // narrow for "circonscription"; above it, the text has the full width.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 16))
        layout {
            DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 88)
            VStack(alignment: .leading, spacing: 6) {
                Text(deputy.name)
                    .font(Typography.heading(.title2))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let group = deputy.group {
                    Text(group)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Palette.accent)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let constituency = deputy.constituency {
                    Label(constituency, systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let mandate = Self.mandate(start: profile.mandateStart, end: profile.mandateEnd) {
                    Text(mandate)
                        .font(.footnote)
                        .foregroundStyle(Palette.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    /// The mandate in words, from the dates the API returned; nothing is
    /// written for a date it did not return.
    static func mandate(start: Date?, end: Date?) -> String? {
        switch (start, end) {
        case let (start?, end?): "Mandat du \(MonEluFormat.day(start)) au \(MonEluFormat.day(end))"
        case let (start?, nil): "En mandat depuis le \(MonEluFormat.day(start))"
        case let (nil, end?): "Mandat terminé le \(MonEluFormat.day(end))"
        case (nil, nil): nil
        }
    }
}

/// The deputy's voting figures. Every number is a field of the scorecard
/// response, rates included: Swift only formats them (ADR-041 §4).
struct DeputyScorecardSection: View {
    let scorecard: DeputyScorecard
    let configuration: AppConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Activité en séance")
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 10) { rateCards }
                VStack(spacing: 10) { rateCards }
            }
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    RateFigure(
                        rate: scorecard.presenceRate,
                        title: "Présence aux scrutins",
                        detail: "\(MonEluFormat.count(scorecard.totalVotes)) scrutins avec une position enregistrée"
                    )
                    // Both notes on every profile: the president's 100 % is
                    // structural, and the app cannot tell who presides
                    // without copying an id into Swift. Other deputies reach
                    // 100 % too, so the note is not tied to the figure.
                    CaveatNote(id: "presence_rate", in: configuration)
                    CaveatNote(id: "president_presence", in: configuration)
                }
            }
            .accessibilityIdentifier("deputy.presence")
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Positions exprimées")
                        .font(.headline)
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    PositionCount(position: "pour", count: scorecard.votesFor)
                    PositionCount(position: "contre", count: scorecard.votesAgainst)
                    PositionCount(position: "abstention", count: scorecard.abstentions)
                }
            }
        }
    }

    @ViewBuilder private var rateCards: some View {
        Card {
            RateFigure(
                rate: scorecard.solennelParticipationRate,
                title: "Scrutins solennels",
                detail: "\(MonEluFormat.count(scorecard.solennelsCast)) sur \(MonEluFormat.count(scorecard.eligibleSolennels))"
            )
        }
        Card {
            RateFigure(
                rate: scorecard.votingDaysRate,
                title: "Jours de vote",
                detail: "\(MonEluFormat.count(scorecard.votingDaysPresent)) sur \(MonEluFormat.count(scorecard.eligibleVotingDays))"
            )
        }
    }
}

/// A rate as the API returned it, its name, and the counts behind it.
private struct RateFigure: View {
    let rate: Double
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(MonEluFormat.percent(rate))
                .font(.title.weight(.semibold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Text(detail)
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct PositionCount: View {
    let position: String
    let count: Int

    var body: some View {
        HStack {
            VotePositionBadge(position: position)
            Spacer()
            Text(MonEluFormat.count(count))
                .font(.body.weight(.semibold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The deputy's latest scrutins, each with their position; a row opens the
/// scrutin.
struct DeputyRecentVotesSection: View {
    let votes: [DeputyVote]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Votes récents")
            if votes.isEmpty {
                Text("Aucun vote enregistré.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
            }
            ForEach(votes) { vote in
                NavigationLink(value: AppRoute.vote(id: vote.id)) {
                    DeputyVoteRow(vote: vote)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("deputy.vote")
            }
        }
    }
}

/// A scrutin with the deputy's position and its result, as a card.
struct DeputyVoteRow: View {
    let vote: DeputyVote
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    // At large text the date gets its own line, rather than
                    // a sliver beside the badge.
                    let layout = typeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
                        : AnyLayout(HStackLayout(spacing: 8))
                    layout {
                        VotePositionBadge(position: vote.position)
                        if let date = vote.date {
                            Text(MonEluFormat.day(date))
                                .font(.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Palette.textMuted)
                        .accessibilityHidden(true)
                }
                // Three lines in a list of rows; in full at large text, which
                // must wrap rather than truncate.
                Text(vote.title.capitalizingFirstLetter)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                    .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
                if let result = vote.result {
                    VoteResultBadge(result: result)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
