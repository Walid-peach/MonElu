import SwiftUI

/// Shown instead of the app when the API no longer supports this version
/// (`min_ios_version` in `GET /app/config`, ADR-041 §5). It has no way out:
/// an unsupported version would call an API contract that has moved on.
public struct UpdateRequiredScreen: View {
    public init() {}

    public var body: some View {
        ContentUnavailableView {
            Label("Mise à jour nécessaire", systemImage: "arrow.down.app")
        } description: {
            Text("Cette version de MonÉlu n'est plus prise en charge. Installez la dernière version depuis l'App Store pour continuer.")
        }
        .accessibilityIdentifier("update-required")
    }
}

#Preview {
    UpdateRequiredScreen()
}
