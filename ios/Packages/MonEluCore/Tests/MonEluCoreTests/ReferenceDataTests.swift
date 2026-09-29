import MonEluCore
import Testing

/// The bundled tables are data/reference/*.json itself (a symlink), so these
/// check that the app can decode what the API exports.
struct ReferenceDataTests {
    @Test func departmentsDecodeWithUniqueCodes() throws {
        let departments = try ReferenceData.departments()
        #expect(departments.count > 100)
        #expect(Set(departments.map(\.code)).count == departments.count)
        #expect(departments.first?.code == "01")
        #expect(departments.first?.name == "Ain")
    }

    @Test func groupsDecodeWithUniqueSlugs() throws {
        let groups = try ReferenceData.groups()
        #expect(groups.count == 12)
        #expect(Set(groups.map(\.slug)).count == groups.count)
    }

    @Test func themesDecode() throws {
        let themes = try ReferenceData.themes()
        #expect(themes.count == 10)
        #expect(themes.allSatisfy { !$0.name.isEmpty })
    }

    @Test func votePositionsMatchTheAPIKeys() throws {
        #expect(try ReferenceData.votePositions().map(\.key) == ["pour", "contre", "abstention", "nonVotant"])
    }
}
