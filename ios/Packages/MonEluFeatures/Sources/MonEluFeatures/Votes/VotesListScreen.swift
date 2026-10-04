import MonEluCore
import MonEluUI
import SwiftUI

/// Explorer's vote list: every scrutin, newest first, with search and a
/// result filter (web: `/votes`). Explorer owns the model, so the search and
/// filter survive switching to the deputies and back.
public struct VotesListScreen: View {
    @Bindable private var model: VotesListModel

    public init(model: VotesListModel) {
        self.model = model
    }

    public var body: some View {
        // The filter sits above the list rather than in a top safe-area
        // inset: an inset over a List leaves the large title blank (#477).
        VStack(spacing: 0) {
            Picker("Résultat", selection: $model.filter) {
                ForEach(VotesListModel.ResultFilter.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            LoadStateView(
                model.loader,
                empty: EmptyStateView(
                    title: "Aucun scrutin",
                    message: "Aucun vote ne correspond à cette recherche.",
                    systemImage: "magnifyingglass"
                )
            ) { votes in
                VotesList(votes: votes, isLoadingMore: model.isLoadingMore, loadMoreFailure: model.loadMoreFailure) {
                    await model.loadMore()
                }
            }
        }
        .background(Palette.pageBackground)
        .searchable(text: $model.searchText, prompt: "Rechercher un scrutin")
        .autocorrectionDisabled()
        // Reload when the search or filter changes, after a pause so typing
        // does not send one request per letter.
        .task(id: model.criteria) {
            guard model.needsReload else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await model.reload()
        }
        .accessibilityIdentifier("screen.votes")
    }
}

/// The loaded list. Separate from the screen so it can be snapshot-tested
/// without a network.
struct VotesList: View {
    let votes: [VoteItem]
    let isLoadingMore: Bool
    var loadMoreFailure: LoadFailure?
    let loadMore: () async -> Void

    var body: some View {
        List {
            ForEach(votes) { vote in
                NavigationLink(value: AppRoute.vote(id: vote.id)) {
                    VoteRowView(vote: vote)
                }
                .listRowBackground(Palette.cardBackground)
                .accessibilityIdentifier("vote.row")
                .task {
                    // Not after a failure: the footer's retry decides, so a
                    // dead connection is not retried on every scroll.
                    if vote.id == votes.last?.id, loadMoreFailure == nil { await loadMore() }
                }
            }
            if let loadMoreFailure {
                VStack(alignment: .leading, spacing: 8) {
                    Text(
                        loadMoreFailure == .offline
                            ? "Hors connexion : la suite n'a pas pu être chargée."
                            : "La suite n'a pas pu être chargée."
                    )
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    Button("Charger la suite") { Task { await loadMore() } }
                        .buttonStyle(.bordered)
                        .tint(Palette.accent)
                }
                .listRowBackground(Palette.pageBackground)
                .accessibilityIdentifier("votes.load-more-failed")
            }
            if isLoadingMore {
                ProgressView()
                    .tint(Palette.accent)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Palette.pageBackground)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .accessibilityIdentifier("votes.list")
    }
}
