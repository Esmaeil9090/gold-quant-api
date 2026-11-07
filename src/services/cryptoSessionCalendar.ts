/**
 * BDF-B — CONTINUOUS 24/7 CRYPTO SESSION & PARTICIPATION CALENDAR
 *
 * Constitutional Rules:
 * - Spot BTC trades continuously 24/7/365 across global venues.
 * - isFuturesClosed = false ALWAYS for spot BTC.
 * - Weekends are continuous open participation (CONTINUOUS_OPEN or THIN_OPEN_PARTICIPATION),
 *   NEVER Gold's COMEX/LBMA WEEKEND_THIN closed shutdown.
 * - Drift policy is strictly 'UNCHANGED' | 'SHRINK' (NEVER 'ZERO_FOR_SESSION').
 */

import type { Candle } from '../contracts/quantContracts.js';

export type CryptoWeekpartType =
  | 'WEEKDAY_CONTINUOUS_OPEN'
  | 'WEEKEND_CONTINUOUS_OPEN'
  | 'WEEKEND_THIN_OPEN_PARTICIPATION'
  | 'FUNDING_SETTLEMENT_WINDOW';

export type CryptoIntradayWindowId =
  | 'ASIA_CRYPTO_FLOW'
  | 'EUROPE_CRYPTO_FLOW'
  | 'EU_US_PEAK_CRYPTO_OVERLAP'
  | 'US_CRYPTO_FLOW'
  | 'PACIFIC_INTER_SESSION_OPEN';

export type CryptoDriftPolicy = 'UNCHANGED' | 'SHRINK';

export interface CryptoSessionAndCalendarResult {
  readonly assetClass: 'BTC';
  readonly barTimeSec: number;
  readonly evaluatedAtIso: string;
  readonly isFuturesClosed: false;
  readonly isThinOpen: boolean;
  readonly driftPolicy: CryptoDriftPolicy;
  readonly driftScaleFactor: number;
  readonly weekpart: CryptoWeekpartType;
  readonly sessionId: CryptoIntradayWindowId;
  readonly isFundingSettlementWindow: boolean;
  readonly participationRatio: number;
  readonly hourUtc: number;
  readonly dayOfWeekUtc: number;
  readonly utcHourDecimal: number;
  readonly sessionSummaryEn: string;
  readonly sessionSummaryFa: string;
  readonly weekpartSummaryEn: string;
  readonly weekpartSummaryFa: string;
}

/**
 * Evaluates the continuous 24/7 crypto session calendar for BTC.
 * Never returns isFuturesClosed = true or driftPolicy = 'ZERO_FOR_SESSION'.
 */
export function evaluateCryptoSessionAndCalendar(params: {
  timestampSec: number;
  candles?: Candle[];
}): CryptoSessionAndCalendarResult {
  const { timestampSec, candles } = params;
  const d = new Date(timestampSec * 1000);
  const evaluatedAtIso = d.toISOString();
  const dayOfWeekUtc = d.getUTCDay(); // 0=Sunday .. 6=Saturday
  const hourUtc = d.getUTCHours();
  const minuteUtc = d.getUTCMinutes();
  const utcHourDecimal = Number((hourUtc + minuteUtc / 60).toFixed(4));

  const isWeekendUtc =
    dayOfWeekUtc === 6 ||
    dayOfWeekUtc === 0 ||
    (dayOfWeekUtc === 5 && utcHourDecimal >= 22.0);

  // Standard 8-hour perpetual funding settlement timestamps: 00:00, 08:00, 16:00 UTC (+/- 15m)
  const distTo00 = Math.min(utcHourDecimal, 24 - utcHourDecimal);
  const distTo08 = Math.abs(utcHourDecimal - 8.0);
  const distTo16 = Math.abs(utcHourDecimal - 16.0);
  const isFundingSettlementWindow =
    Math.min(distTo00, distTo08, distTo16) <= 0.25;

  // Empirical participation ratio from real candle volume/range if provided
  let participationRatio = isWeekendUtc ? 0.68 : 1.0;
  if (Array.isArray(candles) && candles.length >= 8) {
    const windowSlice = candles.slice(-Math.min(48, candles.length));
    const volumes = windowSlice
      .map(c => Math.max(0, Number(c.volume) || 0))
      .filter(v => v > 0)
      .sort((a, b) => a - b);
    const lastCandle = candles[candles.length - 1];
    const lastVol = Math.max(0, Number(lastCandle?.volume) || 0);
    if (volumes.length >= 4 && lastVol > 0) {
      const medVol = volumes[Math.floor(volumes.length / 2)] || 1;
      participationRatio = Number(Math.max(0.2, Math.min(2.5, lastVol / medVol)).toFixed(4));
    }
  }

  // Intraday participation window
  let sessionId: CryptoIntradayWindowId = 'ASIA_CRYPTO_FLOW';
  let sessionSummaryEn = 'Asia 24/7 Spot & Derivatives Flow (Tokyo / Singapore / Hong Kong)';
  let sessionSummaryFa = 'جریان ۲۴/۷ اسپات و مشتقات آسیا (توکیو / سنگاپور / هنگ‌کنگ)';

  if (utcHourDecimal >= 12.0 && utcHourDecimal < 17.0) {
    sessionId = 'EU_US_PEAK_CRYPTO_OVERLAP';
    sessionSummaryEn = 'Europe / US Peak Crypto Liquidity Overlap (Maximum Order-Book Depth)';
    sessionSummaryFa = 'هم‌پوشانی اوج نقدینگی اروپا و آمریکا (بیشترین عمق دفتر سفارشات رمزارز)';
  } else if (utcHourDecimal >= 7.0 && utcHourDecimal < 12.0) {
    sessionId = 'EUROPE_CRYPTO_FLOW';
    sessionSummaryEn = 'European Crypto Spot & ETP Active Flow';
    sessionSummaryFa = 'جریان فعال اسپات و صندوق‌های رمزارزی اروپا';
  } else if (utcHourDecimal >= 17.0 && utcHourDecimal < 21.0) {
    sessionId = 'US_CRYPTO_FLOW';
    sessionSummaryEn = 'North American Institutional & Spot ETF Flow';
    sessionSummaryFa = 'جریان نهادی و صندوق‌های اسپات آمریکای شمالی';
  } else if (utcHourDecimal >= 21.0 && utcHourDecimal < 24.0) {
    sessionId = 'PACIFIC_INTER_SESSION_OPEN';
    sessionSummaryEn = 'Pacific Continuous Open Transition (Reduced Order-Book Depth)';
    sessionSummaryFa = 'گذار پیوسته اقیانوس آرام (کاهش نسبی عمق دفتر سفارشات)';
  }

  // Determine thin-open participation: weekends or off-peak low volume
  const isOffPeakWindow = sessionId === 'PACIFIC_INTER_SESSION_OPEN';
  const isThinOpen =
    (isWeekendUtc && participationRatio < 0.85) ||
    participationRatio < 0.55 ||
    (isWeekendUtc && isOffPeakWindow);

  let weekpart: CryptoWeekpartType = 'WEEKDAY_CONTINUOUS_OPEN';
  let weekpartSummaryEn = '24/7 Continuous Spot & Perp Auction (Full Global Depth)';
  let weekpartSummaryFa = 'حراج پیوسته ۲۴/۷ اسپات و پرپچوال (عمق کامل جهانی)';

  if (isWeekendUtc) {
    if (isThinOpen) {
      weekpart = 'WEEKEND_THIN_OPEN_PARTICIPATION';
      weekpartSummaryEn =
        'Weekend Continuous Open (Thin-Open Participation — Market Active, Drift Scaled)';
      weekpartSummaryFa =
        'بازار پیوسته آخر هفته (مشارکت کم‌عمق اما فعال — تعدیل ضریب رانش بدون توقف فیزیک)';
    } else {
      weekpart = 'WEEKEND_CONTINUOUS_OPEN';
      weekpartSummaryEn = 'Weekend Continuous Open (Active Global Crypto Spot Flow)';
      weekpartSummaryFa = 'بازار پیوسته آخر هفته (جریان فعال اسپات رمزارز)';
    }
  } else if (isFundingSettlementWindow) {
    weekpart = 'FUNDING_SETTLEMENT_WINDOW';
    weekpartSummaryEn = 'Perpetual 8h Funding Settlement Window (Continuous Spot Open)';
    weekpartSummaryFa = 'پنجره تسویه ۸ ساعته فاندینگ پرپچوال (بازار اسپات باز)';
  }

  const driftPolicy: CryptoDriftPolicy = isThinOpen ? 'SHRINK' : 'UNCHANGED';
  const driftScaleFactor = isThinOpen
    ? Number(Math.max(0.55, Math.min(0.8, 0.55 + 0.25 * participationRatio)).toFixed(4))
    : 1.0;

  return {
    assetClass: 'BTC',
    barTimeSec: timestampSec,
    evaluatedAtIso,
    isFuturesClosed: false,
    isThinOpen,
    driftPolicy,
    driftScaleFactor,
    weekpart,
    sessionId,
    isFundingSettlementWindow,
    participationRatio,
    hourUtc,
    dayOfWeekUtc,
    utcHourDecimal,
    sessionSummaryEn,
    sessionSummaryFa,
    weekpartSummaryEn,
    weekpartSummaryFa,
  };
}
