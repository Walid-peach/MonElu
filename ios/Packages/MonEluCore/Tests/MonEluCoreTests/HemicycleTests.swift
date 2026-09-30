import Foundation
import MonEluCore
import Testing

/// The Swift layout against the golden fixture `hemicycle.ts` produces
/// (`frontend/scripts/hemicycle-fixture.ts`, #461). A failure here after the
/// fixture was regenerated means the port no longer matches the website.
struct HemicycleTests {
    struct Fixture: Decodable {
        struct Case: Decodable {
            struct Deputy: Decodable {
                let deputy_id: String
                let full_name: String
                let party: String?
                let position: String?
            }

            struct Seat: Decodable {
                let deputy_id: String
                let position: String
                let x: Double
                let y: Double
                let ring: Int
            }

            struct Arc: Decodable {
                let group: String
                let seatCount: Int
                let counts: [String: Int]
                let startAngle: Double
                let endAngle: Double
            }

            let name: String
            let deputies: [Deputy]
            let seats: [Seat]
            let arcs: [Arc]
        }

        let cases: [Case]
    }

    static let fixture: Fixture = {
        let url = Bundle.module.url(forResource: "hemicycle", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }()

    static let caseNames = ["empty", "single", "small", "medium", "chamber"]

    private func input(_ fixtureCase: Fixture.Case) -> [Hemicycle.Deputy] {
        fixtureCase.deputies.map {
            Hemicycle.Deputy(id: $0.deputy_id, name: $0.full_name, group: $0.party, position: $0.position)
        }
    }

    @Test func fixtureHasEveryCase() {
        #expect(Self.fixture.cases.map(\.name) == Self.caseNames)
        #expect(Self.fixture.cases.last?.seats.count == 577)
    }

    @Test(arguments: caseNames)
    func seatsMatchTheWebsite(_ name: String) throws {
        let fixtureCase = try #require(Self.fixture.cases.first { $0.name == name })
        let seats = Hemicycle.layoutSeats(input(fixtureCase))
        #expect(seats.count == fixtureCase.seats.count)
        for (seat, expected) in zip(seats, fixtureCase.seats) {
            #expect(seat.deputy.id == expected.deputy_id)
            #expect(seat.position.rawValue == expected.position)
            #expect(seat.ring == expected.ring)
            #expect(abs(seat.x - expected.x) < 0.01, "x of \(expected.deputy_id)")
            #expect(abs(seat.y - expected.y) < 0.01, "y of \(expected.deputy_id)")
        }
    }

    @Test(arguments: caseNames)
    func arcsMatchTheWebsite(_ name: String) throws {
        let fixtureCase = try #require(Self.fixture.cases.first { $0.name == name })
        let arcs = Hemicycle.groupArcs(input(fixtureCase))
        #expect(arcs.map(\.group) == fixtureCase.arcs.map(\.group))
        for (arc, expected) in zip(arcs, fixtureCase.arcs) {
            #expect(arc.seatCount == expected.seatCount)
            #expect(abs(arc.startAngle - expected.startAngle) < 0.000_001)
            #expect(abs(arc.endAngle - expected.endAngle) < 0.000_001)
            for position in Hemicycle.SeatPosition.allCases {
                #expect(arc.counts[position] == expected.counts[position.rawValue], "\(expected.group) \(position)")
            }
        }
    }

    @Test func unknownPositionsAreAbsent() {
        #expect(Hemicycle.SeatPosition("pour") == .pour)
        #expect(Hemicycle.SeatPosition("excusé") == .absent)
        #expect(Hemicycle.SeatPosition(nil) == .absent)
    }
}
