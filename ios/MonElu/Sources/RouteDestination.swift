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
            DeputyProfileScreen(id: id, service: services.deputies, followedDeputy: services.followedDeputy)
        case .vote(let id):
            VoteDetailScreen(id: id, service: services.votes, followedDeputyID: services.followedDeputy.deputyID)
        case .loi(let id):
            LoiScreen(id: id, service: services.lois)
        case .loiAmendements(let id, let acteID):
            LoiAmendementsScreen(id: id, acteID: acteID, service: services.lois)
        case .group(let slug):
            GroupScreen(slug: slug, service: services.groups)
        case .theme(let slug):
            ThemeScreen(slug: slug, service: services.themes)
        case .department(let code):
            DepartmentScreen(code: code, service: services.departments)
        case .compare(let deputyID):
            CompareScreen(deputyID: deputyID, deputies: services.deputies, compare: services.compare)
        case .dissidentVotes(let deputyID):
            DissidentVotesScreen(deputyID: deputyID, service: services.deputies)
        case .agenda:
            AgendaScreen(service: services.agenda)
        case .votes:
            VotesListScreen(service: services.votes)
        case .deputies:
            DeputiesListScreen(service: services.deputies, followedDeputyID: services.followedDeputy.deputyID)
        case .lois:
            LoisListScreen(service: services.lois)
        case .settings:
            SettingsScreen(version: AppEnvironment.displayVersion)
        case .departments:
            DepartmentsListScreen(deputies: services.deputies, followedDeputyID: services.followedDeputy.deputyID)
        }
    }
}
