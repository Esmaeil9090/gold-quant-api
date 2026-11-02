import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {
  VerifiedCandle,
  VerifiedMacroNewsItem,
  VerifiedMacroYieldResult,
} from '../src/contracts/quantContracts.js';
import {
  evaluateParallelUniverseAndAwarenessCore,
  FaultClassifier,
  FaultType,
  type MarketAwarenessState,
  setAutoPromotionRuntimeMode,
} from '../src/services/intelligenceAwarenessCore.js';
import { evaluateScientificCorePipeline } from '../src/engine/scientificCore.js';
import { evaluateGoldSessionAndCalendar } from '../src/services/sessionCalendar.js';

const FIXTURE_DIR = path.join(process.cwd(), 'fixtures', 'real-market');

function loadRealCandles(filename: string): VerifiedCandle[] {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, filename), 'utf8'));
  return Array.isArray(raw) ? raw : raw.candles;
}

function loadRealMacro(): VerifiedMacroYieldResult {
  const macroFixture = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, 'macro_yields_fx.json'), 'utf8')
  );
  return {
    nominal10Y: macroFixture.nominal10Y ?? 4.28,
    tipsRealYield10Y: macroFixture.tipsRealYield10Y ?? 1.98,
    breakevenInflation10Y: macroFixture.breakevenInflation10Y ?? 2.3,
    dxyIndex: macroFixture.dxyIndex ?? 103.45,
    realYieldGravity: macroFixture.realYieldGravity ?? -0.45,
    dollarDrag: macroFixture.dollarDrag ?? -0.22,
    centralBankTide: macroFixture.centralBankTide ?? 0.55,
    netMacroLift: macroFixture.netMacroLift ?? -0.12,
    source: 'Verified Real Fixture',
    status: 'ONLINE_MULTI_SOURCE_VERIFIED',
    lastUpdated: new Date().toISOString(),
    respondingSources: ['Yahoo_TNX', 'FRED_DFII10', 'FRED_DTWEXBGS'],
    sanityCheckZScore: 0.14,
    outliersRejected: [],
  };
}

function shiftCandlesToEndTimestamp(
  candles: VerifiedCandle[],
  targetEndUnixSec: number,
  stepSec = 900
): VerifiedCandle[] {
  const n = candles.length;
  return candles.map((c, idx) => ({
    ...c,
    time: targetEndUnixSec - (n - 1 - idx) * stepSec,
  }));
}

async function runTests() {
  console.log('================================================================================');
  console.log('GDF AWARENESS CORE UPGRADE — REGRESSION & ACCEPTANCE SUITE');
  console.log('================================================================================');

  const baseCandles = loadRealCandles('paxg_15m.json');
  const secCandles = loadRealCandles('comex_gcf_15m.json');
  const liveMacro = loadRealMacro();

  // ---------------------------------------------------------------------------
  // TEST 1: Large Downside Residual Shock -> SHOCK_RESET / WRONG_DIRECTION /
  //         STALE_DRIFT / EQUILIBRIUM_ANCHOR_MISMATCH & Anti-Clone Candidate
  // ---------------------------------------------------------------------------
  // Create a sharp downside shock on the final bar (-$42 drop on a ~$4045 price)
  // while prior 39 bars sit near ~$4045 so the 40-bar anchor is ~$4044 (creating an upward recovery pull)
  const shockCandles: VerifiedCandle[] = baseCandles.map((c, idx) => {
    if (idx === baseCandles.length - 1) {
      const shockedClose = parseFloat((c.close - 42.0).toFixed(2));
      return {
        ...c,
        open: c.open,
        high: c.open + 1.0,
        low: shockedClose - 2.5,
        close: shockedClose,
        volume: c.volume * 3.2,
      };
    }
    return { ...c };
  });

  const shockTelemetry = evaluateParallelUniverseAndAwarenessCore({
    candles: shockCandles,
    liveMacro,
    secondaryBenchmark: {
      provider: 'Yahoo Finance COMEX Gold Futures',
      symbol: 'GC=F',
      candles: secCandles,
      crossVenueSpreadUsd: 1.85,
      crossVenueZScore: 0.42,
      isOutlierDislocation: false,
    },
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-shock-test-1',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  const shockAwareness = shockTelemetry.marketAwarenessState!;
  assert.ok(shockAwareness, 'MarketAwarenessState must be present on ParallelUniverseTelemetry');
  assert.equal(
    shockAwareness.recommendedDriftPolicy,
    'SHOCK_RESET',
    `Expected recommendedDriftPolicy === 'SHOCK_RESET' after large downside residual, got ${shockAwareness.recommendedDriftPolicy}`
  );
  assert.equal(
    shockAwareness.recommendedAnchorPolicy,
    'RECENTER_TO_POST_SHOCK',
    `Expected recommendedAnchorPolicy === 'RECENTER_TO_POST_SHOCK', got ${shockAwareness.recommendedAnchorPolicy}`
  );
  assert.equal(
    shockAwareness.recommendedBandPolicy,
    'WIDEN',
    `Expected recommendedBandPolicy === 'WIDEN', got ${shockAwareness.recommendedBandPolicy}`
  );
  assert.ok(
    shockAwareness.activeFaultCodes.includes('WRONG_DIRECTION') ||
      shockAwareness.activeFaultCodes.includes('STALE_DRIFT'),
    `Expected WRONG_DIRECTION or STALE_DRIFT in activeFaultCodes, got ${shockAwareness.activeFaultCodes.join(',')}`
  );
  assert.ok(
    shockAwareness.activeFaultCodes.includes('EQUILIBRIUM_ANCHOR_MISMATCH'),
    `Expected EQUILIBRIUM_ANCHOR_MISMATCH in activeFaultCodes, got ${shockAwareness.activeFaultCodes.join(',')}`
  );

  // Verify Candidate is NOT an identical bullish clone of Live
  const postShockSpot = shockCandles[shockCandles.length - 1].close;
  const liveStep6 = shockTelemetry.liveEnsemble.medianTrack[5].value - postShockSpot;
  const candStep6 = shockTelemetry.candidateEnsemble.medianTrack[5].value - postShockSpot;
  assert.notEqual(
    liveStep6.toFixed(2),
    candStep6.toFixed(2),
    'Candidate trajectory must not be an identical clone of Live trajectory after a large shock'
  );
  assert.ok(
    candStep6 < liveStep6,
    `Candidate 6-step excursion (${candStep6.toFixed(2)}) must absorb the downside shock rather than cloning the bullish recovery pull (${liveStep6.toFixed(2)})`
  );
  console.log(
    `✓ [PASS 1/5] Large downside shock -> Faults=[${shockAwareness.activeFaultCodes.join(', ')}], Policy=${shockAwareness.recommendedDriftPolicy}/${shockAwareness.recommendedAnchorPolicy}, LiveStep6=${liveStep6.toFixed(2)} vs CandStep6=${candStep6.toFixed(2)}`
  );

  // ---------------------------------------------------------------------------
  // TEST 2: Saturday / Sunday WEEKEND_THIN Regime -> SESSION_REGIME_VIOLATION
  //         when trend plume persists & ZERO_FOR_SESSION compresses projection
  // ---------------------------------------------------------------------------
  // Saturday 2026-10-24T14:00:00Z = 1792850400
  const saturdayUnixSec = Math.floor(Date.parse('2026-10-24T14:00:00Z') / 1000);
  // Make the last few bars trend strongly so the unclamped filter wants to project a strong trend on Saturday
  const weekendTrendingRaw: VerifiedCandle[] = baseCandles.map((c, idx) => {
    const offset = idx >= baseCandles.length - 6 ? (idx - (baseCandles.length - 6) + 1) * 4.5 : 0;
    return {
      ...c,
      open: parseFloat((c.open + offset).toFixed(2)),
      high: parseFloat((c.high + offset + 1.5).toFixed(2)),
      low: parseFloat((c.low + offset).toFixed(2)),
      close: parseFloat((c.close + offset + 1.2).toFixed(2)),
    };
  });
  const saturdayCandles = shiftCandlesToEndTimestamp(weekendTrendingRaw, saturdayUnixSec, 900);

  const weekendTelemetry = evaluateParallelUniverseAndAwarenessCore({
    candles: saturdayCandles,
    liveMacro,
    secondaryBenchmark: null,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-weekend-test-2',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  const weekendAwareness = weekendTelemetry.marketAwarenessState!;
  assert.equal(weekendAwareness.weekpart, 'WEEKEND_THIN');
  assert.equal(weekendAwareness.sessionId, 'WEEKEND_CLOSED_THIN');
  assert.equal(weekendAwareness.recommendedDriftPolicy, 'ZERO_FOR_SESSION');
  assert.equal(weekendAwareness.recommendedAnchorPolicy, 'FREEZE');
  assert.ok(
    weekendAwareness.activeFaultCodes.includes('SESSION_REGIME_VIOLATION'),
    `Expected SESSION_REGIME_VIOLATION when strong trend is projected into Saturday WEEKEND_THIN, got [${weekendAwareness.activeFaultCodes.join(', ')}]`
  );

  // Verify ZERO_FOR_SESSION & FREEZE compress closed Saturday steps vs unclamped weekday trend,
  // while NOT forcing a robotic $0.0000 dead-flat line, AND releasing full directional movement
  // as soon as future horizon steps cross into Market Open (Sunday 22:00 UTC / Mon-Fri)!
  const satSpot = saturdayCandles[saturdayCandles.length - 1].close;
  const satLiveMaxDev = Math.max(
    ...weekendTelemetry.liveEnsemble.medianTrack.map(pt => Math.abs(pt.value - satSpot))
  );
  const satCandMaxDev = Math.max(
    ...weekendTelemetry.candidateEnsemble.medianTrack.map(pt => Math.abs(pt.value - satSpot))
  );
  // Compare against Wednesday active session with identical trending bars
  const wedTrendingCandles = shiftCandlesToEndTimestamp(
    weekendTrendingRaw,
    Math.floor(Date.parse('2026-10-21T14:00:00Z') / 1000),
    900
  );
  const wedTrendingTel = evaluateParallelUniverseAndAwarenessCore({
    candles: wedTrendingCandles,
    liveMacro,
    secondaryBenchmark: null,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-wed-trend-compare',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });
  const wedMaxDev = Math.max(
    ...wedTrendingTel.liveEnsemble.medianTrack.map(pt => Math.abs(pt.value - satSpot))
  );
  assert.ok(
    satLiveMaxDev < wedMaxDev * 0.45 && satLiveMaxDev > 0.01,
    `Expected closed Saturday steps to be damped >55% vs weekday (${satLiveMaxDev.toFixed(4)} vs ${wedMaxDev.toFixed(4)}) without being a dead $0.0000 flat line`
  );

  // Now test Sunday 19:30 UTC on 15m (steps 1..9 are closed before 22:00 UTC; steps 10..24 are OPEN after 22:00 UTC)
  // and Sunday on 1h / 1d timeframes where future steps cross into Monday-Friday active sessions:
  const sunPreOpenUnixSec = Math.floor(Date.parse('2026-10-25T19:30:00Z') / 1000);
  const sunPreOpenCandles15m = shiftCandlesToEndTimestamp(weekendTrendingRaw, sunPreOpenUnixSec, 900);
  const sunReopenTel15m = evaluateParallelUniverseAndAwarenessCore({
    candles: sunPreOpenCandles15m,
    liveMacro,
    secondaryBenchmark: null,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-sun-reopen-15m',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });
  const sunTrack15m = sunReopenTel15m.liveEnsemble.medianTrack;
  // Step 8 is 21:30 UTC (still closed); Step 24 is Monday 01:30 UTC (3.5 hours after market open)
  const closedPhaseMoveUsd = Math.abs(sunTrack15m[7].value - satSpot);
  const postOpenPhaseMoveUsd = Math.abs(sunTrack15m[23].value - sunTrack15m[9].value);
  assert.ok(
    postOpenPhaseMoveUsd > closedPhaseMoveUsd * 1.5 && postOpenPhaseMoveUsd > 0.5,
    `Expected post-open steps (after Sunday 22:00 UTC) to move significantly more than closed steps (postOpen=$${postOpenPhaseMoveUsd.toFixed(4)} vs closed=$${closedPhaseMoveUsd.toFixed(4)})`
  );

  // Also verify 1d timeframe on Sunday (where future steps h=1..24 are Mon-Fri open sessions) moves high/low!
  const sunCandles1d = shiftCandlesToEndTimestamp(weekendTrendingRaw, sunPreOpenUnixSec, 86400);
  const sunTel1d = evaluateParallelUniverseAndAwarenessCore({
    candles: sunCandles1d,
    liveMacro,
    secondaryBenchmark: null,
    interval: '1d',
    intervalStepSeconds: 86400,
    snapshotId: 'snap-sun-reopen-1d',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });
  const sun1dMaxDev = Math.max(
    ...sunTel1d.liveEnsemble.medianTrack.map(pt => Math.abs(pt.value - satSpot))
  );
  assert.ok(
    sun1dMaxDev > 1.5,
    `Expected 1d forecast evaluated on Sunday to move higher/lower across Mon-Fri open steps (maxDev=$${sun1dMaxDev.toFixed(4)})`
  );

  console.log(
    `✓ [PASS 2/5] Saturday WEEKEND_THIN damped (Sat=$${satLiveMaxDev.toFixed(2)} vs Wed=$${wedMaxDev.toFixed(2)}) & Sunday Reopen releases directional trend after market open (15m post-open=$${postOpenPhaseMoveUsd.toFixed(2)}, 1d maxDev=$${sun1dMaxDev.toFixed(2)})`
  );

  // ---------------------------------------------------------------------------
  // TEST 3: LONDON_NY_OVERLAP vs ASIA Session Tags & Turn-of-Year / Turn-of-Month
  // ---------------------------------------------------------------------------
  // Wednesday 2026-10-21T03:00:00Z (ASIA) vs Wednesday 2026-10-21T14:30:00Z (LONDON_NY_OVERLAP)
  const asiaWedUnixSec = Math.floor(Date.parse('2026-10-21T03:00:00Z') / 1000);
  const overlapWedUnixSec = Math.floor(Date.parse('2026-10-21T14:30:00Z') / 1000);
  const turnOfYearUnixSec = Math.floor(Date.parse('2026-12-30T10:00:00Z') / 1000);

  const asiaCandles = shiftCandlesToEndTimestamp(baseCandles, asiaWedUnixSec, 900);
  const overlapCandles = shiftCandlesToEndTimestamp(baseCandles, overlapWedUnixSec, 900);

  const asiaTel = evaluateParallelUniverseAndAwarenessCore({
    candles: asiaCandles,
    liveMacro,
    secondaryBenchmark: null,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-asia-test-3a',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });
  const overlapTel = evaluateParallelUniverseAndAwarenessCore({
    candles: overlapCandles,
    liveMacro,
    secondaryBenchmark: null,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-overlap-test-3b',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  assert.equal(asiaTel.marketAwarenessState?.sessionId, 'ASIA');
  assert.equal(asiaTel.marketAwarenessState?.weekpart, 'WEEKDAY_FULL_AUCTION');
  assert.equal(overlapTel.marketAwarenessState?.sessionId, 'LONDON_NY_OVERLAP');
  assert.equal(overlapTel.marketAwarenessState?.weekpart, 'WEEKDAY_FULL_AUCTION');

  const toySession = evaluateGoldSessionAndCalendar({ timestampSec: turnOfYearUnixSec });
  assert.equal(toySession.sessionId, 'LONDON');
  assert.equal(toySession.seasonalCalendar.isTurnOfMonth, true);
  assert.equal(toySession.seasonalCalendar.isTurnOfYearHolidayWindow, true);
  assert.ok(toySession.seasonalCalendar.seasonalLiquidityPenalty >= 0.35);

  console.log(
    `✓ [PASS 3/5] Session & Calendar accuracy -> 03:00 UTC=${asiaTel.marketAwarenessState?.sessionId}, 14:30 UTC=${overlapTel.marketAwarenessState?.sessionId}, Dec 30 TurnOfYear=${toySession.seasonalCalendar.isTurnOfYearHolidayWindow} (penalty=${toySession.seasonalCalendar.seasonalLiquidityPenalty})`
  );

  // ---------------------------------------------------------------------------
  // TEST 4: NEWS_TRANSMISSION_MISMATCH (Geopolitics headline + realized crash ->
  //         RISK_OFF_LIQUIDATION & opposite transmission candidate)
  // ---------------------------------------------------------------------------
  const geoHeadlines: VerifiedMacroNewsItem[] = [
    {
      id: 'news-geo-1',
      title: 'Geopolitical Escalation in Middle East Triggers Safe-Haven Alert',
      titleFa: 'تنش ژئوپلیتیک و هشدار پناهگاه امن',
      source: 'Verified Macro Wire',
      timestamp: Math.floor(Date.now() / 1000),
      timeStr: '12:00 UTC',
      country: 'US',
      flag: '🇺🇸',
      category: 'geopolitics',
      goldImpactPct: 0.85,
      sentiment: 'bullish',
      transmission: 'Safe-Haven',
      transmissionFa: 'پناهگاه امن',
      isVerifiedExternal: true,
    },
  ];

  const geoCrashTel = evaluateParallelUniverseAndAwarenessCore({
    candles: shockCandles,
    liveMacro,
    secondaryBenchmark: null,
    macroNews: geoHeadlines,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-geo-crash-test-4',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  const geoAwareness = geoCrashTel.marketAwarenessState!;
  assert.equal(geoAwareness.newsTransmissionMode, 'RISK_OFF_LIQUIDATION');
  assert.ok(
    geoAwareness.activeFaultCodes.includes('NEWS_TRANSMISSION_MISMATCH'),
    `Expected NEWS_TRANSMISSION_MISMATCH when geopolitics headline coincides with realized crash`
  );
  assert.equal(geoAwareness.candidateObligations.exploreOppositeNewsTransmission, true);
  const mismatchFinding = geoCrashTel.findings.find(
    f => f.category === 'NEWS_TRANSMISSION_MISMATCH'
  );
  assert.ok(mismatchFinding, 'Structured finding for NEWS_TRANSMISSION_MISMATCH must be emitted');
  console.log(
    `✓ [PASS 4/5] Shock & News Transmission Mismatch -> Mode=${geoAwareness.newsTransmissionMode}, Fault=NEWS_TRANSMISSION_MISMATCH, Action=${mismatchFinding?.recommendedAction}`
  );

  // ---------------------------------------------------------------------------
  // TEST 5: Auto-promotion remains strictly blocked when faults are active or
  //         when not all 8 gates pass
  // ---------------------------------------------------------------------------
  setAutoPromotionRuntimeMode(true);
  const blockedPromoTel = evaluateParallelUniverseAndAwarenessCore({
    candles: shockCandles,
    liveMacro,
    secondaryBenchmark: null,
    macroNews: geoHeadlines,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'snap-autopromo-block-test-5',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  assert.equal(blockedPromoTel.marketAwarenessState?.blockAutoPromotionDueToFaults, true);
  assert.equal(blockedPromoTel.ReadyForPromotion, false);
  assert.equal(blockedPromoTel.promotionOccurredThisCycle, false);
  setAutoPromotionRuntimeMode(false);
  console.log(
    `✓ [PASS 5/6] Auto-promotion strictly blocked under active forecast faults (blockAutoPromotionDueToFaults=true, promotionOccurredThisCycle=false)`
  );

  // ---------------------------------------------------------------------------
  // TEST 6: Friday Bull-Trap Rejection + Multi-Bar Breakdown Under Bearish Macro Gravity
  //         (Verifies that a +$20 spike followed by 2-3 consecutive red bars totaling -$26
  //          from the swing high is NEVER masked by the 4-bar subtraction and projects DOWN)
  // ---------------------------------------------------------------------------
  const fridayPreCrashCandles = shiftCandlesToEndTimestamp(
    baseCandles,
    Math.floor(Date.parse('2026-10-30T11:00:00Z') / 1000),
    3600
  );
  const nFri = fridayPreCrashCandles.length;
  const baseP = fridayPreCrashCandles[nFri - 5].close;
  // Bar n-4: bull-trap spike (+$20)
  fridayPreCrashCandles[nFri - 4] = {
    ...fridayPreCrashCandles[nFri - 4],
    open: baseP,
    high: parseFloat((baseP + 21).toFixed(2)),
    low: parseFloat((baseP - 1).toFixed(2)),
    close: parseFloat((baseP + 20).toFixed(2)),
  };
  // Bar n-3: reversal bar 1 (-$6 from peak)
  fridayPreCrashCandles[nFri - 3] = {
    ...fridayPreCrashCandles[nFri - 3],
    open: parseFloat((baseP + 20).toFixed(2)),
    high: parseFloat((baseP + 20.5).toFixed(2)),
    low: parseFloat((baseP + 13).toFixed(2)),
    close: parseFloat((baseP + 14).toFixed(2)),
  };
  // Bar n-2: reversal bar 2 (-$16 from peak)
  fridayPreCrashCandles[nFri - 2] = {
    ...fridayPreCrashCandles[nFri - 2],
    open: parseFloat((baseP + 14).toFixed(2)),
    high: parseFloat((baseP + 14.5).toFixed(2)),
    low: parseFloat((baseP + 3).toFixed(2)),
    close: parseFloat((baseP + 4).toFixed(2)),
  };
  // Bar n-1: breakdown bar 3 (-$30 from peak, though only -$10 below bar n-5!)
  fridayPreCrashCandles[nFri - 1] = {
    ...fridayPreCrashCandles[nFri - 1],
    open: parseFloat((baseP + 4).toFixed(2)),
    high: parseFloat((baseP + 4.5).toFixed(2)),
    low: parseFloat((baseP - 11).toFixed(2)),
    close: parseFloat((baseP - 10).toFixed(2)),
  };

  const bearishMacro = {
    ...liveMacro,
    nominal10Y: 4.95,
    tipsRealYield10Y: 2.63,
    dxyIndex: 101.96,
    realYieldGravity: -1.299,
    dollarDrag: -0.127,
    netMacroLift: -0.938,
  };

  const friBreakdownTel = evaluateParallelUniverseAndAwarenessCore({
    candles: fridayPreCrashCandles,
    liveMacro: bearishMacro,
    secondaryBenchmark: null,
    macroNews: geoHeadlines,
    interval: '1h',
    intervalStepSeconds: 3600,
    snapshotId: 'snap-friday-breakdown-test-6',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://api.binance.com/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  const friAw = friBreakdownTel.marketAwarenessState!;
  const friSpot = fridayPreCrashCandles[nFri - 1].close;
  const friLiveStep6 = friBreakdownTel.liveEnsemble.medianTrack[5].value - friSpot;
  const friCandStep6 = friBreakdownTel.candidateEnsemble.medianTrack[5].value - friSpot;

  assert.ok(
    friAw.activeFaultCodes.includes('STALE_DRIFT') &&
      friAw.activeFaultCodes.includes('EQUILIBRIUM_ANCHOR_MISMATCH') &&
      friAw.activeFaultCodes.includes('NEWS_TRANSMISSION_MISMATCH'),
    `Expected Friday bull-trap breakdown to detect STALE_DRIFT, EQUILIBRIUM_ANCHOR_MISMATCH, NEWS_TRANSMISSION_MISMATCH, got [${friAw.activeFaultCodes.join(', ')}]`
  );
  assert.equal(friAw.recommendedDriftPolicy, 'SHOCK_RESET');
  assert.equal(friAw.newsTransmissionMode, 'RISK_OFF_LIQUIDATION');
  assert.ok(
    friLiveStep6 < -5 && friCandStep6 < -8,
    `Expected both Live (${friLiveStep6.toFixed(2)}) and Candidate (${friCandStep6.toFixed(2)}) +6h forecasts to point DOWN during Friday breakdown`
  );
  // Verify FaultClassifier utility directly for WRONG_DIRECTION and OVERCONFIDENT_TREND
  const directReport = FaultClassifier.classifyFromMetrics({
    safeAtr: 15,
    currentPrice: 3973.1,
    liveForwardSlopeUsdPerStep: 5.2,
    liveBandWidthStep1Usd: 18.0,
    latestResidualUsd: -28.5,
    latestResidualZ: -2.45,
    lastBarMoveUsd: -18.4,
    trailingRealizedMoveUsd: -10.26,
    structuralRealizedMoveUsd: -30.1,
    consecutiveBearBars: 3,
    consecutiveBullBars: 0,
    streakBars: 3,
    macroBearishGravity: true,
    macroBullishSupport: false,
    sessionId: 'LONDON',
    weekpart: 'WEEKDAY_FULL_AUCTION',
    isTurnOfMonth: true,
  });
  assert.equal(directReport.hasWrongDirection, true);
  assert.equal(directReport.hasOverconfidentTrend, true);
  assert.equal(directReport.requiresFeedbackCorrection, true);
  assert.equal(directReport.recommendedDriftPolicy, 'SHOCK_RESET');
  assert.equal(directReport.recommendedBandPolicy, 'WIDEN');
  assert.equal(directReport.recommendedAnchorPolicy, 'RECENTER_TO_POST_SHOCK');
  assert.equal(directReport.wrongDirectionFault?.faultType, FaultType.WRONG_DIRECTION);
  assert.equal(directReport.overconfidentTrendFault?.faultType, FaultType.OVERCONFIDENT_TREND);

  const typedAwarenessState: MarketAwarenessState = friAw;
  assert.equal(typedAwarenessState.sessionRegime.sessionId, typedAwarenessState.sessionId);
  assert.equal(typedAwarenessState.sessionRegime.weekpart, 'WEEKDAY_FULL_AUCTION');
  assert.ok(Array.isArray(typedAwarenessState.activeFaultTypes));
  assert.ok(typedAwarenessState.activeFaultTypes?.includes(FaultType.STALE_DRIFT));
  assert.equal(typedAwarenessState.recommendedPolicies?.driftPolicy, 'SHOCK_RESET');
  assert.equal(typedAwarenessState.recommendedPolicies?.bandPolicy, 'WIDEN');
  assert.equal(typedAwarenessState.recommendedPolicies?.anchorPolicy, 'RECENTER_TO_POST_SHOCK');

  const stateReport = FaultClassifier.analyzeMarketAwarenessState({
    ...typedAwarenessState,
    activeFaultCodes: [FaultType.WRONG_DIRECTION, FaultType.OVERCONFIDENT_TREND],
    activeFaultTypes: [FaultType.WRONG_DIRECTION, FaultType.OVERCONFIDENT_TREND],
    activeFaults: directReport.classifiedFaults,
  });
  assert.equal(stateReport.hasWrongDirection, true);
  assert.equal(stateReport.hasOverconfidentTrend, true);
  assert.equal(stateReport.requiresFeedbackCorrection, true);

  // Verify scientificCore.ts directly integrates FaultClassifier in its forecast engine feedback loop
  // and automatically applies recommendedDriftPolicy (SHOCK_RESET) and recommendedBandPolicy (WIDEN) overrides
  const directSciCoreOut = evaluateScientificCorePipeline({
    candles: shockCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 14.5,
    htfPocAnchorPrice: 4045.0,
    liveMacro,
    secondaryBenchmark: null,
    liveTuning: {
      writeBackGeneration: 1,
      lastWriteBackIso: null,
      sourceCandidateArchId: null,
      driftPersistencePhi: 0.78,
      meanReversionKappa: 0.12,
      echoToxicityCouplingBeta: 0.34,
      echoResilienceCouplingGamma: 0.42,
      macroResidualCouplingEta: 0.25,
      crossVenueObservationPrecisionMult: 1.0,
      activeSymbolicTermsWrittenBack: [],
      prunedFaultyComponents: [],
      recommendedDriftPolicy: 'UNCHANGED',
      recommendedBandPolicy: 'NORMAL',
      recommendedAnchorPolicy: 'UNCHANGED',
      marketAwarenessState: {
        ...typedAwarenessState,
        activeFaultCodes: [FaultType.WRONG_DIRECTION, FaultType.OVERCONFIDENT_TREND],
        activeFaultTypes: [FaultType.WRONG_DIRECTION, FaultType.OVERCONFIDENT_TREND],
        activeFaults: directReport.classifiedFaults,
        recommendedDriftPolicy: 'UNCHANGED',
        recommendedBandPolicy: 'NORMAL',
        recommendedAnchorPolicy: 'UNCHANGED',
        recommendedPolicies: {
          driftPolicy: 'UNCHANGED',
          bandPolicy: 'NORMAL',
          anchorPolicy: 'UNCHANGED',
        },
      },
    },
    dataDrivenMinWindowBars: 24,
  });
  assert.equal(directSciCoreOut.faultClassification?.hasWrongDirection, true);
  assert.equal(directSciCoreOut.faultClassification?.hasOverconfidentTrend, true);
  assert.equal(
    directSciCoreOut.yellowLineConditionalExpectation.appliedDriftPolicy,
    'SHOCK_RESET'
  );
  assert.equal(
    directSciCoreOut.yellowLineConditionalExpectation.appliedBandPolicy,
    'WIDEN'
  );
  assert.equal(
    directSciCoreOut.yellowLineConditionalExpectation.appliedAnchorPolicy,
    'RECENTER_TO_POST_SHOCK'
  );

  console.log(
    `✓ [PASS 6/6] Friday bull-trap breakdown (-$30 off swing high) & scientificCore.ts FaultClassifier feedback loop verified -> Live+6h=$${friLiveStep6.toFixed(2)}, Cand+6h=$${friCandStep6.toFixed(2)}, AppliedPolicies=${directSciCoreOut.yellowLineConditionalExpectation.appliedDriftPolicy}/${directSciCoreOut.yellowLineConditionalExpectation.appliedBandPolicy}`
  );

  console.log('================================================================================');
  console.log('ALL 6/6 AWARENESS CORE UPGRADE REGRESSION SCENARIOS PASSED.');
  console.log('================================================================================');
}

runTests().catch(err => {
  console.error('Awareness Core Upgrade regression suite failed:', err);
  process.exit(1);
});
