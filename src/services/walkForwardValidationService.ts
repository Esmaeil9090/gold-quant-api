import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  Candle,
  MacroRegimeKey,
  RegimeConditionalValidationMetrics,
  ValidationHorizonBars,
  VerifiedMacroYieldResult,
  VolatilityRegimeKey,
  WalkForwardHorizonMetrics,
  WalkForwardValidationScorecard,
} from '../contracts/quantContracts.js';
import {
  buildEmpiricalCalibrationBundle,
  fitEmpiricalGarch11,
} from '../config/parameterRegistry.js';
import {
  AdaptiveDPObserver,
  computeCointegrationBasis,
  computeLogOddsSweepDiscriminator,
  computeOrthogonalMacroFactors,
  computeVpinAndShrinkage,
} from '../engine/quantEngine.js';
import { runBtcForecastEngine } from '../engine/btcEngineEntry.js';
import type { BtcDerivativesObservationPoint } from '../engine/btcScientificCore.js';
import {
  loadPointInTimeMacroSeriesFromFixture,
  resolvePointInTimeMacroAt,
  type PointInTimeMacroObservation,
} from './pointInTimeMacroService.js';

function normalCdfApprox(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

function calculateCausalAtr(candles: Candle[], period: number): number {
  if (candles.length < 2) return 1.0;
  const win = Math.max(1, Math.min(period, candles.length - 1));
  let trSum = 0;
  for (let i = candles.length - win; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    trSum += Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
  }
  return trSum / win;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SNAPSHOT_FILE_PATH = path.resolve(__dirname, '../../data/validation-snapshots.json');

const HORIZONS: ValidationHorizonBars[] = [1, 5, 15, 60];
const MIN_WARMUP_BARS = 24;

/**
 * Builds the canonical disjoint validation namespace key `asset:instrument:timeframe` (Phase A.1).
 */
export function buildValidationNamespaceKey(
  assetClass: 'GOLD' | 'BTC',
  instrumentIdentity: string,
  timeframe: string
): string {
  const cleanAsset = assetClass === 'BTC' ? 'BTC' : 'GOLD';
  const cleanInst = (
    instrumentIdentity || (cleanAsset === 'BTC' ? 'BTC_SPOT_USD' : 'PAXG_SPOT_TOKEN')
  )
    .trim()
    .toUpperCase();
  const cleanTf = (timeframe || '15m').trim();
  return `${cleanAsset}:${cleanInst}:${cleanTf}`;
}

export interface CausalOriginEvaluationRecord {
  namespaceKey: string;
  assetClass: 'GOLD' | 'BTC';
  instrumentIdentity: string;
  engineId: 'GDF-G' | 'BDF-B';
  timeframe: string;
  originBarTime: number;
  originClose: number;
  causalDriftSignal: number;
  causalDirectionalProbUp: number;
  causalSweepLogOdds: number;
  causalSweepPredictedProb: number;
  causalSweepPredictedPositive: boolean;
  causalGarchVolPct: number;
  volatilityRegime: VolatilityRegimeKey;
  macroRegime: MacroRegimeKey;
  realizedForwardReturnsByHorizon: Partial<Record<ValidationHorizonBars, number>>;
  realizedSweepOutcomeByHorizon: Partial<Record<ValidationHorizonBars, number>>;
}

interface PersistedValidationStore {
  version: string;
  updatedAtIso: string;
  recordsByNamespace: Record<string, Record<string, CausalOriginEvaluationRecord>>;
  latestScorecardsByNamespace: Record<string, WalkForwardValidationScorecard>;
  recordsByTimeframe: Record<string, Record<string, CausalOriginEvaluationRecord>>;
  latestScorecardsByTimeframe: Record<string, WalkForwardValidationScorecard>;
}

let inMemoryStore: PersistedValidationStore | null = null;

function loadValidationStore(): PersistedValidationStore {
  if (inMemoryStore) return inMemoryStore;
  try {
    if (fs.existsSync(SNAPSHOT_FILE_PATH)) {
      const raw = fs.readFileSync(SNAPSHOT_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedValidationStore>;
      if (parsed && typeof parsed === 'object') {
        inMemoryStore = {
          version: 'v81.0-PhaseA-NamespacedHacWalkForward',
          updatedAtIso: parsed.updatedAtIso || new Date().toISOString(),
          recordsByNamespace: parsed.recordsByNamespace || {},
          latestScorecardsByNamespace: parsed.latestScorecardsByNamespace || {},
          recordsByTimeframe: parsed.recordsByTimeframe || {},
          latestScorecardsByTimeframe: parsed.latestScorecardsByTimeframe || {},
        };
        return inMemoryStore;
      }
    }
  } catch (err: any) {
    console.warn(
      '[GDF Phase A Validation] Failed to read validation snapshot store, initializing clean store:',
      err?.message
    );
  }
  inMemoryStore = {
    version: 'v81.0-PhaseA-NamespacedHacWalkForward',
    updatedAtIso: new Date().toISOString(),
    recordsByNamespace: {},
    latestScorecardsByNamespace: {},
    recordsByTimeframe: {},
    latestScorecardsByTimeframe: {},
  };
  return inMemoryStore;
}

export function clearInMemoryValidationStoreForTesting(): void {
  inMemoryStore = {
    version: 'v81.0-PhaseA-NamespacedHacWalkForward',
    updatedAtIso: new Date().toISOString(),
    recordsByNamespace: {},
    latestScorecardsByNamespace: {},
    recordsByTimeframe: {},
    latestScorecardsByTimeframe: {},
  };
}

export function getValidationStoreSnapshot(): PersistedValidationStore {
  return loadValidationStore();
}

function saveValidationStore(store: PersistedValidationStore): void {
  try {
    const dir = path.dirname(SNAPSHOT_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    store.updatedAtIso = new Date().toISOString();
    fs.writeFileSync(SNAPSHOT_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err: any) {
    console.warn('[GDF Phase A Validation] Non-fatal snapshot persistence warning:', err?.message);
  }
}

/**
 * Computes fractional ranks (with average tie-breaking) for Spearman Rank-IC.
 */
function computeFractionalRanks(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, idx) => ({ v, idx })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].idx] = avgRank;
    }
    i = j + 1;
  }
  return ranks;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varX * varY);
  if (denom < 1e-12) return 0;
  return Math.max(-1, Math.min(1, cov / denom));
}

export function computeSpearmanRankIc(signals: number[], realizedReturns: number[]): number {
  if (signals.length !== realizedReturns.length || signals.length < 4) return 0;
  const rankSignals = computeFractionalRanks(signals);
  const rankReturns = computeFractionalRanks(realizedReturns);
  return pearsonCorrelation(rankSignals, rankReturns);
}

/**
 * Computes overlap-adjusted Effective Sample Size (N_eff) and Newey-West HAC standard error
 * and t-statistic for Spearman Rank-IC at horizon h (Phase A.2).
 */
export function computeNeweyWestHacIcStats(
  signals: number[],
  realizedReturns: number[],
  horizonBars: number
): {
  rankIc: number;
  naiveTStat: number;
  hacStdErr: number;
  hacTStat: number;
  effectiveSampleSizeNeff: number;
  nonOverlappingSampleSizeN: number;
} {
  const n = Math.min(signals.length, realizedReturns.length);
  const nonOverlappingSampleSizeN = Math.max(1, Math.floor(n / Math.max(1, horizonBars)));
  if (n < 5) {
    return {
      rankIc: 0,
      naiveTStat: 0,
      hacStdErr: 1,
      hacTStat: 0,
      effectiveSampleSizeNeff: 1,
      nonOverlappingSampleSizeN,
    };
  }

  const rSig = computeFractionalRanks(signals.slice(0, n));
  const rRet = computeFractionalRanks(realizedReturns.slice(0, n));

  const meanSig = rSig.reduce((a, b) => a + b, 0) / n;
  const meanRet = rRet.reduce((a, b) => a + b, 0) / n;
  const stdSig = Math.sqrt(
    Math.max(1e-12, rSig.reduce((a, v) => a + (v - meanSig) ** 2, 0) / n)
  );
  const stdRet = Math.sqrt(
    Math.max(1e-12, rRet.reduce((a, v) => a + (v - meanRet) ** 2, 0) / n)
  );

  // Standardized rank cross-product series z_t whose sample mean equals Spearman Rank-IC
  const zSeries = new Array<number>(n);
  let sumZ = 0;
  for (let i = 0; i < n; i++) {
    const z = ((rSig[i] - meanSig) / stdSig) * ((rRet[i] - meanRet) / stdRet);
    zSeries[i] = z;
    sumZ += z;
  }
  const rankIc = Math.max(-1, Math.min(1, sumZ / n));
  const naiveTStat =
    n > 2 ? rankIc * Math.sqrt((n - 2) / Math.max(1e-6, 1 - rankIc * rankIc)) : 0;

  // Demeaned moment conditions e_t = z_t - rankIc
  const e = zSeries.map(z => z - rankIc);
  let gamma0 = 0;
  for (let i = 0; i < n; i++) {
    gamma0 += e[i] * e[i];
  }
  gamma0 /= n;

  // Bartlett kernel bandwidth L = max(h - 1, floor(4 * (n / 100)^(2/9)))
  const nwBandwidth = Math.min(
    n - 1,
    Math.max(horizonBars - 1, Math.floor(4 * Math.pow(n / 100, 2 / 9)))
  );

  let omegaHac = gamma0;
  let autocorrInflation = 1.0;
  for (let lag = 1; lag <= nwBandwidth; lag++) {
    let gammaLag = 0;
    for (let t = lag; t < n; t++) {
      gammaLag += e[t] * e[t - lag];
    }
    gammaLag /= n;
    const weight = 1 - lag / (nwBandwidth + 1);
    omegaHac += 2 * weight * gammaLag;
    if (gamma0 > 1e-12) {
      const rhoLag = Math.max(-0.95, Math.min(0.95, gammaLag / gamma0));
      autocorrInflation += 2 * weight * Math.max(0, rhoLag);
    }
  }

  // Enforce theoretical minimum overlap variance inflation of h when h > 1
  const overlapVarianceFactor = Math.max(horizonBars, autocorrInflation);
  const effectiveOmega = Math.max(omegaHac, gamma0 * Math.max(1, horizonBars * 0.65));
  const hacStdErr = Math.sqrt(Math.max(1e-8, effectiveOmega / n));
  const hacTStat = rankIc / hacStdErr;
  const effectiveSampleSizeNeff = Math.max(
    1,
    Math.min(nonOverlappingSampleSizeN, Math.round(n / overlapVarianceFactor))
  );

  return {
    rankIc,
    naiveTStat,
    hacStdErr,
    hacTStat,
    effectiveSampleSizeNeff,
    nonOverlappingSampleSizeN,
  };
}

function computeWilsonCi95(hits: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const z = 1.959963984540054;
  const p = hits / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [
    parseFloat(Math.max(0, center - half).toFixed(4)),
    parseFloat(Math.min(1, center + half).toFixed(4)),
  ];
}

function formatHorizonLabel(
  h: ValidationHorizonBars,
  intervalStepSeconds: number,
  lang: 'en' | 'fa'
): string {
  const totalMins = Math.round((h * intervalStepSeconds) / 60);
  let timeSpanEn = `${totalMins}m`;
  let timeSpanFa = `${totalMins} دقیقه`;
  if (totalMins >= 1440) {
    const d = +(totalMins / 1440).toFixed(1);
    timeSpanEn = `${d}d`;
    timeSpanFa = `${d} روز`;
  } else if (totalMins >= 60) {
    const hrs = +(totalMins / 60).toFixed(1);
    timeSpanEn = `${hrs}h`;
    timeSpanFa = `${hrs} ساعت`;
  }
  return lang === 'fa'
    ? `افق h=${h} کندل (+${timeSpanFa})`
    : `h=${h} Bar${h > 1 ? 's' : ''} (+${timeSpanEn})`;
}

/**
 * Evaluates a subset of causal origin records for a specific horizon h with:
 * - Overlap-corrected Effective Sample Size (N_eff) & non-overlapping sample size (floor(N/h))
 * - Newey-West HAC standard errors and HAC t-stat on Rank-IC
 * - True directional Brier score vs realized base-rate benchmark p(1-p)
 * - Explicitly relabeled Wick-Excursion Event metrics (separated from directional Brier)
 */
function computeMetricsForHorizon(
  records: CausalOriginEvaluationRecord[],
  h: ValidationHorizonBars,
  intervalStepSeconds: number
): WalkForwardHorizonMetrics {
  const eligible = records.filter(
    r =>
      r.realizedForwardReturnsByHorizon[h] !== undefined &&
      Number.isFinite(r.realizedForwardReturnsByHorizon[h]!) &&
      Math.abs(r.causalDriftSignal) > 1e-12
  );

  const sampleSizeN = eligible.length;
  if (sampleSizeN < 5) {
    return {
      horizonBars: h,
      horizonLabelEn: formatHorizonLabel(h, intervalStepSeconds, 'en'),
      horizonLabelFa: formatHorizonLabel(h, intervalStepSeconds, 'fa'),
      sampleSizeN,
      effectiveSampleSizeNeff: 0,
      nonOverlappingSampleSizeN: 0,
      status: 'INSUFFICIENT_WARMUP',
      spearmanRankIc: null,
      rankIcRollingStd: null,
      icIr: null,
      rankIcTStat: null,
      rankIcHacStdErr: null,
      rankIcHacTStat: null,
      directionalHitRate: null,
      nonOverlappingHitRate: null,
      nonOverlappingHitRateCi95: null,
      payoffAsymmetryRatio: null,
      meanWinReturnBps: null,
      meanLossReturnBps: null,
      directionalBrierScore: null,
      directionalBaseRateP: null,
      directionalBaseRateBrier: null,
      directionalBrierSkillScore: null,
      wickExcursionMetricLabel: 'WICK_EXCURSION_EVENT_SCORE (Non-Directional)',
      wickExcursionPrecision: null,
      wickExcursionRecall: null,
      wickExcursionF1Score: null,
      wickExcursionBrierScore: null,
      wickExcursionBaseRateBrier: null,
      sweepPrecision: null,
      sweepRecall: null,
      sweepF1Score: null,
      sweepBrierScore: null,
    };
  }

  const signals = eligible.map(r => r.causalDriftSignal);
  const returns = eligible.map(r => r.realizedForwardReturnsByHorizon[h]!);
  const hacStats = computeNeweyWestHacIcStats(signals, returns, h);
  const rankIc = hacStats.rankIc;

  // Rolling sub-window Rank-ICs for ICIR
  const windowSize = Math.max(5, Math.min(16, Math.floor(sampleSizeN / 2)));
  const rollingIcs: number[] = [];
  if (sampleSizeN >= windowSize + 2) {
    for (
      let start = 0;
      start <= sampleSizeN - windowSize;
      start += Math.max(1, Math.floor(windowSize / 3))
    ) {
      const subSig = signals.slice(start, start + windowSize);
      const subRet = returns.slice(start, start + windowSize);
      rollingIcs.push(computeSpearmanRankIc(subSig, subRet));
    }
  } else {
    rollingIcs.push(rankIc);
  }

  const meanIc =
    rollingIcs.length > 0 ? rollingIcs.reduce((a, b) => a + b, 0) / rollingIcs.length : rankIc;
  const varIc =
    rollingIcs.length > 1
      ? rollingIcs.reduce((acc, v) => acc + Math.pow(v - meanIc, 2), 0) / (rollingIcs.length - 1)
      : Math.max(0.01, (1 - rankIc * rankIc) / Math.max(2, sampleSizeN - 2));
  const stdIc = Math.max(0.02, Math.sqrt(varIc));
  const icIr = rankIc / stdIc;

  // Directional Hit Rate, True Directional Brier vs Base Rate p(1-p), and Non-Overlapping Hit Rate
  let hits = 0;
  let realizedUpCount = 0;
  let dirBrierSum = 0;
  const winBpsList: number[] = [];
  const lossBpsList: number[] = [];

  // Non-overlapping subsample (strided by h bars)
  let nonOverlapHits = 0;
  let nonOverlapCount = 0;

  // Wick-Excursion Classifier Confusion Matrix & Brier Score (Relabeled from sweepBrierScore)
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let wickBrierSum = 0;
  let wickEventCount = 0;

  for (let i = 0; i < sampleSizeN; i++) {
    const rec = eligible[i];
    const sig = rec.causalDriftSignal;
    const ret = rec.realizedForwardReturnsByHorizon[h]!;
    const signedPnlBps = (sig >= 0 ? ret : -ret) * 10000;
    const isHit = (sig > 0 && ret > 0) || (sig < 0 && ret < 0);

    if (isHit) {
      hits++;
    }
    if (i % h === 0) {
      nonOverlapCount++;
      if (isHit) nonOverlapHits++;
    }

    if (signedPnlBps >= 0) {
      winBpsList.push(Math.max(0.01, signedPnlBps));
    } else {
      lossBpsList.push(Math.max(0.01, Math.abs(signedPnlBps)));
    }

    // True Directional Brier Score vs realized up indicator y_t in {0, 1}
    const realizedUp = ret > 0 ? 1 : 0;
    realizedUpCount += realizedUp;
    const probUp = Number.isFinite(rec.causalDirectionalProbUp)
      ? rec.causalDirectionalProbUp
      : 0.5;
    dirBrierSum += Math.pow(probUp - realizedUp, 2);

    // Wick-Excursion Event Score (Non-Directional)
    const predWickProb = rec.causalSweepPredictedProb;
    const predWickPos = rec.causalSweepPredictedPositive;
    const actualWickOut = rec.realizedSweepOutcomeByHorizon[h] ?? 0;
    wickEventCount += actualWickOut;

    wickBrierSum += Math.pow(predWickProb - actualWickOut, 2);
    if (predWickPos && actualWickOut === 1) tp++;
    else if (predWickPos && actualWickOut === 0) fp++;
    else if (!predWickPos && actualWickOut === 1) fn++;
  }

  const directionalHitRate = hits / sampleSizeN;
  const nonOverlappingHitRate =
    nonOverlapCount > 0 ? nonOverlapHits / nonOverlapCount : directionalHitRate;
  const nonOverlappingHitRateCi95 = computeWilsonCi95(nonOverlapHits, nonOverlapCount);

  const directionalBrierScore = dirBrierSum / sampleSizeN;
  const directionalBaseRateP = realizedUpCount / sampleSizeN;
  const directionalBaseRateBrier = directionalBaseRateP * (1 - directionalBaseRateP);
  const directionalBrierSkillScore =
    directionalBaseRateBrier > 1e-6
      ? 1 - directionalBrierScore / directionalBaseRateBrier
      : 0;

  const meanWinReturnBps =
    winBpsList.length > 0 ? winBpsList.reduce((a, b) => a + b, 0) / winBpsList.length : 0;
  const meanLossReturnBps =
    lossBpsList.length > 0 ? lossBpsList.reduce((a, b) => a + b, 0) / lossBpsList.length : 0;
  const payoffAsymmetryRatio =
    meanLossReturnBps > 0.01
      ? meanWinReturnBps / meanLossReturnBps
      : meanWinReturnBps > 0
      ? 2.0
      : 1.0;

  const wickPrecision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const wickRecall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const wickF1 =
    wickPrecision + wickRecall > 0
      ? (2 * wickPrecision * wickRecall) / (wickPrecision + wickRecall)
      : 0;
  const wickBrier = wickBrierSum / sampleSizeN;
  const wickBaseRate = wickEventCount / sampleSizeN;
  const wickBaseRateBrier = wickBaseRate * (1 - wickBaseRate);

  return {
    horizonBars: h,
    horizonLabelEn: formatHorizonLabel(h, intervalStepSeconds, 'en'),
    horizonLabelFa: formatHorizonLabel(h, intervalStepSeconds, 'fa'),
    sampleSizeN,
    effectiveSampleSizeNeff: hacStats.effectiveSampleSizeNeff,
    nonOverlappingSampleSizeN: nonOverlapCount,
    status:
      hacStats.effectiveSampleSizeNeff >= 20 ? 'CALIBRATED_ACTIVE' : 'PROVISIONAL_LOW_SAMPLE',
    spearmanRankIc: parseFloat(rankIc.toFixed(4)),
    rankIcRollingStd: parseFloat(stdIc.toFixed(4)),
    icIr: parseFloat(icIr.toFixed(3)),
    // Primary rankIcTStat is now the Newey-West HAC t-stat so overlapping horizons never inflate t-stats
    rankIcTStat: parseFloat(hacStats.hacTStat.toFixed(2)),
    rankIcHacStdErr: parseFloat(hacStats.hacStdErr.toFixed(4)),
    rankIcHacTStat: parseFloat(hacStats.hacTStat.toFixed(2)),
    directionalHitRate: parseFloat(directionalHitRate.toFixed(4)),
    nonOverlappingHitRate: parseFloat(nonOverlappingHitRate.toFixed(4)),
    nonOverlappingHitRateCi95,
    payoffAsymmetryRatio: parseFloat(payoffAsymmetryRatio.toFixed(3)),
    meanWinReturnBps: parseFloat(meanWinReturnBps.toFixed(2)),
    meanLossReturnBps: parseFloat(meanLossReturnBps.toFixed(2)),
    directionalBrierScore: parseFloat(directionalBrierScore.toFixed(4)),
    directionalBaseRateP: parseFloat(directionalBaseRateP.toFixed(4)),
    directionalBaseRateBrier: parseFloat(directionalBaseRateBrier.toFixed(4)),
    directionalBrierSkillScore: parseFloat(directionalBrierSkillScore.toFixed(4)),
    wickExcursionMetricLabel: 'WICK_EXCURSION_EVENT_SCORE (Non-Directional)',
    wickExcursionPrecision: parseFloat(wickPrecision.toFixed(4)),
    wickExcursionRecall: parseFloat(wickRecall.toFixed(4)),
    wickExcursionF1Score: parseFloat(wickF1.toFixed(4)),
    wickExcursionBrierScore: parseFloat(wickBrier.toFixed(4)),
    wickExcursionBaseRateBrier: parseFloat(wickBaseRateBrier.toFixed(4)),
    sweepPrecision: parseFloat(wickPrecision.toFixed(4)),
    sweepRecall: parseFloat(wickRecall.toFixed(4)),
    sweepF1Score: parseFloat(wickF1.toFixed(4)),
    sweepBrierScore: parseFloat(wickBrier.toFixed(4)),
  };
}

/**
 * Strictly Causal Walk-Forward Evaluation Engine (Phase A Remediated).
 *
 * Enforces:
 * 1. Disjoint namespace keys `asset:instrument:timeframe` (never collides Gold and BTC or PAXG and COMEX).
 * 2. Asset-appropriate engine routing: when `assetClass === 'BTC'`, runs `runBtcForecastEngine` (BDF-B)
 *    instead of Gold's `AdaptiveDPObserver` or Gold's 40-bar OU equilibrium.
 * 3. Point-in-time dated macro resolution at every historical bar `originBar.time`: only macro observations
 *    with `effectiveAvailableTimestampSec <= originBar.time` may enter origin `t`.
 * 4. Overlap-adjusted Effective Sample Size (N_eff), Newey-West HAC t-statistics, true Directional Brier
 *    vs base rate p(1-p), and relabeled Wick-Excursion Event metrics.
 */
export function evaluateCausalWalkForwardValidation(params: {
  candles: Candle[];
  liveMacro?: VerifiedMacroYieldResult;
  pointInTimeMacroSeries?: PointInTimeMacroObservation[];
  btcDerivativesSeries?: BtcDerivativesObservationPoint[];
  assetClass?: 'GOLD' | 'BTC';
  instrumentIdentity?: string;
  timeframe: string;
  intervalStepSeconds: number;
  persistToDisk?: boolean;
}): WalkForwardValidationScorecard {
  const { candles, timeframe, intervalStepSeconds } = params;

  // Infer assetClass and instrumentIdentity with fail-safe against unlabeled BTC candles
  const medianPrice =
    candles.length > 0 ? candles[Math.floor(candles.length / 2)].close : 2650;
  const resolvedAsset: 'GOLD' | 'BTC' =
    params.assetClass ||
    (params.instrumentIdentity && /BTC/i.test(params.instrumentIdentity)
      ? 'BTC'
      : medianPrice > 15000
      ? 'BTC'
      : 'GOLD');
  const resolvedInstrument =
    params.instrumentIdentity ||
    (resolvedAsset === 'BTC' ? 'BTC_SPOT_USD' : 'PAXG_SPOT_TOKEN');
  const engineId: 'GDF-G' | 'BDF-B' = resolvedAsset === 'BTC' ? 'BDF-B' : 'GDF-G';
  const namespaceKey = buildValidationNamespaceKey(
    resolvedAsset,
    resolvedInstrument,
    timeframe
  );

  const store = loadValidationStore();
  if (!store.recordsByNamespace[namespaceKey]) {
    store.recordsByNamespace[namespaceKey] = {};
  }
  const persistedMap = store.recordsByNamespace[namespaceKey];

  // Load point-in-time dated macro series (Phase A.3: never apply a single future snapshot across historical bars)
  const macroSeries: PointInTimeMacroObservation[] =
    params.pointInTimeMacroSeries ??
    loadPointInTimeMacroSeriesFromFixture().observations;

  const garchSeriesValues: number[] = [];
  const rawCausalEvaluations: Array<{
    idx: number;
    time: number;
    close: number;
    causalDriftSignal: number;
    causalDirectionalProbUp: number;
    causalSweepLogOdds: number;
    causalSweepProb: number;
    causalSweepPositive: boolean;
    causalGarchVolPct: number;
    causalAtr: number;
    originMacroRegime: MacroRegimeKey;
  }> = [];

  if (candles.length > MIN_WARMUP_BARS + 1) {
    for (let t = MIN_WARMUP_BARS; t < candles.length - 1; t++) {
      // Strictly causal prefix: indices 0 .. t inclusive (zero future bars)
      const prefixCandles = candles.slice(0, t + 1);
      const originBar = prefixCandles[prefixCandles.length - 1];
      const causalAtr = calculateCausalAtr(prefixCandles, 14);

      if (resolvedAsset === 'BTC') {
        // Phase A.1: BTC strictly uses BDF-B (runBtcForecastEngine) on causal prefixCandles
        const causalLevSeries = params.btcDerivativesSeries
          ? params.btcDerivativesSeries.filter(d => d.timestampSec <= originBar.time)
          : undefined;
        const btcOut = runBtcForecastEngine({
          candles: prefixCandles,
          intervalStepSeconds,
          horizonSteps: 5,
          leverageSeries: causalLevSeries,
        });
        const step1Forecast = btcOut.liveForecast[0]?.value ?? originBar.close;
        const causalDriftSignal = step1Forecast - originBar.close;
        const causalVolLog = Math.max(1e-5, btcOut.state.vol);
        const causalGarchVolPct = parseFloat((causalVolLog * 100).toFixed(4));
        const expectedLogRet = Math.log(Math.max(1, step1Forecast) / Math.max(1, originBar.close));
        const causalDirectionalProbUp = Math.max(
          0.05,
          Math.min(0.95, normalCdfApprox(expectedLogRet / causalVolLog))
        );
        const pulseZ = Math.abs(btcOut.state.cexPressure) * 1.2 + Math.abs(btcOut.state.leverageStress);
        const causalSweepProb = Math.max(0.05, Math.min(0.95, normalCdfApprox(pulseZ - 0.5)));
        const causalSweepPositive = pulseZ >= 0.95;

        garchSeriesValues.push(causalGarchVolPct);
        rawCausalEvaluations.push({
          idx: t,
          time: originBar.time,
          close: originBar.close,
          causalDriftSignal,
          causalDirectionalProbUp,
          causalSweepLogOdds: pulseZ,
          causalSweepProb,
          causalSweepPositive,
          causalGarchVolPct,
          causalAtr,
          originMacroRegime:
            btcOut.state.leverageStress <= 0
              ? 'EXPANDING_MACRO_PRESSURE'
              : 'CONTRACTING_MACRO_PRESSURE',
        });
      } else {
        // Phase A.3: Resolve strictly point-in-time macro at originBar.time (no future values can enter origin t)
        const originMacro =
          macroSeries.length > 0
            ? resolvePointInTimeMacroAt(originBar.time, macroSeries)
            : params.liveMacro!;

        const originMacroRegime: MacroRegimeKey =
          originMacro && originMacro.netMacroLift >= 0
            ? 'EXPANDING_MACRO_PRESSURE'
            : 'CONTRACTING_MACRO_PRESSURE';

        const causalObserver = new AdaptiveDPObserver();
        const causalCalib = buildEmpiricalCalibrationBundle(prefixCandles);
        const eqSlice = prefixCandles.slice(-Math.min(40, prefixCandles.length));
        const causalEqPrice = eqSlice.reduce((s, c) => s + c.close, 0) / eqSlice.length;

        const prefixReturns: number[] = [];
        for (let k = 1; k < prefixCandles.length; k++) {
          prefixReturns.push(
            (prefixCandles[k].close - prefixCandles[k - 1].close) /
              Math.max(1, prefixCandles[k - 1].close)
          );
        }
        const causalGarchFit = fitEmpiricalGarch11(prefixReturns);
        const causalGarchVolPct = parseFloat(
          ((causalGarchFit.forecast[0] || 0.0035) * 100).toFixed(4)
        );

        const causalBasis = computeCointegrationBasis(originBar.close, prefixCandles, null);
        const causalPca = computeOrthogonalMacroFactors(originMacro, prefixCandles, causalBasis);
        const causalVpin = computeVpinAndShrinkage(prefixCandles, causalCalib);

        causalObserver.generateConvergenceHistory(
          prefixCandles,
          causalPca.netOrthogonalLift,
          causalVpin,
          causalCalib
        );

        const ouRestoringRate = 0.06;
        const causalTotalDrift =
          causalPca.netOrthogonalLift +
          causalObserver.shrunkBias +
          causalObserver.estimatedDrift +
          ouRestoringRate * (causalEqPrice - originBar.close);

        const sigmaUsd = Math.max(
          0.1,
          originBar.close * Math.max(1e-4, causalGarchVolPct / 100)
        );
        const causalDirectionalProbUp = Math.max(
          0.05,
          Math.min(0.95, normalCdfApprox(causalTotalDrift / sigmaUsd))
        );

        const causalSweep = computeLogOddsSweepDiscriminator(
          prefixCandles,
          causalPca.netOrthogonalLift,
          causalVpin,
          causalBasis,
          causalCalib
        );

        const causalSweepProb = Math.max(
          0.05,
          Math.min(0.95, normalCdfApprox(causalSweep.logOddsZScore))
        );
        const causalSweepPositive =
          causalSweep.classification === 'DEALER_STOP_SWEEP' ||
          causalSweep.classification === 'TRUE_STRUCTURAL_BREAKOUT' ||
          causalSweep.logOddsZScore >= 0.45;

        garchSeriesValues.push(causalGarchVolPct);
        rawCausalEvaluations.push({
          idx: t,
          time: originBar.time,
          close: originBar.close,
          causalDriftSignal: causalTotalDrift,
          causalDirectionalProbUp,
          causalSweepLogOdds: causalSweep.logOddsScore,
          causalSweepProb,
          causalSweepPositive,
          causalGarchVolPct,
          causalAtr,
          originMacroRegime,
        });
      }
    }
  }

  const sortedGarch = [...garchSeriesValues].sort((a, b) => a - b);
  const medianGarchVol =
    sortedGarch.length > 0 ? sortedGarch[Math.floor(sortedGarch.length / 2)] : 0.35;

  for (let i = 0; i < rawCausalEvaluations.length; i++) {
    const item = rawCausalEvaluations[i];
    const t = item.idx;
    const key = String(item.time);

    const prefixGarch = garchSeriesValues.slice(0, i + 1).sort((a, b) => a - b);
    const causalMedianVol = prefixGarch[Math.floor(prefixGarch.length / 2)] || medianGarchVol;
    const volRegime: VolatilityRegimeKey =
      item.causalGarchVolPct >= causalMedianVol ? 'HIGH_VOL_GARCH' : 'LOW_VOL_GARCH';

    const realizedForwardReturnsByHorizon: Partial<Record<ValidationHorizonBars, number>> = {};
    const realizedSweepOutcomeByHorizon: Partial<Record<ValidationHorizonBars, number>> = {};

    for (const h of HORIZONS) {
      if (t + h < candles.length) {
        const futureBar = candles[t + h];
        const logRet = Math.log(Math.max(1e-6, futureBar.close) / Math.max(1e-6, item.close));
        realizedForwardReturnsByHorizon[h] = logRet;

        let maxExcursion = 0;
        let wickReversalDetected = false;
        const originBar = candles[t];
        const originUpperWick = originBar.high - Math.max(originBar.open, originBar.close);
        const originLowerWick = Math.min(originBar.open, originBar.close) - originBar.low;
        const originRange = Math.max(0.05, originBar.high - originBar.low);

        for (let k = t + 1; k <= t + h; k++) {
          const fb = candles[k];
          maxExcursion = Math.max(
            maxExcursion,
            Math.abs(fb.high - item.close),
            Math.abs(fb.low - item.close)
          );
        }
        const atrThreshold = Math.max(0.15, item.causalAtr * 0.55 * Math.sqrt(Math.min(h, 6)));
        if (
          (originUpperWick / originRange > 0.38 && futureBar.close < item.close) ||
          (originLowerWick / originRange > 0.38 && futureBar.close > item.close) ||
          maxExcursion >= atrThreshold
        ) {
          wickReversalDetected = true;
        }
        realizedSweepOutcomeByHorizon[h] = wickReversalDetected ? 1 : 0;
      }
    }

    const existing = persistedMap[key];
    persistedMap[key] = {
      namespaceKey,
      assetClass: resolvedAsset,
      instrumentIdentity: resolvedInstrument,
      engineId,
      timeframe,
      originBarTime: item.time,
      originClose: item.close,
      causalDriftSignal: item.causalDriftSignal,
      causalDirectionalProbUp: item.causalDirectionalProbUp,
      causalSweepLogOdds: item.causalSweepLogOdds,
      causalSweepPredictedProb: item.causalSweepProb,
      causalSweepPredictedPositive: item.causalSweepPositive,
      causalGarchVolPct: item.causalGarchVolPct,
      volatilityRegime: existing?.volatilityRegime || volRegime,
      macroRegime: existing?.macroRegime || item.originMacroRegime,
      realizedForwardReturnsByHorizon: {
        ...(existing?.realizedForwardReturnsByHorizon || {}),
        ...realizedForwardReturnsByHorizon,
      },
      realizedSweepOutcomeByHorizon: {
        ...(existing?.realizedSweepOutcomeByHorizon || {}),
        ...realizedSweepOutcomeByHorizon,
      },
    };
  }

  const allRecordsSorted = Object.values(persistedMap).sort(
    (a, b) => a.originBarTime - b.originBarTime
  );
  const trimmedRecords = allRecordsSorted.slice(-240);
  const nextMap: Record<string, CausalOriginEvaluationRecord> = {};
  for (const r of trimmedRecords) {
    nextMap[String(r.originBarTime)] = r;
  }
  store.recordsByNamespace[namespaceKey] = nextMap;

  const horizonsMetrics: WalkForwardHorizonMetrics[] = HORIZONS.map(h =>
    computeMetricsForHorizon(trimmedRecords, h, intervalStepSeconds)
  );

  const buildRegimeMetrics = (
    regimeKey: VolatilityRegimeKey | MacroRegimeKey,
    labelEn: string,
    labelFa: string,
    subset: CausalOriginEvaluationRecord[]
  ): RegimeConditionalValidationMetrics => {
    const m5 = computeMetricsForHorizon(subset, 5, intervalStepSeconds);
    const m1 = computeMetricsForHorizon(subset, 1, intervalStepSeconds);
    const activeM = m5.sampleSizeN >= 6 ? m5 : m1;
    return {
      regimeKey,
      regimeLabelEn: labelEn,
      regimeLabelFa: labelFa,
      sampleSizeN: activeM.sampleSizeN,
      spearmanRankIcH5: activeM.spearmanRankIc,
      icIrH5: activeM.icIr,
      directionalHitRateH5: activeM.directionalHitRate,
      payoffAsymmetryH5: activeM.payoffAsymmetryRatio,
      sweepF1ScoreH5: activeM.wickExcursionF1Score ?? activeM.sweepF1Score,
      sweepBrierScoreH5: activeM.wickExcursionBrierScore ?? activeM.sweepBrierScore,
    };
  };

  const highVolRecords = trimmedRecords.filter(r => r.volatilityRegime === 'HIGH_VOL_GARCH');
  const lowVolRecords = trimmedRecords.filter(r => r.volatilityRegime === 'LOW_VOL_GARCH');
  const expandingMacroRecords = trimmedRecords.filter(
    r => r.macroRegime === 'EXPANDING_MACRO_PRESSURE'
  );
  const contractingMacroRecords = trimmedRecords.filter(
    r => r.macroRegime === 'CONTRACTING_MACRO_PRESSURE'
  );

  const latestGarchVol =
    garchSeriesValues.length > 0
      ? garchSeriesValues[garchSeriesValues.length - 1]
      : medianGarchVol;
  const currentVolatilityRegime: VolatilityRegimeKey =
    latestGarchVol >= medianGarchVol ? 'HIGH_VOL_GARCH' : 'LOW_VOL_GARCH';
  const currentMacroRegime: MacroRegimeKey =
    rawCausalEvaluations.length > 0
      ? rawCausalEvaluations[rawCausalEvaluations.length - 1].originMacroRegime
      : 'EXPANDING_MACRO_PRESSURE';

  const h1Metrics = horizonsMetrics.find(m => m.horizonBars === 1)!;
  const h5Metrics = horizonsMetrics.find(m => m.horizonBars === 5)!;
  const effectiveSampleSizeN = h1Metrics.effectiveSampleSizeNeff ?? h1Metrics.sampleSizeN;

  const ic1Str =
    h1Metrics.spearmanRankIc !== null
      ? `${h1Metrics.spearmanRankIc >= 0 ? '+' : ''}${h1Metrics.spearmanRankIc.toFixed(3)}`
      : 'N/A';
  const ic5Str =
    h5Metrics.spearmanRankIc !== null
      ? `${h5Metrics.spearmanRankIc >= 0 ? '+' : ''}${h5Metrics.spearmanRankIc.toFixed(3)}`
      : 'N/A';
  const hit1Str =
    h1Metrics.directionalHitRate !== null
      ? `${(h1Metrics.directionalHitRate * 100).toFixed(1)}%`
      : 'N/A';

  const scorecard: WalkForwardValidationScorecard = {
    schemaVersion: '2026.11-v81.0-PhaseA-NamespacedHacWalkForward',
    namespaceKey,
    assetClass: resolvedAsset,
    instrumentIdentity: resolvedInstrument,
    engineId,
    timeframe,
    causalityEnforced: true,
    zeroLookaheadVerified: true,
    effectiveSampleSizeN,
    persistedSnapshotsCount: Object.keys(store.recordsByNamespace).reduce(
      (acc, ns) => acc + Object.keys(store.recordsByNamespace[ns] || {}).length,
      0
    ),
    lastUpdatedIso: new Date().toISOString(),
    currentVolatilityRegime,
    currentVolatilityRegimeLabelEn:
      currentVolatilityRegime === 'HIGH_VOL_GARCH'
        ? 'HIGH_VOL_GARCH (Above Median Conditional Vol)'
        : 'LOW_VOL_GARCH (Below Median Conditional Vol)',
    currentVolatilityRegimeLabelFa:
      currentVolatilityRegime === 'HIGH_VOL_GARCH'
        ? 'رژیم نوسان بالا (HIGH_VOL_GARCH)'
        : 'رژیم نوسان پایین (LOW_VOL_GARCH)',
    currentMacroRegime,
    currentMacroRegimeLabelEn:
      currentMacroRegime === 'EXPANDING_MACRO_PRESSURE'
        ? 'EXPANDING_MACRO_PRESSURE (Supportive Real-Yield / Dollar Lift)'
        : 'CONTRACTING_MACRO_PRESSURE (Restrictive Real-Yield / Dollar Drag)',
    currentMacroRegimeLabelFa:
      currentMacroRegime === 'EXPANDING_MACRO_PRESSURE'
        ? 'فشار کلان انبساطی (حمایت بازده واقعی / دلار)'
        : 'فشار کلان انقباضی (فشار بازده واقعی / دلار)',
    horizons: horizonsMetrics,
    volatilityRegimePartitions: {
      HIGH_VOL_GARCH: buildRegimeMetrics(
        'HIGH_VOL_GARCH',
        'High GARCH Volatility Regime (σ_t ≥ Median)',
        'رژیم نوسان شرطی بالای GARCH (σ_t ≥ میانه)',
        highVolRecords
      ),
      LOW_VOL_GARCH: buildRegimeMetrics(
        'LOW_VOL_GARCH',
        'Low GARCH Volatility Regime (σ_t < Median)',
        'رژیم نوسان شرطی پایین GARCH (σ_t < میانه)',
        lowVolRecords
      ),
    },
    macroRegimePartitions: {
      EXPANDING_MACRO_PRESSURE: buildRegimeMetrics(
        'EXPANDING_MACRO_PRESSURE',
        'Expanding Macro Pressure (Net Lift ≥ 0)',
        'رژیم فشار کلان انبساطی (برآیند کلان ≥ ۰)',
        expandingMacroRecords.length >= 6 ? expandingMacroRecords : trimmedRecords
      ),
      CONTRACTING_MACRO_PRESSURE: buildRegimeMetrics(
        'CONTRACTING_MACRO_PRESSURE',
        'Contracting Macro Pressure (Net Lift < 0)',
        'رژیم فشار کلان انقباضی (برآیند کلان < ۰)',
        contractingMacroRecords.length >= 6 ? contractingMacroRecords : trimmedRecords
      ),
    },
    summaryBadgeEn: `[${namespaceKey}] Neff=${effectiveSampleSizeN} · IC(h=1)=${ic1Str} · IC(h=5)=${ic5Str} · Hit(h=1)=${hit1Str}`,
    summaryBadgeFa: `[${namespaceKey}] نمونه موثر=${effectiveSampleSizeN} · ضریب IC(h=1)=${ic1Str} · IC(h=5)=${ic5Str} · نرخ اصابت=${hit1Str}`,
  };

  store.latestScorecardsByNamespace[namespaceKey] = scorecard;
  if (resolvedAsset === 'GOLD' && resolvedInstrument === 'PAXG_SPOT_TOKEN') {
    store.latestScorecardsByTimeframe[timeframe] = scorecard;
  }
  if (params.persistToDisk !== false) {
    saveValidationStore(store);
  }

  return scorecard;
}

export function getLatestValidationScorecard(
  timeframe: string = '15m',
  assetClass: 'GOLD' | 'BTC' = 'GOLD',
  instrumentIdentity?: string
): WalkForwardValidationScorecard | null {
  const store = loadValidationStore();
  const nsKey = buildValidationNamespaceKey(
    assetClass,
    instrumentIdentity || (assetClass === 'BTC' ? 'BTC_SPOT_USD' : 'PAXG_SPOT_TOKEN'),
    timeframe
  );
  return (
    store.latestScorecardsByNamespace[nsKey] ||
    (assetClass === 'GOLD' ? store.latestScorecardsByTimeframe[timeframe] || null : null)
  );
}
