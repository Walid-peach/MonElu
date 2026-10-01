import MonEluAPI

/// The services the app's screens use, built once from the generated client.
/// The app target hands each screen the service it needs.
public struct AppServices: Sendable {
    public let votes: any VotesService
    public let deputies: any DeputiesService
    public let postalCodes: any PostalCodeService
    /// The followed deputy, on the device only (ADR-040 §6).
    public let followedDeputy: any FollowedDeputyStore

    public init(client: Client) {
        votes = LiveVotesService(client: client)
        deputies = LiveDeputiesService(client: client)
        postalCodes = LivePostalCodeService()
        followedDeputy = UserDefaultsFollowedDeputyStore()
    }

    public init(
        votes: any VotesService, deputies: any DeputiesService,
        postalCodes: any PostalCodeService, followedDeputy: any FollowedDeputyStore
    ) {
        self.votes = votes
        self.deputies = deputies
        self.postalCodes = postalCodes
        self.followedDeputy = followedDeputy
    }
}
