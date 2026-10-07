import MonEluCore
import MonEluUI
import SwiftUI

/// Explorer's deputy list (#488, design A): every deputy by surname, with
/// search and chips for the group, the user's own département and current
/// mandates (web: `/deputes`).
public struct DeputiesListScreen: View {
    @State private var model: DeputiesListModel
    @State private var picksGroup = false

    public init(service: any DeputiesService, followedDeputyID: String?) {
        _model = State(initialValue: DeputiesListModel(service: service, followedDeputyID: followedDeputyID))
    }

    /// Over a model already loaded, for snapshot tests.
    init(model: DeputiesListModel) {
        _model = State(initialValue: model)
    }

    public var body: some View {
        @Bindable var model = model
        // The chips sit above the list rather than in a top safe-area inset:
        // an inset over a List leaves the large title blank (#477).
        VStack(spacing: 0) {
            DeputyChips(model: model) { picksGroup = true }
                .padding(.vertical, 6)
            LoadStateView(
                model.loader,
                empty: EmptyStateView(
                    title: "Aucun député",
                    message: "Aucun député ne correspond à cette recherche.",
                    systemImage: "magnifyingglass"
                )
            ) { deputies in
                DeputiesList(
                    deputies: deputies, total: model.total, inMandateOnly: model.inMandateOnly,
                    isLoadingMore: model.isLoadingMore, loadMoreFailure: model.loadMoreFailure
                ) {
                    await model.loadMore()
                }
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Députés")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $model.searchText, prompt: "Rechercher un député")
        .autocorrectionDisabled()
        .confirmationDialog("Groupe", isPresented: $picksGroup, titleVisibility: .visible) {
            Button("Tous les groupes") { model.groupSlug = nil }
            ForEach(model.groups) { group in
                Button(group.name) { model.groupSlug = group.slug }
            }
        }
        .toolbar {
            if let slug = model.groupSlug {
                ToolbarItem(placement: .primaryAction) {
                    NavigationLink(value: AppRoute.group(slug: slug)) { Text("Voir le groupe") }
                        .accessibilityIdentifier("deputies.open-group")
                }
            }
        }
        .task { await model.loadMyDepartment() }
        // Reload when the search or a chip changes, after a pause so typing
        // does not send one request per letter.
        .task(id: model.criteria) {
            guard model.needsReload else { return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            await model.reload()
        }
        .accessibilityIdentifier("screen.deputies")
    }
}

/// The group chip, which opens the group picker, and the two toggles.
struct DeputyChips: View {
    let model: DeputiesListModel
    let pickGroup: () -> Void

    var body: some View {
        FilterChipRow(chips) { id in
            switch id {
            case "group": pickGroup()
            case "department": model.onlyMyDepartment.toggle()
            case "mandate": model.inMandateOnly.toggle()
            default: break
            }
        }
        .accessibilityIdentifier("deputies.chips")
    }

    private var chips: [FilterChip] {
        var chips = [
            FilterChip(
                id: "group", title: model.groupName ?? "Tous les groupes",
                isSelected: model.groupSlug != nil, opensSheet: true
            ),
        ]
        if model.myDepartment != nil {
            chips.append(FilterChip(id: "department", title: "Mon département", isSelected: model.onlyMyDepartment))
        }
        chips.append(FilterChip(id: "mandate", title: "En mandat", isSelected: model.inMandateOnly))
        return chips
    }
}

/// The loaded list, in sections by the surname's first letter. Separate
/// from the screen so it can be snapshot-tested without a network.
struct DeputiesList: View {
    let deputies: [DeputyItem]
    var total: Int?
    var inMandateOnly = false
    let isLoadingMore: Bool
    var loadMoreFailure: LoadFailure?
    let loadMore: () async -> Void

    var body: some View {
        List {
            ForEach(Array(Self.sections(deputies).enumerated()), id: \.offset) { index, section in
                Section {
                    ForEach(section.deputies) { deputy in
                        NavigationLink(value: AppRoute.deputy(id: deputy.id)) {
                            ExplorerDeputyRow(deputy: deputy)
                        }
                        .listRowBackground(Palette.cardBackground)
                        .accessibilityIdentifier("deputy.row")
                        .task {
                            // Not after a failure: the footer's retry decides, so a
                            // dead connection is not retried on every scroll.
                            if deputy.id == deputies.last?.id, loadMoreFailure == nil { await loadMore() }
                        }
                    }
                } header: {
                    HStack {
                        Text(section.initial ?? "")
                            .font(.footnote.weight(.bold))
                            .accessibilityLabel(section.initial.map { "Lettre \($0)" } ?? "")
                        Spacer()
                        if index == 0, let total {
                            Text(
                                inMandateOnly
                                    ? "\(MonEluFormat.count(total)) en mandat"
                                    : "\(MonEluFormat.count(total)) député\(total > 1 ? "s" : "")"
                            )
                            .font(.footnote)
                        }
                    }
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
                .accessibilityIdentifier("deputies.load-more-failed")
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
        .accessibilityIdentifier("deputies.list")
    }

    struct LetterSection {
        let initial: String?
        var deputies: [DeputyItem]
    }

    /// Consecutive deputies sharing an initial, in the API's order (by surname).
    static func sections(_ deputies: [DeputyItem]) -> [LetterSection] {
        var sections: [LetterSection] = []
        for deputy in deputies {
            if let last = sections.indices.last, sections[last].initial == deputy.initial {
                sections[last].deputies.append(deputy)
            } else {
                sections.append(LetterSection(initial: deputy.initial, deputies: [deputy]))
            }
        }
        return sections
    }
}

/// A deputy in Explorer: portrait, name, département and seat, and the group chip.
struct ExplorerDeputyRow: View {
    let deputy: DeputyItem
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            // At large text the portrait and the chip leave the name a sliver,
            // so the chip moves under it and the portrait goes.
            if !typeSize.isAccessibilitySize {
                DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 44)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(deputy.name)
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Palette.textPrimary)
                if let place = Self.place(deputy) {
                    Text(place)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
                if typeSize.isAccessibilitySize, let short = deputy.groupShort {
                    PartyChip(short: short)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            if !typeSize.isAccessibilitySize, let short = deputy.groupShort {
                PartyChip(short: short)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// "Ariège · 2e", or whichever half the API returned.
    static func place(_ deputy: DeputyItem) -> String? {
        let seat = deputy.circonscription.map { $0 == "1" ? "1re" : "\($0)e" }
        let parts = [deputy.department, seat].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
