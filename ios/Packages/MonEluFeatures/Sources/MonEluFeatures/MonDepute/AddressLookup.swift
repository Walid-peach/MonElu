import Foundation
import MonEluAPI

/// An address the Base Adresse Nationale suggested, with its point (ADR-047).
public struct AddressSuggestion: Hashable, Sendable, Identifiable {
    /// "8 Boulevard du Port 80000 Amiens"
    public let label: String
    /// "80, Somme, Hauts-de-France"
    public let context: String
    public let latitude: Double
    public let longitude: Double
    public var id: String { "\(label)|\(latitude)|\(longitude)" }

    public init(label: String, context: String, latitude: Double, longitude: Double) {
        self.label = label
        self.context = context
        self.latitude = latitude
        self.longitude = longitude
    }
}

/// Address suggestions for what the user typed. Behind a protocol so the
/// screen is tested without the network.
public protocol AddressService: Sendable {
    func suggestions(for query: String) async throws -> [AddressSuggestion]
}

/// `AddressService` on the Base Adresse Nationale's geocoder (IGN's
/// Géoplateforme, which took over api-adresse.data.gouv.fr).
///
/// The address goes to that service and nowhere else, and is never stored
/// (ADR-047 §4): the session is ephemeral, so neither the response nor the URL
/// carrying the address lands in a cache on disk, as for `LivePostalCodeService`.
public struct LiveAddressService: AddressService {
    static let host = "data.geopf.fr"
    static let minimumQueryLength = 3

    let session: URLSession

    public init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }

    public func suggestions(for query: String) async throws -> [AddressSuggestion] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= Self.minimumQueryLength else { return [] }
        let (data, response) = try await session.data(from: Self.url(for: trimmed))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try Self.suggestions(from: data)
    }

    static func url(for query: String) -> URL {
        var components = URLComponents()
        components.scheme = "https"
        components.host = host
        components.path = "/geocodage/search"
        components.queryItems = [
            URLQueryItem(name: "q", value: query),
            URLQueryItem(name: "limit", value: "5"),
            URLQueryItem(name: "autocomplete", value: "1"),
        ]
        return components.url!
    }

    /// Result types precise enough to stand for where someone lives: an
    /// address with a house number, or a lieu-dit. A street's or a town's
    /// point is its middle, which in a city split between seats would name
    /// the wrong one with confidence (ADR-047 §5), so those are left out.
    static let preciseTypes: Set<String> = ["housenumber", "locality"]

    /// The precise points of a GeoJSON response that have a label, in order.
    static func suggestions(from data: Data) throws -> [AddressSuggestion] {
        struct Response: Decodable {
            struct Feature: Decodable {
                struct Geometry: Decodable {
                    let type: String
                    let coordinates: [Double]?
                }
                struct Properties: Decodable {
                    let label: String?
                    let context: String?
                    let type: String?
                }
                let geometry: Geometry?
                let properties: Properties?
            }
            let features: [Feature]?
        }
        return try JSONDecoder().decode(Response.self, from: data).features?.compactMap { feature in
            guard
                feature.geometry?.type == "Point",
                let coordinates = feature.geometry?.coordinates, coordinates.count >= 2,
                let label = feature.properties?.label,
                let type = feature.properties?.type, preciseTypes.contains(type)
            else { return nil }
            return AddressSuggestion(
                label: label, context: feature.properties?.context ?? "",
                latitude: coordinates[1], longitude: coordinates[0]
            )
        } ?? []
    }
}

/// A circonscription and the deputy sitting for it, as the locator returns it.
public struct LocatedSeat: Hashable, Sendable, Identifiable {
    public let departmentCode: String
    public let circonscription: Int
    /// "Nord, 1re circonscription"
    public let label: String
    /// The sitting deputy; nil while the seat is vacant.
    public let deputy: DeputyItem?
    /// No deputy sits for the seat until a by-election, as the API says.
    public let vacant: Bool
    /// The region of a seat abroad ("Benelux"); nil elsewhere.
    public let region: String?
    public var id: String { "\(departmentCode)-\(circonscription)" }

    public init(
        departmentCode: String, circonscription: Int, label: String, deputy: DeputyItem?,
        vacant: Bool? = nil, region: String? = nil
    ) {
        self.departmentCode = departmentCode
        self.circonscription = circonscription
        self.label = label
        self.deputy = deputy
        self.vacant = vacant ?? (deputy == nil)
        self.region = region
    }
}

/// Where a point is: one seat, or every seat near a boundary (`uncertain`).
public struct SeatLookup: Hashable, Sendable {
    public let uncertain: Bool
    public let seats: [LocatedSeat]

    public init(uncertain: Bool, seats: [LocatedSeat]) {
        self.uncertain = uncertain
        self.seats = seats
    }
}

public protocol CirconscriptionService: Sendable {
    /// The seat of a point, or nil when it is in no circonscription.
    func locate(latitude: Double, longitude: Double) async throws -> SeatLookup?
    /// The 11 seats for French people abroad, by region.
    func abroad() async throws -> [LocatedSeat]
}

/// `CirconscriptionService` on the generated client (`locateCirconscription`,
/// `listAbroadCirconscriptions`). Only the point is sent, in a POST body.
public struct LiveCirconscriptionService: CirconscriptionService {
    private let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func locate(latitude: Double, longitude: Double) async throws -> SeatLookup? {
        let response = try await client.locateCirconscription(body: .json(.init(lat: latitude, lon: longitude)))
        // A 404 is not in the spec, so the client reports it as undocumented.
        if case .undocumented(statusCode: 404, _) = response { return nil }
        let body = try response.ok.body.json
        return SeatLookup(uncertain: body.uncertain, seats: body.seats.map(LocatedSeat.init))
    }

    public func abroad() async throws -> [LocatedSeat] {
        try await client.listAbroadCirconscriptions().ok.body.json.map(LocatedSeat.init)
    }
}

extension LocatedSeat {
    init(_ seat: Components.Schemas.Seat) {
        self.init(
            departmentCode: seat.departmentCode, circonscription: seat.circonscription, label: seat.label,
            deputy: seat.deputy.map(DeputyItem.init), vacant: seat.vacant
        )
    }

    init(_ seat: Components.Schemas.AbroadSeat) {
        self.init(
            departmentCode: seat.departmentCode, circonscription: seat.circonscription, label: seat.label,
            deputy: seat.deputy.map(DeputyItem.init), vacant: seat.vacant, region: seat.region
        )
    }
}

extension DeputyItem {
    init(_ deputy: Components.Schemas.DeputySummary) {
        self.init(
            id: deputy.deputyId, name: deputy.fullName, group: deputy.party, groupShort: deputy.partyShort,
            department: deputy.department, circonscription: deputy.circonscription,
            photoURL: deputy.photoUrl.flatMap(URL.init(string:))
        )
    }
}
