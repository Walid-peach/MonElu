import MonEluCore
import MonEluUI
import SwiftUI

// The pieces of a deputy's profile. Accueil (#463, #477) shows the same deputy,
// so each section is its own view taking plain models.

/// The deputy's group as its chip, opening the group's page when the
/// bundled table knows it.
struct GroupLink: View {
    let name: String
    let short: String?

    var body: some View {
        let chip = PartyChip(name, short: short)
        if let slug = ReferenceData.groupSlug(named: name) {
            NavigationLink(value: AppRoute.group(slug: slug)) { chip }
                .buttonStyle(.plain)
                .accessibilityHint("Ouvre la page du groupe")
                .accessibilityIdentifier("deputy.group")
        } else {
            chip
        }
    }
}

/// The deputy's constituency, opening the département's page when the
/// bundled table knows its name. Secondary grey like the design (#520), with a
/// chevron so it still reads as a way in.
struct ConstituencyLink: View {
    let constituency: String
    let department: String?

    var body: some View {
        let label = Label(constituency, systemImage: "mappin.and.ellipse")
            .font(.subheadline)
            .fixedSize(horizontal: false, vertical: true)
        if let code = ReferenceData.departmentCode(named: department) {
            NavigationLink(value: AppRoute.department(code: code)) {
                HStack(spacing: 4) {
                    label
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Palette.textSecondary)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Ouvre la page du département")
            .accessibilityIdentifier("deputy.department")
        } else {
            label.foregroundStyle(Palette.textSecondary)
        }
    }
}

/// Portrait, name, group, constituency and mandate.
struct DeputyHeader: View {
    let profile: DeputyProfile

    private var deputy: DeputyItem { profile.deputy }

    var body: some View {
        VStack(spacing: 8) {
            DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 96)
            Text(deputy.name)
                .font(Typography.heading(.title))
                .foregroundStyle(Palette.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let group = deputy.group {
                GroupLink(name: group, short: deputy.groupShort)
            }
            if let constituency = deputy.constituency {
                ConstituencyLink(constituency: constituency, department: deputy.department)
            }
            if let mandate = Self.mandate(start: profile.mandateStart, end: profile.mandateEnd) {
                Text(mandate)
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        // Contain, not combine: the group and département are links VoiceOver
        // must reach on their own.
        .accessibilityElement(children: .contain)
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
/// Scrutins solennels come first, before raw presence (design A), and the
/// presence notes always show with the presence figure.
struct DeputyScorecardSection: View {
    let scorecard: DeputyScorecard
    let configuration: AppConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Activité en séance")
                StatTileGrid {
                    StatTile(
                        value: MonEluFormat.percent(scorecard.solennelParticipationRate),
                        label: "Scrutins solennels",
                        detail: "\(MonEluFormat.count(scorecard.solennelsCast)) sur \(MonEluFormat.count(scorecard.eligibleSolennels))"
                    )
                    StatTile(
                        value: MonEluFormat.percent(scorecard.votingDaysRate),
                        label: "Jours de vote",
                        detail: "\(MonEluFormat.count(scorecard.votingDaysPresent)) sur \(MonEluFormat.count(scorecard.eligibleVotingDays))"
                    )
                    StatTile(
                        value: MonEluFormat.percent(scorecard.presenceRate, decimals: 1),
                        label: "Présence aux scrutins",
                        detail: "Tous scrutins"
                    )
                }
                .accessibilityIdentifier("deputy.presence")
                CaveatNote(id: "presence_rate", in: configuration)
                // The president's note only where it explains the figure: a
                // presence of 100 % as the API returns it, which only the
                // president reaches by construction (#520). No deputy id is
                // copied into Swift for this.
                if Self.showsPresidentNote(presenceRate: scorecard.presenceRate) {
                    CaveatNote(id: "president_presence", in: configuration)
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader("Positions exprimées")
                Card {
                    VStack(alignment: .leading, spacing: 10) {
                        VoteSplitBar(
                            pour: scorecard.votesFor, contre: scorecard.votesAgainst,
                            abstention: scorecard.abstentions, size: .large
                        )
                        FlowLayout(spacing: 14) {
                            PositionCount(position: "pour", count: scorecard.votesFor)
                            PositionCount(position: "contre", count: scorecard.votesAgainst)
                            PositionCount(position: "abstention", count: scorecard.abstentions)
                        }
                    }
                }
            }
        }
    }
}

extension DeputyScorecardSection {
    /// True for a presence of 100 % as returned by the API (rounded to the
    /// tenth the tile shows): the figure the president's caveat explains.
    static func showsPresidentNote(presenceRate: Double) -> Bool {
        presenceRate >= 0.9995
    }
}

private struct PositionCount: View {
    let position: String
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            VotePositionBadge(position: position)
            Text(MonEluFormat.count(count))
                .font(.subheadline.weight(.semibold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// How often the deputy votes with their group, from `getAlignment`, and
/// the way to the scrutins where they did not.
struct DeputyAlignmentSection: View {
    let deputyID: String
    let alignment: DeputyAlignment
    let configuration: AppConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Fidélité au groupe")
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(MonEluFormat.percent(alignment.alignmentRate, decimals: 1))
                            .font(Typography.heading(.title))
                            .monospacedDigit()
                            .foregroundStyle(Palette.textPrimary)
                        Spacer(minLength: 8)
                        Text("\(MonEluFormat.count(alignment.dissidentVotes)) vote\(alignment.dissidentVotes > 1 ? "s" : "") divergent\(alignment.dissidentVotes > 1 ? "s" : "")")
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                    }
                    Text("de ses votes suivent la majorité de son groupe")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Capsule(style: .circular)
                        .fill(Palette.trackBackground)
                        .frame(height: 8)
                        .overlay(alignment: .leading) {
                            GeometryReader { proxy in
                                Capsule(style: .circular)
                                    .fill(Palette.textPrimary)
                                    .frame(width: proxy.size.width * min(max(alignment.alignmentRate, 0), 1))
                            }
                        }
                        .accessibilityHidden(true)
                    CaveatNote(id: "group_alignment", in: configuration)
                    if alignment.dissidentVotes > 0 {
                        NavigationLink(value: AppRoute.dissidentVotes(deputyID: deputyID)) {
                            HStack(spacing: 4) {
                                Text("Voir ses votes divergents")
                                Image(systemName: "chevron.right").accessibilityHidden(true)
                            }
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.accent)
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("deputy.dissident")
                    }
                }
            }
        }
    }
}

/// The deputy's latest scrutins in one card, with the rows Accueil uses: the
/// result and the short date, the title, then their position (#520).
struct DeputyRecentVotesSection: View {
    let votes: [DeputyVote]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Votes récents")
            if votes.isEmpty {
                Text("Aucun vote enregistré.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
            } else {
                HomeVoteList(votes) { vote in
                    NavigationLink(value: AppRoute.vote(id: vote.id)) {
                        HomeVoteRow(vote: vote, isNew: false)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("deputy.vote")
                }
            }
        }
    }
}
