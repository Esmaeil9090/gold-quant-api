import type {
  VerifiedCandle,
  ProviderTier,
  TerminalSystemState,
  ProviderAttemptDiagnostic,
  VerifiedVenueCameraObservation,
  VerifiedMarketWaterfallResult,
  VerifiedMacroYieldResult,
  VerifiedMacroNewsItem,
  VerifiedMacroNewsFeedResult,
} from '../services/realDataWaterfall.js';
import type { EmpiricalCalibrationBundle, CalibratedParameterMeta } from '../config/parameterRegistry.js';
import type {
  EstimatorClassification,
  ModelSpecificationEntry,
} from '../config/modelSpecRegistry.js';
import {
  MODEL_SPEC_REGISTRY,
  getModelSpecById,
  getModelSpecList,
} from '../config/modelSpecRegistry.js';

export type {
  VerifiedCandle,
  ProviderTier,
  TerminalSystemState,
  ProviderAttemptDiagnostic,
  VerifiedVenueCameraObservation,
  VerifiedMarketWaterfallResult,
  VerifiedMacroYieldResult,
  VerifiedMacroNewsItem,
  VerifiedMacroNewsFeedResult,
  EmpiricalCalibrationBundle,
  CalibratedParameterMeta,
  EstimatorClassification,
  ModelSpecificationEntry,
};

export { MODEL_SPEC_REGISTRY, getModelSpecById, getModelSpecList };

export type Candle = VerifiedCandle;

export interface VectorPoint {
  price: number;
  timeOffset: number;
  vx: number;
  vy: number;
  intensity: number;
  streamDirection: 'upward' | 'downward' | 'eddy';
}

export interface IsobarLevel {
  price: number;
  type: 'high_pressure_resistance' | 'low_pressure_trough' | 'equilibrium_axis';
  strength: number;
  label: string;
}

export interface DirectionalPressureGauge {
  zScore: number;
  percentileRank: number;
  percentileLabel: string;
  standardError: number;
  ciLowerZ: number;
  ciUpperZ: number;
  sampleSize: number;
  p05Threshold: number;
  p50Median: number;
  p95Threshold: number;
  summaryEn: string;
  summaryFa: string;
}

export type InnovationConsistencyState =
  | 'WITHIN_2SIGMA'
  | 'TAIL_SHOCK'
  | 'FILTER_DIVERGENCE'
  | 'HALTED_FREEZE';

export interface FilterInnovationConsistency {
  state: InnovationConsistencyState;
  currentNis: number;
  meanNis25: number;
  mahalanobisSigma: number;
  chiSquare95Threshold: number;
  labelEn: string;
  labelFa: string;
}

export type EmpiricalCalibrationStatus =
  | 'CALIBRATING_INSUFFICIENT_SAMPLE'
  | 'EMPIRICALLY_CALIBRATED'
  | 'HALTED_FREEZE';

export interface EmpiricalCalibrationScore {
  status: EmpiricalCalibrationStatus;
  sampleSize: number;
  minRequiredSample: number;
  brierScore: number | null;
  directionalHits: number | null;
  standardError: number | null;
  labelEn: string;
  labelFa: string;
}

export interface ConvergencePoint {
  time: string;
  timestamp: number;
  unmeasuredBias: number;
  shrunkBias: number;
  stateVelocity: number;
  innovation: number;
  studentizedInnovation: number;
  nis: number;
  consistencyState: InnovationConsistencyState;
  isJumpGated: boolean;
  deltaTau?: number;
  kalmanGain?: number;
}

export interface VolumeClockTelemetry {
  intrinsicDeltaTau: number;
  cumulativeTau: number;
  wallClockSteps: number;
  dilationRatio: number;
  processNoiseScale: number;
  kalmanGainDynamic: number;
  heartbeatCeilingActive: boolean;
  clockRegime:
    | 'FAST_INFORMATIONAL_BURST'
    | 'SYNCHRONIZED_EQUILIBRIUM'
    | 'HEARTBEAT_CEILING_GUARD'
    | 'HALTED_FREEZE';
}

export interface SweepDiscriminatorTelemetry {
  logOddsScore: number;
  logOddsZScore: number;
  percentileRank: number;
  percentileLabel: string;
  standardError: number;
  ciLowerZ: number;
  ciUpperZ: number;
  sampleSize: number;
  classification: 'DEALER_STOP_SWEEP' | 'TRUE_STRUCTURAL_BREAKOUT' | 'LAMINAR_AUCTION' | 'HALTED_FREEZE';
  absorptionRatio: number;
  hawkesIntensity: number;
  macroDivergenceScore: number;
  tacticalAction: string;
  tacticalActionFa: string;
}

export interface MorseManifoldTelemetry {
  wellDepthDe: number;
  stiffnessAlpha: number;
  equilibriumAnchor: number;
  currentPotentialEnergy: number;
  restoringForce: number;
  gammaWalls: {
    price: number;
    polarity: 'CALL_GAMMA_WALL' | 'PUT_GAMMA_CANYON' | 'LIQUIDITY_STOP_POOL';
    amplitude: number;
    widthSigma: number;
  }[];
}

export interface VpinBaseResult {
  vpinScore: number;
  regime: 'HIGH_INFORMED_TOXICITY' | 'BALANCED_LAMINAR' | 'LOW_VOLUME_NOISE';
  shrinkageRatio: number;
  relativeVolumeRatio: number;
}

export interface VpinTelemetry {
  vpinScore: number;
  regime: 'HIGH_INFORMED_TOXICITY' | 'BALANCED_LAMINAR' | 'LOW_VOLUME_NOISE' | 'HALTED_FREEZE';
  shrinkageRatio: number;
  shrunkBias: number;
  rawBias: number;
  isJumpGated: boolean;
  jumpMagnitude: number;
  gateStatus: 'JUMP_GATED_FREEZE' | 'LAMINAR_CONTINUOUS' | 'HALTED_FREEZE';
  studentizedInnovation: number;
  relativeVolumeRatio: number;
}

export interface CointegrationBasis {
  paxgPrice: number;
  comexBenchmarkSpot: number;
  benchmarkSource: string;
  basisSpread: number;
  meanBasis: number;
  stdBasis: number;
  zScore: number;
  purgedPrice: number;
  basisStatus:
    | 'PARITY_EQUILIBRIUM'
    | 'CRYPTO_TOKEN_PREMIUM'
    | 'CRYPTO_TOKEN_DISCOUNT'
    | 'DISLOCATION_ARBITRAGE'
    | 'SINGLE_VENUE_UNANCHORED';
}

export interface PcaMacroFactors {
  rawTheories: {
    id: string;
    name: string;
    value: number;
    unit: string;
    description: string;
  }[];
  f1RealGeopotential: number;
  f2MonetaryLiquidity: number;
  f3TailConvexity: number;
  f1Weight: number;
  f2Weight: number;
  f3Weight: number;
  netOrthogonalLift: number;
  collinearityConditionNumber: number;
  orthogonalityQuality: string;
}

export interface MultiTimeframeRegime {
  timeframe: string;
  label: string;
  horizon: string;
  state: string;
  stateKey: 'laminar' | 'squall' | 'cyclonic' | 'calm';
  reynoldsNumber: number;
  turbulencePct: number;
  velocityDrift: number;
  bias: number;
  directionalPressure: DirectionalPressureGauge;
  actionBias: string;
  actionColor: string;
}

export interface FeedIntegrityMetric {
  id: string;
  name: string;
  nameFa: string;
  source: string;
  status: 'OPTIMAL' | 'DEGRADED' | 'FAULT';
  quorumBadge: string;
  latencyMs: number;
  details: string;
  detailsFa: string;
}

export interface DataReliabilityTelemetry {
  snapshotId?: string;
  snapshotTimestampIso?: string;
  integrityState: 'QUORUM_VERIFIED' | 'PARTIAL_QUORUM' | 'SINGLE_SOURCE_DEGRADED' | 'HALTED_DEGRADED' | 'FIXTURE_REPLAY';
  gradeLabel: string;
  gradeLabelFa: string;
  gradeColor: string;
  activeProvidersCount: number;
  totalProvidersCount: number;
  quorumRatio: number;
  quorumBadge: string;
  spotQuorumActive: number;
  spotQuorumTotal: number;
  independentSpotVenuesActive?: number;
  independentSpotVenuesTotal?: number;
  sameInstrumentPaxgVenuesActive?: number;
  sameInstrumentPaxgVenuesTotal?: number;
  crossVenueDispersionBps: number | null;
  stalenessSec: number;
  timeframeStepSec: number;
  stalenessRatio: number;
  stalenessStatus: 'FRESH' | 'AGING' | 'STALE' | 'HALTED';
  sequenceCompletenessRatio: number;
  contiguousBarsCount: number;
  expectedBarsCount: number;
  missingBarsCount: number;
  totalFeeds: number;
  healthyFeeds: number;
  lastCheckTimestamp: number;
  systemState: TerminalSystemState;
  activeTier: ProviderTier | 'NONE_HALTED';
  activeProvider: string;
  feeds: FeedIntegrityMetric[];
}

export interface ObserverTelemetryPayload {
  biasEstimate: number;
  shrunkBias: number;
  driftVelocity: number;
  innovationConsistency: FilterInnovationConsistency;
  empiricalCalibration: EmpiricalCalibrationScore;
  innovationError: number;
  studentizedInnovation: number;
  isJumpGated: boolean;
  jumpMagnitude: number;
  gateStatus: 'JUMP_GATED_FREEZE' | 'LAMINAR_CONTINUOUS' | 'HALTED_FREEZE';
  intrinsicDeltaTau: number;
  cumulativeTau: number;
  kalmanGainDynamic: number;
  clockRegime:
    | 'FAST_INFORMATIONAL_BURST'
    | 'SYNCHRONIZED_EQUILIBRIUM'
    | 'HEARTBEAT_CEILING_GUARD'
    | 'HALTED_FREEZE';
  isFrozenByCircuitBreaker: boolean;
  history: ConvergencePoint[];
}

export type ValidationHorizonBars = 1 | 5 | 15 | 60;

export interface WalkForwardHorizonMetrics {
  horizonBars: ValidationHorizonBars;
  horizonLabelEn: string;
  horizonLabelFa: string;
  sampleSizeN: number;
  status: 'CALIBRATED_ACTIVE' | 'PROVISIONAL_LOW_SAMPLE' | 'INSUFFICIENT_WARMUP';
  spearmanRankIc: number | null;
  rankIcRollingStd: number | null;
  icIr: number | null;
  rankIcTStat: number | null;
  directionalHitRate: number | null;
  payoffAsymmetryRatio: number | null;
  meanWinReturnBps: number | null;
  meanLossReturnBps: number | null;
  sweepPrecision: number | null;
  sweepRecall: number | null;
  sweepF1Score: number | null;
  sweepBrierScore: number | null;
}

export type VolatilityRegimeKey = 'HIGH_VOL_GARCH' | 'LOW_VOL_GARCH';
export type MacroRegimeKey = 'EXPANDING_MACRO_PRESSURE' | 'CONTRACTING_MACRO_PRESSURE';

export interface RegimeConditionalValidationMetrics {
  regimeKey: VolatilityRegimeKey | MacroRegimeKey;
  regimeLabelEn: string;
  regimeLabelFa: string;
  sampleSizeN: number;
  spearmanRankIcH5: number | null;
  icIrH5: number | null;
  directionalHitRateH5: number | null;
  payoffAsymmetryH5: number | null;
  sweepF1ScoreH5: number | null;
  sweepBrierScoreH5: number | null;
}

export interface WalkForwardValidationScorecard {
  schemaVersion: string;
  timeframe: string;
  causalityEnforced: true;
  zeroLookaheadVerified: true;
  effectiveSampleSizeN: number;
  persistedSnapshotsCount: number;
  lastUpdatedIso: string;
  currentVolatilityRegime: VolatilityRegimeKey;
  currentVolatilityRegimeLabelEn: string;
  currentVolatilityRegimeLabelFa: string;
  currentMacroRegime: MacroRegimeKey;
  currentMacroRegimeLabelEn: string;
  currentMacroRegimeLabelFa: string;
  horizons: WalkForwardHorizonMetrics[];
  volatilityRegimePartitions: {
    HIGH_VOL_GARCH: RegimeConditionalValidationMetrics;
    LOW_VOL_GARCH: RegimeConditionalValidationMetrics;
  };
  macroRegimePartitions: {
    EXPANDING_MACRO_PRESSURE: RegimeConditionalValidationMetrics;
    CONTRACTING_MACRO_PRESSURE: RegimeConditionalValidationMetrics;
  };
  summaryBadgeEn: string;
  summaryBadgeFa: string;
}

export type LiquidityTimeframeTier =
  | 'MONTHLY'
  | 'WEEKLY'
  | 'DAILY'
  | '4H'
  | '1H'
  | 'INTRADAY_15M_5M';

export interface VolumeProfilePoolNode {
  timeframe: LiquidityTimeframeTier;
  labelEn: string;
  labelFa: string;
  hierarchyWeight: number;
  barsSampled: number;
  pocPrice: number;
  vahPrice: number;
  valPrice: number;
  hvnPrices: number[];
  lvnPrices: number[];
  pocVolumeShare: number;
  distToPocAtr: number;
  poolPullForceUsd: number;
}

export type LiquidityInteractionState =
  | 'HTF_HVN_MAGNET_GRAVITY'
  | 'LVN_VACUUM_ACCELERATION'
  | 'VALUE_AREA_ABSORPTION_REVERSAL'
  | 'INITIATION_BREAKOUT_ACCEPTANCE'
  | 'BALANCED_POC_ROTATION'
  | 'HALTED_FREEZE';

export type AbsorptionInitiationClass =
  | 'RESTING_LIQUIDITY_ABSORPTION'
  | 'DIRECTIONAL_INITIATION_EXPANSION'
  | 'NEUTRAL_ROTATION'
  | 'HALTED_FREEZE';

export interface ProportionalFusionWeights {
  ouMeanReversionWeight: number;
  kalmanDriftWeight: number;
  macroFactorWeight: number;
  sweepMicrostructureWeight: number;
  mtfLiquidityWeight: number;
}

export interface IntegratedLiquidityEngineTelemetry {
  hierarchyOrder: LiquidityTimeframeTier[];
  topDownPools: VolumeProfilePoolNode[];
  compositeHtfPocAnchor: number;
  nearestUpperHvn: number;
  nearestLowerHvn: number;
  interactionState: LiquidityInteractionState;
  interactionLabelEn: string;
  interactionLabelFa: string;
  absorptionInitiationClass: AbsorptionInitiationClass;
  absorptionInitiationLabelEn: string;
  absorptionInitiationLabelFa: string;
  absorptionScoreZ: number;
  initiationMomentumZ: number;
  liquidityPullDriftUsd: number;
  fusionWeights: ProportionalFusionWeights;
  fusedNetDriftUsd: number;
  fusedEquilibriumAnchor: number;
  epistemicClass: EstimatorClassification;
}

export type AwarenessFindingCategory =
  | 'MODEL_CONTRADICTION'
  | 'REGIME_BLINDSPOT'
  | 'RESIDUAL_AUTOCORRELATION'
  | 'TAIL_EXCURSION_WEAKNESS'
  | 'BASIS_DRIFT_MISMATCH';

export interface AwarenessFinding {
  id: string;
  timestampIso: string;
  category: AwarenessFindingCategory;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  affectedModelId: string;
  regimeContext: string;
  summaryEn: string;
  summaryFa: string;
  empiricalEvidence: string;
  recommendedAction: 'INVENT_SYMBOLIC_TERM' | 'DISABLE_CONTRADICTORY_MODEL' | 'REWEIGHT_PRECISION' | 'RETUNE_DAMPING';
}

export type SymbolicPrimitiveId =
  | 'OU_MEAN_REVERSION'
  | 'EKF_STATE_DRIFT'
  | 'ORTHOGONAL_MACRO_LIFT'
  | 'SWEEP_LOG_ODDS_IMPULSE'
  | 'MTF_LIQUIDITY_PULL'
  | 'VOL_REGIME_NONLINEAR_INTERACTION'
  | 'BASIS_VELOCITY_COUPLING'
  | 'VOLUME_CLOCK_HAWKMOTH_RESTORING'
  | 'REAL_YIELD_CONVEXITY_ASYMMETRY'
  | 'LAGGED_RESIDUAL_SELF_CORRECTION'
  | 'BASIS_ACCELERATION_SECOND_ORDER'
  | 'MTF_DRIFT_CONFLUENCE_SYNERGY'
  | 'ASYMMETRIC_TAIL_VOL_SHOCK_SHIELD';

export interface DynamicModelSlot {
  modelId: SymbolicPrimitiveId;
  nameEn: string;
  nameFa: string;
  origin: 'CORE_BASELINE' | 'LEVEL_B_SYMBOLIC_DISCOVERY';
  equationAscii: string;
  isEnabled: boolean;
  disabledReasonEn?: string | null;
  /** Dynamically estimated weight from inverse OOS error variance (never a hardcoded constant) */
  dynamicWeight: number;
  /** Rolling OOS error variance (USD^2) used to derive dynamic precision weight */
  rollingErrorVariance: number;
  /** Rolling OOS Spearman Rank-IC over realized bars */
  rollingRankIc: number;
  /** Fitted symbolic coefficient from rolling ridge regression on real innovations */
  fittedCoefficient: number;
  /** Current per-step drift contribution in USD */
  currentStepContributionUsd: number;
  /** Causal out-of-sample residual R^2 or variance-reduction ratio */
  oosRSquared?: number;
  /** Split-half coefficient stability ratio in [0, 1] */
  stabilityRatio?: number;
  /** Number of real OOS bars used in the ridge fit */
  sampleCountN?: number;
  /** Timeframe scope of the feature inputs (e.g., 'ACTIVE_TF', 'CROSS_TF_HTF_LTF') */
  timeframeScope?: 'ACTIVE_TF' | 'CROSS_TF_HTF_LTF';
}

export interface ArchitectureState {
  architectureId: string;
  versionTag: string;
  role: 'LIVE_YELLOW_LINE' | 'PARALLEL_CANDIDATE_LINE';
  createdAtIso: string;
  promotedAtIso?: string | null;
  promotionMode?: 'INITIAL_BASELINE' | 'MANUAL_MMI' | 'AUTOMATIC_VERIFIED';
  lineColorHex: string;
  activeModelsCount: number;
  disabledModelsCount: number;
  discoveredModelsCount: number;
  models: DynamicModelSlot[];
  dynamicFusionWeights: ProportionalFusionWeights;
  compositeNetDriftUsdPerStep: number;
  compositeEquilibriumAnchor: number;
}

export type VerificationGateId =
  | 'GATE_1_DATA_DRIVEN_OOS_WINDOW'
  | 'GATE_2_STATISTICAL_SIGNIFICANCE_GAIN'
  | 'GATE_3_TAIL_RISK_NON_DETERIORATION'
  | 'GATE_4_MULTI_REGIME_STABILITY'
  | 'GATE_5_PROVENANCE_AND_INSTRUMENT_IDENTITY'
  | 'GATE_6_SAFETY_INVARIANTS_INTACT'
  | 'GATE_7_POST_DISCOVERY_CONFIRMATION'
  | 'GATE_8_IMMUTABLE_AUDIT_TRAIL';

export interface TestAndVerifyGateResult {
  gateId: VerificationGateId;
  titleEn: string;
  titleFa: string;
  passed: boolean;
  metricSummary: string;
  thresholdSpec: string;
  detailsEn: string;
  detailsFa: string;
}

export type CandidateVerificationStatus =
  | 'VERIFIED_FOR_PROMOTION'
  | 'OBSERVING_CONFIRMATION_WINDOW'
  | 'FAILED_VERIFICATION_GATE'
  | 'HALTED_FROZEN';

export interface TestAndVerifyReport {
  evaluatedAtIso: string;
  timeframe: string;
  overallStatus: CandidateVerificationStatus;
  passedGatesCount: number;
  totalGatesCount: number;
  /** Data-driven minimum window derived from empirical autocorrelation half-life */
  dataDrivenMinWindowBars: number;
  realizedOosBarsEvaluated: number;
  postDiscoveryConfirmationBars: number;
  requiredConfirmationBars: number;
  liveRmseUsd: number;
  candidateRmseUsd: number;
  liveRankIc: number;
  candidateRankIc: number;
  dieboldMarianoTStat: number;
  liveTailP95ErrorUsd: number;
  candidateTailP95ErrorUsd: number;
  liveMaxExcursionErrorUsd: number;
  candidateMaxExcursionErrorUsd: number;
  regimesObservedCount: number;
  regimesPassedCount: number;
  gates: TestAndVerifyGateResult[];
}

export interface ArchitectureAuditLogEntry {
  auditId: string;
  timestampIso: string;
  eventType:
    | 'LEVEL_B_MODEL_INVENTED'
    | 'FAULTY_MODEL_DISABLED'
    | 'DYNAMIC_PRECISION_REWEIGHT'
    | 'PROMOTED_MANUAL_MMI'
    | 'PROMOTED_AUTOMATIC_VERIFIED'
    | 'AUTO_PROMOTE_REJECTED_GATE_UNVERIFIED'
    | 'COLD_START_STATE_RESTORED'
    | 'LATENT_MATH_WRITEBACK_APPLIED'
    | 'RESIDUAL_ORACLE_COMPONENT_PRUNED';
  actor: 'INTELLIGENCE_AWARENESS_CORE' | 'OPERATOR_MMI' | 'CLOSED_LOOP_VERIFIER';
  sourceArchitectureId: string;
  targetArchitectureId: string;
  summaryEn: string;
  summaryFa: string;
  verifiableMetrics: string;
}

export interface ArchitecturePersistenceHealth {
  schemaVersion: number;
  statusLabel: 'PERSISTENT' | 'EPHEMERAL';
  storageMode: 'DURABLE_MOUNTED_VOLUME' | 'LOCAL_DISK_PERSISTENT' | 'EPHEMERAL_CONTAINER_FILESYSTEM';
  resolvedSource:
    | 'GDF_PERSISTENT_DATA_DIR'
    | 'RENDER_DISK_MOUNT_PATH'
    | 'DEFAULT_SYSTEM_DATA_DIR'
    | 'PROJECT_DATA_DIR';
  priorityOrder: string[];
  isDurableAcrossRedeploys: boolean;
  storeFilePath: string;
  lastPersistedAtIso: string;
  coldStartRestored: boolean;
  restoredGeneration: number;
  restoredAuditEntriesCount: number;
  restoredLiveVersionTag: string;
  restoredCandidateVersionTag: string;
  restoredAutoPromotionEnabled: boolean;
  humanReadableStatusEn: string;
  humanReadableStatusFa: string;
  warningEn: string | null;
  warningFa: string | null;
  remediationInstructionsEn: string | null;
  remediationInstructionsFa: string | null;
}

export interface MultiTimeframeSlotDiagnostic {
  timeframe: string;
  available: boolean;
  barsCount: number;
  source:
    | 'VERIFIED_WATERFALL_CACHE'
    | 'ACTIVE_SNAPSHOT'
    | 'HTF_DAILY_ANCHOR'
    | 'CAUSAL_STRUCTURAL_AGGREGATION'
    | 'UNAVAILABLE';
  provider: string;
}

export interface MultiTimeframeDiscoveryContext {
  activeTimeframe: string;
  requiredTimeframes: string[];
  participatingTimeframes: string[];
  verifiedRealCacheTimeframes: string[];
  missingTimeframes: string[];
  bootstrapStatus: 'COMPLETE_ALL_TIMEFRAMES' | 'PARTIAL_AVAILABLE' | 'BOOTSTRAPPING_IN_PROGRESS';
  timeframeDetails: MultiTimeframeSlotDiagnostic[];
  htfNormalizedDriftZ: number;
  ltfNormalizedDriftZ: number;
  htfPocAnchorPrice: number;
  htfVolatilityRatio: number;
  mtfConfluenceAlignment: number;
  summaryEn: string;
  summaryFa: string;
}

export interface EnsemblePlume {
  medianTrack: { time: number; value: number }[];
  upper95: { time: number; value: number }[];
  upper75: { time: number; value: number }[];
  lower25: { time: number; value: number }[];
  lower05: { time: number; value: number }[];
  sampleTracks?: { id: number; path: { time: number; value: number }[] }[];
}

/**
 * GDF Scientific Core Upgrade — 6-Dimensional Latent State Vector X(τ)
 */
export interface LatentStateVector6D {
  /** x1: Latent log price level ln(P_τ) */
  logPriceLevel: number;
  /** x2: Instantaneous drift rate per unit information clock Δτ */
  localDrift: number;
  /** x3: Instantaneous log-return volatility per sqrt(Δτ) */
  localVolatility: number;
  /** x4: Order-flow pressure & informed toxicity in [-1, +1] */
  pressureToxicity: number;
  /** x5: Order-book replenishment & depth resilience rate in [0.05, 0.99] on information clock τ */
  liquidityResilience: number;
  /** x6: Exogenous + endogenous macro residual force per unit Δτ */
  macroResidualForce: number;
}

export interface InformationClockState {
  currentDeltaTau: number;
  cumulativeTau: number;
  wallClockBarIndex: number;
  clockRegime: 'QUIET_CONSOLIDATION' | 'NORMAL_FLOW' | 'ACTIVE_INFORMATION_BURST' | 'HALTED_FREEZE';
  volumeIntensityRatio: number;
  rangeActivityRatio: number;
  crossVenueActivityRatio: number;
  volumeWeight: number;
  rangeWeight: number;
  crossVenueWeight: number;
  empiricalWeights: {
    volumeWeight: number;
    rangeWeight: number;
    crossVenueWeight: number;
  };
  tauMinEmpirical: number;
  tauMaxEmpirical: number;
}

export interface VenueObservationEquationRecord {
  cameraId: string;
  venueName: string;
  providerName: string;
  symbol: string;
  instrumentIdentity: string;
  observationChannel:
    | 'SPOT_TOKEN_PRICE'
    | 'FUTURES_BASIS_COINTEGRATED'
    | 'PARK_RANGE_VOLATILITY'
    | 'MACRO_YIELD_FX'
    | 'PULSE_ECHO_SONAR';
  equationAscii: string;
  observedPriceUsd: number;
  latentImpliedPriceUsd: number;
  estimatedBasisUsd: number;
  microstructureNoiseVarUsd2: number;
  kalmanObservationWeight: number;
  innovationResidualUsd: number;
  provenanceVerified: true;
}

export type PulseType =
  | 'VOLUME_ACTIVITY_BURST'
  | 'LIQUIDITY_STOP_SWEEP'
  | 'AGGRESSIVE_DIRECTIONAL_INITIATION'
  | 'CROSS_VENUE_BASIS_DISLOCATION'
  | 'MACRO_YIELD_OR_NEWS_IMPULSE';

export interface DetectedPulseEvent {
  pulseId: string;
  barTime: number;
  tauAtPulse: number;
  deltaTauAtPulse: number;
  pulseType: PulseType;
  direction: number; // +1 UP, -1 DOWN, 0 NEUTRAL
  directionLabel: 'UP' | 'DOWN' | 'NEUTRAL';
  impulseMagnitudeSigma: number;
  adaptiveThresholdSigma: number;
  volumeAtPulse: number;
  priceAtPulse: number;
  summaryEn: string;
  summaryFa: string;
}

export interface MeasuredPulseEcho {
  pulseId: string;
  pulseType: PulseType;
  barTime: number;
  elapsedDeltaTau: number;
  priceImpactPerUnitVolume: number;
  recoverySpeedPerTau: number;
  upDownAsymmetryRatio: number;
  crossVenuePropagationBps: number;
  deltaTauAcceleration: number;
  predictedEchoImpactUsd: number;
  realizedEchoImpactUsd: number;
  echoPredictionResidualUsd: number;
  resilienceStateUpdateDelta: number;
  toxicityStateUpdateDelta: number;
}

/**
 * Clean, typed extension interface ready for L2/L3 order-book, trade-level aggressor volume,
 * scheduled economic-calendar pulses, and higher-frequency real-yield / DXY observations.
 */
export interface OrderBookMicrostructureExtensionInput {
  l2OrderBookSnapshots?: {
    venue: string;
    timestampSec: number;
    bidDepthTop5Usd: number;
    askDepthTop5Usd: number;
    spreadBps: number;
    orderBookImbalance: number;
  }[];
  aggressorTradeFlow?: {
    barTimeSec: number;
    buyerInitiatedVolume: number;
    sellerInitiatedVolume: number;
    tradeCount: number;
  }[];
  scheduledEconomicPulses?: {
    eventId: string;
    timestampSec: number;
    title: string;
    surpriseZScore?: number;
  }[];
  highFreqMacroYieldTicks?: {
    timestampSec: number;
    tipsRealYield10Y: number;
    dxyIndex: number;
  }[];
  aggressorBuyVolume?: number[];
  aggressorSellVolume?: number[];
  tradeCountPerBar?: number[];
  topOfBookSpreadBps?: number[];
  bidDepthTop5Usd?: number[];
  askDepthTop5Usd?: number[];
}

export interface PulseEchoSonarTelemetry {
  totalPulsesDetected: number;
  measuredEchoCount: number;
  adaptivePulseThresholdSigma: number;
  meanPriceImpactPerUnitVol: number;
  meanEchoRecoverySpeedPerTau: number;
  upDownEchoAsymmetryRatio: number;
  crossVenueBasisPropagationSpeed: number;
  echoFeedbackToToxicity: number;
  echoFeedbackToResilience: number;
  latestPulse: DetectedPulseEvent | null;
  latestEcho: MeasuredPulseEcho | null;
  recentPulses: DetectedPulseEvent[];
  recentEchoes: MeasuredPulseEcho[];
  sonarSummaryEn: string;
  sonarSummaryFa: string;
  extensionInterfacesReady: {
    aggressorVolumeAndTradeCount: boolean;
    topOfBookSpreadAndDepthProxy: boolean;
    scheduledEconomicCalendarPulses: boolean;
    highFrequencyRealYieldDxy: boolean;
  };
}

export interface ResidualOraclePoint {
  barTime: number;
  tau: number;
  realizedPrice: number;
  predictedYellowPrice: number;
  priceResidualUsd: number;
  standardizedResidualSigma: number;
  echoResidualUsd: number;
  deltaTau: number;
  regime: string;
}

export interface ResidualStructureDiagnostics {
  sampleSize: number;
  sampleSizeN: number;
  meanResidualUsd: number;
  rmseUsd: number;
  lag1Autocorrelation: number;
  lag2Autocorrelation: number;
  ljungBoxQ5Stat: number;
  ljungBoxPValueApprox: number;
  isWhiteNoiseCompatible: boolean;
  isStatisticallyStructured: boolean;
  highLowVolVarianceRatio: number;
  highVolRmseUsd: number;
  lowVolRmseUsd: number;
  corrWithCrossVenueBasis: number;
  corrWithEchoToxicity: number;
  corrWithMacroForce: number;
  corrWithInfoClockDeltaTau: number;
  dominantBlindspotChannel:
    | 'NONE_WHITE_NOISE'
    | 'SERIAL_PERSISTENCE_AUTOCORR'
    | 'CROSS_VENUE_BASIS_LEAKAGE'
    | 'PULSE_ECHO_TOXICITY_LAG'
    | 'MACRO_REAL_YIELD_DRIFT'
    | 'VOL_REGIME_HETEROSKEDASTICITY';
  summaryEn: string;
  summaryFa: string;
}

export interface ResidualOracleTelemetry {
  immutableLogCount: number;
  latestRealizedResidualUsd: number;
  latestStandardizedResidualSigma: number;
  latestEchoResidualUsd: number;
  diagnostics: ResidualStructureDiagnostics;
  recentResiduals: ResidualOraclePoint[];
}

export type StructuralEquationFormId =
  | 'AR1_RESIDUAL_ERROR_CORRECTION'
  | 'REGIME_GATED_TOXICITY_DAMPING'
  | 'NONLINEAR_BASIS_THRESHOLD_ATTRACTOR'
  | 'ASYMMETRIC_VOL_DRIFT_BRAKE'
  | 'MACRO_YIELD_CONVEX_RESPONSE'
  | 'PARAMETER_REFINEMENT_ONLY';

export interface ActiveIntegratedStructuralTerm {
  hypothesisId: string;
  caseId: string;
  structuralFormId: StructuralEquationFormId;
  structuralDistinctionType:
    | 'STRUCTURAL_FUNCTIONAL_FORM'
    | 'REGIME_SWITCHING_MECHANISM'
    | 'NONLINEAR_INTERACTION'
    | 'PARAMETER_VARIATION_ONLY';
  equationAscii: string;
  fittedTheta: number;
  secondaryParamAlpha: number;
  targetLatentDimension: 'x1_logPriceLevel' | 'x2_localDrift' | 'x3_localVolatility' | 'x4_pressureToxicity';
  authorizationMode: 'SCIENTIFICALLY_VERIFIED_PROMOTION' | 'MANUAL_MMI_UNVALIDATED_OVERRIDE';
  integratedAtIso: string;
}

export interface LatentModelMathWriteBackState {
  writeBackGeneration: number;
  lastWriteBackIso: string | null;
  sourceCandidateArchId: string | null;
  driftPersistencePhi: number;
  meanReversionKappa: number;
  echoToxicityCouplingBeta: number;
  echoResilienceCouplingGamma: number;
  macroResidualCouplingEta: number;
  crossVenueObservationPrecisionMult: number;
  activeSymbolicTermsWrittenBack: string[];
  prunedFaultyComponents: string[];
  activeIntegratedStructuralTerm?: ActiveIntegratedStructuralTerm | null;
}

export interface BaselineModelComparisonItem {
  baselineId: string;
  baselineNameEn: string;
  baselineNameFa: string;
  oosRmseUsd: number;
  directionalHitRate: number;
  brierScore: number;
  relativeRmseRatio: number;
  latentModelOutperforms: boolean;
}

export interface RegimeConditionedOosEntry {
  regimeId: string;
  regimeLabelEn: string;
  regimeLabelFa: string;
  sampleSizeN: number;
  directionalHitRate: number;
  hitRateCi95Lower: number;
  hitRateCi95Upper: number;
  oosRmseUsd: number;
  brierScore: number;
  oosRankIc: number;
}

export interface PermanentOosScientificScoreboard {
  calibrationStatus: 'CALIBRATING' | 'CALIBRATED_OOS_ACTIVE' | 'HALTED_FREEZE';
  isCalibrating: boolean;
  realizedOosBarsCount: number;
  requiredMinOosBars: number;
  calibrationNoticeEn: string;
  calibrationNoticeFa: string;
  directionalHitRate: number;
  directionalHitRateCi95Lower: number;
  directionalHitRateCi95Upper: number;
  directionalBrierScore: number;
  oosRmseUsd: number;
  oosSpearmanRankIc: number;
  pulseEchoRmseUsd: number | null;
  residualLag1Autocorr: number;
  residualLjungBoxQ5: number;
  residualWhiteNoisePassed: boolean;
  baselineComparisons: BaselineModelComparisonItem[];
  regimeConditionedPerformance: RegimeConditionedOosEntry[];
  honestLimitationsNoteEn: string;
  honestLimitationsNoteFa: string;
}

export interface ScientificCoreTelemetry {
  schemaVersion: string;
  instrumentIdentity: string;
  latentState: LatentStateVector6D;
  impliedLatentPriceUsd: number;
  impliedDriftUsdPerTau: number;
  impliedVolPctPerSqrtTau: number;
  latentCovarianceDiagonal: LatentStateVector6D;
  latentCovarianceMatrix6x6: number[][];
  informationClock: InformationClockState;
  clockHistory: { barTime: number; deltaTau: number; cumulativeTau: number; latentPriceUsd: number }[];
  venueObservations: VenueObservationEquationRecord[];
  activeCamerasCount: number;
  paxgComexBasisChannel: {
    active: boolean;
    paxgSpotUsd: number;
    comexBenchmarkUsd: number;
    basisSpreadUsd: number;
    basisZScore: number;
    observationEquationAscii: string;
  };
  pulseEchoSonar: PulseEchoSonarTelemetry;
  yellowLineConditionalExpectation: EnsemblePlume;
  candidateLatentExpectation?: EnsemblePlume;
  residualOracle: ResidualOracleTelemetry;
  latentMathWriteBack: LatentModelMathWriteBackState;
  scientificScoreboard: PermanentOosScientificScoreboard;
}

export type ScientificCycleMachineState =
  | 'IDLE'
  | 'OBSERVING'
  | 'DIAGNOSING'
  | 'HYPOTHESIZING'
  | 'TESTING'
  | 'CHALLENGING'
  | 'DECIDING'
  | 'INTEGRATING'
  | 'MONITORING'
  | 'BLOCKED'
  | 'FAILED'
  | 'REJECTED'
  | 'AWAITING_EVIDENCE'
  | 'AWAITING_AUTHORIZATION'
  | 'COMPLETED_WITHOUT_PROMOTION';

export type ScientificEpistemicBadge =
  | 'OBSERVED'
  | 'ESTIMATED'
  | 'INFERRED'
  | 'HYPOTHESIZED'
  | 'VALIDATED'
  | 'APPROVED_FOR_INTEGRATION'
  | 'INTEGRATED'
  | 'REJECTED'
  | 'NOT_TESTED';

export interface AlignedForecastRealizedRecord {
  originBarIndex: number;
  originBarTimeSec: number;
  targetBarIndex: number;
  targetBarTimeSec: number;
  horizonBars: number;
  yellowPredictedUsd: number;
  yellowStdUsd: number;
  candidatePredictedUsd: number;
  randomWalkPredictedUsd: number;
  emaBaselinePredictedUsd: number;
  realizedCloseUsd: number;
  yellowResidualUsd: number;
  yellowStdResidualSigma: number;
  clockRegime: string;
}

export interface ScientificObservationRecord {
  observationId: string;
  caseId: string;
  observedAtIso: string;
  epistemicBadge: 'OBSERVED' | 'NOT_TESTED';
  dataProvenance: {
    provider: string;
    symbol: string;
    instrumentIdentity: string;
    timeframe: string;
    intervalStepSeconds: number;
    barCount: number;
    firstBarTimeSec: number;
    lastBarTimeSec: number;
    freshnessAgeSec: number;
    isStale: boolean;
    systemState: TerminalSystemState;
    isSyntheticTestFixture: boolean;
    provenanceHashSha256: string;
  };
  epistemicLayerBreakdown: {
    observedMarketData: {
      epistemicTag: 'OBSERVED' | 'SYNTHETIC_FIXTURE';
      latestCloseUsd: number;
      latestVolume: number;
      latestHighLowSpanUsd: number;
      macroRealYield10Y: number;
      dxyIndex: number;
      crossVenueBasisSpreadUsd: number;
      activeVenueCamerasCount: number;
    };
    estimatedLatentState6D: {
      epistemicTag: 'ESTIMATED';
      x1_logPriceLevel: number;
      x2_localDrift: number;
      x3_localVolatility: number;
      x4_pressureToxicity: number;
      x5_liquidityResilience: number;
      x6_macroResidualForce: number;
      impliedPriceUsd: number;
    };
    derivedMicrostructureFeatures: {
      epistemicTag: 'INFERRED';
      vpinToxicity: number;
      basisZScore: number;
      garchCondVol: number;
      currentDeltaTau: number;
      clockRegime: string;
      htfPocAnchorUsd: number;
    };
    alignedForecastVsRealizedPairs: AlignedForecastRealizedRecord[];
  };
  noLookaheadAlignmentVerified: boolean;
  stagePassed: boolean;
  blockingReasonEn: string | null;
  blockingReasonFa: string | null;
}

export type ScientificAnomalyCategory =
  | 'PERSISTENT_FORECAST_BIAS'
  | 'RESIDUAL_SERIAL_AUTOCORRELATION'
  | 'CONDITIONAL_REGIME_HETEROSKEDASTICITY'
  | 'INTERVAL_COVERAGE_MISCALIBRATION'
  | 'CROSS_VENUE_BASIS_LEAKAGE'
  | 'PULSE_ECHO_TOXICITY_LAG'
  | 'REDUNDANT_OR_CONTRADICTORY_COMPONENT'
  | 'SIMPLE_BASELINE_OUTPERFORMANCE';

export interface ScientificAnomalyDiagnostic {
  anomalyId: string;
  anomalyCategory: ScientificAnomalyCategory;
  epistemicBadge: 'INFERRED';
  detectionRuleSpec: string;
  observedStatistic: number;
  thresholdValue: number;
  pValueOrZScore: number;
  sampleSizeN: number;
  timeWindowStartSec: number;
  timeWindowEndSec: number;
  affectedTimeframe: string;
  affectedRegime: string;
  affectedModelComponentIds: string[];
  affectedEquationsAscii: string[];
  attributionConfidence: 'HIGH' | 'MODERATE' | 'AMBIGUOUS';
  competingExplanations: string[];
  dataQualityFailureRuledOut: boolean;
  summaryEn: string;
  summaryFa: string;
}

export interface ScientificDiagnosisReport {
  diagnosisId: string;
  caseId: string;
  observationId: string;
  diagnosedAtIso: string;
  diagnosisOutcome: 'WEAKNESS_IDENTIFIED' | 'INSUFFICIENT_EVIDENCE_WHITE_NOISE' | 'DATA_QUALITY_DEGRADED';
  anomalies: ScientificAnomalyDiagnostic[];
  primaryAnomaly: ScientificAnomalyDiagnostic | null;
  residualSummary: {
    sampleSizeN: number;
    meanBiasUsd: number;
    biasTStat: number;
    rmseUsd: number;
    lag1Autocorr: number;
    ljungBoxQ5: number;
    interval90CoverageRate: number;
    nominalCoverageTarget: number;
    highLowVolRmseRatio: number;
    randomWalkRmseUsd: number;
    emaBaselineRmseUsd: number;
    yellowBeatsRandomWalk: boolean;
  };
  componentAblationSummary: {
    redundantComponentIds: string[];
    destabilizingComponentIds: string[];
  };
  summaryEn: string;
  summaryFa: string;
}

export interface ScientificHypothesisRecord {
  hypothesisId: string;
  caseId: string;
  diagnosisId: string;
  targetAnomalyId: string | null;
  inventedAtIso: string;
  inventionOutcome: 'HYPOTHESIS_CONSTRUCTED' | 'NO_DEFENSIBLE_HYPOTHESIS_GENERATED';
  noHypothesisReasonEn: string | null;
  noHypothesisReasonFa: string | null;
  originClassification: 'CONSTRAINED_GRAMMAR_STRUCTURAL_SYNTHESIS' | 'PARAMETER_REESTIMATION_VARIANT' | 'NONE';
  structuralDistinctionType:
    | 'STRUCTURAL_FUNCTIONAL_FORM'
    | 'REGIME_SWITCHING_MECHANISM'
    | 'NONLINEAR_INTERACTION'
    | 'PARAMETER_VARIATION_ONLY';
  structuralFormId: StructuralEquationFormId;
  ancestry: {
    parentHypothesisId: string | null;
    parentArchitectureId: string;
    generationNumber: number;
    ancestryChain: string[];
    mutationDescription: string;
  };
  titleEn: string;
  titleFa: string;
  mathematicalFormAscii: string;
  stateTransitionDiffAscii: string;
  targetLatentStateDimension: 'x1_logPriceLevel' | 'x2_localDrift' | 'x3_localVolatility' | 'x4_pressureToxicity';
  variableDefinitions: {
    symbol: string;
    meaningEn: string;
    units: string;
    domainBounds: string;
    causalSource: string;
  }[];
  fittedParameters: {
    name: string;
    symbol: string;
    value: number;
    allowedMin: number;
    allowedMax: number;
    units: string;
    estimationMethod: string;
  }[];
  assumptionsEn: string[];
  assumptionsFa: string[];
  identifiabilityCheck: {
    isIdentifiable: boolean;
    conditionNumber: number;
    minSampleSizeRequired: number;
    actualFitSampleSize: number;
    jacobianRankFull: boolean;
    detailsEn: string;
  };
  expectedDirectionOfEffectEn: string;
  falsifiablePredictions: {
    predictionId: string;
    statementEn: string;
    metricName: string;
    requiredDirection: 'DECREASE' | 'INCREASE' | 'BOUNDED_WITHIN';
    targetThreshold: number;
  }[];
  disconfirmationFailureConditionsEn: string[];
  epistemicBadge: 'HYPOTHESIZED' | 'REJECTED' | 'VALIDATED' | 'INTEGRATED';
  rejectionReasonEn?: string | null;
}

export type ScientificTechnicalCheckId =
  | 'DIMENSIONAL_AND_UNIT_CONSISTENCY'
  | 'DOMAIN_AND_RANGE_VALIDITY'
  | 'PARAMETER_BOUND_AND_FINITENESS'
  | 'NUMERICAL_STABILITY_EXTREME_INPUTS'
  | 'COVARIANCE_PSD_AND_VARIANCE_POSITIVITY'
  | 'CAUSAL_ORDERING_AND_NO_LOOKAHEAD'
  | 'NO_TARGET_LEAKAGE_IN_FEATURES'
  | 'MISSING_AND_DEGENERATE_DATA_RESILIENCE'
  | 'DETERMINISTIC_REPRODUCIBILITY'
  | 'INDEPENDENT_REFERENCE_CALCULATION_MATCH';

export interface ScientificTechnicalTestReport {
  testReportId: string;
  caseId: string;
  hypothesisId: string;
  testedAtIso: string;
  allTechnicalChecksPassed: boolean;
  epistemicBadge: 'VALIDATED' | 'REJECTED';
  checks: {
    checkId: ScientificTechnicalCheckId;
    titleEn: string;
    titleFa: string;
    passed: boolean;
    measuredValue: string;
    requiredSpec: string;
    detailsEn: string;
  }[];
  independentReferenceAudit: {
    maxAbsDiscrepancyUsd: number;
    toleranceUsd: number;
    referenceFormulaVerified: boolean;
  };
  failureReasonsEn: string[];
  failureReasonsFa: string[];
}

export interface ScientificChallengerScoreboardRow {
  challengerId:
    | 'CANDIDATE_HYPOTHESIS_MODEL'
    | 'INCUMBENT_YELLOW_LINE_MODEL'
    | 'RANDOM_WALK_PERSISTENCE'
    | 'EMA_SIMPLE_BASELINE'
    | 'PRIOR_CANDIDATE_MODEL'
    | 'ABLATED_INCUMBENT_MODEL';
  labelEn: string;
  labelFa: string;
  oosRmseUsd: number;
  oosMaeUsd: number;
  oosMeanBiasUsd: number;
  directionalHitRate: number;
  spearmanRankIc: number;
  brierScore: number;
  interval90Coverage: number;
  tailP95ErrorUsd: number;
  maxErrorExcursionUsd: number;
  residualLag1Autocorr: number;
  parameterCountK: number;
  bicScore: number;
  candidateBeatsChallenger: boolean;
}

export interface ScientificChallengeComparisonReport {
  challengeId: string;
  caseId: string;
  hypothesisId: string;
  challengedAtIso: string;
  matchedSampleSpec: {
    totalBars: number;
    calibrationWindow: [number, number];
    weightingWindow: [number, number];
    oosEvaluationWindow: [number, number];
    oosSampleCountN: number;
    forecastHorizonsEvaluated: number[];
    identicalTimestampsVerified: boolean;
    chronologicalNoOverlapVerified: boolean;
  };
  multipleTestingAccount: {
    cumulativeCandidatesSearched: number;
    effectiveIndependentTrials: number;
    bonferroniAlpha: number;
    rawCriticalTStat: number;
    deflatedCriticalTStat: number;
    searchPenaltyApplied: boolean;
  };
  inSampleMetrics: {
    candidateFitRmseUsd: number;
    incumbentFitRmseUsd: number;
    overfitRatioOosToIs: number;
  };
  challengerScoreboard: ScientificChallengerScoreboardRow[];
  horizonBreakdown: {
    horizonBars: number;
    incumbentRmseUsd: number;
    candidateRmseUsd: number;
    randomWalkRmseUsd: number;
    relativeImprovementPct: number;
  }[];
  regimeBreakdown: {
    regimeId: string;
    sampleSizeN: number;
    incumbentRmseUsd: number;
    candidateRmseUsd: number;
    candidateImprovesOrHolds: boolean;
  }[];
  statisticalComparison: {
    dieboldMarianoTStatVsIncumbent: number;
    dieboldMarianoTStatVsRandomWalk: number;
    deflatedThresholdPassed: boolean;
    targetAnomalyMetricBefore: number;
    targetAnomalyMetricAfter: number;
    targetAnomalyReduced: boolean;
    competingExplanationVerdictEn: string;
  };
  challengePassed: boolean;
  summaryEn: string;
  summaryFa: string;
}

export type ScientificDecisionVerdict =
  | 'REJECT'
  | 'REVISE_HYPOTHESIS'
  | 'COLLECT_MORE_EVIDENCE'
  | 'RETAIN_UNVALIDATED_CANDIDATE'
  | 'RECOMMEND_REPLICATION'
  | 'ELIGIBLE_FOR_PROMOTION';

export interface ScientificDecisionRecord {
  decisionId: string;
  caseId: string;
  hypothesisId: string;
  challengeId: string | null;
  decidedAtIso: string;
  verdict: ScientificDecisionVerdict;
  epistemicBadge: ScientificEpistemicBadge;
  eightGateStatus: CandidateVerificationStatus;
  passedGatesCount: number;
  totalGatesCount: number;
  isScientificallyVerifiedForPromotion: boolean;
  requiresHumanAuthorizationForWriteBack: boolean;
  decisionCriteriaApplied: {
    criterionName: string;
    passed: boolean;
    observedValue: string;
    requiredThreshold: string;
  }[];
  rationaleEn: string;
  rationaleFa: string;
}

export interface ScientificIntegrationRecord {
  integrationId: string;
  caseId: string;
  hypothesisId: string;
  decisionId: string;
  integratedAtIso: string;
  integrationExecuted: boolean;
  integrationMode:
    | 'SCIENTIFICALLY_VERIFIED_PROMOTION'
    | 'MANUAL_MMI_UNVALIDATED_OVERRIDE'
    | 'BLOCKED_UNVERIFIED';
  epistemicBadge: ScientificEpistemicBadge;
  previousWriteBackGeneration: number;
  newWriteBackGeneration: number;
  previousLiveArchitectureId: string;
  newLiveArchitectureId: string;
  equationDiffAscii: {
    beforeEquation: string;
    afterEquation: string;
    addedStructuralTermAscii: string | null;
  };
  parameterDiffs: {
    paramKey: string;
    beforeValue: number;
    afterValue: number;
    deltaValue: number;
  }[];
  activePathExecutionVerification: {
    verifiedOnActiveForecastPath: boolean;
    yellowForecastTerminalBeforeUsd: number;
    yellowForecastTerminalAfterUsd: number;
    attributableShiftUsd: number;
    structuralTermContributionUsd: number;
    covarianceRemainPsd: boolean;
    explanationEn: string;
  };
  rollbackSnapshotRef: {
    rollbackGeneration: number;
    canRollbackImmediately: boolean;
  };
  summaryEn: string;
  summaryFa: string;
}

export interface PostIntegrationMonitoringRecord {
  monitorId: string;
  caseId: string;
  integrationId: string;
  hypothesisId: string;
  evaluatedAtIso: string;
  monitoringStatus:
    | 'HEALTHY_WITHIN_THRESHOLDS'
    | 'SINGLE_BAR_NOISE_TOLERATED'
    | 'DEGRADATION_WARNING'
    | 'ROLLBACK_TRIGGERED'
    | 'NO_ACTIVE_INTEGRATION';
  postIntegrationBarsObserved: number;
  minBarsBeforeRollbackTrigger: number;
  preRegisteredThresholds: {
    maxRmseRatioVsIncumbentBaseline: number;
    maxAbsStandardizedBiasZ: number;
    minInterval90Coverage: number;
    maxResidualLag1Autocorr: number;
    minConsecutiveDegradedBarsForRollback: number;
  };
  observedMetrics: {
    rollingPostIntegrationRmseUsd: number;
    incumbentReferenceRmseUsd: number;
    rmseRatioVsReference: number;
    rollingMeanBiasUsd: number;
    standardizedBiasZ: number;
    interval90Coverage: number;
    residualLag1Autocorr: number;
    consecutiveDegradedBars: number;
    latestBarResidualSigma: number;
  };
  rollbackTriggered: boolean;
  rollbackExecutionSummary: {
    rolledBackToGeneration: number | null;
    reasonEn: string;
    reasonFa: string;
  } | null;
  summaryEn: string;
  summaryFa: string;
}

export interface ScientificDiscoveryCaseRecord {
  caseId: string;
  cycleNumber: number;
  createdAtIso: string;
  updatedAtIso: string;
  timeframe: string;
  currentState: ScientificCycleMachineState;
  epistemicBadge: ScientificEpistemicBadge;
  stateTransitionHistory: {
    fromState: ScientificCycleMachineState;
    toState: ScientificCycleMachineState;
    timestampIso: string;
    reasonEn: string;
  }[];
  observeRecord: ScientificObservationRecord | null;
  diagnoseReport: ScientificDiagnosisReport | null;
  inventRecord: ScientificHypothesisRecord | null;
  testReport: ScientificTechnicalTestReport | null;
  challengeReport: ScientificChallengeComparisonReport | null;
  decisionRecord: ScientificDecisionRecord | null;
  integrationRecord: ScientificIntegrationRecord | null;
  monitorRecord: PostIntegrationMonitoringRecord | null;
  deterministicReplaySeedHash: string;
}

export interface ScientificDiscoveryCycleTelemetry {
  schemaVersion: string;
  machineState: ScientificCycleMachineState;
  isCycleLocked: boolean;
  totalCyclesExecuted: number;
  cumulativeCandidateSearchCount: number;
  activeCase: ScientificDiscoveryCaseRecord | null;
  recentCases: ScientificDiscoveryCaseRecord[];
  hypothesisGraveyard: ScientificHypothesisRecord[];
  activeMonitoringState: PostIntegrationMonitoringRecord | null;
}

export interface ParallelUniverseTelemetry {
  enabled: boolean;
  autoPromotionEnabled: boolean;
  ReadyForPromotion?: boolean;
  snapshotId: string;
  instrumentIdentity: string;
  persistenceHealth: ArchitecturePersistenceHealth;
  mtfDiscoveryContext: MultiTimeframeDiscoveryContext;
  liveArchitecture: ArchitectureState;
  candidateArchitecture: ArchitectureState;
  liveEnsemble?: EnsemblePlume;
  candidateEnsemble: EnsemblePlume;
  findings: AwarenessFinding[];
  verificationReport: TestAndVerifyReport;
  auditTrail: ArchitectureAuditLogEntry[];
  promotionOccurredThisCycle: boolean;
  lastPromotionBannerEn: string | null;
  lastPromotionBannerFa: string | null;
  scientificCore?: ScientificCoreTelemetry;
  latentMathWriteBack?: LatentModelMathWriteBackState;
  strictOosSplitAudit?: {
    isStrictlyDisjointOos: boolean;
    causalFeatureEvaluation: boolean;
    fitEndIdx: number;
    weightEndIdx: number;
    totalSteps: number;
  };
  scientificComponentCritiques?: any[];
  compositionalDiscoveryLab?: any;
  candidateStructuralCouplingAudit?: {
    coupledSymbolicModelsCount: number;
    coupledModelIds: string[];
  };
  canRollbackWriteBack?: boolean;
  writeBackVersionHistory?: LatentModelMathWriteBackState[];
  scientificDiscoveryCycle?: ScientificDiscoveryCycleTelemetry;
}


