import Foundation
import MonEluAPI
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The 2027 tab's data and wording (#718): the service maps the API's page,
/// and the calendar never invents a date the API did not send.
@MainActor
struct ElectionTests {
    @Test func serviceMapsTheAPIPage() async throws {
        let service = LiveElectionService(client: stubClient(try fixture("election_2027")))
        let page = try await service.page()
        #expect(page.figures.scrutins == 2314)
        #expect(page.figures.adoptedTexts == 118)
        #expect(page.figures.medianPresenceRate == 0.6234)
        #expect(page.keyVotes.first?.margin == 2, "closest first, as the API ordered them")
        #expect(page.keyVotes.map(\.kind).contains("Motion de censure"))
        #expect(page.grid.count == 4)
        #expect(page.grid.allSatisfy { $0.cells.count == page.keyVotes.count })
        // A group with no majority keeps a nil position, never an invented one.
        #expect(page.grid[0].cells.contains { $0.position == nil })
    }

    @Test func pendingClaimIsTakenOnce() {
        let pending = PendingClaim(text: "Le RN a voté contre la loi de finances")
        #expect(pending.take() == "Le RN a voté contre la loi de finances")
        #expect(pending.take() == nil)
    }

    private var today: Date { snapshotToday }  // 2026-10-10

    @Test func noDateMeansNoCountdown() {
        let election = AppConfiguration.Election.undecided
        #expect(ElectionCalendar.daysUntilFirstRound(election, today: today) == nil)
        #expect(ElectionCalendar.headline(election, today: today) == "avril 2027")
        #expect(ElectionCalendar.caption(election, today: today) == "Premier tour. Date exacte fixée par décret.")
        let steps = ElectionCalendar.steps(election)
        #expect(steps.map(\.title) == ["Inscription sur les listes", "Premier tour", "Second tour"])
        #expect(steps[0].when == "Jusqu'au 6e vendredi avant le 1er tour")
        #expect(steps[1].when == "Avril 2027")
        #expect(steps[2].when == "Deux semaines après")
    }

    @Test func aDateGivesACountdownAndRealDates() {
        let election = AppConfiguration.Election(
            firstRoundLabel: "avril 2027", firstRoundDate: "2027-04-11", secondRoundDate: "2027-04-25",
            registrationDeadline: "2027-03-05"
        )
        // 2026-10-10 to 2027-04-11 is 183 days.
        #expect(ElectionCalendar.daysUntilFirstRound(election, today: today) == 183)
        #expect(ElectionCalendar.headline(election, today: today) == "J-183")
        #expect(ElectionCalendar.caption(election, today: today).hasPrefix("jusqu'au 1er tour, le "))
        let steps = ElectionCalendar.steps(election)
        #expect(steps[0].when.hasPrefix("Jusqu'au "))
        #expect(!steps[1].when.contains("Avril 2027 "))
    }

    @Test func aPastOrMalformedDateHidesTheCountdown() {
        let past = AppConfiguration.Election(firstRoundLabel: "avril 2027", firstRoundDate: "2026-01-01")
        #expect(ElectionCalendar.daysUntilFirstRound(past, today: today) == nil)
        let broken = AppConfiguration.Election(firstRoundLabel: "avril 2027", firstRoundDate: "bientôt")
        #expect(ElectionCalendar.headline(broken, today: today) == "avril 2027")
    }

    @Test func theMarksSayWhatTheyAre() {
        #expect(PositionMark.spoken("pour") == "pour")
        #expect(PositionMark.spoken(nil) == "pas de majorité")
    }
}
