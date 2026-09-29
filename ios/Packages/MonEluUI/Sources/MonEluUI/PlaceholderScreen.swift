import SwiftUI

/// Stand-in content for a tab whose feature has not shipped yet.
public struct PlaceholderScreen: View {
    public let title: String
    public let systemImage: String

    public init(title: String, systemImage: String) {
        self.title = title
        self.systemImage = systemImage
    }

    public var body: some View {
        ContentUnavailableView(
            title,
            systemImage: systemImage,
            description: Text("Bientôt disponible.")
        )
    }
}

#Preview {
    PlaceholderScreen(title: "Votes", systemImage: "checkmark.seal")
}
