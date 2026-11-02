import fs from 'fs';
import path from 'path';
import {
  buildExternalAuditorPacket,
  evaluateDualControlPromotionGate,
  loadOrInitializeGdfOsRegistry,
  runGdfAuditAndLoopback,
  runGdfProofSuite,
  triggerLoopbackUpgrade,
} from '../src/services/gdfOperatingSystem.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[GDF OS Verification Failed] ${message}`);
  }
}

async function main() {
  console.log('=== GDF 5-Step Operating System Verification Suite ===');

  const registry = loadOrInitializeGdfOsRegistry();
  assert(registry.interviews.length >= 1, 'Expected at least 1 confirmed Interview record.');
  assert(registry.interviews[0].confirmedByOperator === true, 'Interview INT-001 must be confirmed by operator.');
  assert(registry.playbooks.length === 6, `Expected 6 Playbooks (PB-001..PB-006), got ${registry.playbooks.length}.`);
  assert(registry.toolbox.length === 12, `Expected 12 Toolbox entries (TB-001..TB-012), got ${registry.toolbox.length}.`);

  // Verify Markdown files exist on disk
  for (const pb of registry.playbooks) {
    const absPath = path.join(process.cwd(), pb.markdownPath.replace(/^\//, ''));
    assert(fs.existsSync(absPath), `Playbook Markdown missing on disk: ${absPath}`);
  }
  const toolboxMdPath = path.join(process.cwd(), 'toolbox', 'TOOLBOX_INDEX.md');
  assert(fs.existsSync(toolboxMdPath), 'Toolbox Index Markdown missing on disk: /toolbox/TOOLBOX_INDEX.md');

  // Verify all Toolbox entries exist on disk
  for (const tb of registry.toolbox) {
    assert(tb.verifiedExistsOnDisk === true, `Toolbox asset missing on disk: ${tb.toolId} (${tb.whereItLives})`);
  }

  // Run Step 4 Proof Suite
  const proofReport = runGdfProofSuite({
    requestedBy: 'CLI_VERIFICATION_SUITE',
    taskDescription: 'Verify GDF 5-Step Delegation, Playbook, Toolbox, Proof & Audit Operating System.',
  });
  console.log(`Proof Report ID: ${proofReport.proofId} | Overall Status: ${proofReport.overallStatus}`);
  for (const chk of proofReport.checks) {
    console.log(`  [${chk.status}] ${chk.checkId} (${chk.relatedPlaybook}): ${chk.evidence}`);
    assert(chk.status === 'PASS', `Check ${chk.checkId} did not PASS.`);
  }
  assert(proofReport.overallStatus === 'PASS', 'Expected overall Proof status to be PASS.');

  // Run On-Demand 6-Point Audit
  const auditReport = runGdfAuditAndLoopback({ autoLoopbackOnFindings: false });
  console.log(`Audit Report ID: ${auditReport.auditId} | Missing Playbooks: ${auditReport.missingPlaybooks.length} | Missing Tools: ${auditReport.missingToolsOrBrokenWorkflows.length}`);
  assert(auditReport.missingPlaybooks.length === 0, 'Expected 0 missing playbooks.');
  assert(auditReport.missingToolsOrBrokenWorkflows.length === 0, 'Expected 0 missing tools.');
  assert(auditReport.findings.length === 6, 'Expected all 6 mandatory audit dimensions.');

  // Verify Step 5 Loopback Upgrade
  const lb = triggerLoopbackUpgrade({
    playbookId: 'PB-006',
    reason: 'Verified Step 5 Loopback version bump & bi-directional Markdown sync.',
    addedFailureModeOrStep: 'Verified cryptographic SHA-256 digest tracking across /playbooks/PB-001.md..PB-006.md.',
  });
  assert(Boolean(lb), 'Expected loopback upgrade event on PB-006.');
  assert(lb!.newVersion === 'v1.1', `Expected PB-006 version to increment to v1.1, got ${lb!.newVersion}`);

  // Verify Dual-Control Promotion Gate
  const gate = evaluateDualControlPromotionGate('AUTOMATIC_VERIFIED');
  assert(gate.allowed === true, `Expected Dual-Control Promotion Gate to allow when Proof is PASS: ${gate.reason}`);

  // Verify Read-Only External Auditor Packet
  const packet = buildExternalAuditorPacket();
  assert(packet.externalAgentRole === 'READ_ONLY_AUDITOR_AND_ADVISOR', 'External agent role must be READ_ONLY_AUDITOR_AND_ADVISOR');
  assert(packet.mutationPermission === 'FORBIDDEN_READ_ONLY', 'External agent mutation permission must be FORBIDDEN_READ_ONLY');

  console.log('=== ALL GDF OPERATING SYSTEM VERIFICATION CHECKS PASSED ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
