# Vision

MonÉlu exists so that any citizen can see what their deputy actually voted, in plain French, and check it against the official record in one click.
It serves the person who wants to know, not the person who already follows politics: a voter, a student, a journalist, or the agent answering on their behalf.
It owns exactly one thing: the path between the Assemblée nationale's published record and a reader who can understand it.

## The official record leads

Every vote, position and title MonÉlu shows comes from data the Assemblée nationale publishes, and every scrutin links back to its official page.
What the Assemblée does not publish, such as the boundaries of a circonscription or the location of an address, comes from a named public source.
The official title is always the headline; anything MonÉlu wrote sits beside it, labelled as MonÉlu's.
A generated summary is a reading aid, never evidence: it is written from the official text or it does not exist, and no answer or verdict may cite it.
A verdict on a claim cites recorded votes or says it cannot be verified.
A definition is stated once and used everywhere, and the caveat that goes with a figure travels with the figure.

## Missing is better than wrong

When the source does not settle a question, MonÉlu shows less instead of guessing.
An unmatched amendment keeps its title, an address on a boundary gets every possible seat, and a date the source does not give is never invented.
An upstream change must stop the pipeline loudly; a green run over a hollow dataset is the failure this project fears most.
Visible copy promises only what the code does today, and every sentence a reader sees can be checked.

## Facts, not opinions

MonÉlu reports what a deputy did and never says whether they were right.
Every deputy and every group is measured by the same formulas, whatever their side.
Rankings and scores are published with their definition and their limits, so a reader can disagree with the measure.
Nothing is written to provoke: no editorial, no commentary, no "why it matters" that an LLM made up.

## Reading is anonymous, and the reader is not the product

No public data ever moves behind sign-in, a cookie or an identification.
Personalization starts on the device; an account is an optional upgrade, and it stores the minimum.
No political profile is ever derived from what a person follows, answers or searches.
What a person types to find their deputy does not reach MonÉlu's servers beyond the one point needed to answer, and that point is never stored or logged.
There are no engagement mechanics: no likes, reactions, streaks, trending or public counts.
MonÉlu does not push: no alert, digest or notification is sent until the owner lifts that hold explicitly.

## Open by default

The data is public data under an open licence, and its purpose is reuse.
The API, the Markdown twins, the embeds and the files written for crawlers and agents are first-class surfaces, not afterthoughts.
A machine reader gets the same facts and the same caveats as a human one.
Funding is donations first and stays fully decoupled from content and ranking.
The only thing money may buy is a higher API rate limit.

## One source of truth, held by tests

The API computes and every client shows; a rule lives in one place and the other surfaces mirror it under a test that fails on drift.
Most of this code is written by agents and not read line by line, so a rule that matters is pinned by a test, not by memory.
A decision is recorded with its reason and the trigger that would reopen it.
Infrastructure is built when a measured trigger fires, never ahead of the demand it is meant to serve.
Between two designs, the simpler and more robust one wins over the faster one to ship.

## Scope

MonÉlu covers what the Assemblée nationale publishes about its deputies and its work: their public votes, the agenda of the séance publique, and the path of a bill, including the stages it goes through at the Sénat.
The Sénat's own votes, local councils and the European Parliament are not covered.
It is not a news outlet, not an opinion site and not a campaign tool.
It is not a social network: readers do not post, comment or see each other, and what a reader shares is an unlisted snapshot, not published content.
It is not a general political chatbot: search and verification answer from the ingested record and say so when the record is silent.
It does not show data it does not ingest, and it does not ingest a source without a guard against that source changing shape.
It does not sell the data, a reader's attention or a place in a ranking; reading is free, and only a higher API rate limit may be paid for.

A change aligns when it makes the official record easier to find, read or check, when it lets a reader verify a claim by themselves, when it replaces a guess with a source or an honest gap, when it opens the data to one more kind of reuse, or when it turns a rule someone must remember into a test.
A change should be resisted when it puts MonÉlu's words above the official ones, shows something the source does not support, takes a side, asks the reader to identify themselves to read, learns more about a person than the feature needs, optimizes for time spent instead of questions answered, or builds ahead of a trigger that has not fired.
