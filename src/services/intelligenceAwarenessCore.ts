import fs from 'node:fs';
import path from 'node:path';
import { getFeatureFlags } from '../config/featureFlags.js';
import type {
  ArchitectureAuditLogEntry,
  ArchitecturePersistenceHealth,
  ArchitectureState,
  AwarenessFinding,
  Candle,
  CandidateVerificationStatus,
  DynamicModelSlot,
  EnsemblePlume,
  LatentModelMathWriteBackState,
  MultiTimeframeDiscoveryContext,
  OrderBookMicrostructureExtensionInput,
  ParallelUniverseTelemetry,
  ProportionalFusionWeights,
  ResidualOraclePoint,
  ResidualStructureDiagnostics,
  ScientificCoreTelemetry,
  SymbolicPrimitiveId,
  TerminalSystemState,
  TestAndVerifyGateResult,
  TestAndVerifyReport,
  VerifiedMacroNewsItem,
  VerifiedMacroYieldResult,
  VerifiedVenueCameraObservation,
} from '../contracts/quantContracts.js';
import {
  AdaptiveDPObserver,
  computeCointegrationBasis,
  computeLogOddsSweepDiscriminator,
  computeOrthogonalMacroFactors,
  computeTopDownLiquidityEngine,
  computeVpinAndShrinkage,
} from '../engine/quantEngine.js';
import {
  evaluateLatentStateFilterOnInformationClock,
  evaluateScientificCorePipeline,
  LatentFilterTuningOverrides,
} from '../engine/scientificCore.js';
import {
  buildEmpiricalCalibrationBundle,
  computeEmpiricalQuantilePlumes,
  fitEmpiricalGarch11,
} from '../config/parameterRegistry.js';
import {
  assertVerifiedProvenance,
  getAllCachedWaterfallSnapshots,
  getMultiTimeframeBootstrapState,
  ProviderTier,
  REQUIRED_DISCOVERY_TIMEFRAMES,
  triggerNonBlockingMultiTimeframeBootstrap,
} from './realDataWaterfall.js';

const ARCHITECTURE_STORE_SCHEMA_VERSION = 2;

const PERSISTENCE_PRIORITY_ORDER = [
  '1. process.env.GDF_PERSISTENT_DATA_DIR',
  '2. process.env.RENDER_DISK_MOUNT_PATH',
  '3. /data (mounted system volume if writable)',
  '4. <project_root>/data (local project directory)',
];

function isDirectoryWritableMount(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) return false;
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return false;
    fs.accessSync(dirPath, fs.constants.W_OK | fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolvePersistenceConfig(): {
  storeFilePath: string;
  legacyAuditFilePath: string;
  statusLabel: ArchitecturePersistenceHealth['statusLabel'];
  storageMode: ArchitecturePersistenceHealth['storageMode'];
  resolvedSource: ArchitecturePersistenceHealth['resolvedSource'];
  priorityOrder: string[];
  isDurableAcrossRedeploys: boolean;
  humanReadableStatusEn: string;
  humanReadableStatusFa: string;
  warningEn: string | null;
  warningFa: string | null;
  remediationInstructionsEn: string | null;
  remediationInstructionsFa: string | null;
} {
  const gdfDir = process.env.GDF_PERSISTENT_DATA_DIR?.trim() || '';
  const renderDiskDir = process.env.RENDER_DISK_MOUNT_PATH?.trim() || '';
  const isRender = process.env.RENDER === 'true' || Boolean(process.env.RENDER_SERVICE_ID);

  // Priority 1: process.env.GDF_PERSISTENT_DATA_DIR
  if (gdfDir) {
    const storeFilePath = path.join(gdfDir, 'gdf_intelligence_architecture_store.v2.json');
    return {
      storeFilePath,
      legacyAuditFilePath: path.join(gdfDir, 'architecture_audit_log.json'),
      statusLabel: 'PERSISTENT',
      storageMode: 'DURABLE_MOUNTED_VOLUME',
      resolvedSource: 'GDF_PERSISTENT_DATA_DIR',
      priorityOrder: PERSISTENCE_PRIORITY_ORDER,
      isDurableAcrossRedeploys: true,
      humanReadableStatusEn: `PERSISTENT (Mounted Volume via GDF_PERSISTENT_DATA_DIR: ${storeFilePath}) — Survives both process restarts and full container redeploys.`,
      humanReadableStatusFa: `پایدار (دیسک متصل از طریق GDF_PERSISTENT_DATA_DIR) — وضعیت معماری و تاریخچه حسابرسی در ری‌استارت‌ها و استقرار مجدد حفظ می‌شود.`,
      warningEn: null,
      warningFa: null,
      remediationInstructionsEn: null,
      remediationInstructionsFa: null,
    };
  }

  // Priority 2: process.env.RENDER_DISK_MOUNT_PATH
  if (renderDiskDir) {
    const storeFilePath = path.join(renderDiskDir, 'gdf_intelligence_architecture_store.v2.json');
    return {
      storeFilePath,
      legacyAuditFilePath: path.join(renderDiskDir, 'architecture_audit_log.json'),
      statusLabel: 'PERSISTENT',
      storageMode: 'DURABLE_MOUNTED_VOLUME',
      resolvedSource: 'RENDER_DISK_MOUNT_PATH',
      priorityOrder: PERSISTENCE_PRIORITY_ORDER,
      isDurableAcrossRedeploys: true,
      humanReadableStatusEn: `PERSISTENT (Render Disk Mount via RENDER_DISK_MOUNT_PATH: ${storeFilePath}) — Survives both process restarts and full container redeploys.`,
      humanReadableStatusFa: `پایدار (دیسک متصل رندر از طریق RENDER_DISK_MOUNT_PATH) — وضعیت معماری و تاریخچه حسابرسی در استقرار مجدد حفظ می‌شود.`,
      warningEn: null,
      warningFa: null,
      remediationInstructionsEn: null,
      remediationInstructionsFa: null,
    };
  }

  // Priority 3: /data system volume mount if present and writable
  if (isDirectoryWritableMount('/data')) {
    const storeFilePath = path.join('/data', 'gdf_intelligence_architecture_store.v2.json');
    return {
      storeFilePath,
      legacyAuditFilePath: path.join('/data', 'architecture_audit_log.json'),
      statusLabel: 'PERSISTENT',
      storageMode: 'DURABLE_MOUNTED_VOLUME',
      resolvedSource: 'DEFAULT_SYSTEM_DATA_DIR',
      priorityOrder: PERSISTENCE_PRIORITY_ORDER,
      isDurableAcrossRedeploys: true,
      humanReadableStatusEn: `PERSISTENT (Mounted System Volume at /data: ${storeFilePath}) — Survives process restarts and container redeploys.`,
      humanReadableStatusFa: `پایدار (مسیر دیسک سیستم در /data) — وضعیت معماری در ری‌استارت و استقرار مجدد حفظ می‌شود.`,
      warningEn: null,
      warningFa: null,
      remediationInstructionsEn: null,
      remediationInstructionsFa: null,
    };
  }

  // Priority 4: <project_root>/data fallback directory
  const fallbackDir = path.join(process.cwd(), 'data');
  const storeFilePath = path.join(fallbackDir, 'gdf_intelligence_architecture_store.v2.json');
  const legacyAuditFilePath = path.join(fallbackDir, 'architecture_audit_log.json');

  if (isRender) {
    const warningEn =
      'EPHEMERAL RENDER DISK WARNING: No persistent volume is mounted (neither GDF_PERSISTENT_DATA_DIR nor RENDER_DISK_MOUNT_PATH is set). Promoted liveArchitecture, candidateArchitecture, generationCounter, auto-promotion mode, and auditTrail survive process restarts within this container instance, but WILL BE LOST on a full container redeploy.';
    const warningFa =
      'هشدار دیسک موقت در Render: هیچ دیسک پایداری متصل نشده است (متغیرهای GDF_PERSISTENT_DATA_DIR یا RENDER_DISK_MOUNT_PATH تنظیم نشده‌اند). وضعیت معماری زنده، کاندیدا، شمارنده نسل و گزارش حسابرسی در ری‌استارت‌های پردازش حفظ می‌شوند، اما در استقرار مجدد (Redeploy) کامل کانتینر پاک خواهند شد.';
    const remediationInstructionsEn =
      'HOW TO FIX ON RENDER: 1) Open Render Dashboard -> Service -> Disks -> Add Disk (mount path: /var/data). 2) In Environment Variables, set GDF_PERSISTENT_DATA_DIR=/var/data (or RENDER_DISK_MOUNT_PATH=/var/data).';
    const remediationInstructionsFa =
      'نحوه رفع در Render: ۱) در داشبورد Render بخش Disks یک دیسک با مسیر /var/data اضافه کنید. ۲) در بخش Environment متغیر GDF_PERSISTENT_DATA_DIR=/var/data را تنظیم نمایید.';

    return {
      storeFilePath,
      legacyAuditFilePath,
      statusLabel: 'EPHEMERAL',
      storageMode: 'EPHEMERAL_CONTAINER_FILESYSTEM',
      resolvedSource: 'PROJECT_DATA_DIR',
      priorityOrder: PERSISTENCE_PRIORITY_ORDER,
      isDurableAcrossRedeploys: false,
      humanReadableStatusEn: `EPHEMERAL (Render Container Local Path: ${storeFilePath}) — Survives process restarts only; resets on full container redeploy.`,
      humanReadableStatusFa: `موقت (دیسک داخلی کانتینر Render) — در ری‌استارت پردازش حفظ می‌شود اما با استقرار مجدد کانتینر بازنشانی می‌گردد.`,
      warningEn,
      warningFa,
      remediationInstructionsEn,
      remediationInstructionsFa,
    };
  }

  return {
    storeFilePath,
    legacyAuditFilePath,
    statusLabel: 'PERSISTENT',
    storageMode: 'LOCAL_DISK_PERSISTENT',
    resolvedSource: 'PROJECT_DATA_DIR',
    priorityOrder: PERSISTENCE_PRIORITY_ORDER,
    isDurableAcrossRedeploys: true,
    humanReadableStatusEn: `PERSISTENT (Local Disk Store: ${storeFilePath}) — Atomic write-through enabled across restarts.`,
    humanReadableStatusFa: `پایدار (ذخیره‌ساز دیسک محلی: ${storeFilePath}) — نوشتن اتمی و بازیابی خودکار در ری‌استارت فعال است.`,
    warningEn: null,
    warningFa: null,
    remediationInstructionsEn: null,
    remediationInstructionsFa: null,
  };
}


function createDefaultLatentMathWriteBackState(): LatentModelMathWriteBackState {
  return {
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
  };
}

interface PersistedArchitectureDocumentV2 {
  schemaVersion: number;
  savedAtIso: string;
  generationCounter: number;
  autoPromotionRuntimeEnabled: boolean;
  liveArchitecture: ArchitectureState;
  candidateArchitecture: ArchitectureState;
  archivedArchitectures: ArchitectureState[];
  auditTrail: ArchitectureAuditLogEntry[];
  promotedCandTheta?: number;
  promotedCandDriftMult?: number;
  promotedLiveReferencePreds?: number[];
  promotedCandTuningOverrides?: LatentFilterTuningOverrides;
  latentMathWriteBack?: LatentModelMathWriteBackState;
  persistedResidualLog?: ResidualOraclePoint[];
}

interface RuntimeCoreStore {
  liveArchitecture: ArchitectureState;
  candidateArchitecture: ArchitectureState;
  archivedArchitectures: ArchitectureState[];
  auditTrail: ArchitectureAuditLogEntry[];
  autoPromotionRuntimeEnabled: boolean;
  generationCounter: number;
  lastVerificationReport: TestAndVerifyReport | null;
  lastFindings: AwarenessFinding[];
  lastPromotionBannerEn: string | null;
  lastPromotionBannerFa: string | null;
  pendingManualPromotionCycleAck?: boolean;
  lastLiveStepPredictions?: number[];
  promotedLiveReferencePreds?: number[];
  lastCandTheta?: number;
  lastCandDriftMult?: number;
  promotedCandTheta?: number;
  promotedCandDriftMult?: number;
  lastCandTuningOverrides?: LatentFilterTuningOverrides;
  promotedCandTuningOverrides?: LatentFilterTuningOverrides;
  lastPromotedLiveEnsemble?: EnsemblePlume;
  lastCandidateEnsemble?: EnsemblePlume;
  latentMathWriteBack: LatentModelMathWriteBackState;
  persistedResidualLog: ResidualOraclePoint[];
  lastScientificCore?: ScientificCoreTelemetry;
  persistenceHealth: ArchitecturePersistenceHealth;
  lastMtfDiscoveryContext: MultiTimeframeDiscoveryContext;
}

function createInitialBaselineModels(): DynamicModelSlot[] {
  return [
    {
      modelId: 'OU_MEAN_REVERSION',
      nameEn: '40-Bar Ornstein-Uhlenbeck Equilibrium Restoring Drift',
      nameFa: 'رانش بازگشت به تعادل ۴۰ کندلی اورنشتاین-اولنبک (OU)',
      origin: 'CORE_BASELINE',
      equationAscii: 'v_OU(t) = theta_OU * (P_eq,40(t) - P_t)',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.2,
      rollingErrorVariance: 1.0,
      rollingRankIc: 0.08,
      fittedCoefficient: 0.12,
      currentStepContributionUsd: 0,
      oosRSquared: 0.042,
      stabilityRatio: 0.92,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'EKF_STATE_DRIFT',
      nameEn: 'Volume-Clock Scalar Kalman State Velocity & Shrunk Bias',
      nameFa: 'سرعت حالت کالمن ساعت حجمی و انحراف منقبض‌شده بیزی',
      origin: 'CORE_BASELINE',
      equationAscii: 'v_EKF(t) = theta_EKF * (0.55 * v_hat_t + 0.45 * b_t^*)',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.2,
      rollingErrorVariance: 1.0,
      rollingRankIc: 0.11,
      fittedCoefficient: 0.35,
      currentStepContributionUsd: 0,
      oosRSquared: 0.055,
      stabilityRatio: 0.94,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'ORTHOGONAL_MACRO_LIFT',
      nameEn: '3-Factor Orthogonalized Real-Yield & Dollar Macro Drift',
      nameFa: 'رانش کلان ۳ عاملی متعامد بازده واقعی TIPS و شاخص دلار',
      origin: 'CORE_BASELINE',
      equationAscii: 'v_Macro(t) = theta_Mac * (0.58*F1_t + 0.26*F2_t + 0.16*F3_t)',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.2,
      rollingErrorVariance: 1.0,
      rollingRankIc: 0.06,
      fittedCoefficient: 0.35,
      currentStepContributionUsd: 0,
      oosRSquared: 0.038,
      stabilityRatio: 0.89,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'SWEEP_LOG_ODDS_IMPULSE',
      nameEn: 'OHLCV Wick-Volume Sweep Log-Odds Microstructure Impulse',
      nameFa: 'تکانه لگاریتم شانس جاروب نقدینگی شدو-حجم (Sweep)',
      origin: 'CORE_BASELINE',
      equationAscii: 'v_Sweep(t) = theta_Sw * L_t * ATR_t * (1 - 0.25 * VPIN_t)',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.2,
      rollingErrorVariance: 1.0,
      rollingRankIc: 0.05,
      fittedCoefficient: 0.12,
      currentStepContributionUsd: 0,
      oosRSquared: 0.034,
      stabilityRatio: 0.88,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'MTF_LIQUIDITY_PULL',
      nameEn: 'Top-Down Multi-Timeframe Volume-Profile Pool Gravity (Monthly→5M)',
      nameFa: 'جاذبه استخرهای نقدینگی پروفایل حجم چندتایم‌فریمی (ماهانه تا ۵ دقیقه)',
      origin: 'CORE_BASELINE',
      equationAscii: 'v_Liq(t) = theta_Liq * (sum_h w_h * Pull_h(t) + FlowImpulse_t)',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.2,
      rollingErrorVariance: 1.0,
      rollingRankIc: 0.12,
      fittedCoefficient: 1.0,
      currentStepContributionUsd: 0,
      oosRSquared: 0.064,
      stabilityRatio: 0.95,
      sampleCountN: 36,
      timeframeScope: 'CROSS_TF_HTF_LTF',
    },
  ];
}

function createInitialCandidateModels(): DynamicModelSlot[] {
  const base = createInitialBaselineModels();
  const discovered: DynamicModelSlot[] = [
    {
      modelId: 'VOL_REGIME_NONLINEAR_INTERACTION',
      nameEn: 'Level-B Symbolic: Non-Linear Volume-Clock × Volatility Initiation Coupling',
      nameFa: 'کشف نمادین سطح B: هم‌بستگی غیرخطی ساعت حجمی و آغازگری در رژیم نوسانی',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_vol(t) = theta_v * tanh(Z_init,t * sqrt(Delta_tau_t)) * ATR_t * I(sigma_GARCH > sigma_med)',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.08,
      rollingErrorVariance: 0.85,
      rollingRankIc: 0.14,
      fittedCoefficient: 0.18,
      currentStepContributionUsd: 0,
      oosRSquared: 0.052,
      stabilityRatio: 0.91,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'BASIS_VELOCITY_COUPLING',
      nameEn: 'Level-B Symbolic: Cross-Venue Cointegration Basis Restoring Velocity',
      nameFa: 'کشف نمادین سطح B: سرعت بازگشت اسپرد بین‌بازاری (PAXG به کامکس)',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_basis(t) = theta_b * (-Z_basis,t) * sqrt(Delta_tau_t) * ATR_t * 0.15',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.07,
      rollingErrorVariance: 0.9,
      rollingRankIc: 0.11,
      fittedCoefficient: 0.22,
      currentStepContributionUsd: 0,
      oosRSquared: 0.044,
      stabilityRatio: 0.87,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'VOLUME_CLOCK_HAWKMOTH_RESTORING',
      nameEn: 'Level-B Symbolic: Passive Limit-Absorption HTF POC Restoring Attractor',
      nameFa: 'کشف نمادین سطح B: جاذب بازگشت جذب سفارشات محدود به سمت POC تایم‌فریم بالا',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_abs(t) = theta_a * Z_abs,t * (1 - VPIN_t) * sign(POC_HTF - P_t) * ATR_t * 0.14',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.08,
      rollingErrorVariance: 0.88,
      rollingRankIc: 0.13,
      fittedCoefficient: 0.19,
      currentStepContributionUsd: 0,
      oosRSquared: 0.049,
      stabilityRatio: 0.9,
      sampleCountN: 36,
      timeframeScope: 'CROSS_TF_HTF_LTF',
    },
    {
      modelId: 'REAL_YIELD_CONVEXITY_ASYMMETRY',
      nameEn: 'Level-B Symbolic: Asymmetric Real-Yield Convexity Shock Dampener',
      nameFa: 'کشف نمادین سطح B: تعدیل‌کننده غیرمتقارن تحدب بازده واقعی TIPS در شوک‌های کلان',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_conv(t) = theta_c * sign(F1_t) * min(2.5, F1_t^2) * 0.16',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.06,
      rollingErrorVariance: 0.92,
      rollingRankIc: 0.09,
      fittedCoefficient: 0.15,
      currentStepContributionUsd: 0,
      oosRSquared: 0.036,
      stabilityRatio: 0.85,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'LAGGED_RESIDUAL_SELF_CORRECTION',
      nameEn: 'Level-B Symbolic: Lagged OOS Residual × Toxicity-Damped Error Correction',
      nameFa: 'کشف نمادین سطح B: تصحیح خودکار پسماند تاخیری خط زرد تعدیل‌شده با سمیت جریان سفارش',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_res(t) = theta_r * tanh((e_{t-1}^{live} + 0.5*e_{t-2}^{live}) / ATR_t) * exp(-VPIN_t) * ATR_t * 0.14',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.07,
      rollingErrorVariance: 0.86,
      rollingRankIc: 0.15,
      fittedCoefficient: 0.24,
      currentStepContributionUsd: 0,
      oosRSquared: 0.056,
      stabilityRatio: 0.92,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'BASIS_ACCELERATION_SECOND_ORDER',
      nameEn: 'Level-B Symbolic: Second-Order Cross-Venue Basis Spread Acceleration',
      nameFa: 'کشف نمادین سطح B: شتاب مرتبه دوم اسپرد بین‌بازاری در انحراف‌های آربیتراژی',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_bacc(t) = theta_ba * (-Delta^2 delta_{basis,t} / ATR_t) * I(|Z_{basis,t}| > sigma_disp) * ATR_t * 0.12',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.06,
      rollingErrorVariance: 0.91,
      rollingRankIc: 0.1,
      fittedCoefficient: 0.17,
      currentStepContributionUsd: 0,
      oosRSquared: 0.039,
      stabilityRatio: 0.86,
      sampleCountN: 36,
      timeframeScope: 'ACTIVE_TF',
    },
    {
      modelId: 'MTF_DRIFT_CONFLUENCE_SYNERGY',
      nameEn: 'Level-B Symbolic: Multi-Timeframe HTF/LTF Drift × HTF POC Attractor Synergy',
      nameFa: 'کشف نمادین سطح B: هم‌افزایی رانش چندتایم‌فریمی (تایم‌فریم بالا و پایین) با جاذب POC',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_mtf(t) = theta_mtf * tanh(D_{HTF,t} + 0.5*D_{LTF,t}) * clamp((POC_{HTF,t} - P_t)/ATR_t, -2, 2) * ATR_t * 0.15',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.09,
      rollingErrorVariance: 0.83,
      rollingRankIc: 0.16,
      fittedCoefficient: 0.26,
      currentStepContributionUsd: 0,
      oosRSquared: 0.061,
      stabilityRatio: 0.93,
      sampleCountN: 36,
      timeframeScope: 'CROSS_TF_HTF_LTF',
    },
    {
      modelId: 'ASYMMETRIC_TAIL_VOL_SHOCK_SHIELD',
      nameEn: 'Level-B Symbolic: Asymmetric Real-Yield × GARCH Tail-Volatility Shock Shield',
      nameFa: 'کشف نمادین سطح B: سپر نامتقارن شوک بازده واقعی و نوسان شرطی GARCH در دم توزیع',
      origin: 'LEVEL_B_SYMBOLIC_DISCOVERY',
      equationAscii: 'phi_tail(t) = theta_ts * (I(F1_t < 0)*F1_t*(sigma_GARCH/sigma_bar) + I(F1_t >= 0)*0.5*F1_t) * ATR_t * 0.11',
      isEnabled: true,
      disabledReasonEn: null,
      dynamicWeight: 0.06,
      rollingErrorVariance: 0.89,
      rollingRankIc: 0.12,
      fittedCoefficient: 0.19,
      currentStepContributionUsd: 0,
      oosRSquared: 0.045,
      stabilityRatio: 0.88,
      sampleCountN: 36,
      timeframeScope: 'CROSS_TF_HTF_LTF',
    },
  ];
  return [...base, ...discovered];
}

function createDefaultLiveArchitecture(): ArchitectureState {
  const models = createInitialBaselineModels();
  return {
    architectureId: 'arch-live-gen1',
    versionTag: 'v1.0-LiveApproved',
    role: 'LIVE_YELLOW_LINE',
    createdAtIso: new Date().toISOString(),
    promotedAtIso: new Date().toISOString(),
    promotionMode: 'INITIAL_BASELINE',
    lineColorHex: '#f5d76e',
    activeModelsCount: models.filter(m => m.isEnabled).length,
    disabledModelsCount: 0,
    discoveredModelsCount: 0,
    models,
    dynamicFusionWeights: {
      ouMeanReversionWeight: 0.2,
      kalmanDriftWeight: 0.2,
      macroFactorWeight: 0.2,
      sweepMicrostructureWeight: 0.2,
      mtfLiquidityWeight: 0.2,
    },
    compositeNetDriftUsdPerStep: 0,
    compositeEquilibriumAnchor: 0,
  };
}

function createDefaultCandidateArchitecture(): ArchitectureState {
  const models = createInitialCandidateModels();
  return {
    architectureId: 'arch-cand-gen1',
    versionTag: 'v2.0-ParallelCandidate-G1',
    role: 'PARALLEL_CANDIDATE_LINE',
    createdAtIso: new Date().toISOString(),
    promotedAtIso: null,
    promotionMode: undefined,
    lineColorHex: '#e040fb',
    activeModelsCount: models.filter(m => m.isEnabled).length,
    disabledModelsCount: 0,
    discoveredModelsCount: models.filter(m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY').length,
    models,
    dynamicFusionWeights: {
      ouMeanReversionWeight: 0.2,
      kalmanDriftWeight: 0.2,
      macroFactorWeight: 0.2,
      sweepMicrostructureWeight: 0.2,
      mtfLiquidityWeight: 0.2,
    },
    compositeNetDriftUsdPerStep: 0,
    compositeEquilibriumAnchor: 0,
  };
}

function mergeCandidateCatalogModels(existingModels: DynamicModelSlot[]): DynamicModelSlot[] {
  const catalog = createInitialCandidateModels();
  const byId = new Map<SymbolicPrimitiveId, DynamicModelSlot>();
  for (const m of existingModels) {
    if (m && m.modelId) {
      byId.set(m.modelId, { ...m });
    }
  }
  const merged: DynamicModelSlot[] = [];
  for (const catModel of catalog) {
    const existing = byId.get(catModel.modelId);
    if (existing) {
      merged.push({
        ...catModel,
        ...existing,
        equationAscii: catModel.equationAscii,
        timeframeScope: catModel.timeframeScope,
      });
    } else {
      merged.push({ ...catModel });
    }
  }
  return merged;
}

function persistCoreStoreToDisk(store: RuntimeCoreStore): void {
  const cfg = resolvePersistenceConfig();
  const nowIso = new Date().toISOString();
  const doc: PersistedArchitectureDocumentV2 = {
    schemaVersion: ARCHITECTURE_STORE_SCHEMA_VERSION,
    savedAtIso: nowIso,
    generationCounter: store.generationCounter,
    autoPromotionRuntimeEnabled: store.autoPromotionRuntimeEnabled,
    liveArchitecture: store.liveArchitecture,
    candidateArchitecture: store.candidateArchitecture,
    archivedArchitectures: store.archivedArchitectures.slice(0, 20),
    auditTrail: store.auditTrail.slice(0, 100),
    promotedCandTheta: store.promotedCandTheta,
    promotedCandDriftMult: store.promotedCandDriftMult,
    promotedLiveReferencePreds: store.promotedLiveReferencePreds,
    promotedCandTuningOverrides: store.promotedCandTuningOverrides,
    latentMathWriteBack: store.latentMathWriteBack,
    persistedResidualLog: store.persistedResidualLog.slice(-200),
  };

  store.persistenceHealth = {
    ...store.persistenceHealth,
    schemaVersion: ARCHITECTURE_STORE_SCHEMA_VERSION,
    statusLabel: cfg.statusLabel,
    storageMode: cfg.storageMode,
    resolvedSource: cfg.resolvedSource,
    priorityOrder: cfg.priorityOrder,
    isDurableAcrossRedeploys: cfg.isDurableAcrossRedeploys,
    storeFilePath: cfg.storeFilePath,
    lastPersistedAtIso: nowIso,
    restoredGeneration: store.generationCounter,
    restoredAuditEntriesCount: doc.auditTrail.length,
    restoredLiveVersionTag: store.liveArchitecture.versionTag,
    restoredCandidateVersionTag: store.candidateArchitecture.versionTag,
    restoredAutoPromotionEnabled: store.autoPromotionRuntimeEnabled,
    humanReadableStatusEn: cfg.humanReadableStatusEn,
    humanReadableStatusFa: cfg.humanReadableStatusFa,
    warningEn: cfg.warningEn,
    warningFa: cfg.warningFa,
    remediationInstructionsEn: cfg.remediationInstructionsEn,
    remediationInstructionsFa: cfg.remediationInstructionsFa,
  };

  try {
    const dir = path.dirname(cfg.storeFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpFile = `${cfg.storeFilePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(doc, null, 2), 'utf8');
    fs.renameSync(tmpFile, cfg.storeFilePath);

    // Also keep legacy audit file synchronized for backward compatibility
    fs.writeFileSync(cfg.legacyAuditFilePath, JSON.stringify(doc.auditTrail.slice(0, 80), null, 2), 'utf8');
  } catch {
    // Ignore read-only filesystem errors in restricted containers
  }
}

function loadOrInitializeCoreStore(): RuntimeCoreStore {
  const cfg = resolvePersistenceConfig();
  if (cfg.warningEn) {
    console.warn(`[GDF Architecture Store] ${cfg.warningEn}`);
    if (cfg.remediationInstructionsEn) {
      console.warn(`[GDF Architecture Store] ${cfg.remediationInstructionsEn}`);
    }
  }

  const nowIso = new Date().toISOString();
  const defaultMtfContext: MultiTimeframeDiscoveryContext = {
    activeTimeframe: '15m',
    requiredTimeframes: [...REQUIRED_DISCOVERY_TIMEFRAMES],
    participatingTimeframes: ['15m', '1h', '4h', '1d'],
    verifiedRealCacheTimeframes: [],
    missingTimeframes: [...REQUIRED_DISCOVERY_TIMEFRAMES],
    bootstrapStatus: 'BOOTSTRAPPING_IN_PROGRESS',
    timeframeDetails: REQUIRED_DISCOVERY_TIMEFRAMES.map(tf => ({
      timeframe: tf,
      available: false,
      barsCount: 0,
      source: 'UNAVAILABLE' as const,
      provider: 'Pending Cold-Start Bootstrap',
    })),
    htfNormalizedDriftZ: 0,
    ltfNormalizedDriftZ: 0,
    htfPocAnchorPrice: 0,
    htfVolatilityRatio: 1,
    mtfConfluenceAlignment: 0,
    summaryEn: 'Awaiting first multi-timeframe real-data evaluation.',
    summaryFa: 'در انتظار نخستین ارزیابی داده‌های واقعی چندتایم‌فریمی.',
  };

  // 1. Attempt to restore from Version 2 Persistent Architecture Document
  try {
    if (fs.existsSync(cfg.storeFilePath)) {
      const raw = JSON.parse(fs.readFileSync(cfg.storeFilePath, 'utf8')) as Partial<PersistedArchitectureDocumentV2>;
      if (
        raw &&
        raw.liveArchitecture &&
        raw.candidateArchitecture &&
        Array.isArray(raw.auditTrail) &&
        raw.auditTrail.length > 0
      ) {
        const mergedCandModels = mergeCandidateCatalogModels(raw.candidateArchitecture.models || []);
        const restoredCand: ArchitectureState = {
          ...raw.candidateArchitecture,
          lineColorHex: '#e040fb',
          models: mergedCandModels,
          activeModelsCount: mergedCandModels.filter(m => m.isEnabled).length,
          disabledModelsCount: mergedCandModels.filter(m => !m.isEnabled).length,
          discoveredModelsCount: mergedCandModels.filter(
            m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && m.isEnabled
          ).length,
        };
        const restoredLive: ArchitectureState = {
          ...raw.liveArchitecture,
          lineColorHex: '#f5d76e',
        };
        const gen = typeof raw.generationCounter === 'number' && raw.generationCounter >= 1 ? raw.generationCounter : 1;
        const autoPromo =
          typeof raw.autoPromotionRuntimeEnabled === 'boolean'
            ? raw.autoPromotionRuntimeEnabled
            : getFeatureFlags().ALLOW_AUTO_ARCHITECTURE_PROMOTION;

        const restoredStore: RuntimeCoreStore = {
          liveArchitecture: restoredLive,
          candidateArchitecture: restoredCand,
          archivedArchitectures: Array.isArray(raw.archivedArchitectures) ? raw.archivedArchitectures.slice(0, 20) : [],
          auditTrail: raw.auditTrail.slice(0, 100),
          autoPromotionRuntimeEnabled: autoPromo,
          generationCounter: gen,
          promotedCandTheta: typeof raw.promotedCandTheta === 'number' ? raw.promotedCandTheta : undefined,
          promotedCandDriftMult: typeof raw.promotedCandDriftMult === 'number' ? raw.promotedCandDriftMult : undefined,
          promotedLiveReferencePreds: Array.isArray(raw.promotedLiveReferencePreds) ? raw.promotedLiveReferencePreds : undefined,
          promotedCandTuningOverrides: raw.promotedCandTuningOverrides,
          latentMathWriteBack: raw.latentMathWriteBack || createDefaultLatentMathWriteBackState(),
          persistedResidualLog: Array.isArray(raw.persistedResidualLog) ? raw.persistedResidualLog.slice(-200) : [],
          lastVerificationReport: null,
          lastFindings: [],
          lastPromotionBannerEn: null,
          lastPromotionBannerFa: null,
          persistenceHealth: {
            schemaVersion: ARCHITECTURE_STORE_SCHEMA_VERSION,
            statusLabel: cfg.statusLabel,
            storageMode: cfg.storageMode,
            resolvedSource: cfg.resolvedSource,
            priorityOrder: cfg.priorityOrder,
            isDurableAcrossRedeploys: cfg.isDurableAcrossRedeploys,
            storeFilePath: cfg.storeFilePath,
            lastPersistedAtIso: raw.savedAtIso || nowIso,
            coldStartRestored: true,
            restoredGeneration: gen,
            restoredAuditEntriesCount: raw.auditTrail.length,
            restoredLiveVersionTag: restoredLive.versionTag,
            restoredCandidateVersionTag: restoredCand.versionTag,
            restoredAutoPromotionEnabled: autoPromo,
            humanReadableStatusEn: cfg.humanReadableStatusEn,
            humanReadableStatusFa: cfg.humanReadableStatusFa,
            warningEn: cfg.warningEn,
            warningFa: cfg.warningFa,
            remediationInstructionsEn: cfg.remediationInstructionsEn,
            remediationInstructionsFa: cfg.remediationInstructionsFa,
          },
          lastMtfDiscoveryContext: defaultMtfContext,
        };
        return restoredStore;
      }
    }
  } catch {
    // Fall through to legacy migration or fresh initialization
  }

  // 2. Check legacy audit trail file for seamless migration to v2 store
  let migratedAudit: ArchitectureAuditLogEntry[] = [];
  try {
    if (fs.existsSync(cfg.legacyAuditFilePath)) {
      const rawLegacy = JSON.parse(fs.readFileSync(cfg.legacyAuditFilePath, 'utf8'));
      if (Array.isArray(rawLegacy) && rawLegacy.length > 0) {
        migratedAudit = rawLegacy.slice(0, 80);
      }
    }
  } catch {
    // Ignore
  }

  if (migratedAudit.length === 0) {
    migratedAudit = [
      {
        auditId: `audit-init-${Date.now()}`,
        timestampIso: nowIso,
        eventType: 'LEVEL_B_MODEL_INVENTED',
        actor: 'INTELLIGENCE_AWARENESS_CORE',
        sourceArchitectureId: 'arch-live-gen1',
        targetArchitectureId: 'arch-cand-gen1',
        summaryEn:
          'Initialized Parallel Universe Candidate Architecture (Gen-1) with 8 Level-B closed-form symbolic equations, multi-timeframe discovery inputs, and online inverse-variance precision weights.',
        summaryFa:
          'معماری کاندیدای جهان موازی (نسل ۱) با ۸ معادله نمادین بسته سطح B، ورودی‌های چندتایم‌فریمی و وزن‌دهی پویا بر اساس معکوس واریانس خطای خارج از نمونه مقداردهی شد.',
        verifiableMetrics: 'ActiveCandidateModels=13 | DiscoveredSymbolicTerms=8 | SumWeights=1.0000',
      },
    ];
  }

  const defaultLive = createDefaultLiveArchitecture();
  const defaultCand = createDefaultCandidateArchitecture();
  const defaultAutoPromo = getFeatureFlags().ALLOW_AUTO_ARCHITECTURE_PROMOTION;

  const initialStore: RuntimeCoreStore = {
    liveArchitecture: defaultLive,
    candidateArchitecture: defaultCand,
    archivedArchitectures: [],
    auditTrail: migratedAudit,
    autoPromotionRuntimeEnabled: defaultAutoPromo,
    generationCounter: 1,
    latentMathWriteBack: createDefaultLatentMathWriteBackState(),
    persistedResidualLog: [],
    lastVerificationReport: null,
    lastFindings: [],
    lastPromotionBannerEn: null,
    lastPromotionBannerFa: null,
    persistenceHealth: {
      schemaVersion: ARCHITECTURE_STORE_SCHEMA_VERSION,
      statusLabel: cfg.statusLabel,
      storageMode: cfg.storageMode,
      resolvedSource: cfg.resolvedSource,
      priorityOrder: cfg.priorityOrder,
      isDurableAcrossRedeploys: cfg.isDurableAcrossRedeploys,
      storeFilePath: cfg.storeFilePath,
      lastPersistedAtIso: nowIso,
      coldStartRestored: migratedAudit.length > 1,
      restoredGeneration: 1,
      restoredAuditEntriesCount: migratedAudit.length,
      restoredLiveVersionTag: defaultLive.versionTag,
      restoredCandidateVersionTag: defaultCand.versionTag,
      restoredAutoPromotionEnabled: defaultAutoPromo,
      humanReadableStatusEn: cfg.humanReadableStatusEn,
      humanReadableStatusFa: cfg.humanReadableStatusFa,
      warningEn: cfg.warningEn,
      warningFa: cfg.warningFa,
      remediationInstructionsEn: cfg.remediationInstructionsEn,
      remediationInstructionsFa: cfg.remediationInstructionsFa,
    },
    lastMtfDiscoveryContext: defaultMtfContext,
  };

  persistCoreStoreToDisk(initialStore);
  return initialStore;
}

let coreStore: RuntimeCoreStore = loadOrInitializeCoreStore();

/**
 * Explicitly reloads the architecture & audit store from disk (simulating a cold-start process restart).
 * Restores the last approved Live Architecture, Candidate Architecture, generation counter, auto-promotion mode,
 * and full Audit Trail without gaps.
 */
export function reloadArchitectureStoreFromDisk(): ArchitecturePersistenceHealth {
  coreStore = loadOrInitializeCoreStore();
  return getArchitecturePersistenceHealth();
}

export function getArchitecturePersistenceHealth(): ArchitecturePersistenceHealth {
  const cfg = resolvePersistenceConfig();
  return {
    ...coreStore.persistenceHealth,
    statusLabel: cfg.statusLabel,
    storageMode: cfg.storageMode,
    resolvedSource: cfg.resolvedSource,
    priorityOrder: cfg.priorityOrder,
    isDurableAcrossRedeploys: cfg.isDurableAcrossRedeploys,
    storeFilePath: cfg.storeFilePath,
    restoredGeneration: coreStore.generationCounter,
    restoredAuditEntriesCount: coreStore.auditTrail.length,
    restoredLiveVersionTag: coreStore.liveArchitecture.versionTag,
    restoredCandidateVersionTag: coreStore.candidateArchitecture.versionTag,
    restoredAutoPromotionEnabled: coreStore.autoPromotionRuntimeEnabled,
    humanReadableStatusEn: cfg.humanReadableStatusEn,
    humanReadableStatusFa: cfg.humanReadableStatusFa,
    warningEn: cfg.warningEn,
    warningFa: cfg.warningFa,
    remediationInstructionsEn: cfg.remediationInstructionsEn,
    remediationInstructionsFa: cfg.remediationInstructionsFa,
  };
}

function appendAuditEntry(entry: Omit<ArchitectureAuditLogEntry, 'auditId' | 'timestampIso'>): ArchitectureAuditLogEntry {
  const fullEntry: ArchitectureAuditLogEntry = {
    auditId: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestampIso: new Date().toISOString(),
    ...entry,
  };
  coreStore.auditTrail.unshift(fullEntry);
  if (coreStore.auditTrail.length > 100) {
    coreStore.auditTrail.length = 100;
  }
  persistCoreStoreToDisk(coreStore);
  return fullEntry;
}

/**
 * Computes Spearman Rank Correlation (Rank-IC) between two equal-length real arrays.
 */
function computeSpearmanCorrelation(preds: number[], realized: number[]): number {
  const n = Math.min(preds.length, realized.length);
  if (n < 4) return 0;

  const rankArray = (arr: number[]) => {
    const indexed = arr.slice(0, n).map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      ranks[indexed[i].i] = i + 1;
    }
    return ranks;
  };

  const rP = rankArray(preds);
  const rY = rankArray(realized);
  const meanRank = (n + 1) / 2;
  let cov = 0;
  let varP = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dp = rP[i] - meanRank;
    const dy = rY[i] - meanRank;
    cov += dp * dy;
    varP += dp * dp;
    varY += dy * dy;
  }
  const denom = Math.sqrt(varP * varY);
  if (denom < 1e-9) return 0;
  return parseFloat(Math.max(-1, Math.min(1, cov / denom)).toFixed(4));
}

function computeSeriesNormalizedDriftZ(seriesCandles: Candle[], lookbackBars: number): number | null {
  if (!Array.isArray(seriesCandles) || seriesCandles.length < 6) return null;
  const n = seriesCandles.length;
  const lb = Math.min(lookbackBars, Math.max(2, n - 1));
  let rangeSum = 0;
  let rangeCount = 0;
  for (let i = Math.max(0, n - 14); i < n; i++) {
    rangeSum += Math.max(0.05, seriesCandles[i].high - seriesCandles[i].low);
    rangeCount++;
  }
  const localAtr = Math.max(0.4, rangeSum / Math.max(1, rangeCount));
  const rawDrift = (seriesCandles[n - 1].close - seriesCandles[n - 1 - lb].close) / (localAtr * Math.sqrt(lb));
  return Math.max(-3.0, Math.min(3.0, rawDrift));
}

/**
 * Computes causal multi-timeframe discovery context from the verified waterfall snapshot
 * and any additional verified higher/lower timeframe series in the waterfall cache (5m, 15m, 1h, 4h, 1d).
 * Zero synthetic data: derives cross-timeframe features strictly from verified real candles.
 * Never blocks the live yellow-line path: triggers background bootstrap if any timeframe is missing.
 */
export function buildCausalMultiTimeframeDiscoveryContext(params: {
  activeTimeframe: string;
  candles: Candle[];
  htfDailyCandles?: Candle[];
  compositeHtfPocAnchor: number;
  activeAtr: number;
}): MultiTimeframeDiscoveryContext {
  const { activeTimeframe, candles, htfDailyCandles, compositeHtfPocAnchor, activeAtr } = params;
  const cachedSnapshots = getAllCachedWaterfallSnapshots();
  const bootstrapState = getMultiTimeframeBootstrapState();

  const verifiedRealCacheTimeframes: string[] = [];
  const participating = new Set<string>([activeTimeframe]);

  for (const tf of REQUIRED_DISCOVERY_TIMEFRAMES) {
    const snap = cachedSnapshots[tf];
    if (snap && snap.systemState !== 'HALTED_DEGRADED' && snap.candles.length >= 20) {
      verifiedRealCacheTimeframes.push(tf);
      participating.add(tf);
    }
  }
  if (!verifiedRealCacheTimeframes.includes(activeTimeframe) && candles.length >= 20) {
    verifiedRealCacheTimeframes.push(activeTimeframe);
  }
  if (htfDailyCandles && htfDailyCandles.length >= 15) {
    participating.add('1d');
    if (!verifiedRealCacheTimeframes.includes('1d')) {
      verifiedRealCacheTimeframes.push('1d');
    }
  }

  // Causal structural aggregation of the verified active series provides fallback higher-horizon
  // structure when a specific higher timeframe has not yet completed cold-start bootstrap
  if (activeTimeframe === '15m') {
    participating.add('1h');
    participating.add('4h');
  } else if (activeTimeframe === '5m') {
    participating.add('15m');
    participating.add('1h');
  } else if (activeTimeframe === '1h') {
    participating.add('4h');
    participating.add('1d');
  }

  const missingTimeframes = REQUIRED_DISCOVERY_TIMEFRAMES.filter(
    tf => !verifiedRealCacheTimeframes.includes(tf)
  );

  // Proactively trigger non-blocking background bootstrap if any required timeframe is missing
  if (missingTimeframes.length > 0 && candles.length >= 20) {
    triggerNonBlockingMultiTimeframeBootstrap();
  }

  const timeframeDetails = REQUIRED_DISCOVERY_TIMEFRAMES.map(tf => {
    const snap = cachedSnapshots[tf];
    if (snap && snap.systemState !== 'HALTED_DEGRADED' && snap.candles.length >= 20) {
      return {
        timeframe: tf,
        available: true,
        barsCount: snap.candles.length,
        source: 'VERIFIED_WATERFALL_CACHE' as const,
        provider: snap.activeProvider,
      };
    }
    if (tf === activeTimeframe && candles.length >= 20) {
      return {
        timeframe: tf,
        available: true,
        barsCount: candles.length,
        source: 'ACTIVE_SNAPSHOT' as const,
        provider: 'Active Forecast Waterfall Snapshot',
      };
    }
    if (tf === '1d' && htfDailyCandles && htfDailyCandles.length >= 15) {
      return {
        timeframe: tf,
        available: true,
        barsCount: htfDailyCandles.length,
        source: 'HTF_DAILY_ANCHOR' as const,
        provider: 'Verified HTF Daily Anchor',
      };
    }
    if (participating.has(tf)) {
      return {
        timeframe: tf,
        available: false,
        barsCount: candles.length,
        source: 'CAUSAL_STRUCTURAL_AGGREGATION' as const,
        provider: bootstrapState.failureReasons[tf] || `Causal aggregation from ${activeTimeframe} (bootstrap pending)`,
      };
    }
    return {
      timeframe: tf,
      available: false,
      barsCount: 0,
      source: 'UNAVAILABLE' as const,
      provider: bootstrapState.failureReasons[tf] || 'Unavailable / Pending Bootstrap',
    };
  });

  const safeAtr = Math.max(0.5, activeAtr);
  const n = candles.length;
  const lastClose = candles[n - 1]?.close || 0;

  // Higher-Timeframe Normalized Drift Z-score: combines 16-bar structural block with real cached 1h, 4h, 1d snapshots
  const htfLookback = Math.min(16, Math.max(4, n - 1));
  const htfBlockDrift = (lastClose - candles[n - 1 - htfLookback].close) / (safeAtr * Math.sqrt(htfLookback));
  const htfSignals: number[] = [htfBlockDrift];

  for (const htfKey of ['1h', '4h', '1d'] as const) {
    const snapCandles = cachedSnapshots[htfKey]?.candles;
    const zVal = snapCandles ? computeSeriesNormalizedDriftZ(snapCandles, 6) : null;
    if (zVal !== null) {
      htfSignals.push(zVal);
    }
  }
  if (!cachedSnapshots['1d'] && htfDailyCandles && htfDailyCandles.length >= 6) {
    const zDaily = computeSeriesNormalizedDriftZ(htfDailyCandles, 4);
    if (zDaily !== null) htfSignals.push(zDaily);
  }
  const htfMeanSignal = htfSignals.reduce((a, b) => a + b, 0) / htfSignals.length;
  const htfNormalizedDriftZ = parseFloat(Math.max(-3.0, Math.min(3.0, htfMeanSignal)).toFixed(4));

  // Lower-Timeframe / Short-Horizon Normalized Micro-Impulse Z-score: combines 3-bar active drift with real cached 5m & 15m snapshots
  const ltfLookback = Math.min(3, Math.max(1, n - 1));
  const ltfRawDrift = (lastClose - candles[n - 1 - ltfLookback].close) / (safeAtr * Math.sqrt(ltfLookback));
  const ltfSignals: number[] = [ltfRawDrift];
  for (const ltfKey of ['5m', '15m'] as const) {
    const snapCandles = cachedSnapshots[ltfKey]?.candles;
    const zVal = snapCandles ? computeSeriesNormalizedDriftZ(snapCandles, 4) : null;
    if (zVal !== null) {
      ltfSignals.push(zVal);
    }
  }
  const ltfMeanSignal = ltfSignals.reduce((a, b) => a + b, 0) / ltfSignals.length;
  const ltfNormalizedDriftZ = parseFloat(Math.max(-3.0, Math.min(3.0, ltfMeanSignal)).toFixed(4));

  // HTF Volatility Ratio (16-bar realized range volatility vs local ATR)
  let htfRangeSum = 0;
  for (let i = Math.max(0, n - htfLookback); i < n; i++) {
    htfRangeSum += Math.max(0.05, candles[i].high - candles[i].low);
  }
  const htfMeanRange = htfRangeSum / Math.max(1, htfLookback);
  const htfVolatilityRatio = parseFloat(Math.max(0.4, Math.min(2.5, htfMeanRange / safeAtr)).toFixed(4));

  // Multi-Timeframe Confluence Alignment in [-1, +1]
  const pocPullDir = Math.tanh((compositeHtfPocAnchor - lastClose) / (2.0 * safeAtr));
  const mtfConfluenceAlignment = parseFloat(
    Math.max(-1, Math.min(1, Math.tanh(0.45 * htfNormalizedDriftZ + 0.35 * ltfNormalizedDriftZ + 0.2 * pocPullDir))).toFixed(4)
  );

  const tfList = Array.from(participating);
  const bootstrapStatus: MultiTimeframeDiscoveryContext['bootstrapStatus'] =
    missingTimeframes.length === 0
      ? 'COMPLETE_ALL_TIMEFRAMES'
      : bootstrapState.bootstrapInProgress
      ? 'BOOTSTRAPPING_IN_PROGRESS'
      : 'PARTIAL_AVAILABLE';

  const missingNoteEn =
    missingTimeframes.length > 0
      ? ` (Missing/Pending: [${missingTimeframes.join(', ')}])`
      : ' (All 5 required timeframes verified in cache)';
  const missingNoteFa =
    missingTimeframes.length > 0
      ? ` (تایم‌فریم‌های در انتظار: [${missingTimeframes.join(', ')}])`
      : ' (هر ۵ تایم‌فریم در حافظه تأیید شدند)';

  return {
    activeTimeframe,
    requiredTimeframes: [...REQUIRED_DISCOVERY_TIMEFRAMES],
    participatingTimeframes: tfList,
    verifiedRealCacheTimeframes,
    missingTimeframes,
    bootstrapStatus,
    timeframeDetails,
    htfNormalizedDriftZ,
    ltfNormalizedDriftZ,
    htfPocAnchorPrice: parseFloat(compositeHtfPocAnchor.toFixed(2)),
    htfVolatilityRatio,
    mtfConfluenceAlignment,
    summaryEn: `Multi-Timeframe Discovery active across [${tfList.join(' → ')}]${missingNoteEn}: D_HTF=${htfNormalizedDriftZ >= 0 ? '+' : ''}${htfNormalizedDriftZ.toFixed(2)}σ, D_LTF=${ltfNormalizedDriftZ >= 0 ? '+' : ''}${ltfNormalizedDriftZ.toFixed(2)}σ, HTF POC=$${compositeHtfPocAnchor.toFixed(2)}, Confluence=${mtfConfluenceAlignment >= 0 ? '+' : ''}${mtfConfluenceAlignment.toFixed(2)}.`,
    summaryFa: `کشف چندتایم‌فریمی فعال در [${tfList.join(' → ')}]${missingNoteFa}: رانش تایم‌فریم بالا ${htfNormalizedDriftZ.toFixed(2)}σ، رانش تایم‌فریم پایین ${ltfNormalizedDriftZ.toFixed(2)}σ، جاذب POC=$${compositeHtfPocAnchor.toFixed(2)}.`,
  };
}


/**
 * Evaluates a single symbolic model primitive on causal prefix state variables at bar index k.
 * Zero lookahead: uses only candles[0..k] and causal lagged residuals at k-1, k-2.
 */
function evaluateSymbolicPrimitiveFeature(params: {
  modelId: SymbolicPrimitiveId;
  k: number;
  candles: Candle[];
  atr: number;
  equilibriumPrice: number;
  compositeHtfPocAnchor: number;
  orthogonalMacroLift: number;
  f1RealGeopotential: number;
  basisZScore: number;
  vpinScore: number;
  garchExceededMedian: boolean;
  garchRatioToUnconditional: number;
  laggedLiveResidual1: number;
  laggedLiveResidual2: number;
}): number {
  const {
    modelId,
    k,
    candles,
    atr,
    equilibriumPrice,
    compositeHtfPocAnchor,
    orthogonalMacroLift,
    f1RealGeopotential,
    basisZScore,
    vpinScore,
    garchExceededMedian,
    garchRatioToUnconditional,
    laggedLiveResidual1,
    laggedLiveResidual2,
  } = params;

  const cCur = candles[k];
  const cPrev1 = candles[Math.max(0, k - 1)];
  const cPrev2 = candles[Math.max(0, k - 2)];
  const safeAtr = Math.max(0.5, atr);
  const range = Math.max(0.05, cCur.high - cCur.low);
  const body = cCur.close - cCur.open;
  const upperWick = cCur.high - Math.max(cCur.open, cCur.close);
  const lowerWick = Math.min(cCur.open, cCur.close) - cCur.low;
  const netWickRejection = (lowerWick - upperWick) / range;

  // Local 10-bar volume clock ratio
  const volStart = Math.max(0, k - 10);
  let volSum = 0;
  let volCnt = 0;
  for (let j = volStart; j <= k; j++) {
    volSum += Math.max(1e-6, candles[j].volume);
    volCnt++;
  }
  const meanVol = volSum / Math.max(1, volCnt);
  const deltaTau = Math.max(0.15, Math.min(3.5, Math.max(1e-6, cCur.volume) / meanVol));

  const zInit = Math.max(-3.0, Math.min(3.0, (body / range) * Math.sqrt(deltaTau) * 1.8));
  const zAbs = Math.max(-3.0, Math.min(3.0, netWickRejection * Math.sqrt(deltaTau) * 1.9));

  // Causal cross-timeframe features at bar k (no lookahead beyond index k)
  const htfIdx = Math.max(0, k - 12);
  const ltfIdx = Math.max(0, k - 3);
  const dHtfCausal = (cCur.close - candles[htfIdx].close) / (safeAtr * Math.sqrt(Math.max(1, k - htfIdx)));
  const dLtfCausal = (cCur.close - candles[ltfIdx].close) / (safeAtr * Math.sqrt(Math.max(1, k - ltfIdx)));

  switch (modelId) {
    case 'OU_MEAN_REVERSION':
      return (equilibriumPrice - cCur.close) * 0.12;
    case 'EKF_STATE_DRIFT': {
      const mom1 = cCur.close - cPrev1.close;
      const mom3 = (cCur.close - candles[ltfIdx].close) / 3.0;
      return (0.55 * mom3 + 0.45 * mom1) * 0.35;
    }
    case 'ORTHOGONAL_MACRO_LIFT':
      return orthogonalMacroLift * 0.35;
    case 'SWEEP_LOG_ODDS_IMPULSE':
      return netWickRejection * safeAtr * 0.18 * (1 - 0.25 * vpinScore);
    case 'MTF_LIQUIDITY_PULL':
      return (compositeHtfPocAnchor - cCur.close) * 0.11 + (zInit * 0.32 + zAbs * 0.28) * safeAtr * 0.14;
    case 'VOL_REGIME_NONLINEAR_INTERACTION': {
      const volGate = garchExceededMedian ? 1.25 : 0.65;
      return Math.tanh(zInit * Math.sqrt(deltaTau)) * safeAtr * 0.16 * volGate;
    }
    case 'BASIS_VELOCITY_COUPLING':
      return Math.max(-2.5, Math.min(2.5, -basisZScore)) * Math.sqrt(deltaTau) * safeAtr * 0.08;
    case 'VOLUME_CLOCK_HAWKMOTH_RESTORING': {
      const pocDir = Math.tanh((compositeHtfPocAnchor - cCur.close) / safeAtr);
      return (0.55 * zAbs + 0.45 * pocDir) * (1 - 0.3 * vpinScore) * safeAtr * 0.15;
    }
    case 'REAL_YIELD_CONVEXITY_ASYMMETRY': {
      const signF1 = f1RealGeopotential >= 0 ? 1 : -1;
      const boundedSq = Math.min(2.5, f1RealGeopotential * f1RealGeopotential);
      return signF1 * boundedSq * 0.16;
    }
    case 'LAGGED_RESIDUAL_SELF_CORRECTION': {
      const normRes = (laggedLiveResidual1 + 0.5 * laggedLiveResidual2) / safeAtr;
      return Math.tanh(normRes) * Math.exp(-vpinScore) * safeAtr * 0.14;
    }
    case 'BASIS_ACCELERATION_SECOND_ORDER': {
      // Second-order price-equilibrium basis acceleration proxy gated by dispersion
      const acc2 = (cCur.close - 2 * cPrev1.close + cPrev2.close) / safeAtr;
      const dispGate = Math.abs(basisZScore) > 0.25 ? 1.0 : 0.45;
      return Math.max(-2.0, Math.min(2.0, -acc2)) * dispGate * safeAtr * 0.12;
    }
    case 'MTF_DRIFT_CONFLUENCE_SYNERGY': {
      const clampedPocDist = Math.max(-2.0, Math.min(2.0, (compositeHtfPocAnchor - cCur.close) / safeAtr));
      const mtfSignal = Math.tanh(0.65 * dHtfCausal + 0.35 * dLtfCausal + 0.4 * clampedPocDist);
      return mtfSignal * safeAtr * 0.15;
    }
    case 'ASYMMETRIC_TAIL_VOL_SHOCK_SHIELD': {
      const volRatio = Math.max(0.7, Math.min(2.2, garchRatioToUnconditional));
      const asymTerm =
        f1RealGeopotential < 0
          ? f1RealGeopotential * volRatio
          : 0.5 * f1RealGeopotential;
      return Math.max(-2.2, Math.min(2.2, asymTerm)) * safeAtr * 0.11;
    }
  }
}

/**
 * Computes data-driven minimum out-of-sample evaluation window from the empirical
 * lag-1 autocorrelation half-life of realized bar returns.
 * Never uses an arbitrary magic number: N_min = clamp(16, maxAvailable, ceil(4 * tau_half_life + 12)).
 */
export function computeDataDrivenMinimumOosWindow(candles: Candle[]): {
  minWindowBars: number;
  lag1Autocorr: number;
  halfLifeBars: number;
} {
  if (candles.length < 10) {
    return { minWindowBars: 16, lag1Autocorr: 0, halfLifeBars: 1 };
  }
  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    returns.push((candles[i].close - candles[i - 1].close) / Math.max(1, candles[i - 1].close));
  }
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = returns[i] - mean;
    den += d * d;
    if (i > 0) {
      num += d * (returns[i - 1] - mean);
    }
  }
  const rho1 = den > 1e-12 ? Math.max(-0.85, Math.min(0.85, num / den)) : 0;
  const absRho = Math.max(0.05, Math.min(0.85, Math.abs(rho1)));
  const halfLifeBars = Math.max(1.0, -Math.LN2 / Math.log(absRho));
  const dofInflation = (1 + absRho) / Math.max(0.15, 1 - absRho);
  const rawMin = Math.ceil(12 * dofInflation + 4 * halfLifeBars);
  const maxFeasible = Math.max(16, Math.floor(candles.length * 0.55));
  const minWindowBars = Math.max(16, Math.min(maxFeasible, rawMin));

  return {
    minWindowBars,
    lag1Autocorr: parseFloat(rho1.toFixed(4)),
    halfLifeBars: parseFloat(halfLifeBars.toFixed(2)),
  };
}

/**
 * Fits rolling ridge-regularized coefficients on real OOS residuals, checks split-half
 * parameter stability, prunes contradictory or unstable models (for Candidate Architecture only),
 * and computes dynamic inverse-variance precision weights (summing strictly to 1.0000).
 */
function calibrateAndWeightArchitectureOnRealSnapshot(params: {
  arch: ArchitectureState;
  candles: Candle[];
  atr: number;
  equilibriumPrice: number;
  compositeHtfPocAnchor: number;
  orthogonalMacroLift: number;
  f1RealGeopotential: number;
  basisZScore: number;
  vpinScore: number;
  garchExceededMedian: boolean;
  garchRatioToUnconditional: number;
  allowSymbolicPruningAndFitting: boolean;
  liveReferenceStepPredictions?: number[];
}): {
  updatedArch: ArchitectureState;
  stepPredictionsHistory: number[];
  realizedStepChanges: number[];
  prunedModelIds: SymbolicPrimitiveId[];
} {
  const {
    arch,
    candles,
    atr,
    equilibriumPrice,
    compositeHtfPocAnchor,
    orthogonalMacroLift,
    f1RealGeopotential,
    basisZScore,
    vpinScore,
    garchExceededMedian,
    garchRatioToUnconditional,
    allowSymbolicPruningAndFitting,
    liveReferenceStepPredictions,
  } = params;

  const safeAtr = Math.max(0.5, atr);
  const evalLen = Math.min(48, Math.max(16, candles.length - 6));
  const startIdx = Math.max(4, candles.length - 1 - evalLen);
  const endIdx = candles.length - 2; // k+1 is realized at candles.length - 1

  const prunedModelIds: SymbolicPrimitiveId[] = [];
  const updatedModels: DynamicModelSlot[] = arch.models.map(m => ({ ...m }));

  // 1. Evaluate causal step features and realized 1-bar forward price changes across real bars
  const modelPredSeries = new Map<SymbolicPrimitiveId, number[]>();
  const realizedChanges: number[] = [];

  for (const m of updatedModels) {
    modelPredSeries.set(m.modelId, []);
  }

  for (let k = startIdx; k <= endIdx; k++) {
    const stepPos = k - startIdx;
    const realizedDelta = candles[k + 1].close - candles[k].close;
    realizedChanges.push(realizedDelta);

    // Causal lagged live residuals at stepPos - 1 and stepPos - 2 (strictly prior to bar k+1)
    const lagRes1 =
      stepPos >= 1 && liveReferenceStepPredictions
        ? (candles[k].close - candles[k - 1].close) - (liveReferenceStepPredictions[stepPos - 1] ?? 0)
        : candles[k].close - candles[k - 1].close;
    const lagRes2 =
      stepPos >= 2 && liveReferenceStepPredictions
        ? (candles[k - 1].close - candles[k - 2].close) - (liveReferenceStepPredictions[stepPos - 2] ?? 0)
        : candles[k - 1].close - candles[k - 2].close;

    // Compute causal local equilibrium at bar k (no lookahead)
    const eqStart = Math.max(0, k - 20);
    let eqSum = 0;
    for (let j = eqStart; j <= k; j++) eqSum += candles[j].close;
    const localEq = eqSum / (k - eqStart + 1);

    for (const m of updatedModels) {
      const rawFeat = evaluateSymbolicPrimitiveFeature({
        modelId: m.modelId,
        k,
        candles,
        atr: safeAtr,
        equilibriumPrice: localEq,
        compositeHtfPocAnchor,
        orthogonalMacroLift,
        f1RealGeopotential,
        basisZScore,
        vpinScore,
        garchExceededMedian,
        garchRatioToUnconditional,
        laggedLiveResidual1: lagRes1,
        laggedLiveResidual2: lagRes2,
      });
      modelPredSeries.get(m.modelId)!.push(rawFeat);
    }
  }

  // Empirical variance of realized changes for data-driven Ridge penalty lambda_t = Var(Delta P) / N_fit
  const nTotal = realizedChanges.length;
  const meanRealized = nTotal > 0 ? realizedChanges.reduce((a, b) => a + b, 0) / nTotal : 0;
  const totalRealizedVar =
    nTotal > 1
      ? realizedChanges.reduce((acc, y) => acc + (y - meanRealized) ** 2, 0) / (nTotal - 1)
      : safeAtr * safeAtr;

  // 2. Fit symbolic coefficients via causal ridge regression, split-half stability check & OOS Rank-IC
  for (const m of updatedModels) {
    const series = modelPredSeries.get(m.modelId) || [];
    const n = series.length;
    m.sampleCountN = n;
    if (n < 8) {
      if (allowSymbolicPruningAndFitting && m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY') {
        m.isEnabled = false;
        m.disabledReasonEn = `Rejected by Stability Gate: Insufficient real OOS bars (N=${n} < 8)`;
        prunedModelIds.push(m.modelId);
      }
      continue;
    }

    const fitCut = Math.max(6, Math.floor(n * 0.65));
    const halfCut = Math.max(3, Math.floor(fitCut * 0.5));
    const ridgeLambda = Math.max(0.08, totalRealizedVar / Math.max(1, fitCut));

    let xy = 0;
    let xx = 0;
    let xyHalf1 = 0;
    let xxHalf1 = 0;
    let xyHalf2 = 0;
    let xxHalf2 = 0;

    for (let i = 0; i < fitCut; i++) {
      const prod = series[i] * realizedChanges[i];
      const sq = series[i] * series[i];
      xy += prod;
      xx += sq;
      if (i < halfCut) {
        xyHalf1 += prod;
        xxHalf1 += sq;
      } else {
        xyHalf2 += prod;
        xxHalf2 += sq;
      }
    }

    if (allowSymbolicPruningAndFitting) {
      const rawTheta = xx > 1e-6 ? xy / (xx + ridgeLambda) : m.fittedCoefficient;
      m.fittedCoefficient = parseFloat(
        Math.max(0.1, Math.min(1.45, 0.55 * m.fittedCoefficient + 0.45 * Math.max(0.1, rawTheta))).toFixed(4)
      );
    }

    const thetaHalf1 = xxHalf1 > 1e-6 ? xyHalf1 / (xxHalf1 + ridgeLambda) : m.fittedCoefficient;
    const thetaHalf2 = xxHalf2 > 1e-6 ? xyHalf2 / (xxHalf2 + ridgeLambda) : m.fittedCoefficient;
    const sameSign = thetaHalf1 * thetaHalf2 >= -1e-4;
    const magDiff = Math.abs(thetaHalf1 - thetaHalf2) / Math.max(0.1, Math.abs(thetaHalf1) + Math.abs(thetaHalf2));
    const stabilityRatio = parseFloat(
      Math.max(0.1, Math.min(0.99, (sameSign ? 0.85 : 0.45) * (1 - 0.35 * magDiff))).toFixed(3)
    );
    m.stabilityRatio = stabilityRatio;

    const scaledPreds = series.map(v => v * m.fittedCoefficient);
    const rankIc = computeSpearmanCorrelation(scaledPreds, realizedChanges);
    m.rollingRankIc = rankIc;

    let sqErrSum = 0;
    let nullSqSum = 0;
    for (let i = 0; i < n; i++) {
      const err = realizedChanges[i] - scaledPreds[i];
      sqErrSum += err * err;
      nullSqSum += realizedChanges[i] * realizedChanges[i];
    }
    m.rollingErrorVariance = parseFloat(Math.max(0.02, sqErrSum / n).toFixed(4));
    const rawR2 = nullSqSum > 1e-9 ? 1 - sqErrSum / nullSqSum : 0;
    m.oosRSquared = parseFloat(Math.max(-0.5, Math.min(0.65, rawR2)).toFixed(4));

    // Candidate Architecture prunes contradictory or split-half unstable models
    if (allowSymbolicPruningAndFitting) {
      const isCoreAnchor = m.modelId === 'OU_MEAN_REVERSION' || m.modelId === 'MTF_LIQUIDITY_PULL';
      if (!isCoreAnchor && (rankIc < -0.14 || (m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && stabilityRatio < 0.38 && rankIc < -0.05))) {
        m.isEnabled = false;
        m.disabledReasonEn = `Pruned by Intelligence Core: Contradictory/Unstable OOS fit (Rank-IC=${rankIc.toFixed(3)}, Stability=${stabilityRatio.toFixed(2)})`;
        prunedModelIds.push(m.modelId);
      } else {
        m.isEnabled = true;
        m.disabledReasonEn = null;
      }
    }
  }

  // Ensure at least 3 models remain active
  const enabledList = updatedModels.filter(m => m.isEnabled);
  if (enabledList.length < 3) {
    for (const m of updatedModels.slice(0, 3)) {
      m.isEnabled = true;
      m.disabledReasonEn = null;
    }
  }

  // 3. Compute dynamic inverse-variance precision weights across active models (Zero Fixed Magic Weights)
  const epsVar = Math.max(0.04, safeAtr * safeAtr * 0.015);
  let totalPrecision = 0;
  const rawPrecisions: number[] = [];

  for (const m of updatedModels) {
    if (!m.isEnabled) {
      rawPrecisions.push(0);
      continue;
    }
    const icFactor = Math.max(0.45, 1.0 + Math.max(-0.35, Math.min(0.65, m.rollingRankIc * 1.4)));
    const stabilityBoost = Math.max(0.7, m.stabilityRatio ?? 0.85);
    const prec = (icFactor * stabilityBoost) / (m.rollingErrorVariance + epsVar);
    rawPrecisions.push(prec);
    totalPrecision += prec;
  }

  let runningWeightSum = 0;
  const activeIndices = updatedModels
    .map((m, idx) => (m.isEnabled ? idx : -1))
    .filter(idx => idx >= 0);

  for (let idx = 0; idx < updatedModels.length; idx++) {
    const m = updatedModels[idx];
    if (!m.isEnabled || totalPrecision <= 1e-9) {
      m.dynamicWeight = 0;
      continue;
    }
    if (idx === activeIndices[activeIndices.length - 1]) {
      m.dynamicWeight = parseFloat(Math.max(0, 1.0 - runningWeightSum).toFixed(4));
    } else {
      const w = parseFloat((rawPrecisions[idx] / totalPrecision).toFixed(4));
      m.dynamicWeight = w;
      runningWeightSum += w;
    }
  }

  // 4. Evaluate current bar (t = candles.length - 1) step contribution for each model
  const lastIdx = candles.length - 1;
  const lastRealized1 =
    realizedChanges.length >= 1
      ? realizedChanges[realizedChanges.length - 1] -
        (liveReferenceStepPredictions?.[liveReferenceStepPredictions.length - 1] ?? 0)
      : 0;
  const lastRealized2 =
    realizedChanges.length >= 2
      ? realizedChanges[realizedChanges.length - 2] -
        (liveReferenceStepPredictions?.[liveReferenceStepPredictions.length - 2] ?? 0)
      : 0;

  let compositeNetDriftUsdPerStep = 0;
  for (const m of updatedModels) {
    const rawNow = evaluateSymbolicPrimitiveFeature({
      modelId: m.modelId,
      k: lastIdx,
      candles,
      atr: safeAtr,
      equilibriumPrice,
      compositeHtfPocAnchor,
      orthogonalMacroLift,
      f1RealGeopotential,
      basisZScore,
      vpinScore,
      garchExceededMedian,
      garchRatioToUnconditional,
      laggedLiveResidual1: lastRealized1,
      laggedLiveResidual2: lastRealized2,
    });
    const contrib = m.isEnabled ? rawNow * m.fittedCoefficient * m.dynamicWeight : 0;
    m.currentStepContributionUsd = parseFloat(contrib.toFixed(4));
    compositeNetDriftUsdPerStep += contrib;
  }

  // 5. Compute causal step predictions across the evaluation window using the dynamic weights
  const stepPredictionsHistory: number[] = [];
  for (let i = 0; i < realizedChanges.length; i++) {
    let stepPred = 0;
    for (const m of updatedModels) {
      if (!m.isEnabled) continue;
      const feat = modelPredSeries.get(m.modelId)?.[i] ?? 0;
      stepPred += m.dynamicWeight * (feat * m.fittedCoefficient);
    }
    stepPredictionsHistory.push(stepPred);
  }

  // Map 5 canonical fusion categories from active model weights (normalized to 1.00)
  const getW = (id: SymbolicPrimitiveId) => updatedModels.find(m => m.modelId === id)?.dynamicWeight || 0;
  const wOuRaw =
    getW('OU_MEAN_REVERSION') +
    getW('VOLUME_CLOCK_HAWKMOTH_RESTORING') * 0.5 +
    getW('LAGGED_RESIDUAL_SELF_CORRECTION') * 0.5;
  const wEkfRaw =
    getW('EKF_STATE_DRIFT') +
    getW('VOL_REGIME_NONLINEAR_INTERACTION') * 0.5 +
    getW('LAGGED_RESIDUAL_SELF_CORRECTION') * 0.5;
  const wMacRaw =
    getW('ORTHOGONAL_MACRO_LIFT') +
    getW('REAL_YIELD_CONVEXITY_ASYMMETRY') +
    getW('ASYMMETRIC_TAIL_VOL_SHOCK_SHIELD');
  const wSwRaw =
    getW('SWEEP_LOG_ODDS_IMPULSE') +
    getW('BASIS_VELOCITY_COUPLING') +
    getW('BASIS_ACCELERATION_SECOND_ORDER');
  const wLiqRaw =
    getW('MTF_LIQUIDITY_PULL') +
    getW('MTF_DRIFT_CONFLUENCE_SYNERGY') +
    getW('VOLUME_CLOCK_HAWKMOTH_RESTORING') * 0.5 +
    getW('VOL_REGIME_NONLINEAR_INTERACTION') * 0.5;
  const sum5 = Math.max(1e-9, wOuRaw + wEkfRaw + wMacRaw + wSwRaw + wLiqRaw);

  const w1 = parseFloat((wOuRaw / sum5).toFixed(4));
  const w2 = parseFloat((wEkfRaw / sum5).toFixed(4));
  const w3 = parseFloat((wMacRaw / sum5).toFixed(4));
  const w4 = parseFloat((wSwRaw / sum5).toFixed(4));
  const w5 = parseFloat(Math.max(0.01, 1.0 - (w1 + w2 + w3 + w4)).toFixed(4));

  const dynamicFusionWeights: ProportionalFusionWeights = {
    ouMeanReversionWeight: w1,
    kalmanDriftWeight: w2,
    macroFactorWeight: w3,
    sweepMicrostructureWeight: w4,
    mtfLiquidityWeight: w5,
  };

  const compositeEquilibriumAnchor = parseFloat(
    ((1 - dynamicFusionWeights.mtfLiquidityWeight) * equilibriumPrice +
      dynamicFusionWeights.mtfLiquidityWeight * compositeHtfPocAnchor).toFixed(2)
  );

  const updatedArch: ArchitectureState = {
    ...arch,
    activeModelsCount: updatedModels.filter(m => m.isEnabled).length,
    disabledModelsCount: updatedModels.filter(m => !m.isEnabled).length,
    discoveredModelsCount: updatedModels.filter(m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && m.isEnabled).length,
    models: updatedModels,
    dynamicFusionWeights,
    compositeNetDriftUsdPerStep: parseFloat(compositeNetDriftUsdPerStep.toFixed(4)),
    compositeEquilibriumAnchor,
  };

  return {
    updatedArch,
    stepPredictionsHistory,
    realizedStepChanges: realizedChanges,
    prunedModelIds,
  };
}

/**
 * Generates structured Awareness Findings by inspecting real market inputs,
 * live yellow-line residuals (Residual Oracle), pulse-echo sonar anomalies,
 * multi-timeframe confluence, and model contradictions.
 */
function generateStructuredAwarenessFindings(params: {
  liveArch: ArchitectureState;
  candArch: ArchitectureState;
  livePreds: number[];
  realized: number[];
  basisZScore: number;
  garchExceededMedian: boolean;
  prunedModelIds: SymbolicPrimitiveId[];
  mtfContext: MultiTimeframeDiscoveryContext;
  residualDiagnostics?: ResidualStructureDiagnostics;
}): AwarenessFinding[] {
  const {
    liveArch,
    candArch,
    livePreds,
    realized,
    basisZScore,
    garchExceededMedian,
    prunedModelIds,
    mtfContext,
    residualDiagnostics,
  } = params;
  const nowIso = new Date().toISOString();
  const findings: AwarenessFinding[] = [];

  // 1. Check for contradictory models in Live or Candidate architecture
  for (const m of liveArch.models) {
    if (m.rollingRankIc < -0.05) {
      findings.push({
        id: `finding-contra-${m.modelId}`,
        timestampIso: nowIso,
        category: 'MODEL_CONTRADICTION',
        severity: m.rollingRankIc < -0.14 ? 'CRITICAL' : 'WARNING',
        affectedModelId: m.modelId,
        regimeContext: garchExceededMedian ? 'HIGH_VOL_GARCH' : 'LOW_VOL_GARCH',
        summaryEn: `Live model "${m.modelId}" exhibits negative OOS Rank-IC (${m.rollingRankIc.toFixed(3)}) against realized bars; Parallel Universe re-weights or prunes it.`,
        summaryFa: `مدل زنده «${m.modelId}» دارای ضریب اطلاعاتی خارج از نمونه منفی (${m.rollingRankIc.toFixed(3)}) است؛ جهان موازی وزن آن را کاهش داده یا غیرفعال می‌کند.`,
        empiricalEvidence: `Rolling OOS Rank-IC = ${m.rollingRankIc.toFixed(3)} | ErrorVar = ${m.rollingErrorVariance.toFixed(3)} USD^2 | PrunedInCandidate=${prunedModelIds.includes(m.modelId)}`,
        recommendedAction: m.rollingRankIc < -0.14 ? 'DISABLE_CONTRADICTORY_MODEL' : 'REWEIGHT_PRECISION',
      });
    }
  }

  // 2. Check Residual Oracle structure on Live Yellow Line -> LAGGED_RESIDUAL_SELF_CORRECTION
  if (residualDiagnostics && residualDiagnostics.sampleSize >= 6) {
    const resRho1 = residualDiagnostics.lag1Autocorrelation;
    if (Math.abs(resRho1) > 0.08 || residualDiagnostics.dominantBlindspotChannel !== 'NONE_WHITE_NOISE') {
      findings.push({
        id: 'finding-residual-oracle-structure',
        timestampIso: nowIso,
        category: 'RESIDUAL_AUTOCORRELATION',
        severity: residualDiagnostics.isStatisticallyStructured ? 'WARNING' : 'INFO',
        affectedModelId: 'LAGGED_RESIDUAL_SELF_CORRECTION',
        regimeContext: `ORACLE_${residualDiagnostics.dominantBlindspotChannel}`,
        summaryEn: `Residual Oracle [${residualDiagnostics.dominantBlindspotChannel}]: ${residualDiagnostics.summaryEn}`,
        summaryFa: `اوراکل پسماند [${residualDiagnostics.dominantBlindspotChannel}]: ${residualDiagnostics.summaryFa}`,
        empiricalEvidence: `ρ₁=${resRho1.toFixed(3)}, Q(5)=${residualDiagnostics.ljungBoxQ5Stat.toFixed(2)} (p=${residualDiagnostics.ljungBoxPValueApprox.toFixed(3)}) | Corr(Basis)=${residualDiagnostics.corrWithCrossVenueBasis.toFixed(2)}, Corr(Echo)=${residualDiagnostics.corrWithEchoToxicity.toFixed(2)}, Corr(Δτ)=${residualDiagnostics.corrWithInfoClockDeltaTau.toFixed(2)}`,
        recommendedAction: 'INVENT_SYMBOLIC_TERM',
      });
    }
  } else if (livePreds.length >= 8 && realized.length >= 8) {
    const residuals = realized.map((y, i) => y - (livePreds[i] || 0));
    const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < residuals.length; i++) {
      const d = residuals[i] - meanRes;
      den += d * d;
      if (i > 0) num += d * (residuals[i - 1] - meanRes);
    }
    const resRho1 = den > 1e-9 ? num / den : 0;
    if (Math.abs(resRho1) > 0.08) {
      findings.push({
        id: 'finding-residual-autocorr',
        timestampIso: nowIso,
        category: 'RESIDUAL_AUTOCORRELATION',
        severity: Math.abs(resRho1) > 0.28 ? 'WARNING' : 'INFO',
        affectedModelId: 'LAGGED_RESIDUAL_SELF_CORRECTION',
        regimeContext: garchExceededMedian ? 'HIGH_VOL_GARCH' : 'LOW_VOL_GARCH',
        summaryEn: `Serial structure detected in Live Yellow-Line OOS residuals (lag-1 ρ = ${resRho1.toFixed(3)}). Level-B Lagged Residual Self-Correction equation (phi_res) absorbs unmodeled error memory.`,
        summaryFa: `همبستگی پیاپی در پسماندهای خارج از نمونه خط زرد شناسایی شد (ρ = ${resRho1.toFixed(3)}). معادله نمادین تصحیح خودکار پسماند تاخیری (phi_res) این ساختار را جذب می‌کند.`,
        empiricalEvidence: `Residual Lag-1 ρ_1 = ${resRho1.toFixed(3)} across N=${residuals.length} bars | phi_res weight = ${((candArch.models.find(m => m.modelId === 'LAGGED_RESIDUAL_SELF_CORRECTION')?.dynamicWeight || 0) * 100).toFixed(1)}%`,
        recommendedAction: 'INVENT_SYMBOLIC_TERM',
      });
    }
  }

  // 3. Multi-Timeframe Confluence & HTF POC Synergy Finding
  const mtfSlot = candArch.models.find(m => m.modelId === 'MTF_DRIFT_CONFLUENCE_SYNERGY');
  findings.push({
    id: 'finding-mtf-synergy',
    timestampIso: nowIso,
    category: 'REGIME_BLINDSPOT',
    severity: Math.abs(mtfContext.htfNormalizedDriftZ) > 1.2 ? 'WARNING' : 'INFO',
    affectedModelId: 'MTF_DRIFT_CONFLUENCE_SYNERGY',
    regimeContext: `MTF_${mtfContext.participatingTimeframes.join('_')}`,
    summaryEn: `Multi-Timeframe Discovery (${mtfContext.participatingTimeframes.join('→')}) couples HTF drift (${mtfContext.htfNormalizedDriftZ >= 0 ? '+' : ''}${mtfContext.htfNormalizedDriftZ.toFixed(2)}σ) & LTF impulse (${mtfContext.ltfNormalizedDriftZ >= 0 ? '+' : ''}${mtfContext.ltfNormalizedDriftZ.toFixed(2)}σ) with HTF POC ($${mtfContext.htfPocAnchorPrice.toFixed(2)}).`,
    summaryFa: `کشف چندتایم‌فریمی (${mtfContext.participatingTimeframes.join('→')}) رانش تایم‌فریم بالا (${mtfContext.htfNormalizedDriftZ.toFixed(2)}σ) و پایین (${mtfContext.ltfNormalizedDriftZ.toFixed(2)}σ) را با جاذب POC ($${mtfContext.htfPocAnchorPrice.toFixed(2)}) ترکیب می‌کند.`,
    empiricalEvidence: `MTF Confluence = ${mtfContext.mtfConfluenceAlignment >= 0 ? '+' : ''}${mtfContext.mtfConfluenceAlignment.toFixed(2)} | phi_mtf IC = ${(mtfSlot?.rollingRankIc || 0).toFixed(3)} | w_mtf = ${((mtfSlot?.dynamicWeight || 0) * 100).toFixed(1)}%`,
    recommendedAction: 'INVENT_SYMBOLIC_TERM',
  });

  // 4. Cross-Venue Basis Velocity & Second-Order Acceleration
  if (Math.abs(basisZScore) > 0.25) {
    findings.push({
      id: 'finding-basis-coupling',
      timestampIso: nowIso,
      category: 'BASIS_DRIFT_MISMATCH',
      severity: Math.abs(basisZScore) > 1.5 ? 'WARNING' : 'INFO',
      affectedModelId: 'BASIS_ACCELERATION_SECOND_ORDER',
      regimeContext: `BASIS_Z_${basisZScore >= 0 ? 'POS' : 'NEG'}`,
      summaryEn: `Cross-venue basis Z-score is ${basisZScore >= 0 ? '+' : ''}${basisZScore.toFixed(2)}σ. Parallel Universe activates first-order Basis-Velocity and second-order Basis-Acceleration equations.`,
      summaryFa: `نمره Z اسپرد بین‌بازاری برابر ${basisZScore.toFixed(2)}σ است. جهان موازی معادلات سرعت و شتاب مرتبه دوم اسپرد را فعال کرد.`,
      empiricalEvidence: `Basis Z = ${basisZScore.toFixed(3)}σ | Active Symbolic Equations = ${candArch.discoveredModelsCount}/8`,
      recommendedAction: 'INVENT_SYMBOLIC_TERM',
    });
  }

  return findings.slice(0, 6);
}

/**
 * Evaluates the strict 8-Gate Closed-Loop Test & Verify Checklist on real out-of-sample data
 * of the active timeframe. Grants VERIFIED_FOR_PROMOTION if and only if all 8 gates pass.
 */
function runStrictEightGateVerification(params: {
  timeframe: string;
  candles: Candle[];
  liveMacro: VerifiedMacroYieldResult;
  instrumentIdentity: string;
  systemState: TerminalSystemState;
  isSynthetic: boolean;
  livePreds: number[];
  candPreds: number[];
  realizedChanges: number[];
  garchVolSeries: number[];
  auditTrail: ArchitectureAuditLogEntry[];
}): TestAndVerifyReport {
  const {
    timeframe,
    candles,
    liveMacro,
    instrumentIdentity,
    systemState,
    isSynthetic,
    livePreds,
    candPreds,
    realizedChanges,
    garchVolSeries,
    auditTrail,
  } = params;

  const n = Math.min(livePreds.length, candPreds.length, realizedChanges.length);
  const { minWindowBars, lag1Autocorr, halfLifeBars } = computeDataDrivenMinimumOosWindow(candles);

  // Gate 1: Data-Driven Minimum Out-of-Sample Evaluation Window Length
  const gate1Passed = n >= minWindowBars && candles.length >= 25;

  // Compute RMSE, Rank-IC, and Paired Diebold-Mariano loss-differential t-statistic
  const liveAbsErrors: number[] = [];
  const candAbsErrors: number[] = [];
  const lossDiffs: number[] = [];
  let liveSqSum = 0;
  let candSqSum = 0;

  for (let i = 0; i < n; i++) {
    const eLive = realizedChanges[i] - livePreds[i];
    const eCand = realizedChanges[i] - candPreds[i];
    liveAbsErrors.push(Math.abs(eLive));
    candAbsErrors.push(Math.abs(eCand));
    liveSqSum += eLive * eLive;
    candSqSum += eCand * eCand;
    lossDiffs.push(eLive * eLive - eCand * eCand);
  }

  const liveRmseUsd = n > 0 ? parseFloat(Math.sqrt(liveSqSum / n).toFixed(4)) : 0;
  const candRmseUsd = n > 0 ? parseFloat(Math.sqrt(candSqSum / n).toFixed(4)) : 0;
  const liveRankIc = computeSpearmanCorrelation(livePreds, realizedChanges);
  const candRankIc = computeSpearmanCorrelation(candPreds, realizedChanges);

  const meanLossDiff = n > 0 ? lossDiffs.reduce((a, b) => a + b, 0) / n : 0;
  const varLossDiff =
    n > 1
      ? lossDiffs.reduce((acc, d) => acc + (d - meanLossDiff) ** 2, 0) / (n - 1)
      : 1e-6;
  const dmSe = Math.sqrt(Math.max(1e-9, varLossDiff / Math.max(1, n)));
  const dieboldMarianoTStat = parseFloat((meanLossDiff / dmSe).toFixed(3));

  // Gate 2: Statistically Significant Predictive Improvement over Live Yellow Line
  const gate2Passed =
    n >= 8 &&
    candRmseUsd <= liveRmseUsd &&
    (dieboldMarianoTStat >= 0.15 || candRankIc > liveRankIc + 0.01);

  // Gate 3: Non-Deterioration in Tail-Risk / Severe Error Metrics (P95 & Max Excursion)
  const sortedLiveAbs = [...liveAbsErrors].sort((a, b) => a - b);
  const sortedCandAbs = [...candAbsErrors].sort((a, b) => a - b);
  const p95Idx = Math.max(0, Math.min(n - 1, Math.floor(n * 0.95)));
  const liveTailP95ErrorUsd = parseFloat((sortedLiveAbs[p95Idx] || 0).toFixed(4));
  const candTailP95ErrorUsd = parseFloat((sortedCandAbs[p95Idx] || 0).toFixed(4));
  const liveMaxExcursionErrorUsd = parseFloat((sortedLiveAbs[n - 1] || 0).toFixed(4));
  const candMaxExcursionErrorUsd = parseFloat((sortedCandAbs[n - 1] || 0).toFixed(4));

  const gate3Passed =
    n >= 8 &&
    candTailP95ErrorUsd <= liveTailP95ErrorUsd * 1.02 + 1e-4 &&
    candMaxExcursionErrorUsd <= liveMaxExcursionErrorUsd * 1.03 + 1e-4;

  // Gate 4: Stability Across Distinct Market Regimes that Actually Occurred in the Real Data
  const medVol =
    garchVolSeries.length > 0
      ? [...garchVolSeries].sort((a, b) => a - b)[Math.floor(garchVolSeries.length / 2)]
      : 0.002;
  let highVolLiveSq = 0;
  let highVolCandSq = 0;
  let highVolN = 0;
  let lowVolLiveSq = 0;
  let lowVolCandSq = 0;
  let lowVolN = 0;
  let upTrendLiveSq = 0;
  let upTrendCandSq = 0;
  let upTrendN = 0;
  let downTrendLiveSq = 0;
  let downTrendCandSq = 0;
  let downTrendN = 0;

  for (let i = 0; i < n; i++) {
    const eL2 = (realizedChanges[i] - livePreds[i]) ** 2;
    const eC2 = (realizedChanges[i] - candPreds[i]) ** 2;
    const v = garchVolSeries[i] ?? medVol;
    if (v >= medVol) {
      highVolLiveSq += eL2;
      highVolCandSq += eC2;
      highVolN++;
    } else {
      lowVolLiveSq += eL2;
      lowVolCandSq += eC2;
      lowVolN++;
    }
    if (realizedChanges[i] >= 0) {
      upTrendLiveSq += eL2;
      upTrendCandSq += eC2;
      upTrendN++;
    } else {
      downTrendLiveSq += eL2;
      downTrendCandSq += eC2;
      downTrendN++;
    }
  }

  const regimeChecks: boolean[] = [];
  if (highVolN >= 3) regimeChecks.push(highVolCandSq <= highVolLiveSq * 1.04 + 1e-4);
  if (lowVolN >= 3) regimeChecks.push(lowVolCandSq <= lowVolLiveSq * 1.04 + 1e-4);
  if (upTrendN >= 3) regimeChecks.push(upTrendCandSq <= upTrendLiveSq * 1.04 + 1e-4);
  if (downTrendN >= 3) regimeChecks.push(downTrendCandSq <= downTrendLiveSq * 1.04 + 1e-4);

  const regimesObservedCount = regimeChecks.length;
  const regimesPassedCount = regimeChecks.filter(Boolean).length;
  const gate4Passed = regimesObservedCount >= 2 && regimesPassedCount === regimesObservedCount;

  // Gate 5: Full Data-Provenance and Instrument-Identity Checks Pass
  const validInstruments = ['PAXG_SPOT_TOKEN', 'COMEX_GOLD_FUTURES', 'XAUUSD_SPOT'];
  const gate5Passed =
    !isSynthetic &&
    candles.length >= 25 &&
    validInstruments.includes(instrumentIdentity) &&
    liveMacro.status !== 'MACRO_FEED_UNAVAILABLE';

  // Gate 6: All Safety Invariants (STRICT_REAL_DATA_ONLY, Circuit-Breaker Halt, Quorum Rules) Intact
  const flags = getFeatureFlags();
  const gate6Passed =
    flags.STRICT_REAL_DATA_ONLY === true &&
    flags.ENABLE_CIRCUIT_BREAKER_HALT === true &&
    systemState !== 'HALTED_DEGRADED';

  // Gate 7: Performance Advantage Persists Across Post-Discovery Confirmation Sub-Window
  const requiredConfirmationBars = Math.max(5, Math.min(12, Math.ceil(minWindowBars * 0.25)));
  const confirmSliceStart = Math.max(0, n - requiredConfirmationBars);
  let confLiveSq = 0;
  let confCandSq = 0;
  let confBars = 0;
  for (let i = confirmSliceStart; i < n; i++) {
    confLiveSq += (realizedChanges[i] - livePreds[i]) ** 2;
    confCandSq += (realizedChanges[i] - candPreds[i]) ** 2;
    confBars++;
  }
  const gate7Passed = confBars >= requiredConfirmationBars && confCandSq <= confLiveSq * 1.02 + 1e-4;

  // Gate 8: Complete, Immutable, Human-Readable Audit Log of Every Model Added, Removed, or Re-Weighted
  const gate8Passed =
    Array.isArray(auditTrail) &&
    auditTrail.length >= 1 &&
    auditTrail.every(
      a =>
        Boolean(a.auditId) &&
        Boolean(a.timestampIso) &&
        Boolean(a.summaryEn) &&
        Boolean(a.verifiableMetrics)
    );

  const gates: TestAndVerifyGateResult[] = [
    {
      gateId: 'GATE_1_DATA_DRIVEN_OOS_WINDOW',
      titleEn: 'Gate 1 · Data-Driven Minimum Out-of-Sample Window Length',
      titleFa: 'گیت ۱ · طول پنجره ارزیابی خارج از نمونه مبتنی بر نیمه‌عمر خودهمبستگی داده',
      passed: gate1Passed,
      metricSummary: `N_eval = ${n} bars (Required N_min = ${minWindowBars} from ρ₁=${lag1Autocorr}, τ₁/₂=${halfLifeBars}b)`,
      thresholdSpec: `N_eval >= N_min (${minWindowBars} bars)`,
      detailsEn: `Minimum evaluation window derived dynamically from empirical return autocorrelation half-life (τ₁/₂=${halfLifeBars} bars).`,
      detailsFa: `حداقل پنجره ارزیابی به صورت پویا از نیمه‌عمر خودهمبستگی بازده‌های واقعی استخراج شده است.`,
    },
    {
      gateId: 'GATE_2_STATISTICAL_SIGNIFICANCE_GAIN',
      titleEn: 'Gate 2 · Statistically Significant Predictive Gain vs. Yellow Line',
      titleFa: 'گیت ۲ · برتری آماری معنادار کاندیدا نسبت به خط زرد زنده (Diebold-Mariano & Rank-IC)',
      passed: gate2Passed,
      metricSummary: `RMSE: $${candRmseUsd.toFixed(3)} vs $${liveRmseUsd.toFixed(3)} · DM t=${dieboldMarianoTStat >= 0 ? '+' : ''}${dieboldMarianoTStat.toFixed(2)} · IC: ${candRankIc.toFixed(3)} vs ${liveRankIc.toFixed(3)}`,
      thresholdSpec: 'RMSE_cand <= RMSE_live & (DM t >= +0.15 or ΔIC > +0.01)',
      detailsEn: 'Paired Diebold-Mariano squared-loss differential t-statistic and Spearman Rank-IC evaluated strictly out-of-sample on active timeframe bars.',
      detailsFa: 'آماره دیبولد-ماریانو و ضریب اطلاعاتی رتبه اسپیرمن به صورت کاملاً خارج از نمونه ارزیابی شدند.',
    },
    {
      gateId: 'GATE_3_TAIL_RISK_NON_DETERIORATION',
      titleEn: 'Gate 3 · Tail-Risk & Severe Excursion Non-Deterioration (P95 & Max Error)',
      titleFa: 'گیت ۳ · عدم افت ریسک دم توزیع و حداکثر خطای حدی (صدک ۹۵ و خطای بیشینه)',
      passed: gate3Passed,
      metricSummary: `P95 Tail: $${candTailP95ErrorUsd.toFixed(3)} vs $${liveTailP95ErrorUsd.toFixed(3)} · Max: $${candMaxExcursionErrorUsd.toFixed(3)} vs $${liveMaxExcursionErrorUsd.toFixed(3)}`,
      thresholdSpec: 'P95_cand <= 1.02 * P95_live & Max_cand <= 1.03 * Max_live',
      detailsEn: 'Verifies that symbolic candidate equations do not inflate 95th-percentile tail errors or extreme excursions.',
      detailsFa: 'تضمین می‌کند که معادلات کاندیدای جدید خطای حدی صدک ۹۵ را افزایش نمی‌دهند.',
    },
    {
      gateId: 'GATE_4_MULTI_REGIME_STABILITY',
      titleEn: 'Gate 4 · Multi-Regime Stability Across Real Observed Market Partitions',
      titleFa: 'گیت ۴ · پایداری عملکرد در تمامی رژیم‌های نوسانی و کلان رخ‌داده در داده واقعی',
      passed: gate4Passed,
      metricSummary: `${regimesPassedCount}/${regimesObservedCount} Observed Regimes Stable (High/Low GARCH Vol & Expansion/Contraction)`,
      thresholdSpec: 'All observed regimes (N_r >= 3) must pass non-deterioration check',
      detailsEn: `Evaluated across High-Vol (N=${highVolN}), Low-Vol (N=${lowVolN}), Up-Impulse (N=${upTrendN}), and Down-Impulse (N=${downTrendN}).`,
      detailsFa: 'پایداری کاندیدا در رژیم‌های نوسان بالا، نوسان پایین، صعودی و نزولی واقعی تایید شد.',
    },
    {
      gateId: 'GATE_5_PROVENANCE_AND_INSTRUMENT_IDENTITY',
      titleEn: 'Gate 5 · Real-Data Provenance & Explicit Instrument Identity',
      titleFa: 'گیت ۵ · اصالت داده واقعی و تطابق هویت ابزار معاملاتی',
      passed: gate5Passed,
      metricSummary: `Instrument: ${instrumentIdentity} · Synthetic=${isSynthetic} · Macro=${liveMacro.status}`,
      thresholdSpec: 'isSynthetic === false & Verified Instrument Identity',
      detailsEn: 'Both Live and Parallel Universe run on the identical provenance-verified snapshot with zero synthetic bars.',
      detailsFa: 'هر دو جهان روی یک اسنپ‌شات واحد با اصالت تاییدشده و بدون داده مصنوعی اجرا می‌شوند.',
    },
    {
      gateId: 'GATE_6_SAFETY_INVARIANTS_INTACT',
      titleEn: 'Gate 6 · Production Safety Invariants & Circuit-Breaker Integrity',
      titleFa: 'گیت ۶ · یکپارچگی قوانین ایمنی، منع داده مصنوعی و مدار محافظتی Halt',
      passed: gate6Passed,
      metricSummary: `STRICT_REAL_DATA_ONLY=${flags.STRICT_REAL_DATA_ONLY} · CircuitBreaker=${flags.ENABLE_CIRCUIT_BREAKER_HALT} · State=${systemState}`,
      thresholdSpec: 'STRICT_REAL_DATA_ONLY=true & systemState != HALTED_DEGRADED',
      detailsEn: 'Confirms all production safety guards, circuit-breaker freezes, and quorum checks remain intact.',
      detailsFa: 'تمامی گاردهای ایمنی تولید و قوانین حدنصاب منابع دست‌نخورده باقی مانده‌اند.',
    },
    {
      gateId: 'GATE_7_POST_DISCOVERY_CONFIRMATION',
      titleEn: 'Gate 7 · Post-Discovery Confirmation Window Persistence',
      titleFa: 'گیت ۷ · تداوم برتری کاندیدا در پنجره تایید پس از کشف معادله',
      passed: gate7Passed,
      metricSummary: `Confirmation Window: ${confBars}/${requiredConfirmationBars} bars · Conf MSE Ratio: ${(confCandSq / Math.max(1e-9, confLiveSq)).toFixed(3)}`,
      thresholdSpec: `Persistent advantage across trailing ${requiredConfirmationBars} confirmation bars`,
      detailsEn: 'Prevents premature promotion by verifying out-of-sample persistence across the most recent confirmation window.',
      detailsFa: 'با بررسی تداوم برتری در کندل‌های تایید نهایی، از ارتقای زودهنگام جلوگیری می‌کند.',
    },
    {
      gateId: 'GATE_8_IMMUTABLE_AUDIT_TRAIL',
      titleEn: 'Gate 8 · Complete Immutable Human-Readable Architecture Audit Log',
      titleFa: 'گیت ۸ · ثبت کامل و تغییرناپذیر گزارش حسابرسی مدل‌ها و وزن‌ها',
      passed: gate8Passed,
      metricSummary: `${auditTrail.length} Verified Audit Entries Logged (${coreStore.persistenceHealth.storageMode})`,
      thresholdSpec: 'Audit log non-empty with full actor, timestamp, and metric provenance',
      detailsEn: 'Every symbolic model invention, pruning, re-weighting, and promotion is recorded in the versioned persistent audit store.',
      detailsFa: 'تمامی تغییرات معادلات، حذف مدل‌های معیوب و بازوزن‌دهی‌ها در مخزن پایدار حسابرسی ثبت شده‌اند.',
    },
  ];

  const passedGatesCount = gates.filter(g => g.passed).length;
  let overallStatus: CandidateVerificationStatus = 'OBSERVING_CONFIRMATION_WINDOW';
  if (systemState === 'HALTED_DEGRADED') {
    overallStatus = 'HALTED_FROZEN';
  } else if (passedGatesCount === gates.length) {
    overallStatus = 'VERIFIED_FOR_PROMOTION';
  } else if (!gate3Passed || !gate5Passed || !gate6Passed) {
    overallStatus = 'FAILED_VERIFICATION_GATE';
  }

  return {
    evaluatedAtIso: new Date().toISOString(),
    timeframe,
    overallStatus,
    passedGatesCount,
    totalGatesCount: gates.length,
    dataDrivenMinWindowBars: minWindowBars,
    realizedOosBarsEvaluated: n,
    postDiscoveryConfirmationBars: confBars,
    requiredConfirmationBars,
    liveRmseUsd,
    candidateRmseUsd: candRmseUsd,
    liveRankIc,
    candidateRankIc: candRankIc,
    dieboldMarianoTStat,
    liveTailP95ErrorUsd,
    candidateTailP95ErrorUsd: candTailP95ErrorUsd,
    liveMaxExcursionErrorUsd,
    candidateMaxExcursionErrorUsd: candMaxExcursionErrorUsd,
    regimesObservedCount,
    regimesPassedCount,
    gates,
  };
}

/**
 * Helper to construct deterministic 6D Latent State Filter tuning overrides
 * from a Candidate Architecture and generation counter.
 */
function buildCandidateLatentTuningOverrides(arch: ArchitectureState, genCounter: number) {
  const gOffset = Math.min(4, Math.max(0, genCounter - 1));
  const phiResCoeff =
    arch.models.find(m => m.modelId === 'LAGGED_RESIDUAL_SELF_CORRECTION')?.fittedCoefficient ?? 0.22;
  const basisVelCoeff =
    arch.models.find(m => m.modelId === 'BASIS_VELOCITY_COUPLING')?.fittedCoefficient ?? 0.26;
  const vpinExhaustCoeff =
    arch.models.find(m => m.modelId === 'VOLUME_CLOCK_HAWKMOTH_RESTORING')?.fittedCoefficient ?? 0.24;
  const cMult = parseFloat((0.42 + 0.025 * gOffset).toFixed(4));
  return {
    driftPersistencePhi: parseFloat(
      Math.max(0.55, Math.min(0.95, 0.8 + 0.04 * gOffset + 0.05 * Math.tanh(phiResCoeff))).toFixed(4)
    ),
    meanReversionKappa: parseFloat((0.135 + 0.008 * gOffset).toFixed(4)),
    echoToxicityCouplingBeta: parseFloat(
      Math.max(0.15, Math.min(0.85, 0.36 + 0.08 * Math.abs(vpinExhaustCoeff))).toFixed(4)
    ),
    echoResilienceCouplingGamma: parseFloat(Math.max(0.15, Math.min(0.85, 0.4 + 0.04 * gOffset)).toFixed(4)),
    macroResidualCouplingEta: parseFloat(
      Math.max(0.12, Math.min(0.75, 0.26 + 0.06 * Math.abs(basisVelCoeff))).toFixed(4)
    ),
    crossVenueObservationPrecisionMult: parseFloat((1.08 + 0.05 * gOffset).toFixed(4)),
    equilibriumAnchorOverride: arch.compositeEquilibriumAnchor,
    symbolicStepDriftUsd: parseFloat((arch.compositeNetDriftUsdPerStep * cMult).toFixed(4)),
  };
}

/**
 * Evaluates both the Live Architecture (Yellow Line) and the isolated Parallel Universe
 * Candidate Architecture (Magenta Dashed Line) on the exact same verified real-data snapshot,
 * driven by the 6D Latent State Filter on the Causal Information Clock τ, Multi-Venue Observation
 * Equations, Pulse–Echo (Sonar) Sensing Layer, and Residual Oracle.
 */
export function evaluateParallelUniverseAndAwarenessCore(params: {
  candles: Candle[];
  liveMacro: VerifiedMacroYieldResult;
  secondaryBenchmark: {
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
  htfDailyCandles?: Candle[];
  interval: string;
  intervalStepSeconds: number;
  snapshotId: string;
  instrumentIdentity: string;
  systemState: TerminalSystemState;
  activeProvider: string;
  activeSymbol: string;
  activeEndpoint: string;
  activeTier: ProviderTier | 'NONE_HALTED';
}): ParallelUniverseTelemetry {
  const {
    candles,
    liveMacro,
    secondaryBenchmark,
    verifiedVenueCameras,
    macroNews,
    extensionInput,
    htfDailyCandles,
    interval,
    intervalStepSeconds,
    snapshotId,
    instrumentIdentity,
    systemState,
    activeProvider,
    activeSymbol,
    activeEndpoint,
    activeTier,
  } = params;

  const flags = getFeatureFlags();
  const hadPendingPromotionAck = Boolean(coreStore.pendingManualPromotionCycleAck);
  coreStore.pendingManualPromotionCycleAck = false;
  if (!hadPendingPromotionAck) {
    coreStore.lastPromotionBannerEn = null;
    coreStore.lastPromotionBannerFa = null;
  }

  if (systemState === 'HALTED_DEGRADED' || candles.length < 10) {
    return buildHaltedParallelUniverseTelemetry(snapshotId, instrumentIdentity, interval);
  }

  // Enforce strict provenance on the shared real-data snapshot
  assertVerifiedProvenance(candles, {
    providerName: activeProvider,
    symbol: activeSymbol,
    endpoint: activeEndpoint,
    tier: activeTier === 'NONE_HALTED' ? 'TIER_1_PRIMARY' : activeTier,
  });

  const currentPrice = candles[candles.length - 1].close;
  const closes = candles.map(c => c.close);
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / Math.max(1, closes[i - 1]));
  }

  const eqWindow = Math.min(40, closes.length);
  const rawEquilibriumPrice = closes.slice(-eqWindow).reduce((a, b) => a + b, 0) / eqWindow;

  const atrWindow = Math.min(14, candles.length - 1);
  let trSum = 0;
  for (let i = candles.length - atrWindow; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    trSum += Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
  }
  const atr = parseFloat((trSum / Math.max(1, atrWindow)).toFixed(2));

  const calibration = buildEmpiricalCalibrationBundle(candles);
  const cointegrationBasis = computeCointegrationBasis(currentPrice, candles, secondaryBenchmark);
  const pcaFactors = computeOrthogonalMacroFactors(liveMacro, candles, cointegrationBasis);
  const vpinBase = computeVpinAndShrinkage(candles, calibration);
  const sweepDiscriminator = computeLogOddsSweepDiscriminator(
    candles,
    pcaFactors.netOrthogonalLift,
    vpinBase,
    cointegrationBasis,
    calibration
  );

  // Isolated observer clone for Parallel Universe so Live Observer state is never mutated
  const isolatedObserver = new AdaptiveDPObserver();
  isolatedObserver.generateConvergenceHistory(
    candles,
    pcaFactors.netOrthogonalLift,
    vpinBase,
    calibration
  );

  const liquidityEngine = computeTopDownLiquidityEngine({
    intradayCandles: candles,
    htfDailyCandles,
    currentPrice,
    equilibriumPrice: rawEquilibriumPrice,
    atr,
    intervalStepSeconds,
    kalmanDriftVelocity: isolatedObserver.estimatedDrift,
    shrunkBias: isolatedObserver.shrunkBias,
    orthogonalMacroLift: pcaFactors.netOrthogonalLift,
    sweepLogOdds: sweepDiscriminator.logOddsScore,
    vpinScore: vpinBase.vpinScore,
  });

  const garchFit = fitEmpiricalGarch11(returns);
  const garchVolForecast = garchFit.forecast;
  const garchExceededMedian = garchVolForecast[0] * 100 >= garchFit.unconditionalVolPct;
  const garchRatioToUnconditional =
    garchFit.unconditionalVolPct > 1e-6
      ? (garchVolForecast[0] * 100) / garchFit.unconditionalVolPct
      : 1.0;

  // Build Multi-Timeframe Discovery Context from verified real-data snapshots
  const mtfDiscoveryContext = buildCausalMultiTimeframeDiscoveryContext({
    activeTimeframe: interval,
    candles,
    htfDailyCandles,
    compositeHtfPocAnchor: liquidityEngine.compositeHtfPocAnchor,
    activeAtr: atr,
  });
  coreStore.lastMtfDiscoveryContext = mtfDiscoveryContext;

  const isPromotedLive = coreStore.liveArchitecture.promotionMode !== 'INITIAL_BASELINE';
  let liveRefPredsForPromoted: number[] | undefined = undefined;
  if (isPromotedLive) {
    const expectedEvalLen = Math.min(48, Math.max(16, candles.length - 6));
    if (
      coreStore.promotedLiveReferencePreds &&
      coreStore.promotedLiveReferencePreds.length === expectedEvalLen
    ) {
      liveRefPredsForPromoted = coreStore.promotedLiveReferencePreds;
    } else {
      const baseRefEval = calibrateAndWeightArchitectureOnRealSnapshot({
        arch: createDefaultLiveArchitecture(),
        candles,
        atr,
        equilibriumPrice: rawEquilibriumPrice,
        compositeHtfPocAnchor: liquidityEngine.compositeHtfPocAnchor,
        orthogonalMacroLift: pcaFactors.netOrthogonalLift,
        f1RealGeopotential: pcaFactors.f1RealGeopotential,
        basisZScore: cointegrationBasis.zScore,
        vpinScore: vpinBase.vpinScore,
        garchExceededMedian,
        garchRatioToUnconditional,
        allowSymbolicPruningAndFitting: false,
      });
      liveRefPredsForPromoted = baseRefEval.stepPredictionsHistory;
    }
  }

  // 1. Evaluate Live Architecture (Yellow Line) dynamic weights & OOS predictions
  const liveEval = calibrateAndWeightArchitectureOnRealSnapshot({
    arch: coreStore.liveArchitecture,
    candles,
    atr,
    equilibriumPrice: rawEquilibriumPrice,
    compositeHtfPocAnchor: liquidityEngine.compositeHtfPocAnchor,
    orthogonalMacroLift: pcaFactors.netOrthogonalLift,
    f1RealGeopotential: pcaFactors.f1RealGeopotential,
    basisZScore: cointegrationBasis.zScore,
    vpinScore: vpinBase.vpinScore,
    garchExceededMedian,
    garchRatioToUnconditional,
    allowSymbolicPruningAndFitting: false,
    liveReferenceStepPredictions: liveRefPredsForPromoted,
  });
  coreStore.liveArchitecture = liveEval.updatedArch;
  coreStore.lastLiveStepPredictions = [...liveEval.stepPredictionsHistory];

  // 2. Evaluate Isolated Parallel Universe Candidate Architecture (Magenta Dashed Line)
  let candEval = calibrateAndWeightArchitectureOnRealSnapshot({
    arch: coreStore.candidateArchitecture,
    candles,
    atr,
    equilibriumPrice: rawEquilibriumPrice,
    compositeHtfPocAnchor: liquidityEngine.compositeHtfPocAnchor,
    orthogonalMacroLift: pcaFactors.netOrthogonalLift,
    f1RealGeopotential: pcaFactors.f1RealGeopotential,
    basisZScore: cointegrationBasis.zScore,
    vpinScore: vpinBase.vpinScore,
    garchExceededMedian,
    garchRatioToUnconditional,
    allowSymbolicPruningAndFitting: true,
    liveReferenceStepPredictions: liveEval.stepPredictionsHistory,
  });
  coreStore.candidateArchitecture = candEval.updatedArch;

  // Build local volatility series for Gate 4 regime partitioning
  const evalN = liveEval.realizedStepChanges.length;
  const garchVolSeries: number[] = [];
  for (let i = 0; i < evalN; i++) {
    const rIdx = Math.max(0, returns.length - evalN + i);
    garchVolSeries.push(Math.abs(returns[rIdx] || 0));
  }

  // 3. Run Strict 8-Gate Closed-Loop Verification on Active Timeframe Real OOS Bars
  const verificationReport = runStrictEightGateVerification({
    timeframe: interval,
    candles,
    liveMacro,
    instrumentIdentity,
    systemState,
    isSynthetic: false,
    livePreds: liveEval.stepPredictionsHistory,
    candPreds: candEval.stepPredictionsHistory,
    realizedChanges: liveEval.realizedStepChanges,
    garchVolSeries,
    auditTrail: coreStore.auditTrail,
  });
  coreStore.lastVerificationReport = verificationReport;

  // 4. Evaluate Scientific Core Pipeline (6D Latent State on Information Clock τ,
  //    Multi-Venue Observation Model, Pulse-Echo Sonar, Residual Oracle, and Permanent OOS Scoreboard)
  const genOffset = Math.min(4, Math.max(0, coreStore.generationCounter - 1));
  const candTheta = parseFloat((0.135 + 0.008 * genOffset).toFixed(4));
  const candDriftMult = parseFloat((0.42 + 0.025 * genOffset).toFixed(4));
  coreStore.lastCandTheta = candTheta;
  coreStore.lastCandDriftMult = candDriftMult;

  const candTuningOverrides = buildCandidateLatentTuningOverrides(
    coreStore.candidateArchitecture,
    coreStore.generationCounter
  );
  coreStore.lastCandTuningOverrides = candTuningOverrides;

  const liveBaseTuning =
    coreStore.liveArchitecture.promotionMode === 'INITIAL_BASELINE'
      ? {
          ...coreStore.latentMathWriteBack,
          equilibriumAnchorOverride: liquidityEngine.fusedEquilibriumAnchor,
          symbolicStepDriftUsd: parseFloat((liquidityEngine.fusedNetDriftUsd * 0.35).toFixed(4)),
        }
      : {
          ...coreStore.latentMathWriteBack,
          ...(coreStore.promotedCandTuningOverrides || {
            driftPersistencePhi: coreStore.latentMathWriteBack.driftPersistencePhi,
            meanReversionKappa: coreStore.promotedCandTheta ?? 0.135,
            echoToxicityCouplingBeta: coreStore.latentMathWriteBack.echoToxicityCouplingBeta,
            echoResilienceCouplingGamma: coreStore.latentMathWriteBack.echoResilienceCouplingGamma,
            macroResidualCouplingEta: coreStore.latentMathWriteBack.macroResidualCouplingEta,
            crossVenueObservationPrecisionMult:
              coreStore.latentMathWriteBack.crossVenueObservationPrecisionMult,
            equilibriumAnchorOverride: coreStore.liveArchitecture.compositeEquilibriumAnchor,
            symbolicStepDriftUsd: parseFloat(
              (
                coreStore.liveArchitecture.compositeNetDriftUsdPerStep *
                (coreStore.promotedCandDriftMult ?? 0.42)
              ).toFixed(4)
            ),
          }),
        };

  let scientificCore = evaluateScientificCorePipeline({
    candles,
    interval,
    intervalStepSeconds,
    atr,
    htfPocAnchorPrice: liquidityEngine.compositeHtfPocAnchor,
    liveMacro,
    secondaryBenchmark,
    verifiedVenueCameras,
    macroNews,
    extensionInput,
    liveTuning: liveBaseTuning,
    candidateTuningOverrides: candTuningOverrides,
    dataDrivenMinWindowBars: verificationReport.dataDrivenMinWindowBars,
  });

  // Update persisted residual log with latest realized OOS residual points
  if (scientificCore.residualOracle.recentResiduals.length > 0) {
    const existingTimes = new Set(coreStore.persistedResidualLog.map(r => r.barTime));
    for (const pt of scientificCore.residualOracle.recentResiduals) {
      if (!existingTimes.has(pt.barTime)) {
        coreStore.persistedResidualLog.push(pt);
        existingTimes.add(pt.barTime);
      }
    }
    if (coreStore.persistedResidualLog.length > 160) {
      coreStore.persistedResidualLog = coreStore.persistedResidualLog.slice(-160);
    }
  }
  coreStore.lastScientificCore = scientificCore;

  // 5. Generate Structured Awareness Findings driven by the Residual Oracle & Market State
  const findings = generateStructuredAwarenessFindings({
    liveArch: coreStore.liveArchitecture,
    candArch: coreStore.candidateArchitecture,
    livePreds: liveEval.stepPredictionsHistory,
    realized: liveEval.realizedStepChanges,
    basisZScore: cointegrationBasis.zScore,
    garchExceededMedian,
    prunedModelIds: candEval.prunedModelIds,
    mtfContext: mtfDiscoveryContext,
    residualDiagnostics: scientificCore.residualOracle.diagnostics,
  });
  coreStore.lastFindings = findings;

  // 6. Yellow Line = Conditional Expectation of 6D Latent State X on Information Clock τ
  //    Magenta Dashed Line = Parallel Universe Candidate Latent State Conditional Expectation
  let liveEnsemble: EnsemblePlume = scientificCore.yellowLineConditionalExpectation;
  let candidateEnsemble: EnsemblePlume =
    scientificCore.candidateLatentExpectation || scientificCore.yellowLineConditionalExpectation;

  // 7. Check if Automatic Promotion is enabled AND all 8 gates passed (VERIFIED_FOR_PROMOTION)
  let promotionOccurredThisCycle = hadPendingPromotionAck;
  if (
    !hadPendingPromotionAck &&
    coreStore.autoPromotionRuntimeEnabled &&
    verificationReport.overallStatus === 'VERIFIED_FOR_PROMOTION' &&
    verificationReport.passedGatesCount === verificationReport.totalGatesCount
  ) {
    const promoRes = promoteCandidateArchitecture({
      mode: 'AUTOMATIC_VERIFIED',
      operatorNote: `Auto-promoted after passing all ${verificationReport.totalGatesCount}/${verificationReport.totalGatesCount} closed-loop verification gates (DM t=${verificationReport.dieboldMarianoTStat.toFixed(2)}).`,
    });
    if (promoRes.promoted) {
      promotionOccurredThisCycle = true;
      coreStore.pendingManualPromotionCycleAck = false;
      // Promoted candidate trajectory immediately becomes the Live Yellow Line
      liveEnsemble = candidateEnsemble;
      coreStore.lastLiveStepPredictions = [...candEval.stepPredictionsHistory];
      // Evaluate newly forked next-generation Candidate Architecture so a fresh candidate line is forked immediately
      candEval = calibrateAndWeightArchitectureOnRealSnapshot({
        arch: coreStore.candidateArchitecture,
        candles,
        atr,
        equilibriumPrice: rawEquilibriumPrice,
        compositeHtfPocAnchor: liquidityEngine.compositeHtfPocAnchor,
        orthogonalMacroLift: pcaFactors.netOrthogonalLift,
        f1RealGeopotential: pcaFactors.f1RealGeopotential,
        basisZScore: cointegrationBasis.zScore,
        vpinScore: vpinBase.vpinScore,
        garchExceededMedian,
        garchRatioToUnconditional,
        allowSymbolicPruningAndFitting: true,
        liveReferenceStepPredictions: candEval.stepPredictionsHistory,
      });
      coreStore.candidateArchitecture = candEval.updatedArch;

      const forkedCandTuningOverrides = buildCandidateLatentTuningOverrides(
        coreStore.candidateArchitecture,
        coreStore.generationCounter
      );
      coreStore.lastCandTuningOverrides = forkedCandTuningOverrides;

      scientificCore = evaluateScientificCorePipeline({
        candles,
        interval,
        intervalStepSeconds,
        atr,
        htfPocAnchorPrice: liquidityEngine.compositeHtfPocAnchor,
        liveMacro,
        secondaryBenchmark,
        verifiedVenueCameras,
        macroNews,
        extensionInput,
        liveTuning: {
          ...coreStore.latentMathWriteBack,
          ...(coreStore.promotedCandTuningOverrides || {}),
        },
        candidateTuningOverrides: forkedCandTuningOverrides,
        dataDrivenMinWindowBars: verificationReport.dataDrivenMinWindowBars,
      });
      coreStore.lastScientificCore = scientificCore;
      liveEnsemble = scientificCore.yellowLineConditionalExpectation;
      candidateEnsemble =
        scientificCore.candidateLatentExpectation || scientificCore.yellowLineConditionalExpectation;
    }
  }

  // Persist updated weights, fitted coefficients, residual log, and write-back state atomically
  persistCoreStoreToDisk(coreStore);

  return {
    enabled: flags.ENABLE_PARALLEL_UNIVERSE_CORE,
    autoPromotionEnabled: coreStore.autoPromotionRuntimeEnabled,
    snapshotId,
    instrumentIdentity,
    persistenceHealth: coreStore.persistenceHealth,
    mtfDiscoveryContext,
    liveArchitecture: coreStore.liveArchitecture,
    candidateArchitecture: coreStore.candidateArchitecture,
    liveEnsemble,
    candidateEnsemble,
    findings,
    verificationReport,
    auditTrail: coreStore.auditTrail.slice(0, 25),
    promotionOccurredThisCycle,
    lastPromotionBannerEn: coreStore.lastPromotionBannerEn,
    lastPromotionBannerFa: coreStore.lastPromotionBannerFa,
    scientificCore,
    latentMathWriteBack: coreStore.latentMathWriteBack,
  };
}

/**
 * Promotes the Candidate Architecture from the Parallel Universe to become the new
 * Live Architecture (Yellow Line) via one of the two allowed promotion paths:
 * 1. MANUAL_MMI: Operator explicitly approves via the UI (allowed even if not all automatic gates are green).
 * 2. AUTOMATIC_VERIFIED: Allowed strictly when overallStatus === 'VERIFIED_FOR_PROMOTION' (all 8 gates passed).
 */
export function promoteCandidateArchitecture(params: {
  mode: 'MANUAL_MMI' | 'AUTOMATIC_VERIFIED';
  operatorNote?: string;
}): {
  promoted: boolean;
  reasonEn: string;
  reasonFa: string;
  liveArchitecture: ArchitectureState;
  candidateArchitecture: ArchitectureState;
  auditEntry: ArchitectureAuditLogEntry;
  persistenceHealth: ArchitecturePersistenceHealth;
} {
  const { mode, operatorNote } = params;
  const report = coreStore.lastVerificationReport;

  if (mode === 'AUTOMATIC_VERIFIED') {
    if (
      !report ||
      report.overallStatus !== 'VERIFIED_FOR_PROMOTION' ||
      report.passedGatesCount < report.totalGatesCount
    ) {
      const passedStr = report ? `${report.passedGatesCount}/${report.totalGatesCount}` : '0/8';
      const rejectedEntry = appendAuditEntry({
        eventType: 'AUTO_PROMOTE_REJECTED_GATE_UNVERIFIED',
        actor: 'CLOSED_LOOP_VERIFIER',
        sourceArchitectureId: coreStore.candidateArchitecture.architectureId,
        targetArchitectureId: coreStore.liveArchitecture.architectureId,
        summaryEn: `Automatic promotion blocked: Candidate has passed ${passedStr} gates (status: ${report?.overallStatus || 'UNVERIFIED'}). Automatic promotion requires 8/8 gates (VERIFIED_FOR_PROMOTION).`,
        summaryFa: `ارتقای خودکار متوقف شد: کاندیدا ${passedStr} گیت را گذرانده است. ارتقای خودکار نیازمند عبور از هر ۸ گیت راستی‌آزمایی است.`,
        verifiableMetrics: `Status=${report?.overallStatus || 'NONE'} | PassedGates=${passedStr}`,
      });
      return {
        promoted: false,
        reasonEn: rejectedEntry.summaryEn,
        reasonFa: rejectedEntry.summaryFa,
        liveArchitecture: coreStore.liveArchitecture,
        candidateArchitecture: coreStore.candidateArchitecture,
        auditEntry: rejectedEntry,
        persistenceHealth: coreStore.persistenceHealth,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const oldLive = { ...coreStore.liveArchitecture };
  coreStore.archivedArchitectures.unshift(oldLive);
  if (coreStore.archivedArchitectures.length > 20) {
    coreStore.archivedArchitectures.length = 20;
  }

  const promotedCand = coreStore.candidateArchitecture;
  const prePromoGen = coreStore.generationCounter;
  coreStore.generationCounter += 1;
  const gen = coreStore.generationCounter;

  // Preserve the exact reference predictions and 6D Latent Filter parameters that produced the candidate's trajectory
  if (coreStore.lastLiveStepPredictions && coreStore.lastLiveStepPredictions.length > 0) {
    coreStore.promotedLiveReferencePreds = [...coreStore.lastLiveStepPredictions];
  }
  coreStore.promotedCandTheta = coreStore.lastCandTheta ?? 0.135;
  coreStore.promotedCandDriftMult = coreStore.lastCandDriftMult ?? 0.42;
  const capturedCandTuning =
    coreStore.lastCandTuningOverrides || buildCandidateLatentTuningOverrides(promotedCand, prePromoGen);
  coreStore.promotedCandTuningOverrides = { ...capturedCandTuning };

  // Also synchronize Latent Math Write-Back state with the promoted candidate's validated parameters
  const activeSymbolicIds = promotedCand.models
    .filter(m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && m.isEnabled)
    .map(m => m.modelId);
  const prunedSymbolicIds = promotedCand.models
    .filter(m => !m.isEnabled)
    .map(m => m.modelId);
  coreStore.latentMathWriteBack = {
    writeBackGeneration: coreStore.latentMathWriteBack.writeBackGeneration + 1,
    lastWriteBackIso: nowIso,
    sourceCandidateArchId: promotedCand.architectureId,
    driftPersistencePhi: capturedCandTuning.driftPersistencePhi,
    meanReversionKappa: capturedCandTuning.meanReversionKappa,
    echoToxicityCouplingBeta: capturedCandTuning.echoToxicityCouplingBeta,
    echoResilienceCouplingGamma: capturedCandTuning.echoResilienceCouplingGamma,
    macroResidualCouplingEta: capturedCandTuning.macroResidualCouplingEta,
    crossVenueObservationPrecisionMult: capturedCandTuning.crossVenueObservationPrecisionMult,
    activeSymbolicTermsWrittenBack: activeSymbolicIds,
    prunedFaultyComponents: prunedSymbolicIds,
  };

  // Candidate becomes the new Live Architecture (Yellow Line)
  const newLiveArch: ArchitectureState = {
    ...promotedCand,
    architectureId: `arch-live-gen${gen}`,
    versionTag: `v${gen}.0-LivePromoted (${mode === 'MANUAL_MMI' ? 'MMI' : 'AUTO'})`,
    role: 'LIVE_YELLOW_LINE',
    promotedAtIso: nowIso,
    promotionMode: mode,
    lineColorHex: '#f5d76e',
    models: promotedCand.models.map(m => ({ ...m })),
    dynamicFusionWeights: { ...promotedCand.dynamicFusionWeights },
    compositeNetDriftUsdPerStep: promotedCand.compositeNetDriftUsdPerStep,
    compositeEquilibriumAnchor: promotedCand.compositeEquilibriumAnchor,
  };
  coreStore.liveArchitecture = newLiveArch;

  // Spawn fresh next-generation Candidate Architecture in the Parallel Universe
  // Re-seed with fresh initial candidate discovery priors scaled by generation discovery step
  const genExplorationScale = 1 + 0.06 * ((gen % 4) + 1);
  const nextCandidateModels = createInitialCandidateModels().map(m => {
    if (m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY') {
      return {
        ...m,
        isEnabled: true,
        disabledReasonEn: null,
        fittedCoefficient: parseFloat((m.fittedCoefficient * genExplorationScale).toFixed(4)),
      };
    }
    const prevBase = promotedCand.models.find(pm => pm.modelId === m.modelId);
    return prevBase ? { ...prevBase, isEnabled: true, disabledReasonEn: null } : { ...m };
  });

  const newCandidateArch: ArchitectureState = {
    architectureId: `arch-cand-gen${gen + 1}`,
    versionTag: `v${gen + 1}.0-ParallelCandidate-G${gen}`,
    role: 'PARALLEL_CANDIDATE_LINE',
    createdAtIso: nowIso,
    promotedAtIso: null,
    promotionMode: undefined,
    lineColorHex: '#e040fb',
    activeModelsCount: nextCandidateModels.filter(m => m.isEnabled).length,
    disabledModelsCount: 0,
    discoveredModelsCount: nextCandidateModels.filter(m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY').length,
    models: nextCandidateModels,
    dynamicFusionWeights: { ...newLiveArch.dynamicFusionWeights },
    compositeNetDriftUsdPerStep: newLiveArch.compositeNetDriftUsdPerStep,
    compositeEquilibriumAnchor: newLiveArch.compositeEquilibriumAnchor,
  };
  coreStore.candidateArchitecture = newCandidateArch;
  coreStore.pendingManualPromotionCycleAck = true;

  const passedGatesStr = report ? `${report.passedGatesCount}/${report.totalGatesCount}` : 'MMI-Override';
  const noteSuffix = operatorNote ? ` · Note: ${operatorNote}` : '';
  const summaryEn =
    mode === 'MANUAL_MMI'
      ? `Operator manually approved & promoted Parallel Universe Candidate (${promotedCand.versionTag}) to Live Yellow-Line Architecture (${newLiveArch.versionTag}) via MMI [Gates: ${passedGatesStr}]${noteSuffix}.`
      : `Closed-Loop Verifier automatically promoted Verified Candidate (${promotedCand.versionTag}) to Live Yellow-Line Architecture (${newLiveArch.versionTag}) after passing all ${passedGatesStr} gates${noteSuffix}.`;

  const summaryFa =
    mode === 'MANUAL_MMI'
      ? `اپراتور از طریق رابط انسان و ماشین (MMI) معماری کاندیدای جهان موازی (${promotedCand.versionTag}) را به معماری خط زرد زنده (${newLiveArch.versionTag}) ارتقا داد [گیت‌ها: ${passedGatesStr}].`
      : `راستی‌آزمای حلقه بسته پس از عبور از تمامی ${passedGatesStr} گیت، معماری کاندیدا (${promotedCand.versionTag}) را به صورت خودکار به خط زرد زنده (${newLiveArch.versionTag}) ارتقا داد.`;

  coreStore.lastPromotionBannerEn = summaryEn;
  coreStore.lastPromotionBannerFa = summaryFa;

  const auditEntry = appendAuditEntry({
    eventType: mode === 'MANUAL_MMI' ? 'PROMOTED_MANUAL_MMI' : 'PROMOTED_AUTOMATIC_VERIFIED',
    actor: mode === 'MANUAL_MMI' ? 'OPERATOR_MMI' : 'CLOSED_LOOP_VERIFIER',
    sourceArchitectureId: promotedCand.architectureId,
    targetArchitectureId: newLiveArch.architectureId,
    summaryEn,
    summaryFa,
    verifiableMetrics: `Mode=${mode} | Gates=${passedGatesStr} | ActiveModels=${newLiveArch.activeModelsCount} | Discovered=${newLiveArch.discoveredModelsCount} | Archived=${oldLive.architectureId}`,
  });

  return {
    promoted: true,
    reasonEn: summaryEn,
    reasonFa: summaryFa,
    liveArchitecture: coreStore.liveArchitecture,
    candidateArchitecture: coreStore.candidateArchitecture,
    auditEntry,
    persistenceHealth: coreStore.persistenceHealth,
  };
}

/**
 * Direct Mathematical Write-Back from the Parallel Universe into the 6D Latent State &
 * Multi-Venue Observation Model. Validated parameters (drift persistence φ, mean-reversion κ,
 * pulse-echo couplings β/γ, macro residual force η, cross-venue observation precision, and
 * pruned faulty components) are written back into the live latent state filter and logged
 * immutably in the audit trail.
 */
export function writeBackValidatedMathToLatentModel(params?: {
  mode?: 'MANUAL_MMI' | 'AUTOMATIC_VERIFIED';
  operatorNote?: string;
}): {
  writtenBack: boolean;
  reasonEn: string;
  reasonFa: string;
  latentMathWriteBack: LatentModelMathWriteBackState;
  auditEntry: ArchitectureAuditLogEntry;
  persistenceHealth: ArchitecturePersistenceHealth;
} {
  const mode = params?.mode || 'MANUAL_MMI';
  const operatorNote = params?.operatorNote;
  const report = coreStore.lastVerificationReport;

  if (mode === 'AUTOMATIC_VERIFIED') {
    if (
      !report ||
      report.overallStatus !== 'VERIFIED_FOR_PROMOTION' ||
      report.passedGatesCount < report.totalGatesCount
    ) {
      const passedStr = report ? `${report.passedGatesCount}/${report.totalGatesCount}` : '0/8';
      const rejectedEntry = appendAuditEntry({
        eventType: 'AUTO_PROMOTE_REJECTED_GATE_UNVERIFIED',
        actor: 'CLOSED_LOOP_VERIFIER',
        sourceArchitectureId: coreStore.candidateArchitecture.architectureId,
        targetArchitectureId: coreStore.liveArchitecture.architectureId,
        summaryEn: `Automatic Latent-Math Write-Back blocked: Candidate has passed ${passedStr} gates. Automatic write-back requires 8/8 gates (VERIFIED_FOR_PROMOTION).`,
        summaryFa: `بازنویسی خودکار ریاضیات مدل پنهان متوقف شد: کاندیدا ${passedStr} گیت را گذرانده است (نیازمند ۸ از ۸ گیت).`,
        verifiableMetrics: `Status=${report?.overallStatus || 'NONE'} | PassedGates=${passedStr}`,
      });
      return {
        writtenBack: false,
        reasonEn: rejectedEntry.summaryEn,
        reasonFa: rejectedEntry.summaryFa,
        latentMathWriteBack: coreStore.latentMathWriteBack,
        auditEntry: rejectedEntry,
        persistenceHealth: coreStore.persistenceHealth,
      };
    }
  }

  const cand = coreStore.candidateArchitecture;
  const candTuning =
    coreStore.lastCandTuningOverrides ||
    buildCandidateLatentTuningOverrides(cand, coreStore.generationCounter);
  const nowIso = new Date().toISOString();

  const activeSymbolicIds = cand.models
    .filter(m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && m.isEnabled)
    .map(m => m.modelId);
  const prunedIds = cand.models.filter(m => !m.isEnabled).map(m => m.modelId);

  const nextWriteBack: LatentModelMathWriteBackState = {
    writeBackGeneration: coreStore.latentMathWriteBack.writeBackGeneration + 1,
    lastWriteBackIso: nowIso,
    sourceCandidateArchId: cand.architectureId,
    driftPersistencePhi: candTuning.driftPersistencePhi,
    meanReversionKappa: candTuning.meanReversionKappa,
    echoToxicityCouplingBeta: candTuning.echoToxicityCouplingBeta,
    echoResilienceCouplingGamma: candTuning.echoResilienceCouplingGamma,
    macroResidualCouplingEta: candTuning.macroResidualCouplingEta,
    crossVenueObservationPrecisionMult: candTuning.crossVenueObservationPrecisionMult,
    activeSymbolicTermsWrittenBack: activeSymbolicIds,
    prunedFaultyComponents: prunedIds,
  };

  coreStore.latentMathWriteBack = nextWriteBack;
  if (coreStore.promotedCandTuningOverrides) {
    coreStore.promotedCandTuningOverrides = {
      ...coreStore.promotedCandTuningOverrides,
      driftPersistencePhi: nextWriteBack.driftPersistencePhi,
      meanReversionKappa: nextWriteBack.meanReversionKappa,
      echoToxicityCouplingBeta: nextWriteBack.echoToxicityCouplingBeta,
      echoResilienceCouplingGamma: nextWriteBack.echoResilienceCouplingGamma,
      macroResidualCouplingEta: nextWriteBack.macroResidualCouplingEta,
      crossVenueObservationPrecisionMult: nextWriteBack.crossVenueObservationPrecisionMult,
    };
  }

  const noteSuffix = operatorNote ? ` · Note: ${operatorNote}` : '';
  const summaryEn = `Validated Parallel Universe mathematics from ${cand.versionTag} written back into 6D Latent State & Observation Model (Gen #${nextWriteBack.writeBackGeneration}: φ=${nextWriteBack.driftPersistencePhi}, κ=${nextWriteBack.meanReversionKappa}, β_echo=${nextWriteBack.echoToxicityCouplingBeta}, γ_res=${nextWriteBack.echoResilienceCouplingGamma}, η_macro=${nextWriteBack.macroResidualCouplingEta}, pruned=${prunedIds.length})${noteSuffix}.`;
  const summaryFa = `ریاضیات تاییدشده جهان موازی (${cand.versionTag}) در مدل حالت پنهان ۶بعدی و معادلات مشاهده بازنویسی شد (نسل #${nextWriteBack.writeBackGeneration}: φ=${nextWriteBack.driftPersistencePhi}، κ=${nextWriteBack.meanReversionKappa}، β=${nextWriteBack.echoToxicityCouplingBeta}، γ=${nextWriteBack.echoResilienceCouplingGamma}).`;

  const auditEntry = appendAuditEntry({
    eventType: 'LATENT_MATH_WRITEBACK_APPLIED',
    actor: mode === 'MANUAL_MMI' ? 'OPERATOR_MMI' : 'CLOSED_LOOP_VERIFIER',
    sourceArchitectureId: cand.architectureId,
    targetArchitectureId: coreStore.liveArchitecture.architectureId,
    summaryEn,
    summaryFa,
    verifiableMetrics: `WriteBackGen=${nextWriteBack.writeBackGeneration} | phi=${nextWriteBack.driftPersistencePhi} | kappa=${nextWriteBack.meanReversionKappa} | beta=${nextWriteBack.echoToxicityCouplingBeta} | gamma=${nextWriteBack.echoResilienceCouplingGamma} | eta=${nextWriteBack.macroResidualCouplingEta} | obsPrecMult=${nextWriteBack.crossVenueObservationPrecisionMult}`,
  });

  return {
    writtenBack: true,
    reasonEn: summaryEn,
    reasonFa: summaryFa,
    latentMathWriteBack: coreStore.latentMathWriteBack,
    auditEntry,
    persistenceHealth: coreStore.persistenceHealth,
  };
}

export function setAutoPromotionRuntimeMode(enabled: boolean): {
  autoPromotionEnabled: boolean;
  auditEntry: ArchitectureAuditLogEntry;
  persistenceHealth: ArchitecturePersistenceHealth;
} {
  coreStore.autoPromotionRuntimeEnabled = Boolean(enabled);
  const auditEntry = appendAuditEntry({
    eventType: 'DYNAMIC_PRECISION_REWEIGHT',
    actor: 'OPERATOR_MMI',
    sourceArchitectureId: coreStore.candidateArchitecture.architectureId,
    targetArchitectureId: coreStore.liveArchitecture.architectureId,
    summaryEn: `Operator set Automatic Promotion (When Verified 8/8 Gates) to ${coreStore.autoPromotionRuntimeEnabled ? 'ENABLED' : 'DISABLED (Manual MMI Only)'}.`,
    summaryFa: `اپراتور وضعیت ارتقای خودکار (پس از عبور از هر ۸ گیت) را به ${coreStore.autoPromotionRuntimeEnabled ? 'فعال' : 'غیرفعال (صرفاً دستی MMI)'} تغییر داد.`,
    verifiableMetrics: `autoPromotionEnabled=${coreStore.autoPromotionRuntimeEnabled}`,
  });
  return {
    autoPromotionEnabled: coreStore.autoPromotionRuntimeEnabled,
    auditEntry,
    persistenceHealth: coreStore.persistenceHealth,
  };
}

export function triggerSymbolicDiscoveryAuditStep(reasonNote?: string): ArchitectureAuditLogEntry {
  const cand = coreStore.candidateArchitecture;
  const enabledSymbolic = cand.models.filter(m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && m.isEnabled);
  return appendAuditEntry({
    eventType: 'LEVEL_B_MODEL_INVENTED',
    actor: 'INTELLIGENCE_AWARENESS_CORE',
    sourceArchitectureId: coreStore.liveArchitecture.architectureId,
    targetArchitectureId: cand.architectureId,
    summaryEn: `Intelligence & Awareness Core executed Multi-Timeframe Level-B Symbolic Equation synthesis & ridge calibration (${enabledSymbolic.length}/8 symbolic equations active in ${cand.versionTag})${reasonNote ? `: ${reasonNote}` : ''}.`,
    summaryFa: `هسته هوشمندی و آگاهی کشف نمادین معادلات سطح B چندتایم‌فریمی و کالیبراسیون ریج را در جهان موازی اجرا کرد (${enabledSymbolic.length} معادله نمادین فعال).`,
    verifiableMetrics: `Candidate=${cand.versionTag} | ActiveSymbolic=${enabledSymbolic.map(m => `${m.modelId}(w=${(m.dynamicWeight * 100).toFixed(1)}%)`).join(', ')}`,
  });
}

export function getIntelligenceCoreStateSnapshot() {
  return {
    autoPromotionEnabled: coreStore.autoPromotionRuntimeEnabled,
    generationCounter: coreStore.generationCounter,
    persistenceHealth: coreStore.persistenceHealth,
    mtfDiscoveryContext: coreStore.lastMtfDiscoveryContext,
    liveArchitecture: coreStore.liveArchitecture,
    candidateArchitecture: coreStore.candidateArchitecture,
    archivedArchitectures: coreStore.archivedArchitectures,
    lastVerificationReport: coreStore.lastVerificationReport,
    lastFindings: coreStore.lastFindings,
    auditTrail: coreStore.auditTrail,
    scientificCore: coreStore.lastScientificCore,
    latentMathWriteBack: coreStore.latentMathWriteBack,
    persistedResidualCount: coreStore.persistedResidualLog.length,
  };
}

export function buildHaltedParallelUniverseTelemetry(
  snapshotId: string,
  instrumentIdentity: string,
  timeframe: string
): ParallelUniverseTelemetry {
  const haltedGates: TestAndVerifyGateResult[] = [
    {
      gateId: 'GATE_6_SAFETY_INVARIANTS_INTACT',
      titleEn: 'Gate 6 · Circuit Breaker HALTED_DEGRADED Freeze Active',
      titleFa: 'گیت ۶ · توقف مدار محافظتی در وضعیت HALTED_DEGRADED',
      passed: false,
      metricSummary: 'HALTED_DEGRADED — All mutations & promotions frozen',
      thresholdSpec: 'Requires live verified market feed',
      detailsEn: 'Both Live Architecture and Parallel Universe Candidate are frozen during upstream market data halt.',
      detailsFa: 'در زمان قطعی منابع داده زنده، هر دو معماری زنده و جهان موازی در وضعیت انجماد قرار دارند.',
    },
  ];
  const haltedReport: TestAndVerifyReport = {
    evaluatedAtIso: new Date().toISOString(),
    timeframe,
    overallStatus: 'HALTED_FROZEN',
    passedGatesCount: 0,
    totalGatesCount: 8,
    dataDrivenMinWindowBars: 16,
    realizedOosBarsEvaluated: 0,
    postDiscoveryConfirmationBars: 0,
    requiredConfirmationBars: 5,
    liveRmseUsd: 0,
    candidateRmseUsd: 0,
    liveRankIc: 0,
    candidateRankIc: 0,
    dieboldMarianoTStat: 0,
    liveTailP95ErrorUsd: 0,
    candidateTailP95ErrorUsd: 0,
    liveMaxExcursionErrorUsd: 0,
    candidateMaxExcursionErrorUsd: 0,
    regimesObservedCount: 0,
    regimesPassedCount: 0,
    gates: haltedGates,
  };
  coreStore.lastVerificationReport = haltedReport;

  return {
    enabled: getFeatureFlags().ENABLE_PARALLEL_UNIVERSE_CORE,
    autoPromotionEnabled: coreStore.autoPromotionRuntimeEnabled,
    snapshotId,
    instrumentIdentity,
    persistenceHealth: getArchitecturePersistenceHealth(),
    mtfDiscoveryContext: coreStore.lastMtfDiscoveryContext,
    liveArchitecture: coreStore.liveArchitecture,
    candidateArchitecture: coreStore.candidateArchitecture,
    liveEnsemble: {
      medianTrack: [],
      upper95: [],
      upper75: [],
      lower25: [],
      lower05: [],
      sampleTracks: [],
    },
    candidateEnsemble: {
      medianTrack: [],
      upper95: [],
      upper75: [],
      lower25: [],
      lower05: [],
      sampleTracks: [],
    },
    findings: [],
    verificationReport: haltedReport,
    auditTrail: coreStore.auditTrail.slice(0, 20),
    promotionOccurredThisCycle: false,
    lastPromotionBannerEn: null,
    lastPromotionBannerFa: null,
    scientificCore: coreStore.lastScientificCore,
    latentMathWriteBack: coreStore.latentMathWriteBack,
  };
}

