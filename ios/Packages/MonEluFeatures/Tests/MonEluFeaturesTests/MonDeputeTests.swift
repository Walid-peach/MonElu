import Foundation
import MonEluCore
@testable import MonEluFeatures
import Observation
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

    /// The picker adds a deputy over the feed; cancelling keeps the followed
    /// ones, and choosing never replaces another (ADR-042 amendment §6, #585).
    @Test func thePickerAddsWithoutReplacing() {
        let defaults = freshDefaults()
        let model = model(defaults: defaults)
        model.choose(deputy("PA1"))
        model.startChange()
        #expect(model.showsPicker)
        model.cancelChange()
        #expect(model.followedID == "PA1")
        model.startChange()
        model.choose(deputy("PA2"))
        #expect(UserDefaultsFollowedDeputyStore(defaults: defaults).deputyIDs == ["PA1", "PA2"])
        #expect(!model.isChanging)
    }

    /// Finding a deputy by postal code adds them to those followed (ADR-042
    /// amendment §6): all follows are equal.
    @Test func findingAnotherDeputyAddsThemToTheFollowed() {
        let defaults = freshDefaults()
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        store.follow("PA1")
        let model = model(defaults: defaults)
        model.choose(deputy("PA2"))
        #expect(store.deputyIDs == ["PA1", "PA2"])
        #expect(model.followedID == "PA2")
    }

    @Test func choosingAtTheCapKeepsThePickerWithANotice() {
        let defaults = freshDefaults()
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        for n in 0..<FollowedDeputies.cap { store.follow("PA\(n)") }
        let model = model(defaults: defaults)
        model.choose(deputy("PAX"))
        #expect(!store.isFollowing("PAX"))
        #expect(model.notice != nil)
        #expect(model.followedID == "PA0")
    }

    @Test func unfollowingTheShownDeputyShowsTheNextOne() {
        let defaults = freshDefaults()
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        store.follow("PA1")
        store.follow("PA2")
        let model = model(defaults: defaults)
        model.unfollow()
        #expect(store.deputyIDs == ["PA2"])
        #expect(model.followedID == "PA2")
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

    /// A deputy followed on their profile reaches Accueil without a relaunch
    /// (#576): the profile and Accueil share one store, as in `AppServices`.
    @Test func aFollowFromAnotherScreenReachesTheModel() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let model = MonDeputeModel(deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])), store: store)
        #expect(model.showsPicker)
        store.follow("PA2")
        model.syncWithStore()
        #expect(model.followedID == "PA2")
        #expect(!model.showsPicker)
    }

    @Test func anUnfollowFromAnotherScreenReachesTheModel() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let model = MonDeputeModel(deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])), store: store)
        model.choose(deputy("PA1"))
        model.startChange()
        store.unfollow("PA1")
        model.syncWithStore()
        #expect(model.followedID == nil)
        #expect(!model.isChanging)
    }

    /// A deputy followed elsewhere leaves the one this model chose in place.
    @Test func aFollowElsewhereKeepsTheChosenDeputy() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let model = MonDeputeModel(deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])), store: store)
        model.choose(deputy("PA1"))
        store.follow("PA2")
        model.syncWithStore()
        #expect(model.followedID == "PA1")
    }

    /// A view reading `deputyID` re-renders because the store reports each
    /// write to it: a profile left open on another tab turns « Suivi » back
    /// into « Suivre » when the deputy is unfollowed on Accueil.
    @Test func theStoreReportsFollowsAndUnfollowsToObservers() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        for change: () -> Void in [{ store.follow("PA1") }, { store.unfollow("PA1") }] {
            nonisolated(unsafe) var changed = false
            withObservationTracking { _ = store.deputyIDs } onChange: { changed = true }
            change()
            #expect(changed)
        }
    }
}

/// The followed deputies are a list kept in `UserDefaults` (#584, ADR-042
/// amendment).
struct FollowedDeputyStoreTests {
    /// An install from before the list keeps its one deputy.
    @Test func theSingleDeputyOfAnOlderBuildMovesIntoTheList() {
        let defaults = freshDefaults()
        defaults.set("PA1", forKey: "monelu.followedDeputyID")
        defaults.set(Date(timeIntervalSince1970: 1), forKey: "monelu.lastSeenVoteAt.PA1")
        let store = UserDefaultsFollowedDeputyStore(defaults: defaults)
        #expect(store.deputyIDs == ["PA1"])
        #expect(store.deputyID == "PA1")
        #expect(store.lastSeenVote(for: "PA1") == Date(timeIntervalSince1970: 1))
        #expect(defaults.string(forKey: "monelu.followedDeputyID") == nil)
        // A second launch finds the list, not the old key.
        #expect(UserDefaultsFollowedDeputyStore(defaults: defaults).deputyIDs == ["PA1"])
    }

    @Test func followingAnotherDeputyKeepsTheFirst() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1")
        store.follow("PA2")
        store.follow("PA1")
        #expect(store.deputyIDs == ["PA1", "PA2"])
        #expect(store.isFollowing("PA1") && store.isFollowing("PA2"))
    }

    @Test func unfollowingOneDeputyLeavesTheOthers() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        store.follow("PA1")
        store.follow("PA2")
        store.setLastSeenVote(Date(), for: "PA1")
        store.setLastSeenVote(Date(), for: "PA2")
        store.unfollow("PA1")
        #expect(store.deputyIDs == ["PA2"])
        #expect(store.lastSeenVote(for: "PA1") == nil)
        #expect(store.lastSeenVote(for: "PA2") != nil)
    }

    @Test func theListStopsAtTheCap() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        for n in 0..<FollowedDeputies.cap { #expect(store.follow("PA\(n)")) }
        #expect(!store.canFollowMore)
        #expect(!store.follow("PAX"))
        #expect(store.deputyIDs.count == FollowedDeputies.cap)
        // Following one already followed still succeeds.
        #expect(store.follow("PA0"))
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
