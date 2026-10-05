import MonEluCore
@testable import MonEluUI
import SwiftUI
import Testing

/// What VoiceOver hears from the vote bar, and which groups get a color.
struct DesignAComponentTests {
    @Test func voteSplitBarReadsTheCounts() {
        #expect(VoteSplitBar(pour: 80, contre: 24, abstention: 24).accessibilityText == "80 pour, 24 contre, 24 abstentions")
    }

    @Test func voteSplitBarUsesTheSingularForZeroAndOne() {
        #expect(VoteSplitBar(pour: 1, contre: 0, abstention: 1).accessibilityText == "1 pour, 0 contre, 1 abstention")
        #expect(VoteSplitBar(pour: 0, contre: 0, abstention: 0).accessibilityText == "0 pour, 0 contre, 0 abstention")
    }

    @Test func voteSplitBarNamesNonVotantsOnlyWhenThereAreAny() {
        #expect(VoteSplitBar(pour: 24, contre: 0, abstention: 0, nonVotant: 1).accessibilityText == "24 pour, 0 contre, 0 abstention, 1 non-votant")
        #expect(VoteSplitBar(pour: 2127, contre: 0, abstention: 0, nonVotant: 3).accessibilityText == "\(MonEluFormat.count(2127)) pour, 0 contre, 0 abstention, 3 non-votants")
    }

    /// `partyColor()` on the website colors these eight groups and leaves
    /// the rest neutral.
    @Test func partyColorsCoverTheWebsitesGroups() {
        #expect(Palette.coloredParties == ["RN", "EPR", "LFI", "SOC", "DR", "ECS", "DEM", "HOR"])
    }
}
