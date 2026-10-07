import Foundation
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import SnapshotTesting
import SwiftUI
import Testing

/// The département page in light and dark, at the default and an
/// accessibility text size (#486), from a response recorded from the
/// production API with one split vote.
@MainActor
@Suite(.snapshots(record: .missing))
struct DepartmentsSnapshotTests {
    @Test(arguments: Variant.all)
    func departmentPage(_ variant: Variant) async throws {
        let department = try await DepartmentsTests.page()
        checkSnapshot(
            NavigationStack {
                ScrollView { DepartmentContent(department: department).padding(.vertical, 16) }
                    .background(Palette.pageBackground)
            },
            variant,
            height: variant.size.isAccessibilityCategory ? 4300 : 1360
        )
    }
}
