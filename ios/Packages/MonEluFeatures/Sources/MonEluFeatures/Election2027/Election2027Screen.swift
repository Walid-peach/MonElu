import MonEluCore
import MonEluUI
import SwiftUI

/// The 2027 tab (#718, ADR-049): the record before the presidential election.
///
/// It shows what the Assemblée voted and nothing about any candidate or
/// programme (VISION.md). Every figure and every grid cell is computed by
/// `GET /election/2027`; the calendar's dates come from `GET /app/config`.
public struct Election2027Screen: View {
    @State private var loader: Loader<ElectionPage>
    @State private var claim = ""
    @State private var pickerModel: MonDeputeModel
    @State private var showsPicker = false
    @Environment(\.appConfiguration) private var configuration
    @Environment(\.openTab) private var openTab
    private let deputies: any DeputiesService
    private let store: any FollowedDeputyStore
    private let pendingClaim: PendingClaim

    public init(
        service: any ElectionService, deputies: any DeputiesService, store: any FollowedDeputyStore,
        postalCodes: any PostalCodeService, addresses: any AddressService,
        circonscriptions: any CirconscriptionService, pendingClaim: PendingClaim
    ) {
        _loader = State(initialValue: Loader(cacheKey: "election2027", cache: .shared) { try await service.page() })
        _pickerModel = State(initialValue: MonDeputeModel(
            deputies: deputies, postalCodes: postalCodes,
            addresses: addresses, circonscriptions: circonscriptions, store: store
        ))
        self.deputies = deputies
        self.store = store
        self.pendingClaim = pendingClaim
    }

    public var body: some View {
        LoadStateView(
            loader,
            empty: EmptyStateView(title: "Rien à montrer", message: "Les chiffres ne sont pas disponibles pour le moment."),
            placeholder: {
                ScrollView { content(.placeholder, isPlaceholder: true).skeleton().disabled(true) }
            },
            content: { page in
                ScrollView { content(page) }
                    .scrollDismissesKeyboard(.interactively)
            }
        )
        .tabRootTitle("2027")
        .accessibilityIdentifier("screen.election2027")
        .sheet(isPresented: $showsPicker) {
            NavigationStack {
                DeputyPickerView(model: pickerModel)
                    .navigationTitle("Trouver mon député")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) { Button("Fermer") { showsPicker = false } }
                    }
            }
        }
        // Following from the picker closes it: the card now has a deputy.
        .onChange(of: store.deputyIDs) { _, ids in
            if !ids.isEmpty { showsPicker = false }
        }
    }

    private func content(_ page: ElectionPage, isPlaceholder: Bool = false) -> some View {
        Election2027Content(
            page: page, election: configuration.election ?? .undecided,
            verifyEnabled: configuration.features.verify, claim: $claim,
            onVerify: { handOffClaim() }, onOpenQuiz: { openTab(.quiz) }
        ) {
            deputySection(isPlaceholder: isPlaceholder)
        }
    }

    @ViewBuilder private func deputySection(isPlaceholder: Bool) -> some View {
        if !isPlaceholder, let id = store.deputyIDs.first {
            ElectionDeputyReviewLoader(deputyID: id, service: deputies).id(id)
        } else {
            ElectionFindDeputyCard { showsPicker = true }
        }
    }

    /// Hands the claim to Demander's verify mode and opens that tab: the
    /// verdict, its states and its retry live in one place.
    private func handOffClaim() {
        let text = claim.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        pendingClaim.text = text
        claim = ""
        openTab(.ask)
    }

    /// "1 juillet 2025" for a `YYYY-MM-DD` the API sent; the string itself if
    /// it does not parse, never a guessed date.
    static func coverage(_ string: String) -> String {
        MonEluFormat.calendarDate(string).map(MonEluFormat.day) ?? string
    }
}

/// The followed deputy's review, loaded on its own so the rest of the tab
/// never waits for three more requests.
private struct ElectionDeputyReviewLoader: View {
    @State private var loader: Loader<DeputyReview>

    init(deputyID: String, service: any DeputiesService) {
        _loader = State(initialValue: Loader(cacheKey: "election2027.deputy:\(deputyID)") {
            async let profile = service.profile(id: deputyID)
            async let scorecard = service.scorecard(id: deputyID)
            async let alignment = try? service.alignment(id: deputyID)
            let card = try await scorecard
            return DeputyReview(
                deputy: try await profile.deputy, presenceRate: card.presenceRate,
                votesCast: card.votesFor + card.votesAgainst + card.abstentions,
                alignmentRate: await alignment?.alignmentRate
            )
        })
    }

    var body: some View {
        Group {
            switch loader.state {
            case .loaded(let review):
                ElectionDeputyCard(review: review)
            case .failed:
                Card {
                    VStack(alignment: .leading, spacing: Spacing.xs) {
                        Text("Le bilan de votre député n'a pas pu être chargé.")
                            .font(.subheadline)
                            .foregroundStyle(Palette.textSecondary)
                        Button("Réessayer") { Task { await loader.load() } }
                    }
                }
            default:
                Card { ProgressView().frame(maxWidth: .infinity) }
            }
        }
        .task { await loader.loadIfNeeded() }
    }
}

/// The tab's content, built from plain models so it is snapshot-tested without
/// a network. The deputy section is handed in: it loads on its own.
struct Election2027Content<DeputySection: View>: View {
    let page: ElectionPage
    let election: AppConfiguration.Election
    let verifyEnabled: Bool
    @Binding var claim: String
    let onVerify: () -> Void
    let onOpenQuiz: () -> Void
    @ViewBuilder let deputy: DeputySection

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.l) {
            header
            ElectionHero(election: election, coverageStart: Election2027Screen.coverage(page.figures.coverageStart))
            ElectionFiguresSection(
                figures: page.figures, coverage: Election2027Screen.coverage(page.figures.coverageStart)
            )
            if !page.keyVotes.isEmpty {
                ElectionKeyVotesSection(votes: page.keyVotes)
                if !page.grid.isEmpty {
                    ElectionGridSection(rows: page.grid, voteCount: page.keyVotes.count)
                }
            }
            if verifyEnabled {
                ElectionVerifyCard(claim: $claim, onVerify: onVerify)
            }
            ElectionQuizCard(onOpen: onOpenQuiz)
            VStack(alignment: .leading, spacing: Spacing.s) {
                SectionHeader("Votre député, bilan de mandat")
                deputy
            }
            ElectionCalendarSection(election: election)
            ElectionFooter()
        }
        .padding(.horizontal, Spacing.gutter)
        .padding(.top, Spacing.xs)
        .padding(.bottom, Spacing.l)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("PRÉSIDENTIELLE")
                .font(.footnote.weight(.semibold))
                .tracking(1)
                .foregroundStyle(Palette.accent)
            Text("2027")
                .font(Typography.heading(.largeTitle))
                .foregroundStyle(Palette.textPrimary)
                .accessibilityAddTraits(.isHeader)
        }
        .accessibilityElement(children: .combine)
    }
}
