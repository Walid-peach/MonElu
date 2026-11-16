import Foundation

/// Made-up pages for the detail screens' loading placeholders (#699).
///
/// None of these values is ever read: each screen draws its own content view
/// over them under `.skeleton()`, so only their shape shows, as grey blocks.
/// They are sized like a typical page so the header and first section sit
/// where the real ones will. No figure here comes from the API or is computed.
enum PagePlaceholders {
    static let date = Date(timeIntervalSince1970: 1_791_633_600)

    static let vote = VoteDetail(
        item: VoteItem(
            id: "placeholder", title: "l'ensemble du projet de loi relatif à la simplification de la vie économique",
            date: date, result: "adopté",
            summary: "Un résumé de trois lignes environ, qui tient la place du résumé en langage clair du texte voté.",
            theme: "Économie", votesFor: 300, votesAgainst: 200, abstentions: 30, summaryBasis: "official_text"
        ),
        votesFor: 300, votesAgainst: 200, abstentions: 30, positions: [], dossierTitle: nil, dossierURL: nil,
        totalVoters: 530, voteType: "Scrutin public ordinaire"
    )

    /// The profile header only: a profile loads its other sections after it,
    /// each joining the page as it lands.
    static let deputy = DeputyProfilePage(
        profile: DeputyProfile(deputy: DeputyItem.placeholders[0], mandateStart: date, mandateEnd: nil),
        scorecard: nil, recentVotes: nil
    )

    static let loi = LoiPage(
        loi: Loi(
            id: "placeholder", title: "Projet de loi relatif à la simplification de la vie économique",
            procedure: "Projet de loi ordinaire", status: "en_navette", statusLabel: nil, currentStage: nil, anURL: nil,
            predatesCoverage: false,
            parcours: (0..<3).map { index in
                LoiActe(
                    id: "placeholder-\(index)", parentID: nil, depth: 0, code: "AN1-DEBATS-SEANCE",
                    label: "Discussion en séance publique", date: date, outcome: nil,
                    scrutins: [scrutin(index)], amendementCount: 12, articleCount: 4
                )
            },
            unattachedScrutins: []
        ),
        nextSitting: nil
    )

    static let lois = LoiList(
        items: (0..<6).map { index in
            LoiListItem(
                id: "placeholder-\(index)", title: titles[index % titles.count], status: "en_navette", lastVote: date,
                theme: "Économie", headlineCount: 2
            )
        },
        total: 6
    )

    static let group = GroupPage(
        slug: "placeholder", name: "Ensemble pour la République", short: "EPR", memberCount: 90,
        averagePresence: 0.5, averageDissidence: 0.05,
        members: DeputyItem.placeholders.map { GroupMember(deputy: $0, presenceRate: 0.5, dissidentRate: 0.05) },
        mostDissident: [], dividedVotes: (0..<3).map(dividedVote), seatRank: 2
    )

    static let department = DepartmentPage(
        code: "00", name: "Bouches-du-Rhône", deputyCount: 4,
        composition: [DepartmentGroupCount(group: nil, short: "EPR", count: 4)],
        deputies: DeputyItem.placeholders.prefix(4).map { DepartmentDeputy(deputy: $0, solennelRate: 0.5) },
        splitVotes: (0..<3).map(dividedVote)
    )

    static let theme = ThemePage(
        slug: "placeholder", name: "Économie", voteCount: 120, adoptionRate: 0.5,
        mostDivided: ThemeDividedVote(id: "placeholder", title: titles[0], date: date, votesFor: 250, votesAgainst: 240),
        partyPositions: [], votes: Array(VoteItem.placeholders.prefix(4))
    )

    static let agenda = AgendaWeek(
        from: "2026-10-12", to: "2026-10-18",
        days: (0..<2).map { day in
            AgendaDay(
                date: day == 0 ? "2026-10-13" : "2026-10-14",
                items: (0..<3).map { index in
                    AgendaEntry(
                        id: "placeholder-\(day)-\(index)", start: date, pointType: "Discussion",
                        summary: "Une ligne de résumé qui tient la place du point inscrit à l'ordre du jour.",
                        objet: titles[index % titles.count], theme: nil, voteID: nil, result: nil, dossierURL: nil
                    )
                }
            )
        }
    )

    private static let titles = [
        "Projet de loi relatif à la simplification de la vie économique",
        "Proposition de loi visant à renforcer la sécurité des mobilités",
        "Projet de loi de finances pour l'année prochaine",
    ]

    private static func scrutin(_ index: Int) -> LoiScrutin {
        LoiScrutin(
            id: "placeholder-\(index)", title: titles[index % titles.count], date: date, result: "adopté",
            votesFor: 300, votesAgainst: 200, abstentions: 30
        )
    }

    private static func dividedVote(_ index: Int) -> GroupDividedVote {
        GroupDividedVote(
            id: "placeholder-\(index)", title: titles[index % titles.count], date: date, result: "adopté",
            pour: 40, contre: 30, abstention: 5
        )
    }
}
