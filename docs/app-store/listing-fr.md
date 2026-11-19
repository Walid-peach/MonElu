# Fiche App Store, français (France)

Le texte de la page de version en français, à coller champ par champ dans App Store Connect.
Chaque bloc `text` se copie tel quel ; les limites de longueur sont celles d'App Store Connect, et la longueur de chaque champ est indiquée.
Vérifié contre les écrans de `ios/Packages/MonEluFeatures/Sources/MonEluFeatures/`, `api/app_config_data.py` (`DATA_HORIZON`) et `.github/workflows/ingest_prod.yml` (mise à jour chaque jour ouvré).
Suit [`docs/writing-guide.md`](../writing-guide.md) : aucune affirmation invérifiable, aucun chiffre qui change.

## Nom (30 caractères au plus)

```text
MonÉlu
```

6 caractères.
Si le nom est déjà pris sur l'App Store, utiliser `MonÉlu : votes des députés` (26 caractères).

## Sous-titre (30 caractères au plus)

```text
Les votes de vos députés
```

24 caractères.

## Texte promotionnel (170 caractères au plus)

Modifiable à tout moment sans nouvelle version.

```text
Chaque scrutin de l'Assemblée nationale depuis le 1er juillet 2025, député par député. Service indépendant, non affilié à l'Assemblée nationale.
```

144 caractères.

## Description (4 000 caractères au plus)

```text
MonÉlu montre comment votent les députés de l'Assemblée nationale, scrutin par scrutin, en français courant.
Service indépendant, non affilié à l'Assemblée nationale.

VOTRE DÉPUTÉ
• Trouvez votre député avec votre adresse ou votre code postal, et suivez-le depuis l'accueil.
• Chaque semaine, l'accueil montre les grands votes de l'Assemblée et la position des députés que vous suivez.
• Le profil d'un député donne ses votes, sa présence aux scrutins et les votes où il s'écarte de son groupe.
• Comparez les votes de deux députés.

EXPLORER
• Tous les scrutins publics depuis le 1er juillet 2025, avec le résultat officiel, l'hémicycle et la position de chaque groupe.
• Les textes votés et leur parcours, l'agenda de la semaine, les thèmes, les groupes politiques et les départements.

LE QUIZ
• Quel député vote comme vous ?
• Répondez pour, contre ou abstention à de vrais scrutins, puis voyez quels députés ont voté comme vous.

DEMANDER
• Posez une question sur les votes et les députés : la réponse cite ses sources.
• Collez une affirmation sur le vote d'un député : elle est comparée aux scrutins officiels et reçoit un verdict (vrai, faux, trompeur ou invérifiable), avec les scrutins cités.
• Ces réponses sont assistées par IA et signalées comme telles : le scrutin officiel fait foi.

LES DONNÉES
• Données officielles de l'Assemblée nationale, réutilisées sous Licence Ouverte 2.0.
• Mises à jour chaque jour ouvré.
• Chaque scrutin renvoie vers sa source officielle.
• Les résumés en langage clair sont écrits par IA à partir du texte officiel, et signalés comme tels.

VOTRE VIE PRIVÉE
• Aucun compte, aucune publicité, aucun traçage.
• Les députés et les thèmes que vous suivez restent sur votre iPhone.
```

## Mots-clés (100 caractères au plus, séparés par des virgules)

Les mots du nom et du sous-titre sont déjà indexés : ils ne sont pas répétés ici.

```text
assemblée,nationale,scrutin,loi,parlement,hémicycle,circonscription,élu,politique,amendement,quiz
```

97 caractères.

## URL

| Champ | Valeur |
|-------|--------|
| URL d'assistance | `<<PLACEHOLDER #419: https://<domaine>/contact>>` |
| URL marketing | `<<PLACEHOLDER #419: https://<domaine>/application>>` |

## D'où vient chaque affirmation

- Adresse ou code postal : `MonDeputeViews.swift`, `LiveAddressService`, `LivePostalCodeService`.
- Accueil, « Pour vous » et « À l'Assemblée » : `HomeScreen.swift`, `FeedService.swift`.
- Présence, votes divergents, comparaison : `DeputyProfileScreen.swift`, `DissidentVotesScreen.swift`, `CompareScreen.swift`.
- Résultat officiel, hémicycle, source : `VoteDetailScreen.swift` ; le résultat est repris de l'Assemblée, jamais recalculé (caveat `vote_result`).
- Textes, agenda, thèmes, groupes, départements : les tuiles et sections d'`ExploreScreen.swift`.
- Verdicts et mention IA : `AskModel.swift`, `AskViews.swift` (`AIGeneratedLabel`).
- Résumés écrits par IA à partir du texte officiel : caveat `summary_official_text`, `SummaryLabel.swift`.
- Rien ne quitte l'iPhone pour les suivis : `FollowedDeputyStore`, `FollowedThemesStore` (`UserDefaults`), et `app-privacy.md`.
- « Depuis le 1er juillet 2025 » est `DATA_HORIZON` : à changer ici le jour où il change.
