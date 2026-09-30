import MonEluCore
import SwiftUI

/// Renders a `Loader`: loading, empty, offline or error, or the content.
///
/// Every Phase 2 screen puts its data through this view rather than calling
/// the API itself (#459). It starts the first load, retries from the failure
/// state, and wires pull-to-refresh to `Loader.refresh()`; the content must be
/// scrollable (a `List` or `ScrollView`) for the pull gesture to appear.
public struct LoadStateView<Value: Sendable, Content: View>: View {
    let loader: Loader<Value>
    let empty: EmptyStateView
    let content: (Value) -> Content

    public init(
        _ loader: Loader<Value>,
        empty: EmptyStateView,
        @ViewBuilder content: @escaping (Value) -> Content
    ) {
        self.loader = loader
        self.empty = empty
        self.content = content
    }

    public var body: some View {
        Group {
            switch loader.state {
            case .idle, .loading:
                LoadingStateView()
            case .empty:
                empty
            case .failed(let failure):
                FailureStateView(failure: failure) { await loader.load() }
            case .loaded(let value):
                VStack(spacing: 0) {
                    if let failure = loader.refreshFailure {
                        RefreshFailureBanner(failure: failure)
                    }
                    content(value)
                }
                .refreshable { await loader.refresh() }
            }
        }
        .background(Palette.pageBackground)
        .task { await loader.loadIfNeeded() }
    }
}
