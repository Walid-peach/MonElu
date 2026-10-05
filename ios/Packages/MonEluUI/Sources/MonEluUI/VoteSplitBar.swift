import MonEluCore
import SwiftUI

/// A scrutin's pour / contre / abstention (and non-votant) counts as one
/// stacked bar, as the API returned them. Segment widths are only the
/// counts drawn to scale; no figure is derived from them.
///
/// `compact` sits in a list row, `large` on a vote's detail page. VoiceOver
/// reads the counts, never the drawing.
public struct VoteSplitBar: View {
    public enum Size: Sendable {
        case compact, large

        var height: CGFloat {
            switch self {
            case .compact: 6
            case .large: 10
            }
        }
    }

    public let pour: Int
    public let contre: Int
    public let abstention: Int
    public let nonVotant: Int
    public let size: Size

    public init(pour: Int, contre: Int, abstention: Int, nonVotant: Int = 0, size: Size = .compact) {
        self.pour = pour
        self.contre = contre
        self.abstention = abstention
        self.nonVotant = nonVotant
        self.size = size
    }

    public var body: some View {
        ProportionalRow(spacing: 2) {
            ForEach(segments, id: \.position) { segment in
                Rectangle()
                    .fill(segment.color)
                    .layoutValue(key: SegmentWeight.self, value: Double(segment.count))
            }
        }
        .frame(height: size.height)
        .frame(maxWidth: .infinity)
        .background(Palette.trackBackground)
        .clipShape(Capsule())
        .accessibilityElement()
        .accessibilityLabel(accessibilityText)
    }

    /// "80 pour, 24 contre, 24 abstentions", plus the non-votants when there
    /// are any.
    public var accessibilityText: String {
        var parts = [
            "\(MonEluFormat.count(pour)) pour",
            "\(MonEluFormat.count(contre)) contre",
            Self.counted(abstention, "abstention"),
        ]
        if nonVotant > 0 {
            parts.append(Self.counted(nonVotant, "non-votant"))
        }
        return parts.joined(separator: ", ")
    }

    /// French plurals: 0 and 1 take the singular.
    static func counted(_ count: Int, _ noun: String) -> String {
        "\(MonEluFormat.count(count)) \(noun)\(count > 1 ? "s" : "")"
    }

    private struct Segment {
        let position: String
        let count: Int
        let color: Color
    }

    private var segments: [Segment] {
        [
            Segment(position: "pour", count: pour, color: Palette.positive),
            Segment(position: "contre", count: contre, color: Palette.negative),
            Segment(position: "abstention", count: abstention, color: Palette.seatAbstention),
            Segment(position: "nonVotant", count: nonVotant, color: Palette.seatNonVotant),
        ]
        .filter { $0.count > 0 }
    }
}

private struct SegmentWeight: LayoutValueKey {
    static let defaultValue: Double = 0
}

/// Lays its subviews in a row, each as wide as its share of the total weight.
private struct ProportionalRow: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        CGSize(width: proposal.width ?? 0, height: proposal.height ?? 0)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let total = subviews.reduce(0) { $0 + $1[SegmentWeight.self] }
        guard total > 0 else { return }
        let available = max(0, bounds.width - spacing * CGFloat(subviews.count - 1))
        var x = bounds.minX
        for subview in subviews {
            let width = available * subview[SegmentWeight.self] / total
            subview.place(
                at: CGPoint(x: x, y: bounds.minY),
                proposal: ProposedViewSize(width: width, height: bounds.height)
            )
            x += width + spacing
        }
    }
}
