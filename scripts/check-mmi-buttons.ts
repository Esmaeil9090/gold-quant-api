/**
 * @file scripts/check-mmi-buttons.ts
 * @description End-to-End Automated Verification Suite for GDF MMI Console Buttons:
 * 1. "🧬 Synthesize Symbolic Step" (#btnTriggerSymbolicDiscovery -> POST /api/intelligence-core/discover-step)
 * 2. "🔬 Write Back Validated Math to Latent Model" (#btnWriteBackLatentMath -> POST /api/intelligence-core/writeback-math)
 *
 * Verifies all 12 required behavioral invariants across both backend services, live HTTP endpoints,
 * and the client DOM operation-feedback state machine (IDLE, PROCESSING, SUCCESS, REJECTED, FAILED, UNKNOWN)
 * in both English (LTR) and Persian/Farsi (RTL).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {
  buildHaltedParallelUniverseTelemetry,
  evaluateParallelUniverseAndAwarenessCore,
  executeSymbolicDiscoveryStep,
  getIntelligenceCoreStateSnapshot,
  promoteCandidateArchitecture,
  reloadArchitectureStoreFromDisk,
  writeBackValidatedMathToLatentModel,
} from '../src/services/intelligenceAwarenessCore.js';
import {
  fetchVerifiedMacroNews,
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
} from '../src/services/realDataWaterfall.js';

function createDomHarness() {
  const elements = new Map<string, any>();

  const makeEl = (id: string) => {
    const attrs = new Map<string, string>();
    const listeners = new Map<string, Array<(...args: any[]) => any>>();
    const el: any = {
      id,
      textContent: '',
      innerHTML: '',
      disabled: false,
      checked: false,
      onclick: null,
      style: {
        display: 'none',
        color: '',
        background: '',
        borderColor: '',
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
      click() {
        if (el.disabled) return;
        if (typeof el.onclick === 'function') {
          el.onclick();
        }
        const list = listeners.get('click') || [];
        for (const fn of list) fn();
      },
      appendChild() {},
    };
    elements.set(id, el);
    return el;
  };

  const requiredIds = [
    'btnWriteBackLatentMath',
    'btnTriggerSymbolicDiscovery',
    'btnBootstrapMtfNow',
    'chkAutoPromoteVerified',
    'mmiOperationFeedbackPanel',
    'mmiOperationStatusBadge',
    'mmiOperationTitleText',
    'mmiOperationEpistemicBadge',
    'mmiOperationTimestampText',
    'btnMmiOperationRetry',
    'btnMmiOperationToggleCollapse',
    'mmiOperationBodyWrap',
    'mmiOperationActiveContent',
    'mmiPreviousSuccessReportContainer',
    'btnConfirmLatentWriteBack',
    'btnCancelLatentWriteBack',
    'sciWriteBackStatusBadge',
    'puAuditTableBody',
  ];
  for (const id of requiredIds) makeEl(id);

  // When mmiOperationActiveContent.innerHTML is updated with confirmation buttons, wire them into document.getElementById
  const activeBox = elements.get('mmiOperationActiveContent')!;
  let rawInner = '';
  Object.defineProperty(activeBox, 'innerHTML', {
    get() {
      return rawInner;
    },
    set(val: string) {
      rawInner = String(val);
      if (rawInner.includes('id="btnConfirmLatentWriteBack"')) {
        elements.get('btnConfirmLatentWriteBack')!.disabled = false;
      }
      if (rawInner.includes('id="btnCancelLatentWriteBack"')) {
        elements.get('btnCancelLatentWriteBack')!.disabled = false;
      }
    },
  });

  const documentStub = {
    getElementById(id: string) {
      if (!elements.has(id)) {
        return makeEl(id);
      }
      return elements.get(id);
    },
    createElement(tag: string) {
      return makeEl(`created-${tag}-${Math.random()}`);
    },
  };

  return { elements, documentStub };
}

async function main() {
  console.log('=== GDF MMI CONSOLE BUTTONS & OPERATION-FEEDBACK VERIFICATION SUITE (12 SCENARIOS) ===\n');

  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');

  // Extract GDFMmiConsoleController script block from index.html
  const startMarker = '// Shared MMI Operation-Feedback Controller & Button Workflows';
  const endMarker = 'const btnBootstrapMtfNow = document.getElementById(\'btnBootstrapMtfNow\');';
  const startIdx = indexHtml.indexOf(startMarker);
  const endIdx = indexHtml.indexOf(endMarker);
  assert.equal(startIdx > 0 && endIdx > startIdx, true, 'Must locate GDFMmiConsoleController in index.html');
  const controllerCode = indexHtml.slice(startIdx, endIdx);

  // Prepare real verified fixture data for backend evaluation
  const [wf, macro, news] = await Promise.all([
    fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true }),
    fetchVerifiedMacroWaterfall(),
    fetchVerifiedMacroNews(),
  ]);
  assert.equal(wf.candles.length >= 200, true, 'Fixture waterfall must provide >= 200 verified real bars');

  // Evaluate Parallel Universe & Scientific Core on verified real snapshot
  const puTelemetry = evaluateParallelUniverseAndAwarenessCore({
    candles: wf.candles,
    liveMacro: macro,
    secondaryBenchmark: wf.secondaryBenchmark,
    verifiedVenueCameras: wf.verifiedVenueCameras,
    macroNews: news.events,
    htfDailyCandles: wf.htfDailyCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'mmi-btn-test-snap-1',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: wf.activeProvider,
    activeSymbol: wf.activeSymbol,
    activeEndpoint: wf.activeEndpoint,
    activeTier: 'TIER_1_PRIMARY',
  });
  assert.equal(Boolean(puTelemetry.scientificCore), true, 'Scientific core must be initialized');

  // Set up VM harness with controllable fetch handler
  const { elements, documentStub } = createDomHarness();
  let mockFetchHandler: (url: string, init: any) => Promise<any>;
  const renderCalls: any[] = [];
  let fetchQuantDataCount = 0;

  const sandbox: any = {
    window: {},
    document: documentStub,
    currentLang: 'en',
    currentTimeframe: '15m',
    forecastData: {
      parallelUniverse: puTelemetry,
      scientificCore: puTelemetry.scientificCore,
    },
    i18n: {
      en: {
        btnWriteBackLatentMath: '🔬 Write Back Validated Math to Latent Model',
        btnTriggerSymbolicDiscovery: '🧬 Synthesize Symbolic Step',
      },
      fa: {
        btnWriteBackLatentMath: '🔬 بازنویسی ریاضیات تاییدشده در مدل حالت پنهان',
        btnTriggerSymbolicDiscovery: '🧬 ترکیب و کالیبراسیون گام نمادین',
      },
    },
    buildApiUrl: (p: string) => p,
    fetch: (url: string, init: any) => mockFetchHandler(url, init),
    renderParallelUniverseTelemetry: (pu: any) => {
      renderCalls.push(pu);
      if (pu?.latentMathWriteBack) {
        const wb = pu.latentMathWriteBack;
        elements.get('sciWriteBackStatusBadge')!.textContent =
          `LATENT MATH WRITE-BACK: GEN #${wb.writeBackGeneration} (φ=${Number(wb.driftPersistencePhi).toFixed(3)})`;
      }
    },
    fetchQuantData: async () => {
      fetchQuantDataCount++;
    },
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Promise,
    JSON,
    Error,
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(controllerCode, sandbox);

  const controller = sandbox.window.GDFMmiConsoleController;
  assert.equal(Boolean(controller), true, 'window.GDFMmiConsoleController must be registered');

  // ---------------------------------------------------------------------------
  // Scenario 1 & 2 & 3 & 10:
  // - Clicking "🧬 Synthesize Symbolic Step" executes its handler
  // - Shows PROCESSING state while running and prevents duplicate clicks
  // - Renders full visible Symbolic Synthesis Report (equationAscii, ridge θ̂, λ_t, derivation, assumptions, validation, epistemic status)
  // ---------------------------------------------------------------------------
  let resolveSlowSymbolic: (() => void) | null = null;
  let symbolicApiCallCount = 0;
  mockFetchHandler = async (url: string, init: any) => {
    symbolicApiCallCount++;
    assert.equal(url, '/api/intelligence-core/discover-step');
    await new Promise<void>(r => {
      resolveSlowSymbolic = r;
    });
    const body = JSON.parse(init.body || '{}');
    const res = executeSymbolicDiscoveryStep({ note: body.note, timeframe: body.timeframe });
    const payload = {
      status: res.synthesisExecuted ? 'SUCCESS' : 'SYNTHESIS_REJECTED',
      ...res,
      ...getIntelligenceCoreStateSnapshot(),
    };
    return {
      ok: res.synthesisExecuted,
      status: res.synthesisExecuted ? 200 : 409,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(payload),
    };
  };

  const btnSymbolic = elements.get('btnTriggerSymbolicDiscovery')!;
  const panel = elements.get('mmiOperationFeedbackPanel')!;
  const statusBadge = elements.get('mmiOperationStatusBadge')!;
  const activeContent = elements.get('mmiOperationActiveContent')!;

  // Trigger click on #btnTriggerSymbolicDiscovery
  btnSymbolic.click();

  // Verify immediate PROCESSING state & duplicate click lock
  assert.equal(controller.getState().status, 'PROCESSING', 'Symbolic button must immediately enter PROCESSING state');
  assert.equal(btnSymbolic.disabled, true, 'Button must be disabled during PROCESSING');
  assert.equal(panel.getAttribute('data-mmi-state'), 'PROCESSING', 'Feedback panel must reflect PROCESSING state');
  assert.equal(statusBadge.textContent.includes('PROCESSING'), true, 'Status badge must display PROCESSING');

  // Attempt duplicate click while PROCESSING
  btnSymbolic.click();
  await controller.triggerSymbolicStepSynthesis({});
  assert.equal(symbolicApiCallCount, 1, 'Duplicate clicks while PROCESSING must not submit duplicate requests');

  // Release network promise and wait for completion
  resolveSlowSymbolic!();
  await new Promise(r => setTimeout(r, 30));

  const symStateAfter = controller.getState();
  assert.equal(symStateAfter.status, 'SUCCESS', 'Symbolic synthesis must transition to SUCCESS on real data');
  assert.equal(btnSymbolic.disabled, false, 'Button must re-enable after completion');
  assert.equal(panel.style.display, 'block', 'Feedback panel must remain visible after completion');
  assert.equal(activeContent.innerHTML.includes('Level-B Symbolic Equation Synthesis'), true, 'Report title must render');
  assert.equal(activeContent.innerHTML.includes('λ_ridge='), true, 'Report must include ridge penalty λ_t');
  assert.equal(activeContent.innerHTML.includes('Mathematical Derivation'), true, 'Report must include derivation & reasoning');
  assert.equal(activeContent.innerHTML.includes('Assumptions & Mathematical Constraints'), true, 'Report must include assumptions & constraints');
  assert.equal(activeContent.innerHTML.includes('Epistemic Status:'), true, 'Report must include epistemic status');
  console.log('[PASS 1–3, 10] Symbolic Step Synthesis handler, PROCESSING lock, and full structured report verified.');

  // ---------------------------------------------------------------------------
  // Scenario 4 & 5:
  // - When synthesis cannot run because real source data is unavailable (HALTED_FROZEN) or rejected (409),
  //   the UI shows the exact unavailable/rejection explanation and preserves the previous successful report.
  // ---------------------------------------------------------------------------
  buildHaltedParallelUniverseTelemetry('mmi-halted-snap', 'PAXG_SPOT_TOKEN', '15m');
  mockFetchHandler = async (_url: string, init: any) => {
    const body = JSON.parse(init.body || '{}');
    const res = executeSymbolicDiscoveryStep({ note: body.note, timeframe: body.timeframe });
    const payload = {
      status: res.synthesisExecuted ? 'SUCCESS' : 'SYNTHESIS_REJECTED',
      ...res,
      ...getIntelligenceCoreStateSnapshot(),
    };
    return {
      ok: res.synthesisExecuted,
      status: res.synthesisExecuted ? 200 : 409,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(payload),
    };
  };

  await controller.triggerSymbolicStepSynthesis({});
  const haltedSymState = controller.getState();
  assert.equal(haltedSymState.status, 'REJECTED', 'Halted/unavailable source data must transition to REJECTED');
  assert.equal(
    activeContent.innerHTML.includes('HALTED_DEGRADED') || activeContent.innerHTML.includes('STRICT_REAL_DATA_ONLY'),
    true,
    'Rejected report must explain why synthesis could not run without verified real bars'
  );
  const prevBox = elements.get('mmiPreviousSuccessReportContainer')!;
  assert.equal(prevBox.style.display, 'block', 'Previous successful report container must remain visible when rejected');
  assert.equal(prevBox.innerHTML.includes('Previous Verified Successful Report'), true, 'Previous report must be clearly labeled');
  console.log('[PASS 4–5] Unavailable/halted real-data rejection and previous report preservation verified.');

  // ---------------------------------------------------------------------------
  // Scenario 6:
  // - Network / server error shows FAILED state with Retry button (#btnMmiOperationRetry)
  //   and timeout shows UNKNOWN (OUTCOME_UNCONFIRMED) while preserving previous successful report.
  // ---------------------------------------------------------------------------
  mockFetchHandler = async () => {
    throw new Error('Simulated HTTP 502 upstream gateway error');
  };
  await controller.triggerSymbolicStepSynthesis({});
  assert.equal(controller.getState().status, 'FAILED', 'Network error must transition to FAILED');
  const retryBtn = elements.get('btnMmiOperationRetry')!;
  assert.equal(retryBtn.style.display, 'inline-block', 'Retry button must be visible on FAILED state');
  assert.equal(activeContent.innerHTML.includes('Simulated HTTP 502'), true, 'Error details must be displayed');
  assert.equal(prevBox.style.display, 'block', 'Previous successful report must remain preserved during FAILED state');

  // Test timeout -> UNKNOWN (OUTCOME_UNCONFIRMED)
  mockFetchHandler = async () => {
    const err: any = new Error('MMI operation timeout');
    err.isTimeoutOrUnconfirmed = true;
    throw err;
  };
  await controller.triggerSymbolicStepSynthesis({});
  assert.equal(controller.getState().status, 'UNKNOWN', 'Timeout must transition to UNKNOWN (Outcome Unconfirmed)');
  assert.equal(statusBadge.textContent.includes('UNKNOWN'), true, 'Badge must show UNKNOWN');
  console.log('[PASS 6] Network error FAILED state, timeout UNKNOWN state, Retry button, and preserved report verified.');

  // ---------------------------------------------------------------------------
  // Scenario 7 & 8 & 11:
  // - Clicking "🔬 Write Back Validated Math to Latent Model" executes its handler
  // - Write-back is blocked when validation requirements are not met (e.g., HALTED_FROZEN or unmet gates)
  // - Failed/rejected write-back never reports success
  // ---------------------------------------------------------------------------
  mockFetchHandler = async (_url: string, init: any) => {
    const body = JSON.parse(init.body || '{}');
    const res = writeBackValidatedMathToLatentModel(body);
    const httpStatus = body.dryRun ? (res.eligible ? 200 : 409) : res.writtenBack ? 200 : 409;
    const payload = {
      status: res.writtenBack ? 'SUCCESS' : 'WRITEBACK_REJECTED',
      ...res,
      ...getIntelligenceCoreStateSnapshot(),
    };
    return {
      ok: httpStatus === 200,
      status: httpStatus,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify(payload),
    };
  };

  // System is currently in HALTED_FROZEN from earlier step -> write-back must be REJECTED
  const btnWriteBack = elements.get('btnWriteBackLatentMath')!;
  btnWriteBack.click();
  await new Promise(r => setTimeout(r, 30));

  assert.equal(controller.getState().status, 'REJECTED', 'Write-back during HALTED_FROZEN must be REJECTED');
  assert.equal(activeContent.innerHTML.includes('Validation Requirements Unmet'), true, 'Must display unmet validation requirements');
  assert.equal(activeContent.innerHTML.includes('HALTED_FROZEN'), true, 'Must state HALTED_FROZEN reason');
  console.log('[PASS 7–8, 11] Write-back click handler, validation gate blocking, and zero false-success verified.');

  // ---------------------------------------------------------------------------
  // Scenario 9 & 12:
  // - Restore LIVE_NOMINAL real-data evaluation
  // - Clicking Write-Back inspects candidate & shows Pre-Write Mathematical Confirmation Card with Before/After diffs
  // - Confirming executes real write-back, increments writeBackGeneration, persists audit entry to disk,
  //   renders Before/After parameter table, updates #sciWriteBackStatusBadge, and keeps 8/8 Live Promotion distinct!
  // ---------------------------------------------------------------------------
  evaluateParallelUniverseAndAwarenessCore({
    candles: wf.candles,
    liveMacro: macro,
    secondaryBenchmark: wf.secondaryBenchmark,
    verifiedVenueCameras: wf.verifiedVenueCameras,
    macroNews: news.events,
    htfDailyCandles: wf.htfDailyCandles,
    interval: '15m',
    intervalStepSeconds: 900,
    snapshotId: 'mmi-btn-test-snap-2',
    instrumentIdentity: 'PAXG_SPOT_TOKEN',
    systemState: 'LIVE_NOMINAL',
    activeProvider: wf.activeProvider,
    activeSymbol: wf.activeSymbol,
    activeEndpoint: wf.activeEndpoint,
    activeTier: 'TIER_1_PRIMARY',
  });

  const snapBeforeWb = getIntelligenceCoreStateSnapshot();
  const genBefore = snapBeforeWb.latentMathWriteBack.writeBackGeneration;
  const liveArchBefore = snapBeforeWb.liveArchitecture.versionTag;

  // Step 1: Click #btnWriteBackLatentMath -> Pre-Write Confirmation Dialog
  await controller.triggerLatentMathWriteBack({ skipConfirmationPrompt: false });
  const previewState = controller.getState();
  assert.equal(previewState.status, 'SUCCESS', 'Eligible dry-run inspection must succeed');
  assert.equal(previewState.subStage, 'AWAITING_CONFIRMATION', 'Must await explicit operator confirmation before writing');
  assert.equal(
    activeContent.innerHTML.includes('Pre-Write Mathematical Inspection & Confirmation Dialog'),
    true,
    'Must render Pre-Write Confirmation Dialog'
  );
  assert.equal(activeContent.innerHTML.includes('driftPersistencePhi'), true, 'Must display φ parameter diff');
  assert.equal(activeContent.innerHTML.includes('meanReversionKappa'), true, 'Must display κ parameter diff');
  assert.equal(
    getIntelligenceCoreStateSnapshot().latentMathWriteBack.writeBackGeneration,
    genBefore,
    'Dry-run preview must not mutate writeBackGeneration before confirmation'
  );

  // Step 2: Confirm Write-Back via #btnConfirmLatentWriteBack
  await controller.confirmPendingWriteBack();
  const committedState = controller.getState();
  assert.equal(committedState.status, 'SUCCESS', 'Confirmed write-back must transition to SUCCESS');
  assert.equal(committedState.subStage, 'COMPLETED', 'Substage must be COMPLETED');

  const snapAfterWb = getIntelligenceCoreStateSnapshot();
  assert.equal(
    snapAfterWb.latentMathWriteBack.writeBackGeneration,
    genBefore + 1,
    'writeBackGeneration must increment after confirmed write-back'
  );
  assert.equal(
    snapAfterWb.auditTrail[0].eventType,
    'LATENT_MATH_WRITEBACK_APPLIED',
    'Latest audit entry must be LATENT_MATH_WRITEBACK_APPLIED'
  );
  assert.equal(
    activeContent.innerHTML.includes('Validated Latent-Model Mathematical Write-Back Outcome Report'),
    true,
    'Must render committed Write-Back Outcome Report'
  );
  assert.equal(
    activeContent.innerHTML.includes(snapAfterWb.auditTrail[0].auditId),
    true,
    'Outcome report must display the immutable Audit ID'
  );
  assert.equal(
    elements.get('sciWriteBackStatusBadge')!.textContent.includes(`GEN #${genBefore + 1}`),
    true,
    '#sciWriteBackStatusBadge must update on screen to new generation'
  );

  // Verify Cold-Start Disk Persistence of the write-back
  reloadArchitectureStoreFromDisk();
  const reloadedSnap = getIntelligenceCoreStateSnapshot();
  assert.equal(
    reloadedSnap.latentMathWriteBack.writeBackGeneration,
    genBefore + 1,
    'Written-back latent parameters must survive disk reload'
  );

  // Verify 8/8 Promotion Gate & Live Yellow Line separation
  assert.equal(
    reloadedSnap.liveArchitecture.versionTag,
    liveArchBefore,
    'Mathematical write-back must not automatically replace Live Yellow Line architecture'
  );
  if (reloadedSnap.lastVerificationReport && reloadedSnap.lastVerificationReport.passedGatesCount < 8) {
    const autoPromoAttempt = promoteCandidateArchitecture({ mode: 'AUTOMATIC_VERIFIED' });
    assert.equal(
      autoPromoAttempt.promoted,
      false,
      '8/8 Automatic Promotion Gate must remain strictly enforced after mathematical write-back'
    );
  }
  console.log('[PASS 9, 12] Pre-write confirmation, before/after parameter diffs, disk persistence, and 8/8 promotion gate separation verified.');

  // ---------------------------------------------------------------------------
  // Verify Bilingual English (LTR) & Persian/Farsi (RTL) Rendering
  // ---------------------------------------------------------------------------
  sandbox.currentLang = 'fa';
  controller.syncLanguage('fa');
  assert.equal(panel.getAttribute('dir'), 'rtl', 'Feedback panel must switch to dir="rtl" in Persian mode');
  assert.equal(
    activeContent.innerHTML.includes('گزارش اجرای بازنویسی ریاضیات تاییدشده'),
    true,
    'Write-back report must render Persian localization in fa mode'
  );

  sandbox.currentLang = 'en';
  controller.syncLanguage('en');
  assert.equal(panel.getAttribute('dir'), 'ltr', 'Feedback panel must switch back to dir="ltr" in English mode');
  console.log('[PASS BILINGUAL] English (LTR) and Persian/Farsi (RTL) operation-feedback rendering verified.');

  console.log('\nALL 12 GDF MMI BUTTON & OPERATION-FEEDBACK VERIFICATION CHECKS PASSED!');
}

main().catch(err => {
  console.error('MMI Button Verification Failed:', err);
  process.exit(1);
});
