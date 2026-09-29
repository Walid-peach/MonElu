import MonEluUI
import Testing

@MainActor
struct PlaceholderScreenTests {
    @Test func keepsTitleAndSymbol() {
        let screen = PlaceholderScreen(title: "Votes", systemImage: "checkmark.seal")
        #expect(screen.title == "Votes")
        #expect(screen.systemImage == "checkmark.seal")
        _ = screen.body
    }
}
