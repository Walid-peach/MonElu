import MonEluCore
import MonEluUI
import SwiftUI

/// Two deputies side by side (web: `/deputes/comparer`; design A, Comparer):
/// their scorecards as mirrored bars and the scrutins where they voted
/// differently. Opened from a profile; the second deputy is picked here.
public struct CompareScreen: View {
    let deputyID: String
    let deputies: any DeputiesService
    let compare: any CompareService
    @State private var otherID: String?
    @State private var isPicking = false

    public init(deputyID: String, deputies: any DeputiesService, compare: any CompareService) {
        self.deputyID = deputyID
        self.deputies = deputies
        self.compare = compare
    }

    public var body: some View {
        CompareLoadedView(deputyID: deputyID, otherID: otherID, deputies: deputies, compare: compare) {
            isPicking = true
        }
        // A new second deputy is a new loader; its identity starts the load.
        .id(otherID)
        .navigationTitle("Comparer")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isPicking) {
            DeputyPickerSheet(service: deputies, excluding: deputyID) { picked in
                otherID = picked
                isPicking = false
            }
        }
    }
}

/// Loads one pair and renders it.
private struct CompareLoadedView: View {
    @State private var loader: Loader<ComparePage>
    let choose: () -> Void

    init(
        deputyID: String, otherID: String?, deputies: any DeputiesService, compare: any CompareService,
        choose: @escaping () -> Void
    ) {
        _loader = State(initialValue: Loader {
            try await compare.page(first: deputyID, other: otherID, deputies: deputies)
        })
        self.choose = choose
    }

    var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Député introuvable", message: "Ce député n'existe pas ou plus.")
        ) { page in
            ScrollView {
                CompareContent(page: page, choose: choose)
                    .padding(.vertical, 16)
            }
        }
    }
}

/// The comparison's content, separate from loading so it can be snapshot-tested.
struct CompareContent: View {
    let page: ComparePage
    let choose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .top, spacing: 8) {
                CompareIdentity(side: page.first)
                Text("et")
                    .font(Typography.heading(.title3).italic())
                    .foregroundStyle(Palette.textSecondary)
                    .padding(.top, 28)
                if let other = page.other {
                    CompareIdentity(side: other)
                } else {
                    ChooseDeputyButton(action: choose)
                }
            }
            .padding(.horizontal, 16)
            if let other = page.other {
                Button("Changer de député", action: choose)
                    .font(.subheadline.weight(.semibold))
                    .tint(Palette.accent)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("compare.change")
                if let a = page.first.scorecard, let b = other.scorecard {
                    Card { MirroredScorecards(a: a, b: b) }
                        .padding(.horizontal, 16)
                }
                if let diverging = page.diverging {
                    DivergingSection(diverging: diverging, a: page.first.profile.deputy, b: other.profile.deputy)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("compare.page")
    }
}

/// Portrait, name, group and département of one side.
struct CompareIdentity: View {
    let side: CompareSide

    var body: some View {
        let deputy = side.profile.deputy
        VStack(spacing: 6) {
            DeputyPortrait(name: deputy.name, url: deputy.photoURL, size: 64)
            Text(deputy.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let short = deputy.groupShort {
                PartyChip(short: short)
            }
            if let department = deputy.department {
                Text(department)
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

/// The empty second side: opens the picker.
struct ChooseDeputyButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: "person.crop.circle.badge.plus")
                    .font(.system(.largeTitle))
                    .foregroundStyle(Palette.accent)
                    .accessibilityHidden(true)
                Text("Choisir un député")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.accent)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: 120)
            .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("compare.choose")
    }
}

/// The three rates of the two scorecards, each as two bars growing from
/// the middle: the first deputy's to the left, the other's to the right.
struct MirroredScorecards: View {
    let a: DeputyScorecard
    let b: DeputyScorecard

    var body: some View {
        VStack(spacing: 0) {
            row("Scrutins solennels", a.solennelParticipationRate, b.solennelParticipationRate)
            Divider().overlay(Palette.border)
            row("Jours de vote", a.votingDaysRate, b.votingDaysRate)
            if let forA = a.votesForRate, let forB = b.votesForRate {
                Divider().overlay(Palette.border)
                row("Votes « pour » parmi ses positions", forA, forB)
            }
        }
    }

    private func row(_ label: String, _ left: Double, _ right: Double) -> some View {
        VStack(spacing: 8) {
            Text(label)
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            HStack(alignment: .top, spacing: 12) {
                RateBar(rate: left, color: Palette.textPrimary, leading: false)
                RateBar(rate: right, color: Palette.accent, leading: true)
            }
        }
        .padding(.vertical, 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label) : \(MonEluFormat.percent(left, decimals: 1)) et \(MonEluFormat.percent(right, decimals: 1))")
    }
}

/// One rate and its bar, aligned towards the middle of the row.
struct RateBar: View {
    let rate: Double
    let color: Color
    /// True when the bar starts at the leading edge (the right-hand side).
    let leading: Bool

    var body: some View {
        VStack(alignment: leading ? .leading : .trailing, spacing: 4) {
            Text(MonEluFormat.percent(rate, decimals: 1))
                .font(Typography.heading(.title3))
                .monospacedDigit()
                .foregroundStyle(Palette.textPrimary)
            GeometryReader { proxy in
                Capsule(style: .circular)
                    .fill(color)
                    .frame(width: proxy.size.width * min(max(rate, 0), 1), height: 8)
                    .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
            }
            .frame(height: 8)
        }
        .frame(maxWidth: .infinity, alignment: leading ? .leading : .trailing)
    }
}

/// The scrutins where they voted differently, each with both positions.
struct DivergingSection: View {
    let diverging: DivergingVotes
    let a: DeputyItem
    let b: DeputyItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                "Où ils ont voté différemment",
                subtitle: "\(MonEluFormat.count(diverging.total)) scrutin\(diverging.total > 1 ? "s" : "") au total"
            )
            .padding(.horizontal, 16)
            if diverging.items.isEmpty {
                Text("Ils ont toujours pris la même position.")
                    .font(.subheadline)
                    .foregroundStyle(Palette.textSecondary)
                    .padding(.horizontal, 16)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(diverging.items.enumerated()), id: \.element.id) { index, vote in
                        if index > 0 { Divider().overlay(Palette.border) }
                        NavigationLink(value: AppRoute.vote(id: vote.id)) {
                            DivergingVoteRow(vote: vote, a: a, b: b)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
                .padding(.horizontal, 16)
            }
        }
    }
}

struct DivergingVoteRow: View {
    let vote: DivergingVote
    let a: DeputyItem
    let b: DeputyItem

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
                position(a.shortName, vote.positionA)
                position(b.shortName, vote.positionB)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func position(_ name: String, _ position: String) -> some View {
        HStack(spacing: 6) {
            Text(name)
                .font(.caption)
                .foregroundStyle(Palette.textSecondary)
            VotePositionBadge(position: position)
        }
    }
}

/// Finds the second deputy by name.
struct DeputyPickerSheet: View {
    let service: any DeputiesService
    let excluding: String
    let pick: (String) -> Void
    @State private var search = ""
    @State private var results: [DeputyItem] = []
    @State private var failed = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(results.filter { $0.id != excluding }) { deputy in
                Button { pick(deputy.id) } label: { DeputyRowView(deputy: deputy) }
                    .buttonStyle(.plain)
                    .listRowBackground(Palette.cardBackground)
                    .accessibilityIdentifier("compare.candidate")
            }
            .overlay {
                if failed {
                    Text("La recherche n'a pas pu aboutir.")
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Palette.pageBackground)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Rechercher un député")
            .autocorrectionDisabled()
            .navigationTitle("Comparer avec")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
            }
            // After a pause, so typing does not send one request per letter.
            .task(id: search) {
                try? await Task.sleep(for: .milliseconds(300))
                guard !Task.isCancelled else { return }
                do {
                    results = try await service.deputies(DeputyQuery(search: search)).items
                    failed = false
                } catch {
                    failed = !(error is CancellationError)
                }
            }
        }
    }
}
