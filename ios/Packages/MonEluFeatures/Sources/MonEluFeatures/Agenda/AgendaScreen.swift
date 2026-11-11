import MonEluCore
import MonEluUI
import Observation
import SwiftUI

/// Which week the agenda shows and its theme filter.
@MainActor
@Observable
final class AgendaModel {
    private(set) var window: AgendaWindow
    private(set) var loader: Loader<AgendaWeek>
    /// A theme name from the loaded week; nil shows every point.
    var theme: String?

    private let service: any AgendaService
    private let now: @Sendable () -> Date

    /// Today in Paris, `YYYY-MM-DD`, the day a week holding it opens on (#679).
    var today: String { MonEluFormat.isoDay(now()) }

    /// Opens on the week holding `weekOf`, or the current week when nil.
    init(service: any AgendaService, weekOf: Date? = nil, now: @escaping @Sendable () -> Date = { .now }) {
        self.service = service
        self.now = now
        let today = now()
        let window = AgendaWindow(offset: weekOf.map { AgendaWindow.offset(toWeekOf: $0, now: today) } ?? 0, now: today)
        self.window = window
        loader = Self.loader(service, window)
    }

    /// Moves `weeks` weeks from the one shown and loads it. The theme filter
    /// stays only if the new week has that theme, decided once it loads.
    func move(by weeks: Int) {
        window = AgendaWindow(offset: window.offset + weeks, now: now())
        loader = Self.loader(service, window)
    }

    private static func loader(_ service: any AgendaService, _ window: AgendaWindow) -> Loader<AgendaWeek> {
        Loader(cacheKey: "agenda:\(window.from):\(window.to)", isEmpty: { $0.days.isEmpty }) {
            try await service.week(from: window.from, to: window.to)
        }
    }
}

/// The séance publique agenda (web: `/agenda`): one ISO week at a time,
/// grouped by sitting day, times in Paris (design A, Agenda).
public struct AgendaScreen: View {
    @State private var model: AgendaModel

    /// `weekOf` opens the week holding that date (#512); nil, this week.
    public init(service: any AgendaService, weekOf: Date? = nil) {
        _model = State(initialValue: AgendaModel(service: service, weekOf: weekOf))
    }

    public var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                Text("L'ordre du jour de la séance publique.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                AgendaWeekSwitcher(window: model.window) { model.move(by: $0) }
            }
            .padding(.horizontal, Spacing.m)
            .padding(.bottom, Spacing.xs)
            LoadStateView(
                model.loader,
                empty: EmptyStateView(
                    title: "Aucune séance",
                    message: "Aucune séance publique n'est inscrite à l'ordre du jour de cette semaine.",
                    systemImage: "calendar"
                )
            ) { week in
                ScrollViewReader { proxy in
                    ScrollView {
                        AgendaWeekContent(week: week, theme: $model.theme)
                            .padding(.vertical, Spacing.xs)
                    }
                    // Opens on today, the days before it one scroll up (#679).
                    .task {
                        guard let day = week.landingDay(today: model.today) else { return }
                        await Task.yield()
                        proxy.scrollTo(day, anchor: .top)
                    }
                }
            }
            // A new week is a new loader; its identity starts the load.
            .id(model.window)
        }
        .background(Palette.pageBackground)
        .navigationTitle("Agenda")
        .navigationBarTitleDisplayMode(.large)
        .accessibilityIdentifier("screen.agenda")
    }
}

/// The previous and next week buttons around the week shown.
struct AgendaWeekSwitcher: View {
    let window: AgendaWindow
    let move: (Int) -> Void

    var body: some View {
        HStack(spacing: Spacing.xxs) {
            button("chevron.left", label: "Semaine précédente", by: -1)
            VStack(spacing: 2) {
                Text(MonEluFormat.span(from: window.from, to: window.to))
                    .font(.headline)
                    .foregroundStyle(Palette.textPrimary)
                Text([window.relativeLabel, "heures de Paris"].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            button("chevron.right", label: "Semaine suivante", by: 1)
        }
        .padding(.horizontal, Spacing.xxs)
        .padding(.vertical, Spacing.xxs)
        .surface()
    }

    private func button(_ image: String, label: String, by weeks: Int) -> some View {
        Button { move(weeks) } label: {
            Image(systemName: image)
                .font(.body.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// A loaded week: the theme chips, then one card per sitting day.
struct AgendaWeekContent: View {
    let week: AgendaWeek
    @Binding var theme: String?

    private var activeTheme: String? {
        theme.flatMap { week.themes.contains($0) ? $0 : nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.m) {
            if week.themes.count > 1 {
                FilterChipRow(
                    [FilterChip(id: "", title: "Tout", isSelected: activeTheme == nil)]
                        + week.themes.map { FilterChip(id: $0, title: $0, isSelected: activeTheme == $0) }
                ) { id in
                    theme = id.isEmpty ? nil : id
                }
            }
            ForEach(week.filtered(theme: activeTheme)) { day in
                VStack(alignment: .leading, spacing: Spacing.xs) {
                    Text(MonEluFormat.weekday(day.date))
                        .font(Typography.heading(.title3))
                        .foregroundStyle(Palette.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    VStack(spacing: 0) {
                        ForEach(Array(day.items.enumerated()), id: \.element.id) { index, entry in
                            if index > 0 { CardRowDivider() }
                            AgendaEntryLink(entry: entry)
                        }
                    }
                    .surface()
                }
                .padding(.horizontal, Spacing.m)
                .id(day.id)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A point opens its own scrutin when one exists, else the bill's page in the
/// app when MonÉlu has one (#511), else the AN dossier.
struct AgendaEntryLink: View {
    let entry: AgendaEntry

    var body: some View {
        if let voteID = entry.voteID {
            NavigationLink(value: AppRoute.vote(id: voteID)) {
                AgendaEntryRow(entry: entry, trailing: "chevron.right")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("agenda.entry")
        } else if let loiID = entry.loiID {
            NavigationLink(value: AppRoute.loi(id: loiID)) {
                AgendaEntryRow(entry: entry, trailing: "chevron.right")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Ouvre la page du texte")
            .accessibilityIdentifier("agenda.entry.loi")
        } else if let url = entry.dossierURL {
            Link(destination: url) {
                AgendaEntryRow(entry: entry, trailing: "arrow.up.right")
            }
            .buttonStyle(.plain)
            .accessibilityHint("Ouvre le dossier sur le site de l'Assemblée nationale")
            .accessibilityIdentifier("agenda.entry")
        } else {
            AgendaEntryRow(entry: entry, trailing: nil)
                .accessibilityIdentifier("agenda.entry")
        }
    }
}

/// Time, point type, the bill's title, its one-liner, theme and result.
struct AgendaEntryRow: View {
    let entry: AgendaEntry
    let trailing: String?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let headline = entry.headline
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 10))
        HStack(alignment: .center, spacing: Spacing.xs) {
            layout {
                Text(MonEluFormat.time(entry.start))
                    .font(.subheadline.weight(.bold).monospacedDigit())
                    .foregroundStyle(Palette.textPrimary)
                    .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? nil : 52, alignment: .leading)
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    if let pointType = entry.pointTypeLabel {
                        Text(pointType)
                            .font(.caption)
                            .foregroundStyle(Palette.textSecondary)
                    }
                    Group {
                        if entry.leadIsSummary {
                            Text(SummaryLabel.tag(nil)).foregroundColor(Palette.textSecondary) + Text(" · ")
                                + Text(headline.lead)
                        } else {
                            Text(headline.lead)
                        }
                    }
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 3)
                    if let detail = headline.detail {
                        LabeledSummary(
                            summary: detail, basis: nil, font: .footnote,
                            lineLimit: dynamicTypeSize.isAccessibilitySize ? nil : 3
                        )
                    }
                    if entry.theme != nil || entry.result != nil {
                        HStack(spacing: Spacing.xs) {
                            if let theme = entry.theme {
                                Text(theme)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(Palette.textPrimary)
                                    .padding(.horizontal, Spacing.xs)
                                    .padding(.vertical, 3)
                                    .background(Palette.trackBackground, in: Radius.shape(Radius.small))
                            }
                            if let result = entry.result {
                                VoteResultBadge(result: result)
                            }
                        }
                        .padding(.top, 2)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let trailing {
                Image(systemName: trailing)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textSecondary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, Spacing.m)
        .padding(.vertical, Spacing.s)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Opens the agenda from Accueil and Explorer.
struct AgendaToolbarLink: View {
    var body: some View {
        NavigationLink(value: AppRoute.agenda()) {
            Label("Agenda", systemImage: "calendar")
        }
        .accessibilityIdentifier("open.agenda")
    }
}
