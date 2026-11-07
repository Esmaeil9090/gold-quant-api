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
  fetchCrossAssetTickerSummary,
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
  executeLevel5BayesianCausalMetaCycle,
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
const {
  buildExternalAuditorPacket,
  evaluateDualControlPromotionGate,
  evaluateProofReportFreshness,
  hydrateGdfOsRegistryFromCloudSqlIfAvailable,
  issueOperatorSessionCookieAndCsrf,
  loadOrInitializeGdfOsRegistry,
  recordSecurityAuditEvent,
  runGdfAuditAndLoopback,
  runGdfProofSuite,
  syncGdfOsRegistryToCloudSqlImmediate,
  triggerLoopbackUpgrade,
  upsertInterviewRecord,
  verifyOperatorMutationAuthorization,
} = await import('./src/services/gdfOperatingSystem.js');
const { adminAuth } = await import('./src/lib/firebase-admin.js');
const { getOrCreateUser, isCloudSqlConfigured } = await import('./src/db/gdfRepository.js');
const {
  EXPERT_COUNCIL_ROSTER,
  buildLiveExpertSpecialistRoster,
  executeGetLiveMarketAndEngineTelemetry,
  runExpertCouncilConsultation,
} = await import('./src/services/expertCouncilService.js');
const {
  getVerifiedMacroCalendarFeed,
  OFFICIAL_STRUCTURED_MACRO_CALENDAR_EVENTS,
  VERIFIED_2026_POLITICAL_INTELLIGENCE,
} = await import('./src/services/macroCalendarService.js');
const {
  evaluateMacroTransmissionMechanisms,
} = await import('./src/services/macroTransmissionEngine.js');


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
  const directoriesToInclude = ['src', 'public', 'fixtures', 'data', 'scripts', 'playbooks', 'toolbox'];
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
const btcObserver = new AdaptiveDPObserver();

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

async function handleForecastRequest(req: Request, res: Response) {
  const intervalQuery = (req.query.interval as string) || '15m';
  const interval = VALID_INTERVALS[intervalQuery] ? intervalQuery : '15m';
  const intervalStepSeconds = VALID_INTERVALS[interval];
  const simulateFailure = (req.query.simulateFailure as string) || '';
  const fixtureReplay = req.query.fixtureReplay === '1' || req.query.fixtureReplay === 'true';
  const forceRefresh = req.query.forceRefresh === '1' || req.query.forceRefresh === 'true';
  const assetQuery = ((req.query.asset || req.query.symbol || '') as string).toUpperCase();
  const activeAsset: 'GOLD' | 'BTC' =
    req.path === '/api/btc-forecast' || assetQuery.includes('BTC') ? 'BTC' : 'GOLD';
  const cacheKey = activeAsset === 'BTC' ? `BTC:${interval}` : interval;
  const activeObserver = activeAsset === 'BTC' ? btcObserver : observer;

  const cached = forecastCache.get(cacheKey);
  if (!simulateFailure && !fixtureReplay && !forceRefresh && cached && Date.now() - cached.timestamp < 10000) {
    return res.json(cached.data);
  }

  try {
    const [waterfall, liveMacro, realNewsFeed] = await Promise.all([
      fetchVerifiedMarketWaterfall(interval, { simulateFailure, fixtureReplay, asset: activeAsset }),
      fetchVerifiedMacroWaterfall({ simulateFailure }),
      fetchVerifiedMacroNews({ simulateFailure }),
    ]);

    if (waterfall.systemState === 'HALTED_DEGRADED' || waterfall.candles.length === 0) {
      const haltedPayload = {
        ...buildHaltedDegradedForecastPayload({
          waterfall,
          liveMacro,
          realNewsFeed,
          observerInst: activeObserver,
          interval,
          intervalStepSeconds,
          appVersion: APP_VERSION,
          cachedData: cached?.data,
        }),
        asset: activeAsset,
        activeAsset,
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
      activeObserver,
      waterfall.systemState,
      waterfall.activeTier,
      waterfall.htfDailyCandles
    );

    if (activeAsset === 'GOLD') {
      lastVerifiedCalibration = quantOut.calibration;
    }

    const validationScorecard = evaluateCausalWalkForwardValidation({
      candles,
      liveMacro,
      timeframe: interval,
      intervalStepSeconds,
    });

    const dataReliability = computeDataReliability(
      waterfall,
      activeObserver,
      quantOut.vpinTelemetry,
      quantOut.pcaFactors,
      liveMacro,
      quantOut.cointegrationBasis,
      realNewsFeed,
      candles,
      intervalStepSeconds
    );

    if (!simulateFailure && activeAsset === 'GOLD') {
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
      snapshotId: waterfall.snapshotId || `gdf-snap-${activeAsset === 'BTC' ? 'btc-' : ''}${interval}-${Date.now()}`,
      instrumentIdentity: waterfall.instrumentIdentity || (activeAsset === 'BTC' ? 'BTC_SPOT_USD' : 'PAXG_SPOT_TOKEN'),
      systemState: waterfall.systemState,
      activeProvider: waterfall.activeProvider,
      activeSymbol: waterfall.activeSymbol,
      activeEndpoint: waterfall.activeEndpoint,
      activeTier: waterfall.activeTier,
    });

    // Ensure Eight-Step Scientific Discovery Cycle telemetry is populated on the active snapshot
    let sciCycleTel = getScientificDiscoveryCycleTelemetry();
    if (activeAsset === 'GOLD') {
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
    }
    parallelUniverse.scientificDiscoveryCycle = sciCycleTel;

    const activeLiveEnsemble =
      parallelUniverse.liveEnsemble && parallelUniverse.liveEnsemble.medianTrack.length > 0
        ? parallelUniverse.liveEnsemble
        : quantOut.ensemble;

    const macroCalendar = getVerifiedMacroCalendarFeed();
    const macroTransmission = evaluateMacroTransmissionMechanisms({
      currentGoldPriceUsd: quantOut.currentPrice,
      currentTipsRealYield10Y: liveMacro ? liveMacro.tipsRealYield10Y : 2.65,
      currentDxyIndex: liveMacro ? liveMacro.dxyIndex : 103.42,
      events: macroCalendar.events,
      politicalIntelligence: macroCalendar.politicalIntelligence,
    });

    let crossAssetTickers: { gold: any; btc: any } | null = null;
    if (!simulateFailure && !fixtureReplay) {
      try {
        crossAssetTickers = await fetchCrossAssetTickerSummary(interval);
      } catch {
        crossAssetTickers = null;
      }
    }

    const payload = {
      status: 'SUCCESS',
      snapshotId: waterfall.snapshotId,
      snapshotTimestampIso: waterfall.snapshotTimestampIso,
      systemState: waterfall.systemState,
      isHalted: false,
      isSynthetic: false,
      isFixtureReplay: Boolean(waterfall.isFixtureReplay || waterfall.systemState === 'FIXTURE_REPLAY'),
      instrumentIdentity: waterfall.instrumentIdentity || (activeAsset === 'BTC' ? 'BTC_SPOT_USD' : 'PAXG_SPOT_TOKEN'),
      asset: activeAsset,
      activeAsset,
      crossAssetTickers,
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
        activeAsset === 'GOLD' &&
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
      macroCalendar: macroCalendar.events,
      macroCalendarStatus: macroCalendar,
      politicalIntelligence: macroCalendar.politicalIntelligence,
      macroTransmission,
      candles,
      dataReliability,
      validationScorecard,
      parallelUniverse,
      scientificCore: parallelUniverse.scientificCore,
      scientificScoreboard: parallelUniverse.scientificCore?.scientificScoreboard,
    };

    if (!simulateFailure && !fixtureReplay) {
      forecastCache.set(cacheKey, { timestamp: Date.now(), data: payload });
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
      observerInst: activeObserver,
      interval,
      intervalStepSeconds,
      appVersion: APP_VERSION,
      cachedData: cached?.data,
    });
    res.status(503).json({
      ...fallbackHalted,
      asset: activeAsset,
      activeAsset,
      buildTime: BUILD_TIME,
      systemWarningsErrors: getSystemWarningErrorLog().slice(0, 40),
    });
  }
}

app.get('/api/market-tickers', async (req: Request, res: Response) => {
  const intervalQuery = (req.query.interval as string) || '15m';
  const interval = VALID_INTERVALS[intervalQuery] ? intervalQuery : '15m';
  try {
    const summary = await fetchCrossAssetTickerSummary(interval);
    res.json({
      status: 'SUCCESS',
      timeframe: interval,
      gold: summary.gold,
      btc: summary.btc,
      timestampIso: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'ERROR',
      error: err?.message || 'Failed to fetch cross-asset tickers',
    });
  }
});

app.get('/api/gold-forecast', handleForecastRequest);
app.get('/api/btc-forecast', handleForecastRequest);
app.get('/api/forecast', handleForecastRequest);

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

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      if (key) {
        try {
          out[key] = decodeURIComponent(val);
        } catch {
          out[key] = val;
        }
      }
    }
  }
  return out;
}

const handleOperatorSessionEndpoint = async (req: Request, res: Response) => {
  try {
    const authHeader = (req.headers['authorization'] as string) || '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;

    let operatorIdentity = 'OPERATOR_MMI_BROWSER_SESSION';
    let firebaseUserRecord: any = null;

    if (bearerToken && bearerToken.split('.').length === 3) {
      try {
        const decoded = await adminAuth.verifyIdToken(bearerToken);
        operatorIdentity = `FIREBASE_OPERATOR:${decoded.email || decoded.uid}`;
        if (isCloudSqlConfigured()) {
          firebaseUserRecord = await getOrCreateUser(decoded.uid, decoded.email || `${decoded.uid}@firebase.local`, decoded.name);
        }
      } catch {
        // Fallback to standard operator browser session if token is not a Firebase JWT
      }
    }

    const session = issueOperatorSessionCookieAndCsrf(operatorIdentity);
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieFlags = [
      `gdf_operator_session=${encodeURIComponent(session.sessionCookieValue)}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=43200',
    ];
    if (isSecure) {
      cookieFlags.push('Secure');
    }
    res.setHeader('Set-Cookie', cookieFlags.join('; '));
    res.json({
      status: 'SUCCESS',
      csrfToken: session.csrfToken,
      expiresAtIso: session.expiresAtIso,
      operatorIdentity,
      firebaseUser: firebaseUserRecord,
      cloudSqlConfigured: isCloudSqlConfigured(),
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'ERROR',
      error: err?.message || 'Failed to establish operator session.',
    });
  }
};

app.get('/api/auth/operator-session', handleOperatorSessionEndpoint);
app.post('/api/auth/operator-session', handleOperatorSessionEndpoint);

function requireOperatorMutationAuth(endpointPath: string) {
  return async (req: Request, res: Response, next: () => void) => {
    const authHeader = (req.headers['authorization'] as string) || '';
    const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
    const actorRole =
      (req.headers['x-gdf-actor-role'] as string) ||
      req.body?.actorRole ||
      req.body?.externalAgentRole ||
      (req.query?.actorRole as string) ||
      undefined;

    let firebaseUser: { uid: string; email?: string } | null = null;
    if (bearerToken && bearerToken.split('.').length === 3) {
      try {
        const decoded = await adminAuth.verifyIdToken(bearerToken);
        firebaseUser = { uid: decoded.uid, email: decoded.email };
        if (isCloudSqlConfigured()) {
          await getOrCreateUser(decoded.uid, decoded.email || `${decoded.uid}@firebase.local`, decoded.name).catch(() => {});
        }
      } catch {
        // Not a valid Firebase ID token; fall through to operatorToken / session cookie checks
      }
    }

    const cookies = parseCookies(req.headers.cookie);
    const sessionCookieValue = cookies['gdf_operator_session'] || undefined;
    const csrfTokenHeader =
      (req.headers['x-gdf-csrf-token'] as string) ||
      req.body?.csrfToken ||
      undefined;

    const operatorToken =
      (req.headers['x-gdf-operator-token'] as string) ||
      (!firebaseUser ? bearerToken : undefined) ||
      req.body?.operatorToken ||
      undefined;

    const authCheck = verifyOperatorMutationAuthorization({
      endpointOrOperation: `${req.method} ${endpointPath}`,
      actorRole,
      operatorToken,
      sessionCookie: sessionCookieValue,
      csrfToken: csrfTokenHeader,
      firebaseUser,
      requestedBy: req.body?.requestedBy || undefined,
    });
    if (!authCheck.authorized) {
      const errStatus =
        authCheck.httpStatus === 403
          ? authCheck.reason.includes('CSRF')
            ? 'FORBIDDEN_CSRF_TOKEN_INVALID'
            : 'FORBIDDEN_READ_ONLY_AUDITOR'
          : 'UNAUTHORIZED_OPERATOR_TOKEN';
      return res.status(authCheck.httpStatus).json({
        status: errStatus,
        promoted: false,
        authorized: false,
        actorRole: actorRole || authCheck.operatorIdentity,
        error: authCheck.reason,
        reason: authCheck.reason,
        reasonEn: authCheck.reason,
        reasonFa: authCheck.reason,
      });
    }
    (req as any).gdfOperatorIdentity = authCheck.operatorIdentity;
    (req as any).gdfActorRole = actorRole || 'OPERATOR_MMI';
    next();
  };
}

app.post(
  '/api/intelligence-core/bootstrap-mtf',
  requireOperatorMutationAuth('/api/intelligence-core/bootstrap-mtf'),
  async (req: Request, res: Response) => {
    const fixtureReplay = Boolean(req.body?.fixtureReplay);
    const force = Boolean(req.body?.force);
    const mtfBootstrap = await bootstrapMultiTimeframeWaterfallCache({ fixtureReplay, force });
    forecastCache.clear();
    res.json({
      status: 'SUCCESS',
      mtfBootstrap,
      ...getIntelligenceCoreStateSnapshot(),
    });
  }
);

app.post(
  '/api/intelligence-core/reload-store',
  requireOperatorMutationAuth('/api/intelligence-core/reload-store'),
  (req: Request, res: Response) => {
    const persistenceHealth = reloadArchitectureStoreFromDisk();
    forecastCache.clear();
    res.json({
      status: 'SUCCESS',
      persistenceHealth,
      ...getIntelligenceCoreStateSnapshot(),
    });
  }
);

app.post(
  '/api/intelligence-core/promote',
  requireOperatorMutationAuth('/api/intelligence-core/promote'),
  (req: Request, res: Response) => {
    const modeRaw = String(req.body?.mode || 'MANUAL_MMI').toUpperCase();
    const mode: 'MANUAL_MMI' | 'AUTOMATIC_VERIFIED' =
      modeRaw === 'AUTOMATIC_VERIFIED' ? 'AUTOMATIC_VERIFIED' : 'MANUAL_MMI';
    const operatorNote = typeof req.body?.operatorNote === 'string' ? req.body.operatorNote.trim() : undefined;
    const operatorAuthorization =
      (req as any).gdfOperatorIdentity ||
      (typeof req.body?.operatorAuthorization === 'string' ? req.body.operatorAuthorization.trim() : 'OPERATOR_MMI_AUTHENTICATED');
    const actorRole = (req as any).gdfActorRole || 'OPERATOR_MMI';

    const result = promoteCandidateArchitecture({
      mode,
      operatorNote,
      operatorAuthorization,
      actorRole,
    });
    if (result.promoted) {
      forecastCache.clear();
    }
    const osGate = evaluateDualControlPromotionGate(mode, {
      candidateArchitectureId: result.candidateArchitecture.architectureId,
      operatorAuthorization,
      actorRole,
      dryRun: true,
    });
    res.status(result.promoted ? 200 : 409).json({
      status: result.promoted ? 'SUCCESS' : 'PROMOTION_REJECTED',
      reason: result.reasonEn,
      gdfOsDualControlGate: osGate,
      liveVersionTag: result.liveArchitecture.versionTag,
      liveArchitectureId: result.liveArchitecture.architectureId,
      candidateVersionTag: result.candidateArchitecture.versionTag,
      candidateArchitectureId: result.candidateArchitecture.architectureId,
      ...result,
    });
  }
);

app.post(
  '/api/intelligence-core/writeback-math',
  requireOperatorMutationAuth('/api/intelligence-core/writeback-math'),
  (req: Request, res: Response) => {
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
  }
);

app.post(
  '/api/intelligence-core/auto-promote-mode',
  requireOperatorMutationAuth('/api/intelligence-core/auto-promote-mode'),
  (req: Request, res: Response) => {
    const enabled = Boolean(req.body?.enabled);
    const result = setAutoPromotionRuntimeMode(enabled);
    forecastCache.clear();
    res.json({
      status: 'SUCCESS',
      ...result,
    });
  }
);

app.post(
  '/api/intelligence-core/discover-step',
  requireOperatorMutationAuth('/api/intelligence-core/discover-step'),
  (req: Request, res: Response) => {
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
  }
);

app.post(
  '/api/intelligence-core/level5-meta-cycle',
  requireOperatorMutationAuth('/api/intelligence-core/level5-meta-cycle'),
  (req: Request, res: Response) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : undefined;
    const timeframe = typeof req.body?.timeframe === 'string' ? req.body.timeframe.trim() : undefined;
    const result = executeLevel5BayesianCausalMetaCycle({ note });
    let cycleResult: any = null;
    if (result.synthesisExecuted) {
      try {
        cycleResult = executeEightStepScientificDiscoveryCycle({
          timeframe,
          operatorNote:
            note ||
            'Level-5 Bayesian Meta-Learning & Open-Ended Causal Discovery (Granger + PC + DAG + SINDy) cycle.',
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
  }
);

app.get('/api/intelligence-core/scientific-cycle', (req: Request, res: Response) => {
  res.json({
    status: 'SUCCESS',
    version: APP_VERSION,
    timestampIso: new Date().toISOString(),
    scientificDiscoveryCycle: getScientificDiscoveryCycleTelemetry(),
    ...getIntelligenceCoreStateSnapshot(),
  });
});

app.post('/api/intelligence-core/scientific-cycle', requireOperatorMutationAuth('/api/intelligence-core/scientific-cycle'), (req: Request, res: Response) => {
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

app.post('/api/intelligence-core/scientific-cycle/monitor', requireOperatorMutationAuth('/api/intelligence-core/scientific-cycle/monitor'), (req: Request, res: Response) => {
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

app.post('/api/intelligence-core/writeback-rollback', requireOperatorMutationAuth('/api/intelligence-core/writeback-rollback'), (req: Request, res: Response) => {
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

// =========================================================================
// GDF 5-Step AI Delegation, Playbook, Toolbox, Proof & Audit OS Endpoints
// =========================================================================
function collectLiveGdfOsContext() {
  return {
    waterfallSnapshot: getLatestWaterfallSnapshot('15m'),
    intelligenceSnapshot: getIntelligenceCoreStateSnapshot(),
    persistenceHealth: getArchitecturePersistenceHealth(),
    scientificCycle: getScientificDiscoveryCycleTelemetry(),
  };
}

app.get('/api/gdf-os/state', (req: Request, res: Response) => {
  try {
    // Do NOT automatically run the proof suite or audit suite on state-loading requests.
    const registry = loadOrInitializeGdfOsRegistry();
    const latestProof = registry.proofReports[0] || null;
    const proofFreshness = evaluateProofReportFreshness(latestProof);
    res.json({
      status: 'SUCCESS',
      version: APP_VERSION,
      timestampIso: new Date().toISOString(),
      proofFreshness,
      registry,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'ERROR',
      error: err?.message || 'Failed to load GDF Operating System state.',
      timestampIso: new Date().toISOString(),
    });
  }
});

app.post(
  '/api/gdf-os/interview',
  requireOperatorMutationAuth('/api/gdf-os/interview'),
  (req: Request, res: Response) => {
    try {
      const record = upsertInterviewRecord(req.body || {});
      const registry = loadOrInitializeGdfOsRegistry();
      res.json({
        status: 'SUCCESS',
        interview: record,
        proofFreshness: evaluateProofReportFreshness(registry.proofReports[0] || null),
        registry,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'ERROR',
        error: err?.message || 'Failed to update interview record.',
      });
    }
  }
);

app.get('/api/gdf-os/playbooks', (req: Request, res: Response) => {
  const registry = loadOrInitializeGdfOsRegistry();
  res.json({
    status: 'SUCCESS',
    playbooks: registry.playbooks,
  });
});

app.get('/api/gdf-os/toolbox', (req: Request, res: Response) => {
  const registry = loadOrInitializeGdfOsRegistry();
  res.json({
    status: 'SUCCESS',
    toolbox: registry.toolbox,
  });
});

app.post(
  '/api/gdf-os/run-proof',
  requireOperatorMutationAuth('/api/gdf-os/run-proof'),
  (req: Request, res: Response) => {
    try {
      const requestedBy = typeof req.body?.requestedBy === 'string' ? req.body.requestedBy : 'OPERATOR_MMI';
      const taskDescription = typeof req.body?.taskDescription === 'string' ? req.body.taskDescription : undefined;
      const proofReport = runGdfProofSuite({
        requestedBy,
        taskDescription,
        liveContext: collectLiveGdfOsContext(),
      });
      const registry = loadOrInitializeGdfOsRegistry();
      const proofFreshness = evaluateProofReportFreshness(registry.proofReports[0] || null);
      res.json({
        status: 'SUCCESS',
        proofReport,
        proofFreshness,
        registry,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'ERROR',
        error: err?.message || 'Failed to execute GDF live proof suite.',
      });
    }
  }
);

app.post(
  '/api/gdf-os/audit',
  requireOperatorMutationAuth('/api/gdf-os/audit'),
  (req: Request, res: Response) => {
    try {
      const autoLoopbackOnFindings = req.body?.autoLoopbackOnFindings !== false;
      const auditReport = runGdfAuditAndLoopback({
        autoLoopbackOnFindings,
        liveContext: collectLiveGdfOsContext(),
      });
      const registry = loadOrInitializeGdfOsRegistry();
      const proofFreshness = evaluateProofReportFreshness(registry.proofReports[0] || null);
      res.json({
        status: 'SUCCESS',
        auditReport,
        proofFreshness,
        registry,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'ERROR',
        error: err?.message || 'Failed to execute GDF 6-point audit.',
      });
    }
  }
);

app.post(
  '/api/gdf-os/loopback',
  requireOperatorMutationAuth('/api/gdf-os/loopback'),
  (req: Request, res: Response) => {
    try {
      const playbookId = typeof req.body?.playbookId === 'string' ? req.body.playbookId.trim() : 'PB-001';
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim()
          : 'Operator-initiated Loopback SOP refinement.';
      const addedFailureModeOrStep =
        typeof req.body?.addedFailureModeOrStep === 'string' && req.body.addedFailureModeOrStep.trim().length > 0
          ? req.body.addedFailureModeOrStep.trim()
          : `Operator Loopback (${new Date().toISOString().slice(0, 19)}Z): Verified lesson learned committed to SOP.`;
      const loopbackEvent = triggerLoopbackUpgrade({
        playbookId,
        reason,
        addedFailureModeOrStep,
      });
      if (!loopbackEvent) {
        return res.status(404).json({
          status: 'NOT_FOUND',
          error: `Playbook ${playbookId} not found.`,
        });
      }
      const registry = loadOrInitializeGdfOsRegistry();
      res.json({
        status: 'SUCCESS',
        loopbackEvent,
        proofFreshness: evaluateProofReportFreshness(registry.proofReports[0] || null),
        registry,
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'ERROR',
        error: err?.message || 'Failed to execute Playbook loopback upgrade.',
      });
    }
  }
);

app.all('/api/gdf-os/auditor-packet', (req: Request, res: Response, next: () => void) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    recordSecurityAuditEvent({
      endpointOrOperation: `${req.method} /api/gdf-os/auditor-packet`,
      actorRole: (req.headers['x-gdf-actor-role'] as string) || 'EXTERNAL_AUDITOR',
      outcome: 'BLOCKED_EXTERNAL_AUDITOR_READ_ONLY',
      reason: `Method ${req.method} is forbidden on read-only External Auditor Packet endpoint.`,
    });
    return res.status(403).json({
      status: 'FORBIDDEN_READ_ONLY_AUDITOR',
      error: 'External Auditor Packet endpoint is strictly read-only (GET only).',
    });
  }
  next();
});

app.get('/api/gdf-os/auditor-packet', (req: Request, res: Response) => {
  const packet = buildExternalAuditorPacket(collectLiveGdfOsContext());
  res.json({
    status: 'SUCCESS',
    packet,
  });
});

// =========================================================================
// GDF Multi-Disciplinary AI Council of Experts (Read-Only Repo & Live Telemetry)
// =========================================================================
app.get('/api/gdf-os/expert-council/roster', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  const interval = typeof req.query?.interval === 'string' ? req.query.interval.trim() : '15m';
  const liveTelemetry = executeGetLiveMarketAndEngineTelemetry(interval);
  const liveRoster = buildLiveExpertSpecialistRoster(interval, liveTelemetry);
  res.json({
    status: 'SUCCESS',
    roster: liveRoster,
    liveTelemetry,
  });
});

const handleExpertCouncilChatRequest = async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  try {
    const rawMsg = req.method === 'GET' ? req.query?.message : req.body?.message;
    const message = typeof rawMsg === 'string' ? rawMsg.trim() : '';
    if (!message) {
      return res.status(400).json({
        status: 'ERROR',
        error: 'Message is required for Expert Council consultation.',
      });
    }
    const rawExpert = req.method === 'GET' ? req.query?.expertId : req.body?.expertId;
    const expertId = typeof rawExpert === 'string' && rawExpert.trim() ? rawExpert.trim() : 'COUNCIL_ALL';
    const rawInterval = req.method === 'GET' ? req.query?.interval : req.body?.interval;
    const interval = typeof rawInterval === 'string' && rawInterval.trim() ? rawInterval.trim() : '15m';
    const rawLang = req.method === 'GET' ? req.query?.language : req.body?.language;
    const language = rawLang === 'fa' ? 'fa' : 'en';
    const rawAsset = req.method === 'GET' ? req.query?.asset : req.body?.asset;
    const asset: 'GOLD' | 'BTC' = typeof rawAsset === 'string' && rawAsset.toUpperCase().includes('BTC') ? 'BTC' : 'GOLD';
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    const consultation = await runExpertCouncilConsultation({
      message,
      expertId: expertId as any,
      interval,
      language,
      history,
      asset,
    });
    res.json(consultation);
  } catch (err: any) {
    res.status(500).json({
      status: 'ERROR',
      error: err?.message || 'Expert Council consultation failed.',
    });
  }
};

app.get('/api/gdf-os/expert-council/chat', handleExpertCouncilChatRequest);
app.post('/api/gdf-os/expert-council/chat', handleExpertCouncilChatRequest);


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
  if (isCloudSqlConfigured()) {
    hydrateGdfOsRegistryFromCloudSqlIfAvailable()
      .then(() => syncGdfOsRegistryToCloudSqlImmediate())
      .catch(() => {});
  }
  // Proactively and non-blockingly bootstrap the 5 multi-timeframe discovery series (5m, 15m, 1h, 4h, 1d)
  setTimeout(() => {
    triggerNonBlockingMultiTimeframeBootstrap();
  }, 1000);
});
