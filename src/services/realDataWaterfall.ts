import fs from 'fs';
import path from 'path';
import { getFeatureFlags } from '../config/featureFlags.js';

export interface VerifiedCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ProviderTier = 'TIER_1_PRIMARY' | 'TIER_2_SECONDARY' | 'TIER_3_TERTIARY' | 'FIXTURE_TEST_REPLAY';
export type TerminalSystemState = 'LIVE_NOMINAL' | 'DEGRADED_FALLBACK' | 'HALTED_DEGRADED' | 'FIXTURE_REPLAY';
export type InstrumentIdentity = 'PAXG_SPOT_TOKEN' | 'COMEX_GOLD_FUTURES' | 'NONE';

export interface ProviderAttemptDiagnostic {
  tier: ProviderTier;
  providerName: string;
  symbol: string;
  endpoint: string;
  venueGroupId?: string;
  instrumentIdentity?: InstrumentIdentity;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED_BY_TEST';
  httpStatus?: number;
  contentType?: string;
  isHtmlResponse?: boolean;
  latencyMs: number;
  candleCount: number;
  lastBarTimeSec?: number;
  barStalenessSec?: number;
  isStaleBar?: boolean;
  errorMessage?: string;
  timestampIso: string;
}

export interface ProviderHttpDiagnosticEvent {
  providerName: string;
  endpoint: string;
  httpStatus: number;
  contentType: string;
  isHtmlOrNonJson: boolean;
  outcome: 'JSON_OK' | 'CSV_OK' | 'XML_OK' | 'NON_JSON_HTML_REJECTED' | 'HTTP_ERROR' | 'NETWORK_TIMEOUT';
  detail: string;
  timestampIso: string;
}

export interface SystemWarningErrorEntry {
  id: string;
  level: 'WARNING' | 'ERROR';
  subsystem: 'MARKET_WATERFALL' | 'MACRO_WATERFALL' | 'NEWS_FEED' | 'CIRCUIT_BREAKER' | 'CLIENT_UI';
  providerOrComponent: string;
  httpStatus?: number;
  contentType?: string;
  isHtmlRejection?: boolean;
  message: string;
  timestampIso: string;
}

export interface VerifiedMarketWaterfallResult {
  snapshotId?: string;
  snapshotTimestampIso?: string;
  systemState: TerminalSystemState;
  activeTier: ProviderTier | 'NONE_HALTED';
  activeProvider: string;
  activeSymbol: string;
  activeEndpoint: string;
  instrumentIdentity?: InstrumentIdentity;
  isFixtureReplay?: boolean;
  candles: VerifiedCandle[];
  htfDailyCandles?: VerifiedCandle[];
  secondaryBenchmark: {
    provider: string;
    symbol: string;
    instrumentIdentity?: InstrumentIdentity;
    alignedBarCount?: number;
    candles: VerifiedCandle[];
    crossVenueSpreadUsd: number;
    crossVenueZScore: number;
    isOutlierDislocation: boolean;
  } | null;
  diagnostics: ProviderAttemptDiagnostic[];
  freshnessAgeSec: number;
  haltReasonEn?: string;
  haltReasonFa?: string;
}

export interface VerifiedMacroYieldResult {
  nominal10Y: number;
  tipsRealYield10Y: number;
  breakevenInflation10Y: number;
  dxyIndex: number;
  realYieldGravity: number;
  dollarDrag: number;
  centralBankTide: number;
  netMacroLift: number;
  source: string;
  status: 'ONLINE_MULTI_SOURCE_VERIFIED' | 'DEGRADED_SINGLE_SOURCE' | 'DEGRADED_CACHED_REAL' | 'MACRO_FEED_UNAVAILABLE';
  lastUpdated: string;
  respondingSources: string[];
  missingSeries?: string[];
  sanityCheckZScore: number;
  outliersRejected: string[];
}

export interface VerifiedMacroNewsItem {
  id: string;
  timestamp: number;
  timeStr: string;
  country: string;
  flag: string;
  source: string;
  title: string;
  titleFa: string;
  category: 'monetary' | 'inflation' | 'central_bank' | 'geopolitics' | 'yields';
  goldImpactPct: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  transmission: string;
  transmissionFa: string;
  externalUrl?: string;
  isVerifiedExternal: true;
}

export interface VerifiedMacroNewsFeedResult {
  status: 'ONLINE_EXTERNAL_FEEDS' | 'DEGRADED_PARTIAL_FEEDS' | 'UNAVAILABLE';
  activeSources: string[];
  failedSources: string[];
  unavailableMessageEn: string | null;
  unavailableMessageFa: string | null;
  events: VerifiedMacroNewsItem[];
  lastFetchedIso: string;
}

/**
 * Normalizes, sorts, and deduplicates raw candle arrays by UTC timestamp,
 * enforcing valid OHLC envelopes (`high >= max(open, close)` and `low <= min(open, close)`).
 */
export function normalizeAndDeduplicateCandles(rawCandles: VerifiedCandle[]): VerifiedCandle[] {
  const byTimestamp = new Map<number, VerifiedCandle>();
  for (const c of rawCandles) {
    if (
      !Number.isFinite(c.time) ||
      c.time <= 1500000000 ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.open <= 100 ||
      c.close <= 100
    ) {
      continue;
    }
    const time = Math.floor(c.time);
    const high = Math.max(c.open, c.high, c.low, c.close);
    const low = Math.min(c.open, c.high, c.low, c.close);
    const volume = Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0.01;
    byTimestamp.set(time, {
      time,
      open: c.open,
      high,
      low,
      close: c.close,
      volume,
    });
  }
  return Array.from(byTimestamp.values()).sort((a, b) => a.time - b.time);
}

/**
 * Runtime Provenance Guard: Rejects any candle array that lacks verified external provider metadata,
 * strict monotonic UTC timestamps, or positive finite OHLC prices.
 */
export function assertVerifiedProvenance(
  candles: VerifiedCandle[],
  meta: { providerName: string; symbol: string; endpoint: string; tier: ProviderTier }
): void {
  const flags = getFeatureFlags();
  if (!meta.providerName || !meta.symbol || !meta.endpoint) {
    throw new Error('PROVENANCE_VIOLATION: Missing external provider name, symbol, or endpoint metadata.');
  }
  if (flags.STRICT_REAL_DATA_ONLY && /synthetic|random|mock|fabricated|fallback_sim/i.test(meta.providerName + ' ' + meta.endpoint)) {
    throw new Error(`PROVENANCE_VIOLATION: Forbidden synthetic provider identifier detected (${meta.providerName}).`);
  }
  if (!Array.isArray(candles) || candles.length < 20) {
    throw new Error(`PROVENANCE_VIOLATION: Provider ${meta.providerName} returned insufficient bars (${candles?.length ?? 0} < 20).`);
  }
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (
      !Number.isFinite(c.time) ||
      c.time <= 1500000000 ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close) ||
      c.open <= 100 ||
      c.close <= 100 ||
      c.high < c.low ||
      c.high < Math.max(c.open, c.close) - 1e-6 ||
      c.low > Math.min(c.open, c.close) + 1e-6
    ) {
      throw new Error(`PROVENANCE_VIOLATION: Malformed OHLCV bar at index ${i} from ${meta.providerName}.`);
    }
    if (i > 0 && c.time <= candles[i - 1].time) {
      throw new Error(`PROVENANCE_VIOLATION: Non-monotonic or duplicate bar timestamps at index ${i} from ${meta.providerName}.`);
    }
  }
}

const providerHttpDiagnosticsLog: ProviderHttpDiagnosticEvent[] = [];
const systemWarningErrorLog: SystemWarningErrorEntry[] = [];

export function recordSystemWarningOrError(entry: Omit<SystemWarningErrorEntry, 'id' | 'timestampIso'>): void {
  const full: SystemWarningErrorEntry = {
    ...entry,
    id: `warn-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    timestampIso: new Date().toISOString(),
  };
  systemWarningErrorLog.unshift(full);
  if (systemWarningErrorLog.length > 100) {
    systemWarningErrorLog.length = 100;
  }
}

export function getSystemWarningErrorLog(): SystemWarningErrorEntry[] {
  return [...systemWarningErrorLog];
}

function recordProviderHttpDiagnostic(evt: ProviderHttpDiagnosticEvent): void {
  providerHttpDiagnosticsLog.unshift(evt);
  if (providerHttpDiagnosticsLog.length > 100) {
    providerHttpDiagnosticsLog.length = 100;
  }
  if (evt.outcome === 'NON_JSON_HTML_REJECTED' || evt.outcome === 'HTTP_ERROR' || evt.outcome === 'NETWORK_TIMEOUT') {
    recordSystemWarningOrError({
      level: evt.outcome === 'NON_JSON_HTML_REJECTED' ? 'ERROR' : 'WARNING',
      subsystem: 'MARKET_WATERFALL',
      providerOrComponent: evt.providerName,
      httpStatus: evt.httpStatus,
      contentType: evt.contentType,
      isHtmlRejection: evt.isHtmlOrNonJson,
      message: `${evt.outcome}: ${evt.detail} (${evt.endpoint})`,
    });
  }
}

export function getProviderHttpDiagnostics(): ProviderHttpDiagnosticEvent[] {
  return [...providerHttpDiagnosticsLog];
}

/**
 * Sanitizes any upstream error string so internal JSON parser messages
 * ("Unexpected token '<'", "<!DOCTYPE", "<html", "is not valid JSON")
 * are never leaked into user-facing HALTED_DEGRADED banners.
 */
export function sanitizeUserFacingHaltReason(rawReason: string | undefined | null, lang: 'en' | 'fa' = 'en'): string {
  const defaultEn =
    'All live external gold feeds across Tier-1 (Binance/Bybit/KuCoin), Tier-2 (Yahoo COMEX/OKX/HTX), and Tier-3 (Kraken/Coinbase/Gate.io) are temporarily unreachable or rate-limited. Filter covariance (P), volume-clock (τ), and GARCH variance mutations are FROZEN. Zero synthetic data is generated.';
  const defaultFa =
    'تمامی منابع زنده بازار طلا در سطح ۱ (بایننس/بای‌بیت/کوکوین)، سطح ۲ (کامکس یاهو/OKX/HTX) و سطح ۳ (کراکن/کوین‌بیس/Gate.io) موقتاً در دسترس نیستند. به‌روزرسانی فیلتر کالمن (P)، ساعت حجمی (τ) و نوسانات GARCH متوقف (Frozen) شد. هیچ داده مصنوعی تولید نمی‌شود.';

  if (!rawReason || typeof rawReason !== 'string') {
    return lang === 'fa' ? defaultFa : defaultEn;
  }
  if (/unexpected token|<!doctype|<html|is not valid json|syntaxerror|non_json_upstream/i.test(rawReason)) {
    return lang === 'fa' ? defaultFa : defaultEn;
  }
  return rawReason;
}

async function fetchWithTimeout(url: string, timeoutMs = 3200, acceptHeader = 'application/json'): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GDF-Quant-Terminal/1.0',
        Accept: acceptHeader,
      },
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Strict JSON Fetch Guard:
 * 1. Always checks response.ok AND Content-Type (must contain "application/json" or "text/json") BEFORE parsing JSON.
 * 2. Detects HTML / <!DOCTYPE / gateway error pages and logs exact provider + HTTP status + Content-Type in internal diagnostics.
 * 3. Never throws raw SyntaxError ("Unexpected token '<', \"<!DOCTYPE \"...") into user-facing state.
 */
export async function fetchSafeJson<T = any>(
  url: string,
  providerName: string,
  timeoutMs = 3200
): Promise<{ data: T; httpStatus: number; contentType: string }> {
  let res: globalThis.Response;
  try {
    res = await fetchWithTimeout(url, timeoutMs, 'application/json, text/json;q=0.9');
  } catch (netErr: any) {
    const detail = netErr?.message || 'Network or timeout error';
    recordProviderHttpDiagnostic({
      providerName,
      endpoint: url,
      httpStatus: 0,
      contentType: 'none',
      isHtmlOrNonJson: false,
      outcome: 'NETWORK_TIMEOUT',
      detail,
      timestampIso: new Date().toISOString(),
    });
    throw new Error(`${providerName} unreachable (${detail})`);
  }

  const httpStatus = res.status;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const isJsonContentType = contentType.includes('application/json') || contentType.includes('text/json');

  if (!res.ok) {
    recordProviderHttpDiagnostic({
      providerName,
      endpoint: url,
      httpStatus,
      contentType: contentType || 'unknown',
      isHtmlOrNonJson: !isJsonContentType,
      outcome: 'HTTP_ERROR',
      detail: `HTTP ${httpStatus}`,
      timestampIso: new Date().toISOString(),
    });
    throw new Error(`${providerName} returned HTTP ${httpStatus}`);
  }

  const rawText = await res.text();
  const trimmed = rawText.trim();
  const looksLikeHtml =
    trimmed.startsWith('<') ||
    /^<!doctype/i.test(trimmed) ||
    /^<html/i.test(trimmed) ||
    contentType.includes('text/html');

  if (!isJsonContentType || looksLikeHtml) {
    recordProviderHttpDiagnostic({
      providerName,
      endpoint: url,
      httpStatus,
      contentType: contentType || 'none',
      isHtmlOrNonJson: true,
      outcome: 'NON_JSON_HTML_REJECTED',
      detail: `Rejected non-JSON payload (Content-Type: ${contentType || 'none'}, HTML=${looksLikeHtml})`,
      timestampIso: new Date().toISOString(),
    });
    throw new Error(
      `NON_JSON_UPSTREAM_RESPONSE from ${providerName} (HTTP ${httpStatus}, Content-Type: ${contentType || 'none'})`
    );
  }

  try {
    const parsed = JSON.parse(trimmed) as T;
    recordProviderHttpDiagnostic({
      providerName,
      endpoint: url,
      httpStatus,
      contentType,
      isHtmlOrNonJson: false,
      outcome: 'JSON_OK',
      detail: 'Verified JSON response parsed',
      timestampIso: new Date().toISOString(),
    });
    return { data: parsed, httpStatus, contentType };
  } catch (_) {
    recordProviderHttpDiagnostic({
      providerName,
      endpoint: url,
      httpStatus,
      contentType,
      isHtmlOrNonJson: true,
      outcome: 'NON_JSON_HTML_REJECTED',
      detail: 'Malformed JSON body rejected',
      timestampIso: new Date().toISOString(),
    });
    throw new Error(`NON_JSON_UPSTREAM_RESPONSE from ${providerName} (Malformed JSON body)`);
  }
}

type ProviderFetchOutcome = {
  res: {
    providerName: string;
    symbol: string;
    endpoint: string;
    venueGroupId: string;
    candles: VerifiedCandle[];
    tier: ProviderTier;
    instrumentIdentity: InstrumentIdentity;
    lastBarTimeSec: number;
    barStalenessSec: number;
    isStaleBar: boolean;
  } | null;
  diag: ProviderAttemptDiagnostic;
};

const INTERVAL_STEP_SECONDS_MAP: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function inferVenueGroupId(providerName: string, endpoint: string = ''): string {
  const lower = `${providerName} ${endpoint}`.toLowerCase();
  if (lower.includes('binance')) return 'binance_paxg';
  if (lower.includes('bybit')) return 'bybit_paxg';
  if (lower.includes('kucoin')) return 'kucoin_paxg';
  if (lower.includes('yahoo') || lower.includes('gc=f') || lower.includes('gc%3df')) return 'yahoo_comex_gcf';
  if (lower.includes('htx') || lower.includes('huobi')) return 'htx_paxg';
  if (lower.includes('okx')) return 'okx_paxg';
  if (lower.includes('kraken')) return 'kraken_paxg';
  if (lower.includes('coinbase')) return 'coinbase_paxg';
  if (lower.includes('gate.io') || lower.includes('gateio')) return 'gateio_paxg';
  if (lower.includes('fixture')) return 'fixture_replay';
  return providerName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function evaluateProviderQuorum(diagnostics: ProviderAttemptDiagnostic[]) {
  const totalEndpoints = diagnostics.length;
  const activeEndpoints = diagnostics.filter(d => d.status === 'SUCCESS').length;

  const allVenueGroups = new Set<string>();
  const activeVenueGroups = new Set<string>();
  const paxgVenueGroups = new Set<string>();
  const activePaxgVenueGroups = new Set<string>();

  for (const d of diagnostics) {
    const group = d.venueGroupId || inferVenueGroupId(d.providerName, d.endpoint);
    const inst = d.instrumentIdentity || (d.symbol === 'GC=F' ? 'COMEX_GOLD_FUTURES' : 'PAXG_SPOT_TOKEN');
    allVenueGroups.add(group);
    if (inst === 'PAXG_SPOT_TOKEN') {
      paxgVenueGroups.add(group);
    }
    if (d.status === 'SUCCESS' && !d.isStaleBar) {
      activeVenueGroups.add(group);
      if (inst === 'PAXG_SPOT_TOKEN') {
        activePaxgVenueGroups.add(group);
      }
    }
  }

  return {
    totalEndpoints,
    activeEndpoints,
    independentVenuesTotal: allVenueGroups.size,
    independentVenuesActive: activeVenueGroups.size,
    sameInstrumentPaxgVenuesTotal: paxgVenueGroups.size,
    sameInstrumentPaxgVenuesActive: activePaxgVenueGroups.size,
  };
}

async function runIsolatedProvider(
  tier: ProviderTier,
  providerName: string,
  symbol: string,
  endpoint: string,
  instrumentIdentity: InstrumentIdentity,
  skipByTest: boolean,
  fetcher: () => Promise<{ candles: VerifiedCandle[]; httpStatus: number; contentType: string }>,
  interval: string = '15m'
): Promise<ProviderFetchOutcome> {
  const tStart = Date.now();
  const venueGroupId = inferVenueGroupId(providerName, endpoint);
  const stepSec = INTERVAL_STEP_SECONDS_MAP[interval] || 900;
  if (skipByTest) {
    return {
      res: null,
      diag: {
        tier,
        providerName,
        symbol,
        endpoint,
        venueGroupId,
        instrumentIdentity,
        status: 'SKIPPED_BY_TEST',
        latencyMs: 0,
        candleCount: 0,
        errorMessage: `Simulated ${tier} failure requested via test parameter`,
        timestampIso: new Date().toISOString(),
      },
    };
  }
  try {
    const out = await fetcher();
    const cleanCandles = normalizeAndDeduplicateCandles(out.candles);
    assertVerifiedProvenance(cleanCandles, {
      providerName,
      symbol,
      endpoint,
      tier,
    });
    const lastBarTimeSec = cleanCandles[cleanCandles.length - 1].time;
    const barStalenessSec = Math.max(0, Math.floor(Date.now() / 1000) - lastBarTimeSec);
    // 24/7 PAXG spot venues are stale if > 2.0x timeframe step; COMEX futures allow weekend closure window
    const isStaleBar =
      instrumentIdentity === 'PAXG_SPOT_TOKEN'
        ? barStalenessSec > stepSec * 2.0
        : barStalenessSec > Math.max(stepSec * 4.0, 216000);
    return {
      res: {
        providerName,
        symbol,
        endpoint,
        venueGroupId,
        candles: cleanCandles,
        tier,
        instrumentIdentity,
        lastBarTimeSec,
        barStalenessSec,
        isStaleBar,
      },
      diag: {
        tier,
        providerName,
        symbol,
        endpoint,
        venueGroupId,
        instrumentIdentity,
        status: 'SUCCESS',
        httpStatus: out.httpStatus,
        contentType: out.contentType,
        isHtmlResponse: false,
        latencyMs: Date.now() - tStart,
        candleCount: cleanCandles.length,
        lastBarTimeSec,
        barStalenessSec,
        isStaleBar,
        timestampIso: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    const msg = err?.message || 'Provider error';
    const isHtml = /NON_JSON_UPSTREAM_RESPONSE/i.test(msg);
    return {
      res: null,
      diag: {
        tier,
        providerName,
        symbol,
        endpoint,
        venueGroupId,
        instrumentIdentity,
        status: 'FAILED',
        isHtmlResponse: isHtml,
        latencyMs: Date.now() - tStart,
        candleCount: 0,
        errorMessage: msg,
        timestampIso: new Date().toISOString(),
      },
    };
  }
}

export function aggregateCandlesToStep(sourceCandles: VerifiedCandle[], stepSeconds: number): VerifiedCandle[] {
  const safeStep = Math.max(60, Math.floor(stepSeconds));
  const sorted = normalizeAndDeduplicateCandles(sourceCandles);
  const buckets = new Map<number, VerifiedCandle>();
  for (const c of sorted) {
    const bucketTime = Math.floor(c.time / safeStep) * safeStep;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, { ...c, time: bucketTime });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume = parseFloat((existing.volume + c.volume).toFixed(4));
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

/**
 * Aligns two verified candle series by matching UTC timestamps within toleranceSec
 * so cross-venue basis spreads never compare mismatched bars across market breaks.
 */
export function alignBenchmarkCandlesByTimestamp(
  primaryCandles: VerifiedCandle[],
  benchmarkCandles: VerifiedCandle[],
  toleranceSec: number = 450
): { primary: VerifiedCandle; benchmark: VerifiedCandle }[] {
  if (primaryCandles.length === 0 || benchmarkCandles.length === 0) return [];
  const aligned: { primary: VerifiedCandle; benchmark: VerifiedCandle }[] = [];
  const usedBenchTimes = new Set<number>();
  let bIdx = 0;
  for (const p of primaryCandles) {
    while (bIdx + 1 < benchmarkCandles.length && benchmarkCandles[bIdx + 1].time <= p.time) {
      bIdx++;
    }
    const candidateA = benchmarkCandles[bIdx];
    const candidateB = bIdx + 1 < benchmarkCandles.length ? benchmarkCandles[bIdx + 1] : null;
    let best = candidateA;
    if (candidateB && Math.abs(candidateB.time - p.time) < Math.abs(candidateA.time - p.time)) {
      best = candidateB;
    }
    if (best && Math.abs(best.time - p.time) <= toleranceSec && !usedBenchTimes.has(best.time)) {
      usedBenchTimes.add(best.time);
      aligned.push({ primary: p, benchmark: best });
    }
  }
  return aligned;
}

// ============================================================================
// TIER 1 INDEPENDENT PROVIDERS (Binance Vision, Binance Spot, Bybit V5, KuCoin)
// ============================================================================
async function fetchBinanceHostCandles(baseHost: string, providerName: string, interval: string) {
  const validIntervals: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  const binanceInt = validIntervals[interval] || '15m';
  const endpoint = `${baseHost}/api/v3/klines?symbol=PAXGUSDT&interval=${binanceInt}&limit=300`;
  const { data: raw, httpStatus, contentType } = await fetchSafeJson<any[]>(endpoint, providerName, 3000);
  if (!Array.isArray(raw) || raw.length < 25) throw new Error('Insufficient Binance klines array');
  const candles: VerifiedCandle[] = [];
  for (const row of raw) {
    const time = Math.floor(Number(row[0]) / 1000);
    const open = parseFloat(row[1]);
    const high = parseFloat(row[2]);
    const low = parseFloat(row[3]);
    const close = parseFloat(row[4]);
    const volume = Math.max(0.01, parseFloat(row[5]));
    if (Number.isFinite(close) && close > 100) {
      candles.push({ time, open, high, low, close, volume });
    }
  }
  return { endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

async function fetchBybitSpotPaxgCandles(interval: string) {
  const bybitMap: Record<string, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
  };
  const bInt = bybitMap[interval] || '15';
  const providerName = 'Bybit V5 Institutional Spot (PAXG/USDT)';
  const endpoint = `https://api.bybit.com/v5/market/kline?category=spot&symbol=PAXGUSDT&interval=${bInt}&limit=300`;
  const { data, httpStatus, contentType } = await fetchSafeJson<any>(endpoint, providerName, 3200);
  const list = data?.result?.list;
  if (!Array.isArray(list) || list.length < 25) throw new Error('Insufficient Bybit kline list');
  const candles: VerifiedCandle[] = list
    .slice(0, 300)
    .reverse()
    .map((row: any) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: Math.max(0.01, parseFloat(row[5])),
    }))
    .filter((c: VerifiedCandle) => Number.isFinite(c.close) && c.close > 100);
  return { providerName, symbol: 'PAXGUSDT', endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

async function fetchKucoinSpotPaxgCandles(interval: string) {
  const kcMap: Record<string, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1hour',
    '4h': '4hour',
    '1d': '1day',
  };
  const kcInt = kcMap[interval] || '15min';
  const providerName = 'KuCoin Institutional Spot (PAXG-USDT)';
  const endpoint = `https://api.kucoin.com/api/v1/market/candles?type=${kcInt}&symbol=PAXG-USDT`;
  const { data, httpStatus, contentType } = await fetchSafeJson<any>(endpoint, providerName, 3200);
  const rows = data?.data;
  if (!Array.isArray(rows) || rows.length < 25) throw new Error('Insufficient KuCoin candle rows');
  const candles: VerifiedCandle[] = rows
    .slice(0, 300)
    .reverse()
    .map((row: any) => ({
      time: Number(row[0]),
      open: parseFloat(row[1]),
      close: parseFloat(row[2]),
      high: parseFloat(row[3]),
      low: parseFloat(row[4]),
      volume: Math.max(0.01, parseFloat(row[5])),
    }))
    .filter((c: VerifiedCandle) => Number.isFinite(c.close) && c.close > 100);
  return { providerName, symbol: 'PAXG-USDT', endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

// ============================================================================
// TIER 2 INDEPENDENT PROVIDERS (Yahoo COMEX GC=F, HTX PAXG/USDT, OKX PAXG-USDT)
// ============================================================================
async function fetchYahooGoldSingle(
  host: string,
  symEncoded: string,
  displaySym: string,
  providerName: string,
  interval: string
) {
  const intervalMap: Record<string, { yfInt: string; range: string; aggregate4h?: boolean }> = {
    '1m': { yfInt: '1m', range: '5d' },
    '5m': { yfInt: '5m', range: '1mo' },
    '15m': { yfInt: '15m', range: '1mo' },
    '30m': { yfInt: '30m', range: '1mo' },
    '1h': { yfInt: '60m', range: '3mo' },
    '4h': { yfInt: '60m', range: '3mo', aggregate4h: true },
    '1d': { yfInt: '1d', range: '1y' },
  };
  const cfg = intervalMap[interval] || intervalMap['15m'];
  const endpoint = `https://${host}/v8/finance/chart/${symEncoded}?interval=${cfg.yfInt}&range=${cfg.range}`;
  const { data, httpStatus, contentType } = await fetchSafeJson<any>(endpoint, providerName, 3200);
  const result = data?.chart?.result?.[0];
  const timestamps: number[] = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  let candles: VerifiedCandle[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const t = Number(timestamps[i]);
    const c = quote.close?.[i];
    const o = quote.open?.[i] ?? c;
    const h = quote.high?.[i] ?? c;
    const l = quote.low?.[i] ?? c;
    const v = quote.volume?.[i] ?? 1;
    if (Number.isFinite(t) && Number.isFinite(c) && c > 100) {
      candles.push({
        time: t,
        open: parseFloat(Number(o).toFixed(2)),
        high: parseFloat(Number(Math.max(o, h, l, c)).toFixed(2)),
        low: parseFloat(Number(Math.min(o, h, l, c)).toFixed(2)),
        close: parseFloat(Number(c).toFixed(2)),
        volume: Math.max(1, Number(v)),
      });
    }
  }

  candles = normalizeAndDeduplicateCandles(candles);
  if (cfg.aggregate4h) {
    candles = aggregateCandlesToStep(candles, 14400);
  }
  candles = candles.slice(-300);
  return { providerName, symbol: displaySym, endpoint, candles, httpStatus, contentType };
}

async function fetchHtxSpotPaxgCandles(interval: string) {
  const htxMap: Record<string, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '60min',
    '4h': '4hour',
    '1d': '1day',
  };
  const period = htxMap[interval] || '15min';
  const providerName = 'HTX Global Institutional Spot (PAXG/USDT)';
  const endpoint = `https://api.huobi.pro/market/history/kline?symbol=paxgusdt&period=${period}&size=300`;
  const { data, httpStatus, contentType } = await fetchSafeJson<any>(endpoint, providerName, 3200);
  const rows = data?.data;
  if (!Array.isArray(rows) || rows.length < 25) throw new Error('Insufficient HTX kline rows');
  const candles: VerifiedCandle[] = rows
    .slice(0, 300)
    .reverse()
    .map((row: any) => ({
      time: Number(row.id),
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: Math.max(0.01, parseFloat(row.amount || row.vol || '1')),
    }))
    .filter((c: VerifiedCandle) => Number.isFinite(c.close) && c.close > 100);
  return { providerName, symbol: 'PAXGUSDT', endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

async function fetchOkxSpotPaxgCandles(interval: string) {
  const okxMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1H',
    '4h': '4H',
    '1d': '1Dutc',
  };
  const bar = okxMap[interval] || '15m';
  const providerName = 'OKX Institutional Spot (PAXG-USDT)';
  const endpoint = `https://www.okx.com/api/v5/market/candles?instId=PAXG-USDT&bar=${bar}&limit=300`;
  const { data, httpStatus, contentType } = await fetchSafeJson<any>(endpoint, providerName, 3200);
  const rows = data?.data;
  if (!Array.isArray(rows) || rows.length < 25) throw new Error('Insufficient OKX candle rows');
  const candles: VerifiedCandle[] = rows
    .slice(0, 300)
    .reverse()
    .map((row: any) => ({
      time: Math.floor(Number(row[0]) / 1000),
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: Math.max(0.01, parseFloat(row[5])),
    }))
    .filter((c: VerifiedCandle) => Number.isFinite(c.close) && c.close > 100);
  return { providerName, symbol: 'PAXG-USDT', endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

// ============================================================================
// TIER 3 INDEPENDENT PROVIDERS (Kraken PAXGUSD, Coinbase PAXG-USD, Gate.io PAXG_USDT)
// ============================================================================
async function fetchKrakenSpotPaxgCandles(interval: string) {
  const krakenIntervals: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  const kInt = krakenIntervals[interval] || 15;
  const providerName = 'Kraken Institutional Spot (PAXG/USD)';
  const endpoint = `https://api.kraken.com/0/public/OHLC?pair=PAXGUSD&interval=${kInt}`;
  const { data, httpStatus, contentType } = await fetchSafeJson<any>(endpoint, providerName, 3200);
  const pairKey = Object.keys(data?.result || {}).find(k => k !== 'last');
  const rows = pairKey ? data.result[pairKey] : [];
  if (!Array.isArray(rows) || rows.length < 25) throw new Error('Kraken insufficient OHLC rows');

  const candles: VerifiedCandle[] = rows.slice(-300).map((item: any) => ({
    time: Number(item[0]),
    open: parseFloat(item[1]),
    high: parseFloat(item[2]),
    low: parseFloat(item[3]),
    close: parseFloat(item[4]),
    volume: Math.max(0.01, parseFloat(item[6])),
  }));
  return { providerName, symbol: 'PAXGUSD', endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

export async function fetchCoinbaseSpotPaxgCandles(interval: string) {
  // Coinbase Exchange only supports native granularities: 60, 300, 900, 3600, 21600, 86400.
  // For 30m (1800s) we fetch 900s (15m) and aggregate to 1800s.
  // For 4h (14400s) we fetch 3600s (1h) and aggregate to 14400s.
  const cbConfigMap: Record<string, { fetchGranularity: number; aggregateToSec?: number }> = {
    '1m': { fetchGranularity: 60 },
    '5m': { fetchGranularity: 300 },
    '15m': { fetchGranularity: 900 },
    '30m': { fetchGranularity: 900, aggregateToSec: 1800 },
    '1h': { fetchGranularity: 3600 },
    '4h': { fetchGranularity: 3600, aggregateToSec: 14400 },
    '1d': { fetchGranularity: 86400 },
  };
  const cfg = cbConfigMap[interval] || cbConfigMap['15m'];
  const providerName = 'Coinbase Exchange Spot (PAXG-USD)';
  const endpoint = `https://api.exchange.coinbase.com/products/PAXG-USD/candles?granularity=${cfg.fetchGranularity}`;
  const { data: rows2, httpStatus, contentType } = await fetchSafeJson<any[]>(endpoint, providerName, 3200);
  if (!Array.isArray(rows2) || rows2.length < 25) throw new Error('Coinbase insufficient candles');

  let candles: VerifiedCandle[] = rows2
    .slice(0, 300)
    .reverse()
    .map((item: any) => ({
      time: Number(item[0]),
      low: parseFloat(item[1]),
      high: parseFloat(item[2]),
      open: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: Math.max(0.01, parseFloat(item[5])),
    }));

  candles = normalizeAndDeduplicateCandles(candles);
  if (cfg.aggregateToSec) {
    candles = aggregateCandlesToStep(candles, cfg.aggregateToSec);
  }
  return { providerName, symbol: 'PAXG-USD', endpoint, candles, httpStatus, contentType };
}

async function fetchGateIoSpotPaxgCandles(interval: string) {
  const gateMap: Record<string, string> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  const gInt = gateMap[interval] || '15m';
  const providerName = 'Gate.io Institutional Spot (PAXG_USDT)';
  const endpoint = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=PAXG_USDT&interval=${gInt}&limit=300`;
  const { data: rows, httpStatus, contentType } = await fetchSafeJson<any[]>(endpoint, providerName, 3200);
  if (!Array.isArray(rows) || rows.length < 25) throw new Error('Gate.io insufficient candlesticks');
  const candles: VerifiedCandle[] = rows
    .slice(-300)
    .map((item: any) => ({
      time: Number(item[0]),
      volume: Math.max(0.01, parseFloat(item[5] || item[1] || '1')),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      open: parseFloat(item[6]),
    }))
    .filter((c: VerifiedCandle) => Number.isFinite(c.close) && c.close > 100);
  return { providerName, symbol: 'PAXG_USDT', endpoint, candles: normalizeAndDeduplicateCandles(candles), httpStatus, contentType };
}

const marketWaterfallCache = new Map<string, { timestamp: number; data: VerifiedMarketWaterfallResult }>();
const lastVerifiedRealSnapshotCache = new Map<string, { timestamp: number; data: VerifiedMarketWaterfallResult }>();
let latestGlobalWaterfallSnapshot: VerifiedMarketWaterfallResult | null = null;
let cachedHtfDailyCandles: { timestamp: number; candles: VerifiedCandle[] } | null = null;

export function getLatestWaterfallSnapshot(interval: string = '15m'): VerifiedMarketWaterfallResult | null {
  return (
    marketWaterfallCache.get(interval)?.data ||
    lastVerifiedRealSnapshotCache.get(interval)?.data ||
    latestGlobalWaterfallSnapshot
  );
}

export const REQUIRED_DISCOVERY_TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'] as const;

let mtfBootstrapInProgress = false;
let lastMtfBootstrapAttemptMs = 0;
let lastMtfBootstrapCompletedIso: string | null = null;
const mtfBootstrapFailures = new Map<string, string>();

export function getAllCachedWaterfallSnapshots(): Record<string, VerifiedMarketWaterfallResult> {
  const out: Record<string, VerifiedMarketWaterfallResult> = {};
  for (const [tf, entry] of lastVerifiedRealSnapshotCache.entries()) {
    if (entry.data && entry.data.systemState !== 'HALTED_DEGRADED' && entry.data.candles.length >= 20) {
      out[tf] = entry.data;
    }
  }
  for (const [tf, entry] of marketWaterfallCache.entries()) {
    if (entry.data && entry.data.systemState !== 'HALTED_DEGRADED' && entry.data.candles.length >= 20) {
      out[tf] = entry.data;
    }
  }
  return out;
}

export function getMultiTimeframeBootstrapState(): {
  requiredTimeframes: string[];
  verifiedCachedTimeframes: string[];
  missingTimeframes: string[];
  bootstrapInProgress: boolean;
  lastBootstrapCompletedIso: string | null;
  failureReasons: Record<string, string>;
} {
  const cached = getAllCachedWaterfallSnapshots();
  const verifiedCachedTimeframes = REQUIRED_DISCOVERY_TIMEFRAMES.filter(
    tf => Boolean(cached[tf] && cached[tf].candles.length >= 20 && cached[tf].systemState !== 'HALTED_DEGRADED')
  );
  const missingTimeframes = REQUIRED_DISCOVERY_TIMEFRAMES.filter(tf => !verifiedCachedTimeframes.includes(tf));
  const failureReasons: Record<string, string> = {};
  for (const [tf, reason] of mtfBootstrapFailures.entries()) {
    if (missingTimeframes.includes(tf as any)) {
      failureReasons[tf] = reason;
    }
  }
  return {
    requiredTimeframes: [...REQUIRED_DISCOVERY_TIMEFRAMES],
    verifiedCachedTimeframes,
    missingTimeframes,
    bootstrapInProgress: mtfBootstrapInProgress,
    lastBootstrapCompletedIso: lastMtfBootstrapCompletedIso,
    failureReasons,
  };
}

/**
 * Proactively and safely fetches the required Multi-Timeframe Discovery timeframes
 * (5m, 15m, 1h, 4h, 1d) through the real-data waterfall.
 * Obeys STRICT_REAL_DATA_ONLY, provenance checks, circuit-breaker, and timeouts.
 * If a timeframe fails or is unavailable, records the diagnostic and continues with available timeframes.
 */
export async function bootstrapMultiTimeframeWaterfallCache(options?: {
  fixtureReplay?: boolean;
  simulateUnavailableTimeframes?: string[];
  force?: boolean;
}): Promise<{
  requiredTimeframes: string[];
  verifiedCachedTimeframes: string[];
  missingTimeframes: string[];
  bootstrapInProgress: boolean;
  lastBootstrapCompletedIso: string | null;
  failureReasons: Record<string, string>;
}> {
  if (mtfBootstrapInProgress && !options?.force) {
    return getMultiTimeframeBootstrapState();
  }
  mtfBootstrapInProgress = true;
  lastMtfBootstrapAttemptMs = Date.now();

  try {
    const existing = getAllCachedWaterfallSnapshots();
    const unavailableSimSet = new Set(options?.simulateUnavailableTimeframes || []);

    const timeframesToFetch = REQUIRED_DISCOVERY_TIMEFRAMES.filter(tf => {
      if (unavailableSimSet.has(tf)) return true;
      if (options?.force) return true;
      return !existing[tf] || existing[tf].candles.length < 20 || existing[tf].systemState === 'HALTED_DEGRADED';
    });

    await Promise.allSettled(
      timeframesToFetch.map(async tf => {
        if (unavailableSimSet.has(tf)) {
          marketWaterfallCache.delete(tf);
          lastVerifiedRealSnapshotCache.delete(tf);
          mtfBootstrapFailures.set(tf, `Timeframe ${tf} unavailable from upstream real-data waterfall`);
          return;
        }
        try {
          const res = await fetchVerifiedMarketWaterfall(tf, {
            fixtureReplay: options?.fixtureReplay,
          });
          if (res.systemState !== 'HALTED_DEGRADED' && res.candles.length >= 20) {
            assertVerifiedProvenance(res.candles, {
              providerName: res.activeProvider,
              symbol: res.activeSymbol,
              endpoint: res.activeEndpoint,
              tier: res.activeTier as ProviderTier,
            });
            marketWaterfallCache.set(tf, { timestamp: Date.now(), data: res });
            lastVerifiedRealSnapshotCache.set(tf, { timestamp: Date.now(), data: res });
            mtfBootstrapFailures.delete(tf);
          } else {
            mtfBootstrapFailures.set(
              tf,
              res.haltReasonEn || `Insufficient real candles (${res.candles.length}) on timeframe ${tf}`
            );
          }
        } catch (err: any) {
          mtfBootstrapFailures.set(tf, err?.message || `Bootstrap fetch failed for ${tf}`);
        }
      })
    );

    lastMtfBootstrapCompletedIso = new Date().toISOString();
  } finally {
    mtfBootstrapInProgress = false;
  }

  return getMultiTimeframeBootstrapState();
}

/**
 * Fires a non-blocking background multi-timeframe bootstrap if any required timeframe
 * (5m, 15m, 1h, 4h, 1d) is missing from the waterfall cache.
 * Never blocks the live yellow-line request path.
 */
export function triggerNonBlockingMultiTimeframeBootstrap(options?: {
  fixtureReplay?: boolean;
}): void {
  const state = getMultiTimeframeBootstrapState();
  if (state.missingTimeframes.length === 0) return;
  if (mtfBootstrapInProgress) return;
  if (Date.now() - lastMtfBootstrapAttemptMs < 15000) return;

  void bootstrapMultiTimeframeWaterfallCache(options).catch(() => {
    // Non-blocking background bootstrap: errors are recorded per timeframe in mtfBootstrapFailures
  });
}


async function getOrFetchHtfDailyCandles(): Promise<VerifiedCandle[]> {
  if (cachedHtfDailyCandles && Date.now() - cachedHtfDailyCandles.timestamp < 300000) {
    return cachedHtfDailyCandles.candles;
  }
  const dailyCache = marketWaterfallCache.get('1d') || lastVerifiedRealSnapshotCache.get('1d');
  if (dailyCache && dailyCache.data.candles.length >= 30) {
    cachedHtfDailyCandles = { timestamp: Date.now(), candles: dailyCache.data.candles };
    return dailyCache.data.candles;
  }
  try {
    const dailyPromises = await Promise.allSettled([
      fetchBinanceHostCandles('https://data-api.binance.vision', 'Binance Vision 1D HTF', '1d').then(r => r.candles),
      fetchBybitSpotPaxgCandles('1d').then(r => r.candles),
      fetchKucoinSpotPaxgCandles('1d').then(r => r.candles),
      fetchKrakenSpotPaxgCandles('1d').then(r => r.candles),
      fetchYahooGoldSingle('query1.finance.yahoo.com', 'GC%3DF', 'GC=F', 'Yahoo COMEX 1D HTF', '1d').then(r => r.candles),
    ]);
    for (const p of dailyPromises) {
      if (p.status === 'fulfilled' && Array.isArray(p.value) && p.value.length >= 30) {
        cachedHtfDailyCandles = { timestamp: Date.now(), candles: p.value };
        return p.value;
      }
    }
  } catch (_) {}
  return cachedHtfDailyCandles?.candles || [];
}

/**
 * Executes the 3-Tier Real Market Data Waterfall concurrently across 10 independent public providers
 * with full per-provider isolation, cross-venue outlier checks, and Circuit Breaker halting.
 */
export async function fetchVerifiedMarketWaterfall(
  interval: string = '15m',
  options?: {
    simulateFailure?: string;
    fixtureReplay?: boolean;
  }
): Promise<VerifiedMarketWaterfallResult> {
  const flags = getFeatureFlags();
  const simFail = (options?.simulateFailure || '').toLowerCase();
  const stepSec = INTERVAL_STEP_SECONDS_MAP[interval] || 900;

  if (!simFail && !options?.fixtureReplay) {
    const cached = marketWaterfallCache.get(interval);
    if (cached && Date.now() - cached.timestamp < 15000) {
      return cached.data;
    }
  }

  const snapshotTimestampIso = new Date().toISOString();
  const snapshotId = `gdf-snap-${interval}-${Date.now()}`;

  if (options?.fixtureReplay) {
    if (!flags.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST) {
      return {
        snapshotId,
        snapshotTimestampIso,
        systemState: 'HALTED_DEGRADED',
        activeTier: 'NONE_HALTED',
        activeProvider: 'NONE (Fixture Replay Disabled in Production)',
        activeSymbol: 'N/A',
        activeEndpoint: 'N/A',
        instrumentIdentity: 'NONE',
        isFixtureReplay: false,
        candles: [],
        htfDailyCandles: [],
        secondaryBenchmark: null,
        diagnostics: [],
        freshnessAgeSec: -1,
        haltReasonEn: 'FIXTURE REPLAY BLOCKED: ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST is disabled in production mode.',
        haltReasonFa: 'بازپخش داده آزمایشی در محیط عملیاتی غیرفعال است.',
      };
    }

    const specificFixturePath = path.join(process.cwd(), 'fixtures', 'real-market', `paxg_${interval}.json`);
    const fallbackFixturePath = path.join(process.cwd(), 'fixtures', 'real-market', 'paxg_15m.json');
    const fixturePath = fs.existsSync(specificFixturePath) ? specificFixturePath : fallbackFixturePath;
    if (fs.existsSync(fixturePath)) {
      const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      const cleanFixtureCandles = normalizeAndDeduplicateCandles(raw.candles || []);
      assertVerifiedProvenance(cleanFixtureCandles, {
        providerName: `${raw.provider} [Read-Only Verified Fixture]`,
        symbol: raw.symbol,
        endpoint: `fixtures/real-market/${path.basename(fixturePath)}`,
        tier: 'FIXTURE_TEST_REPLAY',
      });
      const lastBarTime = cleanFixtureCandles[cleanFixtureCandles.length - 1].time;
      const barAgeSec = Math.max(0, Math.floor(Date.now() / 1000) - lastBarTime);
      return {
        snapshotId,
        snapshotTimestampIso,
        systemState: 'FIXTURE_REPLAY',
        activeTier: 'FIXTURE_TEST_REPLAY',
        activeProvider: `${raw.provider} [Verified Fixture Replay]`,
        activeSymbol: raw.symbol,
        activeEndpoint: `fixtures/real-market/${path.basename(fixturePath)}`,
        instrumentIdentity: 'PAXG_SPOT_TOKEN',
        isFixtureReplay: true,
        candles: cleanFixtureCandles,
        htfDailyCandles: cleanFixtureCandles,
        secondaryBenchmark: null,
        diagnostics: [
          {
            tier: 'FIXTURE_TEST_REPLAY',
            providerName: `${raw.provider} [Verified Fixture Replay]`,
            symbol: raw.symbol,
            endpoint: `fixtures/real-market/${path.basename(fixturePath)}`,
            venueGroupId: 'fixture_replay',
            instrumentIdentity: 'PAXG_SPOT_TOKEN',
            status: 'SUCCESS',
            latencyMs: 1,
            candleCount: cleanFixtureCandles.length,
            lastBarTimeSec: lastBarTime,
            barStalenessSec: barAgeSec,
            isStaleBar: true,
            timestampIso: snapshotTimestampIso,
          },
        ],
        freshnessAgeSec: barAgeSec,
        haltReasonEn: 'FIXTURE REPLAY MODE: Operating on read-only historical verified fixture data (not live market feed).',
        haltReasonFa: 'حالت بازپخش داده تاریخی آزمایشی (غیرزنده).',
      };
    }
  }

  const skipT1 = simFail.includes('all') || simFail.includes('tier1');
  const skipT2 = simFail.includes('all') || simFail.includes('tier2');
  const skipT3 = simFail.includes('all') || simFail.includes('tier3');

  // Execute all 10 provider endpoints in parallel with complete fault isolation
  const providerOutcomes = await Promise.all([
    // Tier 1 Primary Venues (4 endpoints across 3 independent PAXG spot venues: Binance [2 hosts], Bybit, KuCoin)
    runIsolatedProvider(
      'TIER_1_PRIMARY',
      'Binance Vision Public Node (PAXG/USDT)',
      'PAXGUSDT',
      `https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=${interval}`,
      'PAXG_SPOT_TOKEN',
      skipT1,
      () => fetchBinanceHostCandles('https://data-api.binance.vision', 'Binance Vision Public Node (PAXG/USDT)', interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_1_PRIMARY',
      'Binance Spot Primary Core (PAXG/USDT)',
      'PAXGUSDT',
      `https://api.binance.com/api/v3/klines?symbol=PAXGUSDT&interval=${interval}`,
      'PAXG_SPOT_TOKEN',
      skipT1,
      () => fetchBinanceHostCandles('https://api.binance.com', 'Binance Spot Primary Core (PAXG/USDT)', interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_1_PRIMARY',
      'Bybit V5 Institutional Spot (PAXG/USDT)',
      'PAXGUSDT',
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=PAXGUSDT`,
      'PAXG_SPOT_TOKEN',
      skipT1,
      () => fetchBybitSpotPaxgCandles(interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_1_PRIMARY',
      'KuCoin Institutional Spot (PAXG-USDT)',
      'PAXG-USDT',
      `https://api.kucoin.com/api/v1/market/candles?symbol=PAXG-USDT`,
      'PAXG_SPOT_TOKEN',
      skipT1,
      () => fetchKucoinSpotPaxgCandles(interval),
      interval
    ),

    // Tier 2 Secondary Venues (3 independent sources: Yahoo COMEX GC=F, HTX PAXG/USDT, OKX PAXG-USDT)
    runIsolatedProvider(
      'TIER_2_SECONDARY',
      'Yahoo Finance COMEX Gold Futures (GC=F)',
      'GC=F',
      'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF',
      'COMEX_GOLD_FUTURES',
      skipT2,
      () => fetchYahooGoldSingle('query1.finance.yahoo.com', 'GC%3DF', 'GC=F', 'Yahoo Finance COMEX Gold Futures (GC=F)', interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_2_SECONDARY',
      'HTX Global Institutional Spot (PAXG/USDT)',
      'PAXGUSDT',
      'https://api.huobi.pro/market/history/kline?symbol=paxgusdt',
      'PAXG_SPOT_TOKEN',
      skipT2,
      () => fetchHtxSpotPaxgCandles(interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_2_SECONDARY',
      'OKX Institutional Spot (PAXG-USDT)',
      'PAXG-USDT',
      'https://www.okx.com/api/v5/market/candles?instId=PAXG-USDT',
      'PAXG_SPOT_TOKEN',
      skipT2,
      () => fetchOkxSpotPaxgCandles(interval),
      interval
    ),

    // Tier 3 Tertiary Venues (3 independent PAXG spot sources)
    runIsolatedProvider(
      'TIER_3_TERTIARY',
      'Kraken Institutional Spot (PAXG/USD)',
      'PAXGUSD',
      'https://api.kraken.com/0/public/OHLC?pair=PAXGUSD',
      'PAXG_SPOT_TOKEN',
      skipT3,
      () => fetchKrakenSpotPaxgCandles(interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_3_TERTIARY',
      'Coinbase Exchange Spot (PAXG-USD)',
      'PAXG-USD',
      'https://api.exchange.coinbase.com/products/PAXG-USD/candles',
      'PAXG_SPOT_TOKEN',
      skipT3,
      () => fetchCoinbaseSpotPaxgCandles(interval),
      interval
    ),
    runIsolatedProvider(
      'TIER_3_TERTIARY',
      'Gate.io Institutional Spot (PAXG_USDT)',
      'PAXG_USDT',
      'https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=PAXG_USDT',
      'PAXG_SPOT_TOKEN',
      skipT3,
      () => fetchGateIoSpotPaxgCandles(interval),
      interval
    ),
  ]);

  const diagnostics: ProviderAttemptDiagnostic[] = providerOutcomes.map(o => o.diag);
  const successfulResults = providerOutcomes
    .map(o => o.res)
    .filter((r): r is NonNullable<ProviderFetchOutcome['res']> => r !== null && r.candles.length >= 20);

  // Prioritize fresh (non-stale) same-instrument PAXG_SPOT_TOKEN within each tier before falling back
  const freshResults = successfulResults.filter(r => !r.isStaleBar);
  const pool = freshResults.length > 0 ? freshResults : successfulResults;

  const tier1Success = pool.find(r => r.tier === 'TIER_1_PRIMARY');
  const tier2Success =
    pool.find(r => r.tier === 'TIER_2_SECONDARY' && r.instrumentIdentity === 'PAXG_SPOT_TOKEN') ||
    pool.find(r => r.tier === 'TIER_2_SECONDARY');
  const tier3Success = pool.find(r => r.tier === 'TIER_3_TERTIARY');
  const primaryWinner = tier1Success || tier2Success || tier3Success || null;

  if (!primaryWinner) {
    if (!simFail) {
      const recentVerified = lastVerifiedRealSnapshotCache.get(interval);
      if (recentVerified && Date.now() - recentVerified.timestamp < 300000 && recentVerified.data.candles.length >= 20) {
        recordSystemWarningOrError({
          level: 'WARNING',
          subsystem: 'MARKET_WATERFALL',
          providerOrComponent: 'Verified Real Snapshot Cache',
          message: `All 10 live venues timed out transiently; serving verified real snapshot (${recentVerified.data.activeProvider}) in DEGRADED_FALLBACK.`,
        });
        const fallbackResult: VerifiedMarketWaterfallResult = {
          ...recentVerified.data,
          snapshotId,
          snapshotTimestampIso,
          systemState: 'DEGRADED_FALLBACK',
          isFixtureReplay: false,
          diagnostics,
          freshnessAgeSec: Math.max(
            0,
            Math.floor(Date.now() / 1000) - recentVerified.data.candles[recentVerified.data.candles.length - 1].time
          ),
          haltReasonEn: `DEGRADED FALLBACK MODE: Transient upstream rate-limit; preserving verified real bars from ${recentVerified.data.activeProvider}.`,
          haltReasonFa: `وضعیت جایگزین (Degraded Fallback): محدودیت موقت شبکه؛ حفظ کندل‌های واقعی تاییدشده از ${recentVerified.data.activeProvider}.`,
        };
        latestGlobalWaterfallSnapshot = fallbackResult;
        return fallbackResult;
      }
    }

    recordSystemWarningOrError({
      level: 'ERROR',
      subsystem: 'CIRCUIT_BREAKER',
      providerOrComponent: 'All 10 External Gold Venues',
      message: 'CIRCUIT BREAKER TRIPPED (HALTED_DEGRADED): All Tier-1, Tier-2, and Tier-3 live external gold providers failed.',
    });

    const haltedResult: VerifiedMarketWaterfallResult = {
      snapshotId,
      snapshotTimestampIso,
      systemState: 'HALTED_DEGRADED',
      activeTier: 'NONE_HALTED',
      activeProvider: 'NONE (All External Market Providers Unreachable)',
      activeSymbol: 'N/A',
      activeEndpoint: 'N/A',
      instrumentIdentity: 'NONE',
      isFixtureReplay: false,
      candles: [],
      htfDailyCandles: [],
      secondaryBenchmark: null,
      diagnostics,
      freshnessAgeSec: -1,
      haltReasonEn:
        'CIRCUIT BREAKER TRIPPED (HALTED_DEGRADED): All Tier-1 (Binance/Bybit/KuCoin), Tier-2 (Yahoo COMEX/HTX/OKX), and Tier-3 (Kraken/Coinbase/Gate.io) live gold feeds failed. Filter covariance, volume-clock, and GARCH mutations are frozen. Zero synthetic data generated.',
      haltReasonFa:
        'مدار محافظتی فعال شد (توقف در وضعیت اضطراری): تمامی منابع زنده سطح ۱ (بایننس/بای‌بیت/کوکوین)، سطح ۲ (کامکس یاهو/HTX/OKX) و سطح ۳ (کراکن/کوین‌بیس/Gate.io) قطع شده‌اند. به‌روزرسانی فیلتر کالمن و نوسانات متوقف شد. هیچ داده مصنوعی تولید نمی‌شود.',
    };
    latestGlobalWaterfallSnapshot = haltedResult;
    return haltedResult;
  }

  const primaryCandles = primaryWinner.candles;
  const activeTier = primaryWinner.tier;
  const activeProvider = primaryWinner.providerName;
  const activeSymbol = primaryWinner.symbol;
  const activeEndpoint = primaryWinner.endpoint;
  const instrumentIdentity = primaryWinner.instrumentIdentity;

  // Select an truly independent secondary benchmark (different venueGroupId!) and align bars by UTC timestamp
  const refBench =
    successfulResults.find(
      r => r.venueGroupId !== primaryWinner.venueGroupId && r.instrumentIdentity === instrumentIdentity && !r.isStaleBar
    ) ||
    successfulResults.find(
      r => r.venueGroupId !== primaryWinner.venueGroupId && !r.isStaleBar
    ) ||
    successfulResults.find(r => r.venueGroupId !== primaryWinner.venueGroupId) ||
    null;

  const intervalToleranceMap: Record<string, number> = {
    '1m': 120,
    '5m': 600,
    '15m': 1800,
    '30m': 3600,
    '1h': 7200,
    '4h': 28800,
    '1d': 172800,
  };
  const alignToleranceSec = intervalToleranceMap[interval] || 1800;

  let secondaryBenchmark: VerifiedMarketWaterfallResult['secondaryBenchmark'] = null;
  if (refBench && refBench.candles.length >= 10) {
    const alignedPairs = alignBenchmarkCandlesByTimestamp(primaryCandles, refBench.candles, alignToleranceSec);
    if (alignedPairs.length >= 5) {
      const recentPairs = alignedPairs.slice(-30);
      const spreads = recentPairs.map(pair => pair.primary.close - pair.benchmark.close);
      const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
      const stdSpread = Math.sqrt(
        Math.max(0.04, spreads.reduce((a, s) => a + Math.pow(s - meanSpread, 2), 0) / Math.max(1, spreads.length - 1))
      );
      const lastPair = recentPairs[recentPairs.length - 1];
      const currentSpread = lastPair.primary.close - lastPair.benchmark.close;
      const zScore = parseFloat(((currentSpread - meanSpread) / stdSpread).toFixed(2));
      secondaryBenchmark = {
        provider: refBench.providerName,
        symbol: refBench.symbol,
        instrumentIdentity: refBench.instrumentIdentity,
        alignedBarCount: recentPairs.length,
        candles: recentPairs.map(p => p.benchmark),
        crossVenueSpreadUsd: parseFloat(currentSpread.toFixed(2)),
        crossVenueZScore: zScore,
        isOutlierDislocation: Math.abs(zScore) > 3.5,
      };
    }
  }

  const htfDailyCandles = interval === '1d' ? primaryCandles : await getOrFetchHtfDailyCandles();
  const lastBarTime = primaryCandles[primaryCandles.length - 1].time;
  const freshnessAgeSec = Math.max(0, Math.floor(Date.now() / 1000) - lastBarTime);
  const isWinnerStale = freshnessAgeSec > stepSec * 2.0;

  const systemState: TerminalSystemState =
    activeTier === 'TIER_1_PRIMARY' && !isWinnerStale ? 'LIVE_NOMINAL' : 'DEGRADED_FALLBACK';

  let haltReasonEn: string | undefined;
  let haltReasonFa: string | undefined;
  if (isWinnerStale) {
    haltReasonEn = `DEGRADED FALLBACK MODE (STALE BAR): Latest bar from ${activeProvider} is ${freshnessAgeSec}s old (${(freshnessAgeSec / stepSec).toFixed(1)}x ${interval} timeframe).`;
    haltReasonFa = `وضعیت جایگزین (کندل قدیمی): آخرین کندل دریافتی از ${activeProvider} دارای تاخیر ${freshnessAgeSec} ثانیه است.`;
  } else if (systemState === 'DEGRADED_FALLBACK') {
    haltReasonEn = `DEGRADED FALLBACK MODE: Primary Tier-1 feed unavailable. Operating on verified ${activeTier} (${activeProvider}).`;
    haltReasonFa = `وضعیت جایگزین (Degraded Fallback): منبع اصلی سطح ۱ در دسترس نیست. سیستم بر روی منبع واقعی تاییدشده ${activeProvider} قرار دارد.`;
  }

  const result: VerifiedMarketWaterfallResult = {
    snapshotId,
    snapshotTimestampIso,
    systemState,
    activeTier,
    activeProvider,
    activeSymbol,
    activeEndpoint,
    instrumentIdentity,
    isFixtureReplay: false,
    candles: primaryCandles,
    htfDailyCandles: htfDailyCandles.length >= 20 ? htfDailyCandles : primaryCandles,
    secondaryBenchmark,
    diagnostics,
    freshnessAgeSec,
    haltReasonEn,
    haltReasonFa,
  };

  latestGlobalWaterfallSnapshot = result;
  if (!simFail && !options?.fixtureReplay) {
    marketWaterfallCache.set(interval, { timestamp: Date.now(), data: result });
    lastVerifiedRealSnapshotCache.set(interval, { timestamp: Date.now(), data: result });
  }
  return result;
}

async function fetchFredSeriesLatest(seriesId: string): Promise<number | null> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`;
  const providerName = `St. Louis Fed FRED (${seriesId})`;
  try {
    const res = await fetchWithTimeout(url, 3200, 'text/csv, text/plain;q=0.9');
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok) {
      recordProviderHttpDiagnostic({
        providerName,
        endpoint: url,
        httpStatus: res.status,
        contentType: contentType || 'unknown',
        isHtmlOrNonJson: contentType.includes('text/html'),
        outcome: 'HTTP_ERROR',
        detail: `HTTP ${res.status}`,
        timestampIso: new Date().toISOString(),
      });
      return null;
    }
    const csv = await res.text();
    const trimmed = csv.trim();
    if (trimmed.startsWith('<') || /^<!doctype/i.test(trimmed) || contentType.includes('text/html')) {
      recordProviderHttpDiagnostic({
        providerName,
        endpoint: url,
        httpStatus: res.status,
        contentType: contentType || 'text/html',
        isHtmlOrNonJson: true,
        outcome: 'NON_JSON_HTML_REJECTED',
        detail: 'FRED endpoint returned HTML instead of CSV',
        timestampIso: new Date().toISOString(),
      });
      return null;
    }
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 1; i--) {
      const parts = lines[i].split(',');
      const val = parseFloat(parts[1]);
      if (Number.isFinite(val)) {
        recordProviderHttpDiagnostic({
          providerName,
          endpoint: url,
          httpStatus: res.status,
          contentType: contentType || 'text/csv',
          isHtmlOrNonJson: false,
          outcome: 'CSV_OK',
          detail: `Latest value=${val}`,
          timestampIso: new Date().toISOString(),
        });
        return val;
      }
    }
    return null;
  } catch (err: any) {
    recordProviderHttpDiagnostic({
      providerName,
      endpoint: url,
      httpStatus: 0,
      contentType: 'none',
      isHtmlOrNonJson: false,
      outcome: 'NETWORK_TIMEOUT',
      detail: err?.message || 'Timeout',
      timestampIso: new Date().toISOString(),
    });
    return null;
  }
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

let cachedVerifiedMacro: { timestamp: number; data: VerifiedMacroYieldResult } | null = null;

/**
 * Multi-source macro yield & FX waterfall with median + z-score outlier sanity check.
 * Never fabricates hardcoded yield/DXY numbers when individual series are missing.
 */
export async function fetchVerifiedMacroWaterfall(options?: { simulateFailure?: string }): Promise<VerifiedMacroYieldResult> {
  const simFail = (options?.simulateFailure || '').toLowerCase();
  if (simFail.includes('all') || simFail.includes('macro')) {
    return {
      nominal10Y: cachedVerifiedMacro?.data.nominal10Y ?? 0,
      tipsRealYield10Y: cachedVerifiedMacro?.data.tipsRealYield10Y ?? 0,
      breakevenInflation10Y: cachedVerifiedMacro?.data.breakevenInflation10Y ?? 0,
      dxyIndex: cachedVerifiedMacro?.data.dxyIndex ?? 0,
      realYieldGravity: 0,
      dollarDrag: 0,
      centralBankTide: 0,
      netMacroLift: 0,
      source: 'MACRO_FEED_UNAVAILABLE (All External Macro Providers Failed)',
      status: 'MACRO_FEED_UNAVAILABLE',
      lastUpdated: new Date().toISOString().substring(11, 19) + ' UTC',
      respondingSources: [],
      missingSeries: ['nominal10Y', 'dxyIndex', 'tipsRealYield10Y', 'breakevenInflation10Y'],
      sanityCheckZScore: 0,
      outliersRejected: [],
    };
  }

  const now = Date.now();
  if (!simFail && cachedVerifiedMacro && now - cachedVerifiedMacro.timestamp < 60000) {
    return cachedVerifiedMacro.data;
  }

  const nominalCandidates: { src: string; val: number }[] = [];
  const dxyCandidates: { src: string; val: number }[] = [];
  const tipsRealCandidates: { src: string; val: number }[] = [];
  const breakevenCandidates: { src: string; val: number }[] = [];
  const respondingSources: string[] = [];
  const outliersRejected: string[] = [];

  const tasks = await Promise.allSettled([
    fetchSafeJson('https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=5d', 'Yahoo Finance (^TNX)', 3000).then(r => r.data),
    fetchSafeJson('https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=1d&range=5d', 'ICE US Dollar Index (DX-Y.NYB)', 3000).then(r => r.data),
    fetchFredSeriesLatest('DGS10'),
    fetchFredSeriesLatest('DFII10'),
    fetchFredSeriesLatest('T10YIE'),
  ]);

  if (tasks[0].status === 'fulfilled') {
    const p = tasks[0].value?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof p === 'number' && p > 0.2 && p < 15.0) {
      nominalCandidates.push({ src: 'Yahoo Finance (^TNX)', val: p });
      respondingSources.push('Yahoo Finance (^TNX)');
    }
  }

  if (tasks[1].status === 'fulfilled') {
    const p = tasks[1].value?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof p === 'number' && p > 60 && p < 140) {
      dxyCandidates.push({ src: 'ICE US Dollar Index (DX-Y.NYB)', val: p });
      respondingSources.push('ICE US Dollar Index (DX-Y.NYB)');
    }
  }

  if (tasks[2].status === 'fulfilled' && typeof tasks[2].value === 'number') {
    const v = tasks[2].value;
    if (v > 0.2 && v < 15.0) {
      nominalCandidates.push({ src: 'St. Louis Fed FRED (DGS10)', val: v });
      respondingSources.push('St. Louis Fed FRED (DGS10)');
    }
  }

  if (tasks[3].status === 'fulfilled' && typeof tasks[3].value === 'number') {
    const v = tasks[3].value;
    if (v > -5.0 && v < 10.0) {
      tipsRealCandidates.push({ src: 'St. Louis Fed FRED (DFII10)', val: v });
      respondingSources.push('St. Louis Fed FRED (DFII10)');
    }
  }

  if (tasks[4].status === 'fulfilled' && typeof tasks[4].value === 'number') {
    const v = tasks[4].value;
    if (v > 0.1 && v < 10.0) {
      breakevenCandidates.push({ src: 'St. Louis Fed FRED (T10YIE)', val: v });
      respondingSources.push('St. Louis Fed FRED (T10YIE)');
    }
  }

  if (nominalCandidates.length === 0 && dxyCandidates.length === 0 && tipsRealCandidates.length === 0) {
    if (cachedVerifiedMacro) {
      return {
        ...cachedVerifiedMacro.data,
        status: 'DEGRADED_CACHED_REAL',
        source: `${cachedVerifiedMacro.data.source} [Cached Real Snapshot]`,
      };
    }
    return {
      nominal10Y: 0,
      tipsRealYield10Y: 0,
      breakevenInflation10Y: 0,
      dxyIndex: 0,
      realYieldGravity: 0,
      dollarDrag: 0,
      centralBankTide: 0,
      netMacroLift: 0,
      source: 'MACRO_FEED_UNAVAILABLE',
      status: 'MACRO_FEED_UNAVAILABLE',
      lastUpdated: new Date().toISOString().substring(11, 19) + ' UTC',
      respondingSources: [],
      missingSeries: ['nominal10Y', 'dxyIndex', 'tipsRealYield10Y', 'breakevenInflation10Y'],
      sanityCheckZScore: 0,
      outliersRejected: [],
    };
  }

  const missingSeries: string[] = [];
  let maxMacroZ = 0;

  let nominal10Y = 0;
  let hasNominal = false;
  if (nominalCandidates.length > 0) {
    const nominalMedian = medianOf(nominalCandidates.map(c => c.val));
    const filteredNominal = nominalCandidates.filter(c => {
      const diff = Math.abs(c.val - nominalMedian);
      const z = diff / 0.25;
      maxMacroZ = Math.max(maxMacroZ, z);
      if (z > 3.5 && nominalCandidates.length > 1) {
        outliersRejected.push(`${c.src}: ${c.val}`);
        return false;
      }
      return true;
    });
    nominal10Y = parseFloat(medianOf(filteredNominal.map(c => c.val)).toFixed(3));
    hasNominal = true;
  } else if (cachedVerifiedMacro && cachedVerifiedMacro.data.nominal10Y > 0) {
    nominal10Y = cachedVerifiedMacro.data.nominal10Y;
    hasNominal = true;
    missingSeries.push('nominal10Y (cached)');
  } else {
    missingSeries.push('nominal10Y');
  }

  let dxyIndex = 0;
  let hasDxy = false;
  if (dxyCandidates.length > 0) {
    dxyIndex = parseFloat(medianOf(dxyCandidates.map(c => c.val)).toFixed(2));
    hasDxy = true;
  } else if (cachedVerifiedMacro && cachedVerifiedMacro.data.dxyIndex > 0) {
    dxyIndex = cachedVerifiedMacro.data.dxyIndex;
    hasDxy = true;
    missingSeries.push('dxyIndex (cached)');
  } else {
    missingSeries.push('dxyIndex');
  }

  let breakevenInflation10Y = 0;
  let hasBreakeven = false;
  if (breakevenCandidates.length > 0) {
    breakevenInflation10Y = parseFloat(medianOf(breakevenCandidates.map(c => c.val)).toFixed(3));
    hasBreakeven = true;
  } else if (cachedVerifiedMacro && cachedVerifiedMacro.data.breakevenInflation10Y > 0) {
    breakevenInflation10Y = cachedVerifiedMacro.data.breakevenInflation10Y;
    hasBreakeven = true;
    missingSeries.push('breakevenInflation10Y (cached)');
  } else {
    missingSeries.push('breakevenInflation10Y');
  }

  let tipsRealYield10Y = 0;
  let hasTips = false;
  if (tipsRealCandidates.length > 0) {
    tipsRealYield10Y = parseFloat(medianOf(tipsRealCandidates.map(c => c.val)).toFixed(3));
    hasTips = true;
  } else if (hasNominal && hasBreakeven) {
    tipsRealYield10Y = parseFloat((nominal10Y - breakevenInflation10Y).toFixed(3));
    hasTips = true;
  } else if (cachedVerifiedMacro && cachedVerifiedMacro.data.tipsRealYield10Y !== 0) {
    tipsRealYield10Y = cachedVerifiedMacro.data.tipsRealYield10Y;
    hasTips = true;
    missingSeries.push('tipsRealYield10Y (cached)');
  } else {
    missingSeries.push('tipsRealYield10Y');
  }

  const realYieldGravity = hasTips ? parseFloat((-1.15 * (tipsRealYield10Y - 1.50)).toFixed(3)) : 0;
  const dollarDrag = hasDxy ? parseFloat((-0.065 * (dxyIndex - 100.0)).toFixed(3)) : 0;
  const centralBankTide = hasNominal ? parseFloat(Math.max(0.15, Math.min(0.75, 0.45 + 0.04 * (nominal10Y - 4.0))).toFixed(3)) : 0;
  const netMacroLift = parseFloat((realYieldGravity + dollarDrag + centralBankTide).toFixed(3));

  const status: VerifiedMacroYieldResult['status'] =
    respondingSources.length >= 2 && missingSeries.length === 0
      ? 'ONLINE_MULTI_SOURCE_VERIFIED'
      : 'DEGRADED_SINGLE_SOURCE';

  const result: VerifiedMacroYieldResult = {
    nominal10Y,
    tipsRealYield10Y,
    breakevenInflation10Y,
    dxyIndex,
    realYieldGravity,
    dollarDrag,
    centralBankTide,
    netMacroLift,
    source: respondingSources.join(' + '),
    status,
    lastUpdated: new Date().toISOString().substring(11, 19) + ' UTC',
    respondingSources,
    missingSeries,
    sanityCheckZScore: parseFloat(maxMacroZ.toFixed(2)),
    outliersRejected,
  };

  cachedVerifiedMacro = { timestamp: now, data: result };
  return result;
}

let cachedRealNews: { timestamp: number; data: VerifiedMacroNewsFeedResult } | null = null;

function classifyRealHeadline(title: string, summary: string, sourceName: string): {
  country: string;
  flag: string;
  category: VerifiedMacroNewsItem['category'];
  sentiment: VerifiedMacroNewsItem['sentiment'];
  goldImpactPct: number;
  titleFa: string;
  transmission: string;
  transmissionFa: string;
} {
  const text = `${title} ${summary}`.toLowerCase();

  let country = 'US';
  let flag = '🇺🇸';
  if (/\becb\b|eurozone|european|germany|lagarde/.test(text)) {
    country = 'EU';
    flag = '🇪🇺';
  } else if (/\bchina\b|\bpboc\b|beijing|yuan|shanghai/.test(text)) {
    country = 'CN';
    flag = '🇨🇳';
  } else if (/\bboe\b|\buk\b|britain|sterling/.test(text)) {
    country = 'GB';
    flag = '🇬🇧';
  } else if (/middle east|geopolit|oil|opec|tariff|global|imf|brics/.test(text)) {
    country = 'GLOBAL';
    flag = '🌐';
  }

  let category: VerifiedMacroNewsItem['category'] = 'monetary';
  if (/cpi|inflation|pce|price index|stagflation/.test(text)) {
    category = 'inflation';
  } else if (/treasury|yield|bond|10-year|tips|debt/.test(text)) {
    category = 'yields';
  } else if (/central bank|reserve|pboc|bullion|gold buying/.test(text)) {
    category = 'central_bank';
  } else if (/war|geopolit|tariff|sanction|oil|middle east|strait|conflict/.test(text)) {
    category = 'geopolitics';
  }

  let score = 0;
  if (/rate cut|dovish|lower rates|gold rises|gold climbs|safe-haven|safe haven|recession|cooling|buying gold|weak dollar|inflation hedge/.test(text)) {
    score += 1;
  }
  if (/rate hike|hawkish|higher yields|yields rise|strong dollar|dollar jumps|gold falls|gold drops|selloff|hot cpi/.test(text)) {
    score -= 1;
  }

  const sentiment: VerifiedMacroNewsItem['sentiment'] = score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral';
  const goldImpactPct = score > 0 ? 0.85 : score < 0 ? -0.85 : 0.15;

  const categoryTranslations: Record<
    VerifiedMacroNewsItem['category'],
    { prefixFa: string; transEn: string; transFa: string }
  > = {
    monetary: {
      prefixFa: 'گزارش سیاست پولی و نرخ بهره',
      transEn: `Verified external feed (${sourceName}): Central bank policy expectations directly reprice real terminal rate gravity on gold.`,
      transFa: `منبع خبری خارجی تاییدشده (${sourceName}): انتظارات سیاست پولی مستقیماً هزینه فرصت نگهداری طلا را بازتنظیم می‌کند.`,
    },
    inflation: {
      prefixFa: 'گزارش شاخص تورم و انتظارات قیمتی',
      transEn: `Verified external feed (${sourceName}): Inflation dynamics shift breakeven expectations and real TIPS yield differential.`,
      transFa: `منبع خبری خارجی تاییدشده (${sourceName}): داده‌های تورمی شکاف بازده واقعی اوراق خزانه‌داری و تقاضای پوششی طلا را تغییر می‌دهد.`,
    },
    central_bank: {
      prefixFa: 'گزارش ذخایر بانک‌های مرکزی و تقاضای نهادی',
      transEn: `Verified external feed (${sourceName}): Sovereign and institutional bullion flows alter physical wholesale liquidity.`,
      transFa: `منبع خبری خارجی تاییدشده (${sourceName}): جریان تقاضای نهادی و بانک‌های مرکزی نقدینگی بازار فیزیکی طلا را تحت تاثیر قرار می‌دهد.`,
    },
    geopolitics: {
      prefixFa: 'گزارش ریسک‌های ژئوپلیتیک و تجارت جهانی',
      transEn: `Verified external feed (${sourceName}): Geopolitical and trade uncertainty modulates safe-haven convexity demand.`,
      transFa: `منبع خبری خارجی تاییدشده (${sourceName}): تحولات ژئوپلیتیک و تجاری تقاضای پناهگاه امن سرمایه‌گذاران را تغییر می‌دهد.`,
    },
    yields: {
      prefixFa: 'گزارش بازار اوراق خزانه‌داری و بازدهی',
      transEn: `Verified external feed (${sourceName}): Treasury curve movements adjust Barsky-Summers opportunity cost of non-yielding bullion.`,
      transFa: `منبع خبری خارجی تاییدشده (${sourceName}): نوسانات منحنی بازده اوراق خزانه‌داری مستقیماً بر جاذبه کلان قیمت طلا اثر می‌گذارد.`,
    },
  };

  const meta = categoryTranslations[category];
  return {
    country,
    flag,
    category,
    sentiment,
    goldImpactPct,
    titleFa: `[${meta.prefixFa} · ${sourceName}] ${title}`,
    transmission: meta.transEn,
    transmissionFa: meta.transFa,
  };
}

/**
 * Fetches real external financial & macro news from independent RSS providers.
 * Never fabricates or derives news from candles. If all external sources fail, returns status='UNAVAILABLE'.
 */
export async function fetchVerifiedMacroNews(options?: { simulateFailure?: string }): Promise<VerifiedMacroNewsFeedResult> {
  const simFail = (options?.simulateFailure || '').toLowerCase();
  if (simFail.includes('all') || simFail.includes('news')) {
    return {
      status: 'UNAVAILABLE',
      activeSources: [],
      failedSources: ['Yahoo Finance Gold/Macro RSS', 'CNBC Economy & Fed RSS', 'MarketWatch Top Stories RSS'],
      unavailableMessageEn: 'News Feed Unavailable — All external financial news providers failed or were halted by circuit breaker.',
      unavailableMessageFa: 'جریان اخبار در دسترس نیست — عدم پاسخگویی تمامی منابع خبری خارجی؛ هیچ خبر مصنوعی تولید نمی‌شود.',
      events: [],
      lastFetchedIso: new Date().toISOString(),
    };
  }

  const now = Date.now();
  if (cachedRealNews && now - cachedRealNews.timestamp < 90000) {
    return cachedRealNews.data;
  }

  const feeds = [
    {
      name: 'Yahoo Finance Gold & Macro',
      url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC%3DF,GLD,PAXG-USD,%5ETNX,DX-Y.NYB&region=US&lang=en-US',
    },
    {
      name: 'CNBC Economy & Federal Reserve',
      url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
    },
    {
      name: 'MarketWatch Macro & Markets',
      url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
    },
  ];

  const activeSources: string[] = [];
  const failedSources: string[] = [];
  const parsedEvents: VerifiedMacroNewsItem[] = [];
  const seenTitles = new Set<string>();

  await Promise.all(
    feeds.map(async feed => {
      try {
        const res = await fetchWithTimeout(feed.url, 3600);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
          recordProviderHttpDiagnostic({
            providerName: feed.name,
            endpoint: feed.url,
            httpStatus: res.status,
            contentType: ct || 'none',
            isHtmlOrNonJson: ct.includes('text/html'),
            outcome: 'HTTP_ERROR',
            detail: `HTTP ${res.status}`,
            timestampIso: new Date().toISOString(),
          });
          throw new Error(`HTTP ${res.status}`);
        }
        const xml = await res.text();
        const trimmedXml = xml.trim();
        const isHtmlErrorPage =
          ct.includes('text/html') ||
          trimmedXml.toLowerCase().startsWith('<!doctype html') ||
          trimmedXml.toLowerCase().startsWith('<html');
        if (isHtmlErrorPage && !trimmedXml.includes('<item>')) {
          recordProviderHttpDiagnostic({
            providerName: feed.name,
            endpoint: feed.url,
            httpStatus: res.status,
            contentType: ct || 'text/html',
            isHtmlOrNonJson: true,
            outcome: 'NON_JSON_HTML_REJECTED',
            detail: 'RSS provider returned HTML page instead of XML feed',
            timestampIso: new Date().toISOString(),
          });
          throw new Error('RSS provider returned HTML instead of XML');
        }
        const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
        if (itemMatches.length === 0) throw new Error('Zero RSS <item> nodes');

        recordProviderHttpDiagnostic({
          providerName: feed.name,
          endpoint: feed.url,
          httpStatus: res.status,
          contentType: ct || 'application/xml',
          isHtmlOrNonJson: false,
          outcome: 'XML_OK',
          detail: `Verified XML RSS (${itemMatches.length} items)`,
          timestampIso: new Date().toISOString(),
        });
        activeSources.push(feed.name);
        for (let idx = 0; idx < itemMatches.length; idx++) {
          const block = itemMatches[idx][1];
          const rawTitle =
            (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
              block.match(/<title>([\s\S]*?)<\/title>/) ||
              [])[1] || '';
          const pubDateStr = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
          const linkStr = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
          const rawDesc =
            (block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) ||
              block.match(/<description>([\s\S]*?)<\/description>/) ||
              [])[1] || '';

          const cleanTitle = rawTitle
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .trim();

          if (!cleanTitle || seenTitles.has(cleanTitle.toLowerCase())) continue;
          if (/mortgage|retire|401\(k\)|my husband|my wife|credit card|inheritance|social security/i.test(cleanTitle)) {
            continue;
          }
          seenTitles.add(cleanTitle.toLowerCase());

          const parsedMs = pubDateStr ? Date.parse(pubDateStr.trim()) : NaN;
          if (!Number.isFinite(parsedMs)) continue;
          const timestampSec = Math.floor(parsedMs / 1000);
          const d = new Date(parsedMs);
          const timeStr = d.toISOString().substring(11, 16) + ' UTC';
          const cleanSummary = rawDesc.replace(/<[^>]+>/g, '').trim().slice(0, 240);

          const classified = classifyRealHeadline(cleanTitle, cleanSummary, feed.name);
          parsedEvents.push({
            id: `ext-news-${timestampSec}-${parsedEvents.length}`,
            timestamp: timestampSec,
            timeStr,
            country: classified.country,
            flag: classified.flag,
            source: feed.name,
            title: cleanTitle,
            titleFa: classified.titleFa,
            category: classified.category,
            goldImpactPct: classified.goldImpactPct,
            sentiment: classified.sentiment,
            transmission: classified.transmission,
            transmissionFa: classified.transmissionFa,
            externalUrl: linkStr.trim() || undefined,
            isVerifiedExternal: true,
          });
        }
      } catch (err: any) {
        failedSources.push(feed.name);
      }
    })
  );

  parsedEvents.sort((a, b) => b.timestamp - a.timestamp);
  const topEvents = parsedEvents.slice(0, 8);

  if (topEvents.length === 0) {
    return {
      status: 'UNAVAILABLE',
      activeSources: [],
      failedSources,
      unavailableMessageEn: 'News Feed Unavailable — All external financial news providers unreachable.',
      unavailableMessageFa: 'جریان اخبار در دسترس نیست — عدم دسترسی به منابع خبری خارجی.',
      events: [],
      lastFetchedIso: new Date().toISOString(),
    };
  }

  const result: VerifiedMacroNewsFeedResult = {
    status: failedSources.length === 0 ? 'ONLINE_EXTERNAL_FEEDS' : 'DEGRADED_PARTIAL_FEEDS',
    activeSources,
    failedSources,
    unavailableMessageEn: null,
    unavailableMessageFa: null,
    events: topEvents,
    lastFetchedIso: new Date().toISOString(),
  };

  cachedRealNews = { timestamp: now, data: result };
  return result;
}
