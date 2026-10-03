# Lead Feedback Readout

A small static page that reads what sales reps actually did with their suggested leads (what they turned down, what they worked, what they looked at and skipped) and turns it into a short readout for the person setting up the account: which patterns explain the turn-downs, whether each one is a team rule or one rep's taste, and up to five draft qualification questions a person can accept or reject.

**All data is synthetic.** One made-up account, a regional supplier of commercial laundry equipment selling to hotels, care homes, gyms and laundromats. Four reps (A to D) each worked a feed of 40 suggested leads for two weeks: 160 leads in all. Every company, rep and note is invented.

It reads behavior only. It never scores, ranks or filters new leads.

## What you see

**Readout (`index.html`)**

1. **One result sentence**, worked out from the data each time the page loads: *"Four reps turned down 60 of 160 suggested leads; 46 of those 60 trace to three patterns, and one pattern splits the team."*
2. **Patterns.** Every attribute value with at least 8 leads, compared with the account's overall turn-down rate. The ones at 1.5x or more are listed with leads, turned down, rate, lift and matching note keywords. Each row opens to show its leads, each rep's action and the note. A second table shows every value checked and why it was or wasn't flagged.
3. **Team rule or one rep's taste.** For each flagged pattern, each rep's turn-down rate and a label: Whole team, Split or Not enough data.
4. **Left alone.** Leads viewed twice or more with no action, grouped by attribute, kept apart from turn-downs.
5. **Draft qualification questions.** One yes/no question per Whole-team pattern, with the evidence under it, and Accept and Reject buttons. Accepted questions fill an "Account notes" block with a Copy button.
6. **Assumptions**, including the keyword map, printed on the page.
7. **What I'd want to learn from you**: five open questions.

**What carries to the next account (`carry-over.html`)**, linked from the readout as "Next account"

It takes the questions accepted on the readout (or every Whole-team question if nothing was saved in this browser) and sorts each into one of three groups, with a one-line reason:

- **This account only**: tied to this supplier's own setup, like how far a site is from its service depot.
- **Likely carries to other suppliers selling into hotels**: about how the buyer is organized, like chains and franchises buying through a head office.
- **Test on the next account**: anything unsure.

Then it checks the "carries" group against a second synthetic account (a commercial coffee-machine supplier, 60 leads across the same four segments, 2 reps) and shows each pattern's turn-down rate on both accounts side by side. A pattern only stays in "carries" if the same rule flags it on the second account too. It ends with two open questions.

What the current data shows: head-office buying holds on the coffee account (9 of 12 chain or franchise sites turned down against 30% overall), so it stays in "carries". Distance stays with this account only, and on the coffee account it doesn't show up at all (1 of 9 far sites turned down).

## How it works, one sentence per rule

**Definitions**
- A lead is **turned down** when a rep gave it a thumbs down or marked it "not interested".
- A lead is **accepted** when a rep liked it, contacted it or booked a meeting.
- A lead is **left alone** when a rep viewed it 2 or more times and did nothing.
- A lead viewed once with no action counts as none of these.

**Finding patterns**
- Every value of every attribute (segment, size, ownership, equipment contract, website, distance to the depot) is a possible group.
- Distance is grouped into 0 to 20, 21 to 40, 41 to 60 and over 60 miles.
- A group needs **at least 8 leads** before it can be flagged, so a handful of leads can't create a pattern.
- A group is **flagged** when its turn-down rate is **at least 1.5 times** the account's overall rate (37.5% here, so 56.3% or more).
- Lift is the group's turn-down rate divided by the account's overall rate.
- Threshold checks use whole-number arithmetic, so a group is never flagged or missed because of rounding.

**Team rule or one rep's taste**
- Only reps with **3 or more leads** in a pattern count; reps with fewer are shown but ignored.
- **Whole team** means every counted rep (and at least two of them) turned down 60% or more.
- **Split** means at least one counted rep accepted 50% or more while another turned down 60% or more.
- Anything else is **Not enough data**.
- A split never becomes a rule; it becomes a question for the customer's sales lead, because the rep who keeps working those leads may know something the others don't.

**Left alone**
- Left-alone leads are counted separately from turn-downs, because a thumbs down is a decision and a skip is hesitation, and mixing them makes patterns look stronger than they are.
- A value stands out when it has at least 8 leads and a left-alone rate at least 1.5 times the account's (12.5% here, so 18.8% or more).
- Left-alone leads never feed the draft questions.

**Draft questions**
- There is one yes/no question per Whole-team pattern, at most five, strongest pattern first.
- The evidence line under each question is computed from the data (for example, "19 of 23 chain or franchise sites turned down across all 4 reps. 9 notes mention central buying.").
- A person accepts or rejects every question, and nothing re-ranks leads.
- Choices are saved in this browser only, so the second page can read them; the page works the same if the browser saves nothing.

**Note keywords**
- Notes are optional and only support a pattern; they never flag one.
- A note matches a theme when it contains one of these words or phrases as a whole word, ignoring case:
  - central buying: head office, HQ, corporate, franchise
  - service range: too far, outside service, miles
  - size: too small, tiny
  - existing supplier: under contract, already has, locked in

**Carry-over**
- Each accepted question is first sorted by a fixed rule: buyer-side patterns (chain, franchise, management group) start in "carries", distance stays with this account, and everything else goes to "test".
- A "carries" question stays there only if the second account flags the same pattern by the same rule (8 or more matching leads, at least 1.5x that account's own overall rate).
- If it doesn't hold, or the second account has fewer than 8 matching leads, it moves to "Test on the next account".

## What the data was built to contain

The patterns were planted on purpose so the readout has something real to find, and every planted lead is written out in `tools/make-data.mjs`:

1. **Chain and franchise sites** (20 hotels, 3 gyms): 19 of 23 turned down, every rep at 60% or more, 9 notes about head office buying.
2. **Sites over 60 miles from the depot**: 14 of 18 turned down; Reps A, B and D at 80% or more, Rep C has only 2.
3. **Care homes**: Rep C accepted 4 of 6, while Reps A, B and D turned down 12 of 14 (the split).
4. **Sites with no website**: 13 of 16 viewed twice or more and left alone, only 1 turned down (hesitation, not a no).
5. **Background**: ordinary leads with ordinary outcomes.

`data.js` was written once by that script and is fixed. The pages never generate data, so the numbers never change between visits.

## How to run

- Open `index.html` in a browser. No server, build step, install, account or network is needed, and it works the same from disk or from GitHub Pages.
- Run the tests with plain Node (version 18 or later):

```
node tests/run-tests.mjs
```

The tests check the hand-counted numbers for every planted pattern, the result sentence, every rule's edge (exactly 1.5x, the 8-lead minimum, the 50% and 60% lines), the team labels, the evidence lines, the five-question cap, the account notes, the carry-over sort and its second-account check (including the cases that move a pattern to "test"), that the pages make no network calls and use browser storage only inside try blocks, and that the folder holds only the files listed below.

- To rebuild the data (not needed to use the page): `node tools/make-data.mjs`. It writes the same `data.js` every time.

## Files

| File | What it holds |
|---|---|
| `index.html`, `app.js` | The readout page and its rendering. |
| `carry-over.html`, `carry.js` | The "What carries to the next account" page. |
| `readout.mjs` | All the rules and numbers, as pure functions with no page code. |
| `data.js` | The fixed synthetic data for both accounts. |
| `styles.css` | Layout, light and dark color schemes. |
| `tests/run-tests.mjs` | Plain Node tests, no dependencies. |
| `tools/make-data.mjs` | The script that wrote `data.js`, with every planted lead listed. |

`readout.mjs` has no `import` or `export` lines on purpose: browsers won't load ES modules from a page opened straight from disk, so the pages load it as a plain script and Node loads it as a module for the tests. It registers its functions on `globalThis.LeadReadout`.

## Limits

- Synthetic data only, and the patterns were planted, so it shows the method working, not a finding about real reps.
- Two weeks and 160 leads is a small sample; one or two leads can move a rep's rate a lot.
- Keyword matching uses a fixed list, so a note that says "they buy centrally" counts for nothing.
- It shows where to look, not why reps decided. A pattern is a reason to ask, not proof of a cause.
- It looks at one attribute at a time, so it won't separate two patterns that overlap (for example, if every chain site were also far away).
- The carry-over sort starts from a fixed rule for each kind of pattern and is checked against only one other account.
- It never scores, ranks or filters new leads, and it sends or saves nothing outside this browser.

Built by Dakshit Raj with Claude Code and Codex.
