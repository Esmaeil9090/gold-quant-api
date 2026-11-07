/**
 * SHARED RESIDUAL SHOCK OPERATOR (GDF-G Gold & BDF-B Bitcoin Full Brain)
 *
 * Constitutional Rule:
 * - Residual is judge: large error must mutate state/policy, not only logs.
 * - e_t = realized - one_step_predicted
 * - z_t = e_t / predictive_sigma
 * - When |z_t| >= z* (default calibrated threshold z* = 2.5):
 *   1. Shrink drift:            μ <- (1 - α) * μ           (default α = 0.65)
 *   2. Recenter anchor:         A <- (1 - β) * A + β * P_t (default β = 0.55)
 *   3. Inflate uncertainty / widen bands
 *   4. Start promotion cooldown (default 4 bars)
 *   5. Record immutable audit entry
 */

export type AssetClass = 'GOLD' | 'BTC';

export interface ResidualShockCalibration {
  /** Standardized residual threshold z* (default: 2.5) */
  zThreshold: number;
  /** Drift shrinkage factor α in (0, 1) so μ <- (1 - α)μ (default: 0.65) */
  driftShrinkAlpha: number;
  /** Anchor recentering weight β in (0, 1) so A <- (1 - β)A + β P_t (default: 0.55) */
  anchorRecenterBeta: number;
  /** Promotion cooldown duration in bars after a shock fires (default: 4) */
  cooldownBars: number;
  /** Maximum variance/band inflation multiplier (default: 2.35) */
  maxBandInflationMultiplier: number;
}

export const DEFAULT_RESIDUAL_SHOCK_CALIBRATION: Readonly<ResidualShockCalibration> = Object.freeze({
  zThreshold: 2.5,
  driftShrinkAlpha: 0.65,
  anchorRecenterBeta: 0.55,
  cooldownBars: 4,
  maxBandInflationMultiplier: 2.35,
});

export interface ResidualShockAuditEntry {
  readonly auditId: string;
  readonly assetClass: AssetClass;
  readonly barTimeSec: number;
  readonly barIndex: number;
  readonly realizedPrice: number;
  readonly oneStepPredictedPrice: number;
  readonly residual: number;
  readonly predictiveSigma: number;
  readonly zScore: number;
  readonly thresholdZ: number;
  readonly shockFired: boolean;
  readonly priorDrift: number;
  readonly mutatedDrift: number;
  readonly priorAnchorPrice: number;
  readonly mutatedAnchorPrice: number;
  readonly uncertaintyMultiplier: number;
  readonly cooldownBarsRemaining: number;
  readonly recordedAtIso: string;
}

export interface ResidualShockOperatorInput {
  assetClass: AssetClass;
  barTimeSec: number;
  barIndex: number;
  realizedPrice: number;
  oneStepPredictedPrice: number;
  predictiveSigma: number;
  currentDrift: number;
  currentAnchorPrice: number;
  priorCooldownBarsRemaining?: number;
  calibration?: Partial<ResidualShockCalibration>;
}

export interface ResidualShockOperatorResult {
  residual: number;
  predictiveSigma: number;
  zScore: number;
  shockFired: boolean;
  priorDrift: number;
  mutatedDrift: number;
  priorAnchorPrice: number;
  mutatedAnchorPrice: number;
  uncertaintyMultiplier: number;
  cooldownBarsRemaining: number;
  blockAutoPromotion: boolean;
  auditEntry: ResidualShockAuditEntry;
}

const immutableGlobalShockAuditLedger: ResidualShockAuditEntry[] = [];
const MAX_GLOBAL_AUDIT_ENTRIES = 1000;

/**
 * Evaluates and applies the exact Residual Shock Operator for a single bar step.
 * Mutates state outputs (drift, anchor, uncertainty multiplier, promotion cooldown)
 * whenever |z_t| >= z*.
 */
export function applyResidualShockOperator(
  input: ResidualShockOperatorInput
): ResidualShockOperatorResult {
  const cal: ResidualShockCalibration = {
    ...DEFAULT_RESIDUAL_SHOCK_CALIBRATION,
    ...(input.calibration || {}),
  };

  const safeSigma = Math.max(1e-6, Math.abs(input.predictiveSigma));
  const residual = input.realizedPrice - input.oneStepPredictedPrice;
  const zScore = residual / safeSigma;
  const absZ = Math.abs(zScore);
  const shockFired = absZ >= cal.zThreshold;

  const priorDrift = input.currentDrift;
  const priorAnchorPrice = input.currentAnchorPrice;
  const priorCooldown = Math.max(0, Math.floor(input.priorCooldownBarsRemaining ?? 0));

  let mutatedDrift = priorDrift;
  let mutatedAnchorPrice = priorAnchorPrice;
  let uncertaintyMultiplier = 1.0;
  let cooldownBarsRemaining = Math.max(0, priorCooldown - 1);

  if (shockFired) {
    // 1. Shrink drift: μ <- (1 - α) * μ
    mutatedDrift = (1 - cal.driftShrinkAlpha) * priorDrift;

    // 2. Recenter anchor toward realized price: A <- (1 - β) * A + β * P_t
    mutatedAnchorPrice =
      (1 - cal.anchorRecenterBeta) * priorAnchorPrice +
      cal.anchorRecenterBeta * input.realizedPrice;

    // 3. Inflate uncertainty / widen bands proportionally to shock severity
    const severityRatio = absZ / Math.max(0.5, cal.zThreshold);
    uncertaintyMultiplier = Math.min(
      cal.maxBandInflationMultiplier,
      Math.max(1.35, 1.0 + 0.55 * severityRatio)
    );

    // 4. Start promotion cooldown
    cooldownBarsRemaining = cal.cooldownBars;
  } else if (cooldownBarsRemaining > 0) {
    // Post-shock cooldown still active: maintain partial uncertainty widening
    const cooldownFrac = cooldownBarsRemaining / Math.max(1, cal.cooldownBars);
    uncertaintyMultiplier = 1.0 + 0.35 * cooldownFrac;
  }

  const auditEntry: ResidualShockAuditEntry = Object.freeze({
    auditId: `rso-${input.assetClass.toLowerCase()}-${input.barTimeSec}-${input.barIndex}`,
    assetClass: input.assetClass,
    barTimeSec: input.barTimeSec,
    barIndex: input.barIndex,
    realizedPrice: Number(input.realizedPrice.toFixed(4)),
    oneStepPredictedPrice: Number(input.oneStepPredictedPrice.toFixed(4)),
    residual: Number(residual.toFixed(4)),
    predictiveSigma: Number(safeSigma.toFixed(4)),
    zScore: Number(zScore.toFixed(4)),
    thresholdZ: cal.zThreshold,
    shockFired,
    priorDrift: Number(priorDrift.toFixed(8)),
    mutatedDrift: Number(mutatedDrift.toFixed(8)),
    priorAnchorPrice: Number(priorAnchorPrice.toFixed(4)),
    mutatedAnchorPrice: Number(mutatedAnchorPrice.toFixed(4)),
    uncertaintyMultiplier: Number(uncertaintyMultiplier.toFixed(4)),
    cooldownBarsRemaining,
    recordedAtIso: new Date().toISOString(),
  });

  if (shockFired) {
    immutableGlobalShockAuditLedger.push(auditEntry);
    if (immutableGlobalShockAuditLedger.length > MAX_GLOBAL_AUDIT_ENTRIES) {
      immutableGlobalShockAuditLedger.shift();
    }
  }

  return {
    residual,
    predictiveSigma: safeSigma,
    zScore,
    shockFired,
    priorDrift,
    mutatedDrift,
    priorAnchorPrice,
    mutatedAnchorPrice,
    uncertaintyMultiplier,
    cooldownBarsRemaining,
    blockAutoPromotion: shockFired || cooldownBarsRemaining > 0,
    auditEntry,
  };
}

/**
 * Returns a read-only snapshot of the immutable shock operator audit log.
 */
export function getResidualShockAuditLedger(assetClass?: AssetClass): ReadonlyArray<ResidualShockAuditEntry> {
  if (!assetClass) {
    return [...immutableGlobalShockAuditLedger];
  }
  return immutableGlobalShockAuditLedger.filter(e => e.assetClass === assetClass);
}

/**
 * Clears the in-memory shock audit ledger only when explicitly requested by deterministic unit tests.
 */
export function resetResidualShockAuditLedgerForTest(): void {
  immutableGlobalShockAuditLedger.length = 0;
}
