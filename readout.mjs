/*
 * Lead feedback readout: every rule and number on both pages comes from here.
 * Pure functions, no DOM, no network, no randomness.
 *
 * This file has no import or export on purpose: browsers refuse to load ES
 * modules from a page opened straight from disk, so the pages load it as a
 * plain script. Node loads it as a module for the tests. Either way it
 * registers one object, globalThis.LeadReadout.
 *
 * All threshold checks use whole-number cross-multiplication instead of
 * comparing rounded percentages, so a rate is never flagged because of rounding.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- rules

  const RULES = Object.freeze({
    minLeads: 8, // a group needs at least this many leads before it can be flagged
    liftNumerator: 3, // flag at 3/2 = 1.5x the account's overall rate
    liftDenominator: 2,
    minRepLeads: 3, // a rep needs at least this many leads in a pattern to count
    minRepsForTeam: 2, // "Whole team" needs at least two reps who count
    teamTurnDownPct: 60, // a rep "turns it down" at 60% or more
    splitAcceptPct: 50, // a rep "accepts it" at 50% or more
    leftAloneMinViews: 2, // viewed this many times with no action = left alone
    maxQuestions: 5,
    distanceBreaks: Object.freeze([20, 40, 60]),
  });

  const TURNED_DOWN = Object.freeze(['thumbs_down', 'not_interested']);
  const ACCEPTED = Object.freeze(['liked', 'contacted', 'meeting_booked']);

  const ACTION_LABELS = Object.freeze({
    thumbs_down: 'Thumbs down',
    not_interested: 'Not interested',
    liked: 'Liked',
    contacted: 'Contacted',
    meeting_booked: 'Meeting booked',
    viewed_no_action: 'Viewed, no action',
  });

  // Fixed keyword map. A note matches a theme when it contains any of these
  // words or phrases as whole words, ignoring case.
  const THEMES = Object.freeze([
    { id: 'central', label: 'central buying', words: ['head office', 'HQ', 'corporate', 'franchise'] },
    { id: 'range', label: 'service range', words: ['too far', 'outside service', 'miles'] },
    { id: 'size', label: 'size', words: ['too small', 'tiny'] },
    { id: 'supplier', label: 'existing supplier', words: ['under contract', 'already has', 'locked in'] },
  ]);

  const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const THEME_PATTERNS = THEMES.map((theme) => ({
    id: theme.id,
    regex: new RegExp(`\\b(?:${theme.words.map(escapeRegExp).join('|')})\\b`, 'i'),
  }));

  function distanceBin(miles) {
    const [a, b, c] = RULES.distanceBreaks;
    if (miles <= a) return '0_20';
    if (miles <= b) return '21_40';
    if (miles <= c) return '41_60';
    return 'over_60';
  }

  // Every attribute the readout looks at, with the words used on the page.
  // label: table label. noun: plural used in sentences.
  const ATTRIBUTES = Object.freeze([
    {
      key: 'segment',
      label: 'Segment',
      valueOf: (lead) => lead.segment,
      values: [
        { value: 'hotel', label: 'Hotel', noun: 'hotels', question: 'Is this company a hotel?' },
        { value: 'care_home', label: 'Care home', noun: 'care homes', question: 'Is this company a care home?' },
        { value: 'gym', label: 'Gym', noun: 'gyms', question: 'Is this company a gym?' },
        { value: 'laundromat', label: 'Laundromat', noun: 'laundromats', question: 'Is this company a laundromat?' },
      ],
    },
    {
      key: 'size',
      label: 'Size',
      valueOf: (lead) => lead.size_band,
      values: [
        { value: 'small', label: 'Small', noun: 'small sites', question: 'Is this a small site?' },
        { value: 'mid', label: 'Mid-size', noun: 'mid-size sites', question: 'Is this a mid-size site?' },
        { value: 'large', label: 'Large', noun: 'large sites', question: 'Is this a large site?' },
      ],
    },
    {
      key: 'ownership',
      label: 'Ownership',
      valueOf: (lead) => lead.ownership,
      values: [
        { value: 'independent', label: 'Independent', noun: 'independent sites', question: 'Is this site independently owned?' },
        { value: 'chain_or_franchise', label: 'Chain or franchise', noun: 'chain or franchise sites',
          question: 'Does this company buy equipment through a head office?', passOn: 'Yes' },
        { value: 'management_group', label: 'Management group', noun: 'sites run by a management group',
          question: 'Does a management group buy for this site?' },
      ],
    },
    {
      key: 'contract',
      label: 'Equipment contract',
      valueOf: (lead) => lead.equipment_contract,
      values: [
        { value: 'yes', label: 'Under contract', noun: 'sites under an equipment contract',
          question: 'Is the site under contract with another equipment supplier?' },
        { value: 'no', label: 'No contract', noun: 'sites with no equipment contract',
          question: 'Is the site free of any equipment contract?' },
        { value: 'unknown', label: 'Contract unknown', noun: 'sites with an unknown contract status',
          question: 'Is the site\'s equipment contract status unknown?' },
      ],
    },
    {
      key: 'website',
      label: 'Website',
      valueOf: (lead) => (lead.has_website ? 'yes' : 'no'),
      values: [
        { value: 'yes', label: 'Has a website', noun: 'sites with a website', question: 'Does the company have a website?' },
        { value: 'no', label: 'No website', noun: 'sites with no website', question: 'Does the company have a website?', passOn: 'No' },
      ],
    },
    {
      key: 'distance',
      label: 'Distance to depot',
      valueOf: (lead) => distanceBin(lead.miles_to_depot),
      values: [
        { value: '0_20', label: '0 to 20 miles', noun: 'sites 0 to 20 miles from the depot',
          question: 'Is the site within 20 miles of the depot?' },
        { value: '21_40', label: '21 to 40 miles', noun: 'sites 21 to 40 miles from the depot',
          question: 'Is the site 21 to 40 miles from the depot?' },
        { value: '41_60', label: '41 to 60 miles', noun: 'sites 41 to 60 miles from the depot',
          question: 'Is the site 41 to 60 miles from the depot?' },
        { value: 'over_60', label: 'Over 60 miles', noun: 'sites over 60 miles from the depot',
          question: 'Is the site within 60 miles of a service depot?', passOn: 'No' },
      ],
    },
  ]);

  // ---------------------------------------------------------------- basics

  const isTurnedDown = (lead) => TURNED_DOWN.includes(lead.action);
  const isAccepted = (lead) => ACCEPTED.includes(lead.action);
  const isLeftAlone = (lead, rules = RULES) =>
    lead.action === 'viewed_no_action' && lead.view_count >= rules.leftAloneMinViews;

  function outcomeOf(lead, rules = RULES) {
    if (isTurnedDown(lead)) return 'turned_down';
    if (isAccepted(lead)) return 'accepted';
    if (isLeftAlone(lead, rules)) return 'left_alone';
    return 'viewed_once';
  }

  function tally(leads, rules = RULES) {
    const t = { total: leads.length, turnedDown: 0, accepted: 0, leftAlone: 0, viewedOnce: 0 };
    for (const lead of leads) {
      const o = outcomeOf(lead, rules);
      if (o === 'turned_down') t.turnedDown += 1;
      else if (o === 'accepted') t.accepted += 1;
      else if (o === 'left_alone') t.leftAlone += 1;
      else t.viewedOnce += 1;
    }
    return t;
  }

  // hit/n >= 1.5 * allHit/allN, in whole numbers. A group with no hits never qualifies.
  function meetsLift(hit, n, allHit, allN, rules = RULES) {
    if (hit <= 0 || n <= 0 || allN <= 0) return false;
    return hit * allN * rules.liftDenominator >= rules.liftNumerator * allHit * n;
  }

  function liftOf(hit, n, allHit, allN) {
    if (!n || !allN || !allHit) return null;
    return (hit / n) / (allHit / allN);
  }

  const atLeastPct = (hit, n, pct) => n > 0 && hit * 100 >= pct * n;

  function themesOf(note) {
    if (!note) return [];
    return THEME_PATTERNS.filter((t) => t.regex.test(note)).map((t) => t.id);
  }

  // Theme counts across the turned-down leads that carry a note.
  function noteThemes(leads) {
    const counts = Object.fromEntries(THEMES.map((t) => [t.id, 0]));
    let notes = 0;
    for (const lead of leads) {
      if (!isTurnedDown(lead) || !lead.note) continue;
      notes += 1;
      for (const id of themesOf(lead.note)) counts[id] += 1;
    }
    const ranked = THEMES.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
    return { notes, counts, ranked };
  }

  // Every attribute value as a possible group, including empty ones.
  function groups(leads) {
    const out = [];
    for (const attr of ATTRIBUTES) {
      for (const v of attr.values) {
        out.push({
          id: `${attr.key}:${v.value}`,
          attribute: attr.key,
          attributeLabel: attr.label,
          value: v.value,
          label: v.label,
          noun: v.noun,
          leads: leads.filter((lead) => attr.valueOf(lead) === v.value),
        });
      }
    }
    return out;
  }

  function valueInfo(id) {
    const [key, value] = id.split(':');
    const attr = ATTRIBUTES.find((a) => a.key === key);
    const v = attr && attr.values.find((x) => x.value === value);
    if (!v) return null;
    return { attr, v };
  }

  // ---------------------------------------------------------------- patterns

  // Flag every group with 8+ leads whose turn-down rate is 1.5x the account's or more.
  function findPatterns(leads, rules = RULES) {
    const overall = tally(leads, rules);
    const rows = groups(leads).map((g) => {
      const t = tally(g.leads, rules);
      const eligible = t.total >= rules.minLeads;
      const flagged = eligible && meetsLift(t.turnedDown, t.total, overall.turnedDown, overall.total, rules);
      return {
        ...g,
        n: t.total,
        turnedDown: t.turnedDown,
        accepted: t.accepted,
        leftAlone: t.leftAlone,
        lift: liftOf(t.turnedDown, t.total, overall.turnedDown, overall.total),
        eligible,
        flagged,
        themes: noteThemes(g.leads),
      };
    });
    const flagged = rows
      .filter((r) => r.flagged)
      .sort((a, b) => b.lift - a.lift || a.id.localeCompare(b.id));
    return { overall, rows, flagged };
  }

  // Per-rep view of one pattern: is it the whole team, a split, or too thin to call?
  function teamCheck(patternLeads, reps, rules = RULES) {
    const perRep = reps.map((rep) => {
      const t = tally(patternLeads.filter((lead) => lead.rep === rep), rules);
      const counted = t.total >= rules.minRepLeads;
      return {
        rep,
        n: t.total,
        turnedDown: t.turnedDown,
        accepted: t.accepted,
        counted,
        turnsDown: counted && atLeastPct(t.turnedDown, t.total, rules.teamTurnDownPct),
        accepts: counted && atLeastPct(t.accepted, t.total, rules.splitAcceptPct),
      };
    });
    const counted = perRep.filter((r) => r.counted);
    let label = 'not_enough';
    if (counted.length >= rules.minRepsForTeam && counted.every((r) => r.turnsDown)) label = 'whole_team';
    else if (counted.some((r) => r.accepts) && counted.some((r) => r.turnsDown)) label = 'split';
    return { label, reps: perRep, counted };
  }

  const TEAM_LABELS = Object.freeze({ whole_team: 'Whole team', split: 'Split', not_enough: 'Not enough data' });

  // ---------------------------------------------------------------- left alone

  // Same 8-lead and 1.5x rules, applied to left-alone leads instead of turn-downs.
  function leftAloneReadout(leads, rules = RULES) {
    const overall = tally(leads, rules);
    const rows = groups(leads)
      .map((g) => {
        const t = tally(g.leads, rules);
        const eligible = t.total >= rules.minLeads;
        return {
          id: g.id,
          attribute: g.attribute,
          attributeLabel: g.attributeLabel,
          label: g.label,
          noun: g.noun,
          n: t.total,
          leftAlone: t.leftAlone,
          lift: liftOf(t.leftAlone, t.total, overall.leftAlone, overall.total),
          eligible,
          standsOut: eligible && meetsLift(t.leftAlone, t.total, overall.leftAlone, overall.total, rules),
        };
      })
      .filter((r) => r.leftAlone > 0)
      .sort((a, b) => Number(b.standsOut) - Number(a.standsOut)
        || b.leftAlone * a.n - a.leftAlone * b.n
        || b.leftAlone - a.leftAlone
        || a.id.localeCompare(b.id));
    return {
      overall,
      leads: leads.filter((lead) => isLeftAlone(lead, rules)),
      rows,
      standouts: rows.filter((r) => r.standsOut),
    };
  }

  // ---------------------------------------------------------------- words

  const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const numberWord = (n) => (Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n));
  const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  function pct(hit, n) {
    if (!n) return '0%';
    return `${Math.round((hit * 100) / n)}%`;
  }

  // One decimal, for rule lines where whole percents would look inconsistent
  // (37.5% times 1.5 is 56.3%, but 38% times 1.5 is 57%).
  function pct1(hit, n) {
    if (!n) return '0.0%';
    return `${(Math.round((hit * 1000) / n) / 10).toFixed(1)}%`;
  }

  // The flag line itself: 1.5x the given rate, one decimal.
  function thresholdPct(hit, n, rules = RULES) {
    if (!n) return '0.0%';
    return `${(Math.round((hit * rules.liftNumerator * 1000) / (rules.liftDenominator * n)) / 10).toFixed(1)}%`;
  }

  function liftText(lift) {
    if (lift == null) return 'n/a';
    return `${lift.toFixed(1)}x`;
  }

  function listWords(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  function repList(reps) {
    return `Rep${reps.length === 1 ? '' : 's'} ${listWords(reps)}`;
  }

  // ---------------------------------------------------------------- questions

  function questionFor(pattern) {
    const info = valueInfo(pattern.id);
    const text = info ? info.v.question : `Is this lead in the "${pattern.label}" group?`;
    const passOn = info && info.v.passOn ? info.v.passOn : 'Yes';
    return { text, passOn };
  }

  function evidenceFor(pattern, rules = RULES) {
    const { team } = pattern;
    const withLeads = team.reps.filter((r) => r.n > 0);
    const counted = team.counted;
    const parts = [];
    if (counted.length === withLeads.length) {
      parts.push(`${pattern.turnedDown} of ${pattern.n} ${pattern.noun} turned down across all ${counted.length} reps`);
    } else {
      const floorPct = Math.min(...counted.map((r) => Math.floor((r.turnedDown * 100) / r.n)));
      const thin = withLeads.filter((r) => !r.counted).map((r) => `Rep ${r.rep} had only ${r.n}`);
      parts.push(`${pattern.turnedDown} of ${pattern.n} ${pattern.noun} turned down`);
      parts.push(`${repList(counted.map((r) => r.rep))} each turned down ${floorPct}% or more (${listWords(thin)})`);
    }
    const top = pattern.themes.ranked[0];
    if (top) parts.push(`${top.count} note${top.count === 1 ? '' : 's'} mention ${top.label}`);
    return parts.map((p) => `${p}.`).join(' ');
  }

  function splitSummary(pattern) {
    const acceptors = pattern.team.counted.filter((r) => r.accepts);
    const decliners = pattern.team.counted.filter((r) => r.turnsDown);
    const sum = (list, key) => list.reduce((s, r) => s + r[key], 0);
    const accText = `${repList(acceptors.map((r) => r.rep))} accepted ${sum(acceptors, 'accepted')} of ${sum(acceptors, 'n')}`;
    const decText = `${repList(decliners.map((r) => r.rep))} turned down ${sum(decliners, 'turnedDown')} of ${sum(decliners, 'n')}`;
    return {
      sentence: `${capitalize(pattern.noun)} split the team: ${accText}, while ${decText}.`,
      ask: `Should new ${pattern.noun} go to reps the way ${repList(acceptors.map((r) => r.rep))} work${acceptors.length === 1 ? 's' : ''} them, or be screened out?`,
    };
  }

  // ---------------------------------------------------------------- whole readout

  function analyze(account, rules = RULES) {
    const leads = account.leads;
    const reps = account.reps;
    const found = findPatterns(leads, rules);
    const patterns = found.flagged.map((p) => ({ ...p, team: teamCheck(p.leads, reps, rules) }));
    const wholeTeam = patterns.filter((p) => p.team.label === 'whole_team');
    const split = patterns.filter((p) => p.team.label === 'split');
    const notEnough = patterns.filter((p) => p.team.label === 'not_enough');

    const questions = wholeTeam.slice(0, rules.maxQuestions).map((p) => {
      const q = questionFor(p);
      return { id: p.id, patternId: p.id, text: q.text, passOn: q.passOn, evidence: evidenceFor(p, rules), pattern: p };
    });

    const inPatterns = new Set();
    for (const p of patterns) for (const lead of p.leads) if (isTurnedDown(lead)) inPatterns.add(lead.lead_id);

    const readout = {
      account,
      overall: found.overall,
      rows: found.rows,
      patterns,
      wholeTeam,
      split: split.map((p) => ({ ...p, summary: splitSummary(p) })),
      notEnough,
      leftAlone: leftAloneReadout(leads, rules),
      questions,
      turnedDownInPatterns: inPatterns.size,
    };
    readout.sentence = resultSentence(readout);
    return readout;
  }

  function resultSentence(readout) {
    const reps = readout.account.reps.length;
    const { total, turnedDown } = readout.overall;
    const k = readout.patterns.length;
    const s = readout.split.length;
    const head = `${capitalize(numberWord(reps))} reps turned down ${turnedDown} of ${total} suggested leads`;
    if (k === 0) return `${head}; none of those trace to a pattern with enough leads to call.`;
    let splitText;
    if (s === 0) splitText = 'no pattern splits the team';
    else if (s === 1) splitText = 'one pattern splits the team';
    else splitText = `${numberWord(s)} patterns split the team`;
    return `${head}; ${readout.turnedDownInPatterns} of those ${turnedDown} trace to ${numberWord(k)} pattern${k === 1 ? '' : 's'}, and ${splitText}.`;
  }

  // ---------------------------------------------------------------- choices and notes

  const STORAGE_KEY = 'lead-feedback-readout.choices.v1';

  // Keeps only known question ids with a valid choice.
  function cleanChoices(raw, questions) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const q of questions) {
      const c = raw[q.id];
      if (c === 'accepted' || c === 'rejected') out[q.id] = c;
    }
    return out;
  }

  function accountNotes(readout, choices) {
    const accepted = readout.questions.filter((q) => choices[q.id] === 'accepted');
    const { account } = readout;
    const lines = [
      'ACCOUNT NOTES',
      `${account.name} (synthetic). Selling to ${account.sells_to}.`,
      `Based on ${numberWord(account.window_days / 7)} weeks of activity: ${numberWord(account.reps.length)} reps, ${readout.overall.total} suggested leads.`,
      '',
      'Qualification questions:',
    ];
    if (accepted.length === 0) {
      lines.push('(none accepted yet)');
    } else {
      accepted.forEach((q, i) => {
        lines.push(`${i + 1}. ${q.text} Reps pass on: ${q.passOn}.`);
        lines.push(`   Evidence: ${q.evidence}`);
      });
    }
    if (readout.split.length) {
      lines.push('', 'Ask the sales lead (split patterns are not rules):');
      for (const p of readout.split) lines.push(`- ${p.summary.sentence} ${p.summary.ask}`);
    }
    lines.push('', 'Reads rep behavior only. It does not score or rank new leads.');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- carry-over (page 2)

  const CARRY_GROUPS = Object.freeze([
    { id: 'account_only', label: 'This account only' },
    { id: 'carries', label: 'Likely carries to other suppliers selling into hotels' },
    { id: 'test', label: 'Test on the next account' },
  ]);

  // First sort, before any check. Fixed per pattern so it can be explained in one line each.
  function carrySort(pattern) {
    if (pattern.id === 'ownership:chain_or_franchise') {
      return { group: 'carries', reason: 'Chains and franchises buy through a head office whatever the supplier sells, so this is about how the buyer is organized.' };
    }
    if (pattern.id === 'ownership:management_group') {
      return { group: 'carries', reason: 'A management group buying for many sites is about the buyer, not this supplier.' };
    }
    if (pattern.attribute === 'distance') {
      return { group: 'account_only', reason: 'Distance only matters because of where this supplier keeps its service depot.' };
    }
    const reasons = {
      segment: 'Whether a segment fits depends on the product, so it needs a test first.',
      size: 'Size limits depend on what the product is built for, so it needs a test first.',
      contract: 'A contract usually covers one kind of equipment, so it may not block a different product.',
      website: 'Unclear whether this is about the buyer or about how these reps research leads.',
      ownership: 'Unclear whether ownership changes buying for a different product.',
    };
    return { group: 'test', reason: reasons[pattern.attribute] || 'Not sure yet, so it needs a test.' };
  }

  // Runs the same flag rule (8+ leads, 1.5x the account's own rate) on another account.
  function checkOnAccount(patternId, account, rules = RULES) {
    const overall = tally(account.leads, rules);
    const group = groups(account.leads).find((g) => g.id === patternId);
    const t = tally(group ? group.leads : [], rules);
    const enough = t.total >= rules.minLeads;
    const holds = enough && meetsLift(t.turnedDown, t.total, overall.turnedDown, overall.total, rules);
    return {
      n: t.total,
      turnedDown: t.turnedDown,
      overall,
      lift: liftOf(t.turnedDown, t.total, overall.turnedDown, overall.total),
      enough,
      holds,
    };
  }

  function rateText(hit, n) {
    return `${hit} of ${n} (${pct(hit, n)})`;
  }

  function carryOver(readout, nextAccount, selectedQuestions, rules = RULES) {
    const items = selectedQuestions.map((q) => {
      const p = q.pattern;
      const first = carrySort(p);
      const check = checkOnAccount(p.id, nextAccount, rules);
      const there = `${rateText(check.turnedDown, check.n)} vs ${pct(check.overall.turnedDown, check.overall.total)} overall`;
      let group = first.group;
      let verdict;
      if (first.group === 'carries') {
        if (check.holds) {
          verdict = `Held on the second account: ${there}.`;
        } else {
          group = 'test';
          verdict = check.enough
            ? `Didn't hold on the second account: ${there}, under 1.5x. Moved to test.`
            : `Only ${check.n} matching leads on the second account, under the ${rules.minLeads}-lead minimum. Moved to test.`;
        }
      } else {
        verdict = check.enough
          ? `For comparison on the second account: ${there}${check.holds ? '' : ', not flagged there'}.`
          : `For comparison: only ${check.n} matching leads on the second account.`;
      }
      return {
        id: q.id,
        question: q.text,
        pattern: p,
        firstRate: { turnedDown: p.turnedDown, n: p.n, lift: p.lift },
        initialGroup: first.group,
        group,
        reason: first.reason,
        verdict,
        check,
        gated: first.group === 'carries',
      };
    });
    const byGroup = Object.fromEntries(CARRY_GROUPS.map((g) => [g.id, items.filter((i) => i.group === g.id)]));
    return { items, byGroup, nextOverall: tally(nextAccount.leads, rules) };
  }

  // Which questions page 2 should use: the accepted ones if any choice was saved,
  // otherwise every Whole-team question.
  function selectionFor(readout, savedChoices) {
    const choices = cleanChoices(savedChoices, readout.questions);
    if (Object.keys(choices).length === 0) {
      return { source: 'default', questions: readout.questions };
    }
    return { source: 'saved', questions: readout.questions.filter((q) => choices[q.id] === 'accepted') };
  }

  // source: 'saved' when the questions came from the reader's choices, 'default'
  // when nothing was saved and every whole-team question is used.
  function carrySentence(result, source = 'saved') {
    const n = result.items.length;
    if (n === 0) return 'No accepted questions to sort yet.';
    const word = (k) => (k === 0 ? 'none' : numberWord(k));
    const noun = source === 'default' ? 'whole-team question' : 'accepted question';
    const c = result.byGroup.carries.length;
    const a = result.byGroup.account_only.length;
    const t = result.byGroup.test.length;
    return `Of ${numberWord(n)} ${noun}${n === 1 ? '' : 's'}, ${word(c)} held up on a second account and likely carr${c === 1 ? 'ies' : 'y'} to the next one, `
      + `${word(a)} stay${a === 1 ? 's' : ''} with this account only, and ${word(t)} need${t === 1 ? 's' : ''} a test first.`;
  }

  root.LeadReadout = Object.freeze({
    RULES,
    THEMES,
    ATTRIBUTES,
    ACTION_LABELS,
    TEAM_LABELS,
    CARRY_GROUPS,
    STORAGE_KEY,
    distanceBin,
    isTurnedDown,
    isAccepted,
    isLeftAlone,
    outcomeOf,
    tally,
    meetsLift,
    liftOf,
    themesOf,
    noteThemes,
    groups,
    findPatterns,
    teamCheck,
    leftAloneReadout,
    questionFor,
    evidenceFor,
    analyze,
    resultSentence,
    cleanChoices,
    accountNotes,
    carrySort,
    checkOnAccount,
    carryOver,
    selectionFor,
    carrySentence,
    pct,
    pct1,
    thresholdPct,
    liftText,
    listWords,
    repList,
    numberWord,
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
