@testable import MonEluUI
import MonEluCore
import Testing
import UIKit

struct VotePositionBadgeTests {
    @Test func labelsComeFromTheBundledReferenceTable() throws {
        for row in try ReferenceData.votePositions() {
            #expect(VotePositionBadge.label(row.key) == row.label)
        }
        #expect(VotePositionBadge.label("nonVotant") == "Non votant")
    }

    @Test func unknownPositionShowsItsRawKey() {
        #expect(VotePositionBadge.label("absent") == "absent")
    }

    @Test func fontIsRegistered() {
        Typography.registerFonts()
        #expect(UIFont(name: Typography.headingFace, size: 17) != nil)
    }
}
