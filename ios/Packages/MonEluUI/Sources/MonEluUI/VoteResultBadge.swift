import SwiftUI

/// A scrutin's outcome as the API states it (`result`: `adopté` or `rejeté`),
/// never recomputed from the counts.
public struct VoteResultBadge: View {
    public let result: String

    public init(result: String) {
        self.result = result
    }

    public var body: some View {
        switch result.lowercased() {
        case "adopté":
            Badge(text: "Adopté", foreground: Palette.positiveText, background: Palette.positiveBackground)
        case "rejeté":
            Badge(text: "Rejeté", foreground: Palette.negativeText, background: Palette.negativeBackground)
        default:
            // A value the API adds later still shows, as sent, in neutral colors.
            Badge(text: result, foreground: Palette.textSecondary, background: Palette.trackBackground)
        }
    }
}
