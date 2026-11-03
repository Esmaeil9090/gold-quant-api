# GDF Centralized Toolbox Store Index

> **Single Source of Truth for GDF Reusable Assets, Engines, Services, APIs & Verification Suites**
> Synchronized bi-directionally with `src/services/gdfOperatingSystem.ts` and `data/gdf_os_registry.json`.
> Every entry follows the mandatory 6-field Toolbox Store schema: `Tool / Resource Name`, `What It Does`, `Where It Lives`, `How to Verify Access`, `Related Playbook`, `Last Updated`.

---

### TB-001 · ScientificCoreEngine (src/engine/scientificCore.ts)
- **Tool / Resource Name:** `ScientificCoreEngine (src/engine/scientificCore.ts)`
- **What It Does:** Implements the 6D latent state filter on the volume-synchronized activity clock, multi-venue observation updates, pulse-echo sonar, post-shock drift reset (Rule 5), OOS residual oracle, and 24-step Yellow Line conditional expectation plume.
- **Where It Lives:** `/src/engine/scientificCore.ts`
- **How to Verify Access:** Verify file exists on disk and run scripts/check-scientific-core.ts or GET /api/scientific-core.
- **Related Playbook:** `PB-001`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-002 · QuantEngine (src/engine/quantEngine.ts)
- **Tool / Resource Name:** `QuantEngine (src/engine/quantEngine.ts)`
- **What It Does:** Computes Scalar-Gain Adaptive Kalman Observer (AdaptiveDPObserver), GARCH(1,1) conditional volatility, VPIN order-flow toxicity, Top-Down Resting Liquidity pools, Morse Potential Manifold, and PAXG vs COMEX GC=F cointegration basis.
- **Where It Lives:** `/src/engine/quantEngine.ts`
- **How to Verify Access:** Verify file exists on disk and invoke GET /api/gold-forecast?interval=15m.
- **Related Playbook:** `PB-001`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-003 · IntelligenceAwarenessCore (src/services/intelligenceAwarenessCore.ts)
- **Tool / Resource Name:** `IntelligenceAwarenessCore (src/services/intelligenceAwarenessCore.ts)`
- **What It Does:** Owns FaultClassifier taxonomy, Level-5 Bayesian Meta-Learning (BOCPD + 5-State Markov Particle + VB-Kalman), Tri-Modal Causal & Symbolic Discovery (Granger + PC + DAG + SINDy), Episodic Shock Bank, and isolated Magenta Candidate Plume evaluation.
- **Where It Lives:** `/src/services/intelligenceAwarenessCore.ts`
- **How to Verify Access:** Verify file exists on disk and invoke GET /api/intelligence-core.
- **Related Playbook:** `PB-002`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-004 · RealDataWaterfallService (src/services/realDataWaterfall.ts)
- **Tool / Resource Name:** `RealDataWaterfallService (src/services/realDataWaterfall.ts)`
- **What It Does:** Enforces STRICT_REAL_DATA_ONLY across approved PAXG spot cameras, separate COMEX GC=F futures benchmark camera, macro yield proxies, and approved live RSS news feeds with HTML rejection, staleness grading, and HALTED_DEGRADED circuit breaker.
- **Where It Lives:** `/src/services/realDataWaterfall.ts`
- **How to Verify Access:** Verify file exists on disk and invoke GET /api/provider-diagnostics.
- **Related Playbook:** `PB-003`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-005 · SessionCalendarService (src/services/sessionCalendar.ts)
- **Tool / Resource Name:** `SessionCalendarService (src/services/sessionCalendar.ts)`
- **What It Does:** Tracks Asia, London, and NY trading sessions, COMEX futures closed windows, weekend thin-liquidity regimes, and seasonal/calendar boundaries to enforce Rule 6 damping policies.
- **Where It Lives:** `/src/services/sessionCalendar.ts`
- **How to Verify Access:** Verify file exists on disk and inspect sessionContext in GET /api/intelligence-core.
- **Related Playbook:** `PB-002`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-006 · WalkForwardValidationService (src/services/walkForwardValidationService.ts)
- **Tool / Resource Name:** `WalkForwardValidationService (src/services/walkForwardValidationService.ts)`
- **What It Does:** Computes strictly causal walk-forward out-of-sample forecast error metrics (RMSE, MAE, Directional Hit Rate, Diebold-Mariano statistic, and prediction interval coverage).
- **Where It Lives:** `/src/services/walkForwardValidationService.ts`
- **How to Verify Access:** Verify file exists on disk and invoke GET /api/validation-scorecard?interval=15m.
- **Related Playbook:** `PB-005`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-007 · ScientificDiscoveryCycleService (src/services/scientificDiscoveryCycleService.ts)
- **Tool / Resource Name:** `ScientificDiscoveryCycleService (src/services/scientificDiscoveryCycleService.ts)`
- **What It Does:** Orchestrates the 8-stage closed-loop scientific discovery state machine (OBSERVE -> DIAGNOSE -> HYPOTHESIZE -> SYNTHESIZE -> VERIFY -> PROMOTE -> INTEGRATE -> MONITOR) with post-integration rollback protection.
- **Where It Lives:** `/src/services/scientificDiscoveryCycleService.ts`
- **How to Verify Access:** Verify file exists on disk and invoke GET /api/intelligence-core/scientific-cycle.
- **Related Playbook:** `PB-005`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-008 · GdfOperatingSystemService (src/services/gdfOperatingSystem.ts)
- **Tool / Resource Name:** `GdfOperatingSystemService (src/services/gdfOperatingSystem.ts)`
- **What It Does:** Implements the 5-stage GDF AI Delegation & Operating System (INTERVIEW -> PLAYBOOK -> TOOLBOX -> PROOF -> LOOPBACK + ON-DEMAND AUDIT), bi-directionally syncing /playbooks/*.md, /toolbox/TOOLBOX_INDEX.md, and data/gdf_os_registry.json.
- **Where It Lives:** `/src/services/gdfOperatingSystem.ts`
- **How to Verify Access:** Verify file exists on disk and invoke GET /api/gdf-os/state, POST /api/gdf-os/run-proof, and POST /api/gdf-os/audit.
- **Related Playbook:** `PB-006`
- **Last Updated:** `2026-11-03T16:38:51.607Z`
- **Verified On Disk:** `PASS`

### TB-009 · ScientificCoreCheck (scripts/check-scientific-core.ts)
- **Tool / Resource Name:** `ScientificCoreCheck (scripts/check-scientific-core.ts)`
- **What It Does:** Automated verification suite testing 6D latent state filtering, pulse-echo sonar, post-shock drift decay, and OOS scoreboard sample gating.
- **Where It Lives:** `/scripts/check-scientific-core.ts`
- **How to Verify Access:** Verify /scripts/check-scientific-core.ts exists on disk and execute via POST /api/gdf-os/run-proof.
- **Related Playbook:** `PB-001`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-010 · AwarenessCoreUpgradeCheck (scripts/check-awareness-core-upgrade.ts)
- **Tool / Resource Name:** `AwarenessCoreUpgradeCheck (scripts/check-awareness-core-upgrade.ts)`
- **What It Does:** Automated verification suite testing FaultClassifier taxonomy, session/weekend regime damping, news transmission mismatch detection, and Level-5 Bayesian/Causal discovery telemetry.
- **Where It Lives:** `/scripts/check-awareness-core-upgrade.ts`
- **How to Verify Access:** Verify /scripts/check-awareness-core-upgrade.ts exists on disk and execute via POST /api/gdf-os/run-proof.
- **Related Playbook:** `PB-002`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-011 · ParallelUniverseAndCycleCheck (scripts/check-parallel-universe-core.ts)
- **Tool / Resource Name:** `ParallelUniverseAndCycleCheck (scripts/check-parallel-universe-core.ts)`
- **What It Does:** Automated verification suite testing Live (Yellow) vs Candidate (Magenta) isolation, 8-gate OOS promotion rules, latent math write-back gates, and deterministic rollback.
- **Where It Lives:** `/scripts/check-parallel-universe-core.ts`
- **How to Verify Access:** Verify /scripts/check-parallel-universe-core.ts exists on disk and execute via POST /api/gdf-os/run-proof.
- **Related Playbook:** `PB-005`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`

### TB-012 · Phase0BaselineIntegrityCheck (scripts/check-phase0-baseline-integrity.ts)
- **Tool / Resource Name:** `Phase0BaselineIntegrityCheck (scripts/check-phase0-baseline-integrity.ts)`
- **What It Does:** Automated verification suite testing STRICT_REAL_DATA_ONLY, zero synthetic OHLCV generation, HTML rejection guards, and HALTED_DEGRADED circuit-breaker behavior.
- **Where It Lives:** `/scripts/check-phase0-baseline-integrity.ts`
- **How to Verify Access:** Verify /scripts/check-phase0-baseline-integrity.ts exists on disk and execute via POST /api/gdf-os/run-proof.
- **Related Playbook:** `PB-003`
- **Last Updated:** `2026-11-02T19:09:51.374Z`
- **Verified On Disk:** `PASS`
