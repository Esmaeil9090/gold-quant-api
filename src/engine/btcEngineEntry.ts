/**
 * BDF-B — BITCOIN FORECAST ENGINE ENTRY POINT (src/engine/btcEngineEntry.ts)
 *
 * Exports:
 * - runBtcForecastEngine({ candles, intervalStepSeconds, horizonSteps?, leverageSeries?, chainSatellite? })
 * - fetchVerifiedBtcDerivativesSeries(spotCandles) — live public perpetual derivatives fetcher
 *   with strict fail-closed UNAVAILABLE fallback and explicit Spot vs. Perp Mark separation.
 */

import type { Candle } from '../contracts/quantContracts.js';
import type { ResidualShockCalibration } from './residualShockOperator.js';
import {
  evaluateBtcScientificCore,
  type BtcChainSatelliteObservation,
  type BtcDerivativesObservationPoint,
  type BtcScientificCoreOutput,
} from './btcScientificCore.js';

export interface RunBtcForecastEngineParams {
  candles: Candle[];
  intervalStepSeconds: number;
  horizonSteps?: number;
  leverageSeries?: BtcDerivativesObservationPoint[];
  chainSatellite?: BtcChainSatelliteObservation[];
  shockCalibration?: Partial<ResidualShockCalibration>;
}

export type RunBtcForecastEngineResult = BtcScientificCoreOutput;

/**
 * Synchronous deterministic entry point for BDF-B (Bitcoin Full Brain).
 */
export function runBtcForecastEngine(
  params: RunBtcForecastEngineParams
): RunBtcForecastEngineResult {
  return evaluateBtcScientificCore({
    candles: params.candles,
    intervalStepSeconds: params.intervalStepSeconds,
    horizonSteps: params.horizonSteps ?? 24,
    leverageSeries: params.leverageSeries,
    chainSatellite: params.chainSatellite,
    shockCalibration: params.shockCalibration,
  });
}

interface CachedDerivativesObservation {
  fetchedAtMs: number;
  point: BtcDerivativesObservationPoint;
}

let cachedLiveDerivatives: CachedDerivativesObservation | null = null;
let previousOpenInterestContracts: number | null = null;

async function fetchJsonWithTimeout(url: string, timeoutMs = 2400): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Queries verified public perpetual derivatives endpoints (Bybit V5 Linear, OKX Swap, Binance Futures)
 * to populate real 8h funding rate, mark price vs. spot basis (bps), and open interest change.
 *
 * Constitutional Rules:
 * - Never merges perpetual mark price with BTC_SPOT_USD spot price.
 * - Never fabricates funding, open interest, or liquidations; returns undefined (fail-closed UNAVAILABLE)
 *   if all public endpoints are unreachable.
 */
export async function fetchVerifiedBtcDerivativesSeries(
  spotCandles: Candle[]
): Promise<BtcDerivativesObservationPoint[] | undefined> {
  if (!Array.isArray(spotCandles) || spotCandles.length === 0) {
    return undefined;
  }

  const latestCandle = spotCandles[spotCandles.length - 1];
  const latestSpotUsd = latestCandle.close;
  const nowMs = Date.now();

  if (cachedLiveDerivatives && nowMs - cachedLiveDerivatives.fetchedAtMs <= 25_000) {
    return [
      {
        ...cachedLiveDerivatives.point,
        timestampSec: latestCandle.time,
      },
    ];
  }

  // Try Venue 1: Bybit V5 Public Linear Perpetual Ticker (BTCUSDT)
  try {
    const bybitJson = await fetchJsonWithTimeout(
      'https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT',
      2200
    );
    const item = bybitJson?.result?.list?.[0];
    if (item) {
      const markPrice = Number(item.markPrice);
      const indexSpotPrice = Number(item.indexPrice) || latestSpotUsd;
      const fundingRate8h = Number(item.fundingRate);
      const openInterest = Number(item.openInterest);

      if (
        Number.isFinite(markPrice) &&
        markPrice > 1000 &&
        Number.isFinite(fundingRate8h)
      ) {
        const markSpotBasisBps =
          ((markPrice - indexSpotPrice) / Math.max(1, indexSpotPrice)) * 10_000;
        let oiChangePct: number | null = null;
        if (Number.isFinite(openInterest) && openInterest > 0) {
          if (previousOpenInterestContracts && previousOpenInterestContracts > 0) {
            oiChangePct =
              ((openInterest - previousOpenInterestContracts) /
                previousOpenInterestContracts) *
              100;
          }
          previousOpenInterestContracts = openInterest;
        }
        const pt: BtcDerivativesObservationPoint = {
          timestampSec: latestCandle.time,
          fundingRate8h,
          markSpotBasisBps: Number(markSpotBasisBps.toFixed(2)),
          openInterestChangePct: oiChangePct,
          liquidationImbalanceNorm: null,
          markPriceUsd: markPrice,
          spotPriceUsd: indexSpotPrice,
          venue: 'Bybit V5 Linear Perp (BTCUSDT)',
        };
        cachedLiveDerivatives = { fetchedAtMs: nowMs, point: pt };
        return [pt];
      }
    }
  } catch {
    // Proceed to next public venue
  }

  // Try Venue 2: OKX Public Swap Funding Rate + Mark Price (BTC-USDT-SWAP)
  try {
    const [fundingJson, markJson] = await Promise.all([
      fetchJsonWithTimeout(
        'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP',
        2200
      ),
      fetchJsonWithTimeout(
        'https://www.okx.com/api/v5/public/mark-price?instType=SWAP&instId=BTC-USDT-SWAP',
        2200
      ),
    ]);
    const fRow = fundingJson?.data?.[0];
    const mRow = markJson?.data?.[0];
    const fundingRate8h = Number(fRow?.fundingRate);
    const markPrice = Number(mRow?.markPx);
    if (
      Number.isFinite(fundingRate8h) &&
      Number.isFinite(markPrice) &&
      markPrice > 1000
    ) {
      const markSpotBasisBps =
        ((markPrice - latestSpotUsd) / Math.max(1, latestSpotUsd)) * 10_000;
      const pt: BtcDerivativesObservationPoint = {
        timestampSec: latestCandle.time,
        fundingRate8h,
        markSpotBasisBps: Number(markSpotBasisBps.toFixed(2)),
        openInterestChangePct: null,
        liquidationImbalanceNorm: null,
        markPriceUsd: markPrice,
        spotPriceUsd: latestSpotUsd,
        venue: 'OKX Public Perp Swap (BTC-USDT-SWAP)',
      };
      cachedLiveDerivatives = { fetchedAtMs: nowMs, point: pt };
      return [pt];
    }
  } catch {
    // Proceed to next public venue
  }

  // Try Venue 3: Binance Futures Public Premium Index (BTCUSDT)
  try {
    const binanceJson = await fetchJsonWithTimeout(
      'https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT',
      2200
    );
    const markPrice = Number(binanceJson?.markPrice);
    const indexPrice = Number(binanceJson?.indexPrice) || latestSpotUsd;
    const fundingRate8h = Number(binanceJson?.lastFundingRate);
    if (
      Number.isFinite(markPrice) &&
      markPrice > 1000 &&
      Number.isFinite(fundingRate8h)
    ) {
      const markSpotBasisBps =
        ((markPrice - indexPrice) / Math.max(1, indexPrice)) * 10_000;
      const pt: BtcDerivativesObservationPoint = {
        timestampSec: latestCandle.time,
        fundingRate8h,
        markSpotBasisBps: Number(markSpotBasisBps.toFixed(2)),
        openInterestChangePct: null,
        liquidationImbalanceNorm: null,
        markPriceUsd: markPrice,
        spotPriceUsd: indexPrice,
        venue: 'Binance USD-M Perp (BTCUSDT)',
      };
      cachedLiveDerivatives = { fetchedAtMs: nowMs, point: pt };
      return [pt];
    }
  } catch {
    // Fail closed to undefined -> BDF-B reports leverageChannel.status = 'UNAVAILABLE'
  }

  return undefined;
}

/**
 * Fetches aligned multi-bar historical BTC derivatives series (funding rate history,
 * open interest history, and mark-vs-index perpetual basis series) from Bybit V5 public endpoints.
 * Keeps perpetual mark price strictly separate from spot price and never fabricates missing points.
 */
export async function fetchHistoricalBtcDerivativesSeries(
  spotCandles: Candle[],
  interval: string = '1h'
): Promise<BtcDerivativesObservationPoint[] | undefined> {
  if (!Array.isArray(spotCandles) || spotCandles.length === 0) {
    return undefined;
  }

  const klineMap: Record<string, string> = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
  };
  const oiMap: Record<string, string> = {
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1h',
    '4h': '4h',
    '1d': '1d',
  };
  const kInt = klineMap[interval] || '60';
  const oInt = oiMap[interval] || '1h';

  try {
    const [markRes, idxRes, oiRes, fundRes] = await Promise.all([
      fetchJsonWithTimeout(
        `https://api.bybit.com/v5/market/mark-price-kline?category=linear&symbol=BTCUSDT&interval=${kInt}&limit=200`,
        3000
      ),
      fetchJsonWithTimeout(
        `https://api.bybit.com/v5/market/index-price-kline?category=linear&symbol=BTCUSDT&interval=${kInt}&limit=200`,
        3000
      ),
      fetchJsonWithTimeout(
        `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=BTCUSDT&intervalTime=${oInt}&limit=200`,
        3000
      ),
      fetchJsonWithTimeout(
        `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=BTCUSDT&limit=200`,
        3000
      ),
    ]);

    const markByTime = new Map<number, number>();
    for (const row of markRes?.result?.list || []) {
      markByTime.set(Math.floor(Number(row[0]) / 1000), Number(row[4]));
    }
    const idxByTime = new Map<number, number>();
    for (const row of idxRes?.result?.list || []) {
      idxByTime.set(Math.floor(Number(row[0]) / 1000), Number(row[4]));
    }
    const oiList = (oiRes?.result?.list || [])
      .map((row: any) => ({
        time: Math.floor(Number(row.timestamp) / 1000),
        openInterest: Number(row.openInterest),
      }))
      .sort((a: any, b: any) => a.time - b.time);
    const oiChangeByTime = new Map<number, number | null>();
    for (let i = 0; i < oiList.length; i++) {
      const prev = i > 0 ? oiList[i - 1].openInterest : null;
      const cur = oiList[i].openInterest;
      const chg = prev && prev > 0 ? ((cur - prev) / prev) * 100 : null;
      oiChangeByTime.set(
        oiList[i].time,
        chg !== null ? Number(chg.toFixed(4)) : null
      );
    }

    const fundList = (fundRes?.result?.list || [])
      .map((row: any) => ({
        time: Math.floor(Number(row.fundingRateTimestamp) / 1000),
        fundingRate8h: Number(row.fundingRate),
      }))
      .sort((a: any, b: any) => a.time - b.time);

    const series: BtcDerivativesObservationPoint[] = [];
    for (const c of spotCandles) {
      let latestFunding: number | null = null;
      for (const f of fundList) {
        if (f.time <= c.time) latestFunding = f.fundingRate8h;
        else break;
      }
      const markPrice = markByTime.get(c.time) ?? null;
      const idxPrice = idxByTime.get(c.time) ?? c.close;
      const basisBps =
        markPrice !== null && idxPrice > 0
          ? Number((((markPrice - idxPrice) / idxPrice) * 10000).toFixed(4))
          : null;
      const oiChangePct = oiChangeByTime.get(c.time) ?? null;

      if (latestFunding !== null || basisBps !== null || oiChangePct !== null) {
        series.push({
          timestampSec: c.time,
          fundingRate8h: latestFunding,
          openInterestChangePct: oiChangePct,
          liquidationImbalanceNorm: null,
          markSpotBasisBps: basisBps,
          markPriceUsd: markPrice,
          spotPriceUsd: c.close,
          venue: 'Bybit V5 Historical Linear Perp (BTCUSDT)',
        });
      }
    }

    if (series.length > 0) {
      return series;
    }
  } catch {
    // Fallback to single-point live derivatives or undefined
  }

  return fetchVerifiedBtcDerivativesSeries(spotCandles);
}

