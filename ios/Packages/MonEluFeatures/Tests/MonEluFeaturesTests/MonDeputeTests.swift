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

final class StubAddresses: AddressService, @unchecked Sendable {
    private let lock = NSLock()
    private let result: Result<[AddressSuggestion], any Error>
    private(set) var queries: [String] = []

    init(_ result: Result<[AddressSuggestion], any Error>) { self.result = result }

    func suggestions(for query: String) async throws -> [AddressSuggestion] {
        try lock.withLock {
            queries.append(query)
            return try result.get()
        }
    }
}

final class StubCirconscriptions: CirconscriptionService, @unchecked Sendable {
    private let lock = NSLock()
    private let lookup: Result<SeatLookup?, any Error>
    private let abroadSeats: Result<[LocatedSeat], any Error>
    private(set) var points: [[Double]] = []

    init(lookup: Result<SeatLookup?, any Error> = .success(nil), abroad: [LocatedSeat] = []) {
        self.lookup = lookup
        abroadSeats = .success(abroad)
    }

    init(abroadFailure: any Error) {
        lookup = .success(nil)
        abroadSeats = .failure(abroadFailure)
    }

    func locate(latitude: Double, longitude: Double) async throws -> SeatLookup? {
        try lock.withLock {
            points.append([latitude, longitude])
            return try lookup.get()
        }
    }

    func abroad() async throws -> [LocatedSeat] { try abroadSeats.get() }
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
        addresses: StubAddresses = StubAddresses(.success([])),
        circonscriptions: StubCirconscriptions = StubCirconscriptions(),
        defaults: UserDefaults = freshDefaults()
    ) -> MonDeputeModel {
        MonDeputeModel(
            deputies: deputies, postalCodes: postal, addresses: addresses, circonscriptions: circonscriptions,
            store: UserDefaultsFollowedDeputyStore(defaults: defaults)
        )
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
        let model = MonDeputeModel(
            deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])),
            addresses: StubAddresses(.success([])), circonscriptions: StubCirconscriptions(), store: store
        )
        #expect(model.showsPicker)
        store.follow("PA2")
        model.syncWithStore()
        #expect(model.followedID == "PA2")
        #expect(!model.showsPicker)
    }

    @Test func anUnfollowFromAnotherScreenReachesTheModel() {
        let store = UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        let model = MonDeputeModel(
            deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])),
            addresses: StubAddresses(.success([])), circonscriptions: StubCirconscriptions(), store: store
        )
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
        let model = MonDeputeModel(
            deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])),
            addresses: StubAddresses(.success([])), circonscriptions: StubCirconscriptions(), store: store
        )
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

@MainActor
struct MonDeputeAddressTests {
    static let lille = AddressSuggestion(
        label: "1 Rue Nationale 59000 Lille", context: "59, Nord", latitude: 50.6366, longitude: 3.0596
    )
    static let deputy = DeputyItem(
        id: "PA1", name: "Une Députée", group: nil, groupShort: "EPR",
        department: "Nord", circonscription: "1", photoURL: nil
    )

    func model(_ addresses: StubAddresses, _ circonscriptions: StubCirconscriptions) -> MonDeputeModel {
        MonDeputeModel(
            deputies: MonDeputeDeputies(), postalCodes: StubPostalCodes(.success([])),
            addresses: addresses, circonscriptions: circonscriptions,
            store: UserDefaultsFollowedDeputyStore(defaults: freshDefaults())
        )
    }

    @Test func shortTextAsksForNothing() async {
        let addresses = StubAddresses(.success([Self.lille]))
        let model = model(addresses, StubCirconscriptions())
        model.address = "1 "
        await model.suggestAddresses()
        #expect(addresses.queries.isEmpty)
        #expect(model.addressSearch == .idle)
    }

    @Test func typingShowsSuggestions() async {
        let addresses = StubAddresses(.success([Self.lille]))
        let model = model(addresses, StubCirconscriptions())
        model.address = "1 rue nationale"
        await model.suggestAddresses()
        #expect(addresses.queries == ["1 rue nationale"])
        #expect(model.addressSearch == .suggestions([Self.lille]))
    }

    /// The next keystroke cancels the request in flight; URLSession reports
    /// that as URLError(.cancelled), which is not a failure to show.
    @Test func aCancelledSuggestionRequestShowsNothing() async {
        let model = model(StubAddresses(.failure(URLError(.cancelled))), StubCirconscriptions())
        model.address = "1 rue nationale"
        await model.suggestAddresses()
        #expect(model.addressSearch == .idle)
    }

    @Test func theSameTextIsNotAskedTwice() async {
        let addresses = StubAddresses(.success([Self.lille]))
        let model = model(addresses, StubCirconscriptions())
        model.address = "1 rue nationale"
        await model.suggestAddresses()
        await model.suggestAddresses()
        #expect(addresses.queries == ["1 rue nationale"])
    }

    @Test func typingAfterAResultDropsItsSelection() async {
        let lookup = SeatLookup(uncertain: false, seats: [
            LocatedSeat(departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription", deputy: Self.deputy),
        ])
        let model = model(StubAddresses(.success([])), StubCirconscriptions(lookup: .success(lookup)))
        await model.pick(Self.lille)
        #expect(model.selection == Self.deputy)
        model.address = "3 rue de la paix"
        await model.suggestAddresses()
        #expect(model.selection == nil)
        #expect(model.addressSearch == .suggestions([]))
    }

    @Test func aPostalSearchClearsTheAddressSearchAndTheOtherWayRound() async {
        let lookup = SeatLookup(uncertain: false, seats: [
            LocatedSeat(departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription", deputy: Self.deputy),
        ])
        let model = model(StubAddresses(.success([])), StubCirconscriptions(lookup: .success(lookup)))
        await model.pick(Self.lille)
        model.postalCode = "59000"
        await model.runSearch()
        #expect(model.addressSearch == .idle)
        #expect(model.address.isEmpty)
        await model.pick(Self.lille)
        #expect(model.search == .idle)
    }

    @Test func aFailedAbroadListIsAFailure() async {
        let model = model(StubAddresses(.success([])), StubCirconscriptions(abroadFailure: URLError(.badServerResponse)))
        await model.showAbroad()
        #expect(model.addressSearch == .failed(.server))
    }

    @Test func aFailedSuggestionSaysSoAndLeavesThePostalCode() async {
        let model = model(StubAddresses(.failure(URLError(.badServerResponse))), StubCirconscriptions())
        model.address = "1 rue nationale"
        await model.suggestAddresses()
        #expect(model.addressSearch == .suggestionsUnavailable)
    }

    /// Only the point goes to the locator; one sure seat preselects its deputy.
    @Test func pickingSendsOnlyThePointAndPreselectsTheDeputy() async {
        let lookup = SeatLookup(uncertain: false, seats: [
            LocatedSeat(departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription", deputy: Self.deputy),
        ])
        let circonscriptions = StubCirconscriptions(lookup: .success(lookup))
        let addresses = StubAddresses(.success([Self.lille]))
        let model = model(addresses, circonscriptions)
        await model.pick(Self.lille)
        #expect(circonscriptions.points == [[50.6366, 3.0596]])
        #expect(model.addressSearch == .located(lookup, address: Self.lille.label))
        #expect(model.selection == Self.deputy)
        // Filling the field with the picked label does not ask for suggestions again.
        await model.suggestAddresses()
        #expect(addresses.queries.isEmpty)
    }

    @Test func nearABoundaryNothingIsPreselected() async {
        let lookup = SeatLookup(uncertain: true, seats: [
            LocatedSeat(departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription", deputy: Self.deputy),
            LocatedSeat(departmentCode: "59", circonscription: 4, label: "Nord, 4e circonscription", deputy: nil),
        ])
        let model = model(StubAddresses(.success([])), StubCirconscriptions(lookup: .success(lookup)))
        await model.pick(Self.lille)
        #expect(model.selection == nil)
        #expect(model.addressSearch == .located(lookup, address: Self.lille.label))
    }

    @Test func aPointInNoSeatIsNotFound() async {
        let model = model(StubAddresses(.success([])), StubCirconscriptions(lookup: .success(nil)))
        await model.pick(Self.lille)
        #expect(model.addressSearch == .notFound(address: Self.lille.label))
    }

    @Test func aFailedLookupIsAFailure() async {
        let model = model(StubAddresses(.success([])), StubCirconscriptions(lookup: .failure(URLError(.notConnectedToInternet))))
        await model.pick(Self.lille)
        #expect(model.addressSearch == .failed(.offline))
    }

    @Test func abroadListsTheSeats() async {
        let seat = LocatedSeat(
            departmentCode: "99", circonscription: 4, label: "Français établis hors de France, 4e circonscription",
            deputy: Self.deputy, region: "Benelux"
        )
        let model = model(StubAddresses(.success([])), StubCirconscriptions(abroad: [seat]))
        await model.showAbroad()
        #expect(model.addressSearch == .abroad([seat]))
    }

    @Test func followingResetsTheAddressSearch() async {
        let lookup = SeatLookup(uncertain: false, seats: [
            LocatedSeat(departmentCode: "59", circonscription: 1, label: "Nord, 1re circonscription", deputy: Self.deputy),
        ])
        let model = model(StubAddresses(.success([])), StubCirconscriptions(lookup: .success(lookup)))
        await model.pick(Self.lille)
        model.followSelection()
        #expect(model.followedID == "PA1")
        #expect(model.address.isEmpty)
        #expect(model.addressSearch == .idle)
    }
}

struct AddressServiceTests {
    /// The address goes to the national geocoder and nowhere else, and nothing
    /// about the request is kept on disk (ADR-047 §4).
    @Test func theAddressGoesOnlyToTheGeocoderWithNoCache() {
        let url = LiveAddressService.url(for: "8 bd du port amiens")
        #expect(url.host == "data.geopf.fr")
        #expect(url.path == "/geocodage/search")
        #expect(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first?.value == "8 bd du port amiens")
        let configuration = LiveAddressService().session.configuration
        #expect(configuration.urlCache == nil)
        #expect(configuration.requestCachePolicy == .reloadIgnoringLocalCacheData)
    }

    /// A street's or a town's point is its middle: in a split city it would
    /// name the wrong seat with confidence (ADR-047 §5), so only house numbers
    /// and lieux-dits are suggested.
    @Test func readsOnlyPreciseLabelledPointsFromTheResponse() throws {
        let json = """
        {"type":"FeatureCollection","features":[
          {"type":"Feature","geometry":{"type":"Point","coordinates":[2.290084,49.897442]},
           "properties":{"label":"8 Boulevard du Port 80000 Amiens","context":"80, Somme, Hauts-de-France","type":"housenumber"}},
          {"type":"Feature","geometry":{"type":"Point","coordinates":[2.29,49.89]},
           "properties":{"label":"Boulevard du Port 80000 Amiens","type":"street"}},
          {"type":"Feature","geometry":{"type":"Point","coordinates":[2.30,49.89]},
           "properties":{"label":"Amiens","type":"municipality"}},
          {"type":"Feature","geometry":{"type":"Point","coordinates":[2.0]},"properties":{"label":"Broken","type":"housenumber"}},
          {"type":"Feature","geometry":{"type":"Point","coordinates":[2.0,48.0]},"properties":{"type":"housenumber"}}
        ]}
        """
        let suggestions = try LiveAddressService.suggestions(from: Data(json.utf8))
        #expect(suggestions == [
            AddressSuggestion(
                label: "8 Boulevard du Port 80000 Amiens", context: "80, Somme, Hauts-de-France",
                latitude: 49.897442, longitude: 2.290084
            ),
        ])
    }
}

struct LiveCirconscriptionServiceTests {
    /// A point in no seat is a 404 the spec does not list; the client reports
    /// it as undocumented, and the service turns it into nil.
    @Test func aPointInNoSeatIsNil() async throws {
        let service = LiveCirconscriptionService(
            client: stubClient(Data("{\"detail\":\"none\"}".utf8), status: .notFound)
        )
        #expect(try await service.locate(latitude: 46, longitude: -5) == nil)
    }

    @Test func mapsTheSeatsAndTheirDeputies() async throws {
        let json = """
        {"uncertain":true,"seats":[
          {"department_code":"59","department_name":"Nord","circonscription":1,
           "label":"Nord, 1re circonscription","vacant":false,
           "deputy":{"deputy_id":"PA1","full_name":"Une Députée","party":"Ensemble pour la République",
                     "party_short":"EPR","department":"Nord","circonscription":"1","photo_url":null}},
          {"department_code":"59","department_name":"Nord","circonscription":4,
           "label":"Nord, 4e circonscription","vacant":true}
        ]}
        """
        let lookup = try await LiveCirconscriptionService(client: stubClient(Data(json.utf8)))
            .locate(latitude: 50.63, longitude: 3.06)
        #expect(lookup?.uncertain == true)
        #expect(lookup?.seats.map(\.id) == ["59-1", "59-4"])
        #expect(lookup?.seats.first?.deputy?.groupShort == "EPR")
        #expect(lookup?.seats.last?.vacant == true)
        #expect(lookup?.seats.last?.deputy == nil)
    }
}
