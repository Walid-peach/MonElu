@testable import MonEluUI
import MonEluCore
import Testing

struct StateViewTests {
    @Test func offlineAndServerFailuresReadDifferently() {
        let offline = FailureStateView.copy(for: .offline)
        let server = FailureStateView.copy(for: .server)
        #expect(offline != server)
        #expect(offline.title == "Pas de connexion")
        #expect(server.title == "Chargement impossible")
    }
}

@MainActor
struct HemicycleChartTests {
    @Test func accessibilitySummaryCountsEachPosition() {
        let chart = HemicycleChart(deputies: [
            .init(id: "1", name: "A", group: "LFI", position: "contre"),
            .init(id: "2", name: "B", group: "EPR", position: "pour"),
            .init(id: "3", name: "C", group: "EPR", position: "pour"),
            .init(id: "4", name: "D", group: "RN", position: "nonVotant"),
        ])
        #expect(chart.summary == "2 pour, 1 contre, 1 non votant")
    }
}
