import MonEluCore
import MonEluUI
import SwiftUI

/// The Explorer tab (#477): the vote and deputy lists in one place, behind a
/// segmented control, so browsing the records has one predictable home.
public struct ExploreScreen: View {
    public enum Segment: String, CaseIterable, Identifiable, Sendable {
        case votes, deputies

        public var id: String { rawValue }

        public var title: String {
            switch self {
            case .votes: "Votes"
            case .deputies: "Députés"
            }
        }
    }

    @State private var segment: Segment = .votes
    // Both models live here, so each list keeps its search, filter and
    // loaded pages while the other one shows.
    @State private var votes: VotesListModel
    @State private var deputies: DeputiesListModel

    public init(votes: any VotesService, deputies: any DeputiesService) {
        self.init(votes: VotesListModel(service: votes), deputies: DeputiesListModel(service: deputies))
    }

    /// Over models already loaded, for snapshot tests.
    init(votes: VotesListModel, deputies: DeputiesListModel, segment: Segment = .votes) {
        _votes = State(initialValue: votes)
        _deputies = State(initialValue: deputies)
        _segment = State(initialValue: segment)
    }

    public var body: some View {
        Group {
            switch segment {
            case .votes: VotesListScreen(model: votes)
            case .deputies: DeputiesListScreen(model: deputies)
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            Picker("Explorer", selection: $segment) {
                ForEach(Segment.allCases) { Text($0.title).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .background(Palette.pageBackground)
            .accessibilityIdentifier("explore.section")
        }
        .background(Palette.pageBackground)
        .navigationTitle("Explorer")
    }
}
