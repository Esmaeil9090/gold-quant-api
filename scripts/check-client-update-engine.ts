import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import {
  AUTHORITATIVE_CLIENT_VERSION,
  buildAuthoritativeClientReleaseManifest,
  computeSha256HexFromBuffer,
  evaluateClientUpdateStatus,
  extractEmbeddedClientVersionFromHtml,
  verifyClientAssetIntegrity,
  ClientReleaseManifestPayload,
} from '../src/config/clientReleaseManifest.js';

interface TestAssertionResult {
  scenario: string;
  passed: boolean;
  details: string;
}

const results: TestAssertionResult[] = [];

function recordAssertion(scenario: string, condition: boolean, details: string): void {
  results.push({ scenario, passed: Boolean(condition), details });
  if (!condition) {
    console.error(`❌ [FAIL] ${scenario}: ${details}`);
  } else {
    console.log(`✅ [PASS] ${scenario}: ${details}`);
  }
}

/**
 * Simulates the browser in-place self-update transaction engine (checkReleaseManifest + applyAppUpdate + rollback)
 * against a mock CacheStorage, ServiceWorkerContainer, and fetch implementation so we can deterministically verify
 * both successful in-place promotion and mid-flight failure rollback.
 */
class SimulatedBrowserUpdateRuntime {
  public installedClientVersion: string;
  public installedClientBuildId: string;
  public state: string = 'UNKNOWN';
  public stateHistory: string[] = [];
  public cacheStorage: Map<string, Map<string, string>> = new Map();
  public swMessages: Array<Record<string, unknown>> = [];
  public reloadCount = 0;
  public lastErrorReason: string | null = null;
  public lastEvaluation: ReturnType<typeof evaluateClientUpdateStatus> | null = null;

  constructor(initialVersion: string, initialBuildId: string) {
    this.installedClientVersion = initialVersion;
    this.installedClientBuildId = initialBuildId;
    const initialCache = new Map<string, string>();
    initialCache.set('/index.html', `<!DOCTYPE html><meta name="gdf-client-version" content="${initialVersion}">`);
    initialCache.set('/js/gdfClientCore.js', `/* GDF Client Core ${initialVersion} */`);
    initialCache.set('/sw.js', `const SW_RELEASE_VERSION = '${initialVersion}';`);
    this.cacheStorage.set(`gdf-quant-${initialVersion}`, initialCache);
  }

  private transition(nextState: string): void {
    this.state = nextState;
    this.stateHistory.push(nextState);
  }

  public async checkForUpdates(
    fetchManifestFn: (installedVer: string, installedBuild: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
  ): Promise<ReturnType<typeof evaluateClientUpdateStatus>> {
    this.transition('CHECKING');
    try {
      const res = await fetchManifestFn(this.installedClientVersion, this.installedClientBuildId);
      if (!res || !res.ok) {
        const evalUnknown = evaluateClientUpdateStatus({
          installedClientVersion: this.installedClientVersion,
          installedClientBuildId: this.installedClientBuildId,
          manifest: null,
        });
        this.lastEvaluation = evalUnknown;
        this.transition('UNKNOWN');
        return evalUnknown;
      }
      const rawJson = (await res.json()) as Partial<ClientReleaseManifestPayload> | null;
      const evaluation = evaluateClientUpdateStatus({
        installedClientVersion: this.installedClientVersion,
        installedClientBuildId: this.installedClientBuildId,
        manifest: rawJson,
      });
      this.lastEvaluation = evaluation;
      this.transition(evaluation.state);
      return evaluation;
    } catch {
      const evalErr = evaluateClientUpdateStatus({
        installedClientVersion: this.installedClientVersion,
        installedClientBuildId: this.installedClientBuildId,
        manifest: null,
      });
      this.lastEvaluation = evalErr;
      this.transition('UNKNOWN');
      return evalErr;
    }
  }

  public async applyInPlaceUpdate(
    manifest: ClientReleaseManifestPayload,
    fetchAssetFn: (assetPath: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>
  ): Promise<{ ok: boolean; activeVersionAfter: string; errorReason?: string }> {
    const evalBefore = evaluateClientUpdateStatus({
      installedClientVersion: this.installedClientVersion,
      installedClientBuildId: this.installedClientBuildId,
      manifest,
    });
    if (
      evalBefore.state !== 'UPDATE_AVAILABLE' ||
      !evalBefore.isUpdateAvailable ||
      !evalBefore.allowedActions.includes('UPDATE_NOW')
    ) {
      this.transition(evalBefore.state);
      return {
        ok: false,
        activeVersionAfter: this.installedClientVersion,
        errorReason: `Cannot apply update in state ${evalBefore.state}`,
      };
    }

    const targetVersion = manifest.latestClientVersion;
    const stagingCacheName = `gdf-client-stage-${targetVersion}`;
    const activeCacheName = `gdf-quant-${targetVersion}`;

    try {
      this.transition('DOWNLOADING');
      const downloadedPayloads = new Map<string, string>();

      for (const asset of manifest.assets) {
        const resp = await fetchAssetFn(asset.path);
        if (!resp || !resp.ok) {
          if (asset.required) {
            throw new Error(`HTTP_${resp ? resp.status : 'ERR'}_ON_${asset.path}`);
          }
          continue;
        }
        const text = await resp.text();
        downloadedPayloads.set(asset.path, text);
      }

      this.transition('VERIFYING');
      for (const asset of manifest.assets) {
        const body = downloadedPayloads.get(asset.path);
        if (body === undefined) {
          if (asset.required) {
            throw new Error(`MISSING_REQUIRED_ASSET_${asset.path}`);
          }
          continue;
        }
        const check = verifyClientAssetIntegrity({
          content: body,
          expectedSha256: asset.sha256,
          expectedVersionMarker: asset.path === '/index.html' ? targetVersion : undefined,
        });
        if (!check.valid) {
          throw new Error(`INTEGRITY_MISMATCH_${asset.path}:${check.reason}`);
        }
        if (asset.path === '/index.html') {
          const extracted = extractEmbeddedClientVersionFromHtml(body);
          if (!extracted.clientVersion || extracted.clientVersion !== targetVersion) {
            throw new Error(
              `HTML_EMBEDDED_VERSION_MISMATCH:expected=${targetVersion},actual=${extracted.clientVersion}`
            );
          }
        }
      }

      // Stage in temporary cache
      const stageMap = new Map<string, string>();
      for (const [k, v] of downloadedPayloads.entries()) {
        stageMap.set(k, v);
      }
      this.cacheStorage.set(stagingCacheName, stageMap);

      this.transition('INSTALLING');
      // Promote staging cache to active cache
      const promotedMap = new Map<string, string>(stageMap);
      this.cacheStorage.set(activeCacheName, promotedMap);
      this.cacheStorage.delete(stagingCacheName);

      // Clean older gdf-quant-* caches only after activeCacheName is committed
      for (const key of Array.from(this.cacheStorage.keys())) {
        if (key.startsWith('gdf-quant-') && key !== activeCacheName) {
          this.cacheStorage.delete(key);
        }
      }

      this.swMessages.push({
        type: 'ACTIVATE_VERIFIED_RELEASE',
        targetVersion,
        activeCacheName,
      });

      this.transition('RELOADING');
      this.reloadCount += 1;

      // Simulate reload booting the newly cached index.html
      const newHtml = this.cacheStorage.get(activeCacheName)?.get('/index.html') || '';
      const bootedMeta = extractEmbeddedClientVersionFromHtml(newHtml);
      if (!bootedMeta.clientVersion || bootedMeta.clientVersion !== targetVersion) {
        throw new Error('POST_RELOAD_VERSION_VERIFICATION_FAILED');
      }

      this.installedClientVersion = bootedMeta.clientVersion;
      this.installedClientBuildId = manifest.latestClientBuildId;
      this.lastErrorReason = null;

      // Verify post-reload manifest check transitions to UP_TO_DATE
      const postReloadEval = evaluateClientUpdateStatus({
        installedClientVersion: this.installedClientVersion,
        installedClientBuildId: this.installedClientBuildId,
        manifest,
      });
      this.lastEvaluation = postReloadEval;
      this.transition(postReloadEval.state);

      return {
        ok: postReloadEval.state === 'UP_TO_DATE',
        activeVersionAfter: this.installedClientVersion,
      };
    } catch (err: unknown) {
      // Rollback any staging cache and keep previous working client intact
      this.cacheStorage.delete(stagingCacheName);
      const reason = err instanceof Error ? err.message : String(err);
      this.lastErrorReason = reason;
      this.transition('FAILED');
      return {
        ok: false,
        activeVersionAfter: this.installedClientVersion,
        errorReason: reason,
      };
    }
  }
}

async function runVerification(): Promise<void> {
  const rootDir = process.cwd();
  console.log('================================================================================');
  console.log('GDF HTML CLIENT SELF-UPDATE ENGINE — END-TO-END VERIFICATION SUITE');
  console.log('================================================================================');

  // ---------------------------------------------------------------------------
  // 0. Build authoritative manifest from disk & inspect version before tests
  // ---------------------------------------------------------------------------
  const diskManifest = buildAuthoritativeClientReleaseManifest({ rootDir });
  console.log(`[INFO] Disk Manifest Latest Client Version : ${diskManifest.latestClientVersion}`);
  console.log(`[INFO] Disk Manifest Latest Client Build ID: ${diskManifest.latestClientBuildId}`);
  console.log(`[INFO] Disk Manifest Server Version        : ${diskManifest.serverVersion}`);
  console.log(`[INFO] Disk Manifest Bundle SHA-256        : ${diskManifest.bundleIntegritySha256}`);
  console.log(`[INFO] Disk Manifest Verified              : ${diskManifest.isVerified}`);

  recordAssertion(
    'Manifest Build & Asset SHA-256 Verification',
    diskManifest.isVerified === true &&
      diskManifest.status === 'SUCCESS' &&
      diskManifest.latestClientVersion === AUTHORITATIVE_CLIENT_VERSION &&
      diskManifest.assets.length >= 3 &&
      diskManifest.assets.every(a => /^[a-f0-9]{64}$/.test(a.sha256) && a.sizeBytes > 0),
    `Manifest verified=${diskManifest.isVerified} with ${diskManifest.assets.length} hashed client assets (/index.html, /js/gdfClientCore.js, /sw.js, /manifest.webmanifest)`
  );

  // Verify /sw.js and /public/sw.js are byte-for-byte identical
  const rootSwBuf = fs.readFileSync(path.join(rootDir, 'sw.js'));
  const publicSwBuf = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'));
  const rootSwSha = computeSha256HexFromBuffer(rootSwBuf);
  const publicSwSha = computeSha256HexFromBuffer(publicSwBuf);
  recordAssertion(
    'ServiceWorker Synchronization (/sw.js === /public/sw.js)',
    rootSwSha === publicSwSha,
    `/sw.js and /public/sw.js have identical SHA-256 (${rootSwSha.slice(0, 16)}...)`
  );

  // ---------------------------------------------------------------------------
  // Scenario 1: Installed client equals latest compatible client -> UP_TO_DATE
  // ---------------------------------------------------------------------------
  const scenario1Eval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: diskManifest,
  });
  recordAssertion(
    'Scenario 1 (Installed === Published Compatible Client -> UP_TO_DATE)',
    scenario1Eval.state === 'UP_TO_DATE' &&
      scenario1Eval.comparison === 'EQUAL' &&
      scenario1Eval.isUpdateAvailable === false &&
      !scenario1Eval.allowedActions.includes('UPDATE_NOW') &&
      scenario1Eval.statusBadgeEn === 'UP TO DATE' &&
      scenario1Eval.statusBadgeFa === 'به‌روز است',
    `state=${scenario1Eval.state}, comparison=${scenario1Eval.comparison}, isUpdateAvailable=${scenario1Eval.isUpdateAvailable}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 2: Newer compatible client exists -> UPDATE_AVAILABLE
  // ---------------------------------------------------------------------------
  const olderInstalledVersion = '2026.10.25-v75.1-PriorRelease';
  const scenario2Eval = evaluateClientUpdateStatus({
    installedClientVersion: olderInstalledVersion,
    installedClientBuildId: 'gdf-client-20261025-v75.1-00000000',
    manifest: diskManifest,
  });
  recordAssertion(
    'Scenario 2A (Installed Older Client vs Newer Published Client -> UPDATE_AVAILABLE)',
    scenario2Eval.state === 'UPDATE_AVAILABLE' &&
      scenario2Eval.comparison === 'INSTALLED_OLDER' &&
      scenario2Eval.isUpdateAvailable === true &&
      scenario2Eval.allowedActions.includes('UPDATE_NOW') &&
      scenario2Eval.statusBadgeEn === 'UPDATE AVAILABLE' &&
      scenario2Eval.statusBadgeFa === 'نسخه جدید موجود است',
    `installed=${olderInstalledVersion} < latest=${diskManifest.latestClientVersion} -> state=${scenario2Eval.state}, allowedActions=[${scenario2Eval.allowedActions.join(',')}]`
  );

  // Also test same version string with newer build ID (hotfix asset rebuild)
  const scenario2BuildDriftEval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: 'gdf-client-20261027-v80.0-deadbeef',
    manifest: diskManifest,
  });
  recordAssertion(
    'Scenario 2B (Same Client Version String with Newer Asset Build ID -> UPDATE_AVAILABLE)',
    scenario2BuildDriftEval.state === 'UPDATE_AVAILABLE' &&
      scenario2BuildDriftEval.comparison === 'INSTALLED_OLDER' &&
      scenario2BuildDriftEval.isUpdateAvailable === true &&
      scenario2BuildDriftEval.allowedActions.includes('UPDATE_NOW'),
    `buildId drift detected -> state=${scenario2BuildDriftEval.state}, comparison=${scenario2BuildDriftEval.comparison}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 3: Server version changes while client version does not -> NO false update
  // ---------------------------------------------------------------------------
  const manifestWithNewerServerOnly: ClientReleaseManifestPayload = {
    ...diskManifest,
    serverVersion: '2026.11.02-v82.4-BackendOnlyPatch',
    latestClientVersion: diskManifest.latestClientVersion,
    latestClientBuildId: diskManifest.latestClientBuildId,
  };
  const scenario3Eval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: manifestWithNewerServerOnly,
  });
  recordAssertion(
    'Scenario 3A (Server Version Changes While Client Version Matches -> UP_TO_DATE, No False Update)',
    scenario3Eval.state === 'UP_TO_DATE' &&
      scenario3Eval.isUpdateAvailable === false &&
      !scenario3Eval.allowedActions.includes('UPDATE_NOW') &&
      scenario3Eval.serverRuntimeVersion === '2026.11.02-v82.4-BackendOnlyPatch',
    `serverRuntimeVersion=${scenario3Eval.serverRuntimeVersion}, clientVersion=${scenario3Eval.installedClientVersion} -> state=${scenario3Eval.state}`
  );

  const manifestWithIncompatibleServer: ClientReleaseManifestPayload = {
    ...diskManifest,
    serverVersion: '2025.01.01-v10.0-IncompatibleOldServer',
  };
  const scenario3IncompatEval = evaluateClientUpdateStatus({
    installedClientVersion: olderInstalledVersion,
    installedClientBuildId: 'gdf-client-20261025-v75.1-00000000',
    manifest: manifestWithIncompatibleServer,
  });
  recordAssertion(
    'Scenario 3B (Incompatible Server Version Blocks Client Update -> FAILED / INCOMPATIBLE_SERVER)',
    scenario3IncompatEval.state === 'FAILED' &&
      scenario3IncompatEval.comparison === 'INCOMPATIBLE_SERVER' &&
      !scenario3IncompatEval.allowedActions.includes('UPDATE_NOW'),
    `incompatible serverVersion=${manifestWithIncompatibleServer.serverVersion} -> state=${scenario3IncompatEval.state}, comparison=${scenario3IncompatEval.comparison}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 4: Manifest fails or returns invalid data or UNKNOWN -> UNKNOWN, never UP_TO_DATE
  // ---------------------------------------------------------------------------
  const scenario4NullEval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: null,
  });
  const scenario4UnknownStrEval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: {
      ...diskManifest,
      latestClientVersion: 'UNKNOWN',
    },
  });
  const scenario4UnverifiedEval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: {
      ...diskManifest,
      isVerified: false,
    },
  });
  const scenario4BadInstalledEval = evaluateClientUpdateStatus({
    installedClientVersion: 'UNKNOWN',
    installedClientBuildId: undefined,
    manifest: diskManifest,
  });
  const scenario4EmptyAssetsEval = evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: {
      ...diskManifest,
      assets: [],
    },
  });

  recordAssertion(
    'Scenario 4 (Missing, Unreachable, Malformed, or UNKNOWN Version -> UNKNOWN, Never UP_TO_DATE)',
    scenario4NullEval.state === 'UNKNOWN' &&
      scenario4UnknownStrEval.state === 'UNKNOWN' &&
      scenario4UnverifiedEval.state === 'FAILED' &&
      scenario4BadInstalledEval.state === 'UNKNOWN' &&
      scenario4EmptyAssetsEval.state === 'UNKNOWN' &&
      scenario4NullEval.statusBadgeEn === 'UPDATE STATUS UNKNOWN' &&
      scenario4NullEval.statusBadgeFa === 'وضعیت به‌روزرسانی نامشخص',
    `null->${scenario4NullEval.state}, latest="UNKNOWN"->${scenario4UnknownStrEval.state}, isVerified=false->${scenario4UnverifiedEval.state}, installed="UNKNOWN"->${scenario4BadInstalledEval.state}, emptyAssets->${scenario4EmptyAssetsEval.state}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 5: Update download or integrity check fails -> FAILED, old client remains intact
  // ---------------------------------------------------------------------------
  const simFailRuntime = new SimulatedBrowserUpdateRuntime(
    olderInstalledVersion,
    'gdf-client-20261025-v75.1-00000000'
  );
  await simFailRuntime.checkForUpdates(async () => ({
    ok: true,
    status: 200,
    json: async () => diskManifest,
  }));

  // Corrupt /js/gdfClientCore.js payload during download to trigger SHA-256 verification failure
  const failUpdateOutcome = await simFailRuntime.applyInPlaceUpdate(diskManifest, async (assetPath: string) => {
    if (assetPath === '/index.html') {
      return {
        ok: true,
        status: 200,
        text: async () => fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8'),
      };
    }
    if (assetPath === '/js/gdfClientCore.js') {
      return {
        ok: true,
        status: 200,
        text: async () => '/* CORRUPTED_PARTIAL_DOWNLOAD_PAYLOAD */',
      };
    }
    if (assetPath === '/sw.js') {
      return {
        ok: true,
        status: 200,
        text: async () => fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8'),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => fs.readFileSync(path.join(rootDir, 'public', 'manifest.webmanifest'), 'utf8'),
    };
  });

  const oldCacheStillIntact =
    simFailRuntime.cacheStorage.has(`gdf-quant-${olderInstalledVersion}`) &&
    !simFailRuntime.cacheStorage.has(`gdf-client-stage-${diskManifest.latestClientVersion}`) &&
    !simFailRuntime.cacheStorage.has(`gdf-quant-${diskManifest.latestClientVersion}`);

  recordAssertion(
    'Scenario 5 (Corrupted Asset SHA-256 Fails Verification -> FAILED & Old Client Cache Preserved)',
    failUpdateOutcome.ok === false &&
      simFailRuntime.state === 'FAILED' &&
      simFailRuntime.installedClientVersion === olderInstalledVersion &&
      simFailRuntime.reloadCount === 0 &&
      oldCacheStillIntact &&
      Boolean(failUpdateOutcome.errorReason && failUpdateOutcome.errorReason.includes('INTEGRITY_MISMATCH_/js/gdfClientCore.js')),
    `stateHistory=[${simFailRuntime.stateHistory.join(' -> ')}], activeVersionAfter=${simFailRuntime.installedClientVersion}, oldCacheIntact=${oldCacheStillIntact}, error=${failUpdateOutcome.errorReason}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 6: Update succeeds -> Newer client version is installed, verified, and post-reload UP_TO_DATE
  // ---------------------------------------------------------------------------
  const simSuccessRuntime = new SimulatedBrowserUpdateRuntime(
    olderInstalledVersion,
    'gdf-client-20261025-v75.1-00000000'
  );
  const preUpdateEval = await simSuccessRuntime.checkForUpdates(async () => ({
    ok: true,
    status: 200,
    json: async () => diskManifest,
  }));

  const successUpdateOutcome = await simSuccessRuntime.applyInPlaceUpdate(diskManifest, async (assetPath: string) => {
    const mapDisk: Record<string, string> = {
      '/index.html': path.join(rootDir, 'index.html'),
      '/js/gdfClientCore.js': path.join(rootDir, 'public', 'js', 'gdfClientCore.js'),
      '/sw.js': path.join(rootDir, 'sw.js'),
      '/manifest.webmanifest': path.join(rootDir, 'public', 'manifest.webmanifest'),
    };
    const body = fs.readFileSync(mapDisk[assetPath], 'utf8');
    return {
      ok: true,
      status: 200,
      text: async () => body,
    };
  });

  const expectedTransitionSequence = [
    'CHECKING',
    'UPDATE_AVAILABLE',
    'DOWNLOADING',
    'VERIFYING',
    'INSTALLING',
    'RELOADING',
    'UP_TO_DATE',
  ];
  const transitionMatches =
    JSON.stringify(simSuccessRuntime.stateHistory) === JSON.stringify(expectedTransitionSequence);

  recordAssertion(
    'Scenario 6 (In-Place Update Succeeds -> Verified SHA-256 Promotion, Reload, and UP_TO_DATE)',
    preUpdateEval.state === 'UPDATE_AVAILABLE' &&
      successUpdateOutcome.ok === true &&
      simSuccessRuntime.installedClientVersion === diskManifest.latestClientVersion &&
      simSuccessRuntime.state === 'UP_TO_DATE' &&
      transitionMatches &&
      simSuccessRuntime.cacheStorage.has(`gdf-quant-${diskManifest.latestClientVersion}`) &&
      !simSuccessRuntime.cacheStorage.has(`gdf-quant-${olderInstalledVersion}`) &&
      simSuccessRuntime.swMessages.length === 1 &&
      simSuccessRuntime.swMessages[0].type === 'ACTIVATE_VERIFIED_RELEASE',
    `versionBefore=${olderInstalledVersion} -> versionAfter=${simSuccessRuntime.installedClientVersion}, transitions=[${simSuccessRuntime.stateHistory.join(' -> ')}]`
  );

  // ---------------------------------------------------------------------------
  // Scenario 7: End-user menu inspection in index.html & browser GDFClientCore parity
  // ---------------------------------------------------------------------------
  const indexHtmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const forbiddenEndUserTokens = [
    'btnDownloadSourceZip',
    'btnDownloadReleaseBundle',
    'btnRefreshPwaCache',
    'Download Full Source (ZIP)',
    'Download Release Bundle',
    'دانلود سورس کامل (ZIP)',
    'دانلود بسته نصبی (Bundle)',
  ];
  const foundForbiddenTokens = forbiddenEndUserTokens.filter(token => indexHtmlContent.includes(token));

  const requiredEndUserMenuIds = [
    'id="btnCheckUpdatesNow"',
    'id="btnUpdateNow"',
    'id="btnRetryUpdate"',
    'id="btnDismissUpdateModal"',
  ];
  const allRequiredButtonsPresent = requiredEndUserMenuIds.every(idStr => indexHtmlContent.includes(idStr));

  recordAssertion(
    'Scenario 7 (End-User Update Menu Contains Only Check / Update Now / Retry / Close; No ZIP or Bundle Downloads)',
    foundForbiddenTokens.length === 0 && allRequiredButtonsPresent,
    `forbiddenTokensFound=${foundForbiddenTokens.length}, requiredButtonsPresent=${allRequiredButtonsPresent}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 8: Verify browser window.GDFClientCore matches TypeScript clientReleaseManifest
  // ---------------------------------------------------------------------------
  const clientCoreJs = fs.readFileSync(path.join(rootDir, 'public', 'js', 'gdfClientCore.js'), 'utf8');
  const sandbox: Record<string, any> = {
    window: {},
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      documentElement: { lang: 'en', dir: 'ltr' },
    },
    console,
    TextEncoder,
    Uint8Array,
    Array,
    Object,
    Math,
    Number,
    String,
    Boolean,
    RegExp,
    JSON,
    Promise,
    crypto: (globalThis as any).crypto || crypto.webcrypto,
  };
  sandbox.window.document = sandbox.document;
  sandbox.window.crypto = sandbox.crypto;
  vm.createContext(sandbox);
  vm.runInContext(clientCoreJs, sandbox);

  const browserCore = sandbox.window.GDFClientCore;
  const browserEval1 = browserCore.evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: diskManifest,
  });
  const browserEval2 = browserCore.evaluateClientUpdateStatus({
    installedClientVersion: olderInstalledVersion,
    installedClientBuildId: 'gdf-client-20261025-v75.1-00000000',
    manifest: diskManifest,
  });
  const browserEval3 = browserCore.evaluateClientUpdateStatus({
    installedClientVersion: diskManifest.latestClientVersion,
    installedClientBuildId: diskManifest.latestClientBuildId,
    manifest: null,
  });
  const sampleShaBrowser = await browserCore.computeSha256Hex('gdf-update-verification-test');
  const sampleShaNode = computeSha256HexFromBuffer('gdf-update-verification-test');

  recordAssertion(
    'Scenario 8 (Browser GDFClientCore Parity with Server Evaluator & WebCrypto SHA-256)',
    browserEval1.state === 'UP_TO_DATE' &&
      browserEval2.state === 'UPDATE_AVAILABLE' &&
      browserEval3.state === 'UNKNOWN' &&
      sampleShaBrowser === sampleShaNode,
    `browserEval(equal)=${browserEval1.state}, browserEval(older)=${browserEval2.state}, browserEval(null)=${browserEval3.state}, sha256Match=${sampleShaBrowser === sampleShaNode}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 9: Live HTTP Endpoint Verification against running server (if reachable on port 3000)
  // ---------------------------------------------------------------------------
  try {
    const manifestResp = await fetch(
      `http://127.0.0.1:3000/api/release-manifest?installedClientVersion=${encodeURIComponent(olderInstalledVersion)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (manifestResp.ok) {
      const liveManifest = (await manifestResp.json()) as ClientReleaseManifestPayload;
      const cacheControl = manifestResp.headers.get('cache-control') || '';

      let allLiveAssetsMatchSha = true;
      const liveAssetDetails: string[] = [];
      for (const asset of liveManifest.assets || []) {
        const assetResp = await fetch(`http://127.0.0.1:3000${asset.path}`);
        const arrayBuf = await assetResp.arrayBuffer();
        const actualSha = computeSha256HexFromBuffer(Buffer.from(arrayBuf));
        const matches = actualSha === asset.sha256;
        if (!matches) allLiveAssetsMatchSha = false;
        liveAssetDetails.push(`${asset.path}:${matches ? 'OK' : 'MISMATCH'}`);
      }

      const currentResp = await fetch(
        `http://127.0.0.1:3000/api/release-manifest?installedClientVersion=${encodeURIComponent(
          liveManifest.latestClientVersion
        )}&installedBuildId=${encodeURIComponent(liveManifest.latestClientBuildId)}`
      );
      const currentManifest = (await currentResp.json()) as ClientReleaseManifestPayload;

      recordAssertion(
        'Scenario 9 (Live HTTP /api/release-manifest & Asset SHA-256 End-to-End Check)',
        liveManifest.isVerified === true &&
          liveManifest.evaluation?.state === 'UPDATE_AVAILABLE' &&
          currentManifest.evaluation?.state === 'UP_TO_DATE' &&
          cacheControl.includes('no-store') &&
          allLiveAssetsMatchSha,
        `HTTP 200, Cache-Control="${cacheControl}", evaluation(older)=${liveManifest.evaluation?.state}, evaluation(current)=${currentManifest.evaluation?.state}, assets=[${liveAssetDetails.join(', ')}]`
      );
    } else {
      console.log(`[INFO] Live server returned status ${manifestResp.status} on port 3000.`);
    }
  } catch {
    console.log('[INFO] Live HTTP server not currently listening on 127.0.0.1:3000; skipping live socket check.');
  }

  // ---------------------------------------------------------------------------
  // Scenario 10: ServiceWorker (sw.js) VM Execution — Failed Install & Incomplete Activate Never Destroy Working Cache
  // ---------------------------------------------------------------------------
  const swJsSource = fs.readFileSync(path.join(rootDir, 'sw.js'), 'utf8');
  const createSwHarness = (fetchImpl: (url: string) => Promise<{ ok: boolean; status: number; headers: Map<string, string>; text: () => Promise<string>; clone: () => any }>) => {
    const listeners: Record<string, Function> = {};
    const store = new Map<string, Map<string, { status: number; body: string }>>();
    let skipWaitingCalled = 0;
    let clientsClaimCalled = 0;

    // Seed an existing working client cache from a prior release
    const priorCache = new Map<string, { status: number; body: string }>();
    priorCache.set('/index.html', { status: 200, body: '<!DOCTYPE html><html>Prior Working Client</html>' });
    priorCache.set('/js/gdfClientCore.js', { status: 200, body: '/* Prior Working Client Core */' });
    store.set('gdf-quant-2026.10.25-v75.1-PriorRelease', priorCache);

    const cachesMock = {
      has: async (name: string) => store.has(name),
      keys: async () => Array.from(store.keys()),
      delete: async (name: string) => store.delete(name),
      open: async (name: string) => {
        if (!store.has(name)) store.set(name, new Map());
        const map = store.get(name)!;
        return {
          put: async (reqOrUrl: any, res: any) => {
            const key = typeof reqOrUrl === 'string' ? reqOrUrl : new URL(reqOrUrl.url).pathname;
            map.set(key, { status: res.status || 200, body: res._body || '' });
          },
          match: async (reqOrUrl: any) => {
            const key = typeof reqOrUrl === 'string' ? reqOrUrl : new URL(reqOrUrl.url).pathname;
            const hit = map.get(key);
            if (!hit) return undefined;
            return { status: hit.status, _body: hit.body, clone: () => ({ status: hit.status, _body: hit.body }) };
          },
        };
      },
      match: async (reqOrUrl: any) => {
        const key = typeof reqOrUrl === 'string' ? reqOrUrl : new URL(reqOrUrl.url).pathname;
        for (const m of store.values()) {
          const hit = m.get(key);
          if (hit) return { status: hit.status, _body: hit.body };
        }
        return undefined;
      },
    };

    const selfMock = {
      addEventListener: (type: string, fn: Function) => {
        listeners[type] = fn;
      },
      skipWaiting: async () => {
        skipWaitingCalled += 1;
      },
      clients: {
        claim: async () => {
          clientsClaimCalled += 1;
        },
      },
    };

    class MockResponse {
      public status: number;
      public ok: boolean;
      public headers: any;
      public _body: string;
      constructor(body: string, init?: { status?: number; headers?: any }) {
        this._body = body;
        this.status = init?.status ?? 200;
        this.ok = this.status >= 200 && this.status < 300;
        this.headers = init?.headers || new Map();
      }
      async text() {
        return this._body;
      }
      clone() {
        return new MockResponse(this._body, { status: this.status, headers: this.headers });
      }
    }

    const swContext: Record<string, any> = {
      self: selfMock,
      caches: cachesMock,
      fetch: fetchImpl,
      Headers: Map,
      Response: MockResponse,
      URL,
      Promise,
      console,
    };
    vm.createContext(swContext);
    vm.runInContext(swJsSource, swContext);

    return {
      listeners,
      store,
      getSkipWaitingCalled: () => skipWaitingCalled,
      getClientsClaimCalled: () => clientsClaimCalled,
    };
  };

  // 10A: Simulate failed fetch during ServiceWorker install -> install rejects, skipWaiting is NOT called, prior cache untouched
  const failedInstallHarness = createSwHarness(async (url: string) => {
    if (url === '/js/gdfClientCore.js') {
      return { ok: false, status: 503, headers: new Map(), text: async () => '', clone: () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      headers: new Map(),
      text: async () => '/* ok */',
      clone: () => ({ status: 200, _body: '/* ok */' }),
    };
  });

  let installRejectedOnFailure = false;
  let installPromise10A: Promise<any> = Promise.resolve();
  failedInstallHarness.listeners.install({
    waitUntil: (p: Promise<any>) => {
      installPromise10A = p;
    },
  });
  try {
    await installPromise10A;
  } catch {
    installRejectedOnFailure = true;
  }

  // Also test activate when new cache is incomplete -> prior working cache MUST NOT be deleted
  let activatePromise10A: Promise<any> = Promise.resolve();
  failedInstallHarness.listeners.activate({
    waitUntil: (p: Promise<any>) => {
      activatePromise10A = p;
    },
  });
  await activatePromise10A;

  const priorWorkingCachePreserved = failedInstallHarness.store.has('gdf-quant-2026.10.25-v75.1-PriorRelease');

  recordAssertion(
    'Scenario 10 (SW Lifecycle Safety: Failed Install Aborts skipWaiting & Incomplete Activate Preserves Last Working Cache)',
    installRejectedOnFailure === true &&
      failedInstallHarness.getSkipWaitingCalled() === 0 &&
      priorWorkingCachePreserved === true,
    `installRejectedOnFailure=${installRejectedOnFailure}, skipWaitingCalls=${failedInstallHarness.getSkipWaitingCalled()}, priorWorkingCachePreserved=${priorWorkingCachePreserved}`
  );

  // ---------------------------------------------------------------------------
  // Scenario 11: ServiceWorker ACTIVATE_VERIFIED_RELEASE & ROLLBACK_BROKEN_RELEASE Recovery
  // ---------------------------------------------------------------------------
  let msgPromise: Promise<any> = Promise.resolve();
  let portReply: any = null;
  failedInstallHarness.listeners.message({
    data: {
      type: 'ACTIVATE_VERIFIED_RELEASE',
      cacheName: 'gdf-quant-incomplete-broken-release',
    },
    ports: [{ postMessage: (msg: any) => { portReply = msg; } }],
    waitUntil: (p: Promise<any>) => { msgPromise = p; },
  });
  await msgPromise;

  const rejectedIncompletePromotion =
    portReply &&
    portReply.ok === false &&
    failedInstallHarness.store.has('gdf-quant-2026.10.25-v75.1-PriorRelease');

  // Now stage a broken release cache and trigger ROLLBACK_BROKEN_RELEASE -> broken cache removed, fallback preserved
  failedInstallHarness.store.set('gdf-quant-broken-v99', new Map([['/index.html', { status: 200, body: 'broken' }]]));
  failedInstallHarness.listeners.message({
    data: {
      type: 'ROLLBACK_BROKEN_RELEASE',
      brokenCacheName: 'gdf-quant-broken-v99',
      fallbackCacheName: 'gdf-quant-2026.10.25-v75.1-PriorRelease',
    },
    waitUntil: (p: Promise<any>) => { msgPromise = p; },
  });
  await msgPromise;

  const rollbackRestoredFallback =
    !failedInstallHarness.store.has('gdf-quant-broken-v99') &&
    failedInstallHarness.store.has('gdf-quant-2026.10.25-v75.1-PriorRelease');

  recordAssertion(
    'Scenario 11 (SW ACTIVATE_VERIFIED_RELEASE Rejects Incomplete Cache & ROLLBACK_BROKEN_RELEASE Restores Fallback)',
    Boolean(rejectedIncompletePromotion && rollbackRestoredFallback),
    `rejectedIncompletePromotion=${Boolean(rejectedIncompletePromotion)}, rollbackRestoredFallback=${rollbackRestoredFallback}`
  );
  console.log('================================================================================');
  const passedCount = results.filter(r => r.passed).length;
  console.log(`SUMMARY: ${passedCount}/${results.length} scenarios passed.`);
  console.log('================================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Fatal error in check-client-update-engine:', err);
  process.exit(1);
});

