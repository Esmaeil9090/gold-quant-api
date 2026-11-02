/**
 * GDF — TRADING CALENDAR, SESSION STRUCTURE & MARKET REGIME SERVICE
 *
 * Provides deterministic, real-market session recognition and calendar reasoning
 * for gold (COMEX / London Bullion / Pax Gold):
 *  - Weekparts: WEEKDAY_FULL_AUCTION, WEEKEND_THIN, FRIDAY_LATE_ROLL, SUNDAY_OPEN_RISK
 *  - Intraday sessions: ASIA, LONDON, NEW_YORK, LONDON_NY_OVERLAP, PACIFIC_QUIET
 *  - Turn-of-month, Turn-of-year holiday weeks, and Verified Scheduled Macro Windows
 *  - News transmission analysis (Safe Haven vs Risk-off Liquidation)
 *  - STRICT_REAL_DATA_ONLY compliant: zero synthetic candles, zero invented headlines
 */

import {
  FaultType,
  type Candle,
  type ForecastFaultCode,
  type ForecastFaultRecord,
  type ForecastFaultType,
  type IntradaySessionId,
  type MarketAwarenessState,
  type NewsTransmissionAnalysis,
  type NewsTransmissionMode,
  type RecommendedAnchorPolicy,
  type RecommendedBandPolicy,
  type RecommendedDriftPolicy,
  type SeasonalCalendarContext,
  type SeasonalCalendarEvent,
  type TradingCalendarSessionContext,
  type VerifiedMacroNewsItem,
  type VerifiedMacroYieldResult,
  type WeekpartType,
} from '../contracts/quantContracts.js';

/**
 * Computes deterministic trading calendar session context for a given UTC timestamp.
 * Aligned with COMEX gold futures and London Bullion Market Association (LBMA) standards.
 */
export function computeTradingCalendarSessionContext(
  barTimeSec: number
): TradingCalendarSessionContext {
  const d = new Date(barTimeSec * 1000);
  const hourUtc = d.getUTCHours();
  const minuteUtc = d.getUTCMinutes();
  const dayOfWeekUtc = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hourFraction = hourUtc + minuteUtc / 60;

  // 1. Determine Weekpart
  let weekpart: WeekpartType = 'WEEKDAY_FULL_AUCTION';
  let isFuturesClosed = false;

  if (dayOfWeekUtc === 5) {
    // Friday
    if (hourFraction >= 22.0) {
      weekpart = 'WEEKEND_THIN';
      isFuturesClosed = true;
    } else if (hourFraction >= 19.0) {
      weekpart = 'FRIDAY_LATE_ROLL';
      isFuturesClosed = false;
    }
  } else if (dayOfWeekUtc === 6) {
    // Saturday: futures completely closed
    weekpart = 'WEEKEND_THIN';
    isFuturesClosed = true;
  } else if (dayOfWeekUtc === 0) {
    // Sunday
    if (hourFraction < 22.0) {
      weekpart = 'WEEKEND_THIN';
      isFuturesClosed = true;
    } else {
      weekpart = 'SUNDAY_OPEN_RISK';
      isFuturesClosed = false; // Asian futures re-open around 22:00-23:00 UTC
    }
  } else if (dayOfWeekUtc === 1 && hourFraction < 1.0) {
    // Monday early Asian open transition
    weekpart = 'SUNDAY_OPEN_RISK';
    isFuturesClosed = false;
  }

  // 2. Determine Intraday Session
  let intradaySession: IntradaySessionId = 'ASIA';
  let isThinLiquidity = isFuturesClosed;

  if (hourFraction >= 12.0 && hourFraction < 16.0) {
    intradaySession = 'LONDON_NY_OVERLAP';
    isThinLiquidity = isFuturesClosed ? true : false;
  } else if (hourFraction >= 7.0 && hourFraction < 12.0) {
    intradaySession = 'LONDON';
    isThinLiquidity = isFuturesClosed ? true : false;
  } else if (hourFraction >= 16.0 && hourFraction < 21.0) {
    intradaySession = 'NEW_YORK';
    isThinLiquidity = isFuturesClosed ? true : false;
  } else if (hourFraction >= 21.0 && hourFraction < 24.0) {
    intradaySession = 'PACIFIC_QUIET';
    isThinLiquidity = true;
  } else {
    // 00:00 to 07:00 UTC
    intradaySession = 'ASIA';
    // 06:00 to 07:00 UTC is thin pre-London transition
    if (hourFraction >= 6.0 && hourFraction < 7.0) {
      isThinLiquidity = true;
    }
  }

  // Session Names and Descriptive Notes
  let sessionNameEn = 'Weekday Full Auction';
  let sessionNameFa = 'حراج پیوسته روز کاری';
  let sessionNotesEn = 'Active primary gold futures and spot auction.';
  let sessionNotesFa = 'حراج فعال قراردادهای آتی و اسپات طلا.';

  if (weekpart === 'WEEKEND_THIN') {
    sessionNameEn = 'Weekend Thin Liquidity (Futures Closed)';
    sessionNameFa = 'نقدینگی پایین آخر هفته (بازار آتی بسته)';
    sessionNotesEn =
      'COMEX/LBMA closed. Crypto spot gold (PAXG) trades with wide spreads and low book depth; directional trending assumptions invalid.';
    sessionNotesFa =
      'بازارهای رسمی کامکس و لندن بسته‌اند. طلای توکنیزه با اسپرد عریض و عمق کم معامله می‌شود؛ فرض روندهای تند فاقد اعتبار است.';
  } else if (weekpart === 'FRIDAY_LATE_ROLL') {
    sessionNameEn = 'Friday Late Roll & Liquidation';
    sessionNameFa = 'تسویه و رول پیش از تعطیلات جمعه';
    sessionNotesEn =
      'Pre-weekend book squaring and margin adjustments; elevated liquidity withdrawal.';
    sessionNotesFa =
      'بستن موقعیت‌ها و تنظیم مارجین پیش از تعطیلات آخر هفته؛ کاهش عمق دفاتر سفارش.';
  } else if (weekpart === 'SUNDAY_OPEN_RISK') {
    sessionNameEn = 'Sunday Reopening & Gap Risk';
    sessionNameFa = 'بازگشایی یکشنبه و ریسک شکاف قیمتی';
    sessionNotesEn =
      'Initial Asian liquidity absorption; susceptible to weekend headline gaps.';
    sessionNotesFa =
      'جذب اولیه نقدینگی در آسیا؛ حساس به شکاف‌های قیمتی ناشی از اخبار آخر هفته.';
  } else {
    switch (intradaySession) {
      case 'LONDON_NY_OVERLAP':
        sessionNameEn = 'London / New York Peak Overlap';
        sessionNameFa = 'تلاقی اوج لندن و نیویورک';
        sessionNotesEn = 'Maximum global depth and lowest bid-ask spread; COMEX pit active.';
        sessionNotesFa = 'بیشترین عمق نقدینگی و کمترین اسپرد؛ اوج معاملات بازار کامکس.';
        break;
      case 'LONDON':
        sessionNameEn = 'London Bullion Auction (LBMA)';
        sessionNameFa = 'حراج شمش لندن (LBMA)';
        sessionNotesEn =
          'Institutional bullion benchmarking; morning fix at 10:30 UTC, afternoon at 15:00 UTC.';
        sessionNotesFa =
          'بهای مرجع شمش بین‌المللی؛ تعیین نرخ ساعت ۱۰:۳۰ و ۱۵:۰۰ به وقت گرینویچ.';
        break;
      case 'NEW_YORK':
        sessionNameEn = 'New York Afternoon Session';
        sessionNameFa = 'نشست عصرگاهی نیویورک';
        sessionNotesEn = 'US institutional flow after London close; volatility tapering into settlement.';
        sessionNotesFa = 'جریان نهادی آمریکا پس از بسته شدن لندن؛ کاهش نوسان تا تسویه نهایی.';
        break;
      case 'ASIA':
        sessionNameEn = 'Tokyo / Hong Kong / Shanghai Asian Session';
        sessionNameFa = 'نشست آسیایی (توکیو، هنگ‌کنگ، شانگهای)';
        sessionNotesEn = 'Physical premium and regional demand drivers; steady baseline flows.';
        sessionNotesFa = 'تقاضای فیزیکی و محرک‌های منطقه‌ای؛ جریان‌های پایدار پایه.';
        break;
      case 'PACIFIC_QUIET':
        sessionNameEn = 'Pacific Inter-Session Transition';
        sessionNameFa = 'گذار کم‌حجم اقیانوس آرام';
        sessionNotesEn = 'Thin inter-market transition between US close and Asian open.';
        sessionNotesFa = 'گذار کم‌حجم میان بسته شدن بازار آمریکا و بازگشایی آسیا.';
        break;
    }
  }

  return {
    barTimeSec,
    barTimestampIso: d.toISOString(),
    weekpart,
    intradaySession,
    isFuturesClosed,
    isThinLiquidity,
    sessionNameEn,
    sessionNameFa,
    sessionNotesEn,
    sessionNotesFa,
    hourUtc,
    dayOfWeekUtc,
  };
}

/**
 * Evaluates seasonal calendar context (turn-of-year, turn-of-month, and verified scheduled macro windows).
 * Strictly grounded in real timestamps without fabricated calendar events.
 */
export function computeSeasonalCalendarContext(params: {
  barTimeSec: number;
  macroNews?: VerifiedMacroNewsItem[];
}): SeasonalCalendarContext {
  const { barTimeSec, macroNews = [] } = params;
  const d = new Date(barTimeSec * 1000);
  const month = d.getUTCMonth(); // 0 = Jan, 11 = Dec
  const day = d.getUTCDate();
  const activeEvents: SeasonalCalendarEvent[] = [];

  // 1. Turn-of-Year Holiday Window: Dec 20 to Jan 5
  const isHolidayWeek = (month === 11 && day >= 20) || (month === 0 && day <= 5);
  if (isHolidayWeek) {
    activeEvents.push('TURN_OF_YEAR_HOLIDAY');
  }

  // 2. Turn-of-Month: Last 2 calendar days of month or first 2 calendar days of next month
  // Get days in current month
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const isTurnOfMonth = day >= daysInMonth - 1 || day <= 2;
  if (isTurnOfMonth) {
    activeEvents.push('TURN_OF_MONTH');
  }

  // 3. Verified Scheduled Macro Windows: within +/- 90 minutes of verified macro event
  let macroScheduledWindowActive = false;
  let activeMacroTitle: string | null = null;

  for (const item of macroNews) {
    if (typeof item.timestamp === 'number') {
      const itemSec = item.timestamp > 1e11 ? Math.floor(item.timestamp / 1000) : item.timestamp;
      const deltaSec = Math.abs(barTimeSec - itemSec);
      if (deltaSec <= 5400) {
        // 90 minutes window
        macroScheduledWindowActive = true;
        activeMacroTitle = item.title;
        break;
      }
    }
  }

  if (macroScheduledWindowActive) {
    activeEvents.push('VERIFIED_MACRO_SCHEDULED_WINDOW');
  }

  if (activeEvents.length === 0) {
    activeEvents.push('NORMAL_TRADING_DAY');
  }

  let notesEn = 'Standard trading calendar conditions.';
  let notesFa = 'شرایط تقویمی معاملاتی استاندارد.';

  if (isHolidayWeek) {
    notesEn = 'Turn-of-year holiday book-squaring period; institutional desks closed, reduced depth.';
    notesFa = 'دوره تعطیلات سال نو؛ بسته بودن دفاتر نهادی و کاهش عمق نقدینگی.';
  } else if (macroScheduledWindowActive) {
    notesEn = `Active verified macro event window (${activeMacroTitle || 'Economic Release'}); elevated innovation variance.`;
    notesFa = `پنجره رویداد کلان اقتصادی تایید شده؛ افزایش واریانس و شوک‌های اطلاعاتی.`;
  } else if (isTurnOfMonth) {
    notesEn = 'Turn-of-month portfolio rebalancing window; benchmark flow adjustments.';
    notesFa = 'پنجره بازتنظیم ماهانه پرتفوی نهادی؛ جابجایی‌های دوره‌ای شاخص.';
  }

  return {
    activeEvents,
    isHolidayWeek,
    isTurnOfMonth,
    macroScheduledWindowActive,
    notesEn,
    notesFa,
  };
}

/**
 * Distinguishes Safe-Haven demand vs Risk-Off Liquidation / Dollar-Yield shock bias.
 */
export function analyzeNewsTransmission(params: {
  candles: Candle[];
  liveMacro: VerifiedMacroYieldResult;
  macroNews?: VerifiedMacroNewsItem[];
  basisZScore: number;
}): NewsTransmissionAnalysis {
  const { candles, liveMacro, macroNews = [], basisZScore } = params;
  const n = candles.length;
  if (n < 2) {
    return {
      mode: 'UNKNOWN',
      observedPriceChangeUsd: 0,
      macroSurpriseDirection: 'NEUTRAL',
      rationaleEn: 'Insufficient candle history for news transmission analysis.',
      rationaleFa: 'داده‌های ناکافی برای تحلیل انتقال اثر اخبار.',
    };
  }

  const latestClose = candles[n - 1].close;
  const lookbackClose = candles[Math.max(0, n - 4)].close;
  const observedPriceChangeUsd = parseFloat((latestClose - lookbackClose).toFixed(2));

  // Find nearest recent news item if available
  const latestBarTime = candles[n - 1].time;
  let activeNewsItem: VerifiedMacroNewsItem | null = null;
  for (const item of macroNews) {
    if (typeof item.timestamp === 'number') {
      const itemSec = item.timestamp > 1e11 ? Math.floor(item.timestamp / 1000) : item.timestamp;
      if (Math.abs(latestBarTime - itemSec) <= 10800) {
        activeNewsItem = item;
        break;
      }
    }
  }

  // Evaluate transmission mode
  // Macro shock reality: If real yields or dollar surge sharply or margin liquidations occur,
  // gold drops despite "geopolitical or headline turmoil" (Risk-off liquidation).
  // If price dropped while real yields rose (or basis spread turned negative), it is Risk-Off Liquidation.
  const realYieldRising = liveMacro.tipsRealYield10Y > 1.85 || liveMacro.dxyIndex > 105.0;
  const priceDropping = observedPriceChangeUsd < -3.0;

  if (priceDropping && (realYieldRising || basisZScore < -1.0)) {
    return {
      mode: 'RISK_OFF_LIQUIDATION',
      observedPriceChangeUsd,
      macroSurpriseDirection: 'NEGATIVE',
      activeNewsItemTitle: activeNewsItem?.title || null,
      rationaleEn:
        'Real yields / USD surge or margin deleveraging overrides naive safe-haven bid, inducing gold liquidation.',
      rationaleFa:
        'جهش بازدهی واقعی اوراق/دلار یا نقد کردن اضطراری دارایی‌ها، تقاضای سنتی پناهگاه امن را لغو کرده و افت طلا را رقم زده است.',
    };
  }

  if (observedPriceChangeUsd > 3.0 && (!realYieldRising || liveMacro.tipsRealYield10Y < 1.7)) {
    return {
      mode: 'SAFE_HAVEN',
      observedPriceChangeUsd,
      macroSurpriseDirection: 'POSITIVE',
      activeNewsItemTitle: activeNewsItem?.title || null,
      rationaleEn:
        'Genuine monetary debasement hedge or safe-haven inflow verified by positive price transmission.',
      rationaleFa:
        'ورود نقدینگی پناهگاه امن در جهت پوشش کاهش ارزش پول ملی توسط رفتار قیمت تایید شد.',
    };
  }

  return {
    mode: 'UNKNOWN',
    observedPriceChangeUsd,
    macroSurpriseDirection: 'NEUTRAL',
    activeNewsItemTitle: activeNewsItem?.title || null,
    rationaleEn:
      'Balanced or ambiguous news transmission; no structural liquidation or safe-haven asymmetry identified.',
    rationaleFa:
      'انتقال متوازن یا خنثی اثر اخبار؛ عدم مشاهده عدم‌تقارن در نقد کردن یا پناهگاه امن.',
  };
}

/**
 * Master Market Awareness Reasoning:
 * Detects the 7 forecast faults, formulates recommended policies (drift, band, anchor),
 * and enforces structural consistency across trading sessions and calendar regimes.
 */
export function evaluateMarketAwareness(params: {
  candles: Candle[];
  livePredictions: number[];
  realizedChanges: number[];
  latestResidualSigma: number;
  liveMacro: VerifiedMacroYieldResult;
  macroNews?: VerifiedMacroNewsItem[];
  basisZScore: number;
  garchVolRatio: number;
  currentEquilibriumAnchor: number;
  candidateSlope?: number;
  liveSlope?: number;
}): MarketAwarenessState {
  const {
    candles,
    livePredictions,
    realizedChanges,
    latestResidualSigma,
    liveMacro,
    macroNews = [],
    basisZScore,
    garchVolRatio,
    currentEquilibriumAnchor,
    candidateSlope,
    liveSlope,
  } = params;

  const n = candles.length;
  const latestBarTime = n > 0 ? candles[n - 1].time : Math.floor(Date.now() / 1000);
  const currentPrice = n > 0 ? candles[n - 1].close : 2650;

  // 1. Session and Seasonal Context
  const sessionContext = computeTradingCalendarSessionContext(latestBarTime);
  const seasonalCalendar = computeSeasonalCalendarContext({
    barTimeSec: latestBarTime,
    macroNews,
  });
  const newsTransmission = analyzeNewsTransmission({
    candles,
    liveMacro,
    macroNews,
    basisZScore,
  });

  const detectedFaults: ForecastFaultRecord[] = [];
  const nowIso = new Date().toISOString();

  // 2. Fault Detection
  // Recent realized price velocity over last 3 bars
  const recentRealizedDelta =
    n >= 3 ? candles[n - 1].close - candles[n - 3].close : 0;
  const recentLivePredDelta =
    livePredictions.length >= 3
      ? livePredictions[livePredictions.length - 1] - livePredictions[livePredictions.length - 3]
      : 0;

  // Fault 1: WRONG_DIRECTION
  // Live model predicted upward movement when price suffered a large downward shock, or vice versa
  const directionalContradiction =
    (recentLivePredDelta > 1.5 && recentRealizedDelta < -2.5) ||
    (recentLivePredDelta < -1.5 && recentRealizedDelta > 2.5) ||
    (latestResidualSigma < -2.0 && recentLivePredDelta > 0.5) ||
    (latestResidualSigma > 2.0 && recentLivePredDelta < -0.5);

  if (directionalContradiction) {
    const descEn = `Live model predicted ${recentLivePredDelta >= 0 ? 'bullish' : 'bearish'} trajectory (${recentLivePredDelta >= 0 ? '+' : ''}${recentLivePredDelta.toFixed(2)} USD), but realized price moved opposite (${recentRealizedDelta >= 0 ? '+' : ''}${recentRealizedDelta.toFixed(2)} USD, residual σ=${latestResidualSigma.toFixed(2)}).`;
    const descFa = `مدل زنده مسیر ${recentLivePredDelta >= 0 ? 'صعودی' : 'نزولی'} پیش‌بینی کرده بود، اما حرکت واقعی در جهت مخالف رقم خورد (پسماند ${latestResidualSigma.toFixed(2)}σ).`;
    detectedFaults.push({
      code: 'WRONG_DIRECTION',
      faultType: 'WRONG_DIRECTION',
      severity: Math.abs(latestResidualSigma) > 2.5 ? 'CRITICAL' : 'WARNING',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `RealizedMove=${recentRealizedDelta.toFixed(2)} USD | LivePredMove=${recentLivePredDelta.toFixed(2)} USD | ResSigma=${latestResidualSigma.toFixed(2)}σ`,
      recommendedAction: 'SHOCK_RESET_DRIFT',
      metricValue: `${latestResidualSigma.toFixed(2)}σ`,
      threshold: '±2.00σ',
      observedAtIso: nowIso,
    });
  }

  // Fault 2: OVERCONFIDENT_TREND
  // Tight uncertainty bounds during shock or regime transition
  const isOverconfident =
    (Math.abs(latestResidualSigma) > 1.8 || garchVolRatio > 1.45) &&
    sessionContext.isThinLiquidity;

  if (isOverconfident) {
    const descEn = `Model projects continuous confidence into thin liquidity / elevated volatility (GARCH ratio=${garchVolRatio.toFixed(2)}, residual σ=${latestResidualSigma.toFixed(2)}).`;
    const descFa = `مدل در شرایط نقدینگی نازک یا جهش نوسان اقدام به پیش‌بینی با ضریب اطمینان بیش از حد کرده است.`;
    detectedFaults.push({
      code: 'OVERCONFIDENT_TREND',
      faultType: 'OVERCONFIDENT_TREND',
      severity: 'WARNING',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `GARCH=${garchVolRatio.toFixed(2)} | Res=${latestResidualSigma.toFixed(2)}σ | ThinLiquidity=${sessionContext.isThinLiquidity}`,
      recommendedAction: 'WIDEN_UNCERTAINTY_BANDS',
      metricValue: `GARCH=${garchVolRatio.toFixed(2)}, Res=${latestResidualSigma.toFixed(2)}σ`,
      threshold: 'Res > 1.8σ in thin session',
      observedAtIso: nowIso,
    });
  }

  // Fault 3: STALE_DRIFT
  // Drift persistence x2 continues forward projection across a shock or regime break
  const isStaleDrift =
    Math.abs(latestResidualSigma) > 2.0 && Math.abs(recentLivePredDelta) > 1.0;

  if (isStaleDrift) {
    const descEn = `Pre-shock drift persists across a ${latestResidualSigma.toFixed(2)}σ innovation without adaptive dampening.`;
    const descFa = `رانش پیش از شوک با وجود شوک ${latestResidualSigma.toFixed(2)}σ بدون میرایی تطبیقی تداوم یافته است.`;
    detectedFaults.push({
      code: 'STALE_DRIFT',
      faultType: 'STALE_DRIFT',
      severity: 'WARNING',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `ShockResidual=${latestResidualSigma.toFixed(2)}σ | DriftVelocity=${recentLivePredDelta.toFixed(2)} USD`,
      recommendedAction: 'SHOCK_RESET_DRIFT',
      metricValue: `${latestResidualSigma.toFixed(2)}σ`,
      threshold: '2.00σ',
      observedAtIso: nowIso,
    });
  }

  // Fault 4: EQUILIBRIUM_ANCHOR_MISMATCH
  // Equilibrium anchor dislocated from post-shock realized price
  const anchorDislocationUsd = Math.abs(currentPrice - currentEquilibriumAnchor);
  if (anchorDislocationUsd > 18.0) {
    const descEn = `Equilibrium anchor ($${currentEquilibriumAnchor.toFixed(2)}) is dislocated from current market price ($${currentPrice.toFixed(2)}) by $${anchorDislocationUsd.toFixed(2)}, exerting an artificial gravitational pull.`;
    const descFa = `جاذب تعادلی ($${currentEquilibriumAnchor.toFixed(2)}) با قیمت جاری بازار ($${currentPrice.toFixed(2)}) اختلاف $${anchorDislocationUsd.toFixed(2)} دارد و کشش غیرواقعی اعمال می‌کند.`;
    detectedFaults.push({
      code: 'EQUILIBRIUM_ANCHOR_MISMATCH',
      faultType: 'EQUILIBRIUM_ANCHOR_MISMATCH',
      severity: anchorDislocationUsd > 35.0 ? 'CRITICAL' : 'WARNING',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `Anchor=$${currentEquilibriumAnchor.toFixed(2)} vs Spot=$${currentPrice.toFixed(2)} (Gap=$${anchorDislocationUsd.toFixed(2)})`,
      recommendedAction: 'RECENTER_EQUILIBRIUM_ANCHOR',
      metricValue: `$${anchorDislocationUsd.toFixed(2)}`,
      threshold: '$18.00',
      observedAtIso: nowIso,
    });
  }

  // Fault 5: CANDIDATE_COLLINEAR_WITH_LIVE_ERROR
  // Candidate architecture mirrors the live line's wrong direction slope
  if (
    directionalContradiction &&
    typeof candidateSlope === 'number' &&
    typeof liveSlope === 'number' &&
    Math.sign(candidateSlope) === Math.sign(liveSlope) &&
    Math.abs(candidateSlope) > 0.05
  ) {
    const descEn = `Candidate architecture mirrors the live model's incorrect slope (${candidateSlope >= 0 ? '+' : ''}${candidateSlope.toFixed(3)} vs live ${liveSlope >= 0 ? '+' : ''}${liveSlope.toFixed(3)}) instead of generating an orthogonal shock-absorbing candidate.`;
    const descFa = `معماری کاندید شیب خطای مدل زنده را تکرار می‌کند و فرضیه متعامد یا جاذب شوک ارائه نداده است.`;
    detectedFaults.push({
      code: 'CANDIDATE_COLLINEAR_WITH_LIVE_ERROR',
      faultType: 'CANDIDATE_COLLINEAR_WITH_LIVE_ERROR',
      severity: 'CRITICAL',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `LiveSlope=${liveSlope.toFixed(3)} USD/step | CandSlope=${candidateSlope.toFixed(3)} USD/step`,
      recommendedAction: 'PROPOSE_POST_SHOCK_CANDIDATE',
      metricValue: `SignMatch: ${candidateSlope.toFixed(3)} vs ${liveSlope.toFixed(3)}`,
      threshold: 'Collinear with active error',
      observedAtIso: nowIso,
    });
  }

  // Fault 6: SESSION_REGIME_VIOLATION
  // Trending continuous-auction dynamics projected into closed futures or thin weekend
  const hasTrendingPlumeInThinSession =
    sessionContext.isFuturesClosed && Math.abs(recentLivePredDelta) > 1.2;

  if (hasTrendingPlumeInThinSession) {
    const descEn = `Model asserts active trending drift (${recentLivePredDelta >= 0 ? '+' : ''}${recentLivePredDelta.toFixed(2)} USD) during ${sessionContext.weekpart} when COMEX/LBMA futures are closed.`;
    const descFa = `مدل در زمان بسته بودن بازارهای آتی (${sessionContext.weekpart}) پیش‌بینی رونددار و پرتحرک ارائه کرده است.`;
    detectedFaults.push({
      code: 'SESSION_REGIME_VIOLATION',
      faultType: 'SESSION_REGIME_VIOLATION',
      severity: 'CRITICAL',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `Weekpart=${sessionContext.weekpart} | FuturesClosed=true | Drift=${recentLivePredDelta.toFixed(2)} USD`,
      recommendedAction: 'CLAMP_SESSION_DRIFT',
      metricValue: `Drift=${recentLivePredDelta.toFixed(2)} USD`,
      threshold: 'Zero drift required in closed futures',
      observedAtIso: nowIso,
    });
  }

  // Fault 7: NEWS_TRANSMISSION_MISMATCH
  if (
    newsTransmission.mode === 'RISK_OFF_LIQUIDATION' &&
    recentLivePredDelta > 0.5
  ) {
    const descEn = `Model naively assumes safe-haven drift while dollar/yield surges or margin liquidations drive gold downward (${newsTransmission.observedPriceChangeUsd.toFixed(2)} USD).`;
    const descFa = `مدل با فرض خوش‌بینانه پناهگاه امن رانش صعودی لحاظ کرده، در حالی که شوک بازدهی/دلار یا لیکوئیدیشن‌ها بازار را نزولی کرده است.`;
    detectedFaults.push({
      code: 'NEWS_TRANSMISSION_MISMATCH',
      faultType: 'NEWS_TRANSMISSION_MISMATCH',
      severity: 'WARNING',
      summaryEn: descEn,
      summaryFa: descFa,
      descriptionEn: descEn,
      descriptionFa: descFa,
      empiricalEvidence: `Mode=RISK_OFF_LIQUIDATION | RealizedDelta=${newsTransmission.observedPriceChangeUsd.toFixed(2)} USD | LivePredMove=${recentLivePredDelta.toFixed(2)} USD`,
      recommendedAction: 'EXPLORE_OPPOSITE_NEWS_TRANSMISSION',
      metricValue: `${newsTransmission.observedPriceChangeUsd.toFixed(2)} USD`,
      threshold: 'Risk-off liquidation regime',
      observedAtIso: nowIso,
    });
  }

  // 3. Derive Policies to Enforce
  let recommendedDriftPolicy: RecommendedDriftPolicy = 'UNCHANGED';
  let recommendedBandPolicy: RecommendedBandPolicy = 'NORMAL';
  let recommendedAnchorPolicy: RecommendedAnchorPolicy = 'UNCHANGED';
  let uncertaintyBandMultiplier = 1.0;

  // Rule A: Weekend / Closed Futures -> ZERO_FOR_SESSION
  if (sessionContext.isFuturesClosed || sessionContext.weekpart === 'WEEKEND_THIN') {
    recommendedDriftPolicy = 'ZERO_FOR_SESSION';
    recommendedBandPolicy = 'NORMAL';
    recommendedAnchorPolicy = 'RECENTER_TO_POST_SHOCK';
  }
  // Rule B: Large Shock / Wrong Direction -> SHOCK_RESET & WIDEN & RECENTER
  else if (
    directionalContradiction ||
    Math.abs(latestResidualSigma) > 2.0 ||
    isStaleDrift
  ) {
    recommendedDriftPolicy = 'SHOCK_RESET';
    recommendedBandPolicy = 'WIDEN';
    recommendedAnchorPolicy = 'RECENTER_TO_POST_SHOCK';
    uncertaintyBandMultiplier = 1.65;
  }
  // Rule C: Overconfident Trend or Thin Liquidity
  else if (isOverconfident || sessionContext.isThinLiquidity) {
    recommendedDriftPolicy = 'SHRINK';
    recommendedBandPolicy = 'WIDEN';
    uncertaintyBandMultiplier = 1.35;
  }
  // Rule D: Anchor Dislocation
  else if (anchorDislocationUsd > 18.0) {
    recommendedAnchorPolicy = 'RECENTER_TO_POST_SHOCK';
  }

  // Generate Bilingual Executive Summary
  let summaryEn = `Active Session: [${sessionContext.sessionNameEn}] | Drift Policy: ${recommendedDriftPolicy} | Band Policy: ${recommendedBandPolicy} (${uncertaintyBandMultiplier.toFixed(2)}x) | Faults Detected: ${detectedFaults.length}.`;
  let summaryFa = `نشست فعال: [${sessionContext.sessionNameFa}] | سیاست رانش: ${recommendedDriftPolicy} | سیاست باند: ${recommendedBandPolicy} (${uncertaintyBandMultiplier.toFixed(2)}x) | خطاهای شناسایی‌شده: ${detectedFaults.length}.`;

  if (detectedFaults.length > 0) {
    const topFault = detectedFaults[0];
    summaryEn += ` Primary Warning: ${topFault.faultType} (${topFault.metricValue}).`;
    summaryFa += ` هشدار اصلی: ${topFault.faultType} (${topFault.metricValue}).`;
  }

  const activeFaultCodes: ForecastFaultCode[] = detectedFaults
    .map(f => (f.code ?? f.faultType) as ForecastFaultCode | undefined)
    .filter((c): c is ForecastFaultCode => Boolean(c));
  const activeFaultTypes: FaultType[] = activeFaultCodes.map(c => c as FaultType);
  const resolvedSessionId = sessionContext.sessionId ?? sessionContext.intradaySession ?? 'ASIA';
  const resolvedThinSubSession = Boolean(
    sessionContext.isThinLiquiditySubSession ?? sessionContext.isThinLiquidity
  );

  return {
    timestampIso: nowIso,
    evaluatedAtIso: nowIso,
    barTimeSec: latestBarTime,
    timestampSec: latestBarTime,
    sessionRegime: {
      weekpart: sessionContext.weekpart,
      sessionId: resolvedSessionId,
      isFuturesClosed: sessionContext.isFuturesClosed,
      isThinLiquiditySubSession: resolvedThinSubSession,
      isTurnOfMonth: Boolean(seasonalCalendar.isTurnOfMonth),
      isTurnOfYearHolidayWindow: Boolean(
        seasonalCalendar.isTurnOfYearHolidayWindow ?? seasonalCalendar.isHolidayWeek
      ),
      seasonalLiquidityPenalty: seasonalCalendar.seasonalLiquidityPenalty ?? 0,
    },
    weekpart: sessionContext.weekpart,
    sessionId: resolvedSessionId,
    isThinLiquiditySubSession: resolvedThinSubSession,
    sessionContext,
    sessionCalendar: sessionContext,
    seasonalCalendar,
    newsTransmission,
    newsTransmissionMode: newsTransmission.mode,
    detectedFaults,
    activeFaults: detectedFaults,
    activeFaultCodes,
    activeFaultTypes,
    recommendedPolicies: {
      driftPolicy: recommendedDriftPolicy,
      bandPolicy: recommendedBandPolicy,
      anchorPolicy: recommendedAnchorPolicy,
    },
    recommendedDriftPolicy,
    recommendedBandPolicy,
    recommendedAnchorPolicy,
    uncertaintyBandMultiplier,
    blockAutoPromotionDueToFaults: detectedFaults.some(
      f =>
        f.severity === 'CRITICAL' ||
        f.faultType === FaultType.WRONG_DIRECTION ||
        f.faultType === FaultType.SESSION_REGIME_VIOLATION ||
        f.faultType === FaultType.CANDIDATE_COLLINEAR_WITH_LIVE_ERROR
    ),
    candidateObligations: {
      proposeWeekendSidewaysCandidate:
        sessionContext.isFuturesClosed || sessionContext.weekpart === 'WEEKEND_THIN',
      proposePostShockAbsorptionCandidate:
        activeFaultCodes.includes(FaultType.STALE_DRIFT) ||
        activeFaultCodes.includes(FaultType.WRONG_DIRECTION) ||
        activeFaultCodes.includes(FaultType.EQUILIBRIUM_ANCHOR_MISMATCH),
      avoidCollinearWrongDirectionClone:
        activeFaultCodes.includes(FaultType.CANDIDATE_COLLINEAR_WITH_LIVE_ERROR) ||
        activeFaultCodes.includes(FaultType.WRONG_DIRECTION),
      exploreOppositeNewsTransmission: activeFaultCodes.includes(
        FaultType.NEWS_TRANSMISSION_MISMATCH
      ),
    },
    summaryEn,
    summaryFa,
  };
}
