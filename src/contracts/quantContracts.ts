import type {
  VerifiedCandle,
  ProviderTier,
  TerminalSystemState,
  ProviderAttemptDiagnostic,
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
    | 'COLD_START_STATE_RESTORED';
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

export interface ParallelUniverseTelemetry {
  enabled: boolean;
  autoPromotionEnabled: boolean;
  snapshotId: string;
  instrumentIdentity: string;
  persistenceHealth: ArchitecturePersistenceHealth;
  mtfDiscoveryContext: MultiTimeframeDiscoveryContext;
  liveArchitecture: ArchitectureState;
  candidateArchitecture: ArchitectureState;
  candidateEnsemble: EnsemblePlume;
  findings: AwarenessFinding[];
  verificationReport: TestAndVerifyReport;
  auditTrail: ArchitectureAuditLogEntry[];
  promotionOccurredThisCycle: boolean;
  lastPromotionBannerEn: string | null;
  lastPromotionBannerFa: string | null;
}



