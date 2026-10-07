import MonEluCore
import MonEluUI
import SwiftUI

/// A département's deputies (web: `/departements/[code]`; design A,
/// Département): the groups they sit in, each deputy by circonscription with
/// their solennel participation, and the votes where they split.
public struct DepartmentScreen: View {
    @State private var loader: Loader<DepartmentPage?>

    public init(code: String, service: any DepartmentsService) {
        _loader = State(initialValue: Loader(isEmpty: { $0 == nil }) { try await service.department(code: code) })
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(
                title: "Département introuvable",
                message: "Ce code ne correspond à aucun département.",
                systemImage: "map"
            )
        ) { department in
            if let department {
                ScrollView {
                    DepartmentContent(department: department)
                        .padding(.vertical, 16)
                }
            }
        }
        .navigationTitle("Département")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The page's content, separate from loading so it can be snapshot-tested.
struct DepartmentContent: View {
    let department: DepartmentPage

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(alignment: .leading, spacing: 10) {
                Text("DÉPARTEMENT \(department.code)")
                    .font(.caption.weight(.bold))
                    .tracking(0.6)
                    .foregroundStyle(Palette.textSecondary)
                Text(department.name)
                    .font(Typography.heading(.largeTitle))
                    .foregroundStyle(Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                Text("\(MonEluFormat.count(department.deputyCount)) député\(department.deputyCount > 1 ? "s" : "") en mandat")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                if !department.composition.isEmpty {
                    Card { CompositionView(composition: department.composition) }
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 16)
            if !department.deputies.isEmpty {
                section("Ses députés") {
                    ForEach(Array(department.deputies.enumerated()), id: \.element.id) { index, deputy in
                        if index > 0 { Divider().overlay(Palette.border) }
                        DepartmentDeputyRow(deputy: deputy)
                    }
                }
            }
            if !department.splitVotes.isEmpty {
                section("Quand ils ont voté différemment") {
                    ForEach(Array(department.splitVotes.enumerated()), id: \.element.id) { index, vote in
                        if index > 0 { Divider().overlay(Palette.border) }
                        NavigationLink(value: AppRoute.vote(id: vote.id)) {
                            DividedVoteRow(vote: vote, scope: "Dans le département")
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("department.page")
    }

    private func section<Content: View>(_ title: String, @ViewBuilder rows: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title)
            VStack(spacing: 0) { rows() }
                .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        }
        .padding(.horizontal, 16)
    }
}

/// The groups the département's deputies sit in: one bar segment per
/// group, as wide as its count, and the counts in words.
struct CompositionView: View {
    let composition: [DepartmentGroupCount]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("RÉPARTITION PAR GROUPE")
                .font(.caption.weight(.bold))
                .tracking(0.6)
                .foregroundStyle(Palette.textPrimary)
            GeometryReader { proxy in
                let total = composition.reduce(0) { $0 + $1.count }
                let spacing: CGFloat = 2
                let available = max(0, proxy.size.width - spacing * CGFloat(composition.count - 1))
                HStack(spacing: spacing) {
                    ForEach(composition) { entry in
                        // The chip's own colors, so each segment matches its chip below.
                        let colors = Palette.party(entry.short)
                        Rectangle()
                            .fill(colors.background)
                            .overlay(Rectangle().strokeBorder(colors.text, lineWidth: 1.5))
                            .frame(width: total > 0 ? available * CGFloat(entry.count) / CGFloat(total) : 0)
                    }
                }
            }
            .frame(height: 14)
            .clipShape(Capsule(style: .circular))
            .accessibilityHidden(true)
            FlowLayout(spacing: 12) {
                ForEach(composition) { entry in
                    HStack(spacing: 6) {
                        PartyChip(entry.short ?? "Non inscrit", short: entry.short)
                        Text(MonEluFormat.count(entry.count))
                            .font(.subheadline.weight(.semibold).monospacedDigit())
                            .foregroundStyle(Palette.textPrimary)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(entry.group ?? "Non inscrits") : \(entry.count)")
                }
            }
        }
    }
}

/// A deputy of the département: seat, portrait, name, group and solennel participation.
struct DepartmentDeputyRow: View {
    let deputy: DepartmentDeputy

    var body: some View {
        NavigationLink(value: AppRoute.deputy(id: deputy.deputy.id)) {
            HStack(spacing: 12) {
                if let seat = deputy.seatLabel {
                    Text(seat)
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(Palette.textSecondary)
                        .frame(minWidth: 28, alignment: .leading)
                }
                DeputyPortrait(name: deputy.deputy.name, url: deputy.deputy.photoURL, size: 40)
                VStack(alignment: .leading, spacing: 4) {
                    Text(deputy.deputy.name)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                    HStack(spacing: 8) {
                        if let short = deputy.deputy.groupShort {
                            PartyChip(short: short)
                        }
                        if let rate = deputy.solennelRate {
                            Text("\(MonEluFormat.percent(rate)) des solennels")
                                .font(.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textSecondary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("department.deputy")
    }
}

/// Lays its children left to right, wrapping when they no longer fit.
struct FlowLayout: Layout {
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
