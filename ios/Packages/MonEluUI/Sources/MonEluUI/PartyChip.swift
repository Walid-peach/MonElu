import SwiftUI

/// A parliamentary group's label on its group color (`Palette.party`), keyed
/// by the API's `party_short`. Shows the short code, or a longer label in
/// the same colors ("La France insoumise - NFP" on a profile).
public struct PartyChip: View {
    public let text: String
    public let short: String?

    /// The short code itself: "LFI".
    public init(short: String) {
        self.text = short
        self.short = short
    }

    /// Any label, colored as the group `short` names.
    public init(_ text: String, short: String?) {
        self.text = text
        self.short = short
    }

    public var body: some View {
        let colors = Palette.party(short)
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(colors.text)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(colors.background, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}
