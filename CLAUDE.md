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
  6. Signature matches the voter's name.
  7. Optional `Voters` allowlist sheet: member full names in column A, no header. If the sheet is missing or empty, anyone can vote. `doGet` also returns these names (never birthdays) as `members`, which the page shows as `<datalist>` suggestions on the name and proxy fields.
  8. Birthday verification: `Voters` column B holds each member's birthday. Once any birthday is filled in, the birthday entered for the member the ballot is for must match (the voter's own, or the proxy's "Birthday of the person you are voting for" field). A member with a blank birthday can't vote (`noBirthday`). After `MAX_ATTEMPTS` (5) wrong birthdays, that name is locked; counts live in Script Properties as `fail:<key>`. Run `unlockAll` in the editor to reset.
- Names are compared with `key()` in `Code.gs` / `nameKey()` in `index.html` (keep them in sync): case, punctuation, and word order are ignored, so "Tejedo, Luke Soliven." equals "Luke Soliven Tejedo".
  9. One ballot per member, keyed by name: the voter's own name, or the proxy-for name. Checked after verification so it doesn't reveal who has voted.
- `NOMINEES` is a list of `{ name, photo }`. `photo` is a URL or a path relative to the page; empty means the placeholder SVG.
- `LockService` serializes writes.
- Each ballot is one row in the `Ballots` sheet: `Timestamp | Voter Name | Birthday | Voting As | Proxy For | Signature | <one column per nominee, 1 = voted>`. Birthday is stored with a leading `'` to keep it as text. Headers are built from `NOMINEES` on the first write, so finalize the nominees before voting starts.
- No endpoint exposes the results. Tally them in the Sheet, e.g. `=SUM(G2:G)`.
- On the client, checkboxes are disabled once the voter reaches the max, and a confirm dialog lists their picks before submitting.

## Status

- Kevin deployed the Apps Script and tested a vote end to end (it worked).
- An Apps Script authorization error ("Something went wrong") was resolved on his side.
- `SCRIPT_URL` and `NOMINEES` are real. Hosted as its own repo `kvnglvz/bot` on GitHub Pages: `https://kvnglvz.github.io/bot/`. The repo `Code.gs` is the source of truth, but what's live is whatever Kevin last pasted and deployed in Apps Script.
- If the page gets a CORS error or a 403 "Access Denied" from the script URL, republish the deployment (Execute as Me, Anyone). That fixed it once.

## Open decisions / TODO

- Real nominees (2026 AGA Final List) are in `Code.gs`, with photos in `photos/` (112×112 WebP, about 2 KB each; mapped in the order Kevin gave). Consent forms were not yet marked on the source list.
- The `Voters` allowlist is in use (member list from Kevin, minus Kevin Galvez). Without it, one ballot per member could be bypassed by spelling a name differently.
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
