import MonEluCore
import SwiftUI

/// A scrutin drawn as the chamber: one dot per deputy with a recorded
/// position, coloured by that position and seated by group, left to right
/// (web: `HemicycleChart.tsx`). The layout is `MonEluCore.Hemicycle`.
///
/// VoiceOver gets one element with the count per position, not hundreds of
/// dots.
public struct HemicycleChart: View {
    let seats: [Hemicycle.Seat]

    public init(deputies: [Hemicycle.Deputy]) {
        seats = Hemicycle.layoutSeats(deputies)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            WidthDrivenAspect(ratio: Hemicycle.viewBox.width / Hemicycle.viewBox.height) {
                Canvas { context, size in
                    let scale = size.width / Hemicycle.viewBox.width
                    for seat in seats {
                        // Outer rings carry slightly larger dots, as on the website.
                        let radius = (4.6 + Double(seat.ring) * 0.22) * scale
                        let rect = CGRect(
                            x: seat.x * scale - radius, y: seat.y * scale - radius,
                            width: radius * 2, height: radius * 2
                        )
                        context.fill(Path(ellipseIn: rect), with: .color(Self.color(seat.position)))
                    }
                }
            }
            .accessibilityHidden(true)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), alignment: .leading)], alignment: .leading, spacing: 6) {
                ForEach(legend, id: \.position) { entry in
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Self.color(entry.position))
                            .frame(width: 10, height: 10)
                        Text("\(Self.label(entry.position)) \(entry.count)")
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Hémicycle")
        .accessibilityValue(summary)
        .accessibilityIdentifier("vote.hemicycle")
    }

    /// The positions present, in display order, with how many seats each has.
    var legend: [(position: Hemicycle.SeatPosition, count: Int)] {
        let counts = Dictionary(seats.map { ($0.position, 1) }, uniquingKeysWith: +)
        return Hemicycle.SeatPosition.allCases.compactMap { position in
            counts[position].map { (position, $0) }
        }
    }

    /// "12 pour, 4 contre, 1 abstention"
    var summary: String {
        legend.map { "\($0.count) \(Self.label($0.position).lowercased())" }.joined(separator: ", ")
    }

    static func label(_ position: Hemicycle.SeatPosition) -> String {
        position == .absent ? "Absent" : VotePositionBadge.label(position.rawValue)
    }

    static func color(_ position: Hemicycle.SeatPosition) -> Color {
        switch position {
        case .pour: Palette.positive
        case .contre: Palette.negative
        case .abstention: Palette.seatAbstention
        case .nonVotant: Palette.seatNonVotant
        case .absent: Palette.border
        }
    }
}

/// Sizes its content to the full proposed width and the height that keeps
/// `ratio`. A `Canvas` has no size of its own, and `aspectRatio` gives it none
/// when only a width is proposed (inside a scroll view), so the chart would
/// collapse to zero height.
private struct WidthDrivenAspect: Layout {
    let ratio: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        return CGSize(width: width, height: width / ratio)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for subview in subviews {
            subview.place(at: bounds.origin, proposal: ProposedViewSize(bounds.size))
        }
    }
}
