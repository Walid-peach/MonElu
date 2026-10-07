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

    public init(service: any AskService) {
        _model = State(initialValue: AskModel(service: service, features: AppConfiguration.defaults.features))
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
        .navigationTitle("Demander")
        .accessibilityIdentifier("screen.ask")
        .onAppear { model.features = configuration.features }
        .onChange(of: configuration.features) { model.features = $1 }
        .sheet(item: $model.sharedLink) { link in
            ActivitySheet(url: link.url)
                .presentationDetents([.medium, .large])
        }
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
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
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
                .padding(16)
                Color.clear.frame(height: 1).id("end")
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.exchanges.count) { withAnimation { proxy.scrollTo("end") } }
            .safeAreaInset(edge: .bottom, spacing: 0) { input }
        }
    }

    /// The composer, pinned above the tab bar.
    private var input: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField(
                model.effectiveMode == .claim ? "Collez une affirmation à vérifier…" : "Posez une question sur vos élus…",
                text: $model.draft, axis: .vertical
            )
            .lineLimit(1...5)
            .focused($inputFocused)
            .padding(.vertical, 10)
            .padding(.leading, 12)
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
        .padding(4)
        .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
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
