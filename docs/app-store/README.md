# App Store Connect texts

Everything the iPhone app's App Store record asks for, ready to copy into App Store Connect on submission day (#709).
Each statement here is drawn from the code, and each file names the files it was checked against.

| File | App Store Connect page | What it holds |
|------|------------------------|---------------|
| [`review-notes.md`](review-notes.md) | App Review Information | Sign-in, contact and the Notes field for the reviewer |
| [`app-privacy.md`](app-privacy.md) | App Privacy | The privacy questionnaire answers, and the open questions about them |
| [`questionnaires.md`](questionnaires.md) | App Information, Pricing, the build | Age rating, content rights, export compliance, category, other descriptors |
| [`listing-fr.md`](listing-fr.md) | Version page, French (France) | Name, subtitle, promotional text, description, keywords |
| [`listing-en.md`](listing-en.md) | Version page, English (U.K.) or (U.S.) | The same fields in English |

## Placeholders

Every value that cannot be known yet is written `<<PLACEHOLDER #issue: what>>`.
`grep -rn "<<PLACEHOLDER" docs/app-store/` lists them, and none may remain when the record is submitted.
They wait on two things:

- the Apple Developer account and the publisher (#451): bundle id, review contact;
- the domain (#419): support, marketing and privacy policy URLs, since the site currently answers on the default Vercel host (`DEFAULT_FRONTEND_BASE_URL` in `api/config.py`).

## When to update

Update the file in the same PR as the change that makes it wrong:

- `app-privacy.md`, together with `ios/MonElu/Resources/PrivacyInfo.xcprivacy` and `/confidentialite`, when the app sends, stores or shares a new kind of data, or adds an SDK (Sentry included: rule 8 of `ios/CLAUDE.md` plans it, and it would add crash data).
- `review-notes.md` when a tab, a main screen's path or a `GET /app/config` switch changes.
- `questionnaires.md` when the app gains a web view, user-to-user content, an account, ads, purchases or encryption beyond HTTPS.
- Both listings when a feature they describe changes, or when `DATA_HORIZON` in `api/app_config_data.py` moves (they quote that date).

The listings follow [`docs/writing-guide.md`](../writing-guide.md): every claim checkable, no figure that changes over time.
App Store Connect itself is the record: after a submission, copy back any wording edited there.
