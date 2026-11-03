import { desc, eq } from 'drizzle-orm';
import { db } from './index.js';
import {
  gdfArchitectureSnapshots,
  gdfAuditReports,
  gdfLoopbackEvents,
  gdfOsRegistryState,
  gdfPlaybooks,
  gdfPromotionDecisions,
  gdfProofReports,
  gdfSecurityAuditLog,
  users,
} from './schema.js';

export function isCloudSqlConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_PASSWORD &&
      process.env.SQL_DB_NAME
  );
}

export async function getOrCreateUser(uid: string, email: string, role: string = 'OPERATOR_MMI') {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        role,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          role,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

let cloudSqlSyncQueue: Promise<any> = Promise.resolve();

export async function syncGdfOsRegistryToCloudSql(
  registry: any,
  contentSha256: string,
  updatedByUid?: string | null
): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  // Clone snapshot immediately at enqueue time so subsequent mutations or out-of-order network arrivals never race
  const snapshot = JSON.parse(JSON.stringify(registry));
  const runSync = async (): Promise<boolean> => {
    try {
      const now = new Date();
      const existingRows = await db
        .select({ revision: gdfOsRegistryState.revision })
        .from(gdfOsRegistryState)
        .where(eq(gdfOsRegistryState.id, 'PRIMARY_REGISTRY'));
      const currentDbRev = existingRows.length > 0 ? Number(existingRows[0].revision) || 0 : 0;
      const incomingRev = typeof snapshot.revision === 'number' ? snapshot.revision : 1;
      const safeRevision = Math.max(incomingRev, currentDbRev);
      snapshot.revision = safeRevision;

      await db
        .insert(gdfOsRegistryState)
        .values({
          id: 'PRIMARY_REGISTRY',
          schemaVersion: String(snapshot.schemaVersion || '2026.11.03-v2.1-GDF-OS'),
          revision: safeRevision,
          currentStage: String(snapshot.currentStage || 'STEP_4_PROOF'),
          contentSha256,
          registryPayload: snapshot,
          updatedByUid: updatedByUid || null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: gdfOsRegistryState.id,
          set: {
            schemaVersion: String(snapshot.schemaVersion || '2026.11.03-v2.1-GDF-OS'),
            revision: safeRevision,
            currentStage: String(snapshot.currentStage || 'STEP_4_PROOF'),
            contentSha256,
            registryPayload: snapshot,
            updatedByUid: updatedByUid || null,
            updatedAt: now,
          },
        });

      if (Array.isArray(snapshot.playbooks)) {
        for (const pb of snapshot.playbooks) {
        await db
          .insert(gdfPlaybooks)
          .values({
            playbookId: pb.playbookId,
            playbookName: pb.playbookName,
            version: pb.version,
            sha256Digest: pb.sha256Digest || '',
            markdownPath: pb.markdownPath,
            playbookPayload: pb,
            lastUpdatedIso: pb.lastUpdatedIso || now.toISOString(),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: gdfPlaybooks.playbookId,
            set: {
              playbookName: pb.playbookName,
              version: pb.version,
              sha256Digest: pb.sha256Digest || '',
              markdownPath: pb.markdownPath,
              playbookPayload: pb,
              lastUpdatedIso: pb.lastUpdatedIso || now.toISOString(),
              updatedAt: now,
            },
          });
      }
    }

      if (Array.isArray(snapshot.proofReports)) {
        for (const prf of snapshot.proofReports.slice(0, 10)) {
          await db
            .insert(gdfProofReports)
            .values({
              proofId: prf.proofId,
              timestampIso: prf.timestampIso,
              runnerVersion: prf.runnerVersion || 'v2.0.0-executable-proof-runner',
              requestedBy: prf.requestedBy || 'OPERATOR_MMI',
              overallStatus: prf.overallStatus,
              totalDurationMs: Math.round(Number(prf.totalDurationMs) || 0),
              checksPayload: prf.checks || [],
              reportPayload: prf,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: gdfProofReports.proofId,
            });
        }
      }

      if (Array.isArray(snapshot.auditReports)) {
        for (const aud of snapshot.auditReports.slice(0, 10)) {
          await db
            .insert(gdfAuditReports)
            .values({
              auditId: aud.auditId,
              timestampIso: aud.timestampIso,
              highestLeverageNextFix: aud.highestLeverageNextFix || '',
              findingsPayload: aud.findings || [],
              reportPayload: aud,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: gdfAuditReports.auditId,
            });
        }
      }

      if (Array.isArray(snapshot.loopbackHistory)) {
        for (const lpb of snapshot.loopbackHistory.slice(0, 15)) {
          await db
            .insert(gdfLoopbackEvents)
            .values({
              loopbackId: lpb.loopbackId,
              timestampIso: lpb.timestampIso,
              playbookId: lpb.playbookId,
              previousVersion: lpb.previousVersion,
              newVersion: lpb.newVersion,
              triggerReason: lpb.triggerReason,
              addedFailureModeOrStep: lpb.addedFailureModeOrStep,
              eventPayload: lpb,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: gdfLoopbackEvents.loopbackId,
            });
        }
      }

      if (Array.isArray(snapshot.promotionDecisionLog)) {
        for (const dec of snapshot.promotionDecisionLog.slice(0, 20)) {
          await db
            .insert(gdfPromotionDecisions)
            .values({
              decisionId: dec.decisionId,
              timestampIso: dec.timestampIso,
              mode: dec.mode,
              decision: dec.decision,
              proofReportId: dec.proofReportId || null,
              proofStatus: dec.proofStatus,
              candidateArchitectureId: dec.candidateArchitectureId,
              candidateVersionTag: dec.candidateVersionTag,
              liveArchitectureId: dec.liveArchitectureId,
              operatorAuthorization: dec.operatorAuthorization,
              reason: dec.reason,
              decisionPayload: dec,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: gdfPromotionDecisions.decisionId,
            });
        }
      }

      if (Array.isArray(snapshot.securityAuditLog)) {
        for (const sec of snapshot.securityAuditLog.slice(0, 20)) {
          await db
            .insert(gdfSecurityAuditLog)
            .values({
              eventId: sec.eventId,
              timestampIso: sec.timestampIso,
              endpointOrOperation: sec.endpointOrOperation,
              actorRole: sec.actorRole,
              outcome: sec.outcome,
              reason: sec.reason,
              createdAt: now,
            })
            .onConflictDoNothing({
              target: gdfSecurityAuditLog.eventId,
            });
        }
      }

      return true;
    } catch (error) {
      console.error('Database query failed in syncGdfOsRegistryToCloudSql:', error);
      throw new Error('Database query failed. Please try again later.', { cause: error });
    }
  };

  const nextTask = cloudSqlSyncQueue.catch(() => {}).then(runSync);
  cloudSqlSyncQueue = nextTask;
  return nextTask;
}

export async function loadGdfOsRegistryFromCloudSql(): Promise<any | null> {
  if (!isCloudSqlConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(gdfOsRegistryState)
      .where(eq(gdfOsRegistryState.id, 'PRIMARY_REGISTRY'));

    if (!rows.length || !rows[0].registryPayload) {
      return null;
    }

    const baseRegistry = rows[0].registryPayload as any;
    baseRegistry.revision = rows[0].revision;
    baseRegistry.contentSha256 = rows[0].contentSha256;

    const [proofRows, auditRows, loopbackRows, promoRows, secRows] = await Promise.all([
      db.select().from(gdfProofReports).orderBy(desc(gdfProofReports.timestampIso)).limit(50),
      db.select().from(gdfAuditReports).orderBy(desc(gdfAuditReports.timestampIso)).limit(50),
      db.select().from(gdfLoopbackEvents).orderBy(desc(gdfLoopbackEvents.timestampIso)).limit(80),
      db.select().from(gdfPromotionDecisions).orderBy(desc(gdfPromotionDecisions.timestampIso)).limit(200),
      db.select().from(gdfSecurityAuditLog).orderBy(desc(gdfSecurityAuditLog.timestampIso)).limit(200),
    ]);

    if (proofRows.length > 0) {
      baseRegistry.proofReports = proofRows.map((r) => r.reportPayload);
    }
    if (auditRows.length > 0) {
      baseRegistry.auditReports = auditRows.map((r) => r.reportPayload);
    }
    if (loopbackRows.length > 0) {
      baseRegistry.loopbackHistory = loopbackRows.map((r) => r.eventPayload);
    }
    if (promoRows.length > 0) {
      baseRegistry.promotionDecisionLog = promoRows.map((r) => r.decisionPayload);
    }
    if (secRows.length > 0) {
      baseRegistry.securityAuditLog = secRows.map((r) => ({
        eventId: r.eventId,
        timestampIso: r.timestampIso,
        endpointOrOperation: r.endpointOrOperation,
        actorRole: r.actorRole,
        outcome: r.outcome,
        reason: r.reason,
      }));
    }

    return baseRegistry;
  } catch (error) {
    console.error('Database query failed in loadGdfOsRegistryFromCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function syncArchitectureStoreToCloudSql(storePayload: any): Promise<boolean> {
  if (!isCloudSqlConfigured()) return false;
  try {
    const now = new Date();
    const schemaVersion = Number(storePayload?.schemaVersion) || 2;
    const generationCounter = Number(storePayload?.generationCounter) || 1;
    const liveArchitectureId = String(storePayload?.liveArchitecture?.architectureId || 'arch-live-gen1');
    const candidateArchitectureId = String(storePayload?.candidateArchitecture?.architectureId || 'arch-cand-gen2');

    await db
      .insert(gdfArchitectureSnapshots)
      .values({
        storeId: 'PRIMARY_ARCHITECTURE_STORE_V2',
        schemaVersion,
        generationCounter,
        liveArchitectureId,
        candidateArchitectureId,
        storePayload,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: gdfArchitectureSnapshots.storeId,
        set: {
          schemaVersion,
          generationCounter,
          liveArchitectureId,
          candidateArchitectureId,
          storePayload,
          updatedAt: now,
        },
      });
    return true;
  } catch (error) {
    console.error('Database query failed in syncArchitectureStoreToCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function loadArchitectureStoreFromCloudSql(): Promise<any | null> {
  if (!isCloudSqlConfigured()) return null;
  try {
    const rows = await db
      .select()
      .from(gdfArchitectureSnapshots)
      .where(eq(gdfArchitectureSnapshots.storeId, 'PRIMARY_ARCHITECTURE_STORE_V2'));
    if (!rows.length || !rows[0].storePayload) {
      return null;
    }
    return rows[0].storePayload;
  } catch (error) {
    console.error('Database query failed in loadArchitectureStoreFromCloudSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
