# bot — Board of Trustees Election 2026

Static ballot form (GitHub Pages) that submits to a Google Sheet via a Google Apps Script web app.

## Structure

- `index.html` — the ballot page (served by GitHub Pages)
- `apps-script/Code.gs` — backend; paste into the Sheet's **Extensions → Apps Script**

## Setup

1. In `apps-script/Code.gs`, set `NOMINEES`, `MAX_VOTES`, `MIN_VOTES` (finalize before the first vote).
2. Deploy as a web app: **Execute as: Me**, **Who has access: Anyone**. Copy the `/exec` URL.
3. Paste the URL into `SCRIPT_URL` in `index.html`.
4. After any script edit: **Deploy → Manage deployments → Edit → New version**.

## Running the election

- One ballot per email is enforced server-side.
- Optional allowlist: add a `Voters` sheet with eligible emails in column A.
- Close voting: set `VOTING_OPEN = false` and deploy a new version.
- Tally: `=SUM(E2:E)` (etc.) under each nominee column in the `Ballots` sheet.
