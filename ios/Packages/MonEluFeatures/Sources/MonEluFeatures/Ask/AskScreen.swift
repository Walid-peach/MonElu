import MonEluCore
import MonEluUI
import SwiftUI
import UIKit

/// The Demander tab (web: `/chat`): a question about the Assemblée, an answer
/// with its sources, and a nudge to verify a claim (ADR-023, ADR-024).
public struct AskScreen: View {
    @State private var model: AskModel
    @Environment(\.appConfiguration) private var configuration
    @FocusState private var inputFocused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    private let pendingClaim: PendingClaim

    public init(service: any AskService, pendingClaim: PendingClaim = PendingClaim()) {
        _model = State(initialValue: AskModel(service: service, features: AppConfiguration.defaults.features))
        self.pendingClaim = pendingClaim
    }

    public var body: some View {
        Group {
            if configuration.features.chat {
                conversation
            } else {
                AskUnavailable()
            }
        }
        .background(Palette.pageBackground)
        // Opens on the mode and the conversation (#657).
        .tabRootTitle("Demander")
        .accessibilityIdentifier("screen.ask")
        .onAppear {
            model.features = configuration.features
            verifyPendingClaim()
        }
        .onChange(of: configuration.features) { model.features = $1 }

        .sheet(item: $model.sharedLink) { link in
            ActivitySheet(url: link.url)
                .presentationDetents([.medium, .large])
        }
    }

    /// Verifies the claim the 2027 tab handed over, in this tab's own verify
    /// mode, so there is one place that shows a verdict (#718). Ignored while
    /// verification is switched off.
    private func verifyPendingClaim() {
        guard configuration.features.verify, !model.isWaiting, let claim = pendingClaim.take() else { return }
        model.mode = .claim
        model.draft = claim
        Task { await model.send() }
    }

    private var conversation: some View {
        // The mode sits above the conversation rather than in a top inset,
        // which would leave the large title blank (#477).
        VStack(spacing: 0) {
            if configuration.features.verify {
                // A segment cannot wrap: at large text the claim mode keeps
                // its full name for VoiceOver only.
                Picker("Mode", selection: $model.mode) {
                    ForEach(AskModel.Mode.allCases, id: \.self) { mode in
                        Text(typeSize.isAccessibilitySize ? mode.shortTitle : mode.title)
                            .accessibilityLabel(mode.title)
                            .tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, Spacing.m)
                .padding(.vertical, Spacing.xs)
                .accessibilityIdentifier("ask.mode")
            }
            thread
        }
        .toolbar {
            if !model.exchanges.isEmpty {
                ToolbarItem(placement: .primaryAction) {
                    Button { model.clear() } label: { Label("Nouvelle conversation", systemImage: "plus") }
                        .disabled(model.isWaiting)
                        .accessibilityIdentifier("ask.new")
                }
            }
        }
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                AskConversation(
                    exchanges: model.exchanges, mode: model.effectiveMode,
                    offersVerification: { model.offersVerification($0) },
                    canRetry: { model.canRetry($0) },
                    onRetry: { id in Task { await model.retry(id) } },
                    onVerify: { id in Task { await model.verify(id) } },
                    onShare: { id in Task { await model.share(id) } },
                    onFeedback: { vote, id in Task { await model.sendFeedback(vote, on: id) } }
                )
                .padding(Spacing.m)
                Color.clear.frame(height: 1).id("end")
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.exchanges.count) { withAnimation { proxy.scrollTo("end") } }
            .safeAreaInset(edge: .bottom, spacing: 0) { input }
        }
    }

    /// The composer, pinned above the tab bar.
    private var input: some View {
        HStack(alignment: .bottom, spacing: Spacing.xs) {
            TextField(
                model.effectiveMode == .claim ? "Collez une affirmation à vérifier…" : "Posez une question sur vos élus…",
                text: $model.draft, axis: .vertical
            )
            .lineLimit(1...5)
            .focused($inputFocused)
            .padding(.vertical, Spacing.s)
            .padding(.leading, Spacing.s)
            .accessibilityIdentifier("ask.input")
            Button {
                inputFocused = false
                Task { await model.send() }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.bold))
                    .foregroundStyle(Palette.onAccent)
                    .frame(width: 40, height: 40)
                    .background(Palette.accent, in: Circle())
                    .opacity(model.canSend ? 1 : 0.4)
            }
            .buttonStyle(.plain)
            .disabled(!model.canSend)
            .accessibilityLabel(model.effectiveMode == .claim ? "Vérifier l'affirmation" : "Envoyer la question")
            .accessibilityIdentifier("ask.send")
        }
        .padding(Spacing.xxs)
        .surface(radius: Radius.large)
        .padding(.horizontal, Spacing.m)
        .padding(.vertical, Spacing.xs)
        .background(Palette.pageBackground)
    }
}

/// The conversation, separate from the screen so it can be snapshot-tested
/// without a network.
struct AskConversation: View {
    let exchanges: [ChatExchange]
    var mode: AskModel.Mode = .question
    let offersVerification: (ChatExchange) -> Bool
    var canRetry: (ChatExchange) -> Bool = { _ in true }
    let onRetry: (Int) -> Void
    let onVerify: (Int) -> Void
    let onShare: (Int) -> Void
    let onFeedback: (ChatFeedback, Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            if exchanges.isEmpty { AskIntro(mode: mode) }
            ForEach(exchanges) { exchange in
                ExchangeView(
                    exchange: exchange,
                    offersVerification: offersVerification(exchange),
                    canRetry: canRetry(exchange),
                    onRetry: { onRetry(exchange.id) },
                    onVerify: { onVerify(exchange.id) },
                    onShare: { onShare(exchange.id) },
                    onFeedback: { onFeedback($0, exchange.id) }
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The system share sheet, for a URL the API returned.
struct ActivitySheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
