/**
 * Ballot backend — paste into the Google Sheet's Extensions → Apps Script.
 * Deploy: Deploy → New deployment → Web app
 *         Execute as: Me | Who has access: Anyone
 * After ANY edit: Deploy → Manage deployments → Edit → Version: New version.
 */

// ===== SETTINGS =====
// Finalize the nominee list BEFORE the first vote (the sheet headers are built from it).
// photo: image URL, or a path relative to the ballot page (e.g. 'photos/juan.jpg').
//        Leave '' to show the default blank-person image.
const NOMINEES = [
  { name: 'Nominee One', photo: '' },
  { name: 'Nominee Two', photo: '' },
  { name: 'Nominee Three', photo: '' },
  { name: 'Nominee Four', photo: '' },
  { name: 'Nominee Five', photo: '' },
];
const MAX_VOTES = NOMINEES.length; // max nominees a voter may check
const MIN_VOTES = 1;               // min nominees a voter must check
const VOTING_OPEN = true;          // set false (and redeploy) to close voting

const BALLOT_SHEET = 'Ballots';
const VOTERS_SHEET = 'Voters'; // optional: list eligible members' full names in column A. If this sheet is missing or empty, anyone can vote.
// ====================

const NOMINEE_NAMES = NOMINEES.map(n => n.name);

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

    const name = clean(d.name);
    const birthday = String(d.birthday || '').trim();
    const proxy = d.votingAs === 'proxy';
    const proxyFor = proxy ? clean(d.proxyFor) : '';
    const signature = clean(d.signature);
    const votes = Array.isArray(d.votes) ? [...new Set(d.votes.map(String))] : [];

    if (!name || !validBirthday(birthday)) {
      return json({ ok: false, error: 'Please enter your full name and a valid birthday.' });
    }
    if (proxy && !proxyFor) {
      return json({ ok: false, error: 'Please enter the full name of the person you are voting for.' });
    }
    if (votes.length < MIN_VOTES || votes.length > MAX_VOTES) {
      return json({ ok: false, error: `Please select ${MIN_VOTES} to ${MAX_VOTES} nominees.` });
    }
    if (votes.some(v => !NOMINEE_NAMES.includes(v))) {
      return json({ ok: false, error: 'Invalid selection. Please reload the page.' });
    }
    if (key(signature) !== key(name)) {
      return json({ ok: false, error: 'Your signature must match your full name.' });
    }

    // The member this ballot counts for: the voter, or the person they are a proxy for
    const member = key(proxy ? proxyFor : name);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Optional member allowlist
    const voters = ss.getSheetByName(VOTERS_SHEET);
    if (voters && voters.getLastRow() > 0) {
      const allowed = voters.getRange(1, 1, voters.getLastRow(), 1).getValues().flat().map(key);
      if (!allowed.includes(member)) {
        return json({ ok: false, error: `${proxy ? proxyFor : name} is not on the member list.` });
      }
    }

    // One ballot per member
    const sheet = getBallotSheet(ss);
    const last = sheet.getLastRow();
    if (last > 1) {
      // Columns B..E: Voter Name | Birthday | Voting As | Proxy For
      const used = sheet.getRange(2, 2, last - 1, 4).getValues()
        .map(r => key(r[2] === 'Proxy' ? r[3] : r[0]));
      if (used.includes(member)) {
        return json({ ok: false, error: `A ballot has already been submitted for ${proxy ? proxyFor : name}.` });
      }
    }

    // Row: Timestamp | Voter Name | Birthday | Voting As | Proxy For | Signature | one column per nominee (1 = voted)
    sheet.appendRow([
      new Date(),
      name,
      "'" + birthday, // keep as text (YYYY-MM-DD)
      proxy ? 'Proxy' : 'Self',
      proxyFor,
      signature,
      ...NOMINEE_NAMES.map(n => (votes.includes(n) ? 1 : '')),
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
    sh.appendRow(['Timestamp', 'Voter Name', 'Birthday', 'Voting As', 'Proxy For', 'Signature', ...NOMINEE_NAMES]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Trim and collapse internal whitespace
function clean(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

// Comparison key for names: case- and spacing-insensitive
function key(s) {
  return clean(s).toLowerCase();
}

function validBirthday(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(s + 'T00:00:00Z').getTime();
  return !isNaN(t) && t < Date.now() && s >= '1900-01-01';
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
