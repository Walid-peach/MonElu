import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// A postal-code lookup that records what it was asked and replays a result.
final class StubPostalCodes: PostalCodeService, @unchecked Sendable {
    private let lock = NSLock()
    private let result: Result<[PostalDepartment], any Error>
    private(set) var codes: [String] = []

    init(_ result: Result<[PostalDepartment], any Error>) { self.result = result }

    func departments(forPostalCode code: String) async throws -> [PostalDepartment] {
        try lock.withLock {
            codes.append(code)
            return try result.get()
        }
    }
}

/// A `DeputiesService` with a fixed profile, recent votes and rosters, that
/// records every `since` it is asked for.
final class MonDeputeDeputies: DeputiesService, @unchecked Sendable {
    private let lock = NSLock()
    var profileResult: Result<DeputyProfile, any Error>
    var recent: [DeputyVote]?
    var newVotes: [DeputyVote] = []
    var rosters: [String: [DeputyItem]] = [:]
    private(set) var sinceDates: [Date] = []

    init(profile: Result<DeputyProfile, any Error> = .success(testProfile), recent: [DeputyVote]? = []) {
        profileResult = profile
        self.recent = recent
    }

    func deputies(_ query: DeputyQuery) async throws -> DeputyPage { DeputyPage(items: [], total: 0, offset: 0) }
    func profile(id: String) async throws -> DeputyProfile { try profileResult.get() }
    func scorecard(id: String) async throws -> DeputyScorecard { throw URLError(.badServerResponse) }
    func recentVotes(id: String) async throws -> [DeputyVote] {
        guard let recent else { throw URLError(.badServerResponse) }
        return recent
    }
    func votes(id: String, since: Date) async throws -> [DeputyVote] {
        lock.withLock { sinceDates.append(since) }
        return newVotes
    }
    func departmentDeputies(code: String) async throws -> [DeputyItem] { rosters[code] ?? [] }
}

let testProfile = DeputyProfile(deputy: deputy("PA1008"), mandateStart: nil, mandateEnd: nil)

/// A scrutin held at midnight UTC on the given day, as the API dates them.
func vote(_ id: String, day: String, position: String = "pour") -> DeputyVote {
    DeputyVote(id: id, title: "le scrutin \(id)", date: try! APIDay.date(day), result: "adopté", position: position)
}

enum APIDay {
    static func date(_ day: String) throws -> Date {
        try #require(ISO8601DateFormatter().date(from: day + "T00:00:00Z"))
    }
}

/// A store on its own `UserDefaults` suite, which a test can open twice to
/// play a relaunch.
func freshDefaults() -> UserDefaults {
    let name = "MonDeputeTests.\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defaults.removePersistentDomain(forName: name)
    return defaults
}

struct PostalCodeTests {
    @Test(arguments: ["33000", " 75001 ", "20000", "97100"])
    func fiveDigitsAreAPostalCode(_ input: String) {
        #expect(PostalCode.normalized(input) == input.trimmingCharacters(in: .whitespaces))
    }

    @Test(arguments: ["", "3300", "330000", "33 000", "abcde", "3300a", "٣٣٠٠٠"])
    func anythingElseIsNot(_ input: String) {
        #expect(PostalCode.normalized(input) == nil)
    }

    @Test func aCodeSpanningTwoDepartmentsListsBoth() throws {
        let departments = try LivePostalCodeService.departments(from: fixture("geo_communes_05110"))
        #expect(departments == [
            PostalDepartment(code: "04", name: "Alpes-de-Haute-Provence", communes: ["Claret", "Curbans"]),
            PostalDepartment(code: "05", name: "Hautes-Alpes", communes: ["Barcillonnette"]),
        ])
    }

    @Test func anUnknownCodeHasNoDepartment() throws {
        #expect(try LivePostalCodeService.departments(from: Data("[]".utf8)).isEmpty)
    }

    /// The code goes to geo.api.gouv.fr and nowhere else, and nothing about
    /// the request is kept on disk (#463).
    @Test func theCodeGoesOnlyToGeoAPIWithNoCache() {
        let url = LivePostalCodeService.url(forPostalCode: "33000")
        #expect(url.absoluteString == "https://geo.api.gouv.fr/communes?codePostal=33000&fields=nom,departement&format=json")
        let configuration = LivePostalCodeService().session.configuration
        #expect(configuration.urlCache == nil)
        #expect(configuration.requestCachePolicy == .reloadIgnoringLocalCacheData)
    }
}

@MainActor
struct MonDeputeModelTests {
    func model(
        postal: StubPostalCodes = StubPostalCodes(.success([])),
        deputies: MonDeputeDeputies = MonDeputeDeputies(),
        defaults: UserDefaults = freshDefaults()
    ) -> MonDeputeModel {
        MonDeputeModel(deputies: deputies, postalCodes: postal, store: UserDefaultsFollowedDeputyStore(defaults: defaults))
    }

    @Test func firstLaunchShowsThePicker() {
        let model = model()
        #expect(model.showsPicker)
        #expect(model.home == nil)
    }

    @Test func anInvalidCodeIsRefusedWithoutAnyRequest() async {
        let postal = StubPostalCodes(.success([]))
        let model = model(postal: postal)
        model.postalCode = "3300"
        await model.runSearch()
        #expect(model.search == .invalid)
        #expect(postal.codes.isEmpty)
    }

    @Test func anUnknownCodeSaysSo() async {
        let model = model(postal: StubPostalCodes(.success([])))
        model.postalCode = "99999"
        await model.runSearch()
        #expect(model.search == .unknown)
    }

    @Test func aDepartmentWithSeveralDeputiesListsThemAll() async {
        let deputies = MonDeputeDeputies()
        deputies.rosters["33"] = [deputy("PA1"), deputy("PA2"), deputy("PA3")]
        let gironde = PostalDepartment(code: "33", name: "Gironde")
        let model = model(postal: StubPostalCodes(.success([gironde])), deputies: deputies)
        model.postalCode = " 33000 "
        await model.runSearch()
        #expect(model.search == .found([
            DepartmentDeputies(department: gironde, deputies: [deputy("PA1"), deputy("PA2"), deputy("PA3")]),
        ]))
    }

    @Test func aCodeOverTwoDepartmentsListsEachInOrder() async {
        let deputies = MonDeputeDeputies()
        deputies.rosters["04"] = [deputy("PA4")]
        deputies.rosters["05"] = [deputy("PA5")]
        let model = model(
            postal: StubPostalCodes(.success([
                PostalDepartment(code: "04", name: "Alpes-de-Haute-Provence"),
                PostalDepartment(code: "05", name: "Hautes-Alpes"),
            ])),
            deputies: deputies
        )
        model.postalCode = "05110"
        await model.runSearch()
        guard case .found(let found) = model.search else { Issue.record("no result"); return }
        #expect(found.map(\.department.code) == ["04", "05"])
        #expect(found.map { $0.deputies.map(\.id) } == [["PA4"], ["PA5"]])
    }

    @Test func anOfflineLookupIsAFailureNotAnUnknownCode() async {
        let model = model(postal: StubPostalCodes(.failure(URLError(.notConnectedToInternet))))
        model.postalCode = "33000"
        await model.runSearch()
        #expect(model.search == .failed(.offline))
    }

    @Test func theChoiceSurvivesARelaunchAndThePostalCodeIsNotStored() async {
        let defaults = freshDefaults()
        let first = model(defaults: defaults)
        first.postalCode = "33000"
        first.choose(deputy("PA1008"))
        #expect(first.showsPicker == false)
        #expect(first.postalCode.isEmpty)

        // A relaunch: a new model over the same storage opens on the home.
        let relaunched = model(defaults: defaults)
        #expect(relaunched.followedID == "PA1008")
        #expect(relaunched.showsPicker == false)
        #expect(relaunched.home != nil)
        let stored = defaults.dictionaryRepresentation().values.map { "\($0)" }
        #expect(!stored.contains { $0.contains("33000") })
    }

    /// A tap only selects; "Suivre" follows, and a new search drops the selection.
    @Test func aDeputyIsFollowedOnlyOnceConfirmed() async {
        let deputies = MonDeputeDeputies()
        deputies.rosters["33"] = [deputy("PA1"), deputy("PA2")]
        let defaults = freshDefaults()
        let model = model(
            postal: StubPostalCodes(.success([PostalDepartment(code: "33", name: "Gironde")])),
            deputies: deputies, defaults: defaults
        )
        model.postalCode = "33000"
        await model.runSearch()
        model.select(deputy("PA2"))
        #expect(model.selection?.id == "PA2")
        #expect(model.followedID == nil)
        await model.runSearch()
        #expect(model.selection == nil)
        model.select(deputy("PA1"))
        model.followSelection()
        #expect(model.followedID == "PA1")
        #expect(model.selection == nil)
        #expect(UserDefaultsFollowedDeputyStore(defaults: defaults).deputyID == "PA1")
    }

    @Test func changingKeepsTheDeputyUntilAnotherIsChosen() {
        let defaults = freshDefaults()
        let model = model(defaults: defaults)
        model.choose(deputy("PA1"))
        model.startChange()
        #expect(model.showsPicker)
        model.cancelChange()
        #expect(model.followedID == "PA1")
        model.startChange()
        model.choose(deputy("PA2"))
        #expect(UserDefaultsFollowedDeputyStore(defaults: defaults).deputyID == "PA2")
    }

    @Test func switchingDeputyForgetsThePreviousPosition() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1")
        store.setLastSeenVote(Date(), for: "PA1")
        store.switchTo("PA1")
        #expect(store.lastSeenVote(for: "PA1") != nil)
        store.switchTo("PA2")
        #expect(store.deputyID == "PA2")
        #expect(store.lastSeenVote(for: "PA1") == nil)
    }

    @Test func unfollowingForgetsTheDeputyAndTheirPosition() {
        let defaults = freshDefaults()
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        let model = model(defaults: defaults)
        model.choose(deputy("PA1"))
        store.setLastSeenVote(Date(), for: "PA1")
        model.unfollow()
        #expect(model.showsPicker)
        #expect(store.deputyID == nil)
        #expect(store.lastSeenVote(for: "PA1") == nil)
    }

    @Test func aDeputyWhoDisappearedSendsBackToThePicker() async {
        let defaults = freshDefaults()
        UserDefaultsFollowedDeputyStore(defaults: defaults).follow("PA0")
        let model = model(
            deputies: MonDeputeDeputies(profile: .failure(DeputyNotFound(id: "PA0"))), defaults: defaults
        )
        await model.home?.load()
        #expect(model.showsPicker)
        #expect(model.notice != nil)
        #expect(UserDefaultsFollowedDeputyStore(defaults: defaults).deputyID == nil)
    }
}

/// "Since your last visit" reads the stored position and then advances it
/// to the newest vote shown (#463).
struct SinceLastVisitTests {
    /// The identity card's two figures come from the scorecard and the
    /// alignment as the API returned them.
    @Test func theHomeCarriesTheScorecardAndAlignment() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let home = try await MonDeputeModel.loadHome(
            id: "PA1008", deputies: try LiveDeputiesServiceTests.service(), store: store
        )
        #expect(home.scorecard != nil)
        #expect(home.alignment != nil)
    }

    /// Either figure missing leaves the rest of the home.
    @Test func aFailedScorecardStillLoadsTheHome() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let home = try await MonDeputeModel.loadHome(id: "PA1008", deputies: MonDeputeDeputies(), store: store)
        #expect(home.scorecard == nil)
        #expect(home.alignment == nil)
    }

    @Test func aFirstVisitAsksForNothingAndStartsFromTheNewestVote() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let deputies = MonDeputeDeputies(recent: [vote("V2", day: "2026-07-21"), vote("V1", day: "2026-07-20")])
        let home = try await MonDeputeModel.loadHome(id: "PA1008", deputies: deputies, store: store)
        #expect(home.sinceLastVisit == .firstVisit)
        #expect(deputies.sinceDates.isEmpty)
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-07-21")))
    }

    @Test func aLaterVisitUsesTheStoredPositionThenAdvancesIt() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let seen = try APIDay.date("2026-07-21")
        store.setLastSeenVote(seen, for: "PA1008")
        let deputies = MonDeputeDeputies(recent: [vote("V4", day: "2026-07-23"), vote("V2", day: "2026-07-21")])
        deputies.newVotes = [vote("V4", day: "2026-07-23"), vote("V3", day: "2026-07-22")]
        let home = try await MonDeputeModel.loadHome(id: "PA1008", deputies: deputies, store: store)
        #expect(deputies.sinceDates == [seen])
        #expect(home.sinceLastVisit == .votes(deputies.newVotes, after: seen))
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-07-23")))
    }

    /// Not the time of the visit: a scrutin held on the day of a visit is
    /// dated that midnight, before the visit, and would never show.
    @Test func thePositionIsAVoteDateNotTheClock() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let deputies = MonDeputeDeputies(recent: [vote("V1", day: "2026-07-20")])
        let visit = try APIDay.date("2026-07-21").addingTimeInterval(15 * 3600)
        _ = try await MonDeputeModel.loadHome(id: "PA1008", deputies: deputies, store: store, now: visit)
        #expect(store.lastSeenVote(for: "PA1008") == (try APIDay.date("2026-07-20")))
    }

    @Test func aFailedListKeepsThePosition() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let seen = try APIDay.date("2026-07-21")
        store.setLastSeenVote(seen, for: "PA1008")
        let deputies = MonDeputeDeputies(recent: nil)
        deputies.newVotes = [vote("V3", day: "2026-07-22")]
        _ = try await MonDeputeModel.loadHome(id: "PA1008", deputies: deputies, store: store)
        #expect(store.lastSeenVote(for: "PA1008") == seen)
    }

    @Test func aDeputyWithNoVoteStartsFromToday() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let visit = try APIDay.date("2026-07-21").addingTimeInterval(15 * 3600)
        _ = try await MonDeputeModel.loadHome(id: "PA1", deputies: MonDeputeDeputies(recent: []), store: store, now: visit)
        let position = try #require(store.lastSeenVote(for: "PA1"))
        // A scrutin held that day (dated its midnight) is still after it.
        #expect(position < (try APIDay.date("2026-07-21")))
        #expect(position > (try APIDay.date("2026-07-20")))
    }

    @Test func countsAreWrittenInFrench() {
        #expect(HomeRecentVotesSection.newCount(1) == "1 nouveau vote")
        #expect(HomeRecentVotesSection.newCount(3) == "3 nouveaux votes")
        #expect(HomeRecentVotesSection.newCount(50) == "Au moins 50 nouveaux votes")
    }

    /// Accueil marks the votes held after the stored position (#477).
    @Test func onlyVotesAfterThePreviousVisitAreNew() throws {
        let since = SinceLastVisit.votes([vote("V3", day: "2026-07-22")], after: try APIDay.date("2026-07-21"))
        #expect(since.isNew(vote("V3", day: "2026-07-22")))
        #expect(!since.isNew(vote("V2", day: "2026-07-21")))
        #expect(!SinceLastVisit.firstVisit.isNew(vote("V3", day: "2026-07-22")))
        #expect(!SinceLastVisit.unavailable.isNew(vote("V3", day: "2026-07-22")))
    }

    /// A first visit says nothing about "new"; the other states say what
    /// changed, and the recent votes show in every case.
    @Test func theStatusLineFollowsTheVisit() throws {
        let after = try APIDay.date("2026-07-21")
        #expect(HomeRecentVotesSection.status(.firstVisit) == nil)
        #expect(HomeRecentVotesSection.status(.votes([], after: after)) == "Rien de nouveau depuis le scrutin du 21 juillet 2026.")
        #expect(
            HomeRecentVotesSection.status(.votes([vote("V3", day: "2026-07-22")], after: after))
                == "1 nouveau vote depuis votre dernière visite"
        )
        #expect(HomeRecentVotesSection.status(.unavailable) == "Les nouveaux votes n'ont pas pu être vérifiés.")
    }

    /// The home loads the profile and recent votes, never the scorecard,
    /// whose figures stay on the profile.
    @Test func theHomeKeepsItsListsWhenOnlyTheRecentVotesFail() async throws {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let home = try await MonDeputeModel.loadHome(
            id: "PA1008", deputies: MonDeputeDeputies(recent: nil), store: store
        )
        #expect(home.profile == testProfile)
        #expect(home.recentVotes == nil)
    }
}

/// The live service's two new calls, against recorded responses.
struct LiveMonDeputeServiceTests {
    @Test func departmentDeputiesAreTheCurrentRoster() async throws {
        let service = LiveDeputiesService(client: operationClient(["getDepartment": try fixture("department")]))
        let deputies = try await service.departmentDeputies(code: "33")
        #expect(deputies.count == 3)
        #expect(deputies.allSatisfy { $0.department == "Gironde" })
        #expect(deputies.first?.id == "PA793944")
        #expect(deputies.allSatisfy { $0.photoURL != nil })
    }

    @Test func anUnknownDeputyIsNotFoundRatherThanAServerError() async throws {
        let service = LiveDeputiesService(client: stubClient(Data("{\"detail\":\"Deputy not found\"}".utf8), status: .notFound))
        await #expect(throws: DeputyNotFound(id: "PA0")) { try await service.profile(id: "PA0") }
    }
}
