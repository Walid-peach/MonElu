import Foundation
import MonEluAPI

/// The group page's data, behind a protocol so screens are tested with a stub.
public protocol GroupsService: Sendable {
    /// Nil for an unknown slug or a group with no sitting member (a 404).
    func group(slug: String) async throws -> GroupPage?
}

/// `GroupsService` on the generated client (`getGroup`).
public struct LiveGroupsService: GroupsService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func group(slug: String) async throws -> GroupPage? {
        let response = try await client.getGroup(path: .init(slug: slug))
        // A 404 is not in the spec, so the client reports it as undocumented.
        if case .undocumented(statusCode: 404, _) = response { return nil }
        return GroupPage(try response.ok.body.json)
    }
}

extension GroupPage {
    init(_ group: Components.Schemas.GroupDetail) {
        self.init(
            slug: group.slug,
            name: group.name,
            short: group.members.lazy.compactMap(\.partyShort).first,
            memberCount: group.memberCount,
            averagePresence: group.avgPresenceRate,
            averageDissidence: group.avgDissidentRate,
            members: group.members.map(GroupMember.init),
            mostDissident: (group.mostDissidentMembers ?? []).map(GroupMember.init),
            dividedVotes: (group.dividedVotes ?? []).map(GroupDividedVote.init)
        )
    }
}

extension GroupMember {
    init(_ member: Components.Schemas.GroupMember) {
        self.init(
            deputy: DeputyItem(
                id: member.deputyId, name: member.fullName, group: member.party, groupShort: member.partyShort,
                department: member.department, circonscription: member.circonscription,
                photoURL: member.photoUrl.flatMap(URL.init(string:))
            ),
            presenceRate: member.presenceRate,
            dissidentRate: member.dissidentRate
        )
    }
}

extension GroupDividedVote {
    init(_ vote: Components.Schemas.GroupVoteBreakdown) {
        self.init(
            id: vote.voteId, title: vote.voteTitle, date: vote.votedAt, result: vote.result,
            pour: vote.pour, contre: vote.contre, abstention: vote.abstention
        )
    }
}
