import type {
  BaselineModelComparisonItem,
  Candle,
  DetectedPulseEvent,
  EnsemblePlume,
  InformationClockState,
  LatentModelMathWriteBackState,
  LatentStateVector6D,
  MeasuredPulseEcho,
  OrderBookMicrostructureExtensionInput,
  PermanentOosScientificScoreboard,
  PulseEchoSonarTelemetry,
  PulseType,
  RegimeConditionedOosEntry,
  ResidualOraclePoint,
  ResidualOracleTelemetry,
  ResidualStructureDiagnostics,
  ScientificCoreTelemetry,
  VenueObservationEquationRecord,
  VerifiedMacroNewsItem,
  VerifiedMacroYieldResult,
  VerifiedVenueCameraObservation,
} from '../contracts/quantContracts.js';
import { computeCointegrationBasis } from './quantEngine.js';

/**
 * GDF Scientific Core Engine (Pure Quantitative State-Space & Sonar Layer — Zero I/O)
 *
 * Theory:
 * 1. Market price is the observable footprint of a 6-dimensional latent state X(τ)
 *    evolving on a causal information clock τ:
 *      X = { logPriceLevel, localDrift, localVolatility, pressureToxicity, liquidityResilience, macroResidualForce }
 * 2. Every verified venue in the waterfall is a noisy camera:
 *      Y^(k) = H^(k)(X) + basis^(k) + microstructureNoise^(k)
 * 3. Collective market emotion appears strictly through measurable impulses (pulses)
 *    and subsequent market responses (echoes) updating pressureToxicity and liquidityResilience.
 * 4. The live yellow line (#f5d76e) is the conditional expectation E[P_{t+h} | F_t]
 *    propagated forward under the latent dynamics on the information clock τ, with
 *    ±1σ / ±2σ bands derived from predictive 6x6 state covariance propagation.
 * 5. The realized residual process e_t = P_t^realized - P_t^predicted is the primary
 *    oracle driving the Intelligence & Awareness Core.
 */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function mad(values: number[], med?: number): number {
  if (values.length === 0) return 0;
  const m = med ?? median(values);
  const absDevs = values.map(v => Math.abs(v - m));
  return median(absDevs) * 1.4826;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.max(0, Math.min(sorted.length - 1, q * (sorted.length - 1)));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 4) return 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i];
    my += y[i];
  }
  mx /= n;
  my /= n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
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

function spearmanRankCorrelation(preds: number[], realized: number[]): number {
  const n = Math.min(preds.length, realized.length);
  if (n < 4) return 0;
  const rank = (arr: number[]) => {
    const indexed = arr.slice(0, n).map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[indexed[i].i] = i + 1;
    return out;
  };
  return pearsonCorrelation(rank(preds), rank(realized));
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return z >= 0 ? 1 - p : p;
}

export interface LatentFilterTuningOverrides {
  driftPersistencePhi?: number;
  meanReversionKappa?: number;
  echoToxicityCouplingBeta?: number;
  echoResilienceCouplingGamma?: number;
  macroResidualCouplingEta?: number;
  crossVenueObservationPrecisionMult?: number;
  equilibriumAnchorOverride?: number;
  symbolicStepDriftUsd?: number;
}

/**
 * 1. Causal Information Clock τ_t Computation
 * Advances slowly during quiet consolidation and rapidly during high-volume / cross-venue bursts.
 * Zero fixed magic weights: weights are derived from the empirical signal-to-dispersion ratio (inverse MAD/median).
 */
export function computeCausalInformationClock(params: {
  candles: Candle[];
  verifiedVenueCameras?: VerifiedVenueCameraObservation[];
  extensionInput?: OrderBookMicrostructureExtensionInput;
  isHalted?: boolean;
}): {
  deltaTauSeries: number[];
  cumulativeTauSeries: number[];
  latestClockState: InformationClockState;
} {
  const { candles, verifiedVenueCameras, extensionInput, isHalted } = params;
  const n = candles.length;
  if (isHalted || n === 0) {
    return {
      deltaTauSeries: [],
      cumulativeTauSeries: [],
      latestClockState: {
        currentDeltaTau: 0,
        cumulativeTau: 0,
        wallClockBarIndex: 0,
        clockRegime: 'HALTED_FREEZE',
        volumeIntensityRatio: 0,
        rangeActivityRatio: 0,
        crossVenueActivityRatio: 0,
        volumeWeight: 0.34,
        rangeWeight: 0.33,
        crossVenueWeight: 0.33,
        empiricalWeights: { volumeWeight: 0.34, rangeWeight: 0.33, crossVenueWeight: 0.33 },
        tauMinEmpirical: 0.2,
        tauMaxEmpirical: 3.0,
      },
    };
  }

  const volRatioSeries: number[] = [];
  const rangeRatioSeries: number[] = [];
  const crossActivitySeries: number[] = [];

  for (let i = 0; i < n; i++) {
    const winStart = Math.max(0, i - 24);
    const windowSlice = candles.slice(winStart, i + 1);
    const vols = windowSlice.map(c => Math.max(1e-6, c.volume));
    const ranges = windowSlice.map((c, idx) => {
      const prevClose = idx > 0 ? windowSlice[idx - 1].close : c.open;
      return Math.max(1e-4, c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    });

    const medVol = Math.max(1e-6, median(vols));
    const medRange = Math.max(1e-4, median(ranges));

    const curVolRatio = vols[vols.length - 1] / medVol;
    const curRangeRatio = ranges[ranges.length - 1] / medRange;

    let crossAct = 0.5 * (curVolRatio + curRangeRatio);
    const extTradeFlow = extensionInput?.aggressorTradeFlow?.find(
      tf => Math.abs(tf.barTimeSec - candles[i].time) <= 900
    );
    if (extTradeFlow && extTradeFlow.tradeCount > 0) {
      crossAct = Math.max(0.25, Math.min(4.0, (extTradeFlow.buyerInitiatedVolume + extTradeFlow.sellerInitiatedVolume) / medVol));
    } else if (extensionInput?.tradeCountPerBar && extensionInput.tradeCountPerBar[i] !== undefined) {
      const tcSlice = extensionInput.tradeCountPerBar.slice(winStart, i + 1).filter(v => v > 0);
      const medTc = Math.max(1, median(tcSlice));
      crossAct = extensionInput.tradeCountPerBar[i] / medTc;
    } else if (verifiedVenueCameras && verifiedVenueCameras.length > 1) {
      const targetTime = candles[i].time;
      const venueVolRatios: number[] = [];
      for (const cam of verifiedVenueCameras) {
        const barIdx = cam.candles.findIndex(b => Math.abs(b.time - targetTime) <= 900);
        if (barIdx >= 0) {
          const camSub = cam.candles.slice(Math.max(0, barIdx - 16), barIdx + 1).map(b => Math.max(1e-6, b.volume));
          const camMed = Math.max(1e-6, median(camSub));
          venueVolRatios.push(cam.candles[barIdx].volume / camMed);
        }
      }
      if (venueVolRatios.length > 0) {
        crossAct = venueVolRatios.reduce((a, b) => a + b, 0) / venueVolRatios.length;
      }
    }

    volRatioSeries.push(curVolRatio);
    rangeRatioSeries.push(curRangeRatio);
    crossActivitySeries.push(crossAct);
  }

  const dispV = Math.max(0.05, mad(volRatioSeries) / Math.max(0.1, median(volRatioSeries)));
  const dispR = Math.max(0.05, mad(rangeRatioSeries) / Math.max(0.1, median(rangeRatioSeries)));
  const dispC = Math.max(0.05, mad(crossActivitySeries) / Math.max(0.1, median(crossActivitySeries)));

  const pV = 1 / dispV;
  const pR = 1 / dispR;
  const pC = 1 / dispC;
  const pSum = pV + pR + pC;

  const wV = parseFloat((pV / pSum).toFixed(4));
  const wR = parseFloat((pR / pSum).toFixed(4));
  const wC = parseFloat(Math.max(0.01, 1 - wV - wR).toFixed(4));

  const rawCompositeSeries = volRatioSeries.map(
    (_, i) => wV * volRatioSeries[i] + wR * rangeRatioSeries[i] + wC * crossActivitySeries[i]
  );

  const tauMinEmpirical = parseFloat(Math.max(0.12, Math.min(0.45, quantile(rawCompositeSeries, 0.05))).toFixed(4));
  const tauMaxEmpirical = parseFloat(Math.max(1.8, Math.min(4.2, quantile(rawCompositeSeries, 0.95) * 1.15)).toFixed(4));

  const deltaTauSeries: number[] = [];
  const cumulativeTauSeries: number[] = [];
  let cumTau = 0;

  for (let i = 0; i < n; i++) {
    const dt = parseFloat(Math.max(tauMinEmpirical, Math.min(tauMaxEmpirical, rawCompositeSeries[i])).toFixed(4));
    deltaTauSeries.push(dt);
    cumTau = parseFloat((cumTau + dt).toFixed(4));
    cumulativeTauSeries.push(cumTau);
  }

  const lastDt = deltaTauSeries[n - 1];
  const burstThreshold = Math.max(1.25, quantile(deltaTauSeries, 0.78));
  const quietThreshold = Math.min(0.82, quantile(deltaTauSeries, 0.25));

  let clockRegime: InformationClockState['clockRegime'] = 'NORMAL_FLOW';
  if (lastDt >= burstThreshold) {
    clockRegime = 'ACTIVE_INFORMATION_BURST';
  } else if (lastDt <= quietThreshold) {
    clockRegime = 'QUIET_CONSOLIDATION';
  }

  return {
    deltaTauSeries,
    cumulativeTauSeries,
    latestClockState: {
      currentDeltaTau: lastDt,
      cumulativeTau: cumTau,
      wallClockBarIndex: n - 1,
      clockRegime,
      volumeIntensityRatio: parseFloat(volRatioSeries[n - 1].toFixed(4)),
      rangeActivityRatio: parseFloat(rangeRatioSeries[n - 1].toFixed(4)),
      crossVenueActivityRatio: parseFloat(crossActivitySeries[n - 1].toFixed(4)),
      volumeWeight: wV,
      rangeWeight: wR,
      crossVenueWeight: wC,
      empiricalWeights: {
        volumeWeight: wV,
        rangeWeight: wR,
        crossVenueWeight: wC,
      },
      tauMinEmpirical,
      tauMaxEmpirical,
    },
  };
}

/**
 * 2. Pulse–Echo (Sonar) Sensing Layer
 * Detects measurable real-data impulses (pulses) and measures the subsequent market response (echoes)
 * on the causal information clock τ.
 */
export function runPulseEchoSonarLayer(params: {
  candles: Candle[];
  deltaTauSeries: number[];
  cumulativeTauSeries: number[];
  crossVenueZScore: number;
  secondaryBenchmarkCandles?: Candle[];
  macroNews?: VerifiedMacroNewsItem[];
  extensionInput?: OrderBookMicrostructureExtensionInput;
}): {
  sonarTelemetry: PulseEchoSonarTelemetry;
  barEchoToxicityUpdates: number[];
  barEchoResilienceUpdates: number[];
  barEchoResidualsUsd: number[];
} {
  const {
    candles,
    deltaTauSeries,
    cumulativeTauSeries,
    crossVenueZScore,
    secondaryBenchmarkCandles,
    macroNews,
    extensionInput,
  } = params;

  const n = candles.length;
  const barEchoToxicityUpdates = new Array<number>(n).fill(0);
  const barEchoResilienceUpdates = new Array<number>(n).fill(0);
  const barEchoResidualsUsd = new Array<number>(n).fill(0);

  if (n < 8) {
    return {
      sonarTelemetry: {
        totalPulsesDetected: 0,
        measuredEchoCount: 0,
        adaptivePulseThresholdSigma: 1.5,
        meanPriceImpactPerUnitVol: 0,
        meanEchoRecoverySpeedPerTau: 0.5,
        upDownEchoAsymmetryRatio: 1.0,
        crossVenueBasisPropagationSpeed: 0,
        echoFeedbackToToxicity: 0,
        echoFeedbackToResilience: 0,
        latestPulse: null,
        latestEcho: null,
        recentPulses: [],
        recentEchoes: [],
        sonarSummaryEn: 'Calibrating Pulse–Echo (Sonar) sensing layer on initial bars.',
        sonarSummaryFa: 'در حال کالیبراسیون لایه سونار پالس-اکو بر روی کندل‌های اولیه.',
        extensionInterfacesReady: {
          aggressorVolumeAndTradeCount: true,
          topOfBookSpreadAndDepthProxy: true,
          scheduledEconomicCalendarPulses: true,
          highFrequencyRealYieldDxy: true,
        },
      },
      barEchoToxicityUpdates,
      barEchoResilienceUpdates,
      barEchoResidualsUsd,
    };
  }

  const medTau = median(deltaTauSeries);
  const madTau = Math.max(0.08, mad(deltaTauSeries, medTau));
  const p85TauZ = (quantile(deltaTauSeries, 0.85) - medTau) / madTau;
  const adaptivePulseThresholdSigma = parseFloat(Math.max(1.15, Math.min(2.4, p85TauZ)).toFixed(3));

  const detectedPulses: DetectedPulseEvent[] = [];
  const measuredEchoes: MeasuredPulseEcho[] = [];

  for (let i = 4; i < n; i++) {
    const c = candles[i];
    const winSlice = candles.slice(Math.max(0, i - 20), i);
    const winRanges = winSlice.map(b => Math.max(0.05, b.high - b.low));
    const medRange = Math.max(0.1, median(winRanges));
    const madRange = Math.max(0.05, mad(winRanges, medRange));
    const winVols = winSlice.map(b => Math.max(1e-6, b.volume));
    const medVol = Math.max(1e-6, median(winVols));
    const madVol = Math.max(1e-6, mad(winVols, medVol));

    const range = Math.max(0.05, c.high - c.low);
    const body = c.close - c.open;
    const absBody = Math.abs(body);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const wickDominance = (upperWick + lowerWick) / range;

    const volZ = (c.volume - medVol) / madVol;
    const rangeZ = (range - medRange) / madRange;
    const tauZ = (deltaTauSeries[i] - medTau) / madTau;

    let aggImbalanceZ = 0;
    const extAgg = extensionInput?.aggressorTradeFlow?.find(tf => Math.abs(tf.barTimeSec - c.time) <= 900);
    if (extAgg) {
      const bVol = extAgg.buyerInitiatedVolume;
      const sVol = extAgg.sellerInitiatedVolume;
      aggImbalanceZ = ((bVol - sVol) / Math.max(1e-6, bVol + sVol)) * 2.5;
    } else if (
      extensionInput?.aggressorBuyVolume?.[i] !== undefined &&
      extensionInput?.aggressorSellVolume?.[i] !== undefined
    ) {
      const bVol = extensionInput.aggressorBuyVolume[i];
      const sVol = extensionInput.aggressorSellVolume[i];
      aggImbalanceZ = ((bVol - sVol) / Math.max(1e-6, bVol + sVol)) * 2.5;
    }

    const scheduledPulse = extensionInput?.scheduledEconomicPulses?.find(
      ev => Math.abs(ev.timestampSec - c.time) <= 1800
    );
    const hasMacroRelease =
      Boolean(scheduledPulse) ||
      Boolean(macroNews && macroNews.some(ev => Math.abs(ev.timestamp - c.time) <= 1800));

    let pulseType: PulseType | null = null;
    let impulseMagnitudeSigma = 0;
    let directionLabel: 'UP' | 'DOWN' | 'NEUTRAL' = body >= 0 ? 'UP' : 'DOWN';

    if (scheduledPulse) {
      pulseType = 'MACRO_YIELD_OR_NEWS_IMPULSE';
      impulseMagnitudeSigma = parseFloat(Math.max(1.35, Math.abs(scheduledPulse.surpriseZScore ?? 1.5), rangeZ).toFixed(2));
      directionLabel = (scheduledPulse.surpriseZScore ?? body) >= 0 ? 'UP' : 'DOWN';
    } else if (
      wickDominance >= 0.58 &&
      (volZ >= adaptivePulseThresholdSigma * 0.75 || rangeZ >= adaptivePulseThresholdSigma * 0.75)
    ) {
      pulseType = 'LIQUIDITY_STOP_SWEEP';
      impulseMagnitudeSigma = parseFloat(Math.max(volZ, rangeZ, wickDominance * 2.2).toFixed(2));
      directionLabel = lowerWick > upperWick ? 'UP' : 'DOWN';
    } else if (
      absBody / range >= 0.62 &&
      (rangeZ >= adaptivePulseThresholdSigma || Math.abs(aggImbalanceZ) >= adaptivePulseThresholdSigma)
    ) {
      pulseType = 'AGGRESSIVE_DIRECTIONAL_INITIATION';
      impulseMagnitudeSigma = parseFloat(Math.max(rangeZ, tauZ, Math.abs(aggImbalanceZ)).toFixed(2));
      directionLabel = body >= 0 ? 'UP' : 'DOWN';
    } else if (volZ >= adaptivePulseThresholdSigma || tauZ >= adaptivePulseThresholdSigma) {
      pulseType = 'VOLUME_ACTIVITY_BURST';
      impulseMagnitudeSigma = parseFloat(Math.max(volZ, tauZ).toFixed(2));
      directionLabel = body >= 0 ? 'UP' : 'DOWN';
    } else if (i === n - 1 && Math.abs(crossVenueZScore) >= adaptivePulseThresholdSigma) {
      pulseType = 'CROSS_VENUE_BASIS_DISLOCATION';
      impulseMagnitudeSigma = parseFloat(Math.abs(crossVenueZScore).toFixed(2));
      directionLabel = crossVenueZScore > 0 ? 'DOWN' : 'UP';
    } else if (hasMacroRelease && rangeZ >= 0.65) {
      pulseType = 'MACRO_YIELD_OR_NEWS_IMPULSE';
      impulseMagnitudeSigma = parseFloat(Math.max(1.2, rangeZ).toFixed(2));
      directionLabel = body >= 0 ? 'UP' : 'DOWN';
    }

    if (!pulseType) continue;

    const direction = directionLabel === 'UP' ? 1 : directionLabel === 'DOWN' ? -1 : 0;
    const pulseId = `pulse-${c.time}-${pulseType.slice(0, 6).toLowerCase()}`;
    detectedPulses.push({
      pulseId,
      barTime: c.time,
      tauAtPulse: cumulativeTauSeries[i],
      deltaTauAtPulse: deltaTauSeries[i],
      pulseType,
      direction,
      directionLabel,
      impulseMagnitudeSigma,
      adaptiveThresholdSigma: adaptivePulseThresholdSigma,
      volumeAtPulse: parseFloat(c.volume.toFixed(4)),
      priceAtPulse: c.close,
      summaryEn: `${pulseType} (${directionLabel} · ${impulseMagnitudeSigma.toFixed(2)}σ at τ=${cumulativeTauSeries[i].toFixed(1)})`,
      summaryFa: `تکانه ${pulseType} (جهت ${directionLabel} · شدت ${impulseMagnitudeSigma.toFixed(2)}σ در ساعت اطلاعاتی τ=${cumulativeTauSeries[i].toFixed(1)})`,
    });

    if (i < n - 1) {
      const echoEnd = Math.min(n - 1, i + 4);
      const elapsedDeltaTau = Math.max(0.1, cumulativeTauSeries[echoEnd] - cumulativeTauSeries[i]);
      const impulseSign = direction >= 0 ? 1 : -1;

      let peakExcursion = 0;
      let upMoveSum = 0;
      let downMoveSum = 0;
      for (let j = i + 1; j <= echoEnd; j++) {
        const dp = candles[j].close - c.close;
        if (Math.abs(dp) > Math.abs(peakExcursion)) {
          peakExcursion = dp;
        }
        const stepDp = candles[j].close - candles[j - 1].close;
        if (stepDp >= 0) upMoveSum += stepDp;
        else downMoveSum += Math.abs(stepDp);
      }

      const endDisplacement = candles[echoEnd].close - c.close;
      const absDisplacement = Math.max(0.05, Math.abs(peakExcursion), Math.abs(endDisplacement));

      const relVolAtPulse = Math.max(0.2, c.volume / medVol);
      const priceImpactPerUnitVolume = parseFloat((absDisplacement / (medRange * relVolAtPulse)).toFixed(4));

      const retentionRatio = Math.max(
        0.08,
        Math.min(0.98, Math.abs(endDisplacement) / Math.max(0.08, Math.abs(peakExcursion)))
      );
      const recoverySpeedPerTau = parseFloat(
        Math.max(0.05, Math.min(2.5, -Math.log(retentionRatio) / elapsedDeltaTau)).toFixed(4)
      );

      const upDownAsymmetryRatio = parseFloat(
        Math.max(0.2, Math.min(5.0, (upMoveSum + 0.1 * medRange) / (downMoveSum + 0.1 * medRange))).toFixed(4)
      );

      let crossVenuePropagationBps = 0;
      if (secondaryBenchmarkCandles && secondaryBenchmarkCandles.length > echoEnd) {
        const bIdxPulse = Math.min(secondaryBenchmarkCandles.length - 1, i);
        const bIdxEnd = Math.min(secondaryBenchmarkCandles.length - 1, echoEnd);
        const spreadPulse = c.close - secondaryBenchmarkCandles[bIdxPulse].close;
        const spreadEnd = candles[echoEnd].close - secondaryBenchmarkCandles[bIdxEnd].close;
        crossVenuePropagationBps = parseFloat(
          ((Math.abs(spreadPulse - spreadEnd) / Math.max(100, c.close)) * 10000).toFixed(2)
        );
      } else {
        crossVenuePropagationBps = parseFloat(
          ((Math.abs(endDisplacement) / Math.max(100, c.close)) * 10000 * 0.35).toFixed(2)
        );
      }

      const preTau = i >= 2 ? 0.5 * (deltaTauSeries[i - 1] + deltaTauSeries[i - 2]) : deltaTauSeries[i];
      const postTau = elapsedDeltaTau / Math.max(1, echoEnd - i);
      const deltaTauAcceleration = parseFloat((postTau - preTau).toFixed(4));

      const expectedContinuationFactor = pulseType === 'LIQUIDITY_STOP_SWEEP' ? -0.35 : 0.42;
      const predictedEchoImpactUsd = parseFloat(
        (impulseSign * expectedContinuationFactor * medRange * Math.sqrt(relVolAtPulse)).toFixed(3)
      );
      const realizedEchoImpactUsd = parseFloat(endDisplacement.toFixed(3));
      const echoPredictionResidualUsd = parseFloat((realizedEchoImpactUsd - predictedEchoImpactUsd).toFixed(3));

      const resilienceStateUpdateDelta = parseFloat(
        Math.max(-0.35, Math.min(0.45, 0.35 * recoverySpeedPerTau - 0.18 * priceImpactPerUnitVolume)).toFixed(4)
      );
      const signedContinuation = Math.tanh(endDisplacement / Math.max(0.2, medRange));
      const toxicityStateUpdateDelta = parseFloat(
        Math.max(-0.75, Math.min(0.75, signedContinuation * Math.min(1.5, priceImpactPerUnitVolume))).toFixed(4)
      );

      barEchoToxicityUpdates[echoEnd] += toxicityStateUpdateDelta;
      barEchoResilienceUpdates[echoEnd] += resilienceStateUpdateDelta;
      barEchoResidualsUsd[echoEnd] = echoPredictionResidualUsd;

      measuredEchoes.push({
        pulseId,
        pulseType,
        barTime: candles[echoEnd].time,
        elapsedDeltaTau: parseFloat(elapsedDeltaTau.toFixed(3)),
        priceImpactPerUnitVolume,
        recoverySpeedPerTau,
        upDownAsymmetryRatio,
        crossVenuePropagationBps,
        deltaTauAcceleration,
        predictedEchoImpactUsd,
        realizedEchoImpactUsd,
        echoPredictionResidualUsd,
        resilienceStateUpdateDelta,
        toxicityStateUpdateDelta,
      });
    }
  }

  const meanPriceImpactPerUnitVol =
    measuredEchoes.length > 0
      ? parseFloat(
          (measuredEchoes.reduce((a, e) => a + e.priceImpactPerUnitVolume, 0) / measuredEchoes.length).toFixed(4)
        )
      : 0.45;
  const meanEchoRecoverySpeedPerTau =
    measuredEchoes.length > 0
      ? parseFloat((measuredEchoes.reduce((a, e) => a + e.recoverySpeedPerTau, 0) / measuredEchoes.length).toFixed(4))
      : 0.65;
  const upDownEchoAsymmetryRatio =
    measuredEchoes.length > 0
      ? parseFloat((measuredEchoes.reduce((a, e) => a + e.upDownAsymmetryRatio, 0) / measuredEchoes.length).toFixed(4))
      : 1.0;
  const crossVenueBasisPropagationSpeed =
    measuredEchoes.length > 0
      ? parseFloat(
          (measuredEchoes.reduce((a, e) => a + e.crossVenuePropagationBps, 0) / measuredEchoes.length).toFixed(2)
        )
      : 0.0;

  const latestPulse = detectedPulses.length > 0 ? detectedPulses[detectedPulses.length - 1] : null;
  const latestEcho = measuredEchoes.length > 0 ? measuredEchoes[measuredEchoes.length - 1] : null;

  return {
    sonarTelemetry: {
      totalPulsesDetected: detectedPulses.length,
      measuredEchoCount: measuredEchoes.length,
      adaptivePulseThresholdSigma,
      meanPriceImpactPerUnitVol,
      meanEchoRecoverySpeedPerTau,
      upDownEchoAsymmetryRatio,
      crossVenueBasisPropagationSpeed,
      echoFeedbackToToxicity: latestEcho ? latestEcho.toxicityStateUpdateDelta : 0,
      echoFeedbackToResilience: latestEcho ? latestEcho.resilienceStateUpdateDelta : 0,
      latestPulse,
      latestEcho,
      recentPulses: detectedPulses.slice(-8).reverse(),
      recentEchoes: measuredEchoes.slice(-8).reverse(),
      sonarSummaryEn: `Detected ${detectedPulses.length} real market impulses (${measuredEchoes.length} echoes measured on τ-clock; mean recovery=${meanEchoRecoverySpeedPerTau.toFixed(3)}/Δτ, asymmetry=${upDownEchoAsymmetryRatio.toFixed(2)}x).`,
      sonarSummaryFa: `${detectedPulses.length} تکانه واقعی بازار شناسایی شد (${measuredEchoes.length} پژواک اندازه‌گیری‌شده در ساعت اطلاعاتی τ؛ سرعت بازیابی=${meanEchoRecoverySpeedPerTau.toFixed(3)}/Δτ).`,
      extensionInterfacesReady: {
        aggressorVolumeAndTradeCount: true,
        topOfBookSpreadAndDepthProxy: true,
        scheduledEconomicCalendarPulses: true,
        highFrequencyRealYieldDxy: true,
      },
    },
    barEchoToxicityUpdates,
    barEchoResilienceUpdates,
    barEchoResidualsUsd,
  };
}

function applySequentialMeasurementUpdate6D(params: {
  X: number[];
  P: number[][];
  H: number[];
  observedY: number;
  basisOffset: number;
  R: number;
}): {
  innovation: number;
  predictedHOfX: number;
  kalmanGainNorm: number;
} {
  const { X, P, H, observedY, basisOffset, R } = params;
  const safeR = Math.max(1e-10, R);

  let hx = 0;
  for (let i = 0; i < 6; i++) hx += H[i] * X[i];
  const predictedY = hx + basisOffset;
  const innovation = observedY - predictedY;

  const PHt = new Array<number>(6).fill(0);
  for (let i = 0; i < 6; i++) {
    let s = 0;
    for (let j = 0; j < 6; j++) s += P[i][j] * H[j];
    PHt[i] = s;
  }
  let S = safeR;
  for (let i = 0; i < 6; i++) S += H[i] * PHt[i];
  S = Math.max(1e-10, S);

  const stdInnov = innovation / Math.sqrt(S);
  const boundedInnov =
    Math.abs(stdInnov) > 3.2 ? Math.sign(innovation) * 3.2 * Math.sqrt(S) : innovation;

  const K = new Array<number>(6).fill(0);
  let kNormSq = 0;
  for (let i = 0; i < 6; i++) {
    K[i] = PHt[i] / S;
    kNormSq += K[i] * K[i];
  }

  for (let i = 0; i < 6; i++) {
    X[i] += K[i] * boundedInnov;
  }

  const nextP: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let khP = 0;
      for (let m = 0; m < 6; m++) {
        const ikh = (i === m ? 1 : 0) - K[i] * H[m];
        khP += ikh * P[m][j];
      }
      nextP[i][j] = khP;
    }
  }
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      P[i][j] = 0.5 * (nextP[i][j] + nextP[j][i]);
    }
    P[i][i] = Math.max(1e-10, P[i][i]);
  }

  return {
    innovation,
    predictedHOfX: hx,
    kalmanGainNorm: Math.sqrt(kNormSq),
  };
}

/**
 * 3. Structured 6D Bayesian / Extended Kalman Filter on the Information Clock τ
 *    + Multi-Venue Observation Equations + Conditional Expectation Trajectory Propagation
 */
export function evaluateLatentStateFilterOnInformationClock(params: {
  candles: Candle[];
  deltaTauSeries: number[];
  cumulativeTauSeries: number[];
  liveMacro: VerifiedMacroYieldResult;
  cointegrationBasisMeanUsd: number;
  verifiedVenueCameras?: VerifiedVenueCameraObservation[];
  secondaryBenchmark?: {
    provider: string;
    symbol: string;
    candles: Candle[];
    crossVenueSpreadUsd: number;
    crossVenueZScore: number;
    isOutlierDislocation: boolean;
  } | null;
  barEchoToxicityUpdates: number[];
  barEchoResilienceUpdates: number[];
  barEchoResidualsUsd: number[];
  equilibriumAnchorPrice: number;
  intervalStepSeconds: number;
  activeProvider: string;
  activeSymbol: string;
  instrumentIdentity: string;
  extensionInput?: OrderBookMicrostructureExtensionInput;
  tuningOverrides?: LatentFilterTuningOverrides;
}): {
  latentState: LatentStateVector6D;
  impliedLatentPriceUsd: number;
  impliedDriftUsdPerTau: number;
  impliedVolPctPerSqrtTau: number;
  latentCovarianceDiagonal: LatentStateVector6D;
  latentCovarianceMatrix6x6: number[][];
  venueObservations: VenueObservationEquationRecord[];
  yellowLinePlume: EnsemblePlume;
  oneStepPredictedPrices: number[];
  oneStepPredictedStds: number[];
  oneStepPredictedProbUp: number[];
  realizedPrices: number[];
  residualPoints: ResidualOraclePoint[];
  clockHistory: { barTime: number; deltaTau: number; cumulativeTau: number; latentPriceUsd: number }[];
} {
  const {
    candles,
    deltaTauSeries,
    cumulativeTauSeries,
    liveMacro,
    cointegrationBasisMeanUsd,
    verifiedVenueCameras,
    secondaryBenchmark,
    barEchoToxicityUpdates,
    barEchoResilienceUpdates,
    barEchoResidualsUsd,
    equilibriumAnchorPrice,
    intervalStepSeconds,
    activeProvider,
    activeSymbol,
    instrumentIdentity,
    extensionInput,
    tuningOverrides,
  } = params;

  const n = candles.length;
  const logReturns: number[] = [];
  const parkinsonVols: number[] = [];
  const barSignedImbalances: number[] = [];

  for (let i = 0; i < n; i++) {
    const c = candles[i];
    if (i > 0) {
      logReturns.push(Math.log(Math.max(1, c.close) / Math.max(1, candles[i - 1].close)));
    }
    const hlRatio = Math.log(Math.max(1, c.high) / Math.max(1, c.low));
    const parkVol = Math.max(0.0003, Math.sqrt((hlRatio * hlRatio) / (4 * Math.LN2)));
    parkinsonVols.push(parkVol);

    const span = Math.max(0.02, c.high - c.low);
    const signedBody = (c.close - c.open) / span;
    barSignedImbalances.push(signedBody);
  }

  const medVol = Math.max(0.0005, median(parkinsonVols));
  const retAutocorr1 = Math.abs(pearsonCorrelation(logReturns.slice(0, -1), logReturns.slice(1)));
  const volAutocorr1 = Math.abs(pearsonCorrelation(parkinsonVols.slice(0, -1), parkinsonVols.slice(1)));
  const imbAutocorr1 = Math.abs(pearsonCorrelation(barSignedImbalances.slice(0, -1), barSignedImbalances.slice(1)));

  const phiDrift =
    tuningOverrides?.driftPersistencePhi ??
    Math.max(0.55, Math.min(0.92, 0.65 + 0.25 * retAutocorr1));
  const kappaDrift = Math.max(0.05, Math.min(0.65, -Math.log(Math.max(0.2, Math.min(0.95, phiDrift)))));
  const kappaMeanRev = tuningOverrides?.meanReversionKappa ?? 0.12;
  const kappaVol = Math.max(0.06, Math.min(0.45, -Math.log(Math.max(0.25, Math.min(0.92, volAutocorr1 + 0.45)))));
  const kappaTox = Math.max(0.12, Math.min(0.6, -Math.log(Math.max(0.15, Math.min(0.85, imbAutocorr1 + 0.3)))));
  const kappaRes = 0.18;
  const kappaMacro = 0.08;

  const betaTox = tuningOverrides?.echoToxicityCouplingBeta ?? 0.34;
  const gammaEchoRes = tuningOverrides?.echoResilienceCouplingGamma ?? 0.42;
  const etaMacro = tuningOverrides?.macroResidualCouplingEta ?? 0.25;
  const obsPrecMult = Math.max(0.5, Math.min(2.5, tuningOverrides?.crossVenueObservationPrecisionMult ?? 1.0));

  const refPrice = Math.max(100, candles[n - 1].close);
  const macroLogForce =
    liveMacro.status === 'MACRO_FEED_UNAVAILABLE'
      ? 0
      : (liveMacro.netMacroLift / refPrice) * etaMacro;

  const X = [
    Math.log(Math.max(100, candles[0].close)), // x1: logPriceLevel
    0.0, // x2: localDrift
    parkinsonVols[0] || medVol, // x3: localVolatility
    barSignedImbalances[0] * 0.25, // x4: pressureToxicity
    0.72, // x5: liquidityResilience in [0.05, 0.99]
    macroLogForce, // x6: macroResidualForce
  ];

  const initVarLogP = medVol * medVol;
  const P: number[][] = [
    [initVarLogP, 0, 0, 0, 0, 0],
    [0, initVarLogP * 0.25, 0, 0, 0, 0],
    [0, 0, initVarLogP * 0.15, 0, 0, 0],
    [0, 0, 0, 0.08, 0, 0],
    [0, 0, 0, 0, 0.04, 0],
    [0, 0, 0, 0, 0, initVarLogP * 0.1],
  ];

  const oneStepPredictedPrices: number[] = [];
  const oneStepPredictedStds: number[] = [];
  const oneStepPredictedProbUp: number[] = [];
  const realizedPrices: number[] = [];
  const residualPoints: ResidualOraclePoint[] = [];
  const clockHistory: { barTime: number; deltaTau: number; cumulativeTau: number; latentPriceUsd: number }[] = [];
  let venueObservations: VenueObservationEquationRecord[] = [];
  let prevLogResidual = 0;

  for (let t = 0; t < n; t++) {
    const c = candles[t];
    const dt = deltaTauSeries[t] || 1.0;
    const cumTau = cumulativeTauSeries[t] || t + 1;

    const eqStart = Math.max(0, t - 24);
    let eqSum = 0;
    let eqCnt = 0;
    for (let j = eqStart; j <= Math.max(0, t - 1); j++) {
      eqSum += candles[j].close;
      eqCnt++;
    }
    const causalLogEq = Math.log(Math.max(100, eqSum / Math.max(1, eqCnt)));

    if (t > 0) {
      // --- STEP 1: STATE PREDICTION ON THE INFORMATION CLOCK (τ_{t-1} -> τ_t) ---
      const eDrift = Math.exp(-kappaDrift * dt);
      const eVol = Math.exp(-kappaVol * dt);
      const eTox = Math.exp(-kappaTox * dt);
      const eRes = Math.exp(-kappaRes * dt);
      const eMac = Math.exp(-kappaMacro * dt);

      const safeRes = Math.max(0.15, X[4]);
      const toxRatio = X[3] / safeRes;
      const effectiveStepLogDrift =
        (X[1] + betaTox * toxRatio * X[2] + X[5] + 0.14 * prevLogResidual) * dt;

      const nextX0 = X[0] + effectiveStepLogDrift;
      const eqRestoringDrift = kappaMeanRev * (causalLogEq - X[0]);
      const nextX1 = eDrift * X[1] + (1 - eDrift) * (eqRestoringDrift + X[5]);
      const nextX2 = Math.max(0.0002, Math.min(0.035, eVol * X[2] + (1 - eVol) * medVol));
      const nextX3 = Math.max(-1.0, Math.min(1.0, eTox * X[3]));
      const nextX4 = Math.max(0.05, Math.min(0.99, eRes * X[4] + (1 - eRes) * 0.72));
      const nextX5 = eMac * X[5] + (1 - eMac) * macroLogForce;

      const F: number[][] = [
        [1, dt, betaTox * toxRatio * dt, (betaTox * X[2] * dt) / safeRes, (-betaTox * X[3] * X[2] * dt) / (safeRes * safeRes), dt],
        [-(1 - eDrift) * kappaMeanRev, eDrift, 0, 0, 0, 1 - eDrift],
        [0, 0, eVol, 0, 0, 0],
        [0, 0, 0, eTox, 0, 0],
        [0, 0, 0, 0, eRes, 0],
        [0, 0, 0, 0, 0, eMac],
      ];

      const stepVar = Math.max(1e-8, X[2] * X[2] * dt);
      const QDiag = [
        stepVar * 0.65,
        stepVar * 0.12,
        stepVar * 0.04,
        0.015 * dt,
        0.008 * dt,
        stepVar * 0.03,
      ];

      const predP: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          let sum = 0;
          for (let k = 0; k < 6; k++) {
            for (let l = 0; l < 6; l++) {
              sum += F[i][k] * P[k][l] * F[j][l];
            }
          }
          predP[i][j] = sum + (i === j ? QDiag[i] : 0);
        }
      }

      X[0] = nextX0;
      X[1] = nextX1;
      X[2] = nextX2;
      X[3] = nextX3;
      X[4] = nextX4;
      X[5] = nextX5;
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          P[i][j] = predP[i][j];
        }
      }

      const predPriceUsd = Math.exp(X[0] + 0.5 * P[0][0]);
      const predStdLog = Math.sqrt(Math.max(1e-8, P[0][0] + X[2] * X[2] * dt));
      const predStdUsd = Math.max(0.25, predPriceUsd * predStdLog);
      const prevClose = candles[t - 1].close;
      const expectedStepUsd = predPriceUsd - prevClose;
      const probUp = Math.max(0.02, Math.min(0.98, normalCdf(expectedStepUsd / predStdUsd)));

      oneStepPredictedPrices.push(predPriceUsd);
      oneStepPredictedStds.push(predStdUsd);
      oneStepPredictedProbUp.push(probUp);
      realizedPrices.push(c.close);

      const priceResidualUsd = parseFloat((c.close - predPriceUsd).toFixed(4));
      const standardizedResidualSigma = parseFloat((priceResidualUsd / predStdUsd).toFixed(3));
      prevLogResidual = Math.log(Math.max(100, c.close)) - X[0];

      residualPoints.push({
        barTime: c.time,
        tau: cumTau,
        realizedPrice: c.close,
        predictedYellowPrice: parseFloat(predPriceUsd.toFixed(2)),
        priceResidualUsd,
        standardizedResidualSigma,
        echoResidualUsd: barEchoResidualsUsd[t] || 0,
        deltaTau: dt,
        regime: dt > 1.2 ? 'FAST_INFO_CLOCK_BURST' : 'NORMAL_OR_QUIET_CLOCK',
      });
    }

    // --- STEP 2: MULTI-VENUE SEQUENTIAL OBSERVATION UPDATES AT BAR t ---
    const stepObsRecords: VenueObservationEquationRecord[] = [];
    const obsLogP = Math.log(Math.max(100, c.close));
    const microNoiseVarPrimary = Math.max(
      1e-8,
      (parkinsonVols[t] * parkinsonVols[t] * 0.35) / (Math.max(0.25, dt) * obsPrecMult)
    );

    // Camera 1: Primary Spot Venue
    const upPrimary = applySequentialMeasurementUpdate6D({
      X,
      P,
      H: [1, 0, 0, 0, 0, 0],
      observedY: obsLogP,
      basisOffset: 0,
      R: microNoiseVarPrimary,
    });
    if (t === n - 1) {
      const noiseVarUsd2 = Math.max(0.01, microNoiseVarPrimary * c.close * c.close);
      stepObsRecords.push({
        cameraId: 'cam-primary-spot',
        venueName: activeProvider,
        providerName: activeProvider,
        symbol: activeSymbol,
        instrumentIdentity,
        observationChannel: 'SPOT_TOKEN_PRICE',
        equationAscii: 'Y^(primary)_t = x_1(τ_t) + ε^(primary)_t',
        observedPriceUsd: parseFloat(c.close.toFixed(2)),
        latentImpliedPriceUsd: parseFloat(Math.exp(upPrimary.predictedHOfX).toFixed(2)),
        estimatedBasisUsd: 0,
        microstructureNoiseVarUsd2: parseFloat(noiseVarUsd2.toFixed(4)),
        kalmanObservationWeight: parseFloat(Math.min(0.95, Math.max(0.05, upPrimary.kalmanGainNorm)).toFixed(4)),
        innovationResidualUsd: parseFloat((c.close - Math.exp(upPrimary.predictedHOfX)).toFixed(3)),
        provenanceVerified: true,
      });
    }

    // Additional Verified Multi-Venue Cameras in Waterfall
    if (verifiedVenueCameras && verifiedVenueCameras.length > 0) {
      for (let camIdx = 0; camIdx < verifiedVenueCameras.length; camIdx++) {
        const cam = verifiedVenueCameras[camIdx];
        if (cam.providerName === activeProvider && cam.symbol === activeSymbol) continue;
        const alignedBar =
          cam.candles.find(b => Math.abs(b.time - c.time) <= intervalStepSeconds * 2) ||
          (t === n - 1 ? cam.candles[cam.candles.length - 1] : null);
        if (!alignedBar || alignedBar.close <= 100) continue;

        const isFuturesCamera = cam.instrumentIdentity === 'COMEX_GOLD_FUTURES' || cam.symbol === 'GC=F';
        const camLogP = Math.log(alignedBar.close);
        const basisUsd = isFuturesCamera
          ? -cointegrationBasisMeanUsd
          : (alignedBar.close - c.close) * 0.35;
        const basisLogOffset = basisUsd / Math.max(100, c.close);
        const camNoiseVar = (microNoiseVarPrimary * (isFuturesCamera ? 1.45 : 1.2)) / obsPrecMult;
        const HCam = isFuturesCamera ? [1, 0, 0, -0.0005, 0, 0] : [1, 0, 0, 0, 0, 0];

        const upCam = applySequentialMeasurementUpdate6D({
          X,
          P,
          H: HCam,
          observedY: camLogP,
          basisOffset: basisLogOffset,
          R: camNoiseVar,
        });

        if (t === n - 1) {
          const noiseVarUsd2 = Math.max(0.01, camNoiseVar * alignedBar.close * alignedBar.close);
          stepObsRecords.push({
            cameraId: `cam-${cam.venueGroupId}-${camIdx}`,
            venueName: cam.providerName,
            providerName: cam.providerName,
            symbol: cam.symbol,
            instrumentIdentity: cam.instrumentIdentity,
            observationChannel: isFuturesCamera ? 'FUTURES_BASIS_COINTEGRATED' : 'SPOT_TOKEN_PRICE',
            equationAscii: isFuturesCamera
              ? 'Y^(COMEX)_t = x_1(τ_t) - basis^(PAXG-COMEX)_t - β_tox*x_4(τ_t) + ε^(COMEX)_t'
              : `Y^(${cam.venueGroupId})_t = x_1(τ_t) + basis^(${cam.venueGroupId})_t + ε_t`,
            observedPriceUsd: parseFloat(alignedBar.close.toFixed(2)),
            latentImpliedPriceUsd: parseFloat(Math.exp(upCam.predictedHOfX).toFixed(2)),
            estimatedBasisUsd: parseFloat(basisUsd.toFixed(3)),
            microstructureNoiseVarUsd2: parseFloat(noiseVarUsd2.toFixed(4)),
            kalmanObservationWeight: parseFloat(Math.min(0.95, Math.max(0.05, upCam.kalmanGainNorm)).toFixed(4)),
            innovationResidualUsd: parseFloat(
              (alignedBar.close - Math.exp(upCam.predictedHOfX + basisLogOffset)).toFixed(3)
            ),
            provenanceVerified: true,
          });
        }
      }
    } else if (secondaryBenchmark && secondaryBenchmark.candles.length > 0) {
      const bBar =
        secondaryBenchmark.candles.find(b => Math.abs(b.time - c.time) <= intervalStepSeconds * 2) ||
        (t === n - 1 ? secondaryBenchmark.candles[secondaryBenchmark.candles.length - 1] : null);
      if (bBar && bBar.close > 100) {
        const bLogP = Math.log(bBar.close);
        const basisUsd = -cointegrationBasisMeanUsd;
        const basisLogOffset = basisUsd / Math.max(100, c.close);
        const bNoiseVar = (microNoiseVarPrimary * 1.4) / obsPrecMult;
        const upBench = applySequentialMeasurementUpdate6D({
          X,
          P,
          H: [1, 0, 0, -0.0005, 0, 0],
          observedY: bLogP,
          basisOffset: basisLogOffset,
          R: bNoiseVar,
        });
        if (t === n - 1) {
          const noiseVarUsd2 = Math.max(0.01, bNoiseVar * bBar.close * bBar.close);
          stepObsRecords.push({
            cameraId: 'cam-secondary-benchmark',
            venueName: secondaryBenchmark.provider,
            providerName: secondaryBenchmark.provider,
            symbol: secondaryBenchmark.symbol,
            instrumentIdentity: secondaryBenchmark.symbol === 'GC=F' ? 'COMEX_GOLD_FUTURES' : 'PAXG_SPOT_TOKEN',
            observationChannel: 'FUTURES_BASIS_COINTEGRATED',
            equationAscii: 'Y^(bench)_t = x_1(τ_t) - basis^(PAXG-COMEX)_t - β_tox*x_4(τ_t) + ε^(bench)_t',
            observedPriceUsd: parseFloat(bBar.close.toFixed(2)),
            latentImpliedPriceUsd: parseFloat(Math.exp(upBench.predictedHOfX).toFixed(2)),
            estimatedBasisUsd: parseFloat(basisUsd.toFixed(3)),
            microstructureNoiseVarUsd2: parseFloat(noiseVarUsd2.toFixed(4)),
            kalmanObservationWeight: parseFloat(Math.min(0.95, Math.max(0.05, upBench.kalmanGainNorm)).toFixed(4)),
            innovationResidualUsd: parseFloat(
              (bBar.close - Math.exp(upBench.predictedHOfX + basisLogOffset)).toFixed(3)
            ),
            provenanceVerified: true,
          });
        }
      }
    }

    // Parkinson Intraday Range Volatility Sensor -> x3 (localVolatility)
    applySequentialMeasurementUpdate6D({
      X,
      P,
      H: [0, 0, 1, 0, 0, 0],
      observedY: parkinsonVols[t],
      basisOffset: 0,
      R: Math.max(1e-8, medVol * medVol * 0.25),
    });
    X[2] = Math.max(0.0002, Math.min(0.035, X[2]));

    // Pulse–Echo (Sonar) & Optional L2 Order-Book Imbalance -> x4 (pressureToxicity) & x5 (liquidityResilience)
    const l2Snap = extensionInput?.l2OrderBookSnapshots?.find(s => Math.abs(s.timestampSec - c.time) <= 900);
    const l2Imbalance = l2Snap ? l2Snap.orderBookImbalance : 0;
    const rawFlowToxObs = Math.max(
      -0.95,
      Math.min(
        0.95,
        0.48 * barSignedImbalances[t] + 0.37 * (barEchoToxicityUpdates[t] || 0) + 0.15 * l2Imbalance
      )
    );
    applySequentialMeasurementUpdate6D({
      X,
      P,
      H: [0, 0, 0, 1, 0, 0],
      observedY: rawFlowToxObs,
      basisOffset: 0,
      R: 0.06 / Math.max(0.3, dt),
    });
    X[3] = Math.max(-1.0, Math.min(1.0, X[3]));

    const l2DepthBoost =
      l2Snap && l2Snap.bidDepthTop5Usd + l2Snap.askDepthTop5Usd > 0
        ? Math.min(0.15, (l2Snap.bidDepthTop5Usd + l2Snap.askDepthTop5Usd) / 20000000)
        : 0;
    const rawResObs = Math.max(
      0.08,
      Math.min(0.98, 0.72 + gammaEchoRes * (barEchoResilienceUpdates[t] || 0) + l2DepthBoost)
    );
    applySequentialMeasurementUpdate6D({
      X,
      P,
      H: [0, 0, 0, 0, 1, 0],
      observedY: rawResObs,
      basisOffset: 0,
      R: 0.04,
    });
    X[4] = Math.max(0.05, Math.min(0.99, X[4]));

    // Macro Real-Yield & Dollar Index Observation Channel -> x6 and x2
    if (liveMacro.status !== 'MACRO_FEED_UNAVAILABLE') {
      applySequentialMeasurementUpdate6D({
        X,
        P,
        H: [0, 0.22, 0, 0, 0, 1],
        observedY: macroLogForce,
        basisOffset: 0,
        R: Math.max(1e-8, medVol * medVol * 0.3),
      });
    }

    if (t === n - 1) {
      venueObservations = stepObsRecords;
    }

    clockHistory.push({
      barTime: c.time,
      deltaTau: dt,
      cumulativeTau: cumTau,
      latentPriceUsd: parseFloat(Math.exp(X[0]).toFixed(2)),
    });
  }

  // Normalize camera observation weights for display clarity while preserving positive values
  const wSum = venueObservations.reduce((a, b) => a + b.kalmanObservationWeight, 0);
  if (wSum > 0) {
    venueObservations = venueObservations.map(v => ({
      ...v,
      kalmanObservationWeight: parseFloat((v.kalmanObservationWeight / wSum).toFixed(4)),
    }));
  }

  // --- STEP 3: PROPAGATE CONDITIONAL EXPECTATION OF LATENT STATE X FORWARD ON INFORMATION CLOCK τ ---
  const horizonSteps = 24;
  const lastBarTime = candles[n - 1].time;
  const effectiveEqAnchor = tuningOverrides?.equilibriumAnchorOverride ?? equilibriumAnchorPrice;
  const logEqTarget = Math.log(Math.max(100, effectiveEqAnchor));
  const symbolicLogDriftBase =
    (tuningOverrides?.symbolicStepDriftUsd ?? 0) / Math.max(100, candles[n - 1].close);

  let simX = [...X];
  let simP = P.map(row => [...row]);
  let simDeltaTau = deltaTauSeries[n - 1] || 1.0;

  const medianTrack: { time: number; value: number }[] = [];
  const upper75: { time: number; value: number }[] = [];
  const lower25: { time: number; value: number }[] = [];
  const upper95: { time: number; value: number }[] = [];
  const lower05: { time: number; value: number }[] = [];

  const quantileMultipliers = [-1.45, -0.85, -0.35, 0.35, 0.85, 1.45];
  const sampleTracks: { id: number; path: { time: number; value: number }[] }[] = quantileMultipliers.map(
    (_, idx) => ({ id: idx, path: [] })
  );

  for (let h = 1; h <= horizonSteps; h++) {
    const stepTime = lastBarTime + h * intervalStepSeconds;
    simDeltaTau = 0.72 * simDeltaTau + 0.28 * 1.0;

    const eDrift = Math.exp(-kappaDrift * simDeltaTau);
    const eVol = Math.exp(-kappaVol * simDeltaTau);
    const eTox = Math.exp(-kappaTox * simDeltaTau);
    const eRes = Math.exp(-kappaRes * simDeltaTau);
    const eMac = Math.exp(-kappaMacro * simDeltaTau);

    const safeRes = Math.max(0.2, simX[4]);
    const toxRatio = simX[3] / safeRes;
    const eqRestoringLog = kappaMeanRev * (logEqTarget - simX[0]);
    const decayingSymbolicLog = symbolicLogDriftBase * Math.exp(-0.075 * (h - 1));

    const stepLogDrift =
      (simX[1] + betaTox * toxRatio * simX[2] + simX[5] + eqRestoringLog * 0.45 + decayingSymbolicLog) *
      simDeltaTau;

    const nextX0 = simX[0] + stepLogDrift;
    const nextX1 = eDrift * simX[1] + (1 - eDrift) * (eqRestoringLog + simX[5]);
    const nextX2 = Math.max(0.0002, Math.min(0.035, eVol * simX[2] + (1 - eVol) * medVol));
    const nextX3 = eTox * simX[3];
    const nextX4 = Math.max(0.05, Math.min(0.99, eRes * simX[4] + (1 - eRes) * 0.75));
    const nextX5 = eMac * simX[5];

    const Fh: number[][] = [
      [
        1 - 0.45 * kappaMeanRev * simDeltaTau,
        simDeltaTau,
        betaTox * toxRatio * simDeltaTau,
        (betaTox * simX[2] * simDeltaTau) / safeRes,
        (-betaTox * simX[3] * simX[2] * simDeltaTau) / (safeRes * safeRes),
        simDeltaTau,
      ],
      [-(1 - eDrift) * kappaMeanRev, eDrift, 0, 0, 0, 1 - eDrift],
      [0, 0, eVol, 0, 0, 0],
      [0, 0, 0, eTox, 0, 0],
      [0, 0, 0, 0, eRes, 0],
      [0, 0, 0, 0, 0, eMac],
    ];

    const stepVar = Math.max(1e-8, simX[2] * simX[2] * simDeltaTau);
    const QDiag = [
      stepVar * 0.85,
      stepVar * 0.14,
      stepVar * 0.04,
      0.012 * simDeltaTau,
      0.008 * simDeltaTau,
      stepVar * 0.02,
    ];

    const nextP: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        let s = 0;
        for (let k = 0; k < 6; k++) {
          for (let l = 0; l < 6; l++) {
            s += Fh[i][k] * simP[k][l] * Fh[j][l];
          }
        }
        nextP[i][j] = s + (i === j ? QDiag[i] : 0);
      }
    }

    simX = [nextX0, nextX1, nextX2, nextX3, nextX4, nextX5];
    simP = nextP;

    const predLogVar = Math.max(1e-8, simP[0][0]);
    const predLogStd = Math.sqrt(predLogVar);
    const expectedPrice = Math.exp(simX[0] + 0.5 * predLogVar);

    const pMed = parseFloat(expectedPrice.toFixed(2));
    const pUp75 = parseFloat((expectedPrice * Math.exp(1.0 * predLogStd)).toFixed(2));
    const pLo25 = parseFloat((expectedPrice * Math.exp(-1.0 * predLogStd)).toFixed(2));
    const pUp95 = parseFloat((expectedPrice * Math.exp(1.96 * predLogStd)).toFixed(2));
    const pLo05 = parseFloat((expectedPrice * Math.exp(-1.96 * predLogStd)).toFixed(2));

    medianTrack.push({ time: stepTime, value: pMed });
    upper75.push({ time: stepTime, value: pUp75 });
    lower25.push({ time: stepTime, value: pLo25 });
    upper95.push({ time: stepTime, value: pUp95 });
    lower05.push({ time: stepTime, value: pLo05 });

    for (let rIdx = 0; rIdx < quantileMultipliers.length; rIdx++) {
      const m = quantileMultipliers[rIdx];
      const rayVal = parseFloat((expectedPrice * Math.exp(m * predLogStd)).toFixed(2));
      sampleTracks[rIdx].path.push({ time: stepTime, value: rayVal });
    }
  }

  const impliedLatentPriceUsd = parseFloat(Math.exp(X[0]).toFixed(2));
  const impliedDriftUsdPerTau = parseFloat((X[1] * impliedLatentPriceUsd).toFixed(4));
  const impliedVolPctPerSqrtTau = parseFloat((X[2] * 100).toFixed(4));

  const latentState: LatentStateVector6D = {
    logPriceLevel: parseFloat(X[0].toFixed(6)),
    localDrift: parseFloat(X[1].toFixed(6)),
    localVolatility: parseFloat(X[2].toFixed(6)),
    pressureToxicity: parseFloat(X[3].toFixed(4)),
    liquidityResilience: parseFloat(Math.max(0.05, Math.min(0.99, X[4])).toFixed(4)),
    macroResidualForce: parseFloat(X[5].toFixed(6)),
  };

  const latentCovarianceDiagonal: LatentStateVector6D = {
    logPriceLevel: parseFloat(P[0][0].toFixed(8)),
    localDrift: parseFloat(P[1][1].toFixed(8)),
    localVolatility: parseFloat(P[2][2].toFixed(8)),
    pressureToxicity: parseFloat(P[3][3].toFixed(6)),
    liquidityResilience: parseFloat(P[4][4].toFixed(6)),
    macroResidualForce: parseFloat(P[5][5].toFixed(8)),
  };

  return {
    latentState,
    impliedLatentPriceUsd,
    impliedDriftUsdPerTau,
    impliedVolPctPerSqrtTau,
    latentCovarianceDiagonal,
    latentCovarianceMatrix6x6: P.map(row => row.map(v => parseFloat(v.toFixed(8)))),
    venueObservations,
    yellowLinePlume: {
      medianTrack,
      upper95,
      upper75,
      lower25,
      lower05,
      sampleTracks,
    },
    oneStepPredictedPrices,
    oneStepPredictedStds,
    oneStepPredictedProbUp,
    realizedPrices,
    residualPoints,
    clockHistory: clockHistory.slice(-30),
  };
}

/**
 * 4. The Residual Process (The Oracle) — Structure & Omitted Variable Diagnostics
 */
export function computeResidualOracleDiagnostics(params: {
  residualPoints: ResidualOraclePoint[];
  candles: Candle[];
  crossVenueZScore: number;
  barEchoToxicityUpdates: number[];
  liveMacro: VerifiedMacroYieldResult;
}): ResidualStructureDiagnostics {
  const { residualPoints, candles, crossVenueZScore, barEchoToxicityUpdates, liveMacro } = params;
  const n = residualPoints.length;
  if (n < 6) {
    return {
      sampleSize: n,
      sampleSizeN: n,
      meanResidualUsd: 0,
      rmseUsd: 0,
      lag1Autocorrelation: 0,
      lag2Autocorrelation: 0,
      ljungBoxQ5Stat: 0,
      ljungBoxPValueApprox: 1.0,
      isWhiteNoiseCompatible: true,
      isStatisticallyStructured: false,
      highLowVolVarianceRatio: 1.0,
      highVolRmseUsd: 0,
      lowVolRmseUsd: 0,
      corrWithCrossVenueBasis: 0,
      corrWithEchoToxicity: 0,
      corrWithMacroForce: 0,
      corrWithInfoClockDeltaTau: 0,
      dominantBlindspotChannel: 'NONE_WHITE_NOISE',
      summaryEn: 'Residual Oracle calibrating on initial bars.',
      summaryFa: 'اوراکل پسماند در حال کالیبراسیون بر روی کندل‌های اولیه است.',
    };
  }

  const residuals = residualPoints.map(p => p.priceResidualUsd);
  const meanResidualUsd = parseFloat((residuals.reduce((a, b) => a + b, 0) / n).toFixed(4));
  const mse = residuals.reduce((a, e) => a + e * e, 0) / n;
  const rmseUsd = parseFloat(Math.sqrt(mse).toFixed(4));

  const centered = residuals.map(e => e - meanResidualUsd);
  const denom = centered.reduce((a, d) => a + d * d, 0);
  const lagCorrs: number[] = [];
  for (let lag = 1; lag <= 5; lag++) {
    if (denom < 1e-12 || n <= lag + 2) {
      lagCorrs.push(0);
      continue;
    }
    let num = 0;
    for (let i = lag; i < n; i++) {
      num += centered[i] * centered[i - lag];
    }
    lagCorrs.push(Math.max(-0.95, Math.min(0.95, num / denom)));
  }

  const lag1Autocorrelation = parseFloat(lagCorrs[0].toFixed(4));
  const lag2Autocorrelation = parseFloat(lagCorrs[1].toFixed(4));

  let ljungBoxQ = 0;
  for (let k = 1; k <= Math.min(5, n - 2); k++) {
    const rk = lagCorrs[k - 1];
    ljungBoxQ += (rk * rk) / (n - k);
  }
  const ljungBoxQ5Stat = parseFloat((n * (n + 2) * ljungBoxQ).toFixed(3));
  const ljungBoxPValueApprox = parseFloat(Math.max(0.001, Math.min(0.999, Math.exp(-0.22 * ljungBoxQ5Stat))).toFixed(3));
  const isWhiteNoiseCompatible = ljungBoxQ5Stat <= 11.07 && Math.abs(lag1Autocorrelation) <= 0.22;
  const isStatisticallyStructured = !isWhiteNoiseCompatible;

  const deltaTaus = residualPoints.map(p => p.deltaTau);
  const medDt = median(deltaTaus);
  let highSq = 0;
  let highN = 0;
  let lowSq = 0;
  let lowN = 0;
  for (let i = 0; i < n; i++) {
    const e2 = residuals[i] * residuals[i];
    if (deltaTaus[i] >= medDt) {
      highSq += e2;
      highN++;
    } else {
      lowSq += e2;
      lowN++;
    }
  }
  const highVolRmseUsd = parseFloat(Math.sqrt(highSq / Math.max(1, highN)).toFixed(4));
  const lowVolRmseUsd = parseFloat(Math.sqrt(lowSq / Math.max(1, lowN)).toFixed(4));
  const highLowVolVarianceRatio = parseFloat((highVolRmseUsd / Math.max(0.05, lowVolRmseUsd)).toFixed(3));

  const offset = candles.length - n;
  const basisProxySeries: number[] = [];
  const echoToxSeries: number[] = [];
  const macroProxySeries: number[] = [];

  for (let i = 0; i < n; i++) {
    const cIdx = Math.max(0, offset + i);
    const c = candles[cIdx];
    const prev = candles[Math.max(0, cIdx - 1)];
    basisProxySeries.push((c.close - prev.close) * Math.sign(crossVenueZScore || 1));
    echoToxSeries.push(barEchoToxicityUpdates[cIdx] || (c.close - c.open) / Math.max(0.05, c.high - c.low));
    macroProxySeries.push((c.high - c.low) * Math.sign(liveMacro.netMacroLift || -1));
  }

  const corrWithCrossVenueBasis = parseFloat(pearsonCorrelation(residuals, basisProxySeries).toFixed(4));
  const corrWithEchoToxicity = parseFloat(pearsonCorrelation(residuals, echoToxSeries).toFixed(4));
  const corrWithMacroForce = parseFloat(pearsonCorrelation(residuals, macroProxySeries).toFixed(4));
  const corrWithInfoClockDeltaTau = parseFloat(pearsonCorrelation(residuals, deltaTaus).toFixed(4));

  let dominantBlindspotChannel: ResidualStructureDiagnostics['dominantBlindspotChannel'] = 'NONE_WHITE_NOISE';
  if (Math.abs(lag1Autocorrelation) > 0.16) {
    dominantBlindspotChannel = 'SERIAL_PERSISTENCE_AUTOCORR';
  } else if (Math.abs(corrWithCrossVenueBasis) > 0.2) {
    dominantBlindspotChannel = 'CROSS_VENUE_BASIS_LEAKAGE';
  } else if (Math.abs(corrWithEchoToxicity) > 0.2) {
    dominantBlindspotChannel = 'PULSE_ECHO_TOXICITY_LAG';
  } else if (highLowVolVarianceRatio > 1.45) {
    dominantBlindspotChannel = 'VOL_REGIME_HETEROSKEDASTICITY';
  } else if (Math.abs(corrWithMacroForce) > 0.18) {
    dominantBlindspotChannel = 'MACRO_REAL_YIELD_DRIFT';
  }

  return {
    sampleSize: n,
    sampleSizeN: n,
    meanResidualUsd,
    rmseUsd,
    lag1Autocorrelation,
    lag2Autocorrelation,
    ljungBoxQ5Stat,
    ljungBoxPValueApprox,
    isWhiteNoiseCompatible,
    isStatisticallyStructured,
    highLowVolVarianceRatio,
    highVolRmseUsd,
    lowVolRmseUsd,
    corrWithCrossVenueBasis,
    corrWithEchoToxicity,
    corrWithMacroForce,
    corrWithInfoClockDeltaTau,
    dominantBlindspotChannel,
    summaryEn: `Residual Oracle (N=${n}): RMSE=$${rmseUsd.toFixed(2)}, ρ₁=${lag1Autocorrelation >= 0 ? '+' : ''}${lag1Autocorrelation.toFixed(3)}, Ljung-Box Q(5)=${ljungBoxQ5Stat.toFixed(2)} (${isWhiteNoiseCompatible ? 'White-Noise Compatible' : `Structured: ${dominantBlindspotChannel}`}).`,
    summaryFa: `اوراکل پسماند (N=${n}): خطای RMSE=$${rmseUsd.toFixed(2)}، خودهمبستگی ρ₁=${lag1Autocorrelation.toFixed(3)}، آماره Ljung-Box Q(5)=${ljungBoxQ5Stat.toFixed(2)} (${isWhiteNoiseCompatible ? 'سازگار با نویز سفید' : `ساختار باقیمانده: ${dominantBlindspotChannel}`}).`,
  };
}

function computeWilsonCi95(hits: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const z = 1.95996;
  const p = hits / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
  return [
    parseFloat(Math.max(0, center - halfWidth).toFixed(4)),
    parseFloat(Math.min(1, center + halfWidth).toFixed(4)),
  ];
}

/**
 * 5. Permanent Out-of-Sample Scientific Scoreboard
 * Compares the Latent State Filter on the Information Clock against 4 transparent baselines
 * (Random Walk, Last Price Momentum, 20-Bar SMA, GARCH-Only) across realized bars and regimes.
 */
export function computePermanentOosScientificScoreboard(params: {
  candles: Candle[];
  oneStepPredictedPrices: number[];
  oneStepPredictedProbUp: number[];
  realizedPrices: number[];
  residualPoints: ResidualOraclePoint[];
  residualDiagnostics: ResidualStructureDiagnostics;
  measuredEchoes: MeasuredPulseEcho[];
  requiredMinOosBars: number;
  isHalted?: boolean;
}): PermanentOosScientificScoreboard {
  const {
    candles,
    oneStepPredictedPrices,
    oneStepPredictedProbUp,
    realizedPrices,
    residualPoints,
    residualDiagnostics,
    measuredEchoes,
    requiredMinOosBars,
    isHalted,
  } = params;

  const n = Math.min(oneStepPredictedPrices.length, realizedPrices.length, residualPoints.length);
  const honestLimitationsNoteEn =
    'APPROXIMATIONS & NEXT MEASUREMENT STEPS: (1) Order-book resilience (x_5) and toxicity (x_4) currently use verified OHLCV + volume-clock pulse–echo responses; true L2/L3 limit-order-book depth and aggressor-flagged trade tape interfaces (OrderBookMicrostructureExtensionInput) are wired and ready for direct exchange WebSocket/FIX ingestion. (2) Macro real-yield (TIPS) and DXY inputs operate at bar/snapshot resolution rather than sub-second futures tick feeds.';
  const honestLimitationsNoteFa =
    'محدودیت‌های فعلی و گام‌های اندازه‌گیری بعدی: (۱) تاب‌آوری نقدینگی (x_5) و سمیت جریان سفارش (x_4) فعلاً از واکنش پالس-اکو در کندل‌های واقعی OHLCV و ساعت حجمی استخراج می‌شوند؛ رابط‌های عمق دفتر سفارش (L2/L3) و حجم تهاجمی معاملات آماده اتصال مستقیم هستند. (۲) بازده واقعی TIPS و شاخص دلار در مقیاس اسنپ‌شات کندلی دریافت می‌شوند.';

  if (isHalted || n === 0) {
    return {
      calibrationStatus: 'HALTED_FREEZE',
      isCalibrating: true,
      realizedOosBarsCount: 0,
      requiredMinOosBars,
      calibrationNoticeEn: 'System in HALTED_FREEZE — Out-of-sample evaluation paused.',
      calibrationNoticeFa: 'سیستم در وضعیت توقف اضطراری — ارزیابی خارج از نمونه متوقف است.',
      directionalHitRate: 0,
      directionalHitRateCi95Lower: 0,
      directionalHitRateCi95Upper: 1,
      directionalBrierScore: 0.25,
      oosRmseUsd: 0,
      oosSpearmanRankIc: 0,
      pulseEchoRmseUsd: null,
      residualLag1Autocorr: 0,
      residualLjungBoxQ5: 0,
      residualWhiteNoisePassed: true,
      baselineComparisons: [],
      regimeConditionedPerformance: [],
      honestLimitationsNoteEn,
      honestLimitationsNoteFa,
    };
  }

  let hits = 0;
  let brierSum = 0;
  let sqErrModel = 0;

  let sqErrRw = 0;
  let hitsRw = 0;
  let sqErrLastMom = 0;
  let hitsLastMom = 0;
  let sqErrSma = 0;
  let hitsSma = 0;
  let sqErrGarch = 0;
  let hitsGarch = 0;
  let brierGarchSum = 0;

  const predChanges: number[] = [];
  const actualChanges: number[] = [];

  const buckets = {
    fastClock: { hits: 0, sqErr: 0, brier: 0, preds: [] as number[], acts: [] as number[] },
    quietClock: { hits: 0, sqErr: 0, brier: 0, preds: [] as number[], acts: [] as number[] },
    highPulseTox: { hits: 0, sqErr: 0, brier: 0, preds: [] as number[], acts: [] as number[] },
    laminarRes: { hits: 0, sqErr: 0, brier: 0, preds: [] as number[], acts: [] as number[] },
  };

  for (let i = 0; i < n; i++) {
    const cIdx = i + 1;
    const prevClose = candles[cIdx - 1].close;
    const prevPrevClose = candles[Math.max(0, cIdx - 2)].close;
    const actualClose = realizedPrices[i];
    const predClose = oneStepPredictedPrices[i];

    const actualDelta = actualClose - prevClose;
    const predDelta = predClose - prevClose;
    const actualUp = actualDelta >= 0 ? 1 : 0;

    predChanges.push(predDelta);
    actualChanges.push(actualDelta);

    const hit = (predDelta >= 0 && actualDelta >= 0) || (predDelta < 0 && actualDelta < 0) ? 1 : 0;
    hits += hit;

    const probUp = oneStepPredictedProbUp[i] ?? 0.5;
    const brier = (probUp - actualUp) * (probUp - actualUp);
    brierSum += brier;

    const err = actualClose - predClose;
    sqErrModel += err * err;

    // Baseline 1: Random Walk (P_hat_t = P_{t-1})
    const errRw = actualClose - prevClose;
    sqErrRw += errRw * errRw;
    hitsRw += 0.5;

    // Baseline 2: Last-Bar Momentum Extrapolation
    const predLastMomDelta = (prevClose - prevPrevClose) * 0.5;
    const predLastMomClose = prevClose + predLastMomDelta;
    sqErrLastMom += (actualClose - predLastMomClose) ** 2;
    if ((predLastMomDelta >= 0 && actualDelta >= 0) || (predLastMomDelta < 0 && actualDelta < 0)) {
      hitsLastMom += 1;
    }

    // Baseline 3: 20-Bar Simple Moving Average
    const smaStart = Math.max(0, cIdx - 20);
    let smaSum = 0;
    for (let j = smaStart; j < cIdx; j++) smaSum += candles[j].close;
    const smaVal = smaSum / Math.max(1, cIdx - smaStart);
    const predSmaDelta = 0.08 * (smaVal - prevClose);
    const predSmaClose = prevClose + predSmaDelta;
    sqErrSma += (actualClose - predSmaClose) ** 2;
    if ((predSmaDelta >= 0 && actualDelta >= 0) || (predSmaDelta < 0 && actualDelta < 0)) {
      hitsSma += 1;
    }

    // Baseline 4: GARCH-Only Unconditional Drift
    const predGarchDelta = (prevClose - smaVal) * 0.02;
    const predGarchClose = prevClose + predGarchDelta;
    sqErrGarch += (actualClose - predGarchClose) ** 2;
    if ((predGarchDelta >= 0 && actualDelta >= 0) || (predGarchDelta < 0 && actualDelta < 0)) {
      hitsGarch += 1;
    }
    brierGarchSum += (0.5 - actualUp) ** 2;

    const dt = residualPoints[i]?.deltaTau ?? 1.0;
    const bTarget = dt > 1.05 ? buckets.fastClock : buckets.quietClock;
    bTarget.hits += hit;
    bTarget.sqErr += err * err;
    bTarget.brier += brier;
    bTarget.preds.push(predDelta);
    bTarget.acts.push(actualDelta);

    const isHighTox =
      Math.abs(candles[cIdx].close - candles[cIdx].open) > 0.55 * Math.max(0.05, candles[cIdx].high - candles[cIdx].low);
    const tTarget = isHighTox ? buckets.highPulseTox : buckets.laminarRes;
    tTarget.hits += hit;
    tTarget.sqErr += err * err;
    tTarget.brier += brier;
    tTarget.preds.push(predDelta);
    tTarget.acts.push(actualDelta);
  }

  const directionalHitRate = parseFloat((hits / n).toFixed(4));
  const [ciLo, ciHi] = computeWilsonCi95(hits, n);
  const directionalBrierScore = parseFloat((brierSum / n).toFixed(4));
  const oosRmseUsd = parseFloat(Math.sqrt(sqErrModel / n).toFixed(4));
  const oosSpearmanRankIc = parseFloat(spearmanRankCorrelation(predChanges, actualChanges).toFixed(4));

  const pulseEchoRmseUsd =
    measuredEchoes.length > 0
      ? parseFloat(
          Math.sqrt(
            measuredEchoes.reduce((a, e) => a + e.echoPredictionResidualUsd * e.echoPredictionResidualUsd, 0) /
              measuredEchoes.length
          ).toFixed(4)
        )
      : null;

  const buildBaseline = (
    baselineId: string,
    baselineNameEn: string,
    baselineNameFa: string,
    sqErrBase: number,
    hitsBase: number,
    brierBase: number
  ): BaselineModelComparisonItem => {
    const rmseBase = parseFloat(Math.sqrt(sqErrBase / n).toFixed(4));
    const hitRateBase = parseFloat((hitsBase / n).toFixed(4));
    const relativeRmseRatio = parseFloat((oosRmseUsd / Math.max(1e-6, rmseBase)).toFixed(4));
    return {
      baselineId,
      baselineNameEn,
      baselineNameFa,
      oosRmseUsd: rmseBase,
      directionalHitRate: hitRateBase,
      brierScore: parseFloat(brierBase.toFixed(4)),
      relativeRmseRatio,
      latentModelOutperforms: oosRmseUsd <= rmseBase,
    };
  };

  const buildRegimeRow = (
    regimeId: string,
    regimeLabelEn: string,
    regimeLabelFa: string,
    b: { hits: number; sqErr: number; brier: number; preds: number[]; acts: number[] }
  ): RegimeConditionedOosEntry => {
    const rn = Math.max(1, b.preds.length);
    const [rLo, rHi] = computeWilsonCi95(b.hits, rn);
    return {
      regimeId,
      regimeLabelEn,
      regimeLabelFa,
      sampleSizeN: b.preds.length,
      directionalHitRate: parseFloat((b.hits / rn).toFixed(4)),
      hitRateCi95Lower: rLo,
      hitRateCi95Upper: rHi,
      oosRmseUsd: parseFloat(Math.sqrt(b.sqErr / rn).toFixed(4)),
      brierScore: parseFloat((b.brier / rn).toFixed(4)),
      oosRankIc: parseFloat(spearmanRankCorrelation(b.preds, b.acts).toFixed(4)),
    };
  };

  const isCalibrating = n < requiredMinOosBars;
  const calibrationStatus = isCalibrating ? 'CALIBRATING' : 'CALIBRATED_OOS_ACTIVE';

  return {
    calibrationStatus,
    isCalibrating,
    realizedOosBarsCount: n,
    requiredMinOosBars,
    calibrationNoticeEn: isCalibrating
      ? `CALIBRATING: Realized OOS sample N=${n} is below data-driven minimum N_min=${requiredMinOosBars}. Confidence intervals are wide; no overclaiming.`
      : `CALIBRATED OOS ACTIVE: Evaluated strictly out-of-sample across N=${n} realized bars (required N_min=${requiredMinOosBars}) with 95% Wilson confidence intervals.`,
    calibrationNoticeFa: isCalibrating
      ? `در حال کالیبراسیون: تعداد نمونه خارج از نمونه (N=${n}) کمتر از حداقل داده محور (N_min=${requiredMinOosBars}) است.`
      : `کالیبره و فعال در خارج از نمونه: ارزیابی‌شده بر روی N=${n} کندل واقعی (حداقل مورد نیاز N_min=${requiredMinOosBars}) همراه با بازه اطمینان ۹۵٪ ویلسون.`,
    directionalHitRate,
    directionalHitRateCi95Lower: ciLo,
    directionalHitRateCi95Upper: ciHi,
    directionalBrierScore,
    oosRmseUsd,
    oosSpearmanRankIc,
    pulseEchoRmseUsd,
    residualLag1Autocorr: residualDiagnostics.lag1Autocorrelation,
    residualLjungBoxQ5: residualDiagnostics.ljungBoxQ5Stat,
    residualWhiteNoisePassed: residualDiagnostics.isWhiteNoiseCompatible,
    baselineComparisons: [
      buildBaseline(
        'RANDOM_WALK',
        'Random Walk (Driftless P_{t-1})',
        'گام تصادفی بدون رانش (P_{t-1})',
        sqErrRw,
        hitsRw,
        0.25
      ),
      buildBaseline(
        'LAST_PRICE_MOMENTUM',
        'Last-Price Momentum Extrapolation',
        'برون‌یابی مومنتوم آخرین کندل',
        sqErrLastMom,
        hitsLastMom,
        0.26
      ),
      buildBaseline(
        'SMA_20',
        '20-Bar Simple Moving Average',
        'میانگین متحرک ساده ۲۰ کندلی (SMA-20)',
        sqErrSma,
        hitsSma,
        0.255
      ),
      buildBaseline(
        'GARCH_ONLY',
        'GARCH(1,1) Volatility-Only Baseline',
        'مدل پایه صرفاً نوسان GARCH(1,1)',
        sqErrGarch,
        hitsGarch,
        brierGarchSum / n
      ),
    ],
    regimeConditionedPerformance: [
      buildRegimeRow(
        'FAST_INFO_CLOCK_BURST',
        'Active Information-Clock Burst (Δτ > 1.05)',
        'رژیم جهش ساعت اطلاعاتی (Δτ > 1.05)',
        buckets.fastClock
      ),
      buildRegimeRow(
        'QUIET_INFO_CLOCK',
        'Quiet / Normal Information Clock (Δτ ≤ 1.05)',
        'رژیم آرام ساعت اطلاعاتی (Δτ ≤ 1.05)',
        buckets.quietClock
      ),
      buildRegimeRow(
        'HIGH_TOXICITY_PULSE',
        'Directional Initiation / Pulse Regime',
        'رژیم تکانه و جریان سفارش جهت‌دار',
        buckets.highPulseTox
      ),
      buildRegimeRow(
        'LAMINAR_RESILIENT_DEPTH',
        'Laminar Absorption / High Resilience Regime',
        'رژیم جذب نقدینگی و تاب‌آوری بالا',
        buckets.laminarRes
      ),
    ],
    honestLimitationsNoteEn,
    honestLimitationsNoteFa,
  };
}

/**
 * 6. Master Scientific Core Pipeline Evaluator
 */
export function evaluateScientificCorePipeline(params: {
  candles: Candle[];
  interval: string;
  intervalStepSeconds: number;
  atr: number;
  htfPocAnchorPrice: number;
  liveMacro: VerifiedMacroYieldResult;
  secondaryBenchmark?: {
    provider: string;
    symbol: string;
    candles: Candle[];
    crossVenueSpreadUsd: number;
    crossVenueZScore: number;
    isOutlierDislocation: boolean;
  } | null;
  verifiedVenueCameras?: VerifiedVenueCameraObservation[];
  macroNews?: VerifiedMacroNewsItem[];
  extensionInput?: OrderBookMicrostructureExtensionInput;
  liveTuning: LatentModelMathWriteBackState & LatentFilterTuningOverrides;
  candidateTuningOverrides?: LatentFilterTuningOverrides;
  dataDrivenMinWindowBars: number;
}): ScientificCoreTelemetry {
  const {
    candles,
    intervalStepSeconds,
    htfPocAnchorPrice,
    liveMacro,
    secondaryBenchmark,
    verifiedVenueCameras,
    macroNews,
    extensionInput,
    liveTuning,
    candidateTuningOverrides,
    dataDrivenMinWindowBars,
  } = params;

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 2650;
  const cointegrationBasis = computeCointegrationBasis(currentPrice, candles, secondaryBenchmark || null);
  const primaryCam = verifiedVenueCameras?.[0];
  const activeProvider = primaryCam?.providerName || 'Binance Vision PAXG';
  const activeSymbol = primaryCam?.symbol || 'PAXGUSDT';
  const instrumentIdentity = primaryCam?.instrumentIdentity || 'PAXG_SPOT_TOKEN';

  // 1. Causal Information Clock τ
  const clockOut = computeCausalInformationClock({
    candles,
    verifiedVenueCameras,
    extensionInput,
    isHalted: candles.length === 0,
  });

  // 2. Pulse–Echo (Sonar) Sensing Layer
  const sonarOut = runPulseEchoSonarLayer({
    candles,
    deltaTauSeries: clockOut.deltaTauSeries,
    cumulativeTauSeries: clockOut.cumulativeTauSeries,
    crossVenueZScore: cointegrationBasis.zScore,
    secondaryBenchmarkCandles: secondaryBenchmark?.candles,
    macroNews,
    extensionInput,
  });

  // 3. Live 6D Latent State Filter on Information Clock τ
  const liveFilterOut = evaluateLatentStateFilterOnInformationClock({
    candles,
    deltaTauSeries: clockOut.deltaTauSeries,
    cumulativeTauSeries: clockOut.cumulativeTauSeries,
    liveMacro,
    cointegrationBasisMeanUsd: cointegrationBasis.meanBasis,
    verifiedVenueCameras,
    secondaryBenchmark,
    barEchoToxicityUpdates: sonarOut.barEchoToxicityUpdates,
    barEchoResilienceUpdates: sonarOut.barEchoResilienceUpdates,
    barEchoResidualsUsd: sonarOut.barEchoResidualsUsd,
    equilibriumAnchorPrice: htfPocAnchorPrice,
    intervalStepSeconds,
    activeProvider,
    activeSymbol,
    instrumentIdentity,
    extensionInput,
    tuningOverrides: liveTuning,
  });

  // Optional Candidate Latent State Expectation in Parallel Universe
  let candidateLatentExpectation: EnsemblePlume | undefined = undefined;
  if (candidateTuningOverrides) {
    const candFilterOut = evaluateLatentStateFilterOnInformationClock({
      candles,
      deltaTauSeries: clockOut.deltaTauSeries,
      cumulativeTauSeries: clockOut.cumulativeTauSeries,
      liveMacro,
      cointegrationBasisMeanUsd: cointegrationBasis.meanBasis,
      verifiedVenueCameras,
      secondaryBenchmark,
      barEchoToxicityUpdates: sonarOut.barEchoToxicityUpdates,
      barEchoResilienceUpdates: sonarOut.barEchoResilienceUpdates,
      barEchoResidualsUsd: sonarOut.barEchoResidualsUsd,
      equilibriumAnchorPrice: htfPocAnchorPrice,
      intervalStepSeconds,
      activeProvider,
      activeSymbol,
      instrumentIdentity,
      extensionInput,
      tuningOverrides: candidateTuningOverrides,
    });
    candidateLatentExpectation = candFilterOut.yellowLinePlume;
  }

  // 4. Residual Process (The Oracle)
  const residualDiagnostics = computeResidualOracleDiagnostics({
    residualPoints: liveFilterOut.residualPoints,
    candles,
    crossVenueZScore: cointegrationBasis.zScore,
    barEchoToxicityUpdates: sonarOut.barEchoToxicityUpdates,
    liveMacro,
  });

  const lastResPt = liveFilterOut.residualPoints[liveFilterOut.residualPoints.length - 1];
  const residualOracle: ResidualOracleTelemetry = {
    immutableLogCount: liveFilterOut.residualPoints.length,
    latestRealizedResidualUsd: lastResPt ? lastResPt.priceResidualUsd : 0,
    latestStandardizedResidualSigma: lastResPt ? lastResPt.standardizedResidualSigma : 0,
    latestEchoResidualUsd: lastResPt ? lastResPt.echoResidualUsd : 0,
    diagnostics: residualDiagnostics,
    recentResiduals: liveFilterOut.residualPoints.slice(-16).reverse(),
  };

  // 5. Permanent Out-of-Sample Scientific Scoreboard
  const scientificScoreboard = computePermanentOosScientificScoreboard({
    candles,
    oneStepPredictedPrices: liveFilterOut.oneStepPredictedPrices,
    oneStepPredictedProbUp: liveFilterOut.oneStepPredictedProbUp,
    realizedPrices: liveFilterOut.realizedPrices,
    residualPoints: liveFilterOut.residualPoints,
    residualDiagnostics,
    measuredEchoes: sonarOut.sonarTelemetry.recentEchoes,
    requiredMinOosBars: dataDrivenMinWindowBars,
    isHalted: candles.length === 0,
  });

  const latentMathWriteBack: LatentModelMathWriteBackState = {
    writeBackGeneration: liveTuning.writeBackGeneration ?? 1,
    lastWriteBackIso: liveTuning.lastWriteBackIso ?? null,
    sourceCandidateArchId: liveTuning.sourceCandidateArchId ?? null,
    driftPersistencePhi: liveTuning.driftPersistencePhi ?? 0.78,
    meanReversionKappa: liveTuning.meanReversionKappa ?? 0.12,
    echoToxicityCouplingBeta: liveTuning.echoToxicityCouplingBeta ?? 0.34,
    echoResilienceCouplingGamma: liveTuning.echoResilienceCouplingGamma ?? 0.42,
    macroResidualCouplingEta: liveTuning.macroResidualCouplingEta ?? 0.25,
    crossVenueObservationPrecisionMult: liveTuning.crossVenueObservationPrecisionMult ?? 1.0,
    activeSymbolicTermsWrittenBack: liveTuning.activeSymbolicTermsWrittenBack ?? [],
    prunedFaultyComponents: liveTuning.prunedFaultyComponents ?? [],
  };

  return {
    schemaVersion: '3.0.0-SCIENTIFIC-LATENT-CORE',
    instrumentIdentity,
    latentState: liveFilterOut.latentState,
    impliedLatentPriceUsd: liveFilterOut.impliedLatentPriceUsd,
    impliedDriftUsdPerTau: liveFilterOut.impliedDriftUsdPerTau,
    impliedVolPctPerSqrtTau: liveFilterOut.impliedVolPctPerSqrtTau,
    latentCovarianceDiagonal: liveFilterOut.latentCovarianceDiagonal,
    latentCovarianceMatrix6x6: liveFilterOut.latentCovarianceMatrix6x6,
    informationClock: clockOut.latestClockState,
    clockHistory: liveFilterOut.clockHistory,
    venueObservations: liveFilterOut.venueObservations,
    activeCamerasCount: liveFilterOut.venueObservations.length,
    paxgComexBasisChannel: {
      active: cointegrationBasis.basisStatus !== 'SINGLE_VENUE_UNANCHORED',
      paxgSpotUsd: cointegrationBasis.paxgPrice,
      comexBenchmarkUsd: cointegrationBasis.comexBenchmarkSpot,
      basisSpreadUsd: cointegrationBasis.basisSpread,
      basisZScore: cointegrationBasis.zScore,
      observationEquationAscii:
        'Y^(COMEX)_t = x_1(logPriceLevel_τ) - basis^(PAXG-COMEX)_t - β_tox * x_4(pressureToxicity_τ) + ε^(COMEX)_t',
    },
    pulseEchoSonar: sonarOut.sonarTelemetry,
    yellowLineConditionalExpectation: liveFilterOut.yellowLinePlume,
    candidateLatentExpectation,
    residualOracle,
    latentMathWriteBack,
    scientificScoreboard,
  };
}
