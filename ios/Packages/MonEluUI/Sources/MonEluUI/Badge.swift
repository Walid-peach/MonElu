import SwiftUI

/// The pill shared by the result and position badges.
struct Badge: View {
    let text: String
    let foreground: Color
    let background: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(foreground)
            .fixedSize()
            .padding(.horizontal, 14)
            .padding(.vertical, 3)
            .background(background, in: Capsule())
    }
}
