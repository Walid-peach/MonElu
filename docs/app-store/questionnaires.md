# App Store Connect questionnaires

The answers App Store Connect asks for outside the privacy label and the listing.
Checked against `ios/Project.swift`, `ios/Configs/App.xcconfig`, `rag/chain/prompts.py`, `rag/chain/rag_chain.py`, `rag/chain/verify.py`, `scripts/ingest_deputies.py` and the screens under `ios/Packages/MonEluFeatures/Sources/MonEluFeatures/`.

## App Information

| Field | Value |
|-------|-------|
| Name | See the listing files |
| Bundle ID | `<<PLACEHOLDER #451: final bundle id>>`; `MONELU_BUNDLE_ID` in `ios/Configs/App.xcconfig` is still the placeholder `fr.monelu.app.dev`, and the id cannot change once the record exists |
| SKU | `<<PLACEHOLDER #451: any unique internal string, for example monelu-ios>>` |
| Primary language | French (France): `developmentRegion` is `fr` in `ios/Project.swift` and every screen is in French |
| Primary category | Reference: the app is a searchable record of votes and deputies |
| Secondary category | News: optional, for the weekly feed of the Assemblée's votes |

The category is a choice, not a fact in the code; News as primary is the alternative.

## Pricing and Availability

- Price: free (Tier 0); no in-app purchase exists in the code.
- Availability: every country is allowed; France is where the subject matters.
- The app runs on iPhone only (`destinations: [.iPhone]` in `ios/Project.swift`, from which Tuist sets the device family).
  Untick "Make this app available on Mac" (Apple silicon) and visionOS unless they are tested.

## Age rating

**Recommended result: 4+.**
Answer every content question **None** and every capability question **No**:

| Question | Answer | Why |
|----------|--------|-----|
| Parental controls | No | None in the app |
| Age assurance | No | No account, no age check |
| Unrestricted web access | No | No web view; links to the website and the Assemblée open in Safari (`Link`, `ShareLink`) |
| User-generated content | No | Users see no other user's content in the app; a shared answer or quiz result is a link the user sends themselves |
| Messaging and chat | No | Demander is a question to an assistant, not a conversation between users |
| Advertising | No | No ad SDK, no ads |
| Cartoon or fantasy violence, realistic violence, prolonged graphic or sadistic violence | None | |
| Profanity or crude humour | None | |
| Mature or suggestive themes | None | |
| Horror or fear themes | None | |
| Medical or treatment information | None | |
| Alcohol, tobacco or drug use or references | None | |
| Sexual content or nudity, graphic sexual content and nudity | None | |
| Simulated gambling, contests, loot boxes | None | The quiz compares answers with votes; nothing is won or wagered |

### Why the assistant does not raise the rating

Demander's answers and verdicts are written by a language model, so its output counts as app content.
It is held to the voting record:

- the system prompt requires answers in French, factual and neutral, based exclusively on the sources retrieved from MonÉlu's database, and forbids completing them from the model's general knowledge (`build_system_prompt` in `rag/chain/prompts.py`, on the retrieval path; a question routed to SQL is answered from the database's rows, through `rag/chain/llm_router.py`);
- the verifier answers only with a JSON verdict citing vote ids from the list it was given, and its citations are checked against the `votes` table in code (`rag/chain/verify.py`);
- the temperature is 0.2 for answers and 0.0 for verdicts.

What it can repeat is the official title or text of a vote.
Some bills deal with crime, drugs, terrorism or sexual violence, and their titles name those subjects in legislative language, as a news or reference app would.
That is reference information, not depiction, which is why the content questions stay at None.
If Apple's form asks whether the app includes an AI assistant or generated content, answer Yes: the app labels it on screen ("Réponse assistée par IA", "Vérification assistée par IA").

## Content rights

**Does your app contain, show, or access third-party content?** Yes.
**Do you have all necessary rights?** Yes, on these grounds:

- **Votes, deputies, bills, agenda**: the Assemblée nationale's open data (data.assemblee-nationale.fr), published under the Licence Ouverte 2.0 (Etalab), which permits reuse, including commercial, with attribution.
  The app attributes it on every vote page ("Source : Assemblée nationale, scrutin n° … · Licence Ouverte 2.0") and links to `/licence-donnees` from Réglages.
- **Deputies' portraits**: the official photos the Assemblée publishes for each deputy (`https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/carre/<id>.jpg`, built in `scripts/ingest_deputies.py`), loaded by the device from that URL and shown next to the deputy's name.
  They are published by the Assemblée alongside the open data; check the Assemblée's legal notice for their reuse terms before submitting, since this repository records no separate licence for them.
- **Addresses and postal codes**: suggestions from the Base Adresse Nationale and geo.api.gouv.fr, public services under the Licence Ouverte; the app shows a suggestion only to let the user pick it.
- **Typeface**: Newsreader, bundled under the SIL Open Font License.

## Export compliance

**Does your app use encryption?** The question is answered by the build: `ITSAppUsesNonExemptEncryption` is `false` in the Info.plist (`ios/Project.swift`, #705), so App Store Connect does not ask on each upload.
If it asks anyway, the answer is: the app uses only the encryption built into the operating system, for HTTPS (`URLSession`), which is exempt.
No French ANSSI declaration is needed for exempt encryption.

## Other declarations

| Declaration | Answer | Why |
|-------------|--------|-----|
| Sign-in required | No | No account (see `review-notes.md`) |
| Uses the Advertising Identifier (IDFA) | No | No ad or analytics SDK; `NSPrivacyTracking` is false |
| Social networking | No | No profiles, followers or messages between users |
| Location services | No | No Core Location; a typed address is geocoded, not the device's position |
| Dating | No | |
| Government or official app | No | Independent service, not affiliated with the Assemblée nationale; see guideline 5.2 and the line in Réglages |
| Made for Kids | No | General audience |
| Digital Services Act trader status (EU) | `<<PLACEHOLDER #451: trader or non-trader, decided with the publisher>>` | A free app with no commercial activity may declare non-trader; a trader must publish an address, phone and email on the store page |
| Copyright line | `<<PLACEHOLDER #451: © 2026 publisher name>>` | |
