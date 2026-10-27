import Foundation
@testable import MonEluCore
import Testing

private struct Wrapper: WrapsUnderlyingError {
    let underlyingError: any Error
}

private struct Boom: Error {}

/// Scripted results, consumed one per fetch.
private final class Script<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var results: [Result<Value, any Error>]
    init(_ results: [Result<Value, any Error>]) { self.results = results }
    func next() throws -> Value { try lock.withLock { try results.removeFirst().get() } }
}

@MainActor
struct LoaderTests {
    private func loader(_ results: [Result<[Int], any Error>]) -> Loader<[Int]> {
        let script = Script(results)
        return Loader(isEmpty: { $0.isEmpty }, fetch: { try script.next() })
    }

    @Test func startsIdle() {
        #expect(loader([]).state.isIdle)
    }

    @Test func loadsContent() async {
        let loader = loader([.success([1, 2])])
        await loader.loadIfNeeded()
        #expect(loader.state.value == [1, 2])
    }

    @Test func emptyResultIsEmptyNotLoaded() async {
        let loader = loader([.success([])])
        await loader.load()
        #expect(loader.state.isEmptyState)
    }

    @Test func offlineIsToldApartFromServerError() async {
        let offline = loader([.failure(URLError(.notConnectedToInternet))])
        await offline.load()
        #expect(offline.state.failure == .offline)

        let server = loader([.failure(Boom())])
        await server.load()
        #expect(server.state.failure == .server)
    }

    @Test func wrappedOfflineErrorIsStillOffline() {
        #expect(LoadFailure(Wrapper(underlyingError: URLError(.timedOut))) == .offline)
        #expect(LoadFailure(Wrapper(underlyingError: URLError(.badServerResponse))) == .server)
    }

    @Test func retryAfterFailureLoadsAgain() async {
        let loader = loader([.failure(URLError(.notConnectedToInternet)), .success([3])])
        await loader.load()
        await loader.load()
        #expect(loader.state.value == [3])
    }

    @Test func loadIfNeededDoesNotReloadContent() async {
        let loader = loader([.success([1])])
        await loader.loadIfNeeded()
        await loader.loadIfNeeded() // would throw: the script is empty
        #expect(loader.state.value == [1])
    }

    @Test func refreshReplacesContent() async {
        let loader = loader([.success([1]), .success([1, 2])])
        await loader.load()
        await loader.refresh()
        #expect(loader.state.value == [1, 2])
        #expect(loader.isRefreshing == false)
    }

    @Test func failedRefreshKeepsContentAndReportsWhy() async {
        let loader = loader([.success([1]), .failure(URLError(.networkConnectionLost))])
        await loader.load()
        await loader.refresh()
        #expect(loader.state.value == [1])
        #expect(loader.refreshFailure == .offline)
    }

    @Test func updateAppendsToLoadedContentOnly() async {
        let loader = loader([.success([1])])
        loader.update { $0.append(9) } // idle: ignored
        #expect(loader.state.isIdle)
        await loader.load()
        loader.update { $0.append(2) }
        #expect(loader.state.value == [1, 2])
    }

    @Test func refreshWithoutContentIsAFullLoad() async {
        let loader = loader([.success([5])])
        await loader.refresh()
        #expect(loader.state.value == [5])
    }

    /// A cancelled load is not a failure (#579): the loader is idle again, so
    /// the `.task` that runs when its view returns loads for real.
    @Test func aCancelledLoadIsIdleAndLoadsNextTime() async {
        let loader = loader([.failure(CancellationError()), .success([1])])
        await loader.loadIfNeeded()
        #expect(loader.state.isIdle)
        await loader.loadIfNeeded()
        #expect(loader.state.value == [1])
    }

    /// URLSession reports a cancelled request as `URLError(.cancelled)`, which
    /// the generated client wraps.
    @Test func aWrappedURLCancellationIsACancellation() async {
        let loader = loader([.failure(Wrapper(underlyingError: URLError(.cancelled)))])
        await loader.load()
        #expect(loader.state.isIdle)
    }

    /// A retry cancelled after a real failure keeps showing that failure.
    @Test func aCancelledRetryKeepsTheEarlierFailure() async {
        let loader = loader([.failure(Boom()), .failure(CancellationError())])
        await loader.load()
        await loader.load()
        #expect(loader.state.failure == .server)
    }

    @Test func aCancelledRefreshKeepsContentWithoutAFailure() async {
        let loader = loader([.success([1]), .failure(URLError(.cancelled))])
        await loader.load()
        await loader.refresh()
        #expect(loader.state.value == [1])
        #expect(loader.refreshFailure == nil)
        #expect(loader.isRefreshing == false)
    }

    /// The case that happens in the app: the task running the load is
    /// cancelled while the fetch is waiting.
    @Test func cancellingTheTaskDuringAFetchLeavesTheLoaderIdle() async {
        let (started, signal) = AsyncStream<Void>.makeStream()
        let loader = Loader<[Int]> {
            signal.yield()
            try await Task.sleep(for: .seconds(60))
            return [1]
        }
        let task = Task { await loader.load() }
        for await _ in started { break }
        task.cancel()
        await task.value
        #expect(loader.state.isIdle)
    }

    @Test func otherErrorsAreNotCancellations() {
        #expect(!LoadFailure.isCancellation(URLError(.timedOut)))
        #expect(!LoadFailure.isCancellation(Wrapper(underlyingError: Boom())))
        #expect(LoadFailure.isCancellation(Wrapper(underlyingError: CancellationError())))
    }
}

struct AppRouteTests {
    @Test(arguments: [
        ("monelu://deputes/PA1008", AppRoute.deputy(id: "PA1008")),
        ("monelu://votes/VTANR5L17V8434", AppRoute.vote(id: "VTANR5L17V8434")),
        ("https://mon-elu.vercel.app/deputes/PA1008", AppRoute.deputy(id: "PA1008")),
        ("https://monelu.fr/votes/VTANR5L17V1", AppRoute.vote(id: "VTANR5L17V1")),
        ("monelu://lois/DLR5L17N54372", AppRoute.loi(id: "DLR5L17N54372")),
        ("monelu://groupes/lfi-nfp", AppRoute.group(slug: "lfi-nfp")),
        ("monelu://themes/justice-securite", AppRoute.theme(slug: "justice-securite")),
        ("https://monelu.fr/themes/sante-social", AppRoute.theme(slug: "sante-social")),
        ("monelu://departements/2A", AppRoute.department(code: "2A")),
        ("https://monelu.fr/departements/971", AppRoute.department(code: "971")),
        ("https://monelu.fr/groupes/rassemblement-national", AppRoute.group(slug: "rassemblement-national")),
    ])
    func parsesAppAndWebsiteLinks(_ link: String, _ route: AppRoute) throws {
        #expect(AppRoute(url: try #require(URL(string: link))) == route)
    }

    @Test(arguments: [
        "monelu://deputes/",
        "monelu://quiz/abc",
        "monelu://deputes/PA1008/dossier",
        "https://mon-elu.vercel.app/deputes",
        "http://mon-elu.vercel.app/deputes/PA1008",
        "monelu://deputes/PA%201008",
        "ftp://x/votes/V1",
        // Not until the website serves bill pages (#361).
        "https://monelu.fr/lois/DLR5L17N54372",
        "monelu://groupes/LFI",
        "https://monelu.fr/themes/Santé",
        "https://monelu.fr/groupes/lfi-nfp/membres",
    ])
    func rejectsEverythingElse(_ link: String) throws {
        #expect(AppRoute(url: try #require(URL(string: link))) == nil)
    }

    /// The website paths its apple-app-site-association hands to the app
    /// (#623). The website's Jest test checks the file claims exactly these
    /// and every page route of the same shape; here each must open a screen,
    /// or a tapped link would land on whatever tab was already showing.
    struct AppLinks: Decodable {
        let opensInApp: [String]

        enum CodingKeys: String, CodingKey { case opensInApp = "opens_in_app" }

        static let fixture: AppLinks = {
            let url = Bundle.module.url(forResource: "app_links", withExtension: "json", subdirectory: "Fixtures")!
            return try! JSONDecoder().decode(AppLinks.self, from: Data(contentsOf: url))
        }()
    }

    @Test(arguments: AppLinks.fixture.opensInApp)
    func everyLinkTheWebsiteHandsOverOpensAScreen(_ path: String) throws {
        let url = try #require(URL(string: "https://mon-elu.vercel.app" + path))
        #expect(AppRoute(url: url) != nil)
    }

    @Test func routesOpenInExplorer() {
        #expect(AppRoute.deputy(id: "PA1").tab == .explore)
        #expect(AppRoute.vote(id: "V1").tab == .explore)
        #expect(AppRoute.loi(id: "DLR1").tab == .explore)
        #expect(AppRoute.agenda().tab == .explore)
        #expect(AppRoute.compare(deputyID: "PA1").tab == .explore)
    }
}
