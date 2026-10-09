import Foundation
import HTTPTypes
import MonEluAPI
import MonEluCore
@testable import MonEluFeatures
import MonEluUI
import OpenAPIRuntime
import SnapshotTesting
import SwiftUI
import Testing

func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
}

/// Answers every request with one recorded JSON body.
struct StubTransport: ClientTransport {
    var status: HTTPResponse.Status = .ok
    let json: Data

    func send(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}

func stubClient(_ json: Data, status: HTTPResponse.Status = .ok) -> Client {
    MonEluAPI.client(baseURL: URL(string: "https://api.test")!, transport: StubTransport(status: status, json: json))
}

/// Answers each operation with its own recorded body, and any other with 500.
struct OperationTransport: ClientTransport {
    let responses: [String: Data]

    func send(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard let json = responses[operationID] else { return (HTTPResponse(status: .internalServerError), nil) }
        var response = HTTPResponse(status: .ok)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}

func operationClient(_ responses: [String: Data]) -> Client {
    MonEluAPI.client(baseURL: URL(string: "https://api.test")!, transport: OperationTransport(responses: responses))
}

/// A `VotesService` that records its queries and replays scripted pages.
final class RecordingVotesService: VotesService, @unchecked Sendable {
    private let lock = NSLock()
    private var pages: [Result<VotePage, any Error>]
    private(set) var queries: [VoteQuery] = []
    var detail: Result<VoteDetail, any Error> = .failure(URLError(.badServerResponse))

    init(pages: [Result<VotePage, any Error>] = []) { self.pages = pages }

    func votes(_ query: VoteQuery) async throws -> VotePage {
        try lock.withLock {
            queries.append(query)
            return try pages.isEmpty ? VotePage(items: [], nextCursor: nil) : pages.removeFirst().get()
        }
    }

    func vote(id: String) async throws -> VoteDetail { try detail.get() }
}

func item(_ id: String, title: String = "l'ensemble du projet de loi de finances pour 2026", result: String? = "adopté") -> VoteItem {
    VoteItem(
        id: id, title: title, date: Date(timeIntervalSince1970: 1_784_592_000), result: result,
        summary: "Le texte fixe les recettes et les dépenses de l'État pour l'année à venir.", theme: "Économie & Budget"
    )
}

/// The day every snapshot is taken on (2026-10-10, noon UTC), so a list's
/// short dates leave out the year exactly as they did when it was recorded.
let snapshotToday = Date(timeIntervalSince1970: 1_791_633_600)

/// The snapshot variants every screen is checked in (ADR-041 §8).
struct Variant: CustomTestStringConvertible, Sendable {
    let name: String
    let style: UIUserInterfaceStyle
    let size: UIContentSizeCategory

    var testDescription: String { name }

    static let all = [
        Variant(name: "light", style: .light, size: .large),
        Variant(name: "dark", style: .dark, size: .large),
        Variant(name: "light-ax", style: .light, size: .accessibilityExtraLarge),
        Variant(name: "dark-ax", style: .dark, size: .accessibilityExtraLarge),
    ]
}

@MainActor
func checkSnapshot<V: View>(
    _ view: V, _ variant: Variant, height: CGFloat? = nil,
    file: StaticString = #filePath, testName: String = #function, line: UInt = #line
) {
    Typography.registerFonts()
    let framed = view
        .frame(width: 390, height: height, alignment: .topLeading)
        .background(Palette.pageBackground)
        .environment(\.colorScheme, variant.style == .dark ? .dark : .light)
        .environment(\.dynamicTypeSize, DynamicTypeSize(variant.size) ?? .large)
        .environment(\.today, snapshotToday)
    let traits = UITraitCollection { traits in
        traits.userInterfaceStyle = variant.style
        traits.preferredContentSizeCategory = variant.size
        // Not the Simulator's 3x: whole screens are tall, and the repository
        // refuses files over 500 KB. The accessibility variants render at 1x,
        // where their much larger text is still easy to read.
        traits.displayScale = variant.size.isAccessibilityCategory ? 1 : 2
    }
    assertSnapshot(
        of: framed,
        as: .image(precision: 0.995, perceptualPrecision: 0.98, layout: .sizeThatFits, traits: traits),
        named: variant.name,
        file: file,
        testName: String(testName.prefix { $0 != "(" }),
        line: line
    )
}
