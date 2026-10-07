import MonEluCore
import MonEluUI
import SwiftUI

/// The bills with a page (#488, Explorer's "Textes"), most recently voted
/// first: those with at least one scrutin linked to them (ADR-035).
public struct LoisListScreen: View {
    @State private var loader: Loader<LoiList>

    public init(service: any LoisService) {
        _loader = State(initialValue: Loader(isEmpty: { $0.items.isEmpty }) { try await service.lois() })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Aucun texte", message: "Aucun texte n'a encore de scrutin enregistré.")
        ) { list in
            ScrollView {
                LoisList(list: list).padding(16)
            }
        }
        .background(Palette.pageBackground)
        .navigationTitle("Textes")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("screen.lois")
    }
}

/// The list, separate from loading so it can be snapshot-tested.
struct LoisList: View {
    let list: LoiList
    @Environment(\.appConfiguration) private var configuration

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(MonEluFormat.count(list.total)) texte\(list.total > 1 ? "s" : "") avec au moins un scrutin")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
            CaveatNote(id: "bill_coverage", in: configuration)
            VStack(spacing: 0) {
                ForEach(Array(list.items.enumerated()), id: \.element.id) { index, loi in
                    if index > 0 { Divider().overlay(Palette.border) }
                    NavigationLink(value: AppRoute.loi(id: loi.id)) {
                        LoiListRow(loi: loi)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("loi.row")
                }
            }
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A bill: its status, title, theme and last scrutin.
struct LoiListRow: View {
    let loi: LoiListItem

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                if let status = loi.status { LoiStatusBadge(status: status) }
                Text(loi.title ?? "Texte sans titre")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Palette.textPrimary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                if let detail {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textMuted)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    /// "Santé · dernier scrutin le 15 juillet 2026".
    private var detail: String? {
        let parts = [loi.theme, loi.lastVote.map { "dernier scrutin le \(MonEluFormat.day($0))" }].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
