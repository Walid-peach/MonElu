import Foundation

/// The hemicycle seat layout for a scrutin: one seat per deputy on concentric
/// arcs, grouped left to right in the chamber's political order.
///
/// A port of `frontend/src/lib/hemicycle.ts`, held to it by a golden fixture:
/// `HemicycleTests` must reproduce every seat and arc the TypeScript produces
/// (#461, ADR-041 §4). Change the layout there first, regenerate the fixture
/// (`npm run export:hemicycle-fixture` in `frontend/`), then make this match.
public enum Hemicycle {
    /// What a seat shows. `absent` is any position the API does not name.
    public enum SeatPosition: String, CaseIterable, Sendable {
        case pour, contre, abstention, nonVotant, absent

        public init(_ raw: String?) {
            switch raw {
            case "pour": self = .pour
            case "contre": self = .contre
            case "abstention": self = .abstention
            case "nonVotant": self = .nonVotant
            default: self = .absent
            }
        }
    }

    public struct Deputy: Hashable, Sendable {
        public let id: String
        public let name: String
        /// Short group code (`LFI`, `RN`), or nil when unresolved.
        public let group: String?
        public let position: String?

        public init(id: String, name: String, group: String?, position: String?) {
            self.id = id
            self.name = name
            self.group = group
            self.position = position
        }
    }

    public struct Seat: Hashable, Sendable {
        public let deputy: Deputy
        public let position: SeatPosition
        /// Coordinates in the `viewBox` space.
        public let x: Double
        public let y: Double
        /// 0-based ring, innermost first.
        public let ring: Int
    }

    public struct GroupArc: Hashable, Sendable {
        public let group: String
        public let seatCount: Int
        public let counts: [SeatPosition: Int]
        /// Radians, π (far left) to 0 (far right).
        public let startAngle: Double
        public let endAngle: Double
    }

    /// The drawing space: a half-disc opening upward, centred at the bottom.
    public static let viewBox = (width: 1000.0, height: 520.0)
    public static let nonInscrit = "Non inscrit"

    static let centerX = viewBox.width / 2
    static let centerY = viewBox.height - 10
    static let minRadius = 210.0
    static let maxRadius = 490.0

    /// Left-to-right order of the 17th legislature's groups in the chamber.
    static let groupOrder = ["LFI", "GDR", "ECS", "SOC", "LIOT", "DEM", "EPR", "HOR", "DR", "UDR", "RN"]

    /// A group's left-to-right rank; unknown, unresolved and `NI` go last.
    public static func groupRank(_ group: String?) -> Int {
        guard let group, group != "NI" else { return groupOrder.count }
        return groupOrder.firstIndex(of: group) ?? groupOrder.count
    }

    /// Seats per ring, keeping spacing along each arc roughly constant; the
    /// rounding remainder goes to the outer rings first.
    public static func ringDistribution(total: Int, rings: Int) -> [Int] {
        guard total > 0 else { return [] }
        let radii = (0..<rings).map { radius(ring: $0, rings: rings) }
        let radiusSum = radii.reduce(0, +)
        var counts = radii.map { Int((Double(total) * $0 / radiusSum).rounded(.down)) }
        var remainder = total - counts.reduce(0, +)
        var ring = rings - 1
        while remainder > 0 {
            counts[ring] += 1
            remainder -= 1
            ring = (ring - 1 + rings) % rings
        }
        return counts
    }

    /// One seat per deputy. Deputies are ordered by group then name and given
    /// the slots ordered left to right, so each group fills a wedge.
    public static func layoutSeats(_ deputies: [Deputy]) -> [Seat] {
        let total = deputies.count
        guard total > 0 else { return [] }

        let rings = max(3, min(11, Int((Double(total).squareRoot() * 0.46).rounded(.up))))
        let perRing = ringDistribution(total: total, rings: rings)

        struct Slot {
            let x: Double
            let y: Double
            let angle: Double
            let ring: Int
            let index: Int
        }
        var slots: [Slot] = []
        for (ring, count) in perRing.enumerated() {
            let r = radius(ring: ring, rings: rings)
            for i in 0..<count {
                let t = count == 1 ? 0.5 : Double(i) / Double(count - 1)
                let angle = Double.pi * (1 - t)
                slots.append(Slot(
                    x: centerX + cos(angle) * r, y: centerY - sin(angle) * r,
                    angle: angle, ring: ring, index: slots.count
                ))
            }
        }
        // Left to right, inner rings first on a tie. The original index is the
        // last key because JavaScript's sort is stable and Swift's is not.
        slots.sort { a, b in
            if a.angle != b.angle { return a.angle > b.angle }
            if a.ring != b.ring { return a.ring < b.ring }
            return a.index < b.index
        }

        let ordered = deputies.enumerated().sorted { a, b in
            let (rankA, rankB) = (groupRank(a.element.group), groupRank(b.element.group))
            if rankA != rankB { return rankA < rankB }
            let names = compareNames(a.element.name, b.element.name)
            if names != .orderedSame { return names == .orderedAscending }
            return a.offset < b.offset
        }

        return zip(ordered, slots).map { entry, slot in
            Seat(
                deputy: entry.element,
                position: SeatPosition(entry.element.position),
                x: roundToTenth(slot.x), y: roundToTenth(slot.y),
                ring: slot.ring
            )
        }
    }

    /// Each group's share of the half-disc, in the same left-to-right order.
    public static func groupArcs(_ deputies: [Deputy]) -> [GroupArc] {
        let total = deputies.count
        guard total > 0 else { return [] }

        var order: [String] = []
        var members: [String: [Deputy]] = [:]
        var ranks: [String: Int] = [:]
        for deputy in deputies {
            let rank = groupRank(deputy.group)
            let name = rank < groupOrder.count ? deputy.group ?? nonInscrit : nonInscrit
            if members[name] == nil { order.append(name) }
            members[name, default: []].append(deputy)
            ranks[name] = min(ranks[name] ?? rank, rank)
        }
        // First-seen order breaks a rank tie, as the stable JavaScript sort does.
        let groups = order.enumerated().sorted { a, b in
            let (rankA, rankB) = (ranks[a.element]!, ranks[b.element]!)
            return rankA != rankB ? rankA < rankB : a.offset < b.offset
        }

        var arcs: [GroupArc] = []
        var cursor = Double.pi
        for (_, group) in groups {
            let groupMembers = members[group]!
            let span = Double.pi * Double(groupMembers.count) / Double(total)
            var counts = Dictionary(uniqueKeysWithValues: SeatPosition.allCases.map { ($0, 0) })
            for member in groupMembers { counts[SeatPosition(member.position), default: 0] += 1 }
            arcs.append(GroupArc(
                group: group, seatCount: groupMembers.count, counts: counts,
                startAngle: cursor, endAngle: cursor - span
            ))
            cursor -= span
        }
        return arcs
    }

    static func radius(ring: Int, rings: Int) -> Double {
        minRadius + (maxRadius - minRadius) * Double(ring) / Double(max(1, rings - 1))
    }

    /// `Math.round(v * 10) / 10`: halves round up, as in JavaScript.
    static func roundToTenth(_ value: Double) -> Double {
        (value * 10 + 0.5).rounded(.down) / 10
    }

    /// French collation, as `localeCompare(_, 'fr')` orders names on the web.
    static func compareNames(_ a: String, _ b: String) -> ComparisonResult {
        a.compare(b, locale: french)
    }

    private static let french = Locale(identifier: "fr")
}
