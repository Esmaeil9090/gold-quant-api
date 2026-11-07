/**
 * ASSET SESSION & CALENDAR ROUTER (GDF-G Gold vs. BDF-B Bitcoin Full Brain)
 *
 * Enforces strict separation between:
 * - AssetClass = 'GOLD' -> evaluateGoldSessionAndCalendar (LBMA / COMEX / PAXG)
 * - AssetClass = 'BTC'  -> evaluateCryptoSessionAndCalendar (24/7 continuous crypto spot)
 *
 * Constitutional Guarantee:
 * - BTC never calls evaluateGoldSessionAndCalendar.
 * - BTC never receives isFuturesClosed = true, WEEKEND_THIN shutdown, or ZERO_FOR_SESSION.
 */

import type {
  Candle,
  OrderBookMicrostructureExtensionInput,
  VerifiedMacroNewsItem,
} from '../contracts/quantContracts.js';
import type { AssetClass } from '../engine/residualShockOperator.js';
import {
  evaluateGoldSessionAndCalendar,
  type GoldSessionAndCalendarResult,
} from './sessionCalendar.js';
import {
  evaluateCryptoSessionAndCalendar,
  type CryptoSessionAndCalendarResult,
} from './cryptoSessionCalendar.js';

export type { AssetClass };

export interface AssetClassResolutionInput {
  asset?: string | null;
  symbol?: string | null;
  instrumentIdentity?: string | null;
}

/**
 * Deterministically resolves AssetClass ('BTC' | 'GOLD') from any asset parameter,
 * ticker symbol, or instrument identity string.
 */
export function resolveAssetClass(
  input?: AssetClassResolutionInput | string | null
): AssetClass {
  if (!input) return 'GOLD';
  if (typeof input === 'string') {
    const upper = input.trim().toUpperCase();
    if (
      upper === 'BTC' ||
      upper.includes('BTC') ||
      upper.includes('XBT') ||
      upper.includes('BITCOIN')
    ) {
      return 'BTC';
    }
    return 'GOLD';
  }

  const combined = [input.asset, input.symbol, input.instrumentIdentity]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .toUpperCase();

  if (
    combined.includes('BTC') ||
    combined.includes('XBT') ||
    combined.includes('BITCOIN')
  ) {
    return 'BTC';
  }
  return 'GOLD';
}

export type RoutedAssetSessionResult =
  | {
      assetClass: 'GOLD';
      goldSession: GoldSessionAndCalendarResult;
      cryptoSession: null;
      isFuturesClosed: boolean;
      isThinParticipation: boolean;
      allowedDriftPolicies: ReadonlyArray<'UNCHANGED' | 'SHRINK' | 'ZERO_FOR_SESSION' | 'SHOCK_RESET'>;
    }
  | {
      assetClass: 'BTC';
      goldSession: null;
      cryptoSession: CryptoSessionAndCalendarResult;
      isFuturesClosed: false;
      isThinParticipation: boolean;
      allowedDriftPolicies: ReadonlyArray<'UNCHANGED' | 'SHRINK'>;
    };

/**
 * Routes session and calendar evaluation strictly by AssetClass.
 */
export function routeAssetSessionAndCalendar(params: {
  assetClass?: AssetClass;
  asset?: string | null;
  symbol?: string | null;
  instrumentIdentity?: string | null;
  timestampSec: number;
  candles?: Candle[];
  macroNews?: VerifiedMacroNewsItem[];
  extensionInput?: OrderBookMicrostructureExtensionInput;
}): RoutedAssetSessionResult {
  const assetClass =
    params.assetClass ??
    resolveAssetClass({
      asset: params.asset,
      symbol: params.symbol,
      instrumentIdentity: params.instrumentIdentity,
    });

  if (assetClass === 'BTC') {
    const cryptoSession = evaluateCryptoSessionAndCalendar({
      timestampSec: params.timestampSec,
      candles: params.candles,
    });
    return {
      assetClass: 'BTC',
      goldSession: null,
      cryptoSession,
      isFuturesClosed: false,
      isThinParticipation: cryptoSession.isThinOpen,
      allowedDriftPolicies: ['UNCHANGED', 'SHRINK'] as const,
    };
  }

  const goldSession = evaluateGoldSessionAndCalendar({
    timestampSec: params.timestampSec,
    macroNews: params.macroNews,
    extensionInput: params.extensionInput,
  });

  return {
    assetClass: 'GOLD',
    goldSession,
    cryptoSession: null,
    isFuturesClosed: goldSession.isFuturesClosed,
    isThinParticipation: goldSession.isThinLiquiditySubSession,
    allowedDriftPolicies: ['UNCHANGED', 'SHRINK', 'ZERO_FOR_SESSION', 'SHOCK_RESET'] as const,
  };
}
