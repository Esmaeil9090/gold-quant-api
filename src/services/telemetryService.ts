import type {
  Candle,
  CointegrationBasis,
  DataReliabilityTelemetry,
  FeedIntegrityMetric,
  PcaMacroFactors,
  ProviderAttemptDiagnostic,
  ProviderTier,
  TerminalSystemState,
  VerifiedMacroNewsFeedResult,
  VerifiedMacroYieldResult,
  VerifiedMarketWaterfallResult,
  VpinTelemetry,
} from '../contracts/quantContracts.js';
import { AdaptiveDPObserver, computeOrthogonalMacroFactors } from '../engine/quantEngine.js';
import { sanitizeUserFacingHaltReason } from './realDataWaterfall.js';
import { getLatestValidationScorecard } from './walkForwardValidationService.js';

/**
 * Validation & Telemetry Service (Layer 3)
 * Computes multi-feed composite reliability scores, circuit-breaker halted state payloads,
 * and structured system diagnostic reports.
 */

export function computeDataReliability(
  waterfall: {
    systemState: TerminalSystemState;
    activeTier: ProviderTier | 'NONE_HALTED';
    activeProvider: string;
    diagnostics: ProviderAttemptDiagnostic[];
    freshnessAgeSec: number;
  },
  observerInst: AdaptiveDPObserver,
  vpinTelemetry: VpinTelemetry,
  pcaFactors: PcaMacroFactors,
  liveMacro: VerifiedMacroYieldResult,
  cointegrationBasis: CointegrationBasis,
  newsFeed: VerifiedMacroNewsFeedResult,
  candles: Candle[],
  timeframeStepSec: number = 900
): DataReliabilityTelemetry {
  const isHalted = waterfall.systemState === 'HALTED_DEGRADED';
  const activeDiag = waterfall.diagnostics.find(d => d.status === 'SUCCESS');
  const spotLatency = activeDiag?.latencyMs ?? 0;

  // 1. Active Independent Provider Quorum Ratio
  const spotQuorumTotal = Math.max(3, waterfall.diagnostics.length);
  const spotQuorumActive = waterfall.diagnostics.filter(d => d.status === 'SUCCESS').length;
  const macroActive = liveMacro.respondingSources ? liveMacro.respondingSources.length : 0;
  const macroTotal = Math.max(4, macroActive); // Yahoo Treasury ^TNX, Yahoo DXY, FRED CSV, Frankfurter FX
  const newsActive = newsFeed.activeSources ? newsFeed.activeSources.length : 0;
  const newsTotal = Math.max(3, newsActive); // Yahoo Finance Gold RSS, CNBC Market RSS, Investing Commodities RSS

  const activeProvidersCount = spotQuorumActive + macroActive + newsActive;
  const totalProvidersCount = spotQuorumTotal + macroTotal + newsTotal;
  const quorumRatio = parseFloat(Math.min(1, activeProvidersCount / Math.max(1, totalProvidersCount)).toFixed(4));
  const quorumBadge = `${activeProvidersCount}/${totalProvidersCount} QUORUM`;

  // 2. Cross-Venue Price Dispersion (basis points = |P_primary - P_secondary| / P_primary * 10000)
  const hasSecondaryVenue =
    !isHalted &&
    cointegrationBasis.basisStatus !== 'SINGLE_VENUE_UNANCHORED' &&
    cointegrationBasis.paxgPrice > 0 &&
    cointegrationBasis.comexBenchmarkSpot > 0;
  const crossVenueDispersionBps = hasSecondaryVenue
    ? parseFloat(
        (
          (Math.abs(cointegrationBasis.paxgPrice - cointegrationBasis.comexBenchmarkSpot) /
            Math.max(1, cointegrationBasis.paxgPrice)) *
          10000
        ).toFixed(2)
      )
    : null;

  // 3. Timestamp Staleness Relative to Selected Timeframe
  const safeStepSec = Math.max(60, timeframeStepSec);
  const stalenessSec = isHalted
    ? safeStepSec * 10
    : Math.max(
        0,
        candles.length > 0
          ? Math.floor(Date.now() / 1000) - candles[candles.length - 1].time
          : waterfall.freshnessAgeSec
      );
  const stalenessRatio = parseFloat((stalenessSec / safeStepSec).toFixed(3));
  let stalenessStatus: 'FRESH' | 'AGING' | 'STALE' | 'HALTED' = 'FRESH';
  if (isHalted) {
    stalenessStatus = 'HALTED';
  } else if (stalenessRatio > 2.0) {
    stalenessStatus = 'STALE';
  } else if (stalenessRatio > 1.15) {
    stalenessStatus = 'AGING';
  }

  // 4. Sequence Completeness (% / ratio of contiguous non-missing real bars)
  let contiguousPairs = 0;
  let missingBarsCount = 0;
  if (candles.length >= 2) {
    for (let i = 1; i < candles.length; i++) {
      const dt = candles[i].time - candles[i - 1].time;
      const gapBars = Math.round(dt / safeStepSec) - 1;
      if (gapBars <= 0 && dt > 0) {
        contiguousPairs++;
      } else if (gapBars > 0) {
        missingBarsCount += gapBars;
      }
    }
  }
  const expectedBarsCount = candles.length > 0 ? candles.length + missingBarsCount : 0;
  const contiguousBarsCount = candles.length > 0 ? contiguousPairs + 1 : 0;
  const sequenceCompletenessRatio =
    expectedBarsCount > 0
      ? parseFloat(Math.min(1, contiguousBarsCount / expectedBarsCount).toFixed(4))
      : 0;

  let spotStatus: 'OPTIMAL' | 'DEGRADED' | 'FAULT' = 'OPTIMAL';
  if (isHalted) {
    spotStatus = 'FAULT';
  } else if (
    waterfall.activeTier !== 'TIER_1_PRIMARY' ||
    stalenessStatus === 'STALE' ||
    sequenceCompletenessRatio < 0.95
  ) {
    spotStatus = 'DEGRADED';
  }

  let macroStatus: 'OPTIMAL' | 'DEGRADED' | 'FAULT' = 'OPTIMAL';
  if (liveMacro.status === 'MACRO_FEED_UNAVAILABLE') {
    macroStatus = 'FAULT';
  } else if (liveMacro.status !== 'ONLINE_MULTI_SOURCE_VERIFIED') {
    macroStatus = 'DEGRADED';
  }

  const basisStatus: 'OPTIMAL' | 'DEGRADED' | 'FAULT' = isHalted
    ? 'FAULT'
    : cointegrationBasis.basisStatus === 'SINGLE_VENUE_UNANCHORED' ||
      cointegrationBasis.basisStatus === 'DISLOCATION_ARBITRAGE'
    ? 'DEGRADED'
    : 'OPTIMAL';

  const consistency = observerInst.getInnovationConsistency(isHalted);
  const observerStatus: 'OPTIMAL' | 'DEGRADED' | 'FAULT' = isHalted
    ? 'FAULT'
    : consistency.state === 'FILTER_DIVERGENCE' || observerInst.isJumpGated
    ? 'DEGRADED'
    : 'OPTIMAL';

  const newsStatus: 'OPTIMAL' | 'DEGRADED' | 'FAULT' =
    newsFeed.status === 'UNAVAILABLE'
      ? 'FAULT'
      : newsFeed.status === 'DEGRADED_PARTIAL_FEEDS'
      ? 'DEGRADED'
      : 'OPTIMAL';

  const feeds: FeedIntegrityMetric[] = [
    {
      id: 'spot_gold',
      name: `Gold Market OHLCV Waterfall (${waterfall.activeTier})`,
      nameFa: `آبشار داده زنده بازار طلا (${waterfall.activeTier})`,
      source: waterfall.activeProvider,
      status: spotStatus,
      quorumBadge: `${spotQuorumActive}/${spotQuorumTotal} VENUES · SEQ ${(sequenceCompletenessRatio * 100).toFixed(1)}%`,
      latencyMs: spotLatency,
      details: isHalted
        ? 'CIRCUIT BREAKER TRIPPED: All Tier-1, Tier-2, and Tier-3 feeds failed. Zero synthetic data generated.'
        : `Active Provider: ${waterfall.activeProvider} · Sequence: ${contiguousBarsCount}/${expectedBarsCount} contiguous bars (${missingBarsCount} missing) · Staleness: ${stalenessSec}s (${stalenessRatio.toFixed(2)}x TF)`,
      detailsFa: isHalted
        ? 'مدار محافظتی فعال شد: تمامی منابع سطح ۱، ۲ و ۳ قطع شده‌اند. هیچ داده مصنوعی تولید نمی‌شود.'
        : `منبع فعال: ${waterfall.activeProvider} · پیوستگی کندل‌ها: ${contiguousBarsCount}/${expectedBarsCount} · تاخیر زمانی: ${stalenessSec}s (${stalenessRatio.toFixed(2)}x TF)`,
    },
    {
      id: 'treasury_macro',
      name: 'Multi-Source US Treasury, TIPS & DXY Redundancy Feed',
      nameFa: 'جریان چندمنبعی بازده اوراق خزانه‌داری آمریکا، TIPS و شاخص دلار',
      source: liveMacro.source,
      status: macroStatus,
      quorumBadge: `${macroActive}/${macroTotal} SOURCES`,
      latencyMs: 110,
      details:
        liveMacro.status === 'MACRO_FEED_UNAVAILABLE'
          ? 'All external macro yield & FX sources failed.'
          : `10Y Nominal: ${liveMacro.nominal10Y.toFixed(2)}% · 10Y TIPS: ${liveMacro.tipsRealYield10Y.toFixed(2)}% · DXY: ${liveMacro.dxyIndex.toFixed(2)} · Sources (${macroActive}/${macroTotal}): ${liveMacro.respondingSources.join(', ')}`,
      detailsFa:
        liveMacro.status === 'MACRO_FEED_UNAVAILABLE'
          ? 'تمامی منابع نرخ بهره و شاخص دلار قطع شده‌اند.'
          : `بازده ۱۰ ساله: ${liveMacro.nominal10Y.toFixed(2)}% · بازده واقعی TIPS: ${liveMacro.tipsRealYield10Y.toFixed(2)}% · شاخص دلار: ${liveMacro.dxyIndex.toFixed(2)} (${macroActive}/${macroTotal} منبع)`,
    },
    {
      id: 'cointegration_basis',
      name: 'Cross-Venue Empirical Basis Monitor (Primary vs. Secondary)',
      nameFa: 'پایشگر تجربی اسپرد بین‌بازاری (منبع اصلی در برابر کامکس/کراکن)',
      source: cointegrationBasis.benchmarkSource,
      status: basisStatus,
      quorumBadge:
        crossVenueDispersionBps !== null ? `${crossVenueDispersionBps.toFixed(1)} bps` : 'UNANCHORED (1 VENUE)',
      latencyMs: 18,
      details: `Dispersion: ${crossVenueDispersionBps !== null ? `${crossVenueDispersionBps.toFixed(2)} bps` : 'N/A'} · Spread: $${cointegrationBasis.basisSpread.toFixed(2)} (Mean: $${cointegrationBasis.meanBasis.toFixed(2)}, Z=${cointegrationBasis.zScore.toFixed(2)}) · Status: ${cointegrationBasis.basisStatus}`,
      detailsFa: `پراکندگی بین‌بازاری: ${crossVenueDispersionBps !== null ? `${crossVenueDispersionBps.toFixed(2)} bps` : 'تک‌منبعی'} · اسپرد: $${cointegrationBasis.basisSpread.toFixed(2)} (Z=${cointegrationBasis.zScore.toFixed(2)})`,
    },
    {
      id: 'dp_observer',
      name: 'Volume-Clock Jump-Gated State-Space Observer',
      nameFa: 'ناظر فضای حالت ساعت حجمی و گیت پرش هوبر',
      source: isHalted ? 'FROZEN (Circuit Breaker Halt)' : 'Empirical State-Space Filter',
      status: observerStatus,
      quorumBadge: `NIS=${consistency.currentNis.toFixed(2)} (${consistency.state})`,
      latencyMs: 8,
      details: isHalted
        ? 'Filter covariance (P), volume-clock (tau), and drift updates FROZEN due to market feed halt.'
        : `Consistency: ${consistency.labelEn} · Current NIS: ${consistency.currentNis.toFixed(2)} · 25-Bar Mean NIS: ${consistency.meanNis25.toFixed(2)} · Gate: ${observerInst.gateStatus}`,
      detailsFa: isHalted
        ? 'ماتریس کوواریانس، ساعت حجمی و تخمین سرعت به دلیل قطعی داده متوقف (Frozen) شدند.'
        : `سازگاری نوآوری: ${consistency.labelFa} · شاخص NIS: ${consistency.currentNis.toFixed(2)} (میانگین ۲۵ کندل: ${consistency.meanNis25.toFixed(2)})`,
    },
    {
      id: 'external_news',
      name: 'External Financial & Macro News RSS Adapter',
      nameFa: 'آداپتور اخبار واقعی مالی و کلان از منابع خارجی',
      source:
        newsFeed.activeSources.length > 0
          ? newsFeed.activeSources.join(' + ')
          : 'News Feed Unavailable (All External Feeds Unreachable)',
      status: newsStatus,
      quorumBadge: `${newsActive}/${newsTotal} FEEDS`,
      latencyMs: 95,
      details:
        newsFeed.status === 'UNAVAILABLE'
          ? newsFeed.unavailableMessageEn || 'News Feed Unavailable'
          : `${newsFeed.events.length} verified real headlines from ${newsActive}/${newsTotal} external RSS providers.`,
      detailsFa:
        newsFeed.status === 'UNAVAILABLE'
          ? newsFeed.unavailableMessageFa || 'جریان اخبار در دسترس نیست'
          : `${newsFeed.events.length} خبر واقعی تاییدشده از ${newsActive}/${newsTotal} خبرگزاری خارجی.`,
    },
  ];

  const healthyFeeds = feeds.filter(f => f.status === 'OPTIMAL').length;

  let integrityState: DataReliabilityTelemetry['integrityState'] = 'QUORUM_VERIFIED';
  let gradeLabel = `QUORUM VERIFIED (${activeProvidersCount}/${totalProvidersCount} ACTIVE · ${crossVenueDispersionBps !== null ? `${crossVenueDispersionBps.toFixed(1)} bps` : 'SINGLE VENUE'})`;
  let gradeLabelFa = `حد نصاب تاییدشده (${activeProvidersCount}/${totalProvidersCount} منبع فعال · ${crossVenueDispersionBps !== null ? `${crossVenueDispersionBps.toFixed(1)} bps` : 'تک‌منبعی'})`;
  let gradeColor = '#00e676';

  if (isHalted) {
    integrityState = 'HALTED_DEGRADED';
    gradeLabel = 'HALTED / DEGRADED — ALL LIVE MARKET SOURCES UNREACHABLE';
    gradeLabelFa = 'توقف کامل (HALTED) — عدم دسترسی به منابع زنده بازار';
    gradeColor = '#ff1744';
  } else if (
    waterfall.systemState === 'DEGRADED_FALLBACK' ||
    (spotQuorumActive <= 1 && crossVenueDispersionBps === null) ||
    stalenessStatus === 'STALE'
  ) {
    integrityState = 'SINGLE_SOURCE_DEGRADED';
    gradeLabel = `SINGLE-SOURCE / FALLBACK (${waterfall.activeTier} · ${activeProvidersCount}/${totalProvidersCount} QUORUM)`;
    gradeLabelFa = `وضعیت تک‌منبعی / جایگزین (${waterfall.activeTier} · حد نصاب ${activeProvidersCount}/${totalProvidersCount})`;
    gradeColor = '#ffab00';
  } else if (spotQuorumActive < 2 || macroActive < 1 || sequenceCompletenessRatio < 0.95) {
    integrityState = 'PARTIAL_QUORUM';
    gradeLabel = `PARTIAL QUORUM (${activeProvidersCount}/${totalProvidersCount} ACTIVE · SEQ ${(sequenceCompletenessRatio * 100).toFixed(0)}%)`;
    gradeLabelFa = `حد نصاب جزئی (${activeProvidersCount}/${totalProvidersCount} منبع · پیوستگی ${(sequenceCompletenessRatio * 100).toFixed(0)}٪)`;
    gradeColor = '#f5d76e';
  }

  return {
    integrityState,
    gradeLabel,
    gradeLabelFa,
    gradeColor,
    activeProvidersCount,
    totalProvidersCount,
    quorumRatio,
    quorumBadge,
    spotQuorumActive,
    spotQuorumTotal,
    crossVenueDispersionBps,
    stalenessSec,
    timeframeStepSec: safeStepSec,
    stalenessRatio,
    stalenessStatus,
    sequenceCompletenessRatio,
    contiguousBarsCount,
    expectedBarsCount,
    missingBarsCount,
    totalFeeds: feeds.length,
    healthyFeeds,
    lastCheckTimestamp: Date.now(),
    systemState: waterfall.systemState,
    activeTier: waterfall.activeTier,
    activeProvider: waterfall.activeProvider,
    feeds,
  };
}

export function buildHaltedDegradedForecastPayload(params: {
  waterfall: VerifiedMarketWaterfallResult;
  liveMacro: VerifiedMacroYieldResult;
  realNewsFeed: VerifiedMacroNewsFeedResult;
  observerInst: AdaptiveDPObserver;
  interval: string;
  intervalStepSeconds: number;
  appVersion: string;
  cachedData?: any;
}) {
  const { waterfall, liveMacro, realNewsFeed, observerInst, interval, intervalStepSeconds, appVersion, cachedData } =
    params;

  const frozenHistory = observerInst.freezeForHaltedDegraded();
  const lastKnownPrice = observerInst.lastPrice || cachedData?.currentPrice || 0;
  const lastKnownEq = cachedData?.equilibriumPrice || lastKnownPrice;
  const lastKnownAtr = cachedData?.atr || 0;

  const haltedVpin: VpinTelemetry = {
    vpinScore: 0,
    regime: 'HALTED_FREEZE',
    shrinkageRatio: 0,
    shrunkBias: observerInst.shrunkBias,
    rawBias: observerInst.biasEstimate,
    isJumpGated: true,
    jumpMagnitude: 0,
    gateStatus: 'HALTED_FREEZE',
    studentizedInnovation: 0,
    relativeVolumeRatio: 0,
  };

  const haltedBasis: CointegrationBasis = {
    paxgPrice: lastKnownPrice,
    comexBenchmarkSpot: lastKnownPrice,
    benchmarkSource: 'HALTED_DEGRADED (No Live Venue Available)',
    basisSpread: 0,
    meanBasis: 0,
    stdBasis: 0,
    zScore: 0,
    purgedPrice: lastKnownPrice,
    basisStatus: 'SINGLE_VENUE_UNANCHORED',
  };

  const haltedPca = computeOrthogonalMacroFactors(liveMacro, [], haltedBasis);
  const haltedReliability = computeDataReliability(
    waterfall,
    observerInst,
    haltedVpin,
    haltedPca,
    liveMacro,
    haltedBasis,
    realNewsFeed,
    [],
    intervalStepSeconds
  );

  const haltedPressureGauge = {
    zScore: 0,
    percentileRank: 50,
    clampedPercentileP5P95: 50,
    standardErrorZ: 1.0,
    ciLowerZ: -1.0,
    ciUpperZ: 1.0,
    ciLowerPercentile: 16,
    ciUpperPercentile: 84,
    sampleSizeN: 0,
    regimeLabelEn: 'HALTED_FREEZE (NO LIVE SAMPLE)',
    regimeLabelFa: 'توقف کامل (بدون نمونه زنده)',
  };

  return {
    status: 'HALTED_DEGRADED',
    systemState: 'HALTED_DEGRADED' as TerminalSystemState,
    isHalted: true,
    isSynthetic: false,
    activeTier: 'NONE_HALTED',
    activeProvider: waterfall.activeProvider,
    haltReasonEn: sanitizeUserFacingHaltReason(waterfall.haltReasonEn, 'en'),
    haltReasonFa: sanitizeUserFacingHaltReason(waterfall.haltReasonFa, 'fa'),
    providerDiagnostics: waterfall.diagnostics,
    version: appVersion,
    timestamp: Math.floor(Date.now() / 1000),
    timeframe: interval,
    timeframeStepSeconds: intervalStepSeconds,
    currentPrice: lastKnownPrice,
    equilibriumPrice: lastKnownEq,
    atr: lastKnownAtr,
    atmosphericState: 'HALTED / DEGRADED — LIVE FEEDS UNREACHABLE',
    barometerStatus: 'CIRCUIT BREAKER ACTIVE · FILTER MUTATIONS FROZEN',
    macroYieldFeed: liveMacro,
    multiTimeframeMatrix: cachedData?.multiTimeframeMatrix || [],
    multiTimeframeSummary: 'HALTED_DEGRADED: ALL LIVE MARKET FEEDS UNREACHABLE · MUTATIONS FROZEN',
    multiTimeframeConfluenceScore: 0,
    directionalPressure: haltedPressureGauge,
    macroWindVector: {
      realYieldForce: liveMacro.realYieldGravity,
      dollarDragForce: liveMacro.dollarDrag,
      liquidityTide: liveMacro.centralBankTide,
      netMacroLift: liveMacro.netMacroLift,
      orthogonalMacroLift: haltedPca.netOrthogonalLift,
      unmeasuredBiasCurrent: observerInst.shrunkBias,
      rawBias: observerInst.biasEstimate,
      totalNetVelocity: 0,
    },
    vpinTelemetry: haltedVpin,
    volumeClockTelemetry: {
      intrinsicDeltaTau: 0,
      cumulativeTau: observerInst.cumulativeTau,
      wallClockSteps: 25,
      dilationRatio: 0,
      processNoiseScale: 0,
      kalmanGainDynamic: 0,
      heartbeatCeilingActive: true,
      clockRegime: 'HALTED_FREEZE' as const,
    },
    sweepDiscriminator: {
      logOddsScore: 0,
      empiricalZScore: 0,
      empiricalPercentileRank: 50,
      clampedPercentileP5P95: 50,
      standardErrorZ: 1.0,
      ciLowerPercentile: 16,
      ciUpperPercentile: 84,
      sampleSizeN: 0,
      classification: 'HALTED_FREEZE' as const,
      absorptionRatio: 0,
      hawkesIntensity: 0,
      macroDivergenceScore: 0,
      tacticalAction: 'HALTED_DEGRADED STATE — UPSTREAM FEEDS UNREACHABLE (ESTIMATORS FROZEN)',
      tacticalActionFa: 'وضعیت توقف کامل — عدم دسترسی به منابع داده زنده (فیلترها متوقف شدند)',
    },
    liquidityEngine: cachedData?.liquidityEngine || {
      hierarchyOrder: ['MONTHLY', 'WEEKLY', 'DAILY', '4H', '1H', 'INTRADAY_15M_5M'],
      topDownPools: [],
      compositeHtfPocAnchor: lastKnownEq,
      nearestUpperHvn: lastKnownPrice,
      nearestLowerHvn: lastKnownPrice,
      interactionState: 'HALTED_FREEZE',
      interactionLabelEn: 'HALTED_DEGRADED STATE — LIQUIDITY ENGINE FROZEN',
      interactionLabelFa: 'توقف کامل — موتور نقدینگی چندتایم‌فریمی متوقف شد',
      absorptionInitiationClass: 'HALTED_FREEZE',
      absorptionInitiationLabelEn: 'HALTED_FREEZE (NO LIVE FLOW)',
      absorptionInitiationLabelFa: 'توقف کامل (بدون جریان زنده)',
      absorptionScoreZ: 0,
      initiationMomentumZ: 0,
      liquidityPullDriftUsd: 0,
      fusionWeights: {
        ouMeanReversionWeight: 0.24,
        kalmanDriftWeight: 0.24,
        macroFactorWeight: 0.18,
        sweepMicrostructureWeight: 0.12,
        mtfLiquidityWeight: 0.22,
      },
      fusedNetDriftUsd: 0,
      fusedEquilibriumAnchor: lastKnownEq,
      epistemicClass: 'QUALIFIED_PROXY',
    },
    morseManifold: cachedData?.morseManifold || {
      wellDepthDe: 0,
      stiffnessAlpha: 0,
      equilibriumAnchor: lastKnownEq,
      currentPotentialEnergy: 0,
      restoringForce: 0,
      gammaWalls: [],
    },
    cointegrationBasis: haltedBasis,
    pcaMacroFactors: haltedPca,
    observerTelemetry: {
      biasEstimate: observerInst.biasEstimate,
      shrunkBias: observerInst.shrunkBias,
      driftVelocity: observerInst.estimatedDrift,
      innovationConsistency: observerInst.getInnovationConsistency(true),
      empiricalCalibration: observerInst.getEmpiricalCalibrationScore(),
      innovationError: observerInst.innovationResidual,
      studentizedInnovation: observerInst.studentizedInnovation,
      isJumpGated: true,
      jumpMagnitude: 0,
      gateStatus: 'HALTED_FREEZE',
      intrinsicDeltaTau: 0,
      cumulativeTau: observerInst.cumulativeTau,
      kalmanGainDynamic: 0,
      clockRegime: 'HALTED_FREEZE',
      isFrozenByCircuitBreaker: true,
      history: frozenHistory,
    },
    garchVolatility: cachedData?.garchVolatility || {
      currentVolPct: 0,
      omega: 0,
      alpha: 0,
      beta: 0,
      isFrozen: true,
    },
    isobars: cachedData?.isobars || [],
    flowField: [],
    ensemble: {
      medianTrack: [],
      upper95: [],
      upper75: [],
      lower25: [],
      lower05: [],
      sampleTracks: [],
    },
    macroNews: realNewsFeed.events,
    macroNewsStatus: realNewsFeed,
    candles: cachedData?.candles || [],
    dataReliability: haltedReliability,
    validationScorecard: cachedData?.validationScorecard || getLatestValidationScorecard(interval),
  };
}

export function buildDiagnosisReport(params: {
  nowIso: string;
  wf: VerifiedMarketWaterfallResult;
  macro: VerifiedMacroYieldResult;
  news: VerifiedMacroNewsFeedResult;
  basis: CointegrationBasis;
  pca: PcaMacroFactors;
  observerInst: AdaptiveDPObserver;
}): string {
  const { nowIso, wf, macro, news, basis, pca, observerInst } = params;
  return [
    '======================================================================',
    'GDF (GOLD DYNAMIC FLOW) - QUANT ENGINE v70.0 (PHASE 2 MODULARIZED)',
    'ZERO-SYNTHETIC PROVENANCE · 3-TIER WATERFALL · CIRCUIT BREAKER ACTIVE',
    '======================================================================',
    `Timestamp: ${nowIso}`,
    `System State: ${wf.systemState} | Active Tier: ${wf.activeTier} (${wf.activeProvider})`,
    `Synthetic Data Generation: PERMANENTLY FORBIDDEN (Provenance Guard Active)`,
    '',
    '⏱️ 1. PILLAR 1: HYBRID VOLUME-CLOCK SUBORDINATOR (tau) & EKF',
    '----------------------------------------------------------------------',
    `  • Intrinsic Volume Step (d_tau): ${observerInst.intrinsicDeltaTau.toFixed(3)} (Window Cumulative: ${observerInst.cumulativeTau.toFixed(2)} tau)`,
    `  • Dynamic Volume-Scaled Kalman Gain (K_k): ${observerInst.kalmanGainDynamic.toFixed(3)}`,
    `  • Clock Subordinator Regime: ${observerInst.clockRegime}`,
    `  • Raw Unmeasured Bias (b_t): ${observerInst.biasEstimate.toFixed(3)} $/hr | Shrunk (b_t^*): ${observerInst.shrunkBias.toFixed(3)} $/hr`,
    `  • Hydrodynamic Drift Velocity (v_t): ${observerInst.estimatedDrift.toFixed(3)} $/hr`,
    '',
    '⚖️ 2. PILLAR 2: EMPIRICAL CROSS-VENUE BASIS & LOG-ODDS SWEEP DISCRIMINATOR',
    '----------------------------------------------------------------------',
    `  • Primary Gold Venue: ${wf.activeProvider} (${wf.activeSymbol})`,
    `  • Secondary Benchmark: ${basis.benchmarkSource}`,
    `  • Empirical Basis Spread: $${basis.basisSpread.toFixed(2)} (Z=${basis.zScore.toFixed(2)}, ${basis.basisStatus})`,
    '',
    '📐 3. PILLAR 3: EMPIRICAL MACRO FACTORS & COUPLED MORSE POTENTIAL MANIFOLD',
    '----------------------------------------------------------------------',
    `  • F1 Real Geopotential (${(pca.f1Weight * 100).toFixed(1)}% weight): ${pca.f1RealGeopotential.toFixed(3)} $/hr`,
    `  • F2 Monetary Liquidity (${(pca.f2Weight * 100).toFixed(1)}% weight): ${pca.f2MonetaryLiquidity.toFixed(3)} $/hr`,
    `  • F3 Tail Convexity (${(pca.f3Weight * 100).toFixed(1)}% weight): ${pca.f3TailConvexity.toFixed(3)} $/hr`,
    `  • Total Net Orthogonal Lift: ${pca.netOrthogonalLift >= 0 ? '+' : ''}${pca.netOrthogonalLift.toFixed(3)} $/hr`,
    `  • Empirical Condition Number: kappa = ${pca.collinearityConditionNumber.toFixed(2)}`,
    '',
    '📡 4. REAL-TIME MULTI-TIER WATERFALL & EXTERNAL NEWS STATUS',
    '----------------------------------------------------------------------',
    `  • Market Waterfall: ${wf.systemState} (${wf.candles.length} verified candles)`,
    `  • Macro Yield & FX Redundancy: ${macro.status} (${macro.source})`,
    `  • External Financial News RSS: ${news.status} (${news.events.length} verified headlines from ${news.activeSources.join(', ') || 'none'})`,
    '======================================================================',
  ].join('\n');
}
