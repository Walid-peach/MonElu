import Foundation
import os

/// Timings of a `Loader`, in debug builds only: how long after the screen
/// asked for its data something was on screen, and how long until all of it
/// was. Read with
/// `log stream --level debug --predicate 'subsystem == "fr.monelu.app.load"'`
/// to measure a page switch. A release build logs nothing: a list's key
/// holds what the user typed in its search field.
@MainActor
final class LoadTrace {
    #if DEBUG
    private static let logger = Logger(subsystem: "fr.monelu.app.load", category: "loader")
    #endif

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
        log("shown key=\(key ?? "-") ms=\(Self.milliseconds(since: start)) source=\(source)")
    }

    /// The page opened on what the cache held, with nothing to wait for.
    func shownAtOnce(_ key: String?) {
        guard !hasShown else { return }
        hasShown = true
        log("shown key=\(key ?? "-") ms=0 source=cache")
    }

    /// The fetch returned everything.
    func complete(_ key: String?) {
        let ms = Self.milliseconds(since: start)
        if !hasShown {
            hasShown = true
            log("shown key=\(key ?? "-") ms=\(ms) source=network")
        }
        log("complete key=\(key ?? "-") ms=\(ms)")
    }

    private func log(_ message: @autoclosure () -> String) {
        #if DEBUG
        let message = message()
        Self.logger.debug("\(message, privacy: .public)")
        #endif
    }

    private static func milliseconds(since start: ContinuousClock.Instant) -> Int {
        let elapsed = ContinuousClock.now - start
        return Int(elapsed.components.seconds * 1000 + elapsed.components.attoseconds / 1_000_000_000_000_000)
    }
}
