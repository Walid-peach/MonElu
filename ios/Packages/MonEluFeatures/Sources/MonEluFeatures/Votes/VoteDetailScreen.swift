import MonEluCore
import MonEluUI
import SwiftUI

/// A scrutin's page: result, counts, plain-language summary and how each
/// group voted (web: `/votes/[id]`).
public struct VoteDetailScreen: View {
    @State private var loader: Loader<VoteDetail>
    @Environment(\.appConfiguration) private var configuration

    public init(id: String, service: any VotesService) {
        _loader = State(initialValue: Loader { try await service.vote(id: id) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Scrutin introuvable", message: "Ce scrutin n'existe pas ou plus.")
        ) { vote in
            ScrollView {
                VoteDetailContent(vote: vote, configuration: configuration)
                    .padding(16)
            }
        }
        .navigationTitle("Scrutin")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The detail's content, separate from loading so it can be snapshot-tested.
struct VoteDetailContent: View {
    let vote: VoteDetail
    let configuration: AppConfiguration

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            header
            counts
            if let summary = vote.item.summary, !summary.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    SectionHeader("En clair")
                    Text(summary)
                        .font(.body)
                        .foregroundStyle(Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    CaveatNote(id: "llm_generated", in: configuration)
                }
            }
            if let url = vote.dossierURL {
                Link(destination: url) {
                    Label(vote.dossierTitle ?? "Voir le parcours du texte", systemImage: "arrow.up.right.square")
                        .font(.subheadline.weight(.medium))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .tint(Palette.accent)
                .accessibilityHint("Ouvre le parcours du texte sur le site MonÉlu")
            }
            if !vote.positions.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeader("Positions par groupe")
                    CaveatNote(id: "non_votant", in: configuration)
                    ForEach(vote.positionsByGroup) { GroupPositionsRow(group: $0) }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("vote.detail")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if let result = vote.item.result {
                    VoteResultBadge(result: result)
                }
                if let date = vote.item.date {
                    Text(MonEluFormat.day(date))
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Text(vote.item.title.capitalizingFirstLetter)
                .font(Typography.heading(.title2))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        }
    }

    /// The scrutin's totals, as the API returns them.
    private var counts: some View {
        Card {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 16) { countCells }
                VStack(alignment: .leading, spacing: 10) { countCells }
            }
        }
    }

    @ViewBuilder private var countCells: some View {
        CountCell(position: "pour", count: vote.votesFor)
        CountCell(position: "contre", count: vote.votesAgainst)
        CountCell(position: "abstention", count: vote.abstentions)
    }
}

private struct CountCell: View {
    let position: String
    let count: Int?

    var body: some View {
        HStack(spacing: 8) {
            VotePositionBadge(position: position)
            Text(count.map(String.init) ?? "–")
                .font(.title3.weight(.semibold).monospacedDigit())
                .foregroundStyle(Palette.textPrimary)
        }
        // Rigid, so ViewThatFits sees when three cells do not fit on one line
        // and stacks them instead of clipping the last number.
        .fixedSize()
        .accessibilityElement(children: .combine)
    }
}

/// One group's split on the scrutin.
private struct GroupPositionsRow: View {
    let group: GroupPositions

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                Text(group.group)
                    .font(.headline)
                    .foregroundStyle(Palette.textPrimary)
                FlowRow(spacing: 8) {
                    ForEach(group.ordered, id: \.position) { entry in
                        HStack(spacing: 4) {
                            VotePositionBadge(position: entry.position)
                            Text("\(entry.count)")
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(Palette.textSecondary)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }
}

/// Lays its children left to right, wrapping to a new line when they no
/// longer fit, so badges stay whole at large text sizes.
private struct FlowRow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(width: proposal.width ?? .infinity, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let arrangement = arrange(width: bounds.width, subviews: subviews)
        for (subview, origin) in zip(subviews, arrangement.origins) {
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y), proposal: .unspecified)
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
        var origins: [CGPoint] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return (CGSize(width: widest, height: y + rowHeight), origins)
    }
}
