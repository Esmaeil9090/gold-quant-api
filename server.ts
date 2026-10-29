import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { ZipArchive } from 'archiver';
import type { EmpiricalCalibrationBundle } from './src/config/parameterRegistry.js';
import type { ProviderTier } from './src/services/realDataWaterfall.js';

export type * from './src/contracts/quantContracts.js';

const __filename = fileURLToPath(import.meta.url);
const rawDirname = path.dirname(__filename);
const __dirname =
  path.basename(rawDirname) === 'dist' && fs.existsSync(path.join(path.dirname(rawDirname), 'index.html'))
    ? path.dirname(rawDirname)
    : rawDirname;

if (!process.execArgv.some((arg) => arg.includes('tsx'))) {
  try {
    await import('tsx/esm');
  } catch {
    const nodeModule = (await import('node:module')) as any;
    if (typeof nodeModule.registerHooks === 'function') {
      nodeModule.registerHooks({
        resolve(specifier: string, context: any, nextResolve: any) {
          if (specifier.startsWith('./src/') && specifier.endsWith('.js')) {
            const distCandidate = path.join(__dirname, 'dist', specifier.slice(2));
            if (fs.existsSync(distCandidate)) {
              return nextResolve(pathToFileURL(distCandidate).href, context);
            }
          }
          return nextResolve(specifier, context);
        },
      });
    }
  }
}

const { getFeatureFlags } = await import('./src/config/featureFlags.js');
const { buildEmpiricalCalibrationBundle } = await import('./src/config/parameterRegistry.js');
const { MODEL_SPEC_REGISTRY, getModelSpecList } = await import('./src/config/modelSpecRegistry.js');
const { BILINGUAL_STYLE_POLICY, FINANCIAL_TERMINOLOGY_DICTIONARY, getAllConcepts } = await import(
  './src/config/financialDictionary.js'
);
const {
  AUTHORITATIVE_API_CONTRACT_VERSION,
  AUTHORITATIVE_CLIENT_VERSION,
  AUTHORITATIVE_SERVER_VERSION,
  buildAuthoritativeClientReleaseManifest,
} = await import('./src/config/clientReleaseManifest.js');
const {
  assertVerifiedProvenance,
  bootstrapMultiTimeframeWaterfallCache,
  fetchVerifiedMacroNews,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
  getLatestWaterfallSnapshot,
  getMultiTimeframeBootstrapState,
  getProviderHttpDiagnostics,
  getSystemWarningErrorLog,
  sanitizeUserFacingHaltReason,
  triggerNonBlockingMultiTimeframeBootstrap,
} = await import('./src/services/realDataWaterfall.js');
const {
  AdaptiveDPObserver,
  computeCointegrationBasis,
  computeOrthogonalMacroFactors,
  evaluatePureQuantPipeline,
} = await import('./src/engine/quantEngine.js');
const {
  buildDiagnosisReport,
  buildHaltedDegradedForecastPayload,
  computeDataReliability,
} = await import('./src/services/telemetryService.js');
const {
  evaluateCausalWalkForwardValidation,
  getLatestValidationScorecard,
} = await import('./src/services/walkForwardValidationService.js');
const {
  evaluateParallelUniverseAndAwarenessCore,
  executeSymbolicDiscoveryStep,
  getArchitecturePersistenceHealth,
  getIntelligenceCoreStateSnapshot,
  promoteCandidateArchitecture,
  reloadArchitectureStoreFromDisk,
  rollbackLatentMathWriteBack,
  setAutoPromotionRuntimeMode,
  triggerSymbolicDiscoveryAuditStep,
  writeBackValidatedMathToLatentModel,
} = await import('./src/services/intelligenceAwarenessCore.js');
const {
  executeEightStepScientificDiscoveryCycle,
  getScientificDiscoveryCycleTelemetry,
  reloadScientificCycleStoreFromDisk,
  runMonitorStage,
} = await import('./src/services/scientificDiscoveryCycleService.js');

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(cors());
app.use(express.json());

// Self-Updating PWA Mechanism: ensure ServiceWorker, Manifest, HTML, Client Core JS, and Live APIs are never served stale
const APP_VERSION = AUTHORITATIVE_SERVER_VERSION;
const BUILD_TIME = Date.now();

app.use((req, res, next) => {
  const p = req.path;
  if (
    p === '/sw.js' ||
    p === '/index.html' ||
    p === '/js/gdfClientCore.js' ||
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
  const manifest = buildAuthoritativeClientReleaseManifest({
    rootDir: __dirname,
    serverVersion: APP_VERSION,
    serverBuildTime: BUILD_TIME,
  });
  res.json({
    appName: 'GDF',
    version: manifest.latestClientVersion || AUTHORITATIVE_CLIENT_VERSION,
    clientVersion: manifest.latestClientVersion || AUTHORITATIVE_CLIENT_VERSION,
    clientBuildId: manifest.latestClientBuildId,
    serverVersion: APP_VERSION,
    apiContractVersion: AUTHORITATIVE_API_CONTRACT_VERSION,
    isVerified: manifest.isVerified,
    bundleIntegritySha256: manifest.bundleIntegritySha256,
    buildTime: BUILD_TIME,
    timestamp: Date.now(),
    serverTime: new Date().toISOString(),
    featureFlags: getFeatureFlags(),
  });
});

app.get('/api/release-manifest', (req: Request, res: Response) => {
  const ph = getArchitecturePersistenceHealth();
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const installedClientVersion =
    typeof req.query.installedClientVersion === 'string' && req.query.installedClientVersion.trim().length > 0
      ? req.query.installedClientVersion.trim()
      : undefined;
  const installedClientBuildId =
    typeof req.query.installedBuildId === 'string' && req.query.installedBuildId.trim().length > 0
      ? req.query.installedBuildId.trim()
      : undefined;

  const manifest = buildAuthoritativeClientReleaseManifest({
    rootDir: __dirname,
    serverVersion: APP_VERSION,
    serverBuildTime: BUILD_TIME,
    installedClientVersion,
    installedClientBuildId,
  });

  res.json({
    ...manifest,
    appName: 'GDF (Gold Dynamic Flow)',
    buildTime: BUILD_TIME,
    buildTimestampIso: new Date(BUILD_TIME).toISOString(),
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      isRender: Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID),
      persistenceStatus: ph.statusLabel,
      persistenceSource: ph.resolvedSource,
    },
  });
});

app.get('/api/download/source', (req: Request, res: Response) => {
  const zipFileName = `gdf-gold-quant-source-${APP_VERSION}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const archive = new ZipArchive({
    zlib: { level: 9 },
  });

  archive.on('warning', (err: any) => {
    if (err.code === 'ENOENT') {
      console.warn('[GDF Archive Warning]', err);
    } else {
      throw err;
    }
  });

  archive.on('error', (err: any) => {
    console.error('[GDF Archive Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ status: 'ERROR', error: 'Failed to create source archive' });
    }
  });

  archive.pipe(res);

  // Append key project files
  const rootFiles = [
    'server.ts',
    'index.html',
    'sw.js',
    'package.json',
    'tsconfig.json',
    'render.yaml',
    'Procfile',
    'README.md',
    'metadata.json',
    '.env.example',
    'REMEDIATION_MANIFEST.md'
  ];

  for (const file of rootFiles) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: file });
    }
  }

  // Append essential directories, ignoring node_modules, .git, and secrets
  const directoriesToInclude = ['src', 'public', 'fixtures', 'data', 'scripts'];
  for (const dir of directoriesToInclude) {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      archive.directory(dirPath, dir, (entry) => {
        if (entry.name.includes('.env') || entry.name.endsWith('.tmp') || entry.name.includes('.DS_Store')) {
          return false;
        }
        return entry;
      });
    }
  }

  archive.finalize();
});

app.get('/api/download/release-bundle', (req: Request, res: Response) => {
  const zipFileName = `gdf-release-bundle-${APP_VERSION}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const archive = new ZipArchive({
    zlib: { level: 9 },
  });

  archive.on('error', (err: any) => {
    console.error('[GDF Release Bundle Error]', err);
    if (!res.headersSent) {
      res.status(500).json({ status: 'ERROR', error: 'Failed to create release bundle' });
    }
  });

  archive.pipe(res);

  const releaseFiles = [
    'server.ts',
    'index.html',
    'sw.js',
    'package.json',
    'tsconfig.json',
    'render.yaml',
    'Procfile',
    'README.md',
    'metadata.json'
  ];

  for (const file of releaseFiles) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
      archive.file(fullPath, { name: file });
    }
  }

  const releaseDirs = ['src', 'public'];
  for (const dir of releaseDirs) {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      archive.directory(dirPath, dir);
    }
  }

  archive.finalize();
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
    terminologyVersion: BILINGUAL_STYLE_POLICY.version,
    totalSpecs: getModelSpecList().length,
    registry: MODEL_SPEC_REGISTRY,
  });
});

app.get('/api/terminology', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    terminologyVersion: BILINGUAL_STYLE_POLICY.version,
    stylePolicy: BILINGUAL_STYLE_POLICY,
    totalConcepts: getAllConcepts().length,
    dictionary: FINANCIAL_TERMINOLOGY_DICTIONARY,
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

app.get('/sw.js', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'sw.js'));
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
  const forceRefresh = req.query.forceRefresh === '1' || req.query.forceRefresh === 'true';

  const cached = forecastCache.get(interval);
  if (!simulateFailure && !fixtureReplay && !forceRefresh && cached && Date.now() - cached.timestamp < 10000) {
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
      verifiedVenueCameras: waterfall.verifiedVenueCameras,
      macroNews: realNewsFeed.events,
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

    // Ensure Eight-Step Scientific Discovery Cycle telemetry is populated on the active snapshot
    let sciCycleTel = getScientificDiscoveryCycleTelemetry();
    if (!sciCycleTel.activeCase && candles.length >= 25) {
      try {
        sciCycleTel = executeEightStepScientificDiscoveryCycle({
          timeframe: interval,
          candles,
          liveMacro,
          secondaryBenchmark: waterfall.secondaryBenchmark,
          verifiedVenueCameras: waterfall.verifiedVenueCameras,
          systemState: waterfall.systemState,
          authorizeIntegrationMode: 'NONE',
        }).telemetry;
      } catch {
        sciCycleTel = getScientificDiscoveryCycleTelemetry();
      }
    } else if (sciCycleTel.machineState === 'MONITORING' && candles.length >= 25) {
      try {
        runMonitorStage(sciCycleTel.activeCase, {
          timeframe: interval,
          candles,
          liveMacro,
          secondaryBenchmark: waterfall.secondaryBenchmark,
          verifiedVenueCameras: waterfall.verifiedVenueCameras,
          systemState: waterfall.systemState,
        });
        sciCycleTel = getScientificDiscoveryCycleTelemetry();
      } catch {
        // Keep current telemetry
      }
    }
    parallelUniverse.scientificDiscoveryCycle = sciCycleTel;

    const activeLiveEnsemble =
      parallelUniverse.liveEnsemble && parallelUniverse.liveEnsemble.medianTrack.length > 0
        ? parallelUniverse.liveEnsemble
        : quantOut.ensemble;

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
      equilibriumPrice:
        parallelUniverse.liveArchitecture.promotionMode !== 'INITIAL_BASELINE' &&
        parallelUniverse.liveArchitecture.compositeEquilibriumAnchor > 0
          ? parallelUniverse.liveArchitecture.compositeEquilibriumAnchor
          : quantOut.equilibriumPrice,
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
      ensemble: activeLiveEnsemble,
      macroNews: realNewsFeed.events,
      macroNewsStatus: realNewsFeed,
      candles,
      dataReliability,
      validationScorecard,
      parallelUniverse,
      scientificCore: parallelUniverse.scientificCore,
      scientificScoreboard: parallelUniverse.scientificCore?.scientificScoreboard,
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

// Intelligence & Awareness Core + Parallel Universe + Scientific Core MMI Endpoints
app.get('/api/scientific-core', (req: Request, res: Response) => {
  const snapshot = getIntelligenceCoreStateSnapshot();
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    timestampIso: new Date().toISOString(),
    scientificCore: snapshot.scientificCore || null,
    scientificScoreboard: snapshot.scientificCore?.scientificScoreboard || null,
    latentMathWriteBack: snapshot.latentMathWriteBack,
    persistedResidualCount: snapshot.persistedResidualCount,
  });
});

app.get('/api/intelligence-core', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    buildTime: BUILD_TIME,
    timestampIso: new Date().toISOString(),
    ...getIntelligenceCoreStateSnapshot(),
    scientificDiscoveryCycle: getScientificDiscoveryCycleTelemetry(),
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
    liveVersionTag: result.liveArchitecture.versionTag,
    liveArchitectureId: result.liveArchitecture.architectureId,
    candidateVersionTag: result.candidateArchitecture.versionTag,
    candidateArchitectureId: result.candidateArchitecture.architectureId,
    ...result,
  });
});

app.post('/api/intelligence-core/writeback-math', (req: Request, res: Response) => {
  const modeRaw = String(req.body?.mode || 'MANUAL_MMI').toUpperCase();
  const mode: 'MANUAL_MMI' | 'AUTOMATIC_VERIFIED' =
    modeRaw === 'AUTOMATIC_VERIFIED' ? 'AUTOMATIC_VERIFIED' : 'MANUAL_MMI';
  const operatorNote = typeof req.body?.operatorNote === 'string' ? req.body.operatorNote.trim() : undefined;
  const dryRun = Boolean(req.body?.dryRun);
  const requireFullGateVerification = Boolean(req.body?.requireFullGateVerification);
  const confirmedByOperator = Boolean(req.body?.confirmedByOperator);

  const result = writeBackValidatedMathToLatentModel({
    mode,
    operatorNote,
    dryRun,
    requireFullGateVerification,
    confirmedByOperator,
  });

  if (result.writtenBack) {
    forecastCache.clear();
  }

  const httpStatus = dryRun ? (result.eligible ? 200 : 409) : result.writtenBack ? 200 : 409;
  const responseStatus = dryRun
    ? result.eligible
      ? 'DRY_RUN_ELIGIBLE'
      : 'WRITEBACK_REJECTED'
    : result.writtenBack
      ? 'SUCCESS'
      : 'WRITEBACK_REJECTED';

  res.status(httpStatus).json({
    status: responseStatus,
    ...result,
    ...getIntelligenceCoreStateSnapshot(),
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
  const timeframe = typeof req.body?.timeframe === 'string' ? req.body.timeframe.trim() : undefined;
  const result = executeSymbolicDiscoveryStep({ note, timeframe });
  // Also advance the connected Eight-Step Scientific Discovery Cycle on the active timeframe
  let cycleResult = null;
  if (result.synthesisExecuted) {
    try {
      cycleResult = executeEightStepScientificDiscoveryCycle({
        timeframe,
        operatorNote: note,
        authorizeIntegrationMode: 'NONE',
      });
    } catch {
      cycleResult = null;
    }
    forecastCache.clear();
  }
  const httpStatus = result.synthesisExecuted ? 200 : 409;
  res.status(httpStatus).json({
    status: result.synthesisExecuted ? 'SUCCESS' : 'SYNTHESIS_REJECTED',
    ...result,
    ...getIntelligenceCoreStateSnapshot(),
    scientificDiscoveryCycle: cycleResult?.telemetry || getScientificDiscoveryCycleTelemetry(),
  });
});

app.get('/api/intelligence-core/scientific-cycle', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    timestampIso: new Date().toISOString(),
    scientificDiscoveryCycle: getScientificDiscoveryCycleTelemetry(),
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.post('/api/intelligence-core/scientific-cycle', (req: Request, res: Response) => {
  const timeframe = typeof req.body?.timeframe === 'string' ? req.body.timeframe.trim() : undefined;
  const operatorNote = typeof req.body?.operatorNote === 'string' ? req.body.operatorNote.trim() : undefined;
  const authModeRaw = String(req.body?.authorizeIntegrationMode || 'NONE').toUpperCase();
  const authorizeIntegrationMode:
    | 'SCIENTIFICALLY_VERIFIED_PROMOTION'
    | 'MANUAL_MMI_UNVALIDATED_OVERRIDE'
    | 'NONE' =
    authModeRaw === 'SCIENTIFICALLY_VERIFIED_PROMOTION'
      ? 'SCIENTIFICALLY_VERIFIED_PROMOTION'
      : authModeRaw === 'MANUAL_MMI_UNVALIDATED_OVERRIDE'
      ? 'MANUAL_MMI_UNVALIDATED_OVERRIDE'
      : 'NONE';

  const out = executeEightStepScientificDiscoveryCycle({
    timeframe,
    operatorNote,
    authorizeIntegrationMode,
  });
  if (out.executed) {
    forecastCache.clear();
  }
  const httpStatus = out.concurrencyBlocked ? 429 : out.executed ? 200 : 409;
  res.status(httpStatus).json({
    status: out.concurrencyBlocked
      ? 'CONCURRENT_EXECUTION_BLOCKED'
      : out.executed
      ? 'SUCCESS'
      : 'CYCLE_BLOCKED',
    ...out,
    ...getIntelligenceCoreStateSnapshot(),
    scientificDiscoveryCycle: out.telemetry,
  });
});

app.post('/api/intelligence-core/scientific-cycle/monitor', (req: Request, res: Response) => {
  const timeframe = typeof req.body?.timeframe === 'string' ? req.body.timeframe.trim() : undefined;
  const monitorRecord = runMonitorStage(undefined, { timeframe });
  if (monitorRecord.rollbackTriggered) {
    forecastCache.clear();
  }
  res.json({
    status: 'SUCCESS',
    monitorRecord,
    scientificDiscoveryCycle: getScientificDiscoveryCycleTelemetry(),
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.post('/api/intelligence-core/writeback-rollback', (req: Request, res: Response) => {
  const operatorNote = typeof req.body?.operatorNote === 'string' ? req.body.operatorNote.trim() : undefined;
  const rb = rollbackLatentMathWriteBack(operatorNote);
  if (rb.rolledBack) {
    forecastCache.clear();
  }
  res.status(rb.rolledBack ? 200 : 409).json({
    status: rb.rolledBack ? 'SUCCESS' : 'ROLLBACK_SKIPPED',
    ...rb,
    ...getIntelligenceCoreStateSnapshot(),
    scientificDiscoveryCycle: getScientificDiscoveryCycleTelemetry(),
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
