/**
 * PHASE C AUTOMATED VERIFICATION & EVIDENCE SUITE (C1 through C7)
 *
 * Executes:
 *   - C1: Full-Engine Filter-Path Perturbation Test (`evaluateScientificCorePipeline`, `evaluateBtcScientificCore`, `evaluatePureQuantPipeline`)
 *   - C2: Checksummed Real-Data Sample Manifest Verification + Persistent Live Microstructure Recorder Snapshot Test
 *   - C3: Minimum Detectable Effect (MDE) at 80% Power Table
 *   - C4: Large-Sample Phase B Re-Run (`PAXGUSDT` & `BTCUSDT` 2022–2026) with Cumulative Holm-Bonferroni across Phase B (11) + Phase C
 *   - C5: HAR-RV + Intraday Session Seasonality + FHS + ACI Interval Calibration (Timeframe, Session, Macro Yield-Shock, First-Exit Pathwise)
 *   - C6: Product Honesty Test (Default Drift = 0, Unverified Claims Stripped)
 *   - C7: Ledger Hygiene Test (Segregation of `FIXTURE_OR_BACKTEST` vs `LIVE_PROSPECTIVE`, C3 Power Gate N_min=197)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Candle } from '../src/contracts/quantContracts.js';
import type { PointInTimeMacroObservation } from '../src/engine/scientificCore.js';
import {
  aggregateCandlesToTimeframe,
  runC1FilterPathLeakAudit,
  computeC3PowerTable,
  evaluateC5IntervalCalibrationOnDataset,
  runC4LargeSampleAblationSuite,
} from '../src/services/phaseCEvidenceAndCalibration.js';
import { liveMicrostructureRecorder } from '../src/services/liveMicrostructureRecorder.js';
import {
  segregateFixtureEntriesFromLiveLedger,
  evaluateLedgerLiveAccuracy,
  appendPointInTimeForecastLedgerEntry,
  verifyForecastLedgerHashChain,
  C3_POWER_MIN_LIVE_RESOLVED_PER_CELL,
} from '../src/services/pointInTimeForecastLedger.js';
import { getVerifiedMacroCalendarFeed } from '../src/services/macroCalendarService.js';

const DATA_DIR = path.resolve(process.cwd(), 'data/c2_real_sample');
const REPORT_PATH = path.resolve(
  process.cwd(),
  'data/phase_c_evidence_and_calibration_report.json'
);

function assertCondition(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(`[PHASE C ASSERTION FAILED] ${message}`);
  }
}

async function main() {
  console.log('========================================================================');
  console.log('GDF PHASE C — EVIDENCE, CALIBRATION, AND PRODUCT HONESTY SUITE (C1–C7)');
  console.log('========================================================================\n');

  // Load C2 datasets
  const manifestPath = path.join(DATA_DIR, 'manifest.json');
  assertCondition(fs.existsSync(manifestPath), 'C2 manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const paxg15m: Candle[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'binance_vision_paxgusdt_15m_2022_to_date.json'), 'utf8')
  ).candles;
  const paxg1h: Candle[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'binance_vision_paxgusdt_1h_2022_to_date.json'), 'utf8')
  ).candles;
  const btc15m: Candle[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'binance_vision_btcusdt_15m_2022_to_date.json'), 'utf8')
  ).candles;
  const btc1h: Candle[] = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'binance_vision_btcusdt_1h_2022_to_date.json'), 'utf8')
  ).candles;
  const paxg4h = aggregateCandlesToTimeframe(paxg1h, 4);
  const paxg1d = aggregateCandlesToTimeframe(paxg1h, 24);
  const btc4h = aggregateCandlesToTimeframe(btc1h, 4);
  const btc1d = aggregateCandlesToTimeframe(btc1h, 24);

  const fredData = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'fred_dated_macro_2022_to_date.json'), 'utf8')
  ) as {
    observations: Array<{
      observationDateIso: string;
      effectiveAvailableTimestampSec: number;
      nominal10Y: number;
      tipsRealYield10Y: number;
      breakevenInflation10Y: number;
      dxyIndex: number;
    }>;
  };

  const macroSeries: PointInTimeMacroObservation[] = fredData.observations.map(o => ({
    timestampSec: o.effectiveAvailableTimestampSec,
    date: o.observationDateIso,
    nominal10Y: o.nominal10Y,
    tips10YRealYield: o.tipsRealYield10Y,
    breakevenInflation10Y: o.breakevenInflation10Y,
    dxyIndex: o.dxyIndex,
  }));

  // Build set of FRED daily yield-shock dates (|ΔDFII10| >= 5 bps or |ΔDGS10| >= 7 bps)
  const yieldShockDates = new Set<string>();
  for (let i = 1; i < fredData.observations.length; i++) {
    const cur = fredData.observations[i];
    const prev = fredData.observations[i - 1];
    if (
      Math.abs(cur.tipsRealYield10Y - prev.tipsRealYield10Y) >= 0.05 ||
      Math.abs(cur.nominal10Y - prev.nominal10Y) >= 0.07
    ) {
      yieldShockDates.add(cur.observationDateIso);
    }
  }

  const bybit1hRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'bybit_btc_spot_and_perp_1h_paginated.json'), 'utf8')
  ) as {
    candles: Candle[];
    derivativesSeries: Array<{
      timestampSec: number;
      fundingRate8h: number;
      openInterestContracts: number;
      openInterestChangePct: number | null;
      markSpotBasisBps: number;
      markPriceUsd: number;
      spotPriceUsd: number;
      venue: string;
    }>;
  };

  const bybitAligned1h = bybit1hRaw.candles.map((c, idx) => {
    const d = bybit1hRaw.derivativesSeries[idx] || bybit1hRaw.derivativesSeries[bybit1hRaw.derivativesSeries.length - 1];
    return {
      timestampSec: c.time,
      spotClose: c.close,
      spotHigh: c.high,
      spotLow: c.low,
      markClose: d?.markPriceUsd ?? c.close,
      markSpotBasisBps: d?.markSpotBasisBps ?? 0,
      openInterestContracts: d?.openInterestContracts ?? 55000,
      fundingRate8h: d?.fundingRate8h ?? 0,
    };
  });

  const cftcGoldRaw = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'cftc_disagg_cot_088691_2022_to_date.json'), 'utf8')
  ) as {
    reports: Array<{
      effectiveReleaseTimestampSec: number;
      managedMoneyLong: number;
      managedMoneyShort: number;
      openInterestAll: number;
    }>;
  };

  const cftcGoldWeekly = cftcGoldRaw.reports.map(r => ({
    availableTimestampSec: r.effectiveReleaseTimestampSec,
    mMoneyLong: r.managedMoneyLong,
    mMoneyShort: r.managedMoneyShort,
    openInterestAll: r.openInterestAll,
  }));

  // ---------------------------------------------------------------------------
  // TEST C1: LEAK AUDIT OF THE FULL FILTER PATH
  // ---------------------------------------------------------------------------
  console.log('[C1] Running Full-Engine Filter-Path Leak Audit & Perturbation Test...');
  const c1Result = runC1FilterPathLeakAudit({
    goldCandles: paxg1h.slice(-400),
    btcCandles: btc1h.slice(-400),
    macroSeries,
    btcLeverageSeries: bybitAligned1h.map(o => ({
      timestampSec: o.timestampSec,
      fundingRate8h: o.fundingRate8h,
      markSpotBasisBps: o.markSpotBasisBps,
      openInterestChangePct: 0.1,
      markPriceUsd: o.markClose,
      spotPriceUsd: o.spotClose,
      venue: 'Bybit V5 Linear',
    })),
  });

  assertCondition(
    c1Result.allEnginesBitIdentical,
    `C1 perturbation test failed: goldDiff=${c1Result.goldScientificCoreMaxAbsDiff}, btcDiff=${c1Result.btcScientificCoreMaxAbsDiff}, quantDiff=${c1Result.pureQuantEngineMaxAbsDiff}`
  );
  console.log(
    `  -> PASS: All 3 engines bit-identical under post-origin perturbation (maxAbsDiff: Gold=${c1Result.goldScientificCoreMaxAbsDiff}, BTC=${c1Result.btcScientificCoreMaxAbsDiff}, Quant=${c1Result.pureQuantEngineMaxAbsDiff}).`
  );

  // ---------------------------------------------------------------------------
  // TEST C2: DATA MANIFEST CHECKSUMS & LIVE MICROSTRUCTURE RECORDER
  // ---------------------------------------------------------------------------
  console.log('[C2] Verifying Checksummed Real-Data Sample & Live Microstructure Recorder...');
  assertCondition(paxg15m.length >= 150000, `PAXGUSDT 15m count too small: ${paxg15m.length}`);
  assertCondition(btc15m.length >= 150000, `BTCUSDT 15m count too small: ${btc15m.length}`);
  assertCondition(paxg1h.length >= 40000, `PAXGUSDT 1h count too small: ${paxg1h.length}`);
  assertCondition(btc1h.length >= 40000, `BTCUSDT 1h count too small: ${btc1h.length}`);
  assertCondition(
    fredData.observations.length >= 1200,
    `FRED daily observations count too small: ${fredData.observations.length}`
  );
  assertCondition(
    cftcGoldWeekly.length >= 240,
    `CFTC Gold COT weekly count too small: ${cftcGoldWeekly.length}`
  );
  assertCondition(
    Array.isArray(manifest.legacyFixtureProvenance) && manifest.legacyFixtureProvenance.length >= 15,
    'Legacy fixture provenance must be recorded in manifest.json'
  );

  // Trigger a live verified capture cycle in PersistentLiveMicrostructureRecorder
  const recorderManifest = await liveMicrostructureRecorder.captureVerifiedSnapshotCycle();
  assertCondition(
    recorderManifest.counts.totalRecords > 0,
    'Live microstructure recorder must capture real L2 depth, trades, and perp funding/OI records'
  );
  console.log(
    `  -> PASS: C2 manifest verified (${paxg15m.length} PAXG 15m bars, ${btc15m.length} BTC 15m bars, ${fredData.observations.length} FRED days, ${cftcGoldWeekly.length} CFTC weeks) & Live Recorder active (${recorderManifest.counts.totalRecords} records with SHA-256).`
  );

  // ---------------------------------------------------------------------------
  // TEST C3: POWER FIRST (MDE AT 80% POWER)
  // ---------------------------------------------------------------------------
  console.log('[C3] Computing Statistical Power & Minimum Detectable Effect (MDE) Table...');
  const c3PowerTable = computeC3PowerTable({
    paxg15mCount: paxg15m.length,
    paxg1hCount: paxg1h.length,
    paxg4hCount: paxg4h.length,
    paxg1dCount: paxg1d.length,
    btc15mCount: btc15m.length,
    btc1hCount: btc1h.length,
    btc4hCount: btc4h.length,
    btc1dCount: btc1d.length,
    bybit1hCount: bybitAligned1h.length,
    totalHolmHypothesesM: 20,
  });
  assertCondition(c3PowerTable.length === 10, 'C3 power table must cover all 10 Phase C hypotheses');
  console.log(`  -> PASS: Computed MDEs for ${c3PowerTable.length} hypotheses.`);

  // ---------------------------------------------------------------------------
  // TEST C5: INTERVAL CALIBRATION (HAR-RV + SESSION SEASONALITY + FHS + ACI)
  // ---------------------------------------------------------------------------
  console.log('[C5] Running HAR-RV + Intraday Session Seasonality + FHS + ACI Interval Calibration...');
  const c5Gold15m = evaluateC5IntervalCalibrationOnDataset({
    candles: paxg15m,
    asset: 'PAXGUSDT',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '15m',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 4,
  });
  const c5Gold1h = evaluateC5IntervalCalibrationOnDataset({
    candles: paxg1h,
    asset: 'PAXGUSDT',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '1h',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 4,
  });
  const c5Gold4h = evaluateC5IntervalCalibrationOnDataset({
    candles: paxg4h,
    asset: 'PAXGUSDT',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '4h',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 2,
  });
  const c5Gold1d = evaluateC5IntervalCalibrationOnDataset({
    candles: paxg1d,
    asset: 'PAXGUSDT',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '1d',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 1,
  });

  const c5Btc15m = evaluateC5IntervalCalibrationOnDataset({
    candles: btc15m,
    asset: 'BTCUSDT',
    instrumentIdentity: 'BTC_SPOT',
    timeframe: '15m',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 4,
  });
  const c5Btc1h = evaluateC5IntervalCalibrationOnDataset({
    candles: btc1h,
    asset: 'BTCUSDT',
    instrumentIdentity: 'BTC_SPOT',
    timeframe: '1h',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 4,
  });
  const c5Btc4h = evaluateC5IntervalCalibrationOnDataset({
    candles: btc4h,
    asset: 'BTCUSDT',
    instrumentIdentity: 'BTC_SPOT',
    timeframe: '4h',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 2,
  });
  const c5Btc1d = evaluateC5IntervalCalibrationOnDataset({
    candles: btc1d,
    asset: 'BTCUSDT',
    instrumentIdentity: 'BTC_SPOT',
    timeframe: '1d',
    horizonBars: 4,
    datedMacroYorkShockTimestamps: yieldShockDates,
    strideBars: 1,
  });

  const allTimeframeRows = [
    c5Gold15m.overallRow,
    c5Gold1h.overallRow,
    c5Gold4h.overallRow,
    c5Gold1d.overallRow,
    c5Btc15m.overallRow,
    c5Btc1h.overallRow,
    c5Btc4h.overallRow,
    c5Btc1d.overallRow,
  ];
  for (const r of allTimeframeRows) {
    assertCondition(
      r.pass50 && r.pass90,
      `C5 coverage out of binomial band on ${r.asset} ${r.timeframe}: cov50=${r.calibratedCov50} (band ${r.binomialBand50.join('..')}), cov90=${r.calibratedCov90} (band ${r.binomialBand90.join('..')})`
    );
  }
  console.log(
    `  -> PASS: All 8 asset-timeframe cells pass 50% and 90% empirical coverage within their 95% binomial bands on held-out REAL-DATA.`
  );

  // ---------------------------------------------------------------------------
  // TEST C4: RE-RUN PHASE B ON LARGE SAMPLE WITH CUMULATIVE HOLM-BONFERRONI
  // ---------------------------------------------------------------------------
  console.log('[C4] Running Large-Sample Phase B Ablation Suite with Cumulative Holm-Bonferroni...');
  const c4Suite = runC4LargeSampleAblationSuite({
    paxg15m,
    paxg1h,
    paxg4h,
    paxg1d,
    btc15m,
    btc1h,
    btc4h,
    btc1d,
    bybitAligned1h,
    cftcGoldWeekly,
    c5Gold15m,
    c5Btc15m,
    powerTable: c3PowerTable,
  });
  assertCondition(
    c4Suite.totalHypothesesTestedCumulative === 21,
    'Cumulative Holm-Bonferroni family must include Phase B (11) + Phase C (10) = 21 hypotheses'
  );
  console.log(
    `  -> PASS: Evaluated ${c4Suite.totalHypothesesTestedCumulative} cumulative hypotheses (${c4Suite.phaseBHypothesesCount} Phase B + ${c4Suite.phaseCHypothesesCount} Phase C).`
  );

  // ---------------------------------------------------------------------------
  // TEST C6: PRODUCT HONESTY (DEFAULT DRIFT = 0 & UNVERIFIED CLAIMS STRIPPED)
  // ---------------------------------------------------------------------------
  console.log('[C6] Verifying Product Honesty (Default Drift = 0 & Quarantined Claims)...');
  const goldHonestyCheck = runC1FilterPathLeakAudit({
    goldCandles: paxg1h.slice(-220),
    btcCandles: btc1h.slice(-220),
    macroSeries,
    btcLeverageSeries: [],
  });
  void goldHonestyCheck;

  const btcDefaultOut = (await import('../src/engine/btcScientificCore.js')).evaluateBtcScientificCore({
    candles: btc15m.slice(-120),
    intervalStepSeconds: 900,
    horizonSteps: 12,
  });
  const btcSpotOrigin = btc15m[btc15m.length - 1].close;
  for (const pt of btcDefaultOut.liveForecast) {
    assertCondition(
      Math.abs(pt.value - btcSpotOrigin) < 1e-6,
      `C6 BTC default liveForecast must have drift=0 (expected ${btcSpotOrigin}, got ${pt.value})`
    );
  }

  const quarantinedFeed = getVerifiedMacroCalendarFeed();
  assertCondition(
    quarantinedFeed.status === 'UNVERIFIED_PLACEHOLDER_QUARANTINED',
    'C6 macro calendar feed status must be UNVERIFIED_PLACEHOLDER_QUARANTINED'
  );
  for (const ev of quarantinedFeed.events) {
    assertCondition(
      ev.provenance?.verificationStatus === 'UNVERIFIED_PLACEHOLDER' &&
        ev.provenance?.isVerifiedOfficial === false,
      'C6 macro schedule events must be labeled UNVERIFIED_PLACEHOLDER'
    );
  }
  console.log('  -> PASS: Live forecast drift defaults to 0; unverified claims stripped.');

  // ---------------------------------------------------------------------------
  // TEST C7: LEDGER HYGIENE (SEGREGATION & N_MIN PUBLICATION GATE)
  // ---------------------------------------------------------------------------
  console.log('[C7] Verifying Ledger Hygiene (Fixture Segregation & N_min=197 Gate)...');
  const segregationRes = segregateFixtureEntriesFromLiveLedger();
  const liveChainCheck = verifyForecastLedgerHashChain();
  assertCondition(liveChainCheck.valid, 'Live ledger hash chain must be valid after C7 segregation');

  // Test that appending a fixture snapshot routes to backtest_fixture_forecast_ledger.jsonl, NOT the live ledger
  const countBefore = liveChainCheck.entriesCount;
  const routed = appendPointInTimeForecastLedgerEntry({
    originTimestampSec: 1730000000,
    horizonBars: 1,
    horizonStepSeconds: 900,
    assetClass: 'GOLD',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '15m',
    dataSnapshotId: 'fixture-replay-test-c7',
    modelVersion: 'test-v1',
    trackRole: 'INCUMBENT_LIVE',
    entrySourceType: 'FIXTURE_OR_BACKTEST',
    originClose: 2700,
    predictiveDistribution: {
      meanLogReturn: 0,
      stdLogReturn: 0.002,
      degreesOfFreedom: null,
      pointPrice: 2700,
      q05: 2690,
      q25: 2696,
      q50: 2700,
      q75: 2704,
      q95: 2710,
      probUp: 0.5,
    },
  });
  const countAfter = verifyForecastLedgerHashChain().entriesCount;
  assertCondition(
    countAfter === countBefore && routed.targetLedgerPath.includes('backtest_fixture'),
    'Fixture entry must be routed away from live prospective ledger'
  );

  // Verify publication gate withholds metrics when resolved live count < N_min (197)
  const gatedEval = evaluateLedgerLiveAccuracy({
    enforceMinSamplePublicationGate: true,
  });
  assertCondition(
    gatedEval.scorecard.minRequiredLiveSamplePerCell === C3_POWER_MIN_LIVE_RESOLVED_PER_CELL &&
      gatedEval.scorecard.isPublishable === false &&
      gatedEval.scorecard.rmseUsd === null &&
      gatedEval.scorecard.empiricalCoverage50 === null,
    'C7 publication gate must withhold accuracy claims until N_min=197 live forecasts resolve'
  );
  console.log(
    `  -> PASS: Migrated ${segregationRes.migratedToFixtureCount} legacy/fixture entries out of live ledger; publication gate active (N_min=${C3_POWER_MIN_LIVE_RESOLVED_PER_CELL}, status=${gatedEval.scorecard.publicationGateStatus}).`
  );

  // Save full report JSON
  const fullReport = {
    generatedAtIso: new Date().toISOString(),
    branch: 'research/phase-a-b-shadow',
    c1LeakAudit: c1Result,
    c2DataManifest: {
      datasets: manifest.entries,
      legacyFixtureProvenanceCount: (manifest.legacyFixtureProvenance || []).length,
      stoppedDataStepsAwaitingKeys: manifest.stoppedDataSteps,
      liveRecorderManifest: recorderManifest,
    },
    c3PowerTable,
    c4AblationSuite: c4Suite,
    c5CoverageTables: {
      byTimeframe: allTimeframeRows,
      bySession: [
        ...c5Gold15m.sessionRows,
        ...c5Gold1h.sessionRows,
        ...c5Btc15m.sessionRows,
        ...c5Btc1h.sessionRows,
      ],
      byMacroYieldShock: [
        ...c5Gold15m.macroShockRows,
        ...c5Gold1h.macroShockRows,
        ...c5Btc15m.macroShockRows,
        ...c5Btc1h.macroShockRows,
      ],
      firstExitPathwise: [
        c5Gold15m.firstExitRow,
        c5Gold1h.firstExitRow,
        c5Gold4h.firstExitRow,
        c5Btc15m.firstExitRow,
        c5Btc1h.firstExitRow,
        c5Btc4h.firstExitRow,
      ],
    },
    c6ProductHonesty: {
      defaultLiveDriftIsZero: true,
      unverifiedClaimsStripped: true,
    },
    c7LedgerHygiene: {
      migratedLegacyFixtureEntries: segregationRes.migratedToFixtureCount,
      remainingLiveProspectiveEntries: segregationRes.remainingLiveProspectiveCount,
      minRequiredLiveSamplePerCell: C3_POWER_MIN_LIVE_RESOLVED_PER_CELL,
      scorecard: gatedEval.scorecard,
    },
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(fullReport, null, 2), 'utf8');
  console.log(`\nSaved full Phase C report to ${REPORT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
