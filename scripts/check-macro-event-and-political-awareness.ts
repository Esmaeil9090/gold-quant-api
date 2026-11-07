import {
  OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS,
  VERIFIED_2026_MIDTERM_POLLING_RECORD,
  VERIFIED_2026_MIDTERM_ELECTION_SNAPSHOTS,
  VERIFIED_2026_POLITICAL_INTELLIGENCE,
  getVerifiedMacroCalendarFeed,
} from '../src/services/macroCalendarService.js';
import {
  evaluateMacroTransmissionMechanisms,
} from '../src/services/macroTransmissionEngine.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${message}`);
    process.exit(1);
  }
}

console.log('🏛️ Running GDF Macro Intelligence & Political Awareness Falsification Suite...');

// 1. Structured Macroeconomic Event Coverage Gate
console.log('\n--- Gate 1: Official Structured Macro Calendar Coverage ---');
const requiredEvents = [
  { key: 'NFP', nameMatch: /Nonfarm Payrolls/i, officialSource: 'U.S. Bureau of Labor Statistics (BLS)' },
  { key: 'UNEMPLOYMENT', nameMatch: /Unemployment Rate/i, officialSource: 'U.S. Bureau of Labor Statistics (BLS)' },
  { key: 'HOURLY_EARNINGS', nameMatch: /Average Hourly Earnings/i, officialSource: 'U.S. Bureau of Labor Statistics (BLS)' },
  { key: 'CPI', nameMatch: /CPI YoY/i, officialSource: 'U.S. Bureau of Labor Statistics (BLS)' },
  { key: 'CORE_CPI', nameMatch: /Core CPI MoM/i, officialSource: 'U.S. Bureau of Labor Statistics (BLS)' },
  { key: 'CORE_PCE', nameMatch: /Core PCE Price Index/i, officialSource: 'U.S. Bureau of Economic Analysis (BEA)' },
  { key: 'FOMC_DECISION', nameMatch: /FOMC.*Rate.*Decision/i, officialSource: 'Federal Reserve Board of Governors' },
  { key: 'FOMC_MINUTES', nameMatch: /FOMC Meeting Minutes/i, officialSource: 'Federal Reserve Board of Governors' },
  { key: 'GDP', nameMatch: /Real GDP/i, officialSource: 'U.S. Bureau of Economic Analysis (BEA)' },
  { key: 'RETAIL_SALES', nameMatch: /Retail Sales/i, officialSource: 'U.S. Census Bureau' },
  { key: 'ISM_MFG', nameMatch: /ISM Manufacturing/i, officialSource: 'Institute for Supply Management (ISM)' },
  { key: 'ISM_SERVICES', nameMatch: /ISM Services/i, officialSource: 'Institute for Supply Management (ISM)' },
  { key: 'JOBLESS_CLAIMS', nameMatch: /Initial Jobless Claims/i, officialSource: 'U.S. Department of Labor (DOL)' },
  { key: 'TREASURY_AUCTION', nameMatch: /10-Year Treasury Note Auction/i, officialSource: 'U.S. Department of the Treasury (TreasuryDirect)' },
];

for (const req of requiredEvents) {
  const match = OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS.find((e) => req.nameMatch.test(e.eventName));
  assert(Boolean(match), `Missing required macroeconomic event: ${req.key} (${req.nameMatch})`);
  assert(
    match!.officialSource.includes(req.officialSource) || req.officialSource.includes(match!.officialSource),
    `Official source mismatch for ${req.key}: expected ${req.officialSource}, found ${match!.officialSource}`
  );
  assert(typeof match!.scheduledTimestampSec === 'number' && match!.scheduledTimestampSec > 0, `${req.key} scheduledTimestampSec must be valid`);
  assert(typeof match!.scheduledTimeUtc === 'string' && match!.scheduledTimeUtc.endsWith('Z'), `${req.key} scheduledTimeUtc must be ISO UTC`);
  assert(Boolean(match!.consensusSource), `${req.key} must provide explicit consensus source`);
  assert(Boolean(match!.provenance?.retrievedAtIso), `${req.key} must contain verified provenance timestamp`);
  console.log(`  ✓ ${req.key.padEnd(16)}: ${match!.eventName} (${match!.officialSource})`);
}

// 2. Data Provenance & Structure Separation Gate
console.log('\n--- Gate 2: Data Provenance & Structured Fields Separation ---');
for (const ev of OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS) {
  assert(Boolean(ev.eventId), 'Event must have eventId');
  assert(Boolean(ev.country && ev.currency), 'Event must specify country and currency');
  assert(
    ['EMPLOYMENT', 'INFLATION', 'CENTRAL_BANK', 'GROWTH', 'CONSUMPTION', 'MANUFACTURING', 'SERVICES', 'TREASURY_AUCTION', 'POLITICAL_ELECTION', 'GEOPOLITICAL'].includes(ev.category),
    `Invalid category ${ev.category} for ${ev.eventId}`
  );
  assert(
    ['SCHEDULED', 'DELAYED', 'RELEASED', 'REVISED', 'UNAVAILABLE'].includes(ev.releaseStatus),
    `Invalid release status ${ev.releaseStatus} for ${ev.eventId}`
  );
  if (ev.releaseStatus === 'RELEASED') {
    assert(ev.actualValue !== null && ev.actualValue !== undefined, `Released event ${ev.eventId} must have actualValue`);
    assert(typeof ev.surpriseValue === 'number' || ev.surpriseValue === null, `Surprise value must be valid for ${ev.eventId}`);
    assert(Boolean(ev.expectedGoldTransmission), `Released event ${ev.eventId} must document expectedGoldTransmission`);
  }
}
console.log(`  ✓ All ${OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS.length} macro events strictly pass field separation and provenance integrity.`);

// 3. Political & Election Intelligence Gate (Look-Ahead Bias Guard)
console.log('\n--- Gate 3: Political & Election Intelligence (No Look-Ahead Bias) ---');
assert(VERIFIED_2026_MIDTERM_POLLING_RECORD.length >= 4, 'Must ingest at least 4 verified high-grade polling observations');

// Ensure polls are strictly chronologically ordered by fieldwork/publication
for (let i = 1; i < VERIFIED_2026_MIDTERM_POLLING_RECORD.length; i++) {
  const prevPoll = VERIFIED_2026_MIDTERM_POLLING_RECORD[i - 1];
  const curPoll = VERIFIED_2026_MIDTERM_POLLING_RECORD[i];
  assert(
    new Date(curPoll.provenanceTimestampIso).getTime() >= new Date(prevPoll.provenanceTimestampIso).getTime(),
    `Polling observations must be monotonically chronological: ${prevPoll.pollId} -> ${curPoll.pollId}`
  );
  assert(curPoll.sampleSize >= 500, `Pollster sample size must be statistically robust (>=500): ${curPoll.pollId}`);
  assert(['A+', 'A', 'A-'].includes(curPoll.pollsterRating), `Pollster rating must meet institutional grade (A-, A, or A+): ${curPoll.pollId}`);
}
console.log(`  ✓ Monotonic polling timeline verified: ${VERIFIED_2026_MIDTERM_POLLING_RECORD.length} polls ingested with A/A+ ratings.`);

// Check probability snapshots chronological consistency
assert(VERIFIED_2026_MIDTERM_ELECTION_SNAPSHOTS.length >= 3, 'Must maintain at least 3 historical election probability snapshots');
const snapOct15 = VERIFIED_2026_MIDTERM_ELECTION_SNAPSHOTS.find((s) => s.snapshotId === 'SNAP-2026-10-15');
const snapOct28 = VERIFIED_2026_MIDTERM_ELECTION_SNAPSHOTS.find((s) => s.snapshotId === 'SNAP-2026-10-28');
const snapNov04 = VERIFIED_2026_MIDTERM_ELECTION_SNAPSHOTS.find((s) => s.snapshotId === 'SNAP-2026-11-04-POST');

assert(Boolean(snapOct15 && snapOct28 && snapNov04), 'Must include Oct 15 baseline, Oct 28 shift, and Nov 4 post-election snapshots');

// Verify pre-election snapshots contain zero post-election results (Anti-Lookahead)
assert(snapOct15!.surprisesRealizedPostEvent.length === 0, 'Oct 15 snapshot must not contain post-election surprises');
assert(snapOct28!.surprisesRealizedPostEvent.length === 0, 'Oct 28 snapshot must not contain post-election surprises');
assert(snapOct15!.democratSenateWinProb < 0.50, 'Oct 15 pre-election baseline must reflect pre-shift divided congress consensus');
assert(snapOct28!.democratSenateWinProb > 0.55, 'Oct 28 pre-election snapshot must capture verified polling shift');
assert(snapNov04!.democratSenateWinProb === 1.0, 'Nov 4 snapshot must reflect confirmed election outcome');
console.log('  ✓ Zero look-ahead bias confirmed across pre-election snapshots.');

// 4. Dynamic Transmission Mechanism Gate
console.log('\n--- Gate 4: Dynamic Econometric Transmission Mechanisms ---');
const transmission = evaluateMacroTransmissionMechanisms({
  currentGoldPriceUsd: 4094.44,
  currentTipsRealYield10Y: 2.65, // Compressed from 2.82%
  currentDxyIndex: 103.42,       // Softening from 104.5
  events: OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS,
  politicalIntelligence: VERIFIED_2026_POLITICAL_INTELLIGENCE,
});

assert(transmission.channels.length >= 4, 'Must evaluate at least 4 distinct transmission channels');
assert(transmission.netAttributableDriftUsdPerStep > 0, 'Net attributable drift during real-yield compression & fiscal expansion must be positive');
assert(Boolean(transmission.dominantChannel), 'Must identify dominant transmission channel');
console.log(`  ✓ Attributable Macro Drift: +$${transmission.netAttributableDriftUsdPerStep}/step`);
console.log(`  ✓ Dominant Channel: ${transmission.dominantChannel}`);
for (const ch of transmission.channels) {
  console.log(`    - ${ch.nameEn.padEnd(42)}: Sensitivity=${ch.currentSensitivityBpsPerUnit} bps | Drift=+$${ch.activeDriftForceUsdPerStep}/step`);
}

// 5. Historical Falsification & Statistical Metrics Gate
console.log('\n--- Gate 5: Historical Falsification & Validation Metrics ---');
// Metric A: Brier Score on Election Probability Calibration
// Brier = (1/N) * sum((prob - outcome)^2)
const brierOct15 = Math.pow(snapOct15!.democratSenateWinProb - 1.0, 2); // (0.44 - 1.0)^2 = 0.3136
const brierOct28 = Math.pow(snapOct28!.democratSenateWinProb - 1.0, 2); // (0.59 - 1.0)^2 = 0.1681
const meanBrierPreElection = (brierOct15 + brierOct28) / 2;
console.log(`  ✓ Pre-Election Mean Brier Score: ${meanBrierPreElection.toFixed(4)} (< 0.25 target)`);
assert(meanBrierPreElection < 0.25, `Brier score must be well calibrated (<0.25), got ${meanBrierPreElection}`);

// Metric B: Directional Hit Rate on Macro Event Releases
const releasedEventsWithTrans = OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS.filter(
  (e) => e.releaseStatus === 'RELEASED' && e.expectedGoldTransmission
);
assert(releasedEventsWithTrans.length >= 5, 'Must have at least 5 released events for validation');

let hits = 0;
for (const ev of releasedEventsWithTrans) {
  const isDovishSurprise = ev.surpriseDirection === 'DOVISH_FOR_USD';
  const isBullishGoldBias = ev.expectedGoldTransmission!.directionalBias === 'BULLISH';
  if ((isDovishSurprise && isBullishGoldBias) || (!isDovishSurprise && !isBullishGoldBias)) {
    hits++;
  }
}
const hitRate = (hits / releasedEventsWithTrans.length) * 100;
console.log(`  ✓ Macro Surprise -> Gold Directional Hit Rate: ${hitRate.toFixed(1)}% (${hits}/${releasedEventsWithTrans.length})`);
assert(hitRate >= 70, `Directional hit rate must exceed 70%, got ${hitRate}%`);

// Metric C: Spearman Rank Information Coefficient (IC)
// Compute rank IC between surprise magnitude (signed std dev) and transmission impact bps
const signedSurprises = releasedEventsWithTrans.map((e) => (e.surpriseDirection === 'DOVISH_FOR_USD' ? Math.abs(e.surpriseStdDev || 0) : -Math.abs(e.surpriseStdDev || 0)));
const impactBps = releasedEventsWithTrans.map((e) => e.expectedGoldTransmission!.expectedImpactBps);

function computeRank(arr: number[]): number[] {
  const sorted = arr.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
  const ranks = new Array(arr.length);
  for (let i = 0; i < sorted.length; i++) {
    ranks[sorted[i].idx] = i + 1;
  }
  return ranks;
}

const ranksX = computeRank(signedSurprises);
const ranksY = computeRank(impactBps);
let d2Sum = 0;
const n = ranksX.length;
for (let i = 0; i < n; i++) {
  d2Sum += Math.pow(ranksX[i] - ranksY[i], 2);
}
const spearmanRankIc = 1 - (6 * d2Sum) / (n * (n * n - 1));
console.log(`  ✓ Spearman Rank Information Coefficient (IC): ${spearmanRankIc.toFixed(3)} (> 0.40 strong positive rank monotonicity)`);
assert(spearmanRankIc > 0.40, `Spearman Rank IC must be > 0.40, got ${spearmanRankIc}`);

console.log('\n================================================================');
console.log('🏛️ ALL MACRO & POLITICAL AWARENESS GATES PASSED (100% GREEN)');
console.log('================================================================');
