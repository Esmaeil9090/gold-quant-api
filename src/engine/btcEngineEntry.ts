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
