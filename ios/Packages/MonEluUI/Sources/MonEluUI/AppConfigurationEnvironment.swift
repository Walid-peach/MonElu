import MonEluCore
import SwiftUI

extension EnvironmentValues {
    /// The launch configuration from `GET /app/config`: feature switches,
    /// caveats and the data horizon. Views read it rather than hard-coding any
    /// of them (ADR-041 §4).
    @Entry public var appConfiguration: AppConfiguration = .defaults
}

extension EnvironmentValues {
    /// The day a list's short dates are relative to (`MonEluFormat.listDay`):
    /// now in the app, a fixed day in snapshot tests so a reference image
    /// does not change on New Year's Day.
    @Entry public var today: Date = .now
}
