import Foundation
import OpenAPIRuntime

/// Reads every timestamp shape the API emits, which the runtime's default
/// ISO 8601 transcoder does not.
///
/// FastAPI serialises Python datetimes as they come out of Postgres: with `Z`
/// (`/agenda`), with `+00:00` (`/health`), with no zone at all (`voted_at`
/// on `/votes`), and with up to microsecond fractions. A timestamp without a
/// zone is read as UTC. Dates are always written back as UTC with `Z`.
public struct APIDateTranscoder: DateTranscoder {
    public init() {}

    struct InvalidDate: Error, CustomStringConvertible {
        let value: String
        var description: String { "Not an API timestamp: \(value)" }
    }

    public func encode(_ date: Date) throws -> String {
        date.formatted(.iso8601)
    }

    public func decode(_ string: String) throws -> Date {
        let pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/
        guard let match = string.wholeMatch(of: pattern),
              let year = Int(match.1), let month = Int(match.2), let day = Int(match.3),
              let hour = Int(match.4), let minute = Int(match.5), let second = Int(match.6)
        else { throw InvalidDate(value: string) }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let components = DateComponents(
            year: year, month: month, day: day, hour: hour, minute: minute, second: second
        )
        // DateComponents rolls 2026-02-31 over into March; refuse it instead.
        guard var date = calendar.date(from: components), calendar.component(.day, from: date) == day else {
            throw InvalidDate(value: string)
        }

        if let fraction = match.7, let value = Double("0" + fraction) {
            date += value
        }
        if let zone = match.8, zone != "Z" {
            let sign: Double = zone.hasPrefix("-") ? -1 : 1
            let parts = zone.dropFirst().split(separator: ":")
            guard let hours = Double(parts[0]), let minutes = Double(parts[1]) else {
                throw InvalidDate(value: string)
            }
            date -= sign * (hours * 3600 + minutes * 60)
        }
        return date
    }
}
