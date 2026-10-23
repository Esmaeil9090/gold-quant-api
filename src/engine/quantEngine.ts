import {
  buildEmpiricalCalibrationBundle,
  computeEmpiricalQuantilePlumes,
  EmpiricalCalibrationBundle,
  fitEmpiricalGarch11,
} from '../config/parameterRegistry.js';
import type {
  Candle,
  CointegrationBasis,
  ConvergencePoint,
  DirectionalPressureGauge,
  EmpiricalCalibrationScore,
  FilterInnovationConsistency,
  InnovationConsistencyState,
  IsobarLevel,
  MorseManifoldTelemetry,
  MultiTimeframeRegime,
  ObserverTelemetryPayload,
  PcaMacroFactors,
  SweepDiscriminatorTelemetry,
  VectorPoint,
  VerifiedMacroYieldResult,
  VolumeClockTelemetry,
  VpinBaseResult,
  VpinTelemetry,
} from '../contracts/quantContracts.js';

/**
 * Pure Quantitative Engine (Layer 2 — Zero I/O)
 * All functions in this module are strictly deterministic functions of verified market inputs.
 * Zero network calls, zero filesystem calls, zero synthetic random generators.
 */

export function computeVpinAndShrinkage(
  candles: Candle[],
  calibration: EmpiricalCalibrationBundle
): VpinBaseResult {
  const windowSize = Math.min(25, candles.length);
  const subset = candles.slice(-windowSize);
  if (subset.length === 0) {
    return { vpinScore: 0.0, regime: 'LOW_VOLUME_NOISE', shrinkageRatio: 0.5, relativeVolumeRatio: 1.0 };
  }

  let totalVol = 0;
  let totalImbalance = 0;

  for (let i = 0; i < subset.length; i++) {
    const c = subset[i];
    const span = Math.max(0.02, c.high - c.low);
    const buyFrac = Math.max(0.0, Math.min(1.0, (c.close - c.low) / span));
    const sellFrac = 1.0 - buyFrac;
    const vBuy = c.volume * buyFrac;
    const vSell = c.volume * sellFrac;
    totalVol += c.volume;
    totalImbalance += Math.abs(vBuy - vSell);
  }

  const vpinScore = parseFloat((totalImbalance / Math.max(1e-6, totalVol)).toFixed(4));
  const { lowToxicityThreshold, highToxicityThreshold, sigmaB2Prior, sigmaNoise2Empirical } =
    calibration.vpinAndShrinkage;

  let regime: 'HIGH_INFORMED_TOXICITY' | 'BALANCED_LAMINAR' | 'LOW_VOLUME_NOISE' = 'BALANCED_LAMINAR';
  if (vpinScore > highToxicityThreshold) {
    regime = 'HIGH_INFORMED_TOXICITY';
  } else if (vpinScore < lowToxicityThreshold) {
    regime = 'LOW_VOLUME_NOISE';
  }

  const meanVol = totalVol / subset.length;
  const lastVol = subset[subset.length - 1].volume;
  const relativeVolumeRatio = parseFloat((lastVol / Math.max(1e-6, meanVol)).toFixed(3));

  const effectiveNoise = sigmaNoise2Empirical / Math.max(0.2, relativeVolumeRatio);
  const shrinkageRatio = parseFloat((sigmaB2Prior / (sigmaB2Prior + effectiveNoise)).toFixed(3));

  return { vpinScore, regime, shrinkageRatio, relativeVolumeRatio };
}

export function computeCointegrationBasis(
  currentPrice: number,
  candles: Candle[],
  secondaryBenchmark: {
    provider: string;
    symbol: string;
    candles: Candle[];
    crossVenueSpreadUsd: number;
    crossVenueZScore: number;
    isOutlierDislocation: boolean;
  } | null
): CointegrationBasis {
  if (!secondaryBenchmark || secondaryBenchmark.candles.length < 10) {
    const subset = candles.slice(-30);
    let volSum = 0;
    let pvSum = 0;
    const vwapSpreads: number[] = [];
    for (const c of subset) {
      volSum += c.volume;
      pvSum += c.close * c.volume;
      const runningVwap = pvSum / Math.max(1e-6, volSum);
      vwapSpreads.push(c.close - runningVwap);
    }
    const meanBasis = vwapSpreads.reduce((a, b) => a + b, 0) / Math.max(1, vwapSpreads.length);
    const variance =
      vwapSpreads.reduce((a, b) => a + Math.pow(b - meanBasis, 2), 0) / Math.max(1, vwapSpreads.length - 1);
    const stdBasis = Math.sqrt(Math.max(0.04, variance));
    const basisSpread = parseFloat((vwapSpreads[vwapSpreads.length - 1] || 0).toFixed(2));
    const zScore = parseFloat(((basisSpread - meanBasis) / stdBasis).toFixed(2));

    return {
      paxgPrice: currentPrice,
      comexBenchmarkSpot: parseFloat((currentPrice - basisSpread).toFixed(2)),
      benchmarkSource: 'Rolling Intraday Real VWAP Anchor (Single-Venue Mode)',
      basisSpread,
      meanBasis: parseFloat(meanBasis.toFixed(2)),
      stdBasis: parseFloat(stdBasis.toFixed(2)),
      zScore,
      purgedPrice: parseFloat((currentPrice - basisSpread).toFixed(2)),
      basisStatus: 'SINGLE_VENUE_UNANCHORED',
    };
  }

  const bCandles = secondaryBenchmark.candles;
  const windowSize = Math.min(30, candles.length, bCandles.length);
  const basisSeries: number[] = [];
  for (let i = 0; i < windowSize; i++) {
    const pClose = candles[candles.length - windowSize + i].close;
    const bClose = bCandles[bCandles.length - windowSize + i].close;
    basisSeries.push(pClose - bClose);
  }

  const meanBasis = basisSeries.reduce((a, b) => a + b, 0) / Math.max(1, basisSeries.length);
  const variance =
    basisSeries.reduce((a, b) => a + Math.pow(b - meanBasis, 2), 0) / Math.max(1, basisSeries.length - 1);
  const stdBasis = Math.sqrt(Math.max(0.05, variance));

  const comexBenchmarkSpot = parseFloat(bCandles[bCandles.length - 1].close.toFixed(2));
  const basisSpread = parseFloat((currentPrice - comexBenchmarkSpot).toFixed(2));
  const zScore = parseFloat(((basisSpread - meanBasis) / stdBasis).toFixed(2));
  const purgedPrice = parseFloat((currentPrice - meanBasis).toFixed(2));

  let basisStatus: CointegrationBasis['basisStatus'] = 'PARITY_EQUILIBRIUM';
  if (Math.abs(zScore) > 2.5) {
    basisStatus = 'DISLOCATION_ARBITRAGE';
  } else if (zScore > 1.4) {
    basisStatus = 'CRYPTO_TOKEN_PREMIUM';
  } else if (zScore < -1.4) {
    basisStatus = 'CRYPTO_TOKEN_DISCOUNT';
  }

  return {
    paxgPrice: currentPrice,
    comexBenchmarkSpot,
    benchmarkSource: `${secondaryBenchmark.provider} (${secondaryBenchmark.symbol})`,
    basisSpread,
    meanBasis: parseFloat(meanBasis.toFixed(2)),
    stdBasis: parseFloat(stdBasis.toFixed(2)),
    zScore,
    purgedPrice,
    basisStatus,
  };
}

export function computeOrthogonalMacroFactors(
  macroYield: VerifiedMacroYieldResult,
  candles: Candle[],
  cointegrationBasis: CointegrationBasis
): PcaMacroFactors {
  const closes = candles.map(c => c.close);
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push((closes[i] - closes[i - 1]) / Math.max(1, closes[i - 1]));
  }
  const meanRet = rets.length > 0 ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const stdRet =
    rets.length > 1
      ? Math.sqrt(Math.max(1e-8, rets.reduce((a, r) => a + Math.pow(r - meanRet, 2), 0) / (rets.length - 1)))
      : 0.002;

  const t1 = macroYield.realYieldGravity;
  const t2 = macroYield.dollarDrag;
  const t3 = parseFloat((-0.45 * (macroYield.nominal10Y - 4.0)).toFixed(3));
  const t4 = macroYield.centralBankTide;
  const t5 = parseFloat(Math.max(-0.8, Math.min(1.2, (stdRet - 0.0018) * 180)).toFixed(3));
  const t6 = parseFloat(((macroYield.breakevenInflation10Y - 2.15) * 0.85).toFixed(3));
  const t7 = parseFloat(Math.max(-0.8, Math.min(0.8, -0.18 * cointegrationBasis.zScore)).toFixed(3));
  const lookbackIdx = Math.max(0, closes.length - 20);
  const realDrift20 =
    closes.length > 1 ? (closes[closes.length - 1] - closes[lookbackIdx]) / Math.max(1, closes.length - lookbackIdx) : 0;
  const t8 = parseFloat(Math.max(-1.2, Math.min(1.2, realDrift20 * 0.35)).toFixed(3));

  const rawTheories = [
    {
      id: 'T1',
      name: 'Barsky-Summers (1987) TIPS Real Yield Gravity',
      value: t1,
      unit: '$/hr',
      description: 'Opportunity cost vs. real inflation-indexed Treasury yield (DFII10 / TIP)',
    },
    {
      id: 'T2',
      name: 'US Dollar Index (DXY) Currency Drag',
      value: t2,
      unit: '$/hr',
      description: 'Cross-currency purchasing power translation drag (DX-Y.NYB)',
    },
    {
      id: 'T3',
      name: "Gibson's Paradox (Nominal 10Y Yield Sensitivity)",
      value: t3,
      unit: '$/hr',
      description: 'Empirical sensitivity to nominal 10Y US Treasury yield (^TNX / DGS10)',
    },
    {
      id: 'T4',
      name: 'Sovereign Reserve Accumulation Baseline',
      value: t4,
      unit: '$/hr',
      description: 'Structural central bank reserve demand scaled by real rate regime',
    },
    {
      id: 'T5',
      name: 'Realized Volatility Convexity Impulse',
      value: t5,
      unit: '$/hr',
      description: 'Empirical intraday return dispersion impulse from verified OHLCV bars',
    },
    {
      id: 'T6',
      name: '10Y Breakeven Inflation Expectation Impulse',
      value: t6,
      unit: '$/hr',
      description: 'Inflation compensation spread derived from nominal vs. TIPS yields (T10YIE)',
    },
    {
      id: 'T7',
      name: 'Cross-Venue Basis Arbitrage Pressure',
      value: t7,
      unit: '$/hr',
      description: 'Empirical spread dislocation between PAXG and secondary benchmark (GC=F / Kraken)',
    },
    {
      id: 'T8',
      name: 'Trailing 20-Bar Empirical Momentum Drift',
      value: t8,
      unit: '$/hr',
      description: 'Realized price drift rate over the trailing 20 verified bars',
    },
  ];

  const f1 = parseFloat(
    (-0.42 * t1 - 0.38 * t2 - 0.35 * t3 + 0.15 * t4 + 0.12 * t5 + 0.18 * t6 + 0.14 * t7 + 0.2 * t8).toFixed(3)
  );
  const f2 = parseFloat(
    (0.12 * t1 - 0.18 * t2 + 0.1 * t3 + 0.48 * t4 + 0.25 * t5 + 0.2 * t6 + 0.42 * t7 + 0.5 * t8).toFixed(3)
  );
  const f3 = parseFloat(
    (0.1 * t1 + 0.15 * t2 - 0.12 * t3 + 0.22 * t4 + 0.62 * t5 + 0.58 * t6 + 0.16 * t7 + 0.24 * t8).toFixed(3)
  );

  const e1 = Math.pow(f1, 2) + 0.05;
  const e2 = Math.pow(f2, 2) + 0.03;
  const e3 = Math.pow(f3, 2) + 0.02;
  const eSum = e1 + e2 + e3;
  const f1Weight = parseFloat((e1 / eSum).toFixed(3));
  const f2Weight = parseFloat((e2 / eSum).toFixed(3));
  const f3Weight = parseFloat((1.0 - f1Weight - f2Weight).toFixed(3));

  const netOrthogonalLift = parseFloat((f1Weight * f1 + f2Weight * f2 + f3Weight * f3).toFixed(3));
  const maxE = Math.max(e1, e2, e3);
  const minE = Math.max(0.01, Math.min(e1, e2, e3));
  const collinearityConditionNumber = parseFloat(Math.sqrt(maxE / minE).toFixed(2));

  return {
    rawTheories,
    f1RealGeopotential: f1,
    f2MonetaryLiquidity: f2,
    f3TailConvexity: f3,
    f1Weight,
    f2Weight,
    f3Weight,
    netOrthogonalLift,
    collinearityConditionNumber,
    orthogonalityQuality:
      macroYield.status === 'MACRO_FEED_UNAVAILABLE'
        ? 'DEGRADED_MACRO_INPUTS'
        : `EMPIRICAL_FACTOR_PROJECTION (Cond=${collinearityConditionNumber.toFixed(2)})`,
  };
}

/**
 * Computes standardized empirical z-score, historical percentile rank (clamped P5–P95),
 * and explicit sample-size standard error (±1 SE) against a trailing real-data distribution.
 */
export function computeEmpiricalDistributionGauge(
  series: number[],
  currentValue: number
): DirectionalPressureGauge {
  const n = series.length;
  if (n < 2) {
    return {
      zScore: 0.0,
      percentileRank: 50,
      percentileLabel: 'P50',
      standardError: 1.0,
      ciLowerZ: -1.0,
      ciUpperZ: 1.0,
      sampleSize: n,
      p05Threshold: 0.0,
      p50Median: 0.0,
      p95Threshold: 0.0,
      summaryEn: '0.00σ (P50 · ±1.00σ SE)',
      summaryFa: '0.00σ (صدک P50 · ±1.00σ SE)',
    };
  }

  const mean = series.reduce((a, b) => a + b, 0) / n;
  const variance = series.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / Math.max(1, n - 1);
  const std = Math.sqrt(Math.max(1e-8, variance));
  const rawZ = (currentValue - mean) / std;
  const zScore = parseFloat(Math.max(-4.5, Math.min(4.5, rawZ)).toFixed(2));

  const sorted = [...series].sort((a, b) => a - b);
  let countLessOrEqual = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= currentValue) countLessOrEqual++;
  }
  const rawPct = Math.round((countLessOrEqual / n) * 100);
  const percentileRank = Math.max(5, Math.min(95, rawPct));
  const percentileLabel = `P${percentileRank}`;

  // Asymptotic standard error of sample z-score: SE(z) = sqrt((1 + z^2 / 2) / n)
  const standardError = parseFloat(Math.sqrt((1.0 + (zScore * zScore) / 2.0) / n).toFixed(2));
  const ciLowerZ = parseFloat((zScore - standardError).toFixed(2));
  const ciUpperZ = parseFloat((zScore + standardError).toFixed(2));

  const idx05 = Math.max(0, Math.min(n - 1, Math.floor(0.05 * (n - 1))));
  const idx50 = Math.max(0, Math.min(n - 1, Math.floor(0.5 * (n - 1))));
  const idx95 = Math.max(0, Math.min(n - 1, Math.floor(0.95 * (n - 1))));

  const sign = zScore >= 0 ? '+' : '';
  return {
    zScore,
    percentileRank,
    percentileLabel,
    standardError,
    ciLowerZ,
    ciUpperZ,
    sampleSize: n,
    p05Threshold: parseFloat(sorted[idx05].toFixed(3)),
    p50Median: parseFloat(sorted[idx50].toFixed(3)),
    p95Threshold: parseFloat(sorted[idx95].toFixed(3)),
    summaryEn: `${sign}${zScore.toFixed(2)}σ (${percentileLabel} · ±${standardError.toFixed(2)}σ SE, n=${n})`,
    summaryFa: `${sign}${zScore.toFixed(2)}σ (صدک ${percentileLabel} · ±${standardError.toFixed(2)}σ SE, n=${n})`,
  };
}

/**
 * Computes bar-by-bar real directional pressure series across verified OHLCV candles
 * and evaluates the latest bar against the trailing real distribution.
 */
export function computeCandleDirectionalPressure(candles: Candle[], atr: number): DirectionalPressureGauge {
  if (!candles || candles.length < 4) {
    return computeEmpiricalDistributionGauge([], 0);
  }
  const safeAtr = Math.max(0.05, atr);
  const volWindow = Math.min(20, candles.length);
  const meanVol =
    candles.slice(-volWindow).reduce((a, c) => a + c.volume, 0) / Math.max(1, volWindow);

  const pressureSeries: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const barRange = Math.max(safeAtr * 0.25, c.high - c.low);
    const signedBodyRatio = (c.close - c.open) / barRange;
    const volWeight = Math.sqrt(Math.max(0.1, c.volume / Math.max(1e-6, meanVol)));
    pressureSeries.push(signedBodyRatio * volWeight);
  }

  return computeEmpiricalDistributionGauge(
    pressureSeries,
    pressureSeries[pressureSeries.length - 1]
  );
}

export class AdaptiveDPObserver {
  public biasEstimate: number = 0.0;
  public shrunkBias: number = 0.0;
  public estimatedDrift: number = 0.0;
  public garchVol: number = 0.0025;
  public lastPrice: number = 0.0;
  public innovationResidual: number = 0.0;
  public studentizedInnovation: number = 0.0;
  public currentNis: number = 0.0;
  public meanNis25: number = 0.0;
  public consistencyState: InnovationConsistencyState = 'WITHIN_2SIGMA';
  public isJumpGated: boolean = false;
  public jumpMagnitude: number = 0.0;
  public gateStatus: 'JUMP_GATED_FREEZE' | 'LAMINAR_CONTINUOUS' | 'HALTED_FREEZE' = 'LAMINAR_CONTINUOUS';
  public intrinsicDeltaTau: number = 1.0;
  public cumulativeTau: number = 25.0;
  public kalmanGainDynamic: number = 0.16;
  public heartbeatCeilingActive: boolean = false;
  public clockRegime:
    | 'FAST_INFORMATIONAL_BURST'
    | 'SYNCHRONIZED_EQUILIBRIUM'
    | 'HEARTBEAT_CEILING_GUARD'
    | 'HALTED_FREEZE' = 'SYNCHRONIZED_EQUILIBRIUM';
  public history: ConvergencePoint[] = [];
  public isFrozenByCircuitBreaker: boolean = false;

  // Out-of-sample live bar close evaluation buffer (strictly real observations)
  public lastPredictedBarTime: number = 0;
  public lastPredictedDirection: number = 0;
  public lastPredictedProbUp: number = 0.5;
  public lastPredictedCloseBase: number = 0;
  public oosBrierScores: number[] = [];
  public oosDirectionalHits: number[] = [];
  public static readonly MIN_OOS_SAMPLE_SIZE = 30;

  public freezeForHaltedDegraded(): ConvergencePoint[] {
    this.isFrozenByCircuitBreaker = true;
    this.intrinsicDeltaTau = 0.0;
    this.kalmanGainDynamic = 0.0;
    this.consistencyState = 'HALTED_FREEZE';
    this.gateStatus = 'HALTED_FREEZE';
    this.clockRegime = 'HALTED_FREEZE';
    return this.history;
  }

  public getInnovationConsistency(isHalted: boolean = false): FilterInnovationConsistency {
    if (isHalted || this.isFrozenByCircuitBreaker) {
      return {
        state: 'HALTED_FREEZE',
        currentNis: 0,
        meanNis25: 0,
        mahalanobisSigma: 0,
        chiSquare95Threshold: 3.841,
        labelEn: 'HALTED_FREEZE (Filter Mutations Frozen)',
        labelFa: 'متوقف (HALTED_FREEZE)',
      };
    }

    const absSigma = Math.abs(this.studentizedInnovation);
    let labelEn = `WITHIN_2SIGMA (NIS=${this.currentNis.toFixed(2)}, |ẽ|=${absSigma.toFixed(2)}σ)`;
    let labelFa = `در محدوده ۲ سیگما (WITHIN_2SIGMA · NIS=${this.currentNis.toFixed(2)})`;

    if (this.consistencyState === 'FILTER_DIVERGENCE') {
      labelEn = `FILTER_DIVERGENCE (Mean NIS=${this.meanNis25.toFixed(2)} > 3.84 χ²₀.₉₅)`;
      labelFa = `واگرایی فیلتر (FILTER_DIVERGENCE · میانگین NIS=${this.meanNis25.toFixed(2)})`;
    } else if (this.consistencyState === 'TAIL_SHOCK') {
      labelEn = `TAIL_SHOCK (|ẽ|=${absSigma.toFixed(2)}σ · NIS=${this.currentNis.toFixed(2)})`;
      labelFa = `شوک دم توزیع (TAIL_SHOCK · |ẽ|=${absSigma.toFixed(2)}σ)`;
    }

    return {
      state: this.consistencyState,
      currentNis: this.currentNis,
      meanNis25: this.meanNis25,
      mahalanobisSigma: parseFloat(absSigma.toFixed(2)),
      chiSquare95Threshold: 3.841,
      labelEn,
      labelFa,
    };
  }

  public getEmpiricalCalibrationScore(): EmpiricalCalibrationScore {
    if (this.isFrozenByCircuitBreaker) {
      return {
        status: 'HALTED_FREEZE',
        sampleSize: this.oosBrierScores.length,
        minRequiredSample: AdaptiveDPObserver.MIN_OOS_SAMPLE_SIZE,
        brierScore: null,
        directionalHits: null,
        standardError: null,
        labelEn: 'HALTED_FREEZE (Out-of-Sample Scoring Paused)',
        labelFa: 'متوقف (کالیبراسیون خارج از نمونه متوقف شد)',
      };
    }

    const n = this.oosBrierScores.length;
    const minReq = AdaptiveDPObserver.MIN_OOS_SAMPLE_SIZE;

    if (n < minReq) {
      return {
        status: 'CALIBRATING_INSUFFICIENT_SAMPLE',
        sampleSize: n,
        minRequiredSample: minReq,
        brierScore: null,
        directionalHits: null,
        standardError: null,
        labelEn: `CALIBRATING (INSUFFICIENT SAMPLE · ${n}/${minReq} real bars)`,
        labelFa: `در حال کالیبراسیون (نمونه ناکافی · ${n} از ${minReq} کندل واقعی)`,
      };
    }

    const meanBrier = parseFloat(
      (this.oosBrierScores.reduce((a, b) => a + b, 0) / n).toFixed(4)
    );
    const hits = this.oosDirectionalHits.reduce((a, b) => a + b, 0);
    const pHat = hits / n;
    const se = parseFloat(Math.sqrt(Math.max(1e-6, (pHat * (1.0 - pHat)) / n)).toFixed(3));

    return {
      status: 'EMPIRICALLY_CALIBRATED',
      sampleSize: n,
      minRequiredSample: minReq,
      brierScore: meanBrier,
      directionalHits: hits,
      standardError: se,
      labelEn: `Brier: ${meanBrier.toFixed(3)} · Hits: ${hits}/${n} (±${se.toFixed(2)} SE)`,
      labelFa: `نمره برایر: ${meanBrier.toFixed(3)} · اصابت: ${hits}/${n} (±${se.toFixed(2)} SE)`,
    };
  }

  public generateConvergenceHistory(
    candles: Candle[],
    macroForce: number,
    vpinTelemetry: { shrinkageRatio: number; relativeVolumeRatio: number },
    calibration: EmpiricalCalibrationBundle
  ): ConvergencePoint[] {
    if (!candles || candles.length === 0) {
      return this.freezeForHaltedDegraded();
    }
    this.isFrozenByCircuitBreaker = false;
    const history: ConvergencePoint[] = [];
    const subset = candles.slice(-25);
    let b = 0.0;
    let v = 0.0;
    let prevClose = subset[0].close;

    const meanVol = Math.max(1e-6, subset.reduce((acc, c) => acc + c.volume, 0) / Math.max(1, subset.length));
    const { alphaClock, tauMin, tauMax, huberJumpSigmaThreshold, Qv0Empirical, Qb0Empirical, REmpirical } =
      calibration.ekfObserver;

    let Pv = 1.0;
    let Pb = 0.8;
    let R = REmpirical;
    let totalTau = 0.0;
    const nisWindow: number[] = [];

    for (let i = 0; i < subset.length; i++) {
      const c = subset[i];
      const volRatio = c.volume / meanVol;
      const rawTau = alphaClock * volRatio + (1.0 - alphaClock) * 1.0;
      const deltaTau = Math.min(tauMax, Math.max(tauMin, rawTau));
      const isCeiling = rawTau <= tauMin || rawTau >= tauMax;
      totalTau += deltaTau;

      const PvPred = Math.min(4.0, Pv * 0.92 + Qv0Empirical * deltaTau);
      const PbPred = Math.min(3.5, Pb * 0.94 + Qb0Empirical * deltaTau);

      const predicted = prevClose + (v + macroForce + b) * Math.sqrt(deltaTau);
      const innovation = c.close - predicted;

      const Sk = PvPred + PbPred + R;
      const studentized = innovation / Math.sqrt(Math.max(0.05, Sk));
      const nis = parseFloat((studentized * studentized).toFixed(3));
      nisWindow.push(nis);

      let isGated = false;
      let contInnovation = innovation;
      let kGainB = 0.16;

      if (Math.abs(studentized) > huberJumpSigmaThreshold) {
        isGated = true;
        const robustCutoff = Math.sign(studentized) * huberJumpSigmaThreshold * Math.sqrt(Sk);
        contInnovation = robustCutoff;

        R = REmpirical * (1 + 0.35 * Math.pow(studentized, 2));
        Pv = PvPred;
        Pb = PbPred;
        kGainB = 0.04;
      } else {
        isGated = false;
        R = REmpirical / Math.max(0.45, Math.min(1.8, deltaTau));

        kGainB = Math.max(0.06, Math.min(0.42, (PbPred / (PbPred + R)) * 0.55));
        const kGainV = Math.max(0.08, Math.min(0.45, (PvPred / (PvPred + R)) * 0.6));

        b += kGainB * (contInnovation / Math.max(1, c.close * 0.005));
        b = Math.max(-12.0, Math.min(12.0, b));

        v = (1 - kGainV) * v + kGainV * ((c.close - prevClose) / Math.max(0.5, Math.sqrt(deltaTau)));
        v = Math.max(-10.0, Math.min(10.0, v));

        Pv = (1 - kGainV) * PvPred;
        Pb = (1 - kGainB) * PbPred;
      }

      const shrunkB = b * vpinTelemetry.shrinkageRatio;
      prevClose = c.close;

      const d = new Date(c.time * 1000);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

      const runningMeanNis = nisWindow.reduce((acc, val) => acc + val, 0) / nisWindow.length;
      const absStud = Math.abs(studentized);
      let stepState: InnovationConsistencyState = 'WITHIN_2SIGMA';
      if (runningMeanNis > 3.841 || (i > 0 && isGated && history[i - 1]?.isJumpGated)) {
        stepState = 'FILTER_DIVERGENCE';
      } else if (absStud > 2.0 || isGated) {
        stepState = 'TAIL_SHOCK';
      }

      history.push({
        time: timeStr,
        timestamp: c.time,
        unmeasuredBias: parseFloat(b.toFixed(3)),
        shrunkBias: parseFloat(shrunkB.toFixed(3)),
        stateVelocity: parseFloat(v.toFixed(3)),
        innovation: parseFloat(innovation.toFixed(2)),
        studentizedInnovation: parseFloat(studentized.toFixed(2)),
        nis,
        consistencyState: stepState,
        isJumpGated: isGated,
        deltaTau: parseFloat(deltaTau.toFixed(3)),
        kalmanGain: parseFloat(kGainB.toFixed(3)),
      });

      if (i === subset.length - 1) {
        this.intrinsicDeltaTau = parseFloat(deltaTau.toFixed(3));
        this.kalmanGainDynamic = parseFloat(kGainB.toFixed(3));
        this.heartbeatCeilingActive = isCeiling;
        this.clockRegime =
          deltaTau > 1.35
            ? 'FAST_INFORMATIONAL_BURST'
            : isCeiling
            ? 'HEARTBEAT_CEILING_GUARD'
            : 'SYNCHRONIZED_EQUILIBRIUM';
      }
    }

    this.cumulativeTau = parseFloat(totalTau.toFixed(2));
    this.lastPrice = subset[subset.length - 1].close;

    if (history.length > 0) {
      const last = history[history.length - 1];
      this.biasEstimate = last.unmeasuredBias;
      this.shrunkBias = last.shrunkBias;
      this.estimatedDrift = last.stateVelocity;
      this.innovationResidual = last.innovation;
      this.studentizedInnovation = last.studentizedInnovation;
      this.currentNis = last.nis;
      this.meanNis25 = parseFloat(
        (nisWindow.reduce((a, x) => a + x, 0) / Math.max(1, nisWindow.length)).toFixed(3)
      );
      this.consistencyState = last.consistencyState;
      this.isJumpGated = last.isJumpGated;
      this.gateStatus = last.isJumpGated ? 'JUMP_GATED_FREEZE' : 'LAMINAR_CONTINUOUS';
      this.jumpMagnitude = last.isJumpGated ? last.innovation : 0.0;

      // Record strictly real out-of-sample bar transitions when a new real bar timestamp arrives
      const latestBar = subset[subset.length - 1];
      if (this.lastPredictedBarTime > 0 && latestBar.time > this.lastPredictedBarTime) {
        const realizedUp = latestBar.close >= this.lastPredictedCloseBase ? 1 : 0;
        const brier = Math.pow(this.lastPredictedProbUp - realizedUp, 2);
        const dirHit =
          (this.lastPredictedDirection >= 0 && realizedUp === 1) ||
          (this.lastPredictedDirection < 0 && realizedUp === 0)
            ? 1
            : 0;
        this.oosBrierScores.push(brier);
        this.oosDirectionalHits.push(dirHit);
        if (this.oosBrierScores.length > 250) {
          this.oosBrierScores.shift();
          this.oosDirectionalHits.shift();
        }
      }
      this.lastPredictedBarTime = latestBar.time;
      this.lastPredictedCloseBase = latestBar.close;
      this.lastPredictedDirection = this.estimatedDrift + macroForce + this.shrunkBias;
      const zPred = Math.max(-3, Math.min(3, this.lastPredictedDirection / Math.max(0.25, Math.sqrt(REmpirical))));
      this.lastPredictedProbUp = parseFloat((0.5 + 0.5 * Math.tanh(zPred * 0.6)).toFixed(4));
    }
    this.history = history;
    return history;
  }
}

export function computeLogOddsSweepDiscriminator(
  candles: Candle[],
  macroForce: number,
  vpinTelemetry: { vpinScore: number; relativeVolumeRatio: number },
  cointegrationBasis: CointegrationBasis,
  calibration: EmpiricalCalibrationBundle
): SweepDiscriminatorTelemetry {
  if (!candles || candles.length < 5) {
    return {
      logOddsScore: 0.0,
      logOddsZScore: 0.0,
      percentileRank: 50,
      percentileLabel: 'P50',
      standardError: 1.0,
      ciLowerZ: -1.0,
      ciUpperZ: 1.0,
      sampleSize: candles ? candles.length : 0,
      classification: 'HALTED_FREEZE',
      absorptionRatio: 0.0,
      hawkesIntensity: 0.0,
      macroDivergenceScore: 0.0,
      tacticalAction: 'HALTED — AWAITING VERIFIED MARKET FEED',
      tacticalActionFa: 'متوقف — در انتظار اتصال منبع داده واقعی',
    };
  }

  const { hawkesBaseIntensity, hawkesDecayRate, logOddsClassificationThreshold } = calibration.sweepDiscriminator;
  const macroDir = macroForce >= 0 ? 1 : -1;
  const basisAnchored = Math.abs(cointegrationBasis.zScore) < 1.85;

  // Evaluate historical log-odds series across trailing real bars to compute standardized z-score & P5-P95 rank
  const evalWindow = Math.min(120, candles.length);
  const startIdx = candles.length - evalWindow;
  const historicalLogOdds: number[] = [];

  let latestAbsorptionRatio = 0.0;
  let latestHawkesIntensity = 0.0;
  let latestMacroDivergence = 0.0;

  const meanVolAll =
    candles.slice(-evalWindow).reduce((a, c) => a + c.volume, 0) / Math.max(1, evalWindow);

  for (let idx = startIdx; idx < candles.length; idx++) {
    const c = candles[idx];
    const span = Math.max(0.05, c.high - c.low);
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const dominantWick = macroForce >= 0 ? lowerWick : upperWick;
    const absRatio = Math.min(1.0, Math.max(0.05, (dominantWick + (span - body) * 0.5) / span));

    const subStart = Math.max(0, idx - 5);
    const recentSlice = candles.slice(subStart, idx + 1);
    const meanSpan =
      recentSlice.reduce((a, r) => a + Math.max(0.05, r.high - r.low), 0) / Math.max(1, recentSlice.length);
    let hLambda = hawkesBaseIntensity;
    for (let j = 0; j < recentSlice.length; j++) {
      const decay = Math.exp(-(recentSlice.length - 1 - j) * hawkesDecayRate);
      const barIntensity = (recentSlice[j].high - recentSlice[j].low) / Math.max(0.05, meanSpan);
      hLambda += 0.22 * barIntensity * decay;
    }

    const barDir = c.close >= c.open ? 1 : -1;
    const opposesMacro = barDir !== macroDir;
    const macroDiv =
      (opposesMacro ? 0.65 : -0.35) + (basisAnchored ? 0.45 : -0.55) + (absRatio - 0.45) * 1.4;
    const relVol = idx === candles.length - 1
      ? vpinTelemetry.relativeVolumeRatio
      : c.volume / Math.max(1e-6, meanVolAll);

    const rawLO =
      1.85 * (absRatio - 0.42) +
      1.15 * macroDiv +
      0.55 * (relVol - 1.0) -
      0.65 * (Math.abs(cointegrationBasis.zScore) - 1.0);
    const clampedLO = Math.max(-4.5, Math.min(4.5, rawLO));
    historicalLogOdds.push(clampedLO);

    if (idx === candles.length - 1) {
      latestAbsorptionRatio = parseFloat(absRatio.toFixed(3));
      latestHawkesIntensity = parseFloat(Math.min(2.5, hLambda).toFixed(3));
      latestMacroDivergence = parseFloat(macroDiv.toFixed(3));
    }
  }

  const logOddsScore = parseFloat(historicalLogOdds[historicalLogOdds.length - 1].toFixed(2));
  const distGauge = computeEmpiricalDistributionGauge(historicalLogOdds, logOddsScore);

  let classification: SweepDiscriminatorTelemetry['classification'] = 'LAMINAR_AUCTION';
  let tacticalAction = 'HOLD MACRO TRAJECTORY · NORMAL AUCTION';
  let tacticalActionFa = 'حفظ مسیر کلان · جریان عادی بازار';

  if (logOddsScore >= logOddsClassificationThreshold) {
    classification = 'DEALER_STOP_SWEEP';
    tacticalAction = 'ABSORB STOP-SWEEP DIP · DO NOT EXIT MACRO BIAS';
    tacticalActionFa = 'جذب استاپ‌هانت دیلرها · عدم خروج از روند کلان';
  } else if (logOddsScore <= -logOddsClassificationThreshold) {
    classification = 'TRUE_STRUCTURAL_BREAKOUT';
    tacticalAction = 'TRUE STRUCTURAL BREAKOUT · ALIGN WITH MOMENTUM';
    tacticalActionFa = 'شکست ساختاری حقیقی · هم‌جهت با مومنتوم نهادی';
  }

  return {
    logOddsScore,
    logOddsZScore: distGauge.zScore,
    percentileRank: distGauge.percentileRank,
    percentileLabel: distGauge.percentileLabel,
    standardError: distGauge.standardError,
    ciLowerZ: distGauge.ciLowerZ,
    ciUpperZ: distGauge.ciUpperZ,
    sampleSize: distGauge.sampleSize,
    classification,
    absorptionRatio: latestAbsorptionRatio,
    hawkesIntensity: latestHawkesIntensity,
    macroDivergenceScore: latestMacroDivergence,
    tacticalAction,
    tacticalActionFa,
  };
}

export function computeMorsePotentialManifold(
  currentPrice: number,
  equilibriumPrice: number,
  atr: number,
  macroForce: number,
  candles: Candle[]
): MorseManifoldTelemetry {
  const safeAtr = Math.max(0.5, atr);
  const wellDepthDe = parseFloat((12.5 + Math.abs(macroForce) * 4.2).toFixed(2));
  const stiffnessAlpha = parseFloat((0.085 / Math.max(0.5, safeAtr * 0.2)).toFixed(4));
  const equilibriumAnchor = parseFloat((equilibriumPrice + macroForce * 2.2).toFixed(2));

  const disp = currentPrice - equilibriumAnchor;
  const expTerm = Math.exp(Math.max(-4, Math.min(4, -stiffnessAlpha * disp)));
  const morseU = wellDepthDe * Math.pow(1.0 - expTerm, 2);
  const restoringForce = parseFloat((-2.0 * wellDepthDe * stiffnessAlpha * (1.0 - expTerm) * expTerm).toFixed(3));

  const subset = candles.slice(-40);
  const recentHigh = subset.length > 0 ? Math.max(...subset.map(c => c.high)) : currentPrice + 1.8 * safeAtr;
  const recentLow = subset.length > 0 ? Math.min(...subset.map(c => c.low)) : currentPrice - 1.8 * safeAtr;

  const upperWallPrice = parseFloat(Math.max(currentPrice + 0.8 * safeAtr, recentHigh).toFixed(2));
  const lowerWallPrice = parseFloat(Math.min(currentPrice - 0.8 * safeAtr, recentLow).toFixed(2));

  const gammaWalls = [
    {
      price: upperWallPrice,
      polarity: 'CALL_GAMMA_WALL' as const,
      amplitude: parseFloat((4.8 + Math.abs(macroForce)).toFixed(2)),
      widthSigma: parseFloat((safeAtr * 0.45).toFixed(2)),
    },
    {
      price: parseFloat(equilibriumAnchor.toFixed(2)),
      polarity: 'LIQUIDITY_STOP_POOL' as const,
      amplitude: -3.6,
      widthSigma: parseFloat((safeAtr * 0.55).toFixed(2)),
    },
    {
      price: lowerWallPrice,
      polarity: 'PUT_GAMMA_CANYON' as const,
      amplitude: parseFloat((-5.2 - Math.abs(macroForce)).toFixed(2)),
      widthSigma: parseFloat((safeAtr * 0.45).toFixed(2)),
    },
  ];

  return {
    wellDepthDe,
    stiffnessAlpha,
    equilibriumAnchor,
    currentPotentialEnergy: parseFloat(morseU.toFixed(3)),
    restoringForce,
    gammaWalls,
  };
}

export function computeMultiTimeframeMatrix(
  candles: Candle[],
  macroNetLift: number,
  baseBias: number,
  baseVolPct: number
): { matrix: MultiTimeframeRegime[]; confluenceSummary: string; confluenceScore: number } {
  const configs = [
    { tf: '5m', label: 'M5 · Micro Scalp', horizon: '15m - 45m', windowBars: 8, scale: 0.75 },
    { tf: '15m', label: 'M15 · Tactical Core', horizon: '1h - 3h', windowBars: 20, scale: 1.0 },
    { tf: '1h', label: 'H1 · Hydrodynamic', horizon: '6h - 18h', windowBars: 60, scale: 1.35 },
    { tf: '4h', label: 'H4 · Synoptic Front', horizon: '24h - 48h', windowBars: 140, scale: 1.85 },
    { tf: '1d', label: 'D1 · Macro Gravity', horizon: '3d - 14d', windowBars: 280, scale: 2.5 },
  ];

  let laminarCount = 0;
  const matrix: MultiTimeframeRegime[] = configs.map(cfg => {
    const slice = candles.slice(-Math.min(candles.length, cfg.windowBars));
    let empVolPct = baseVolPct;
    let empDrift = 0;
    const barPressureSeries: number[] = [];

    if (slice.length >= 4) {
      const rets: number[] = [];
      for (let i = 1; i < slice.length; i++) {
        const r = (slice[i].close - slice[i - 1].close) / Math.max(1, slice[i - 1].close);
        rets.push(r);
      }
      const m = rets.reduce((a, b) => a + b, 0) / rets.length;
      const v = rets.reduce((a, r) => a + Math.pow(r - m, 2), 0) / Math.max(1, rets.length - 1);
      empVolPct = parseFloat((Math.sqrt(Math.max(1e-8, v)) * 100).toFixed(3));
      empDrift = (slice[slice.length - 1].close - slice[0].close) / Math.max(1, slice.length);

      const meanVol = slice.reduce((a, c) => a + c.volume, 0) / Math.max(1, slice.length);
      for (let i = 0; i < slice.length; i++) {
        const c = slice[i];
        const span = Math.max(0.05, c.high - c.low);
        const bodyRatio = (c.close - c.open) / span;
        const volScale = Math.sqrt(Math.max(0.1, c.volume / Math.max(1e-6, meanVol)));
        barPressureSeries.push(bodyRatio * volScale + (macroNetLift / cfg.scale) * 0.15);
      }
    }

    const drift = parseFloat((macroNetLift * 0.5 + empDrift * 0.5).toFixed(3));
    const bias = parseFloat((baseBias / cfg.scale).toFixed(3));
    const netVelocity = parseFloat((drift + bias).toFixed(3));

    const reynoldsNumber = Math.round(((Math.abs(netVelocity) + 0.15) * 1250) / Math.max(0.08, empVolPct));
    const directionalPressure = computeEmpiricalDistributionGauge(
      barPressureSeries,
      barPressureSeries.length > 0 ? barPressureSeries[barPressureSeries.length - 1] : netVelocity
    );

    let state = 'LAMINAR UPWARD FLOW';
    let stateKey: 'laminar' | 'squall' | 'cyclonic' | 'calm' = 'laminar';
    let actionBias = 'ACCUMULATE DIP';
    let actionColor = '#00e676';

    if (empVolPct > 0.58) {
      state = 'SQUALL / TURBULENCE FRONT';
      stateKey = 'squall';
      actionBias = 'DEFENSIVE HEDGE';
      actionColor = '#ff4081';
    } else if (netVelocity < -0.25) {
      state = 'CYCLONIC DOWNWARD DRAFT';
      stateKey = 'cyclonic';
      actionBias = 'REDUCE EXPOSURE';
      actionColor = '#ff3d5a';
    } else if (Math.abs(netVelocity) < 0.12) {
      state = 'DEAD CALM (RANGE COMPRESSION)';
      stateKey = 'calm';
      actionBias = 'RANGE HARVESTING';
      actionColor = '#ffab00';
    } else {
      state = 'LAMINAR UPWARD FLOW';
      stateKey = 'laminar';
      actionBias = 'AGGRESSIVE LONG';
      actionColor = '#00e676';
      laminarCount++;
    }

    return {
      timeframe: cfg.tf,
      label: cfg.label,
      horizon: cfg.horizon,
      state,
      stateKey,
      reynoldsNumber,
      turbulencePct: empVolPct,
      velocityDrift: netVelocity,
      bias,
      directionalPressure,
      actionBias,
      actionColor,
    };
  });

  const confluenceSummary =
    laminarCount >= 4
      ? `HIGH CONFLUENCE: ${laminarCount}/5 HORIZONS IN LAMINAR UPWARD FLOW`
      : laminarCount >= 3
      ? `MODERATE CONFLUENCE: ${laminarCount}/5 HORIZONS FAVORING UPWARD DRIFT`
      : `REGIME DIVERGENCE: MULTI-SCALE TURBULENCE DETECTED`;

  return { matrix, confluenceSummary, confluenceScore: laminarCount };
}

export function computeVectorFlowField(
  currentPrice: number,
  macroForce: number,
  biasForce: number,
  equilibriumPrice: number,
  garchVol: number
): VectorPoint[] {
  const points: VectorPoint[] = [];
  const priceSpans = [-25, -18, -12, -7, -3, 0, 3, 7, 12, 18, 25];
  const timeOffsets = [0, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

  for (const tMin of timeOffsets) {
    const timeDecay = Math.exp(-tMin / 300);
    for (const dP of priceSpans) {
      const p = currentPrice + dP;
      const restorativeGravity = -0.06 * (p - equilibriumPrice);
      const netVerticalVelocity = (macroForce * 1.8 + biasForce * 1.2 + restorativeGravity) * timeDecay;
      const horizontalVelocity = 1.0;

      const totalSpeed = Math.sqrt(netVerticalVelocity * netVerticalVelocity + horizontalVelocity * horizontalVelocity);
      const intensity = Math.min(1.0, Math.max(0.1, totalSpeed / 5.0 + garchVol * 100));

      let dir: 'upward' | 'downward' | 'eddy' = 'eddy';
      if (netVerticalVelocity > 0.4) dir = 'upward';
      else if (netVerticalVelocity < -0.4) dir = 'downward';

      points.push({
        price: parseFloat(p.toFixed(2)),
        timeOffset: tMin,
        vx: parseFloat(horizontalVelocity.toFixed(2)),
        vy: parseFloat(netVerticalVelocity.toFixed(3)),
        intensity: parseFloat(intensity.toFixed(2)),
        streamDirection: dir,
      });
    }
  }
  return points;
}

export function computeIsobars(currentPrice: number, atr: number, equilibrium: number): IsobarLevel[] {
  const safeAtr = Math.max(0.5, atr);
  return [
    {
      price: parseFloat((currentPrice + 2.8 * safeAtr).toFixed(2)),
      type: 'high_pressure_resistance',
      strength: 88,
      label: 'Major Atmospheric Resistance Ridge (Institutional Supply)',
    },
    {
      price: parseFloat((currentPrice + 1.4 * safeAtr).toFixed(2)),
      type: 'high_pressure_resistance',
      strength: 65,
      label: 'Secondary Isobaric Ceiling',
    },
    {
      price: parseFloat(equilibrium.toFixed(2)),
      type: 'equilibrium_axis',
      strength: 95,
      label: 'Geopotential Equilibrium Axis (Mean Reversion Core)',
    },
    {
      price: parseFloat((currentPrice - 1.4 * safeAtr).toFixed(2)),
      type: 'low_pressure_trough',
      strength: 70,
      label: 'Isobaric Confluence Floor',
    },
    {
      price: parseFloat((currentPrice - 2.8 * safeAtr).toFixed(2)),
      type: 'low_pressure_trough',
      strength: 92,
      label: 'Deep Atmospheric Support Trench (Accumulation Well)',
    },
  ];
}

/**
 * Pure Quantitative Pipeline Orchestrator (Zero I/O)
 * Executes the complete econometric/hydrodynamic pipeline on verified candle & macro inputs.
 */
export function evaluatePureQuantPipeline(
  candles: Candle[],
  liveMacro: VerifiedMacroYieldResult,
  secondaryBenchmark: {
    provider: string;
    symbol: string;
    candles: Candle[];
    crossVenueSpreadUsd: number;
    crossVenueZScore: number;
    isOutlierDislocation: boolean;
  } | null,
  intervalStepSeconds: number,
  observerInst: AdaptiveDPObserver,
  systemState: 'LIVE_NOMINAL' | 'DEGRADED_FALLBACK' | 'HALTED_DEGRADED',
  activeTier: string
) {
  const calibration = buildEmpiricalCalibrationBundle(candles);
  const currentPrice = candles[candles.length - 1].close;
  const closes = candles.map(c => c.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / Math.max(1, closes[i - 1]));
  }

  const eqWindow = Math.min(40, closes.length);
  const equilibriumPrice = closes.slice(-eqWindow).reduce((a, b) => a + b, 0) / eqWindow;
  const atrWindow = Math.min(14, candles.length - 1);
  let trSum = 0;
  for (let i = candles.length - atrWindow; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    trSum += Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
  }
  const atr = parseFloat((trSum / Math.max(1, atrWindow)).toFixed(2));

  const cointegrationBasis = computeCointegrationBasis(currentPrice, candles, secondaryBenchmark);
  const pcaFactors = computeOrthogonalMacroFactors(liveMacro, candles, cointegrationBasis);
  const vpinBase = computeVpinAndShrinkage(candles, calibration);

  const convergenceHistory = observerInst.generateConvergenceHistory(
    candles,
    pcaFactors.netOrthogonalLift,
    vpinBase,
    calibration
  );

  const effectiveBias = observerInst.shrunkBias;

  const vpinTelemetry: VpinTelemetry = {
    ...vpinBase,
    shrunkBias: parseFloat(effectiveBias.toFixed(3)),
    rawBias: parseFloat(observerInst.biasEstimate.toFixed(3)),
    isJumpGated: observerInst.isJumpGated,
    jumpMagnitude: parseFloat(observerInst.jumpMagnitude.toFixed(2)),
    gateStatus: observerInst.gateStatus,
    studentizedInnovation: parseFloat(observerInst.studentizedInnovation.toFixed(2)),
  };

  const volumeClockTelemetry: VolumeClockTelemetry = {
    intrinsicDeltaTau: observerInst.intrinsicDeltaTau,
    cumulativeTau: observerInst.cumulativeTau,
    wallClockSteps: Math.min(25, candles.length),
    dilationRatio: parseFloat((observerInst.cumulativeTau / Math.min(25, candles.length)).toFixed(3)),
    processNoiseScale: observerInst.intrinsicDeltaTau,
    kalmanGainDynamic: observerInst.kalmanGainDynamic,
    heartbeatCeilingActive: observerInst.heartbeatCeilingActive,
    clockRegime: observerInst.clockRegime,
  };

  const sweepDiscriminator = computeLogOddsSweepDiscriminator(
    candles,
    pcaFactors.netOrthogonalLift,
    vpinBase,
    cointegrationBasis,
    calibration
  );

  const morseManifold = computeMorsePotentialManifold(
    currentPrice,
    equilibriumPrice,
    atr,
    pcaFactors.netOrthogonalLift,
    candles
  );

  const macroWindVector = {
    realYieldForce: liveMacro.realYieldGravity,
    dollarDragForce: liveMacro.dollarDrag,
    liquidityTide: liveMacro.centralBankTide,
    netMacroLift: liveMacro.netMacroLift,
    orthogonalMacroLift: pcaFactors.netOrthogonalLift,
    unmeasuredBiasCurrent: parseFloat(effectiveBias.toFixed(3)),
    rawBias: parseFloat(observerInst.biasEstimate.toFixed(3)),
    totalNetVelocity: parseFloat((pcaFactors.netOrthogonalLift + effectiveBias).toFixed(3)),
  };

  const garchFit = fitEmpiricalGarch11(returns);
  const garchParams = garchFit.params;
  const garchVolForecast = garchFit.forecast;
  const currentGarchVolPct = parseFloat((garchVolForecast[0] * 100).toFixed(4));

  const multiTimeframe = computeMultiTimeframeMatrix(
    candles,
    pcaFactors.netOrthogonalLift,
    effectiveBias,
    currentGarchVolPct
  );

  const flowField = computeVectorFlowField(
    currentPrice,
    pcaFactors.netOrthogonalLift,
    effectiveBias,
    equilibriumPrice,
    garchVolForecast[0]
  );

  const isobars = computeIsobars(currentPrice, atr, equilibriumPrice);

  const ensemble = computeEmpiricalQuantilePlumes(
    currentPrice,
    equilibriumPrice,
    0.12,
    garchVolForecast,
    returns,
    24,
    intervalStepSeconds,
    candles[candles.length - 1].time
  );

  let atmosphericState = 'LAMINAR UPWARD FLOW';
  let barometerStatus = 'NORMAL';
  if (systemState === 'DEGRADED_FALLBACK') {
    barometerStatus = `FALLBACK ACTIVE (${activeTier})`;
  }
  if (observerInst.isJumpGated) {
    atmosphericState = 'DISCRETE POISSON JUMP FRONT';
    barometerStatus = 'JUMP-GATED DRIFT FREEZE';
  } else if (currentGarchVolPct > 0.6) {
    atmosphericState = 'SQUALL / HIGH TURBULENCE FRONT';
    barometerStatus = 'RAPID PRESSURE DROP';
  } else if (Math.abs(pcaFactors.netOrthogonalLift + effectiveBias) < 0.25) {
    atmosphericState = 'DEAD CALM (RANGE OSCILLATION)';
    barometerStatus = 'STAGNANT HIGH PRESSURE';
  } else if (pcaFactors.netOrthogonalLift + effectiveBias < -0.3) {
    atmosphericState = 'CYCLONIC DOWNWARD DRAFT';
    barometerStatus = 'DESCENDING SYSTEM';
  }

  const directionalPressure = computeCandleDirectionalPressure(candles, atr);

  const observerTelemetry: ObserverTelemetryPayload = {
    biasEstimate: parseFloat(observerInst.biasEstimate.toFixed(3)),
    shrunkBias: parseFloat(effectiveBias.toFixed(3)),
    driftVelocity: parseFloat(observerInst.estimatedDrift.toFixed(3)),
    innovationConsistency: observerInst.getInnovationConsistency(false),
    empiricalCalibration: observerInst.getEmpiricalCalibrationScore(),
    innovationError: parseFloat(observerInst.innovationResidual.toFixed(2)),
    studentizedInnovation: parseFloat(observerInst.studentizedInnovation.toFixed(2)),
    isJumpGated: observerInst.isJumpGated,
    jumpMagnitude: parseFloat(observerInst.jumpMagnitude.toFixed(2)),
    gateStatus: observerInst.gateStatus,
    intrinsicDeltaTau: observerInst.intrinsicDeltaTau,
    cumulativeTau: observerInst.cumulativeTau,
    kalmanGainDynamic: observerInst.kalmanGainDynamic,
    clockRegime: observerInst.clockRegime,
    isFrozenByCircuitBreaker: false,
    history: convergenceHistory,
  };

  return {
    calibration,
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    equilibriumPrice: parseFloat(equilibriumPrice.toFixed(2)),
    atr,
    returns,
    cointegrationBasis,
    pcaFactors,
    vpinBase,
    vpinTelemetry,
    volumeClockTelemetry,
    sweepDiscriminator,
    morseManifold,
    macroWindVector,
    directionalPressure,
    garchVolatility: {
      currentVolPct: currentGarchVolPct,
      omega: garchParams[0],
      alpha: garchParams[1],
      beta: garchParams[2],
      persistence: garchFit.persistence,
      unconditionalVolPct: garchFit.unconditionalVolPct,
      logLikelihood: garchFit.logLikelihood,
    },
    multiTimeframe,
    flowField,
    isobars,
    ensemble,
    atmosphericState,
    barometerStatus,
    observerTelemetry,
  };
}
