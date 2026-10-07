import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The département page's mapping from a recorded response, its 404 and the
/// name lookup behind a deputy's constituency link (#486).
struct DepartmentsTests {
    static func page() async throws -> DepartmentPage {
        try #require(try await LiveDepartmentsService(client: stubClient(try fixture("department_page"))).department(code: "33"))
    }

    @Test func mapsTheDepartment() async throws {
        let department = try await Self.page()
        #expect(department.name == "Gironde")
        #expect(department.deputies.count == department.deputyCount)
        // By circonscription, whatever the API's order.
        let seats = department.deputies.compactMap { $0.deputy.circonscription.flatMap(Int.init) }
        #expect(seats == seats.sorted())
        #expect(department.deputies.first?.seatLabel == "1re")
        #expect(department.splitVotes.count == 1)
    }

    /// Each group's short label comes from the département's own deputies.
    @Test func compositionTakesShortLabelsFromTheDeputies() async throws {
        let department = try await Self.page()
        let byGroup = Dictionary(department.deputies.compactMap { d in d.deputy.group.map { ($0, d.deputy.groupShort) } }, uniquingKeysWith: { a, _ in a })
        for entry in department.composition {
            #expect(entry.short == entry.group.flatMap { byGroup[$0] ?? nil })
        }
        #expect(department.composition.reduce(0) { $0 + $1.count } == department.deputyCount)
    }

    @Test func anUnknownDepartmentIsNil() async throws {
        let service = LiveDepartmentsService(client: stubClient(Data(#"{"detail":"Not found"}"#.utf8), status: .notFound))
        #expect(try await service.department(code: "00") == nil)
    }

    @Test func departmentCodesComeFromTheReferenceTable() {
        #expect(ReferenceData.departmentCode(named: "Gironde") == "33")
        #expect(ReferenceData.departmentCode(named: "Corse-du-Sud") == "2A")
        #expect(ReferenceData.departmentCode(named: "Nulle part") == nil)
    }
}
