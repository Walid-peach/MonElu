# App Review Information

What to enter on the App Review Information section of the version page.
Checked against `ios/MonElu/Sources/RootTabView.swift`, `ios/MonElu/Sources/LaunchGate.swift`, `ios/Packages/MonEluFeatures/Sources/MonEluFeatures/` (Ask, Home, Explore, Quiz, Settings, Votes), `api/app_config_data.py` and the `tiered_limit` decorators in `api/routers/search.py` and `api/routers/verify.py`.

## Sign-in information

**Sign-in required:** No (untick the box).
The app has no account: `MonEluAccount` is an empty module until #434, and reading never requires one (ADR-040 §6, rule 7 of `ios/CLAUDE.md`).

## Contact information

- First name, last name: `<<PLACEHOLDER #451: review contact name>>`
- Phone: `<<PLACEHOLDER #451: review contact phone>>`
- Email: `<<PLACEHOLDER #451: review contact email>>`

## Attachment

None needed.

## Notes

Paste the block below into the Notes field (limit 4,000 characters; this text is about 3,500).

```text
WHAT THE APP IS
MonÉlu shows how the deputies of the French Assemblée nationale vote, scrutin by scrutin.
It is an independent service, not affiliated with the Assemblée nationale or any public body. Réglages says so: "Service indépendant, non affilié à l'Assemblée nationale."
All data is the Assemblée nationale's official open data (data.assemblee-nationale.fr), reused under the French government's Licence Ouverte 2.0, which allows reuse with attribution. Every vote page cites "Source : Assemblée nationale · Licence Ouverte 2.0" and links to the official record.
The interface is in French.

NO ACCOUNT
Every feature works without signing in. There is no account, no purchase, no advertising and no tracking. Followed deputies and display settings stay on the device.

HOW TO REACH EACH SCREEN
The tab bar has four tabs.
1. Accueil: the week's votes. "À l'Assemblée" shows the whole chamber. Tap "Trouvez votre député", type an address (for example "126 rue de l'Université, Paris") or a postal code (75007), and follow a deputy: "Pour vous" then shows that deputy's votes. The toolbar opens the Agenda (calendar icon) and Réglages (gear icon), where the privacy policy, methodology and data licence are linked.
2. Explorer: tiles for Votes, Députés, Textes and Agenda, then themes, parliamentary groups and departments, and a search field. A vote shows the official result, the hemicycle and each group's positions. A deputy's page shows their votes and presence, and "Comparer" compares two deputies.
3. Quiz: answer real votes with pour, contre or abstention. After at least 3 answers, the app lists the deputies who voted most like you. Sharing the result is optional.
4. Demander: ask a question about deputies and votes, for example "Comment a voté l'Assemblée sur le budget ?". The answer cites its sources and is labelled "Réponse assistée par IA". The segmented control at the top switches to checking a claim, which returns a verdict (vrai, faux, trompeur, invérifiable) with the votes it cites, labelled "Vérification assistée par IA". The screen links to the page naming the AI model and its host.

REMOTE SWITCHES: NOTHING IS HIDDEN
The two Demander features call a third-party AI provider. So that an outage can be handled without an app release, GET /app/config returns two switches, features.chat and features.verify, which the operator can turn off. Both are on by default and will stay on during review: every feature in this build is visible with no special action.
They can only remove a feature, never reveal one:
- chat off: the Demander tab shows "Assistant indisponible" and points to the other tabs;
- verify off: the segmented control disappears and Demander answers questions only.
The same endpoint carries a minimum app version (1.0.0 by default; a lower installed version sees a screen asking to update) and the wording of the data caveats shown beside figures. Nothing else is configured remotely.

RATE LIMITS
Questions and claim checks are limited to 10 per minute per IP address. Over the limit the app says "Trop de questions en peu de temps. Patientez une minute et réessayez." If several testers share one network address, please wait a minute and try again.
If the AI provider is down, Demander says "L'assistant n'est pas disponible pour le moment." All other tabs keep working.

WHAT IS STORED
Each claim checked in Demander is stored with its verdict, without any identity. A shared answer, a shared quiz result or a feedback vote is stored only when the user taps share or feedback.
```

## Why each paragraph is there

- **What the app is**: guideline 5.2 (the official data must not read as an official app) and 5.1.1 (where the data comes from).
- **Remote switches**: guidelines 2.1 and 2.5.19 ask that a reviewer can reach every feature and that remote configuration does not change what the app does after review.
  The switches are `FEATURE_ENV_VARS` in `api/app_config_data.py`, on by default (`feature_enabled`), and the app's behaviour when they are off is `AskScreen` and `AskUnavailable` in `Ask/AskScreen.swift` and `Ask/AskViews.swift`.
- **Rate limits**: `tiered_limit(10)` on `POST /search/` and `POST /verify/`, keyed per IP for anonymous callers (`api/limiter.py`); App Review testers often share one address.
  The messages are `AskLabels.failure` in `Ask/AskViews.swift`.
- **What is stored**: matches `app-privacy.md`.
