# bot — IPC Board of Trustees Ballot 2026

Static ballot form (GitHub Pages) that submits to a Google Sheet via a Google Apps Script web app.

## Structure

- `index.html` — the ballot page (served by GitHub Pages)
- `apps-script/Code.gs` — backend; paste into the Sheet's **Extensions → Apps Script**
- `results.html` — results page (shows the tally only after voting closes)
- `photos/` — nominee photos, referenced from `NOMINEES` as `photos/<file>.webp`

## Setup

1. In `apps-script/Code.gs`, set `NOMINEES` (name + optional photo), `MAX_VOTES`, `MIN_VOTES` (finalize before the first vote).
2. Deploy as a web app: **Execute as: Me**, **Who has access: Anyone**. Copy the `/exec` URL.
3. Paste the URL into `SCRIPT_URL` in `index.html`.
4. After any script edit: **Deploy → Manage deployments → Edit → New version**.

Photos: keep them small (about 200×200 px, under 30 KB each) so the page loads fast on mobile. Nominees without a photo get a blank-person placeholder.

## Running the election

- One ballot per member is enforced server-side, keyed by name (case, punctuation, and word order are ignored): the voter's own name, or the name of the person they are a proxy for.
- The signature must match the voter's full name.
- Optional allowlist: add a `Voters` sheet with eligible members' full names in column A (no header). The names also appear as suggestions on the form.
- Open/close voting: in the `Settings` tab, set cell **B1** to `Open` or `Closed` (dropdown). It takes effect immediately; no redeploy. To create the tab, run `setup` once in the Apps Script editor.
- Tally: `=SUM(F2:F)` (etc.) under each nominee column in the `Ballots` sheet.
- Results: `results.html` shows the tally once `Settings!B1` is `Closed`. While voting is open it only says results aren't available yet.
