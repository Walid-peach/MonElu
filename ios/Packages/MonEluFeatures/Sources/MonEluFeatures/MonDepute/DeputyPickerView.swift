import MonEluUI
import SwiftUI

/// The address and postal-code search, with the bar that follows the chosen
/// deputy: what Accueil shows while the user adds a deputy, and what the 2027
/// tab shows in a sheet when none is followed yet.
struct DeputyPickerView: View {
    @Bindable var model: MonDeputeModel

    var body: some View {
        ScrollView {
            PostalCodePickerContent(
                address: $model.address,
                addressSearch: model.addressSearch,
                postalCode: $model.postalCode,
                search: model.search,
                notice: model.notice,
                selection: model.selection,
                onPickAddress: { suggestion in Task { await model.pick(suggestion) } },
                onAbroad: { Task { await model.showAbroad() } },
                onSearch: { Task { await model.runSearch() } },
                onSelect: { model.select($0) }
            )
            // Suggestions follow the typing, a beat after the last key.
            .task(id: model.address) {
                guard (try? await Task.sleep(for: .milliseconds(250))) != nil else { return }
                await model.suggestAddresses()
            }
            .padding(Spacing.m)
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let selection = model.selection {
                FollowSelectionBar(deputy: selection) { model.followSelection() }
            }
        }
    }
}
