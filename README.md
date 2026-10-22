# bot — IPC Board of Trustees Ballot 2026

Static ballot form (GitHub Pages) that submits to a Google Sheet via a Google Apps Script web app.

## Structure

- `index.html` — the ballot page (served by GitHub Pages)
- `apps-script/Code.gs` — backend; paste into the Sheet's **Extensions → Apps Script**
- `photos/` (optional) — nominee photos, referenced from `NOMINEES` as `photos/<file>.jpg`

## Setup

1. In `apps-script/Code.gs`, set `NOMINEES` (name + optional photo), `MAX_VOTES`, `MIN_VOTES` (finalize before the first vote).
2. Deploy as a web app: **Execute as: Me**, **Who has access: Anyone**. Copy the `/exec` URL.
3. Paste the URL into `SCRIPT_URL` in `index.html`.
4. After any script edit: **Deploy → Manage deployments → Edit → New version**.

Photos: keep them small (about 200×200 px, under 30 KB each) so the page loads fast on mobile. Nominees without a photo get a blank-person placeholder.

## Running the election

- One ballot per member is enforced server-side, keyed by name (case/spacing-insensitive): the voter's own name, or the name of the person they are a proxy for.
- The signature must match the voter's full name.
- Optional allowlist: add a `Voters` sheet with eligible members' full names in column A.
- Close voting: set `VOTING_OPEN = false` and deploy a new version.
- Tally: `=SUM(G2:G)` (etc.) under each nominee column in the `Ballots` sheet.
