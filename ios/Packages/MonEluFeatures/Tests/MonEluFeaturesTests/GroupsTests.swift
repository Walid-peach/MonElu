import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// The group page's mapping from a recorded response, its 404, the member
/// search and the slug lookup behind a deputy's group link (#484).
struct GroupsTests {
    static func page() async throws -> GroupPage {
        try #require(try await LiveGroupsService(client: stubClient(try fixture("group"))).group(slug: "lfi-nfp"))
    }

    @Test func mapsTheGroup() async throws {
        let group = try await Self.page()
        #expect(group.name == "La France insoumise - Nouveau Front Populaire")
        #expect(group.short == "LFI")
        #expect(group.memberCount == 71)
        #expect(group.seatRank == 3)
        #expect(group.countLine == "71 députés en mandat · 3e groupe de l'Assemblée")
        #expect(group.members.count == 3)
        #expect(group.mostDissident.first?.deputy.name == "Jean-Philippe Nilor")
        #expect(group.mostDissident.first?.dissidentRate == 0.0863)
        let vote = try #require(group.dividedVotes.first)
        #expect((vote.pour, vote.contre, vote.abstention) == (9, 10, 0))
        #expect(vote.result == "rejeté")
    }

    @Test func anUnknownGroupIsNil() async throws {
        let service = LiveGroupsService(client: stubClient(Data(#"{"detail":"Not found"}"#.utf8), status: .notFound))
        #expect(try await service.group(slug: "inconnu") == nil)
    }

    /// Case and accents do not matter: "eric" finds "Éric".
    @Test func memberSearchIgnoresCaseAndAccents() async throws {
        let group = try await Self.page()
        let names = group.members.map(\.deputy.name)
        let first = try #require(names.first)
        let query = String(first.split(separator: " ").last ?? "").lowercased()
        #expect(group.members(matching: query).map(\.deputy.name).contains(first))
        #expect(group.members(matching: "  ").count == names.count)
        #expect(group.members(matching: "zzzz").isEmpty)
        let eric = GroupPage(
            slug: "x", name: "x", short: nil, memberCount: 1, averagePresence: nil, averageDissidence: nil,
            members: [GroupMember(
                deputy: DeputyItem(
                    id: "PA1", name: "Éric Coquerel", group: nil, groupShort: nil,
                    department: nil, circonscription: nil, photoURL: nil
                ),
                presenceRate: nil, dissidentRate: nil
            )],
            mostDissident: [], dividedVotes: []
        )
        #expect(eric.members(matching: "eric").count == 1)
    }

    /// A deputy's `party` names the group as `groups.json` does.
    @Test func groupSlugsComeFromTheReferenceTable() {
        #expect(ReferenceData.groupSlug(named: "La France insoumise - Nouveau Front Populaire") == "lfi-nfp")
        #expect(ReferenceData.groupSlug(named: "Rassemblement National") == "rassemblement-national")
        #expect(ReferenceData.groupSlug(named: "Groupe inconnu") == nil)
        #expect(ReferenceData.groupSlug(named: nil) == nil)
    }
}
