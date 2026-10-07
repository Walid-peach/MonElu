import Foundation
import MonEluCore
@testable import MonEluFeatures
import Testing

/// Explorer's contents (#488): what the hub loads, and the bill and group
/// lists it reads.
@MainActor
struct ExploreTests {
    static func lois() -> LiveLoisService {
        LiveLoisService(client: operationClient(["listLois": try! fixture("lois_list")]))
    }

    static func groups() -> LiveGroupsService {
        LiveGroupsService(client: operationClient(["listGroups": try! fixture("groups_list")]))
    }

    @Test func mapsTheBills() async throws {
        let list = try await Self.lois().lois()
        #expect(list.total == 71)
        #expect(list.items.count == 3)
        let first = try #require(list.items.first)
        #expect(first.id == "DLR5L17N54776")
        #expect(first.status == "en_commission")
        #expect(first.lastVote != nil)
    }

    @Test func mapsTheGroupsLargestFirst() async throws {
        let groups = try await Self.groups().groups()
        #expect(groups.first == GroupSeats(slug: "rassemblement-national", name: "Rassemblement National", short: "RN", seats: 123))
        #expect(groups.map(\.seats) == groups.map(\.seats).sorted(by: >))
    }

    /// Every part comes from the API, and the user's département from the
    /// followed deputy's profile.
    @Test func theHubLoadsEveryPart() async throws {
        let hub = await ExploreHub.load(
            deputies: try LiveDeputiesServiceTests.service(), lois: Self.lois(), groups: Self.groups(),
            followedDeputyID: "PA1008"
        )
        #expect(hub.deputiesInMandate == 649)
        #expect(hub.loiCount == 71)
        #expect(hub.groups?.count == 6)
        #expect(hub.myDepartment == DepartmentRef(code: "33", name: "Gironde"))
    }

    /// A failing part leaves the rest; no followed deputy, no département.
    @Test func aFailedPartIsLeftOut() async {
        let hub = await ExploreHub.load(
            deputies: RecordingDeputiesService(), lois: StubLois(), groups: StubGroups(), followedDeputyID: nil
        )
        #expect(hub.deputiesInMandate == 0)
        #expect(hub.loiCount == nil)
        #expect(hub.groups == nil)
        #expect(hub.myDepartment == nil)
    }

    @Test func departmentsMatchByNameOrCode() {
        let all = [DepartmentRef(code: "33", name: "Gironde"), DepartmentRef(code: "974", name: "La Réunion")]
        #expect(DepartmentsListScreen.matching("reunion", in: all).map(\.code) == ["974"])
        #expect(DepartmentsListScreen.matching("33", in: all).map(\.code) == ["33"])
        #expect(DepartmentsListScreen.matching(" ", in: all).count == 2)
    }
}

/// Stubs that answer nothing, so their default implementations fail.
struct StubLois: LoisService {
    func loi(id: String) async throws -> Loi? { nil }
    func nextSitting(dossierID: String, after now: Date) async throws -> LoiNextSitting? { nil }
    func amendements(dossierID: String, acteID: String?) async throws -> LoiAmendements { throw URLError(.badServerResponse) }
}

struct StubGroups: GroupsService {
    func group(slug: String) async throws -> GroupPage? { nil }
}
