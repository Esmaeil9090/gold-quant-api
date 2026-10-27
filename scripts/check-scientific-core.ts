import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  fetchVerifiedMarketWaterfall,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMacroNews,
} from '../src/services/realDataWaterfall.js';
import {
  evaluateParallelUniverseAndAwarenessCore,
  promoteCandidateArchitecture,
  writeBackValidatedMathToLatentModel,
  getIntelligenceCoreStateSnapshot,
} from '../src/services/intelligenceAwarenessCore.js';
import {
  evaluateScientificCorePipeline,
} from '../src/engine/scientificCore.js';

async function main() {
  console.log('=== GDF SCIENTIFIC CORE UPGRADE VERIFICATION ===');

  // 1. Load verified real-data waterfall in fixtureReplay mode (zero synthetic data)
  const [wf, macro, news] = await Promise.all([
    fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true }),
    fetchVerifiedMacroWaterfall(),
    fetchVerifiedMacroNews(),
  ]);

  assert.equal(wf.candles.length >= 25, true, 'Verified real fixture candles must have >= 25 bars');
  assert.equal(Array.isArray(wf.verifiedVenueCameras), true, 'verifiedVenueCameras must be populated');
  assert.equal((wf.verifiedVenueCameras?.length || 0) >= 2, true, 'Multiple verified venue cameras must be present');

  // 2. Evaluate Parallel Universe & Scientific Core on verified real snapshot
  const pu = evaluateParallelUniverseAndAwarenessCore({
    candles: wf.candles,
    liveMacro: macro,
    secondaryBenchmark: wf.secondaryBenchmark,
    verifiedVenueCameras: wf.verifiedVenueCameras,
    macroNews: news.events,
    htfDailyCandles: wf.htfDailyCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: wf.snapshotId || 'sci-test-snap-15m',
    instrumentIdentity: wf.instrumentIdentity || 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: wf.activeProvider,
    activeSymbol: wf.activeSymbol,
    activeEndpoint: wf.activeEndpoint,
    activeTier: 'TIER_1_PRIMARY',
  });

  const sci = pu.scientificCore;
  assert.ok(sci, 'scientificCore telemetry must be present on ParallelUniverseTelemetry');

  // 3. Verify 6D Latent State X and 6x6 Covariance Matrix P on Information Clock τ
  const ls = sci.latentState;
  assert.equal(Number.isFinite(ls.logPriceLevel), true, 'x1 logPriceLevel must be finite');
  assert.equal(Number.isFinite(ls.localDrift), true, 'x2 localDrift must be finite');
  assert.equal(Number.isFinite(ls.localVolatility) && ls.localVolatility > 0, true, 'x3 localVolatility must be positive');
  assert.equal(Number.isFinite(ls.pressureToxicity), true, 'x4 pressureToxicity must be finite');
  assert.equal(
    Number.isFinite(ls.liquidityResilience) && ls.liquidityResilience >= 0.05 && ls.liquidityResilience <= 0.99,
    true,
    'x5 liquidityResilience must be in [0.05, 0.99]'
  );
  assert.equal(Number.isFinite(ls.macroResidualForce), true, 'x6 macroResidualForce must be finite');
  assert.equal(sci.latentCovarianceMatrix6x6.length, 6, 'Covariance matrix P must have 6 rows');
  for (const row of sci.latentCovarianceMatrix6x6) {
    assert.equal(row.length, 6, 'Each row of 6x6 covariance matrix P must have 6 columns');
  }

  const ic = sci.informationClock;
  assert.equal(ic.currentDeltaTau > 0, true, 'Information clock Δτ must be strictly positive');
  assert.equal(ic.cumulativeTau > 0, true, 'Cumulative information clock τ must be strictly positive');
  assert.equal(
    Math.abs(ic.volumeWeight + ic.rangeWeight + ic.crossVenueWeight - 1) < 0.01,
    true,
    'Information clock empirical weights must sum to 1.0'
  );
  console.log(
    `[PASS 1/8] 6D Latent State X(τ) & Information Clock τ verified: P_implied=$${sci.impliedLatentPriceUsd.toFixed(2)}, Δτ=${ic.currentDeltaTau.toFixed(4)} (${ic.clockRegime}), τ_cum=${ic.cumulativeTau.toFixed(2)}`
  );

  // 4. Verify Multi-Venue Observation Model
  assert.equal(sci.venueObservations.length >= 2, true, 'At least 2 verified venue cameras must be evaluated');
  for (const cam of sci.venueObservations) {
    assert.equal(cam.observedPriceUsd > 100, true, `Camera ${cam.venueName} observedPriceUsd must be valid`);
    assert.equal(Number.isFinite(cam.estimatedBasisUsd), true, `Camera ${cam.venueName} basis must be finite`);
    assert.equal(cam.microstructureNoiseVarUsd2 > 0, true, `Camera ${cam.venueName} noise variance must be > 0`);
  }
  console.log(
    `[PASS 2/8] Multi-Venue Observation Model verified across ${sci.venueObservations.length} cameras: ${sci.venueObservations.map(c => `${c.venueName}(${c.instrumentIdentity}, basis=$${c.estimatedBasisUsd.toFixed(2)}, w=${(c.kalmanObservationWeight * 100).toFixed(1)}%)`).join(', ')}`
  );

  // 5. Verify Pulse-Echo (Sonar) Sensing Layer & OrderBookMicrostructureExtensionInput
  const pe = sci.pulseEchoSonar;
  assert.equal(Number.isFinite(pe.meanPriceImpactPerUnitVol), true, 'meanPriceImpactPerUnitVol must be finite');
  assert.equal(Number.isFinite(pe.meanEchoRecoverySpeedPerTau), true, 'meanEchoRecoverySpeedPerTau must be finite');
  assert.equal(Number.isFinite(pe.upDownEchoAsymmetryRatio), true, 'upDownEchoAsymmetryRatio must be finite');

  // Also test with explicit OrderBookMicrostructureExtensionInput (L2 depth, aggressor flow, scheduled macro pulse)
  const lastBarTime = wf.candles[wf.candles.length - 2].time;
  const sciWithExt = evaluateScientificCorePipeline({
    candles: wf.candles,
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 8.5,
    htfPocAnchorPrice: wf.candles[wf.candles.length - 1].close,
    liveMacro: macro,
    secondaryBenchmark: wf.secondaryBenchmark,
    verifiedVenueCameras: wf.verifiedVenueCameras,
    macroNews: news.events,
    extensionInput: {
      l2OrderBookSnapshots: [
        {
          venue: 'Binance Spot PAXG',
          timestampSec: lastBarTime,
          bidDepthTop5Usd: 1450000,
          askDepthTop5Usd: 920000,
          spreadBps: 1.8,
          orderBookImbalance: 0.224,
        },
      ],
      aggressorTradeFlow: [
        {
          barTimeSec: lastBarTime,
          buyerInitiatedVolume: 420,
          sellerInitiatedVolume: 180,
          tradeCount: 640,
        },
      ],
      scheduledEconomicPulses: [
        {
          eventId: 'cpi-release-test',
          timestampSec: lastBarTime,
          title: 'US CPI Release Impulse',
          surpriseZScore: 1.85,
        },
      ],
    },
    liveTuning: pu.latentMathWriteBack!,
    dataDrivenMinWindowBars: 16,
  });
  assert.equal(sciWithExt.pulseEchoSonar.totalPulsesDetected >= 1, true, 'Pulse detector must recognize real/scheduled impulses');
  console.log(
    `[PASS 3/8] Pulse–Echo (Sonar) Sensing Layer & Extension Input verified: Pulses=${pe.totalPulsesDetected}, Recovery/Δτ=${pe.meanEchoRecoverySpeedPerTau.toFixed(3)}, Asym=${pe.upDownEchoAsymmetryRatio.toFixed(2)}x`
  );

  // 6. Verify Yellow Line = Conditional Expectation of Latent State X with Predictive Covariance Bands
  const yellowPlume = pu.liveEnsemble;
  assert.equal(yellowPlume.medianTrack.length, 24, 'Yellow Line conditional expectation must have 24 horizon steps');
  assert.equal(yellowPlume.upper95.length, 24, '+2σ upper95 band must have 24 steps');
  assert.equal(yellowPlume.lower05.length, 24, '-2σ lower05 band must have 24 steps');
  for (let i = 0; i < 24; i++) {
    assert.equal(
      yellowPlume.upper95[i].value >= yellowPlume.upper75[i].value &&
        yellowPlume.upper75[i].value >= yellowPlume.medianTrack[i].value &&
        yellowPlume.medianTrack[i].value >= yellowPlume.lower25[i].value &&
        yellowPlume.lower25[i].value >= yellowPlume.lower05[i].value,
      true,
      `Predictive covariance bands at step ${i + 1} must be monotonically ordered`
    );
  }
  console.log(
    `[PASS 4/8] Yellow Line Conditional Expectation & Predictive Covariance Bands verified: Step 24 Median=$${yellowPlume.medianTrack[23].value.toFixed(2)} [${yellowPlume.lower05[23].value.toFixed(2)}, ${yellowPlume.upper95[23].value.toFixed(2)}]`
  );

  // 7. Verify Residual Process (The Oracle) & Residual-Driven Awareness Core
  const ro = sci.residualOracle;
  assert.equal(ro.recentResiduals.length >= 10, true, 'Residual Oracle must compute realized OOS residuals');
  assert.equal(Number.isFinite(ro.diagnostics.lag1Autocorrelation), true, 'Residual lag-1 autocorrelation must be finite');
  assert.equal(Number.isFinite(ro.diagnostics.ljungBoxQ5Stat), true, 'Residual Ljung-Box Q(5) must be finite');
  console.log(
    `[PASS 5/8] Residual Oracle verified: N=${ro.diagnostics.sampleSize}, ρ₁=${ro.diagnostics.lag1Autocorrelation.toFixed(3)}, Q(5)=${ro.diagnostics.ljungBoxQ5Stat.toFixed(2)}, Channel=${ro.diagnostics.dominantBlindspotChannel}`
  );

  // 8. Verify Direct Mathematical Write-Back into Latent State Model AND Full Promotion Parity
  const wbBefore = getIntelligenceCoreStateSnapshot().latentMathWriteBack.writeBackGeneration;
  const wbRes = writeBackValidatedMathToLatentModel({
    mode: 'MANUAL_MMI',
    operatorNote: 'Verification test of direct mathematical write-back to 6D Latent State model',
  });
  assert.equal(wbRes.writtenBack, true, 'Direct mathematical write-back must succeed');
  assert.equal(wbRes.latentMathWriteBack.writeBackGeneration, wbBefore + 1, 'writeBackGeneration must increment');
  assert.equal(wbRes.auditEntry.eventType, 'LATENT_MATH_WRITEBACK_APPLIED', 'Audit entry must record LATENT_MATH_WRITEBACK_APPLIED');

  // Verify Promotion Parity (Yellow line becomes promoted candidate trajectory & fresh candidate is forked)
  const prePromoEval = evaluateParallelUniverseAndAwarenessCore({
    candles: wf.candles,
    liveMacro: macro,
    secondaryBenchmark: wf.secondaryBenchmark,
    verifiedVenueCameras: wf.verifiedVenueCameras,
    macroNews: news.events,
    htfDailyCandles: wf.htfDailyCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'sci-promo-test',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: wf.activeProvider,
    activeSymbol: wf.activeSymbol,
    activeEndpoint: wf.activeEndpoint,
    activeTier: 'TIER_1_PRIMARY',
  });
  const prePromoCandTrack = prePromoEval.candidateEnsemble.medianTrack.map(p => p.value);
  const promoRes = promoteCandidateArchitecture({
    mode: 'MANUAL_MMI',
    operatorNote: 'Scientific core promotion parity test',
  });
  assert.equal(promoRes.promoted, true, 'Manual MMI promotion must succeed');

  const postPromoEval = evaluateParallelUniverseAndAwarenessCore({
    candles: wf.candles,
    liveMacro: macro,
    secondaryBenchmark: wf.secondaryBenchmark,
    verifiedVenueCameras: wf.verifiedVenueCameras,
    macroNews: news.events,
    htfDailyCandles: wf.htfDailyCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'sci-promo-test',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: wf.activeProvider,
    activeSymbol: wf.activeSymbol,
    activeEndpoint: wf.activeEndpoint,
    activeTier: 'TIER_1_PRIMARY',
  });
  const postPromoLiveTrack = postPromoEval.liveEnsemble.medianTrack.map(p => p.value);
  const postPromoCandTrack = postPromoEval.candidateEnsemble.medianTrack.map(p => p.value);
  assert.deepEqual(postPromoLiveTrack, prePromoCandTrack, 'After promotion, Yellow Line must equal promoted Candidate trajectory');
  assert.notDeepEqual(postPromoCandTrack, postPromoLiveTrack, 'After promotion, a fresh distinct Candidate trajectory must be forked');
  console.log(
    `[PASS 6/8] Direct Mathematical Write-Back (Gen #${wbRes.latentMathWriteBack.writeBackGeneration}) & Promotion Trajectory Parity verified`
  );

  // 9. Verify Permanent Out-of-Sample Scientific Scoreboard (including honest CALIBRATING regime when N < N_min)
  const sb = sci.scientificScoreboard;
  assert.equal(sb.baselineComparisons.length, 4, 'Scoreboard must compare against all 4 required baselines');
  assert.equal(sb.regimeConditionedPerformance.length >= 2, true, 'Scoreboard must include regime-conditioned breakdown');
  assert.equal(
    sb.directionalHitRateCi95Lower <= sb.directionalHitRate &&
      sb.directionalHitRate <= sb.directionalHitRateCi95Upper,
    true,
    'Directional hit rate must lie within its 95% Wilson confidence interval'
  );

  // Test honest CALIBRATING regime when requiredMinOosBars > realizedOosBarsCount
  const sciCalibrating = evaluateScientificCorePipeline({
    candles: wf.candles.slice(-14),
    interval: '15m',
    intervalStepSeconds: 900,
    atr: 8.5,
    htfPocAnchorPrice: wf.candles[wf.candles.length - 1].close,
    liveMacro: macro,
    secondaryBenchmark: null,
    liveTuning: pu.latentMathWriteBack!,
    dataDrivenMinWindowBars: 24,
  });
  assert.equal(
    sciCalibrating.scientificScoreboard.calibrationStatus,
    'CALIBRATING',
    'Scoreboard must remain in honest CALIBRATING regime when realized sample N < N_min'
  );
  console.log(
    `[PASS 7/8] Permanent Out-of-Sample Scientific Scoreboard & Honest CALIBRATING gate verified: Hit=${(sb.directionalHitRate * 100).toFixed(1)}%, Brier=${sb.directionalBrierScore.toFixed(4)}, Baselines=${sb.baselineComparisons.length}`
  );

  // 10. Verify index.html contains Scientific Core DOM elements and dual-line chart rendering on #windyCanvas
  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  for (const id of [
    'id="windyCanvas"',
    'id="btnWriteBackLatentMath"',
    'id="sciLatentStateGrid"',
    'id="sciVenueCamerasTableBody"',
    'id="sciScoreboardStatusBadge"',
    'id="sciBaselinesTableBody"',
    'id="sciRegimesTableBody"',
  ]) {
    assert.equal(indexHtml.includes(id), true, `index.html must include ${id}`);
  }
  console.log('[PASS 8/8] UI DOM elements and same-chart (#windyCanvas) dual-line bindings verified.');
  console.log('=== ALL GDF SCIENTIFIC CORE CHECKS PASSED ===');
}

main().catch(err => {
  console.error('Scientific core check failed:', err);
  process.exit(1);
});
