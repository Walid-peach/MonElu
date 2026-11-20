import Foundation
import MonEluAPI
import MonEluCore

/// The legislature's headline figures, as `GET /election/2027` counted them.
public struct ElectionFigures: Hashable, Sendable {
    /// First date the figures cover (`YYYY-MM-DD`): the data horizon.
    public let coverageStart: String
    public let scrutins: Int
    /// Whole-text scrutins adopted. One reading is one scrutin, so this is not
    /// a count of promulgated laws, and the screen never calls it one.
    public let adoptedTexts: Int
    public let censureMotions: Int
    /// 0 to 1; nil while the API's marts are absent.
    public let medianPresenceRate: Double?

    public init(coverageStart: String, scrutins: Int, adoptedTexts: Int, censureMotions: Int, medianPresenceRate: Double?) {
        self.coverageStart = coverageStart
        self.scrutins = scrutins
        self.adoptedTexts = adoptedTexts
        self.censureMotions = censureMotions
        self.medianPresenceRate = medianPresenceRate
    }
}

/// A whole-text or motion scrutin that was close, with its margin as the API
/// computed it.
public struct ElectionKeyVote: Identifiable, Hashable, Sendable {
    public let id: String
    /// `Texte entier`, `Motion de censure` or `Motion`.
    public let kind: String
    /// `adopté` or `rejeté`, the Assemblée's own.
    public let result: String?
    public let date: Date?
    public let title: String
    public let votesFor: Int
    public let abstentions: Int
    public let votesAgainst: Int
    /// Votes between pour and contre.
    public let margin: Int

    public init(
        id: String, kind: String, result: String?, date: Date?, title: String,
        votesFor: Int, abstentions: Int, votesAgainst: Int, margin: Int
    ) {
        self.id = id
        self.kind = kind
        self.result = result
        self.date = date
        self.title = title
        self.votesFor = votesFor
        self.abstentions = abstentions
        self.votesAgainst = votesAgainst
        self.margin = margin
    }
}

/// How a group's majority voted on one key vote. `position` is nil when no
/// member expressed one or two positions tied.
public struct ElectionGridCell: Hashable, Sendable {
    public let voteID: String
    /// `pour`, `contre` or `abstention`.
    public let position: String?
    public let pour: Int
    public let contre: Int
    public let abstention: Int

    public init(voteID: String, position: String?, pour: Int, contre: Int, abstention: Int) {
        self.voteID = voteID
        self.position = position
        self.pour = pour
        self.contre = contre
        self.abstention = abstention
    }
}

public struct ElectionGridRow: Identifiable, Hashable, Sendable {
    public var id: String { label }
    public let label: String
    public let partyShort: String?
    public let seats: Int
    /// One per key vote, in the key votes' order.
    public let cells: [ElectionGridCell]

    public init(label: String, partyShort: String?, seats: Int, cells: [ElectionGridCell]) {
        self.label = label
        self.partyShort = partyShort
        self.seats = seats
        self.cells = cells
    }
}

/// Everything the 2027 tab shows from the API.
public struct ElectionPage: Hashable, Sendable {
    public let figures: ElectionFigures
    public let keyVotes: [ElectionKeyVote]
    public let grid: [ElectionGridRow]

    public init(figures: ElectionFigures, keyVotes: [ElectionKeyVote], grid: [ElectionGridRow]) {
        self.figures = figures
        self.keyVotes = keyVotes
        self.grid = grid
    }
}

/// The 2027 tab's data, behind a protocol so the screen is tested with a stub.
public protocol ElectionService: Sendable {
    func page() async throws -> ElectionPage
}

/// `ElectionService` on the generated client (`getElection2027`).
public struct LiveElectionService: ElectionService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func page() async throws -> ElectionPage {
        ElectionPage(try await client.getElection2027().ok.body.json)
    }
}

/// An `ElectionService` that always fails: the default for callers of the
/// injecting `AppServices` initializer that do not exercise the 2027 tab.
public struct UnavailableElectionService: ElectionService {
    public init() {}

    public func page() async throws -> ElectionPage {
        throw URLError(.notConnectedToInternet)
    }
}

extension ElectionPage {
    init(_ response: Components.Schemas.Election2027Response) {
        let legislature = response.legislature
        self.init(
            figures: ElectionFigures(
                coverageStart: legislature.coverageStart, scrutins: legislature.scrutins,
                adoptedTexts: legislature.adoptedTexts, censureMotions: legislature.censureMotions,
                medianPresenceRate: legislature.medianPresenceRate
            ),
            keyVotes: (response.keyVotes ?? []).map {
                ElectionKeyVote(
                    id: $0.voteId, kind: $0.kind, result: $0.result, date: $0.votedAt, title: $0.title,
                    votesFor: $0.votesFor, abstentions: $0.abstentions, votesAgainst: $0.votesAgainst,
                    margin: $0.margin
                )
            },
            grid: (response.grid ?? []).map { row in
                ElectionGridRow(
                    label: row.label, partyShort: row.partyShort, seats: row.seats,
                    cells: row.cells.map {
                        ElectionGridCell(
                            voteID: $0.voteId, position: $0.position, pour: $0.pour, contre: $0.contre,
                            abstention: $0.abstention
                        )
                    }
                )
            }
        )
    }
}

extension ElectionPage {
    /// A made-up page for the loading placeholder: the shape of the figures,
    /// two vote cards and a small grid, never shown as text (#697).
    static let placeholder = ElectionPage(
        figures: ElectionFigures(
            coverageStart: "2025-07-01", scrutins: 1234, adoptedTexts: 123, censureMotions: 12,
            medianPresenceRate: 0.5
        ),
        keyVotes: (0..<3).map {
            ElectionKeyVote(
                id: "placeholder-\($0)", kind: "Texte entier", result: "adopté",
                date: Date(timeIntervalSince1970: 1_791_633_600),
                title: "l'ensemble du projet de loi relatif à la simplification de la vie économique",
                votesFor: 300, abstentions: 20, votesAgainst: 250, margin: 50
            )
        },
        grid: ["Groupe un", "Groupe deux", "Groupe trois"].map { label in
            ElectionGridRow(
                label: label, partyShort: nil, seats: 100,
                cells: (0..<3).map {
                    ElectionGridCell(voteID: "placeholder-\($0)", position: "pour", pour: 1, contre: 0, abstention: 0)
                }
            )
        }
    )
}
