import Foundation
import MonEluAPI

/// The comparison's own data, behind a protocol so screens are tested with a stub.
/// Profiles and scorecards come from `DeputiesService`.
public protocol CompareService: Sendable {
    /// The scrutins where `first` and `other` took different positions.
    func diverging(first: String, other: String) async throws -> DivergingVotes
}

/// `CompareService` on the generated client (`getDivergingVotes`).
public struct LiveCompareService: CompareService {
    /// The latest divergences shown; `total` gives the full count.
    static let limit = 20

    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func diverging(first: String, other: String) async throws -> DivergingVotes {
        let response = try await client.getDivergingVotes(
            path: .init(deputyId: first), query: .init(otherDeputyId: other, limit: Self.limit)
        ).ok.body.json
        return DivergingVotes(
            total: response.total,
            items: response.items.map {
                DivergingVote(
                    id: $0.voteId, title: $0.voteTitle, date: $0.votedAt, result: $0.result,
                    positionA: $0.positionA, positionB: $0.positionB
                )
            }
        )
    }
}

extension CompareService {
    /// Both sides and their divergences, loaded together. A failing
    /// scorecard or divergence list degrades its own section only.
    func page(first: String, other: String?, deputies: any DeputiesService) async throws -> ComparePage {
        async let firstSide = side(first, deputies)
        guard let other else { return ComparePage(first: try await firstSide, other: nil, diverging: nil) }
        async let otherSide = side(other, deputies)
        async let diverging = try? self.diverging(first: first, other: other)
        return ComparePage(first: try await firstSide, other: try await otherSide, diverging: await diverging)
    }

    private func side(_ id: String, _ deputies: any DeputiesService) async throws -> CompareSide {
        async let scorecard = try? deputies.scorecard(id: id)
        return CompareSide(profile: try await deputies.profile(id: id), scorecard: await scorecard)
    }
}
