import MonEluCore
import SwiftUI

/// Renders a `Loader`: loading, empty, offline or error, or the content.
///
/// Every Phase 2 screen puts its data through this view rather than calling
/// the API itself (#459). It starts the first load, retries from the failure
/// state, and wires pull-to-refresh to `Loader.refresh()`; the content must be
/// scrollable (a `List` or `ScrollView`) for the pull gesture to appear.
///
/// A screen that gives a `placeholder` shows it, under `.skeleton()`, once a
/// first load has run for `LoadingIndicator.revealDelay`, and nothing before
/// (#697, the website's MON-207 policy); one that gives none keeps the spinner.
/// Build the placeholder from the screen's own content view over placeholder
/// models, so it has the page's shape.
public struct LoadStateView<Value: Sendable, Content: View, Placeholder: View>: View {
    let loader: Loader<Value>
    let empty: EmptyStateView
    let placeholder: Placeholder?
    let content: (Value) -> Content

    public init(
        _ loader: Loader<Value>,
        empty: EmptyStateView,
        @ViewBuilder content: @escaping (Value) -> Content
    ) where Placeholder == EmptyView {
        self.loader = loader
        self.empty = empty
        self.placeholder = nil
        self.content = content
    }

    public init(
        _ loader: Loader<Value>,
        empty: EmptyStateView,
        @ViewBuilder placeholder: () -> Placeholder,
        @ViewBuilder content: @escaping (Value) -> Content
    ) {
        self.loader = loader
        self.empty = empty
        self.placeholder = placeholder()
        self.content = content
    }

    public var body: some View {
        Group {
            switch loader.state {
            case .idle, .loading:
                LoadingIndicatorView(placeholder: placeholder)
            case .empty:
                // Scrollable so pull-to-refresh works on an empty screen too:
                // it has no retry button, and what was empty may not stay so.
                GeometryReader { proxy in
                    ScrollView {
                        empty.frame(minHeight: proxy.size.height)
                    }
                    .refreshable { await loader.load() }
                }
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

/// The loading state: the spinner, or the placeholder after its delay. A view
/// of its own so the delay starts again with each load that shows it.
struct LoadingIndicatorView<Placeholder: View>: View {
    let placeholder: Placeholder?
    @State private var delayElapsed = false

    var body: some View {
        switch LoadingIndicator.shown(hasPlaceholder: placeholder != nil, delayElapsed: delayElapsed) {
        case .spinner:
            LoadingStateView()
        case .none:
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .task {
                    try? await Task.sleep(for: LoadingIndicator.revealDelay)
                    if !Task.isCancelled { delayElapsed = true }
                }
        case .placeholder:
            placeholder?.skeleton()
        }
    }
}
