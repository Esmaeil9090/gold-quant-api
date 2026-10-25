/**
 * GDF (Gold Dynamic Flow) — Phase 0/1 Feature Flag & Runtime Governance Configuration
 * Enables safe, reversible toggling and runtime inspection of remediated subsystems.
 */

export interface FeatureFlags {
  /** Phase 1: Enforce strict zero-synthetic market data and provenance verification */
  STRICT_REAL_DATA_ONLY: boolean;
  /** Phase 1: Enable 3-tier market data waterfall (Binance -> Yahoo GC=F/XAUUSD -> Kraken/Coinbase) */
  ENABLE_MULTI_TIER_WATERFALL: boolean;
  /** Phase 1: Enable multi-source macro yield & FX redundancy with median + z-score sanity filter */
  ENABLE_MACRO_REDUNDANCY_FILTER: boolean;
  /** Phase 1: Enable real external RSS/JSON financial news adapter (forbid candle-derived news) */
  ENABLE_REAL_NEWS_ADAPTER: boolean;
  /** Phase 1: Enable Circuit Breaker & HALTED_DEGRADED filter freeze when all live providers fail */
  ENABLE_CIRCUIT_BREAKER_HALT: boolean;
  /** Phase 1: Enable empirical rolling parameter calibration over real trailing market windows */
  ENABLE_EMPIRICAL_CALIBRATION: boolean;
  /** Phase 0/1: Allow deterministic offline test replay from read-only /fixtures/real-market/ only when explicitly requested via ?fixtureReplay=1 */
  ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST: boolean;
}

function parseBoolEnv(val: string | undefined, defaultValue: boolean): boolean {
  if (val === undefined || val === '') return defaultValue;
  const norm = val.trim().toLowerCase();
  if (norm === '1' || norm === 'true' || norm === 'yes' || norm === 'on') return true;
  if (norm === '0' || norm === 'false' || norm === 'no' || norm === 'off') return false;
  return defaultValue;
}

export function getFeatureFlags(): FeatureFlags {
  const isProduction = (process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  return {
    STRICT_REAL_DATA_ONLY: parseBoolEnv(process.env.GDF_STRICT_REAL_DATA_ONLY, true),
    ENABLE_MULTI_TIER_WATERFALL: parseBoolEnv(process.env.GDF_ENABLE_MULTI_TIER_WATERFALL, true),
    ENABLE_MACRO_REDUNDANCY_FILTER: parseBoolEnv(process.env.GDF_ENABLE_MACRO_REDUNDANCY_FILTER, true),
    ENABLE_REAL_NEWS_ADAPTER: parseBoolEnv(process.env.GDF_ENABLE_REAL_NEWS_ADAPTER, true),
    ENABLE_CIRCUIT_BREAKER_HALT: parseBoolEnv(process.env.GDF_ENABLE_CIRCUIT_BREAKER_HALT, true),
    ENABLE_EMPIRICAL_CALIBRATION: parseBoolEnv(process.env.GDF_ENABLE_EMPIRICAL_CALIBRATION, true),
    ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST: parseBoolEnv(
      process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST,
      !isProduction
    ),
  };
}
