import MonEluCore
import MonEluUI
import SwiftUI

/// The Explorer tab (#488, design A, Explorer): a contents page leading to
/// every way of browsing the record. The vote and deputy lists, the bills
/// and the agenda first, then the themes, the groups with their seats and
/// the départements, the user's own first.
public struct ExploreScreen: View {
    @State private var loader: Loader<ExploreHub>

    public init(
        deputies: any DeputiesService, lois: any LoisService, groups: any GroupsService, followedDeputyID: String?
    ) {
        _loader = State(initialValue: Loader {
            await ExploreHub.load(deputies: deputies, lois: lois, groups: groups, followedDeputyID: followedDeputyID)
        })
    }

    public var body: some View {
        // Every part of the hub degrades on its own, so it is never empty and
        // never fails: the fixed tables (themes, départements) always show.
        LoadStateView(loader, empty: EmptyStateView(title: "Explorer", message: "")) { hub in
            ScrollView {
                ExploreContent(hub: hub).padding(.vertical, 12)
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Explorer")
        .accessibilityIdentifier("screen.explore")
    }
}

/// The contents, separate from loading so it can be snapshot-tested.
struct ExploreContent: View {
    let hub: ExploreHub
    var themes: [ReferenceData.Theme] = (try? ReferenceData.themes()) ?? []

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ExploreTiles(hub: hub)
            if !themes.isEmpty {
                section("Thèmes") {
                    FlowLayout(spacing: 8) {
                        ForEach(themes) { theme in
                            NavigationLink(value: AppRoute.theme(slug: theme.slug)) {
                                Text(theme.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(Palette.textPrimary)
                                    .padding(.horizontal, 12)
                                    .frame(minHeight: 36)
                                    .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                                            .strokeBorder(Palette.border, lineWidth: 1)
                                    )
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
                        Divider().overlay(Palette.border)
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
        .padding(.horizontal, 16)
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
            tile("Agenda", "Cette semaine", "calendar", .agenda, id: "explore.agenda")
        }
        .padding(.horizontal, 16)
    }

    private func tile(_ title: String, _ detail: String, _ icon: String, _ route: AppRoute, id: String) -> some View {
        NavigationLink(value: route) {
            VStack(alignment: .leading, spacing: 12) {
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
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
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
                    if index > 0 { Divider().overlay(Palette.border) }
                    ExploreRow(route: .group(slug: group.slug), id: "explore.group") {
                        HStack(spacing: 12) {
                            PartyChip(group.short ?? group.name, short: group.short)
                                .frame(minWidth: 52, alignment: .leading)
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
        .padding(.horizontal, 16)
    }
}

/// Rows in one card.
struct ExploreRows<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
    }
}

/// One row of a card, opening `route`.
struct ExploreRow<Label: View>: View {
    let route: AppRoute
    let id: String
    @ViewBuilder let label: Label

    var body: some View {
        NavigationLink(value: route) {
            HStack(spacing: 12) {
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
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(id)
    }
}
