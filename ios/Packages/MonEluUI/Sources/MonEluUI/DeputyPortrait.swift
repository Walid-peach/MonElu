import SwiftUI

/// A deputy's official portrait, fetched by the device from the photo URL the
/// API returns. Their initials show while it loads, and stay when there is no
/// URL or the image fails, so a profile never shows a broken image.
public struct DeputyPortrait: View {
    let name: String
    let url: URL?
    let size: CGFloat

    public init(name: String, url: URL?, size: CGFloat = 48) {
        self.name = name
        self.url = url
        self.size = size
    }

    public var body: some View {
        ZStack {
            initials
            if let url {
                AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    }
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Palette.border, lineWidth: 1))
        // The name sits next to the portrait wherever it appears.
        .accessibilityHidden(true)
    }

    private var initials: some View {
        Text(Self.initials(of: name))
            .font(.system(size: size * 0.38, weight: .semibold))
            .foregroundStyle(Palette.textSecondary)
            .frame(width: size, height: size)
            .background(Palette.trackBackground)
    }

    /// The first letter of the first and last words: "Audrey Abadie-Amiel" is
    /// "AA", "Yaël Braun-Pivet" is "YB".
    static func initials(of name: String) -> String {
        let words = name.split(separator: " ")
        let letters = [words.first, words.count > 1 ? words.last : nil].compactMap { $0?.first }
        return String(letters).uppercased()
    }
}
