/**
 * Ballot backend — paste into the Google Sheet's Extensions → Apps Script.
 * Deploy: Deploy → New deployment → Web app
 *         Execute as: Me | Who has access: Anyone
 * After ANY edit: Deploy → Manage deployments → Edit → Version: New version.
 */

// ===== SETTINGS =====
// Finalize the nominee list BEFORE the first vote (the sheet headers are built from it).
const NOMINEES = [
  'Nominee One',
  'Nominee Two',
  'Nominee Three',
  'Nominee Four',
  'Nominee Five',
];
const MAX_VOTES = 3;        // max nominees a voter may check
const MIN_VOTES = 1;        // min nominees a voter must check
const VOTING_OPEN = true;   // set false (and redeploy) to close voting

const BALLOT_SHEET = 'Ballots';
const VOTERS_SHEET = 'Voters'; // optional: list allowed emails in column A. If this sheet is missing or empty, anyone can vote.
// ====================

function doGet() {
  return json({
    nominees: NOMINEES,
    maxVotes: MAX_VOTES,
    minVotes: MIN_VOTES,
    open: VOTING_OPEN,
  });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (_) {
    return json({ ok: false, error: 'The server is busy. Please try again.' });
  }

  try {
    if (!VOTING_OPEN) return json({ ok: false, error: 'Voting is closed.' });

    const d = JSON.parse(e.postData.contents || '{}');

    // Honeypot: bots fill hidden fields. Pretend success, store nothing.
    if (d.website) return json({ ok: true });

    const name = String(d.name || '').trim();
    const email = String(d.email || '').trim().toLowerCase();
    const phone = String(d.phone || '').trim();
    const votes = Array.isArray(d.votes) ? [...new Set(d.votes.map(String))] : [];

    if (!name || !phone || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ ok: false, error: 'Please complete all required fields.' });
    }
    if (votes.length < MIN_VOTES || votes.length > MAX_VOTES) {
      return json({ ok: false, error: `Please select ${MIN_VOTES} to ${MAX_VOTES} nominees.` });
    }
    if (votes.some(v => !NOMINEES.includes(v))) {
      return json({ ok: false, error: 'Invalid selection. Please reload the page.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Optional voter allowlist
    const voters = ss.getSheetByName(VOTERS_SHEET);
    if (voters && voters.getLastRow() > 0) {
      const allowed = voters.getRange(1, 1, voters.getLastRow(), 1).getValues()
        .flat().map(v => String(v).trim().toLowerCase());
      if (!allowed.includes(email)) {
        return json({ ok: false, error: 'This email is not on the voter list.' });
      }
    }

    // One ballot per email
    const sheet = getBallotSheet(ss);
    const last = sheet.getLastRow();
    if (last > 1) {
      const used = sheet.getRange(2, 3, last - 1, 1).getValues()
        .flat().map(v => String(v).trim().toLowerCase());
      if (used.includes(email)) {
        return json({ ok: false, error: 'A ballot has already been submitted with this email.' });
      }
    }

    // Row: Timestamp | Name | Email | Phone | one column per nominee (1 = voted)
    sheet.appendRow([
      new Date(),
      name,
      email,
      "'" + phone, // keep leading 0 (e.g. 09xx) as text
      ...NOMINEES.map(n => (votes.includes(n) ? 1 : '')),
    ]);

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function getBallotSheet(ss) {
  let sh = ss.getSheetByName(BALLOT_SHEET);
  if (!sh) sh = ss.insertSheet(BALLOT_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp', 'Name', 'Email', 'Phone', ...NOMINEES]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
