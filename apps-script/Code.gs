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
  { name: 'Antolin, Joseph Manuel', photo: 'photos/antolin.webp' },
  { name: 'Gutierrez, Bernadette', photo: 'photos/gutierrez.webp' },
  { name: 'Salabao, Karl', photo: 'photos/salabao.webp' },
  { name: 'Tomenbang, Joby', photo: 'photos/tomenbang.webp' },
  { name: 'Tejedo, Luke', photo: 'photos/tejedo.webp' },
];
const MAX_VOTES = NOMINEES.length; // max nominees a voter may check
const MIN_VOTES = 1;               // min nominees a voter must check
const VOTING_OPEN = true;          // set false (and redeploy) to close voting

const BALLOT_SHEET = 'Ballots';
const VOTERS_SHEET = 'Voters'; // optional: list eligible members' full names in column A (no header). If this sheet is missing or empty, anyone can vote.
// ====================

const NOMINEE_NAMES = NOMINEES.map(n => n.name);

function doGet() {
  return json({
    nominees: NOMINEES,
    members: getMembers(SpreadsheetApp.getActiveSpreadsheet()), // shown as name suggestions on the page
    maxVotes: MAX_VOTES,
    minVotes: MIN_VOTES,
    open: VOTING_OPEN,
  });
}

// Member names from the Voters sheet, cleaned up for display. [] if the sheet is missing or empty.
function getMembers(ss) {
  const sh = ss.getSheetByName(VOTERS_SHEET);
  if (!sh || sh.getLastRow() === 0) return [];
  return sh.getRange(1, 1, sh.getLastRow(), 1).getValues().flat()
    .map(v => clean(v).replace(/[,\s]+$/, ''))
    .filter(Boolean);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (_) {
    return json({ ok: false, code: 'busy', error: 'The server is busy. Please try again.' });
  }

  try {
    if (!VOTING_OPEN) return json({ ok: false, code: 'closed', error: 'Voting is closed.' });

    const d = JSON.parse(e.postData.contents || '{}');

    // Honeypot: bots fill hidden fields. Pretend success, store nothing.
    if (d.website) return json({ ok: true });

    const name = clean(d.name);
    const proxy = d.votingAs === 'proxy';
    const proxyFor = proxy ? clean(d.proxyFor) : '';
    const signature = clean(d.signature);
    const id = String(d.id || '').slice(0, 64); // client-generated; the same on retries of one submission
    const votes = Array.isArray(d.votes) ? [...new Set(d.votes.map(String))] : [];

    if (!name) {
      return json({ ok: false, code: 'required', error: 'Please enter your full name.' });
    }
    if (proxy && !proxyFor) {
      return json({ ok: false, code: 'proxy', error: 'Please enter the full name of the person you are voting for.' });
    }
    if (votes.length < MIN_VOTES || votes.length > MAX_VOTES) {
      return json({ ok: false, code: 'count', error: `Please select ${MIN_VOTES} to ${MAX_VOTES} nominees.` });
    }
    if (votes.some(v => !NOMINEE_NAMES.includes(v))) {
      return json({ ok: false, code: 'invalid', error: 'Invalid selection. Please reload the page.' });
    }
    if (key(signature) !== key(name)) {
      return json({ ok: false, code: 'signature', error: 'Your signature must match your full name.' });
    }

    // The member this ballot counts for: the voter, or the person they are a proxy for
    const memberName = proxy ? proxyFor : name;
    const member = key(memberName);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Optional member allowlist (empty = anyone can vote)
    const allowed = getMembers(ss).map(key);
    if (allowed.length && !allowed.includes(member)) {
      return json({ ok: false, code: 'notMember', error: `${memberName} is not on the member list.` });
    }

    // One ballot per member
    const sheet = getBallotSheet(ss);
    const last = sheet.getLastRow();
    if (last > 1) {
      // Columns: Timestamp | Voter Name | Voting As | Proxy For | Signature | nominees... | Submission ID
      const prev = sheet.getRange(2, 1, last - 1, 6 + NOMINEE_NAMES.length).getValues()
        .find(r => key(r[2] === 'Proxy' ? r[3] : r[1]) === member);
      if (prev) {
        // A retry of a submission we already recorded (the first reply was lost): report success, don't add a row
        if (id && prev[5 + NOMINEE_NAMES.length] === id) return json({ ok: true });
        return json({ ok: false, code: 'duplicate', error: `A ballot has already been submitted for ${memberName}.` });
      }
    }

    sheet.appendRow([
      new Date(),
      name,
      proxy ? 'Proxy' : 'Self',
      proxyFor,
      signature,
      ...NOMINEE_NAMES.map(n => (votes.includes(n) ? 1 : '')),
      id,
    ]);

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, code: 'server', error: 'Something went wrong. Please try again.' });
  } finally {
    lock.releaseLock();
  }
}

function getBallotSheet(ss) {
  let sh = ss.getSheetByName(BALLOT_SHEET);
  if (!sh) sh = ss.insertSheet(BALLOT_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Timestamp', 'Voter Name', 'Voting As', 'Proxy For', 'Signature', ...NOMINEE_NAMES, 'Submission ID']);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Trim and collapse internal whitespace
function clean(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

// Comparison key for names: ignores case, punctuation, and word order,
// so "Tejedo, Luke Soliven." matches "Luke Soliven Tejedo". Keep in sync with nameKey() in index.html.
function key(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ');
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
