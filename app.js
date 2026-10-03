/* Renders the readout page. Every number and rule comes from readout.mjs. */
(function () {
  'use strict';

  const R = window.LeadReadout;
  const DATA = window.READOUT_DATA;
  const $ = (id) => document.getElementById(id);

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  const readout = R.analyze(DATA.account);
  const { overall } = readout;
  const rules = R.RULES;

  // Highlights the fixed keyword-map words inside a note.
  const allWords = R.THEMES.flatMap((t) => t.words).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const wordRegex = new RegExp(`\\b(${allWords.join('|')})\\b`, 'gi');
  function noteHtml(note) {
    if (!note) return '<span class="muted">-</span>';
    const parts = String(note).split(wordRegex);
    return `<span class="note">${parts.map((part, i) => (i % 2 === 1 ? `<span class="mark">${escapeHtml(part)}</span>` : escapeHtml(part))).join('')}</span>`;
  }

  function actionCell(lead) {
    const o = R.outcomeOf(lead);
    return `<span class="outcome-${o}">${escapeHtml(R.ACTION_LABELS[lead.action])}</span>`;
  }
  const segmentLabel = (lead) => {
    const attr = R.ATTRIBUTES.find((a) => a.key === 'segment');
    const v = attr.values.find((x) => x.value === lead.segment);
    return v ? v.label : lead.segment;
  };

  const thresholdPct = (hit, n) => R.thresholdPct(hit, n, rules);

  // ---------------------------------------------------------------- header

  $('result').textContent = readout.sentence;

  const stat = (value, label) => `<div class="stat"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
  $('stats').innerHTML = [
    stat(overall.total, 'suggested leads'),
    stat(`${overall.turnedDown} (${R.pct(overall.turnedDown, overall.total)})`, 'turned down'),
    stat(`${overall.accepted} (${R.pct(overall.accepted, overall.total)})`, 'accepted'),
    stat(`${overall.leftAlone} (${R.pct(overall.leftAlone, overall.total)})`, 'left alone'),
    stat(overall.viewedOnce, 'viewed once, no action'),
  ].join('');

  // ---------------------------------------------------------------- patterns

  function themeCell(themes) {
    if (!themes.notes) return '<span class="muted">No notes</span>';
    const found = themes.ranked.map((t) => `${escapeHtml(t.label)} (${t.count})`).join(', ');
    return `${found || '<span class="muted">none match</span>'} <span class="muted small">of ${themes.notes} note${themes.notes === 1 ? '' : 's'}</span>`;
  }

  function leadsTable(leads) {
    const rows = leads
      .slice()
      .sort((a, b) => a.rep.localeCompare(b.rep) || a.lead_id.localeCompare(b.lead_id))
      .map((lead) => `<tr>
        <td>${escapeHtml(lead.lead_id)}</td>
        <td>${escapeHtml(lead.company)}<br><span class="muted small">${escapeHtml(segmentLabel(lead))}, ${lead.miles_to_depot} mi</span></td>
        <td>${escapeHtml(lead.rep)}</td>
        <td>${actionCell(lead)}</td>
        <td>${noteHtml(lead.note)}</td>
      </tr>`).join('');
    return `<div class="table-wrap"><table>
      <thead><tr><th>Lead</th><th>Company</th><th>Rep</th><th>Action</th><th>Note</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function renderPatterns() {
    const table = $('pattern-table');
    const head = `<thead><tr>
      <th>Pattern</th><th class="num">Leads</th><th class="num">Turned down</th><th class="num">Rate</th>
      <th class="num">Lift</th><th>Matching note keywords</th>
    </tr></thead>`;
    if (!readout.patterns.length) {
      table.innerHTML = `${head}<tbody><tr><td colspan="6" class="muted">No attribute value with enough leads is turned down at 1.5x the overall rate.</td></tr></tbody>`;
    } else {
      const body = readout.patterns.map((p, i) => `
        <tr>
          <td class="pattern-name"><b>${escapeHtml(p.label)}</b><span>${escapeHtml(p.attributeLabel)}</span>
            <button type="button" class="toggle" aria-expanded="false" aria-controls="pd-${i}" data-detail="pd-${i}">Show leads</button></td>
          <td class="num">${p.n}</td>
          <td class="num">${p.turnedDown}</td>
          <td class="num">${R.pct(p.turnedDown, p.n)}</td>
          <td class="num">${R.liftText(p.lift)}</td>
          <td>${themeCell(p.themes)}</td>
        </tr>
        <tr class="detail" id="pd-${i}" hidden><td colspan="6">${leadsTable(p.leads)}</td></tr>`).join('');
      table.innerHTML = `${head}<tbody>${body}</tbody>`;
    }

    const eligible = readout.rows.filter((r) => r.eligible).length;
    $('pattern-rule').textContent = `Overall, ${overall.turnedDown} of ${overall.total} leads were turned down (${R.pct1(overall.turnedDown, overall.total)}). `
      + `A value is flagged when it has at least ${rules.minLeads} leads and a turn-down rate of at least 1.5x that, so ${thresholdPct(overall.turnedDown, overall.total)} or more. `
      + `${readout.rows.length} values checked, ${eligible} had enough leads, ${readout.patterns.length} flagged.`;

    $('all-values-summary').textContent = `Every value checked (${readout.rows.length})`;
    const allRows = readout.rows.map((r) => {
      let result;
      if (r.flagged) result = '<span class="badge split">Flagged</span>';
      else if (!r.eligible) result = `<span class="muted">Under ${rules.minLeads} leads</span>`;
      else result = '<span class="muted">Below 1.5x</span>';
      return `<tr>
        <td>${escapeHtml(r.attributeLabel)}</td><td>${escapeHtml(r.label)}</td>
        <td class="num">${r.n}</td><td class="num">${r.turnedDown}</td>
        <td class="num">${r.n ? R.pct(r.turnedDown, r.n) : '-'}</td><td class="num">${r.n ? R.liftText(r.lift) : '-'}</td>
        <td>${result}</td></tr>`;
    }).join('');
    $('all-values-table').innerHTML = `<thead><tr><th>Attribute</th><th>Value</th><th class="num">Leads</th><th class="num">Turned down</th>
      <th class="num">Rate</th><th class="num">Lift</th><th>Result</th></tr></thead><tbody>${allRows}</tbody>`;
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('button.toggle');
    if (!btn) return;
    const row = document.getElementById(btn.dataset.detail);
    if (!row) return;
    const open = row.hidden;
    row.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Hide leads' : 'Show leads';
  });

  // ---------------------------------------------------------------- team rule or taste

  const badgeClass = { whole_team: 'team', split: 'split', not_enough: 'thin' };

  function teamCard(p) {
    // Rate sits next to the rep so it stays visible on a phone.
    const rows = p.team.reps.filter((r) => r.n > 0).map((r) => {
      const rate = r.counted ? `<b>${R.pct(r.turnedDown, r.n)}</b>` : 'not counted';
      return `<tr${r.counted ? '' : ' class="thin-row"'}><td>Rep ${escapeHtml(r.rep)}</td><td class="num">${rate}</td>
        <td class="num">${r.turnedDown} of ${r.n}</td><td class="num">${r.accepted} of ${r.n}</td></tr>`;
    }).join('');

    let verdict;
    let ask = '';
    if (p.team.label === 'whole_team') {
      verdict = `Every rep with ${rules.minRepLeads} or more of these leads turned down ${rules.teamTurnDownPct}% or more. That reads as a team rule, so it becomes a draft question below.`;
    } else if (p.team.label === 'split') {
      const s = readout.split.find((x) => x.id === p.id).summary;
      verdict = `${s.sentence} Split patterns never become rules.`;
      ask = `<p class="ask"><b>For the customer's sales lead:</b> ${escapeHtml(s.ask)}</p>`;
    } else if (p.team.counted.length < rules.minRepsForTeam) {
      verdict = `Fewer than ${rules.minRepsForTeam} reps have ${rules.minRepLeads} or more of these leads, so it can't be called either way.`;
    } else {
      verdict = 'The reps who count don\'t line up clearly either way, so it stays out of the questions for now.';
    }

    return `<article class="card team-card">
      <header><h3>${escapeHtml(p.label)} <span class="muted small">${escapeHtml(p.attributeLabel)}</span></h3>
        <span class="badge ${badgeClass[p.team.label]}">${escapeHtml(R.TEAM_LABELS[p.team.label])}</span></header>
      <div class="table-wrap"><table>
        <thead><tr><th>Rep</th><th class="num">Turn-down rate</th><th class="num">Turned down</th><th class="num">Accepted</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="verdict">${escapeHtml(verdict)}</p>${ask}
    </article>`;
  }

  function renderTeam() {
    $('team-grid').innerHTML = readout.patterns.length
      ? readout.patterns.map(teamCard).join('')
      : '<p class="muted">No flagged patterns to check.</p>';
  }

  // ---------------------------------------------------------------- left alone

  function renderLeftAlone() {
    const la = readout.leftAlone;
    const top = la.standouts[0];
    let text = `${la.overall.leftAlone} leads were viewed ${rules.leftAloneMinViews} or more times with no action. Silence isn't a no: these are counted apart from turn-downs and never feed the questions.`;
    if (top) {
      text += ` ${top.noun.charAt(0).toUpperCase() + top.noun.slice(1)} stand out: ${top.leftAlone} of ${top.n} were left alone, against ${R.pct(la.overall.leftAlone, la.overall.total)} across the account. That looks like reps hesitating over thin information, which is worth a different fix than a rule.`;
    }
    $('left-callout').textContent = text;

    const byAttr = R.ATTRIBUTES.map((attr) => {
      const values = attr.values.map((v) => {
        const id = `${attr.key}:${v.value}`;
        const g = R.groups(DATA.account.leads).find((x) => x.id === id);
        const t = R.tally(g.leads);
        const standsOut = la.standouts.some((s) => s.id === id);
        return { label: v.label, n: t.total, leftAlone: t.leftAlone, standsOut };
      }).filter((v) => v.n > 0);
      const cells = values.map((v) => `<li>${v.standsOut ? '<span class="badge quiet">Stands out</span> ' : ''}${escapeHtml(v.label)}: <b>${v.leftAlone} of ${v.n}</b> <span class="muted">(${R.pct(v.leftAlone, v.n)})</span></li>`).join('');
      return `<tr><td><b>${escapeHtml(attr.label)}</b></td><td><ul class="plain-list" style="list-style:none;padding-left:0;margin:0">${cells}</ul></td></tr>`;
    }).join('');
    $('left-table').innerHTML = `<thead><tr><th>Attribute</th><th>Left alone, by value</th></tr></thead><tbody>${byAttr}</tbody>`;

    $('left-rule').textContent = `Same rules as turn-downs: a value stands out when it has at least ${rules.minLeads} leads and a left-alone rate of at least 1.5x the account's `
      + `(${R.pct1(la.overall.leftAlone, la.overall.total)} overall, so ${thresholdPct(la.overall.leftAlone, la.overall.total)} or more).`;

    $('left-leads-summary').textContent = `The ${la.leads.length} left-alone leads`;
    const rows = la.leads.map((lead) => `<tr>
      <td>${escapeHtml(lead.lead_id)}</td><td>${escapeHtml(lead.company)}</td><td>${escapeHtml(segmentLabel(lead))}</td>
      <td>${lead.has_website ? 'Yes' : 'No'}</td><td>${escapeHtml(lead.rep)}</td><td class="num">${lead.view_count}</td></tr>`).join('');
    $('left-leads-table').innerHTML = `<thead><tr><th>Lead</th><th>Company</th><th>Segment</th><th>Website</th><th>Rep</th><th class="num">Views</th></tr></thead><tbody>${rows}</tbody>`;
  }

  // ---------------------------------------------------------------- questions and notes

  function loadChoices() {
    try {
      const raw = window.localStorage.getItem(R.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }
  function saveChoices(choices) {
    try {
      window.localStorage.setItem(R.STORAGE_KEY, JSON.stringify(choices));
      return true;
    } catch (error) {
      return false;
    }
  }

  function storageAvailable() {
    try {
      const probe = `${R.STORAGE_KEY}.probe`;
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  let choices = R.cleanChoices(loadChoices(), readout.questions);
  let storageWorks = storageAvailable();

  function renderQuestions() {
    const list = $('q-list');
    const cards = readout.questions.map((q) => {
      const c = choices[q.id];
      const status = c === 'accepted' ? 'Accepted' : c === 'rejected' ? 'Rejected' : 'Not decided';
      return `<article class="card q-card" data-id="${escapeHtml(q.id)}">
        <h3>${escapeHtml(q.text)}</h3>
        <p class="meta">Reps pass on: <b>${escapeHtml(q.passOn)}</b> &middot; From pattern: ${escapeHtml(q.pattern.attributeLabel)}, ${escapeHtml(q.pattern.label.toLowerCase())}</p>
        <p class="evidence">${escapeHtml(q.evidence)}</p>
        <div class="q-actions">
          <button type="button" class="btn accept" data-choice="accepted" aria-pressed="${c === 'accepted'}">Accept</button>
          <button type="button" class="btn reject" data-choice="rejected" aria-pressed="${c === 'rejected'}">Reject</button>
          <span class="q-status">${status}</span>
        </div>
      </article>`;
    });
    if (!cards.length) cards.push('<p class="muted">No whole-team pattern, so there is nothing to turn into a question yet.</p>');
    for (const p of readout.split) {
      cards.push(`<p class="small muted">${escapeHtml(p.noun.replace(/^./, (c) => c.toUpperCase()))} split the team, so no question is drafted for them. They go into the notes as a question for the sales lead.</p>`);
    }
    list.innerHTML = cards.join('');
    const notesText = R.accountNotes(readout, choices);
    $('notes').value = notesText;
    $('notes').rows = notesText.split('\n').length + 2;
    $('storage-note').textContent = storageWorks
      ? 'Choices are saved in this browser only, so the Next account page can read them.'
      : 'This browser isn\'t saving choices, so the Next account page will use every whole-team question.';
  }

  $('q-list').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-choice]');
    if (!btn) return;
    const id = btn.closest('.q-card').dataset.id;
    const choice = btn.dataset.choice;
    if (choices[id] === choice) delete choices[id];
    else choices[id] = choice;
    storageWorks = saveChoices(choices);
    renderQuestions();
    const again = document.querySelector(`.q-card[data-id="${CSS.escape(id)}"] button[data-choice="${choice}"]`);
    if (again) again.focus();
  });

  $('copy-btn').addEventListener('click', () => {
    const box = $('notes');
    const status = $('copy-status');
    const fallback = () => {
      box.focus();
      box.select();
      status.textContent = 'Selected. Press Ctrl+C or Cmd+C to copy.';
    };
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(box.value).then(() => { status.textContent = 'Copied.'; }, fallback);
      } else {
        fallback();
      }
    } catch (error) {
      fallback();
    }
  });

  // ---------------------------------------------------------------- assumptions

  function renderAssumptions() {
    const leads = DATA.account.leads;
    const td = leads.filter(R.isTurnedDown);
    const withNotes = td.filter((l) => l.note).length;
    const items = [
      `A group needs at least ${rules.minLeads} leads before it can be flagged, so a handful of leads can't create a pattern.`,
      `A group is flagged when its turn-down rate is at least 1.5x the account's overall rate (${R.pct1(overall.turnedDown, overall.total)} here, so ${thresholdPct(overall.turnedDown, overall.total)} or more).`,
      `Only reps with ${rules.minRepLeads} or more leads in a pattern count. "Whole team" means every counted rep, and at least ${rules.minRepsForTeam} of them, turned down ${rules.teamTurnDownPct}% or more. "Split" means one counted rep accepted ${rules.splitAcceptPct}% or more while another turned down ${rules.teamTurnDownPct}% or more. Anything else is "Not enough data".`,
      'Split patterns never become rules. They become a question for the customer\'s sales lead.',
      `The window is two weeks: one feed of 40 suggested leads per rep, ${overall.total} in all.`,
      `Notes are optional. Only ${withNotes} of the ${td.length} turn-downs have one, so note keywords support a pattern but never flag one.`,
      'Note keywords come from the fixed map below. A note matches a theme when it contains one of its words or phrases, ignoring case. Anything else in a note is ignored.',
      `Distance to the depot is grouped at ${rules.distanceBreaks.join(', ').replace(/, (\d+)$/, ' and $1')} miles.`,
      `Left alone uses the same ${rules.minLeads}-lead and 1.5x rules, and is never mixed with turn-downs.`,
      `At most ${rules.maxQuestions} draft questions, strongest pattern first.`,
      'It reads rep behavior only. It does not score, rank or filter new leads.',
    ];
    $('assumption-list').innerHTML = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    $('keyword-map').innerHTML = `<p class="small"><b>Keyword map</b></p><ul class="plain-list small">${R.THEMES.map((t) =>
      `<li>${escapeHtml(t.label)}: ${t.words.map((w) => `<code>${escapeHtml(w)}</code>`).join(' ')}</li>`).join('')}</ul>`;
  }

  renderPatterns();
  renderTeam();
  renderLeftAlone();
  renderQuestions();
  renderAssumptions();
})();
