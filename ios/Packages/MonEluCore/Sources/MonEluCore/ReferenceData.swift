import Foundation

/// The small tables every MonÉlu client shares, bundled from `data/reference/`
/// (ADR-041 §4). Never copy one of these tables into Swift by hand.
public enum ReferenceData {
    public struct Department: Codable, Hashable, Sendable, Identifiable {
        public let code: String
        public let name: String
        public var id: String { code }
    }

    /// A parliamentary group; `slug` is the key `GET /groups/{slug}` takes.
    public struct Group: Codable, Hashable, Sendable, Identifiable {
        public let slug: String
        public let name: String
        public var id: String { slug }
    }

    public struct Theme: Codable, Hashable, Sendable, Identifiable {
        public let slug: String
        public let name: String
        public var id: String { slug }
    }

    /// `key` is the position string the API returns (`pour`, `contre`,
    /// `abstention`, `nonVotant`); `label` is how to show it.
    public struct VotePosition: Codable, Hashable, Sendable, Identifiable {
        public let key: String
        public let label: String
        public var id: String { key }
    }

    public static func departments() throws -> [Department] { try load("departments") }
    public static func groups() throws -> [Group] { try load("groups") }
    public static func themes() throws -> [Theme] { try load("themes") }
    public static func votePositions() throws -> [VotePosition] { try load("vote_positions") }

    enum LoadError: Error {
        case missing(String)
    }

    static func load<T: Decodable>(_ name: String) throws -> [T] {
        guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Reference") else {
            throw LoadError.missing(name)
        }
        return try JSONDecoder().decode([T].self, from: Data(contentsOf: url))
    }
}
