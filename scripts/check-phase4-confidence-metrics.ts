import fs from 'fs';
import path from 'path';
import { AdaptiveDPObserver, evaluatePureQuantPipeline } from '../src/engine/quantEngine.js';
import { computeDataReliability, buildHaltedDegradedForecastPayload } from '../src/services/telemetryService.js';
import { VerifiedCandle, VerifiedMacroYieldResult, VerifiedMarketWaterfallResult, VerifiedMacroNewsFeedResult } from '../src/services/realDataWaterfall.js';

const ROOT = process.cwd();
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'real-market');

function runPhase4ConfidenceCheck() {
  console.log('======================================================================');
  console.log('GDF PHASE 4 CONFIDENCE METRICS OVERHAUL VERIFICATION');
  console.log('======================================================================');

  // 1. Static check for forbidden fake percentage gauges across codebase
  const filesToAudit = [
    'index.html',
    'public/js/gdfClientCore.js',
    'src/contracts/quantContracts.ts',
    'src/engine/quantEngine.ts',
    'src/services/telemetryService.ts',
    'src/config/modelSpecRegistry.ts',
    'server.ts',
  ];

  const forbiddenTokens = [
    'compositeReliabilityPct',
    'scorePct',
    'convergenceConfidence',
    'stabilityScore',
    'sweepProbabilityPct',
    'bullProb',
    'bearProb',
    'bullPct',
    'bearPct',
    'Bear Kill 100%',
    '100% Bull Lift',
    'Data Reliability:',
    'Observer Confidence',
  ];

  for (const relPath of filesToAudit) {
    const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    for (const token of forbiddenTokens) {
      if (content.includes(token)) {
        throw new Error(`FORBIDDEN_FAKE_METRIC_FOUND: "${token}" still present in ${relPath}`);
      }
    }
  }
  console.log(`[PASS] Static audit: 0 forbidden percentage gauges or logistic mappings found across ${filesToAudit.length} files.`);

  // 2. Verify DOM hooks in index.html for Phase 4 metrics
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const requiredDomHooks = [
    'id="dirPressureTrack"',
    'id="dirPressureCiBand"',
    'id="dirPressureMarker"',
    'id="dirPressureReadout"',
    'id="dpInnovationConsistency"',
    'id="dpEmpiricalCalibration"',
    'id="relDispersionBps"',
    'id="relSpotQuorum"',
    'id="relStalenessRatio"',
    'id="relSeqCompleteness"',
  ];
  for (const hook of requiredDomHooks) {
    if (!indexHtml.includes(hook)) {
      throw new Error(`MISSING_PHASE4_DOM_HOOK: ${hook} missing in index.html`);
    }
  }
  console.log(`[PASS] Frontend telemetry cards & bidirectional gauge hooks verified in index.html.`);

  // 3. Numerical & Structural Verification on Real Fixture Data
  const rawPaxg = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'paxg_15m.json'), 'utf8'));
  const candles: VerifiedCandle[] = Array.isArray(rawPaxg) ? rawPaxg : rawPaxg.candles;
  const rawComex = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'comex_gcf_15m.json'), 'utf8'));
  const comexCandles: VerifiedCandle[] = Array.isArray(rawComex) ? rawComex : rawComex.candles;
  const macroFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'macro_yields_fx.json'), 'utf8'));

  const liveMacro: VerifiedMacroYieldResult = {
    nominal10Y: macroFixture.nominal10Y ?? 4.965,
    tipsRealYield10Y: macroFixture.tipsRealYield10Y ?? 2.745,
    breakevenInflation10Y: macroFixture.breakevenInflation10Y ?? 2.22,
    dxyIndex: macroFixture.dxyIndex ?? 101.68,
    realYieldGravity: macroFixture.realYieldGravity ?? -1.432,
    dollarDrag: macroFixture.dollarDrag ?? -0.109,
    centralBankTide: macroFixture.centralBankTide ?? 0.55,
    netMacroLift: macroFixture.netMacroLift ?? -0.991,
    source: 'Archived Phase-0 Real Fixture',
    status: 'ONLINE_MULTI_SOURCE_VERIFIED',
    lastUpdated: new Date().toISOString(),
    respondingSources: ['Fixture_TNX', 'Fixture_TIPS', 'Fixture_DXY'],
    sanityCheckZScore: 0.12,
    outliersRejected: [],
  };

  const secondaryBenchmark = {
    provider: 'Yahoo Finance COMEX Gold Futures (Fixture)',
    symbol: 'GC=F',
    candles: comexCandles,
    crossVenueSpreadUsd: 1.4,
    crossVenueZScore: -0.57,
    isOutlierDislocation: false,
  };

  const observer = new AdaptiveDPObserver();
  const quantOut = evaluatePureQuantPipeline(
    candles,
    liveMacro,
    secondaryBenchmark,
    900,
    observer,
    'LIVE_NOMINAL',
    'TIER_1_PRIMARY'
  );

  // Verify Observer Split Metrics
  const ic = quantOut.observerTelemetry.innovationConsistency;
  const ec = quantOut.observerTelemetry.empiricalCalibration;

  if (!ic || !Number.isFinite(ic.currentNis) || !Number.isFinite(ic.meanNis25) || ic.chiSquare95Threshold !== 3.841) {
    throw new Error('INVALID_INNOVATION_CONSISTENCY: NIS metric invalid');
  }
  if (!['WITHIN_2SIGMA', 'TAIL_SHOCK', 'FILTER_DIVERGENCE', 'HALTED_FREEZE'].includes(ic.state)) {
    throw new Error(`INVALID_NIS_STATUS: ${ic.state}`);
  }
  if (
    !ec ||
    ec.status !== 'CALIBRATING_INSUFFICIENT_SAMPLE' ||
    ec.minRequiredSample !== 30 ||
    !ec.labelEn.includes('CALIBRATING (INSUFFICIENT SAMPLE') ||
    !ec.labelFa.includes('در حال کالیبراسیون (نمونه ناکافی')
  ) {
    throw new Error('INVALID_EMPIRICAL_CALIBRATION: Must explicitly report CALIBRATING (INSUFFICIENT SAMPLE) until N >= 30');
  }
  console.log(
    `[PASS] Observer Split Metrics | NIS=${ic.currentNis.toFixed(3)} (mean25=${ic.meanNis25.toFixed(3)}, state=${ic.state}) | Calibration="${ec.labelEn}"`
  );

  // Verify Directional Pressure Z-scores & P5-P95 Percentiles with ±1 SE bands
  const dp = quantOut.directionalPressure;
  if (
    !dp ||
    !Number.isFinite(dp.zScore) ||
    dp.percentileRank < 5 ||
    dp.percentileRank > 95 ||
    !(dp.standardError > 0) ||
    !(dp.ciLowerZ < dp.zScore && dp.zScore < dp.ciUpperZ)
  ) {
    throw new Error(`INVALID_DIRECTIONAL_PRESSURE_GAUGE: ${JSON.stringify(dp)}`);
  }
  console.log(
    `[PASS] Candle Directional Pressure | Z=${dp.zScore.toFixed(2)}σ | P=${dp.percentileRank} (${dp.percentileLabel}) | ±1 SE Band=[${dp.ciLowerZ.toFixed(2)}σ, ${dp.ciUpperZ.toFixed(2)}σ] (±${dp.standardError.toFixed(2)}σ, N=${dp.sampleSize})`
  );

  // Verify Sweep Pressure Gauge & MTF Matrix Directional Pressure
  const sw = quantOut.sweepDiscriminator;
  if (!sw || sw.percentileRank < 5 || sw.percentileRank > 95 || !(sw.standardError > 0)) {
    throw new Error('INVALID_SWEEP_PRESSURE_GAUGE');
  }
  for (const row of quantOut.multiTimeframe.matrix) {
    const rdp = row.directionalPressure;
    if (!rdp || rdp.percentileRank < 5 || rdp.percentileRank > 95 || !(rdp.standardError > 0)) {
      throw new Error(`INVALID_MTF_DIRECTIONAL_PRESSURE on ${row.timeframe}`);
    }
  }
  console.log(
    `[PASS] Sweep & MTF Empirical Gauges | Sweep L_t Z=${sw.logOddsZScore.toFixed(2)}σ (${sw.percentileLabel}, ±${sw.standardError.toFixed(2)}σ SE) | MTF Horizons=${quantOut.multiTimeframe.matrix.length} verified`
  );

  // Verify Feed Integrity Score on Real Waterfall Telemetry
  const mockWaterfall: VerifiedMarketWaterfallResult = {
    systemState: 'LIVE_NOMINAL',
    activeTier: 'TIER_1_PRIMARY',
    activeProvider: 'Binance Spot PAXGUSDT',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    candles,
    secondaryBenchmark,
    diagnostics: [
      {
        tier: 'TIER_1_PRIMARY',
        providerName: 'Binance Spot PAXGUSDT',
        symbol: 'PAXGUSDT',
        endpoint: 'https://data-api.binance.vision/api/v3/klines',
        status: 'SUCCESS',
        latencyMs: 84,
        candleCount: candles.length,
        timestampIso: new Date().toISOString(),
      },
      {
        tier: 'TIER_2_SECONDARY',
        providerName: 'Yahoo Finance COMEX Gold',
        symbol: 'GC=F',
        endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F',
        status: 'SUCCESS',
        latencyMs: 112,
        candleCount: comexCandles.length,
        timestampIso: new Date().toISOString(),
      },
    ],
    freshnessAgeSec: 120,
    haltReasonEn: undefined,
    haltReasonFa: undefined,
  };

  const mockNews: VerifiedMacroNewsFeedResult = {
    status: 'ONLINE_EXTERNAL_FEEDS',
    activeSources: ['MarketWatch_RSS', 'CNBC_RSS'],
    failedSources: [],
    unavailableMessageEn: null,
    unavailableMessageFa: null,
    events: [],
    lastFetchedIso: new Date().toISOString(),
  };

  const rel = computeDataReliability(
    mockWaterfall,
    observer,
    quantOut.vpinTelemetry,
    quantOut.pcaFactors,
    liveMacro,
    quantOut.cointegrationBasis,
    mockNews,
    candles,
    900
  );

  if (
    !rel ||
    rel.activeProvidersCount <= 0 ||
    rel.totalProvidersCount <= 0 ||
    rel.crossVenueDispersionBps === null ||
    !(rel.sequenceCompletenessRatio > 0 && rel.sequenceCompletenessRatio <= 1)
  ) {
    throw new Error(`INVALID_FEED_INTEGRITY_SCORE: ${JSON.stringify(rel)}`);
  }
  console.log(
    `[PASS] Feed Integrity Score | Quorum=${rel.activeProvidersCount}/${rel.totalProvidersCount} (Spot=${rel.spotQuorumActive}/${rel.spotQuorumTotal}) | Dispersion=${rel.crossVenueDispersionBps.toFixed(2)} bps | Staleness=${rel.stalenessRatio.toFixed(2)}x TF (${rel.stalenessStatus}) | Completeness=${rel.contiguousBarsCount}/${rel.expectedBarsCount} (${(rel.sequenceCompletenessRatio * 100).toFixed(1)}%)`
  );

  // Verify Halted Degraded Payload also adheres to Phase 4 contracts
  const halted = buildHaltedDegradedForecastPayload({
    waterfall: {
      ...mockWaterfall,
      systemState: 'HALTED_DEGRADED',
      activeTier: 'NONE_HALTED',
      candles: [],
      secondaryBenchmark: null,
      diagnostics: [],
    },
    liveMacro,
    realNewsFeed: { ...mockNews, status: 'UNAVAILABLE', activeSources: [] },
    observerInst: observer,
    interval: '15m',
    intervalStepSeconds: 900,
    appVersion: '2026.10.23-v72.0-Phase4-ConfidenceMetrics',
  });
  if (
    halted.observerTelemetry.innovationConsistency.state !== 'HALTED_FREEZE' ||
    halted.dataReliability.integrityState !== 'HALTED_DEGRADED'
  ) {
    throw new Error('HALTED_PHASE4_CONTRACT_MISMATCH');
  }
  console.log(
    `[PASS] Halted Circuit-Breaker Phase 4 Contract | NIS State=${halted.observerTelemetry.innovationConsistency.state} | Feed Integrity=${halted.dataReliability.integrityState}`
  );
  console.log('======================================================================');
  console.log('ALL PHASE 4 CONFIDENCE METRICS VERIFICATION CHECKS PASSED');
  console.log('======================================================================');
}

runPhase4ConfidenceCheck();
