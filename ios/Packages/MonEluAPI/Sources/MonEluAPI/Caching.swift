import Foundation
import MonEluCore
import OpenAPIRuntime

// The generated client wraps transport failures in ClientError; screens
// classify them as offline or server through MonEluCore's LoadFailure.
extension ClientError: @retroactive WrapsUnderlyingError {}

extension MonEluAPI {
    /// Memory and disk sizes for the app's shared `URLCache`.
    public static let urlCacheMemoryBytes = 8 * 1024 * 1024
    public static let urlCacheDiskBytes = 64 * 1024 * 1024

    /// Gives the shared session a cache large enough to keep what the API
    /// marks cacheable (`Cache-Control: public, max-age=300` on public reads,
    /// ADR-041 §5), so moving between screens does not refetch them. Call once
    /// at launch, before the first request.
    public static func configureURLCache() {
        URLCache.shared = URLCache(
            memoryCapacity: urlCacheMemoryBytes,
            diskCapacity: urlCacheDiskBytes,
            directory: nil
        )
    }
}
