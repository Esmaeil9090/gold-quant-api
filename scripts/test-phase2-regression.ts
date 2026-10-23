import fs from 'fs';
import path from 'path';
import { assertVerifiedProvenance, VerifiedCandle, VerifiedMacroYieldResult } from '../src/services/realDataWaterfall.js';
import { AdaptiveDPObserver, evaluatePureQuantPipeline } from '../src/engine/quantEngine.js';
import { buildHaltedDegradedForecastPayload } from '../src/services/telemetryService.js';

const FIXTURES_DIR = path.join(process.cwd(), 'fixtures', 'real-market');

function loadCandlesFixture(filename: string): VerifiedCandle[] {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8'));
  return Array.isArray(raw) ? raw : raw.candles;
}

function runRegressionSuite() {
  console.log('======================================================================');
  console.log('GDF PHASE 2 DETERMINISTIC NUMERICAL REGRESSION SUITE');
  console.log('======================================================================');

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

  const comexCandles = loadCandlesFixture('comex_gcf_15m.json');
  const intervals: { tf: string; file: string; stepSec: number }[] = [
    { tf: '1m', file: 'paxg_1m.json', stepSec: 60 },
    { tf: '5m', file: 'paxg_5m.json', stepSec: 300 },
    { tf: '15m', file: 'paxg_15m.json', stepSec: 900 },
    { tf: '1h', file: 'paxg_1h.json', stepSec: 3600 },
    { tf: '4h', file: 'paxg_4h.json', stepSec: 14400 },
    { tf: '1d', file: 'paxg_1d.json', stepSec: 86400 },
  ];

  let passed = 0;

  for (const item of intervals) {
    const candles = loadCandlesFixture(item.file);
    assertVerifiedProvenance(candles, {
      providerName: 'Binance Vision Public Data (Fixture)',
      symbol: 'PAXGUSDT',
      endpoint: `fixtures/real-market/${item.file}`,
      tier: 'FIXTURE_TEST_REPLAY',
    });

    const secondaryBenchmark = {
      provider: 'Yahoo Finance COMEX Gold Futures (Fixture)',
      symbol: 'GC=F',
      candles: comexCandles,
      crossVenueSpreadUsd: 1.4,
      crossVenueZScore: -0.57,
      isOutlierDislocation: false,
    };

    const obs1 = new AdaptiveDPObserver();
    const out1 = evaluatePureQuantPipeline(
      candles,
      liveMacro,
      secondaryBenchmark,
      item.stepSec,
      obs1,
      'LIVE_NOMINAL',
      'TIER_1_PRIMARY'
    );

    const obs2 = new AdaptiveDPObserver();
    const out2 = evaluatePureQuantPipeline(
      candles,
      liveMacro,
      secondaryBenchmark,
      item.stepSec,
      obs2,
      'LIVE_NOMINAL',
      'TIER_1_PRIMARY'
    );

    // Verify 100% bit-for-bit determinism across runs
    const json1 = JSON.stringify(out1);
    const json2 = JSON.stringify(out2);
    if (json1 !== json2) {
      throw new Error(`DETERMINISM_FAILURE on timeframe ${item.tf}: outputs diverged between identical runs!`);
    }

    if (!Number.isFinite(out1.currentPrice) || out1.currentPrice <= 0) {
      throw new Error(`INVALID_PRICE on timeframe ${item.tf}`);
    }
    if (!Number.isFinite(out1.vpinTelemetry.vpinScore) || !Number.isFinite(out1.observerTelemetry.shrunkBias)) {
      throw new Error(`INVALID_TELEMETRY on timeframe ${item.tf}`);
    }

    console.log(
      `[PASS] ${item.tf.padEnd(3)} | Bars=${candles.length} | Price=$${out1.currentPrice.toFixed(2)} | VPIN=${out1.vpinTelemetry.vpinScore.toFixed(4)} | EKF_ShrunkBias=${out1.observerTelemetry.shrunkBias.toFixed(3)} | GARCH_Vol=${out1.garchVolatility.currentVolPct.toFixed(4)}% | SweepLogOdds=${out1.sweepDiscriminator.logOddsScore.toFixed(2)}`
    );
    passed++;
  }

  // Test Circuit-Breaker Halted State Invariants
  const obsHalt = new AdaptiveDPObserver();
  obsHalt.biasEstimate = -0.712;
  obsHalt.shrunkBias = -0.515;
  obsHalt.cumulativeTau = 24.18;
  obsHalt.lastPrice = 4045.22;

  const haltedPayload = buildHaltedDegradedForecastPayload({
    waterfall: {
      systemState: 'HALTED_DEGRADED',
      activeTier: 'NONE_HALTED',
      activeProvider: 'ALL_LIVE_PROVIDERS_UNREACHABLE',
      activeSymbol: 'NONE',
      activeEndpoint: 'NONE',
      candles: [],
      secondaryBenchmark: null,
      diagnostics: [],
      freshnessAgeSec: -1,
      haltReasonEn: 'All providers failed in regression test',
      haltReasonFa: 'تست قطع تمامی منابع زنده',
    },
    liveMacro,
    realNewsFeed: {
      status: 'UNAVAILABLE',
      activeSources: [],
      failedSources: ['MarketWatch', 'CNBC', 'YahooFinance'],
      unavailableMessageEn: 'News Feed Unavailable',
      unavailableMessageFa: 'جریان اخبار در دسترس نیست',
      events: [],
      lastFetchedIso: new Date().toISOString(),
    },
    observerInst: obsHalt,
    interval: '15m',
    intervalStepSeconds: 900,
    appVersion: '2026.10.23-v70.0-Phase2',
  });

  if (
    !haltedPayload.isHalted ||
    haltedPayload.isSynthetic !== false ||
    haltedPayload.systemState !== 'HALTED_DEGRADED' ||
    haltedPayload.observerTelemetry.intrinsicDeltaTau !== 0 ||
    haltedPayload.observerTelemetry.kalmanGainDynamic !== 0 ||
    haltedPayload.observerTelemetry.isFrozenByCircuitBreaker !== true ||
    haltedPayload.observerTelemetry.cumulativeTau !== 24.18
  ) {
    throw new Error('CIRCUIT_BREAKER_INVARIANT_FAILURE: Halted payload did not freeze state properly.');
  }

  console.log(
    `[PASS] CIRCUIT BREAKER HALT INVARIANT | systemState=${haltedPayload.systemState} | isSynthetic=${haltedPayload.isSynthetic} | deltaTau=${haltedPayload.observerTelemetry.intrinsicDeltaTau} | kalmanGain=${haltedPayload.observerTelemetry.kalmanGainDynamic} | frozenTau=${haltedPayload.observerTelemetry.cumulativeTau}`
  );
  console.log(`======================================================================`);
  console.log(`ALL ${passed + 1} PHASE 2 REGRESSION & INVARIANT TESTS PASSED (100% DETERMINISTIC)`);
  console.log(`======================================================================`);
}

runRegressionSuite();
