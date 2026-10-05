import MonEluCore
import MonEluFeatures
import MonEluUI
import SwiftUI

/// The screen for a route.
struct RouteDestination: View {
    let route: AppRoute
    let services: AppServices

    var body: some View {
        switch route {
        case .deputy(let id):
            DeputyProfileScreen(id: id, service: services.deputies)
        case .vote(let id):
            VoteDetailScreen(id: id, service: services.votes)
        case .agenda:
            AgendaScreen(service: services.agenda)
        }
    }
}
