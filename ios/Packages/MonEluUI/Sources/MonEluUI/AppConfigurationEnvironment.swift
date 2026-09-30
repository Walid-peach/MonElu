import MonEluCore
import SwiftUI

extension EnvironmentValues {
    /// The launch configuration from `GET /app/config`: feature switches,
    /// caveats and the data horizon. Views read it rather than hard-coding any
    /// of them (ADR-041 §4).
    @Entry public var appConfiguration: AppConfiguration = .defaults
}
