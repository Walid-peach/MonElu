import Foundation
import MonEluAPI

/// The département page's data, behind a protocol so screens are tested with a stub.
public protocol DepartmentsService: Sendable {
    /// Nil for an unknown code (a 404).
    func department(code: String) async throws -> DepartmentPage?
}

/// `DepartmentsService` on the generated client (`getDepartment`).
public struct LiveDepartmentsService: DepartmentsService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func department(code: String) async throws -> DepartmentPage? {
        let response = try await client.getDepartment(path: .init(code: code))
        // A 404 is not in the spec, so the client reports it as undocumented.
        if case .undocumented(statusCode: 404, _) = response { return nil }
        return DepartmentPage(try response.ok.body.json)
    }
}

extension DepartmentPage {
    init(_ department: Components.Schemas.DepartmentDetail) {
        let shorts = Dictionary(
            department.deputies.compactMap { deputy in deputy.party.map { ($0, deputy.partyShort) } },
            uniquingKeysWith: { first, _ in first }
        )
        self.init(
            code: department.code,
            name: department.name,
            deputyCount: department.deputyCount,
            composition: department.partyDistribution.map {
                DepartmentGroupCount(group: $0.party, short: $0.party.flatMap { shorts[$0] ?? nil }, count: $0.count)
            },
            deputies: department.deputies
                .map { deputy in
                    DepartmentDeputy(
                        deputy: DeputyItem(
                            id: deputy.deputyId, name: deputy.fullName, group: deputy.party,
                            groupShort: deputy.partyShort, department: deputy.department,
                            circonscription: deputy.circonscription,
                            photoURL: deputy.photoUrl.flatMap(URL.init(string:))
                        ),
                        solennelRate: deputy.solennelParticipationRate
                    )
                }
                .sorted { ($0.seat, $0.deputy.name) < ($1.seat, $1.deputy.name) },
            splitVotes: department.splitVotes.map {
                GroupDividedVote(
                    id: $0.voteId, title: $0.voteTitle, date: $0.votedAt, result: $0.result,
                    pour: $0.pour, contre: $0.contre, abstention: $0.abstention
                )
            }
        )
    }
}
