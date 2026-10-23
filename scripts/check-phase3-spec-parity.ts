import fs from 'fs';
import path from 'path';
import { MODEL_SPEC_REGISTRY, getModelSpecList } from '../src/config/modelSpecRegistry.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[SPEC_PARITY_VIOLATION] ${message}`);
  }
}

async function runPhase3SpecParityCheck() {
  console.log('======================================================================');
  console.log('GDF PHASE 3 — AUTOMATED SPECIFICATION PARITY GOVERNANCE CHECK');
  console.log('======================================================================');

  // 1. Validate Model Specification Registry completeness
  const specs = getModelSpecList();
  assert(specs.length >= 10, `Expected at least 10 registered estimators, found ${specs.length}`);

  for (const spec of specs) {
    assert(
      spec.classification === 'VERIFIED_EXACT' || spec.classification === 'QUALIFIED_PROXY',
      `Estimator ${spec.id} has invalid classification: ${spec.classification}`
    );
    assert(Boolean(spec.honestLabelEn?.trim()), `Estimator ${spec.id} missing honestLabelEn`);
    assert(Boolean(spec.honestLabelFa?.trim()), `Estimator ${spec.id} missing honestLabelFa`);
    assert(Boolean(spec.visualizationLayerEn?.trim()), `Estimator ${spec.id} missing visualizationLayerEn`);
    assert(Boolean(spec.visualizationLayerFa?.trim()), `Estimator ${spec.id} missing visualizationLayerFa`);
    assert(Boolean(spec.mathClassEn?.trim()), `Estimator ${spec.id} missing mathClassEn`);
    assert(Boolean(spec.mathClassFa?.trim()), `Estimator ${spec.id} missing mathClassFa`);
    assert(Array.isArray(spec.inputDataFeeds) && spec.inputDataFeeds.length > 0, `Estimator ${spec.id} missing inputDataFeeds`);
    assert(Boolean(spec.samplingAndLookbackEn?.trim()), `Estimator ${spec.id} missing samplingAndLookbackEn`);
    assert(Boolean(spec.samplingAndLookbackFa?.trim()), `Estimator ${spec.id} missing samplingAndLookbackFa`);
    assert(Boolean(spec.dofAndCalibrationEn?.trim()), `Estimator ${spec.id} missing dofAndCalibrationEn`);
    assert(Boolean(spec.dofAndCalibrationFa?.trim()), `Estimator ${spec.id} missing dofAndCalibrationFa`);
    assert(Boolean(spec.structuralLimitationsEn?.trim()), `Estimator ${spec.id} missing structuralLimitationsEn`);
    assert(Boolean(spec.structuralLimitationsFa?.trim()), `Estimator ${spec.id} missing structuralLimitationsFa`);
  }
  console.log(`✓ [PASS] 1. All ${specs.length} ModelSpecificationRegistry entries have complete bilingual (EN/FA) metadata.`);

  // 2. Validate that every data-model-spec attribute in index.html maps to a registered VERIFIED_EXACT or QUALIFIED_PROXY entry
  const indexHtmlPath = path.join(process.cwd(), 'index.html');
  const html = fs.readFileSync(indexHtmlPath, 'utf-8');

  const specAttrRegex = /data-model-spec="([^"]+)"/g;
  const matchedSpecIds = new Set<string>();
  let match: RegExpExecArray | null;
  let totalTriggersCount = 0;

  while ((match = specAttrRegex.exec(html)) !== null) {
    const id = match[1];
    totalTriggersCount++;
    matchedSpecIds.add(id);
    assert(
      Boolean(MODEL_SPEC_REGISTRY[id]),
      `UI element in index.html references unregistered data-model-spec="${id}"`
    );
  }

  assert(
    totalTriggersCount >= 18,
    `Expected at least 18 data-model-spec interactive triggers across cards and 3D HUD, found ${totalTriggersCount}`
  );

  for (const registeredId of Object.keys(MODEL_SPEC_REGISTRY)) {
    assert(
      matchedSpecIds.has(registeredId),
      `Registered estimator "${registeredId}" is not wired to any data-model-spec trigger in index.html`
    );
  }
  console.log(`✓ [PASS] 2. All ${totalTriggersCount} UI spec triggers in index.html resolve to all ${matchedSpecIds.size} registered estimators.`);

  // 3. Restricted Institutional Microstructure Terminology Governance Audit
  // Fails the build if any legacy un-audited quant-theater strings appear in index.html
  const forbiddenUnqualifiedUiStrings = [
    { pattern: 'cardPcaTitle: \'PCA Orthogonal Macro Vectors\'', reason: 'Must be relabeled as 3-Factor Macro Projection Proxy [Viz: PCA]' },
    { pattern: 'cardBasisTitle: \'Cointegration Basis Filter\'', reason: 'Must be relabeled as Cross-Venue Basis Z-Score Proxy [Viz: Basis]' },
    { pattern: 'dpVpin: \'VPIN Flow Toxicity\'', reason: 'Must be relabeled as Bulk-Volume VPIN Proxy' },
    { pattern: 'Hawkes λ:', reason: 'Must be relabeled as Decay Kernel λ (no tick-level Hawkes point process)' },
    { pattern: 'Barsky-Summers Gravity Vector:', reason: 'Must be relabeled as Real-Yield Factor Lift' },
    { pattern: 'Johansen Cointegration', reason: 'Restricted institutional term without Johansen trace/eigenvalue implementation' },
    { pattern: 'Level-3 Order Book', reason: 'Restricted microstructure term without L3 market data feed' },
  ];

  for (const rule of forbiddenUnqualifiedUiStrings) {
    assert(
      !html.includes(rule.pattern),
      `Restricted unqualified terminology found in index.html: "${rule.pattern}" (${rule.reason})`
    );
  }
  console.log('✓ [PASS] 3. Zero restricted or unqualified microstructure claims found in UI labels or i18n dictionary.');

  // 4. Verify Model Spec Drawer Modal exists in index.html and gdfClientCore.js
  assert(html.includes('id="modelSpecModalOverlay"'), 'index.html missing #modelSpecModalOverlay container');
  const clientCorePath = path.join(process.cwd(), 'public', 'js', 'gdfClientCore.js');
  const clientCore = fs.readFileSync(clientCorePath, 'utf-8');
  assert(clientCore.includes('openModelSpecDrawer'), 'gdfClientCore.js missing openModelSpecDrawer implementation');
  console.log('✓ [PASS] 4. Interactive bilingual Model Spec inspection drawer verified in index.html and gdfClientCore.js.');

  console.log('======================================================================');
  console.log('ALL PHASE 3 SPECIFICATION PARITY CHECKS PASSED (4 / 4)');
  console.log('======================================================================');
}

runPhase3SpecParityCheck().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
