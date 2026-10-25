import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFeatureFlags } from './src/config/featureFlags.js';
import {
  buildEmpiricalCalibrationBundle,
  EmpiricalCalibrationBundle,
} from './src/config/parameterRegistry.js';
import {
  MODEL_SPEC_REGISTRY,
  getModelSpecList,
} from './src/config/modelSpecRegistry.js';
import {
  assertVerifiedProvenance,
  bootstrapMultiTimeframeWaterfallCache,
  fetchVerifiedMacroNews,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
  getLatestWaterfallSnapshot,
  getMultiTimeframeBootstrapState,
  getProviderHttpDiagnostics,
  getSystemWarningErrorLog,
  ProviderTier,
  sanitizeUserFacingHaltReason,
  triggerNonBlockingMultiTimeframeBootstrap,
} from './src/services/realDataWaterfall.js';
import {
  AdaptiveDPObserver,
  computeCointegrationBasis,
  computeOrthogonalMacroFactors,
  evaluatePureQuantPipeline,
} from './src/engine/quantEngine.js';
import {
  buildDiagnosisReport,
  buildHaltedDegradedForecastPayload,
  computeDataReliability,
} from './src/services/telemetryService.js';
import {
  evaluateCausalWalkForwardValidation,
  getLatestValidationScorecard,
} from './src/services/walkForwardValidationService.js';
import {
  evaluateParallelUniverseAndAwarenessCore,
  getArchitecturePersistenceHealth,
  getIntelligenceCoreStateSnapshot,
  promoteCandidateArchitecture,
  reloadArchitectureStoreFromDisk,
  setAutoPromotionRuntimeMode,
  triggerSymbolicDiscoveryAuditStep,
} from './src/services/intelligenceAwarenessCore.js';

export * from './src/contracts/quantContracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

// Self-Updating PWA Mechanism: ensure ServiceWorker, Manifest, HTML, and Live APIs are never served stale
const APP_VERSION = '2026.10.24-v75.0-UnifiedLiquidityResilience';
const BUILD_TIME = Date.now();

app.use((req, res, next) => {
  const p = req.path;
  if (
    p === '/sw.js' ||
    p === '/index.html' ||
    p === '/' ||
    p.startsWith('/api/') ||
    p.endsWith('.webmanifest') ||
    p.endsWith('.json')
  ) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.get('/api/app-version', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.json({
    appName: 'GDF',
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    timestamp: Date.now(),
    serverTime: new Date().toISOString(),
    featureFlags: getFeatureFlags(),
  });
});

app.get('/api/feature-flags', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    flags: getFeatureFlags(),
  });
});

app.get('/api/model-specs', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    totalSpecs: getModelSpecList().length,
    registry: MODEL_SPEC_REGISTRY,
  });
});

// Phase 1/2 Bug-Fix Diagnostic Endpoint: Inspect exact HTTP status, Content-Type, and HTML rejection events per provider
app.get('/api/provider-diagnostics', async (req: Request, res: Response) => {
  const probe = req.query.probe === '1' || req.query.probe === 'true';
  const intervalQuery = (req.query.interval as string) || '15m';
  const interval = VALID_INTERVALS[intervalQuery] ? intervalQuery : '15m';
  const wf = probe
    ? await fetchVerifiedMarketWaterfall(interval)
    : getLatestWaterfallSnapshot(interval) || (await fetchVerifiedMarketWaterfall(interval));
  const latestWaterfall = wf
    ? {
        snapshotId: wf.snapshotId,
        snapshotTimestampIso: wf.snapshotTimestampIso,
        systemState: wf.systemState,
        activeTier: wf.activeTier,
        activeProvider: wf.activeProvider,
        activeSymbol: wf.activeSymbol,
        instrumentIdentity: wf.instrumentIdentity || 'PAXG_SPOT_TOKEN',
        freshnessAgeSec: wf.freshnessAgeSec,
        tierDiagnostics: wf.diagnostics,
      }
    : null;
  const httpEvents = getProviderHttpDiagnostics();
  const htmlRejectedEvents = httpEvents.filter(e => e.isHtmlOrNonJson || e.outcome === 'NON_JSON_HTML_REJECTED');
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    timestampIso: new Date().toISOString(),
    snapshotId: wf?.snapshotId || null,
    totalHttpEventsLogged: httpEvents.length,
    htmlOrNonJsonRejectionsCount: htmlRejectedEvents.length,
    htmlRejectedProviders: Array.from(new Set(htmlRejectedEvents.map(e => e.providerName))),
    latestWaterfall,
    recentProviderEvents: httpEvents.slice(0, 30),
    systemWarningsErrors: getSystemWarningErrorLog().slice(0, 40),
  });
});

// Phase 5 Validation Layer Endpoint: Retrieve Causal Walk-Forward Evaluation Scorecard
app.get('/api/validation-scorecard', async (req: Request, res: Response) => {
  const intervalQuery = (req.query.interval as string) || '15m';
  const interval = VALID_INTERVALS[intervalQuery] ? intervalQuery : '15m';
  let scorecard = getLatestValidationScorecard(interval);
  if (!scorecard) {
    const [wf, macro] = await Promise.all([
      fetchVerifiedMarketWaterfall(interval),
      fetchVerifiedMacroWaterfall(),
    ]);
    if (wf.candles.length >= 26) {
      scorecard = evaluateCausalWalkForwardValidation({
        candles: wf.candles,
        liveMacro: macro,
        timeframe: interval,
        intervalStepSeconds: VALID_INTERVALS[interval],
      });
    }
  }
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    timeframe: interval,
    scorecard,
  });
});

// Block direct HTTP access to server source code, scripts, fixtures, and configuration files
app.use((req, res, next) => {
  const lowerPath = req.path.toLowerCase();
  if (
    lowerPath === '/server.ts' ||
    lowerPath === '/package.json' ||
    lowerPath === '/tsconfig.json' ||
    lowerPath === '/render.yaml' ||
    lowerPath === '/procfile' ||
    lowerPath.startsWith('/src/') ||
    lowerPath.startsWith('/scripts/') ||
    lowerPath.startsWith('/data/') ||
    lowerPath.startsWith('/fixtures/') ||
    lowerPath.startsWith('/.env') ||
    lowerPath.startsWith('/.git') ||
    lowerPath.endsWith('.ts')
  ) {
    return res.status(403).json({
      status: 'FORBIDDEN',
      error: 'Direct HTTP access to internal source, scripts, or configuration files is forbidden.',
    });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/index.html', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const observer = new AdaptiveDPObserver();

const VALID_INTERVALS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

interface CachedForecast {
  timestamp: number;
  data: any;
}
const forecastCache = new Map<string, CachedForecast>();
let lastVerifiedCalibration: EmpiricalCalibrationBundle | null = null;

app.get('/api/parameter-registry', async (req: Request, res: Response) => {
  if (!lastVerifiedCalibration) {
    const wf = await fetchVerifiedMarketWaterfall('15m');
    if (wf.candles.length >= 20) {
      lastVerifiedCalibration = buildEmpiricalCalibrationBundle(wf.candles);
    }
  }
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    calibration: lastVerifiedCalibration,
    modelSpecRegistry: MODEL_SPEC_REGISTRY,
  });
});

app.get('/api/diagnosis', async (req: Request, res: Response) => {
  const nowIso = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  const [wf, macro, news] = await Promise.all([
    fetchVerifiedMarketWaterfall('15m'),
    fetchVerifiedMacroWaterfall(),
    fetchVerifiedMacroNews(),
  ]);
  const basis = computeCointegrationBasis(
    wf.candles[wf.candles.length - 1]?.close || observer.lastPrice,
    wf.candles,
    wf.secondaryBenchmark
  );
  const pca = computeOrthogonalMacroFactors(macro, wf.candles, basis);
  const report = buildDiagnosisReport({
    nowIso,
    wf,
    macro,
    news,
    basis,
    pca,
    observerInst: observer,
  });

  res.json({
    status: 'SUCCESS',
    systemState: wf.systemState,
    activeTier: wf.activeTier,
    activeProvider: wf.activeProvider,
    report,
  });
});

app.get('/api/gold-forecast', async (req: Request, res: Response) => {
  const intervalQuery = (req.query.interval as string) || '15m';
  const interval = VALID_INTERVALS[intervalQuery] ? intervalQuery : '15m';
  const intervalStepSeconds = VALID_INTERVALS[interval];
  const simulateFailure = (req.query.simulateFailure as string) || '';
  const fixtureReplay = req.query.fixtureReplay === '1' || req.query.fixtureReplay === 'true';

  const cached = forecastCache.get(interval);
  if (!simulateFailure && !fixtureReplay && cached && Date.now() - cached.timestamp < 10000) {
    return res.json(cached.data);
  }

  try {
    const [waterfall, liveMacro, realNewsFeed] = await Promise.all([
      fetchVerifiedMarketWaterfall(interval, { simulateFailure, fixtureReplay }),
      fetchVerifiedMacroWaterfall({ simulateFailure }),
      fetchVerifiedMacroNews({ simulateFailure }),
    ]);

    if (waterfall.systemState === 'HALTED_DEGRADED' || waterfall.candles.length === 0) {
      const haltedPayload = {
        ...buildHaltedDegradedForecastPayload({
          waterfall,
          liveMacro,
          realNewsFeed,
          observerInst: observer,
          interval,
          intervalStepSeconds,
          appVersion: APP_VERSION,
          cachedData: cached?.data,
        }),
        buildTime: BUILD_TIME,
        systemWarningsErrors: getSystemWarningErrorLog().slice(0, 40),
      };
      return res.json(haltedPayload);
    }

    const candles = waterfall.candles;
    assertVerifiedProvenance(candles, {
      providerName: waterfall.activeProvider,
      symbol: waterfall.activeSymbol,
      endpoint: waterfall.activeEndpoint,
      tier: waterfall.activeTier as ProviderTier,
    });

    const quantOut = evaluatePureQuantPipeline(
      candles,
      liveMacro,
      waterfall.secondaryBenchmark,
      intervalStepSeconds,
      observer,
      waterfall.systemState,
      waterfall.activeTier,
      waterfall.htfDailyCandles
    );

    lastVerifiedCalibration = quantOut.calibration;

    const validationScorecard = evaluateCausalWalkForwardValidation({
      candles,
      liveMacro,
      timeframe: interval,
      intervalStepSeconds,
    });

    const dataReliability = computeDataReliability(
      waterfall,
      observer,
      quantOut.vpinTelemetry,
      quantOut.pcaFactors,
      liveMacro,
      quantOut.cointegrationBasis,
      realNewsFeed,
      candles,
      intervalStepSeconds
    );

    if (!simulateFailure) {
      triggerNonBlockingMultiTimeframeBootstrap({ fixtureReplay });
    }

    const parallelUniverse = evaluateParallelUniverseAndAwarenessCore({
      candles,
      liveMacro,
      secondaryBenchmark: waterfall.secondaryBenchmark,
      htfDailyCandles: waterfall.htfDailyCandles,
      interval,
      intervalStepSeconds,
      snapshotId: waterfall.snapshotId || `gdf-snap-${interval}-${Date.now()}`,
      instrumentIdentity: waterfall.instrumentIdentity || 'PAXG_SPOT_TOKEN',
      systemState: waterfall.systemState,
      activeProvider: waterfall.activeProvider,
      activeSymbol: waterfall.activeSymbol,
      activeEndpoint: waterfall.activeEndpoint,
      activeTier: waterfall.activeTier,
    });

    const payload = {
      status: 'SUCCESS',
      snapshotId: waterfall.snapshotId,
      snapshotTimestampIso: waterfall.snapshotTimestampIso,
      systemState: waterfall.systemState,
      isHalted: false,
      isSynthetic: false,
      isFixtureReplay: Boolean(waterfall.isFixtureReplay || waterfall.systemState === 'FIXTURE_REPLAY'),
      instrumentIdentity: waterfall.instrumentIdentity || 'PAXG_SPOT_TOKEN',
      activeTier: waterfall.activeTier,
      activeProvider: waterfall.activeProvider,
      activeSymbol: waterfall.activeSymbol,
      haltReasonEn: waterfall.haltReasonEn ? sanitizeUserFacingHaltReason(waterfall.haltReasonEn, 'en') : null,
      haltReasonFa: waterfall.haltReasonFa ? sanitizeUserFacingHaltReason(waterfall.haltReasonFa, 'fa') : null,
      providerDiagnostics: waterfall.diagnostics,
      systemWarningsErrors: getSystemWarningErrorLog().slice(0, 40),
      version: APP_VERSION,
      buildTime: BUILD_TIME,
      timestamp: Math.floor(Date.now() / 1000),
      timeframe: interval,
      timeframeStepSeconds: intervalStepSeconds,
      currentPrice: quantOut.currentPrice,
      equilibriumPrice: quantOut.equilibriumPrice,
      atr: quantOut.atr,
      atmosphericState: quantOut.atmosphericState,
      barometerStatus: quantOut.barometerStatus,
      macroYieldFeed: liveMacro,
      multiTimeframeMatrix: quantOut.multiTimeframe.matrix,
      multiTimeframeSummary: quantOut.multiTimeframe.confluenceSummary,
      multiTimeframeConfluenceScore: quantOut.multiTimeframe.confluenceScore,
      directionalPressure: quantOut.directionalPressure,
      macroWindVector: quantOut.macroWindVector,
      vpinTelemetry: quantOut.vpinTelemetry,
      volumeClockTelemetry: quantOut.volumeClockTelemetry,
      sweepDiscriminator: quantOut.sweepDiscriminator,
      liquidityEngine: quantOut.liquidityEngine,
      morseManifold: quantOut.morseManifold,
      cointegrationBasis: quantOut.cointegrationBasis,
      pcaMacroFactors: quantOut.pcaFactors,
      observerTelemetry: quantOut.observerTelemetry,
      garchVolatility: quantOut.garchVolatility,
      parameterRegistry: quantOut.calibration.registry,
      modelSpecRegistry: MODEL_SPEC_REGISTRY,
      isobars: quantOut.isobars,
      flowField: quantOut.flowField,
      ensemble: quantOut.ensemble,
      macroNews: realNewsFeed.events,
      macroNewsStatus: realNewsFeed,
      candles,
      dataReliability,
      validationScorecard,
      parallelUniverse,
    };

    if (!simulateFailure && !fixtureReplay) {
      forecastCache.set(interval, { timestamp: Date.now(), data: payload });
    }
    res.json(payload);
  } catch (err: any) {
    console.warn('Forecast waterfall critical error (logged server-side):', err?.message);
    const fallbackHalted = buildHaltedDegradedForecastPayload({
      waterfall: {
        systemState: 'HALTED_DEGRADED',
        activeTier: 'NONE_HALTED',
        activeProvider: 'ALL_PROVIDERS_FAILED',
        activeSymbol: 'NONE',
        activeEndpoint: 'NONE',
        candles: [],
        secondaryBenchmark: null,
        diagnostics: [],
        haltReasonEn: sanitizeUserFacingHaltReason(err?.message, 'en'),
        haltReasonFa: sanitizeUserFacingHaltReason(err?.message, 'fa'),
        freshnessAgeSec: 999999,
      },
      liveMacro: {
        status: 'MACRO_FEED_UNAVAILABLE',
        source: 'UNAVAILABLE',
        respondingSources: [],
        nominal10Y: 0,
        tipsRealYield10Y: 0,
        breakevenInflation10Y: 0,
        dxyIndex: 0,
        realYieldGravity: 0,
        dollarDrag: 0,
        centralBankTide: 0,
        netMacroLift: 0,
        lastUpdated: new Date().toISOString(),
        sanityCheckZScore: 0,
        outliersRejected: [],
      },
      realNewsFeed: {
        status: 'UNAVAILABLE',
        activeSources: [],
        failedSources: [],
        events: [],
        lastFetchedIso: new Date().toISOString(),
        unavailableMessageEn: 'News feed unavailable during system halt.',
        unavailableMessageFa: 'جریان اخبار در زمان توقف سیستم در دسترس نیست.',
      },
      observerInst: observer,
      interval,
      intervalStepSeconds,
      appVersion: APP_VERSION,
      cachedData: cached?.data,
    });
    res.status(503).json({
      ...fallbackHalted,
      buildTime: BUILD_TIME,
      systemWarningsErrors: getSystemWarningErrorLog().slice(0, 40),
    });
  }
});

// Intelligence & Awareness Core + Parallel Universe MMI Endpoints
app.get('/api/intelligence-core', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    timestampIso: new Date().toISOString(),
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.get('/api/intelligence-core/persistence-health', (req: Request, res: Response) => {
  const persistenceHealth = getArchitecturePersistenceHealth();
  const mtfBootstrap = getMultiTimeframeBootstrapState();
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    timestampIso: new Date().toISOString(),
    persistenceHealth,
    mtfBootstrap,
  });
});

app.post('/api/intelligence-core/bootstrap-mtf', async (req: Request, res: Response) => {
  const fixtureReplay = Boolean(req.body?.fixtureReplay);
  const force = Boolean(req.body?.force);
  const mtfBootstrap = await bootstrapMultiTimeframeWaterfallCache({ fixtureReplay, force });
  forecastCache.clear();
  res.json({
    status: 'SUCCESS',
    mtfBootstrap,
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.post('/api/intelligence-core/reload-store', (req: Request, res: Response) => {
  const persistenceHealth = reloadArchitectureStoreFromDisk();
  forecastCache.clear();
  res.json({
    status: 'SUCCESS',
    persistenceHealth,
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.post('/api/intelligence-core/promote', (req: Request, res: Response) => {
  const modeRaw = String(req.body?.mode || 'MANUAL_MMI').toUpperCase();
  const mode: 'MANUAL_MMI' | 'AUTOMATIC_VERIFIED' =
    modeRaw === 'AUTOMATIC_VERIFIED' ? 'AUTOMATIC_VERIFIED' : 'MANUAL_MMI';
  const operatorNote = typeof req.body?.operatorNote === 'string' ? req.body.operatorNote.trim() : undefined;

  const result = promoteCandidateArchitecture({ mode, operatorNote });
  if (result.promoted) {
    forecastCache.clear();
  }
  res.status(result.promoted ? 200 : 409).json({
    status: result.promoted ? 'SUCCESS' : 'PROMOTION_REJECTED',
    ...result,
  });
});

app.post('/api/intelligence-core/auto-promote-mode', (req: Request, res: Response) => {
  const enabled = Boolean(req.body?.enabled);
  const result = setAutoPromotionRuntimeMode(enabled);
  forecastCache.clear();
  res.json({
    status: 'SUCCESS',
    ...result,
  });
});

app.post('/api/intelligence-core/discover-step', (req: Request, res: Response) => {
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined;
  const auditEntry = triggerSymbolicDiscoveryAuditStep(note);
  forecastCache.clear();
  res.json({
    status: 'SUCCESS',
    auditEntry,
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.post('/api/gold-predictions', async (req: Request, res: Response) => {
  res.redirect(307, '/api/gold-forecast');
});

// Strict API 404 JSON Guard: Never allow unknown /api/* routes to fall through to the HTML SPA catch-all
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({
    status: 'NOT_FOUND',
    error: `API endpoint not found: ${req.method} ${req.path}`,
    timestampIso: new Date().toISOString(),
  });
});

app.get('*', (req: Request, res: Response) => {
  if (/\.(js|css|map|png|jpg|jpeg|svg|ico|webp|woff2?)$/i.test(req.path)) {
    return res.status(404).end();
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  const ph = getArchitecturePersistenceHealth();
  console.log(`GDF Quant Terminal (Phase 2 Modularized Architecture) running on http://0.0.0.0:${PORT}`);
  console.log(`[GDF Persistence] ${ph.humanReadableStatusEn}`);
  if (ph.warningEn) {
    console.warn(`[GDF Persistence] ${ph.warningEn}`);
    if (ph.remediationInstructionsEn) {
      console.warn(`[GDF Persistence] ${ph.remediationInstructionsEn}`);
    }
  }
  // Proactively and non-blockingly bootstrap the 5 multi-timeframe discovery series (5m, 15m, 1h, 4h, 1d)
  setTimeout(() => {
    triggerNonBlockingMultiTimeframeBootstrap();
  }, 1000);
});
