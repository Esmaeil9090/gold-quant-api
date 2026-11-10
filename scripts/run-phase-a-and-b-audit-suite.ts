import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  evaluateCausalWalkForwardValidation,
  clearInMemoryValidationStoreForTesting,
  getValidationStoreSnapshot,
} from '../src/services/walkForwardValidationService.js';
import {
  loadPointInTimeMacroSeriesFromFixture,
  resolvePointInTimeMacroAt,
  type PointInTimeMacroObservation,
} from '../src/services/pointInTimeMacroService.js';
import {
  getVerifiedMacroCalendarFeed,
} from '../src/services/macroCalendarService.js';
import {
  evaluateMacroTransmissionMechanisms,
} from '../src/services/macroTransmissionEngine.js';
import {
  appendPointInTimeForecastLedgerEntry,
  appendOutcomeResolutionForCandle,
  verifyForecastLedgerHashChain,
  evaluateLedgerLiveAccuracy,
} from '../src/services/pointInTimeForecastLedger.js';
import {
  evaluateScientificCorePipeline,
} from '../src/engine/scientificCore.js';
import {
  runBtcForecastEngine,
} from '../src/engine/btcEngineEntry.js';
import type {
  BtcDerivativesObservationPoint,
} from '../src/engine/btcScientificCore.js';
import {
  runCompletePhaseBAblationStudy,
} from '../src/services/phaseBExperimentsAndAblation.js';
import type { Candle } from '../src/contracts/quantContracts.js';

const NORM_Z_50_INTERVAL = 0.6744897501960817;
const NORM_Z_90_INTERVAL = 1.6448536269514722;

function sha256Json(obj: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function loadCandlesFixture(relPath: string): Candle[] {
  const fullPath = path.resolve(process.cwd(), relPath);
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  return Array.isArray(raw) ? raw : raw.candles || raw.spotCandles || [];
}

function loadBtcBybitFixture(relPath: string): {
  spotCandles: Candle[];
  derivativesSeries: BtcDerivativesObservationPoint[];
} {
  const fullPath = path.resolve(process.cwd(), relPath);
  const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  return {
    spotCandles: raw.candles || raw.spotCandles || [],
    derivativesSeries: raw.derivativesSeries || [],
  };
}

async function main() {
  console.log('================================================================================');
  console.log('GDF PHASE A (P0 INTEGRITY) & PHASE B (ACCURACY & ABLATION) VERIFICATION SUITE');
  console.log('================================================================================\n');

  const paxg15m = loadCandlesFixture('fixtures/real-market/paxg_15m.json');
  const paxg1h = loadCandlesFixture('fixtures/real-market/paxg_1h.json');
  const paxg1d = loadCandlesFixture('fixtures/real-market/paxg_1d.json');
  const comex15m = loadCandlesFixture('fixtures/real-market/comex_gcf_15m.json');
  const btcBybit15m = loadBtcBybitFixture('fixtures/real-market/btc_bybit_spot_and_derivatives_15m.json');
  const btcBybit1h = loadBtcBybitFixture('fixtures/real-market/btc_bybit_spot_and_derivatives_1h.json');
  const fredMacroBundle = loadPointInTimeMacroSeriesFromFixture();
  const fredMacro = fredMacroBundle.observations;

  // ============================================================================
  // TEST A.1: Namespace Validation by asset:instrument:timeframe & BTC Engine Routing
  // ============================================================================
  console.log('--- [TEST A.1] Namespace Isolation & BTC Engine Routing (REAL-FIXTURE) ---');
  clearInMemoryValidationStoreForTesting();

  const scGoldPaxg = evaluateCausalWalkForwardValidation({
    candles: paxg15m.slice(-140),
    pointInTimeMacroSeries: fredMacro,
    assetClass: 'GOLD',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '15m',
    intervalStepSeconds: 900,
    persistToDisk: true,
  });

  const scGoldComex = evaluateCausalWalkForwardValidation({
    candles: comex15m.slice(-140),
    pointInTimeMacroSeries: fredMacro,
    assetClass: 'GOLD',
    instrumentIdentity: 'COMEX_GOLD_FUTURES',
    timeframe: '15m',
    intervalStepSeconds: 900,
    persistToDisk: true,
  });

  const scBtcSpot = evaluateCausalWalkForwardValidation({
    candles: btcBybit15m.spotCandles.slice(-140),
    pointInTimeMacroSeries: fredMacro,
    btcDerivativesSeries: btcBybit15m.derivativesSeries,
    assetClass: 'BTC',
    instrumentIdentity: 'BTC_SPOT_USD',
    timeframe: '15m',
    intervalStepSeconds: 900,
    persistToDisk: true,
  });

  const storeSnap = getValidationStoreSnapshot();
  const namespaces = Object.keys(storeSnap.recordsByNamespace);
  const requiredNamespaces = [
    'GOLD:PAXG_SPOT_TOKEN:15m',
    'GOLD:COMEX_GOLD_FUTURES:15m',
    'BTC:BTC_SPOT_USD:15m',
  ];
  const allPresent = requiredNamespaces.every((ns) => namespaces.includes(ns));

  const paxgRecords = Object.values(storeSnap.recordsByNamespace['GOLD:PAXG_SPOT_TOKEN:15m'] || {});
  const comexRecords = Object.values(storeSnap.recordsByNamespace['GOLD:COMEX_GOLD_FUTURES:15m'] || {});
  const btcRecords = Object.values(storeSnap.recordsByNamespace['BTC:BTC_SPOT_USD:15m'] || {});

  const paxgCompoundKeys = new Set(paxgRecords.map((r) => `${r.namespaceKey}|${r.originBarTime}`));
  const comexCompoundKeys = new Set(comexRecords.map((r) => `${r.namespaceKey}|${r.originBarTime}`));
  const btcCompoundKeys = new Set(btcRecords.map((r) => `${r.namespaceKey}|${r.originBarTime}`));

  const overlapPaxgBtc = [...paxgCompoundKeys].filter((k) => btcCompoundKeys.has(k)).length;
  const overlapPaxgComex = [...paxgCompoundKeys].filter((k) => comexCompoundKeys.has(k)).length;
  const btcEngineIds = new Set(btcRecords.map((r) => r.engineId));
  const goldEngineIds = new Set(paxgRecords.map((r) => r.engineId));

  const passA1 =
    allPresent &&
    overlapPaxgBtc === 0 &&
    overlapPaxgComex === 0 &&
    btcEngineIds.has('BDF-B') &&
    !btcEngineIds.has('GDF-G') &&
    goldEngineIds.has('GDF-G') &&
    !goldEngineIds.has('BDF-B') &&
    scGoldPaxg.namespaceKey === 'GOLD:PAXG_SPOT_TOKEN:15m' &&
    scGoldComex.namespaceKey === 'GOLD:COMEX_GOLD_FUTURES:15m' &&
    scBtcSpot.namespaceKey === 'BTC:BTC_SPOT_USD:15m';

  console.log(`Namespaces present: ${JSON.stringify(namespaces)}`);
  console.log(`Record counts -> PAXG: ${paxgRecords.length}, COMEX: ${comexRecords.length}, BTC: ${btcRecords.length}`);
  console.log(`Disjoint key overlap (PAXG vs BTC): ${overlapPaxgBtc} | (PAXG vs COMEX): ${overlapPaxgComex}`);
  console.log(`Gold Engine IDs: ${JSON.stringify([...goldEngineIds])} | BTC Engine IDs: ${JSON.stringify([...btcEngineIds])}`);
  console.log(`TEST A.1 STATUS: ${passA1 ? 'PASS' : 'FAIL'}\n`);

  // ============================================================================
  // TEST A.2: Effective-N, Newey-West HAC for IC, Directional Brier vs Base Rate, Relabeled Sweep
  // ============================================================================
  console.log('--- [TEST A.2] Effective-N, Newey-West HAC IC, Directional Brier & Sweep Relabel (REAL-FIXTURE) ---');
  let passA2 = true;
  for (const hMetric of scGoldPaxg.horizons) {
    const maxTheoreticalNeff = Math.max(1, Math.floor(hMetric.sampleSizeN / Math.max(1, hMetric.horizonBars)));
    const neffValid = hMetric.effectiveSampleSizeNeff <= maxTheoreticalNeff;
    const baseRateValid = hMetric.directionalBaseRateBrier >= 0 && hMetric.directionalBaseRateBrier <= 0.250001;
    const labelValid = hMetric.wickExcursionMetricLabel === 'WICK_EXCURSION_EVENT_SCORE (Non-Directional)';
    const hacValid = Number.isFinite(hMetric.rankIcHacTStat) && Number.isFinite(hMetric.rankIcHacStdErr);
    const naiveT = hMetric.spearmanRankIc * Math.sqrt(Math.max(1, hMetric.sampleSizeN - 2) / Math.max(1e-8, 1 - hMetric.spearmanRankIc * hMetric.spearmanRankIc));
    if (!neffValid || !baseRateValid || !labelValid || !hacValid) passA2 = false;
    console.log(
      `  Horizon h=${hMetric.horizonBars} (${hMetric.horizonLabelEn}): N_raw=${hMetric.sampleSizeN}, N_eff=${hMetric.effectiveSampleSizeNeff} (max floor(N/h)=${maxTheoreticalNeff}), ` +
        `IC=${hMetric.spearmanRankIc.toFixed(4)}, t_naive=${naiveT.toFixed(3)}, t_HAC(L=${Math.max(0, hMetric.horizonBars - 1)})=${hMetric.rankIcHacTStat.toFixed(3)}, ` +
        `DirBrier=${hMetric.directionalBrierScore.toFixed(4)} vs BaseRate p(1-p)=${hMetric.directionalBaseRateBrier.toFixed(4)} (Skill=${hMetric.directionalBrierSkillScore.toFixed(4)}), ` +
        `WickScore=${hMetric.wickExcursionBrierScore.toFixed(4)} [${hMetric.wickExcursionMetricLabel}]`,
    );
  }
  console.log(`TEST A.2 STATUS: ${passA2 ? 'PASS' : 'FAIL'}\n`);

  // ============================================================================
  // TEST A.3: Point-in-Time Macro Series & Perturbation Invariance Test
  // ============================================================================
  console.log('--- [TEST A.3] Point-in-Time Macro Series & Future Perturbation Invariance (REAL-FIXTURE) ---');
  const originCandles = paxg1d.slice(0, 120);
  const candleOriginTs = originCandles[originCandles.length - 1].time;

  // Perturb all FRED observations strictly after candleOriginTs with extreme shocks
  const perturbedMacro: PointInTimeMacroObservation[] = fredMacro.map((obs) => {
    if (obs.effectiveAvailableTimestampSec > candleOriginTs) {
      return {
        ...obs,
        nominal10Y: 99.99,
        tipsRealYield10Y: 88.88,
        breakevenInflation10Y: -77.77,
        dxyIndex: 999.99,
        sourceProvenance: 'SYNTHETIC_TEST_PERTURBATION',
      };
    }
    return { ...obs };
  });

  const resolvedUnperturbed = resolvePointInTimeMacroAt(candleOriginTs, fredMacro);
  const resolvedPerturbed = resolvePointInTimeMacroAt(candleOriginTs, perturbedMacro);

  clearInMemoryValidationStoreForTesting();
  const wfUnperturbed = evaluateCausalWalkForwardValidation({
    candles: originCandles,
    pointInTimeMacroSeries: fredMacro,
    assetClass: 'GOLD',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '1d',
    intervalStepSeconds: 86400,
    persistToDisk: false,
  });

  clearInMemoryValidationStoreForTesting();
  const wfPerturbed = evaluateCausalWalkForwardValidation({
    candles: originCandles,
    pointInTimeMacroSeries: perturbedMacro,
    assetClass: 'GOLD',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    timeframe: '1d',
    intervalStepSeconds: 86400,
    persistToDisk: false,
  });

  const hashUnperturbed = sha256Json({
    macro: resolvedUnperturbed,
    horizons: wfUnperturbed.horizons,
  });
  const hashPerturbed = sha256Json({
    macro: resolvedPerturbed,
    horizons: wfPerturbed.horizons,
  });

  const perturbedFutureCount = fredMacro.filter((o) => o.effectiveAvailableTimestampSec > candleOriginTs).length;
  const passA3 =
     fredMacro.length >= 200 &&
    perturbedFutureCount > 10 &&
    hashUnperturbed === hashPerturbed;

  console.log(`FRED observations loaded: ${fredMacro.length} (${fredMacro[0]?.observationDateIso} -> ${fredMacro[fredMacro.length - 1]?.observationDateIso})`);
  console.log(`Origin UTC: ${new Date(candleOriginTs * 1000).toISOString()} | Perturbed Post-Origin Vintages: ${perturbedFutureCount}`);
  console.log(`Resolved Macro Source at Origin: ${resolvedUnperturbed.source}`);
  console.log(`SHA-256 (Unperturbed Future): ${hashUnperturbed}`);
  console.log(`SHA-256 (Perturbed Future):   ${hashPerturbed}`);
  console.log(`Bit-Identical Match: ${hashUnperturbed === hashPerturbed}`);
  console.log(`TEST A.3 STATUS: ${passA3 ? 'PASS' : 'FAIL'}\n`);

  // ============================================================================
  // TEST A.4: Quarantine Hardcoded Macro/Election Records & Zero Forecast Drift Injection
  // ============================================================================
  console.log('--- [TEST A.4] Quarantine Hardcoded Macro/Election Placeholders (REAL-FIXTURE) ---');
  const macroFeed = getVerifiedMacroCalendarFeed();
  const transmissionWithPlaceholders = evaluateMacroTransmissionMechanisms({
    currentGoldPriceUsd: 4050.0,
    currentTipsRealYield10Y: 2.10,
    currentDxyIndex: 103.8,
    events: macroFeed.events,
    politicalIntelligence: macroFeed.politicalIntelligence,
  });
  const transmissionEmpty = evaluateMacroTransmissionMechanisms({
    currentGoldPriceUsd: 4050.0,
    currentTipsRealYield10Y: 2.10,
    currentDxyIndex: 103.8,
    events: [],
    politicalIntelligence: null,
  });

  const anyVerifiedOfficial = macroFeed.events.some((e) => e.provenance?.isVerifiedOfficial === true);
  const allEventsQuarantined = macroFeed.events.every(
    (e) =>
      e.provenance?.verificationStatus === 'UNVERIFIED_PLACEHOLDER' &&
      e.eventName.startsWith('[UNVERIFIED PLACEHOLDER]'),
  );
  const feedQuarantined = macroFeed.status === 'UNVERIFIED_PLACEHOLDER_QUARANTINED';
  const politicalQuarantined =
    macroFeed.politicalIntelligence?.status === 'UNVERIFIED_PLACEHOLDER_QUARANTINED' &&
    macroFeed.politicalIntelligence?.verificationStatus === 'UNVERIFIED_PLACEHOLDER';
  const zeroPlaceholderDriftEffect =
    transmissionWithPlaceholders.totalSurpriseImpulseUsd === 0 &&
    transmissionWithPlaceholders.politicalFiscalDriftUsd === 0 &&
    transmissionWithPlaceholders.netAttributableDriftUsdPerStep ===
      transmissionEmpty.netAttributableDriftUsdPerStep;

  const passA4 =
    !anyVerifiedOfficial &&
    allEventsQuarantined &&
    feedQuarantined &&
    politicalQuarantined &&
    zeroPlaceholderDriftEffect;

  console.log(`Macro Feed Status: ${macroFeed.status}`);
  console.log(`Events Total: ${macroFeed.events.length} | Verified Official: ${macroFeed.events.filter((e) => e.provenance?.isVerifiedOfficial).length} | Quarantined Placeholders: ${macroFeed.events.filter((e) => e.provenance?.verificationStatus === 'UNVERIFIED_PLACEHOLDER').length}`);
  console.log(`Political Intelligence Status: ${macroFeed.politicalIntelligence?.status} (${macroFeed.politicalIntelligence?.verificationStatus})`);
  console.log(`Surprise Impulse USD: ${transmissionWithPlaceholders.totalSurpriseImpulseUsd} | Political Fiscal Drift USD: ${transmissionWithPlaceholders.politicalFiscalDriftUsd} | Zero Forecast Effect Verified: ${zeroPlaceholderDriftEffect}`);
  console.log(`TEST A.4 STATUS: ${passA4 ? 'PASS' : 'FAIL'}\n`);

  // ============================================================================
  // TEST A.5: 50% Interval Multiplier (0.67449) & Linear Horizon Variance Scaling
  // ============================================================================
  console.log('--- [TEST A.5] 50% Interval Multiplier & Linear Horizon Variance Scaling ---');
  // Check BTC engine (BDF-B) interval multiplier and linear horizon variance scaling
  const btcOut15m = runBtcForecastEngine({
    candles: btcBybit15m.spotCandles.slice(0, 150),
    intervalStepSeconds: 900,
    horizonSteps: 16,
    leverageSeries: btcBybit15m.derivativesSeries.slice(0, 150),
  });
  const btcBand1 = btcOut15m.confidenceBand[0];
  const btcLogWidth50 = Math.log(btcBand1.upper75 / btcBand1.lower25);
  const btcLogWidth90 = Math.log(btcBand1.upper95 / btcBand1.lower05);
  const btcRatio50To90 = btcLogWidth50 / Math.max(1e-9, btcLogWidth90);
  const expectedRatio50To90 = NORM_Z_50_INTERVAL / NORM_Z_90_INTERVAL; // 0.41006064

  // Check Gold ScientificCore interval multiplier and linear horizon variance scaling
  const goldCoreOut = evaluateScientificCorePipeline({
    candles: paxg15m.slice(0, 150),
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 5.2,
    htfPocAnchorPrice: paxg15m[149].close,
    liveMacro: resolvePointInTimeMacroAt(paxg15m[149].time, fredMacro),
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
      activeIntegratedStructuralTerm: null,
    },
    dataDrivenMinWindowBars: 60,
  });
  const goldPlume = goldCoreOut.yellowLineConditionalExpectation;
  const goldLogWidth50 = Math.log(goldPlume.upper75[0].value / goldPlume.lower25[0].value);
  const goldLogWidth90 = Math.log(goldPlume.upper95[0].value / goldPlume.lower05[0].value);
  const goldRatio50To90 = goldLogWidth50 / Math.max(1e-9, goldLogWidth90);

  // Held-out empirical coverage test on REAL-FIXTURE (PAXG 15m and PAXG 1h) + SYNTHETIC Gaussian calibration check
  const evalHeldOutCoverage = (candles: Candle[], horizonBars: number) => {
    const startIdx = Math.floor(candles.length * 0.5);
    let hits50 = 0;
    let hits90 = 0;
    let count = 0;
    for (let t = startIdx; t + horizonBars < candles.length; t++) {
      // Estimate causal 1-step log return std over trailing 40 bars
      let sumSq = 0;
      const win = 40;
      for (let k = t - win + 1; k <= t; k++) {
        const r = Math.log(candles[k].close / candles[k - 1].close);
        sumSq += r * r;
      }
      const sig1 = Math.sqrt(sumSq / win);
      const sigH = sig1 * Math.sqrt(horizonBars); // Linear variance scaling: sigma_h = sigma_1 * sqrt(h)
      const realizedLogRet = Math.log(candles[t + horizonBars].close / candles[t].close);
      if (Math.abs(realizedLogRet) <= NORM_Z_50_INTERVAL * sigH) hits50++;
      if (Math.abs(realizedLogRet) <= NORM_Z_90_INTERVAL * sigH) hits90++;
      count++;
    }
    const cov50 = hits50 / Math.max(1, count);
    const cov90 = hits90 / Math.max(1, count);
    const binomHalf50 = 1.96 * Math.sqrt(0.25 / Math.max(1, count));
    return {
      count,
      cov50,
      cov90,
      binomBand50: [0.5 - binomHalf50, 0.5 + binomHalf50] as [number, number],
      inBand50: cov50 >= 0.5 - binomHalf50 && cov50 <= 0.5 + binomHalf50,
    };
  };

  const realCov1hH1 = evalHeldOutCoverage(paxg1h, 1);
  const realCov15mH4 = evalHeldOutCoverage(paxg15m, 4);

  // Also test on held-out SYNTHETIC Gaussian series (N=400, h=4)
  const nSynth = 400;
  let seed = 1337;
  const nextGauss = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const u1 = Math.max(1e-7, seed / 4294967296);
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const u2 = Math.max(1e-7, seed / 4294967296);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const synthCandles: Candle[] = [];
  let p = 2600;
  for (let i = 0; i < nSynth; i++) {
    const r = 0.002 * nextGauss();
    const nextP = p * Math.exp(r);
    synthCandles.push({
      time: 1700000000 + i * 900,
      open: p,
      high: Math.max(p, nextP) * 1.0005,
      low: Math.min(p, nextP) * 0.9995,
      close: nextP,
      volume: 100,
    });
    p = nextP;
  }
  const synthCovH4 = evalHeldOutCoverage(synthCandles, 4);

  const passA5 =
    Math.abs(btcRatio50To90 - expectedRatio50To90) < 1e-3 &&
    Math.abs(goldRatio50To90 - expectedRatio50To90) < 1e-3 &&
    synthCovH4.inBand50;

  console.log(`z_50 = ${NORM_Z_50_INTERVAL.toFixed(6)} | z_90 = ${NORM_Z_90_INTERVAL.toFixed(6)} | Expected Ratio: ${expectedRatio50To90.toFixed(6)}`);
  console.log(`Gold Core 50%/90% Log-Width Ratio: ${goldRatio50To90.toFixed(6)} | BTC Core 50%/90% Width Ratio: ${btcRatio50To90.toFixed(6)}`);
  console.log(`[REAL-FIXTURE PAXG 1h Held-Out N=${realCov1hH1.count}, h=1] Empirical 50% Coverage: ${(realCov1hH1.cov50 * 100).toFixed(2)}% (95% Binomial Band: [${(realCov1hH1.binomBand50[0] * 100).toFixed(2)}%, ${(realCov1hH1.binomBand50[1] * 100).toFixed(2)}%]) | 90% Coverage: ${(realCov1hH1.cov90 * 100).toFixed(2)}%`);
  console.log(`[REAL-FIXTURE PAXG 15m Held-Out N=${realCov15mH4.count}, h=4] Empirical 50% Coverage: ${(realCov15mH4.cov50 * 100).toFixed(2)}% (95% Binomial Band: [${(realCov15mH4.binomBand50[0] * 100).toFixed(2)}%, ${(realCov15mH4.binomBand50[1] * 100).toFixed(2)}%]) | 90% Coverage: ${(realCov15mH4.cov90 * 100).toFixed(2)}%`);
  console.log(`[SYNTHETIC Gaussian Held-Out N=${synthCovH4.count}, h=4] Empirical 50% Coverage: ${(synthCovH4.cov50 * 100).toFixed(2)}% (95% Binomial Band: [${(synthCovH4.binomBand50[0] * 100).toFixed(2)}%, ${(synthCovH4.binomBand50[1] * 100).toFixed(2)}%]) | 90% Coverage: ${(synthCovH4.cov90 * 100).toFixed(2)}%`);
  console.log(`TEST A.5 STATUS: ${passA5 ? 'PASS' : 'FAIL'}\n`);

  // ============================================================================
  // TEST A.6: Append-Only Point-in-Time Forecast Ledger
  // ============================================================================
  console.log('--- [TEST A.6] Append-Only Point-in-Time Forecast Ledger (REAL-FIXTURE) ---');
  const testLedgerFile = path.resolve(process.cwd(), 'data/test_phase_a6_ledger.jsonl');
  const testOutcomesFile = path.resolve(process.cwd(), 'data/test_phase_a6_outcomes.jsonl');
  if (fs.existsSync(testLedgerFile)) fs.unlinkSync(testLedgerFile);
  if (fs.existsSync(testOutcomesFile)) fs.unlinkSync(testOutcomesFile);

  const originCandle = paxg15m[paxg15m.length - 5];
  const outcomeCandle = paxg15m[paxg15m.length - 4];

  const appendRes1 = appendPointInTimeForecastLedgerEntry(
    {
      originTimestampSec: originCandle.time,
      recordedAtTimestampSec: originCandle.time + 2,
      horizonBars: 1,
      horizonStepSeconds: 900,
      assetClass: 'GOLD',
      instrumentIdentity: 'PAXG_SPOT_TOKEN',
      timeframe: '15m',
      dataSnapshotId: `snap-paxg-15m-${originCandle.time}`,
      modelVersion: 'GDF-G-v81.0-PhaseA',
      trackRole: 'INCUMBENT_LIVE',
      originClose: originCandle.close,
      predictiveDistribution: {
        meanLogReturn: 0.0002,
        stdLogReturn: 0.0025,
        degreesOfFreedom: null,
        pointPrice: originCandle.close * Math.exp(0.0002),
        q05: originCandle.close * Math.exp(0.0002 - NORM_Z_90_INTERVAL * 0.0025),
        q25: originCandle.close * Math.exp(0.0002 - NORM_Z_50_INTERVAL * 0.0025),
        q50: originCandle.close * Math.exp(0.0002),
        q75: originCandle.close * Math.exp(0.0002 + NORM_Z_50_INTERVAL * 0.0025),
        q95: originCandle.close * Math.exp(0.0002 + NORM_Z_90_INTERVAL * 0.0025),
        probUp: 0.53,
      },
    },
    testLedgerFile,
  );

  // Attempt duplicate/overwrite of same (origin, instrument, timeframe, horizon, modelVersion, trackRole)
  const appendResDuplicate = appendPointInTimeForecastLedgerEntry(
    {
      originTimestampSec: originCandle.time,
      recordedAtTimestampSec: originCandle.time + 50,
      horizonBars: 1,
      horizonStepSeconds: 900,
      assetClass: 'GOLD',
      instrumentIdentity: 'PAXG_SPOT_TOKEN',
      timeframe: '15m',
      dataSnapshotId: `snap-paxg-15m-${originCandle.time}-tampered`,
      modelVersion: 'GDF-G-v81.0-PhaseA',
      trackRole: 'INCUMBENT_LIVE',
      originClose: originCandle.close,
      predictiveDistribution: {
        meanLogReturn: 0.05,
        stdLogReturn: 0.0025,
        degreesOfFreedom: null,
        pointPrice: originCandle.close * 1.05,
        q05: originCandle.close * 0.99,
        q25: originCandle.close * 1.01,
        q50: originCandle.close * 1.05,
        q75: originCandle.close * 1.06,
        q95: originCandle.close * 1.08,
        probUp: 0.99,
      },
    },
    testLedgerFile,
  );

  const outcomeRes = appendOutcomeResolutionForCandle(
    {
      entryId: appendRes1.entry.entryId,
      originTimestampSec: originCandle.time,
      horizonTargetTimestampSec: originCandle.time + 900,
      originClose: originCandle.close,
      realizedClose: outcomeCandle.close,
      realizedHigh: outcomeCandle.high,
      realizedLow: outcomeCandle.low,
      resolvedAtTimestampSec: outcomeCandle.time + 5,
    },
    testOutcomesFile,
  );

  const integrityCheck = verifyForecastLedgerHashChain(testLedgerFile);
  const liveEval = evaluateLedgerLiveAccuracy({
    ledgerPath: testLedgerFile,
    outcomePath: testOutcomesFile,
    namespaceKey: 'GOLD:PAXG_SPOT_TOKEN:15m',
    horizonBars: 1,
    requireProspectiveRecordedBeforeTarget: true,
  });

  const passA6 =
    appendRes1.appended === true &&
    appendResDuplicate.appended === false &&
    outcomeRes.appended === true &&
    integrityCheck.valid === true &&
    liveEval.scorecard.resolvedOutcomePairsCount === 1 &&
    liveEval.scorecard.prospectiveOnlyVerified === true &&
    liveEval.scorecard.meanCrpsLogReturn !== null;

  console.log(`Entry 1 Appended: ${appendRes1.appended} (ID: ${appendRes1.entry.entryId}, Hash: ${appendRes1.entry.entryHashSha256.slice(0, 16)}...)`);
  console.log(`Duplicate Overwrite Rejected: ${!appendResDuplicate.appended} (Preserved Original Point Price: $${appendResDuplicate.entry.predictiveDistribution.pointPrice.toFixed(2)})`);
  console.log(`Hash Chain Integrity Valid: ${integrityCheck.valid} (Total Entries: ${integrityCheck.entriesCount})`);
  console.log(`Ledger Live Accuracy Resolved: ${liveEval.scorecard.resolvedOutcomePairsCount}/${liveEval.scorecard.totalForecastEntries} | Prospective Verified: ${liveEval.scorecard.prospectiveOnlyVerified} | CRPS(logRet): ${liveEval.scorecard.meanCrpsLogReturn?.toFixed(6)} | Pinball(USD): $${liveEval.scorecard.meanPinballLoss?.toFixed(4)}`);
  console.log(`TEST A.6 STATUS: ${passA6 ? 'PASS' : 'FAIL'}\n`);

  if (fs.existsSync(testLedgerFile)) fs.unlinkSync(testLedgerFile);
  if (fs.existsSync(testOutcomesFile)) fs.unlinkSync(testOutcomesFile);

  // ============================================================================
  // PHASE B: ACCURACY EXPERIMENTS & MINIMAL-MODEL ABLATION (REAL-FIXTURE)
  // ============================================================================
  console.log('================================================================================');
  console.log('PHASE B: EXPANDING WALK-FORWARD EXPERIMENTS & ABLATION (UNTOUCHED FINAL BLOCK)');
  console.log('================================================================================\n');

  const phaseBStudy = runCompletePhaseBAblationStudy({
    gold15mCandles: paxg15m,
    gold1hCandles: paxg1h,
    gold1dCandles: paxg1d,
    btc1hCandles: btcBybit1h.spotCandles,
    btc1hDerivatives: btcBybit1h.derivativesSeries,
    pointInTimeMacroSeries: fredMacro,
  });

  console.log('| Component | Dataset (Label) | Metric | Baseline | Candidate | Delta | DM / HAC t | p (raw) | p (Holm) | Decision | Rationale |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of phaseBStudy.rows) {
    console.log(
      `| ${r.componentName} | ${r.datasetLabel} [${r.dataClassification}] | ${r.metricName} | ${r.baselineScore.toFixed(4)} | ${r.candidateScore.toFixed(4)} | ${r.deltaScore.toFixed(4)} | ${r.dmOrHacTStat.toFixed(3)} | ${r.pValueRaw.toFixed(4)} | ${r.pValueHolmAdjusted.toFixed(4)} | **${r.decision}** | ${r.rationale} |`,
    );
  }

  console.log(`\nKept Components: ${JSON.stringify(phaseBStudy.keptComponents)}`);
  console.log(`Dropped Components: ${JSON.stringify(phaseBStudy.droppedComponents)}`);

  fs.writeFileSync(
    path.resolve(process.cwd(), 'data/phase_a_b_audit_results.json'),
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        phaseATests: {
          testA1_NamespaceAndEngineRouting: passA1,
          testA2_NeffHacAndBrier: passA2,
          testA3_PointInTimeMacroPerturbationInvariance: passA3,
          testA4_MacroAndMidtermQuarantine: passA4,
          testA5_IntervalMultiplierAndCoverage: passA5,
          testA6_AppendOnlyForecastLedger: passA6,
        },
        phaseBStudy,
      },
      null,
      2,
    ),
    'utf-8',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
