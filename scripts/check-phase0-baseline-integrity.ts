import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  alignBenchmarkCandlesByTimestamp,
  assertVerifiedProvenance,
  fetchCoinbaseSpotPaxgCandles,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
  normalizeAndDeduplicateCandles,
  VerifiedCandle,
} from '../src/services/realDataWaterfall.js';

function makeValidCandles(count: number, startSec = 1729700000, stepSec = 900): VerifiedCandle[] {
  const arr: VerifiedCandle[] = [];
  for (let i = 0; i < count; i++) {
    const base = 2740 + i * 0.25;
    arr.push({
      time: startSec + i * stepSec,
      open: base,
      high: base + 1.5,
      low: base - 1.2,
      close: base + 0.4,
      volume: 15 + i,
    });
  }
  return arr;
}

async function runPhase0BaselineIntegrityCheck(): Promise<void> {
  console.log('=== GDF TICKET 0: BASELINE & DATA INTEGRITY VERIFICATION ===');

  // 1. Strict Provenance: Reject duplicate timestamps, out-of-order bars, and invalid OHLC envelopes
  {
    const dupCandles = makeValidCandles(25);
    dupCandles[10] = { ...dupCandles[9] };
    assert.throws(
      () =>
        assertVerifiedProvenance(dupCandles, {
          providerName: 'TestVenue',
          symbol: 'PAXGUSDT',
          endpoint: 'https://example.com',
          tier: 'TIER_1_PRIMARY',
        }),
      /PROVENANCE_VIOLATION: Non-monotonic or duplicate bar timestamps/,
      'assertVerifiedProvenance must reject duplicate bar timestamps'
    );

    const badEnvelopeCandles = makeValidCandles(25);
    badEnvelopeCandles[5] = {
      ...badEnvelopeCandles[5],
      open: 2750,
      close: 2755,
      high: 2752, // high < close -> invalid OHLC envelope
      low: 2748,
    };
    assert.throws(
      () =>
        assertVerifiedProvenance(badEnvelopeCandles, {
          providerName: 'TestVenue',
          symbol: 'PAXGUSDT',
          endpoint: 'https://example.com',
          tier: 'TIER_1_PRIMARY',
        }),
      /PROVENANCE_VIOLATION: Malformed OHLCV bar/,
      'assertVerifiedProvenance must reject bars where high < max(open, close)'
    );

    const cleaned = normalizeAndDeduplicateCandles(dupCandles);
    assert.equal(cleaned.length, 24, 'normalizeAndDeduplicateCandles must remove duplicate timestamps');
    assertVerifiedProvenance(cleaned, {
      providerName: 'TestVenue',
      symbol: 'PAXGUSDT',
      endpoint: 'https://example.com',
      tier: 'TIER_1_PRIMARY',
    });
    console.log('✓ [1/6] Strict timestamp monotonicity, deduplication, and OHLC envelope guard verified');
  }

  // 2. Coinbase 30m (900s -> 1800s) and 4h (3600s -> 14400s) aggregation
  {
    const originalFetch = globalThis.fetch;
    try {
      const requestedUrls: string[] = [];
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        requestedUrls.push(urlStr);
        const is1h = urlStr.includes('granularity=3600');
        const step = is1h ? 3600 : 900;
        const start = 1729728000; // divisible by 14400 and 1800
        const rows: number[][] = [];
        // Coinbase returns newest-first: [time, low, high, open, close, volume]
        for (let i = 119; i >= 0; i--) {
          const t = start + i * step;
          const p = 2735 + (i % 10);
          rows.push([t, p - 2, p + 3, p, p + 1, 10]);
        }
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      const cb30m = await fetchCoinbaseSpotPaxgCandles('30m');
      assert.ok(
        requestedUrls.some(u => u.includes('granularity=900')),
        'Coinbase 30m must request native 900s granularity before aggregating'
      );
      assert.ok(cb30m.candles.length >= 25, 'Coinbase 30m aggregated series must have >= 25 bars');
      assert.equal(
        cb30m.candles[1].time - cb30m.candles[0].time,
        1800,
        'Coinbase 30m bars must be spaced by exactly 1800s (30 minutes)'
      );

      const cb4h = await fetchCoinbaseSpotPaxgCandles('4h');
      assert.ok(
        requestedUrls.some(u => u.includes('granularity=3600')),
        'Coinbase 4h must request native 3600s granularity before aggregating'
      );
      assert.ok(cb4h.candles.length >= 25, 'Coinbase 4h aggregated series must have >= 25 bars');
      assert.equal(
        cb4h.candles[1].time - cb4h.candles[0].time,
        14400,
        'Coinbase 4h bars must be spaced by exactly 14400s (4 hours)'
      );
      console.log('✓ [2/6] Coinbase 30m (1800s) and 4h (14400s) exact interval aggregation verified');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // 3. Fixture Replay separation from LIVE_NOMINAL & production block
  {
    const prevAllow = process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
    try {
      process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = 'true';
      const replayRes = await fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true });
      assert.equal(
        replayRes.systemState,
        'FIXTURE_REPLAY',
        'Fixture replay must report systemState=FIXTURE_REPLAY, never LIVE_NOMINAL'
      );
      assert.equal(replayRes.isFixtureReplay, true, 'Fixture replay must set isFixtureReplay=true');
      assert.equal(replayRes.activeTier, 'FIXTURE_TEST_REPLAY');

      process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = 'false';
      const blockedRes = await fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true });
      assert.equal(
        blockedRes.systemState,
        'HALTED_DEGRADED',
        'Fixture replay must be blocked and return HALTED_DEGRADED when ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST is false'
      );
      assert.equal(blockedRes.candles.length, 0);
      console.log('✓ [3/6] Fixture replay state separation (FIXTURE_REPLAY) and production block verified');
    } finally {
      if (prevAllow === undefined) {
        delete process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST;
      } else {
        process.env.GDF_ALLOW_VERIFIED_FIXTURE_REPLAY_IN_TEST = prevAllow;
      }
    }
  }

  // 4. Zero hardcoded macro fallback values when partial macro series fail
  {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input: string | URL | Request): Promise<Response> => {
        const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (urlStr.includes('%5ETNX')) {
          return new Response(
            JSON.stringify({
              chart: { result: [{ meta: { regularMarketPrice: 4.38 } }] },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        // Simulate failure of DXY and all FRED series
        return new Response('Upstream unavailable', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        });
      };

      const partialMacro = await fetchVerifiedMacroWaterfall({ simulateFailure: 'bypass_cache_test' });
      assert.equal(partialMacro.nominal10Y, 4.38, 'Observed 10Y yield must be preserved');
      assert.equal(partialMacro.dxyIndex, 0, 'Missing DXY must be 0, never hardcoded 101.68');
      assert.equal(partialMacro.breakevenInflation10Y, 0, 'Missing breakeven must be 0, never hardcoded 2.28');
      assert.equal(partialMacro.tipsRealYield10Y, 0, 'Unobserved TIPS real yield must be 0');
      assert.equal(partialMacro.dollarDrag, 0, 'Unobserved DXY must produce 0 dollarDrag');
      assert.equal(partialMacro.realYieldGravity, 0, 'Unobserved TIPS must produce 0 realYieldGravity');
      assert.equal(partialMacro.status, 'DEGRADED_SINGLE_SOURCE');
      assert.ok(
        Array.isArray(partialMacro.missingSeries) && partialMacro.missingSeries.includes('dxyIndex'),
        'missingSeries must record unobserved macro series'
      );
      console.log('✓ [4/6] Zero hardcoded macro fallback values on partial provider failure verified');
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  // 5. Cross-venue timestamp alignment across market session gaps
  {
    const primary = makeValidCandles(30, 1729700000, 900);
    // Create a benchmark series where the first 10 bars are missing (simulating a COMEX market break)
    // and each benchmark close is exactly $5.00 below the matching timestamp's primary close
    const benchmark = primary.slice(10).map(c => ({
      ...c,
      close: parseFloat((c.close - 5.0).toFixed(2)),
    }));
    const aligned = alignBenchmarkCandlesByTimestamp(primary, benchmark, 440);
    assert.equal(aligned.length, 20, 'alignBenchmarkCandlesByTimestamp must align only matching timestamps');
    for (const pair of aligned) {
      assert.equal(pair.primary.time, pair.benchmark.time, 'Aligned pairs must have identical timestamps');
      assert.ok(
        Math.abs(pair.primary.close - pair.benchmark.close - 5.0) < 1e-6,
        'Timestamp-aligned spread must equal exact $5.00 difference without index shift distortion'
      );
    }
    console.log('✓ [5/6] Cross-venue UTC timestamp alignment across session gaps verified');
  }

  // 6. Static root exposure security & deployment/TypeScript config audit
  {
    const serverSrc = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    assert.ok(
      !serverSrc.includes('app.use(express.static(__dirname))'),
      'server.ts must not expose workspace root via express.static(__dirname)'
    );
    assert.ok(
      serverSrc.includes("lowerPath === '/server.ts'") && serverSrc.includes("lowerPath.startsWith('/src/')"),
      'server.ts must explicitly forbid direct HTTP access to /server.ts and /src/*'
    );

    const renderYaml = fs.readFileSync(path.join(process.cwd(), 'render.yaml'), 'utf8');
    assert.ok(
      renderYaml.includes('env: node') && !renderYaml.includes('gunicorn'),
      'render.yaml must use Node runtime instead of legacy Python/Gunicorn'
    );

    const tsconfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tsconfig.json'), 'utf8'));
    assert.ok(
      Array.isArray(tsconfig.include) &&
        tsconfig.include.includes('src/**/*.ts') &&
        tsconfig.include.includes('scripts/**/*.ts'),
      'tsconfig.json must include src/**/*.ts and scripts/**/*.ts'
    );
    console.log('✓ [6/6] Static file security, render.yaml Node runtime, and tsconfig coverage verified');
  }

  console.log('=== ALL TICKET 0 BASELINE & DATA INTEGRITY CHECKS PASSED ===');
}

runPhase0BaselineIntegrityCheck().catch(err => {
  console.error('Phase 0 Baseline Integrity Check Failed:', err);
  process.exit(1);
});
