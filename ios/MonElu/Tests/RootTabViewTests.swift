@testable import MonElu
import MonEluCore
import MonEluFeatures
import SwiftUI
import Testing

/// Never reaches the network: the root view only needs a service to hold.
private struct NoVotes: VotesService {
    func votes(_ query: VoteQuery) async throws -> VotePage { VotePage(items: [], nextCursor: nil) }
    func vote(id: String) async throws -> VoteDetail { throw URLError(.badServerResponse) }
}

@MainActor
struct RootTabViewTests {
    @Test func rendersInAHostingController() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
        let controller = UIHostingController(rootView: RootTabView(services: AppServices(votes: NoVotes())))
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        #expect(controller.view.subviews.isEmpty == false)
    }

    @Test func showsFiveTabs() {
        #expect(AppTab.allCases.count == 5)
    }
}
