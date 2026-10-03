// Plain Node test runner, no dependencies: node tests/run-tests.mjs
// Expected numbers were counted by hand from tools/make-data.mjs, where every
// planted lead is written out; the counts are noted next to each check.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(projectDir, 'data.js')).href);
await import(pathToFileURL(path.join(projectDir, 'readout.mjs')).href);

const R = globalThis.LeadReadout;
const DATA = globalThis.READOUT_DATA;
const read = (name) => readFileSync(path.join(projectDir, name), 'utf8');

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}\n     ${String(error.message).split('\n').join('\n     ')}`);
  }
}

const readout = R.analyze(DATA.account);
const leads = DATA.account.leads;
const byId = (list, id) => list.find((x) => x.id === id);

// Small hand-made lead for rule checks.
let seq = 0;
function lead(rep, action, extra = {}) {
  seq += 1;
  return {
    lead_id: `T${seq}`, company: `Test ${seq}`, rep, segment: 'gym', size_band: 'mid', miles_to_depot: 10,
    ownership: 'independent', equipment_contract: 'no', has_website: true, action, view_count: 1, ...extra,
  };
}
const many = (count, rep, action, extra) => Array.from({ length: count }, () => lead(rep, action, extra));

// ------------------------------------------------------------------ data

test('data: 160 leads, 40 per rep, unique ids', () => {
  assert.equal(leads.length, 160);
  for (const rep of ['A', 'B', 'C', 'D']) assert.equal(leads.filter((l) => l.rep === rep).length, 40, `rep ${rep}`);
  assert.equal(new Set(leads.map((l) => l.lead_id)).size, 160);
  assert.equal(new Set(leads.map((l) => l.company)).size, 160);
});

test('data: every field uses the allowed values', () => {
  const allowed = {
    segment: ['hotel', 'care_home', 'gym', 'laundromat'],
    size_band: ['small', 'mid', 'large'],
    ownership: ['independent', 'chain_or_franchise', 'management_group'],
    equipment_contract: ['yes', 'no', 'unknown'],
    action: ['meeting_booked', 'contacted', 'liked', 'thumbs_down', 'not_interested', 'viewed_no_action'],
  };
  for (const account of [DATA.account, DATA.nextAccount]) {
    for (const l of account.leads) {
      for (const [field, values] of Object.entries(allowed)) assert.ok(values.includes(l[field]), `${l.lead_id} ${field}=${l[field]}`);
      assert.equal(typeof l.has_website, 'boolean');
      assert.ok(Number.isInteger(l.miles_to_depot) && l.miles_to_depot > 0, `${l.lead_id} miles`);
      assert.ok(Number.isInteger(l.view_count) && l.view_count >= 1, `${l.lead_id} views`);
      assert.ok(account.reps.includes(l.rep), `${l.lead_id} rep`);
    }
  }
});

test('data: notes sit only on turn-downs, on 24 of 60 (40%)', () => {
  const withNote = leads.filter((l) => l.note);
  assert.ok(withNote.every(R.isTurnedDown), 'a note on a lead that was not turned down');
  assert.equal(withNote.length, 24);
});

test('data: second account is a 60-lead, 2-rep account with no shared companies', () => {
  const next = DATA.nextAccount;
  assert.equal(next.leads.length, 60);
  assert.deepEqual([...next.reps], ['E', 'F']);
  for (const rep of next.reps) assert.equal(next.leads.filter((l) => l.rep === rep).length, 30);
  assert.deepEqual([...new Set(next.leads.map((l) => l.segment))].sort(), ['care_home', 'gym', 'hotel', 'laundromat']);
  const first = new Set(leads.map((l) => l.company));
  assert.ok(next.leads.every((l) => !first.has(l.company)));
});

test('data: frozen, so the page cannot change the numbers', () => {
  assert.ok(Object.isFrozen(DATA) && Object.isFrozen(DATA.account.leads) && Object.isFrozen(DATA.nextAccount.leads));
});

// ------------------------------------------------------------------ definitions

test('definitions: turned down, accepted, left alone', () => {
  assert.ok(R.isTurnedDown(lead('A', 'thumbs_down')) && R.isTurnedDown(lead('A', 'not_interested')));
  for (const a of ['liked', 'contacted', 'meeting_booked']) assert.ok(R.isAccepted(lead('A', a)), a);
  assert.ok(R.isLeftAlone(lead('A', 'viewed_no_action', { view_count: 2 })));
  assert.ok(!R.isLeftAlone(lead('A', 'viewed_no_action', { view_count: 1 })), 'one view is not left alone');
  assert.equal(R.outcomeOf(lead('A', 'viewed_no_action', { view_count: 1 })), 'viewed_once');
});

test('overall: 60 turned down, 64 accepted, 20 left alone, 16 viewed once', () => {
  assert.deepEqual(readout.overall, { total: 160, turnedDown: 60, accepted: 64, leftAlone: 20, viewedOnce: 16 });
});

test('rules: the thresholds on the page are the spec values', () => {
  const r = R.RULES;
  assert.equal(r.minLeads, 8);
  assert.equal(r.liftNumerator / r.liftDenominator, 1.5);
  assert.equal(r.teamTurnDownPct, 60);
  assert.equal(r.splitAcceptPct, 50);
  assert.equal(r.minRepLeads, 3);
  assert.equal(r.leftAloneMinViews, 2);
  assert.equal(r.maxQuestions, 5);
});

test('rules: exactly 1.5x is flagged, just under is not', () => {
  // overall 2 of 8 = 25%; 1.5x = 37.5%
  assert.equal(R.meetsLift(3, 8, 2, 8), true); // 37.5%
  assert.equal(R.meetsLift(3, 9, 2, 8), false); // 33.3%
  assert.equal(R.meetsLift(0, 8, 0, 8), false); // nothing turned down never flags
});

test('rules: a group under 8 leads is never flagged, however high its rate', () => {
  const account = [...many(7, 'A', 'thumbs_down', { segment: 'hotel' }), ...many(30, 'A', 'liked')];
  const found = R.findPatterns(account);
  const hotel = byId(found.rows, 'segment:hotel');
  assert.equal(hotel.n, 7);
  assert.equal(hotel.turnedDown, 7);
  assert.equal(hotel.flagged, false);
  assert.ok(!found.flagged.some((p) => p.id === 'segment:hotel'));
});

test('distance bins: 20, 40 and 60 miles are upper edges', () => {
  assert.equal(R.distanceBin(20), '0_20');
  assert.equal(R.distanceBin(21), '21_40');
  assert.equal(R.distanceBin(60), '41_60');
  assert.equal(R.distanceBin(61), 'over_60');
});

// ------------------------------------------------------------------ team check

test('team check: whole team, split and not enough data', () => {
  const reps = ['A', 'B', 'C'];
  const whole = [...many(2, 'A', 'thumbs_down'), lead('A', 'liked'), ...many(3, 'B', 'not_interested'), ...many(2, 'C', 'thumbs_down')];
  assert.equal(R.teamCheck(whole, reps).label, 'whole_team'); // A 2/3 = 67%, B 3/3, C has only 2 so is ignored
  const split = [...many(3, 'A', 'thumbs_down'), ...many(2, 'B', 'contacted'), lead('B', 'thumbs_down', {}), lead('B', 'thumbs_down')];
  assert.equal(R.teamCheck(split, reps).label, 'split'); // A 100% down, B accepts 2/4 = 50%
  const one = [...many(5, 'A', 'thumbs_down'), ...many(2, 'B', 'thumbs_down')];
  assert.equal(R.teamCheck(one, reps).label, 'not_enough'); // only one rep has 3+ leads
  const muddled = [...many(2, 'A', 'thumbs_down'), ...many(2, 'A', 'viewed_no_action'), ...many(3, 'B', 'thumbs_down')];
  assert.equal(R.teamCheck(muddled, reps).label, 'not_enough'); // A only 50% down and accepts none, so neither rule fits
});

test('team check: a rep with exactly 50% accepted and another at 60% down is a split', () => {
  const reps = ['A', 'B'];
  const leadsIn = [...many(2, 'A', 'liked'), ...many(2, 'A', 'viewed_no_action'), ...many(3, 'B', 'thumbs_down'), ...many(2, 'B', 'liked')];
  assert.equal(R.teamCheck(leadsIn, reps).label, 'split'); // A 2/4 = 50% accepted; B 3/5 = 60% down
});

// ------------------------------------------------------------------ the readout

test('patterns: exactly the three planted patterns are flagged, strongest first', () => {
  assert.deepEqual(readout.patterns.map((p) => [p.id, p.n, p.turnedDown]), [
    ['ownership:chain_or_franchise', 23, 19], // 20 chain hotels + 3 franchise gyms
    ['distance:over_60', 18, 14],
    ['segment:care_home', 20, 13],
  ]);
  assert.equal(readout.rows.length, 19);
  assert.ok(readout.rows.every((r) => r.eligible), 'every value here has 8+ leads');
});

test('patterns: every flagged rate is at least 1.5x the overall 37.5%', () => {
  for (const p of readout.patterns) assert.ok(p.turnedDown / p.n >= 1.5 * (60 / 160), p.id);
  const notFlagged = readout.rows.filter((r) => !r.flagged);
  for (const r of notFlagged) assert.ok(r.turnedDown / r.n < 1.5 * (60 / 160), r.id);
});

test('patterns: team labels, chain and distance are whole team, care homes split', () => {
  const label = (id) => byId(readout.patterns, id).team.label;
  assert.equal(label('ownership:chain_or_franchise'), 'whole_team');
  assert.equal(label('distance:over_60'), 'whole_team');
  assert.equal(label('segment:care_home'), 'split');
  const far = byId(readout.patterns, 'distance:over_60').team.reps.find((r) => r.rep === 'C');
  assert.equal(far.n, 2);
  assert.equal(far.counted, false, 'Rep C has only 2 far leads, so is not counted');
});

test('patterns: care homes, Rep C accepts 4 of 6; A, B and D turn down 12 of 14', () => {
  const care = byId(readout.patterns, 'segment:care_home');
  const rep = (id) => care.team.reps.find((r) => r.rep === id);
  assert.deepEqual([rep('C').accepted, rep('C').n], [4, 6]);
  assert.deepEqual(['A', 'B', 'D'].map((id) => [rep(id).turnedDown, rep(id).n]), [[4, 5], [3, 4], [5, 5]]);
  assert.deepEqual(readout.split[0].summary, {
    sentence: 'Care homes split the team: Rep C accepted 4 of 6, while Reps A, B and D turned down 12 of 14.',
    ask: 'Should new care homes go to reps the way Rep C works them, or be screened out?',
  });
});

test('note keywords: fixed map, whole words, any case', () => {
  assert.deepEqual(R.themesOf('HQ handles all equipment'), ['central']);
  assert.deepEqual(R.themesOf('140 miles out'), ['range']);
  assert.deepEqual(R.themesOf('Outside service radius'), ['range']);
  assert.deepEqual(R.themesOf('tiny site'), ['size']);
  assert.deepEqual(R.themesOf('locked in with current vendor'), ['supplier']);
  assert.deepEqual(R.themesOf('bad timing, try again in January'), []);
  assert.deepEqual(R.themesOf('franchised'), [], 'part of a word does not match');
  assert.deepEqual(R.themesOf(undefined), []);
});

test('note keywords: 9 chain notes mention central buying, 6 far notes mention service range', () => {
  const chain = byId(readout.patterns, 'ownership:chain_or_franchise').themes;
  assert.equal(chain.notes, 9);
  assert.deepEqual(chain.ranked.map((t) => [t.id, t.count]), [['central', 9]]);
  const far = byId(readout.patterns, 'distance:over_60').themes;
  assert.deepEqual(far.ranked.map((t) => [t.id, t.count]), [['range', 6]]);
});

test('result sentence: computed, matches the spec shape', () => {
  assert.equal(readout.sentence,
    'Four reps turned down 60 of 160 suggested leads; 46 of those 60 trace to three patterns, and one pattern splits the team.');
  // 46 counted independently: distinct turned-down leads inside any flagged pattern.
  const ids = new Set();
  for (const p of readout.patterns) for (const l of p.leads) if (R.isTurnedDown(l)) ids.add(l.lead_id);
  assert.equal(ids.size, 46);
  assert.equal(readout.turnedDownInPatterns, 46);
});

test('result sentence: other shapes read correctly', () => {
  const none = R.analyze({ reps: ['A', 'B'], leads: [...many(10, 'A', 'liked'), ...many(10, 'B', 'liked'), lead('A', 'thumbs_down')] });
  assert.equal(none.sentence, 'Two reps turned down 1 of 21 suggested leads; none of those trace to a pattern with enough leads to call.');
});

test('left alone: 20 leads, kept apart from turn-downs; no-website sites stand out (13 of 16)', () => {
  const la = readout.leftAlone;
  assert.equal(la.leads.length, 20);
  assert.ok(la.leads.every((l) => !R.isTurnedDown(l) && l.view_count >= 2));
  assert.deepEqual(la.standouts.map((s) => [s.id, s.leftAlone, s.n]), [['website:no', 13, 16]]);
  const noSite = byId(readout.rows, 'website:no');
  assert.equal(noSite.turnedDown, 1, 'no-website sites are hesitation, not turn-downs');
  assert.equal(noSite.flagged, false);
});

test('questions: one per whole-team pattern, with computed evidence', () => {
  assert.deepEqual(readout.questions.map((q) => [q.text, q.passOn, q.evidence]), [
    ['Does this company buy equipment through a head office?', 'Yes',
      '19 of 23 chain or franchise sites turned down across all 4 reps. 9 notes mention central buying.'],
    ['Is the site within 60 miles of a service depot?', 'No',
      '14 of 18 sites over 60 miles from the depot turned down. Reps A, B and D each turned down 80% or more (Rep C had only 2). 6 notes mention service range.'],
  ]);
  assert.ok(!readout.questions.some((q) => q.id === 'segment:care_home'), 'a split never becomes a question');
});

test('questions: never more than five', () => {
  const loose = { ...R.RULES, liftNumerator: 0, teamTurnDownPct: 0, minLeads: 1 };
  const busy = R.analyze(DATA.account, loose);
  assert.ok(busy.wholeTeam.length > 5, 'setup should produce more than five whole-team patterns');
  assert.equal(busy.questions.length, 5);
});

// ------------------------------------------------------------------ choices and notes

test('choices: unknown ids and values are dropped', () => {
  const clean = R.cleanChoices({ 'ownership:chain_or_franchise': 'accepted', 'distance:over_60': 'maybe', junk: 'accepted' }, readout.questions);
  assert.deepEqual(clean, { 'ownership:chain_or_franchise': 'accepted' });
  assert.deepEqual(R.cleanChoices('not an object', readout.questions), {});
  assert.deepEqual(R.cleanChoices(null, readout.questions), {});
});

test('account notes: only accepted questions, plus the split as a question for the sales lead', () => {
  const empty = R.accountNotes(readout, {});
  assert.match(empty, /\(none accepted yet\)/);
  assert.match(empty, /Based on two weeks of activity: four reps, 160 suggested leads\./);
  const notes = R.accountNotes(readout, { 'ownership:chain_or_franchise': 'accepted', 'distance:over_60': 'rejected' });
  assert.match(notes, /1\. Does this company buy equipment through a head office\? Reps pass on: Yes\./);
  assert.ok(!notes.includes('within 60 miles'), 'a rejected question stays out');
  assert.match(notes, /Care homes split the team/);
  assert.match(notes, /It does not score or rank new leads\.$/);
});

// ------------------------------------------------------------------ carry-over page

test('carry-over: nothing saved means every whole-team question', () => {
  const sel = R.selectionFor(readout, null);
  assert.equal(sel.source, 'default');
  assert.equal(sel.questions.length, 2);
  const one = R.selectionFor(readout, { 'distance:over_60': 'accepted', 'ownership:chain_or_franchise': 'rejected' });
  assert.equal(one.source, 'saved');
  assert.deepEqual(one.questions.map((q) => q.id), ['distance:over_60']);
  const none = R.selectionFor(readout, { 'distance:over_60': 'rejected' });
  assert.deepEqual([none.source, none.questions.length], ['saved', 0]);
});

test('carry-over: chain buying holds on the coffee account (9 of 12 vs 18 of 60), distance stays here', () => {
  const result = R.carryOver(readout, DATA.nextAccount, readout.questions);
  const chain = byId(result.items, 'ownership:chain_or_franchise');
  assert.equal(chain.group, 'carries');
  assert.deepEqual([chain.check.turnedDown, chain.check.n, chain.check.overall.turnedDown, chain.check.overall.total], [9, 12, 18, 60]);
  assert.equal(chain.check.holds, true);
  const far = byId(result.items, 'distance:over_60');
  assert.equal(far.group, 'account_only');
  assert.deepEqual([far.check.turnedDown, far.check.n], [1, 9]);
  assert.equal(R.carrySentence(result, 'default'),
    'Of two whole-team questions, one held up on a second account and likely carries to the next one, one stays with this account only, and none need a test first.');
  const chainOnly = R.carryOver(readout, DATA.nextAccount, readout.questions.slice(0, 1));
  assert.equal(R.carrySentence(chainOnly, 'saved'),
    'Of one accepted question, one held up on a second account and likely carries to the next one, none stay with this account only, and none need a test first.');
  assert.equal(R.carrySentence(R.carryOver(readout, DATA.nextAccount, []), 'saved'), 'No accepted questions to sort yet.');
});

test('carry-over: a "carries" pattern that does not hold on the second account moves to test', () => {
  const flipped = {
    ...DATA.nextAccount,
    leads: DATA.nextAccount.leads.map((l) => (l.ownership === 'chain_or_franchise' ? { ...l, action: 'liked' } : l)),
  };
  const item = byId(R.carryOver(readout, flipped, readout.questions).items, 'ownership:chain_or_franchise');
  assert.equal(item.initialGroup, 'carries');
  assert.equal(item.group, 'test');
  assert.match(item.verdict, /^Didn't hold on the second account/);
});

test('carry-over: too few matching leads on the second account also moves it to test', () => {
  const thin = { ...DATA.nextAccount, leads: DATA.nextAccount.leads.filter((l) => l.ownership !== 'chain_or_franchise' || l.rep === 'E') };
  const item = byId(R.carryOver(readout, thin, readout.questions).items, 'ownership:chain_or_franchise');
  assert.equal(item.check.n, 6);
  assert.equal(item.group, 'test');
  assert.match(item.verdict, /under the 8-lead minimum/);
});

// ------------------------------------------------------------------ display helpers

test('display: one-decimal rates and thresholds agree with each other', () => {
  assert.equal(R.pct1(60, 160), '37.5%');
  assert.equal(R.thresholdPct(60, 160), '56.3%'); // 1.5 x 37.5% = 56.25%
  assert.equal(R.pct1(20, 160), '12.5%');
  assert.equal(R.thresholdPct(20, 160), '18.8%');
  assert.equal(R.pct(19, 23), '83%');
  assert.equal(R.liftText(byId(readout.patterns, 'ownership:chain_or_franchise').lift), '2.2x');
});

// ------------------------------------------------------------------ pages and repo

const pageFiles = ['index.html', 'carry-over.html', 'app.js', 'carry.js', 'readout.mjs', 'data.js', 'styles.css'];

test('pages: labeled synthetic, result sentence slot, footer, next-account link', () => {
  const index = read('index.html');
  const carry = read('carry-over.html');
  for (const page of [index, carry]) {
    assert.match(page, /Synthetic data<\/span>/);
    assert.match(page, /Built by Dakshit Raj with Claude Code and Codex\. Synthetic data\./);
    assert.match(page, /id="result"/);
  }
  assert.match(index, /<a href="carry-over\.html">Next account<\/a>/);
  assert.match(carry, /<title>What carries to the next account<\/title>/);
});

test('pages: the open questions from the spec, word for word', () => {
  const index = read('index.html');
  for (const q of [
    'When a rep turns a lead down, does that change what the whole team sees, or only that rep?',
    'When reps disagree on a segment, who settles it: the customer\'s head of sales or the data?',
    'Do you treat a lead that was viewed and left alone as a signal?',
    'How many qualification questions does an account usually keep after its first month?',
    'How often do reps leave a note when they turn a lead down?',
  ]) assert.ok(index.includes(q), q);
  const carry = read('carry-over.html');
  for (const q of [
    'When something works in one account, how does it get into the product today?',
    'Do you keep what works per industry or per customer?',
  ]) assert.ok(carry.includes(q), q);
});

test('pages: no external requests, no network calls, no randomness', () => {
  for (const name of pageFiles) {
    const text = read(name);
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(text) && !/new\s+(XMLHttpRequest|WebSocket|EventSource)\b/.test(text), `${name} makes a network call`);
    assert.ok(!/Math\.random/.test(text), `${name} uses randomness`);
    assert.ok(!/\bimport\s*\(|^\s*import\s|^\s*export\s/m.test(text), `${name} uses module syntax that breaks file://`);
  }
  for (const name of ['index.html', 'carry-over.html']) {
    const text = read(name);
    const refs = [...text.matchAll(/\b(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of refs) {
      const external = /^[a-z]+:/i.test(ref) || ref.startsWith('//');
      if (external) assert.equal(ref, 'https://github.com/Duckky153/lead-feedback-readout', `${name} links out to ${ref}`);
    }
    assert.ok(!/<script[^>]+src="(https?:)?\/\//.test(text) && !/<link[^>]+href="(https?:)?\/\//.test(text), `${name} loads an external file`);
  }
});

test('pages: every localStorage use sits inside a try block', () => {
  for (const name of ['app.js', 'carry.js']) {
    const lines = read(name).split('\n');
    lines.forEach((line, i) => {
      if (!line.includes('localStorage')) return;
      const before = lines.slice(Math.max(0, i - 4), i).join('\n');
      assert.match(before, /try \{/, `${name}:${i + 1} uses localStorage outside try`);
    });
  }
});

test('pages: Copy calls the clipboard inside the click handler and falls back to selecting', () => {
  const app = read('app.js');
  const handler = app.slice(app.indexOf("$('copy-btn').addEventListener('click'"));
  assert.ok(handler.indexOf('navigator.clipboard.writeText') > 0);
  assert.ok(/box\.select\(\)/.test(handler));
});

function repoFiles(dir = projectDir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...repoFiles(full));
    else out.push(full);
  }
  return out;
}
const rel = (file) => path.relative(projectDir, file).split(path.sep).join('/');

test('repo: holds only the files the README lists', () => {
  assert.deepEqual(repoFiles().map(rel).sort(), [
    'README.md', 'app.js', 'carry-over.html', 'carry.js', 'data.js', 'index.html',
    'readout.mjs', 'styles.css', 'tests/run-tests.mjs', 'tools/make-data.mjs',
  ]);
});

test('repo: no local file paths or email addresses', () => {
  for (const file of repoFiles()) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/(?:^|[\s"'(=])(?:\/Users\/|\/home\/|~\/|[A-Z]:\\)/m.test(text), `${rel(file)} has a local path`);
    assert.ok(!/[\w.+-]+@[a-z0-9-]+\.[a-z]{2,}/i.test(text), `${rel(file)} has an email address`);
  }
});

// The credit line is read from the page footer.
const credit = /Built by (\w+) (\w+) with Claude Code and Codex\./.exec(read('index.html'));
const creditLine = credit ? credit[0] : 'missing credit line';
const nameWord = new RegExp(`\\b(?:${credit ? `${credit[1]}|${credit[2]}` : 'missing'})\\b`, 'i');

test('repo: the name appears only in the footers and the README credit line', () => {
  assert.ok(credit, 'index.html footer credit line');
  for (const file of repoFiles()) {
    if (rel(file).startsWith('tests/')) continue; // the page checks above assert the footer text itself
    const lines = readFileSync(file, 'utf8').split('\n').filter((l) => nameWord.test(l));
    for (const l of lines) assert.ok(l.includes(creditLine), `${rel(file)}: ${l.trim()}`);
  }
});

test('repo: no em or en dashes in any file', () => {
  for (const file of repoFiles()) {
    assert.ok(!/[\u2013\u2014]/.test(readFileSync(file, 'utf8')), rel(file));
  }
});

// ------------------------------------------------------------------ summary

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const name of failures) console.log(`  - ${name}`);
  process.exit(1);
}
