import { relations } from 'drizzle-orm';
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// 1. Authenticated Users Table (linked to Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().default('OPERATOR_MMI'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. GDF OS Master Registry State Table (with monotonic revision & SHA-256 integrity digest)
export const gdfOsRegistryState = pgTable('gdf_os_registry_state', {
  id: text('id').primaryKey(),
  schemaVersion: text('schema_version').notNull(),
  revision: integer('revision').notNull().default(1),
  currentStage: text('current_stage').notNull(),
  contentSha256: text('content_sha256').notNull(),
  registryPayload: jsonb('registry_payload').notNull(),
  updatedByUid: text('updated_by_uid').references(() => users.uid),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 3. Canonical GDF Playbooks Table (PB-001 through PB-006)
export const gdfPlaybooks = pgTable('gdf_playbooks', {
  playbookId: text('playbook_id').primaryKey(),
  playbookName: text('playbook_name').notNull(),
  version: text('version').notNull(),
  sha256Digest: text('sha256_digest').notNull(),
  markdownPath: text('markdown_path').notNull(),
  playbookPayload: jsonb('playbook_payload').notNull(),
  lastUpdatedIso: text('last_updated_iso').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 4. Executable Proof Reports History Table
export const gdfProofReports = pgTable('gdf_proof_reports', {
  proofId: text('proof_id').primaryKey(),
  timestampIso: text('timestamp_iso').notNull(),
  runnerVersion: text('runner_version').notNull(),
  requestedBy: text('requested_by').notNull(),
  overallStatus: text('overall_status').notNull(),
  totalDurationMs: integer('total_duration_ms').notNull(),
  checksPayload: jsonb('checks_payload').notNull(),
  reportPayload: jsonb('report_payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. On-Demand 6-Dimension Audit Reports Table
export const gdfAuditReports = pgTable('gdf_audit_reports', {
  auditId: text('audit_id').primaryKey(),
  timestampIso: text('timestamp_iso').notNull(),
  highestLeverageNextFix: text('highest_leverage_next_fix').notNull(),
  findingsPayload: jsonb('findings_payload').notNull(),
  reportPayload: jsonb('report_payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. Step 5 Loopback Version Upgrade Events Table
export const gdfLoopbackEvents = pgTable('gdf_loopback_events', {
  loopbackId: text('loopback_id').primaryKey(),
  timestampIso: text('timestamp_iso').notNull(),
  playbookId: text('playbook_id').notNull(),
  previousVersion: text('previous_version').notNull(),
  newVersion: text('new_version').notNull(),
  triggerReason: text('trigger_reason').notNull(),
  addedFailureModeOrStep: text('added_failure_mode_or_step').notNull(),
  eventPayload: jsonb('event_payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. Dual-Control Promotion Gate Decisions Table (Append-Only Audit Trail)
export const gdfPromotionDecisions = pgTable('gdf_promotion_decisions', {
  decisionId: text('decision_id').primaryKey(),
  timestampIso: text('timestamp_iso').notNull(),
  mode: text('mode').notNull(),
  decision: text('decision').notNull(),
  proofReportId: text('proof_report_id'),
  proofStatus: text('proof_status').notNull(),
  candidateArchitectureId: text('candidate_architecture_id').notNull(),
  candidateVersionTag: text('candidate_version_tag').notNull(),
  liveArchitectureId: text('live_architecture_id').notNull(),
  operatorAuthorization: text('operator_authorization').notNull(),
  reason: text('reason').notNull(),
  decisionPayload: jsonb('decision_payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 8. Security & RBAC Mutation Audit Log Table (Append-Only)
export const gdfSecurityAuditLog = pgTable('gdf_security_audit_log', {
  eventId: text('event_id').primaryKey(),
  timestampIso: text('timestamp_iso').notNull(),
  endpointOrOperation: text('endpoint_or_operation').notNull(),
  actorRole: text('actor_role').notNull(),
  outcome: text('outcome').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 9. Persistent Intelligence & Parallel Universe Architecture Store Snapshot
export const gdfArchitectureSnapshots = pgTable('gdf_architecture_snapshots', {
  storeId: text('store_id').primaryKey(),
  schemaVersion: integer('schema_version').notNull(),
  generationCounter: integer('generation_counter').notNull(),
  liveArchitectureId: text('live_architecture_id').notNull(),
  candidateArchitectureId: text('candidate_architecture_id').notNull(),
  storePayload: jsonb('store_payload').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  registryUpdates: many(gdfOsRegistryState),
}));

export const gdfOsRegistryStateRelations = relations(gdfOsRegistryState, ({ one }) => ({
  updatedBy: one(users, {
    fields: [gdfOsRegistryState.updatedByUid],
    references: [users.uid],
  }),
}));
