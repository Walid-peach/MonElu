# Guide d'écriture

Comment écrire le texte que lit un visiteur de MonÉlu, sur le site et dans l'application.
Le but est un français exact et précis, pas une liste de mots interdits (#635).

## Le test

Chaque phrase doit pouvoir être vérifiée par un lecteur.
« Chaque vote renvoie vers le scrutin officiel de l'Assemblée » se vérifie en un clic.
« Transparence totale » ne se vérifie pas : c'est une qualité qu'on s'attribue.
Si une phrase ne peut être ni vraie ni fausse, elle n'apprend rien au lecteur.

## Les chiffres

Un chiffre qui change vient de l'API, jamais du texte de la page.
« 1 200+ scrutins » était juste le jour où il a été écrit, et faux quelques mois plus tard.
`frontend/__tests__/app/visible-copy.test.ts` échoue si À propos écrit en dur un chiffre que `/health` fournit.
Un chiffre fixe par nature (577 sièges) peut rester écrit.

## Les promesses

Ne promettez que ce que le code fait aujourd'hui.
- La mise à jour a lieu chaque jour ouvré à 6 h UTC : pas « en temps réel », pas « en continu ».
- Les sources sont celles que lit un script de `scripts/ingest_*.py`, et aucune autre.
- Les résumés sont écrits par IA : ne dites jamais que MonÉlu n'interprète rien.
  Dites ce qu'ils sont, et signalez-les là où ils apparaissent (#634).
- Un modèle ou un outil se nomme par sa constante (`frontend/src/lib/aiModels.ts`), jamais par un nom recopié.

## La forme

- Pas de tiret cadratin (—) dans une phrase ou un titre.
  Utilisez la virgule, les deux-points, les parenthèses ou une nouvelle phrase.
  Le titre d'une page s'écrit « Sujet - MonÉlu ».
  Le tiret seul reste permis comme valeur vide dans un tableau.
- Pas d'appel à l'action passe-partout (« Découvrez… », « Plongez… ») : posez la question ou dites ce que fait le lien (« Quel député vote comme vous ? »).
- Le titre officiel d'un scrutin passe avant tout résumé (#634).
- Le français d'abord : « scrutin », « député », « texte de loi », pas « vote record » ou « bill ».

## Avant de publier

Relisez la page comme un journaliste qui cherche l'erreur.
Pour chaque affirmation, demandez-vous où le lecteur peut la vérifier.
