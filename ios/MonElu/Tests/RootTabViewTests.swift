@testable import MonElu
import MonEluCore
import SwiftUI
import Testing

@MainActor
struct RootTabViewTests {
    @Test func rendersInAHostingController() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let controller = UIHostingController(rootView: RootTabView())
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        #expect(controller.view.subviews.isEmpty == false)
    }

    @Test func showsFiveTabs() {
        #expect(AppTab.allCases.count == 5)
    }
}
