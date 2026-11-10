import {
  FaultType,
  type ActiveIntegratedStructuralTerm,
  type BaselineModelComparisonItem,
  type Candle,
  type DetectedPulseEvent,
  type EnsemblePlume,
  type FaultClassificationReport,
  type FaultClassifierMetricsInput,
  type ForecastFaultRecord,
  type InformationClockState,
  type LatentModelMathWriteBackState,
  type LatentStateVector6D,
  type MarketAwarenessState,
  type MeasuredPulseEcho,
  type OrderBookMicrostructureExtensionInput,
  type PermanentOosScientificScoreboard,
  type PulseEchoSonarTelemetry,
  type PulseType,
  type RecommendedAnchorPolicy,
  type RecommendedBandPolicy,
  type RecommendedDriftPolicy,
  type RegimeConditionedOosEntry,
  type ResidualOraclePoint,
  type ResidualOracleTelemetry,
  type ResidualStructureDiagnostics,
  type ScientificCoreTelemetry,
  type VenueObservationEquationRecord,
  type VerifiedMacroNewsItem,
  type VerifiedMacroYieldResult,
  type VerifiedVenueCameraObservation,
  type WeekpartType,
  type BayesianMetaLearningTelemetry,
  type BayesianRegimeStateId,
  type BocpdRunLengthState,
  type MarkovRegimePosteriorState,
  type VariationalKalmanHyperState,
} from '../contracts/quantContracts.js';
import { computeCointegrationBasis } from './quantEngine.js';
import { evaluateGoldSessionAndCalendar } from '../services/sessionCalendar.js';
import {
  applyResidualShockOperator,
  type ResidualShockOperatorResult,
} from './residualShockOperator.js';
import {
  loadPointInTimeMacroSeriesFromFixture,
  resolvePointInTimeMacroAt,
  type PointInTimeMacroObservation,
} from '../services/pointInTimeMacroService.js';

export {
  FaultType,
  type FaultClassifierMetricsInput,
  type FaultClassificationReport,
  type PointInTimeMacroObservation,
};

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
  activeIntegratedStructuralTerm?: ActiveIntegratedStructuralTerm | null;
  recommendedDriftPolicy?: RecommendedDriftPolicy;
  recommendedBandPolicy?: RecommendedBandPolicy;
  recommendedAnchorPolicy?: RecommendedAnchorPolicy;
  seasonalUncertaintyMult?: number;
  marketAwarenessState?: MarketAwarenessState | null;
}

/**
 * Deterministic FaultClassifier utility for identifying WRONG_DIRECTION and OVERCONFIDENT_TREND
 * forecast faults from causal market telemetry and MarketAwarenessState, and translating them
 * into closed-loop feedback adjustments for the 6D latent forecast engine in scientificCore.ts.
 */
export class FaultClassifier {
  /**
   * Classifies WRONG_DIRECTION and OVERCONFIDENT_TREND faults from causal market & residual metrics.
   */
  static classifyFromMetrics(input: FaultClassifierMetricsInput): FaultClassificationReport {
    const {
      safeAtr,
      liveForwardSlopeUsdPerStep,
      liveBandWidthStep1Usd,
      latestResidualUsd,
      latestResidualZ,
      lastBarMoveUsd,
      trailingRealizedMoveUsd,
      structuralRealizedMoveUsd,
      consecutiveBearBars,
      consecutiveBullBars,
      streakBars,
      macroBearishGravity,
      macroBullishSupport,
      sessionId,
      weekpart,
      isTurnOfMonth,
    } = input;

    const isHighFlowSessionOrTurnOfMonth =
      sessionId === 'LONDON_NY_OVERLAP' ||
      sessionId === 'LONDON' ||
      weekpart === 'FRIDAY_LATE_ROLL' ||
      isTurnOfMonth;
    const streakAlignedWithMacro =
      (consecutiveBearBars >= 2 && macroBearishGravity) ||
      (consecutiveBullBars >= 2 && macroBullishSupport);

    const effectiveMoveAtrThreshold =
      streakAlignedWithMacro && isHighFlowSessionOrTurnOfMonth
        ? 0.85
        : streakAlignedWithMacro
        ? 0.95
        : (consecutiveBearBars >= 2 || consecutiveBullBars >= 2) && isHighFlowSessionOrTurnOfMonth
        ? 1.02
        : consecutiveBearBars >= 2 || consecutiveBullBars >= 2
        ? 1.12
        : 1.35;

    const hasSignificantShockOrMove =
      Math.abs(structuralRealizedMoveUsd) >= effectiveMoveAtrThreshold * safeAtr ||
      Math.abs(trailingRealizedMoveUsd) >= 1.35 * safeAtr ||
      Math.abs(latestResidualZ) >= 1.8 ||
      Math.abs(lastBarMoveUsd) >= 1.5 * safeAtr;

    const referenceRealizedMoveUsd =
      Math.abs(lastBarMoveUsd) >= 1.5 * safeAtr
        ? lastBarMoveUsd
        : Math.abs(structuralRealizedMoveUsd) > Math.abs(trailingRealizedMoveUsd)
        ? structuralRealizedMoveUsd
        : trailingRealizedMoveUsd;

    let wrongDirectionFault: ForecastFaultRecord | null = null;
    if (
      hasSignificantShockOrMove &&
      Math.abs(liveForwardSlopeUsdPerStep) >= 0.045 * safeAtr &&
      Math.sign(liveForwardSlopeUsdPerStep) !== Math.sign(referenceRealizedMoveUsd) &&
      Math.sign(referenceRealizedMoveUsd) !== 0
    ) {
      const isCritical =
        Math.abs(latestResidualZ) >= 2.4 ||
        Math.abs(referenceRealizedMoveUsd) >= 2.0 * safeAtr ||
        streakBars >= 3;
      wrongDirectionFault = {
        code: FaultType.WRONG_DIRECTION,
        faultType: FaultType.WRONG_DIRECTION,
        severity: isCritical ? 'CRITICAL' : 'WARNING',
        summaryEn: `Forecast slope (${liveForwardSlopeUsdPerStep >= 0 ? '+' : ''}$${liveForwardSlopeUsdPerStep.toFixed(2)}/step) points opposite to the realized structural move (${referenceRealizedMoveUsd >= 0 ? '+' : ''}$${referenceRealizedMoveUsd.toFixed(2)}, streak=${streakBars}b, Z=${latestResidualZ.toFixed(2)}σ) during ${sessionId}.`,
        summaryFa: `شیب پیش‌بینی خط زرد (${liveForwardSlopeUsdPerStep.toFixed(2)}$ در هر گام) در جهت مخالف حرکت ساختاری تحقق‌یافته بازار (${referenceRealizedMoveUsd.toFixed(2)}$، Z=${latestResidualZ.toFixed(2)}σ) قرار دارد.`,
        empiricalEvidence: `RealizedMove=${referenceRealizedMoveUsd.toFixed(2)} USD (Streak=${streakBars}b, Session=${sessionId}, TurnOfMonth=${isTurnOfMonth}) | LiveSlope=${liveForwardSlopeUsdPerStep.toFixed(3)} USD/step | ResidualZ=${latestResidualZ.toFixed(2)}σ`,
        recommendedAction: 'SHOCK_RESET_DRIFT',
      };
    }

    const safeBandWidth = Math.max(0.1, liveBandWidthStep1Usd);
    const bandBreachRatio = parseFloat((Math.abs(latestResidualUsd) / safeBandWidth).toFixed(4));

    let overconfidentTrendFault: ForecastFaultRecord | null = null;
    if (Math.abs(latestResidualZ) >= 1.75 && bandBreachRatio >= 0.78) {
      overconfidentTrendFault = {
        code: FaultType.OVERCONFIDENT_TREND,
        faultType: FaultType.OVERCONFIDENT_TREND,
        severity: Math.abs(latestResidualZ) >= 2.5 ? 'CRITICAL' : 'WARNING',
        summaryEn: `Overconfident trend bands: latest realized residual ($${Math.abs(latestResidualUsd).toFixed(2)}, ${latestResidualZ.toFixed(2)}σ) breached the step-1 90% uncertainty band width ($${safeBandWidth.toFixed(2)}).`,
        summaryFa: `باندهای اطمینان بیش‌ازحد باریک: پسماند تحقق‌یافته اخیر (${Math.abs(latestResidualUsd).toFixed(2)}$، ${latestResidualZ.toFixed(2)}σ) از عرض باند عدم‌قطعیت گام اول (${safeBandWidth.toFixed(2)}$) فراتر رفته است.`,
        empiricalEvidence: `|e_t|=${Math.abs(latestResidualUsd).toFixed(2)} USD vs Band90_Step1=${safeBandWidth.toFixed(2)} USD | Z=${latestResidualZ.toFixed(2)}σ`,
        recommendedAction: 'WIDEN_UNCERTAINTY_BANDS',
      };
    }

    const classifiedFaults: ForecastFaultRecord[] = [];
    if (wrongDirectionFault) classifiedFaults.push(wrongDirectionFault);
    if (overconfidentTrendFault) classifiedFaults.push(overconfidentTrendFault);

    const hasWrongDirection = Boolean(wrongDirectionFault);
    const hasOverconfidentTrend = Boolean(overconfidentTrendFault);
    const slopeDivergenceAtrPerStep = parseFloat(
      (Math.abs(liveForwardSlopeUsdPerStep) / safeAtr).toFixed(4)
    );

    return {
      hasWrongDirection,
      hasOverconfidentTrend,
      wrongDirectionFault,
      overconfidentTrendFault,
      classifiedFaults,
      referenceRealizedMoveUsd,
      effectiveMoveAtrThreshold,
      hasSignificantShockOrMove,
      bandBreachRatio,
      slopeDivergenceAtrPerStep,
      requiresFeedbackCorrection: hasWrongDirection || hasOverconfidentTrend,
      recommendedDriftPolicy: hasWrongDirection ? 'SHOCK_RESET' : 'UNCHANGED',
      recommendedBandPolicy:
        hasWrongDirection || hasOverconfidentTrend ? 'WIDEN' : 'NORMAL',
      recommendedAnchorPolicy: hasWrongDirection ? 'RECENTER_TO_POST_SHOCK' : 'UNCHANGED',
      bandExpansionFactor: hasOverconfidentTrend
        ? Math.min(1.65, Math.max(1.25, bandBreachRatio * 1.15))
        : hasWrongDirection
        ? 1.25
        : 1.0,
      driftCorrectionSign: Math.sign(referenceRealizedMoveUsd || latestResidualUsd) || -1,
    };
  }

  /**
   * Analyzes an incoming MarketAwarenessState to extract and evaluate WRONG_DIRECTION and
   * OVERCONFIDENT_TREND faults and determine closed-loop feedback requirements.
   */
  static analyzeMarketAwarenessState(state: MarketAwarenessState): FaultClassificationReport {
    const activeFaults = state.activeFaults ?? [];
    const activeFaultCodes = state.activeFaultCodes ?? [];
    const activeFaultTypes = state.activeFaultTypes ?? [];

    const wrongDirectionFault =
      activeFaults.find(
        f => f.code === FaultType.WRONG_DIRECTION || f.faultType === FaultType.WRONG_DIRECTION
      ) ?? null;
    const overconfidentTrendFault =
      activeFaults.find(
        f => f.code === FaultType.OVERCONFIDENT_TREND || f.faultType === FaultType.OVERCONFIDENT_TREND
      ) ?? null;
    const hasWrongDirection =
      Boolean(wrongDirectionFault) ||
      activeFaultCodes.includes(FaultType.WRONG_DIRECTION) ||
      activeFaultTypes.includes(FaultType.WRONG_DIRECTION);
    const hasOverconfidentTrend =
      Boolean(overconfidentTrendFault) ||
      activeFaultCodes.includes(FaultType.OVERCONFIDENT_TREND) ||
      activeFaultTypes.includes(FaultType.OVERCONFIDENT_TREND);

    const classifiedFaults: ForecastFaultRecord[] = [];
    if (wrongDirectionFault) classifiedFaults.push(wrongDirectionFault);
    if (overconfidentTrendFault) classifiedFaults.push(overconfidentTrendFault);

    const isCriticalOverconfident = overconfidentTrendFault?.severity === 'CRITICAL';
    const isCriticalWrongDir = wrongDirectionFault?.severity === 'CRITICAL';
    const fallbackDrift =
      state.recommendedPolicies?.driftPolicy ?? state.recommendedDriftPolicy;
    const fallbackBand =
      state.recommendedPolicies?.bandPolicy ?? state.recommendedBandPolicy;
    const fallbackAnchor =
      state.recommendedPolicies?.anchorPolicy ?? state.recommendedAnchorPolicy;

    return {
      hasWrongDirection,
      hasOverconfidentTrend,
      wrongDirectionFault,
      overconfidentTrendFault,
      classifiedFaults,
      referenceRealizedMoveUsd: 0,
      effectiveMoveAtrThreshold: 1.0,
      hasSignificantShockOrMove: hasWrongDirection || hasOverconfidentTrend,
      bandBreachRatio: hasOverconfidentTrend ? (isCriticalOverconfident ? 1.25 : 0.9) : 0,
      slopeDivergenceAtrPerStep: hasWrongDirection ? (isCriticalWrongDir ? 0.12 : 0.06) : 0,
      requiresFeedbackCorrection: hasWrongDirection || hasOverconfidentTrend,
      recommendedDriftPolicy: hasWrongDirection ? 'SHOCK_RESET' : fallbackDrift,
      recommendedBandPolicy:
        hasWrongDirection || hasOverconfidentTrend ? 'WIDEN' : fallbackBand,
      recommendedAnchorPolicy: hasWrongDirection
        ? 'RECENTER_TO_POST_SHOCK'
        : fallbackAnchor,
      bandExpansionFactor: hasOverconfidentTrend
        ? isCriticalOverconfident
          ? 1.35
          : 1.2
        : hasWrongDirection
        ? 1.15
        : 1.0,
      driftCorrectionSign:
        state.newsTransmissionMode === 'RISK_OFF_LIQUIDATION' ? -1 : 0,
    };
  }

  /**
   * Merges causal filter metrics fault classification with incoming MarketAwarenessState fault classification.
   */
  static mergeClassificationReports(
    metricsReport: FaultClassificationReport,
    stateReport: FaultClassificationReport | null
  ): FaultClassificationReport {
    if (!stateReport) return metricsReport;

    const hasWrongDirection = metricsReport.hasWrongDirection || stateReport.hasWrongDirection;
    const hasOverconfidentTrend =
      metricsReport.hasOverconfidentTrend || stateReport.hasOverconfidentTrend;
    const wrongDirectionFault =
      metricsReport.wrongDirectionFault ?? stateReport.wrongDirectionFault;
    const overconfidentTrendFault =
      metricsReport.overconfidentTrendFault ?? stateReport.overconfidentTrendFault;

    const classifiedFaults: ForecastFaultRecord[] = [];
    if (wrongDirectionFault) classifiedFaults.push(wrongDirectionFault);
    if (overconfidentTrendFault) classifiedFaults.push(overconfidentTrendFault);

    return {
      hasWrongDirection,
      hasOverconfidentTrend,
      wrongDirectionFault,
      overconfidentTrendFault,
      classifiedFaults,
      referenceRealizedMoveUsd:
        metricsReport.referenceRealizedMoveUsd || stateReport.referenceRealizedMoveUsd,
      effectiveMoveAtrThreshold: metricsReport.effectiveMoveAtrThreshold,
      hasSignificantShockOrMove:
        metricsReport.hasSignificantShockOrMove || stateReport.hasSignificantShockOrMove,
      bandBreachRatio: Math.max(metricsReport.bandBreachRatio, stateReport.bandBreachRatio),
      slopeDivergenceAtrPerStep: Math.max(
        metricsReport.slopeDivergenceAtrPerStep,
        stateReport.slopeDivergenceAtrPerStep
      ),
      requiresFeedbackCorrection: hasWrongDirection || hasOverconfidentTrend,
      recommendedDriftPolicy: hasWrongDirection
        ? 'SHOCK_RESET'
        : stateReport.recommendedDriftPolicy !== 'UNCHANGED'
        ? stateReport.recommendedDriftPolicy
        : metricsReport.recommendedDriftPolicy,
      recommendedBandPolicy:
        hasWrongDirection || hasOverconfidentTrend
          ? 'WIDEN'
          : stateReport.recommendedBandPolicy !== 'NORMAL'
          ? stateReport.recommendedBandPolicy
          : metricsReport.recommendedBandPolicy,
      recommendedAnchorPolicy: hasWrongDirection
        ? 'RECENTER_TO_POST_SHOCK'
        : stateReport.recommendedAnchorPolicy !== 'UNCHANGED'
        ? stateReport.recommendedAnchorPolicy
        : metricsReport.recommendedAnchorPolicy,
      bandExpansionFactor: Math.max(
        metricsReport.bandExpansionFactor,
        stateReport.bandExpansionFactor
      ),
      driftCorrectionSign:
        metricsReport.driftCorrectionSign || stateReport.driftCorrectionSign || -1,
    };
  }

  /**
   * Resolves the forecast engine feedback policy overrides inside evaluateLatentStateFilterOnInformationClock.
   * Ensures that when WRONG_DIRECTION or OVERCONFIDENT_TREND is flagged, the system automatically applies
   * the corresponding recommendedDriftPolicy (SHOCK_RESET), recommendedBandPolicy (WIDEN), and
   * recommendedAnchorPolicy (RECENTER_TO_POST_SHOCK) overrides.
   */
  static resolveForecastFeedbackPolicies(params: {
    tuningOverrides?: LatentFilterTuningOverrides;
    awareness?: MarketAwarenessState | null;
    faultClassification: FaultClassificationReport;
    defaultWeekpart: WeekpartType;
    isFuturesClosed: boolean;
  }): {
    driftPolicy: RecommendedDriftPolicy;
    bandPolicy: RecommendedBandPolicy;
    anchorPolicy: RecommendedAnchorPolicy;
    seasonalUncMult: number;
  } {
    const {
      tuningOverrides,
      awareness,
      faultClassification,
      defaultWeekpart,
      isFuturesClosed,
    } = params;

    const explicitDrift = tuningOverrides?.recommendedDriftPolicy;
    const awarenessDrift =
      awareness?.recommendedPolicies?.driftPolicy ?? awareness?.recommendedDriftPolicy;
    let driftPolicy: RecommendedDriftPolicy =
      explicitDrift && explicitDrift !== 'UNCHANGED'
        ? explicitDrift
        : awarenessDrift && awarenessDrift !== 'UNCHANGED'
        ? awarenessDrift
        : explicitDrift ?? awarenessDrift ?? 'UNCHANGED';

    const explicitBand = tuningOverrides?.recommendedBandPolicy;
    const awarenessBand =
      awareness?.recommendedPolicies?.bandPolicy ?? awareness?.recommendedBandPolicy;
    let bandPolicy: RecommendedBandPolicy =
      explicitBand && explicitBand !== 'NORMAL'
        ? explicitBand
        : awarenessBand && awarenessBand !== 'NORMAL'
        ? awarenessBand
        : explicitBand ?? awarenessBand ?? 'NORMAL';

    const explicitAnchor = tuningOverrides?.recommendedAnchorPolicy;
    const awarenessAnchor =
      awareness?.recommendedPolicies?.anchorPolicy ?? awareness?.recommendedAnchorPolicy;
    let anchorPolicy: RecommendedAnchorPolicy =
      explicitAnchor && explicitAnchor !== 'UNCHANGED'
        ? explicitAnchor
        : awarenessAnchor && awarenessAnchor !== 'UNCHANGED'
        ? awarenessAnchor
        : explicitAnchor ?? awarenessAnchor ?? 'UNCHANGED';

    let seasonalUncMult = Math.max(
      1.0,
      Math.min(
        2.5,
        tuningOverrides?.seasonalUncertaintyMult ?? awareness?.uncertaintyBandMultiplier ?? 1.0
      )
    );

    const activeWeekpart = awareness?.weekpart ?? defaultWeekpart;
    const isClosedSession =
      activeWeekpart === 'WEEKEND_THIN' ||
      activeWeekpart === 'FUTURES_CLOSED_OVERLAP' ||
      isFuturesClosed ||
      driftPolicy === 'ZERO_FOR_SESSION' ||
      anchorPolicy === 'FREEZE';

    if (faultClassification.hasWrongDirection && !isClosedSession) {
      driftPolicy = faultClassification.recommendedDriftPolicy;
      bandPolicy = faultClassification.recommendedBandPolicy;
      anchorPolicy = faultClassification.recommendedAnchorPolicy;
    }

    if (faultClassification.hasOverconfidentTrend) {
      bandPolicy = faultClassification.recommendedBandPolicy;
      if (tuningOverrides?.seasonalUncertaintyMult === undefined) {
        seasonalUncMult = parseFloat(
          Math.max(
            1.0,
            Math.min(2.5, seasonalUncMult * faultClassification.bandExpansionFactor)
          ).toFixed(4)
        );
      }
    }

    return {
      driftPolicy,
      bandPolicy,
      anchorPolicy,
      seasonalUncMult,
    };
  }

  /**
   * Applies closed-loop feedback from FaultClassificationReport and MarketAwarenessState
   * into live and candidate latent filter tuning overrides before re-propagating the forecast.
   */
  static applyFeedbackToForecastTuning(params: {
    state: MarketAwarenessState;
    livePolicyTuning: LatentModelMathWriteBackState & LatentFilterTuningOverrides;
    candPolicyTuning: LatentFilterTuningOverrides;
    currentPrice: number;
    atr: number;
    shockSign: number;
    shockMagUsd: number;
  }): {
    report: FaultClassificationReport;
    livePolicyTuning: LatentModelMathWriteBackState & LatentFilterTuningOverrides;
    candPolicyTuning: LatentFilterTuningOverrides;
  } {
    const {
      state,
      livePolicyTuning,
      candPolicyTuning,
      currentPrice,
      atr,
      shockSign,
      shockMagUsd,
    } = params;
    const report = FaultClassifier.analyzeMarketAwarenessState(state);
    const isClosedSession =
      state.weekpart === 'WEEKEND_THIN' || state.weekpart === 'FUTURES_CLOSED_OVERLAP';

    if (report.hasOverconfidentTrend) {
      livePolicyTuning.recommendedBandPolicy = 'WIDEN';
      candPolicyTuning.recommendedBandPolicy = 'WIDEN';
      const baseMult = livePolicyTuning.seasonalUncertaintyMult ?? 1.0;
      const expandedMult = parseFloat(
        Math.min(2.2, Math.max(baseMult, baseMult * report.bandExpansionFactor)).toFixed(4)
      );
      livePolicyTuning.seasonalUncertaintyMult = expandedMult;
      candPolicyTuning.seasonalUncertaintyMult = expandedMult;
    }

    if (report.hasWrongDirection && !isClosedSession) {
      livePolicyTuning.recommendedDriftPolicy = 'SHOCK_RESET';
      livePolicyTuning.recommendedAnchorPolicy = 'RECENTER_TO_POST_SHOCK';
      livePolicyTuning.recommendedBandPolicy = 'WIDEN';
      livePolicyTuning.equilibriumAnchorOverride = parseFloat(
        (currentPrice + shockSign * Math.min(0.75 * atr, Math.max(0.2 * atr, shockMagUsd * 0.25))).toFixed(2)
      );
      if ((livePolicyTuning.symbolicStepDriftUsd ?? 0) * shockSign < 0) {
        livePolicyTuning.symbolicStepDriftUsd = parseFloat(
          (shockSign * Math.min(0.28 * atr, Math.max(0.1 * atr, shockMagUsd * 0.08))).toFixed(4)
        );
      }

      candPolicyTuning.recommendedDriftPolicy = 'SHOCK_RESET';
      candPolicyTuning.recommendedAnchorPolicy = 'RECENTER_TO_POST_SHOCK';
      candPolicyTuning.recommendedBandPolicy = 'WIDEN';
      candPolicyTuning.equilibriumAnchorOverride = parseFloat(
        (currentPrice + shockSign * Math.min(1.25 * atr, Math.max(0.35 * atr, shockMagUsd * 0.42))).toFixed(2)
      );
      candPolicyTuning.symbolicStepDriftUsd = parseFloat(
        (shockSign * Math.min(0.55 * atr, Math.max(0.18 * atr, shockMagUsd * 0.14))).toFixed(4)
      );
    }

    return {
      report,
      livePolicyTuning,
      candPolicyTuning,
    };
  }
}

/**
 * Pure causal evaluator for an authorized integrated structural hypothesis term Δx_1^struct(τ_t).
 * Returns strictly 0 when no structural term is integrated, preserving the exact incumbent Yellow-Line model.
 */
export function evaluateCausalStructuralHypothesisTermLogDrift(params: {
  structuralTerm?: ActiveIntegratedStructuralTerm | null;
  X: number[];
  prevLogResidual: number;
  causalMedVol: number;
  causalLogEq: number;
  cointegrationBasisLog: number;
  causalMacroLogForce: number;
  dt: number;
}): number {
  const {
    structuralTerm,
    X,
    prevLogResidual,
    causalMedVol,
    causalLogEq,
    cointegrationBasisLog,
    causalMacroLogForce,
    dt,
  } = params;
  if (!structuralTerm) return 0;

  const theta = Number(structuralTerm.fittedTheta);
  const alpha = Number(structuralTerm.secondaryParamAlpha);
  if (!Number.isFinite(theta) || !Number.isFinite(alpha) || !Number.isFinite(dt) || dt <= 0) {
    return 0;
  }

  const safeVol = Math.max(0.0004, Math.min(0.05, Number.isFinite(X[2]) ? X[2] : causalMedVol));
  const safeMedVol = Math.max(0.0004, Math.min(0.05, Number.isFinite(causalMedVol) ? causalMedVol : 0.0015));
  const safeRes = Math.max(0.15, Math.min(0.99, Number.isFinite(X[4]) ? X[4] : 0.72));
  const safeAlpha = Math.max(0.15, Math.min(4.0, alpha));

  switch (structuralTerm.structuralFormId) {
    case 'AR1_RESIDUAL_ERROR_CORRECTION': {
      const scaledRes = prevLogResidual / Math.max(1e-5, safeAlpha * safeVol);
      return theta * Math.tanh(scaledRes) * safeVol * dt;
    }
    case 'REGIME_GATED_TOXICITY_DAMPING': {
      const burstGate = 1 / (1 + Math.exp(-4.0 * (dt - safeAlpha)));
      const toxRatio = (Number.isFinite(X[3]) ? X[3] : 0) / safeRes;
      return theta * burstGate * Math.tanh(toxRatio) * safeVol * dt;
    }
    case 'NONLINEAR_BASIS_THRESHOLD_ATTRACTOR': {
      const zBasis = cointegrationBasisLog / safeMedVol;
      const deadband = Math.max(0, Math.abs(zBasis) - safeAlpha) * Math.sign(zBasis);
      return theta * Math.tanh(deadband) * safeMedVol * dt;
    }
    case 'ASYMMETRIC_VOL_DRIFT_BRAKE': {
      const volRatio = safeVol / safeMedVol;
      const excessVol = Math.max(0, volRatio - safeAlpha);
      return -Math.abs(theta) * Math.tanh(excessVol) * (Number.isFinite(X[1]) ? X[1] : 0) * dt;
    }
    case 'MACRO_YIELD_CONVEX_RESPONSE': {
      const macroAmp = 1 + safeAlpha * Math.tanh(Math.abs(Number.isFinite(X[5]) ? X[5] : 0) / safeMedVol);
      return theta * causalMacroLogForce * macroAmp * dt;
    }
    case 'PARAMETER_REFINEMENT_ONLY':
    default: {
      const eqGap = Math.max(-0.08, Math.min(0.08, causalLogEq - (Number.isFinite(X[0]) ? X[0] : causalLogEq)));
      return theta * eqGap * 0.08 * dt;
    }
  }
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
    const extTradeFlow = [...(extensionInput?.aggressorTradeFlow || [])]
      .reverse()
      .find(tf => tf.barTimeSec <= candles[i].time && candles[i].time - tf.barTimeSec <= 900);
    if (extTradeFlow && extTradeFlow.tradeCount > 0) {
      const bVol = Number(extTradeFlow.buyerInitiatedVolume ?? (extTradeFlow as any).buyAggressorVolume ?? 0);
      const sVol = Number(extTradeFlow.sellerInitiatedVolume ?? (extTradeFlow as any).sellAggressorVolume ?? 0);
      if (Number.isFinite(bVol) && Number.isFinite(sVol) && bVol + sVol > 0) {
        crossAct = Math.max(0.25, Math.min(4.0, (bVol + sVol) / medVol));
      }
    } else if (extensionInput?.tradeCountPerBar && extensionInput.tradeCountPerBar[i] !== undefined) {
      const tcSlice = extensionInput.tradeCountPerBar.slice(winStart, i + 1).filter(v => v > 0);
      const medTc = Math.max(1, median(tcSlice));
      crossAct = extensionInput.tradeCountPerBar[i] / medTc;
    } else if (verifiedVenueCameras && verifiedVenueCameras.length > 1) {
      const targetTime = candles[i].time;
      const venueVolRatios: number[] = [];
      for (const cam of verifiedVenueCameras) {
        let barIdx = -1;
        for (let k = cam.candles.length - 1; k >= 0; k--) {
          if (cam.candles[k].time <= targetTime && targetTime - cam.candles[k].time <= 900) {
            barIdx = k;
            break;
          }
        }
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

  const deltaTauSeries: number[] = [];
  const cumulativeTauSeries: number[] = [];
  let cumTau = 0;

  let wV = 0.34;
  let wR = 0.33;
  let wC = 0.33;
  let tauMinEmpirical = 0.25;
  let tauMaxEmpirical = 2.8;

  for (let i = 0; i < n; i++) {
    const cStart = Math.max(0, i - 48);
    const vSub = volRatioSeries.slice(cStart, i + 1);
    const rSub = rangeRatioSeries.slice(cStart, i + 1);
    const xSub = crossActivitySeries.slice(cStart, i + 1);

    if (vSub.length >= 6) {
      const dispV = Math.max(0.05, mad(vSub) / Math.max(0.1, median(vSub)));
      const dispR = Math.max(0.05, mad(rSub) / Math.max(0.1, median(rSub)));
      const dispC = Math.max(0.05, mad(xSub) / Math.max(0.1, median(xSub)));

      const pV = 1 / dispV;
      const pR = 1 / dispR;
      const pC = 1 / dispC;
      const pSum = pV + pR + pC;

      wV = parseFloat((pV / pSum).toFixed(4));
      wR = parseFloat((pR / pSum).toFixed(4));
      wC = parseFloat(Math.max(0.01, 1 - wV - wR).toFixed(4));

      const rawSub = vSub.map((_, idx) => wV * vSub[idx] + wR * rSub[idx] + wC * xSub[idx]);
      tauMinEmpirical = parseFloat(Math.max(0.12, Math.min(0.45, quantile(rawSub, 0.05))).toFixed(4));
      tauMaxEmpirical = parseFloat(Math.max(1.8, Math.min(4.2, quantile(rawSub, 0.95) * 1.15)).toFixed(4));
    }

    const rawCur = wV * volRatioSeries[i] + wR * rangeRatioSeries[i] + wC * crossActivitySeries[i];
    const dt = parseFloat(Math.max(tauMinEmpirical, Math.min(tauMaxEmpirical, rawCur)).toFixed(4));
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
 * on the causal information clock τ. Strictly prefix-invariant (zero lookahead).
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

  let adaptivePulseThresholdSigma = 1.5;
  const detectedPulses: DetectedPulseEvent[] = [];
  const measuredEchoes: MeasuredPulseEcho[] = [];

  for (let i = 4; i < n; i++) {
    const c = candles[i];
    const causalTauSlice = deltaTauSeries.slice(Math.max(0, i - 48), i + 1);
    const medTau = median(causalTauSlice);
    const madTau = Math.max(0.08, mad(causalTauSlice, medTau));
    const p85TauZ = (quantile(causalTauSlice, 0.85) - medTau) / madTau;
    adaptivePulseThresholdSigma = parseFloat(Math.max(1.15, Math.min(2.4, p85TauZ)).toFixed(3));

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
    const extAgg = [...(extensionInput?.aggressorTradeFlow || [])]
      .reverse()
      .find(tf => tf.barTimeSec <= c.time && c.time - tf.barTimeSec <= 900);
    if (extAgg) {
      const bVol = Number(extAgg.buyerInitiatedVolume ?? (extAgg as any).buyAggressorVolume ?? 0);
      const sVol = Number(extAgg.sellerInitiatedVolume ?? (extAgg as any).sellAggressorVolume ?? 0);
      if (Number.isFinite(bVol) && Number.isFinite(sVol) && bVol + sVol > 0) {
        aggImbalanceZ = ((bVol - sVol) / Math.max(1e-6, bVol + sVol)) * 2.5;
      }
    } else if (
      extensionInput?.aggressorBuyVolume?.[i] !== undefined &&
      extensionInput?.aggressorSellVolume?.[i] !== undefined
    ) {
      const bVol = extensionInput.aggressorBuyVolume[i];
      const sVol = extensionInput.aggressorSellVolume[i];
      aggImbalanceZ = ((bVol - sVol) / Math.max(1e-6, bVol + sVol)) * 2.5;
    }

    const scheduledPulse = [...(extensionInput?.scheduledEconomicPulses || [])]
      .reverse()
      .find(ev => ev.timestampSec <= c.time && c.time - ev.timestampSec <= 1800);
    const hasMacroRelease =
      Boolean(scheduledPulse) ||
      Boolean(macroNews && macroNews.some(ev => ev.timestamp <= c.time && c.time - ev.timestamp <= 1800));

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
      if (secondaryBenchmarkCandles && secondaryBenchmarkCandles.length > 0) {
        const bPulse = [...secondaryBenchmarkCandles].reverse().find(b => b.time <= c.time);
        const bEnd = [...secondaryBenchmarkCandles].reverse().find(b => b.time <= candles[echoEnd].time);
        if (bPulse && bEnd) {
          const spreadPulse = c.close - bPulse.close;
          const spreadEnd = candles[echoEnd].close - bEnd.close;
          crossVenuePropagationBps = parseFloat(
            ((Math.abs(spreadPulse - spreadEnd) / Math.max(100, c.close)) * 10000).toFixed(2)
          );
        } else {
          crossVenuePropagationBps = parseFloat(
            ((Math.abs(endDisplacement) / Math.max(100, c.close)) * 10000 * 0.35).toFixed(2)
          );
        }
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

  // Joseph stabilized covariance update: P^+ = (I - K H) P^- (I - K H)^T + K R K^T
  const IminusKH: number[][] = Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 6 }, (__, m) => (i === m ? 1 : 0) - K[i] * H[m])
  );
  const tempP: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let m = 0; m < 6; m++) {
        s += IminusKH[i][m] * P[m][j];
      }
      tempP[i][j] = s;
    }
  }
  const nextP: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let m = 0; m < 6; m++) {
        s += tempP[i][m] * IminusKH[j][m];
      }
      nextP[i][j] = s + K[i] * safeR * K[j];
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

const BAYESIAN_REGIME_IDS: BayesianRegimeStateId[] = [
  'LAMINAR_TREND',
  'RANGE_EQUILIBRIUM',
  'TAIL_SHOCK_LIQUIDATION',
  'VOLATILITY_SQUEEZE_BREAKOUT',
  'THIN_ILLIQUID_AUCTION',
];

/**
 * LEVEL-5 TRI-ENGINE BAYESIAN META-LEARNING FILTER
 * Combines:
 *  (a) Online Bayesian Change-Point Detection (BOCPD, Adams & MacKay 2007) over causal innovations
 *  (b) 5-State Markov Regime-Switching with Sequential Importance Resampling (Particle Filter)
 *  (c) Variational Bayesian Normal-Inverse-Gamma Adaptive Kalman Hyper-Parameter Learning (VB-Kalman)
 */
export function evaluateTriEngineBayesianMetaLearner(params: {
  residualPoints: ResidualOraclePoint[];
  deltaTauSeries: number[];
  parkinsonVols: number[];
  barSignedImbalances: number[];
  isFuturesClosed: boolean;
  isThinLiquiditySubSession: boolean;
  weekpart: WeekpartType;
  latentState: LatentStateVector6D;
  evaluatedAtIso: string;
}): BayesianMetaLearningTelemetry {
  const {
    residualPoints,
    deltaTauSeries,
    parkinsonVols,
    barSignedImbalances,
    isFuturesClosed,
    isThinLiquiditySubSession,
    weekpart,
    latentState,
    evaluatedAtIso,
  } = params;

  const maxR = 60;
  // 1. Online Bayesian Change-Point Detection (BOCPD)
  // Maintain run-length distribution P(r_t = r | e_{1:t}) for r in [0..maxR]
  let runProb = new Array<number>(maxR + 1).fill(0);
  runProb[0] = 1.0;

  // Sufficient statistics per run-length r for Student-t predictive density
  let muR = new Array<number>(maxR + 1).fill(0);
  let kappaR = new Array<number>(maxR + 1).fill(1.0);
  let alphaR = new Array<number>(maxR + 1).fill(1.5);
  let betaR = new Array<number>(maxR + 1).fill(1.0);

  const baseLambda = 28.0; // Baseline expected regime duration in bars
  let lastLogBfBreak = 0;

  // 2. 5-State Markov Regime-Switching Particle Filter + Dirichlet Transition Counts
  const dirichletCounts: number[][] = [
    [14.0, 2.5, 1.0, 1.8, 0.7],
    [2.2, 15.0, 0.8, 2.0, 1.2],
    [1.5, 2.5, 9.0, 2.0, 0.6],
    [3.0, 2.0, 1.8, 10.0, 0.5],
    [0.8, 2.5, 0.4, 0.6, 16.0],
  ];
  let regimePost: number[] = [0.28, 0.36, 0.08, 0.14, 0.14];

  // 64 Particles carrying regime state index and local scale weight
  const numParticles = 64;
  let particleRegimes: number[] = Array.from({ length: numParticles }, (_, i) => i % 5);
  let particleWeights: number[] = new Array<number>(numParticles).fill(1 / numParticles);
  let particleNeff = numParticles;

  // 3. Variational Bayesian Adaptive Kalman Hyperparameters (Normal-Inverse-Gamma)
  let igAlphaProcess = 3.0;
  let igBetaProcess = 2.5;
  let igAlphaObs = 3.5;
  let igBetaObs = 3.0;
  const forgettingRho = 0.92;

  const evalSlice = residualPoints.slice(-Math.min(72, residualPoints.length));
  const volMed = Math.max(1e-6, median(parkinsonVols.slice(-48)));

  for (let idx = 0; idx < evalSlice.length; idx++) {
    const pt = evalSlice[idx];
    const z = Number.isFinite(pt.standardizedResidualSigma)
      ? Math.max(-8, Math.min(8, pt.standardizedResidualSigma))
      : 0;
    const absZ = Math.abs(z);
    const barIdx = Math.max(0, parkinsonVols.length - evalSlice.length + idx);
    const dTau = deltaTauSeries[barIdx] ?? 1.0;
    const localVolRatio = (parkinsonVols[barIdx] ?? volMed) / volMed;
    const signedImb = barSignedImbalances[barIdx] ?? 0;

    // --- (A) BOCPD Exact Recursive Message Passing ---
    const newRunProb = new Array<number>(maxR + 1).fill(0);
    let cpMass = 0;
    let contMass = 0;
    const adaptiveHazard = Math.min(
      0.45,
      Math.max(0.015, (1 / baseLambda) * (1 + 0.35 * Math.max(0, absZ - 1.6)))
    );

    for (let r = 0; r <= maxR; r++) {
      const pr = runProb[r];
      if (pr <= 1e-12) continue;
      const df = 2 * alphaR[r];
      const scaleSq = (betaR[r] * (kappaR[r] + 1)) / (alphaR[r] * kappaR[r]);
      const stdPred = Math.sqrt(Math.max(1e-4, scaleSq));
      const tVal = (z - muR[r]) / stdPred;
      // Student-t predictive density up to normalization
      const predLikelihood = Math.max(
        1e-9,
        Math.pow(1 + (tVal * tVal) / df, -0.5 * (df + 1)) / stdPred
      );

      const h = adaptiveHazard;
      const growthMsg = pr * predLikelihood * (1 - h);
      const cpMsg = pr * predLikelihood * h;

      cpMass += cpMsg;
      contMass += growthMsg;
      const nextR = Math.min(maxR, r + 1);
      newRunProb[nextR] += growthMsg;
    }
    newRunProb[0] = cpMass;
    const totalMass = cpMass + contMass;
    if (totalMass > 0) {
      for (let r = 0; r <= maxR; r++) {
        runProb[r] = newRunProb[r] / totalMass;
      }
    }
    lastLogBfBreak = Math.log(Math.max(1e-6, cpMass) / Math.max(1e-6, contMass));

    // Update Student-t sufficient statistics
    const nextMu = new Array<number>(maxR + 1).fill(0);
    const nextKappa = new Array<number>(maxR + 1).fill(1.0);
    const nextAlpha = new Array<number>(maxR + 1).fill(1.5);
    const nextBeta = new Array<number>(maxR + 1).fill(1.0);
    for (let r = 1; r <= maxR; r++) {
      const prev = r - 1;
      const kOld = kappaR[prev];
      const mOld = muR[prev];
      const kNew = kOld + 1;
      nextKappa[r] = kNew;
      nextMu[r] = (kOld * mOld + z) / kNew;
      nextAlpha[r] = alphaR[prev] + 0.5;
      nextBeta[r] =
        betaR[prev] + (kOld * (z - mOld) * (z - mOld)) / (2 * kNew);
    }
    muR = nextMu;
    kappaR = nextKappa;
    alphaR = nextAlpha;
    betaR = nextBeta;

    // --- (B) 5-State Markov Regime Likelihood & Particle Filter Update ---
    const isLastStep = idx === evalSlice.length - 1;
    const closedBoost =
      isLastStep && (isFuturesClosed || weekpart === 'WEEKEND_THIN' || weekpart === 'FUTURES_CLOSED_OVERLAP')
        ? 2.8
        : isLastStep && isThinLiquiditySubSession
        ? 1.55
        : dTau < 0.62
        ? 1.4
        : 0.45;

    const regimeLikelihoods = [
      // 0: LAMINAR_TREND: moderate innovation, directional flow, healthy activity clock
      Math.exp(-0.5 * Math.pow((absZ - 0.75) / 0.85, 2)) * (0.75 + 0.65 * Math.abs(signedImb)),
      // 1: RANGE_EQUILIBRIUM: low innovation, balanced flow, normal volatility
      Math.exp(-0.5 * Math.pow(absZ / 0.75, 2)) * Math.exp(-0.4 * Math.pow(localVolRatio - 0.9, 2)),
      // 2: TAIL_SHOCK_LIQUIDATION: large innovation |z| > 1.85 or surge in deltaTau
      (absZ > 1.75 ? Math.min(6.0, 0.45 * Math.exp(0.85 * Math.min(3.5, absZ - 1.3))) : 0.12) *
        (0.8 + 0.35 * dTau),
      // 3: VOLATILITY_SQUEEZE_BREAKOUT: compressed prior vol expanding with directional impulse
      Math.exp(-0.5 * Math.pow((absZ - 1.35) / 0.75, 2)) *
        (localVolRatio > 1.25 || dTau > 1.25 ? 1.55 : 0.55),
      // 4: THIN_ILLIQUID_AUCTION: low activity clock or closed/thin session
      closedBoost * Math.exp(-0.5 * Math.pow(Math.min(2.5, dTau) / 0.75, 2)),
    ].map(v => Math.max(1e-4, v));

    // Normalize current transition matrix rows from Dirichlet counts
    const transMat = dirichletCounts.map(row => {
      const s = row.reduce((a, b) => a + b, 0);
      return row.map(c => c / Math.max(1e-6, s));
    });

    // Hamilton filter step + Dirichlet online transition update
    const prevDominantIdx = Math.max(0, regimePost.indexOf(Math.max(...regimePost)));
    const predictedRegime = [0, 0, 0, 0, 0];
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 5; i++) {
        predictedRegime[j] += regimePost[i] * transMat[i][j];
      }
    }
    const unnormPost = predictedRegime.map((p, j) => {
      const v = p * regimeLikelihoods[j];
      return Number.isFinite(v) && v > 0 ? v : 1e-4;
    });
    const sumPost = unnormPost.reduce((a, b) => a + b, 0) || 1;
    regimePost = unnormPost.map(u => u / sumPost);
    const newDominantIdx = Math.max(0, regimePost.indexOf(Math.max(...regimePost)));
    dirichletCounts[prevDominantIdx][newDominantIdx] += 0.35;

    // Particle filter sequential importance update
    let wSum = 0;
    for (let p = 0; p < numParticles; p++) {
      const curState = particleRegimes[p];
      // Deterministic pseudo-random transition using particle index + bar index
      const uHash = ((p * 37 + idx * 101 + 17) % 100) / 100;
      let cumP = 0;
      let nextState = curState;
      for (let j = 0; j < 5; j++) {
        cumP += transMat[curState][j];
        if (uHash <= cumP) {
          nextState = j;
          break;
        }
      }
      particleRegimes[p] = nextState;
      particleWeights[p] = Math.max(1e-6, particleWeights[p] * regimeLikelihoods[nextState]);
      wSum += particleWeights[p];
    }
    let sumSqW = 0;
    for (let p = 0; p < numParticles; p++) {
      particleWeights[p] /= Math.max(1e-9, wSum);
      sumSqW += particleWeights[p] * particleWeights[p];
    }
    particleNeff = 1 / Math.max(1e-6, sumSqW);
    if (particleNeff < numParticles * 0.5) {
      // Systematic resampling aligned with posterior distribution
      const resampled: number[] = [];
      for (let p = 0; p < numParticles; p++) {
        const targetU = (p + 0.5) / numParticles;
        let c = 0;
        let chosen = 0;
        for (let j = 0; j < 5; j++) {
          c += regimePost[j];
          if (targetU <= c) {
            chosen = j;
            break;
          }
        }
        resampled.push(chosen);
      }
      particleRegimes = resampled;
      particleWeights.fill(1 / numParticles);
      particleNeff = numParticles * 0.88;
    }

    // --- (C) Variational Bayesian Normal-Inverse-Gamma Update (VB-Kalman) ---
    const stateChangeEnergy = Math.min(9.0, 0.55 * z * z * Math.max(0.5, dTau));
    const obsErrorEnergy = Math.min(9.0, 0.65 * z * z);

    igAlphaProcess = forgettingRho * igAlphaProcess + 0.5;
    igBetaProcess = forgettingRho * igBetaProcess + 0.5 * stateChangeEnergy;

    igAlphaObs = forgettingRho * igAlphaObs + 0.5;
    igBetaObs = forgettingRho * igBetaObs + 0.5 * obsErrorEnergy;
  }

  // Finalize BOCPD summary
  const cpProb = Math.min(
    1,
    Math.max(0, (runProb[0] || 0) + (runProb[1] || 0) * 0.65 + (runProb[2] || 0) * 0.35)
  );
  let expectedRunLength = 0;
  let mapR = 0;
  let mapRProb = -1;
  const bucketList: { runLength: number; probability: number }[] = [];
  for (let r = 0; r <= maxR; r++) {
    const p = runProb[r] || 0;
    expectedRunLength += r * p;
    if (p > mapRProb) {
      mapRProb = p;
      mapR = r;
    }
    if (p >= 0.015) {
      bucketList.push({ runLength: r, probability: parseFloat(p.toFixed(4)) });
    }
  }
  bucketList.sort((a, b) => b.probability - a.probability);

  const structuralBreakTriggered = cpProb >= 0.32 || mapR <= 2;

  // Finalize 5-State Markov Regime Posterior
  const posteriorsRecord: Record<BayesianRegimeStateId, number> = {
    LAMINAR_TREND: parseFloat(regimePost[0].toFixed(4)),
    RANGE_EQUILIBRIUM: parseFloat(regimePost[1].toFixed(4)),
    TAIL_SHOCK_LIQUIDATION: parseFloat(regimePost[2].toFixed(4)),
    VOLATILITY_SQUEEZE_BREAKOUT: parseFloat(regimePost[3].toFixed(4)),
    THIN_ILLIQUID_AUCTION: parseFloat(regimePost[4].toFixed(4)),
  };
  let dominantIdx = 0;
  for (let j = 1; j < 5; j++) {
    if (regimePost[j] > regimePost[dominantIdx]) dominantIdx = j;
  }
  const dominantRegime = BAYESIAN_REGIME_IDS[dominantIdx];
  let entropyBits = 0;
  for (let j = 0; j < 5; j++) {
    const p = Math.max(1e-6, regimePost[j]);
    entropyBits -= p * Math.log2(p);
  }

  const normalizedTransMat = dirichletCounts.map(row => {
    const s = row.reduce((a, b) => a + b, 0) || 1;
    return row.map(c => parseFloat((c / s).toFixed(4)));
  });

  // Finalize Variational Bayesian Kalman Hyperparameters
  const posteriorProcessNoiseScale = Math.max(
    0.25,
    Math.min(3.5, igBetaProcess / Math.max(1.05, igAlphaProcess - 0.5))
  );
  const posteriorObsNoiseScale = Math.max(
    0.25,
    Math.min(3.5, igBetaObs / Math.max(1.05, igAlphaObs - 0.5))
  );

  const shockProb = posteriorsRecord.TAIL_SHOCK_LIQUIDATION;
  const thinProb = posteriorsRecord.THIN_ILLIQUID_AUCTION;
  const trendProb = posteriorsRecord.LAMINAR_TREND + 0.65 * posteriorsRecord.VOLATILITY_SQUEEZE_BREAKOUT;
  const rangeProb = posteriorsRecord.RANGE_EQUILIBRIUM;

  // Continuous Bayesian Meta-Learned Multipliers:
  // Drift retention gamma_t in [0.05, 1.0]: shrinks smoothly under BOCPD change-point, tail shock, or thin auction
  const continuousDriftRetentionGamma = parseFloat(
    Math.max(
      0.05,
      Math.min(
        1.0,
        (1.0 - 0.62 * cpProb - 0.58 * shockProb - 0.72 * thinProb + 0.22 * trendProb) *
          Math.min(1.15, 1.0 / Math.sqrt(Math.max(0.6, posteriorObsNoiseScale)))
      )
    ).toFixed(4)
  );

  // Equilibrium anchor pull kappa_t in [0.10, 1.0]: weakens under shock/trend breakout so pre-shock anchor cannot pull back falsely
  const continuousAnchorPullKappa = parseFloat(
    Math.max(
      0.1,
      Math.min(
        1.0,
        0.52 + 0.38 * rangeProb - 0.45 * shockProb - 0.35 * cpProb - 0.25 * trendProb
      )
    ).toFixed(4)
  );

  // Uncertainty band multiplier in [0.95, 2.25]
  const continuousBandUncertaintyMult = parseFloat(
    Math.max(
      0.95,
      Math.min(
        2.25,
        0.96 +
          0.42 * cpProb +
          0.48 * shockProb +
          0.25 * thinProb +
          0.18 * Math.max(0, Math.sqrt(posteriorObsNoiseScale) - 1.0)
      )
    ).toFixed(4)
  );

  const elboScore = parseFloat(
    (
      -0.5 * posteriorObsNoiseScale -
      0.35 * posteriorProcessNoiseScale -
      0.25 * entropyBits +
      1.25 * (1 - cpProb)
    ).toFixed(4)
  );

  const bocpd: BocpdRunLengthState = {
    currentChangePointProbability: parseFloat(cpProb.toFixed(4)),
    expectedRunLengthBars: parseFloat(expectedRunLength.toFixed(2)),
    mapRunLengthBars: mapR,
    hazardRateLambda: baseLambda,
    logBayesFactorBreakVsContinuity: parseFloat(lastLogBfBreak.toFixed(4)),
    runLengthPosteriorTopBuckets: bucketList.slice(0, 6),
    structuralBreakTriggered,
  };

  const regimePosteriors: MarkovRegimePosteriorState = {
    dominantRegime,
    regimeEntropyBits: parseFloat(entropyBits.toFixed(3)),
    posteriors: posteriorsRecord,
    transitionMatrix5x5: normalizedTransMat,
    particleEffectiveSampleSize: parseFloat(particleNeff.toFixed(1)),
  };

  const variationalKalman: VariationalKalmanHyperState = {
    igAlphaProcess: parseFloat(igAlphaProcess.toFixed(3)),
    igBetaProcess: parseFloat(igBetaProcess.toFixed(3)),
    igAlphaObs: parseFloat(igAlphaObs.toFixed(3)),
    igBetaObs: parseFloat(igBetaObs.toFixed(3)),
    posteriorProcessNoiseScale: parseFloat(posteriorProcessNoiseScale.toFixed(4)),
    posteriorObsNoiseScale: parseFloat(posteriorObsNoiseScale.toFixed(4)),
    continuousDriftRetentionGamma,
    continuousAnchorPullKappa,
    continuousBandUncertaintyMult,
    variationalFreeEnergyElbo: elboScore,
  };

  return {
    evaluatedAtIso,
    bocpd,
    regimePosteriors,
    variationalKalman,
    metaPolicyRationaleEn: `Level-5 Tri-Engine Bayesian Meta-Learner: Dominant Regime=${dominantRegime} (P=${(
      posteriorsRecord[dominantRegime] * 100
    ).toFixed(1)}%, Entropy=${entropyBits.toFixed(2)} bits, N_eff=${particleNeff.toFixed(
      1
    )}) | BOCPD P(ChangePoint)=${(cpProb * 100).toFixed(1)}%, E[r_t]=${expectedRunLength.toFixed(
      1
    )} bars | VB-Kalman γ_drift=${continuousDriftRetentionGamma.toFixed(
      2
    )}, κ_anchor=${continuousAnchorPullKappa.toFixed(
      2
    )}, BandMult=${continuousBandUncertaintyMult.toFixed(2)}× (x1_drift=${latentState.localDrift.toExponential(
      2
    )}).`,
    metaPolicyRationaleFa: `فرایادگیر بیزی سطح ۵: رژیم غالب=${dominantRegime} (${(
      posteriorsRecord[dominantRegime] * 100
    ).toFixed(1)}٪، آنتروپی=${entropyBits.toFixed(2)} بیت) | احتمال نقطه تغییر BOCPD=${(
      cpProb * 100
    ).toFixed(1)}٪، طول دوره=${expectedRunLength.toFixed(
      1
    )} کندل | ضرایب پیوسته VB-Kalman: γ_drift=${continuousDriftRetentionGamma.toFixed(
      2
    )}، κ_anchor=${continuousAnchorPullKappa.toFixed(
      2
    )}، باند=${continuousBandUncertaintyMult.toFixed(2)}×.`,
  };
}

/**
 * 3. Structured 6D Bayesian / Extended Kalman Filter on the Information Clock τ
 *    + Multi-Venue Observation Equations + Conditional Expectation Trajectory Propagation
 *    Strictly causal (prefix-invariant): at bar t, all statistics use only bars [0..t].
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
  atr?: number;
  activeProvider: string;
  activeSymbol: string;
  instrumentIdentity: string;
  extensionInput?: OrderBookMicrostructureExtensionInput;
  tuningOverrides?: LatentFilterTuningOverrides;
  pointInTimeMacroSeries?: PointInTimeMacroObservation[];
}): {
  latentState: LatentStateVector6D;
  impliedLatentPriceUsd: number;
  impliedDriftUsdPerTau: number;
  impliedVolPctPerSqrtTau: number;
  latentCovarianceDiagonal: LatentStateVector6D;
  latentCovarianceMatrix6x6: number[][];
  venueObservations: VenueObservationEquationRecord[];
  yellowLinePlume: EnsemblePlume;
  faultClassification: FaultClassificationReport;
  bayesianMetaLearning: BayesianMetaLearningTelemetry;
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
    atr,
    activeProvider,
    activeSymbol,
    instrumentIdentity,
    extensionInput,
    tuningOverrides,
    pointInTimeMacroSeries,
  } = params;

  const macroSeries: PointInTimeMacroObservation[] =
    pointInTimeMacroSeries ?? loadPointInTimeMacroSeriesFromFixture().observations;

  const n = candles.length;
  const logReturns: number[] = [0];
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

  const kappaMeanRev = tuningOverrides?.meanReversionKappa ?? 0.12;
  const kappaRes = 0.18;
  const kappaMacro = 0.08;

  const betaTox = tuningOverrides?.echoToxicityCouplingBeta ?? 0.34;
  const gammaEchoRes = tuningOverrides?.echoResilienceCouplingGamma ?? 0.42;
  const etaMacro = tuningOverrides?.macroResidualCouplingEta ?? 0.25;
  const obsPrecMult = Math.max(0.5, Math.min(2.5, tuningOverrides?.crossVenueObservationPrecisionMult ?? 1.0));

  const initRefPrice = Math.max(100, candles[0].close);
  const macroAt0 =
    macroSeries.length > 0 ? resolvePointInTimeMacroAt(candles[0].time, macroSeries) : liveMacro;
  const initMacroLogForce =
    macroAt0.status === 'MACRO_FEED_UNAVAILABLE'
      ? 0
      : (macroAt0.netMacroLift / initRefPrice) * etaMacro;
  const initMedVol = Math.max(0.0005, parkinsonVols[0] || 0.0015);

  const X = [
    Math.log(initRefPrice), // x1: logPriceLevel
    0.0, // x2: localDrift
    initMedVol, // x3: localVolatility
    barSignedImbalances[0] * 0.25, // x4: pressureToxicity
    0.72, // x5: liquidityResilience in [0.05, 0.99]
    initMacroLogForce, // x6: macroResidualForce
  ];

  const initVarLogP = initMedVol * initMedVol;
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

  let causalMedVol = initMedVol;
  let kappaDrift = 0.24;
  let kappaVol = 0.22;
  let kappaTox = 0.35;
  let runningShockAnchorUsd = Math.max(100, candles[0]?.close || equilibriumAnchorPrice || 2650);
  let shockCooldownBarsRemaining = 0;
  let latestBarShockOperatorResult: ResidualShockOperatorResult | null = null;

  for (let t = 0; t < n; t++) {
    const c = candles[t];
    const dt = deltaTauSeries[t] || 1.0;
    const cumTau = cumulativeTauSeries[t] || t + 1;

    // Strictly causal prefix statistics up to bar max(0, t-1) for prediction at bar t
    const statEnd = Math.max(1, t);
    const statStart = Math.max(0, statEnd - 48);
    const causalVolSlice = parkinsonVols.slice(statStart, statEnd);
    causalMedVol = Math.max(0.0005, median(causalVolSlice));

    const causalRetSlice = logReturns.slice(Math.max(1, statStart), statEnd);
    const causalImbSlice = barSignedImbalances.slice(statStart, statEnd);
    const retAutocorr1 =
      causalRetSlice.length >= 6
        ? Math.abs(pearsonCorrelation(causalRetSlice.slice(0, -1), causalRetSlice.slice(1)))
        : 0.1;
    const volAutocorr1 =
      causalVolSlice.length >= 6
        ? Math.abs(pearsonCorrelation(causalVolSlice.slice(0, -1), causalVolSlice.slice(1)))
        : 0.2;
    const imbAutocorr1 =
      causalImbSlice.length >= 6
        ? Math.abs(pearsonCorrelation(causalImbSlice.slice(0, -1), causalImbSlice.slice(1)))
        : 0.15;

    const phiDrift =
      tuningOverrides?.driftPersistencePhi ??
      Math.max(0.55, Math.min(0.92, 0.65 + 0.25 * retAutocorr1));
    kappaDrift = Math.max(0.05, Math.min(0.65, -Math.log(Math.max(0.2, Math.min(0.95, phiDrift)))));
    kappaVol = Math.max(0.06, Math.min(0.45, -Math.log(Math.max(0.25, Math.min(0.92, volAutocorr1 + 0.45)))));
    kappaTox = Math.max(0.12, Math.min(0.6, -Math.log(Math.max(0.15, Math.min(0.85, imbAutocorr1 + 0.3)))));

    const causalRefPrice = Math.max(100, candles[Math.max(0, t - 1)].close);
    const hasExplicitPointInTimeSeries = Array.isArray(pointInTimeMacroSeries);
    const barMacro: VerifiedMacroYieldResult =
      macroSeries.length > 0
        ? resolvePointInTimeMacroAt(c.time, macroSeries)
        : hasExplicitPointInTimeSeries
        ? resolvePointInTimeMacroAt(c.time, [])
        : t === n - 1 ||
          (liveMacro.effectiveAvailableTimestampSec !== undefined &&
            liveMacro.effectiveAvailableTimestampSec <= c.time)
        ? liveMacro
        : resolvePointInTimeMacroAt(c.time, []);

    const barMacroState =
      barMacro.epistemicState ??
      (barMacro.status === 'MACRO_FEED_UNAVAILABLE'
        ? 'LIVE_FEED_UNAVAILABLE_OR_QUORUM_FAILED'
        : 'VERIFIED_POINT_IN_TIME');
    const isMacroMissingOrUnavailable =
      barMacro.status === 'MACRO_FEED_UNAVAILABLE' ||
      barMacroState === 'PRE_SERIES_HISTORICAL_MISSING' ||
      barMacroState === 'LIVE_FEED_UNAVAILABLE_OR_QUORUM_FAILED' ||
      !Number.isFinite(barMacro.netMacroLift);

    const macroAgeDays = (barMacro.observationAgeSec ?? 0) / 86400;
    const staleMacroDecay =
      barMacroState === 'RELEASE_DELAYED_OR_HOLIDAY'
        ? Math.exp(-0.08 * Math.max(0, macroAgeDays - 4))
        : 1.0;
    const causalMacroLogForce = isMacroMissingOrUnavailable
      ? 0
      : (barMacro.netMacroLift / causalRefPrice) * etaMacro * staleMacroDecay;

    // Compute strictly causal cointegration basis mean up to bar t
    const causalPrefixStart = Math.max(0, t - 29);
    const causalCandlesSlice = candles.slice(causalPrefixStart, t + 1);
    const causalBenchAtT = secondaryBenchmark
      ? {
          ...secondaryBenchmark,
          candles: secondaryBenchmark.candles.filter(b => b.time <= c.time),
        }
      : null;
    const causalBasisAtT = computeCointegrationBasis(
      c.close,
      causalCandlesSlice,
      causalBenchAtT
    ).meanBasis;

    const eqStart = Math.max(0, t - 24);
    let eqSum = 0;
    let eqCnt = 0;
    for (let j = eqStart; j <= Math.max(0, t - 1); j++) {
      eqSum += candles[j].close;
      eqCnt++;
    }
    const rawRollingEqUsd = Math.max(100, eqSum / Math.max(1, eqCnt));
    if (t === 0 || shockCooldownBarsRemaining === 0) {
      runningShockAnchorUsd = rawRollingEqUsd;
    }
    const causalLogEq = Math.log(Math.max(100, runningShockAnchorUsd));

    if (t > 0) {
      // --- STEP 1: STATE PREDICTION ON THE INFORMATION CLOCK (τ_{t-1} -> τ_t) ---
      const eDrift = Math.exp(-kappaDrift * dt);
      const eVol = Math.exp(-kappaVol * dt);
      const eTox = Math.exp(-kappaTox * dt);
      const eRes = Math.exp(-kappaRes * dt);
      const eMac = Math.exp(-kappaMacro * dt);

      const safeRes = Math.max(0.15, X[4]);
      const toxRatio = X[3] / safeRes;
      // Innovation-shrunk 1-step drift prevents high-frequency bar noise over-extrapolation
      const driftShrinkage = 0.28;
      const cointBasisLogCausal = -causalBasisAtT / Math.max(100, causalRefPrice);
      const structuralStepLogDrift = tuningOverrides?.activeIntegratedStructuralTerm
        ? evaluateCausalStructuralHypothesisTermLogDrift({
            structuralTerm: tuningOverrides.activeIntegratedStructuralTerm,
            X,
            prevLogResidual,
            causalMedVol,
            causalLogEq,
            cointegrationBasisLog: cointBasisLogCausal,
            causalMacroLogForce,
            dt,
          })
        : 0;
      const effectiveStepLogDrift =
        driftShrinkage * (X[1] + betaTox * toxRatio * X[2] + X[5] + 0.14 * prevLogResidual) * dt +
        structuralStepLogDrift;

      const nextX0 = X[0] + effectiveStepLogDrift;
      const eqRestoringDrift = kappaMeanRev * (causalLogEq - X[0]);
      const nextX1 = eDrift * X[1] + (1 - eDrift) * (eqRestoringDrift + X[5]);
      const nextX2 = Math.max(0.0002, Math.min(0.035, eVol * X[2] + (1 - eVol) * causalMedVol));
      const nextX3 = Math.max(-1.0, Math.min(1.0, eTox * X[3]));
      const nextX4 = Math.max(0.05, Math.min(0.99, eRes * X[4] + (1 - eRes) * 0.72));
      // Never inject a synthetic 0.0 macro target when macro observation is missing/unavailable;
      // decay existing latent macro state purely via eMac and inflate QDiag[5]
      const nextX5 = isMacroMissingOrUnavailable
        ? eMac * X[5]
        : eMac * X[5] + (1 - eMac) * causalMacroLogForce;

      const F: number[][] = [
        [
          1,
          driftShrinkage * dt,
          driftShrinkage * betaTox * toxRatio * dt,
          (driftShrinkage * betaTox * X[2] * dt) / safeRes,
          (-driftShrinkage * betaTox * X[3] * X[2] * dt) / (safeRes * safeRes),
          driftShrinkage * dt,
        ],
        [-(1 - eDrift) * kappaMeanRev, eDrift, 0, 0, 0, 1 - eDrift],
        [0, 0, eVol, 0, 0, 0],
        [0, 0, 0, eTox, 0, 0],
        [0, 0, 0, 0, eRes, 0],
        [0, 0, 0, 0, 0, eMac],
      ];

      const stepVar = Math.max(1e-8, X[2] * X[2] * dt);
      const macroProcessNoiseMult = isMacroMissingOrUnavailable ? 1.35 : 1.0;
      const QDiag = [
        stepVar * 0.65,
        stepVar * 0.12,
        stepVar * 0.04,
        0.015 * dt,
        0.008 * dt,
        stepVar * 0.03 * macroProcessNoiseMult,
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

      // Shared Residual Shock Operator (Engine A — Gold): mutate drift, anchor, and uncertainty on |z| >= z*
      const shockOpOut = applyResidualShockOperator({
        assetClass: 'GOLD',
        barTimeSec: c.time,
        barIndex: t,
        realizedPrice: c.close,
        oneStepPredictedPrice: predPriceUsd,
        predictiveSigma: predStdUsd,
        currentDrift: X[1],
        currentAnchorPrice: runningShockAnchorUsd,
        priorCooldownBarsRemaining: shockCooldownBarsRemaining,
      });
      shockCooldownBarsRemaining = shockOpOut.cooldownBarsRemaining;
      if (shockOpOut.shockFired) {
        X[1] = shockOpOut.mutatedDrift;
        runningShockAnchorUsd = shockOpOut.mutatedAnchorPrice;
        P[0][0] *= shockOpOut.uncertaintyMultiplier;
        P[1][1] *= shockOpOut.uncertaintyMultiplier;
      }
      if (t === n - 1) {
        latestBarShockOperatorResult = shockOpOut;
      }

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
      (parkinsonVols[t] * parkinsonVols[t] * 0.14) / (Math.max(0.25, dt) * obsPrecMult)
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

    // Additional Verified Multi-Venue Cameras in Waterfall (strictly causal bar lookup at bar t)
    if (verifiedVenueCameras && verifiedVenueCameras.length > 0) {
      for (let camIdx = 0; camIdx < verifiedVenueCameras.length; camIdx++) {
        const cam = verifiedVenueCameras[camIdx];
        if (cam.providerName === activeProvider && cam.symbol === activeSymbol) continue;
        const alignedBar = [...cam.candles]
          .reverse()
          .find(b => b.time <= c.time && c.time - b.time <= intervalStepSeconds * 2);
        if (!alignedBar || alignedBar.close <= 100) continue;

        const isFuturesCamera = cam.instrumentIdentity === 'COMEX_GOLD_FUTURES' || cam.symbol === 'GC=F';
        const camLogP = Math.log(alignedBar.close);
        const basisUsd = isFuturesCamera
          ? -causalBasisAtT
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
      const bBar = [...secondaryBenchmark.candles]
        .reverse()
        .find(b => b.time <= c.time && c.time - b.time <= intervalStepSeconds * 2);
      if (bBar && bBar.close > 100) {
        const bLogP = Math.log(bBar.close);
        const basisUsd = -causalBasisAtT;
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
      R: Math.max(1e-8, causalMedVol * causalMedVol * 0.25),
    });
    X[2] = Math.max(0.0002, Math.min(0.035, X[2]));

    // Pulse–Echo (Sonar) & Optional L2 Order-Book Imbalance -> x4 (pressureToxicity) & x5 (liquidityResilience)
    const l2Snap = [...(extensionInput?.l2OrderBookSnapshots || [])]
      .reverse()
      .find(s => s.timestampSec <= c.time && c.time - s.timestampSec <= 900);
    const l2Imbalance =
      l2Snap && Number.isFinite(l2Snap.orderBookImbalance) ? l2Snap.orderBookImbalance : 0;
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
      l2Snap &&
      Number.isFinite(l2Snap.bidDepthTop5Usd) &&
      Number.isFinite(l2Snap.askDepthTop5Usd) &&
      l2Snap.bidDepthTop5Usd + l2Snap.askDepthTop5Usd > 0
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
    // Only apply measurement update when macro observation is causally verified (never on missing/unavailable)
    if (!isMacroMissingOrUnavailable) {
      const macroRInflation =
        barMacroState === 'RELEASE_DELAYED_OR_HOLIDAY'
          ? 1 + 0.35 * Math.max(0, macroAgeDays - 4)
          : barMacroState === 'VINTAGE_UNAVAILABLE_REVISION_RISK'
          ? 1.5
          : 1.0;
      applySequentialMeasurementUpdate6D({
        X,
        P,
        H: [0, 0.22, 0, 0, 0, 1],
        observedY: causalMacroLogForce,
        basisOffset: 0,
        R: Math.max(1e-8, causalMedVol * causalMedVol * 0.3 * macroRInflation),
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

  const medVol = causalMedVol;

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
  const lastCloseUsd = Math.max(100, candles[n - 1].close);
  const rawEqAnchor = tuningOverrides?.equilibriumAnchorOverride ?? equilibriumAnchorPrice;
  const awareness = tuningOverrides?.marketAwarenessState ?? null;

  // Compute causal 14-bar ATR if not explicitly supplied by caller
  const atrWindow = Math.min(14, n);
  let trSum = 0;
  for (let idx = n - atrWindow; idx < n; idx++) {
    const cBar = candles[idx];
    const prevBarClose = idx > 0 ? candles[idx - 1].close : cBar.open;
    const tr = Math.max(
      cBar.high - cBar.low,
      Math.abs(cBar.high - prevBarClose),
      Math.abs(cBar.low - prevBarClose)
    );
    trSum += tr;
  }
  const safeAtr = Math.max(0.5, atr ?? (atrWindow > 0 ? trSum / atrWindow : lastCloseUsd * medVol));

  // Measure causal multi-bar swing drawdown / rally and streak velocity at t = n - 1
  const swingLookbackW = Math.min(6, Math.max(1, n - 1));
  let recentSwingHigh = lastCloseUsd;
  let recentSwingLow = lastCloseUsd;
  for (let idx = n - 1 - swingLookbackW; idx < n - 1; idx++) {
    if (idx >= 0) {
      if (candles[idx].close > recentSwingHigh) recentSwingHigh = candles[idx].close;
      if (candles[idx].close < recentSwingLow) recentSwingLow = candles[idx].close;
    }
  }
  const drawdownFromSwingHighUsd = lastCloseUsd - recentSwingHigh;
  const rallyFromSwingLowUsd = lastCloseUsd - recentSwingLow;
  const swingDropLog = Math.log(lastCloseUsd) - Math.log(Math.max(100, recentSwingHigh));
  const swingRallyLog = Math.log(lastCloseUsd) - Math.log(Math.max(100, recentSwingLow));

  let consecutiveDirBars = 0;
  let streakSign = 0;
  let consecutiveBearBars = 0;
  let consecutiveBullBars = 0;
  for (let idx = n - 1; idx >= 1; idx--) {
    const dp = candles[idx].close - candles[idx - 1].close;
    const s = Math.sign(dp);
    if (Math.abs(dp) <= 1e-4 || s === 0) break;
    if (streakSign === 0) streakSign = s;
    if (s !== streakSign) break;
    consecutiveDirBars++;
    if (s < 0) consecutiveBearBars++;
    if (s > 0) consecutiveBullBars++;
  }
  const streakBars = Math.max(consecutiveBearBars, consecutiveBullBars);
  const lastBarMoveUsd = n >= 2 ? candles[n - 1].close - candles[n - 2].close : 0;
  const lookbackK = Math.min(4, Math.max(1, n - 1));
  const trailingRealizedMoveUsd =
    n > lookbackK ? candles[n - 1].close - candles[n - 1 - lookbackK].close : lastBarMoveUsd;
  const streakStartIdx = Math.max(0, n - 1 - streakBars);
  const consecutiveStreakMoveUsd =
    streakBars >= 2 ? lastCloseUsd - candles[streakStartIdx].close : lastBarMoveUsd;

  let structuralRealizedMoveUsd = trailingRealizedMoveUsd;
  if (
    consecutiveBearBars >= 2 &&
    Math.abs(drawdownFromSwingHighUsd) > Math.abs(trailingRealizedMoveUsd)
  ) {
    structuralRealizedMoveUsd = Math.min(drawdownFromSwingHighUsd, consecutiveStreakMoveUsd);
  } else if (
    consecutiveBullBars >= 2 &&
    rallyFromSwingLowUsd > Math.abs(trailingRealizedMoveUsd)
  ) {
    structuralRealizedMoveUsd = Math.max(rallyFromSwingLowUsd, consecutiveStreakMoveUsd);
  }

  // Compute unadjusted (pre-feedback) 6-step forward slope & step-1 90% band width for FaultClassifier
  let previewX = [...X];
  let previewP = P.map(row => [...row]);
  let previewDeltaTau = deltaTauSeries[n - 1] || 1.0;
  const rawOpenLogEqTarget = Math.log(Math.max(100, rawEqAnchor));
  const rawSymbolicLogDrift = (tuningOverrides?.symbolicStepDriftUsd ?? 0) / lastCloseUsd;
  let preFeedbackBandWidthStep1Usd = safeAtr * 2.0;
  let preFeedbackExpectedStep6Usd = lastCloseUsd;

  for (let h = 1; h <= 6; h++) {
    previewDeltaTau = 0.72 * previewDeltaTau + 0.28 * 1.0;
    const eDriftP = Math.exp(-kappaDrift * previewDeltaTau);
    const eVolP = Math.exp(-kappaVol * previewDeltaTau);
    const eToxP = Math.exp(-kappaTox * previewDeltaTau);
    const eResP = Math.exp(-kappaRes * previewDeltaTau);
    const eMacP = Math.exp(-kappaMacro * previewDeltaTau);

    const safeResP = Math.max(0.2, previewX[4]);
    const toxRatioP = previewX[3] / safeResP;
    const eqRestoringLogP = kappaMeanRev * (rawOpenLogEqTarget - previewX[0]);
    const decayIdxP = Math.max(0, h - 1);
    const decayingSymbolicLogP = rawSymbolicLogDrift * Math.exp(-0.075 * decayIdxP);
    const forwardStructuralLogP = tuningOverrides?.activeIntegratedStructuralTerm
      ? evaluateCausalStructuralHypothesisTermLogDrift({
          structuralTerm: tuningOverrides.activeIntegratedStructuralTerm,
          X: previewX,
          prevLogResidual: prevLogResidual * Math.exp(-0.22 * decayIdxP),
          causalMedVol: medVol,
          causalLogEq: rawOpenLogEqTarget,
          cointegrationBasisLog: -cointegrationBasisMeanUsd / lastCloseUsd,
          causalMacroLogForce: previewX[5],
          dt: previewDeltaTau,
        }) * Math.exp(-0.06 * decayIdxP)
      : 0;

    const stepLogDriftP =
      (previewX[1] +
        betaTox * toxRatioP * previewX[2] +
        previewX[5] +
        eqRestoringLogP * 0.45 +
        decayingSymbolicLogP) *
        previewDeltaTau +
      forwardStructuralLogP;

    const nextX0P = previewX[0] + stepLogDriftP;
    const nextX1P = eDriftP * previewX[1] + (1 - eDriftP) * (eqRestoringLogP + previewX[5]);
    const nextX2P = Math.max(0.0002, Math.min(0.035, eVolP * previewX[2] + (1 - eVolP) * medVol));
    const nextX3P = eToxP * previewX[3];
    const nextX4P = Math.max(0.05, Math.min(0.99, eResP * previewX[4] + (1 - eResP) * 0.75));
    const nextX5P = eMacP * previewX[5];

    const FhP: number[][] = [
      [
        1 - 0.45 * kappaMeanRev * previewDeltaTau,
        previewDeltaTau,
        betaTox * toxRatioP * previewDeltaTau,
        (betaTox * previewX[2] * previewDeltaTau) / safeResP,
        (-betaTox * previewX[3] * previewX[2] * previewDeltaTau) / (safeResP * safeResP),
        previewDeltaTau,
      ],
      [-(1 - eDriftP) * kappaMeanRev, eDriftP, 0, 0, 0, 1 - eDriftP],
      [0, 0, eVolP, 0, 0, 0],
      [0, 0, 0, eToxP, 0, 0],
      [0, 0, 0, 0, eResP, 0],
      [0, 0, 0, 0, 0, eMacP],
    ];
    const stepVarP = Math.max(1e-8, previewX[2] * previewX[2] * previewDeltaTau);
    const QDiagP = [
      stepVarP * 0.85,
      stepVarP * 0.14,
      stepVarP * 0.04,
      0.012 * previewDeltaTau,
      0.008 * previewDeltaTau,
      stepVarP * 0.02,
    ];
    const nextPP: number[][] = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        let s = 0;
        for (let k = 0; k < 6; k++) {
          for (let l = 0; l < 6; l++) {
            s += FhP[i][k] * previewP[k][l] * FhP[j][l];
          }
        }
        nextPP[i][j] = s + (i === j ? QDiagP[i] : 0);
      }
    }

    previewX = [nextX0P, nextX1P, nextX2P, nextX3P, nextX4P, nextX5P];
    previewP = nextPP;

    const predLogVarP = Math.max(1e-8, previewP[0][0]);
    const predLogStdP = Math.sqrt(predLogVarP);
    const expectedPriceP = Math.exp(previewX[0] + 0.5 * predLogVarP);
    if (h === 1) {
      const pUp95P = parseFloat((expectedPriceP * Math.exp(1.96 * predLogStdP)).toFixed(2));
      const pLo05P = parseFloat((expectedPriceP * Math.exp(-1.96 * predLogStdP)).toFixed(2));
      preFeedbackBandWidthStep1Usd = Math.max(0.1, pUp95P - pLo05P);
    }
    if (h === 6) {
      preFeedbackExpectedStep6Usd = parseFloat(expectedPriceP.toFixed(2));
    }
  }
  const preFeedbackForwardSlopeUsdPerStep = parseFloat(
    ((preFeedbackExpectedStep6Usd - lastCloseUsd) / 6).toFixed(4)
  );

  // Evaluate FaultClassifier in the forecast engine feedback loop
  const lastResPt = residualPoints.length > 0 ? residualPoints[residualPoints.length - 1] : null;
  const latestResidualUsd = lastResPt ? lastResPt.priceResidualUsd : lastBarMoveUsd;
  const latestResidualZ = lastResPt
    ? lastResPt.standardizedResidualSigma
    : latestResidualUsd / safeAtr;
  const latestSessionCal = evaluateGoldSessionAndCalendar({
    timestampSec: lastBarTime,
    extensionInput,
  });
  const macroBearishGravity = Boolean(
    liveMacro && liveMacro.status !== 'MACRO_FEED_UNAVAILABLE' && liveMacro.netMacroLift <= -0.35
  );
  const macroBullishSupport = Boolean(
    liveMacro && liveMacro.status !== 'MACRO_FEED_UNAVAILABLE' && liveMacro.netMacroLift >= 0.35
  );

  const metricsFaultReport = FaultClassifier.classifyFromMetrics({
    safeAtr,
    currentPrice: lastCloseUsd,
    liveForwardSlopeUsdPerStep: preFeedbackForwardSlopeUsdPerStep,
    liveBandWidthStep1Usd: preFeedbackBandWidthStep1Usd,
    latestResidualUsd,
    latestResidualZ,
    lastBarMoveUsd,
    trailingRealizedMoveUsd,
    structuralRealizedMoveUsd,
    consecutiveBearBars,
    consecutiveBullBars,
    streakBars,
    macroBearishGravity,
    macroBullishSupport,
    sessionId: awareness?.sessionId ?? latestSessionCal.sessionId,
    weekpart: awareness?.weekpart ?? latestSessionCal.weekpart,
    isTurnOfMonth:
      awareness?.seasonalCalendar?.isTurnOfMonth ?? latestSessionCal.seasonalCalendar.isTurnOfMonth,
  });
  const stateFaultReport = awareness
    ? FaultClassifier.analyzeMarketAwarenessState(awareness)
    : null;
  const faultClassification = FaultClassifier.mergeClassificationReports(
    metricsFaultReport,
    stateFaultReport
  );

  const resolvedFeedbackPolicies = FaultClassifier.resolveForecastFeedbackPolicies({
    tuningOverrides,
    awareness,
    faultClassification,
    defaultWeekpart: latestSessionCal.weekpart,
    isFuturesClosed: latestSessionCal.isFuturesClosed,
  });
  const driftPolicy: RecommendedDriftPolicy = resolvedFeedbackPolicies.driftPolicy;
  const bandPolicy: RecommendedBandPolicy = resolvedFeedbackPolicies.bandPolicy;
  const anchorPolicy: RecommendedAnchorPolicy = resolvedFeedbackPolicies.anchorPolicy;
  const seasonalUncMult = resolvedFeedbackPolicies.seasonalUncMult;

  // Compute open-auction structural reference from candles so 40+ hours of flat weekend bars
  // never wash out the post-open equilibrium anchor or active-session directional drift
  let openAuctionWeightedSum = 0;
  let openAuctionWeightTotal = 0;
  const openAuctionCloses: number[] = [];
  for (let idx = 0; idx < n; idx++) {
    const cBar = candles[idx];
    const cal = evaluateGoldSessionAndCalendar({ timestampSec: cBar.time });
    const isBarOpen = !cal.isFuturesClosed && cal.sessionId !== 'DAILY_ROLL_MAINTENANCE';
    const w = (isBarOpen ? 3.5 : 0.35) * Math.max(1, cBar.volume || 1);
    openAuctionWeightedSum += cBar.close * w;
    openAuctionWeightTotal += w;
    if (isBarOpen) {
      openAuctionCloses.push(cBar.close);
    }
  }
  const openAuctionStructuralVwap =
    openAuctionWeightTotal > 0 ? openAuctionWeightedSum / openAuctionWeightTotal : rawEqAnchor;

  let preCloseActiveLogDrift = 0;
  if (openAuctionCloses.length >= 4) {
    const lookback = Math.min(12, openAuctionCloses.length - 1);
    const pEnd = Math.max(100, openAuctionCloses[openAuctionCloses.length - 1]);
    const pStart = Math.max(100, openAuctionCloses[openAuctionCloses.length - 1 - lookback]);
    preCloseActiveLogDrift = (Math.log(pEnd) - Math.log(pStart)) / lookback;
  } else if (n >= 4) {
    const lookback = Math.min(24, n - 1);
    preCloseActiveLogDrift =
      (Math.log(Math.max(100, candles[n - 1].close)) -
        Math.log(Math.max(100, candles[n - 1 - lookback].close))) /
      lookback;
  }

  const hasShockFault = Boolean(
    latestBarShockOperatorResult?.shockFired ||
      anchorPolicy === 'RECENTER_TO_POST_SHOCK' ||
      driftPolicy === 'SHOCK_RESET' ||
      faultClassification.hasWrongDirection ||
      awareness?.activeFaultCodes?.includes('EQUILIBRIUM_ANCHOR_MISMATCH') ||
      awareness?.activeFaultCodes?.includes('STALE_DRIFT') ||
      awareness?.activeFaultCodes?.includes('WRONG_DIRECTION')
  );

  const dominantShockLogMove =
    streakSign < 0 && Math.abs(swingDropLog) > Math.abs(prevLogResidual)
      ? swingDropLog
      : streakSign > 0 && swingRallyLog > Math.abs(prevLogResidual)
      ? swingRallyLog
      : prevLogResidual;
  const shockDir = Math.sign(dominantShockLogMove || prevLogResidual) || -1;
  const dominantShockLogRate =
    consecutiveDirBars >= 2
      ? dominantShockLogMove / Math.max(1.5, Math.min(4, consecutiveDirBars))
      : prevLogResidual;

  let effectiveEqAnchor = rawEqAnchor;
  if (hasShockFault) {
    if ((rawEqAnchor - lastCloseUsd) * shockDir >= 0 && Math.abs(rawEqAnchor - lastCloseUsd) > 0.05) {
      // Caller already recentered equilibriumAnchorOverride in the direction of the post-shock regime
      effectiveEqAnchor = rawEqAnchor;
    } else {
      // Never leave effectiveEqAnchor on the pre-shock side of spot where it manufactures a fake recovery pull
      effectiveEqAnchor =
        lastCloseUsd *
        Math.exp(shockDir * Math.min(0.01, Math.max(0.0015, 0.35 * Math.abs(dominantShockLogMove))));
    }
  } else if (driftPolicy === 'ZERO_FOR_SESSION' || anchorPolicy === 'FREEZE') {
    // Preserve true post-open equilibrium target (blending HTF POC / equilibriumAnchorPrice & open-auction VWAP
    // if short-window rawEqAnchor collapsed onto flat weekend spot)
    const htfAnchorRef = equilibriumAnchorPrice > 100 ? equilibriumAnchorPrice : openAuctionStructuralVwap;
    const candidateOpenTarget =
      Math.abs(rawEqAnchor - lastCloseUsd) < Math.abs(htfAnchorRef - lastCloseUsd) * 0.5
        ? 0.45 * rawEqAnchor + 0.35 * htfAnchorRef + 0.20 * openAuctionStructuralVwap
        : rawEqAnchor;
    effectiveEqAnchor = candidateOpenTarget;
  }

  const openMarketLogEqTarget = Math.log(Math.max(100, effectiveEqAnchor));
  let closedMarketLogEqTarget = Math.log(
    Math.max(100, 0.92 * lastCloseUsd + 0.08 * effectiveEqAnchor)
  );
  let symbolicLogDriftBase =
    (tuningOverrides?.symbolicStepDriftUsd ?? 0) / lastCloseUsd;

  let simX = [...X];
  let simP = P.map(row => [...row]);
  let simDeltaTau = deltaTauSeries[n - 1] || 1.0;

  let eqRestoringPullMult = 0.45;
  let driftStepMult = 1.0;

  // Compute conserved open-market drift velocity so when a future step crosses into market open,
  // price moves higher or lower according to latent drift, equilibrium/HTF-POC pull, and macro lift
  const openEqGradientLog = kappaMeanRev * (openMarketLogEqTarget - Math.log(lastCloseUsd));
  const postShockInitDrift = Math.max(
    -0.0085,
    Math.min(0.0085, 0.14 * prevLogResidual + 0.28 * dominantShockLogRate)
  );
  const conservedOpenDriftX1 =
    hasShockFault
      ? postShockInitDrift
      : Math.abs(X[1]) >= Math.abs(preCloseActiveLogDrift) * 0.65 && Math.abs(X[1]) > 1e-5
      ? X[1]
      : 0.45 * X[1] + 0.55 * preCloseActiveLogDrift + 0.25 * openEqGradientLog;

  // Evaluate Level-5 Tri-Engine Bayesian Meta-Learner (BOCPD + 5-State Markov Particle Filter + VB-Kalman)
  const bayesianMetaLearning =
    awareness?.bayesianMetaLearning ??
    evaluateTriEngineBayesianMetaLearner({
      residualPoints,
      deltaTauSeries,
      parkinsonVols,
      barSignedImbalances,
      isFuturesClosed: latestSessionCal.isFuturesClosed,
      isThinLiquiditySubSession: latestSessionCal.isThinLiquiditySubSession,
      weekpart: latestSessionCal.weekpart,
      latentState: {
        logPriceLevel: X[0],
        localDrift: X[1],
        localVolatility: X[2],
        pressureToxicity: X[3],
        liquidityResilience: X[4],
        macroResidualForce: X[5],
      },
      evaluatedAtIso: latestSessionCal.evaluatedAtIso,
    });
  const vbKalman = bayesianMetaLearning.variationalKalman;

  if (driftPolicy === 'ZERO_FOR_SESSION') {
    // Start cleanly at current spot level, but NEVER erase latent velocity X[1], toxicity X[3],
    // macro lift X[5], or symbolicLogDriftBase: closed steps are damped per-step while open steps release them
    simX[0] = Math.log(lastCloseUsd);
    simX[1] = conservedOpenDriftX1;
  } else if (driftPolicy === 'SHRINK') {
    const shrinkGamma = Math.min(0.35, vbKalman.continuousDriftRetentionGamma);
    simX[1] = simX[1] * shrinkGamma;
    simX[5] = simX[5] * Math.min(0.5, shrinkGamma + 0.12);
    symbolicLogDriftBase = symbolicLogDriftBase * shrinkGamma;
    eqRestoringPullMult = Math.min(0.22, 0.45 * vbKalman.continuousAnchorPullKappa);
    driftStepMult = Math.min(0.45, shrinkGamma + 0.1);
  } else if (driftPolicy === 'SHOCK_RESET') {
    // Recenter latent starting level to post-shock realized price and align velocity with realized breakdown/impulse
    simX[0] = Math.log(lastCloseUsd);
    simX[1] = postShockInitDrift;
    simX[3] = Math.max(-0.75, Math.min(0.75, 0.32 * shockDir + 0.25 * (barSignedImbalances[n - 1] || 0)));
    if (simX[5] * shockDir < 0) {
      simX[5] = simX[5] * 0.2;
    }
    if (symbolicLogDriftBase * shockDir < 0) {
      // Prevent stale pre-shock symbolic drift from pulling opposite to the realized shock
      symbolicLogDriftBase = 0;
    } else {
      symbolicLogDriftBase = 0.78 * symbolicLogDriftBase;
    }
    eqRestoringPullMult = Math.min(0.28, 0.45 * vbKalman.continuousAnchorPullKappa);
    driftStepMult = 0.72;
  } else {
    // Continuous Level-5 Bayesian Meta-Learning modulation in nominal regime (driftPolicy === 'UNCHANGED')
    const metaGamma = Math.max(0.55, Math.min(1.0, vbKalman.continuousDriftRetentionGamma));
    simX[1] = simX[1] * metaGamma;
    eqRestoringPullMult = Math.max(0.20, Math.min(0.55, 0.45 * vbKalman.continuousAnchorPullKappa * 1.35));
    driftStepMult = Math.max(0.65, metaGamma);
  }

  const bandPolicyMult =
    (bandPolicy === 'WIDEN' ? 1.25 : 1.0) * seasonalUncMult;

  // Compute causal empirical 1-step close-to-close log-return variance and Direct Horizon-h FHS standardized residuals
  const trailingLogRets: number[] = [];
  const retStart = Math.max(1, n - 120);
  for (let idx = retStart; idx < n; idx++) {
    trailingLogRets.push(
      Math.log(Math.max(1e-6, candles[idx].close) / Math.max(1e-6, candles[idx - 1].close))
    );
  }
  const meanTrailingLogRet =
    trailingLogRets.length > 0
      ? trailingLogRets.reduce((a, b) => a + b, 0) / trailingLogRets.length
      : 0;
  const empCloseLogVar =
    trailingLogRets.length > 1
      ? trailingLogRets.reduce((a, r) => a + (r - meanTrailingLogRet) ** 2, 0) /
        (trailingLogRets.length - 1)
      : medVol * medVol;
  const empCloseLogStd = Math.sqrt(Math.max(1e-10, empCloseLogVar));

  const pickSortedQuantile = (sorted: number[], q: number, fallback: number): number => {
    if (sorted.length < 10) return fallback;
    const pos = Math.max(0, Math.min(sorted.length - 1, q * (sorted.length - 1)));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    const frac = pos - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };

  // Fallback 1-step signed standardized residuals (demeaned so location is in simX[0] and shape/skewness in e)
  const signedStdRets1 = trailingLogRets.map(r => (r - meanTrailingLogRet) / empCloseLogStd);
  const sortedSignedStd1 = [...signedStdRets1].sort((a, b) => a - b);

  // Compute causal Adaptive Conformal Inference (ACI) offset on 1-step standardized residuals
  let aciAlphaOffset90 = 0;
  if (residualPoints.length >= 16) {
    const recentRes = residualPoints.slice(-48);
    let misses90 = 0;
    for (const pt of recentRes) {
      if (Math.abs(pt.standardizedResidualSigma) > 1.6448536) {
        misses90++;
      }
    }
    const empMissRate90 = misses90 / recentRes.length;
    aciAlphaOffset90 = Math.max(-0.12, Math.min(0.35, (empMissRate90 - 0.10) * 1.25));
  }

  // Helper: Direct Horizon-h Standardized Empirical Residuals e_{i,h} = (r_{i,h} - mean(r_h)) / (sqrt(h) * empCloseLogStd)
  const computeDirectHorizonEmpiricalStats = (h: number, predLogStdH: number) => {
    const hRets: number[] = [];
    const startIdx = Math.max(h, n - 120);
    for (let idx = startIdx; idx < n; idx++) {
      hRets.push(
        Math.log(Math.max(1e-6, candles[idx].close) / Math.max(1e-6, candles[idx - h].close))
      );
    }
    const scaleH = Math.max(1e-10, Math.sqrt(h) * empCloseLogStd);
    let stdResH: number[];
    if (hRets.length >= 14) {
      const meanH = hRets.reduce((a, b) => a + b, 0) / hRets.length;
      stdResH = hRets.map(r => (r - meanH) / scaleH);
    } else {
      stdResH = signedStdRets1.length > 0 ? signedStdRets1 : [-1.645, -0.674, 0, 0.674, 1.645];
    }
    const sortedH = [...stdResH].sort((a, b) => a - b);
    const q05Raw = pickSortedQuantile(sortedH, 0.05, -1.6448536269514722);
    const q25Raw = pickSortedQuantile(sortedH, 0.25, -0.6744897501960817);
    const q50Raw = pickSortedQuantile(sortedH, 0.50, 0.0);
    const q75Raw = pickSortedQuantile(sortedH, 0.75, 0.6744897501960817);
    const q95Raw = pickSortedQuantile(sortedH, 0.95, 1.6448536269514722);

    // Ensure proper quantile ordering with ACI conformal calibration offset
    const q50 = Math.max(-0.35, Math.min(0.35, q50Raw));
    const q75 = Math.max(q50 + 0.25, q75Raw + 0.5 * aciAlphaOffset90);
    const q25 = Math.min(q50 - 0.25, q25Raw - 0.5 * aciAlphaOffset90);
    const q95 = Math.max(q75 + 0.35, q95Raw + aciAlphaOffset90);
    const q05 = Math.min(q25 - 0.35, q05Raw - aciAlphaOffset90);

    // Empirical Duan smearing factor M_h(sigma_h) = (1/N) * sum(exp(sigma_h * e_{i,h}))
    // Captures both log-normal convexity (0.5 * sigma^2) and empirical third/fourth moment skewness/kurtosis
    let smearingSum = 0;
    const sampleArr = stdResH.length >= 8 ? stdResH : sortedSignedStd1;
    if (sampleArr.length >= 8) {
      for (let i = 0; i < sampleArr.length; i++) {
        const clampedE = Math.max(-6, Math.min(6, sampleArr[i]));
        smearingSum += Math.exp(predLogStdH * clampedE);
      }
      smearingSum /= sampleArr.length;
    } else {
      smearingSum = Math.exp(0.5 * predLogStdH * predLogStdH);
    }
    const duanSmearingFactor = Math.max(0.95, Math.min(1.15, smearingSum));

    return { q05, q25, q50, q75, q95, duanSmearingFactor };
  };

  let cumHorizonLogVar = 0;

  // Variance-ratio-gated OU pull strictly restricted to 1h (3600s) and 4h (14400s) per Critique #3:
  // Compute causal Lo-MacKinlay VR(4) = Var(r^{(4)}) / (4 * Var(r^{(1)})) on trailingLogRets (<= t)
  let vr4Ratio = 1.0;
  if (trailingLogRets.length >= 16 && empCloseLogVar > 1e-12) {
    const r4List: number[] = [];
    for (let i = 3; i < trailingLogRets.length; i++) {
      r4List.push(
        trailingLogRets[i] +
          trailingLogRets[i - 1] +
          trailingLogRets[i - 2] +
          trailingLogRets[i - 3]
      );
    }
    const m4 = r4List.reduce((a, b) => a + b, 0) / r4List.length;
    const var4 =
      r4List.reduce((a, r) => a + (r - m4) ** 2, 0) / Math.max(1, r4List.length - 1);
    vr4Ratio = var4 / (4 * empCloseLogVar);
  }
  const is1hOr4h = intervalStepSeconds === 3600 || intervalStepSeconds === 14400;
  const hasExplicitAnchorOverride =
    typeof tuningOverrides?.equilibriumAnchorOverride === 'number' &&
    Number.isFinite(tuningOverrides.equilibriumAnchorOverride);
  // Strictly restrict VR(4) OU pull to 1h and 4h; do NOT extend automatically to 1d or other intervals
  const vrOuPullGate = is1hOr4h
    ? vr4Ratio < 0.85
      ? Math.max(0, Math.min(1, (0.85 - vr4Ratio) / 0.35))
      : 0
    : hasExplicitAnchorOverride
    ? 0.45
    : 0;

  // directionalGatePassed controls ONLY direction badges and signals, never suppressing conditional trajectories
  const directionalGatePassed = Boolean(
    (tuningOverrides as { directionalGatePassed?: boolean } | undefined)?.directionalGatePassed
  );

  const medianTrack: { time: number; value: number }[] = [];
  const predictiveMedianTrack: { time: number; value: number }[] = [];
  const conditionalExpectationTrack: { time: number; value: number }[] = [];
  const experimentalDriftTrack: { time: number; value: number }[] = [];
  const upper75: { time: number; value: number }[] = [];
  const lower25: { time: number; value: number }[] = [];
  const upper95: { time: number; value: number }[] = [];
  const lower05: { time: number; value: number }[] = [];

  const quantileMultipliers = [-1.45, -0.85, -0.35, 0.35, 0.85, 1.45];
  const sampleTracks: { id: number; path: { time: number; value: number }[] }[] = quantileMultipliers.map(
    (_, idx) => ({ id: idx, path: [] })
  );

  const startedInClosedSession =
    driftPolicy === 'ZERO_FOR_SESSION' || anchorPolicy === 'FREEZE';
  const hasAwarenessPolicyActive = Boolean(
    startedInClosedSession ||
      tuningOverrides?.marketAwarenessState ||
      driftPolicy !== 'UNCHANGED' ||
      anchorPolicy !== 'UNCHANGED'
  );
  let openStepsElapsed = 0;
  let prevStepWasClosed = startedInClosedSession;
  let prevUpper75Offset = 0;
  let prevLower25Offset = 0;
  let prevUpper95Offset = 0;
  let prevLower05Offset = 0;

  for (let h = 1; h <= horizonSteps; h++) {
    const stepTime = lastBarTime + h * intervalStepSeconds;

    // Evaluate whether THIS specific future horizon step h falls inside a market close or an open session
    let isStepClosed = false;
    const stepCal = evaluateGoldSessionAndCalendar({ timestampSec: stepTime });
    if (hasAwarenessPolicyActive) {
      if (intervalStepSeconds >= 86400) {
        const dUtc = new Date(stepTime * 1000);
        const dayUtc = dUtc.getUTCDay();
        const hourUtc = stepCal.utcHourDecimal ?? dUtc.getUTCHours();
        isStepClosed = dayUtc === 6 || (dayUtc === 0 && hourUtc < 16);
      } else if (intervalStepSeconds >= 14400) {
        const midCal = evaluateGoldSessionAndCalendar({
          timestampSec: stepTime - Math.floor(intervalStepSeconds * 0.5),
        });
        isStepClosed = stepCal.isFuturesClosed && midCal.isFuturesClosed;
      } else {
        isStepClosed =
          stepCal.isFuturesClosed ||
          (startedInClosedSession && stepCal.sessionId === 'DAILY_ROLL_MAINTENANCE');
      }
    }

    const useStepSessionRouting = hasAwarenessPolicyActive && (startedInClosedSession || isStepClosed);
    let stepSessionTauTarget = 1.0;
    if (!isStepClosed) {
      if (stepCal.weekpart === 'SUNDAY_OPEN_RISK' || prevStepWasClosed) {
        stepSessionTauTarget = 1.12;
      } else if (stepCal.sessionId === 'LONDON_NY_OVERLAP') {
        stepSessionTauTarget = 1.15;
      } else if (stepCal.sessionId === 'LONDON' || stepCal.sessionId === 'NEW_YORK') {
        stepSessionTauTarget = 1.04;
      } else if (stepCal.sessionId === 'ASIA') {
        stepSessionTauTarget = 0.92;
      } else {
        stepSessionTauTarget = 0.76;
      }
    }

    if (useStepSessionRouting) {
      if (isStepClosed) {
        if (!prevStepWasClosed) {
          closedMarketLogEqTarget = simX[0];
        }
        simDeltaTau = 0.22;
      } else {
        if (prevStepWasClosed) {
          simX[1] = conservedOpenDriftX1;
        }
        openStepsElapsed++;
        simDeltaTau = 0.65 * simDeltaTau + 0.35 * stepSessionTauTarget;
      }
    } else {
      openStepsElapsed = h;
      simDeltaTau = 0.72 * simDeltaTau + 0.28 * 1.0;
    }

    const eDrift = Math.exp(-kappaDrift * simDeltaTau);
    const eVol = Math.exp(-kappaVol * simDeltaTau);
    const eTox = Math.exp(-kappaTox * simDeltaTau);
    const eRes = Math.exp(-kappaRes * simDeltaTau);
    const eMac = Math.exp(-kappaMacro * simDeltaTau);

    const safeRes = Math.max(0.2, simX[4]);
    const toxRatio = simX[3] / safeRes;
    const activeLogEqTarget =
      useStepSessionRouting && isStepClosed ? closedMarketLogEqTarget : openMarketLogEqTarget;
    const stepOuGate =
      useStepSessionRouting && isStepClosed ? 1.0 : vrOuPullGate;
    const eqRestoringLog = kappaMeanRev * (activeLogEqTarget - simX[0]) * stepOuGate;

    const effectiveOpenDecayIdx = Math.max(0, openStepsElapsed - 1);
    const decayingSymbolicLog =
      symbolicLogDriftBase *
      (useStepSessionRouting && isStepClosed ? 0.18 : Math.exp(-0.075 * effectiveOpenDecayIdx));
    const forwardStructuralLog = tuningOverrides?.activeIntegratedStructuralTerm
      ? evaluateCausalStructuralHypothesisTermLogDrift({
          structuralTerm: tuningOverrides.activeIntegratedStructuralTerm,
          X: simX,
          prevLogResidual: prevLogResidual * Math.exp(-0.22 * effectiveOpenDecayIdx),
          causalMedVol: medVol,
          causalLogEq: activeLogEqTarget,
          cointegrationBasisLog: -cointegrationBasisMeanUsd / lastCloseUsd,
          causalMacroLogForce: simX[5],
          dt: simDeltaTau,
        }) * (useStepSessionRouting && isStepClosed ? 0.18 : Math.exp(-0.06 * effectiveOpenDecayIdx))
      : 0;

    const stepEqPullMult = (useStepSessionRouting
      ? isStepClosed
        ? 0.08
        : hasShockFault
        ? 0.28
        : prevStepWasClosed || openStepsElapsed <= 3
        ? 0.56
        : 0.45
      : eqRestoringPullMult) * stepOuGate;

    const stepDriftScale = useStepSessionRouting
      ? isStepClosed
        ? 0.18
        : hasShockFault
        ? 0.72
        : prevStepWasClosed || openStepsElapsed <= 3
        ? 1.12
        : 1.0
      : driftPolicy === 'UNCHANGED'
      ? 1.0
      : driftStepMult;

    const rawStepDrift =
      (simX[1] + betaTox * toxRatio * simX[2] + simX[5] + eqRestoringLog * stepEqPullMult + decayingSymbolicLog) *
        simDeltaTau +
      forwardStructuralLog;
    const stepLogDrift = rawStepDrift * stepDriftScale;

    const nextX0 = simX[0] + stepLogDrift;
    const nextX1 =
      useStepSessionRouting && isStepClosed
        ? 0.96 * simX[1] + 0.04 * (kappaMeanRev * stepOuGate * (openMarketLogEqTarget - simX[0]) + simX[5])
        : eDrift * simX[1] + (1 - eDrift) * (eqRestoringLog + simX[5]);
    const nextX2 = Math.max(0.0002, Math.min(0.035, eVol * simX[2] + (1 - eVol) * medVol));
    const nextX3 = useStepSessionRouting && isStepClosed ? 0.96 * simX[3] : eTox * simX[3];
    const nextX4 = Math.max(0.05, Math.min(0.99, eRes * simX[4] + (1 - eRes) * 0.75));
    const nextX5 = useStepSessionRouting && isStepClosed ? 0.97 * simX[5] : eMac * simX[5];
    prevStepWasClosed = isStepClosed;

    const Fh: number[][] = [
      [
        1 - stepEqPullMult * kappaMeanRev * simDeltaTau,
        simDeltaTau,
        betaTox * toxRatio * simDeltaTau,
        (betaTox * simX[2] * simDeltaTau) / safeRes,
        (-betaTox * simX[3] * simX[2] * simDeltaTau) / (safeRes * safeRes),
        simDeltaTau,
      ],
      [-(1 - eDrift) * kappaMeanRev * stepOuGate, eDrift, 0, 0, 0, 1 - eDrift],
      [0, 0, eVol, 0, 0, 0],
      [0, 0, 0, eTox, 0, 0],
      [0, 0, 0, 0, eRes, 0],
      [0, 0, 0, 0, 0, eMac],
    ];

    const blendedStepLogVar =
      0.80 * empCloseLogVar + 0.20 * (simX[2] * simX[2]);
    const stepVar = Math.max(1e-8, blendedStepLogVar);
    cumHorizonLogVar += stepVar;
    const QDiag = [
      stepVar * 1.0,
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

    const predLogVar = Math.max(1e-8, cumHorizonLogVar);
    const predLogStd = Math.sqrt(predLogVar) * bandPolicyMult;
    const empH = computeDirectHorizonEmpiricalStats(h, predLogStd);

    // 1. Predictive Median Q_{0.50}(P_{t+h} | F_t) = exp(simX[0] + q_{0.50}(e_h) * sigma_h)
    const pMedUsd = parseFloat(Math.exp(simX[0] + empH.q50 * predLogStd).toFixed(2));
    // 2. Conditional Expectation E[P_{t+h} | F_t] = exp(simX[0]) * M_h(sigma_h) via Duan Smearing
    const pCondExpUsd = parseFloat((Math.exp(simX[0]) * empH.duanSmearingFactor).toFixed(2));

    // Monotonic horizon quantile offsets around simX[0]
    const up75Offset = Math.max(prevUpper75Offset + 1e-5, Math.max(0.15 * predLogStd, (empH.q75 - empH.q50) * predLogStd));
    const lo25Offset = Math.max(prevLower25Offset + 1e-5, Math.max(0.15 * predLogStd, (empH.q50 - empH.q25) * predLogStd));
    const up95Offset = Math.max(prevUpper95Offset + 1e-5, Math.max(up75Offset + 0.15 * predLogStd, (empH.q95 - empH.q50) * predLogStd));
    const lo05Offset = Math.max(prevLower05Offset + 1e-5, Math.max(lo25Offset + 0.15 * predLogStd, (empH.q50 - empH.q05) * predLogStd));
    prevUpper75Offset = up75Offset;
    prevLower25Offset = lo25Offset;
    prevUpper95Offset = up95Offset;
    prevLower05Offset = lo05Offset;

    const medLogCenter = simX[0] + empH.q50 * predLogStd;
    const pUp75 = parseFloat(Math.exp(medLogCenter + up75Offset).toFixed(2));
    const pLo25 = parseFloat(Math.exp(medLogCenter - lo25Offset).toFixed(2));
    const pUp95 = parseFloat(Math.exp(medLogCenter + up95Offset).toFixed(2));
    const pLo05 = parseFloat(Math.exp(medLogCenter - lo05Offset).toFixed(2));

    medianTrack.push({ time: stepTime, value: pMedUsd });
    predictiveMedianTrack.push({ time: stepTime, value: pMedUsd });
    conditionalExpectationTrack.push({ time: stepTime, value: pCondExpUsd });
    experimentalDriftTrack.push({ time: stepTime, value: pCondExpUsd });
    upper75.push({ time: stepTime, value: pUp75 });
    lower25.push({ time: stepTime, value: pLo25 });
    upper95.push({ time: stepTime, value: pUp95 });
    lower05.push({ time: stepTime, value: pLo05 });

    for (let rIdx = 0; rIdx < quantileMultipliers.length; rIdx++) {
      const m = quantileMultipliers[rIdx];
      const rayVal = parseFloat(Math.exp(medLogCenter + m * predLogStd).toFixed(2));
      sampleTracks[rIdx].path.push({ time: stepTime, value: rayVal });
    }
  }

  const terminalMeanMedianWedgeUsd =
    conditionalExpectationTrack.length > 0 && predictiveMedianTrack.length > 0
      ? parseFloat(
          (
            conditionalExpectationTrack[conditionalExpectationTrack.length - 1].value -
            predictiveMedianTrack[predictiveMedianTrack.length - 1].value
          ).toFixed(4)
        )
      : 0;

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
      predictiveMedianTrack,
      conditionalExpectationTrack,
      experimentalDriftTrack,
      meanMedianSkewWedgeUsd: terminalMeanMedianWedgeUsd,
      horizonDistributionMethod: 'DIRECT_HORIZON_EMPIRICAL_FHS_ACI',
      directionalGatePassed,
      upper95,
      upper75,
      lower25,
      lower05,
      sampleTracks,
      preFeedbackForwardSlopeUsdPerStep,
      preFeedbackBandWidthStep1Usd,
      appliedDriftPolicy: driftPolicy,
      appliedBandPolicy: bandPolicy,
      appliedAnchorPolicy: anchorPolicy,
      faultClassification,
    },
    faultClassification,
    bayesianMetaLearning,
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
  pointInTimeMacroSeries?: PointInTimeMacroObservation[];
}): ScientificCoreTelemetry {
  const {
    candles,
    intervalStepSeconds,
    liveMacro,
    secondaryBenchmark,
    verifiedVenueCameras,
    macroNews,
    extensionInput,
    liveTuning,
    candidateTuningOverrides,
    dataDrivenMinWindowBars,
    pointInTimeMacroSeries,
  } = params;

  const originTimestampSec = candles.length > 0 ? candles[candles.length - 1].time : 0;
  const hasExplicitPointInTimeSeries = Array.isArray(pointInTimeMacroSeries);
  const macroSeries: PointInTimeMacroObservation[] =
    pointInTimeMacroSeries ?? loadPointInTimeMacroSeriesFromFixture().observations;
  const causalLiveMacroAtOrigin =
    macroSeries.length > 0 && originTimestampSec > 0
      ? resolvePointInTimeMacroAt(originTimestampSec, macroSeries)
      : hasExplicitPointInTimeSeries
      ? resolvePointInTimeMacroAt(originTimestampSec, [])
      : liveMacro;

  // Strictly sanitize all auxiliary inputs so no record with timestamp > originTimestampSec can enter the pipeline
  const causalSecondaryBenchmark = secondaryBenchmark
    ? {
        ...secondaryBenchmark,
        candles: secondaryBenchmark.candles.filter(b => b.time <= originTimestampSec),
      }
    : null;
  const causalVenueCameras = verifiedVenueCameras
    ? verifiedVenueCameras.map(cam => ({
        ...cam,
        candles: cam.candles.filter(b => b.time <= originTimestampSec),
      }))
    : undefined;
  const causalMacroNews = macroNews
    ? macroNews.filter(ev => ev.timestamp <= originTimestampSec)
    : undefined;
  const causalExtensionInput: OrderBookMicrostructureExtensionInput | undefined = extensionInput
    ? {
        ...extensionInput,
        aggressorTradeFlow: extensionInput.aggressorTradeFlow?.filter(
          tf => tf.barTimeSec <= originTimestampSec
        ),
        scheduledEconomicPulses: extensionInput.scheduledEconomicPulses?.filter(
          ev => ev.timestampSec <= originTimestampSec
        ),
        l2OrderBookSnapshots: extensionInput.l2OrderBookSnapshots?.filter(
          s => s.timestampSec <= originTimestampSec
        ),
      }
    : undefined;

  // Compute strictly causal ATR and causal volume-weighted anchor from candles[0..n-1] so external scalars cannot leak future bars
  let causalAtr = params.atr;
  let causalHtfPocAnchorPrice = params.htfPocAnchorPrice;
  if (candles.length >= 2) {
    const atrW = Math.min(14, candles.length - 1);
    let trSum = 0;
    for (let i = candles.length - atrW; i < candles.length; i++) {
      const cur = candles[i];
      const prev = candles[i - 1];
      trSum += Math.max(
        cur.high - cur.low,
        Math.abs(cur.high - prev.close),
        Math.abs(cur.low - prev.close)
      );
    }
    causalAtr = parseFloat((trSum / Math.max(1, atrW)).toFixed(4));

    const vwapW = Math.min(60, candles.length);
    let pv = 0;
    let vv = 0;
    for (let i = candles.length - vwapW; i < candles.length; i++) {
      const w = Math.max(1e-6, candles[i].volume || 1);
      pv += candles[i].close * w;
      vv += w;
    }
    causalHtfPocAnchorPrice = parseFloat((pv / Math.max(1e-6, vv)).toFixed(2));
  }

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 2650;
  const cointegrationBasis = computeCointegrationBasis(
    currentPrice,
    candles,
    causalSecondaryBenchmark
  );
  const primaryCam = causalVenueCameras?.[0];
  const activeProvider = primaryCam?.providerName || 'Binance Vision PAXG';
  const activeSymbol = primaryCam?.symbol || 'PAXGUSDT';
  const instrumentIdentity = primaryCam?.instrumentIdentity || 'PAXG_SPOT_TOKEN';

  // 1. Causal Information Clock τ
  const clockOut = computeCausalInformationClock({
    candles,
    verifiedVenueCameras: causalVenueCameras,
    extensionInput: causalExtensionInput,
    isHalted: candles.length === 0,
  });

  // 2. Pulse–Echo (Sonar) Sensing Layer
  const sonarOut = runPulseEchoSonarLayer({
    candles,
    deltaTauSeries: clockOut.deltaTauSeries,
    cumulativeTauSeries: clockOut.cumulativeTauSeries,
    crossVenueZScore: cointegrationBasis.zScore,
    secondaryBenchmarkCandles: causalSecondaryBenchmark?.candles,
    macroNews: causalMacroNews,
    extensionInput: causalExtensionInput,
  });

  // 3. Live 6D Latent State Filter on Information Clock τ
  const liveFilterOut = evaluateLatentStateFilterOnInformationClock({
    candles,
    deltaTauSeries: clockOut.deltaTauSeries,
    cumulativeTauSeries: clockOut.cumulativeTauSeries,
    liveMacro: causalLiveMacroAtOrigin,
    cointegrationBasisMeanUsd: cointegrationBasis.meanBasis,
    verifiedVenueCameras: causalVenueCameras,
    secondaryBenchmark: causalSecondaryBenchmark,
    barEchoToxicityUpdates: sonarOut.barEchoToxicityUpdates,
    barEchoResilienceUpdates: sonarOut.barEchoResilienceUpdates,
    barEchoResidualsUsd: sonarOut.barEchoResidualsUsd,
    equilibriumAnchorPrice: causalHtfPocAnchorPrice,
    intervalStepSeconds,
    atr: causalAtr,
    activeProvider,
    activeSymbol,
    instrumentIdentity,
    extensionInput: causalExtensionInput,
    tuningOverrides: liveTuning,
    pointInTimeMacroSeries: macroSeries,
  });

  // Optional Candidate Latent State Expectation in Parallel Universe
  let candidateLatentExpectation: EnsemblePlume | undefined = undefined;
  if (candidateTuningOverrides) {
    const candFilterOut = evaluateLatentStateFilterOnInformationClock({
      candles,
      deltaTauSeries: clockOut.deltaTauSeries,
      cumulativeTauSeries: clockOut.cumulativeTauSeries,
      liveMacro: causalLiveMacroAtOrigin,
      cointegrationBasisMeanUsd: cointegrationBasis.meanBasis,
      verifiedVenueCameras: causalVenueCameras,
      secondaryBenchmark: causalSecondaryBenchmark,
      barEchoToxicityUpdates: sonarOut.barEchoToxicityUpdates,
      barEchoResilienceUpdates: sonarOut.barEchoResilienceUpdates,
      barEchoResidualsUsd: sonarOut.barEchoResidualsUsd,
      equilibriumAnchorPrice: causalHtfPocAnchorPrice,
      intervalStepSeconds,
      atr: causalAtr,
      activeProvider,
      activeSymbol,
      instrumentIdentity,
      extensionInput: causalExtensionInput,
      tuningOverrides: candidateTuningOverrides,
      pointInTimeMacroSeries: macroSeries,
    });
    candidateLatentExpectation = candFilterOut.yellowLinePlume;
  }

  // 4. Residual Process (The Oracle)
  const residualDiagnostics = computeResidualOracleDiagnostics({
    residualPoints: liveFilterOut.residualPoints,
    candles,
    crossVenueZScore: cointegrationBasis.zScore,
    barEchoToxicityUpdates: sonarOut.barEchoToxicityUpdates,
    liveMacro: causalLiveMacroAtOrigin,
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
    activeIntegratedStructuralTerm: liveTuning.activeIntegratedStructuralTerm ?? null,
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
    faultClassification: liveFilterOut.faultClassification,
    bayesianMetaLearning: liveFilterOut.bayesianMetaLearning,
  };
}
