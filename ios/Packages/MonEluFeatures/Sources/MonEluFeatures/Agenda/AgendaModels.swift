import Foundation
import MonEluCore

/// One week of the séance publique agenda, as `GET /agenda` returns it.
public struct AgendaWeek: Hashable, Sendable {
    /// The window the API answered for, `YYYY-MM-DD`.
    public let from: String
    public let to: String
    public let days: [AgendaDay]

    public init(from: String, to: String, days: [AgendaDay]) {
        self.from = from
        self.to = to
        self.days = days
    }

    /// The themes this week's items carry, in the reference table's order
    /// (`themes.json`), then any the table does not know.
    var themes: [String] {
        let present = Set(days.flatMap(\.items).compactMap(\.theme))
        let known = AgendaWeek.referenceThemes.filter(present.contains)
        return known + present.subtracting(known).sorted()
    }

    /// The days with only the items of `theme`; all of them when nil.
    func filtered(theme: String?) -> [AgendaDay] {
        guard let theme else { return days }
        return days.compactMap { day in
            let items = day.items.filter { $0.theme == theme }
            return items.isEmpty ? nil : AgendaDay(date: day.date, items: items)
        }
    }

    static let referenceThemes = ((try? ReferenceData.themes()) ?? []).map(\.name)
}

/// One sitting day, `date` as the API grouped it (`YYYY-MM-DD`, Paris).
public struct AgendaDay: Hashable, Sendable, Identifiable {
    public let date: String
    public let items: [AgendaEntry]

    public var id: String { date }

    public init(date: String, items: [AgendaEntry]) {
        self.date = date
        self.items = items
    }
}

/// One point of the ordre du jour.
public struct AgendaEntry: Hashable, Sendable, Identifiable {
    public let id: String
    public let start: Date
    /// "Discussion", "Questions au Gouvernement".
    public let pointType: String?
    /// The plain-language one-liner; nil by design for a stub objet (ADR-030 §5).
    public let summary: String?
    /// The AN's official wording of the point.
    public let objet: String?
    public let theme: String?
    /// Set once a scrutin exists for the point's dossier, with its `result`.
    public let voteID: String?
    public let result: String?
    /// The official AN dossier page, when the point has a dossier.
    public let dossierURL: URL?
    /// The bill's short official title, when the API knows the dossier (#525).
    public let dossierTitle: String?

    public init(
        id: String, start: Date, pointType: String?, summary: String?, objet: String?, theme: String?,
        voteID: String?, result: String?, dossierURL: URL?, dossierTitle: String? = nil
    ) {
        self.id = id
        self.start = start
        self.pointType = pointType
        self.summary = summary
        self.objet = objet
        self.theme = theme
        self.voteID = voteID
        self.result = result
        self.dossierURL = dossierURL
        self.dossierTitle = dossierTitle
    }

    /// Design A's hierarchy (#525): the bill's short title leads, so a row
    /// names the text in two or three lines; without a dossier, the AN's
    /// wording of the point leads (a stub `objet` such as "Questions au
    /// Gouvernement" included, ADR-030 §5). The plain-language one-liner, when
    /// there is one, follows as the detail.
    var headline: (lead: String, detail: String?) {
        let title = dossierTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let summary = summary?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let objet = objet?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let lead = [title, objet, summary].first { !$0.isEmpty } ?? "Point inscrit à l'ordre du jour"
        return (lead, summary.isEmpty || summary == lead ? nil : summary)
    }

    /// The point type, unless it would repeat the headline ("Questions au
    /// Gouvernement" twice): `showsPointType` on the website.
    var pointTypeLabel: String? {
        guard let pointType = pointType?.trimmingCharacters(in: .whitespacesAndNewlines), !pointType.isEmpty,
              pointType.lowercased() != headline.lead.lowercased()
        else { return nil }
        return pointType
    }
}

/// An ISO week in Paris, counted from the current one.
struct AgendaWindow: Hashable {
    /// 0 is the current week, 1 the next, -1 the previous.
    let offset: Int
    let from: String
    let to: String

    init(offset: Int, now: Date) {
        let calendar = MonEluFormat.parisCalendar
        let monday = calendar.dateInterval(of: .weekOfYear, for: now)?.start ?? now
        let start = calendar.date(byAdding: .weekOfYear, value: offset, to: monday) ?? monday
        let end = calendar.date(byAdding: .day, value: 6, to: start) ?? start
        self.offset = offset
        from = MonEluFormat.isoDay(start)
        to = MonEluFormat.isoDay(end)
    }

    /// "Cette semaine", "Semaine prochaine", or nil further away.
    var relativeLabel: String? {
        switch offset {
        case 0: "Cette semaine"
        case 1: "Semaine prochaine"
        case -1: "Semaine dernière"
        default: nil
        }
    }
}
