import Foundation
import MonEluCore

/// One deputy of a comparison: who they are and their scorecard.
public struct CompareSide: Hashable, Sendable {
    public let profile: DeputyProfile
    /// Nil when the scorecard failed to load; the rest still shows.
    public let scorecard: DeputyScorecard?

    public init(profile: DeputyProfile, scorecard: DeputyScorecard?) {
        self.profile = profile
        self.scorecard = scorecard
    }
}

/// A scrutin on which the two deputies took different positions.
public struct DivergingVote: Hashable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let date: Date?
    public let result: String?
    /// `pour`, `contre`, `abstention` or `nonVotant`, for each deputy.
    public let positionA: String
    public let positionB: String

    public init(id: String, title: String, date: Date?, result: String?, positionA: String, positionB: String) {
        self.id = id
        self.title = title
        self.date = date
        self.result = result
        self.positionA = positionA
        self.positionB = positionB
    }
}

/// The votes where they diverged: how many in all, and the latest.
public struct DivergingVotes: Hashable, Sendable {
    public let total: Int
    public let items: [DivergingVote]

    public init(total: Int, items: [DivergingVote]) {
        self.total = total
        self.items = items
    }
}

/// Everything the comparison shows. `other` is nil until the second
/// deputy is chosen.
public struct ComparePage: Hashable, Sendable {
    public let first: CompareSide
    public let other: CompareSide?
    public let diverging: DivergingVotes?

    public init(first: CompareSide, other: CompareSide?, diverging: DivergingVotes?) {
        self.first = first
        self.other = other
        self.diverging = diverging
    }
}

extension DeputyItem {
    /// "N. Abomangoli": the first name's initial and the rest, to label a
    /// position in a narrow row.
    var shortName: String {
        let parts = name.split(separator: " ", maxSplits: 1)
        guard parts.count == 2, let initial = parts[0].first else { return name }
        return "\(initial). \(parts[1])"
    }
}
