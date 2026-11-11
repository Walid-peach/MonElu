import Foundation
import os

/// Debug-level timings of a `Loader`: how long after the screen asked for its
/// data something was on screen, and how long until all of it was. Read with
/// `log stream --level debug --predicate 'subsystem == "fr.monelu.app.load"'`
/// to measure a page switch; costs nothing when nobody is listening.
@MainActor
final class LoadTrace {
    private static let logger = Logger(subsystem: "fr.monelu.app.load", category: "loader")

    private var start = ContinuousClock.now
    private var hasShown = false

    func restart() {
        start = .now
        hasShown = false
    }

    /// The first content of this load reached the screen.
    func shown(_ key: String?, from source: String) {
        guard !hasShown else { return }
        hasShown = true
        let ms = Self.milliseconds(since: start)
        Self.logger.debug("shown key=\(key ?? "-", privacy: .public) ms=\(ms) source=\(source, privacy: .public)")
    }

    /// The page opened on what the cache held, with nothing to wait for.
    func shownAtOnce(_ key: String?) {
        guard !hasShown else { return }
        hasShown = true
        Self.logger.debug("shown key=\(key ?? "-", privacy: .public) ms=0 source=cache")
    }

    /// The fetch returned everything.
    func complete(_ key: String?) {
        let ms = Self.milliseconds(since: start)
        if !hasShown {
            hasShown = true
            Self.logger.debug("shown key=\(key ?? "-", privacy: .public) ms=\(ms) source=network")
        }
        Self.logger.debug("complete key=\(key ?? "-", privacy: .public) ms=\(ms)")
    }

    private static func milliseconds(since start: ContinuousClock.Instant) -> Int {
        let elapsed = ContinuousClock.now - start
        return Int(elapsed.components.seconds * 1000 + elapsed.components.attoseconds / 1_000_000_000_000_000)
    }
}
