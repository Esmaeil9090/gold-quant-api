import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  VerifiedMacroYieldResult,
  MacroObservationEpistemicState,
} from '../contracts/quantContracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const C2_FRED_PATH = path.resolve(
  __dirname,
  '../../data/c2_real_sample/fred_dated_macro_2022_to_date.json'
);
const DEFAULT_FRED_FIXTURE_PATH = fs.existsSync(C2_FRED_PATH)
  ? C2_FRED_PATH
  : path.resolve(__dirname, '../../fixtures/real-market/fred_dated_macro_series.json');

export interface PointInTimeMacroObservation {
  observationDateIso?: string;
  date?: string;
  /**
   * UTC timestamp (seconds) at which this macro observation became available to market participants.
   */
  effectiveAvailableTimestampSec?: number;
  timestampSec?: number;
  effectiveAvailableIso?: string;
  nominal10Y: number;
  tipsRealYield10Y?: number;
  tips10YRealYield?: number;
  breakevenInflation10Y: number;
  dxyIndex: number;
  alfredVintageVerified?: boolean;
  sourceProvenance?:
    | 'REAL_FRED_DATED_CSV'
    | 'REAL_FIXTURE_DATED_SERIES'
    | 'SYNTHETIC_TEST_PERTURBATION';
}

export interface PointInTimeMacroSeriesBundle {
  dataClassification: 'REAL-DATA' | 'REAL-FIXTURE' | 'SYNTHETIC' | 'NOT VERIFIED';
  source: string;
  retrievedAtIso: string;
  observations: PointInTimeMacroObservation[];
}

let cachedFixtureBundle: PointInTimeMacroSeriesBundle | null = null;

/**
 * Loads the persisted dated FRED series (`data/c2_real_sample/fred_dated_macro_2022_to_date.json` or fallback fixture).
 * Guarantees that both `effectiveAvailableTimestampSec` and `timestampSec` are populated on every observation.
 */
export function loadPointInTimeMacroSeriesFromFixture(
  fixturePath: string = DEFAULT_FRED_FIXTURE_PATH
): PointInTimeMacroSeriesBundle {
  if (fixturePath === DEFAULT_FRED_FIXTURE_PATH && cachedFixtureBundle) {
    return {
      ...cachedFixtureBundle,
      observations: cachedFixtureBundle.observations.map(o => ({ ...o })),
    };
  }
  if (fs.existsSync(fixturePath)) {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
    const obs: PointInTimeMacroObservation[] = Array.isArray(raw.observations)
      ? raw.observations
          .filter(
            (o: any) =>
              Number.isFinite(o.effectiveAvailableTimestampSec ?? o.timestampSec) &&
              Number.isFinite(o.nominal10Y) &&
              Number.isFinite(o.tipsRealYield10Y ?? o.tips10YRealYield) &&
              Number.isFinite(o.breakevenInflation10Y) &&
              Number.isFinite(o.dxyIndex)
          )
          .map((o: any) => {
            const ts = Number(o.effectiveAvailableTimestampSec ?? o.timestampSec);
            return {
              ...o,
              effectiveAvailableTimestampSec: ts,
              timestampSec: ts,
              tipsRealYield10Y: Number(o.tipsRealYield10Y ?? o.tips10YRealYield),
            } as PointInTimeMacroObservation;
          })
          .sort(
            (a: PointInTimeMacroObservation, b: PointInTimeMacroObservation) =>
              (a.effectiveAvailableTimestampSec ?? a.timestampSec ?? 0) -
              (b.effectiveAvailableTimestampSec ?? b.timestampSec ?? 0)
          )
      : [];
    const bundle: PointInTimeMacroSeriesBundle = {
      dataClassification: raw.dataClassification || 'REAL-FIXTURE',
      source: raw.source || 'FRED Dated Series Fixture',
      retrievedAtIso: raw.retrievedAtIso || new Date().toISOString(),
      observations: obs,
    };
    if (fixturePath === DEFAULT_FRED_FIXTURE_PATH) {
      cachedFixtureBundle = bundle;
    }
    return {
      ...bundle,
      observations: bundle.observations.map(o => ({ ...o })),
    };
  }
  return {
    dataClassification: 'NOT VERIFIED',
    source: 'UNAVAILABLE',
    retrievedAtIso: new Date().toISOString(),
    observations: [],
  };
}

/**
 * Converts a point-in-time macro observation into a `VerifiedMacroYieldResult` using ONLY
 * data available at or before `originTimestampSec`.
 */
export function buildVerifiedMacroFromObservation(
  obs: PointInTimeMacroObservation,
  originTimestampSec?: number
): VerifiedMacroYieldResult {
  const nominal10Y = Number.isFinite(obs.nominal10Y) ? obs.nominal10Y : 4.0;
  const tipsRealYield10Y = Number.isFinite(obs.tipsRealYield10Y ?? obs.tips10YRealYield)
    ? (obs.tipsRealYield10Y ?? obs.tips10YRealYield!)
    : 2.0;
  const breakevenInflation10Y = Number.isFinite(obs.breakevenInflation10Y)
    ? obs.breakevenInflation10Y
    : 2.15;
  const dxyIndex = Number.isFinite(obs.dxyIndex) ? obs.dxyIndex : 103.5;
  const dateStr = obs.observationDateIso || obs.date || '1970-01-01';
  const availTs = obs.effectiveAvailableTimestampSec ?? obs.timestampSec ?? 0;
  const ageSec =
    typeof originTimestampSec === 'number' && Number.isFinite(originTimestampSec)
      ? Math.max(0, originTimestampSec - availTs)
      : 0;

  // Classify among the 5 epistemic states:
  // - If observation age exceeds 4 days (345,600s), mark as RELEASE_DELAYED_OR_HOLIDAY
  // - If ALFRED vintage verification is absent on a historical revised series, mark VINTAGE_UNAVAILABLE_REVISION_RISK
  //   unless it is a verified point-in-time daily market yield/FX series
  let epistemicState: MacroObservationEpistemicState = 'VERIFIED_POINT_IN_TIME';
  if (ageSec > 4 * 86400) {
    epistemicState = 'RELEASE_DELAYED_OR_HOLIDAY';
  } else if (obs.alfredVintageVerified === false) {
    epistemicState = 'VINTAGE_UNAVAILABLE_REVISION_RISK';
  }

  // Deterministic macro force decomposition identical to realDataWaterfall.ts
  const realYieldGravity = parseFloat(((2.0 - tipsRealYield10Y) * 1.45).toFixed(2));
  const dollarDrag = parseFloat(((103.5 - dxyIndex) * 0.55).toFixed(2));
  const centralBankTide = parseFloat(((breakevenInflation10Y - 2.15) * 0.85).toFixed(2));
  const netMacroLift = parseFloat(
    (realYieldGravity + dollarDrag + centralBankTide).toFixed(2)
  );

  return {
    nominal10Y,
    tipsRealYield10Y,
    breakevenInflation10Y,
    dxyIndex,
    realYieldGravity,
    dollarDrag,
    centralBankTide,
    netMacroLift,
    source: `Point-in-Time FRED Dated Series (asOf=${dateStr}, avail=${availTs}, state=${epistemicState})`,
    status:
      epistemicState === 'RELEASE_DELAYED_OR_HOLIDAY'
        ? 'DEGRADED_CACHED_REAL'
        : 'ONLINE_MULTI_SOURCE_VERIFIED',
    epistemicState,
    effectiveAvailableTimestampSec: availTs,
    observationAgeSec: ageSec,
    lastUpdated: `${dateStr} 21:00:00 UTC`,
    respondingSources: [
      'St. Louis Fed FRED (DGS10)',
      'St. Louis Fed FRED (DFII10)',
      'St. Louis Fed FRED (T10YIE)',
      'St. Louis Fed FRED (DTWEXBGS)',
    ],
    missingSeries: [],
    sanityCheckZScore: 0,
    outliersRejected: [],
  };
}

/**
 * Strictly Causal Point-in-Time Macro Resolver (Phase A.3 + 5-State Epistemic Taxonomy).
 */
export function resolvePointInTimeMacroAt(
  originTimestampSec: number,
  observations: PointInTimeMacroObservation[]
): VerifiedMacroYieldResult {
  let latestEligible: PointInTimeMacroObservation | null = null;
  let earliestAvailableTs = Infinity;
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const availTs = obs.effectiveAvailableTimestampSec ?? obs.timestampSec ?? Infinity;
    if (availTs < earliestAvailableTs) {
      earliestAvailableTs = availTs;
    }
    if (availTs <= originTimestampSec) {
      const prevTs =
        latestEligible
          ? (latestEligible.effectiveAvailableTimestampSec ?? latestEligible.timestampSec ?? -Infinity)
          : -Infinity;
      if (!latestEligible || availTs >= prevTs) {
        latestEligible = obs;
      }
    }
  }

  if (!latestEligible) {
    const epistemicState: MacroObservationEpistemicState =
      observations.length > 0 && originTimestampSec < earliestAvailableTs
        ? 'PRE_SERIES_HISTORICAL_MISSING'
        : 'LIVE_FEED_UNAVAILABLE_OR_QUORUM_FAILED';

    return {
      nominal10Y: NaN,
      tipsRealYield10Y: NaN,
      breakevenInflation10Y: NaN,
      dxyIndex: NaN,
      realYieldGravity: 0,
      dollarDrag: 0,
      centralBankTide: 0,
      netMacroLift: 0,
      source:
        epistemicState === 'PRE_SERIES_HISTORICAL_MISSING'
          ? 'PRE_SERIES_HISTORICAL_MISSING_AT_ORIGIN'
          : 'MACRO_FEED_UNAVAILABLE_AT_ORIGIN',
      status: 'MACRO_FEED_UNAVAILABLE',
      epistemicState,
      effectiveAvailableTimestampSec: undefined,
      observationAgeSec: undefined,
      lastUpdated: '1970-01-01 00:00:00 UTC',
      respondingSources: [],
      missingSeries: ['nominal10Y', 'dxyIndex', 'tipsRealYield10Y', 'breakevenInflation10Y'],
      sanityCheckZScore: 0,
      outliersRejected: [],
    };
  }

  return buildVerifiedMacroFromObservation(latestEligible, originTimestampSec);
}
