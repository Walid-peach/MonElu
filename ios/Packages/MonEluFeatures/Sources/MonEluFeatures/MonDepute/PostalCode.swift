import Foundation

/// A French postal code: exactly five digits.
public enum PostalCode {
    /// The code without surrounding spaces, or nil when it is not five ASCII
    /// digits (`\d` would also accept other scripts' digits).
    public static func normalized(_ input: String) -> String? {
        let code = input.trimmingCharacters(in: .whitespacesAndNewlines)
        return code.wholeMatch(of: /[0-9]{5}/) == nil ? nil : code
    }
}

/// A département a postal code belongs to, as geo.api.gouv.fr names it. The
/// code is the INSEE code `getDepartment` takes (`33`, `2A`, `971`).
public struct PostalDepartment: Hashable, Sendable {
    public let code: String
    public let name: String
    /// The communes of the postal code in this département, as named there.
    public let communes: [String]

    public init(code: String, name: String, communes: [String] = []) {
        self.code = code
        self.name = name
        self.communes = communes
    }
}

/// Turns a postal code into its départements, as the website's `postal.ts`
/// does. Behind a protocol so the screen is tested without the network.
public protocol PostalCodeService: Sendable {
    /// Every département the postal code's communes belong to, usually one;
    /// none for a code that does not exist.
    func departments(forPostalCode code: String) async throws -> [PostalDepartment]
}

/// `PostalCodeService` on geo.api.gouv.fr, the government's open commune API.
///
/// The postal code goes to that service and nowhere else, and is never
/// stored (#463): the session is ephemeral, so neither the response nor the
/// URL carrying the code lands in a cache on disk, unlike the shared session
/// the MonÉlu client uses.
public struct LivePostalCodeService: PostalCodeService {
    static let host = "geo.api.gouv.fr"

    let session: URLSession

    public init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }

    public func departments(forPostalCode code: String) async throws -> [PostalDepartment] {
        let (data, response) = try await session.data(from: Self.url(forPostalCode: code))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try Self.departments(from: data)
    }

    static func url(forPostalCode code: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = host
        components.path = "/communes"
        components.queryItems = [
            URLQueryItem(name: "codePostal", value: code),
            URLQueryItem(name: "fields", value: "nom,departement"),
            URLQueryItem(name: "format", value: "json"),
        ]
        return components.url!
    }

    /// The distinct départements of the communes in a response, in order,
    /// each with its communes.
    static func departments(from data: Data) throws -> [PostalDepartment] {
        struct Commune: Decodable {
            struct Department: Decodable {
                let code: String
                let nom: String
            }
            let nom: String?
            let departement: Department?
        }
        var order: [String] = []
        var names: [String: String] = [:]
        var communes: [String: [String]] = [:]
        for commune in try JSONDecoder().decode([Commune].self, from: data) {
            guard let department = commune.departement else { continue }
            if names[department.code] == nil {
                order.append(department.code)
                names[department.code] = department.nom
            }
            if let name = commune.nom { communes[department.code, default: []].append(name) }
        }
        return order.map { PostalDepartment(code: $0, name: names[$0] ?? $0, communes: communes[$0] ?? []) }
    }
}
