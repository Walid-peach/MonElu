import Foundation

/// A screen the app can open from anywhere: a tap in another tab, a
/// `monelu://` link, and later a universal link to the website (#459, #432).
public enum AppRoute: Hashable, Sendable {
    case deputy(id: String)
    case vote(id: String)
    /// A bill's page, by its dossier uid (`DLR5L17N54372`).
    case loi(id: String)
    /// The amendment and article scrutins of a bill, all of them or those of
    /// one parcours acte. Reached from the bill page, never from a link.
    case loiAmendements(id: String, acteID: String?)

    /// The tab a route opens in: Explorer, which holds both lists, so the
    /// back button always leads somewhere to keep browsing.
    public var tab: AppTab { .explore }

    /// Parses `monelu://deputes/<id>`, `monelu://votes/<id>` and
    /// `monelu://lois/<id>`, and the website's own paths
    /// (`https://<host>/deputes/<id>`, `/votes/<id>`), so universal links can
    /// reuse this once the domain exists. The website does not serve
    /// `/lois/<id>` yet (#361), so only the app's own scheme opens a bill.
    /// Anything else, including nested paths like `/deputes/<id>/dossier`, is nil.
    public init?(url: URL) {
        var parts = url.pathComponents.filter { $0 != "/" }
        if url.scheme == "monelu", let host = url.host() {
            parts.insert(host, at: 0)
        } else if url.scheme != "https" {
            return nil
        }
        guard parts.count == 2, let id = Self.identifier(parts[1]) else { return nil }
        switch parts[0] {
        case "deputes": self = .deputy(id: id)
        case "votes": self = .vote(id: id)
        case "lois" where url.scheme == "monelu": self = .loi(id: id)
        default: return nil
        }
    }

    /// AN identifiers are ASCII letters and digits (`PA1008`, `VTANR5L17V8434`).
    private static func identifier(_ raw: String) -> String? {
        let allowed = raw.unicodeScalars.allSatisfy { $0.isASCII && CharacterSet.alphanumerics.contains($0) }
        return !raw.isEmpty && allowed ? raw : nil
    }
}
