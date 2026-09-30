@testable import MonElu
import MonEluCore
import Foundation
import Testing

@MainActor
struct RouterTests {
    @Test func openingARouteSelectsItsTabAndPushesIt() {
        let router = Router()
        router.open(.vote(id: "VTANR5L17V8434"))
        #expect(router.selection == .votes)
        #expect(router.paths[.votes] == [.vote(id: "VTANR5L17V8434")])
    }

    @Test func routesStackWithinATab() {
        let router = Router()
        router.open(.deputy(id: "PA1"))
        router.open(.deputy(id: "PA2"))
        #expect(router.paths[.deputies] == [.deputy(id: "PA1"), .deputy(id: "PA2")])
    }

    @Test func linkOpensTheRoute() throws {
        let router = Router()
        #expect(router.open(url: try #require(URL(string: "monelu://deputes/PA1008"))))
        #expect(router.selection == .deputies)
        #expect(router.paths[.deputies] == [.deputy(id: "PA1008")])
    }

    @Test func unknownLinkChangesNothing() throws {
        let router = Router()
        #expect(router.open(url: try #require(URL(string: "monelu://quiz/abc"))) == false)
        #expect(router.selection == .myDeputy)
        #expect(router.paths.isEmpty)
    }
}
