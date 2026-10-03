/* Renders the "What carries to the next account" page. Logic lives in readout.mjs. */
(function () {
  'use strict';

  const R = window.LeadReadout;
  const DATA = window.READOUT_DATA;
  const $ = (id) => document.getElementById(id);
  const rules = R.RULES;

  const escapeHtml = (value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  const readout = R.analyze(DATA.account);
  const next = DATA.nextAccount;

  function loadChoices() {
    try {
      const raw = window.localStorage.getItem(R.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  let useDefault = false;

  function render() {
    const selection = useDefault ? R.selectionFor(readout, null) : R.selectionFor(readout, loadChoices());
    const result = R.carryOver(readout, next, selection.questions);
    const total = readout.questions.length;

    $('result').textContent = R.carrySentence(result, selection.source);

    // "the one", "both" or "all five" whole-team questions.
    let allWord = `all ${R.numberWord(total)}`;
    if (total === 1) allWord = 'the one';
    else if (total === 2) allWord = 'both';
    const allText = `${allWord} whole-team question${total === 1 ? '' : 's'}`;
    if (selection.source === 'default') {
      $('source-line').textContent = useDefault
        ? `Showing ${allText} from the readout.`
        : `Nothing saved from the readout in this browser, so this uses ${allText}.`;
    } else {
      const k = selection.questions.length;
      $('source-line').textContent = `Using the ${R.numberWord(k)} question${k === 1 ? '' : 's'} you accepted on the readout, out of ${R.numberWord(total)}.`;
    }

    // Three groups.
    const grid = R.CARRY_GROUPS.map((g) => {
      const items = result.byGroup[g.id];
      const body = items.length
        ? items.map((item) => `<div class="carry-item">
            <p class="q">${escapeHtml(item.question)}</p>
            <p class="pattern">${escapeHtml(item.pattern.attributeLabel)}: ${escapeHtml(item.pattern.label.toLowerCase())}, ${item.firstRate.turnedDown} of ${item.firstRate.n} turned down here</p>
            <p class="reason">${escapeHtml(item.reason)}</p>
            <p class="verdict${item.initialGroup !== item.group ? ' moved' : ''}">${escapeHtml(item.verdict)}</p>
          </div>`).join('')
        : '<p class="empty">Nothing here.</p>';
      return `<article class="card carry-col"><h3>${escapeHtml(g.label)}</h3>${body}</article>`;
    }).join('');

    if (!result.items.length) {
      $('carry-grid').innerHTML = `<article class="card carry-col">
        <h3>No accepted questions</h3>
        <p class="empty">Every question on the readout is rejected or undecided in this browser.</p>
        <div class="q-actions"><a class="btn" href="index.html#questions">Go back and accept one</a>
        <button type="button" class="btn primary" id="use-default">Use all whole-team questions instead</button></div>
      </article>`;
      const btn = $('use-default');
      if (btn) btn.addEventListener('click', () => { useDefault = true; render(); });
    } else {
      $('carry-grid').innerHTML = grid;
    }

    const splitNames = readout.split.map((p) => p.noun);
    $('split-note').textContent = splitNames.length
      ? `${R.listWords(splitNames).replace(/^./, (c) => c.toUpperCase())} split the team on the readout, so ${splitNames.length === 1 ? 'that pattern is' : 'those patterns are'} a question for the sales lead, not a rule, and never carried.`
      : '';

    // Second-account check.
    const o2 = result.nextOverall;
    $('check-intro').textContent = `The second account is a ${next.name.toLowerCase()}: ${o2.total} synthetic leads across the same four segments, worked by ${next.reps.length} reps (${R.listWords(next.reps)}) for two weeks. `
      + `Its reps turned down ${o2.turnedDown} of ${o2.total} (${R.pct(o2.turnedDown, o2.total)}).`;

    // Kept to three narrow columns so both accounts' rates sit side by side on a phone.
    const rateCell = (hit, n, lift) => (n
      ? `<b>${hit} of ${n}</b><span>${R.pct(hit, n)}, ${R.liftText(lift)}</span>`
      : '<span>no matching leads</span>');
    const rows = result.items.map((item) => {
      const c = item.check;
      let badge;
      if (!item.gated) badge = '<span class="badge thin">Comparison only</span>';
      else if (c.holds) badge = '<span class="badge team">Holds in both</span>';
      else badge = '<span class="badge split">Didn\'t hold: moved to test</span>';
      return `<tr>
        <td class="pattern-name"><b>${escapeHtml(item.pattern.label)}</b><span>${escapeHtml(item.pattern.attributeLabel)}</span>${badge}</td>
        <td class="num rate-cell">${rateCell(item.firstRate.turnedDown, item.firstRate.n, item.firstRate.lift)}</td>
        <td class="num rate-cell">${rateCell(c.turnedDown, c.n, c.lift)}</td></tr>`;
    }).join('');
    $('check-table').innerHTML = `<thead><tr><th>Pattern</th><th class="num">This account (laundry)</th><th class="num">Second account (coffee)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3" class="muted">Nothing to check.</td></tr>'}</tbody>`;

    $('check-rule').textContent = `A question sorted as "likely carries" stays there only if the second account flags the same pattern by the same rule: at least ${rules.minLeads} matching leads and a turn-down rate of at least 1.5x that account's own overall rate. `
      + 'If it doesn\'t, it moves to "Test on the next account". Patterns in the other two groups are shown for comparison only.';
  }

  render();
})();
