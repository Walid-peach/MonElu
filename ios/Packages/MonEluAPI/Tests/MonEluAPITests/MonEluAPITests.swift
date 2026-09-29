import MonEluAPI
import Testing

struct MonEluAPITests {
    @Test func moduleLinks() {
        #expect(MonEluAPI.moduleName == "MonEluAPI")
    }
}
