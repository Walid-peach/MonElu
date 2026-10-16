import Foundation
import MonEluAPI

/// The services the app's screens use, built once from the generated client.
/// The app target hands each screen the service it needs.
public struct AppServices: Sendable {
    public let votes: any VotesService
    public let deputies: any DeputiesService
    public let lois: any LoisService
    public let agenda: any AgendaService
    public let groups: any GroupsService
    public let themes: any ThemesService
    public let departments: any DepartmentsService
    public let compare: any CompareService
    public let ask: any AskService
    public let quiz: any QuizService
    public let postalCodes: any PostalCodeService
    /// The followed deputy, on the device only (ADR-040 §6).
    public let followedDeputy: any FollowedDeputyStore
    /// Accueil's feed (ADR-042).
    public let feed: any FeedService
    /// The followed themes, on the device only (ADR-042 §2).
    public let followedThemes: any FollowedThemesStore

    public init(client: Client) {
        votes = LiveVotesService(client: client)
        deputies = LiveDeputiesService(client: client)
        lois = LiveLoisService(client: client)
        agenda = LiveAgendaService(client: client)
        groups = LiveGroupsService(client: client)
        themes = LiveThemesService(client: client)
        departments = LiveDepartmentsService(client: client)
        compare = LiveCompareService(client: client)
        ask = LiveAskService(client: client)
        quiz = LiveQuizService(client: client)
        postalCodes = LivePostalCodeService()
        followedDeputy = UserDefaultsFollowedDeputyStore()
        feed = LiveFeedService(client: client)
        followedThemes = UserDefaultsFollowedThemesStore()
    }

    public init(
        votes: any VotesService, deputies: any DeputiesService, lois: any LoisService, agenda: any AgendaService,
        groups: any GroupsService, themes: any ThemesService,
        departments: any DepartmentsService, compare: any CompareService,
        ask: any AskService, quiz: any QuizService,
        postalCodes: any PostalCodeService, followedDeputy: any FollowedDeputyStore,
        feed: any FeedService = UnavailableFeedService(),
        followedThemes: any FollowedThemesStore = UserDefaultsFollowedThemesStore(defaults: .init(suiteName: "AppServices.unused")!)
    ) {
        self.votes = votes
        self.deputies = deputies
        self.lois = lois
        self.agenda = agenda
        self.groups = groups
        self.themes = themes
        self.departments = departments
        self.compare = compare
        self.ask = ask
        self.quiz = quiz
        self.postalCodes = postalCodes
        self.followedDeputy = followedDeputy
        self.feed = feed
        self.followedThemes = followedThemes
    }
}

/// A `FeedService` that always fails: the default for callers of the
/// injecting initializer that do not exercise Accueil's feed.
public struct UnavailableFeedService: FeedService {
    public init() {}

    public func feed(_ query: FeedQuery) async throws -> FeedPage {
        throw URLError(.notConnectedToInternet)
    }

    public func week(deputyID: String?) async throws -> FeedWeek {
        throw URLError(.notConnectedToInternet)
    }
}
