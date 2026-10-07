import Foundation

/// Values the build settings put in Info.plist (`Configs/App.xcconfig`).
enum AppEnvironment {
    /// The API the app talks to. Set per build in the xcconfig, never in code:
    /// a public App Store build must not carry a Railway hostname (ADR-041 §5).
    static var apiBaseURL: URL {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "MonEluAPIBaseURL") as? String,
              let url = URL(string: value)
        else { preconditionFailure("MonEluAPIBaseURL is missing from Info.plist; see Configs/App.xcconfig") }
        return url
    }

    /// `CFBundleShortVersionString`, compared against `min_ios_version`.
    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }

    /// "1.0 (42)": the version and the build, as Réglages shows them.
    static var displayVersion: String {
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return [appVersion, build.map { "(\($0))" }].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " ")
    }
}
