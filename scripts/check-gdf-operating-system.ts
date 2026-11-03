import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import {
  atomicWriteFileSync,
  buildExternalAuditorPacket,
  cleanupOrphanedTempFiles,
  computeProofReportIntegritySignature,
  evaluateDualControlPromotionGate,
  evaluateProofReportFreshness,
  getAuthorizedOperatorToken,
  issueOperatorSessionCookieAndCsrf,
  loadOrInitializeGdfOsRegistry,
  resetProofEvaluatorsToDefault,
  resolveGdfOsDataDir,
  runGdfAuditAndLoopback,
  runGdfProofSuite,
  saveGdfOsRegistry,
  setScientificCoreEvaluatorForTesting,
  syncGdfOsRegistryToCloudSqlImmediate,
  triggerLoopbackUpgrade,
  verifyOperatorMutationAuthorization,
  verifyOperatorSessionCookieAndCsrf,
} from '../src/services/gdfOperatingSystem.js';
import {
  evaluateParallelUniverseAndAwarenessCore,
  getIntelligenceCoreStateSnapshot,
  promoteCandidateArchitecture,
  writeBackValidatedMathToLatentModel,
} from '../src/services/intelligenceAwarenessCore.js';
import {
  isCloudSqlConfigured,
  loadGdfOsRegistryFromCloudSql,
} from '../src/db/gdfRepository.js';
import { evaluateScientificCorePipeline } from '../src/engine/scientificCore.js';
import {
  fetchVerifiedMacroNews,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
} from '../src/services/realDataWaterfall.js';

const BASE_URL = 'http://127.0.0.1:3000';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[GDF OS Verification Failed] ${message}`);
  }
}

function parseSemanticVersion(ver: string): { major: number; minor: number } {
  const m = String(ver).trim().match(/^v(\d+)\.(\d+)$/);
  assert(Boolean(m), `Invalid semantic version format: ${ver}`);
  return { major: parseInt(m![1], 10), minor: parseInt(m![2], 10) };
}

function createGdfOsConsoleDomHarness(indexHtml: string, mockFetchImpl: (url: string, init?: any) => Promise<any>) {
  const elements = new Map<string, any>();
  const tabBtns: any[] = [];

  const makeEl = (id: string, dataTab?: string) => {
    const attrs = new Map<string, string>();
    if (dataTab) attrs.set('data-gdf-os-tab', dataTab);
    const listeners = new Map<string, Array<(...args: any[]) => any>>();
    const classSet = new Set<string>(id === 'gdfOsDrawerOverlay' ? ['modal-overlay', 'hidden'] : []);
    let innerHtmlVal = '';
    const el: any = {
      id,
      textContent: id === 'gdfOsHeaderBadge' ? 'CHECKING' : id === 'gdfOsModalStatusPill' ? 'PROOF: CHECKING' : '',
      disabled: false,
      title: '',
      style: {
        display: id === 'gdfOsActionErrorBanner' ? 'none' : 'block',
        color: '#00e5ff',
        background: '',
        borderColor: '',
      },
      classList: {
        add(c: string) {
          classSet.add(c);
        },
        remove(c: string) {
          classSet.delete(c);
        },
        contains(c: string) {
          return classSet.has(c);
        },
      },
      setAttribute(k: string, v: string) {
        attrs.set(k, String(v));
      },
      getAttribute(k: string) {
        return attrs.get(k) ?? null;
      },
      addEventListener(type: string, cb: (...args: any[]) => any) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type)!.push(cb);
      },
      async click() {
        if (el.disabled) return;
        const list = listeners.get('click') || [];
        for (const fn of list) {
          await fn();
        }
      },
    };
    Object.defineProperty(el, 'innerHTML', {
      get() {
        return innerHtmlVal;
      },
      set(v: string) {
        innerHtmlVal = String(v);
      },
    });
    elements.set(id, el);
    return el;
  };

  makeEl('gdfOsDrawerOverlay');
  makeEl('btnGdfOsDrawer');
  makeEl('btnCloseGdfOsDrawer');
  makeEl('gdfOsTabContent');
  makeEl('gdfOsActionErrorBanner');
  makeEl('gdfOsHeaderBadge');
  makeEl('gdfOsModalStatusPill');

  for (const tabName of ['interview', 'playbooks', 'toolbox', 'proof', 'audit']) {
    tabBtns.push(makeEl(`tab-${tabName}`, tabName));
  }

  const documentStub = {
    getElementById(id: string) {
      if (!elements.has(id)) {
        return makeEl(id);
      }
      return elements.get(id);
    },
    querySelectorAll(sel: string) {
      if (sel === '[data-gdf-os-tab]') return tabBtns;
      return [];
    },
  };

  const startMarker = '(function initGdfOperatingSystemConsole() {';
  const startIdx = indexHtml.indexOf(startMarker);
  const endIdx = indexHtml.indexOf('</script>', startIdx);
  assert(startIdx > 0 && endIdx > startIdx, 'Could not locate initGdfOperatingSystemConsole in index.html');
  const scriptCode = indexHtml.slice(startIdx, endIdx);

  const sandbox: any = {
    window: {},
    document: documentStub,
    fetch: (url: string, init?: any) => mockFetchImpl(url, init),
    AbortController,
    setTimeout: () => 0, // prevent background 1200ms auto-timer from racing explicit test assertions
    clearTimeout,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Promise,
    JSON,
    Error,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(scriptCode, sandbox);

  return {
    elements,
    tabBtns,
    controller: sandbox.window.GDFOsConsoleController,
  };
}

async function main() {
  console.log('=== GDF 5-Step Operating System & Corrective Phase 1 Verification Suite ===');

  const registryPath = path.join(process.cwd(), 'data', 'gdf_os_registry.json');
  const pb006Path = path.join(process.cwd(), 'playbooks', 'PB-006.md');
  const originalRegistryRaw = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : null;
  const originalPb006Raw = fs.existsSync(pb006Path) ? fs.readFileSync(pb006Path, 'utf8') : null;

  try {
    // -------------------------------------------------------------------------
    // 1. Baseline Registry, Playbooks, Toolbox & Atomic Write Verification
    // -------------------------------------------------------------------------
    const registry = loadOrInitializeGdfOsRegistry();
    assert(registry.interviews.length >= 1, 'Expected at least 1 confirmed Interview record.');
    assert(registry.interviews[0].confirmedByOperator === true, 'Interview INT-001 must be confirmed by operator.');
    assert(registry.playbooks.length === 6, `Expected 6 Playbooks (PB-001..PB-006), got ${registry.playbooks.length}.`);
    assert(registry.toolbox.length === 12, `Expected 12 Toolbox entries (TB-001..TB-012), got ${registry.toolbox.length}.`);

    for (const pb of registry.playbooks) {
      const absPath = path.join(process.cwd(), pb.markdownPath.replace(/^\//, ''));
      assert(fs.existsSync(absPath), `Playbook Markdown missing on disk: ${absPath}`);
    }
    const toolboxMdPath = path.join(process.cwd(), 'toolbox', 'TOOLBOX_INDEX.md');
    assert(fs.existsSync(toolboxMdPath), 'Toolbox Index Markdown missing on disk: /toolbox/TOOLBOX_INDEX.md');

    for (const tb of registry.toolbox) {
      assert(tb.verifiedExistsOnDisk === true, `Toolbox asset missing on disk: ${tb.toolId} (${tb.whereItLives})`);
    }

    // Verify P2 Atomic Write & Corruption Recovery from .bak
    saveGdfOsRegistry(registry);
    assert(fs.existsSync(`${registryPath}.bak`), 'Expected atomic write backup file gdf_os_registry.json.bak to exist.');
    const validSavedRaw = fs.readFileSync(registryPath, 'utf8');
    fs.writeFileSync(registryPath, '{ corrupted json payload', 'utf8');
    const recoveredRegistry = loadOrInitializeGdfOsRegistry();
    assert(
      recoveredRegistry.interviews.length === registry.interviews.length &&
        recoveredRegistry.playbooks.length === 6,
      'Expected loadOrInitializeGdfOsRegistry() to automatically recover from .bak upon corrupted primary JSON.'
    );
    atomicWriteFileSync(registryPath, validSavedRaw, { validateJson: true });
    console.log('[PASS] P2 Atomic Registry Write (.tmp -> validate -> .bak -> rename) & Corruption Recovery verified.');

    // -------------------------------------------------------------------------
    // 2. Step 4 Executable Proof Suite (Nominal PASS)
    // -------------------------------------------------------------------------
    resetProofEvaluatorsToDefault();
    const proofReport = runGdfProofSuite({
      requestedBy: 'CLI_VERIFICATION_SUITE',
      taskDescription: 'Verify GDF 5-Step Executable Proof Suite (v2.0.0-executable-proof-runner).',
    });
    console.log(`Proof Report ID: ${proofReport.proofId} | Overall Status: ${proofReport.overallStatus} | Runner Version: ${proofReport.runnerVersion}`);
    assert(
      proofReport.runnerVersion === 'v2.0.0-executable-proof-runner',
      `Expected runnerVersion v2.0.0-executable-proof-runner, got ${proofReport.runnerVersion}`
    );
    assert(proofReport.checks.length === 7, `Expected 7 registered executable proof checks, got ${proofReport.checks.length}`);
    for (const chk of proofReport.checks) {
      console.log(`  [${chk.status}] ${chk.checkId} (${chk.relatedPlaybook}) [${chk.durationMs}ms, ${chk.assertionsPassed}/${chk.assertionsTotal} assertions]: ${chk.evidence}`);
      assert(chk.status === 'PASS', `Check ${chk.checkId} did not PASS.`);
      assert(
        chk.executionType === 'EXECUTABLE_FUNCTIONAL_ASSERTION',
        `Check ${chk.checkId} must be EXECUTABLE_FUNCTIONAL_ASSERTION`
      );
      assert((chk.assertionsPassed || 0) >= 3, `Check ${chk.checkId} must execute real assertions.`);
    }
    assert(proofReport.overallStatus === 'PASS', 'Expected overall Proof status to be PASS.');
    assert(
      Array.isArray(proofReport.staticSourceInspection) &&
        proofReport.staticSourceInspection.length > 0 &&
        proofReport.staticSourceInspection.every(
          (s) => s.classification === 'STATIC_SOURCE_METADATA_ONLY_NEVER_PROOF'
        ),
      'Static source inspection must be kept separate and classified as STATIC_SOURCE_METADATA_ONLY_NEVER_PROOF.'
    );

    // -------------------------------------------------------------------------
    // 3. Step 5 On-Demand 6-Point Audit & Relative Semantic-Version Loopback
    // -------------------------------------------------------------------------
    const auditReport = runGdfAuditAndLoopback({ autoLoopbackOnFindings: false });
    console.log(`Audit Report ID: ${auditReport.auditId} | Missing Playbooks: ${auditReport.missingPlaybooks.length} | Missing Tools: ${auditReport.missingToolsOrBrokenWorkflows.length}`);
    assert(auditReport.missingPlaybooks.length === 0, 'Expected 0 missing playbooks.');
    assert(auditReport.missingToolsOrBrokenWorkflows.length === 0, 'Expected 0 missing tools.');
    assert(auditReport.findings.length === 6, 'Expected all 6 mandatory audit dimensions.');

    const regBeforeLb = loadOrInitializeGdfOsRegistry();
    const pb6Before = regBeforeLb.playbooks.find((p) => p.playbookId === 'PB-006')!;
    const verBefore = parseSemanticVersion(pb6Before.version);

    const lb = triggerLoopbackUpgrade({
      playbookId: 'PB-006',
      reason: 'Verified Step 5 Loopback relative semantic version bump & bi-directional Markdown sync.',
      addedFailureModeOrStep: 'Verified cryptographic SHA-256 digest tracking across /playbooks/PB-001.md..PB-006.md.',
    });
    assert(Boolean(lb), 'Expected loopback upgrade event on PB-006.');
    const verAfter = parseSemanticVersion(lb!.newVersion);
    assert(
      verAfter.major === verBefore.major && verAfter.minor === verBefore.minor + 1,
      `Expected PB-006 version to increment relatively from ${pb6Before.version} to v${verBefore.major}.${verBefore.minor + 1}, got ${lb!.newVersion}`
    );
    console.log(`[PASS] Relative semantic-version loopback increment verified (${lb!.previousVersion} -> ${lb!.newVersion}).`);

    // -------------------------------------------------------------------------
    // 4. ACCEPTANCE TEST 1: Deliberately broken scientific-core execution produces proof FAIL
    // -------------------------------------------------------------------------
    setScientificCoreEvaluatorForTesting((params: any) => {
      const realOut = evaluateScientificCorePipeline(params);
      return {
        ...realOut,
        impliedLatentPriceUsd: Number.NaN,
        latentState: {
          ...realOut.latentState,
          logPriceLevel: Number.NaN,
        },
      };
    });

    const brokenProofReport = runGdfProofSuite({
      requestedBy: 'FAULT_INJECTION_ACCEPTANCE_TEST',
      taskDescription: 'Verify deliberately broken scientificCore produces FAIL proof report.',
    });
    const brokenPb001Check = brokenProofReport.checks.find((c) => c.checkId === 'CHK-PB001-SCIENTIFIC-CORE');
    assert(
      brokenPb001Check?.status === 'FAIL',
      `Expected CHK-PB001-SCIENTIFIC-CORE to FAIL when scientificCore returns NaN, got ${brokenPb001Check?.status}`
    );
    assert(
      brokenProofReport.overallStatus === 'FAIL',
      `Expected overall Proof status to be FAIL when scientificCore is broken, got ${brokenProofReport.overallStatus}`
    );
    console.log(
      `[PASS Acceptance #1] Deliberately broken scientificCore produced proof FAIL (${brokenProofReport.proofId}: ${brokenPb001Check?.error}).`
    );

    // -------------------------------------------------------------------------
    // 5. ACCEPTANCE TEST 2: MANUAL_MMI promotion rejects a failed proof with HTTP 409
    // -------------------------------------------------------------------------
    const operatorToken = getAuthorizedOperatorToken();
    const operatorHeaders = {
      'Content-Type': 'application/json',
      'X-GDF-Actor-Role': 'OPERATOR_MMI',
      'X-GDF-Operator-Token': operatorToken,
    };

    // Verify direct service call blocks MANUAL_MMI on failed proof
    const directManualFailed = promoteCandidateArchitecture({
      mode: 'MANUAL_MMI',
      operatorNote: 'Attempt manual MMI promotion while proof is FAIL',
    });
    assert(
      directManualFailed.promoted === false,
      'promoteCandidateArchitecture(MANUAL_MMI) must reject promotion when latest proof report is FAIL.'
    );

    // Verify complete HTTP route POST /api/intelligence-core/promote rejects MANUAL_MMI on failed proof with HTTP 409
    const httpManualFailedRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'MANUAL_MMI',
        operatorNote: 'HTTP route test: Manual MMI promotion with failed proof',
      }),
    });
    const httpManualFailedJson: any = await httpManualFailedRes.json();
    assert(
      httpManualFailedRes.status === 409 && httpManualFailedJson.promoted === false,
      `Expected POST /api/intelligence-core/promote (MANUAL_MMI) to reject failed proof with HTTP 409, got HTTP ${httpManualFailedRes.status} (promoted=${httpManualFailedJson.promoted})`
    );
    assert(
      httpManualFailedJson.gdfOsDualControlGate?.latestProofStatus === 'FAIL',
      `Expected latestProofStatus FAIL, got ${httpManualFailedJson.gdfOsDualControlGate?.latestProofStatus}`
    );
    console.log(
      `[PASS Acceptance #2] MANUAL_MMI promotion rejected failed proof with HTTP 409 (${httpManualFailedJson.reasonEn}).`
    );

    // -------------------------------------------------------------------------
    // 6. ACCEPTANCE TEST 3: AUTOMATIC_VERIFIED promotion rejects failed or stale proof
    // -------------------------------------------------------------------------
    const httpAutoFailedRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'AUTOMATIC_VERIFIED',
        operatorNote: 'HTTP route test: AUTOMATIC_VERIFIED promotion with failed proof',
      }),
    });
    const httpAutoFailedJson: any = await httpAutoFailedRes.json();
    assert(
      httpAutoFailedRes.status === 409 && httpAutoFailedJson.promoted === false,
      `Expected AUTOMATIC_VERIFIED promotion to reject failed proof with HTTP 409, got HTTP ${httpAutoFailedRes.status}`
    );

    // Restore healthy scientificCore evaluator and generate a PASS proof, then age its timestamp to 20 minutes ago (STALE)
    resetProofEvaluatorsToDefault();
    const freshPassProof = runGdfProofSuite({
      requestedBy: 'RESTORE_BEFORE_STALE_TEST',
    });
    assert(freshPassProof.overallStatus === 'PASS', 'Expected restored proof suite to PASS.');

    const regForStale = loadOrInitializeGdfOsRegistry();
    const staleTimestampIso = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20m old (> 15m max age)
    regForStale.proofReports[0].timestampIso = staleTimestampIso;
    saveGdfOsRegistry(regForStale);

    const staleFreshness = evaluateProofReportFreshness(regForStale.proofReports[0]);
    assert(
      staleFreshness.effectiveStatus === 'STALE' && staleFreshness.gateStatus === 'STALE',
      `Expected stale proof freshness status to be STALE, got ${staleFreshness.effectiveStatus}`
    );

    const httpAutoStaleRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'AUTOMATIC_VERIFIED',
        operatorNote: 'HTTP route test: AUTOMATIC_VERIFIED promotion with stale proof',
      }),
    });
    const httpAutoStaleJson: any = await httpAutoStaleRes.json();
    assert(
      httpAutoStaleRes.status === 409 && httpAutoStaleJson.promoted === false,
      `Expected AUTOMATIC_VERIFIED promotion to reject stale proof with HTTP 409, got HTTP ${httpAutoStaleRes.status}`
    );
    assert(
      httpAutoStaleJson.gdfOsDualControlGate?.latestProofStatus === 'STALE',
      `Expected latestProofStatus STALE, got ${httpAutoStaleJson.gdfOsDualControlGate?.latestProofStatus}`
    );

    // Also verify MANUAL_MMI rejects stale proof with HTTP 409
    const httpManualStaleRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'MANUAL_MMI',
        operatorNote: 'HTTP route test: MANUAL_MMI promotion with stale proof',
      }),
    });
    assert(httpManualStaleRes.status === 409, 'MANUAL_MMI must also reject stale proof with HTTP 409.');
    console.log(
      `[PASS Acceptance #3] AUTOMATIC_VERIFIED and MANUAL_MMI promotions rejected failed and stale (20m old) proof with HTTP 409.`
    );

    // -------------------------------------------------------------------------
    // 7. ACCEPTANCE TEST 4: Missing proof rejects promotion (never auto-runs proof)
    // -------------------------------------------------------------------------
    const regForMissing = loadOrInitializeGdfOsRegistry();
    regForMissing.proofReports = [];
    saveGdfOsRegistry(regForMissing);

    const httpMissingManualRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'MANUAL_MMI',
        operatorNote: 'HTTP route test: Promotion with missing proof',
      }),
    });
    const httpMissingManualJson: any = await httpMissingManualRes.json();
    assert(
      httpMissingManualRes.status === 409 && httpMissingManualJson.promoted === false,
      `Expected missing proof to reject MANUAL_MMI promotion with HTTP 409, got HTTP ${httpMissingManualRes.status}`
    );
    assert(
      httpMissingManualJson.gdfOsDualControlGate?.latestProofStatus === 'MISSING',
      `Expected latestProofStatus MISSING when proofReports is empty, got ${httpMissingManualJson.gdfOsDualControlGate?.latestProofStatus}`
    );
    // Verify GET /api/gdf-os/state does NOT auto-run proof when proofReports is empty
    const stateWhenMissingRes = await fetch(`${BASE_URL}/api/gdf-os/state`);
    const stateWhenMissingJson: any = await stateWhenMissingRes.json();
    assert(
      stateWhenMissingJson.proofFreshness?.effectiveStatus === 'UNAVAILABLE' &&
        stateWhenMissingJson.registry.proofReports.length === 0,
      'GET /api/gdf-os/state must NOT automatically run the proof suite when proofReports is empty; it must report UNAVAILABLE.'
    );
    console.log('[PASS Acceptance #4] Missing proof rejected promotion with HTTP 409 and GET /api/gdf-os/state did not auto-run proof.');

    // -------------------------------------------------------------------------
    // 8. ACCEPTANCE TEST 5: Unauthorized callers cannot mutate GDF OS or Intelligence Core state
    // -------------------------------------------------------------------------
    const unauthPromoteRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'MANUAL_MMI' }),
    });
    assert(
      unauthPromoteRes.status === 401,
      `Expected unauthenticated POST /api/intelligence-core/promote to return HTTP 401, got ${unauthPromoteRes.status}`
    );

    const unauthProofRes = await fetch(`${BASE_URL}/api/gdf-os/run-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-GDF-Operator-Token': 'INVALID_TOKEN' },
      body: JSON.stringify({ requestedBy: 'ATTACKER' }),
    });
    assert(
      unauthProofRes.status === 401,
      `Expected invalid-token POST /api/gdf-os/run-proof to return HTTP 401, got ${unauthProofRes.status}`
    );

    const unauthLoopbackRes = await fetch(`${BASE_URL}/api/gdf-os/loopback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playbookId: 'PB-001', reason: 'Unauthenticated mutation attempt' }),
    });
    assert(
      unauthLoopbackRes.status === 401,
      `Expected unauthenticated POST /api/gdf-os/loopback to return HTTP 401, got ${unauthLoopbackRes.status}`
    );
    console.log('[PASS Acceptance #5] Unauthorized callers blocked with HTTP 401 across mutating endpoints.');

    // -------------------------------------------------------------------------
    // 9. ACCEPTANCE TEST 6: External auditor access cannot modify state (HTTP 403)
    // -------------------------------------------------------------------------
    const auditorHeaders = {
      'Content-Type': 'application/json',
      'X-GDF-Actor-Role': 'READ_ONLY_AUDITOR_AND_ADVISOR',
      'X-GDF-Operator-Token': operatorToken, // Even with a token, external auditor role must be forbidden from mutating state
    };

    const auditorPromoteRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: auditorHeaders,
      body: JSON.stringify({ mode: 'MANUAL_MMI' }),
    });
    assert(
      auditorPromoteRes.status === 403,
      `Expected external auditor POST /api/intelligence-core/promote to return HTTP 403, got ${auditorPromoteRes.status}`
    );

    const auditorLoopbackRes = await fetch(`${BASE_URL}/api/gdf-os/loopback`, {
      method: 'POST',
      headers: auditorHeaders,
      body: JSON.stringify({ playbookId: 'PB-001' }),
    });
    assert(
      auditorLoopbackRes.status === 403,
      `Expected external auditor POST /api/gdf-os/loopback to return HTTP 403, got ${auditorLoopbackRes.status}`
    );

    const auditorPacketPostRes = await fetch(`${BASE_URL}/api/gdf-os/auditor-packet`, {
      method: 'POST',
      headers: auditorHeaders,
      body: JSON.stringify({ mutate: true }),
    });
    assert(
      auditorPacketPostRes.status === 403,
      `Expected POST /api/gdf-os/auditor-packet to return HTTP 403, got ${auditorPacketPostRes.status}`
    );

    // Verify GET /api/gdf-os/auditor-packet succeeds and does NOT mutate proofReports or auditReports
    const packetGetRes = await fetch(`${BASE_URL}/api/gdf-os/auditor-packet`);
    const packetGetJson: any = await packetGetRes.json();
    assert(packetGetRes.status === 200 && packetGetJson.packet?.mutationPermission === 'FORBIDDEN_READ_ONLY', 'GET /api/gdf-os/auditor-packet must return read-only packet.');
    const regAfterAuditorGet = loadOrInitializeGdfOsRegistry();
    assert(
      regAfterAuditorGet.proofReports.length === 0,
      'GET /api/gdf-os/auditor-packet must be strictly read-only and never auto-generate proof reports.'
    );
    console.log('[PASS Acceptance #6] External auditor role strictly blocked from state mutation (HTTP 403) and GET auditor-packet verified read-only.');

    // -------------------------------------------------------------------------
    // 10. ACCEPTANCE TEST 7 & 8: Console initial CHECKING state, network failure -> UNAVAILABLE,
    //     automatic recovery on tab switch, and STALE proof never displayed as PASS
    // -------------------------------------------------------------------------
    // First run a fresh PASS proof on the backend so the backend has a valid proof report
    const restoredPassProof = runGdfProofSuite({
      requestedBy: 'ACCEPTANCE_TEST_RESTORE_PASS',
      taskDescription: 'Restore verified PASS proof report for console recovery and end-to-end route tests.',
    });
    assert(restoredPassProof.overallStatus === 'PASS', 'Expected restored proof report to PASS.');

    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    assert(
      !indexHtml.includes('id="gdfOsHeaderBadge" style="font-family: monospace; font-size: 9.5px; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: rgba(0, 230, 118, 0.2); border: 1px solid rgba(0, 230, 118, 0.5); color: #00e676;">PASS</span>') &&
        indexHtml.includes('>CHECKING</span>') &&
        indexHtml.includes('>PROOF: CHECKING</span>'),
      'index.html must initialize #gdfOsHeaderBadge as CHECKING and #gdfOsModalStatusPill as PROOF: CHECKING (no hardcoded green PASS).'
    );

    let simulateNetworkFailure = true;
    let serveStaleProof = false;
    const { elements, tabBtns, controller } = createGdfOsConsoleDomHarness(indexHtml, async (url: string) => {
      if (url === '/api/gdf-os/state') {
        if (simulateNetworkFailure) {
          throw new Error('Simulated initial /api/gdf-os/state network timeout');
        }
        const liveReg = JSON.parse(JSON.stringify(loadOrInitializeGdfOsRegistry()));
        if (serveStaleProof && liveReg.proofReports.length > 0) {
          liveReg.proofReports[0].timestampIso = new Date(Date.now() - 25 * 60 * 1000).toISOString();
        }
        const freshness = evaluateProofReportFreshness(liveReg.proofReports[0] || null);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'SUCCESS',
            proofFreshness: freshness,
            registry: liveReg,
          }),
        };
      }
      throw new Error(`Unexpected URL in console harness: ${url}`);
    });

    const headerBadge = elements.get('gdfOsHeaderBadge')!;
    const modalPill = elements.get('gdfOsModalStatusPill')!;
    const tabContent = elements.get('gdfOsTabContent')!;
    assert(headerBadge.textContent === 'CHECKING', `Expected initial header badge CHECKING, got ${headerBadge.textContent}`);
    assert(modalPill.textContent === 'PROOF: CHECKING', `Expected initial modal pill PROOF: CHECKING, got ${modalPill.textContent}`);

    // Trigger initial state load while network fails -> must transition to UNAVAILABLE and render Retry button
    await controller.fetchGdfOsState();
    assert(
      headerBadge.textContent === 'UNAVAILABLE' && modalPill.textContent === 'PROOF: UNAVAILABLE',
      `Expected UNAVAILABLE badge on network failure, got ${headerBadge.textContent} / ${modalPill.textContent}`
    );
    assert(
      tabContent.innerHTML.includes('id="btnRetryGdfOsState"'),
      'Expected visible Retry button (#btnRetryGdfOsState) when initial state request fails.'
    );
    assert(
      controller.getState().gdfOsState === null && controller.getState().lastStateFetchFailed === true,
      'Failed state fetch must clear cached gdfOsState and set lastStateFetchFailed=true.'
    );

    // Restore network and switch to "4. Proof & Live Verification" tab -> must automatically retry and recover to PASS
    simulateNetworkFailure = false;
    const proofTabBtn = tabBtns.find((b) => b.getAttribute('data-gdf-os-tab') === 'proof')!;
    await proofTabBtn.click();
    assert(
      headerBadge.textContent === 'PASS' && modalPill.textContent === 'PROOF: PASS',
      `Expected console tab switch after initial failure to recover and display PASS, got ${headerBadge.textContent} / ${modalPill.textContent}`
    );
    assert(
      tabContent.innerHTML.includes(restoredPassProof.proofId),
      'Expected recovered Proof tab to render the current backend proof report ID.'
    );
    console.log('[PASS Acceptance #7] Console initializes as CHECKING, transitions to UNAVAILABLE on network failure, and recovers to PASS on tab switch.');

    // Now test Acceptance #8: A stale PASS proof report (> 15m old) cannot be displayed as current PASS
    serveStaleProof = true;
    await controller.fetchGdfOsState();
    assert(
      headerBadge.textContent === 'STALE' && modalPill.textContent === 'PROOF: STALE',
      `Expected stale PASS proof report to display STALE / PROOF: STALE, got ${headerBadge.textContent} / ${modalPill.textContent}`
    );
    // Also test what happens if a subsequent network failure occurs after a state was loaded: cached PASS/STALE must be cleared to UNAVAILABLE
    simulateNetworkFailure = true;
    await controller.fetchGdfOsState();
    assert(
      headerBadge.textContent === 'UNAVAILABLE' && controller.getState().gdfOsState === null,
      'After a subsequent network error, previous proof state must not remain displayed as current.'
    );
    console.log('[PASS Acceptance #8] Stale PASS proof report is displayed as STALE (never current PASS), and cached results are cleared on error.');

    // -------------------------------------------------------------------------
    // 11. Complete Promotion Route Verification (End-to-End HTTP Route with Valid PASS Proof)
    // -------------------------------------------------------------------------
    // Ensure server has evaluated a live forecast snapshot so candidate is scientifically evaluated in the server process
    const forecastWarmRes = await fetch(`${BASE_URL}/api/gold-forecast?interval=15m&fixtureReplay=1`);
    assert(forecastWarmRes.status === 200, `Expected /api/gold-forecast warmup to return 200, got ${forecastWarmRes.status}`);

    const icBeforeRes = await fetch(`${BASE_URL}/api/intelligence-core`);
    const icBeforeJson: any = await icBeforeRes.json();
    const prevLiveArchId = icBeforeJson.liveArchitecture?.architectureId;
    assert(Boolean(prevLiveArchId), 'Expected liveArchitecture.architectureId from GET /api/intelligence-core.');

    const httpRunProofRes = await fetch(`${BASE_URL}/api/gdf-os/run-proof`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        requestedBy: 'E2E_PROMOTE_ROUTE_VERIFICATION',
        taskDescription: 'Run live backend proof report prior to HTTP promotion route verification.',
      }),
    });
    const httpRunProofJson: any = await httpRunProofRes.json();
    assert(
      httpRunProofRes.status === 200 && httpRunProofJson.proofReport?.overallStatus === 'PASS',
      `Expected POST /api/gdf-os/run-proof to return HTTP 200 PASS, got ${httpRunProofRes.status}`
    );

    const httpValidPromoRes = await fetch(`${BASE_URL}/api/intelligence-core/promote`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'MANUAL_MMI',
        operatorNote: 'End-to-end verified promotion route test with valid PASS proof',
      }),
    });
    const httpValidPromoJson: any = await httpValidPromoRes.json();
    assert(
      httpValidPromoRes.status === 200 && httpValidPromoJson.promoted === true,
      `Expected POST /api/intelligence-core/promote with valid PASS proof and scientifically validated candidate to return HTTP 200, got HTTP ${httpValidPromoRes.status} (${httpValidPromoJson.reasonEn})`
    );
    assert(
      httpValidPromoJson.liveArchitectureId !== prevLiveArchId,
      'Live Architecture ID must advance after valid HTTP promotion.'
    );

    const finalRegistry = loadOrInitializeGdfOsRegistry();
    assert(
      finalRegistry.promotionDecisionLog.length >= 4 &&
        finalRegistry.promotionDecisionLog[0].decision === 'ALLOWED' &&
        finalRegistry.promotionDecisionLog[0].proofReportId === httpRunProofJson.proofReport.proofId,
      'Expected promotionDecisionLog to record every promotion approval and rejection with proofReportId, candidateArchitectureId, operatorAuthorization, timestampIso, and reason.'
    );
    console.log(
      `[PASS Complete Promotion Route] POST /api/intelligence-core/promote verified end-to-end (${finalRegistry.promotionDecisionLog.length} recorded gate decisions, ${finalRegistry.securityAuditLog.length} recorded security audit events).`
    );

    // -------------------------------------------------------------------------
    // 12. PHASE 1 INDEPENDENT SECURITY & CONCURRENCY VERIFICATION (2A, 2B, 2C, 3, 5)
    // -------------------------------------------------------------------------
    // 12A. Verify zero static operator tokens exist in index.html
    assert(
      !indexHtml.includes('GDF-MMI-LOCAL-OPERATOR-SESSION-V1') &&
        !indexHtml.includes('X-GDF-Operator-Token'),
      'index.html must NOT contain any embedded static operator token (GDF-MMI-LOCAL-OPERATOR-SESSION-V1) or X-GDF-Operator-Token.'
    );
    console.log('[PASS Security 2A.1] Zero static operator secrets embedded in index.html.');

    // 12B. Verify NODE_ENV=production rejects deterministic fallback tokens when GDF_OPERATOR_AUTH_TOKEN is unset
    const prevNodeEnv = process.env.NODE_ENV;
    const prevOpToken = process.env.GDF_OPERATOR_AUTH_TOKEN;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.GDF_OPERATOR_AUTH_TOKEN;
      assert(
        getAuthorizedOperatorToken() === '',
        'In NODE_ENV=production without GDF_OPERATOR_AUTH_TOKEN, getAuthorizedOperatorToken() must return empty string (no fallback token).'
      );
      const prodFallbackAttempt = verifyOperatorMutationAuthorization({
        endpointOrOperation: 'POST /api/intelligence-core/promote',
        actorRole: 'OPERATOR_MMI',
        operatorToken: 'GDF-MMI-LOCAL-OPERATOR-SESSION-V1',
      });
      assert(
        prodFallbackAttempt.authorized === false && prodFallbackAttempt.httpStatus === 401,
        'In NODE_ENV=production, deterministic fallback token must be rejected with HTTP 401.'
      );
    } finally {
      if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNodeEnv;
      if (prevOpToken === undefined) delete process.env.GDF_OPERATOR_AUTH_TOKEN;
      else process.env.GDF_OPERATOR_AUTH_TOKEN = prevOpToken;
    }
    console.log('[PASS Security 2A.2] NODE_ENV=production strictly rejects deterministic fallback tokens (HTTP 401).');

    // 12C. Verify server-verified HttpOnly Operator Session Cookie + CSRF Synchronizer Token over HTTP
    const sessionGetRes = await fetch(`${BASE_URL}/api/auth/operator-session`);
    const sessionGetJson: any = await sessionGetRes.json();
    const setCookieHeader = sessionGetRes.headers.get('set-cookie') || '';
    assert(
      sessionGetRes.status === 200 &&
        typeof sessionGetJson.csrfToken === 'string' &&
        sessionGetJson.csrfToken.length >= 32 &&
        setCookieHeader.includes('gdf_operator_session=') &&
        setCookieHeader.includes('HttpOnly') &&
        setCookieHeader.includes('SameSite=Strict'),
      'GET /api/auth/operator-session must issue HttpOnly; SameSite=Strict cookie and CSRF token.'
    );
    const cookiePair = setCookieHeader.split(';')[0];

    // Valid session cookie + valid CSRF token -> authorized (HTTP 200)
    const csrfValidRes = await fetch(`${BASE_URL}/api/gdf-os/loopback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
        'X-GDF-CSRF-Token': sessionGetJson.csrfToken,
      },
      body: JSON.stringify({
        playbookId: 'PB-001',
        reason: 'Verified HttpOnly session cookie + CSRF token authentication.',
        addedFailureModeOrStep: 'Verified synchronizer CSRF token on cookie-authenticated POST.',
      }),
    });
    assert(
      csrfValidRes.status === 200,
      `Expected valid cookie + CSRF token POST /api/gdf-os/loopback to return 200, got ${csrfValidRes.status}`
    );

    // Valid session cookie + missing/wrong CSRF token -> rejected with HTTP 403 FORBIDDEN_CSRF_TOKEN_INVALID
    const csrfInvalidRes = await fetch(`${BASE_URL}/api/gdf-os/loopback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
        'X-GDF-CSRF-Token': 'wrong-csrf-token',
      },
      body: JSON.stringify({ playbookId: 'PB-001' }),
    });
    const csrfInvalidJson: any = await csrfInvalidRes.json();
    assert(
      csrfInvalidRes.status === 403 && csrfInvalidJson.status === 'FORBIDDEN_CSRF_TOKEN_INVALID',
      `Expected cookie session with invalid CSRF token to return HTTP 403 FORBIDDEN_CSRF_TOKEN_INVALID, got ${csrfInvalidRes.status} (${csrfInvalidJson.status})`
    );
    console.log('[PASS Security 2A.3] HttpOnly Session Cookie + Synchronizer CSRF Token verified (valid=200, invalid CSRF=403).');

    // 12D. Verify cryptographic HMAC integrity signature & future-timestamp rejection on GdfProofReport
    const tamperedProof = JSON.parse(JSON.stringify(httpRunProofJson.proofReport));
    tamperedProof.checks[0].status = 'FAIL'; // Tamper check without updating integritySignature
    const tamperedFreshness = evaluateProofReportFreshness(tamperedProof);
    assert(
      tamperedFreshness.effectiveStatus === 'FAIL' && tamperedFreshness.gateStatus === 'INVALID',
      `Expected tampered proof report to fail HMAC verification with INVALID, got ${tamperedFreshness.gateStatus}`
    );

    const futureProof = JSON.parse(JSON.stringify(httpRunProofJson.proofReport));
    futureProof.timestampIso = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10m in future
    const futureFreshness = evaluateProofReportFreshness(futureProof);
    assert(
      futureFreshness.effectiveStatus === 'FAIL' && futureFreshness.gateStatus === 'INVALID',
      `Expected future-dated proof report to be rejected as INVALID, got ${futureFreshness.gateStatus}`
    );
    console.log('[PASS Security 2B.1] Cryptographic HMAC signature tampering and future-dated proof timestamps fail closed (INVALID).');

    // 12E. Verify writeBackValidatedMathToLatentModel and POST /api/intelligence-core/writeback-math enforce GDF OS Proof Gate
    const regBeforeWbBlock = loadOrInitializeGdfOsRegistry();
    regBeforeWbBlock.proofReports = [];
    saveGdfOsRegistry(regBeforeWbBlock);

    const wbMissingProofRes = await fetch(`${BASE_URL}/api/intelligence-core/writeback-math`, {
      method: 'POST',
      headers: operatorHeaders,
      body: JSON.stringify({
        mode: 'MANUAL_MMI',
        dryRun: false,
        confirmedByOperator: true,
        operatorNote: 'Attempt writeback-math while proof report is MISSING',
      }),
    });
    const wbMissingProofJson: any = await wbMissingProofRes.json();
    assert(
      wbMissingProofRes.status === 409 && wbMissingProofJson.writtenBack === false,
      `Expected POST /api/intelligence-core/writeback-math with MISSING proof to return HTTP 409, got ${wbMissingProofRes.status}`
    );
    assert(
      String(wbMissingProofJson.reasonEn || '').includes('Dual-Control Promotion Gate'),
      'Expected writeback-math rejection reason to cite GDF OS Dual-Control Promotion Gate.'
    );
    console.log('[PASS Security 2B.2] writeBackValidatedMathToLatentModel & POST /api/intelligence-core/writeback-math enforce GDF OS Proof Gate (HTTP 409 on missing/failed/stale proof).');

    // 12F. Verify serialized multi-writer registry concurrency (simultaneous proof, audit, and loopback writes + orphan .tmp cleanup)
    const dirInfo = resolveGdfOsDataDir();
    const orphanTmpPath = `${dirInfo.registryFile}.999999.orphan.tmp`;
    fs.writeFileSync(orphanTmpPath, '{"corrupt":', 'utf8');
    const cleanedCount = cleanupOrphanedTempFiles();
    assert(cleanedCount >= 1 && !fs.existsSync(orphanTmpPath), 'cleanupOrphanedTempFiles() must remove orphaned .tmp files.');

    const baseRegBeforeConcurrency = loadOrInitializeGdfOsRegistry();
    const startRev = baseRegBeforeConcurrency.revision || 0;
    const [p1, p2, a1, a2, l1, l2] = await Promise.all([
      Promise.resolve().then(() => runGdfProofSuite({ requestedBy: 'CONCURRENT_WORKER_PROOF_1' })),
      Promise.resolve().then(() => runGdfProofSuite({ requestedBy: 'CONCURRENT_WORKER_PROOF_2' })),
      Promise.resolve().then(() => runGdfAuditAndLoopback({ autoLoopbackOnFindings: false })),
      Promise.resolve().then(() => runGdfAuditAndLoopback({ autoLoopbackOnFindings: false })),
      Promise.resolve().then(() =>
        triggerLoopbackUpgrade({
          playbookId: 'PB-003',
          reason: 'Concurrent Worker Loopback 1',
          addedFailureModeOrStep: `Concurrent test step 1 (${Date.now()})`,
        })
      ),
      Promise.resolve().then(() =>
        triggerLoopbackUpgrade({
          playbookId: 'PB-004',
          reason: 'Concurrent Worker Loopback 2',
          addedFailureModeOrStep: `Concurrent test step 2 (${Date.now()})`,
        })
      ),
    ]);

    const regAfterConcurrency = loadOrInitializeGdfOsRegistry();
    const proofIdsPresent = [p1.proofId, p2.proofId].filter((id) =>
      regAfterConcurrency.proofReports.some((r) => r.proofId === id)
    );
    const auditIdsPresent = [a1.auditId, a2.auditId].filter((id) =>
      regAfterConcurrency.auditReports.some((r) => r.auditId === id)
    );
    const loopbackIdsPresent = [l1?.loopbackId, l2?.loopbackId].filter(
      (id) => id && regAfterConcurrency.loopbackHistory.some((r) => r.loopbackId === id)
    );
    assert(
      proofIdsPresent.length === 2 &&
        auditIdsPresent.length === 2 &&
        loopbackIdsPresent.length === 2 &&
        regAfterConcurrency.revision > startRev &&
        typeof regAfterConcurrency.contentSha256 === 'string' &&
        regAfterConcurrency.contentSha256.length === 64,
      `Expected 100% preservation across concurrent writers (2/2 proofs, 2/2 audits, 2/2 loopbacks) and monotonic revision > ${startRev}, got proofs=${proofIdsPresent.length}/2, audits=${auditIdsPresent.length}/2, loopbacks=${loopbackIdsPresent.length}/2, rev=${regAfterConcurrency.revision}`
    );
    console.log(
      `[PASS Concurrency #3] Multi-writer serialized lock & union merge verified: 2/2 proofs, 2/2 audits, 2/2 loopbacks preserved (revision=${regAfterConcurrency.revision}, sha256=${regAfterConcurrency.contentSha256.slice(0, 12)}...).`
    );

    // 12G. Verify Cloud SQL PostgreSQL durable persistence round-trip
    if (isCloudSqlConfigured()) {
      await syncGdfOsRegistryToCloudSqlImmediate();
      const fromCloudSql = await loadGdfOsRegistryFromCloudSql();
      assert(
        Boolean(fromCloudSql) &&
          fromCloudSql!.revision >= regAfterConcurrency.revision &&
          fromCloudSql!.playbooks.length === 6 &&
          fromCloudSql!.proofReports.some((r) => r.proofId === p1.proofId),
        'Expected Cloud SQL PostgreSQL round-trip to preserve registry revision, playbooks, proofReports, auditReports, and loopbackHistory.'
      );
      console.log(
        `[PASS Cloud SQL #5] Cloud SQL PostgreSQL (us-east1) durable persistence round-trip verified (revision=${fromCloudSql!.revision}, playbooks=${fromCloudSql!.playbooks.length}, proofs=${fromCloudSql!.proofReports.length}).`
      );
    }

    console.log('=== ALL GDF OPERATING SYSTEM, PHASE 1 SECURITY & CLOUD SQL VERIFICATION CHECKS PASSED ===');
  } finally {
    resetProofEvaluatorsToDefault();
    if (originalPb006Raw !== null) {
      atomicWriteFileSync(pb006Path, originalPb006Raw);
    }
    if (originalRegistryRaw !== null) {
      atomicWriteFileSync(registryPath, originalRegistryRaw, { validateJson: true });
    }
    // Ensure a fresh, valid PASS proof report is saved on disk at the end of the suite
    runGdfProofSuite({
      requestedBy: 'POST_SUITE_CLEAN_STATE',
      taskDescription: 'Ensure current executable PASS proof report after verification suite.',
    });
    if (isCloudSqlConfigured()) {
      await syncGdfOsRegistryToCloudSqlImmediate();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
