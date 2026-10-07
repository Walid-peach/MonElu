import MonEluCore
import MonEluUI
import SwiftUI

/// Every département (#488, Explorer), from the bundled table, the user's
/// own first, each opening its deputies.
public struct DepartmentsListScreen: View {
    let deputies: any DeputiesService
    let followedDeputyID: String?
    @State private var mine: DepartmentRef?
    @State private var search = ""

    public init(deputies: any DeputiesService, followedDeputyID: String?) {
        self.deputies = deputies
        self.followedDeputyID = followedDeputyID
    }

    public var body: some View {
        DepartmentsList(
            departments: Self.matching(search, in: Self.all),
            mine: search.isEmpty ? mine : nil
        )
        .background(Palette.pageBackground)
        .navigationTitle("Départements")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "Nom ou numéro")
        .autocorrectionDisabled()
        .task { mine = await ExploreHub.myDepartment(deputies: deputies, followedDeputyID: followedDeputyID) }
        .accessibilityIdentifier("screen.departments")
    }

    static let all: [DepartmentRef] = ((try? ReferenceData.departments()) ?? []).map {
        DepartmentRef(code: $0.code, name: $0.name)
    }

    /// Those whose name or code contains the search, accents and case aside.
    static func matching(_ search: String, in departments: [DepartmentRef]) -> [DepartmentRef] {
        let query = search.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return departments }
        let options: String.CompareOptions = [.caseInsensitive, .diacriticInsensitive]
        return departments.filter {
            $0.name.range(of: query, options: options) != nil || $0.code.range(of: query, options: options) != nil
        }
    }
}

/// The list, separate from the screen so it can be snapshot-tested.
struct DepartmentsList: View {
    let departments: [DepartmentRef]
    var mine: DepartmentRef?

    var body: some View {
        List {
            if let mine {
                Section("Votre département") { row(mine) }
            }
            Section {
                ForEach(departments) { row($0) }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .overlay {
            if departments.isEmpty {
                EmptyStateView(title: "Aucun département", message: "Aucun département ne correspond.", systemImage: "map")
            }
        }
    }

    private func row(_ department: DepartmentRef) -> some View {
        NavigationLink(value: AppRoute.department(code: department.code)) {
            HStack(spacing: 12) {
                Text(department.code)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(Palette.textSecondary)
                    .frame(minWidth: 32, alignment: .leading)
                Text(department.name)
                    .foregroundStyle(Palette.textPrimary)
            }
        }
        .listRowBackground(Palette.cardBackground)
        .accessibilityIdentifier("department.row")
    }
}
