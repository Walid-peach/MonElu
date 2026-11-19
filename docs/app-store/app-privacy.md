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

Select two data types:

| Data type | Linked to the user's identity | Used for tracking | Purpose |
|-----------|-------------------------------|-------------------|---------|
| User Content > **Other User Content** | No | No | App Functionality |
| Sensitive Info > **Sensitive Info** | No | No | App Functionality |

These are the manifest's `NSPrivacyCollectedDataTypeOtherUserContent` and `NSPrivacyCollectedDataTypeSensitiveInfo` entries, each with `Linked` false, `Tracking` false and the `AppFunctionality` purpose.
Sensitive Info is declared because Apple lists political opinion under it, and a shared quiz result records one (#716).
What Other User Content covers, each stored without any identity (no account, no device identifier, no IP address in the rows):

- every claim checked in Demander, stored with its verdict behind a public share URL (`POST /verify/`, table `verifications`);
- an answer the user chooses to share (`POST /search/share`, table `chat_shares`);
- a quiz result the user chooses to share (`POST /quiz/share`, table `quiz_shares`), with the answers only when the user turns on the option to include them;
- a thumbs up or down on an answer, which stores the question, the answer and its sources (`POST /feedback/chat`, table `feedback`).

## Data types to leave unselected

Each of these is either never sent or sent only to answer one request and not kept.

- **Contact Info, Health, Financial, Contacts, Browsing History, Purchases**: the app asks for none of them.
- **Location**: the app does not use Core Location.
  A typed address goes from the device to the Base Adresse Nationale's geocoder (data.geopf.fr), a postal code to geo.api.gouv.fr, both through an ephemeral session; MonÉlu receives only the chosen point, in `POST /circonscriptions/locate`, which neither stores nor logs it, and no request body reaches Sentry.
- **Identifiers, Usage Data**: no analytics or advertising SDK, no device or user identifier (rule 8 of `ios/CLAUDE.md`, `NSPrivacyTracking` false).
- **Diagnostics**: the app embeds no crash or performance SDK today; this changes if the Sentry SDK rule 8 plans is added.
- **Search History**: a question asked in Demander is not stored unless the user shares it or rates the answer (covered above); the API logs errors without the question and sends Sentry no request body (#716).

## Tracking

**Does the app track users?** No.
No data is combined with third-party data for advertising, and no data is shared with a data broker; `NSPrivacyTrackingDomains` is empty.

## Settled while checking the code

Fixed in #716, so the answers above stay true:

- **A shared quiz result is a political opinion.**
  It stores the user's match with each deputy and, when the user opts in, their answers and themes, so Sensitive Info is declared in the label and the manifest.
- **A question no longer reaches the logs or Sentry.**
  `POST /search/` and `POST /verify/` log an error without the text, and `sentry_sdk.init` in `api/main.py` reads no request body or frame locals; `_drop_private_request_data` strips the body, query string and cookies from every event and trace.
- **Follows no longer reach the API's access log.**
  `_DropQueryString` in `api/main.py` drops the query string from uvicorn's access log, which carried the followed ids of `GET /feed` next to the client IP.
  Railway's own HTTP log still records each request's path and client IP (`@path`, `@srcIp`, kept for the retention of the Railway plan), and its documentation does not say whether that path includes the query string; `/confidentialite` says the log may contain the ids.
  Removing them from that log too would mean moving the follows out of the URL, an API change for the app.

## Open questions before submitting

1. **Questions and claims go to two AI providers.**
   The API sends the text to OpenAI to embed it and to Groq to write the answer or verdict (`rag/chain/retriever.py`, `rag/chain/rag_chain.py`, `rag/chain/verify.py`).
   Whether either keeps API inputs beyond the request is set by their own data policies; read them before submitting.
   If one does, it is still Other User Content, not linked and not tracking, so the label stays as above.
2. **`/confidentialite` must keep matching the label.**
   Its "Application iPhone" section (`frontend/src/app/confidentialite/AppPrivacySection.tsx`, #711) names OpenAI and Groq, says every checked claim and every shared quiz result is stored, and describes the access log and Sentry as they are today.
   Change it in the same PR as any change to the manifest, the logging or the Sentry setup.
