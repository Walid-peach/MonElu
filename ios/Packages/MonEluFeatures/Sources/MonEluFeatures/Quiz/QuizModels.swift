import Foundation

/// A quiz answer, as `match` takes it.
public enum QuizPosition: String, CaseIterable, Sendable {
    case pour, contre, abstention
}

/// A curated quiz question: a real scrutin, with its live tallies as the API
/// returns them.
public struct QuizQuestion: Identifiable, Hashable, Sendable {
    public let voteID: String
    public let theme: String
    public let question: String
    public let context: String
    public let votesFor: Int?
    public let votesAgainst: Int?
    public let abstentions: Int?
    public let result: String?
    public let voteDate: Date?
    public var id: String { voteID }

    public init(
        voteID: String, theme: String, question: String, context: String, votesFor: Int?,
        votesAgainst: Int?, abstentions: Int?, result: String?, voteDate: Date?
    ) {
        self.voteID = voteID
        self.theme = theme
        self.question = question
        self.context = context
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.abstentions = abstentions
        self.result = result
        self.voteDate = voteDate
    }
}

/// A deputy's agreement with the answers, as `match` returns it.
public struct QuizDeputyMatch: Identifiable, Hashable, Sendable {
    public let deputy: DeputyItem
    /// 0 to 100, exactly as returned; nil when nothing could be compared.
    public let agreementPct: Double?
    public let matches: Int
    public let compared: Int
    public var id: String { deputy.id }

    public init(deputy: DeputyItem, agreementPct: Double?, matches: Int, compared: Int) {
        self.deputy = deputy
        self.agreementPct = agreementPct
        self.matches = matches
        self.compared = compared
    }
}

/// A group's agreement with the answers, as `match` returns it.
public struct QuizGroupMatch: Identifiable, Hashable, Sendable {
    public let group: String
    public let groupShort: String?
    /// 0 to 100, exactly as returned.
    public let agreementPct: Double
    public let matches: Int
    public let compared: Int
    public let deputyCount: Int
    public var id: String { group }

    public init(group: String, groupShort: String?, agreementPct: Double, matches: Int, compared: Int, deputyCount: Int) {
        self.group = group
        self.groupShort = groupShort
        self.agreementPct = agreementPct
        self.matches = matches
        self.compared = compared
        self.deputyCount = deputyCount
    }
}

/// The result of `match`. Every ranking and percentage is the API's; nothing
/// is computed on the device (ADR-025).
public struct QuizResult: Hashable, Sendable {
    public let answered: Int
    public let eligibleDeputies: Int
    public let topMatches: [QuizDeputyMatch]
    public let opposite: QuizDeputyMatch?
    public let groups: [QuizGroupMatch]
    public let supportedThemes: [String]
    public let opposedThemes: [String]

    public init(
        answered: Int, eligibleDeputies: Int, topMatches: [QuizDeputyMatch], opposite: QuizDeputyMatch?,
        groups: [QuizGroupMatch], supportedThemes: [String], opposedThemes: [String]
    ) {
        self.answered = answered
        self.eligibleDeputies = eligibleDeputies
        self.topMatches = topMatches
        self.opposite = opposite
        self.groups = groups
        self.supportedThemes = supportedThemes
        self.opposedThemes = opposedThemes
    }
}

/// One answer as sent to the API.
public struct QuizAnswer: Hashable, Sendable {
    public let voteID: String
    public let position: QuizPosition

    public init(voteID: String, position: QuizPosition) {
        self.voteID = voteID
        self.position = position
    }
}
