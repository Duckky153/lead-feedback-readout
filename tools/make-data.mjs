// Writes data.js: the fixed synthetic data behind both pages.
// Run once with `node tools/make-data.mjs`. The pages never run this file;
// they read the data.js it produced, so the numbers never change between visits.
//
// Every planted pattern is written out by hand below, lead by lead, so anyone
// can see exactly what went in. A seeded number generator only picks distances
// and view counts inside fixed ranges.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data.js');

// Small seeded generator (mulberry32) so a rerun writes the same file.
function seeded(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = seeded(20261002);
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// Action codes used in the tables below.
// TD thumbs_down, NI not_interested, MB meeting_booked, CT contacted, LK liked,
// V1..V4 viewed_no_action with that many views.
function action(code) {
  if (code === 'TD') return { action: 'thumbs_down', view_count: between(1, 2) };
  if (code === 'NI') return { action: 'not_interested', view_count: between(1, 2) };
  if (code === 'MB') return { action: 'meeting_booked', view_count: between(1, 3) };
  if (code === 'CT') return { action: 'contacted', view_count: between(1, 3) };
  if (code === 'LK') return { action: 'liked', view_count: between(1, 3) };
  const m = /^V([1-4])$/.exec(code);
  if (m) return { action: 'viewed_no_action', view_count: Number(m[1]) };
  throw new Error(`unknown action code ${code}`);
}

const cycle = (list) => {
  let i = 0;
  return () => list[i++ % list.length];
};

// ------------------------------------------------------------------ names

function namePool(prefixes, suffixes, offset = 0) {
  const out = [];
  for (let i = 0; i < prefixes.length * suffixes.length; i += 1) {
    const p = prefixes[(i + offset) % prefixes.length];
    const s = suffixes[Math.floor(i / prefixes.length) % suffixes.length];
    out.push(`${p} ${s}`);
  }
  return out;
}
function taker(list, label) {
  let i = 0;
  return () => {
    if (i >= list.length) throw new Error(`ran out of ${label} names`);
    return list[i++];
  };
}

const towns = ['Riverside', 'Eastgate', 'Millbrook', 'Oak Park', 'Fairview', 'Lakeside', 'Northfield', 'Westbury',
  'Cedar Falls', 'Hollis', 'Granby', 'Marlow', 'Ashford', 'Brightwater', 'Kingsport', 'Linden'];
const chainBrands = ['Stayline Suites', 'Corridor Inn Express', 'Baywater Hotel', 'Lantern Lodge', 'Northstar Inn and Suites'];

function chainNames(brands, townList, count, townOffset) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(`${brands[i % brands.length]} ${townList[(i + townOffset) % townList.length]}`);
  return out;
}

const pools = {
  chainHotel: taker(chainNames(chainBrands, towns, 20, 0), 'chain hotel'),
  franchiseGym: taker(['Forge 24 Fitness Millbrook', 'Forge 24 Fitness Eastgate', 'Forge 24 Fitness Granby'], 'franchise gym'),
  hotel: taker(['The Wren House', 'Harbor Light Inn', 'Old Mill Hotel', 'Kestrel Lodge', 'Bluestone Inn', 'The Ferris Hotel',
    'Quarry Hill Inn', 'Marigold Hotel', 'Saltbox Inn', 'The Alder Hotel', 'Copperfield Inn', 'Wildrose Lodge',
    'The Linden Hotel', 'Parkway Motor Inn', 'Hearthstone Inn', 'The Calloway', 'Brookhaven Inn', 'Sandpiper Motel',
    'The Merriweather', 'Tall Pines Lodge'], 'hotel'),
  careHome: taker(['Willow Bend Care', 'Cedar Hill Residence', 'Maple Grove Senior Living', 'Brookside Care Home',
    'Rosewood Manor', 'Hillcrest Nursing', 'Elm Court Care', 'Sunnyfield House', 'Ashby Gardens', 'Meadowview Care',
    'Larkspur Residence', 'Oakleigh House', 'Pinecrest Care', 'Juniper Court', 'Briarwood Care', 'Fernhill Residence',
    'Stonegate Care', 'Laurel Manor', 'Kingsley House', 'Hollybrook Care'], 'care home'),
  gym: taker(namePool(['Iron Valley', 'Northside', 'Peak Form', 'Granite', 'Fulcrum', 'Tidewater', 'Summit Row', 'Redline',
    'Anchor', 'Keystone', 'Ridgeback', 'Ember', 'Foundry', 'Crossway', 'Cobalt', 'Riverbend', 'Halcyon', 'Ironclad',
    'Northgate', 'Vantage', 'Gridline', 'Copperline', 'Lakeshore', 'Highline', 'Ironworks', 'Bedrock', 'Stride',
    'Elevate', 'Brickhouse', 'Uptown', 'Westend'],
  ['Fitness', 'Strength', 'Athletic Club', 'Gym']), 'gym'),
  laundromat: taker(namePool(['Suds and Spin', 'Bright', 'Clean Cycle', 'Bubbles', 'Corner', 'Fresh Fold', 'Tumble',
    'Sunny Side', 'Main Street', 'Bluebird', 'Lucky', 'Quick Rinse', 'Starlight', 'Hometown', 'Westside', 'Maple',
    'Kettle', 'Sudsy', 'Brightway', 'Cleanwave', 'Penny', 'Daily', 'Harbor', 'Elm Street', 'Rinse Cycle', 'Crisp',
    'Bright Spot', 'Golden', 'Parkside'],
  ['Laundry', 'Laundromat', 'Wash', 'Coin Wash']), 'laundromat'),
};

// Second account gets its own names so no company appears in both.
const pools2 = {
  chainHotel: taker(chainNames(chainBrands, towns, 9, 7), 'chain hotel'),
  franchiseGym: taker(['Forge 24 Fitness Linden', 'Forge 24 Fitness Ashford', 'Forge 24 Fitness Kingsport'], 'franchise gym'),
  hotel: taker(['The Porter Inn', 'Gullwing Hotel', 'Ironbridge Inn', 'The Hawthorne', 'Riverstone Lodge', 'Larch House Hotel',
    'Seaview Motor Lodge', 'The Bellamy', 'Cormorant Inn', 'Westfield Court Hotel'], 'hotel'),
  careHome: taker(['Bayberry Care', 'Thornfield House', 'Clearwater Residence', 'Primrose Court', 'Highgate Care',
    'Mulberry House', 'Southwood Manor', 'Evergreen Senior Living', 'Holloway Care', 'Fairhaven Residence'], 'care home'),
  gym: taker(namePool(['Upland', 'Boulder', 'Steelyard', 'Harbor', 'Fieldhouse', 'Kinetic', 'Basecamp', 'Northwall'],
    ['Fitness', 'Training', 'Gym']), 'gym'),
  laundromat: taker(namePool(['Spin Cycle', 'Washboard', 'Pressed', 'Fluff and Fold', 'Neighborhood', 'Bay Street',
    'Clover', 'Rainwater'], ['Laundry', 'Laundromat', 'Wash']), 'laundromat'),
};

// ------------------------------------------------------------------ builder

function makeBuilder(prefix, names) {
  const leads = [];
  return {
    // Shuffle (seeded), then group by rep, then number them: each rep's feed is
    // one block of ids, and the planted groups don't sit next to each other.
    finish() {
      const keyed = leads.map((lead) => ({ lead, key: rand() }));
      keyed.sort((a, b) => a.lead.rep.localeCompare(b.lead.rep) || a.key - b.key);
      return keyed.map(({ lead }, i) => ({ lead_id: `${prefix}${String(i + 1).padStart(3, '0')}`, ...lead }));
    },
    add(rep, code, attrs, note) {
      const seg = attrs.segment;
      let company;
      if (attrs.nameKind) company = names[attrs.nameKind]();
      else company = names[seg === 'care_home' ? 'careHome' : seg]();
      const lead = {
        company,
        rep,
        segment: seg,
        size_band: attrs.size_band,
        miles_to_depot: attrs.miles_to_depot,
        ownership: attrs.ownership,
        equipment_contract: attrs.equipment_contract,
        has_website: attrs.has_website,
        ...action(code),
      };
      if (note) lead.note = note;
      leads.push(lead);
    },
  };
}

// Each entry: [actionCode, segment (or null for the group's default), optional note].
function addGroup(builder, rows, defaults) {
  for (const [rep, entries] of Object.entries(rows)) {
    for (const [code, segment, note] of entries) {
      const attrs = defaults(segment);
      builder.add(rep, code, attrs, note);
    }
  }
}

// ================================================================== account 1
// A regional supplier of commercial laundry equipment. Four reps, 40 leads each.

const acct1 = makeBuilder('L', pools);

// Planted pattern 1: chain and franchise sites (mostly hotels) buy through a head office.
// 23 leads, 19 turned down, every rep turns down 60% or more.
{
  const size = cycle(['large', 'mid', 'large', 'large', 'mid']);
  const contract = cycle(['yes', 'unknown', 'no', 'yes', 'unknown', 'no', 'unknown']);
  const hotel = () => ({ segment: 'hotel', nameKind: 'chainHotel', size_band: size(), miles_to_depot: between(6, 58),
    ownership: 'chain_or_franchise', equipment_contract: contract(), has_website: true });
  addGroup(acct1, {
    A: [['NI', null, 'buys through head office'], ['TD'], ['TD', null, 'corporate picks the vendor'], ['NI'], ['CT']],
    B: [['TD', null, 'HQ handles all equipment'], ['NI'], ['TD'], ['NI', null, "franchise, the owner can't choose"], ['TD']],
    C: [['TD', null, 'head office contract'], ['NI'], ['TD', null, 'goes through head office'], ['TD'], ['LK']],
    D: [['NI', null, 'corporate procurement only'], ['TD'], ['TD', null, 'national account with HQ'], ['NI'], ['V1']],
  }, hotel);
  const gym = () => ({ segment: 'gym', nameKind: 'franchiseGym', size_band: 'mid', miles_to_depot: between(10, 50),
    ownership: 'chain_or_franchise', equipment_contract: 'unknown', has_website: true });
  addGroup(acct1, {
    A: [['TD', null, 'franchise picks the equipment']],
    B: [['NI']],
    D: [['CT']],
  }, gym);
}

// Planted pattern 2: sites more than 60 miles from the depot.
// 18 leads, 14 turned down; Reps A, B and D turn down 80% or more, Rep C has only 2.
{
  const own = cycle(['independent', 'independent', 'management_group', 'independent']);
  const size = cycle(['small', 'mid', 'mid', 'small', 'large']);
  const contract = cycle(['no', 'yes', 'unknown']);
  const far = (segment) => ({ segment, size_band: size(), miles_to_depot: between(62, 145), ownership: own(),
    equipment_contract: contract(), has_website: true });
  addGroup(acct1, {
    A: [['TD', 'laundromat', 'outside service area'], ['NI', 'gym'], ['TD', 'laundromat'], ['NI', 'gym', 'too far for our techs'], ['CT', 'hotel']],
    B: [['NI', 'gym', '140 miles out'], ['TD', 'laundromat'], ['NI', 'gym'], ['TD', 'laundromat'], ['LK', 'laundromat']],
    C: [['TD', 'laundromat', 'too far'], ['MB', 'hotel']],
    D: [['NI', 'gym', 'outside service radius'], ['TD', 'laundromat'], ['NI', 'gym'], ['TD', 'laundromat', 'too far from depot'], ['TD', 'gym'], ['V2', 'laundromat']],
  }, far);
}

// Planted pattern 3: care homes split the team.
// 20 leads; Rep C accepts 4 of 6, Reps A, B and D turn down 12 of 14.
{
  const own = cycle(['independent', 'management_group']);
  const size = cycle(['small', 'small', 'mid', 'small', 'mid', 'large', 'small', 'mid', 'small', 'small']);
  const contract = cycle(['yes', 'no', 'unknown', 'no', 'yes']);
  const care = () => ({ segment: 'care_home', size_band: size(), miles_to_depot: between(8, 55), ownership: own(),
    equipment_contract: contract(), has_website: true });
  addGroup(acct1, {
    A: [['TD', null, 'too small for a commercial unit'], ['NI'], ['TD'], ['NI'], ['CT']],
    B: [['NI', null, 'already has a supplier'], ['TD'], ['NI'], ['V1']],
    C: [['MB'], ['CT'], ['MB'], ['CT'], ['NI'], ['V2']],
    D: [['TD', null, 'tiny site'], ['NI'], ['TD', null, 'locked in with current vendor'], ['NI'], ['TD']],
  }, care);
}

// Planted pattern 4: no website means hesitation, not a decision.
// 16 leads, 13 viewed twice or more with no action, 1 turned down.
{
  const size = cycle(['small', 'mid']);
  const contract = cycle(['unknown', 'no', 'no', 'unknown', 'yes']);
  const miles = cycle([9, 27, 44, 16, 35, 52, 21, 38, 12, 30, 18, 24, 36, 15, 33, 29]);
  const noSite = (segment) => ({ segment, size_band: size(), miles_to_depot: miles(), ownership: 'independent',
    equipment_contract: contract(), has_website: false });
  addGroup(acct1, {
    A: [['V2', 'laundromat'], ['V3', 'laundromat'], ['V2', 'gym'], ['CT', 'hotel']],
    B: [['V2', 'laundromat'], ['V4', 'gym'], ['V2', 'hotel'], ['NI', 'laundromat']],
    C: [['V3', 'laundromat'], ['V2', 'gym'], ['V2', 'hotel'], ['LK', 'laundromat']],
    D: [['V2', 'laundromat'], ['V2', 'gym'], ['V3', 'hotel'], ['V3', 'laundromat']],
  }, noSite);
}

// Background: ordinary leads with ordinary outcomes (83 leads, 13 turned down).
{
  const own = {
    hotel: cycle(['independent', 'independent', 'management_group']),
    gym: cycle(['independent', 'independent', 'management_group', 'independent']),
    laundromat: cycle(['independent', 'independent', 'independent', 'independent', 'independent', 'independent', 'independent', 'independent', 'management_group']),
  };
  const size = {
    hotel: cycle(['mid', 'large', 'small', 'mid']),
    gym: cycle(['small', 'mid', 'large', 'mid', 'small']),
    laundromat: cycle(['small', 'mid', 'small', 'large', 'mid']),
  };
  const contract = cycle(['yes', 'no', 'unknown']);
  const plain = (segment) => ({ segment, size_band: size[segment](), miles_to_depot: between(3, 60),
    ownership: own[segment](), equipment_contract: contract(), has_website: true });
  addGroup(acct1, {
    A: [['TD', 'laundromat', 'under contract until next spring'], ['NI', 'gym'], ['TD', 'laundromat'], ['V2', 'gym'],
      ['V1', 'laundromat'], ['V1', 'hotel'], ['V1', 'gym'], ['V1', 'laundromat'],
      ['MB', 'hotel'], ['MB', 'gym'], ['MB', 'laundromat'],
      ['CT', 'hotel'], ['CT', 'gym'], ['CT', 'laundromat'], ['CT', 'laundromat'], ['CT', 'gym'],
      ['LK', 'hotel'], ['LK', 'gym'], ['LK', 'laundromat'], ['LK', 'laundromat']],
    B: [['NI', 'laundromat', 'already has a service plan'], ['TD', 'gym'], ['TD', 'laundromat'], ['NI', 'hotel'], ['V2', 'laundromat'],
      ['V1', 'gym'], ['V1', 'laundromat'], ['V1', 'hotel'],
      ['MB', 'gym'], ['MB', 'laundromat'],
      ['CT', 'hotel'], ['CT', 'gym'], ['CT', 'laundromat'], ['CT', 'laundromat'], ['CT', 'gym'], ['CT', 'hotel'],
      ['LK', 'gym'], ['LK', 'laundromat'], ['LK', 'laundromat'], ['LK', 'gym'], ['LK', 'laundromat']],
    C: [['TD', 'laundromat', 'too small'], ['NI', 'gym'], ['V2', 'laundromat'], ['V2', 'hotel'],
      ['V1', 'gym'], ['V1', 'laundromat'], ['V1', 'gym'],
      ['MB', 'hotel'], ['MB', 'gym'], ['MB', 'laundromat'], ['MB', 'gym'], ['MB', 'laundromat'],
      ['CT', 'hotel'], ['CT', 'gym'], ['CT', 'laundromat'], ['CT', 'laundromat'], ['CT', 'gym'], ['CT', 'laundromat'], ['CT', 'hotel'],
      ['LK', 'gym'], ['LK', 'laundromat'], ['LK', 'gym'], ['LK', 'laundromat']],
    D: [['NI', 'laundromat', 'owner is selling the business'], ['TD', 'gym', 'bad timing, try again in January'], ['TD', 'laundromat'], ['NI', 'hotel'], ['V2', 'gym'],
      ['V1', 'laundromat'], ['V1', 'gym'], ['V1', 'laundromat'], ['V1', 'gym'],
      ['MB', 'laundromat'], ['MB', 'gym'],
      ['CT', 'laundromat'], ['CT', 'gym'], ['CT', 'hotel'], ['CT', 'laundromat'],
      ['LK', 'gym'], ['LK', 'laundromat'], ['LK', 'gym'], ['LK', 'laundromat']],
  }, plain);
}

// ================================================================== account 2
// A commercial coffee-machine supplier. Same four segments, two reps, 30 leads each.

const acct2 = makeBuilder('N', pools2);
{
  const contract = cycle(['yes', 'no', 'unknown']);
  const chain = (segment) => ({ segment, nameKind: segment === 'hotel' ? 'chainHotel' : 'franchiseGym', size_band: segment === 'hotel' ? 'large' : 'mid',
    miles_to_depot: between(5, 55), ownership: 'chain_or_franchise', equipment_contract: contract(), has_website: true });
  addGroup(acct2, {
    E: [['TD', 'hotel', 'head office buys all machines'], ['NI', 'hotel'], ['TD', 'hotel'], ['TD', 'gym'], ['NI', 'hotel', 'corporate contract'], ['CT', 'hotel']],
    F: [['NI', 'hotel', 'HQ decides'], ['TD', 'gym'], ['NI', 'hotel'], ['LK', 'hotel'], ['TD', 'gym'], ['V1', 'hotel']],
  }, chain);

  const size = cycle(['small', 'mid', 'large']);
  const own = cycle(['independent', 'independent', 'management_group']);
  const far = (segment) => ({ segment, size_band: size(), miles_to_depot: between(64, 130), ownership: own(),
    equipment_contract: contract(), has_website: true });
  addGroup(acct2, {
    E: [['CT', 'laundromat'], ['LK', 'gym'], ['TD', 'laundromat'], ['MB', 'gym'], ['V1', 'laundromat']],
    F: [['CT', 'gym'], ['MB', 'laundromat'], ['LK', 'hotel'], ['CT', 'gym']],
  }, far);

  const care = () => ({ segment: 'care_home', size_band: size(), miles_to_depot: between(6, 50), ownership: own(),
    equipment_contract: contract(), has_website: true });
  addGroup(acct2, {
    E: [['CT'], ['TD', null, 'too small'], ['LK'], ['MB'], ['V2']],
    F: [['TD'], ['CT'], ['CT'], ['NI', null, 'already has a vendor'], ['LK']],
  }, care);

  const site = cycle([true, true, true, true, false]);
  const plain = (segment) => ({ segment, size_band: size(), miles_to_depot: between(3, 60), ownership: own(),
    equipment_contract: contract(), has_website: segment === 'laundromat' ? site() : true });
  addGroup(acct2, {
    E: [['TD', 'laundromat'], ['NI', 'gym', 'under contract with another vendor'], ['V2', 'laundromat'], ['V1', 'hotel'], ['V1', 'gym'],
      ['MB', 'hotel'], ['MB', 'laundromat'], ['CT', 'gym'], ['CT', 'laundromat'], ['CT', 'hotel'], ['CT', 'laundromat'],
      ['LK', 'gym'], ['LK', 'laundromat'], ['LK', 'hotel']],
    F: [['TD', 'laundromat'], ['NI', 'hotel'], ['TD', 'gym', 'bad timing'], ['V2', 'laundromat'], ['V1', 'gym'], ['V1', 'laundromat'],
      ['MB', 'hotel'], ['MB', 'gym'], ['MB', 'laundromat'], ['CT', 'laundromat'], ['CT', 'gym'], ['CT', 'laundromat'],
      ['LK', 'hotel'], ['LK', 'laundromat'], ['LK', 'gym']],
  }, plain);
}

// ------------------------------------------------------------------ write

function line(lead) {
  return `    ${JSON.stringify(lead).replace(/","/g, '", "').replace(/,"/g, ', "').replace(/":/g, '": ')},`;
}

const header = `/*
 * Synthetic data. Every company, rep and note below is made up.
 * Written by tools/make-data.mjs and then left fixed: the pages read these
 * arrays as they are and never generate anything, so the numbers never change.
 *
 * Plain script (no import/export) so the pages also work when opened from disk.
 */
(function (root) {
  'use strict';
`;

const body = `
  // Account being set up: a regional supplier of commercial laundry equipment.
  // Four reps (A-D) each worked a feed of 40 suggested leads for two weeks.
  const LEADS = Object.freeze([
${acct1.finish().map(line).join('\n')}
  ]);

  // Second account, used only to check what carries over: a commercial
  // coffee-machine supplier with 60 leads across the same segments and 2 reps.
  const NEXT_ACCOUNT_LEADS = Object.freeze([
${acct2.finish().map(line).join('\n')}
  ]);

  root.READOUT_DATA = Object.freeze({
    account: Object.freeze({
      name: 'Regional supplier of commercial laundry equipment',
      sells_to: 'hotels, care homes, gyms and laundromats',
      window_days: 14,
      reps: Object.freeze(['A', 'B', 'C', 'D']),
      leads: LEADS,
    }),
    nextAccount: Object.freeze({
      name: 'Commercial coffee-machine supplier',
      sells_to: 'hotels, care homes, gyms and laundromats',
      window_days: 14,
      reps: Object.freeze(['E', 'F']),
      leads: NEXT_ACCOUNT_LEADS,
    }),
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

writeFileSync(outFile, header + body);
console.log('wrote data.js');
