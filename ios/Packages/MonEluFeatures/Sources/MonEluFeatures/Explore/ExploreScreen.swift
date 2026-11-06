import MonEluCore
import MonEluUI
import SwiftUI

/// The Explorer tab (#488, design A, Explorer): a contents page leading to
/// every way of browsing the record. The vote and deputy lists, the bills
/// and the agenda first, then the themes, the groups with their seats and
/// the départements, the user's own first.
public struct ExploreScreen: View {
    @State private var loader: Loader<ExploreHub>
    @State private var search: ExploreSearchModel
    private let store: any FollowedDeputyStore

    public init(
        deputies: any DeputiesService, votes: any VotesService, lois: any LoisService, groups: any GroupsService,
        postalCodes: any PostalCodeService, store: any FollowedDeputyStore
    ) {
        self.store = store
        _search = State(initialValue: ExploreSearchModel(
            search: ExploreSearch(deputies: deputies, votes: votes, postalCodes: postalCodes), lois: lois
        ))
        // The followed deputy is read on every load, not once: the user can
        // follow someone else on Accueil while Explorer stays alive.
        _loader = State(initialValue: Loader {
            await ExploreHub.load(deputies: deputies, lois: lois, groups: groups, followedDeputyID: store.deputyID)
        })
    }

    public var body: some View {
        Group {
            if search.isActive {
                ScrollView {
                    ExploreSearchResultsView(results: search.results).padding(.vertical, Spacing.s)
                }
                .scrollDismissesKeyboard(.interactively)
            } else {
                // Every part of the hub degrades on its own, so it is never empty
                // and never fails: the fixed tables (themes, départements) always show.
                LoadStateView(loader, empty: EmptyStateView(title: "Explorer", message: "")) { hub in
                    ScrollView {
                        ExploreContent(hub: hub).padding(.vertical, Spacing.s)
                    }
                }
            }
        }
        .background(Palette.pageBackground)
        // Always shown, as the design opens Explorer on it (#521).
        .searchable(
            text: Bindable(search).query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Vote, député, texte, commune"
        )
        .task(id: search.query) { await search.run() }
        .onAppear {
            // Followed or unfollowed since the hub loaded: its département row is stale.
            if let hub = loader.state.value, hub.followedDeputyID != store.deputyID {
                Task { await loader.refresh() }
            }
        }
        .navigationTitle("Explorer")
        .accessibilityIdentifier("screen.explore")
    }
}

/// The contents, separate from loading so it can be snapshot-tested.
struct ExploreContent: View {
    let hub: ExploreHub
    var themes: [ReferenceData.Theme] = (try? ReferenceData.themes()) ?? []

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            ExploreTiles(hub: hub)
            if !themes.isEmpty {
                section("Thèmes") {
                    FlowLayout(spacing: 8) {
                        ForEach(themes) { theme in
                            NavigationLink(value: AppRoute.theme(slug: theme.slug)) {
                                Text(theme.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Palette.textPrimary)
                                    .padding(.horizontal, Spacing.s)
                                    .frame(minHeight: 44)
                                    .surface()
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("explore.theme")
                        }
                    }
                }
            }
            if let groups = hub.groups, !groups.isEmpty {
                ExploreGroupsSection(groups: groups)
            }
            section("Départements") {
                ExploreRows {
                    if let mine = hub.myDepartment {
                        ExploreRow(route: .department(code: mine.code), id: "explore.my-department") {
                            Label("\(mine.name) · votre département", systemImage: "mappin.and.ellipse")
                        }
                        CardRowDivider()
                    }
                    ExploreRow(route: .departments, id: "explore.departments") {
                        Text("Tous les départements")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("explore.page")
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title)
            content()
        }
        .padding(.horizontal, Spacing.m)
    }
}

/// The four ways in: Votes, Députés, Textes and Agenda.
struct ExploreTiles: View {
    let hub: ExploreHub
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let columns = typeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]
        LazyVGrid(columns: columns, spacing: 10) {
            tile("Votes", "Tous les scrutins", "doc.text", .votes, id: "explore.votes")
            tile(
                "Députés",
                hub.deputiesInMandate.map { "\(MonEluFormat.count($0)) en mandat" } ?? "Toute la législature",
                "person", .deputies, id: "explore.deputies"
            )
            tile(
                "Textes",
                hub.loiCount.map { "\(MonEluFormat.count($0)) texte\($0 > 1 ? "s" : "") voté\($0 > 1 ? "s" : "")" }
                    ?? "Les textes votés",
                "tag", .lois, id: "explore.lois"
            )
            tile("Agenda", "Cette semaine", "calendar", .agenda(), id: "explore.agenda")
        }
        .padding(.horizontal, Spacing.m)
    }

    private func tile(_ title: String, _ detail: String, _ icon: String, _ route: AppRoute, id: String) -> some View {
        NavigationLink(value: route) {
            VStack(alignment: .leading, spacing: Spacing.s) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundStyle(Palette.accent)
                    .accessibilityHidden(true)
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(Palette.textPrimary)
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(Spacing.m)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .surface()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id)
    }
}

/// The groups by seats, the five largest until the user asks for all.
struct ExploreGroupsSection: View {
    static let collapsedCount = 5

    let groups: [GroupSeats]
    @State private var showsAll = false
    /// One width for every chip, sized to the widest code (LIOT) and scaled
    /// with the text, so the group names line up (#521).
    @ScaledMetric(relativeTo: .caption) private var chipWidth: CGFloat = 52

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader("Groupes") {
                if groups.count > Self.collapsedCount {
                    Button(showsAll ? "Moins" : "Les \(groups.count)") { showsAll.toggle() }
                        .font(.subheadline.weight(.semibold))
                        .tint(Palette.accent)
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("explore.groups-all")
                }
            }
            ExploreRows {
                let shown = showsAll ? groups : Array(groups.prefix(Self.collapsedCount))
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, group in
                    if index > 0 { CardRowDivider() }
                    ExploreRow(route: .group(slug: group.slug), id: "explore.group") {
                        HStack(spacing: Spacing.s) {
                            PartyChip(group.short ?? group.name, short: group.short)
                                .frame(width: chipWidth, alignment: .leading)
                            Text(group.name)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Text(MonEluFormat.count(group.seats))
                                .font(.subheadline.monospacedDigit())
                                .foregroundStyle(Palette.textSecondary)
                                .accessibilityLabel("\(group.seats) sièges")
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Spacing.m)
    }
}

/// Rows in one card.
struct ExploreRows<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .surface()
    }
}

/// One row of a card, opening `route`.
struct ExploreRow<Label: View>: View {
    let route: AppRoute
    let id: String
    @ViewBuilder let label: Label

    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: Spacing.s) {
                label
                    .font(.body)
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, Spacing.m)
            .padding(.vertical, Spacing.s)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id)
    }
}
