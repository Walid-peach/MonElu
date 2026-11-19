# App Privacy

The answers to the App Privacy questionnaire in App Store Connect, which become the privacy label on the App Store page.
They must say the same thing as `ios/MonElu/Resources/PrivacyInfo.xcprivacy` and the website's `/confidentialite`.

Checked against the privacy manifest, every API call the app makes (the generated client's operations used under `ios/Packages/*/Sources`), `LivePostalCodeService` and `LiveAddressService`, the `INSERT` statements in `api/routers/verify.py`, `search.py`, `quiz.py` and `feedback.py`, and the Sentry setup in `api/main.py`.
Apple counts data as collected when it leaves the device and is kept longer than it takes to answer the request.

## Privacy Policy URL

`<<PLACEHOLDER #419: https://<domain>/confidentialite>>`
Today the page answers at `https://mon-elu.vercel.app/confidentialite`; use the final domain once #419 lands.

## Data collection

**Do you or your third-party partners collect data from this app?** Yes.

Select one data type:

| Data type | Linked to the user's identity | Used for tracking | Purpose |
|-----------|-------------------------------|-------------------|---------|
| User Content > **Other User Content** | No | No | App Functionality |

This is the manifest's single `NSPrivacyCollectedDataTypeOtherUserContent` entry, with `Linked` false, `Tracking` false and the `AppFunctionality` purpose.
What it covers, each stored without any identity (no account, no device identifier, no IP address in the rows):

- every claim checked in Demander, stored with its verdict behind a public share URL (`POST /verify/`, table `verifications`);
- an answer the user chooses to share (`POST /search/share`, table `chat_shares`);
- a quiz result the user chooses to share (`POST /quiz/share`, table `quiz_shares`), with the answers only when the user turns on the option to include them;
- a thumbs up or down on an answer, which stores the question, the answer and its sources (`POST /feedback/chat`, table `feedback`).

## Data types to leave unselected

Each of these is either never sent or sent only to answer one request and not kept.

- **Contact Info, Health, Financial, Contacts, Browsing History, Purchases**: the app asks for none of them.
- **Location**: the app does not use Core Location.
  A typed address goes from the device to the Base Adresse Nationale's geocoder (data.geopf.fr), a postal code to geo.api.gouv.fr, both through an ephemeral session; MonÉlu receives only the chosen point, in `POST /circonscriptions/locate`, which neither stores nor logs it, and `_drop_private_request_bodies` keeps it out of Sentry.
- **Identifiers, Usage Data**: no analytics or advertising SDK, no device or user identifier (rule 8 of `ios/CLAUDE.md`, `NSPrivacyTracking` false).
- **Diagnostics**: the app embeds no crash or performance SDK today; this changes if the Sentry SDK rule 8 plans is added.
- **Search History**: a question asked in Demander is not stored in the database unless the user shares it or rates the answer (covered above); open question 2 covers the logs.

## Tracking

**Does the app track users?** No.
No data is combined with third-party data for advertising, and no data is shared with a data broker; `NSPrivacyTrackingDomains` is empty.

## Open questions before submitting

These are mismatches or judgment calls found while checking the code.
None is settled by this file; each needs a decision, and possibly a change to the manifest, the code or `/confidentialite`.

1. **A shared quiz result may count as Sensitive Info (political opinion).**
   Apple lists political opinion under Sensitive Info.
   A quiz share stores the user's match with each deputy and, when the user opts in, their pour, contre or abstention answer on each question and the themes they answered.
   The manifest declares only Other User Content.
   The cautious answer is to also select Sensitive Info (not linked, not tracking, App Functionality) and add `NSPrivacyCollectedDataTypeSensitiveInfo` to the manifest in the same change.
2. **A question is kept in the logs and in Sentry when the request fails.**
   Two channels keep it:
   `POST /search/` logs `"RAG pipeline error for question %r"` with the question on an unexpected error (`api/routers/search.py`), which writes it to the Railway logs and, through Sentry's logging integration, into a Sentry event;
   and the API's Sentry setup strips request bodies only for `/circonscriptions/locate` (`_SENTRY_BODYLESS_PATHS` in `api/main.py`), while the Sentry SDK attaches a JSON request body to an error event by default.
   The manifest's comment ("A question ... is sent to answer the request and not kept") accounts for neither.
   The label above already declares Other User Content, so the answers do not change; making the comment true takes both changes: log the exception class without the question, and add `/search/` to `_SENTRY_BODYLESS_PATHS`.
3. **Questions and claims go to two AI providers.**
   The API sends the text to OpenAI to embed it and to Groq to write the answer or verdict (`rag/chain/retriever.py`, `rag/chain/rag_chain.py`, `rag/chain/verify.py`).
   Whether either keeps API inputs beyond the request is set by their own data policies; read them before submitting.
   If one does, it is still Other User Content, not linked and not tracking, so the label stays as above.
4. **Follows reach the server's access log with the caller's IP address.**
   The followed deputies and themes are saved only on the device, but `GET /feed` and `GET /feed/week` carry them as query parameters (`FeedService.swift`), and uvicorn's access log, on by default, records each request's path, query string and client IP in the Railway logs.
   Nothing is written to the database, so this is not collection in the database sense, but an IP next to a list of followed deputies touches the same political-opinion question as item 1.
   Turning the access log off (`--no-access-log`) or keeping the query string out of it would close it.
5. **`/confidentialite` must keep matching the label.**
   Its "Application iPhone" section (`frontend/src/app/confidentialite/AppPrivacySection.tsx`, #711) names OpenAI and Groq, says every checked claim is stored, and describes the access log and Sentry as they are today.
   If item 1, 2 or 4 changes the manifest or the API, change that section in the same PR.
