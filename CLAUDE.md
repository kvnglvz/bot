# bot — Board of Trustees Election 2026

Context handoff for Claude Code. Read this before working in this repo.

## What this is

A ballot form for the IPC Board of Trustees election. Voters enter their full name, choose to vote as themselves or as a proxy (with the represented person's full name), read the BOT criteria, check nominees (with photos or a blank-person placeholder), and sign by typing their full name. The page has an English/Tagalog switch. Everything is free: a static page on GitHub Pages posts to a Google Apps Script web app, which writes to a Google Sheet.

- Owner: Kevin
- Local repo: `C:\git-gud\bot` (branch `main`), remote `github.com/kvnglvz/bot`
- Live URL: `https://kvnglvz.github.io/bot/`
- History: first named `agaform2026`, then `bot2026`, now `bot`.

## Files

- `index.html`: the ballot page. Self-contained HTML, CSS, and JS with no build step. All UI text lives in the `I18N` object (`en`, `tl`); elements use `data-i18n` / `data-i18n-ph`.
- `apps-script/Code.gs`: the backend. It is not deployed from git; it gets pasted into the Sheet's **Extensions → Apps Script**.
- `results.html`: results page. Not linked from the ballot; open `/bot/results.html` directly.
- `photos/`: nominee photos (112×112 WebP, about 2 KB each).
- `README.md`: setup and election-day notes.

## How it works

- `doGet` with `?action=results` returns the tally (see Results below); otherwise it returns config `{ nominees, members, maxVotes, minVotes, open }`. The page renders the checkboxes from `nominees`, so the nominee list lives only in `Code.gs`. `members` (names from the `Voters` sheet) feed a `<datalist>` of suggestions on the name and proxy fields.
- `doPost` receives JSON sent as `Content-Type: text/plain`. Using text/plain avoids a CORS preflight, so the page can read the JSON response.
- Server-side checks, in order:
  1. Is voting open?
  2. Honeypot field `website`: if it's filled, return fake success and store nothing.
  3. Name, and proxy name if proxy.
  4. Vote count is between `MIN_VOTES` and `MAX_VOTES` (`MAX_VOTES` defaults to `NOMINEES.length`).
  5. Each vote is a valid nominee.
  6. Signature matches the voter's name.
  7. Optional `Voters` allowlist sheet: member full names in column A, no header. If the sheet is missing or empty, anyone can vote.
  8. One ballot per member, keyed by name: the voter's own name, or the proxy-for name. If the existing row has the same `Submission ID` as the request, it's a retry of a ballot already recorded, so the server returns `ok` without adding a row.
- Apps Script is intermittently slow (some calls hang 30 s+ and then 404). The page aborts each request after `TIMEOUT_MS` (8 s) and retries up to `ATTEMPTS` (3) times, showing "Still loading…" / "Still submitting…". Each submission carries a client-generated `id` that stays the same on retries and on a manual re-submit after an unconfirmed attempt, and resets when the form is edited.
- Errors return `{ ok: false, code, error }`. The page shows `I18N[lang]['err_' + code]`, falling back to the English `error`.
- Names are compared with `key()` in `Code.gs` / `nameKey()` in `index.html` (keep them in sync): case, punctuation, and word order are ignored, so "Tejedo, Luke Soliven." equals "Luke Soliven Tejedo".
- `NOMINEES` is a list of `{ name, photo }`. `photo` is a URL or a path relative to the page; empty means the placeholder SVG.
- `LockService` serializes writes.
- Each ballot is one row in the `Ballots` sheet: `Timestamp | Voter Name | Voting As | Proxy For | Signature | <one column per nominee, 1 = voted> | Submission ID`. Headers are built from `NOMINEES` on the first write, so finalize the nominees before voting starts.
- Results: `results()` returns `{ ok: false, code: 'notYet' }` while `VOTING_OPEN` is true, so nobody (not even the committee) sees a tally during voting. Once closed it returns `{ ballots, proxies, members, nominees: [{ name, photo, votes }], updated }`. No passcode (Kevin decided against one).
- `results.html` shows turnout plus votes per nominee (sorted, % of ballots, ties share a rank). It has an auto-refresh on/off button (every 30 s, paused while the tab is hidden; choice saved in `localStorage`), so a page left open flips to the results by itself when voting closes. English only. The Sheet is still the authoritative tally, e.g. `=SUM(F2:F)`.
- On the client, checkboxes are disabled once the voter reaches the max, and a confirm dialog lists their picks before submitting.

## Status

- Kevin deployed the Apps Script and tested a vote end to end (it worked).
- `SCRIPT_URL` and `NOMINEES` are real. The repo `Code.gs` is the source of truth, but what's live is whatever Kevin last pasted and deployed in Apps Script.
- If the page gets a CORS error or a 403 "Access Denied" from the script URL, republish the deployment (Execute as Me, Anyone). That fixed it once.
- Birthday input and birthday verification were added and then removed at Kevin's request. Identity now rests only on the member-name list plus one ballot per member.

## Open decisions / TODO

- Nominees (2026 AGA Final List) and photos are in; photos were mapped in the order Kevin gave. Consent forms were not yet marked on the source list.
- The `Voters` allowlist is in use (member list from Kevin, minus Kevin Galvez). Without it, one ballot per member could be bypassed by spelling a name differently.
- Tagalog text is Claude's translation and should be reviewed by a fluent speaker.
- Before launch:
  - Delete the `Ballots` sheet so the headers are rebuilt with the current columns.
  - Test the duplicate-member block (self and proxy).
  - Test on a phone at the live URL.
  - Delete test rows but keep the header row.
- To close voting, set `VOTING_OPEN = false` and deploy a new version.

## Gotchas

- Every Apps Script edit needs **Deploy → Manage deployments → Edit → New version**. Otherwise the old code keeps running.
- Deploy settings: Execute as **Me**, access **Anyone**.
- Changing the `Ballots` columns (fields or nominees) requires deleting the `Ballots` sheet; never do this once real votes exist.
- GitHub Pages builds can sit queued when GitHub Actions is degraded; pages are cached up to 10 minutes.
- Use relative asset paths (`./x.css`) on GitHub Pages project paths.
