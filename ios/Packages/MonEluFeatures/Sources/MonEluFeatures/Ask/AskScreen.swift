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
        ScrollViewReader { proxy in
            ScrollView {
                AskConversation(
                    exchanges: model.exchanges,
                    offersVerification: { model.offersVerification($0) },
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

    private var input: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Posez une question sur vos élus…", text: $model.draft, axis: .vertical)
                .lineLimit(1...5)
                .focused($inputFocused)
                .padding(10)
                .background(Palette.cardBackground, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Palette.border, lineWidth: 1))
                .accessibilityIdentifier("ask.input")
            Button {
                inputFocused = false
                Task { await model.send() }
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title)
            }
            .tint(Palette.accent)
            .disabled(!model.canSend)
            .accessibilityLabel("Envoyer la question")
            .accessibilityIdentifier("ask.send")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Palette.pageBackground)
    }
}

/// The conversation, separate from the screen so it can be snapshot-tested
/// without a network.
struct AskConversation: View {
    let exchanges: [ChatExchange]
    let offersVerification: (ChatExchange) -> Bool
    let onRetry: (Int) -> Void
    let onVerify: (Int) -> Void
    let onShare: (Int) -> Void
    let onFeedback: (ChatFeedback, Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            if exchanges.isEmpty { AskIntro() }
            ForEach(exchanges) { exchange in
                ExchangeView(
                    exchange: exchange,
                    offersVerification: offersVerification(exchange),
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
