import MonEluCore
import MonEluUI
import SwiftUI

/// What the Accueil feed shows (#564, #565): everything followed, or one
/// follow alone after a tap on its circle.
public enum FeedFilter: Hashable, Sendable {
    case all
    case deputy
    case theme(String)
}

/// One circle of the follows row: the followed deputy or a followed theme,
/// and whether something new arrived since it was last seen (the red ring).
public struct FollowCircle: Identifiable, Hashable, Sendable {
    public enum Kind: Hashable, Sendable {
        case deputy(name: String, photoURL: URL?)
        case theme(ReferenceData.Theme)
    }

    public let kind: Kind
    public var hasNews: Bool

    public init(_ kind: Kind, hasNews: Bool = false) {
        self.kind = kind
        self.hasNews = hasNews
    }

    public var id: String {
        switch kind {
        case .deputy: "deputy"
        case .theme(let theme): "theme:\(theme.slug)"
        }
    }

    /// The filter a tap on this circle selects.
    public var filter: FeedFilter {
        switch kind {
        case .deputy: .deputy
        case .theme(let theme): .theme(theme.slug)
        }
    }

    var label: String {
        switch kind {
        case .deputy: "Mon député"
        case .theme(let theme): theme.name
        }
    }

    /// The circles for what is followed: the deputy first, then the themes in
    /// the order they were followed.
    public static func circles(
        deputy: DeputyItem?, themeSlugs: [String], themes: [ReferenceData.Theme], news: Set<String> = []
    ) -> [FollowCircle] {
        var circles: [FollowCircle] = []
        if let deputy {
            circles.append(FollowCircle(.deputy(name: deputy.name, photoURL: deputy.photoURL)))
        }
        let bySlug = Dictionary(themes.map { ($0.slug, $0) }, uniquingKeysWith: { first, _ in first })
        circles += themeSlugs.compactMap { bySlug[$0] }.map { FollowCircle(.theme($0)) }
        return circles.map { circle in
            var circle = circle
            circle.hasNews = news.contains(circle.id)
            return circle
        }
    }
}

/// The SF Symbol drawn in a theme's circle. Presentation only: the themes
/// themselves come from `themes.json`, and a slug this does not know gets a
/// generic tag rather than nothing.
enum ThemeSymbol {
    static func name(for slug: String) -> String {
        switch slug {
        case "economie-budget": "eurosign"
        case "sante-social": "cross.case"
        case "justice-securite": "shield"
        case "energie-environnement": "leaf"
        case "education-culture": "book"
        case "agriculture": "carrot"
        case "transport-logement": "house"
        case "institutions": "building.columns"
        case "international": "globe.europe.africa"
        case "autre": "square.grid.2x2"
        default: "tag"
        }
    }
}

/// The row of followed circles at the top of Accueil (design « Accueil V1 »).
/// A tap filters the feed to that follow, a second tap shows everything
/// again; the last circle opens the sheet to follow more.
struct FollowsRow: View {
    let circles: [FollowCircle]
    @Binding var filter: FeedFilter
    var onAdd: () -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(circles) { circle in
                    let selected = filter == circle.filter
                    Button {
                        filter = selected ? .all : circle.filter
                    } label: {
                        FollowCircleLabel(circle: circle, selected: selected)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(circle.label)
                    .accessibilityValue(circle.hasNews ? "Du nouveau" : "")
                    .accessibilityHint(selected ? "Affiche à nouveau tout le fil" : "Filtre le fil")
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("follows.\(circle.id)")
                }
                Button(action: onAdd) {
                    FollowCircleFrame(label: "Suivre", selected: false) {
                        Circle()
                            .strokeBorder(Palette.textMuted, style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                            .overlay {
                                Image(systemName: "plus")
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(Palette.textPrimary)
                            }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Suivre un député ou un thème")
                .accessibilityIdentifier("follows.add")
            }
            .padding(.horizontal, 16)
            // As tall as its labels at every text size, rather than clipped to
            // the scroll view's first measured height.
            .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("home.follows")
    }
}

private struct FollowCircleLabel: View {
    let circle: FollowCircle
    let selected: Bool

    var body: some View {
        FollowCircleFrame(label: circle.label, selected: selected) {
            ZStack {
                Circle()
                    .strokeBorder(
                        circle.hasNews ? Palette.accent : Palette.border,
                        lineWidth: circle.hasNews ? 2.5 : 1.5
                    )
                content
                    .padding(5)
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch circle.kind {
        case .deputy(let name, let photoURL):
            DeputyPortrait(name: name, url: photoURL, size: followDiscDiameter - 10)
        case .theme(let theme):
            Circle()
                .fill(Palette.cardBackground)
                .overlay {
                    Image(systemName: ThemeSymbol.name(for: theme.slug))
                        .font(.title3)
                        .foregroundStyle(Palette.textPrimary)
                }
                .overlay(Circle().strokeBorder(Palette.border, lineWidth: 1))
        }
    }
}

/// The disc of every follow circle, in points.
private let followDiscDiameter: CGFloat = 64

/// The fixed-size disc and the label under it. The disc does not grow with
/// Dynamic Type; the label does, and wraps within a width that scales with it.
private struct FollowCircleFrame<Disc: View>: View {
    let label: String
    let selected: Bool
    @ViewBuilder var disc: Disc
    @ScaledMetric(relativeTo: .caption) private var labelWidth: CGFloat = 76

    var body: some View {
        VStack(spacing: 6) {
            disc
                .frame(width: followDiscDiameter, height: followDiscDiameter)
            Text(label)
                .font(selected ? .caption.weight(.bold) : .caption.weight(.medium))
                .foregroundStyle(selected ? Palette.accent : Palette.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .frame(width: labelWidth)
        }
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
    }
}

/// The sheet behind « Suivre »: the deputy to change, and the ten themes to
/// follow or stop following. Changes apply at once and stay on the device.
struct FollowsSheet: View {
    let deputyName: String?
    let themes: [ReferenceData.Theme]
    let followed: Set<String>
    var onToggle: (String) -> Void
    var onChooseDeputy: () -> Void
    var onDone: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button(action: onChooseDeputy) {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(deputyName ?? "Trouver votre député")
                                    .foregroundStyle(Palette.textPrimary)
                                if deputyName != nil {
                                    Text("Changer de député")
                                        .font(.subheadline)
                                        .foregroundStyle(Palette.accent)
                                }
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Palette.textMuted)
                                .accessibilityHidden(true)
                        }
                    }
                    .accessibilityIdentifier("follows.sheet.deputy")
                } header: {
                    Text("Votre député")
                }
                Section {
                    ForEach(themes) { theme in
                        Toggle(isOn: Binding(
                            get: { followed.contains(theme.slug) },
                            set: { _ in onToggle(theme.slug) }
                        )) {
                            Label(theme.name, systemImage: ThemeSymbol.name(for: theme.slug))
                                .foregroundStyle(Palette.textPrimary)
                        }
                        .tint(Palette.accent)
                        .accessibilityIdentifier("follows.sheet.theme.\(theme.slug)")
                    }
                } header: {
                    Text("Thèmes")
                } footer: {
                    Text("Vos suivis restent sur cet iPhone. Ils servent seulement à choisir ce que montre l'Accueil.")
                }
            }
            .navigationTitle("Suivre")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK", action: onDone)
                }
            }
        }
    }
}
