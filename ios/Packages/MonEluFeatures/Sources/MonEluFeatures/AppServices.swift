import MonEluAPI

/// The services the app's screens use, built once from the generated client.
/// The app target hands each screen the service it needs.
public struct AppServices: Sendable {
    public let votes: any VotesService
    public let deputies: any DeputiesService

    public init(client: Client) {
        votes = LiveVotesService(client: client)
        deputies = LiveDeputiesService(client: client)
    }

    public init(votes: any VotesService, deputies: any DeputiesService) {
        self.votes = votes
        self.deputies = deputies
    }
}
