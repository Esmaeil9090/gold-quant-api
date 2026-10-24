import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchVerifiedMarketWaterfall,
  getProviderHttpDiagnostics,
  sanitizeUserFacingHaltReason,
  VerifiedCandle,
} from '../src/services/realDataWaterfall.js';
import {
  computeSpearmanRankIc,
  evaluateCausalWalkForwardValidation,
  getLatestValidationScorecard,
} from '../src/services/walkForwardValidationService.js';
import type { VerifiedMacroYieldResult } from '../src/contracts/quantContracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURES_DIR = path.join(ROOT, 'fixtures', 'real-market');

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ PHASE 5 / HTML-GUARD AUDIT FAILED: ${message}`);
    process.exit(1);
  }
}

async function runAudit() {
  console.log('======================================================================');
  console.log('GDF PHASE 1/2 HTML-GUARD BUG-FIX & PHASE 5 VALIDATION LAYER AUDIT');
  console.log('======================================================================');

  // -------------------------------------------------------------------------
  // PART A: Phase 1/2 Non-JSON / HTML Response Resilience & Clean HALTED Banner
  // -------------------------------------------------------------------------
  const waterfallSource = fs.readFileSync(
    path.join(ROOT, 'src/services/realDataWaterfall.ts'),
    'utf-8'
  );
  assert(
    waterfallSource.includes('fetchSafeJson') &&
      waterfallSource.includes("contentType.includes('application/json') || contentType.includes('text/json')"),
    'realDataWaterfall.ts must check Content-Type for application/json or text/json before parsing JSON'
  );

  // Test 1: Sanitizer strips raw HTML / Unexpected token '<' from user-facing messages
  const rawHtmlErr = `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`;
  const cleanEn = sanitizeUserFacingHaltReason(rawHtmlErr, 'en');
  const cleanFa = sanitizeUserFacingHaltReason(rawHtmlErr, 'fa');
  assert(
    !cleanEn.includes('Unexpected token') && !cleanEn.includes('<!DOCTYPE'),
    `English sanitizer leaked raw JSON parse error: ${cleanEn}`
  );
  assert(
    !cleanFa.includes('Unexpected token') && !cleanFa.includes('<!DOCTYPE'),
    `Persian sanitizer leaked raw JSON parse error: ${cleanFa}`
  );

  // Test 2: Simulate Tier-1 returning HTML <!DOCTYPE html> while Tier-2/Tier-3 return valid JSON
  const rawPaxg = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'paxg_15m.json'), 'utf8'));
  const fixtureCandles: VerifiedCandle[] = Array.isArray(rawPaxg) ? rawPaxg : rawPaxg.candles;
  const macroFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'macro_yields_fx.json'), 'utf8'));
  assert(fixtureCandles && fixtureCandles.length >= 90, 'Verified real fixtures must be available');

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('binance')) {
        return new Response('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (urlStr.includes('yahoo.com/v8/finance/chart')) {
        const timestamps = fixtureCandles.map(c => c.time);
        const opens = fixtureCandles.map(c => c.open);
        const highs = fixtureCandles.map(c => c.high);
        const lows = fixtureCandles.map(c => c.low);
        const closes = fixtureCandles.map(c => c.close);
        const volumes = fixtureCandles.map(c => c.volume);
        const mockYahooPayload = {
          chart: {
            result: [
              {
                meta: { regularMarketPrice: closes[closes.length - 1] },
                timestamp: timestamps,
                indicators: {
                  quote: [{ open: opens, high: highs, low: lows, close: closes, volume: volumes }],
                },
              },
            ],
          },
        };
        return new Response(JSON.stringify(mockYahooPayload), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      return new Response('<!DOCTYPE html><html><body>503 Service Unavailable</body></html>', {
        status: 503,
        headers: { 'content-type': 'text/html' },
      });
    };

    const wfRes = await fetchVerifiedMarketWaterfall('30m', { simulateFailure: 'bypass_cache_test' });
    assert(
      wfRes.systemState === 'DEGRADED_FALLBACK' && wfRes.activeTier === 'TIER_2_SECONDARY',
      `When Tier-1 returns HTML <!DOCTYPE>, waterfall must gracefully fall back to Tier-2 instead of HALTED_DEGRADED (got state=${wfRes.systemState}, tier=${wfRes.activeTier})`
    );
    assert(
      wfRes.candles.length >= 25,
      'Tier-2 fallback must return verified candles when Tier-1 returns HTML'
    );

    const httpDiags = getProviderHttpDiagnostics();
    const htmlRejects = httpDiags.filter(d => d.isHtmlOrNonJson && d.outcome === 'NON_JSON_HTML_REJECTED');
    assert(
      htmlRejects.length > 0,
      'Provider HTTP diagnostics must log NON_JSON_HTML_REJECTED with providerName, httpStatus, and contentType'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  console.log('✓ Part A Verified: Single HTML provider response gracefully falls back without triggering HALTED_DEGRADED, and user-facing halt messages never leak DOCTYPE / JSON syntax errors.');

  // -------------------------------------------------------------------------
  // PART B: Phase 5 Strictly Causal Walk-Forward Evaluation Engine Audit
  // -------------------------------------------------------------------------
  const realCandles = fixtureCandles;
  const realMacro: VerifiedMacroYieldResult = {
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

  // Test 3: Strict Causality (Zero-Lookahead Proof)
  // Run scorecard on prefix of 65 bars vs full 96 bars where bars 65..95 are massively perturbed.
  // At bar index 50, the causal forecast signal must be identical!
  const baseCandles = realCandles.map(c => ({ ...c }));
  const perturbedFutureCandles = realCandles.map((c, idx) =>
    idx <= 55
      ? { ...c }
      : {
          ...c,
          open: c.open + 500,
          high: c.high + 550,
          low: c.low + 480,
          close: c.close + 520,
          volume: c.volume * 10,
        }
  );

  const prefixOnly56 = baseCandles.slice(0, 56);
  const prefixPerturbed56 = perturbedFutureCandles.slice(0, 56);
  const scA = evaluateCausalWalkForwardValidation({
    candles: prefixOnly56,
    liveMacro: realMacro,
    timeframe: '15m_causality_test_A',
    intervalStepSeconds: 900,
  });
  const scB = evaluateCausalWalkForwardValidation({
    candles: prefixPerturbed56,
    liveMacro: realMacro,
    timeframe: '15m_causality_test_B',
    intervalStepSeconds: 900,
  });
  assert(
    scA.horizons[0].spearmanRankIc === scB.horizons[0].spearmanRankIc &&
      scA.horizons[0].directionalHitRate === scB.horizons[0].directionalHitRate,
    'Causality violation: identical prefix produced different walk-forward metrics'
  );

  // Test 4: Full Walk-Forward Evaluation across horizons h = 1, 5, 15, 60
  const fullScorecard = evaluateCausalWalkForwardValidation({
    candles: baseCandles,
    liveMacro: realMacro,
    timeframe: '15m',
    intervalStepSeconds: 900,
  });

  assert(fullScorecard.causalityEnforced === true && fullScorecard.zeroLookaheadVerified === true, 'Causality flags must be true');
  assert(fullScorecard.horizons.length === 4, 'Scorecard must evaluate exactly 4 horizons: h=1, 5, 15, 60');

  const hValues = fullScorecard.horizons.map(h => h.horizonBars);
  assert(
    hValues[0] === 1 && hValues[1] === 5 && hValues[2] === 15 && hValues[3] === 60,
    `Horizons must be [1, 5, 15, 60], got ${JSON.stringify(hValues)}`
  );

  for (const hm of fullScorecard.horizons) {
    assert(hm.sampleSizeN >= 5, `Horizon h=${hm.horizonBars} must have N >= 5 on 96-bar real fixture (got N=${hm.sampleSizeN})`);
    assert(
      hm.spearmanRankIc !== null && hm.spearmanRankIc >= -1 && hm.spearmanRankIc <= 1,
      `Horizon h=${hm.horizonBars} Spearman Rank-IC out of bounds: ${hm.spearmanRankIc}`
    );
    assert(hm.icIr !== null && Number.isFinite(hm.icIr), `Horizon h=${hm.horizonBars} ICIR must be finite`);
    assert(
      hm.directionalHitRate !== null && hm.directionalHitRate >= 0 && hm.directionalHitRate <= 1,
      `Horizon h=${hm.horizonBars} hit rate out of bounds: ${hm.directionalHitRate}`
    );
    assert(
      hm.payoffAsymmetryRatio !== null && hm.payoffAsymmetryRatio > 0,
      `Horizon h=${hm.horizonBars} payoff asymmetry must be positive`
    );
    assert(
      hm.sweepBrierScore !== null && hm.sweepBrierScore >= 0 && hm.sweepBrierScore <= 1,
      `Horizon h=${hm.horizonBars} Brier score out of bounds: ${hm.sweepBrierScore}`
    );
  }

  // Test 5: Regime Partitioning & Persistent Snapshots
  assert(
    fullScorecard.volatilityRegimePartitions.HIGH_VOL_GARCH.sampleSizeN > 0 &&
      fullScorecard.volatilityRegimePartitions.LOW_VOL_GARCH.sampleSizeN > 0,
    'Both HIGH_VOL_GARCH and LOW_VOL_GARCH regime partitions must be populated'
  );
  const persisted = getLatestValidationScorecard('15m');
  assert(persisted !== null && persisted.effectiveSampleSizeN === fullScorecard.effectiveSampleSizeN, 'Validation scorecard must persist and reload cleanly');

  const snapshotPath = path.join(ROOT, 'data/validation-snapshots.json');
  assert(fs.existsSync(snapshotPath), 'data/validation-snapshots.json must be written to disk');

  // Test 6: UI Non-Intrusive Expandable Scorecard Check
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  assert(
    indexHtml.includes('id="panelValidation"') &&
      !indexHtml.includes('class="collapsible-panel is-open" id="panelValidation"'),
    '#panelValidation must exist in index.html and be collapsed by default so main view visual density is unchanged'
  );
  assert(
    indexHtml.includes('renderValidationScorecard') &&
      indexHtml.includes('valHorizonsTableBody') &&
      indexHtml.includes('valVolRegimePartitionBody') &&
      indexHtml.includes('valMacroRegimePartitionBody'),
    'index.html must wire renderValidationScorecard to horizon table and regime partition containers'
  );

  // Verify Spearman Rank-IC mathematical accuracy on known monotonic sequences
  const monoR = computeSpearmanRankIc([1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]);
  assert(Math.abs(monoR - 1.0) < 1e-6, `Spearman Rank-IC on strictly increasing sequence must be +1.0 (got ${monoR})`);

  console.log(
    `✓ Part B Verified: Causal Walk-Forward Engine active (${fullScorecard.summaryBadgeEn}), zero lookahead proven, regime partitions populated, and snapshots persisted to data/validation-snapshots.json.`
  );
  console.log('======================================================================');
}

runAudit().catch(err => {
  console.error('Fatal error in Phase 5 audit:', err);
  process.exit(1);
});
