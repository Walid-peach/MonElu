import Foundation
import MonEluCore

/// A bill's page as `GET /lois/{dossier_uid}` returns it (ADR-035).
public struct Loi: Hashable, Sendable {
    public let id: String
    public let title: String
    /// "Proposition de loi ordinaire".
    public let procedure: String?
    /// One of the seven values ADR-035 §5 derives (`en_navette`, …).
    public let status: String?
    /// The AN's own wording of the deciding acte ("adopté"), shown beside
    /// the derived status, never instead of it.
    public let statusLabel: String?
    /// The `codeActe` of the last top-level acte (`AN1`, `SN1`, `PROM`).
    public let currentStage: String?
    public let anURL: URL?
    /// True when the parcours starts before the AN linked scrutins to bills,
    /// so its early stages carry no vote.
    public let predatesCoverage: Bool
    /// In `ordinal` order, as the API returns it.
    public let parcours: [LoiActe]
    /// Headline scrutins no AN séance acte precedes; normally empty.
    public let unattachedScrutins: [LoiScrutin]

    public init(
        id: String, title: String, procedure: String?, status: String?, statusLabel: String?,
        currentStage: String?, anURL: URL?, predatesCoverage: Bool, parcours: [LoiActe],
        unattachedScrutins: [LoiScrutin]
    ) {
        self.id = id
        self.title = title
        self.procedure = procedure
        self.status = status
        self.statusLabel = statusLabel
        self.currentStage = currentStage
        self.anURL = anURL
        self.predatesCoverage = predatesCoverage
        self.parcours = parcours
        self.unattachedScrutins = unattachedScrutins
    }
}

/// One step of the parcours.
public struct LoiActe: Identifiable, Hashable, Sendable {
    public let id: String
    public let parentID: String?
    public let depth: Int
    public let code: String
    public let label: String?
    /// Nil on a grouping node ("Travaux des commissions").
    public let date: Date?
    /// The AN's verbatim outcome on a decision acte ("adopté").
    public let outcome: String?
    public let scrutins: [LoiScrutin]
    public let amendementCount: Int
    public let articleCount: Int

    public init(
        id: String, parentID: String?, depth: Int, code: String, label: String?, date: Date?,
        outcome: String?, scrutins: [LoiScrutin], amendementCount: Int, articleCount: Int
    ) {
        self.id = id
        self.parentID = parentID
        self.depth = depth
        self.code = code
        self.label = label
        self.date = date
        self.outcome = outcome
        self.scrutins = scrutins
        self.amendementCount = amendementCount
        self.articleCount = articleCount
    }

    /// Whether anything was voted at this step, listed or counted.
    var hasVotes: Bool { !scrutins.isEmpty || amendementCount + articleCount > 0 }
}

/// A scrutin on the bill: a headline one on the page, or an amendment or
/// article vote on the amendments list.
public struct LoiScrutin: Identifiable, Hashable, Sendable {
    public let id: String
    public let title: String
    public let date: Date?
    public let result: String?
    public let votesFor: Int?
    public let votesAgainst: Int?
    public let abstentions: Int?

    public init(
        id: String, title: String, date: Date?, result: String?,
        votesFor: Int?, votesAgainst: Int?, abstentions: Int?
    ) {
        self.id = id
        self.title = title
        self.date = date
        self.result = result
        self.votesFor = votesFor
        self.votesAgainst = votesAgainst
        self.abstentions = abstentions
    }
}

/// The next séance item on the agenda for this bill.
public struct LoiNextSitting: Hashable, Sendable {
    public let start: Date
    /// "Suite de la discussion".
    public let pointType: String?

    public init(start: Date, pointType: String?) {
        self.start = start
        self.pointType = pointType
    }
}

/// Everything the bill page shows.
public struct LoiPage: Hashable, Sendable {
    public let loi: Loi
    public let nextSitting: LoiNextSitting?

    public init(loi: Loi, nextSitting: LoiNextSitting?) {
        self.loi = loi
        self.nextSitting = nextSitting
    }
}

/// The amendment and article scrutins of a bill, or of one acte.
public struct LoiAmendements: Hashable, Sendable {
    public let total: Int
    public let items: [LoiScrutin]

    public init(total: Int, items: [LoiScrutin]) {
        self.total = total
        self.items = items
    }
}

// MARK: - Display

/// A status in words, from `dossier_statuses.json`; an unknown value shows as sent.
enum LoiStatus {
    static func label(_ status: String) -> String {
        labels[status] ?? status
    }

    private static let labels: [String: String] = {
        let rows = (try? ReferenceData.dossierStatuses()) ?? []
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.status, $0.label) })
    }()
}

/// The four-step strip under a bill's title: Assemblée, Sénat, CMP, loi.
struct LoiStageStrip: Hashable {
    enum State: Hashable { case current, reached, upcoming }

    struct Step: Hashable, Identifiable {
        let id: String
        let title: String
        let state: State
        /// The latest stage of this step the bill reached ("2e lecture").
        let label: String?
    }

    static let steps = [("an", "AN"), ("senat", "Sénat"), ("cmp", "CMP"), ("loi", "Loi")]

    let steps: [Step]

    /// Nil when the current stage is not on the four steps (a debate, AN21):
    /// the strip would claim a position the bill does not have.
    init?(currentStage: String?, parcours: [LoiActe], stages: [ReferenceData.DossierStage] = Self.stages) {
        let byCode = Dictionary(uniqueKeysWithValues: stages.map { ($0.code, $0) })
        guard let currentStage, let current = byCode[currentStage] else { return nil }
        // The top-level actes, in parcours order: the stages the bill went through.
        let reached = parcours.filter { $0.depth == 0 }.compactMap { byCode[$0.code] }
        steps = Self.steps.map { id, title in
            let latest = reached.last { $0.step == id }
            let state: State = current.step == id ? .current : (latest != nil ? .reached : .upcoming)
            return Step(id: id, title: title, state: state, label: current.step == id ? current.label : latest?.label)
        }
    }

    static let stages: [ReferenceData.DossierStage] = (try? ReferenceData.dossierStages()) ?? []
}

/// One line of the parcours as the page draws it. A display grouping of
/// what the API returned, in its `ordinal` order; nothing is recomputed.
struct ParcoursSection: Hashable, Identifiable {
    /// The top-level stage ("1ère lecture (1ère assemblée saisie)"), or nil
    /// for actes listed before any stage.
    let stage: LoiActe?
    let rows: [ParcoursRow]

    var id: String { stage?.id ?? "start" }
}

enum ParcoursRow: Hashable, Identifiable {
    /// An undated grouping node ("Travaux des commissions").
    case group(LoiActe)
    /// A dated step; `repeats` holds the identical sibling steps folded into
    /// it (the seven "Réunion de commission" of one commission).
    case acte(LoiActe, repeats: [LoiActe])

    var id: String {
        switch self {
        case .group(let acte): acte.id
        case .acte(let acte, _): acte.id
        }
    }

    /// The acte the row is drawn from: the first one, when folded.
    var acte: LoiActe {
        switch self {
        case .group(let acte), .acte(let acte, _): acte
        }
    }
}

extension Loi {
    /// The parcours split into its top-level stages, with runs of identical
    /// steps that carry no vote folded into one row.
    var sections: [ParcoursSection] {
        var sections: [ParcoursSection] = []
        var stage: LoiActe?
        var rows: [ParcoursRow] = []

        func close() {
            if stage != nil || !rows.isEmpty {
                sections.append(ParcoursSection(stage: stage, rows: rows))
            }
        }

        for acte in parcours {
            if acte.depth == 0 {
                close()
                stage = acte
                rows = []
            } else if acte.date == nil {
                rows.append(.group(acte))
            } else if case .acte(let previous, let repeats)? = rows.last,
                      Self.folds(acte, into: previous) {
                rows[rows.count - 1] = .acte(previous, repeats: repeats + [acte])
            } else {
                rows.append(.acte(acte, repeats: []))
            }
        }
        close()
        return sections
    }

    /// Same parent, same kind of step, same wording, and no vote or outcome
    /// on either: the only difference left is the date.
    private static func folds(_ acte: LoiActe, into previous: LoiActe) -> Bool {
        acte.parentID == previous.parentID && acte.code == previous.code && acte.label == previous.label
            && !acte.hasVotes && !previous.hasVotes && acte.outcome == nil && previous.outcome == nil
    }
}

extension LoiActe {
    /// "62 amendements et 13 articles votés", or nil when none.
    var collapsedVotesLabel: String? {
        LoiActe.collapsedVotesLabel(amendements: amendementCount, articles: articleCount)
    }

    static func collapsedVotesLabel(amendements: Int, articles: Int) -> String? {
        let parts = [
            amendements > 0 ? "\(MonEluFormat.count(amendements)) amendement\(amendements > 1 ? "s" : "")" : nil,
            articles > 0 ? "\(MonEluFormat.count(articles)) article\(articles > 1 ? "s" : "")" : nil,
        ].compactMap { $0 }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " et ") + (amendements + articles > 1 ? " votés" : " voté")
    }
}
