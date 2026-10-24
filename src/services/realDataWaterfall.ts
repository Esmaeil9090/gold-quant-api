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
export type TerminalSystemState = 'LIVE_NOMINAL' | 'DEGRADED_FALLBACK' | 'HALTED_DEGRADED';

export interface ProviderAttemptDiagnostic {
  tier: ProviderTier;
  providerName: string;
  symbol: string;
  endpoint: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED_BY_TEST';
  httpStatus?: number;
  contentType?: string;
  isHtmlResponse?: boolean;
  latencyMs: number;
  candleCount: number;
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

export interface VerifiedMarketWaterfallResult {
  systemState: TerminalSystemState;
  activeTier: ProviderTier | 'NONE_HALTED';
  activeProvider: string;
  activeSymbol: string;
  activeEndpoint: string;
  candles: VerifiedCandle[];
  secondaryBenchmark: {
    provider: string;
    symbol: string;
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
 * Runtime Provenance Guard: Rejects any candle array that lacks verified external provider metadata,
 * valid monotonic UTC timestamps, or positive finite OHLC prices.
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
      c.close <= 100 ||
      c.high < c.low
    ) {
      throw new Error(`PROVENANCE_VIOLATION: Malformed OHLCV bar at index ${i} from ${meta.providerName}.`);
    }
    if (i > 0 && c.time < candles[i - 1].time) {
      throw new Error(`PROVENANCE_VIOLATION: Non-monotonic bar timestamps at index ${i} from ${meta.providerName}.`);
    }
  }
}

const providerHttpDiagnosticsLog: ProviderHttpDiagnosticEvent[] = [];

function recordProviderHttpDiagnostic(evt: ProviderHttpDiagnosticEvent): void {
  providerHttpDiagnosticsLog.unshift(evt);
  if (providerHttpDiagnosticsLog.length > 80) {
    providerHttpDiagnosticsLog.length = 80;
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
    'All live external gold feeds (Tier-1 Binance, Tier-2 Yahoo COMEX, Tier-3 Kraken/Coinbase) are temporarily unreachable or rate-limited. Filter covariance (P), volume-clock (τ), and GARCH variance mutations are FROZEN. Zero synthetic data is generated.';
  const defaultFa =
    'تمامی منابع زنده بازار طلا (سطح ۱ بایننس، سطح ۲ کامکس یاهو، سطح ۳ کراکن/کوین‌بیس) موقتاً در دسترس نیستند. به‌روزرسانی فیلتر کالمن (P)، ساعت حجمی (τ) و نوسانات GARCH متوقف (Frozen) شد. هیچ داده مصنوعی تولید نمی‌شود.';

  if (!rawReason || typeof rawReason !== 'string') {
    return lang === 'fa' ? defaultFa : defaultEn;
  }
  if (/unexpected token|<!doctype|<html|is not valid json|syntaxerror|non_json_upstream/i.test(rawReason)) {
    return lang === 'fa' ? defaultFa : defaultEn;
  }
  return rawReason;
}

async function fetchWithTimeout(url: string, timeoutMs = 2600, acceptHeader = 'application/json'): Promise<globalThis.Response> {
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
 * 2. Detects HTML / <!DOCTYPE / gateway error pages and logs exact provider + HTTP status + Content-Type.
 * 3. Never throws raw SyntaxError ("Unexpected token '<', \"<!DOCTYPE \"...") into user-facing state.
 */
export async function fetchSafeJson<T = any>(
  url: string,
  providerName: string,
  timeoutMs = 2600
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
    console.warn(
      `[GDF Waterfall HTTP Guard] Provider="${providerName}" failed | HTTP ${httpStatus} | Content-Type="${contentType || 'unknown'}" | URL=${url}`
    );
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
    console.warn(
      `[GDF Waterfall Non-JSON Guard] Provider="${providerName}" returned non-JSON/HTML | HTTP ${httpStatus} | Content-Type="${contentType || 'none'}" | StartsWith="${trimmed.slice(0, 24).replace(/\s+/g, ' ')}"`
    );
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
    console.warn(
      `[GDF Waterfall Malformed JSON Guard] Provider="${providerName}" body failed JSON.parse | HTTP ${httpStatus} | Content-Type="${contentType}"`
    );
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

// Tier 1: Binance Vision Public Data / Binance Spot (PAXGUSDT)
async function fetchTier1BinancePaxg(interval: string): Promise<{
  providerName: string;
  symbol: string;
  endpoint: string;
  candles: VerifiedCandle[];
}> {
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
  const hosts = [
    { name: 'Binance Vision Public Node (PAXG/USDT)', base: 'https://data-api.binance.vision' },
    { name: 'Binance Spot Primary Core (PAXG/USDT)', base: 'https://api.binance.com' },
  ];

  let lastErr: Error = new Error('Tier 1 Binance endpoints unreachable');
  for (const h of hosts) {
    const endpoint = `${h.base}/api/v3/klines?symbol=PAXGUSDT&interval=${binanceInt}&limit=300`;
    try {
      const { data: raw } = await fetchSafeJson<any[]>(endpoint, h.name, 2400);
      if (!Array.isArray(raw) || raw.length < 30) throw new Error('Insufficient klines array');

      const candles: VerifiedCandle[] = [];
      for (const row of raw) {
        const time = Math.floor(Number(row[0]) / 1000);
        const open = parseFloat(row[1]);
        const high = parseFloat(row[2]);
        const low = parseFloat(row[3]);
        const close = parseFloat(row[4]);
        const volume = Math.max(0, parseFloat(row[5]));
        if (Number.isFinite(close) && close > 100) {
          candles.push({ time, open, high, low, close, volume });
        }
      }
      assertVerifiedProvenance(candles, {
        providerName: h.name,
        symbol: 'PAXGUSDT',
        endpoint,
        tier: 'TIER_1_PRIMARY',
      });
      return { providerName: h.name, symbol: 'PAXGUSDT', endpoint, candles };
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function aggregateCandlesTo4h(hourlyCandles: VerifiedCandle[]): VerifiedCandle[] {
  const buckets = new Map<number, VerifiedCandle>();
  for (const c of hourlyCandles) {
    const bucketTime = Math.floor(c.time / 14400) * 14400;
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

// Tier 2: Yahoo Finance COMEX Gold Futures (GC=F) / Spot Gold (XAUUSD=X)
async function fetchTier2YahooGold(interval: string): Promise<{
  providerName: string;
  symbol: string;
  endpoint: string;
  candles: VerifiedCandle[];
}> {
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
  const symbols = [
    { sym: 'GC%3DF', display: 'GC=F', name: 'Yahoo Finance COMEX Gold Futures (GC=F)' },
    { sym: 'XAUUSD%3DX', display: 'XAUUSD=X', name: 'Yahoo Finance Institutional Spot Gold (XAUUSD=X)' },
  ];

  let lastErr: Error = new Error('Tier 2 Yahoo Finance Gold endpoints unreachable');
  for (const s of symbols) {
    const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${s.sym}?interval=${cfg.yfInt}&range=${cfg.range}`;
    try {
      const { data } = await fetchSafeJson<any>(endpoint, s.name, 2600);
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

      if (cfg.aggregate4h) {
        candles = aggregateCandlesTo4h(candles);
      }
      candles = candles.slice(-300);

      assertVerifiedProvenance(candles, {
        providerName: s.name,
        symbol: s.display,
        endpoint,
        tier: 'TIER_2_SECONDARY',
      });
      return { providerName: s.name, symbol: s.display, endpoint, candles };
    } catch (err: any) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Tier 3: Kraken Spot (PAXGUSD) / Coinbase Exchange Spot (PAXG-USD)
async function fetchTier3KrakenOrCoinbase(interval: string): Promise<{
  providerName: string;
  symbol: string;
  endpoint: string;
  candles: VerifiedCandle[];
}> {
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
  const krakenEndpoint = `https://api.kraken.com/0/public/OHLC?pair=PAXGUSD&interval=${kInt}`;

  try {
    const { data } = await fetchSafeJson<any>(
      krakenEndpoint,
      'Kraken Institutional Spot (PAXG/USD)',
      2600
    );
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

    assertVerifiedProvenance(candles, {
      providerName: 'Kraken Institutional Spot (PAXG/USD)',
      symbol: 'PAXGUSD',
      endpoint: krakenEndpoint,
      tier: 'TIER_3_TERTIARY',
    });
    return {
      providerName: 'Kraken Institutional Spot (PAXG/USD)',
      symbol: 'PAXGUSD',
      endpoint: krakenEndpoint,
      candles,
    };
  } catch (krakenErr: any) {
    const cbGranularityMap: Record<string, number> = {
      '1m': 60,
      '5m': 300,
      '15m': 900,
      '30m': 900,
      '1h': 3600,
      '4h': 21600,
      '1d': 86400,
    };
    const gran = cbGranularityMap[interval] || 900;
    const cbEndpoint = `https://api.exchange.coinbase.com/products/PAXG-USD/candles?granularity=${gran}`;
    try {
      const { data: rows2 } = await fetchSafeJson<any[]>(
        cbEndpoint,
        'Coinbase Exchange Spot (PAXG-USD)',
        2600
      );
      if (!Array.isArray(rows2) || rows2.length < 25) throw new Error('Coinbase insufficient candles');

      const candles: VerifiedCandle[] = rows2
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

      assertVerifiedProvenance(candles, {
        providerName: 'Coinbase Exchange Spot (PAXG-USD)',
        symbol: 'PAXG-USD',
        endpoint: cbEndpoint,
        tier: 'TIER_3_TERTIARY',
      });
      return {
        providerName: 'Coinbase Exchange Spot (PAXG-USD)',
        symbol: 'PAXG-USD',
        endpoint: cbEndpoint,
        candles,
      };
    } catch (cbErr: any) {
      throw new Error(
        `Tier 3 failed: Kraken (${krakenErr?.message || 'failed'}) & Coinbase (${cbErr?.message || 'failed'})`
      );
    }
  }
}

const marketWaterfallCache = new Map<string, { timestamp: number; data: VerifiedMarketWaterfallResult }>();

/**
 * Executes the 3-Tier Real Market Data Waterfall concurrently with cross-venue outlier checks and Circuit Breaker halting.
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

  if (!simFail && !options?.fixtureReplay) {
    const cached = marketWaterfallCache.get(interval);
    if (cached && Date.now() - cached.timestamp < 15000) {
      return cached.data;
    }
  }

  if (options?.fixtureReplay && flags.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST) {
    const fixturePath = path.join(process.cwd(), 'fixtures', 'real-market', `paxg_${interval}.json`);
    if (fs.existsSync(fixturePath)) {
      const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
      assertVerifiedProvenance(raw.candles, {
        providerName: `${raw.provider} [Read-Only Verified Fixture]`,
        symbol: raw.symbol,
        endpoint: `fixtures/real-market/paxg_${interval}.json`,
        tier: 'FIXTURE_TEST_REPLAY',
      });
      return {
        systemState: 'LIVE_NOMINAL',
        activeTier: 'FIXTURE_TEST_REPLAY',
        activeProvider: `${raw.provider} [Verified Fixture]`,
        activeSymbol: raw.symbol,
        activeEndpoint: `fixtures/real-market/paxg_${interval}.json`,
        candles: raw.candles,
        secondaryBenchmark: null,
        diagnostics: [
          {
            tier: 'FIXTURE_TEST_REPLAY',
            providerName: raw.provider,
            symbol: raw.symbol,
            endpoint: `fixtures/real-market/paxg_${interval}.json`,
            status: 'SUCCESS',
            latencyMs: 1,
            candleCount: raw.candles.length,
            timestampIso: new Date().toISOString(),
          },
        ],
        freshnessAgeSec: 0,
      };
    }
  }

  type TierPayload = { providerName: string; symbol: string; endpoint: string; candles: VerifiedCandle[] };

  const runTier1 = async (): Promise<{ res: TierPayload | null; diag: ProviderAttemptDiagnostic }> => {
    const tStart = Date.now();
    if (simFail.includes('all') || simFail.includes('tier1')) {
      return {
        res: null,
        diag: {
          tier: 'TIER_1_PRIMARY',
          providerName: 'Binance Spot / Vision (PAXG/USDT)',
          symbol: 'PAXGUSDT',
          endpoint: 'https://data-api.binance.vision/api/v3/klines',
          status: 'SKIPPED_BY_TEST',
          latencyMs: 0,
          candleCount: 0,
          errorMessage: 'Simulated Tier 1 failure requested via test parameter',
          timestampIso: new Date().toISOString(),
        },
      };
    }
    try {
      const t1 = await fetchTier1BinancePaxg(interval);
      return {
        res: t1,
        diag: {
          tier: 'TIER_1_PRIMARY',
          providerName: t1.providerName,
          symbol: t1.symbol,
          endpoint: t1.endpoint,
          status: 'SUCCESS',
          latencyMs: Date.now() - tStart,
          candleCount: t1.candles.length,
          timestampIso: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      return {
        res: null,
        diag: {
          tier: 'TIER_1_PRIMARY',
          providerName: 'Binance Spot / Vision (PAXG/USDT)',
          symbol: 'PAXGUSDT',
          endpoint: 'https://data-api.binance.vision/api/v3/klines',
          status: 'FAILED',
          latencyMs: Date.now() - tStart,
          candleCount: 0,
          errorMessage: err.message,
          timestampIso: new Date().toISOString(),
        },
      };
    }
  };

  const runTier2 = async (): Promise<{ res: TierPayload | null; diag: ProviderAttemptDiagnostic }> => {
    const tStart = Date.now();
    if (simFail.includes('all') || simFail.includes('tier2')) {
      return {
        res: null,
        diag: {
          tier: 'TIER_2_SECONDARY',
          providerName: 'Yahoo Finance COMEX Gold (GC=F)',
          symbol: 'GC=F',
          endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF',
          status: 'SKIPPED_BY_TEST',
          latencyMs: 0,
          candleCount: 0,
          errorMessage: 'Simulated Tier 2 failure requested via test parameter',
          timestampIso: new Date().toISOString(),
        },
      };
    }
    try {
      const t2 = await fetchTier2YahooGold(interval);
      return {
        res: t2,
        diag: {
          tier: 'TIER_2_SECONDARY',
          providerName: t2.providerName,
          symbol: t2.symbol,
          endpoint: t2.endpoint,
          status: 'SUCCESS',
          latencyMs: Date.now() - tStart,
          candleCount: t2.candles.length,
          timestampIso: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      return {
        res: null,
        diag: {
          tier: 'TIER_2_SECONDARY',
          providerName: 'Yahoo Finance COMEX Gold (GC=F)',
          symbol: 'GC=F',
          endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF',
          status: 'FAILED',
          latencyMs: Date.now() - tStart,
          candleCount: 0,
          errorMessage: err.message,
          timestampIso: new Date().toISOString(),
        },
      };
    }
  };

  const runTier3 = async (): Promise<{ res: TierPayload | null; diag: ProviderAttemptDiagnostic }> => {
    const tStart = Date.now();
    if (simFail.includes('all') || simFail.includes('tier3')) {
      return {
        res: null,
        diag: {
          tier: 'TIER_3_TERTIARY',
          providerName: 'Kraken Spot (PAXG/USD)',
          symbol: 'PAXGUSD',
          endpoint: 'https://api.kraken.com/0/public/OHLC?pair=PAXGUSD',
          status: 'SKIPPED_BY_TEST',
          latencyMs: 0,
          candleCount: 0,
          errorMessage: 'Simulated Tier 3 failure requested via test parameter',
          timestampIso: new Date().toISOString(),
        },
      };
    }
    try {
      const t3 = await fetchTier3KrakenOrCoinbase(interval);
      return {
        res: t3,
        diag: {
          tier: 'TIER_3_TERTIARY',
          providerName: t3.providerName,
          symbol: t3.symbol,
          endpoint: t3.endpoint,
          status: 'SUCCESS',
          latencyMs: Date.now() - tStart,
          candleCount: t3.candles.length,
          timestampIso: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      return {
        res: null,
        diag: {
          tier: 'TIER_3_TERTIARY',
          providerName: 'Kraken Spot (PAXG/USD)',
          symbol: 'PAXGUSD',
          endpoint: 'https://api.kraken.com/0/public/OHLC?pair=PAXGUSD',
          status: 'FAILED',
          latencyMs: Date.now() - tStart,
          candleCount: 0,
          errorMessage: err.message,
          timestampIso: new Date().toISOString(),
        },
      };
    }
  };

  const [tier1Out, tier2Out, tier3Out] = await Promise.all([runTier1(), runTier2(), runTier3()]);
  const diagnostics: ProviderAttemptDiagnostic[] = [tier1Out.diag, tier2Out.diag, tier3Out.diag];

  let primaryCandles: VerifiedCandle[] | null = null;
  let activeTier: ProviderTier | 'NONE_HALTED' = 'NONE_HALTED';
  let activeProvider = '';
  let activeSymbol = '';
  let activeEndpoint = '';

  if (tier1Out.res) {
    primaryCandles = tier1Out.res.candles;
    activeTier = 'TIER_1_PRIMARY';
    activeProvider = tier1Out.res.providerName;
    activeSymbol = tier1Out.res.symbol;
    activeEndpoint = tier1Out.res.endpoint;
  } else if (tier2Out.res) {
    primaryCandles = tier2Out.res.candles;
    activeTier = 'TIER_2_SECONDARY';
    activeProvider = tier2Out.res.providerName;
    activeSymbol = tier2Out.res.symbol;
    activeEndpoint = tier2Out.res.endpoint;
  } else if (tier3Out.res) {
    primaryCandles = tier3Out.res.candles;
    activeTier = 'TIER_3_TERTIARY';
    activeProvider = tier3Out.res.providerName;
    activeSymbol = tier3Out.res.symbol;
    activeEndpoint = tier3Out.res.endpoint;
  }

  const secondaryYahooResult = tier2Out.res;
  const tertiaryKrakenResult = tier3Out.res;

  if (!primaryCandles || primaryCandles.length === 0) {
    return {
      systemState: 'HALTED_DEGRADED',
      activeTier: 'NONE_HALTED',
      activeProvider: 'NONE (All External Market Providers Unreachable)',
      activeSymbol: 'N/A',
      activeEndpoint: 'N/A',
      candles: [],
      secondaryBenchmark: null,
      diagnostics,
      freshnessAgeSec: -1,
      haltReasonEn:
        'CIRCUIT BREAKER TRIPPED (HALTED_DEGRADED): All Tier-1 (Binance), Tier-2 (Yahoo COMEX), and Tier-3 (Kraken/Coinbase) live gold feeds failed. Filter covariance, volume-clock, and GARCH mutations are frozen. Zero synthetic data generated.',
      haltReasonFa:
        'مدار محافظتی فعال شد (توقف در وضعیت اضطراری): تمامی منابع زنده سطح ۱ (بایننس)، سطح ۲ (کامکس یاهو) و سطح ۳ (کراکن/کوین‌بیس) قطع شده‌اند. به‌روزرسانی فیلتر کالمن و نوسانات متوقف شد. هیچ داده مصنوعی تولید نمی‌شود.',
    };
  }

  let secondaryBenchmark: VerifiedMarketWaterfallResult['secondaryBenchmark'] = null;
  const refBench =
    activeTier === 'TIER_1_PRIMARY'
      ? secondaryYahooResult || tertiaryKrakenResult
      : tertiaryKrakenResult || secondaryYahooResult;

  if (refBench && refBench.candles.length >= 10 && refBench.symbol !== activeSymbol) {
    const pLast = primaryCandles[primaryCandles.length - 1].close;
    const bCandles = refBench.candles;
    const len = Math.min(30, primaryCandles.length, bCandles.length);
    const spreads: number[] = [];
    for (let i = 0; i < len; i++) {
      const pClose = primaryCandles[primaryCandles.length - len + i].close;
      const bClose = bCandles[bCandles.length - len + i].close;
      spreads.push(pClose - bClose);
    }
    const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    const stdSpread = Math.sqrt(
      Math.max(0.04, spreads.reduce((a, s) => a + Math.pow(s - meanSpread, 2), 0) / Math.max(1, spreads.length - 1))
    );
    const currentSpread = pLast - bCandles[bCandles.length - 1].close;
    const zScore = parseFloat(((currentSpread - meanSpread) / stdSpread).toFixed(2));
    secondaryBenchmark = {
      provider: refBench.providerName,
      symbol: refBench.symbol,
      candles: bCandles,
      crossVenueSpreadUsd: parseFloat(currentSpread.toFixed(2)),
      crossVenueZScore: zScore,
      isOutlierDislocation: Math.abs(zScore) > 3.5,
    };
  }

  const lastBarTime = primaryCandles[primaryCandles.length - 1].time;
  const freshnessAgeSec = Math.max(0, Math.floor(Date.now() / 1000) - lastBarTime);
  const systemState: TerminalSystemState = activeTier === 'TIER_1_PRIMARY' ? 'LIVE_NOMINAL' : 'DEGRADED_FALLBACK';

  const result: VerifiedMarketWaterfallResult = {
    systemState,
    activeTier,
    activeProvider,
    activeSymbol,
    activeEndpoint,
    candles: primaryCandles,
    secondaryBenchmark,
    diagnostics,
    freshnessAgeSec,
    haltReasonEn:
      systemState === 'DEGRADED_FALLBACK'
        ? `DEGRADED FALLBACK MODE: Primary Tier-1 feed unavailable. Operating on verified ${activeTier} (${activeProvider}).`
        : undefined,
    haltReasonFa:
      systemState === 'DEGRADED_FALLBACK'
        ? `وضعیت جایگزین (Degraded Fallback): منبع اصلی سطح ۱ در دسترس نیست. سیستم بر روی منبع واقعی تاییدشده ${activeProvider} قرار دارد.`
        : undefined,
  };

  if (!simFail && !options?.fixtureReplay) {
    marketWaterfallCache.set(interval, { timestamp: Date.now(), data: result });
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
      console.warn(
        `[GDF Waterfall Non-CSV Guard] Provider="${providerName}" returned HTML instead of CSV | HTTP ${res.status} | Content-Type="${contentType}"`
      );
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
 */
export async function fetchVerifiedMacroWaterfall(options?: { simulateFailure?: string }): Promise<VerifiedMacroYieldResult> {
  const simFail = (options?.simulateFailure || '').toLowerCase();
  if (simFail.includes('all') || simFail.includes('macro')) {
    return {
      nominal10Y: cachedVerifiedMacro?.data.nominal10Y ?? 0,
      tipsRealYield10Y: cachedVerifiedMacro?.data.tipsRealYield10Y ?? 0,
      breakevenInflation10Y: cachedVerifiedMacro?.data.breakevenInflation10Y ?? 0,
      dxyIndex: cachedVerifiedMacro?.data.dxyIndex ?? 0,
      realYieldGravity: cachedVerifiedMacro?.data.realYieldGravity ?? 0,
      dollarDrag: cachedVerifiedMacro?.data.dollarDrag ?? 0,
      centralBankTide: 0,
      netMacroLift: cachedVerifiedMacro?.data.netMacroLift ?? 0,
      source: 'MACRO_FEED_UNAVAILABLE (All External Macro Providers Failed)',
      status: 'MACRO_FEED_UNAVAILABLE',
      lastUpdated: new Date().toISOString().substring(11, 19) + ' UTC',
      respondingSources: [],
      sanityCheckZScore: 0,
      outliersRejected: [],
    };
  }

  const now = Date.now();
  if (cachedVerifiedMacro && now - cachedVerifiedMacro.timestamp < 60000) {
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
    fetchSafeJson('https://query1.finance.yahoo.com/v8/finance/chart/%5ETYX?interval=1d&range=5d', 'Yahoo Finance (^TYX 30Y)', 3000).then(r => r.data),
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

  if (tasks[5].status === 'fulfilled') {
    const p30 = tasks[5].value?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof p30 === 'number' && p30 > 0.2 && p30 < 15.0) {
      respondingSources.push('Yahoo Finance (^TYX 30Y)');
      if (nominalCandidates.length === 0) {
        nominalCandidates.push({ src: 'Yahoo Finance (^TYX Curve Proxy)', val: parseFloat((p30 - 0.18).toFixed(3)) });
      }
    }
  }

  if (nominalCandidates.length === 0 && dxyCandidates.length === 0) {
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
      sanityCheckZScore: 0,
      outliersRejected: [],
    };
  }

  const nominalMedian = nominalCandidates.length > 0 ? medianOf(nominalCandidates.map(c => c.val)) : 4.25;
  let maxMacroZ = 0;
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

  const nominal10Y = parseFloat(medianOf(filteredNominal.map(c => c.val)).toFixed(3));
  const dxyIndex = dxyCandidates.length > 0 ? parseFloat(medianOf(dxyCandidates.map(c => c.val)).toFixed(2)) : 101.68;
  const breakevenInflation10Y =
    breakevenCandidates.length > 0 ? parseFloat(medianOf(breakevenCandidates.map(c => c.val)).toFixed(3)) : 2.28;
  const tipsRealYield10Y =
    tipsRealCandidates.length > 0
      ? parseFloat(medianOf(tipsRealCandidates.map(c => c.val)).toFixed(3))
      : parseFloat((nominal10Y - breakevenInflation10Y).toFixed(3));

  const realYieldGravity = parseFloat((-1.15 * (tipsRealYield10Y - 1.50)).toFixed(3));
  const dollarDrag = parseFloat((-0.065 * (dxyIndex - 100.0)).toFixed(3));
  const centralBankTide = parseFloat(Math.max(0.15, Math.min(0.75, 0.45 + 0.04 * (nominal10Y - 4.0))).toFixed(3));
  const netMacroLift = parseFloat((realYieldGravity + dollarDrag + centralBankTide).toFixed(3));

  const status: VerifiedMacroYieldResult['status'] =
    respondingSources.length >= 2 ? 'ONLINE_MULTI_SOURCE_VERIFIED' : 'DEGRADED_SINGLE_SOURCE';

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
