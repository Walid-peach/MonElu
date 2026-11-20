import Foundation

/// A claim typed on the 2027 tab, waiting for the Demander tab to verify it.
///
/// The verification itself, its verdict and its states live in `AskModel`;
/// the 2027 card only hands the sentence over and switches tab, so there is
/// one verify screen and one place that renders a verdict (#718). Demander
/// takes the claim when its tab appears, so this needs no observation.
public final class PendingClaim: @unchecked Sendable {
    // Every access goes through the lock.
    private let lock = NSLock()
    private var claim: String?

    public init(text: String? = nil) {
        claim = text
    }

    /// The claim to verify, until the Demander tab takes it.
    public var text: String? {
        get { lock.withLock { claim } }
        set { lock.withLock { claim = newValue } }
    }

    /// Returns the claim and forgets it.
    public func take() -> String? {
        lock.withLock {
            defer { claim = nil }
            return claim
        }
    }
}
