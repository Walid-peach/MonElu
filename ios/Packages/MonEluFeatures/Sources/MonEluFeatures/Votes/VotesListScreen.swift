import MonEluCore
import MonEluUI
import SwiftUI

/// Explorer's vote list (#488, design A): every scrutin, newest first and
/// grouped by day, with search and chips for the result, the votes on a
/// whole text and the theme (web: `/votes`).
public struct VotesListScreen: View {
    @State private var model: VotesListModel
    @State private var picksTheme = false

    public init(service: any VotesService) {
        _model = State(initialValue: VotesListModel(service: service))
    }

    /// Over a model already loaded, for snapshot tests.
    init(model: VotesListModel) {
        _model = State(initialValue: model)
    }

    public var body: some View {
        @Bindable var model = model
        // The chips sit above the list rather than in a top safe-area inset:
        // an inset over a List leaves the large title blank (#477).
        VStack(spacing: 0) {
            VoteChips(model: model) { picksTheme = true }
                .padding(.vertical, 6)
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
        .navigationTitle("Votes")
        .navigationBarTitleDisplayMode(.inline)
        // Always shown, as the design draws it (#522).
        .searchable(
            text: $model.searchText, placement: .navigationBarDrawer(displayMode: .always), prompt: "Rechercher un scrutin"
        )
        .autocorrectionDisabled()
        .confirmationDialog("Thème", isPresented: $picksTheme, titleVisibility: .visible) {
            Button("Tous les thèmes") { model.theme = nil }
            ForEach(model.themes) { theme in
                Button(theme.name) { model.theme = theme.name }
            }
        }
        // Reload when the search or a chip changes, after a pause so typing
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

/// The result chips, "Textes entiers" and the theme chip.
struct VoteChips: View {
    let model: VotesListModel
    let pickTheme: () -> Void

    var body: some View {
        FilterChipRow(chips) { id in
            switch id {
            case "whole": model.wholeTextsOnly.toggle()
            case "theme": pickTheme()
            default: model.filter = VotesListModel.ResultFilter(rawValue: id) ?? .all
            }
        }
        .accessibilityIdentifier("votes.chips")
    }

    private var chips: [FilterChip] {
        VotesListModel.ResultFilter.allCases.map {
            FilterChip(id: $0.rawValue, title: $0.label, isSelected: model.filter == $0)
        } + [
            FilterChip(id: "whole", title: "Textes entiers", isSelected: model.wholeTextsOnly),
            FilterChip(id: "theme", title: model.theme ?? "Thème", isSelected: model.theme != nil, opensSheet: true),
        ]
    }
}

/// The loaded list, in sections by sitting day. Separate from the screen so
/// it can be snapshot-tested without a network.
struct VotesList: View {
    let votes: [VoteItem]
    let isLoadingMore: Bool
    var loadMoreFailure: LoadFailure?
    let loadMore: () async -> Void

    var body: some View {
        List {
            ForEach(Self.days(votes), id: \.id) { day in
                Section {
                    ForEach(day.votes) { vote in
                        NavigationLink(value: AppRoute.vote(id: vote.id)) {
                            ExplorerVoteRow(vote: vote)
                        }
                        .listRowBackground(Palette.cardBackground)
                        .accessibilityIdentifier("vote.row")
                        .task {
                            // Not after a failure: the footer's retry decides, so a
                            // dead connection is not retried on every scroll.
                            if vote.id == votes.last?.id, loadMoreFailure == nil { await loadMore() }
                        }
                    }
                } header: {
                    Text(day.title.uppercased())
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Palette.textSecondary)
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
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .accessibilityIdentifier("votes.list")
    }

    struct Day {
        let id: String
        let title: String
        var votes: [VoteItem]
    }

    /// Consecutive scrutins of the same Paris day, in the API's order.
    static func days(_ votes: [VoteItem]) -> [Day] {
        var days: [Day] = []
        for vote in votes {
            let id = vote.date.map(MonEluFormat.isoDay) ?? "undated"
            if let last = days.indices.last, days[last].id == id {
                days[last].votes.append(vote)
            } else {
                days.append(Day(id: id, title: vote.date.map(MonEluFormat.fullDay) ?? "Sans date", votes: [vote]))
            }
        }
        return days
    }
}

/// A scrutin in Explorer: its result and theme, the title on three lines,
/// and its split with the three counts.
struct ExplorerVoteRow: View {
    let vote: VoteItem
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if let result = vote.result { VoteResultBadge(result: result) }
                if let theme = vote.theme {
                    Text(theme)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Text(vote.title.capitalizingFirstLetter)
                .font(.subheadline)
                .foregroundStyle(Palette.textPrimary)
                .lineLimit(typeSize.isAccessibilitySize ? nil : 3)
                .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
            if let pour = vote.votesFor, let contre = vote.votesAgainst, let abstention = vote.abstentions {
                HStack(spacing: 10) {
                    VoteSplitBar(pour: pour, contre: contre, abstention: abstention)
                        .accessibilityHidden(true)
                    Text("\(pour) · \(contre) · \(abstention)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(Palette.textSecondary)
                        .accessibilityLabel("\(pour) pour, \(contre) contre, \(abstention) abstentions")
                        .fixedSize()
                }
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}
