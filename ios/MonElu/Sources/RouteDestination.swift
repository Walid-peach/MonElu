import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI

/// The screen for a route. The deputy screen is a stub until the Députés tab
/// lands (#462).
struct RouteDestination: View {
    let route: AppRoute
    let services: AppServices

    var body: some View {
        switch route {
        case .deputy(let id):
            PlaceholderScreen(title: "Député \(id)", systemImage: "person.crop.circle")
                .navigationTitle("Député")
                .accessibilityIdentifier("route.deputy.\(id)")
        case .vote(let id):
            VoteDetailScreen(id: id, service: services.votes)
        }
    }
}
