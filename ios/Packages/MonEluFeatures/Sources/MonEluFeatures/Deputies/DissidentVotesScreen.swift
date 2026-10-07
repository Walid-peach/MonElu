import MonEluCore
import MonEluUI
import SwiftUI

/// The scrutins where a deputy voted against their group's majority
/// (`getDissidentVotes`), each with both positions.
public struct DissidentVotesScreen: View {
    @State private var loader: Loader<DissidentVotes>

    public init(deputyID: String, service: any DeputiesService) {
        _loader = State(initialValue: Loader(isEmpty: { $0.items.isEmpty }) {
            try await service.dissidentVotes(id: deputyID)
        })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(
                title: "Aucun vote divergent",
                message: "Ce député a toujours voté comme la majorité de son groupe.",
                systemImage: "checkmark.circle"
            )
        ) { votes in
            DissidentVotesList(votes: votes)
        }
        .navigationTitle("Votes divergents")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The loaded list, separate from loading so it can be snapshot-tested.
struct DissidentVotesList: View {
    let votes: DissidentVotes

    var body: some View {
        List {
            Section {
                ForEach(votes.items) { vote in
                    NavigationLink(value: AppRoute.vote(id: vote.id)) {
                        DissidentVoteRow(vote: vote)
                    }
                    .listRowBackground(Palette.cardBackground)
                    .accessibilityIdentifier("dissident.vote")
                }
            } header: {
                Text(
                    votes.total > votes.items.count
                        ? "Les \(MonEluFormat.count(votes.items.count)) plus récents, sur \(MonEluFormat.count(votes.total))"
                        : "\(MonEluFormat.count(votes.total)) scrutin\(votes.total > 1 ? "s" : "")"
                )
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .accessibilityIdentifier("screen.dissidentVotes")
    }
}

struct DissidentVoteRow: View {
    let vote: DissidentVote

    var body: some View {
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
            FlowLayout(spacing: 14) {
                position("Son vote", vote.position)
                position("Son groupe", vote.majorityPosition)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func position(_ label: String, _ position: String) -> some View {
        HStack(spacing: 6) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Palette.textSecondary)
            VotePositionBadge(position: position)
        }
    }
}
