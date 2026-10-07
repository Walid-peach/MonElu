import MonEluCore
import MonEluUI
import SwiftUI

/// A parliamentary group's page (web: `/groupes/[slug]`; design A, Groupe):
/// its members' average presence and dissidence, who breaks ranks most, the
/// votes that split it, and its members.
public struct GroupScreen: View {
    @State private var loader: Loader<GroupPage?>
    @Environment(\.appConfiguration) private var configuration

    public init(slug: String, service: any GroupsService) {
        _loader = State(initialValue: Loader(isEmpty: { $0 == nil }) { try await service.group(slug: slug) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(
                title: "Groupe introuvable",
                message: "Ce groupe n'existe pas ou n'a plus de député en mandat.",
                systemImage: "person.3"
            )
        ) { group in
            if let group {
                ScrollView {
                    GroupContent(group: group, configuration: configuration)
                        .padding(.vertical, 16)
                }
            }
        }
        .navigationTitle("Groupe")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The page's content, separate from loading so it can be snapshot-tested.
struct GroupContent: View {
    let group: GroupPage
    let configuration: AppConfiguration
    @State var query = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            header
            if !group.mostDissident.isEmpty {
                section("Les plus souvent en désaccord avec le groupe") {
                    rows(group.mostDissident) { DissidentMemberRow(member: $0) }
                }
            }
            if !group.dividedVotes.isEmpty {
                section("Quand le groupe s'est divisé") {
                    rows(group.dividedVotes) { vote in
                        NavigationLink(value: AppRoute.vote(id: vote.id)) {
                            DividedVoteRow(vote: vote)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            members
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("group.page")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let short = group.short {
                PartyChip(short: short)
            }
            Text(group.name)
                .font(Typography.heading(.title))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("\(MonEluFormat.count(group.memberCount)) député\(group.memberCount > 1 ? "s" : "") en mandat")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
            if group.averagePresence != nil || group.averageDissidence != nil {
                StatTileGrid {
                    if let presence = group.averagePresence {
                        StatTile(value: MonEluFormat.percent(presence, decimals: 1), label: "Présence moyenne aux scrutins")
                    }
                    if let dissidence = group.averageDissidence {
                        StatTile(
                            value: MonEluFormat.percent(dissidence, decimals: 1),
                            label: "Votes contre la ligne du groupe, en moyenne"
                        )
                    }
                }
                .padding(.top, 6)
                CaveatNote(id: "presence_rate", in: configuration)
            }
        }
        .padding(.horizontal, 16)
    }

    private var members: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Les \(MonEluFormat.count(group.memberCount)) membres")
                .padding(.horizontal, 16)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Palette.textSecondary)
                    .accessibilityHidden(true)
                TextField("Rechercher dans le groupe", text: $query)
                    .autocorrectionDisabled()
                    .foregroundStyle(Palette.textPrimary)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 44)
            .background(Palette.trackBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(.horizontal, 16)
            let matches = group.members(matching: query)
            if matches.isEmpty {
                Text("Aucun membre ne correspond à cette recherche.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .padding(.horizontal, 16)
            } else {
                rows(matches) { member in
                    NavigationLink(value: AppRoute.deputy(id: member.deputy.id)) {
                        DeputyRowView(deputy: member.deputy, showsGroup: false)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("group.member")
                }
            }
        }
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title)
                .padding(.horizontal, 16)
            content()
        }
    }

    /// Rows in one card, separated by hairlines.
    private func rows<Item: Identifiable, Row: View>(
        _ items: [Item], @ViewBuilder row: @escaping (Item) -> Row
    ) -> some View {
        LazyVStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                if index > 0 { Divider().overlay(Palette.border) }
                row(item)
            }
        }
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        .padding(.horizontal, 16)
    }
}

/// A member and how often they voted against the group's line.
struct DissidentMemberRow: View {
    let member: GroupMember

    var body: some View {
        NavigationLink(value: AppRoute.deputy(id: member.deputy.id)) {
            HStack(spacing: 12) {
                DeputyPortrait(name: member.deputy.name, url: member.deputy.photoURL, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(member.deputy.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                    if let department = member.deputy.department {
                        Text(department)
                            .font(.caption)
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                if let rate = member.dissidentRate {
                    Text(MonEluFormat.percent(rate, decimals: 1))
                        .font(Typography.heading(.title3))
                        .monospacedDigit()
                        .foregroundStyle(Palette.textPrimary)
                        .accessibilityLabel("\(MonEluFormat.percent(rate, decimals: 1)) de votes contre le groupe")
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

/// A scrutin that split a set of deputies: its result and their own tally.
struct DividedVoteRow: View {
    let vote: GroupDividedVote
    /// Whose tally it is: "Dans le groupe", "En Gironde".
    var scope = "Dans le groupe"

    var body: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    if let result = vote.result {
                        VoteResultBadge(result: result)
                    }
                    if let date = vote.date {
                        Text(MonEluFormat.day(date))
                            .font(.caption)
                            .foregroundStyle(Palette.textSecondary)
                    }
                }
                Text(vote.title.capitalizingFirstLetter)
                    .font(.subheadline)
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(3)
                let bar = VoteSplitBar(pour: vote.pour, contre: vote.contre, abstention: vote.abstention)
                Text("\(scope) : \(bar.accessibilityText)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                bar.accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textSecondary)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
