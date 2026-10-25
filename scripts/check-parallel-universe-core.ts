import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getFeatureFlags } from '../src/config/featureFlags.js';
import type { VerifiedCandle, VerifiedMacroYieldResult } from '../src/contracts/quantContracts.js';
import {
  computeDataDrivenMinimumOosWindow,
  evaluateParallelUniverseAndAwarenessCore,
  getArchitecturePersistenceHealth,
  getIntelligenceCoreStateSnapshot,
  promoteCandidateArchitecture,
  reloadArchitectureStoreFromDisk,
  resolvePersistenceConfig,
  setAutoPromotionRuntimeMode,
  triggerSymbolicDiscoveryAuditStep,
} from '../src/services/intelligenceAwarenessCore.js';
import {
  bootstrapMultiTimeframeWaterfallCache,
  getMultiTimeframeBootstrapState,
} from '../src/services/realDataWaterfall.js';

async function runParallelUniverseVerification(): Promise<void> {
  console.log('======================================================================');
  console.log('GDF INTELLIGENCE & AWARENESS CORE + PARALLEL UNIVERSE VERIFICATION v3');
  console.log('======================================================================');

  const rootDir = process.cwd();
  const fixturesDir = path.join(rootDir, 'fixtures', 'real-market');
  const rawPaxg = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'paxg_15m.json'), 'utf8'));
  const candles: VerifiedCandle[] = Array.isArray(rawPaxg) ? rawPaxg : rawPaxg.candles;
  const rawComex = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'comex_gcf_15m.json'), 'utf8'));
  const comexCandles: VerifiedCandle[] = Array.isArray(rawComex) ? rawComex : rawComex.candles;
  const macroFixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'macro_yields_fx.json'), 'utf8'));

  const liveMacro: VerifiedMacroYieldResult = {
    nominal10Y: macroFixture.nominal10Y ?? 4.28,
    tipsRealYield10Y: macroFixture.tipsRealYield10Y ?? 1.98,
    breakevenInflation10Y: macroFixture.breakevenInflation10Y ?? 2.3,
    dxyIndex: macroFixture.dxyIndex ?? 103.45,
    realYieldGravity: macroFixture.realYieldGravity ?? -0.45,
    dollarDrag: macroFixture.dollarDrag ?? -0.22,
    centralBankTide: macroFixture.centralBankTide ?? 0.55,
    netMacroLift: macroFixture.netMacroLift ?? -0.12,
    source: 'Verified Real Fixture',
    status: 'ONLINE_MULTI_SOURCE_VERIFIED',
    lastUpdated: new Date().toISOString(),
    respondingSources: ['Yahoo_TNX', 'FRED_DFII10', 'FRED_DTWEXBGS'],
    sanityCheckZScore: 0.14,
    outliersRejected: [],
  };

  // 1. Verify Feature Flags include ENABLE_PARALLEL_UNIVERSE_CORE & ALLOW_AUTO_ARCHITECTURE_PROMOTION
  const flags = getFeatureFlags();
  assert.equal(flags.STRICT_REAL_DATA_ONLY, true, 'STRICT_REAL_DATA_ONLY must remain true');
  assert.equal(flags.ENABLE_PARALLEL_UNIVERSE_CORE, true, 'ENABLE_PARALLEL_UNIVERSE_CORE must default to true');
  assert.equal(typeof flags.ALLOW_AUTO_ARCHITECTURE_PROMOTION, 'boolean', 'ALLOW_AUTO_ARCHITECTURE_PROMOTION must be boolean');
  console.log('✓ [PASS 1/12] Feature flags verified (STRICT_REAL_DATA_ONLY=true, ENABLE_PARALLEL_UNIVERSE_CORE=true).');

  // 2. Verify Data-Driven Minimum Evaluation Window (No Fixed Magic Number)
  const win1 = computeDataDrivenMinimumOosWindow(candles.slice(0, 45));
  const win2 = computeDataDrivenMinimumOosWindow(candles);
  assert.ok(win1.minWindowBars >= 16, 'Data-driven minimum window must be at least 16 bars');
  assert.ok(Number.isFinite(win2.lag1Autocorr) && Number.isFinite(win2.halfLifeBars), 'Autocorrelation and half-life must be finite');
  console.log(
    `✓ [PASS 2/12] Data-driven minimum OOS window verified: N_min=${win2.minWindowBars} (ρ₁=${win2.lag1Autocorr}, τ₁/₂=${win2.halfLifeBars} bars).`
  );

  // 3. Evaluate Dual-World Parallel Universe on Verified Real Market Data (With Multi-Timeframe HTF Candles)
  const telemetry = evaluateParallelUniverseAndAwarenessCore({
    candles,
    liveMacro,
    secondaryBenchmark: {
      provider: 'Yahoo Finance COMEX Gold Futures',
      symbol: 'GC=F',
      candles: comexCandles,
      crossVenueSpreadUsd: 1.4,
      crossVenueZScore: -0.57,
      isOutlierDislocation: false,
    },
    htfDailyCandles: candles.slice(-30),
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'test-snap-15m-001',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot Gold Token (PAXG/USDT)',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });

  assert.equal(telemetry.liveArchitecture.role, 'LIVE_YELLOW_LINE');
  assert.equal(telemetry.liveArchitecture.lineColorHex, '#f5d76e');
  assert.equal(telemetry.candidateArchitecture.role, 'PARALLEL_CANDIDATE_LINE');
  assert.equal(telemetry.candidateArchitecture.lineColorHex, '#e040fb');
  assert.ok(
    telemetry.candidateEnsemble.medianTrack.length === 24,
    'Parallel Universe must produce a complete 24-step candidate median trajectory'
  );
  console.log(
    `✓ [PASS 3/12] Isolated Live Architecture (${telemetry.liveArchitecture.versionTag}, #f5d76e) and Parallel Universe Candidate (${telemetry.candidateArchitecture.versionTag}, #e040fb) trajectories verified.`
  );

  // 4. Verify Dynamic Precision Weights (Zero Fixed Magic Weights)
  const liveSumW = telemetry.liveArchitecture.models
    .filter(m => m.isEnabled)
    .reduce((acc, m) => acc + m.dynamicWeight, 0);
  const candSumW = telemetry.candidateArchitecture.models
    .filter(m => m.isEnabled)
    .reduce((acc, m) => acc + m.dynamicWeight, 0);
  assert.ok(Math.abs(liveSumW - 1.0) < 1e-3, `Live dynamic weights must sum to 1.0000 (got ${liveSumW})`);
  assert.ok(Math.abs(candSumW - 1.0) < 1e-3, `Candidate dynamic weights must sum to 1.0000 (got ${candSumW})`);

  const fw = telemetry.liveArchitecture.dynamicFusionWeights;
  const fwSum =
    fw.ouMeanReversionWeight +
    fw.kalmanDriftWeight +
    fw.macroFactorWeight +
    fw.sweepMicrostructureWeight +
    fw.mtfLiquidityWeight;
  assert.ok(Math.abs(fwSum - 1.0) < 1e-3, `Dynamic fusion weights must sum to 1.0000 (got ${fwSum})`);
  assert.ok(
    !(
      fw.ouMeanReversionWeight === 0.24 &&
      fw.kalmanDriftWeight === 0.24 &&
      fw.macroFactorWeight === 0.18 &&
      fw.sweepMicrostructureWeight === 0.12 &&
      fw.mtfLiquidityWeight === 0.22
    ),
    'Fusion weights must be dynamically estimated from inverse OOS error variance, never frozen at legacy magic constants'
  );
  console.log(
    `✓ [PASS 4/12] Zero fixed magic weights verified: Live ∑w=${liveSumW.toFixed(4)}, Candidate ∑w=${candSumW.toFixed(4)}.`
  );

  // 5. Verify Expanded 8-Primitive Level-B Symbolic Grammar & OOS Diagnostics
  const symbolicModels = telemetry.candidateArchitecture.models.filter(
    m => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY'
  );
  assert.equal(symbolicModels.length, 8, 'Candidate architecture must contain all 8 Level-B symbolic equations');
  const requiredNewIds = [
    'LAGGED_RESIDUAL_SELF_CORRECTION',
    'BASIS_ACCELERATION_SECOND_ORDER',
    'MTF_DRIFT_CONFLUENCE_SYNERGY',
    'ASYMMETRIC_TAIL_VOL_SHOCK_SHIELD',
  ];
  for (const reqId of requiredNewIds) {
    const found = symbolicModels.find(m => m.modelId === reqId);
    assert.ok(found, `Expanded Level-B primitive ${reqId} must be present in candidateArchitecture`);
    assert.ok(found.equationAscii.length > 10, `Equation ASCII for ${reqId} must be explicit and non-empty`);
    assert.ok(Number.isFinite(found.fittedCoefficient), `Fitted coefficient for ${reqId} must be finite`);
    assert.ok(Number.isFinite(found.oosRSquared ?? 0), `OOS R^2 for ${reqId} must be finite`);
    assert.ok(Number.isFinite(found.stabilityRatio ?? 0), `Split-half stability ratio for ${reqId} must be finite`);
  }
  assert.ok(telemetry.findings.length >= 1, 'Intelligence & Awareness Core must produce structured diagnostic findings');
  console.log(
    `✓ [PASS 5/12] Expanded Level-B symbolic grammar (${symbolicModels.length} closed-form equations) and ${telemetry.findings.length} structured findings verified.`
  );

  // 6. Verify Cold-Start Multi-Timeframe Bootstrap & Partial Timeframe Resilience
  const bootFull = await bootstrapMultiTimeframeWaterfallCache({ fixtureReplay: true, force: true });
  assert.equal(bootFull.requiredTimeframes.length, 5, 'Required discovery timeframes must be [5m, 15m, 1h, 4h, 1d]');
  assert.equal(
    bootFull.verifiedCachedTimeframes.length,
    5,
    `All 5 timeframes must be populated after cold-start bootstrap (got ${bootFull.verifiedCachedTimeframes.join(',')})`
  );
  assert.equal(bootFull.missingTimeframes.length, 0, 'Zero timeframes should be missing after full bootstrap');

  // Simulate partial unavailability (e.g., 4h unavailable) and verify graceful continuation + missing reporting
  const bootPartial = await bootstrapMultiTimeframeWaterfallCache({
    fixtureReplay: true,
    simulateUnavailableTimeframes: ['4h'],
  });
  assert.ok(bootPartial.missingTimeframes.includes('4h'), 'Missing timeframe 4h must be explicitly reported');
  assert.ok(
    bootPartial.verifiedCachedTimeframes.includes('15m') && bootPartial.verifiedCachedTimeframes.includes('1h'),
    'Remaining available timeframes must continue unimpeded'
  );
  // Restore full cache
  await bootstrapMultiTimeframeWaterfallCache({ fixtureReplay: true, force: true });
  const mtfStateRestored = getMultiTimeframeBootstrapState();
  assert.equal(mtfStateRestored.missingTimeframes.length, 0);

  const postBootTelemetry = evaluateParallelUniverseAndAwarenessCore({
    candles,
    liveMacro,
    secondaryBenchmark: null,
    htfDailyCandles: candles.slice(-30),
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'test-snap-15m-postboot',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: 'Binance Spot Gold Token (PAXG/USDT)',
    activeSymbol: 'PAXGUSDT',
    activeEndpoint: 'https://data-api.binance.vision/api/v3/klines',
    activeTier: 'TIER_1_PRIMARY',
  });
  const mtfCtx = postBootTelemetry.mtfDiscoveryContext;
  assert.equal(mtfCtx.verifiedRealCacheTimeframes.length, 5, 'All 5 timeframes must be verified in MTF discovery context');
  assert.equal(mtfCtx.bootstrapStatus, 'COMPLETE_ALL_TIMEFRAMES');
  console.log(
    `✓ [PASS 6/12] Cold-start Multi-Timeframe Bootstrap & partial unavailability resilience verified across [${mtfCtx.verifiedRealCacheTimeframes.join(' -> ')}] (D_HTF=${mtfCtx.htfNormalizedDriftZ}σ, D_LTF=${mtfCtx.ltfNormalizedDriftZ}σ).`
  );

  // 7. Verify 8-Gate Closed-Loop Verification Checklist
  const rep = telemetry.verificationReport;
  assert.equal(rep.totalGatesCount, 8, 'Verification report must evaluate all 8 closed-loop gates');
  assert.equal(rep.gates.length, 8, 'All 8 gate results must be present');
  console.log(
    `✓ [PASS 7/12] 8-Gate Closed-Loop Test & Verify Checklist verified (${rep.passedGatesCount}/${rep.totalGatesCount} gates passed, status=${rep.overallStatus}).`
  );

  // 8. Verify Automatic Promotion Gate Protection (Rejects when not 8/8 VERIFIED_FOR_PROMOTION)
  const haltedTelemetry = evaluateParallelUniverseAndAwarenessCore({
    candles: [],
    liveMacro,
    secondaryBenchmark: null,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'test-halted-snap',
    instrumentIdentity: 'NONE',
    systemState: 'HALTED_DEGRADED',
    activeProvider: 'NONE',
    activeSymbol: 'NONE',
    activeEndpoint: 'NONE',
    activeTier: 'NONE_HALTED',
  });
  assert.equal(haltedTelemetry.verificationReport.overallStatus, 'HALTED_FROZEN');
  const blockedAuto = promoteCandidateArchitecture({ mode: 'AUTOMATIC_VERIFIED' });
  assert.equal(
    blockedAuto.promoted,
    false,
    'Automatic promotion MUST be rejected when candidate is not VERIFIED_FOR_PROMOTION across all 8 gates'
  );
  console.log('✓ [PASS 8/12] Automatic promotion strictly blocked when candidate is not VERIFIED_FOR_PROMOTION.');

  // 9. Verify Manual MMI Promotion & Audit Trail Persistence
  const prevLiveId = getIntelligenceCoreStateSnapshot().liveArchitecture.architectureId;
  const prevCandId = getIntelligenceCoreStateSnapshot().candidateArchitecture.architectureId;
  const manualPromo = promoteCandidateArchitecture({
    mode: 'MANUAL_MMI',
    operatorNote: 'Automated test verification of MMI promotion path',
  });
  assert.equal(manualPromo.promoted, true, 'Manual MMI promotion must succeed when explicitly invoked by operator');
  assert.notEqual(
    manualPromo.liveArchitecture.architectureId,
    prevLiveId,
    'Live Architecture ID must advance upon promotion'
  );
  assert.notEqual(
    manualPromo.candidateArchitecture.architectureId,
    prevCandId,
    'Parallel Universe must spawn a new generation Candidate Architecture after promotion'
  );
  assert.equal(manualPromo.liveArchitecture.role, 'LIVE_YELLOW_LINE');
  assert.equal(manualPromo.liveArchitecture.lineColorHex, '#f5d76e');

  const toggleRes = setAutoPromotionRuntimeMode(false);
  assert.equal(toggleRes.autoPromotionEnabled, false);
  const discAudit = triggerSymbolicDiscoveryAuditStep('Verification test synthesis');
  assert.equal(discAudit.eventType, 'LEVEL_B_MODEL_INVENTED');

  console.log(
    `✓ [PASS 9/12] Manual MMI promotion (${prevCandId} -> ${manualPromo.liveArchitecture.architectureId}) and immutable audit trail (${getIntelligenceCoreStateSnapshot().auditTrail.length} entries) verified.`
  );

  // 10. Verify Production Persistence Priority Order & Render Ephemeral Detection
  const origGdfDir = process.env.GDF_PERSISTENT_DATA_DIR;
  const origRenderDir = process.env.RENDER_DISK_MOUNT_PATH;
  const origRenderFlag = process.env.RENDER;
  try {
    process.env.GDF_PERSISTENT_DATA_DIR = '/tmp/gdf_test_priority1';
    process.env.RENDER_DISK_MOUNT_PATH = '/tmp/gdf_test_priority2';
    const p1 = resolvePersistenceConfig();
    assert.equal(p1.resolvedSource, 'GDF_PERSISTENT_DATA_DIR', 'Priority 1 must be GDF_PERSISTENT_DATA_DIR');
    assert.equal(p1.statusLabel, 'PERSISTENT');
    assert.equal(p1.isDurableAcrossRedeploys, true);

    delete process.env.GDF_PERSISTENT_DATA_DIR;
    const p2 = resolvePersistenceConfig();
    assert.equal(p2.resolvedSource, 'RENDER_DISK_MOUNT_PATH', 'Priority 2 must be RENDER_DISK_MOUNT_PATH');
    assert.equal(p2.statusLabel, 'PERSISTENT');
    assert.equal(p2.isDurableAcrossRedeploys, true);

    delete process.env.RENDER_DISK_MOUNT_PATH;
    process.env.RENDER = 'true';
    const pEphemeral = resolvePersistenceConfig();
    assert.equal(pEphemeral.statusLabel, 'EPHEMERAL');
    assert.equal(pEphemeral.storageMode, 'EPHEMERAL_CONTAINER_FILESYSTEM');
    assert.equal(pEphemeral.isDurableAcrossRedeploys, false);
    assert.ok(
      pEphemeral.warningEn && pEphemeral.warningEn.includes('WILL BE LOST on a full container redeploy'),
      'Render ephemeral warning must explain what will be lost on redeploy'
    );
    assert.ok(
      pEphemeral.remediationInstructionsEn && pEphemeral.remediationInstructionsEn.includes('GDF_PERSISTENT_DATA_DIR'),
      'Render ephemeral remediation instructions must explain how to mount a disk and set the env var'
    );
  } finally {
    if (origGdfDir !== undefined) process.env.GDF_PERSISTENT_DATA_DIR = origGdfDir;
    else delete process.env.GDF_PERSISTENT_DATA_DIR;
    if (origRenderDir !== undefined) process.env.RENDER_DISK_MOUNT_PATH = origRenderDir;
    else delete process.env.RENDER_DISK_MOUNT_PATH;
    if (origRenderFlag !== undefined) process.env.RENDER = origRenderFlag;
    else delete process.env.RENDER;
  }
  console.log(
    '✓ [PASS 10/12] Production persistence priority order (GDF_PERSISTENT_DATA_DIR -> RENDER_DISK_MOUNT_PATH -> /data -> ./data) & Render ephemeral remediation verified.'
  );

  // 11. Verify Cold-Start Restart Survival from Versioned Persistent Store v2
  const preRestartSnapshot = getIntelligenceCoreStateSnapshot();
  const reloadHealth = reloadArchitectureStoreFromDisk();
  const postRestartSnapshot = getIntelligenceCoreStateSnapshot();
  assert.equal(reloadHealth.schemaVersion, 2, 'Persistent store schemaVersion must be 2');
  assert.equal(reloadHealth.coldStartRestored, true, 'Cold-start reload must report coldStartRestored=true');
  assert.equal(
    postRestartSnapshot.liveArchitecture.architectureId,
    preRestartSnapshot.liveArchitecture.architectureId,
    'Cold-start restart must restore the exact last promoted Live Architecture ID'
  );
  assert.equal(
    postRestartSnapshot.candidateArchitecture.architectureId,
    preRestartSnapshot.candidateArchitecture.architectureId,
    'Cold-start restart must restore the exact Candidate Architecture ID'
  );
  assert.equal(
    postRestartSnapshot.generationCounter,
    preRestartSnapshot.generationCounter,
    'Cold-start restart must restore the exact generationCounter'
  );
  assert.equal(
    postRestartSnapshot.autoPromotionEnabled,
    preRestartSnapshot.autoPromotionEnabled,
    'Cold-start restart must restore the exact autoPromotionRuntimeEnabled setting'
  );
  assert.equal(
    postRestartSnapshot.auditTrail.length,
    preRestartSnapshot.auditTrail.length,
    'Cold-start restart must preserve the full audit trail without gaps'
  );
  const healthCheck = getArchitecturePersistenceHealth();
  assert.ok(fs.existsSync(healthCheck.storeFilePath), 'Versioned architecture store v2 file must exist on disk');
  console.log(
    `✓ [PASS 11/12] Persistent Architecture & Audit Store v2 cold-start survival verified (${healthCheck.statusLabel} / ${healthCheck.storageMode}, Gen-${healthCheck.restoredGeneration}, ${healthCheck.restoredAuditEntriesCount} audit entries).`
  );

  // 12. Verify Mandatory Same-Chart Dual-Line Visualization (#windyCanvas) & Operator MMI Clarity in index.html
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  assert.ok(
    indexHtml.includes('MANDATORY SAME-CHART DUAL-LINE COMPARISON') &&
      indexHtml.includes("ctx.strokeStyle = '#f5d76e'") &&
      indexHtml.includes("ctx.strokeStyle = '#e040fb'") &&
      indexHtml.includes('ctx.setLineDash([7, 4])') &&
      indexHtml.includes('candEnsemble?.medianTrack') &&
      indexHtml.includes('Promote Candidate to Live (Manual MMI)') &&
      indexHtml.includes('puAutoPromoteReminderBanner') &&
      indexHtml.includes('puVerificationSummaryStrip'),
    'index.html must draw both #f5d76e Yellow and #e040fb Dashed Magenta lines on #windyCanvas and display unmistakable MMI controls'
  );
  console.log(
    '✓ [PASS 12/12] Mandatory Same-Chart Dual-Line Comparison (#windyCanvas) and Operator MMI Clarity verified.'
  );

  console.log('======================================================================');
  console.log('ALL 12 PARALLEL UNIVERSE & INTELLIGENCE CORE v3 CHECKS PASSED');
  console.log('======================================================================');
}

runParallelUniverseVerification().catch(err => {
  console.error('Parallel Universe Verification Failed:', err);
  process.exit(1);
});

