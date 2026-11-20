import MonEluCore
import MonEluUI
import SwiftUI

// The 2027 tab's sections (#718). Each takes plain models, so the whole screen
// is snapshot-tested without a network. Nothing here names a candidate, a
// programme or a recommendation: it shows what the Assemblée voted.

/// The hero: the countdown, or the month while no date is fixed, over a dotted
/// hemicycle that is decoration only.
struct ElectionHero: View {
    let election: AppConfiguration.Election
    /// The first date the figures cover, worded for the sentence.
    let coverageStart: String
    @Environment(\.today) private var today

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("AVANT L'URNE, LE BILAN")
                .font(.caption.weight(.bold))
                .tracking(1.2)
                .foregroundStyle(Palette.onIdentityAccent)
            Text("Trois ans de votes, avant de choisir.")
                .font(Typography.heading(.title))
                .foregroundStyle(Palette.onIdentity)
                .headingLineSpacing()
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text("Ce que l'Assemblée nationale a voté depuis le \(coverageStart), dans les chiffres qu'elle publie.")
                .font(.subheadline)
                .foregroundStyle(Palette.onIdentity.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
            Divider().overlay(Palette.onIdentity.opacity(0.2))
            HStack(alignment: .lastTextBaseline, spacing: Spacing.s) {
                Text(ElectionCalendar.headline(election, today: today))
                    .font(Typography.heading(.largeTitle))
                    .foregroundStyle(Palette.onIdentity)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(ElectionCalendar.caption(election, today: today))
                    .font(.footnote)
                    .foregroundStyle(Palette.onIdentity.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.cardPadding + Spacing.xxs)
        .background(alignment: .topTrailing) { DottedHemicycle().padding(.trailing, -60).padding(.top, -12) }
        .background(Palette.identityBackground)
        .clipShape(Radius.shape(Radius.large))
        .accessibilityIdentifier("election.hero")
    }
}

/// Concentric dotted arcs, the Assemblée's hemicycle as a texture.
private struct DottedHemicycle: View {
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height)
            for (index, radius) in [60.0, 78, 96, 114, 132].enumerated() {
                var arc = Path()
                arc.addArc(center: center, radius: radius, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
                let tint = index < 3 ? Palette.onIdentity.opacity(0.12) : Palette.onIdentityAccent.opacity(0.3)
                context.stroke(
                    arc, with: .color(tint),
                    style: StrokeStyle(lineWidth: 6, lineCap: .round, dash: [0.01, 10])
                )
            }
        }
        .frame(width: 300, height: 160)
        .accessibilityHidden(true)
    }
}

/// « La législature en chiffres »: four tiles and where they come from.
struct ElectionFiguresSection: View {
    let figures: ElectionFigures
    let coverage: String

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader("La législature en chiffres", subtitle: "17e législature")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: Spacing.xs), GridItem(.flexible())], spacing: Spacing.xs) {
                StatTile(value: MonEluFormat.count(figures.scrutins), label: "scrutins publics")
                StatTile(value: MonEluFormat.count(figures.adoptedTexts), label: "textes adoptés")
                StatTile(value: MonEluFormat.count(figures.censureMotions), label: "motions de censure")
                StatTile(
                    value: figures.medianPresenceRate.map { MonEluFormat.percent($0) } ?? "n.d.",
                    label: "présence médiane des députés"
                )
            }
            CaveatNote(
                "Source : Assemblée nationale, données ouvertes, depuis le \(coverage). Un texte adopté est un scrutin sur l'ensemble d'un texte : ce n'est pas le nombre de lois promulguées. La présence compte les non-votants comme présents."
            )
        }
    }
}

/// « Les votes qui ont compté »: the closest whole-text and motion scrutins.
struct ElectionKeyVotesSection: View {
    let votes: [ElectionKeyVote]
    @ScaledMetric private var cardWidth: CGFloat = 290

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader(
                "Les votes qui ont compté",
                subtitle: "Les textes entiers et les motions, du plus serré au plus large."
            ) {
                NavigationLink(value: AppRoute.votes) {
                    Text("Tout voir").frame(minHeight: 44).contentShape(Rectangle())
                }
                .accessibilityIdentifier("election.all-votes")
            }
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: Spacing.s) {
                    ForEach(Array(votes.enumerated()), id: \.element.id) { index, vote in
                        NavigationLink(value: AppRoute.vote(id: vote.id)) {
                            ElectionVoteCard(vote: vote, number: index + 1)
                                .frame(width: cardWidth)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, Spacing.gutter)
            }
            .padding(.horizontal, -Spacing.gutter)
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct ElectionVoteCard: View {
    let vote: ElectionKeyVote
    let number: Int
    @Environment(\.today) private var today

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            HStack(spacing: Spacing.xs) {
                PartyChip("S\(number) · \(vote.kind)", short: nil)
                if let result = vote.result { VoteResultBadge(result: result) }
                Spacer(minLength: 0)
                if let date = vote.date {
                    Text(MonEluFormat.listDay(date, today: today))
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Text(vote.title.capitalizingFirstLetter)
                .font(Typography.heading(.headline))
                .foregroundStyle(Palette.textPrimary)
                .headingLineSpacing()
                .lineLimit(4)
                .multilineTextAlignment(.leading)
            VoteSplitBar(pour: vote.votesFor, contre: vote.votesAgainst, abstention: vote.abstentions, size: .large)
            HStack {
                count(vote.votesFor, "pour", Palette.positiveText)
                Spacer()
                count(vote.abstentions, "abst.", Palette.abstentionText)
                Spacer()
                count(vote.votesAgainst, "contre", Palette.negativeText)
            }
            .font(.footnote)
            Text("Écart : \(MonEluFormat.count(vote.margin)) voix")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textPrimary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.cardPadding)
        .surface()
        .accessibilityElement(children: .combine)
    }

    private func count(_ value: Int, _ label: String, _ color: Color) -> some View {
        Text("\(Text(MonEluFormat.count(value)).bold().foregroundStyle(color)) \(Text(label).foregroundStyle(Palette.textSecondary))")
    }
}

/// « Qui a voté quoi »: each group's majority on each key vote. Pour is a
/// filled dot, contre a ring, abstention a dash, so shape and color both say it.
struct ElectionGridSection: View {
    let rows: [ElectionGridRow]
    let voteCount: Int
    @ScaledMetric private var labelWidth: CGFloat = 56

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader(
                "Qui a voté quoi",
                subtitle: "La position majoritaire de chaque groupe sur ces scrutins. Touchez une case pour ouvrir le scrutin."
            )
            VStack(spacing: 0) {
                HStack(spacing: 0) {
                    Color.clear.frame(width: labelWidth, height: 1)
                    ForEach(0..<voteCount, id: \.self) { index in
                        Text("S\(index + 1)")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Palette.textSecondary)
                            .frame(maxWidth: .infinity)
                    }
                }
                .accessibilityHidden(true)
                ForEach(rows) { row in
                    CardRowDivider()
                    HStack(spacing: 0) {
                        Group {
                            if let short = row.partyShort { PartyChip(short: short) } else { Text(row.label).font(.caption) }
                        }
                        .frame(width: labelWidth, alignment: .leading)
                        ForEach(Array(row.cells.enumerated()), id: \.offset) { index, cell in
                            NavigationLink(value: AppRoute.vote(id: cell.voteID)) {
                                PositionMark(position: cell.position)
                                    .frame(maxWidth: .infinity, minHeight: 36)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(row.partyShort ?? row.label), scrutin \(index + 1), \(PositionMark.spoken(cell.position))")
                        }
                    }
                }
                CardRowDivider()
                legend.padding(.top, Spacing.xs)
            }
            .padding(Spacing.s)
            .surface()
            .accessibilityIdentifier("election.grid")
        }
    }

    private var legend: some View {
        HStack(spacing: Spacing.m) {
            ForEach(["pour", "contre", "abstention"], id: \.self) { position in
                HStack(spacing: Spacing.xxs) {
                    PositionMark(position: position, scale: 0.75)
                    Text(position.capitalizingFirstLetter)
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Pour : disque plein. Contre : anneau. Abstention : tiret.")
    }
}

/// The three marks. A group with no majority shows a short neutral line.
struct PositionMark: View {
    let position: String?
    var scale: CGFloat = 1

    static func spoken(_ position: String?) -> String {
        switch position {
        case "pour": "pour"
        case "contre": "contre"
        case "abstention": "abstention"
        default: "pas de majorité"
        }
    }

    var body: some View {
        switch position {
        case "pour":
            Circle().fill(Palette.positive).frame(width: 14 * scale, height: 14 * scale)
        case "contre":
            Circle().strokeBorder(Palette.negative, lineWidth: 3 * scale).frame(width: 14 * scale, height: 14 * scale)
        case "abstention":
            Capsule().fill(Palette.seatAbstention).frame(width: 14 * scale, height: 4 * scale)
        default:
            Capsule().fill(Palette.textMuted).frame(width: 8 * scale, height: 2 * scale)
        }
    }
}

/// « Entendu en campagne ? »: a claim goes to the existing verify feature.
struct ElectionVerifyCard: View {
    @Binding var claim: String
    let onVerify: () -> Void

    private var canVerify: Bool { ChatAnswer.claimLength.contains(claim.trimmingCharacters(in: .whitespacesAndNewlines).count) }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("ENTENDU EN CAMPAGNE ?")
                .font(.caption.weight(.bold))
                .tracking(1.2)
                .foregroundStyle(Palette.accent)
            Text("Vérifiez une phrase contre les votes.")
                .font(Typography.heading(.title2))
                .foregroundStyle(Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            TextField("Collez ou dictez ce que vous avez entendu", text: $claim, axis: .vertical)
                .lineLimit(3...6)
                .padding(Spacing.s)
                .background(Palette.pageBackground, in: Radius.shape(Radius.card))
                .accessibilityIdentifier("election.claim")
            Button("Vérifier dans les votes", action: onVerify)
                .buttonStyle(.monEluPrimary)
                .disabled(!canVerify)
                .accessibilityIdentifier("election.verify")
            CaveatNote("La réponse cite les scrutins enregistrés, ou dit qu'on ne peut pas vérifier.")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.cardPadding)
        .surface()
    }
}

/// The quiz invitation, on the navy identity background.
struct ElectionQuizCard: View {
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: Spacing.s) {
                VStack(alignment: .leading, spacing: Spacing.xxs) {
                    Text("LE QUIZ 2027")
                        .font(.caption.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(Palette.onIdentityAccent)
                    Text("De quel groupe votez-vous le plus près ?")
                        .font(Typography.heading(.title3))
                        .foregroundStyle(Palette.onIdentity)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("10 vrais scrutins. Rien n'est enregistré.")
                        .font(.footnote)
                        .foregroundStyle(Palette.onIdentity.opacity(0.9))
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.right")
                    .font(.body.weight(.bold))
                    .foregroundStyle(Palette.identityBackground)
                    .frame(width: 44, height: 44)
                    .background(Palette.onIdentityAccent, in: Circle())
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.cardPadding)
            .background(Palette.identityBackground, in: Radius.shape(Radius.large))
        }
        .buttonStyle(.plain)
        .accessibilityHint("Ouvre l'onglet Quiz")
        .accessibilityIdentifier("election.quiz")
    }
}

/// What the deputy card shows, every figure from the API.
struct DeputyReview: Hashable, Sendable {
    let deputy: DeputyItem
    let presenceRate: Double
    /// pour + contre + abstention, as the API counted them.
    let votesCast: Int
    /// 0 to 1; nil when the alignment did not load.
    let alignmentRate: Double?
}

/// « Votre député, bilan de mandat ».
struct ElectionDeputyCard: View {
    let review: DeputyReview

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            NavigationLink(value: AppRoute.deputy(id: review.deputy.id)) {
                HStack(spacing: Spacing.s) {
                    DeputyPortrait(name: review.deputy.name, url: review.deputy.photoURL, size: 52)
                    VStack(alignment: .leading, spacing: Spacing.xxs) {
                        Text(review.deputy.name)
                            .font(.headline)
                            .foregroundStyle(Palette.textPrimary)
                            .multilineTextAlignment(.leading)
                        if let place = place {
                            Text(place).font(.footnote).foregroundStyle(Palette.textSecondary)
                        }
                    }
                    Spacer(minLength: 0)
                    if let short = review.deputy.groupShort { PartyChip(short: short) }
                }
            }
            .buttonStyle(.plain)
            HStack(alignment: .top, spacing: Spacing.xs) {
                tile(MonEluFormat.percent(review.presenceRate), "présence aux scrutins")
                tile(MonEluFormat.count(review.votesCast), "scrutins votés")
                tile(review.alignmentRate.map { MonEluFormat.percent($0) } ?? "n.d.", "votes avec son groupe")
            }
            .fixedSize(horizontal: false, vertical: true)
            NavigationLink(value: AppRoute.deputy(id: review.deputy.id)) {
                Text("Voir ses votes de la législature").frame(minHeight: 44).contentShape(Rectangle())
            }
            .font(.subheadline.weight(.semibold))
            .tint(Palette.accent)
            .accessibilityIdentifier("election.deputy-votes")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.cardPadding)
        .surface()
    }

    private var place: String? {
        [review.deputy.department, review.deputy.circonscription.map { "circonscription \($0)" }]
            .compactMap { $0 }.joined(separator: ", ").nilIfEmpty
    }

    private func tile(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: Spacing.xxs) {
            Text(value).font(Typography.heading(.title3)).foregroundStyle(Palette.textPrimary).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(Palette.textSecondary).fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(Spacing.xs)
        .background(Palette.pageBackground, in: Radius.shape(Radius.card))
        .accessibilityElement(children: .combine)
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

/// With no followed deputy: the existing find-my-deputy entry.
struct ElectionFindDeputyCard: View {
    let onFind: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            Text("Suivez votre député pour voir son bilan : présence, votes, accord avec son groupe.")
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Trouver mon député", action: onFind)
                .buttonStyle(.monEluPrimary)
                .accessibilityIdentifier("election.find-deputy")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Spacing.cardPadding)
        .surface()
    }
}

/// « Le calendrier ».
struct ElectionCalendarSection: View {
    let election: AppConfiguration.Election

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s) {
            SectionHeader("Le calendrier")
            let steps = ElectionCalendar.steps(election)
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    HStack(alignment: .top, spacing: Spacing.s) {
                        Circle().strokeBorder(Palette.accent, lineWidth: 2)
                            .frame(width: 12, height: 12)
                            .padding(.top, 4)
                            .frame(width: 14)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(step.when).font(.footnote.weight(.semibold)).foregroundStyle(Palette.accent)
                            Text(step.title).font(.headline).foregroundStyle(Palette.textPrimary)
                            Text(step.note).font(.footnote).foregroundStyle(Palette.textSecondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, index < steps.count - 1 ? Spacing.m : 0)
                        .accessibilityElement(children: .combine)
                    }
                    // The line to the next step fills the row, whatever its height.
                    .background(alignment: .topLeading) {
                        if index < steps.count - 1 {
                            Rectangle().fill(Palette.border).frame(width: 2).padding(.leading, 6).padding(.top, 18)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Spacing.cardPadding)
            .surface()
            Link(destination: ElectionLinks.checkRegistration) {
                Text("Vérifier mon inscription sur service-public.fr").frame(minHeight: 44)
            }
            .font(.subheadline.weight(.semibold))
            .tint(Palette.accent)
            .accessibilityIdentifier("election.registration")
        }
    }
}

enum ElectionLinks {
    /// The state's own "interroger sa situation électorale" service.
    static let checkRegistration = URL(string: "https://www.service-public.fr/particuliers/vosdroits/services-en-ligne-et-formulaires/ISE")!
}

/// The neutrality statement that closes the tab.
struct ElectionFooter: View {
    var body: some View {
        HStack(alignment: .top, spacing: Spacing.xs) {
            Image(systemName: "checkmark.shield")
                .foregroundStyle(Palette.textSecondary)
                .accessibilityHidden(true)
            Text("MonÉlu ne soutient aucun candidat ni aucun parti. Chaque chiffre de cet onglet vient des données publiées par l'Assemblée nationale, mesuré pour tous avec la même formule.")
                .font(.footnote)
                .foregroundStyle(Palette.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, Spacing.m)
        .overlay(alignment: .top) { CardRowDivider() }
        .accessibilityElement(children: .combine)
    }
}
