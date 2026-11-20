import Foundation
import MonEluCore

/// What the 2027 tab says about dates, from `GET /app/config`'s election block.
/// The API derives every date; this only words them, and never invents one
/// the API did not send (#718).
public enum ElectionCalendar {
    /// Whole days from `today` to the first round, in Paris time; nil while the
    /// date is unknown, malformed or already past.
    public static func daysUntilFirstRound(_ election: AppConfiguration.Election, today: Date) -> Int? {
        guard let string = election.firstRoundDate, let first = MonEluFormat.calendarDate(string) else { return nil }
        let calendar = MonEluFormat.parisCalendar
        let days = calendar.dateComponents(
            [.day], from: calendar.startOfDay(for: today), to: calendar.startOfDay(for: first)
        ).day
        guard let days, days >= 0 else { return nil }
        return days
    }

    /// The big figure of the hero: "J-412", "Aujourd'hui", or the month while
    /// the date is unknown.
    public static func headline(_ election: AppConfiguration.Election, today: Date) -> String {
        guard let days = daysUntilFirstRound(election, today: today) else { return election.firstRoundLabel }
        return days == 0 ? "Aujourd'hui" : "J-\(days)"
    }

    /// The sentence under the headline.
    public static func caption(_ election: AppConfiguration.Election, today: Date) -> String {
        guard daysUntilFirstRound(election, today: today) != nil,
              let string = election.firstRoundDate, let first = MonEluFormat.calendarDate(string)
        else { return "Premier tour. Date exacte fixée par décret." }
        return "jusqu'au 1er tour, le \(MonEluFormat.fullDay(first).lowercased())."
    }

    /// One step of the calendar timeline.
    public struct Step: Hashable, Sendable, Identifiable {
        public var id: String { title }
        public let when: String
        public let title: String
        public let note: String
    }

    public static func steps(_ election: AppConfiguration.Election) -> [Step] {
        [
            Step(
                when: date(election.registrationDeadline).map { "Jusqu'au \($0.lowercased())" }
                    ?? "Jusqu'au 6e vendredi avant le 1er tour",
                title: "Inscription sur les listes",
                note: "En ligne, en mairie ou par courrier."
            ),
            Step(
                when: date(election.firstRoundDate) ?? election.firstRoundLabel.capitalizingFirstLetter,
                title: "Premier tour",
                note: election.firstRoundDate == nil
                    ? "La date exacte sera fixée par décret." : "Parmi tous les candidats."
            ),
            Step(
                when: date(election.secondRoundDate) ?? "Deux semaines après",
                title: "Second tour",
                note: "Entre les deux candidats arrivés en tête."
            ),
        ]
    }

    private static func date(_ string: String?) -> String? {
        string.flatMap(MonEluFormat.calendarDate).map(MonEluFormat.fullDay)
    }
}
