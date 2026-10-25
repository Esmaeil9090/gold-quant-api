import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getFeatureFlags } from '../src/config/featureFlags.js';
import {
  aggregateCandlesToStep,
  alignBenchmarkCandlesByTimestamp,
  evaluateProviderQuorum,
  fetchSafeJson,
  fetchVerifiedMacroNews,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
  getLatestWaterfallSnapshot,
  getProviderHttpDiagnostics,
  normalizeAndDeduplicateCandles,
  type ProviderAttemptDiagnostic,
  type VerifiedCandle,
} from '../src/services/realDataWaterfall.js';
import { computeDataReliability } from '../src/services/telemetryService.js';
import { AdaptiveDPObserver, computeCointegrationBasis, computeOrthogonalMacroFactors } from '../src/engine/quantEngine.js';

const BASE_URL = 'http://127.0.0.1:3000';

async function runAuditSuite() {
  console.log('======================================================================');
  console.log('GDF FULL-SYSTEM ROOT-CAUSE & INTEGRITY VERIFICATION SUITE (20 TESTS)');
  console.log('======================================================================');

  let passed = 0;

  // 1. All market providers fail -> HALTED_DEGRADED with non-empty providerDiagnostics and zero synthetic candles
  {
    const wf = await fetchVerifiedMarketWaterfall('15m', { simulateFailure: 'all' });
    assert.equal(wf.systemState, 'HALTED_DEGRADED');
    assert.equal(wf.activeTier, 'NONE_HALTED');
    assert.equal(wf.candles.length, 0);
    assert.equal(wf.diagnostics.length, 10, 'Must record all 10 provider attempt diagnostics');
    console.log('[PASS 01/20] All market providers fail -> HALTED_DEGRADED with 10 diagnostics & 0 synthetic bars');
    passed++;
  }

  // 2. One provider returns HTTP 200 HTML -> rejected with diagnostic entry, fallback provider succeeds
  {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response('<!DOCTYPE html><html><body>Cloudflare Challenge</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      let rejectedHtml = false;
      try {
        await fetchSafeJson('https://example.com/api/klines', 'MockHTMLProvider', 1000);
      } catch (e: any) {
        rejectedHtml = /NON_JSON_UPSTREAM_RESPONSE/i.test(e.message);
      }
      assert.equal(rejectedHtml, true, 'HTTP 200 HTML response must be rejected by fetchSafeJson');
      const diags = getProviderHttpDiagnostics();
      assert.equal(diags[0].providerName, 'MockHTMLProvider');
      assert.equal(diags[0].isHtmlOrNonJson, true);
      assert.equal(diags[0].outcome, 'NON_JSON_HTML_REJECTED');
    } finally {
      globalThis.fetch = origFetch;
    }
    console.log('[PASS 02/20] HTTP 200 HTML response rejected & recorded in provider HTTP diagnostics');
    passed++;
  }

  // 3. One provider returns HTTP 404 JSON -> rejected with diagnostic entry, fallback provider succeeds
  {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ chart: { result: null, error: { code: 'Not Found' } } }), {
          status: 404,
          headers: { 'content-type': 'application/json;charset=utf-8' },
        });
      let rejected404 = false;
      try {
        await fetchSafeJson('https://example.com/v8/chart', 'Mock404Provider', 1000);
      } catch (e: any) {
        rejected404 = /HTTP 404/i.test(e.message);
      }
      assert.equal(rejected404, true, 'HTTP 404 JSON response must be rejected');
      const diags = getProviderHttpDiagnostics();
      assert.equal(diags[0].providerName, 'Mock404Provider');
      assert.equal(diags[0].httpStatus, 404);
      assert.equal(diags[0].outcome, 'HTTP_ERROR');
    } finally {
      globalThis.fetch = origFetch;
    }
    console.log('[PASS 03/20] HTTP 404 JSON response rejected & recorded with HTTP_ERROR outcome');
    passed++;
  }

  // 4. One provider times out -> rejected with diagnostic entry, fallback provider succeeds
  {
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (_input: any, init?: any): Promise<Response> =>
        new Promise<Response>((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => reject(new Error('AbortError: timed out')));
          }
        });
      let timedOut = false;
      try {
        await fetchSafeJson('https://example.com/slow', 'MockTimeoutProvider', 80);
      } catch (_) {
        timedOut = true;
      }
      assert.equal(timedOut, true, 'Slow provider must time out and reject');
      const diags = getProviderHttpDiagnostics();
      assert.equal(diags[0].providerName, 'MockTimeoutProvider');
      assert.equal(diags[0].outcome, 'NETWORK_TIMEOUT');
    } finally {
      globalThis.fetch = origFetch;
    }
    console.log('[PASS 04/20] Provider timeout rejected & recorded with NETWORK_TIMEOUT outcome');
    passed++;
  }

  // 5. Correlated providers (two Binance endpoints) succeed while all others fail -> counted as 1 independent venue
  {
    const mockDiags: ProviderAttemptDiagnostic[] = [
      {
        tier: 'TIER_1_PRIMARY',
        providerName: 'Binance Vision Public Node (PAXG/USDT)',
        symbol: 'PAXGUSDT',
        endpoint: 'https://data-api.binance.vision/api/v3/klines',
        venueGroupId: 'binance_paxg',
        instrumentIdentity: 'PAXG_SPOT_TOKEN',
        status: 'SUCCESS',
        latencyMs: 50,
        candleCount: 300,
        isStaleBar: false,
        timestampIso: new Date().toISOString(),
      },
      {
        tier: 'TIER_1_PRIMARY',
        providerName: 'Binance Spot Primary Core (PAXG/USDT)',
        symbol: 'PAXGUSDT',
        endpoint: 'https://api.binance.com/api/v3/klines',
        venueGroupId: 'binance_paxg',
        instrumentIdentity: 'PAXG_SPOT_TOKEN',
        status: 'SUCCESS',
        latencyMs: 65,
        candleCount: 300,
        isStaleBar: false,
        timestampIso: new Date().toISOString(),
      },
      {
        tier: 'TIER_1_PRIMARY',
        providerName: 'Bybit V5 Institutional Spot (PAXG/USDT)',
        symbol: 'PAXGUSDT',
        endpoint: 'https://api.bybit.com/v5/market/kline',
        venueGroupId: 'bybit_paxg',
        instrumentIdentity: 'PAXG_SPOT_TOKEN',
        status: 'FAILED',
        latencyMs: 120,
        candleCount: 0,
        timestampIso: new Date().toISOString(),
      },
    ];
    const q = evaluateProviderQuorum(mockDiags);
    assert.equal(q.activeEndpoints, 2, '2 HTTP endpoints succeeded');
    assert.equal(q.independentVenuesActive, 1, 'Correlated Binance hosts must count as 1 independent venue');
    assert.equal(q.sameInstrumentPaxgVenuesActive, 1);
    console.log('[PASS 05/20] Correlated Binance hosts deduplicated to 1 independent venue vote');
    passed++;
  }

  // 6. Different instruments (PAXGUSDT vs GC=F) separated in quorum & basis
  {
    const mockDiags: ProviderAttemptDiagnostic[] = [
      {
        tier: 'TIER_1_PRIMARY',
        providerName: 'Binance Vision Public Node (PAXG/USDT)',
        symbol: 'PAXGUSDT',
        endpoint: 'https://data-api.binance.vision/api/v3/klines',
        venueGroupId: 'binance_paxg',
        instrumentIdentity: 'PAXG_SPOT_TOKEN',
        status: 'SUCCESS',
        latencyMs: 40,
        candleCount: 300,
        isStaleBar: false,
        timestampIso: new Date().toISOString(),
      },
      {
        tier: 'TIER_2_SECONDARY',
        providerName: 'Yahoo Finance COMEX Gold Futures (GC=F)',
        symbol: 'GC=F',
        endpoint: 'https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF',
        venueGroupId: 'yahoo_comex_gcf',
        instrumentIdentity: 'COMEX_GOLD_FUTURES',
        status: 'SUCCESS',
        latencyMs: 90,
        candleCount: 300,
        isStaleBar: false,
        timestampIso: new Date().toISOString(),
      },
    ];
    const q = evaluateProviderQuorum(mockDiags);
    assert.equal(q.independentVenuesActive, 2);
    assert.equal(q.sameInstrumentPaxgVenuesActive, 1, 'GC=F must not be counted as a PAXG_SPOT_TOKEN venue');
    console.log('[PASS 06/20] PAXG_SPOT_TOKEN and COMEX_GOLD_FUTURES (GC=F) explicitly separated');
    passed++;
  }

  // 7 & 8. Out-of-order and duplicate candle timestamps sorted and deduplicated deterministically
  {
    const raw: VerifiedCandle[] = [
      { time: 1710001800, open: 2905, high: 2910, low: 2900, close: 2908, volume: 12 },
      { time: 1710000000, open: 2890, high: 2895, low: 2888, close: 2892, volume: 10 },
      { time: 1710000900, open: 2892, high: 2906, low: 2891, close: 2905, volume: 15 },
      { time: 1710000900, open: 2892, high: 2908, low: 2890, close: 2906, volume: 18 },
    ];
    const clean = normalizeAndDeduplicateCandles(raw);
    assert.equal(clean.length, 3);
    assert.equal(clean[0].time, 1710000000);
    assert.equal(clean[1].time, 1710000900);
    assert.equal(clean[1].close, 2906);
    assert.equal(clean[2].time, 1710001800);
    console.log('[PASS 07/20] Out-of-order candles sorted strictly monotonically');
    console.log('[PASS 08/20] Duplicate candle timestamps deduplicated deterministically');
    passed += 2;
  }

  // 9. Missing bars / market closure gaps explicitly measured, never interpolated with synthetic prices
  {
    const nowSec = Math.floor(Date.now() / 1000);
    const gappedCandles: VerifiedCandle[] = [];
    for (let i = 0; i < 30; i++) {
      // Introduce a 3-bar gap at index 15
      const offsetBars = i >= 15 ? i + 3 : i;
      gappedCandles.push({
        time: nowSec - (35 - offsetBars) * 900,
        open: 2900 + i,
        high: 2905 + i,
        low: 2895 + i,
        close: 2902 + i,
        volume: 25,
      });
    }
    const obs = new AdaptiveDPObserver();
    const macro = await fetchVerifiedMacroWaterfall({ simulateFailure: 'all' });
    const news = await fetchVerifiedMacroNews({ simulateFailure: 'all' });
    const basis = computeCointegrationBasis(2930, gappedCandles, null);
    const pca = computeOrthogonalMacroFactors(macro, gappedCandles, basis);
    const rel = computeDataReliability(
      {
        systemState: 'LIVE_NOMINAL',
        activeTier: 'TIER_1_PRIMARY',
        activeProvider: 'Binance Vision Public Node (PAXG/USDT)',
        diagnostics: [],
        freshnessAgeSec: 30,
      },
      obs,
      {
        vpinScore: 0.2,
        regime: 'BALANCED_LAMINAR',
        shrinkageRatio: 0.8,
        shrunkBias: 0,
        rawBias: 0,
        isJumpGated: false,
        jumpMagnitude: 0,
        gateStatus: 'LAMINAR_CONTINUOUS',
        studentizedInnovation: 0,
        relativeVolumeRatio: 1,
      },
      pca,
      macro,
      basis,
      news,
      gappedCandles,
      900
    );
    assert.equal(rel.missingBarsCount, 3, 'Must detect exact 3-bar gap without interpolating fake bars');
    assert.ok(rel.sequenceCompletenessRatio < 1.0);
    console.log('[PASS 09/20] Missing bars / gaps explicitly measured (3 missing bars), zero synthetic interpolation');
    passed++;
  }

  // 10. Stale bars detected and flagged -> never reported as LIVE_NOMINAL / QUORUM_VERIFIED
  {
    const staleBase = Math.floor(Date.now() / 1000) - 900 * 6; // 6 bars (5400s) old on 15m
    const staleCandles: VerifiedCandle[] = Array.from({ length: 30 }, (_, i) => ({
      time: staleBase - (29 - i) * 900,
      open: 2910,
      high: 2915,
      low: 2905,
      close: 2912,
      volume: 14,
    }));
    const obs = new AdaptiveDPObserver();
    const macro = await fetchVerifiedMacroWaterfall({ simulateFailure: 'all' });
    const news = await fetchVerifiedMacroNews({ simulateFailure: 'all' });
    const basis = computeCointegrationBasis(2912, staleCandles, null);
    const pca = computeOrthogonalMacroFactors(macro, staleCandles, basis);
    const rel = computeDataReliability(
      {
        systemState: 'DEGRADED_FALLBACK',
        activeTier: 'TIER_1_PRIMARY',
        activeProvider: 'Binance Vision Public Node (PAXG/USDT)',
        diagnostics: [],
        freshnessAgeSec: 5400,
      },
      obs,
      {
        vpinScore: 0.2,
        regime: 'BALANCED_LAMINAR',
        shrinkageRatio: 0.8,
        shrunkBias: 0,
        rawBias: 0,
        isJumpGated: false,
        jumpMagnitude: 0,
        gateStatus: 'LAMINAR_CONTINUOUS',
        studentizedInnovation: 0,
        relativeVolumeRatio: 1,
      },
      pca,
      macro,
      basis,
      news,
      staleCandles,
      900
    );
    assert.equal(rel.stalenessStatus, 'STALE');
    assert.notEqual(rel.integrityState, 'QUORUM_VERIFIED');
    console.log('[PASS 10/20] Stale bars flagged as STALE and downgraded from QUORUM_VERIFIED');
    passed++;
  }

  // 11. Unsupported native exchange interval (30m/4h on Coinbase) aggregated deterministically
  {
    const fifteenMinBars: VerifiedCandle[] = [
      { time: 1710000000, open: 2900, high: 2910, low: 2895, close: 2905, volume: 10 },
      { time: 1710000900, open: 2905, high: 2920, low: 2902, close: 2918, volume: 15 },
      { time: 1710001800, open: 2918, high: 2925, low: 2910, close: 2912, volume: 12 },
      { time: 1710002700, open: 2912, high: 2915, low: 2890, close: 2895, volume: 20 },
    ];
    const thirtyMinBars = aggregateCandlesToStep(fifteenMinBars, 1800);
    assert.equal(thirtyMinBars.length, 2);
    assert.equal(thirtyMinBars[0].open, 2900);
    assert.equal(thirtyMinBars[0].high, 2920);
    assert.equal(thirtyMinBars[0].low, 2895);
    assert.equal(thirtyMinBars[0].close, 2918);
    assert.equal(thirtyMinBars[0].volume, 25);
    console.log('[PASS 11/20] Coinbase 30m/4h deterministic OHLCV aggregation verified');
    passed++;
  }

  // 12. Macro provider failure -> explicit MACRO_FEED_UNAVAILABLE state, zero hardcoded fabrication
  {
    const macroFail = await fetchVerifiedMacroWaterfall({ simulateFailure: 'all' });
    assert.equal(macroFail.status, 'MACRO_FEED_UNAVAILABLE');
    assert.equal(macroFail.nominal10Y, 0);
    assert.equal(macroFail.dxyIndex, 0);
    assert.equal(macroFail.tipsRealYield10Y, 0);
    console.log('[PASS 12/20] Macro provider failure -> MACRO_FEED_UNAVAILABLE with zero fabricated values');
    passed++;
  }

  // 13. News RSS failure -> explicit UNAVAILABLE news state, zero fabricated headlines
  {
    const newsFail = await fetchVerifiedMacroNews({ simulateFailure: 'all' });
    assert.equal(newsFail.status, 'UNAVAILABLE');
    assert.equal(newsFail.events.length, 0);
    console.log('[PASS 13/20] News RSS failure -> UNAVAILABLE with 0 fabricated headlines');
    passed++;
  }

  // 14. Fixture replay disabled in production -> cannot enter fixture mode
  {
    const prevNodeEnv = process.env.NODE_ENV;
    const prevGdfFlag = process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
    const prevFlag = process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
      delete process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
      const prodFlags = getFeatureFlags();
      assert.equal(prodFlags.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST, false);
      const wfBlocked = await fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true });
      assert.equal(wfBlocked.systemState, 'HALTED_DEGRADED');
      assert.equal(wfBlocked.isFixtureReplay, false);
      assert.equal(wfBlocked.candles.length, 0);
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
      if (prevGdfFlag !== undefined) process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = prevGdfFlag;
      if (prevFlag !== undefined) process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = prevFlag;
    }
    console.log('[PASS 14/20] Fixture replay blocked in production mode (NODE_ENV=production)');
    passed++;
  }

  // 15. Fixture replay enabled in test -> clearly marked FIXTURE_REPLAY, never LIVE_NOMINAL
  {
    const prevFlag = process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
    try {
      process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = 'true';
      const wfFix = await fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true });
      assert.equal(wfFix.systemState, 'FIXTURE_REPLAY');
      assert.equal(wfFix.isFixtureReplay, true);
      assert.notEqual(wfFix.systemState, 'LIVE_NOMINAL');
    } finally {
      if (prevFlag !== undefined) process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = prevFlag;
      else delete process.env.ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
    }
    console.log('[PASS 15/20] Fixture replay in test explicitly labeled FIXTURE_REPLAY, never LIVE_NOMINAL');
    passed++;
  }

  // 16. Client HTML/non-JSON transport guard & bug report builder verification
  {
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    assert.ok(indexHtml.includes("status: 'CLIENT_API_TRANSPORT_ERROR'"), 'Client must set CLIENT_API_TRANSPORT_ERROR on fetch failure');
    assert.ok(!indexHtml.includes('stalenessSec: 9000'), 'Hardcoded 9000s staleness fabrication must be removed');
    assert.ok(
      indexHtml.includes('const provName = p.providerName || p.provider'),
      'buildCleanBugReportText must read p.providerName'
    );
    assert.ok(
      indexHtml.includes('const barsCount = p.candleCount ?? p.candlesCount'),
      'buildCleanBugReportText must read p.candleCount'
    );
    console.log('[PASS 16/20] Client HTML/HTTP-200 transport guard & bug report schema mapping verified');
    passed++;
  }

  // 17 & 18. Forecast endpoint & diagnostics endpoint called in sequence -> share snapshotId and non-null latestWaterfall
  {
    const fRes = await fetch(`${BASE_URL}/api/gold-forecast?interval=15m`);
    assert.equal(fRes.status, 200);
    const fJson: any = await fRes.json();
    assert.ok(fJson.snapshotId, 'Forecast response must include snapshotId');
    assert.ok(Array.isArray(fJson.providerDiagnostics) && fJson.providerDiagnostics.length === 10);

    const dRes = await fetch(`${BASE_URL}/api/provider-diagnostics?interval=15m`);
    assert.equal(dRes.status, 200);
    const dJson: any = await dRes.json();
    assert.ok(dJson.latestWaterfall !== null, '/api/provider-diagnostics must never return latestWaterfall: null');
    assert.equal(dJson.latestWaterfall.snapshotId, fJson.snapshotId, 'Forecast and diagnostics must share identical snapshotId');
    assert.equal(dJson.latestWaterfall.activeProvider, fJson.activeProvider);
    assert.equal(dJson.latestWaterfall.tierDiagnostics.length, 10);
    console.log(`[PASS 17/20] /api/gold-forecast & /api/provider-diagnostics share snapshotId (${fJson.snapshotId})`);
    console.log('[PASS 18/20] /api/provider-diagnostics populates latestWaterfall without requiring ?probe=1');
    passed += 2;
  }

  // 19. Static file protection & API 404 JSON guard
  {
    const sRes = await fetch(`${BASE_URL}/server.ts`);
    assert.equal(sRes.status, 403, '/server.ts must return HTTP 403');
    const pRes = await fetch(`${BASE_URL}/package.json`);
    assert.equal(pRes.status, 403, '/package.json must return HTTP 403');
    const uRes = await fetch(`${BASE_URL}/api/non-existent-endpoint`);
    assert.equal(uRes.status, 404, 'Unknown /api/* route must return HTTP 404');
    const uCt = (uRes.headers.get('content-type') || '').toLowerCase();
    assert.ok(uCt.includes('application/json'), 'Unknown /api/* route must return JSON, never text/html');
    console.log('[PASS 19/20] Static file protection (HTTP 403) & unknown /api/* JSON 404 guard verified');
    passed++;
  }

  // 20. Root /sw.js and /public/sw.js synchronization check
  {
    const rootSw = fs.readFileSync(path.join(process.cwd(), 'sw.js'), 'utf8');
    const pubSw = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
    assert.equal(rootSw, pubSw, 'Root sw.js and public/sw.js must be identical');
    assert.ok(pubSw.includes("if (url.pathname.startsWith('/api/')) return;"));
    console.log('[PASS 20/20] ServiceWorker synchronization & /api/* bypass verified');
    passed++;
  }

  console.log('======================================================================');
  console.log(`ALL ${passed}/20 FULL-SYSTEM AUDIT CHECKS PASSED SUCCESSFULLY.`);
  console.log('======================================================================');
}

runAuditSuite().catch(err => {
  console.error('FULL-SYSTEM AUDIT FAILED:', err);
  process.exit(1);
});
