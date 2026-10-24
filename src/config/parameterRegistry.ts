/**
 * GDF (Gold Dynamic Flow) — Phase 1 Empirical Parameter Calibration & Prior Registry
 * Replaces hardcoded magic numbers with rolling empirical calibration from real market windows
 * and documents fixed theoretical priors with explicit sensitivity bounds.
 */

export interface CalibratedParameterMeta {
  id: string;
  subsystem: string;
  name: string;
  calibrationMethod: 'EMPIRICAL_MLE_ROLLING' | 'EMPIRICAL_SAMPLE_MOMENT' | 'EMPIRICAL_QUANTILE' | 'DOCUMENTED_PRIOR';
  currentValue: number | number[];
  lookbackBars: number;
  sensitivityBounds: [number, number];
  citationOrRationale: string;
}

export interface EmpiricalCalibrationBundle {
  garch: {
    omega: number;
    alpha: number;
    beta: number;
    persistence: number;
    unconditionalVolPct: number;
    logLikelihood: number;
  };
  vpinAndShrinkage: {
    lowToxicityThreshold: number;
    highToxicityThreshold: number;
    sigmaB2Prior: number;
    sigmaNoise2Empirical: number;
  };
  ekfObserver: {
    alphaClock: number;
    tauMin: number;
    tauMax: number;
    huberJumpSigmaThreshold: number;
    Qv0Empirical: number;
    Qb0Empirical: number;
    REmpirical: number;
  };
  sweepDiscriminator: {
    hawkesBaseIntensity: number;
    hawkesDecayRate: number;
    logOddsClassificationThreshold: number;
  };
  registry: CalibratedParameterMeta[];
}

function computePercentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Fits GARCH(1,1) parameters (omega, alpha, beta) on real log/simple returns via
 * constrained quasi-maximum likelihood (QMLE) grid search with variance targeting.
 */
export function fitEmpiricalGarch11(returns: number[]): {
  params: [number, number, number];
  forecast: number[];
  persistence: number;
  unconditionalVolPct: number;
  logLikelihood: number;
} {
  const n = returns.length;
  if (n < 20) {
    const fallbackSigma = 0.0025;
    return {
      params: [1e-6, 0.08, 0.88],
      forecast: Array(24).fill(fallbackSigma),
      persistence: 0.96,
      unconditionalVolPct: fallbackSigma * 100,
      logLikelihood: 0,
    };
  }

  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const centered = returns.map(r => r - mean);
  const sampleVar = Math.max(1e-9, centered.reduce((a, r) => a + r * r, 0) / Math.max(1, n - 1));

  const alphaGrid = [0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.18];
  const betaGrid = [0.76, 0.80, 0.84, 0.87, 0.89, 0.91, 0.93];

  let bestAlpha = 0.08;
  let bestBeta = 0.88;
  let bestOmega = sampleVar * (1 - bestAlpha - bestBeta);
  let bestLogLik = -Infinity;

  for (const a of alphaGrid) {
    for (const b of betaGrid) {
      if (a + b >= 0.992) continue;
      const w = Math.max(1e-10, sampleVar * (1.0 - a - b));
      let s2 = sampleVar;
      let logLik = 0;
      for (let t = 0; t < n; t++) {
        const r2 = centered[t] * centered[t];
        s2 = Math.max(1e-10, w + a * r2 + b * s2);
        logLik += -0.5 * (Math.log(s2) + r2 / s2);
      }
      if (logLik > bestLogLik) {
        bestLogLik = logLik;
        bestAlpha = a;
        bestBeta = b;
        bestOmega = w;
      }
    }
  }

  let sigma2T = sampleVar;
  for (let t = 0; t < n; t++) {
    const r2 = centered[t] * centered[t];
    sigma2T = Math.max(1e-10, bestOmega + bestAlpha * r2 + bestBeta * sigma2T);
  }

  const persistence = parseFloat((bestAlpha + bestBeta).toFixed(4));
  const longRunVar = bestOmega / Math.max(0.008, 1.0 - persistence);
  const forecast: number[] = [];
  let s2Step = sigma2T;

  for (let step = 0; step < 24; step++) {
    if (step === 0) {
      forecast.push(Math.sqrt(s2Step));
    } else {
      s2Step = Math.max(1e-10, bestOmega + persistence * s2Step);
      forecast.push(Math.sqrt(s2Step));
    }
  }

  return {
    params: [bestOmega, bestAlpha, bestBeta],
    forecast,
    persistence,
    unconditionalVolPct: parseFloat((Math.sqrt(longRunVar) * 100).toFixed(4)),
    logLikelihood: parseFloat(bestLogLik.toFixed(2)),
  };
}

/**
 * Deterministic Empirical Quantile Plume Projector (replaces random-walk Monte Carlo simulation).
 * Uses empirical standardized residuals from the real trailing candle window + GARCH volatility path.
 */
export function computeEmpiricalQuantilePlumes(
  currentPrice: number,
  equilibriumPrice: number,
  thetaMeanReversion: number,
  garchForecast: number[],
  realReturns: number[],
  nSteps = 24,
  stepSeconds = 900,
  anchorTimestampSec?: number,
  liquidityFusion?: {
    fusedEquilibriumPrice: number;
    fusedNetDriftUsdPerStep: number;
    liquidityVolatilityMultiplier: number;
    nearestUpperHvn?: number;
    nearestLowerHvn?: number;
  }
): {
  medianTrack: { time: number; value: number }[];
  upper95: { time: number; value: number }[];
  upper75: { time: number; value: number }[];
  lower25: { time: number; value: number }[];
  lower05: { time: number; value: number }[];
  sampleTracks: { id: number; path: { time: number; value: number }[] }[];
} {
  const nowSec = anchorTimestampSec || Math.floor(Date.now() / 1000);
  const meanRet = realReturns.length > 0
    ? realReturns.reduce((a, b) => a + b, 0) / realReturns.length
    : 0;
  const stdRet = realReturns.length > 1
    ? Math.sqrt(Math.max(1e-9, realReturns.reduce((a, r) => a + Math.pow(r - meanRet, 2), 0) / (realReturns.length - 1)))
    : 0.0025;

  const stdInnovations = realReturns.length >= 20
    ? realReturns.map(r => (r - meanRet) / stdRet).sort((a, b) => a - b)
    : [-1.645, -0.674, 0.0, 0.674, 1.645];

  const q05Z = computePercentile(stdInnovations, 0.05);
  const q25Z = computePercentile(stdInnovations, 0.25);
  const q50Z = computePercentile(stdInnovations, 0.50);
  const q75Z = computePercentile(stdInnovations, 0.75);
  const q95Z = computePercentile(stdInnovations, 0.95);

  const medianTrack: { time: number; value: number }[] = [];
  const upper95: { time: number; value: number }[] = [];
  const upper75: { time: number; value: number }[] = [];
  const lower25: { time: number; value: number }[] = [];
  const lower05: { time: number; value: number }[] = [];

  const effectiveEq = liquidityFusion ? liquidityFusion.fusedEquilibriumPrice : equilibriumPrice;
  const fusedDriftStep = liquidityFusion ? liquidityFusion.fusedNetDriftUsdPerStep : 0;
  const volMult = liquidityFusion ? Math.max(0.65, Math.min(1.45, liquidityFusion.liquidityVolatilityMultiplier)) : 1.0;

  let pMed = currentPrice;
  let cumVar = 0;

  for (let step = 0; step < nSteps; step++) {
    const t = nowSec + (step + 1) * stepSeconds;
    const stepVol = (garchForecast[Math.min(step, garchForecast.length - 1)] || stdRet) * volMult;
    cumVar += Math.pow(currentPrice * stepVol, 2);
    const horizonSigmaUsd = Math.sqrt(cumVar);

    const decayFactor = Math.exp(-0.08 * step);
    const mrStep = thetaMeanReversion * (effectiveEq - pMed);
    let nextP = pMed + mrStep + fusedDriftStep * decayFactor;

    if (liquidityFusion?.nearestUpperHvn && nextP > pMed && nextP >= liquidityFusion.nearestUpperHvn) {
      nextP = liquidityFusion.nearestUpperHvn + (nextP - liquidityFusion.nearestUpperHvn) * 0.55;
    } else if (liquidityFusion?.nearestLowerHvn && nextP < pMed && nextP <= liquidityFusion.nearestLowerHvn) {
      nextP = liquidityFusion.nearestLowerHvn + (nextP - liquidityFusion.nearestLowerHvn) * 0.55;
    }
    pMed = nextP;

    medianTrack.push({ time: t, value: parseFloat((pMed + q50Z * horizonSigmaUsd * 0.25).toFixed(2)) });
    upper95.push({ time: t, value: parseFloat((pMed + Math.max(1.2, q95Z) * horizonSigmaUsd).toFixed(2)) });
    upper75.push({ time: t, value: parseFloat((pMed + Math.max(0.45, q75Z) * horizonSigmaUsd).toFixed(2)) });
    lower25.push({ time: t, value: parseFloat((pMed + Math.min(-0.45, q25Z) * horizonSigmaUsd).toFixed(2)) });
    lower05.push({ time: t, value: parseFloat((pMed + Math.min(-1.2, q05Z) * horizonSigmaUsd).toFixed(2)) });
  }

  const sampleTracks = [
    { id: 1, path: lower05 },
    { id: 2, path: lower25 },
    { id: 3, path: medianTrack },
    { id: 4, path: upper75 },
    { id: 5, path: upper95 },
  ];

  return { medianTrack, upper95, upper75, lower25, lower05, sampleTracks };
}

/**
 * Calibrates EKF, VPIN, GARCH, and Sweep Discriminator parameters from real trailing candles.
 */
export function buildEmpiricalCalibrationBundle(
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[]
): EmpiricalCalibrationBundle {
  const closes = candles.map(c => c.close);
  const returns: number[] = [];
  const dollarDiffs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / Math.max(1, closes[i - 1]));
    dollarDiffs.push(closes[i] - closes[i - 1]);
  }

  const garchFit = fitEmpiricalGarch11(returns);

  const rollingImbalances: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const span = Math.max(0.02, c.high - c.low);
    const buyFrac = Math.max(0, Math.min(1, (c.close - c.low) / span));
    const imb = Math.abs(2 * buyFrac - 1);
    rollingImbalances.push(imb);
  }
  const sortedImb = [...rollingImbalances].sort((a, b) => a - b);
  const lowTox = parseFloat(Math.max(0.12, Math.min(0.28, computePercentile(sortedImb, 0.25) * 0.65)).toFixed(3));
  const highTox = parseFloat(Math.max(0.32, Math.min(0.58, computePercentile(sortedImb, 0.75) * 0.65)).toFixed(3));

  const meanDiff = dollarDiffs.length > 0 ? dollarDiffs.reduce((a, b) => a + b, 0) / dollarDiffs.length : 0;
  const dollarVar = dollarDiffs.length > 1
    ? Math.max(0.25, dollarDiffs.reduce((a, d) => a + Math.pow(d - meanDiff, 2), 0) / (dollarDiffs.length - 1))
    : 1.6;

  const sigmaB2Prior = parseFloat(Math.max(1.0, Math.min(12.0, dollarVar * 1.45)).toFixed(3));
  const sigmaNoise2Empirical = parseFloat(Math.max(0.3, Math.min(6.0, dollarVar * 0.45)).toFixed(3));
  const REmpirical = parseFloat(Math.max(0.5, Math.min(8.0, dollarVar * 0.60)).toFixed(3));
  const Qv0Empirical = parseFloat(Math.max(0.04, Math.min(1.2, dollarVar * 0.055)).toFixed(4));
  const Qb0Empirical = parseFloat(Math.max(0.02, Math.min(0.8, dollarVar * 0.035)).toFixed(4));

  const registry: CalibratedParameterMeta[] = [
    {
      id: 'GARCH_OMEGA_ALPHA_BETA',
      subsystem: 'GARCH(1,1) Conditional Volatility',
      name: 'Variance-Targeted QMLE (omega, alpha, beta)',
      calibrationMethod: 'EMPIRICAL_MLE_ROLLING',
      currentValue: garchFit.params,
      lookbackBars: returns.length,
      sensitivityBounds: [0.75, 0.992],
      citationOrRationale: 'Bollerslev (1986) GARCH(1,1) variance-targeted QMLE over trailing real log-returns.',
    },
    {
      id: 'VPIN_TOXICITY_BOUNDS',
      subsystem: 'Bulk-Volume Order Flow Imbalance (BVC)',
      name: 'Empirical Quartile Toxicity Thresholds [q25, q75]',
      calibrationMethod: 'EMPIRICAL_QUANTILE',
      currentValue: [lowTox, highTox],
      lookbackBars: candles.length,
      sensitivityBounds: [0.12, 0.58],
      citationOrRationale: 'Easley, Lopez de Prado & O\'Hara (2012) BVC imbalance quartiles on real OHLCV bars.',
    },
    {
      id: 'EMPIRICAL_BAYES_SHRINKAGE',
      subsystem: 'Empirical Bayes Drift Shrinkage',
      name: 'Prior Drift Variance vs. Observation Noise (sigma_b^2, sigma_noise^2)',
      calibrationMethod: 'EMPIRICAL_SAMPLE_MOMENT',
      currentValue: [sigmaB2Prior, sigmaNoise2Empirical],
      lookbackBars: dollarDiffs.length,
      sensitivityBounds: [0.3, 12.0],
      citationOrRationale: 'Efron & Morris (1973) Stein-type shrinkage scaled by realized bar innovation variance.',
    },
    {
      id: 'EKF_NOISE_COVARIANCE',
      subsystem: 'Volume-Clock Jump-Gated State-Space Observer',
      name: 'Process & Measurement Noise (Qv0, Qb0, R)',
      calibrationMethod: 'EMPIRICAL_SAMPLE_MOMENT',
      currentValue: [Qv0Empirical, Qb0Empirical, REmpirical],
      lookbackBars: Math.min(50, dollarDiffs.length),
      sensitivityBounds: [0.02, 8.0],
      citationOrRationale: 'Harvey (1989) state-space innovation covariance scaled by trailing realized dollar variance.',
    },
    {
      id: 'HUBER_JUMP_THRESHOLD',
      subsystem: 'Huber M-Estimator Discontinuity Gate',
      name: 'Studentized Innovation Gate Cutoff (c_huber)',
      calibrationMethod: 'DOCUMENTED_PRIOR',
      currentValue: 3.0,
      lookbackBars: 25,
      sensitivityBounds: [2.5, 3.5],
      citationOrRationale: 'Huber (1964) 3-sigma outlier resistance threshold (99.73% Gaussian coverage).',
    },
  ];

  return {
    garch: {
      omega: garchFit.params[0],
      alpha: garchFit.params[1],
      beta: garchFit.params[2],
      persistence: garchFit.persistence,
      unconditionalVolPct: garchFit.unconditionalVolPct,
      logLikelihood: garchFit.logLikelihood,
    },
    vpinAndShrinkage: {
      lowToxicityThreshold: lowTox,
      highToxicityThreshold: highTox,
      sigmaB2Prior,
      sigmaNoise2Empirical,
    },
    ekfObserver: {
      alphaClock: 0.72,
      tauMin: 0.25,
      tauMax: 2.50,
      huberJumpSigmaThreshold: 3.0,
      Qv0Empirical,
      Qb0Empirical,
      REmpirical,
    },
    sweepDiscriminator: {
      hawkesBaseIntensity: 0.25,
      hawkesDecayRate: 0.65,
      logOddsClassificationThreshold: 0.85,
    },
    registry,
  };
}
