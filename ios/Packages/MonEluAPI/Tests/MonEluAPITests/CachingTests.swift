import Foundation
import MonEluAPI
import MonEluCore
import OpenAPIRuntime
import Testing

struct CachingTests {
    @Test func sharedCacheIsSized() {
        MonEluAPI.configureURLCache()
        #expect(URLCache.shared.memoryCapacity == MonEluAPI.urlCacheMemoryBytes)
        #expect(URLCache.shared.diskCapacity == MonEluAPI.urlCacheDiskBytes)
    }

    @Test func offlineInsideAClientErrorIsOffline() {
        let error = ClientError(
            operationID: "listVotes",
            operationInput: (),
            causeDescription: "transport",
            underlyingError: URLError(.notConnectedToInternet)
        )
        #expect(LoadFailure(error) == .offline)
    }
}
