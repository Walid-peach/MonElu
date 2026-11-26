import MonEluCore
import MonEluUI
import Observation
import SwiftUI

struct DeputyNameResults: Hashable, Sendable {
    let deputies: [DeputyItem]
    let total: Int?

    var isTruncated: Bool {
        (total ?? 0) > deputies.count
    }
}

@MainActor
@Observable
final class DeputyNameSearchModel {
    static let minimumLength = 2

    var query = ""
    let loader: Loader<DeputyNameResults>

    private let service: any DeputiesService
    private var applied: String?

    init(service: any DeputiesService) {
        self.service = service
        let box = NameSearchBox()
        loader = Loader(cache: nil, key: { nil }, isEmpty: { $0.deputies.isEmpty }) { _ in
            try await box.results()
        }
        box.model = self
    }

    var search: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isSearchable: Bool {
        search.count >= Self.minimumLength
    }

    var needsSearch: Bool {
        isSearchable && search != applied
    }

    func run() async {
        await loader.load()
    }

    fileprivate func results() async throws -> DeputyNameResults {
        let search = search
        let page = try await service.deputies(DeputyQuery(search: search, active: true))
        applied = search
        return DeputyNameResults(deputies: page.items, total: page.total)
    }
}

@MainActor
private final class NameSearchBox {
    weak var model: DeputyNameSearchModel?

    func results() async throws -> DeputyNameResults {
        try await model?.results() ?? DeputyNameResults(deputies: [], total: 0)
    }
}

struct FollowByNameScreen: View {
    @State private var model: DeputyNameSearchModel
    @State private var isSearching = false
    let followedIDs: Set<String>
    let onFollow: (DeputyItem) -> Void
    @Environment(\.dismiss) private var dismiss

    init(service: any DeputiesService, followedIDs: Set<String>, onFollow: @escaping (DeputyItem) -> Void) {
        _model = State(initialValue: DeputyNameSearchModel(service: service))
        self.followedIDs = followedIDs
        self.onFollow = onFollow
    }

    var body: some View {
        @Bindable var model = model
        Group {
            if model.isSearchable {
                LoadStateView(
                    model.loader,
                    empty: EmptyStateView(
                        title: "Aucun député en mandat",
                        message: "Aucun nom ne correspond. Vérifiez l'orthographe.",
                        systemImage: "magnifyingglass"
                    )
                ) {
                    FollowByNameResults(
                        results: DeputyNameResults(deputies: DeputyItem.placeholders, total: nil), followedIDs: []
                    ) { _ in }
                } content: { results in
                    FollowByNameResults(results: results, followedIDs: followedIDs) { deputy in
                        onFollow(deputy)
                        isSearching = false
                        dismiss()
                    }
                }
            } else {
                EmptyStateView(
                    title: "Chercher un député",
                    message: "Tapez au moins deux lettres de son nom. Seuls les députés en mandat sont proposés.",
                    systemImage: "person.crop.circle.badge.magnifyingglass"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Palette.pageBackground)
            }
        }
        .navigationTitle("Chercher par nom")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $model.query, isPresented: $isSearching,
            placement: .navigationBarDrawer(displayMode: .always), prompt: "Nom du député"
        )
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .task(id: model.search) {
            guard model.needsSearch else { return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await model.run()
        }
    }
}

struct FollowByNameResults: View {
    let results: DeputyNameResults
    let followedIDs: Set<String>
    let follow: (DeputyItem) -> Void

    var body: some View {
        List {
            Section {
                ForEach(results.deputies) { deputy in
                    row(deputy, followed: followedIDs.contains(deputy.id))
                        .listRowBackground(Palette.cardBackground)
                        .accessibilityIdentifier("followByName.result")
                }
            } header: {
                if let total = results.total {
                    Text("\(MonEluFormat.count(total)) en mandat")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
            } footer: {
                if results.isTruncated {
                    Text("Seuls les \(results.deputies.count) premiers sont affichés : précisez le nom.")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.immediately)
        .background(Palette.pageBackground)
    }

    @ViewBuilder private func row(_ deputy: DeputyItem, followed: Bool) -> some View {
        if followed {
            FollowByNameRow(deputy: deputy, followed: true)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(deputy.name), déjà suivi")
        } else {
            Button { follow(deputy) } label: {
                FollowByNameRow(deputy: deputy, followed: false)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Suivre \(deputy.name)")
        }
    }
}

private struct FollowByNameRow: View {
    let deputy: DeputyItem
    let followed: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: Spacing.xs))
            : AnyLayout(HStackLayout(spacing: Spacing.s))
        layout {
            DeputyRowView(deputy: deputy)
            HStack(spacing: Spacing.xxs) {
                if followed {
                    Image(systemName: "checkmark")
                    Text("Suivi")
                } else {
                    Text("Suivre")
                }
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(followed ? Palette.textSecondary : Palette.accent)
        }
        .contentShape(Rectangle())
    }
}
