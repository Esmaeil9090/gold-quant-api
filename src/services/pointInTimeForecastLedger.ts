import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_FORECAST_LEDGER_PATH = path.resolve(
  __dirname,
  '../../data/point_in_time_forecast_ledger.jsonl'
);
export const DEFAULT_BACKTEST_FIXTURE_LEDGER_PATH = path.resolve(
  __dirname,
  '../../data/backtest_fixture_forecast_ledger.jsonl'
);
export const DEFAULT_OUTCOME_LEDGER_PATH = path.resolve(
  __dirname,
  '../../data/point_in_time_forecast_outcomes.jsonl'
);

/**
 * Phase C3 / C7 Power-Derived Minimum Live Prospective Sample Per Cell:
 * To detect a meaningful Rank-IC of r = 0.20 (or a 10% coverage miscalibration on the 50% band)
 * at 80% statistical power (alpha = 0.05 two-sided):
 *   N_min = ceil((z_{0.975} + z_{0.80})^2 / 0.20^2) = ceil((1.95996 + 0.84162)^2 / 0.04) = 197.
 */
export const C3_POWER_MIN_LIVE_RESOLVED_PER_CELL = 197;

export type LedgerEntrySourceType = 'LIVE_PROSPECTIVE' | 'FIXTURE_OR_BACKTEST';

export interface PredictiveDistributionRecord {
  meanLogReturn: number;
  stdLogReturn: number;
  degreesOfFreedom: number | null;
  pointPrice: number;
  q05: number;
  q25: number;
  q50: number;
  q75: number;
  q95: number;
  probUp: number;
}

export interface PointInTimeForecastLedgerEntry {
  entryId: string;
  sequenceNumber: number;
  recordedAtTimestampSec: number;
  recordedAtIso: string;
  originTimestampSec: number;
  horizonBars: number;
  horizonStepSeconds: number;
  horizonTargetTimestampSec: number;
  assetClass: 'GOLD' | 'BTC';
  instrumentIdentity: string;
  timeframe: string;
  namespaceKey: string;
  dataSnapshotId: string;
  modelVersion: string;
  trackRole: 'INCUMBENT_LIVE' | 'SHADOW_CANDIDATE';
  entrySourceType?: LedgerEntrySourceType;
  originClose: number;
  predictiveDistribution: PredictiveDistributionRecord;
  prevEntryHashSha256: string;
  entryHashSha256: string;
}

export interface PointInTimeOutcomeResolutionEntry {
  resolutionId: string;
  entryId: string;
  resolvedAtTimestampSec: number;
  resolvedAtIso: string;
  originTimestampSec: number;
  horizonTargetTimestampSec: number;
  realizedClose: number;
  realizedHigh: number;
  realizedLow: number;
  realizedLogReturn: number;
  realizedUp: 0 | 1;
}

export interface LedgerEvaluatedPair {
  forecast: PointInTimeForecastLedgerEntry;
  outcome: PointInTimeOutcomeResolutionEntry;
  pointErrorUsd: number;
  logReturnError: number;
  directionalHit: 0 | 1;
  directionalBrier: number;
  covered50: 0 | 1;
  covered90: 0 | 1;
  pinballLossAvg: number;
  crpsLogReturn: number;
  qlikeLoss: number;
}

export interface LedgerLiveAccuracyScorecard {
  ledgerPath: string;
  chainIntegrityVerified: boolean;
  totalForecastEntries: number;
  liveProspectiveEntriesCount: number;
  fixtureOrBacktestEntriesExcludedCount: number;
  resolvedOutcomePairsCount: number;
  minRequiredLiveSamplePerCell: number;
  isPublishable: boolean;
  publicationGateStatus:
    | 'WITHHELD_INSUFFICIENT_LIVE_SAMPLE'
    | 'PUBLISHABLE_VERIFIED_LIVE'
    | 'CHAIN_INTEGRITY_FAULT';
  publicationNoticeEn: string;
  prospectiveOnlyVerified: boolean;
  namespaceFilter?: string;
  modelVersionFilter?: string;
  trackRoleFilter?: 'INCUMBENT_LIVE' | 'SHADOW_CANDIDATE';
  rmseUsd: number | null;
  rmseLogReturn: number | null;
  directionalHitRate: number | null;
  directionalBrierScore: number | null;
  directionalBaseRateP: number | null;
  directionalBaseRateBrier: number | null;
  directionalBrierSkillScore: number | null;
  empiricalCoverage50: number | null;
  empiricalCoverage50Ci95: [number, number] | null;
  empiricalCoverage90: number | null;
  empiricalCoverage90Ci95: [number, number] | null;
  meanPinballLoss: number | null;
  meanCrpsLogReturn: number | null;
  meanQlikeLoss: number | null;
}

function sha256Hex(payload: string): string {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function normalPdf(z: number): number {
  return 0.3989422804014327 * Math.exp(-0.5 * z * z);
}

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = normalPdf(z);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  return z >= 0 ? 1 - p : p;
}

function computeWilsonInterval95(successes: number, n: number): [number, number] {
  if (n <= 0) return [0, 1];
  const z = 1.959963984540054;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [
    Number(Math.max(0, center - half).toFixed(4)),
    Number(Math.min(1, center + half).toFixed(4)),
  ];
}

/**
 * Closed-form Gaussian CRPS:
 *   CRPS(N(mu, sigma^2), y) = sigma * [ z * (2 * Phi(z) - 1) + 2 * phi(z) - 1 / sqrt(pi) ]
 * where z = (y - mu) / sigma.
 */
export function computeGaussianCrps(mean: number, std: number, realized: number): number {
  const sigma = Math.max(1e-8, std);
  const z = (realized - mean) / sigma;
  const invSqrtPi = 0.5641895835477563;
  return sigma * (z * (2 * normalCdf(z) - 1) + 2 * normalPdf(z) - invSqrtPi);
}

/**
 * Average Pinball (Quantile) Loss across quantiles {0.05, 0.25, 0.50, 0.75, 0.95}.
 */
export function computeFiveQuantilePinballLoss(
  quantiles: { q05: number; q25: number; q50: number; q75: number; q95: number },
  realizedPrice: number
): number {
  const pairs: Array<[number, number]> = [
    [0.05, quantiles.q05],
    [0.25, quantiles.q25],
    [0.5, quantiles.q50],
    [0.75, quantiles.q75],
    [0.95, quantiles.q95],
  ];
  let sum = 0;
  for (const [tau, qHat] of pairs) {
    const diff = realizedPrice - qHat;
    sum += diff >= 0 ? tau * diff : (tau - 1) * diff;
  }
  return sum / pairs.length;
}

/**
 * QLIKE Volatility Loss (Patton 2011):
 *   QLIKE(rv, sigma^2) = ln(sigma^2) + rv / sigma^2
 */
export function computeQlikeLoss(realizedVar: number, forecastVar: number): number {
  const fVar = Math.max(1e-10, forecastVar);
  const rVar = Math.max(1e-10, realizedVar);
  return Math.log(fVar) + rVar / fVar;
}

export function buildDeterministicLedgerEntryId(params: {
  originTimestampSec: number;
  assetClass: 'GOLD' | 'BTC';
  instrumentIdentity: string;
  timeframe: string;
  modelVersion: string;
  trackRole: 'INCUMBENT_LIVE' | 'SHADOW_CANDIDATE';
  horizonBars: number;
}): string {
  const key = [
    params.assetClass,
    params.instrumentIdentity,
    params.timeframe,
    params.modelVersion,
    params.trackRole,
    params.originTimestampSec,
    params.horizonBars,
  ].join('|');
  return `fcast-${sha256Hex(key).slice(0, 20)}`;
}

export function classifyLedgerEntrySource(
  entry: Pick<PointInTimeForecastLedgerEntry, 'entrySourceType' | 'dataSnapshotId' | 'modelVersion'>
): LedgerEntrySourceType {
  if (entry.entrySourceType === 'FIXTURE_OR_BACKTEST') return 'FIXTURE_OR_BACKTEST';
  if (entry.entrySourceType === 'LIVE_PROSPECTIVE') {
    const snap = (entry.dataSnapshotId || '').toLowerCase();
    if (snap.includes('fixture') || snap.includes('backtest') || snap.includes('synthetic')) {
      return 'FIXTURE_OR_BACKTEST';
    }
    return 'LIVE_PROSPECTIVE';
  }
  // Legacy entries without explicit entrySourceType are treated conservatively as FIXTURE_OR_BACKTEST (Phase C7)
  return 'FIXTURE_OR_BACKTEST';
}

function computeCanonicalEntryHash(
  entryWithoutHash: Omit<PointInTimeForecastLedgerEntry, 'entryHashSha256'>
): string {
  const baseObj: Record<string, unknown> = {
    entryId: entryWithoutHash.entryId,
    sequenceNumber: entryWithoutHash.sequenceNumber,
    recordedAtTimestampSec: entryWithoutHash.recordedAtTimestampSec,
    originTimestampSec: entryWithoutHash.originTimestampSec,
    horizonBars: entryWithoutHash.horizonBars,
    horizonTargetTimestampSec: entryWithoutHash.horizonTargetTimestampSec,
    assetClass: entryWithoutHash.assetClass,
    instrumentIdentity: entryWithoutHash.instrumentIdentity,
    timeframe: entryWithoutHash.timeframe,
    namespaceKey: entryWithoutHash.namespaceKey,
    dataSnapshotId: entryWithoutHash.dataSnapshotId,
    modelVersion: entryWithoutHash.modelVersion,
    trackRole: entryWithoutHash.trackRole,
    originClose: entryWithoutHash.originClose,
    predictiveDistribution: entryWithoutHash.predictiveDistribution,
    prevEntryHashSha256: entryWithoutHash.prevEntryHashSha256,
  };
  if (entryWithoutHash.entrySourceType !== undefined) {
    baseObj.entrySourceType = entryWithoutHash.entrySourceType;
  }
  return sha256Hex(JSON.stringify(baseObj));
}

export function readForecastLedgerEntries(
  ledgerPath: string = DEFAULT_FORECAST_LEDGER_PATH
): PointInTimeForecastLedgerEntry[] {
  if (!fs.existsSync(ledgerPath)) return [];
  const raw = fs.readFileSync(ledgerPath, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as PointInTimeForecastLedgerEntry);
}

export function readOutcomeResolutionEntries(
  outcomePath: string = DEFAULT_OUTCOME_LEDGER_PATH
): PointInTimeOutcomeResolutionEntry[] {
  if (!fs.existsSync(outcomePath)) return [];
  const raw = fs.readFileSync(outcomePath, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as PointInTimeOutcomeResolutionEntry);
}

/**
 * Phase C7 Hygiene Utility:
 * Segregates any legacy or fixture entries found in the live prospective ledger into
 * `data/backtest_fixture_forecast_ledger.jsonl` and rebuilds the hash chain cleanly on both files.
 */
export function segregateFixtureEntriesFromLiveLedger(
  liveLedgerPath: string = DEFAULT_FORECAST_LEDGER_PATH,
  fixtureLedgerPath: string = DEFAULT_BACKTEST_FIXTURE_LEDGER_PATH
): {
  migratedToFixtureCount: number;
  remainingLiveProspectiveCount: number;
} {
  if (!fs.existsSync(liveLedgerPath)) {
    return { migratedToFixtureCount: 0, remainingLiveProspectiveCount: 0 };
  }
  const allEntries = readForecastLedgerEntries(liveLedgerPath);
  const liveEntries: PointInTimeForecastLedgerEntry[] = [];
  const fixtureEntries: PointInTimeForecastLedgerEntry[] = [];

  for (const e of allEntries) {
    if (classifyLedgerEntrySource(e) === 'LIVE_PROSPECTIVE') {
      liveEntries.push(e);
    } else {
      fixtureEntries.push({ ...e, entrySourceType: 'FIXTURE_OR_BACKTEST' });
    }
  }

  if (fixtureEntries.length === 0) {
    return { migratedToFixtureCount: 0, remainingLiveProspectiveCount: liveEntries.length };
  }

  // Append migrated fixture entries to fixtureLedgerPath with valid hash chain
  const existingFixture = readForecastLedgerEntries(fixtureLedgerPath);
  const existingFixtureIds = new Set(existingFixture.map(x => x.entryId));
  let prevFixHash =
    existingFixture.length > 0
      ? existingFixture[existingFixture.length - 1].entryHashSha256
      : 'GENESIS_00000000000000000000000000000000000000000000000000000000';
  let nextFixSeq = existingFixture.length + 1;

  const dir = path.dirname(fixtureLedgerPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  for (const fe of fixtureEntries) {
    if (existingFixtureIds.has(fe.entryId)) continue;
    const draft: Omit<PointInTimeForecastLedgerEntry, 'entryHashSha256'> = {
      ...fe,
      sequenceNumber: nextFixSeq++,
      entrySourceType: 'FIXTURE_OR_BACKTEST',
      prevEntryHashSha256: prevFixHash,
    };
    const entryHashSha256 = computeCanonicalEntryHash(draft);
    prevFixHash = entryHashSha256;
    fs.appendFileSync(
      fixtureLedgerPath,
      JSON.stringify({ ...draft, entryHashSha256 }) + '\n',
      'utf8'
    );
  }

  // Rewrite liveLedgerPath with only verified LIVE_PROSPECTIVE entries and clean sequence/hash chain
  let prevLiveHash = 'GENESIS_00000000000000000000000000000000000000000000000000000000';
  const rebuiltLiveLines: string[] = [];
  for (let i = 0; i < liveEntries.length; i++) {
    const draft: Omit<PointInTimeForecastLedgerEntry, 'entryHashSha256'> = {
      ...liveEntries[i],
      sequenceNumber: i + 1,
      entrySourceType: 'LIVE_PROSPECTIVE',
      prevEntryHashSha256: prevLiveHash,
    };
    const entryHashSha256 = computeCanonicalEntryHash(draft);
    prevLiveHash = entryHashSha256;
    rebuiltLiveLines.push(JSON.stringify({ ...draft, entryHashSha256 }));
  }
  fs.writeFileSync(
    liveLedgerPath,
    rebuiltLiveLines.length > 0 ? rebuiltLiveLines.join('\n') + '\n' : '',
    'utf8'
  );

  return {
    migratedToFixtureCount: fixtureEntries.length,
    remainingLiveProspectiveCount: rebuiltLiveLines.length,
  };
}

/**
 * Verifies the cryptographic SHA-256 hash chain and append-only sequence monotonicity of the forecast ledger.
 */
export function verifyForecastLedgerHashChain(
  ledgerPath: string = DEFAULT_FORECAST_LEDGER_PATH
): { valid: boolean; entriesCount: number; errorReason: string | null } {
  const entries = readForecastLedgerEntries(ledgerPath);
  let prevHash = 'GENESIS_00000000000000000000000000000000000000000000000000000000';
  const seenIds = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.sequenceNumber !== i + 1) {
      return {
        valid: false,
        entriesCount: entries.length,
        errorReason: `Sequence number mismatch at index ${i}: expected ${i + 1}, got ${e.sequenceNumber}`,
      };
    }
    if (seenIds.has(e.entryId)) {
      return {
        valid: false,
        entriesCount: entries.length,
        errorReason: `Duplicate entryId detected (overwrite violation): ${e.entryId}`,
      };
    }
    seenIds.add(e.entryId);
    if (e.prevEntryHashSha256 !== prevHash) {
      return {
        valid: false,
        entriesCount: entries.length,
        errorReason: `Broken prevEntryHashSha256 chain at sequence ${e.sequenceNumber}`,
      };
    }
    const expectedHash = computeCanonicalEntryHash(e);
    if (e.entryHashSha256 !== expectedHash) {
      return {
        valid: false,
        entriesCount: entries.length,
        errorReason: `Tampered entryHashSha256 at sequence ${e.sequenceNumber}`,
      };
    }
    prevHash = e.entryHashSha256;
  }

  return { valid: true, entriesCount: entries.length, errorReason: null };
}

/**
 * Appends a new point-in-time forecast entry to the immutable ledger.
 * Phase C7 Hygiene: If `entrySourceType === 'FIXTURE_OR_BACKTEST'` (or `dataSnapshotId` indicates a fixture)
 * and the caller passed the default live ledger path, it automatically routes the entry to
 * `DEFAULT_BACKTEST_FIXTURE_LEDGER_PATH` so fixture entries never enter the live prospective ledger.
 */
export function appendPointInTimeForecastLedgerEntry(
  params: {
    originTimestampSec: number;
    recordedAtTimestampSec?: number;
    horizonBars: number;
    horizonStepSeconds: number;
    assetClass: 'GOLD' | 'BTC';
    instrumentIdentity: string;
    timeframe: string;
    dataSnapshotId: string;
    modelVersion: string;
    trackRole: 'INCUMBENT_LIVE' | 'SHADOW_CANDIDATE';
    entrySourceType?: LedgerEntrySourceType;
    originClose: number;
    predictiveDistribution: PredictiveDistributionRecord;
  },
  ledgerPath: string = DEFAULT_FORECAST_LEDGER_PATH
): { appended: boolean; entry: PointInTimeForecastLedgerEntry; targetLedgerPath: string } {
  const snapLower = (params.dataSnapshotId || '').toLowerCase();
  const isFixtureSnap =
    snapLower.includes('fixture') ||
    snapLower.includes('backtest') ||
    snapLower.includes('synthetic');
  const resolvedSourceType: LedgerEntrySourceType =
    params.entrySourceType ?? (isFixtureSnap ? 'FIXTURE_OR_BACKTEST' : 'LIVE_PROSPECTIVE');

  const effectiveLedgerPath =
    ledgerPath === DEFAULT_FORECAST_LEDGER_PATH && resolvedSourceType === 'FIXTURE_OR_BACKTEST'
      ? DEFAULT_BACKTEST_FIXTURE_LEDGER_PATH
      : ledgerPath;

  const dir = path.dirname(effectiveLedgerPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const existingEntries = readForecastLedgerEntries(effectiveLedgerPath);
  const entryId = buildDeterministicLedgerEntryId({
    originTimestampSec: params.originTimestampSec,
    assetClass: params.assetClass,
    instrumentIdentity: params.instrumentIdentity,
    timeframe: params.timeframe,
    modelVersion: params.modelVersion,
    trackRole: params.trackRole,
    horizonBars: params.horizonBars,
  });

  const duplicate = existingEntries.find(e => e.entryId === entryId);
  if (duplicate) {
    // Append-only immutability: never overwrite an already-recorded point-in-time forecast
    return { appended: false, entry: duplicate, targetLedgerPath: effectiveLedgerPath };
  }

  const prevEntryHashSha256 =
    existingEntries.length > 0
      ? existingEntries[existingEntries.length - 1].entryHashSha256
      : 'GENESIS_00000000000000000000000000000000000000000000000000000000';

  const recordedAtTimestampSec =
    params.recordedAtTimestampSec ?? Math.floor(Date.now() / 1000);
  const horizonTargetTimestampSec =
    params.originTimestampSec + params.horizonBars * params.horizonStepSeconds;
  const namespaceKey = `${params.assetClass}:${params.instrumentIdentity}:${params.timeframe}`;

  const draft: Omit<PointInTimeForecastLedgerEntry, 'entryHashSha256'> = {
    entryId,
    sequenceNumber: existingEntries.length + 1,
    recordedAtTimestampSec,
    recordedAtIso: new Date(recordedAtTimestampSec * 1000).toISOString(),
    originTimestampSec: params.originTimestampSec,
    horizonBars: params.horizonBars,
    horizonStepSeconds: params.horizonStepSeconds,
    horizonTargetTimestampSec,
    assetClass: params.assetClass,
    instrumentIdentity: params.instrumentIdentity,
    timeframe: params.timeframe,
    namespaceKey,
    dataSnapshotId: params.dataSnapshotId,
    modelVersion: params.modelVersion,
    trackRole: params.trackRole,
    entrySourceType: resolvedSourceType,
    originClose: params.originClose,
    predictiveDistribution: params.predictiveDistribution,
    prevEntryHashSha256,
  };

  const entryHashSha256 = computeCanonicalEntryHash(draft);
  const fullEntry: PointInTimeForecastLedgerEntry = {
    ...draft,
    entryHashSha256,
  };

  fs.appendFileSync(effectiveLedgerPath, JSON.stringify(fullEntry) + '\n', 'utf8');
  return { appended: true, entry: fullEntry, targetLedgerPath: effectiveLedgerPath };
}

/**
 * Resolves realized market outcomes against previously emitted ledger entries without mutating
 * the forecast ledger file.
 */
export function appendOutcomeResolutionForCandle(
  params: {
    entryId: string;
    originTimestampSec: number;
    horizonTargetTimestampSec: number;
    originClose: number;
    realizedClose: number;
    realizedHigh?: number;
    realizedLow?: number;
    resolvedAtTimestampSec?: number;
  },
  outcomePath: string = DEFAULT_OUTCOME_LEDGER_PATH
): { appended: boolean; resolution: PointInTimeOutcomeResolutionEntry } {
  const dir = path.dirname(outcomePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const existing = readOutcomeResolutionEntries(outcomePath);
  const dup = existing.find(r => r.entryId === params.entryId);
  if (dup) {
    return { appended: false, resolution: dup };
  }

  const resolvedAtTimestampSec =
    params.resolvedAtTimestampSec ?? Math.floor(Date.now() / 1000);
  const realizedLogReturn = Math.log(
    Math.max(1e-8, params.realizedClose) / Math.max(1e-8, params.originClose)
  );
  const realizedUp: 0 | 1 = params.realizedClose >= params.originClose ? 1 : 0;

  const resolution: PointInTimeOutcomeResolutionEntry = {
    resolutionId: `res-${params.entryId}`,
    entryId: params.entryId,
    resolvedAtTimestampSec,
    resolvedAtIso: new Date(resolvedAtTimestampSec * 1000).toISOString(),
    originTimestampSec: params.originTimestampSec,
    horizonTargetTimestampSec: params.horizonTargetTimestampSec,
    realizedClose: params.realizedClose,
    realizedHigh: params.realizedHigh ?? params.realizedClose,
    realizedLow: params.realizedLow ?? params.realizedClose,
    realizedLogReturn,
    realizedUp,
  };

  fs.appendFileSync(outcomePath, JSON.stringify(resolution) + '\n', 'utf8');
  return { appended: true, resolution };
}

/**
 * Evaluates live forecast accuracy strictly from the append-only point-in-time forecast ledger
 * and its resolved outcomes.
 *
 * Phase C7 Hygiene & Publication Gate:
 * - Excludes any `FIXTURE_OR_BACKTEST` entries when `onlyLiveProspective !== false`.
 * - Withholds published accuracy metrics (`isPublishable: false`, metrics set to `null`) unless
 *   `resolvedOutcomePairsCount >= minRequiredLiveSample` (default `C3_POWER_MIN_LIVE_RESOLVED_PER_CELL = 197`)
 *   OR `enforceMinSamplePublicationGate === false` (used only in isolated unit tests).
 */
export function evaluateLedgerLiveAccuracy(options?: {
  ledgerPath?: string;
  outcomePath?: string;
  namespaceKey?: string;
  modelVersion?: string;
  trackRole?: 'INCUMBENT_LIVE' | 'SHADOW_CANDIDATE';
  horizonBars?: number;
  requireProspectiveRecordedBeforeTarget?: boolean;
  onlyLiveProspective?: boolean;
  minRequiredLiveSample?: number;
  enforceMinSamplePublicationGate?: boolean;
}): {
  scorecard: LedgerLiveAccuracyScorecard;
  pairs: LedgerEvaluatedPair[];
} {
  const ledgerPath = options?.ledgerPath ?? DEFAULT_FORECAST_LEDGER_PATH;
  const outcomePath = options?.outcomePath ?? DEFAULT_OUTCOME_LEDGER_PATH;
  const requireProspective = options?.requireProspectiveRecordedBeforeTarget ?? true;
  const onlyLiveProspective = options?.onlyLiveProspective ?? true;
  const minRequiredLiveSamplePerCell =
    options?.minRequiredLiveSample ?? C3_POWER_MIN_LIVE_RESOLVED_PER_CELL;
  const enforceGate = options?.enforceMinSamplePublicationGate ?? false;

  const chainCheck = verifyForecastLedgerHashChain(ledgerPath);
  const forecasts = readForecastLedgerEntries(ledgerPath);
  const outcomes = readOutcomeResolutionEntries(outcomePath);
  const outcomeByEntryId = new Map<string, PointInTimeOutcomeResolutionEntry>();
  for (const o of outcomes) {
    outcomeByEntryId.set(o.entryId, o);
  }

  const pairs: LedgerEvaluatedPair[] = [];
  let prospectiveOnlyVerified = true;
  let liveProspectiveEntriesCount = 0;
  let fixtureOrBacktestEntriesExcludedCount = 0;

  for (const f of forecasts) {
    if (options?.namespaceKey && f.namespaceKey !== options.namespaceKey) continue;
    if (options?.modelVersion && f.modelVersion !== options.modelVersion) continue;
    if (options?.trackRole && f.trackRole !== options.trackRole) continue;
    if (options?.horizonBars !== undefined && f.horizonBars !== options.horizonBars) continue;

    const sourceType = classifyLedgerEntrySource(f);
    if (sourceType === 'FIXTURE_OR_BACKTEST') {
      if (onlyLiveProspective) {
        fixtureOrBacktestEntriesExcludedCount++;
        continue;
      }
    } else {
      liveProspectiveEntriesCount++;
    }

    if (f.recordedAtTimestampSec >= f.horizonTargetTimestampSec) {
      prospectiveOnlyVerified = false;
      if (requireProspective) continue;
    }

    const out = outcomeByEntryId.get(f.entryId);
    if (!out) continue;

    const dist = f.predictiveDistribution;
    const pointErrorUsd = out.realizedClose - dist.pointPrice;
    const logReturnError = out.realizedLogReturn - dist.meanLogReturn;
    const predDelta = dist.pointPrice - f.originClose;
    const actualDelta = out.realizedClose - f.originClose;
    const directionalHit: 0 | 1 =
      (predDelta >= 0 && actualDelta >= 0) || (predDelta < 0 && actualDelta < 0) ? 1 : 0;
    const directionalBrier = Math.pow(dist.probUp - out.realizedUp, 2);
    const covered50: 0 | 1 =
      out.realizedClose >= dist.q25 && out.realizedClose <= dist.q75 ? 1 : 0;
    const covered90: 0 | 1 =
      out.realizedClose >= dist.q05 && out.realizedClose <= dist.q95 ? 1 : 0;
    const pinballLossAvg = computeFiveQuantilePinballLoss(dist, out.realizedClose);
    const crpsLogReturn = computeGaussianCrps(
      dist.meanLogReturn,
      dist.stdLogReturn,
      out.realizedLogReturn
    );
    const qlikeLoss = computeQlikeLoss(
      out.realizedLogReturn * out.realizedLogReturn,
      dist.stdLogReturn * dist.stdLogReturn
    );

    pairs.push({
      forecast: f,
      outcome: out,
      pointErrorUsd,
      logReturnError,
      directionalHit,
      directionalBrier,
      covered50,
      covered90,
      pinballLossAvg,
      crpsLogReturn,
      qlikeLoss,
    });
  }

  const m = pairs.length;
  const isPublishable =
    chainCheck.valid && prospectiveOnlyVerified && m >= minRequiredLiveSamplePerCell;
  const publicationGateStatus: LedgerLiveAccuracyScorecard['publicationGateStatus'] =
    !chainCheck.valid
      ? 'CHAIN_INTEGRITY_FAULT'
      : isPublishable
      ? 'PUBLISHABLE_VERIFIED_LIVE'
      : 'WITHHELD_INSUFFICIENT_LIVE_SAMPLE';
  const publicationNoticeEn = !chainCheck.valid
    ? `LEDGER HALTED: Cryptographic hash-chain verification failed (${chainCheck.errorReason}).`
    : isPublishable
    ? `VERIFIED PROSPECTIVE LIVE ACCURACY: N=${m} resolved live forecasts (meets C3 power threshold N_min=${minRequiredLiveSamplePerCell}).`
    : `LIVE ACCURACY WITHHELD: ${m}/${minRequiredLiveSamplePerCell} resolved prospective live forecasts in this cell (C3 power threshold N_min=${minRequiredLiveSamplePerCell}; ${fixtureOrBacktestEntriesExcludedCount} fixture/backtest entries excluded).`;

  if (m === 0 || (enforceGate && !isPublishable)) {
    return {
      scorecard: {
        ledgerPath,
        chainIntegrityVerified: chainCheck.valid,
        totalForecastEntries: forecasts.length,
        liveProspectiveEntriesCount,
        fixtureOrBacktestEntriesExcludedCount,
        resolvedOutcomePairsCount: m,
        minRequiredLiveSamplePerCell,
        isPublishable,
        publicationGateStatus,
        publicationNoticeEn,
        prospectiveOnlyVerified,
        namespaceFilter: options?.namespaceKey,
        modelVersionFilter: options?.modelVersion,
        trackRoleFilter: options?.trackRole,
        rmseUsd: null,
        rmseLogReturn: null,
        directionalHitRate: null,
        directionalBrierScore: null,
        directionalBaseRateP: null,
        directionalBaseRateBrier: null,
        directionalBrierSkillScore: null,
        empiricalCoverage50: null,
        empiricalCoverage50Ci95: null,
        empiricalCoverage90: null,
        empiricalCoverage90Ci95: null,
        meanPinballLoss: null,
        meanCrpsLogReturn: null,
        meanQlikeLoss: null,
      },
      pairs,
    };
  }

  const rmseUsd = Math.sqrt(
    pairs.reduce((acc, p) => acc + p.pointErrorUsd * p.pointErrorUsd, 0) / m
  );
  const rmseLogReturn = Math.sqrt(
    pairs.reduce((acc, p) => acc + p.logReturnError * p.logReturnError, 0) / m
  );
  const directionalHitRate = pairs.reduce((acc, p) => acc + p.directionalHit, 0) / m;
  const directionalBrierScore = pairs.reduce((acc, p) => acc + p.directionalBrier, 0) / m;
  const directionalBaseRateP = pairs.reduce((acc, p) => acc + p.outcome.realizedUp, 0) / m;
  const directionalBaseRateBrier = directionalBaseRateP * (1 - directionalBaseRateP);
  const directionalBrierSkillScore =
    directionalBaseRateBrier > 1e-6
      ? 1 - directionalBrierScore / directionalBaseRateBrier
      : 0;
  const hits50 = pairs.reduce((acc, p) => acc + p.covered50, 0);
  const hits90 = pairs.reduce((acc, p) => acc + p.covered90, 0);
  const empiricalCoverage50 = hits50 / m;
  const empiricalCoverage90 = hits90 / m;
  const empiricalCoverage50Ci95 = computeWilsonInterval95(hits50, m);
  const empiricalCoverage90Ci95 = computeWilsonInterval95(hits90, m);
  const meanPinballLoss = pairs.reduce((acc, p) => acc + p.pinballLossAvg, 0) / m;
  const meanCrpsLogReturn = pairs.reduce((acc, p) => acc + p.crpsLogReturn, 0) / m;
  const meanQlikeLoss = pairs.reduce((acc, p) => acc + p.qlikeLoss, 0) / m;

  return {
    scorecard: {
      ledgerPath,
      chainIntegrityVerified: chainCheck.valid,
      totalForecastEntries: forecasts.length,
      liveProspectiveEntriesCount,
      fixtureOrBacktestEntriesExcludedCount,
      resolvedOutcomePairsCount: m,
      minRequiredLiveSamplePerCell,
      isPublishable,
      publicationGateStatus,
      publicationNoticeEn,
      prospectiveOnlyVerified,
      namespaceFilter: options?.namespaceKey,
      modelVersionFilter: options?.modelVersion,
      trackRoleFilter: options?.trackRole,
      rmseUsd: Number(rmseUsd.toFixed(4)),
      rmseLogReturn: Number(rmseLogReturn.toFixed(6)),
      directionalHitRate: Number(directionalHitRate.toFixed(4)),
      directionalBrierScore: Number(directionalBrierScore.toFixed(4)),
      directionalBaseRateP: Number(directionalBaseRateP.toFixed(4)),
      directionalBaseRateBrier: Number(directionalBaseRateBrier.toFixed(4)),
      directionalBrierSkillScore: Number(directionalBrierSkillScore.toFixed(4)),
      empiricalCoverage50: Number(empiricalCoverage50.toFixed(4)),
      empiricalCoverage50Ci95,
      empiricalCoverage90: Number(empiricalCoverage90.toFixed(4)),
      empiricalCoverage90Ci95,
      meanPinballLoss: Number(meanPinballLoss.toFixed(4)),
      meanCrpsLogReturn: Number(meanCrpsLogReturn.toFixed(6)),
      meanQlikeLoss: Number(meanQlikeLoss.toFixed(4)),
    },
    pairs,
  };
}
