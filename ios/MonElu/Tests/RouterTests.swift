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

    @Test func openingTheTopRouteAgainDoesNotStackIt() {
        let router = Router()
        router.open(.deputy(id: "PA1"))
        router.open(.deputy(id: "PA1"))
        #expect(router.paths[.deputies] == [.deputy(id: "PA1")])
    }

    @Test func linkOpensTheRoute() throws {
        let router = Router()
        #expect(router.open(url: try #require(URL(string: "monelu://deputes/PA1008"))))
        #expect(router.selection == .deputies)
        #expect(router.paths[.deputies] == [.deputy(id: "PA1008")])
    }

    @Test func launchLinkIsReadFromTheArguments() {
        #expect(Router.launchLink(arguments: ["MonElu", "-MonEluOpenURL", "monelu://votes/V1"])?.absoluteString == "monelu://votes/V1")
        #expect(Router.launchLink(arguments: ["MonElu", "MonEluOpenURL", "monelu://deputes/PA1"])?.absoluteString == "monelu://deputes/PA1")
        #expect(Router.launchLink(arguments: ["MonElu"]) == nil)
        #expect(Router.launchLink(arguments: ["MonElu", "-MonEluOpenURL"]) == nil)
    }

    @Test func unknownLinkChangesNothing() throws {
        let router = Router()
        #expect(router.open(url: try #require(URL(string: "monelu://quiz/abc"))) == false)
        #expect(router.selection == .myDeputy)
        #expect(router.paths.isEmpty)
    }
}
