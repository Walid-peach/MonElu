import MonEluAccount
import Testing

struct MonEluAccountTests {
    @Test func moduleLinks() {
        #expect(MonEluAccount.moduleName == "MonEluAccount")
    }
}
