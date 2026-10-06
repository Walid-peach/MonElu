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
        case .loi(let id):
            LoiScreen(id: id, service: services.lois)
        case .loiAmendements(let id, let acteID):
            LoiAmendementsScreen(id: id, acteID: acteID, service: services.lois)
        case .group(let slug):
            GroupScreen(slug: slug, service: services.groups)
        case .theme(let slug):
            ThemeScreen(slug: slug, service: services.themes)
        case .agenda:
            AgendaScreen(service: services.agenda)
        }
    }
}
