import Foundation
import MonEluUI
import Testing

@MainActor
struct CaveatNoteTests {
    /// A code span names a term of the data: strong emphasis, never monospace (#516).
    @Test func codeSpansAreEmphasizedNotMonospace() {
        let text = CaveatNote.attributed("Un `nonVotant` n'est pas une **abstention**.")
        let intents = text.runs.compactMap(\.inlinePresentationIntent)
        #expect(!intents.contains { $0.contains(.code) })
        let term = text.runs.first { String(text[$0.range].characters) == "nonVotant" }
        #expect(term?.inlinePresentationIntent?.contains(.stronglyEmphasized) == true)
        #expect(String(text.characters) == "Un nonVotant n'est pas une abstention.")
    }

    @Test func unparsableMarkdownIsPlainText() {
        #expect(String(CaveatNote.attributed("Sans balise").characters) == "Sans balise")
    }
}
