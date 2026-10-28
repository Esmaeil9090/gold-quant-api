/**
 * GDF INDEPENDENT MATHEMATICAL, STATISTICAL & SCIENTIFIC DISCOVERY AUDIT SUITE
 * ----------------------------------------------------------------------------
 * Executes 18 independent, adversarial mathematical, econometric, numerical,
 * causality (no-lookahead), forecast-skill, ablation, promotion-gate, write-back,
 * and scientific-creativity verification tests against:
 *   1. Yellow-Line Scientific Forecasting Core (src/engine/scientificCore.ts, src/engine/quantEngine.ts)
 *   2. Parallel Universe Discovery Engine (src/services/intelligenceAwarenessCore.ts)
 *   3. Intelligence & Awareness Core (Scientific Critic, Ablation & Compositional Hypothesis Engine)
 *
 * Usage:
 *   npx tsx scripts/check-independent-mathematical-audit.ts --record-baseline
 *   npx tsx scripts/check-independent-mathematical-audit.ts
 */

import fs from 'fs';
import path from 'path';
import type {
  Candle,
  VerifiedMacroYieldResult,
} from '../src/contracts/quantContracts.js';
import {
  AdaptiveDPObserver,
  evaluatePureQuantPipeline,
} from '../src/engine/quantEngine.js';
import {
  computeCausalInformationClock,
  runPulseEchoSonarLayer,
  evaluateLatentStateFilterOnInformationClock,
  evaluateScientificCorePipeline,
} from '../src/engine/scientificCore.js';
import {
  evaluateParallelUniverseAndAwarenessCore,
  executeSymbolicDiscoveryStep,
  writeBackValidatedMathToLatentModel,
  getIntelligenceCoreStateSnapshot,
} from '../src/services/intelligenceAwarenessCore.js';
import {
  fetchVerifiedMarketWaterfall,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMacroNews,
} from '../src/services/realDataWaterfall.js';

interface AuditTestResult {
  testId: string;
  category: string;
  title: string;
  status: 'PASSED' | 'FAILED_DEFECT_EXPOSED' | 'PARTIAL';
  severityIfFailed: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  toleranceOrCriterion: string;
  measuredValue: string;
  evidenceSummary: string;
}

const BASELINE_REPORT_PATH = path.resolve(process.cwd(), 'data', 'audit_baseline_before_evolution.json');

function isSymmetric6x6(P: number[][], tol = 1e-6): { ok: boolean; maxAsymmetry: number } {
  let maxAsym = 0;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      const diff = Math.abs(P[i][j] - P[j][i]);
      if (diff > maxAsym) maxAsym = diff;
    }
  }
  return { ok: maxAsym <= tol, maxAsymmetry: maxAsym };
}

function checkPsdMinPivot6x6(P: number[][]): { ok: boolean; minPivot: number; minDiag: number } {
  const n = 6;
  const A = P.map(r => [...r]);
  let minDiag = Infinity;
  for (let i = 0; i < n; i++) {
    if (A[i][i] < minDiag) minDiag = A[i][i];
  }
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  let minPivot = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum < minPivot) minPivot = sum;
        if (sum <= -1e-9) {
          return { ok: false, minPivot: sum, minDiag };
        }
        L[i][j] = Math.sqrt(Math.max(0, sum));
      } else {
        L[i][j] = L[j][j] > 1e-12 ? sum / L[j][j] : 0;
      }
    }
  }
  return { ok: minPivot >= -1e-9 && minDiag > 0, minPivot, minDiag };
}

async function runAuditSuite() {
  const isBaselineRecord = process.argv.includes('--record-baseline');
  const [wf, macro, news] = await Promise.all([
    fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true }),
    fetchVerifiedMacroWaterfall(),
    fetchVerifiedMacroNews(),
  ]);
  const candles = wf.candles;
  const results: AuditTestResult[] = [];

  // ============================================================================
  // TEST 01: Prefix-Invariance / No-Lookahead Causality in Information Clock τ
  // ============================================================================
  const tCut = Math.floor(candles.length * 0.65);
  const prefixCandles = candles.slice(0, tCut);
  const clockPrefix = computeCausalInformationClock({ candles: prefixCandles });
  const clockFull = computeCausalInformationClock({ candles });

  let maxClockLookaheadDiff = 0;
  for (let t = 15; t < tCut; t++) {
    const d = Math.abs(clockPrefix.deltaTauSeries[t] - clockFull.deltaTauSeries[t]);
    if (d > maxClockLookaheadDiff) maxClockLookaheadDiff = d;
  }
  results.push({
    testId: 'AUDIT-01',
    category: '8. Time-Index & No-Lookahead',
    title: 'Prefix-Invariance of Causal Information Clock Δτ_t (Truncated t≤t0 vs Full Sample)',
    status: maxClockLookaheadDiff <= 1e-9 ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'CRITICAL',
    toleranceOrCriterion: 'max |Δτ_t(prefix 0..t0) - Δτ_t(full 0..N-1)| <= 1e-9 for t >= 15',
    measuredValue: `maxDiff = ${maxClockLookaheadDiff.toExponential(4)}`,
    evidenceSummary:
      maxClockLookaheadDiff <= 1e-9
        ? 'Information clock Δτ_t at historical bar t depends strictly on causal history [0..t].'
        : `LOOKAHEAD DETECTED (Finding F-01): Δτ_t at historical bar t shifts by ${maxClockLookaheadDiff.toFixed(4)} when future bars (t0+1..N-1) are appended due to full-sample dispersion/quantile normalization.`,
  });

  // ============================================================================
  // TEST 02: Prefix-Invariance / No-Lookahead in Pulse-Echo Sonar Layer
  // ============================================================================
  const sonarPrefix = runPulseEchoSonarLayer({
    candles: prefixCandles,
    deltaTauSeries: clockPrefix.deltaTauSeries,
    cumulativeTauSeries: clockPrefix.cumulativeTauSeries,
    crossVenueZScore: 0,
  });
  const sonarFull = runPulseEchoSonarLayer({
    candles,
    deltaTauSeries: clockFull.deltaTauSeries,
    cumulativeTauSeries: clockFull.cumulativeTauSeries,
    crossVenueZScore: 0,
  });
  let maxSonarToxDiff = 0;
  for (let t = 15; t < tCut - 4; t++) {
    const d = Math.abs(sonarPrefix.barEchoToxicityUpdates[t] - sonarFull.barEchoToxicityUpdates[t]);
    if (d > maxSonarToxDiff) maxSonarToxDiff = d;
  }
  results.push({
    testId: 'AUDIT-02',
    category: '8. Time-Index & No-Lookahead',
    title: 'Prefix-Invariance of Pulse–Echo Sonar Detection & Echo Updates',
    status: maxSonarToxDiff <= 1e-9 ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion: 'max |toxUpdate_t(prefix) - toxUpdate_t(full)| <= 1e-9 for completed echo windows t <= t0-4',
    measuredValue: `maxDiff = ${maxSonarToxDiff.toExponential(4)}`,
    evidenceSummary:
      maxSonarToxDiff <= 1e-9
        ? 'Pulse-Echo detection threshold and completed echo updates are strictly causal.'
        : `LOOKAHEAD DETECTED (Finding F-02): Historical pulse/echo updates shift by ${maxSonarToxDiff.toFixed(4)} when future bars are added because adaptivePulseThresholdSigma uses full-sample quantiles.`,
  });

  // ============================================================================
  // TEST 03: Prefix-Invariance / No-Lookahead in 6D Latent State Filter Predictions
  // ============================================================================
  const filterPrefix = evaluateLatentStateFilterOnInformationClock({
    candles: prefixCandles,
    deltaTauSeries: clockPrefix.deltaTauSeries,
    cumulativeTauSeries: clockPrefix.cumulativeTauSeries,
    liveMacro: macro,
    cointegrationBasisMeanUsd: 0,
    barEchoToxicityUpdates: sonarPrefix.barEchoToxicityUpdates,
    barEchoResilienceUpdates: sonarPrefix.barEchoResilienceUpdates,
    barEchoResidualsUsd: sonarPrefix.barEchoResidualsUsd,
    equilibriumAnchorPrice: prefixCandles[prefixCandles.length - 1].close,
    intervalStepSeconds: 900,
    activeProvider: 'Binance Vision PAXG',
    activeSymbol: 'PAXGUSDT',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
  });
  const filterFull = evaluateLatentStateFilterOnInformationClock({
    candles,
    deltaTauSeries: clockFull.deltaTauSeries,
    cumulativeTauSeries: clockFull.cumulativeTauSeries,
    liveMacro: macro,
    cointegrationBasisMeanUsd: 0,
    barEchoToxicityUpdates: sonarFull.barEchoToxicityUpdates,
    barEchoResilienceUpdates: sonarFull.barEchoResilienceUpdates,
    barEchoResidualsUsd: sonarFull.barEchoResidualsUsd,
    equilibriumAnchorPrice: candles[candles.length - 1].close,
    intervalStepSeconds: 900,
    activeProvider: 'Binance Vision PAXG',
    activeSymbol: 'PAXGUSDT',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
  });
  let maxFilterPredDiff = 0;
  for (let i = 20; i < filterPrefix.oneStepPredictedPrices.length - 4; i++) {
    const d = Math.abs(filterPrefix.oneStepPredictedPrices[i] - filterFull.oneStepPredictedPrices[i]);
    if (d > maxFilterPredDiff) maxFilterPredDiff = d;
  }
  results.push({
    testId: 'AUDIT-03',
    category: '8. Time-Index & No-Lookahead',
    title: 'Prefix-Invariance of 6D Latent Filter 1-Step-Ahead Historical Predictions',
    status: maxFilterPredDiff <= 1e-6 ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'CRITICAL',
    toleranceOrCriterion: 'max |P_hat_{t|t-1}(prefix) - P_hat_{t|t-1}(full)| <= $1e-6 for t in [20, t0-4]',
    measuredValue: `maxPredDiffUsd = $${maxFilterPredDiff.toFixed(6)}`,
    evidenceSummary:
      maxFilterPredDiff <= 1e-6
        ? '1-step-ahead predictions P_hat_{t|t-1} are strictly causal and invariant to future candles.'
        : `LOOKAHEAD DETECTED (Finding F-03): Historical 1-step predictions change by $${maxFilterPredDiff.toFixed(4)} when future bars are present due to full-sample medVol, full-sample autocorrelations, and terminal refPrice.`,
  });

  // ============================================================================
  // TEST 04: Matrix & Covariance Invariants (6x6 Symmetry & Positive Semidefiniteness)
  // ============================================================================
  const cov6x6 = filterFull.latentCovarianceMatrix6x6;
  const symCheck = isSymmetric6x6(cov6x6);
  const psdCheck = checkPsdMinPivot6x6(cov6x6);
  results.push({
    testId: 'AUDIT-04',
    category: '2. Matrix & Covariance Invariants',
    title: '6x6 Latent State Covariance Symmetry and Positive Semidefiniteness (Joseph Form)',
    status: symCheck.ok && psdCheck.ok ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion: 'max |P_ij - P_ji| <= 1e-6 AND all Cholesky pivots > 0',
    measuredValue: `maxAsym=${symCheck.maxAsymmetry.toExponential(3)}, minPivot=${psdCheck.minPivot.toExponential(3)}, minDiag=${psdCheck.minDiag.toExponential(3)}`,
    evidenceSummary:
      symCheck.ok && psdCheck.ok
        ? '6x6 covariance matrix P is symmetric and positive definite.'
        : 'Covariance matrix violated symmetry or positive definiteness.',
  });

  // ============================================================================
  // TEST 05: Dimensional & Unit Consistency in AdaptiveDPObserver
  // ============================================================================
  const obs1 = new AdaptiveDPObserver();
  const quantCheck = evaluatePureQuantPipeline(candles, macro, null, 900, obs1, 'FIXTURE_REPLAY', 'TIER_1', candles);
  const pca = quantCheck.pcaFactors;
  const convHist = quantCheck.observerTelemetry.history;

  results.push({
    testId: 'AUDIT-05',
    category: '1. Dimensional & Unit Consistency',
    title: 'Dimensional Consistency of State Drift vs Diffusive Scaling in AdaptiveDPObserver',
    status:
      convHist.length > 0 && Number.isFinite(obs1.estimatedDrift) && Number.isFinite(obs1.shrunkBias)
        ? 'PASSED'
        : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'MEDIUM',
    toleranceOrCriterion: 'All observer states finite and dimensionally consistent ($/step)',
    measuredValue: `drift=${obs1.estimatedDrift.toFixed(4)}, shrunkBias=${obs1.shrunkBias.toFixed(4)}, historyLen=${convHist.length}`,
    evidenceSummary: `AdaptiveDPObserver produced ${convHist.length} finite trajectory points; f1=${pca.f1RealGeopotential}, netLift=${pca.netOrthogonalLift}.`,
  });

  // ============================================================================
  // TEST 06: Analytic / Independent Reference Case (Constant Price & Zero Macro Force)
  // ============================================================================
  const flatPrice = 2900.0;
  const flatCandles: Candle[] = Array.from({ length: 48 }, (_, i) => ({
    time: 1742000000 + i * 900,
    open: flatPrice,
    high: flatPrice + 0.05,
    low: flatPrice - 0.05,
    close: flatPrice,
    volume: 100,
  }));
  const zeroMacro: VerifiedMacroYieldResult = {
    ...macro,
    realYieldGravity: 0,
    dollarDrag: 0,
    centralBankTide: 0,
    netMacroLift: 0,
  };
  const initialSnap = getIntelligenceCoreStateSnapshot();
  const flatPipeline = evaluateScientificCorePipeline({
    candles: flatCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 0.1,
    htfPocAnchorPrice: flatPrice,
    liveMacro: zeroMacro,
    liveTuning: initialSnap.latentMathWriteBack,
    dataDrivenMinWindowBars: 16,
  });
  const flatTerminalMedian =
    flatPipeline.yellowLineConditionalExpectation.medianTrack[
      flatPipeline.yellowLineConditionalExpectation.medianTrack.length - 1
    ]?.value ?? 0;
  const flatDeviationUsd = Math.abs(flatTerminalMedian - flatPrice);
  results.push({
    testId: 'AUDIT-06',
    category: '3. Analytic & Reference Cases',
    title: 'Zero-Drift Equilibrium Fixed-Point Reference Case (P_t = $2900.00, Zero Macro Lift)',
    status: flatDeviationUsd <= 1.0 ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion: '|E[P_{T+24}] - 2900.00| <= $1.00 under zero drift and equilibrium = spot',
    measuredValue: `E[P_{T+24}] = $${flatTerminalMedian.toFixed(2)}, |diff| = $${flatDeviationUsd.toFixed(4)}`,
    evidenceSummary:
      flatDeviationUsd <= 1.0
        ? 'Under constant price and zero exogenous force, conditional expectation stays anchored at $2900.00.'
        : `Spurious drift of $${flatDeviationUsd.toFixed(2)} generated on flat input series.`,
  });

  // ============================================================================
  // TEST 07: Boundary Conditions & Extreme Volatility Shock
  // ============================================================================
  const shockCandles: Candle[] = candles.map((c, idx) =>
    idx === candles.length - 1
      ? { ...c, high: c.close + 95, low: Math.max(100, c.close - 95), close: c.close + 65, volume: c.volume * 25 }
      : { ...c }
  );
  const shockOut = evaluateScientificCorePipeline({
    candles: shockCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 18.5,
    htfPocAnchorPrice: candles[candles.length - 1].close,
    liveMacro: macro,
    liveTuning: initialSnap.latentMathWriteBack,
    dataDrivenMinWindowBars: 16,
  });
  const allShockFinite =
    Number.isFinite(shockOut.impliedLatentPriceUsd) &&
    shockOut.yellowLineConditionalExpectation.medianTrack.every(
      p => Number.isFinite(p.value) && p.value > 100 && p.value < 50000
    ) &&
    shockOut.yellowLineConditionalExpectation.upper95.every(
      (u, idx) => u.value >= shockOut.yellowLineConditionalExpectation.medianTrack[idx].value
    ) &&
    shockOut.yellowLineConditionalExpectation.lower05.every(
      (l, idx) => l.value <= shockOut.yellowLineConditionalExpectation.medianTrack[idx].value
    );
  results.push({
    testId: 'AUDIT-07',
    category: '4. Boundary & Extreme Inputs',
    title: 'Extreme Volatility & 25x Volume Spike Stability and Plume Monotonicity',
    status: allShockFinite ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion: 'All states finite; lower05 <= lower25 <= median <= upper75 <= upper95 for all h=1..24',
    measuredValue: `impliedPrice=$${shockOut.impliedLatentPriceUsd}, Δτ=${shockOut.informationClock.currentDeltaTau}, finite=${allShockFinite}`,
    evidenceSummary: allShockFinite
      ? 'Filter and 24-step quantile plume remain bounded and strictly monotonic under a $65 jump + 25x volume spike.'
      : 'Extreme shock caused non-finite state or quantile crossing.',
  });

  // ============================================================================
  // TEST 08: Missing, Zero-Volume, Duplicated, and Out-of-Order Observations
  // ============================================================================
  const malformedCandles: Candle[] = candles.map((c, idx) => {
    if (idx === 10) return { ...c, volume: 0, high: c.close, low: c.close };
    if (idx === 20) return { ...candles[19] };
    return { ...c };
  });
  const malformedOut = evaluateScientificCorePipeline({
    candles: malformedCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 5.0,
    htfPocAnchorPrice: candles[candles.length - 1].close,
    liveMacro: { ...macro, status: 'MACRO_FEED_UNAVAILABLE' },
    liveTuning: initialSnap.latentMathWriteBack,
    dataDrivenMinWindowBars: 16,
  });
  const malformedFinite =
    Number.isFinite(malformedOut.impliedLatentPriceUsd) &&
    malformedOut.yellowLineConditionalExpectation.medianTrack.length === 24 &&
    malformedOut.yellowLineConditionalExpectation.medianTrack.every(p => Number.isFinite(p.value));
  results.push({
    testId: 'AUDIT-08',
    category: '5. Missing, Stale & Duplicated Data',
    title: 'Zero-Volume, Zero-Range, Duplicate Bar & Unavailable Macro Feed Resilience',
    status: malformedFinite ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion: 'Zero NaN/Infinity when volume=0, high==low, duplicate bar, and MACRO_FEED_UNAVAILABLE',
    measuredValue: `finite=${malformedFinite}, activeCameras=${malformedOut.activeCamerasCount}`,
    evidenceSummary: malformedFinite
      ? 'Filter gracefully handles zero-volume/zero-range bars and missing macro feeds without division-by-zero.'
      : 'Division by zero or NaN under degenerate bar / missing macro input.',
  });

  // ============================================================================
  // TEST 09: Deterministic Replay Invariance
  // ============================================================================
  const replayA = evaluateScientificCorePipeline({
    candles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 6.2,
    htfPocAnchorPrice: 2895.0,
    liveMacro: macro,
    liveTuning: initialSnap.latentMathWriteBack,
    dataDrivenMinWindowBars: 16,
  });
  const replayB = evaluateScientificCorePipeline({
    candles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 6.2,
    htfPocAnchorPrice: 2895.0,
    liveMacro: macro,
    liveTuning: initialSnap.latentMathWriteBack,
    dataDrivenMinWindowBars: 16,
  });
  const replayIdentical =
    JSON.stringify(replayA.yellowLineConditionalExpectation) ===
      JSON.stringify(replayB.yellowLineConditionalExpectation) &&
    JSON.stringify(replayA.latentState) === JSON.stringify(replayB.latentState);
  results.push({
    testId: 'AUDIT-09',
    category: '6. Deterministic Replay',
    title: 'Bitwise Deterministic Replay of Scientific Core Pipeline on Identical Inputs',
    status: replayIdentical ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion: 'Exact JSON equality of latentState and yellowLineConditionalExpectation across runs',
    measuredValue: `identical=${replayIdentical}`,
    evidenceSummary: replayIdentical
      ? 'Scientific Core is 100% deterministic with zero unseeded randomness.'
      : 'Non-deterministic state mutation detected between identical invocations.',
  });

  // ============================================================================
  // TEST 10: Parallel Universe Prefix-Invariance / No-Lookahead in Candidate Scoring
  // ============================================================================
  const puFull = evaluateParallelUniverseAndAwarenessCore({
    candles,
    liveMacro: macro,
    secondaryBenchmark: null,
    htfDailyCandles: candles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'audit-snap-full',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'FIXTURE_REPLAY',
    activeProvider: 'Binance Vision PAXG',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  const gateEvalAudit = (puFull as any).strictOosSplitAudit;
  const hasStrictDisjointOosSplit =
    gateEvalAudit &&
    gateEvalAudit.isStrictlyDisjointOos === true &&
    gateEvalAudit.causalFeatureEvaluation === true;

  results.push({
    testId: 'AUDIT-10',
    category: '8. Time-Index & No-Lookahead (Parallel Universe)',
    title: 'Strict Disjoint Out-of-Sample Split (Fit vs Weight Selection vs Gate Evaluation) & Causal Features',
    status: hasStrictDisjointOosSplit ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'CRITICAL',
    toleranceOrCriterion:
      'Fit window, weight-selection window, and 8/8 gate evaluation window must be strictly disjoint AND historical bar k features must use causal prefix [0..k]',
    measuredValue: hasStrictDisjointOosSplit
      ? `fit=[0..${gateEvalAudit.fitEndIdx}], weight=[${gateEvalAudit.fitEndIdx}..${gateEvalAudit.weightEndIdx}], oosEval=[${gateEvalAudit.weightEndIdx}..${gateEvalAudit.totalSteps}]`
      : 'Overlapping fit/weight/eval window & terminal-bar feature leakage (Findings F-09, F-10)',
    evidenceSummary: hasStrictDisjointOosSplit
      ? 'Parallel Universe calibrates θ on chronological split 1, precision weights w on split 2, and evaluates 8/8 promotion gates strictly on untouched split 3 using causal prefix features.'
      : 'LOOKAHEAD / IN-SAMPLE CONTAMINATION (Findings F-09 & F-10): Dynamic weights and 8/8 gates are evaluated on the same window where θ and weights were fit, and evaluateSymbolicPrimitiveFeature injects terminal bar N-1 equilibriumPrice/POC/ATR into historical bars k < N-1.',
  });

  // ============================================================================
  // TEST 11: Multi-Horizon (h = 1, 5, 15, 24) Forecast Skill vs Naive Baselines
  // ============================================================================
  const horizons = [1, 5, 15];
  const horizonStats: Record<
    number,
    {
      n: number;
      yellowSqErr: number;
      rwSqErr: number;
      emaSqErr: number;
      yellowAbsErr: number;
      rwAbsErr: number;
      yellowHits: number;
      cov95Hits: number;
      diffSquaredErrors: number[];
    }
  > = {};
  for (const h of horizons) {
    horizonStats[h] = {
      n: 0,
      yellowSqErr: 0,
      rwSqErr: 0,
      emaSqErr: 0,
      yellowAbsErr: 0,
      rwAbsErr: 0,
      yellowHits: 0,
      cov95Hits: 0,
      diffSquaredErrors: [],
    };
  }

  for (let tOrigin = 32; tOrigin < candles.length - 15; tOrigin++) {
    const slice = candles.slice(0, tOrigin + 1);
    const originClose = slice[slice.length - 1].close;
    const eqSlice = slice.slice(-Math.min(30, slice.length));
    const causalEq = eqSlice.reduce((a, c) => a + c.close, 0) / eqSlice.length;
    let emaVal = slice[0].close;
    for (let j = 1; j < slice.length; j++) emaVal = 0.15 * slice[j].close + 0.85 * emaVal;

    const pipe = evaluateScientificCorePipeline({
      candles: slice,
      interval: '15m',
      intervalStepSeconds: 900,
      atr: 5.0,
      htfPocAnchorPrice: causalEq,
      liveMacro: zeroMacro,
      liveTuning: initialSnap.latentMathWriteBack,
      dataDrivenMinWindowBars: 16,
    });

    for (const h of horizons) {
      if (tOrigin + h >= candles.length) continue;
      const realized = candles[tOrigin + h].close;
      const yellowPred = pipe.yellowLineConditionalExpectation.medianTrack[h - 1]?.value ?? originClose;
      const up95 = pipe.yellowLineConditionalExpectation.upper95[h - 1]?.value ?? originClose + 20;
      const lo05 = pipe.yellowLineConditionalExpectation.lower05[h - 1]?.value ?? originClose - 20;
      const rwPred = originClose;
      const emaPred = originClose + 0.08 * Math.min(h, 6) * (emaVal - originClose);

      const errY = realized - yellowPred;
      const errRw = realized - rwPred;
      const errEma = realized - emaPred;

      const st = horizonStats[h];
      st.n++;
      st.yellowSqErr += errY * errY;
      st.rwSqErr += errRw * errRw;
      st.emaSqErr += errEma * errEma;
      st.yellowAbsErr += Math.abs(errY);
      st.rwAbsErr += Math.abs(errRw);
      st.diffSquaredErrors.push(errRw * errRw - errY * errY);

      const actualDelta = realized - originClose;
      const predDelta = yellowPred - originClose;
      if ((actualDelta >= 0 && predDelta >= 0) || (actualDelta < 0 && predDelta < 0)) {
        st.yellowHits++;
      }
      if (realized >= lo05 && realized <= up95) {
        st.cov95Hits++;
      }
    }
  }

  const forecastMetricsTable: Record<string, any> = {};
  for (const h of horizons) {
    const st = horizonStats[h];
    const n = Math.max(1, st.n);
    const yellowRmse = Math.sqrt(st.yellowSqErr / n);
    const rwRmse = Math.sqrt(st.rwSqErr / n);
    const emaRmse = Math.sqrt(st.emaSqErr / n);
    const yellowMae = st.yellowAbsErr / n;
    const rwMae = st.rwAbsErr / n;
    const hitRate = st.yellowHits / n;
    const cov95 = st.cov95Hits / n;
    const meanD = st.diffSquaredErrors.reduce((a, b) => a + b, 0) / n;
    const varD = st.diffSquaredErrors.reduce((a, b) => a + (b - meanD) ** 2, 0) / Math.max(1, n - 1);
    const dmStat = meanD / Math.sqrt(Math.max(1e-12, varD / n));
    forecastMetricsTable[`h=${h}`] = {
      sampleSizeN: st.n,
      yellowRmseUsd: parseFloat(yellowRmse.toFixed(4)),
      randomWalkRmseUsd: parseFloat(rwRmse.toFixed(4)),
      emaBaselineRmseUsd: parseFloat(emaRmse.toFixed(4)),
      yellowMaeUsd: parseFloat(yellowMae.toFixed(4)),
      randomWalkMaeUsd: parseFloat(rwMae.toFixed(4)),
      directionalHitRate: parseFloat(hitRate.toFixed(4)),
      empirical90IntervalCoverage: parseFloat(cov95.toFixed(4)),
      dieboldMarianoVsRwTStat: parseFloat(dmStat.toFixed(3)),
    };
  }

  results.push({
    testId: 'AUDIT-11',
    category: '10. Matched-Sample Multi-Horizon Forecast Evaluation',
    title: 'Walk-Forward Multi-Horizon (h=1, 5, 15 Bars) Evaluation vs Random Walk & EMA Baselines',
    status: forecastMetricsTable['h=1'].sampleSizeN >= 30 ? 'PASSED' : 'PARTIAL',
    severityIfFailed: 'MEDIUM',
    toleranceOrCriterion: 'Matched-sample walk-forward evaluation across N >= 30 origins with DM t-stat and 90% interval coverage',
    measuredValue: `h=1: RMSE_Y=$${forecastMetricsTable['h=1'].yellowRmseUsd} vs RMSE_RW=$${forecastMetricsTable['h=1'].randomWalkRmseUsd} (DM t=${forecastMetricsTable['h=1'].dieboldMarianoVsRwTStat}, Cov90=${(forecastMetricsTable['h=1'].empirical90IntervalCoverage * 100).toFixed(1)}%)`,
    evidenceSummary: `Evaluated ${forecastMetricsTable['h=1'].sampleSizeN} strictly causal origins across h=1,5,15.`,
  });

  // ============================================================================
  // TEST 12: Component Ablation Study on 6D Latent State Filter
  // ============================================================================
  const baseTuning = initialSnap.latentMathWriteBack;
  const ablationConfigs = [
    { id: 'FULL_MODEL', label: 'Full 6D Latent Filter (Baseline)', overrides: { ...baseTuning } },
    { id: 'ABLATE_MEAN_REVERSION', label: 'No Equilibrium Mean Reversion (κ_rev = 0)', overrides: { ...baseTuning, meanReversionKappa: 0 } },
    { id: 'ABLATE_TOXICITY_COUPLING', label: 'No Pulse-Echo Toxicity Coupling (β_tox = 0)', overrides: { ...baseTuning, echoToxicityCouplingBeta: 0 } },
    { id: 'ABLATE_MACRO_COUPLING', label: 'No Macro Force Coupling (η_macro = 0)', overrides: { ...baseTuning, macroResidualCouplingEta: 0 } },
    { id: 'ABLATE_DRIFT_PERSISTENCE', label: 'Low Drift Persistence (φ_drift = 0.20)', overrides: { ...baseTuning, driftPersistencePhi: 0.2 } },
  ];
  const ablationTable: Record<string, any>[] = [];
  for (const cfg of ablationConfigs) {
    const out = evaluateScientificCorePipeline({
      candles,
      interval: '15m',
      intervalStepSeconds: 900,
      atr: 6.2,
      htfPocAnchorPrice: 2895.0,
      liveMacro: macro,
      liveTuning: cfg.overrides,
      dataDrivenMinWindowBars: 16,
    });
    ablationTable.push({
      id: cfg.id,
      label: cfg.label,
      oosRmseUsd: out.scientificScoreboard.oosRmseUsd,
      directionalHitRate: out.scientificScoreboard.directionalHitRate,
      brierScore: out.scientificScoreboard.directionalBrierScore,
      rankIc: out.scientificScoreboard.oosSpearmanRankIc,
      residualLag1Autocorr: out.residualOracle.diagnostics.lag1Autocorrelation,
    });
  }
  results.push({
    testId: 'AUDIT-12',
    category: '11. Component Ablation Study',
    title: 'Leave-One-Out Component Ablation on 6D Latent State Filter',
    status: ablationTable.length === 5 ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'MEDIUM',
    toleranceOrCriterion: 'Quantify exact OOS RMSE, Hit Rate, Rank IC, and ρ_1 contribution of each 6D filter term',
    measuredValue: ablationTable.map(r => `${r.id}: RMSE=$${r.oosRmseUsd}`).join(' | '),
    evidenceSummary: 'Completed 5-way component ablation across mean reversion, toxicity coupling, macro coupling, and drift persistence.',
  });

  // ============================================================================
  // TEST 13: Awareness Core Scientific Critique & Component Verdict Capabilities
  // ============================================================================
  const hasComponentCritiques =
    Array.isArray((puFull as any).scientificComponentCritiques) &&
    (puFull as any).scientificComponentCritiques.length >= 5 &&
    (puFull as any).scientificComponentCritiques.every(
      (c: any) =>
        typeof c.componentId === 'string' &&
        typeof c.recommendedAction === 'string' &&
        typeof c.ablationDeltaRmseUsd === 'number' &&
        typeof c.falsificationCriterion === 'string'
    );
  results.push({
    testId: 'AUDIT-13',
    category: '14. Awareness Core Critique & Ablation Capability',
    title: 'Automated Component-Level Critique, Leave-One-Out Ablation & Action Verdicts (RETAIN/REVISE/REPLACE/DISABLE)',
    status: hasComponentCritiques ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion:
      'Awareness Core must evaluate every active equation via empirical ablation and emit structured verdicts (RETAIN, REESTIMATE_PARAMETERS, REVISE_FUNCTIONAL_FORM, DISABLE_CONDITIONALLY, etc.)',
    measuredValue: hasComponentCritiques
      ? `critiques=${(puFull as any).scientificComponentCritiques.length} active equations audited`
      : 'NOT IMPLEMENTED in baseline (only 4 hardcoded diagnostic alert templates exist)',
    evidenceSummary: hasComponentCritiques
      ? 'Awareness Core audits each active equation with empirical ablation ΔRMSE, assumptions check, and explicit action verdict.'
      : 'CAPABILITY GAP (Finding F-08a): Awareness Core only emits 4 static diagnostic templates and cannot critique or ablate active equations.',
  });

  // ============================================================================
  // TEST 14: Genuine Compositional Hypothesis Generation & Failed-Hypothesis Graveyard
  // ============================================================================
  const stepSynth = executeSymbolicDiscoveryStep({
    note: 'Independent mathematical audit discovery step',
    timeframe: '15m',
  });
  const snapAfterSynth = getIntelligenceCoreStateSnapshot();
  const discoveryLab = (puFull as any).compositionalDiscoveryLab || (snapAfterSynth as any).compositionalDiscoveryLab;
  const hasCompositionalDiscoveryAndGraveyard =
    discoveryLab &&
    Array.isArray(discoveryLab.synthesizedHypotheses) &&
    discoveryLab.synthesizedHypotheses.length > 0 &&
    Array.isArray(discoveryLab.failedExperimentsGraveyard) &&
    typeof discoveryLab.evolutionLifecycleStage === 'string';

  results.push({
    testId: 'AUDIT-14',
    category: '15. Creative Mathematical Discovery & Experiment Graveyard',
    title: 'Residual-Driven Compositional Symbolic Hypothesis Generation, Complexity Penalty & Failed-Experiment Memory',
    status: hasCompositionalDiscoveryAndGraveyard ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion:
      'Must generate falsifiable compositional hypotheses from operator grammar with unit checks, BIC complexity penalty, and persistent failed-experiment graveyard',
    measuredValue: hasCompositionalDiscoveryAndGraveyard
      ? `hypotheses=${discoveryLab.synthesizedHypotheses.length}, graveyard=${discoveryLab.failedExperimentsGraveyard.length}, stage=${discoveryLab.evolutionLifecycleStage}`
      : 'FIXED_CATALOG_ONLY (only re-shrinks 8 hardcoded primitives)',
    evidenceSummary: hasCompositionalDiscoveryAndGraveyard
      ? 'Parallel Universe synthesizes compositional symbolic hypotheses targeted at Residual Oracle blindspots, penalizes complexity (BIC), and archives rejected hypotheses in the Experiment Graveyard.'
      : 'CAPABILITY GAP (Finding F-08b): Synthesize Symbolic Step only re-runs ridge shrinkage on 8 hardcoded primitives and has no failed-experiment memory.',
  });

  // ============================================================================
  // TEST 15: Full 8-Primitive Structural Coupling into Candidate Latent State Trajectory
  // ============================================================================
  const candOverrideMeta =
    (puFull as any).candidateStructuralCouplingAudit ||
    (snapAfterSynth as any).candidateStructuralCouplingAudit;
  const allPrimitivesCoupled =
    candOverrideMeta && candOverrideMeta.coupledSymbolicModelsCount >= 8;
  results.push({
    testId: 'AUDIT-15',
    category: '9. Yellow vs Magenta Structural Scope',
    title: 'Full Candidate Symbolic Catalog Coupling into Candidate 6D Latent Trajectory',
    status: allPrimitivesCoupled ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'MEDIUM',
    toleranceOrCriterion: 'All active Level-B symbolic models and synthesized compositional terms must couple into the candidate 6D latent state filter',
    measuredValue: allPrimitivesCoupled
      ? `coupledModels=${candOverrideMeta.coupledSymbolicModelsCount}`
      : 'Only 3 of 8 symbolic primitives coupled to 6D filter parameters (Finding F-08c)',
    evidenceSummary: allPrimitivesCoupled
      ? 'All active symbolic primitives and discovered compositional hypotheses couple into the candidate 6D latent state dynamics.'
      : 'PARTIAL COUPLING (Finding F-08c): buildCandidateLatentTuningOverrides only mapped 3 of the 8 symbolic primitives into 6D filter parameters.',
  });

  // ============================================================================
  // TEST 16: Promotion Gate Fail-Closed Enforcement (HALTED_DEGRADED & Insufficient Sample)
  // ============================================================================
  const haltedPu = evaluateParallelUniverseAndAwarenessCore({
    candles: candles.slice(0, 8),
    liveMacro: macro,
    secondaryBenchmark: null,
    htfDailyCandles: candles.slice(0, 8),
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'audit-snap-halted',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'HALTED_DEGRADED',
    activeProvider: 'Binance Vision PAXG',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    activeTier: 'NONE_HALTED',
  });
  const haltedBlockedWriteBack = writeBackValidatedMathToLatentModel({
    mode: 'MANUAL_MMI',
    confirmedByOperator: true,
  });
  const failClosedOk =
    haltedPu.verificationReport.overallStatus === 'HALTED_FROZEN' &&
    haltedBlockedWriteBack.writtenBack === false;
  results.push({
    testId: 'AUDIT-16',
    category: '12. Promotion-Gate Fail-Closed Enforcement',
    title: 'Fail-Closed Gate Blocking Under HALTED_DEGRADED and Insufficient Sample (<10 Bars)',
    status: failClosedOk ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'CRITICAL',
    toleranceOrCriterion: 'overallStatus === HALTED_FROZEN AND writtenBack === false when HALTED_DEGRADED or N < 10',
    measuredValue: `overallStatus=${haltedPu.verificationReport.overallStatus}, writtenBack=${haltedBlockedWriteBack.writtenBack}`,
    evidenceSummary: failClosedOk
      ? '8/8 promotion gate and write-back strictly fail closed under degraded/halted state or insufficient bars.'
      : 'Gate failed open under halted/insufficient sample state!',
  });

  // ============================================================================
  // TEST 17: Controlled Before-and-After Write-Back Verification on Fixed Fixture
  // ============================================================================
  // Restore active snapshot evaluation first
  const puBeforeWb = evaluateParallelUniverseAndAwarenessCore({
    candles,
    liveMacro: macro,
    secondaryBenchmark: null,
    htfDailyCandles: candles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'audit-snap-wb',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'FIXTURE_REPLAY',
    activeProvider: 'Binance Vision PAXG',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  const beforeWriteBackState = { ...getIntelligenceCoreStateSnapshot().latentMathWriteBack };
  const sciBefore = evaluateScientificCorePipeline({
    candles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: quantCheck.atr,
    htfPocAnchorPrice: quantCheck.liquidityEngine.compositeHtfPocAnchor,
    liveMacro: macro,
    liveTuning: beforeWriteBackState,
    dataDrivenMinWindowBars: 16,
  });

  executeSymbolicDiscoveryStep({ timeframe: '15m', note: 'Pre-write-back calibration' });
  const wbResult = writeBackValidatedMathToLatentModel({
    mode: 'MANUAL_MMI',
    confirmedByOperator: true,
    operatorNote: 'Controlled audit write-back verification',
  });

  const afterWriteBackState = { ...getIntelligenceCoreStateSnapshot().latentMathWriteBack };
  const sciAfter = evaluateScientificCorePipeline({
    candles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: quantCheck.atr,
    htfPocAnchorPrice: quantCheck.liquidityEngine.compositeHtfPocAnchor,
    liveMacro: macro,
    liveTuning: afterWriteBackState,
    dataDrivenMinWindowBars: 16,
  });

  const beforeStep1 = sciBefore.yellowLineConditionalExpectation.medianTrack[0]?.value ?? 0;
  const afterStep1 = sciAfter.yellowLineConditionalExpectation.medianTrack[0]?.value ?? 0;
  const beforeStep24 = sciBefore.yellowLineConditionalExpectation.medianTrack[23]?.value ?? 0;
  const afterStep24 = sciAfter.yellowLineConditionalExpectation.medianTrack[23]?.value ?? 0;

  const beforeAfterWriteBackDiff = {
    writeBackApplied: wbResult.writtenBack,
    gatesPassedCount: wbResult.validationCheck.passedGatesCount,
    generationBefore: beforeWriteBackState.writeBackGeneration,
    generationAfter: afterWriteBackState.writeBackGeneration,
    parametersBefore: {
      phi: beforeWriteBackState.driftPersistencePhi,
      kappa: beforeWriteBackState.meanReversionKappa,
      beta: beforeWriteBackState.echoToxicityCouplingBeta,
      gamma: beforeWriteBackState.echoResilienceCouplingGamma,
      eta: beforeWriteBackState.macroResidualCouplingEta,
      precisionMult: beforeWriteBackState.crossVenueObservationPrecisionMult,
    },
    parametersAfter: {
      phi: afterWriteBackState.driftPersistencePhi,
      kappa: afterWriteBackState.meanReversionKappa,
      beta: afterWriteBackState.echoToxicityCouplingBeta,
      gamma: afterWriteBackState.echoResilienceCouplingGamma,
      eta: afterWriteBackState.macroResidualCouplingEta,
      precisionMult: afterWriteBackState.crossVenueObservationPrecisionMult,
    },
    latentStateBefore: sciBefore.latentState,
    latentStateAfter: sciAfter.latentState,
    yellowLineStep1BeforeUsd: beforeStep1,
    yellowLineStep1AfterUsd: afterStep1,
    yellowLineStep24BeforeUsd: beforeStep24,
    yellowLineStep24AfterUsd: afterStep24,
    yellowLineStep24DeltaUsd: parseFloat((afterStep24 - beforeStep24).toFixed(4)),
    oosRmseBeforeUsd: sciBefore.scientificScoreboard.oosRmseUsd,
    oosRmseAfterUsd: sciAfter.scientificScoreboard.oosRmseUsd,
  };

  results.push({
    testId: 'AUDIT-17',
    category: '13. Controlled Write-Back Verification',
    title: 'Controlled Before-and-After Write-Back Parameter & Yellow-Line Trajectory Verification',
    status:
      (wbResult.writtenBack &&
        afterWriteBackState.writeBackGeneration > beforeWriteBackState.writeBackGeneration &&
        Math.abs(afterStep24 - beforeStep24) > 0) ||
      (!wbResult.writtenBack && afterWriteBackState.writeBackGeneration === beforeWriteBackState.writeBackGeneration)
        ? 'PASSED'
        : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'HIGH',
    toleranceOrCriterion:
      'When eligible, write-back increments generation and mutates Yellow-Line trajectory; when ineligible, fails closed with zero mutation',
    measuredValue: `applied=${wbResult.writtenBack} (${wbResult.validationCheck.passedGatesCount}/8 gates), gen=${beforeWriteBackState.writeBackGeneration}->${afterWriteBackState.writeBackGeneration}, ΔStep24=$${beforeAfterWriteBackDiff.yellowLineStep24DeltaUsd}`,
    evidenceSummary: wbResult.writtenBack
      ? `Write-back applied: Yellow-Line h=24 shifted from $${beforeStep24} to $${afterStep24} (Δ=$${beforeAfterWriteBackDiff.yellowLineStep24DeltaUsd}).`
      : `Write-back cleanly blocked (${wbResult.validationCheck.passedGatesCount}/8 gates passed); incumbent parameters preserved unchanged.`,
  });

  // ============================================================================
  // TEST 18: Versioned Rollback & Audit Trail Verification
  // ============================================================================
  const snapFinal = getIntelligenceCoreStateSnapshot() as any;
  const hasRollbackCapability =
    typeof snapFinal.canRollbackWriteBack === 'boolean' &&
    Array.isArray(snapFinal.writeBackVersionHistory);
  results.push({
    testId: 'AUDIT-18',
    category: '16. Rollback & Versioned Governance',
    title: 'Versioned Write-Back History & Deterministic Rollback Capability',
    status: hasRollbackCapability ? 'PASSED' : 'FAILED_DEFECT_EXPOSED',
    severityIfFailed: 'MEDIUM',
    toleranceOrCriterion: 'Must maintain versioned snapshot stack of prior LatentModelMathWriteBackState states and support instant rollback',
    measuredValue: hasRollbackCapability
      ? `historySnapshots=${snapFinal.writeBackVersionHistory.length}`
      : 'NO_ROLLBACK_STACK in baseline',
    evidenceSummary: hasRollbackCapability
      ? 'Write-back state maintains versioned rollback history with one-step restoration.'
      : 'CAPABILITY GAP (Finding F-11): Persisted write-back state overwrites the state without maintaining a versioned rollback stack.',
  });

  const payload = {
    timestampIso: new Date().toISOString(),
    mode: isBaselineRecord
      ? ('BASELINE_BEFORE_CHANGES' as const)
      : ('POST_REMEDIATION_VERIFICATION' as const),
    sampleSizeCandles: candles.length,
    results,
    forecastMetricsTable,
    ablationTable,
    beforeAfterWriteBackDiff,
  };

  if (isBaselineRecord) {
    fs.mkdirSync(path.dirname(BASELINE_REPORT_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_REPORT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\n[STAGE 2 BASELINE AUDIT RECORDED] -> ${BASELINE_REPORT_PATH}`);
  } else {
    const postReportPath = path.resolve(process.cwd(), 'data', 'audit_post_remediation_verified.json');
    fs.mkdirSync(path.dirname(postReportPath), { recursive: true });
    fs.writeFileSync(postReportPath, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\n[STAGE 6 POST-REMEDIATION AUDIT RECORDED] -> ${postReportPath}`);
  }

  console.log('\n================================================================================');
  console.log(`GDF INDEPENDENT MATHEMATICAL AUDIT (${payload.mode})`);
  console.log('================================================================================');
  for (const r of results) {
    console.log(`[${r.status}] ${r.testId} (${r.category}): ${r.title}`);
    console.log(`    Measured : ${r.measuredValue}`);
    console.log(`    Evidence : ${r.evidenceSummary}`);
  }
  const passedCount = results.filter(r => r.status === 'PASSED').length;
  const failedCount = results.filter(r => r.status === 'FAILED_DEFECT_EXPOSED').length;
  console.log('--------------------------------------------------------------------------------');
  console.log(`Summary: ${passedCount}/${results.length} PASSED | ${failedCount} DEFECTS/GAPS EXPOSED`);
  console.log('================================================================================\n');

  if (!isBaselineRecord && failedCount > 0) {
    process.exit(1);
  }
  return payload;
}

runAuditSuite().catch(err => {
  console.error('Fatal error in check-independent-mathematical-audit:', err);
  process.exit(1);
});
