import MonEluCore
import MonEluUI
import SwiftUI

/// The screen for a route. Stubs until the deputy (#462) and vote (#460)
/// screens replace them; they exist so navigation can be built and tested
/// before any real screen.
struct RouteDestination: View {
    let route: AppRoute

    var body: some View {
        switch route {
        case .deputy(let id):
            PlaceholderScreen(title: "Député \(id)", systemImage: "person.crop.circle")
                .navigationTitle("Député")
                .accessibilityIdentifier("route.deputy.\(id)")
        case .vote(let id):
            PlaceholderScreen(title: "Scrutin \(id)", systemImage: "checkmark.seal")
                .navigationTitle("Scrutin")
                .accessibilityIdentifier("route.vote.\(id)")
        }
    }
}
