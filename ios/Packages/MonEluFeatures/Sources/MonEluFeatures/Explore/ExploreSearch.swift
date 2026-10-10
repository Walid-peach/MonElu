import Foundation
import MonEluCore
import MonEluUI
import SwiftUI

/// What Explorer's search found (#521, design A: "Vote, député, texte,
/// commune"): a few of each kind, each opening its own screen.
struct ExploreSearchResults: Hashable, Sendable {
    static let limit = 5

    var deputies: [DeputyItem] = []
    var votes: [VoteItem] = []
    var lois: [LoiListItem] = []
    var departments: [ReferenceData.Department] = []
    /// True when the deputies and votes searches both failed: the empty
    /// result would otherwise read as "nothing matches".
    var failed = false

    var isEmpty: Bool { deputies.isEmpty && votes.isEmpty && lois.isEmpty && departments.isEmpty }
}

/// Runs one search across the existing list endpoints. Nothing is ranked or
/// counted here: deputies and votes come in the order the API returns them,
/// and bills and départements are matched by name on lists the app already
/// holds.
struct ExploreSearch: Sendable {
    let deputies: any DeputiesService
    let votes: any VotesService
    let postalCodes: any PostalCodeService
    var departments: [ReferenceData.Department] = (try? ReferenceData.departments()) ?? []

    /// The shortest query worth sending.
    static let minimumLength = 2

    func callAsFunction(_ raw: String, lois: [LoiListItem]) async -> ExploreSearchResults {
        let query = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= Self.minimumLength else { return ExploreSearchResults() }
        async let deputyPage = try? deputies.deputies(DeputyQuery(search: query, active: true))
        async let votePage = try? votes.votes(VoteQuery(search: query))
        async let places = departments(matching: query)
        let (foundDeputies, foundVotes) = await (deputyPage, votePage)
        return ExploreSearchResults(
            deputies: Array((foundDeputies?.items ?? []).prefix(ExploreSearchResults.limit)),
            votes: Array((foundVotes?.items ?? []).prefix(ExploreSearchResults.limit)),
            lois: Array(lois.filter { Self.matches($0.title, query) }.prefix(ExploreSearchResults.limit)),
            departments: await places,
            failed: foundDeputies == nil && foundVotes == nil
        )
    }

    /// A postal code ("33000") goes to the service Accueil already uses, and
    /// only to it; anything else matches a département's name or code.
    func departments(matching query: String) async -> [ReferenceData.Department] {
        if query.wholeMatch(of: /\d{5}/) != nil {
            let found = (try? await postalCodes.departments(forPostalCode: query)) ?? []
            let codes = Set(found.map(\.code))
            return departments.filter { codes.contains($0.code) }
        }
        let code = query.uppercased()
        return Array(
            departments.filter { $0.code == code || Self.matches($0.name, query) }.prefix(ExploreSearchResults.limit)
        )
    }

    /// Case- and accent-insensitive containment: "seine" finds
    /// "Seine-Saint-Denis", "energie" finds "Énergie".
    static func matches(_ text: String?, _ query: String) -> Bool {
        guard let text else { return false }
        return text.range(of: query, options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }
}

/// The search's state on Explorer.
@MainActor @Observable
final class ExploreSearchModel {
    var query = ""
    /// Nil until the current query has answered; the view shows a spinner.
    private(set) var results: ExploreSearchResults?

    private let search: ExploreSearch
    private let lois: any LoisService
    private var loiList: [LoiListItem]?

    init(search: ExploreSearch, lois: any LoisService) {
        self.search = search
        self.lois = lois
    }

    /// True while the query is long enough to replace the contents page.
    var isActive: Bool {
        query.trimmingCharacters(in: .whitespacesAndNewlines).count >= ExploreSearch.minimumLength
    }

    /// Searches for the current query after a short pause, so typing a name
    /// does not send a request per letter; a newer query cancels this one.
    func run() async {
        guard isActive else {
            results = nil
            return
        }
        do { try await Task.sleep(for: .milliseconds(300)) } catch { return }
        if loiList == nil { loiList = try? await lois.lois().items }
        let found = await search(query, lois: loiList ?? [])
        guard !Task.isCancelled else { return }
        results = found
    }
}

/// The results, grouped by kind, separate from the model so they can be
/// snapshot-tested.
struct ExploreSearchResultsView: View {
    let results: ExploreSearchResults?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            if let results, !results.isEmpty {
                if !results.deputies.isEmpty {
                    section("Députés") {
                        ForEach(Array(results.deputies.enumerated()), id: \.element.id) { index, deputy in
                            if index > 0 { Divider().overlay(Palette.border) }
                            link(.deputy(id: deputy.id), id: "explore.result.deputy") {
                                ExplorerDeputyRow(deputy: deputy)
                            }
                        }
                    }
                }
                if !results.votes.isEmpty {
                    section("Votes") {
                        ForEach(Array(results.votes.enumerated()), id: \.element.id) { index, vote in
                            if index > 0 { Divider().overlay(Palette.border) }
                            link(.vote(id: vote.id), id: "explore.result.vote") {
                                ExplorerVoteRow(vote: vote)
                            }
                        }
                    }
                }
                if !results.lois.isEmpty {
                    section("Textes") {
                        ForEach(Array(results.lois.enumerated()), id: \.element.id) { index, loi in
                            if index > 0 { Divider().overlay(Palette.border) }
                            link(.loi(id: loi.id), id: "explore.result.loi") {
                                Text(loi.title ?? loi.id)
                                    .font(.subheadline)
                                    .foregroundStyle(Palette.textPrimary)
                                    .multilineTextAlignment(.leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
                if !results.departments.isEmpty {
                    section("Départements") {
                        ForEach(Array(results.departments.enumerated()), id: \.element.id) { index, department in
                            if index > 0 { Divider().overlay(Palette.border) }
                            link(.department(code: department.code), id: "explore.result.department") {
                                Text("\(department.name) (\(department.code))")
                                    .font(.body)
                                    .foregroundStyle(Palette.textPrimary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            } else if let results {
                note(
                    results.failed
                        ? "La recherche n'a pas abouti. Vérifiez votre connexion et réessayez."
                        : "Aucun résultat. Essayez un nom de député, un mot du titre d'un vote ou un code postal."
                )
            } else {
                ProgressView()
                    .tint(Palette.accent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 32)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("explore.results")
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title)
            ExploreRows { content() }
        }
        .padding(.horizontal, 16)
    }

    private func link<Label: View>(_ route: AppRoute, id: String, @ViewBuilder label: () -> Label) -> some View {
        NavigationLink(value: route) {
            HStack(spacing: 12) {
                label().frame(maxWidth: .infinity, alignment: .leading)
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
        .accessibilityIdentifier(id)
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Palette.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 16)
            .padding(.top, 8)
    }
}
