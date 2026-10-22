# bot — Board of Trustees Election 2026

Context handoff for Claude Code. Read this before working in this repo.

## What this is

A ballot form for the IPC Board of Trustees election. Voters enter full name and birthday, choose to vote as themselves or as a proxy (with the represented person's full name), read the BOT criteria, check nominees (with photos or a blank-person placeholder), and sign by typing their full name. Everything is free: a static page on GitHub Pages posts to a Google Apps Script web app, which writes to a Google Sheet.

- Owner: Kevin
- Local repo: `C:\git-gud\bot` (branch `main`, no remote yet)
- Target URL: `xxx.github.io/bot/`
- History: first named `agaform2026`, then `bot2026`, now `bot`.

## Files

- `index.html`: the ballot page. Self-contained HTML, CSS, and JS with no build step.
- `apps-script/Code.gs`: the backend. It is not deployed from git; it gets pasted into the Sheet's **Extensions → Apps Script**.
- `README.md`: setup and election-day notes.

## How it works

- `doGet` returns config `{ nominees, maxVotes, minVotes, open }`. The page renders the checkboxes from this, so the nominee list lives only in `Code.gs`.
- `doPost` receives JSON sent as `Content-Type: text/plain`. Using text/plain avoids a CORS preflight, so the page can read the JSON response.
- Server-side checks, in order:
  1. Is voting open?
  2. Honeypot field `website`: if it's filled, return fake success and store nothing.
  3. Name, valid birthday (YYYY-MM-DD, in the past), and proxy name if proxy.
  4. Vote count is between `MIN_VOTES` and `MAX_VOTES` (`MAX_VOTES` defaults to `NOMINEES.length`).
  5. Each vote is a valid nominee.
  6. Signature matches the voter's name (case/spacing-insensitive).
  7. Optional `Voters` allowlist sheet: member full names in column A. If the sheet is missing or empty, anyone can vote.
  8. One ballot per member, keyed by name: the voter's own name, or the proxy-for name.
- `NOMINEES` is a list of `{ name, photo }`. `photo` is a URL or a path relative to the page; empty means the placeholder SVG.
- `LockService` serializes writes.
- Each ballot is one row in the `Ballots` sheet: `Timestamp | Voter Name | Birthday | Voting As | Proxy For | Signature | <one column per nominee, 1 = voted>`. Birthday is stored with a leading `'` to keep it as text. Headers are built from `NOMINEES` on the first write, so finalize the nominees before voting starts.
- No endpoint exposes the results. Tally them in the Sheet, e.g. `=SUM(G2:G)`.
- On the client, checkboxes are disabled once the voter reaches the max, and a confirm dialog lists their picks before submitting.

## Status

- Kevin deployed the Apps Script and tested a vote end to end (it worked).
- An Apps Script authorization error ("Something went wrong") was resolved on his side.
- In the repo, `SCRIPT_URL` in `index.html` is still the placeholder, and `NOMINEES` in `Code.gs` is still sample data. Kevin's real values may only exist in his Apps Script editor and local test copy, so ask for them or check before assuming.

## Open decisions / TODO

- Hosting is undecided: a folder `bot/` inside his existing portfolio GitHub Pages repo (his earlier stated choice), or this repo pushed as its own `bot` repo with Pages enabled. Both give the same URL. Don't do both, or the paths will conflict.
- Add the real `SCRIPT_URL`, nominees, `MAX_VOTES`, and `MIN_VOTES`.
- Decide whether to use the `Voters` allowlist. Without it, one ballot per member can be bypassed by spelling a name differently.
- The old `Ballots` sheet from testing has the previous columns (Email/Phone). Delete it before redeploying so the new headers get created.
- Before launch:
  - Test the duplicate-email block.
  - Test on a phone at the live URL.
  - Delete test rows but keep the header row.
- To close voting, set `VOTING_OPEN = false` and deploy a new version.

## Gotchas

- Every Apps Script edit needs **Deploy → Manage deployments → Edit → New version**. Otherwise the old code keeps running.
- Deploy settings: Execute as **Me**, access **Anyone**.
- Use relative asset paths (`./x.css`) on GitHub Pages project paths.
