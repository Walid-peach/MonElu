import MonEluAPI

/// The services the app's screens use, built once from the generated client.
/// The app target hands each screen the service it needs.
public struct AppServices: Sendable {
    public let votes: any VotesService

    public init(client: Client) {
        votes = LiveVotesService(client: client)
    }

    public init(votes: any VotesService) {
        self.votes = votes
    }
}
