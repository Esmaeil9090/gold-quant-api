/**
 * GDF — GOLD TRADING SESSION & CALENDAR STRUCTURE (LBMA / COMEX / CRYPTO)
 *
 * Provides deterministic recognition of gold market sessions and calendar regimes:
 *  - Weekparts: WEEKDAY_FULL_AUCTION, WEEKEND_THIN, FRIDAY_LATE_ROLL, SUNDAY_OPEN_RISK, FUTURES_CLOSED_OVERLAP
 *  - Intraday sessions: ASIA, LONDON, NEW_YORK, LONDON_NY_OVERLAP, PACIFIC_QUIET, DAILY_ROLL_MAINTENANCE
 *  - Turn-of-month and Turn-of-year seasonal low-liquidity regimes
 *  - Verified scheduled macro event windows
 */

import type {
  IntradaySessionId,
  OrderBookMicrostructureExtensionInput,
  SeasonalCalendarContext,
  TradingCalendarSessionContext,
  VerifiedMacroNewsItem,
  WeekpartType,
} from '../contracts/quantContracts.js';

export interface GoldSessionAndCalendarResult extends TradingCalendarSessionContext {
  weekpart: WeekpartType;
  sessionId: IntradaySessionId;
  isThinLiquiditySubSession: boolean;
  seasonalCalendar: SeasonalCalendarContext & {
    isTurnOfYearHolidayWindow: boolean;
    isTurnOfMonth: boolean;
    seasonalLiquidityPenalty: number;
    summaryEn: string;
    summaryFa: string;
  };
  utcHourDecimal: number;
  sessionSummaryEn: string;
  sessionSummaryFa: string;
  weekpartSummaryEn: string;
  weekpartSummaryFa: string;
  evaluatedAtIso: string;
}

/**
 * Evaluates the deterministic gold session and calendar structure for any given UTC timestamp.
 */
export function evaluateGoldSessionAndCalendar(params: {
  timestampSec: number;
  macroNews?: VerifiedMacroNewsItem[];
  extensionInput?: OrderBookMicrostructureExtensionInput;
}): GoldSessionAndCalendarResult {
  const { timestampSec, macroNews = [] } = params;
  const d = new Date(timestampSec * 1000);
  const evaluatedAtIso = d.toISOString();
  const dayOfWeek = d.getUTCDay(); // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const utcHourDecimal = parseFloat((hours + minutes / 60).toFixed(4));

  // 1. Determine Weekpart
  let weekpart: WeekpartType = 'WEEKDAY_FULL_AUCTION';
  let isFuturesClosed = false;

  if (dayOfWeek === 5) {
    // Friday
    if (utcHourDecimal >= 22.0) {
      weekpart = 'WEEKEND_THIN';
      isFuturesClosed = true;
    } else if (utcHourDecimal >= 19.0) {
      weekpart = 'FRIDAY_LATE_ROLL';
      isFuturesClosed = false;
    }
  } else if (dayOfWeek === 6) {
    // Saturday: futures completely closed
    weekpart = 'WEEKEND_THIN';
    isFuturesClosed = true;
  } else if (dayOfWeek === 0) {
    // Sunday
    if (utcHourDecimal < 22.0) {
      weekpart = 'WEEKEND_THIN';
      isFuturesClosed = true;
    } else {
      weekpart = 'SUNDAY_OPEN_RISK';
      isFuturesClosed = false;
    }
  } else if (dayOfWeek === 1 && utcHourDecimal < 1.0) {
    // Early Monday Asian reopen
    weekpart = 'SUNDAY_OPEN_RISK';
    isFuturesClosed = false;
  }

  // 2. Determine Intraday Session
  let sessionId: IntradaySessionId = 'ASIA';
  let isThinLiquiditySubSession = isFuturesClosed;

  if (isFuturesClosed) {
    sessionId = 'WEEKEND_CLOSED_THIN';
    isThinLiquiditySubSession = true;
  } else if (utcHourDecimal >= 21.0 && utcHourDecimal < 22.0 && dayOfWeek >= 1 && dayOfWeek <= 4) {
    sessionId = 'DAILY_ROLL_MAINTENANCE';
    isThinLiquiditySubSession = true;
  } else if (utcHourDecimal >= 12.0 && utcHourDecimal < 16.0) {
    sessionId = 'LONDON_NY_OVERLAP';
    isThinLiquiditySubSession = false;
  } else if (utcHourDecimal >= 7.0 && utcHourDecimal < 12.0) {
    sessionId = 'LONDON';
    isThinLiquiditySubSession = false;
  } else if (utcHourDecimal >= 16.0 && utcHourDecimal < 21.0) {
    sessionId = 'NEW_YORK';
    isThinLiquiditySubSession = false;
  } else if (utcHourDecimal >= 21.0 && utcHourDecimal < 24.0) {
    sessionId = 'PACIFIC_QUIET';
    isThinLiquiditySubSession = true;
  } else {
    sessionId = 'ASIA';
    if (utcHourDecimal >= 6.0 && utcHourDecimal < 7.0) {
      isThinLiquiditySubSession = true;
    }
  }

  // 3. Seasonal & Calendar Effects
  const month = d.getUTCMonth(); // 0=Jan .. 11=Dec
  const dayOfMonth = d.getUTCDate();
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();

  const isTurnOfYearHolidayWindow = (month === 11 && dayOfMonth >= 20) || (month === 0 && dayOfMonth <= 5);
  const isTurnOfMonth = dayOfMonth >= daysInMonth - 1 || dayOfMonth <= 2;

  let seasonalLiquidityPenalty = 0;
  if (isTurnOfYearHolidayWindow) seasonalLiquidityPenalty += 0.45;
  if (isTurnOfMonth) seasonalLiquidityPenalty += 0.15;
  if (isThinLiquiditySubSession) seasonalLiquidityPenalty += 0.25;
  seasonalLiquidityPenalty = parseFloat(Math.min(0.85, seasonalLiquidityPenalty).toFixed(3));

  let seasonalSummaryEn = 'Normal calendar conditions.';
  let seasonalSummaryFa = 'شرایط تقویمی معاملاتی نرمال.';
  if (isTurnOfYearHolidayWindow) {
    seasonalSummaryEn = 'Turn-of-year holiday window (Dec 20 – Jan 5): institutional desks closed, thin auction depth.';
    seasonalSummaryFa = 'پنجره تعطیلات سال نو (۲۰ دسامبر تا ۵ ژانویه): بسته بودن دفاتر نهادی و کاهش عمق حراج.';
  } else if (isTurnOfMonth) {
    seasonalSummaryEn = 'Turn-of-month portfolio rebalancing flows and benchmark adjustments.';
    seasonalSummaryFa = 'جریان‌های بازتنظیم پرتفوی پایان/آغاز ماه و تعدیلات شاخص.';
  }

  // 4. Session & Weekpart Summaries
  let sessionSummaryEn = 'London / New York Overlap (Peak Depth & Volume)';
  let sessionSummaryFa = 'تلاقی لندن و نیویورک (بیشترین عمق و حجم معاملات)';

  switch (sessionId) {
    case 'LONDON_NY_OVERLAP':
      sessionSummaryEn = 'London / New York Overlap (Peak Global Depth)';
      sessionSummaryFa = 'تلاقی اوج لندن و نیویورک (بیشترین عمق جهانی)';
      break;
    case 'LONDON':
      sessionSummaryEn = 'London Bullion Auction (LBMA Benchmarking)';
      sessionSummaryFa = 'حراج شمش لندن (تعیین نرخ پایه LBMA)';
      break;
    case 'NEW_YORK':
      sessionSummaryEn = 'New York Session (COMEX Pit Flow)';
      sessionSummaryFa = 'نشست نیویورک (جریان معاملات آتی کامکس)';
      break;
    case 'ASIA':
      sessionSummaryEn = 'Asian Session (Tokyo/Hong Kong/Shanghai Physical Flow)';
      sessionSummaryFa = 'نشست آسیایی (جریان معاملات فیزیکی توکیو، هنگ‌کنگ و شانگهای)';
      break;
    case 'PACIFIC_QUIET':
      sessionSummaryEn = 'Pacific Inter-Session Transition (Thin Off-Peak Flow)';
      sessionSummaryFa = 'گذار کم‌حجم اقیانوس آرام (جریان کم‌حجم میان‌نشستی)';
      break;
    case 'DAILY_ROLL_MAINTENANCE':
      sessionSummaryEn = 'Daily Settlement & Clearing Roll (Futures Maintenance)';
      sessionSummaryFa = 'تسویه روزانه و رول دفاتر (تعمیرات و تعویض قراردادهای آتی)';
      break;
    case 'WEEKEND_CLOSED_THIN':
      sessionSummaryEn = 'Weekend Closed (Futures Offline, Thin Crypto Spot Auction)';
      sessionSummaryFa = 'تعطیلات آخر هفته (بازار آتی بسته، معاملات اسپات کم‌عمق)';
      break;
  }

  let weekpartSummaryEn = 'Active Weekday Auction';
  let weekpartSummaryFa = 'حراج فعال روز کاری';

  if (weekpart === 'WEEKEND_THIN') {
    weekpartSummaryEn = 'Weekend Thin Liquidity (COMEX & LBMA Closed)';
    weekpartSummaryFa = 'نقدینگی پایین آخر هفته (بازارهای رسمی کامکس و لندن بسته‌اند)';
  } else if (weekpart === 'FRIDAY_LATE_ROLL') {
    weekpartSummaryEn = 'Friday Late Roll & Book Squaring';
    weekpartSummaryFa = 'تسویه پایانی جمعه و بستن موقعیت‌ها';
  } else if (weekpart === 'SUNDAY_OPEN_RISK') {
    weekpartSummaryEn = 'Sunday Reopening & Asian Gap Risk';
    weekpartSummaryFa = 'بازگشایی یکشنبه و ریسک شکاف قیمتی آسیا';
  }

  return {
    barTimeSec: timestampSec,
    barTimestampIso: evaluatedAtIso,
    weekpart,
    sessionId,
    intradaySession: sessionId,
    isFuturesClosed,
    isThinLiquidity: isThinLiquiditySubSession,
    isThinLiquiditySubSession,
    sessionNameEn: sessionSummaryEn,
    sessionNameFa: sessionSummaryFa,
    sessionNotesEn: sessionSummaryEn,
    sessionNotesFa: sessionSummaryFa,
    sessionSummaryEn,
    sessionSummaryFa,
    weekpartSummaryEn,
    weekpartSummaryFa,
    hourUtc: hours,
    dayOfWeekUtc: dayOfWeek,
    utcHourDecimal,
    evaluatedAtIso,
    seasonalCalendar: {
      isTurnOfYearHolidayWindow,
      isTurnOfMonth,
      isHolidayWeek: isTurnOfYearHolidayWindow,
      seasonalLiquidityPenalty,
      summaryEn: seasonalSummaryEn,
      summaryFa: seasonalSummaryFa,
      notesEn: seasonalSummaryEn,
      notesFa: seasonalSummaryFa,
      activeEvents: [
        ...(isTurnOfYearHolidayWindow ? (['TURN_OF_YEAR_HOLIDAY'] as const) : []),
        ...(isTurnOfMonth ? (['TURN_OF_MONTH'] as const) : []),
        ...((!isTurnOfYearHolidayWindow && !isTurnOfMonth) ? (['NORMAL_TRADING_DAY'] as const) : []),
      ],
    },
  };
}
