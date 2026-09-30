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
