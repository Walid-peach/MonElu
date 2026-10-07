import MonEluCore
import MonEluUI
import SwiftUI
import UIKit

/// How the app is drawn: as the system says, or always light or dark. Kept
/// on the device (`UserDefaults`), like everything the app knows about its
/// user (ADR-040 §6).
public enum AppearancePreference: String, CaseIterable, Identifiable, Sendable {
    case system, light, dark

    /// The `@AppStorage` key the app root and the settings share.
    public static let storageKey = "monelu.appearance"

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .system: "Système"
        case .light: "Clair"
        case .dark: "Sombre"
        }
    }

    /// What a window's `overrideUserInterfaceStyle` takes; unspecified
    /// follows the system.
    public var interfaceStyle: UIUserInterfaceStyle {
        switch self {
        case .system: .unspecified
        case .light: .light
        case .dark: .dark
        }
    }
}

/// Réglages (#494, design A): what needs no account. The appearance, the
/// data's methodology, sources and horizon, contact and version. The
/// notification and account sections wait for accounts (#434); nothing is
/// ever sent (#359).
public struct SettingsScreen: View {
    let version: String
    @AppStorage(AppearancePreference.storageKey) private var appearance = AppearancePreference.system
    @Environment(\.appConfiguration) private var configuration
    @Environment(\.openURL) private var openURL

    /// `version` is the app's, "1.0 (42)": the target reads it from Info.plist.
    public init(version: String) {
        self.version = version
    }

    public var body: some View {
        SettingsContent(
            appearance: $appearance, configuration: configuration, version: version,
            onTextSize: {
                // The app follows the iPhone's text size; its settings are the
                // closest the app can open.
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
        )
        .navigationTitle("Réglages")
        .accessibilityIdentifier("screen.settings")
    }
}

/// The list, separate from the screen so it can be snapshot-tested.
struct SettingsContent: View {
    @Binding var appearance: AppearancePreference
    let configuration: AppConfiguration
    let version: String
    let onTextSize: () -> Void

    var body: some View {
        List {
            Section("Affichage") {
                // Three short choices, all in view: a segmented control.
                VStack(alignment: .leading, spacing: 8) {
                    Text("Apparence").foregroundStyle(Palette.textPrimary)
                    Picker("Apparence", selection: $appearance) {
                        ForEach(AppearancePreference.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .accessibilityIdentifier("settings.appearance")
                }
                .padding(.vertical, 6)
                Button(action: onTextSize) {
                    row("Taille du texte", value: "Réglage iPhone", chevron: true)
                }
                .accessibilityIdentifier("settings.text-size")
            }
            .listRowBackground(Palette.cardBackground)

            Section {
                link("Méthodologie", path: "methodologie")
                link("Sources et licence", value: "Licence Ouverte 2.0", path: "licence-donnees")
                if let horizon = Self.horizon(configuration.dataHorizon) {
                    row("Votes disponibles depuis le", value: horizon, chevron: false)
                        .accessibilityElement(children: .combine)
                }
            } header: {
                Text("Les données")
            } footer: {
                Text("Données officielles de l'Assemblée nationale, mises à jour chaque jour ouvré.")
            }
            .listRowBackground(Palette.cardBackground)

            Section("MonÉlu") {
                link("Contact et signalement d'erreur", path: "contact")
                row("Version", value: version, chevron: false)
                    .accessibilityElement(children: .combine)
            }
            .listRowBackground(Palette.cardBackground)
        }
        .scrollContentBackground(.hidden)
        .background(Palette.pageBackground)
        .tint(Palette.accent)
    }

    /// A page of the website, opened in the browser; left out while the
    /// configuration has no site address.
    @ViewBuilder private func link(_ title: String, value: String? = nil, path: String) -> some View {
        if let url = configuration.siteLink(path) {
            Link(destination: url) { row(title, value: value, chevron: true) }
                .accessibilityHint("Ouvre la page sur le site")
        }
    }

    private func row(_ title: String, value: String?, chevron: Bool) -> some View {
        HStack(spacing: 8) {
            ViewThatFits(in: .horizontal) {
                HStack {
                    Text(title).foregroundStyle(Palette.textPrimary)
                    Spacer(minLength: 8)
                    if let value { Text(value).foregroundStyle(Palette.textSecondary) }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(Palette.textPrimary)
                    if let value { Text(value).foregroundStyle(Palette.textSecondary) }
                }
            }
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.textMuted)
                    .accessibilityHidden(true)
            }
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
    }

    /// "1 juil. 2025", from the configuration's ISO day.
    static func horizon(_ day: String) -> String? {
        MonEluFormat.calendarDate(day).map(MonEluFormat.shortDay)
    }
}
