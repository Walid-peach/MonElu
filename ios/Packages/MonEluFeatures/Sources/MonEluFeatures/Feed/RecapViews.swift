import MonEluCore
import MonEluUI
import SwiftUI

// The top of « Pour vous » (#566, design « Accueil V1 »): the week in counts
// when a deputy is followed, the way to find one when none is, and a note
// when the week shown is not the current one.

/// « Votre semaine à l'Assemblée »: the followed deputy's positions and the
/// week's laws and motions, all counted by the API (`GET /feed/week`). A tap
/// shows the week's headline votes (the « À l'Assemblée » tab).
struct FeedRecapCard: View {
    let week: FeedWeek
    var onOpen: () -> Void = {}

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 12) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline) { eyebrow; Spacer(minLength: 8); span }
                    VStack(alignment: .leading, spacing: 2) { eyebrow; span }
                }
                if let deputy = week.deputy {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(MonEluFormat.count(deputy.cast))
                            .font(Typography.heading(.largeTitle))
                        Text(deputy.cast == 1 ? "vote de votre député" : "votes de votre député")
                            .font(.subheadline)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if deputy.cast + deputy.nonVotant > 0 {
                        VoteSplitBar(
                            pour: deputy.pour, contre: deputy.contre, abstention: deputy.abstention,
                            nonVotant: deputy.nonVotant
                        )
                    }
                    Text(Self.positions(deputy))
                        .font(.footnote)
                        .opacity(0.9)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Divider().overlay(Palette.onIdentity.opacity(0.25))
                HStack {
                    Text(Self.outcomes(week))
                        .font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(Palette.onIdentity)
            .multilineTextAlignment(.leading)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Palette.identityBackground, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Montre les grands votes de la semaine")
        .accessibilityIdentifier("feed.recap")
    }

    private var eyebrow: some View {
        Text("Votre semaine à l'Assemblée")
            .font(.footnote.weight(.bold))
            .foregroundStyle(Palette.onIdentityAccent)
    }

    private var span: some View {
        Text(MonEluFormat.span(from: week.weekStart, to: week.weekEnd))
            .font(.footnote)
            .opacity(0.85)
    }

    /// "14 pour · 6 abstentions · 3 contre", then the non-votants apart.
    nonisolated static func positions(_ deputy: FeedWeekDeputy) -> String {
        var parts = [
            "\(MonEluFormat.count(deputy.pour)) pour",
            counted(deputy.abstention, "abstention"),
            "\(MonEluFormat.count(deputy.contre)) contre",
        ]
        if deputy.nonVotant > 0 {
            parts.append("non-votant sur \(counted(deputy.nonVotant, "scrutin"))")
        }
        return parts.joined(separator: " · ")
    }

    /// "1 loi adoptée · 1 motion rejetée", or the scrutin count when the week
    /// carried neither.
    nonisolated static func outcomes(_ week: FeedWeek) -> String {
        var parts: [String] = []
        if week.lawsAdopted > 0 { parts.append(counted(week.lawsAdopted, "loi adoptée", plural: "lois adoptées")) }
        if week.lawsRejected > 0 { parts.append(counted(week.lawsRejected, "loi rejetée", plural: "lois rejetées")) }
        if week.motionsAdopted > 0 {
            parts.append(counted(week.motionsAdopted, "motion adoptée", plural: "motions adoptées"))
        }
        if week.motionsRejected > 0 {
            parts.append(counted(week.motionsRejected, "motion rejetée", plural: "motions rejetées"))
        }
        return parts.isEmpty ? counted(week.scrutins, "scrutin") + " cette semaine" : parts.joined(separator: " · ")
    }

    nonisolated static func counted(_ count: Int, _ singular: String, plural: String? = nil) -> String {
        "\(MonEluFormat.count(count)) \(count > 1 ? (plural ?? singular + "s") : singular)"
    }
}

/// In place of the recap while no deputy is followed: the way to find one.
struct FindDeputyCard: View {
    var onFind: () -> Void

    var body: some View {
        Button(action: onFind) {
            HStack(spacing: 14) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.title2)
                    .foregroundStyle(Palette.accent)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Trouvez votre député")
                        .font(Typography.heading(.title3))
                        .foregroundStyle(Palette.textPrimary)
                    Text("Avec votre code postal, pour voir ses votes ici chaque semaine.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(16)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("feed.find-deputy")
    }
}

/// Said above the feed when the current week had no sitting and the last
/// week that sat is shown instead (ADR-042 §5).
struct NoSittingNote: View {
    let weekStart: String
    let weekEnd: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "moon.zzz")
                .foregroundStyle(Palette.textSecondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Pas de séance cette semaine")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.textPrimary)
                Text("Voici la dernière semaine de séance, du \(MonEluFormat.span(from: weekStart, to: weekEnd)).")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("feed.no-sitting")
    }
}
