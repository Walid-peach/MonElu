import Testing
@testable import MonEluFeatures

/// How a summary is labelled (#634): only one built from the official text may
/// say so, and a motion's sentence is written by code, not by AI.
struct SummaryLabelTests {
    @Test(arguments: [
        ("official_text", "summary_official_text", "Résumé IA"),
        ("procedure", "summary_procedure", "Procédure"),
    ])
    func aKnownBasisPicksItsOwnCaveatAndTag(_ basis: String, _ caveat: String, _ tag: String) {
        #expect(SummaryLabel.caveatID(basis) == caveat)
        #expect(SummaryLabel.tag(basis) == tag)
    }

    @Test func anUnlabeledSummaryFallsBackToTheGenericCaveat() {
        #expect(SummaryLabel.caveatID(nil) == "llm_generated")
        #expect(SummaryLabel.tag(nil) == "Résumé IA")
    }
}
