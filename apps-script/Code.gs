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
// Optional member list, no header row:
//   column A = full name. If the sheet is missing or empty, anyone can vote.
//   column B = birthday (a date). If any birthday is filled in, every voter must enter
//              the matching birthday of the member the ballot is for. Birthdays are never sent to the page.
const VOTERS_SHEET = 'Voters';
const MAX_ATTEMPTS = 5; // wrong birthdays allowed per member before that name is locked (reset: see unlockAll)
// ====================

const NOMINEE_NAMES = NOMINEES.map(n => n.name);

function doGet() {
  return json({
    nominees: NOMINEES,
    members: getMembers(SpreadsheetApp.getActiveSpreadsheet()).map(m => m.name), // name suggestions only
    maxVotes: MAX_VOTES,
    minVotes: MIN_VOTES,
    open: VOTING_OPEN,
  });
}

// Members from the Voters sheet as { name, birthday: 'YYYY-MM-DD' | '' }. [] if the sheet is missing or empty.
function getMembers(ss) {
  const sh = ss.getSheetByName(VOTERS_SHEET);
  if (!sh || sh.getLastRow() === 0) return [];
  const tz = ss.getSpreadsheetTimeZone();
  return sh.getRange(1, 1, sh.getLastRow(), 2).getValues()
    .map(([n, b]) => ({ name: clean(n).replace(/[,\s]+$/, ''), birthday: isoDate(b, tz) }))
    .filter(m => m.name);
}

// A Sheet cell (Date, or 'YYYY-MM-DD' text) as 'YYYY-MM-DD'. Anything else becomes '' (can't verify).
function isoDate(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// Wrong-birthday counter per member, kept in Script Properties
function failCount(member) {
  return Number(PropertiesService.getScriptProperties().getProperty('fail:' + member) || 0);
}
function addFail(member) {
  PropertiesService.getScriptProperties().setProperty('fail:' + member, String(failCount(member) + 1));
}

// Run from the Apps Script editor (select unlockAll → Run) to reset all locked names
function unlockAll() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).filter(k => k.startsWith('fail:')).forEach(k => props.deleteProperty(k));
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
    const birthday = String(d.birthday || '').trim();
    const proxy = d.votingAs === 'proxy';
    const proxyFor = proxy ? clean(d.proxyFor) : '';
    const memberBirthday = proxy ? String(d.memberBirthday || '').trim() : birthday;
    const signature = clean(d.signature);
    const votes = Array.isArray(d.votes) ? [...new Set(d.votes.map(String))] : [];

    if (!name || !validBirthday(birthday)) {
      return json({ ok: false, code: 'required', error: 'Please enter your full name and a valid birthday.' });
    }
    if (proxy && !proxyFor) {
      return json({ ok: false, code: 'proxy', error: 'Please enter the full name of the person you are voting for.' });
    }
    if (proxy && !validBirthday(memberBirthday)) {
      return json({ ok: false, code: 'proxyBday', error: 'Please enter a valid birthday for the person you are voting for.' });
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
    const members = getMembers(ss);
    if (members.length) {
      const rec = members.find(m => key(m.name) === member);
      if (!rec) {
        return json({ ok: false, code: 'notMember', error: `${memberName} is not on the member list.` });
      }
      // Birthday verification, on once any birthday is filled in on the Voters sheet
      if (members.some(m => m.birthday)) {
        if (failCount(member) >= MAX_ATTEMPTS) {
          return json({ ok: false, code: 'locked', error: `Too many incorrect attempts for ${memberName}. Please contact the election committee.` });
        }
        if (!rec.birthday) {
          return json({ ok: false, code: 'noBirthday', error: `We can't verify ${memberName}. Please contact the election committee.` });
        }
        if (rec.birthday !== memberBirthday) {
          addFail(member);
          return json({ ok: false, code: 'verify', error: `The name and birthday don't match our records for ${memberName}.` });
        }
      }
    }

    // One ballot per member (checked after verification, so it doesn't reveal who has voted)
    const sheet = getBallotSheet(ss);
    const last = sheet.getLastRow();
    if (last > 1) {
      // Columns B..E: Voter Name | Birthday | Voting As | Proxy For
      const used = sheet.getRange(2, 2, last - 1, 4).getValues()
        .map(r => key(r[2] === 'Proxy' ? r[3] : r[0]));
      if (used.includes(member)) {
        return json({ ok: false, code: 'duplicate', error: `A ballot has already been submitted for ${memberName}.` });
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
    return json({ ok: false, code: 'server', error: 'Something went wrong. Please try again.' });
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

// Comparison key for names: ignores case, punctuation, and word order,
// so "Tejedo, Luke Soliven." matches "Luke Soliven Tejedo". Keep in sync with nameKey() in index.html.
function key(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/).filter(Boolean).sort().join(' ');
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
