/**
 * BDF-B — BITCOIN FULL BRAIN SCIENTIFIC CORE (v1.0)
 *
 * Dedicated 6D continuous-market state-space filter, activity clock,
 * pulse-echo detector, residual oracle, dual-plume generator, and awareness brain for BTC.
 *
 * Constitutional Guarantees:
 * - Zero Gold COMEX/LBMA weekend rules (isFuturesClosed = false always; never ZERO_FOR_SESSION).
 * - Identifiable 6D latent state: X = { logLevel, drift, vol, cexPressure, leverageStress, resilience }.
 * - Forbidden in v1 core state: mandatory on-chain allocation factor, gold basis/COMEX terms, gold weekend zero flag.
 * - Shared Residual Shock Operator (applyResidualShockOperator) wired into every bar update.
 * - STRICT_REAL_DATA_ONLY = true: optional derivatives or chain channels fail closed to UNAVAILABLE if absent.
 */

import type { Candle, EnsemblePlume } from '../contracts/quantContracts.js';
import {
  applyResidualShockOperator,
  type ResidualShockAuditEntry,
  type ResidualShockCalibration,
} from './residualShockOperator.js';
import {
  evaluateCryptoSessionAndCalendar,
  type CryptoDriftPolicy,
  type CryptoSessionAndCalendarResult,
} from '../services/cryptoSessionCalendar.js';

export interface BtcLatentState6D {
  logLevel: number;
  drift: number;
  vol: number;
  cexPressure: number;
  leverageStress: number;
  resilience: number;
}

export type BtcPulseType =
  | 'AGGRESSIVE_CEX_IMPULSE'
  | 'LIQUIDATION_CASCADE'
  | 'FUNDING_SHOCK'
  | 'RANGE_VOL_BURST'
  | 'BASIS_DISLOCATION';

export interface BtcPulseEchoEvent {
  pulseId: string;
  barIndex: number;
  timestampSec: number;
  type: BtcPulseType;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impulseMagnitude: number;
  impact: number;
  recovery: number;
  absorbed: boolean;
  summaryEn: string;
}

export interface BtcResidualBarRecord {
  barIndex: number;
  timestampSec: number;
  predicted: number;
  realized: number;
  residual: number;
  predictiveSigma: number;
  z: number;
  shockFired: boolean;
  deltaTau: number;
  isWeekendUtc: boolean;
  anchorPriceAfterUpdate: number;
  driftAfterUpdate: number;
}

export interface BtcResidualOracleSummary {
  barsEvaluated: number;
  rmse: number;
  lag1Autocorrelation: number;
  shocksFired: number;
  meanAbsPostShockError: number;
  weekendRmse: number;
  weekdayRmse: number;
  latestResidual: number;
  latestZ: number;
  latestShockFired: boolean;
  bars: BtcResidualBarRecord[];
  shockAuditLog: ResidualShockAuditEntry[];
}

export type BtcLeverageRegime = 'QUIET' | 'CROWDED' | 'CASCADE_RISK' | 'UNKNOWN';
export type BtcResidualHealth = 'OK' | 'STRUCTURED' | 'POST_SHOCK';

export type BtcAwarenessFaultCode =
  | 'POST_SHOCK_COOLDOWN'
  | 'RESIDUAL_STRUCTURED'
  | 'LEVERAGE_STRESS_HIGH'
  | 'THIN_OPEN_PARTICIPATION'
  | 'DERIVATIVES_CHANNEL_UNAVAILABLE'
  | 'BASIS_DISLOCATION_ACTIVE';

export interface BtcAwarenessState {
  assetClass: 'BTC';
  isFuturesClosed: false;
  isThinOpen: boolean;
  driftPolicy: CryptoDriftPolicy;
  faults: BtcAwarenessFaultCode[];
  leverageRegime: BtcLeverageRegime;
  residualHealth: BtcResidualHealth;
  blockAutoPromotion: boolean;
  cooldownBarsRemaining: number;
  session: CryptoSessionAndCalendarResult;
  summaryEn: string;
}

export interface BtcDerivativesObservationPoint {
  timestampSec: number;
  fundingRate8h?: number | null;
  openInterestChangePct?: number | null;
  liquidationImbalanceNorm?: number | null;
  markSpotBasisBps?: number | null;
  markPriceUsd?: number | null;
  spotPriceUsd?: number | null;
  venue?: string;
}

export interface BtcLeverageChannelStatus {
  status: 'VERIFIED_LIVE' | 'VERIFIED_SERIES' | 'UNAVAILABLE';
  source: string;
  observationsCount: number;
  latestFundingRate8h: number | null;
  latestMarkSpotBasisBps: number | null;
  latestOpenInterestChangePct: number | null;
  latestLiquidationImbalanceNorm: number | null;
  computedLeverageStress: number;
  leverageRegime: BtcLeverageRegime;
  noteEn: string;
}

export interface BtcChainSatelliteObservation {
  timestampSec: number;
  exchangeNetflowBtc: number;
  source: string;
}

export interface BtcChainSatelliteStatus {
  status: 'SATELLITE_LOGGED_ONLY' | 'UNAVAILABLE';
  injectedIntoCoreState: false;
  observationsCount: number;
  latestExchangeNetflowBtc: number | null;
  placeboTestPassed: boolean;
  placeboImprovementRatio: number;
  noteEn: string;
}

export interface BtcForecastTrackPoint {
  step: number;
  time: number;
  value: number;
}

export interface BtcConfidenceBandPoint {
  step: number;
  time: number;
  upper95: number;
  upper75: number;
  lower25: number;
  lower05: number;
}

export interface BtcScientificCoreOutput {
  ok: boolean;
  assetClass: 'BTC';
  version: string;
  state: BtcLatentState6D;
  equilibriumAnchorUsd: number;
  activityClockLatestDeltaTau: number;
  liveForecast: BtcForecastTrackPoint[];
  candidateForecast: BtcForecastTrackPoint[];
  confidenceBand: BtcConfidenceBandPoint[];
  candidateDissentSummary: {
    dissentActive: boolean;
    dissentReason: string;
    meanAbsTrackDissentUsd: number;
    maxAbsTrackDissentUsd: number;
    step12DissentUsd: number;
  };
  residualOracle: BtcResidualOracleSummary;
  pulses: BtcPulseEchoEvent[];
  awareness: BtcAwarenessState;
  leverageChannel: BtcLeverageChannelStatus;
  chainSatellite: BtcChainSatelliteStatus;
  liveEnsemblePlume: EnsemblePlume;
  candidateEnsemblePlume: EnsemblePlume;
  diagnosticsEn: string[];
  yellowColor: '#f5d76e';
  magentaColor: '#e040fb';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function pearsonAutocorrLag1(values: number[]): number {
  if (values.length < 4) return 0;
  const x = values.slice(0, -1);
  const y = values.slice(1);
  const m = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < m; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= m;
  my /= m;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < m; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const den = Math.sqrt(dx2 * dy2);
  if (den < 1e-12) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

/**
 * Evaluates whether optional on-chain exchange netflow observations beat a deterministic
 * scrambled-label placebo test in explaining short-horizon BTC residuals.
 * Even if passed, v1 constitutional rules keep chain features out of the 6D latent state
 * until explicitly promoted.
 */
export function evaluateChainSatellitePlaceboTest(params: {
  residuals: BtcResidualBarRecord[];
  chainObservations?: BtcChainSatelliteObservation[];
}): BtcChainSatelliteStatus {
  const obs = params.chainObservations || [];
  if (obs.length === 0) {
    return {
      status: 'UNAVAILABLE',
      injectedIntoCoreState: false,
      observationsCount: 0,
      latestExchangeNetflowBtc: null,
      placeboTestPassed: false,
      placeboImprovementRatio: 0,
      noteEn:
        'Verified on-chain exchange netflow feed unavailable; channel kept offline (no synthetic chain flows).',
    };
  }

  const latest = obs[obs.length - 1];
  const res = params.residuals;
  if (res.length < 8 || obs.length < 4) {
    return {
      status: 'SATELLITE_LOGGED_ONLY',
      injectedIntoCoreState: false,
      observationsCount: obs.length,
      latestExchangeNetflowBtc: latest.exchangeNetflowBtc,
      placeboTestPassed: false,
      placeboImprovementRatio: 0,
      noteEn:
        'Chain exchange netflow logged in satellite channel only; insufficient aligned bars for placebo falsification.',
    };
  }

  // Align observations with residual bars and compare correlation vs deterministic cyclic-shifted (scrambled) placebo
  const pairs: { flow: number; nextRes: number }[] = [];
  for (let i = 0; i < res.length - 1; i++) {
    const rBar = res[i];
    const nextBar = res[i + 1];
    // Strictly causal backward matching: observation must have arrived at or before rBar.timestampSec
    let matched: BtcChainSatelliteObservation | undefined;
    let bestDist = Infinity;
    for (const o of obs) {
      if (o.timestampSec <= rBar.timestampSec && rBar.timestampSec - o.timestampSec <= 3600) {
        const dist = rBar.timestampSec - o.timestampSec;
        if (dist < bestDist) {
          bestDist = dist;
          matched = o;
        }
      }
    }
    if (matched && Number.isFinite(matched.exchangeNetflowBtc)) {
      pairs.push({ flow: matched.exchangeNetflowBtc, nextRes: nextBar.residual });
    }
  }

  if (pairs.length < 5) {
    return {
      status: 'SATELLITE_LOGGED_ONLY',
      injectedIntoCoreState: false,
      observationsCount: obs.length,
      latestExchangeNetflowBtc: latest.exchangeNetflowBtc,
      placeboTestPassed: false,
      placeboImprovementRatio: 0,
      noteEn:
        'Chain satellite logged only (fewer than 5 aligned bar pairs; excluded from 6D core state).',
    };
  }

  const baselineMse =
    pairs.reduce((acc, p) => acc + p.nextRes * p.nextRes, 0) / Math.max(1, pairs.length);
  const flowMean = pairs.reduce((acc, p) => acc + p.flow, 0) / pairs.length;
  const flowVar =
    pairs.reduce((acc, p) => acc + (p.flow - flowMean) * (p.flow - flowMean), 0) / pairs.length;

  let covTrue = 0;
  let covScrambled = 0;
  for (let i = 0; i < pairs.length; i++) {
    const df = pairs[i].flow - flowMean;
    const scrambledIdx = (i * 3 + 2) % pairs.length;
    const dfScrambled = pairs[scrambledIdx].flow - flowMean;
    covTrue += df * pairs[i].nextRes;
    covScrambled += dfScrambled * pairs[i].nextRes;
  }
  covTrue /= pairs.length;
  covScrambled /= pairs.length;

  const betaTrue = flowVar > 1e-9 ? covTrue / flowVar : 0;
  const betaScrambled = flowVar > 1e-9 ? covScrambled / flowVar : 0;

  const mseTrue =
    pairs.reduce((acc, p) => {
      const pred = betaTrue * (p.flow - flowMean);
      const err = p.nextRes - pred;
      return acc + err * err;
    }, 0) / pairs.length;

  const mseScrambled =
    pairs.reduce((acc, p, idx) => {
      const scIdx = (idx * 3 + 2) % pairs.length;
      const pred = betaScrambled * (pairs[scIdx].flow - flowMean);
      const err = p.nextRes - pred;
      return acc + err * err;
    }, 0) / pairs.length;

  const trueGain = Math.max(0, (baselineMse - mseTrue) / Math.max(1e-9, baselineMse));
  const placeboGain = Math.max(1e-6, (baselineMse - mseScrambled) / Math.max(1e-9, baselineMse));
  const improvementRatio = Number((trueGain / placeboGain).toFixed(4));
  const placeboTestPassed = trueGain > 0.05 && improvementRatio >= 1.75;

  return {
    status: 'SATELLITE_LOGGED_ONLY',
    injectedIntoCoreState: false,
    observationsCount: obs.length,
    latestExchangeNetflowBtc: latest.exchangeNetflowBtc,
    placeboTestPassed,
    placeboImprovementRatio: improvementRatio,
    noteEn: placeboTestPassed
      ? `Chain satellite passed scrambled-label placebo (${improvementRatio}x gain ratio), retained as satellite telemetry in v1.`
      : `Chain satellite did not beat scrambled-label placebo (${improvementRatio}x ratio < 1.75x gate); strictly isolated from 6D core state.`,
  };
}

/**
 * Core BDF-B evaluator: runs the 6D BTC state-space filter, activity clock,
 * residual shock operator, pulse-echo brain, dual plume, and awareness brain.
 */
export function evaluateBtcScientificCore(params: {
  candles: Candle[];
  intervalStepSeconds: number;
  horizonSteps?: number;
  leverageSeries?: BtcDerivativesObservationPoint[];
  chainSatellite?: BtcChainSatelliteObservation[];
  shockCalibration?: Partial<ResidualShockCalibration>;
  directionalGatePassed?: boolean;
}): BtcScientificCoreOutput {
  const {
    candles,
    intervalStepSeconds = 900,
    horizonSteps = 24,
    leverageSeries,
    chainSatellite,
    shockCalibration,
    directionalGatePassed = false,
  } = params;

  const diagnosticsEn: string[] = [];

  if (!Array.isArray(candles) || candles.length < 4) {
    const nowSec = Math.floor(Date.now() / 1000);
    const fallbackSession = evaluateCryptoSessionAndCalendar({ timestampSec: nowSec });
    const emptyPlume: EnsemblePlume = {
      medianTrack: [],
      upper95: [],
      upper75: [],
      lower25: [],
      lower05: [],
      sampleTracks: [],
    };
    return {
      ok: false,
      assetClass: 'BTC',
      version: 'BDF-B-1.0.0',
      state: {
        logLevel: 0,
        drift: 0,
        vol: 0,
        cexPressure: 0,
        leverageStress: 0,
        resilience: 0.75,
      },
      equilibriumAnchorUsd: 0,
      activityClockLatestDeltaTau: 1.0,
      liveForecast: [],
      candidateForecast: [],
      confidenceBand: [],
      candidateDissentSummary: {
        dissentActive: false,
        dissentReason: 'Insufficient verified BTC spot candles',
        meanAbsTrackDissentUsd: 0,
        maxAbsTrackDissentUsd: 0,
        step12DissentUsd: 0,
      },
      residualOracle: {
        barsEvaluated: 0,
        rmse: 0,
        lag1Autocorrelation: 0,
        shocksFired: 0,
        meanAbsPostShockError: 0,
        weekendRmse: 0,
        weekdayRmse: 0,
        latestResidual: 0,
        latestZ: 0,
        latestShockFired: false,
        bars: [],
        shockAuditLog: [],
      },
      pulses: [],
      awareness: {
        assetClass: 'BTC',
        isFuturesClosed: false,
        isThinOpen: fallbackSession.isThinOpen,
        driftPolicy: fallbackSession.driftPolicy,
        faults: ['DERIVATIVES_CHANNEL_UNAVAILABLE'],
        leverageRegime: 'UNKNOWN',
        residualHealth: 'OK',
        blockAutoPromotion: true,
        cooldownBarsRemaining: 0,
        session: fallbackSession,
        summaryEn: 'BDF-B halted: insufficient verified BTC spot candles.',
      },
      leverageChannel: {
        status: 'UNAVAILABLE',
        source: 'UNAVAILABLE',
        observationsCount: 0,
        latestFundingRate8h: null,
        latestMarkSpotBasisBps: null,
        latestOpenInterestChangePct: null,
        latestLiquidationImbalanceNorm: null,
        computedLeverageStress: 0,
        leverageRegime: 'UNKNOWN',
        noteEn: 'Insufficient candle history.',
      },
      chainSatellite: {
        status: 'UNAVAILABLE',
        injectedIntoCoreState: false,
        observationsCount: 0,
        latestExchangeNetflowBtc: null,
        placeboTestPassed: false,
        placeboImprovementRatio: 0,
        noteEn: 'Unavailable.',
      },
      liveEnsemblePlume: emptyPlume,
      candidateEnsemblePlume: emptyPlume,
      diagnosticsEn: ['Insufficient verified BTC spot candles (< 4 bars).'],
      yellowColor: '#f5d76e',
      magentaColor: '#e040fb',
    };
  }

  const n = candles.length;
  const originTimeSec = candles[n - 1].time;
  const parkinsonConst = 1 / (4 * Math.LN2);
  const barRangesLog: number[] = new Array(n).fill(0.0025);
  const barVolumes: number[] = new Array(n).fill(1);
  const barSignedImbalances: number[] = new Array(n).fill(0);
  const logReturns: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const hi = Math.max(c.high, c.open, c.close, 1);
    const lo = Math.max(1, Math.min(c.low, c.open, c.close));
    const hlLog = Math.log(hi / lo);
    barRangesLog[i] = Math.max(0.0003, Math.min(0.08, Math.sqrt(parkinsonConst * hlLog * hlLog)));
    barVolumes[i] = Math.max(0, Number(c.volume) || 0);
    const rawRange = Math.max(1e-6, c.high - c.low);
    const clv = (c.close - c.open) / rawRange;
    barSignedImbalances[i] = Math.max(-1, Math.min(1, clv));
    if (i > 0) {
      logReturns[i] = Math.log(Math.max(1, c.close) / Math.max(1, candles[i - 1].close));
    }
  }

  // Activity clock Δτ_t from normalized intrabar range and real spot volume
  const deltaTauSeries: number[] = new Array(n).fill(1.0);
  for (let i = 0; i < n; i++) {
    const lookStart = Math.max(0, i - 32);
    const lookEnd = Math.max(1, i);
    const medRange = Math.max(0.0005, median(barRangesLog.slice(lookStart, lookEnd)));
    const volSlice = barVolumes.slice(lookStart, lookEnd).filter(v => v > 0);
    const medVol = volSlice.length > 0 ? Math.max(1e-6, median(volSlice)) : 1;

    const rangeRatio = barRangesLog[i] / medRange;
    const volRatio = barVolumes[i] > 0 && volSlice.length > 0 ? barVolumes[i] / medVol : rangeRatio;
    const rawTau = 0.55 * rangeRatio + 0.45 * volRatio;
    deltaTauSeries[i] = Number(Math.max(0.28, Math.min(2.75, rawTau)).toFixed(4));
  }

  // Helper to resolve optional verified derivatives observation at bar timestamp (strictly causal: timestampSec <= originTimeSec)
  const validLeverageSeries = Array.isArray(leverageSeries)
    ? leverageSeries.filter(
        pt => pt && typeof pt.timestampSec === 'number' && pt.timestampSec <= originTimeSec
      )
    : [];
  const causalChainSatellite = Array.isArray(chainSatellite)
    ? chainSatellite.filter(
        pt => pt && typeof pt.timestampSec === 'number' && pt.timestampSec <= originTimeSec
      )
    : undefined;
  const hasVerifiedLeverageChannel = validLeverageSeries.length > 0;

  const findLeverageObsAt = (barTimeSec: number): BtcDerivativesObservationPoint | null => {
    if (!hasVerifiedLeverageChannel) return null;
    let best: BtcDerivativesObservationPoint | null = null;
    let bestDist = Infinity;
    const maxTol = Math.max(3600, intervalStepSeconds * 4);
    for (const pt of validLeverageSeries) {
      if (pt.timestampSec <= barTimeSec) {
        const dist = barTimeSec - pt.timestampSec;
        if (dist <= maxTol && dist < bestDist) {
          best = pt;
          bestDist = dist;
        }
      }
    }
    return best;
  };

  const computeLeverageStressFromObs = (
    obs: BtcDerivativesObservationPoint | null
  ): number | null => {
    if (!obs) return null;
    // Standardize funding (typical 8h funding 0.01% = 0.0001), mark-spot basis bps, OI change %, liquidation imbalance
    let stress = 0;
    let channelsUsed = 0;
    if (typeof obs.fundingRate8h === 'number' && Number.isFinite(obs.fundingRate8h)) {
      // +0.0005 (5 bps per 8h) is crowded long (+0.5); -0.0005 is crowded short (-0.5)
      stress += Math.max(-1, Math.min(1, obs.fundingRate8h / 0.0008)) * 0.42;
      channelsUsed++;
    }
    if (typeof obs.markSpotBasisBps === 'number' && Number.isFinite(obs.markSpotBasisBps)) {
      stress += Math.max(-1, Math.min(1, obs.markSpotBasisBps / 35)) * 0.28;
      channelsUsed++;
    }
    if (typeof obs.openInterestChangePct === 'number' && Number.isFinite(obs.openInterestChangePct)) {
      stress += Math.max(-1, Math.min(1, obs.openInterestChangePct / 6.0)) * 0.18;
      channelsUsed++;
    }
    if (
      typeof obs.liquidationImbalanceNorm === 'number' &&
      Number.isFinite(obs.liquidationImbalanceNorm)
    ) {
      stress += Math.max(-1, Math.min(1, obs.liquidationImbalanceNorm)) * 0.35;
      channelsUsed++;
    }
    if (channelsUsed === 0) return null;
    return Math.max(-1, Math.min(1, stress));
  };

  // Initialize BDF-B 6D Latent State X = { logLevel, drift, vol, cexPressure, leverageStress, resilience }
  const initPrice = Math.max(1, candles[0].close);
  let state: BtcLatentState6D = {
    logLevel: Math.log(initPrice),
    drift: 0,
    vol: Math.max(0.001, barRangesLog[0]),
    cexPressure: 0,
    leverageStress: 0,
    resilience: 0.76,
  };

  let equilibriumAnchorUsd = initPrice;
  let stateVarLog = Math.max(1e-6, state.vol * state.vol);
  let cooldownBarsRemaining = 0;
  let latestBandInflationMult = 1.0;

  const residualBars: BtcResidualBarRecord[] = [];
  const shockAuditLog: ResidualShockAuditEntry[] = [];
  const pulses: BtcPulseEchoEvent[] = [];

  // Track open pulses to measure recovery/absorption echoes over subsequent 3 bars
  const pendingPulseEchoes: {
    pulse: BtcPulseEchoEvent;
    prePulsePrice: number;
    pulseClosePrice: number;
    signedImpulseUsd: number;
    barsElapsed: number;
  }[] = [];

  for (let t = 1; t < n; t++) {
    const c = candles[t];
    const prevC = candles[t - 1];
    const dt = deltaTauSeries[t];
    const sessionAtBar = evaluateCryptoSessionAndCalendar({
      timestampSec: c.time,
      candles: candles.slice(0, t + 1),
    });

    // Causal baseline volatility up to t - 1
    const baseVol = Math.max(
      0.0006,
      median(barRangesLog.slice(Math.max(0, t - 24), Math.max(1, t)))
    );

    // Thin-open participation scales drift down without freezing physics
    const thinOpenDriftScale = sessionAtBar.isThinOpen ? sessionAtBar.driftScaleFactor : 1.0;

    // 1. One-step prediction of logLevel from drift + cexPressure + leverageStress
    const anchorPullCooldownScale = cooldownBarsRemaining > 0 ? 0.15 : 1.0;
    const anchorPullLog =
      anchorPullCooldownScale *
      0.08 *
      (Math.log(Math.max(1, equilibriumAnchorUsd)) - state.logLevel);
    const cexContributionLog = 0.24 * (state.cexPressure / Math.max(0.25, state.resilience)) * state.vol;
    // Crowded leverageStress (> 0.45) creates fragility squeeze / mean-reversion pressure, moderate leverage aligns with flow
    const levContributionLog =
      Math.abs(state.leverageStress) > 0.55
        ? -0.18 * state.leverageStress * state.vol
        : 0.14 * state.leverageStress * state.vol;

    const predictedStepLogDrift =
      thinOpenDriftScale *
      (state.drift + cexContributionLog + levContributionLog + anchorPullLog) *
      dt;

    const predLogLevel = state.logLevel + predictedStepLogDrift;
    const predVarLog = Math.max(1e-8, stateVarLog + state.vol * state.vol * dt);
    const oneStepPredictedPrice = Math.exp(predLogLevel + 0.5 * predVarLog);
    const predictiveSigmaUsd = Math.max(
      1.0,
      oneStepPredictedPrice * Math.sqrt(predVarLog)
    );

    // 2. Realized measurement on close & Shared Residual Shock Operator
    const realizedPrice = Math.max(1, c.close);
    const shockOut = applyResidualShockOperator({
      assetClass: 'BTC',
      barTimeSec: c.time,
      barIndex: t,
      realizedPrice,
      oneStepPredictedPrice,
      predictiveSigma: predictiveSigmaUsd,
      currentDrift: state.drift,
      currentAnchorPrice: equilibriumAnchorUsd,
      priorCooldownBarsRemaining: cooldownBarsRemaining,
      calibration: shockCalibration,
    });

    cooldownBarsRemaining = shockOut.cooldownBarsRemaining;
    latestBandInflationMult = shockOut.uncertaintyMultiplier;
    if (shockOut.shockFired) {
      shockAuditLog.push(shockOut.auditEntry);
    }

    // Update anchor: normal slow EMA toward realized price, or immediate shock recentering from shockOut
    if (shockOut.shockFired) {
      equilibriumAnchorUsd = shockOut.mutatedAnchorPrice;
      state.drift = shockOut.mutatedDrift;
    } else {
      equilibriumAnchorUsd = 0.92 * equilibriumAnchorUsd + 0.08 * realizedPrice;
    }

    // Kalman measurement update on logLevel (inflate prior state uncertainty on structural shock so filter snaps to post-shock price)
    const obsLogP = Math.log(realizedPrice);
    const obsNoiseVar = Math.max(1e-8, (barRangesLog[t] * barRangesLog[t] * 0.22) / Math.max(0.3, dt));
    const effectivePredVarLog = shockOut.shockFired
      ? Math.max(predVarLog * shockOut.uncertaintyMultiplier * 3.5, obsNoiseVar * 3.5)
      : predVarLog;
    const kalmanGain = effectivePredVarLog / (effectivePredVarLog + obsNoiseVar);
    const logInnovation = obsLogP - predLogLevel;

    state.logLevel = predLogLevel + kalmanGain * logInnovation;
    stateVarLog = Math.max(
      1e-8,
      (1 - kalmanGain) * effectivePredVarLog
    );

    // Update drift, vol, cexPressure, leverageStress, resilience
    const realizedStepLogRet = Math.log(realizedPrice / Math.max(1, prevC.close));
    const driftDecay = Math.exp(-0.26 * dt);
    const updatedRawDrift =
      driftDecay * state.drift + (1 - driftDecay) * (realizedStepLogRet / Math.max(0.4, dt));
    state.drift = shockOut.shockFired
      ? (1 - (shockCalibration?.driftShrinkAlpha ?? 0.65)) * updatedRawDrift
      : updatedRawDrift;

    const volDecay = Math.exp(-0.24 * dt);
    state.vol = Math.max(
      0.0004,
      Math.min(0.08, volDecay * state.vol + (1 - volDecay) * barRangesLog[t])
    );

    // Aggressive CEX pressure from intrabar signed close-location & activity clock burst
    const rawCexImpulse = Math.max(
      -1,
      Math.min(1, barSignedImbalances[t] * Math.min(1.6, dt))
    );
    state.cexPressure = Math.max(
      -1,
      Math.min(1, 0.58 * state.cexPressure + 0.42 * rawCexImpulse)
    );

    // Optional verified derivatives update for leverageStress
    const levObs = findLeverageObsAt(c.time);
    const obsLevStress = computeLeverageStressFromObs(levObs);
    if (obsLevStress !== null) {
      state.leverageStress = Math.max(
        -1,
        Math.min(1, 0.55 * state.leverageStress + 0.45 * obsLevStress)
      );
    } else {
      // Without verified derivatives feed at bar t, decay leverageStress toward 0 (do not invent funding/OI)
      state.leverageStress = 0.85 * state.leverageStress;
    }

    // Update book resilience from wick absorption vs directional continuation
    const fullRange = Math.max(1e-6, c.high - c.low);
    const bodyRange = Math.abs(c.close - c.open);
    const wickAbsorptionFraction = Math.max(0, Math.min(1, 1 - bodyRange / fullRange));
    const shockResiliencePenalty = shockOut.shockFired ? -0.18 : 0;
    state.resilience = Math.max(
      0.12,
      Math.min(
        0.98,
        0.72 * state.resilience +
          0.28 * (0.55 + 0.4 * wickAbsorptionFraction + shockResiliencePenalty)
      )
    );

    // Update pending pulse echoes
    for (let pIdx = pendingPulseEchoes.length - 1; pIdx >= 0; pIdx--) {
      const item = pendingPulseEchoes[pIdx];
      item.barsElapsed++;
      const postPulseMove = realizedPrice - item.pulseClosePrice;
      const retracedUsd =
        item.signedImpulseUsd !== 0
          ? -Math.sign(item.signedImpulseUsd) * postPulseMove
          : 0;
      const recoveryRatio =
        Math.abs(item.signedImpulseUsd) > 1e-6
          ? Math.max(0, Math.min(1.5, retracedUsd / Math.abs(item.signedImpulseUsd)))
          : 0;
      item.pulse.recovery = Number(recoveryRatio.toFixed(4));
      item.pulse.absorbed = recoveryRatio >= 0.38;
      if (item.barsElapsed >= 3) {
        pendingPulseEchoes.splice(pIdx, 1);
      }
    }

    // 3. B4 Pulse–Echo Detection at bar t
    const absRetRatio = Math.abs(realizedStepLogRet) / Math.max(0.0005, baseVol);
    const rangeRatio = barRangesLog[t] / Math.max(0.0005, baseVol);
    const signedMoveUsd = realizedPrice - prevC.close;
    const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
      signedMoveUsd > 0 ? 'BULLISH' : signedMoveUsd < 0 ? 'BEARISH' : 'NEUTRAL';

    const registerPulse = (type: BtcPulseType, mag: number, summaryEn: string) => {
      const pulseEvent: BtcPulseEchoEvent = {
        pulseId: `btc-pulse-${type.toLowerCase()}-${c.time}-${t}`,
        barIndex: t,
        timestampSec: c.time,
        type,
        direction,
        impulseMagnitude: Number(mag.toFixed(4)),
        impact: Number(Math.abs(signedMoveUsd).toFixed(2)),
        recovery: 0,
        absorbed: wickAbsorptionFraction >= 0.48,
        summaryEn,
      };
      pulses.push(pulseEvent);
      pendingPulseEchoes.push({
        pulse: pulseEvent,
        prePulsePrice: prevC.close,
        pulseClosePrice: realizedPrice,
        signedImpulseUsd: signedMoveUsd,
        barsElapsed: 0,
      });
    };

    if (Math.abs(rawCexImpulse) >= 0.72 && dt >= 1.25) {
      registerPulse(
        'AGGRESSIVE_CEX_IMPULSE',
        Math.abs(rawCexImpulse) * dt,
        `Aggressive CEX directional sweep (${direction}, Δτ=${dt.toFixed(2)}, CLV=${barSignedImbalances[t].toFixed(2)}).`
      );
    }
    if (
      (levObs &&
        typeof levObs.liquidationImbalanceNorm === 'number' &&
        Math.abs(levObs.liquidationImbalanceNorm) >= 0.6) ||
      (shockOut.shockFired && absRetRatio >= 2.2 && wickAbsorptionFraction >= 0.35)
    ) {
      registerPulse(
        'LIQUIDATION_CASCADE',
        absRetRatio,
        `Forced deleveraging / liquidation cascade signature (${direction}, |z|=${Math.abs(shockOut.zScore).toFixed(2)}σ).`
      );
    }
    if (
      levObs &&
      typeof levObs.fundingRate8h === 'number' &&
      Math.abs(levObs.fundingRate8h) >= 0.00045
    ) {
      registerPulse(
        'FUNDING_SHOCK',
        Math.abs(levObs.fundingRate8h) * 10000,
        `Perpetual funding rate dislocation (${(levObs.fundingRate8h * 100).toFixed(4)}% per 8h).`
      );
    }
    if (rangeRatio >= 1.85) {
      registerPulse(
        'RANGE_VOL_BURST',
        rangeRatio,
        `Intraday range volatility expansion (${rangeRatio.toFixed(2)}x trailing baseline).`
      );
    }
    if (
      levObs &&
      typeof levObs.markSpotBasisBps === 'number' &&
      Math.abs(levObs.markSpotBasisBps) >= 22
    ) {
      registerPulse(
        'BASIS_DISLOCATION',
        Math.abs(levObs.markSpotBasisBps),
        `Perpetual mark–spot basis dislocation (${levObs.markSpotBasisBps.toFixed(1)} bps).`
      );
    }

    const dUtc = new Date(c.time * 1000).getUTCDay();
    const isWeekendUtc = dUtc === 0 || dUtc === 6;

    residualBars.push({
      barIndex: t,
      timestampSec: c.time,
      predicted: Number(oneStepPredictedPrice.toFixed(2)),
      realized: Number(realizedPrice.toFixed(2)),
      residual: Number(shockOut.residual.toFixed(2)),
      predictiveSigma: Number(predictiveSigmaUsd.toFixed(2)),
      z: Number(shockOut.zScore.toFixed(3)),
      shockFired: shockOut.shockFired,
      deltaTau: dt,
      isWeekendUtc,
      anchorPriceAfterUpdate: Number(equilibriumAnchorUsd.toFixed(2)),
      driftAfterUpdate: Number(state.drift.toFixed(8)),
    });
  }

  // 4. B5 Residual Oracle Summary
  const mBars = residualBars.length;
  const sqErrSum = residualBars.reduce((acc, r) => acc + r.residual * r.residual, 0);
  const rmse = mBars > 0 ? Number(Math.sqrt(sqErrSum / mBars).toFixed(4)) : 0;
  const lag1Autocorrelation = Number(
    pearsonAutocorrLag1(residualBars.map(r => r.residual)).toFixed(4)
  );
  const shocksFired = residualBars.filter(r => r.shockFired).length;

  // Mean absolute error on the bar immediately following each fired shock
  const postShockErrors: number[] = [];
  for (let i = 0; i < mBars - 1; i++) {
    if (residualBars[i].shockFired) {
      postShockErrors.push(Math.abs(residualBars[i + 1].residual));
    }
  }
  const meanAbsPostShockError =
    postShockErrors.length > 0
      ? Number(
          (
            postShockErrors.reduce((a, b) => a + b, 0) / postShockErrors.length
          ).toFixed(4)
        )
      : 0;

  const weekendBars = residualBars.filter(r => r.isWeekendUtc);
  const weekdayBars = residualBars.filter(r => !r.isWeekendUtc);
  const weekendRmse =
    weekendBars.length > 0
      ? Number(
          Math.sqrt(
            weekendBars.reduce((acc, r) => acc + r.residual * r.residual, 0) /
              weekendBars.length
          ).toFixed(4)
        )
      : 0;
  const weekdayRmse =
    weekdayBars.length > 0
      ? Number(
          Math.sqrt(
            weekdayBars.reduce((acc, r) => acc + r.residual * r.residual, 0) /
              weekdayBars.length
          ).toFixed(4)
        )
      : 0;

  const latestResBar = residualBars[mBars - 1];
  const residualOracle: BtcResidualOracleSummary = {
    barsEvaluated: mBars,
    rmse,
    lag1Autocorrelation,
    shocksFired,
    meanAbsPostShockError,
    weekendRmse,
    weekdayRmse,
    latestResidual: latestResBar ? latestResBar.residual : 0,
    latestZ: latestResBar ? latestResBar.z : 0,
    latestShockFired: latestResBar ? latestResBar.shockFired : false,
    bars: residualBars,
    shockAuditLog,
  };

  // 5. B8 Leverage & Chain Satellite Status
  const latestLevObs =
    validLeverageSeries.length > 0
      ? validLeverageSeries[validLeverageSeries.length - 1]
      : null;

  let leverageRegime: BtcLeverageRegime = 'UNKNOWN';
  if (hasVerifiedLeverageChannel) {
    const absStress = Math.abs(state.leverageStress);
    const hasCascadePulse = pulses
      .slice(-5)
      .some(p => p.type === 'LIQUIDATION_CASCADE' || p.type === 'FUNDING_SHOCK');
    if (absStress >= 0.68 || hasCascadePulse) {
      leverageRegime = 'CASCADE_RISK';
    } else if (absStress >= 0.32) {
      leverageRegime = 'CROWDED';
    } else {
      leverageRegime = 'QUIET';
    }
  }

  const leverageChannel: BtcLeverageChannelStatus = hasVerifiedLeverageChannel
    ? {
        status: validLeverageSeries.length === 1 ? 'VERIFIED_LIVE' : 'VERIFIED_SERIES',
        source: latestLevObs?.venue || 'Multi-Venue Perp Telemetry',
        observationsCount: validLeverageSeries.length,
        latestFundingRate8h:
          typeof latestLevObs?.fundingRate8h === 'number'
            ? latestLevObs.fundingRate8h
            : null,
        latestMarkSpotBasisBps:
          typeof latestLevObs?.markSpotBasisBps === 'number'
            ? Number(latestLevObs.markSpotBasisBps.toFixed(2))
            : null,
        latestOpenInterestChangePct:
          typeof latestLevObs?.openInterestChangePct === 'number'
            ? Number(latestLevObs.openInterestChangePct.toFixed(3))
            : null,
        latestLiquidationImbalanceNorm:
          typeof latestLevObs?.liquidationImbalanceNorm === 'number'
            ? Number(latestLevObs.liquidationImbalanceNorm.toFixed(3))
            : null,
        computedLeverageStress: Number(state.leverageStress.toFixed(4)),
        leverageRegime,
        noteEn: `Verified perpetual derivatives channel active (${validLeverageSeries.length} observations; regime=${leverageRegime}).`,
      }
    : {
        status: 'UNAVAILABLE',
        source: 'UNAVAILABLE',
        observationsCount: 0,
        latestFundingRate8h: null,
        latestMarkSpotBasisBps: null,
        latestOpenInterestChangePct: null,
        latestLiquidationImbalanceNorm: null,
        computedLeverageStress: 0,
        leverageRegime: 'UNKNOWN',
        noteEn:
          'Verified perpetual derivatives feed unavailable; failing closed to UNAVAILABLE without synthetic funding or open interest.',
      };

  const chainSatelliteStatus = evaluateChainSatellitePlaceboTest({
    residuals: residualBars,
    chainObservations: causalChainSatellite,
  });

  // 6. B7 BTC Awareness Brain
  const lastCandle = candles[n - 1];
  const latestSession = evaluateCryptoSessionAndCalendar({
    timestampSec: lastCandle.time,
    candles,
  });

  const isPostShock = Boolean(latestResBar?.shockFired || cooldownBarsRemaining > 0);
  const isStructuredResidual = Math.abs(lag1Autocorrelation) >= 0.22;
  const residualHealth: BtcResidualHealth = isPostShock
    ? 'POST_SHOCK'
    : isStructuredResidual
    ? 'STRUCTURED'
    : 'OK';

  const awarenessFaults: BtcAwarenessFaultCode[] = [];
  if (isPostShock) awarenessFaults.push('POST_SHOCK_COOLDOWN');
  if (isStructuredResidual) awarenessFaults.push('RESIDUAL_STRUCTURED');
  if (leverageRegime === 'CASCADE_RISK' || Math.abs(state.leverageStress) >= 0.55) {
    awarenessFaults.push('LEVERAGE_STRESS_HIGH');
  }
  if (latestSession.isThinOpen) {
    awarenessFaults.push('THIN_OPEN_PARTICIPATION');
  }
  if (!hasVerifiedLeverageChannel) {
    awarenessFaults.push('DERIVATIVES_CHANNEL_UNAVAILABLE');
  }
  if (
    latestLevObs &&
    typeof latestLevObs.markSpotBasisBps === 'number' &&
    Math.abs(latestLevObs.markSpotBasisBps) >= 22
  ) {
    awarenessFaults.push('BASIS_DISLOCATION_ACTIVE');
  }

  const blockAutoPromotion =
    isPostShock || isStructuredResidual || leverageRegime === 'CASCADE_RISK';

  const awareness: BtcAwarenessState = {
    assetClass: 'BTC',
    isFuturesClosed: false,
    isThinOpen: latestSession.isThinOpen,
    driftPolicy: latestSession.driftPolicy,
    faults: awarenessFaults,
    leverageRegime,
    residualHealth,
    blockAutoPromotion,
    cooldownBarsRemaining,
    session: latestSession,
    summaryEn: `BDF-B Awareness [${latestSession.weekpart} · ${latestSession.sessionId}] | isFuturesClosed=false | DriftPolicy=${latestSession.driftPolicy} | ResidualHealth=${residualHealth} | LeverageRegime=${leverageRegime} | Faults=${awarenessFaults.join(', ') || 'NONE'}`,
  };

  // 7. B6 Dual Plume Generation:
  // Independently compute Conditional Expectation E[P_{t+h}|F_t] (Duan smearing) and Predictive Median Q_{0.50}(P_{t+h}|F_t)
  // for both Live (World A) and Parallel Candidate (World B), with Direct Horizon-h Empirical FHS + ACI quantiles.
  const liveForecast: BtcForecastTrackPoint[] = [];
  const liveExperimentalForecast: BtcForecastTrackPoint[] = [];
  const candidateForecast: BtcForecastTrackPoint[] = [];
  const candidateExperimentalForecast: BtcForecastTrackPoint[] = [];
  const confidenceBand: BtcConfidenceBandPoint[] = [];
  const candidateBand: BtcConfidenceBandPoint[] = [];

  const currentSpot = Math.max(1, lastCandle.close);
  let simLiveLog = Math.log(currentSpot);
  let simLiveDrift = state.drift;
  let simLiveCex = state.cexPressure;
  let simLiveLev = state.leverageStress;
  let simLiveVar = 0;
  let simCandVar = 0;

  // Causal empirical close-to-close log return variance and Direct Horizon-h FHS standardized residuals
  const trailingBtcRets = logReturns.slice(Math.max(1, n - 120), n);
  const meanBtcRet =
    trailingBtcRets.length > 0
      ? trailingBtcRets.reduce((a, b) => a + b, 0) / trailingBtcRets.length
      : 0;
  const empBtcCloseVar =
    trailingBtcRets.length > 1
      ? trailingBtcRets.reduce((a, r) => a + (r - meanBtcRet) ** 2, 0) /
        (trailingBtcRets.length - 1)
      : state.vol * state.vol;
  const empBtcCloseStd = Math.sqrt(Math.max(1e-10, empBtcCloseVar));

  const pickBtcQuantile = (sorted: number[], q: number, fallback: number): number => {
    if (sorted.length < 10) return fallback;
    const pos = Math.max(0, Math.min(sorted.length - 1, q * (sorted.length - 1)));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const frac = pos - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };

  const signedStdBtc1 = trailingBtcRets.map(r => (r - meanBtcRet) / empBtcCloseStd);
  const sortedSignedBtc1 = [...signedStdBtc1].sort((a, b) => a - b);

  let btcAciOffset90 = 0;
  if (residualBars.length >= 16) {
    const recentBtcRes = residualBars.slice(-48);
    let misses90 = 0;
    for (const rBar of recentBtcRes) {
      if (Math.abs(rBar.z) > 1.6448536) {
        misses90++;
      }
    }
    const empMissRate = misses90 / recentBtcRes.length;
    btcAciOffset90 = Math.max(-0.12, Math.min(0.35, (empMissRate - 0.10) * 1.25));
  }

  const computeBtcDirectHorizonStats = (h: number, predStdH: number) => {
    const hRets: number[] = [];
    const startIdx = Math.max(h, n - 120);
    for (let idx = startIdx; idx < n; idx++) {
      hRets.push(
        Math.log(Math.max(1e-6, candles[idx].close) / Math.max(1e-6, candles[idx - h].close))
      );
    }
    const scaleH = Math.max(1e-10, Math.sqrt(h) * empBtcCloseStd);
    let stdResH: number[];
    if (hRets.length >= 14) {
      const meanH = hRets.reduce((a, b) => a + b, 0) / hRets.length;
      stdResH = hRets.map(r => (r - meanH) / scaleH);
    } else {
      stdResH = signedStdBtc1.length > 0 ? signedStdBtc1 : [-1.645, -0.674, 0, 0.674, 1.645];
    }
    const sortedH = [...stdResH].sort((a, b) => a - b);
    const q05Raw = pickBtcQuantile(sortedH, 0.05, -1.6448536269514722);
    const q25Raw = pickBtcQuantile(sortedH, 0.25, -0.6744897501960817);
    const q50Raw = pickBtcQuantile(sortedH, 0.50, 0.0);
    const q75Raw = pickBtcQuantile(sortedH, 0.75, 0.6744897501960817);
    const q95Raw = pickBtcQuantile(sortedH, 0.95, 1.6448536269514722);

    const q50 = Math.max(-0.35, Math.min(0.35, q50Raw));
    const q75 = Math.max(q50 + 0.25, q75Raw + 0.5 * btcAciOffset90);
    const q25 = Math.min(q50 - 0.25, q25Raw - 0.5 * btcAciOffset90);
    const q95 = Math.max(q75 + 0.35, q95Raw + btcAciOffset90);
    const q05 = Math.min(q25 - 0.35, q05Raw - btcAciOffset90);

    let smearingSum = 0;
    const sampleArr = stdResH.length >= 8 ? stdResH : sortedSignedBtc1;
    if (sampleArr.length >= 8) {
      for (let i = 0; i < sampleArr.length; i++) {
        const clampedE = Math.max(-6, Math.min(6, sampleArr[i]));
        smearingSum += Math.exp(predStdH * clampedE);
      }
      smearingSum /= sampleArr.length;
    } else {
      smearingSum = Math.exp(0.5 * predStdH * predStdH);
    }
    const duanSmearingFactor = Math.max(0.95, Math.min(1.15, smearingSum));
    return { q05, q25, q50, q75, q95, duanSmearingFactor };
  };

  // Variance-ratio-gated OU pull strictly restricted to 1h (3600s) and 4h (14400s) per Critique #3
  let vr4Btc = 1.0;
  if (trailingBtcRets.length >= 16 && empBtcCloseVar > 1e-12) {
    const r4List: number[] = [];
    for (let i = 3; i < trailingBtcRets.length; i++) {
      r4List.push(
        trailingBtcRets[i] +
          trailingBtcRets[i - 1] +
          trailingBtcRets[i - 2] +
          trailingBtcRets[i - 3]
      );
    }
    const m4 = r4List.reduce((a, b) => a + b, 0) / r4List.length;
    const var4 =
      r4List.reduce((a, r) => a + (r - m4) ** 2, 0) / Math.max(1, r4List.length - 1);
    vr4Btc = var4 / (4 * empBtcCloseVar);
  }
  const isBtc1hOr4h = intervalStepSeconds === 3600 || intervalStepSeconds === 14400;
  const btcVrOuPullGate = isBtc1hOr4h
    ? vr4Btc < 0.85
      ? Math.max(0, Math.min(1, (0.85 - vr4Btc) / 0.35))
      : 0
    : 0;

  // Candidate challenger track dissents after shock or structured residual (absorption / mean-reversion / faster de-stress)
  const recentShockBars = residualBars.slice(-4);
  const anyRecentShock = recentShockBars.some(r => r.shockFired);
  const latestPulse = pulses.length > 0 ? pulses[pulses.length - 1] : null;
  const shouldCandidateDissent =
    isPostShock ||
    anyRecentShock ||
    isStructuredResidual ||
    Math.abs(latestResBar?.z ?? 0) >= 1.4 ||
    Boolean(latestPulse && lastCandle.time - latestPulse.timestampSec <= intervalStepSeconds * 4);

  let simCandLog = Math.log(currentSpot);
  const latestResSign = Math.sign(latestResBar?.residual || state.drift || -1);
  // If shock or structured residual occurred, candidate models liquidity absorption & mean-reversion counter-hypothesis
  let simCandDrift = shouldCandidateDissent
    ? -0.45 * state.drift - 0.32 * latestResSign * state.vol
    : 0.65 * state.drift;
  let simCandCex = shouldCandidateDissent ? -0.35 * state.cexPressure : 0.5 * state.cexPressure;
  let simCandVol = shouldCandidateDissent ? state.vol * 1.12 : state.vol * 0.96;
  const candAnchorLog = Math.log(
    Math.max(
      1,
      shouldCandidateDissent
        ? 0.6 * equilibriumAnchorUsd + 0.4 * currentSpot
        : equilibriumAnchorUsd
    )
  );
  const liveAnchorLog = Math.log(Math.max(1, equilibriumAnchorUsd));
  const candOuGate = isBtc1hOr4h ? btcVrOuPullGate : shouldCandidateDissent ? 0.45 : 0;

  let prevLiveUp75 = 0;
  let prevLiveLo25 = 0;
  let prevLiveUp95 = 0;
  let prevLiveLo05 = 0;
  let prevCandUp75 = 0;
  let prevCandLo25 = 0;
  let prevCandUp95 = 0;
  let prevCandLo05 = 0;

  for (let h = 1; h <= horizonSteps; h++) {
    const stepTime = lastCandle.time + h * intervalStepSeconds;
    const stepSession = evaluateCryptoSessionAndCalendar({
      timestampSec: stepTime,
      candles,
    });

    // Continuous 24/7 crypto participation scale (never 0)
    const stepDriftScale = stepSession.isThinOpen ? stepSession.driftScaleFactor : 1.0;
    const stepTau = stepSession.isThinOpen ? 0.78 : 1.0;

    // Live track evolution (with variance-ratio-gated OU pull strictly on 1h/4h)
    const liveEqPull = 0.075 * btcVrOuPullGate * (liveAnchorLog - simLiveLog);
    const liveFlowTerm =
      0.22 * (simLiveCex / Math.max(0.25, state.resilience)) * state.vol +
      0.12 * simLiveLev * state.vol;
    const liveStepLogMove =
      stepDriftScale * (simLiveDrift + liveFlowTerm + liveEqPull) * stepTau;

    simLiveLog += liveStepLogMove;
    simLiveDrift = 0.82 * simLiveDrift + 0.18 * liveEqPull;
    simLiveCex *= 0.76;
    simLiveLev *= 0.84;

    // Candidate track step evolution (independent state ownership & dynamics)
    const candEqPull =
      (shouldCandidateDissent ? 0.19 : 0.12) * candOuGate * (candAnchorLog - simCandLog);
    const candAutocorrCorrection =
      isStructuredResidual && latestResBar
        ? -0.25 * lag1Autocorrelation * (latestResBar.residual / currentSpot) * Math.exp(-0.22 * h)
        : 0;
    const candStepLogMove =
      stepDriftScale *
      (simCandDrift +
        0.16 * simCandCex * simCandVol +
        candEqPull +
        candAutocorrCorrection) *
      stepTau;

    simCandLog += candStepLogMove;
    simCandDrift = 0.72 * simCandDrift + 0.28 * candEqPull;
    simCandCex *= 0.68;
    simCandVol = 0.88 * simCandVol + 0.12 * empBtcCloseStd;

    // Independent Live vs Candidate predictive variances + Direct-h FHS quantiles
    const blendedLiveStepVar = 0.80 * empBtcCloseVar + 0.20 * (state.vol * state.vol);
    const blendedCandStepVar = 0.75 * empBtcCloseVar + 0.25 * (simCandVol * simCandVol);
    simLiveVar += Math.max(1e-8, blendedLiveStepVar);
    simCandVar += Math.max(1e-8, blendedCandStepVar);
    const effLiveStdLog = Math.sqrt(Math.max(1e-8, simLiveVar));
    const effCandStdLog = Math.sqrt(Math.max(1e-8, simCandVar));

    const empLiveH = computeBtcDirectHorizonStats(h, effLiveStdLog);
    const empCandH = computeBtcDirectHorizonStats(h, effCandStdLog);

    const liveMedLog = simLiveLog + empLiveH.q50 * effLiveStdLog;
    const candMedLog = simCandLog + empCandH.q50 * effCandStdLog;

    const liveMedVal = Number(Math.exp(liveMedLog).toFixed(2));
    const liveExpVal = Number((Math.exp(simLiveLog) * empLiveH.duanSmearingFactor).toFixed(2));
    const candMedVal = Number(Math.exp(candMedLog).toFixed(2));
    const candExpVal = Number((Math.exp(simCandLog) * empCandH.duanSmearingFactor).toFixed(2));

    liveForecast.push({ step: h, time: stepTime, value: liveMedVal });
    liveExperimentalForecast.push({ step: h, time: stepTime, value: liveExpVal });
    candidateForecast.push({ step: h, time: stepTime, value: candMedVal });
    candidateExperimentalForecast.push({ step: h, time: stepTime, value: candExpVal });

    const liveUp75Off = Math.max(prevLiveUp75 + 1e-5, Math.max(0.15 * effLiveStdLog, (empLiveH.q75 - empLiveH.q50) * effLiveStdLog));
    const liveLo25Off = Math.max(prevLiveLo25 + 1e-5, Math.max(0.15 * effLiveStdLog, (empLiveH.q50 - empLiveH.q25) * effLiveStdLog));
    const liveUp95Off = Math.max(prevLiveUp95 + 1e-5, Math.max(liveUp75Off + 0.15 * effLiveStdLog, (empLiveH.q95 - empLiveH.q50) * effLiveStdLog));
    const liveLo05Off = Math.max(prevLiveLo05 + 1e-5, Math.max(liveLo25Off + 0.15 * effLiveStdLog, (empLiveH.q50 - empLiveH.q05) * effLiveStdLog));
    prevLiveUp75 = liveUp75Off;
    prevLiveLo25 = liveLo25Off;
    prevLiveUp95 = liveUp95Off;
    prevLiveLo05 = liveLo05Off;

    confidenceBand.push({
      step: h,
      time: stepTime,
      upper95: Number(Math.exp(liveMedLog + liveUp95Off).toFixed(2)),
      upper75: Number(Math.exp(liveMedLog + liveUp75Off).toFixed(2)),
      lower25: Number(Math.exp(liveMedLog - liveLo25Off).toFixed(2)),
      lower05: Number(Math.exp(liveMedLog - liveLo05Off).toFixed(2)),
    });

    const candUp75Off = Math.max(prevCandUp75 + 1e-5, Math.max(0.15 * effCandStdLog, (empCandH.q75 - empCandH.q50) * effCandStdLog));
    const candLo25Off = Math.max(prevCandLo25 + 1e-5, Math.max(0.15 * effCandStdLog, (empCandH.q50 - empCandH.q25) * effCandStdLog));
    const candUp95Off = Math.max(prevCandUp95 + 1e-5, Math.max(candUp75Off + 0.15 * effCandStdLog, (empCandH.q95 - empCandH.q50) * effCandStdLog));
    const candLo05Off = Math.max(prevCandLo05 + 1e-5, Math.max(candLo25Off + 0.15 * effCandStdLog, (empCandH.q50 - empCandH.q05) * effCandStdLog));
    prevCandUp75 = candUp75Off;
    prevCandLo25 = candLo25Off;
    prevCandUp95 = candUp95Off;
    prevCandLo05 = candLo05Off;

    candidateBand.push({
      step: h,
      time: stepTime,
      upper95: Number(Math.exp(candMedLog + candUp95Off).toFixed(2)),
      upper75: Number(Math.exp(candMedLog + candUp75Off).toFixed(2)),
      lower25: Number(Math.exp(candMedLog - candLo25Off).toFixed(2)),
      lower05: Number(Math.exp(candMedLog - candLo05Off).toFixed(2)),
    });
  }

  const trackDiffs = liveForecast.map((pt, idx) =>
    Math.abs(pt.value - (candidateForecast[idx]?.value ?? pt.value))
  );
  const meanAbsTrackDissentUsd =
    trackDiffs.length > 0
      ? Number((trackDiffs.reduce((a, b) => a + b, 0) / trackDiffs.length).toFixed(2))
      : 0;
  const maxAbsTrackDissentUsd =
    trackDiffs.length > 0 ? Number(Math.max(...trackDiffs).toFixed(2)) : 0;
  const step12Idx = Math.min(11, Math.max(0, trackDiffs.length - 1));
  const step12DissentUsd = Number((trackDiffs[step12Idx] ?? 0).toFixed(2));

  const quantileMultipliers = [-1.35, -0.75, -0.25, 0.25, 0.75, 1.35];
  const buildEnsemblePlume = (
    medianPts: BtcForecastTrackPoint[],
    condExpPts: BtcForecastTrackPoint[],
    bandPts: BtcConfidenceBandPoint[]
  ): EnsemblePlume => {
    const medTrack = medianPts.map(p => ({ time: p.time, value: p.value }));
    const expTrack = condExpPts.map(p => ({ time: p.time, value: p.value }));
    const wedge =
      expTrack.length > 0 && medTrack.length > 0
        ? Number((expTrack[expTrack.length - 1].value - medTrack[medTrack.length - 1].value).toFixed(4))
        : 0;
    return {
      medianTrack: medTrack,
      predictiveMedianTrack: medTrack,
      conditionalExpectationTrack: expTrack,
      experimentalDriftTrack: expTrack,
      meanMedianSkewWedgeUsd: wedge,
      horizonDistributionMethod: 'DIRECT_HORIZON_EMPIRICAL_FHS_ACI',
      directionalGatePassed,
      upper95: bandPts.map(b => ({ time: b.time, value: b.upper95 })),
      upper75: bandPts.map(b => ({ time: b.time, value: b.upper75 })),
      lower25: bandPts.map(b => ({ time: b.time, value: b.lower25 })),
      lower05: bandPts.map(b => ({ time: b.time, value: b.lower05 })),
      sampleTracks: quantileMultipliers.map((qMult, idx) => ({
        id: idx,
        path: medianPts.map((p, sIdx) => {
          const b = bandPts[sIdx];
          const halfSpread = b ? Math.max(1, (b.upper75 - b.lower25) * 0.5) : currentSpot * 0.005;
          return {
            time: p.time,
            value: Number((p.value + qMult * halfSpread).toFixed(2)),
          };
        }),
      })),
    };
  };

  const liveEnsemblePlume = buildEnsemblePlume(
    liveForecast,
    liveExperimentalForecast,
    confidenceBand
  );
  const candidateEnsemblePlume = buildEnsemblePlume(
    candidateForecast,
    candidateExperimentalForecast,
    candidateBand
  );

  diagnosticsEn.push(
    `BDF-B v1.0 evaluated ${n} spot BTC bars on 24/7 continuous calendar (${latestSession.weekpart}, isFuturesClosed=false).`,
    `6D Latent State: logLevel=${state.logLevel.toFixed(5)} ($${Math.exp(state.logLevel).toFixed(2)}), drift=${state.drift.toFixed(6)}, vol=${state.vol.toFixed(5)}, cexPressure=${state.cexPressure.toFixed(3)}, leverageStress=${state.leverageStress.toFixed(3)}, resilience=${state.resilience.toFixed(3)}.`,
    `Residual Oracle: 1-step RMSE=$${rmse.toFixed(2)}, lag-1 ρ=${lag1Autocorrelation.toFixed(3)}, shocksFired=${shocksFired}, meanAbsPostShockError=$${meanAbsPostShockError.toFixed(2)}.`,
    `Candidate Dissent: active=${shouldCandidateDissent}, meanAbsDissent=$${meanAbsTrackDissentUsd.toFixed(2)}, maxAbsDissent=$${maxAbsTrackDissentUsd.toFixed(2)}.`,
    leverageChannel.noteEn,
    chainSatelliteStatus.noteEn
  );

  return {
    ok: true,
    assetClass: 'BTC',
    version: 'BDF-B-1.0.0',
    state: {
      logLevel: Number(state.logLevel.toFixed(6)),
      drift: Number(state.drift.toFixed(8)),
      vol: Number(state.vol.toFixed(6)),
      cexPressure: Number(state.cexPressure.toFixed(4)),
      leverageStress: Number(state.leverageStress.toFixed(4)),
      resilience: Number(state.resilience.toFixed(4)),
    },
    equilibriumAnchorUsd: Number(equilibriumAnchorUsd.toFixed(2)),
    activityClockLatestDeltaTau: deltaTauSeries[n - 1] || 1.0,
    liveForecast,
    candidateForecast,
    confidenceBand,
    candidateDissentSummary: {
      dissentActive: shouldCandidateDissent,
      dissentReason: shouldCandidateDissent
        ? isPostShock
          ? 'Post-shock absorption & equilibrium mean-reversion challenger'
          : isStructuredResidual
          ? 'Structured residual autocorrelation counter-hypothesis'
          : 'Recent pulse-echo absorption challenger'
        : 'Nominal continuous regime divergence',
      meanAbsTrackDissentUsd,
      maxAbsTrackDissentUsd,
      step12DissentUsd,
    },
    residualOracle,
    pulses: pulses.slice(-24),
    awareness,
    leverageChannel,
    chainSatellite: chainSatelliteStatus,
    liveEnsemblePlume,
    candidateEnsemblePlume,
    diagnosticsEn,
    yellowColor: '#f5d76e',
    magentaColor: '#e040fb',
  };
}
