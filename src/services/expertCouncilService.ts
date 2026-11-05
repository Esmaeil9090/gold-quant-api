import fs from 'node:fs';
import path from 'node:path';
import { FunctionDeclaration, GoogleGenAI, Type } from '@google/genai';
import { FINANCIAL_TERMINOLOGY_DICTIONARY } from '../config/financialDictionary.js';
import {
  getAllCachedWaterfallSnapshots,
  getLatestWaterfallSnapshot,
  getMultiTimeframeBootstrapState,
  getProviderHttpDiagnostics,
  getSystemWarningErrorLog,
} from './realDataWaterfall.js';
import {
  getArchitecturePersistenceHealth,
  getIntelligenceCoreStateSnapshot,
} from './intelligenceAwarenessCore.js';
import { getScientificDiscoveryCycleTelemetry } from './scientificDiscoveryCycleService.js';
import {
  evaluateProofReportFreshness,
  loadOrInitializeGdfOsRegistry,
} from './gdfOperatingSystem.js';
import { isCloudSqlConfigured } from '../db/gdfRepository.js';

export type ExpertPersonaId =
  | 'COUNCIL_ALL'
  | 'FINANCIAL_STRATEGIST'
  | 'MATHEMATICIAN'
  | 'PHYSICIST'
  | 'SOFTWARE_ARCHITECT'
  | 'SYSTEMS_ENGINEER'
  | 'VISUAL_DESIGNER';

export interface ExpertPersonaDescriptor {
  id: ExpertPersonaId;
  titleEn: string;
  titleFa: string;
  badgeLabel: string;
  accentColor: string;
  domainFocusEn: string;
  domainFocusFa: string;
  systemPromptRole: string;
}

export interface ExpertToolInvocationRecord {
  toolName: string;
  args: Record<string, any>;
  summary: string;
}

export interface ExpertCouncilChatTurn {
  role: 'user' | 'model';
  text: string;
  expertId?: ExpertPersonaId;
  timestampIso?: string;
}

export interface ExpertCouncilResponse {
  status: 'SUCCESS' | 'FALLBACK_TELEMETRY_ONLY' | 'ERROR';
  expertId: ExpertPersonaId;
  expertTitleEn: string;
  expertTitleFa: string;
  modelUsed: string;
  replyMarkdown: string;
  toolsInvoked: ExpertToolInvocationRecord[];
  liveTelemetryDigest: {
    activeInterval: string;
    systemState: string;
    activeProvider: string;
    lastCloseUsd: number | null;
    liveArchitectureVersion: string;
    candidateArchitectureVersion: string;
    passedGatesCount: number;
    totalGatesCount: number;
    proofStatus: string;
    cloudSqlActive: boolean;
  };
  timestampIso: string;
}

const WORKSPACE_ROOT = process.cwd();

export const EXPERT_COUNCIL_ROSTER: ExpertPersonaDescriptor[] = [
  {
    id: 'COUNCIL_ALL',
    titleEn: 'Full Multi-Disciplinary Council (All 6 Specialists)',
    titleFa: 'شورای کامل چندرشته‌ای (هر ۶ متخصص پروژه)',
    badgeLabel: '🏛️ FULL COUNCIL',
    accentColor: '#f5d76e',
    domainFocusEn:
      'Synthesizes Quantitative Finance, Stochastic Mathematics, Econophysics/Hydrodynamics, Software Architecture, Systems Governance, and Visual UX/3D Design.',
    domainFocusFa:
      'ترکیب دیدگاه‌های مالی کمی، ریاضیات تصادفی، اکونوفیزیک و هیدرودینامیک، معماری نرم‌افزار، مهندسی سیستم و طراحی بصری.',
    systemPromptRole: `You are the GDF Multi-Disciplinary Council of Experts presiding over the Gold Dynamic Flow (GDF) Quantitative Terminal.
When answering, structure your analysis with distinct specialist viewpoints where relevant:
- 📈 **Chief Financial & Market Strategist**: Price action (PAXG spot & COMEX GC=F futures), orthogonal macro factors (F1 TIPS real yield, F2 DXY, F3 curve slope), VPIN order-flow toxicity, HTF POC liquidity attractors, and LBMA/COMEX/Asian session regimes.
- 🧮 **Chief Applied Mathematician**: 6D Volume-Clock Extended Kalman Filter, Ornstein-Uhlenbeck restoring drift, BOCPD changepoint probability, 5-state Dirichlet regime posterior, SINDy ridge symbolic equations (θ̂, λ_t), and Diebold-Mariano OOS statistical gates.
- ⚛️ **Lead Econophysicist & Hydrodynamicist**: Order-book fluid mechanics, potential-well stability around HTF POC, phase transitions, entropy, and shock damping.
- 💻 **Principal Software & Data Architect**: TypeScript codebase inspection (server.ts, src/services/*, src/engine/*, src/db/*), provider waterfall latency, timeout/singleflight analysis, and Cloud SQL (us-east1) persistence.
- 🛡️ **Systems & Governance Engineer**: GDF 5-Step Operating System (PB-001..006, TB-001..012), Executable Proof Runner (PRF-*), Dual-Control Promotion Gate (Rule 8), and 8-Step Scientific Discovery Cycle.
- 🎨 **Visual & 3D Ergonomics Designer**: 2D Canvas quantile plumes, Three.js 3D liquidity landscape, cognitive hierarchy, and English/Persian (LTR/RTL) HUD ergonomics.
End with a unified **🏛️ Council Consensus & Actionable Next Steps** section.`,
  },
  {
    id: 'FINANCIAL_STRATEGIST',
    titleEn: 'Chief Quantitative Market & Financial Strategist',
    titleFa: 'استراتژیست ارشد بازارهای مالی و طلا (کمی و کلان)',
    badgeLabel: '📈 FINANCIAL EXPERT',
    accentColor: '#00e676',
    domainFocusEn:
      'Gold/PAXG spot & COMEX GC=F futures, real yields (TIPS), DXY, VPIN microstructure, HTF POC liquidity, and session/seasonal regimes.',
    domainFocusFa:
      'تحلیل اسپات طلا/PAXG و فیوچرز کامکس، بازده واقعی، شاخص دلار، سمیت جریان سفارش (VPIN) و نقدینگی.',
    systemPromptRole: `You are the GDF Chief Quantitative Market & Financial Strategist.
Focus deeply on real-time Gold/PAXG spot & COMEX (GC=F) cross-venue basis, 3-factor orthogonal macro drivers (10Y TIPS real yield, DXY, yield curve), VPIN order-flow toxicity, Kyle's lambda, HTF Point-of-Control (POC) attractors, London LBMA Fix / NY COMEX / Asian session regimes, and risk-adjusted trade/forecast interpretation.`,
  },
  {
    id: 'MATHEMATICIAN',
    titleEn: 'Chief Applied Mathematician & Stochastic Theorist',
    titleFa: 'ریاضی‌دان ارشد کاربردی و نظریه‌پرداز فرآیندهای تصادفی',
    badgeLabel: '🧮 MATHEMATICIAN',
    accentColor: '#00e5ff',
    domainFocusEn:
      '6D Volume-Clock Kalman Filter, OU Mean Reversion, BOCPD, Dirichlet Regimes, SINDy Ridge Symbolic Regression, and Diebold-Mariano OOS Gates.',
    domainFocusFa:
      'فیلتر کالمن ۶بعدی ساعت حجمی، بازگشت به میانگین OU، تشخیص نقطه تغییر بیزی، رگرسیون نمادین ریج و آزمون دیبولد-ماریانو.',
    systemPromptRole: `You are the GDF Chief Applied Mathematician & Stochastic Control Theorist.
Focus on the exact mathematical equations in src/engine/scientificCore.ts, src/engine/quantEngine.ts, and src/services/intelligenceAwarenessCore.ts: 6D state vector x(τ_t), covariance PSD invariants, ridge shrinkage θ̂, split-half stability S, Bayesian Online Changepoint Detection (BOCPD), Granger/PC causal discovery, and the 8-Gate Out-of-Sample promotion verifier.`,
  },
  {
    id: 'PHYSICIST',
    titleEn: 'Lead Econophysicist & Hydrodynamic Systems Specialist',
    titleFa: 'فیزیک‌دان سیستم‌های پیچیده، اکونوفیزیک و هیدرودینامیک نقدینگی',
    badgeLabel: '⚛️ PHYSICIST',
    accentColor: '#e040fb',
    domainFocusEn:
      'Hydrodynamic order-flow modeling, Langevin potential wells, phase transitions, shock wave damping, and non-equilibrium statistical mechanics.',
    domainFocusFa:
      'مدل‌سازی هیدرودینامیک جریان سفارشات، چاه پتانسیل لانژون، گذار فاز، میرایی موج شوک و مکانیک آماری غیرتعادلی.',
    systemPromptRole: `You are the GDF Lead Econophysicist & Hydrodynamic Systems Specialist.
Interpret market dynamics and the GDF codebase through non-equilibrium statistical physics, fluid dynamics, Langevin stochastic differential equations, restoring forces toward HTF POC potential wells, energy dissipation (liquidity resilience γ_res), and critical slowing down before regime shifts.`,
  },
  {
    id: 'SOFTWARE_ARCHITECT',
    titleEn: 'Principal TypeScript, Backend & Performance Architect',
    titleFa: 'معمار ارشد نرم‌افزار، بک‌اند و بهینه‌سازی کارایی',
    badgeLabel: '💻 CODE ARCHITECT',
    accentColor: '#40c4ff',
    domainFocusEn:
      'Full repository code analysis, Express API latency, provider waterfall timeouts, concurrency locks, and Cloud SQL PostgreSQL persistence.',
    domainFocusFa:
      'تحلیل کامل کدهای مخزن، تاخیر API، آبشار تامین‌کنندگان داده، قفل‌های همزمانی و پایگاه داده Cloud SQL.',
    systemPromptRole: `You are the GDF Principal TypeScript & Distributed Systems Software Architect.
Use the repository inspection tools (list_repository_files, read_repository_file, search_repository_code) and live telemetry to diagnose performance bottlenecks, provider timeouts, memory/cache behavior, Cloud SQL (us-east1) Drizzle ORM persistence, and exact file/line code improvements.`,
  },
  {
    id: 'SYSTEMS_ENGINEER',
    titleEn: 'GDF Operating System, Proof & Governance Lead',
    titleFa: 'مهندس ارشد سیستم‌عامل GDF، گیت‌های اثبات و حاکمیت علمی',
    badgeLabel: '🛡️ SYSTEMS & GOV',
    accentColor: '#ffab00',
    domainFocusEn:
      'Playbooks PB-001..006, Toolbox TB-001..012, Step 4 Executable Proof Runner, Dual-Control Promotion Gate, and 8-Step Discovery Cycle.',
    domainFocusFa:
      'پلی‌بوک‌های PB-001..006، جعبه ابزار، موتور اثبات اجرایی گام ۴، گیت کنترل دوگانه ارتقا و چرخه ۸مرحله‌ای کشف علمی.',
    systemPromptRole: `You are the GDF Systems & Governance Engineer.
Focus on operational reliability, the 5-Step AI Delegation Operating System (Interview, Playbooks, Toolbox, Proof, Loopback), Dual-Control Promotion Gate (Rule 8), CSRF/RBAC security audit logs, and the 8-Step Scientific Discovery Cycle state machine.`,
  },
  {
    id: 'VISUAL_DESIGNER',
    titleEn: 'Lead Quantitative UI/UX, 2D Canvas & 3D WebGL Designer',
    titleFa: 'طراح ارشد رابط کاربری کوانت، گرافیک ۲بعدی و فضای ۳بعدی WebGL',
    badgeLabel: '🎨 VISUAL DESIGNER',
    accentColor: '#ff4081',
    domainFocusEn:
      'HUD visual hierarchy, 2D quantile fan charts, Three.js 3D liquidity surfaces, institutional color semantics, and EN/FA bilingual typography.',
    domainFocusFa:
      'سلسله‌مراتب بصری کنسول، نمودارهای بادبزنی عدم قطعیت، فضای ۳بعدی نقدینگی و تایپوگرافی دوزبانه فارسی/انگلیسی.',
    systemPromptRole: `You are the GDF Lead Quantitative UI/UX & 3D Visual Designer.
Focus on institutional trading terminal ergonomics, 2D HTML5 Canvas trajectory rendering, Three.js 3D world visualization, visual signal-to-noise ratio, color contrast for Live Yellow (#f5d76e) vs Parallel Candidate (#e040fb) plumes, and seamless English (LTR) / Persian (RTL) layout symmetry in index.html.`,
  },
];

const ALLOWED_TOP_LEVEL_DIRS = new Set(['src', 'playbooks', 'toolbox', 'scripts']);
const ALLOWED_ROOT_FILES = new Set([
  'server.ts',
  'index.html',
  'package.json',
  'tsconfig.json',
  'metadata.json',
]);

function isSafeRepoPath(relPath: string): { safe: boolean; absPath: string; normalizedRel: string; reason?: string } {
  const cleaned = String(relPath || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  if (!cleaned || cleaned.includes('..') || cleaned.startsWith('.env') || cleaned.includes('.env.')) {
    return {
      safe: false,
      absPath: '',
      normalizedRel: cleaned,
      reason: 'Access denied: Path traversal or sensitive environment files are strictly forbidden.',
    };
  }
  const absPath = path.resolve(WORKSPACE_ROOT, cleaned);
  if (!absPath.startsWith(WORKSPACE_ROOT)) {
    return {
      safe: false,
      absPath: '',
      normalizedRel: cleaned,
      reason: 'Access denied: Path resolves outside the repository workspace root.',
    };
  }
  const parts = cleaned.split('/');
  if (parts.length === 1) {
    if (!ALLOWED_ROOT_FILES.has(parts[0])) {
      return {
        safe: false,
        absPath: '',
        normalizedRel: cleaned,
        reason: `Root file '${parts[0]}' is not in the allowed inspection list (${Array.from(ALLOWED_ROOT_FILES).join(', ')}).`,
      };
    }
  } else if (!ALLOWED_TOP_LEVEL_DIRS.has(parts[0])) {
    return {
      safe: false,
      absPath: '',
      normalizedRel: cleaned,
      reason: `Directory '${parts[0]}' is not in the allowed repository directories (${Array.from(ALLOWED_TOP_LEVEL_DIRS).join(', ')}).`,
    };
  }
  return { safe: true, absPath, normalizedRel: cleaned };
}

function walkDirRecursive(dirAbs: string, baseRel: string, maxFiles: number = 120): Array<{ path: string; sizeBytes: number; lines?: number }> {
  const results: Array<{ path: string; sizeBytes: number; lines?: number }> = [];
  if (!fs.existsSync(dirAbs)) return results;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const entry of entries) {
    if (results.length >= maxFiles) break;
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const childAbs = path.join(dirAbs, entry.name);
    const childRel = baseRel ? `${baseRel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkDirRecursive(childAbs, childRel, maxFiles - results.length));
    } else if (entry.isFile()) {
      try {
        const st = fs.statSync(childAbs);
        results.push({ path: childRel, sizeBytes: st.size });
      } catch {
        // Ignore unreadable
      }
    }
  }
  return results;
}

export function executeListRepositoryFiles(directory?: string): Record<string, any> {
  const targetDir = (directory || '').trim().replace(/^\/+/, '');
  if (!targetDir || targetDir === '.' || targetDir === 'all') {
    const allFiles: Array<{ path: string; sizeBytes: number }> = [];
    for (const rootFile of ALLOWED_ROOT_FILES) {
      const abs = path.join(WORKSPACE_ROOT, rootFile);
      if (fs.existsSync(abs)) {
        const st = fs.statSync(abs);
        allFiles.push({ path: rootFile, sizeBytes: st.size });
      }
    }
    for (const dir of ALLOWED_TOP_LEVEL_DIRS) {
      allFiles.push(...walkDirRecursive(path.join(WORKSPACE_ROOT, dir), dir, 100));
    }
    return {
      totalFiles: allFiles.length,
      files: allFiles,
    };
  }
  if (!ALLOWED_TOP_LEVEL_DIRS.has(targetDir.split('/')[0])) {
    return {
      error: `Directory '${targetDir}' is not allowed. Allowed directories: ${Array.from(ALLOWED_TOP_LEVEL_DIRS).join(', ')}.`,
    };
  }
  const abs = path.resolve(WORKSPACE_ROOT, targetDir);
  if (!abs.startsWith(WORKSPACE_ROOT) || !fs.existsSync(abs)) {
    return { error: `Directory '${targetDir}' does not exist.` };
  }
  const files = walkDirRecursive(abs, targetDir, 100);
  return {
    directory: targetDir,
    totalFiles: files.length,
    files,
  };
}

export function executeReadRepositoryFile(
  filePath: string,
  startLine: number = 1,
  endLine: number = 160
): Record<string, any> {
  const check = isSafeRepoPath(filePath);
  if (!check.safe) {
    return { error: check.reason };
  }
  if (!fs.existsSync(check.absPath)) {
    return { error: `File '${check.normalizedRel}' does not exist.` };
  }
  const raw = fs.readFileSync(check.absPath, 'utf8');
  const allLines = raw.split('\n');
  const safeStart = Math.max(1, Math.min(allLines.length, Math.floor(Number(startLine) || 1)));
  // Cap single read window to 220 lines to keep context crisp and fast
  const requestedEnd = Math.floor(Number(endLine) || safeStart + 150);
  const safeEnd = Math.max(safeStart, Math.min(allLines.length, Math.min(safeStart + 220, requestedEnd)));
  const numberedSnippet = allLines
    .slice(safeStart - 1, safeEnd)
    .map((line, idx) => `${safeStart + idx}: ${line}`)
    .join('\n');

  return {
    filePath: check.normalizedRel,
    totalLinesInFile: allLines.length,
    startLine: safeStart,
    endLine: safeEnd,
    contentWithLineNumbers: numberedSnippet,
  };
}

export function executeSearchRepositoryCode(query: string, directory?: string): Record<string, any> {
  const q = String(query || '').trim();
  if (!q || q.length < 2) {
    return { error: 'Search query must be at least 2 characters long.' };
  }
  const qLower = q.toLowerCase();
  const filesToSearch: string[] = [];

  if (directory && ALLOWED_TOP_LEVEL_DIRS.has(directory.trim().replace(/^\/+/, '').split('/')[0])) {
    const cleanDir = directory.trim().replace(/^\/+/, '');
    filesToSearch.push(
      ...walkDirRecursive(path.join(WORKSPACE_ROOT, cleanDir), cleanDir, 100).map((f) => f.path)
    );
  } else {
    filesToSearch.push('server.ts');
    for (const dir of ALLOWED_TOP_LEVEL_DIRS) {
      filesToSearch.push(...walkDirRecursive(path.join(WORKSPACE_ROOT, dir), dir, 100).map((f) => f.path));
    }
  }

  const matches: Array<{ filePath: string; lineNumber: number; lineText: string }> = [];
  for (const rel of filesToSearch) {
    if (matches.length >= 40) break;
    const abs = path.join(WORKSPACE_ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    try {
      const content = fs.readFileSync(abs, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(qLower)) {
          matches.push({
            filePath: rel,
            lineNumber: i + 1,
            lineText: lines[i].trim().slice(0, 220),
          });
          if (matches.length >= 40) break;
        }
      }
    } catch {
      // Ignore
    }
  }

  return {
    query: q,
    matchCount: matches.length,
    matches,
  };
}

export function executeGetLiveMarketAndEngineTelemetry(interval: string = '15m'): Record<string, any> {
  const wf = getLatestWaterfallSnapshot(interval) || getLatestWaterfallSnapshot('15m');
  const allWf = getAllCachedWaterfallSnapshots();
  const mtfState = getMultiTimeframeBootstrapState();
  const httpDiag = getProviderHttpDiagnostics().slice(0, 12);
  const sysLogs = getSystemWarningErrorLog().slice(0, 10);
  const icSnap = getIntelligenceCoreStateSnapshot();
  const persistenceHealth = getArchitecturePersistenceHealth();
  const sciCycle = getScientificDiscoveryCycleTelemetry();
  const osRegistry = loadOrInitializeGdfOsRegistry();
  const proofFreshness = evaluateProofReportFreshness(osRegistry.proofReports[0] || null);

  const candles = wf?.candles || [];
  const lastBar = candles.length > 0 ? candles[candles.length - 1] : null;
  const prevBar = candles.length > 1 ? candles[candles.length - 2] : null;

  return {
    timestampIso: new Date().toISOString(),
    marketWaterfall: {
      requestedInterval: interval,
      activeInterval: interval,
      systemState: wf?.systemState || 'UNINITIALIZED',
      activeProvider: wf?.activeProvider || 'NONE',
      activeSymbol: wf?.activeSymbol || 'PAXGUSDT',
      instrumentIdentity: wf?.instrumentIdentity || 'PAXG_SPOT_TOKEN',
      barsCount: candles.length,
      lastBar: lastBar
        ? {
            timeSec: lastBar.time,
            timeIso: new Date(lastBar.time * 1000).toISOString(),
            open: lastBar.open,
            high: lastBar.high,
            low: lastBar.low,
            close: lastBar.close,
            volume: lastBar.volume,
            oneBarChangeUsd: prevBar ? Number((lastBar.close - prevBar.close).toFixed(2)) : 0,
          }
        : null,
      secondaryBenchmark: wf?.secondaryBenchmark
        ? {
            provider: wf.secondaryBenchmark.provider,
            symbol: wf.secondaryBenchmark.symbol,
            crossVenueSpreadUsd: wf.secondaryBenchmark.crossVenueSpreadUsd,
            crossVenueZScore: wf.secondaryBenchmark.crossVenueZScore,
            isOutlierDislocation: wf.secondaryBenchmark.isOutlierDislocation,
          }
        : null,
      verifiedVenueCamerasCount: wf?.verifiedVenueCameras?.length || 0,
      cachedTimeframesSummary: Object.entries(allWf).map(([tf, snap]) => ({
        timeframe: tf,
        barsCount: snap?.candles?.length || 0,
        activeProvider: snap?.activeProvider || 'NONE',
        lastCloseUsd:
          snap?.candles && snap.candles.length > 0
            ? snap.candles[snap.candles.length - 1].close
            : null,
      })),
      mtfBootstrapState: {
        bootstrapInProgress: mtfState.bootstrapInProgress,
        verifiedTimeframes: mtfState.verifiedCachedTimeframes,
        missingTimeframes: mtfState.missingTimeframes,
      },
      recentProviderHttpDiagnostics: httpDiag,
      recentSystemWarningsAndErrors: sysLogs,
    },
    scientificCoreAndParallelUniverse: {
      generationCounter: icSnap.generationCounter,
      autoPromotionEnabled: icSnap.autoPromotionEnabled,
      persistedResidualCount: icSnap.persistedResidualCount,
      liveArchitecture: {
        architectureId: icSnap.liveArchitecture.architectureId,
        versionTag: icSnap.liveArchitecture.versionTag,
        activeModelsCount: icSnap.liveArchitecture.activeModelsCount,
        compositeNetDriftUsdPerStep: icSnap.liveArchitecture.compositeNetDriftUsdPerStep,
        compositeEquilibriumAnchor: icSnap.liveArchitecture.compositeEquilibriumAnchor,
        dynamicFusionWeights: icSnap.liveArchitecture.dynamicFusionWeights,
      },
      candidateArchitecture: {
        architectureId: icSnap.candidateArchitecture.architectureId,
        versionTag: icSnap.candidateArchitecture.versionTag,
        activeModelsCount: icSnap.candidateArchitecture.activeModelsCount,
        discoveredModelsCount: icSnap.candidateArchitecture.discoveredModelsCount,
        compositeNetDriftUsdPerStep: icSnap.candidateArchitecture.compositeNetDriftUsdPerStep,
        compositeEquilibriumAnchor: icSnap.candidateArchitecture.compositeEquilibriumAnchor,
        enabledSymbolicModels: icSnap.candidateArchitecture.models
          .filter((m) => m.origin === 'LEVEL_B_SYMBOLIC_DISCOVERY' && m.isEnabled)
          .map((m) => ({
            modelId: m.modelId,
            equationAscii: m.equationAscii,
            fittedCoefficient: m.fittedCoefficient,
            dynamicWeight: m.dynamicWeight,
            oosRSquared: m.oosRSquared,
            stabilityRatio: m.stabilityRatio,
          })),
      },
      verificationReport: icSnap.lastVerificationReport
        ? {
            overallStatus: icSnap.lastVerificationReport.overallStatus,
            passedGatesCount: icSnap.lastVerificationReport.passedGatesCount,
            totalGatesCount: icSnap.lastVerificationReport.totalGatesCount,
            realizedOosBarsEvaluated: icSnap.lastVerificationReport.realizedOosBarsEvaluated,
            dataDrivenMinWindowBars: icSnap.lastVerificationReport.dataDrivenMinWindowBars,
            liveRmseUsd: icSnap.lastVerificationReport.liveRmseUsd,
            candidateRmseUsd: icSnap.lastVerificationReport.candidateRmseUsd,
            liveRankIc: icSnap.lastVerificationReport.liveRankIc,
            candidateRankIc: icSnap.lastVerificationReport.candidateRankIc,
            dieboldMarianoTStat: icSnap.lastVerificationReport.dieboldMarianoTStat,
            gates: icSnap.lastVerificationReport.gates.map((g) => ({
              gateId: g.gateId,
              titleEn: g.titleEn,
              passed: g.passed,
              metricSummary: g.metricSummary,
            })),
          }
        : null,
      latentMathWriteBack: icSnap.latentMathWriteBack,
      marketAwarenessFindings: icSnap.lastFindings || [],
    },
    eightStepScientificDiscoveryCycle: {
      activeCaseState: sciCycle.activeCase?.currentState || 'IDLE',
      activeCaseId: sciCycle.activeCase?.caseId || null,
      cumulativeHypothesesTested: sciCycle.cumulativeCandidateSearchCount,
      graveyardRejectedCount: sciCycle.hypothesisGraveyard.length,
      activeHypothesis: sciCycle.activeCase?.inventRecord
        ? {
            hypothesisId: sciCycle.activeCase.inventRecord.hypothesisId,
            structuralFormId: sciCycle.activeCase.inventRecord.structuralFormId,
            equationAscii: sciCycle.activeCase.inventRecord.mathematicalFormAscii,
          }
        : null,
      latestDecision: sciCycle.activeCase?.decisionRecord
        ? {
            verdict: sciCycle.activeCase.decisionRecord.verdict,
            epistemicBadge: sciCycle.activeCase.decisionRecord.epistemicBadge,
            passedGatesCount: sciCycle.activeCase.decisionRecord.passedGatesCount,
            totalGatesCount: sciCycle.activeCase.decisionRecord.totalGatesCount,
            rationaleEn: sciCycle.activeCase.decisionRecord.rationaleEn,
          }
        : null,
    },
    gdfOperatingSystemAndCloudSql: {
      schemaVersion: osRegistry.schemaVersion,
      revision: osRegistry.revision,
      currentStage: osRegistry.currentStage,
      cloudSqlConfigured: isCloudSqlConfigured(),
      persistenceHealth: {
        statusLabel: persistenceHealth.statusLabel,
        storageMode: persistenceHealth.storageMode,
        isDurableAcrossRedeploys: persistenceHealth.isDurableAcrossRedeploys,
      },
      proofFreshness,
      latestProofSummary: osRegistry.proofReports[0]
        ? {
            proofId: osRegistry.proofReports[0].proofId,
            timestampIso: osRegistry.proofReports[0].timestampIso,
            overallStatus: osRegistry.proofReports[0].overallStatus,
            totalDurationMs: osRegistry.proofReports[0].totalDurationMs,
            checks: osRegistry.proofReports[0].checks.map((c) => ({
              checkId: c.checkId,
              status: c.status,
              durationMs: c.durationMs,
              evidence: c.evidence,
            })),
          }
        : null,
      playbooks: osRegistry.playbooks.map((p) => ({
        playbookId: p.playbookId,
        playbookName: p.playbookName,
        version: p.version,
        nextImprovement: p.nextImprovement,
      })),
      recentPromotionDecisions: osRegistry.promotionDecisionLog.slice(0, 5),
    },
  };
}

export interface ExpertPendingAnalysisTask {
  taskId: string;
  priority: 'P0' | 'P1' | 'P2';
  status: 'READY_TO_RUN' | 'ACTIVE_MONITORING' | 'AWAITING_OOS_BARS';
  titleEn: string;
  titleFa: string;
  promptToExecute: string;
}

export interface LiveExpertSpecialistRosterItem extends ExpertPersonaDescriptor {
  currentFocusEn: string;
  currentFocusFa: string;
  marketConfidencePct: number;
  confidenceStatusLabel: 'HIGH_CONVICTION' | 'MODERATE_CALIBRATING' | 'CAUTIOUS_GUARDED';
  confidenceRationaleEn: string;
  confidenceRationaleFa: string;
  pendingAnalysisTasks: ExpertPendingAnalysisTask[];
}

export function buildLiveExpertSpecialistRoster(
  interval: string = '15m',
  precomputedTelemetry?: Record<string, any>
): LiveExpertSpecialistRosterItem[] {
  const telemetry = precomputedTelemetry || executeGetLiveMarketAndEngineTelemetry(interval);
  const wf = telemetry.marketWaterfall || {};
  const sc = telemetry.scientificCoreAndParallelUniverse || {};
  const vr = sc.verificationReport || {};
  const sci = telemetry.eightStepScientificDiscoveryCycle || {};
  const os = telemetry.gdfOperatingSystemAndCloudSql || {};

  const lastClose = wf.lastBar?.close != null ? Number(wf.lastBar.close) : null;
  const priceStr = lastClose != null ? `$${lastClose.toFixed(2)}` : 'UNAVAILABLE';
  const oneBarDelta = Number(wf.lastBar?.oneBarChangeUsd || 0);
  const barsCount = Number(wf.barsCount || 0);
  const isLiveNominal = wf.systemState === 'LIVE_NOMINAL';
  const crossSpread = wf.secondaryBenchmark?.crossVenueSpreadUsd ?? null;
  const crossZ = wf.secondaryBenchmark?.crossVenueZScore ?? 0;

  const passedGates = Number(vr.passedGatesCount ?? 0);
  const totalGates = Number(vr.totalGatesCount ?? 8);
  const oosBars = Number(vr.realizedOosBarsEvaluated ?? 0);
  const minOosBars = Number(vr.dataDrivenMinWindowBars ?? 30);
  const dmStat = Number(vr.dieboldMarianoTStat ?? 0);
  const liveEqAnchor = Number(sc.liveArchitecture?.compositeEquilibriumAnchor ?? lastClose ?? 0);
  const liveDrift = Number(sc.liveArchitecture?.compositeNetDriftUsdPerStep ?? 0);

  const mtfVerifiedCount = Array.isArray(wf.mtfBootstrapState?.verifiedTimeframes)
    ? wf.mtfBootstrapState.verifiedTimeframes.length
    : 0;
  const recentErrorsCount = Array.isArray(wf.recentSystemWarningsAndErrors)
    ? wf.recentSystemWarningsAndErrors.filter((e: any) => e.level === 'ERROR').length
    : 0;

  const proofEffectiveStatus = String(os.proofFreshness?.effectiveStatus || 'CHECKING');
  const cloudSqlOnline = Boolean(os.cloudSqlConfigured);

  // Compute domain-specific confidence scores (bounded [35, 99])
  const clampConf = (val: number) => Math.max(35, Math.min(99, Math.round(val)));

  const finConf = clampConf(
    (isLiveNominal ? 55 : 35) +
      Math.min(25, (barsCount / 300) * 25) +
      (crossSpread !== null && Math.abs(crossZ) < 2.2 ? 14 : 6)
  );

  const mathConf = clampConf(
    42 +
      (passedGates / Math.max(1, totalGates)) * 34 +
      Math.min(18, (oosBars / Math.max(1, minOosBars)) * 18) +
      (dmStat > 0 ? 4 : 0)
  );

  const anchorGapPct =
    lastClose && liveEqAnchor > 0 ? Math.abs(lastClose - liveEqAnchor) / lastClose : 0.005;
  const physConf = clampConf(
    (isLiveNominal ? 52 : 38) +
      Math.max(0, 28 - anchorGapPct * 2500) +
      (Math.abs(oneBarDelta) < 18 ? 14 : 6)
  );

  const archConf = clampConf(
    54 +
      Math.min(28, (mtfVerifiedCount / 7) * 28) +
      (recentErrorsCount === 0 ? 14 : Math.max(0, 14 - recentErrorsCount * 4))
  );

  const sysConf = clampConf(
    (proofEffectiveStatus === 'PASS' ? 58 : proofEffectiveStatus === 'STALE' ? 44 : 36) +
      (cloudSqlOnline ? 24 : 10) +
      (Number(os.revision || 0) >= 1 ? 14 : 6)
  );

  const visConf = clampConf(
    58 + Math.min(26, (barsCount / 250) * 26) + (mtfVerifiedCount >= 3 ? 12 : 6)
  );

  const councilCompositeConf = clampConf(
    (finConf + mathConf + physConf + archConf + sysConf + visConf) / 6
  );

  const toStatusLabel = (
    score: number
  ): 'HIGH_CONVICTION' | 'MODERATE_CALIBRATING' | 'CAUTIOUS_GUARDED' => {
    if (score >= 82) return 'HIGH_CONVICTION';
    if (score >= 64) return 'MODERATE_CALIBRATING';
    return 'CAUTIOUS_GUARDED';
  };

  return EXPERT_COUNCIL_ROSTER.map((persona): LiveExpertSpecialistRosterItem => {
    switch (persona.id) {
      case 'FINANCIAL_STRATEGIST':
        return {
          ...persona,
          currentFocusEn: `Monitoring ${wf.activeSymbol || 'PAXG/USDT'} (${priceStr}, Δ=$${oneBarDelta.toFixed(2)}) on ${wf.activeProvider || 'Primary Feed'} vs. Equilibrium Anchor ($${liveEqAnchor.toFixed(2)}) & Cross-Venue Basis (${crossSpread !== null ? `$${crossSpread} [Z=${crossZ}]` : 'Single-Venue'}).`,
          currentFocusFa: `پایش قیمت زنده ${wf.activeSymbol || 'PAXG/USDT'} (${priceStr}) در برابر لنگر تعادلی ($${liveEqAnchor.toFixed(2)}) و اسپرد بین‌بازاری اسپات/کامکس.`,
          marketConfidencePct: finConf,
          confidenceStatusLabel: toStatusLabel(finConf),
          confidenceRationaleEn: `Feed=${wf.systemState || 'INIT'} (${barsCount} bars) · Basis Z=${crossZ} · Step Drift=$${liveDrift.toFixed(3)}/bar`,
          confidenceRationaleFa: `وضعیت فید=${wf.systemState || 'INIT'} (${barsCount} کندل) · امتیاز Z پایه=${crossZ}`,
          pendingAnalysisTasks: [
            {
              taskId: 'FIN-TASK-01',
              priority: 'P0',
              status: 'READY_TO_RUN',
              titleEn: `Audit ${interval} PAXG/COMEX Cross-Venue Basis & 3-Factor Macro Gravity (TIPS/DXY)`,
              titleFa: `بررسی اسپرد بین‌بازاری طلا/کامکس و نیروهای کلان ۳عاملی در تایم‌فریم ${interval}`,
              promptToExecute: `As the Financial Strategist, analyze current ${interval} Gold/PAXG price (${priceStr}), cross-venue basis spread, 3-factor macro gravity (TIPS real yield & DXY), and HTF POC liquidity attractors.`,
            },
            {
              taskId: 'FIN-TASK-02',
              priority: 'P1',
              status: 'ACTIVE_MONITORING',
              titleEn: `Evaluate VPIN Order-Flow Toxicity & Session Liquidity Regime`,
              titleFa: `ارزیابی سمیت جریان سفارشات (VPIN) و رژیم نقدینگی نشست معاملاتی`,
              promptToExecute: `Evaluate the current VPIN order-flow toxicity, Kyle's lambda, and LBMA/COMEX/Asian session regime risk for Gold/PAXG.`,
            },
          ],
        };

      case 'MATHEMATICIAN':
        return {
          ...persona,
          currentFocusEn: `Auditing 6D Volume-Clock Kalman Filter & Challenger ${sc.candidateArchitecture?.versionTag || 'v2.0'} (${passedGates}/${totalGates} OOS Gates passed, DM t-stat=${dmStat.toFixed(2)}, OOS Window=${oosBars}/${minOosBars} bars).`,
          currentFocusFa: `ممیزی فیلتر کالمن ۶بعدی ساعت حجمی و معماری رقیب ${sc.candidateArchitecture?.versionTag || 'v2.0'} (${passedGates}/${totalGates} گیت OOS پاس شده).`,
          marketConfidencePct: mathConf,
          confidenceStatusLabel: toStatusLabel(mathConf),
          confidenceRationaleEn: `8-Gate Score=${passedGates}/${totalGates} (${vr.overallStatus || 'CALIBRATING'}) · OOS Sample=${oosBars}/${minOosBars} bars · DM t=${dmStat.toFixed(2)}`,
          confidenceRationaleFa: `امتیاز گیت=${passedGates}/${totalGates} · نمونه خارج از دید=${oosBars}/${minOosBars} کندل`,
          pendingAnalysisTasks: [
            {
              taskId: 'MATH-TASK-01',
              priority: 'P0',
              status: oosBars >= minOosBars ? 'READY_TO_RUN' : 'AWAITING_OOS_BARS',
              titleEn: `Inspect 8-Gate OOS Verifier & Diebold-Mariano Statistical Significance`,
              titleFa: `بازرسی ۸ گیت تایید خارج از نمونه و معناداری آماری دیبولد-ماریانو`,
              promptToExecute: `As the Chief Applied Mathematician, inspect the 6D Kalman & Parallel Candidate symbolic equations and explain why the 8-Gate verification scorecard is at ${passedGates}/${totalGates} gates.`,
            },
            {
              taskId: 'MATH-TASK-02',
              priority: 'P1',
              status: 'READY_TO_RUN',
              titleEn: `Audit SINDy Ridge Symbolic Terms & Covariance PSD Invariants in scientificCore.ts`,
              titleFa: `ممیزی معادلات نمادین SINDy Ridge و پایداری ماتریس کوواریانس در scientificCore.ts`,
              promptToExecute: `Inspect src/engine/scientificCore.ts and audit the 6D state transition Jacobian, covariance PSD guarantees, and active SINDy symbolic regression terms.`,
            },
          ],
        };

      case 'PHYSICIST':
        return {
          ...persona,
          currentFocusEn: `Tracking Langevin potential-well restoring force toward Equilibrium Anchor ($${liveEqAnchor.toFixed(2)}) and Pulse-Echo hydrodynamic shock damping across ${interval} order flow.`,
          currentFocusFa: `ردیابی نیروی بازگرداننده چاه پتانسیل لانژون به سمت لنگر تعادلی ($${liveEqAnchor.toFixed(2)}) و میرایی موج شوک.`,
          marketConfidencePct: physConf,
          confidenceStatusLabel: toStatusLabel(physConf),
          confidenceRationaleEn: `Anchor Displacement=${(anchorGapPct * 100).toFixed(2)}% · Net Drift=$${liveDrift.toFixed(3)}/step · 8-Step State=${sci.activeCaseState || 'IDLE'}`,
          confidenceRationaleFa: `فاصله از چاه پتانسیل=${(anchorGapPct * 100).toFixed(2)}% · دریفت خالص=$${liveDrift.toFixed(3)}`,
          pendingAnalysisTasks: [
            {
              taskId: 'PHYS-TASK-01',
              priority: 'P0',
              status: 'READY_TO_RUN',
              titleEn: `Analyze Langevin Potential Well Stability & Order-Book Hydrodynamic Viscosity`,
              titleFa: `تحلیل پایداری چاه پتانسیل لانژون و ویسکوزیته هیدرودینامیک دفتر سفارشات`,
              promptToExecute: `As the Lead Econophysicist, analyze the order-book hydrodynamic flow, Langevin potential well stability around $${liveEqAnchor.toFixed(2)}, and shock-damping resilience.`,
            },
            {
              taskId: 'PHYS-TASK-02',
              priority: 'P1',
              status: 'ACTIVE_MONITORING',
              titleEn: `Diagnose Phase-Transition & Critical Slowing Down Risk Across Regimes`,
              titleFa: `تشخیص ریسک گذار فاز و کندشدن بحرانی پیش از شکست ساختاری رژیم`,
              promptToExecute: `Evaluate whether current volatility and volume-clock Δτ indicate laminar trend continuity or an approaching phase transition / liquidation cascade.`,
            },
          ],
        };

      case 'SOFTWARE_ARCHITECT':
        return {
          ...persona,
          currentFocusEn: `Inspecting provider waterfall latency (${mtfVerifiedCount}/7 MTF timeframes cached), singleflight/timeout paths in realDataWaterfall.ts, and Cloud SQL (us-east1) connection pool.`,
          currentFocusFa: `بررسی تاخیر آبشار تامین‌کنندگان داده (${mtfVerifiedCount}/7 تایم‌فریم کش‌شده) و وضعیت استخر اتصال Cloud SQL.`,
          marketConfidencePct: archConf,
          confidenceStatusLabel: toStatusLabel(archConf),
          confidenceRationaleEn: `MTF Cache=${mtfVerifiedCount}/7 verified · Recent System Errors=${recentErrorsCount} · Cloud SQL=${cloudSqlOnline ? 'ONLINE' : 'LOCAL'}`,
          confidenceRationaleFa: `کش چندتایم‌فریمی=${mtfVerifiedCount}/7 · خطاهای اخیر سیستم=${recentErrorsCount}`,
          pendingAnalysisTasks: [
            {
              taskId: 'ARCH-TASK-01',
              priority: 'P0',
              status: 'READY_TO_RUN',
              titleEn: `Profile Provider Waterfall HTTP Latency & Timeout Paths in realDataWaterfall.ts`,
              titleFa: `پروفایلینگ تاخیر HTTP تامین‌کنندگان داده و مسیرهای Timeout در realDataWaterfall.ts`,
              promptToExecute: `As the Principal Software Architect, inspect src/services/realDataWaterfall.ts and recent provider HTTP diagnostics to analyze latency, timeouts, and failover health.`,
            },
            {
              taskId: 'ARCH-TASK-02',
              priority: 'P1',
              status: 'READY_TO_RUN',
              titleEn: `Audit Cloud SQL (us-east1) Drizzle Repository & Serialized Sync Queue`,
              titleFa: `ممیزی لایه ذخیره‌سازی Cloud SQL و صف همگام‌سازی سریال در gdfRepository.ts`,
              promptToExecute: `Inspect src/db/gdfRepository.ts and src/db/index.ts to verify Cloud SQL pool keep-alive settings and serialized registry transaction safety.`,
            },
          ],
        };

      case 'SYSTEMS_ENGINEER':
        return {
          ...persona,
          currentFocusEn: `Enforcing Dual-Control Promotion Gate (Rule 8), Step 4 Executable Proof (${proofEffectiveStatus}), and Playbooks PB-001..006 at Registry Rev #${os.revision ?? 1}.`,
          currentFocusFa: `اعمال گیت کنترل دوگانه ارتقا (قانون ۸)، وضعیت اثبات گام ۴ (${proofEffectiveStatus}) و بازبینی رجیستری #${os.revision ?? 1}.`,
          marketConfidencePct: sysConf,
          confidenceStatusLabel: toStatusLabel(sysConf),
          confidenceRationaleEn: `Step 4 Proof=${proofEffectiveStatus} (${os.latestProofSummary?.proofId || 'NONE'}) · Registry Rev=#${os.revision ?? 1} · Cloud SQL=${cloudSqlOnline ? 'SYNCED' : 'LOCAL'}`,
          confidenceRationaleFa: `وضعیت اثبات گام ۴=${proofEffectiveStatus} · بازبینی رجیستری=#${os.revision ?? 1}`,
          pendingAnalysisTasks: [
            {
              taskId: 'SYS-TASK-01',
              priority: 'P0',
              status: 'READY_TO_RUN',
              titleEn: `Verify Step 4 Proof Freshness & Dual-Control Promotion Gate Readiness`,
              titleFa: `بررسی تازگی گواهی اثبات گام ۴ و آمادگی گیت کنترل دوگانه ارتقا`,
              promptToExecute: `As the Systems & Governance Engineer, audit the current GDF Operating System state, Step 4 Proof freshness (${proofEffectiveStatus}), Playbooks PB-001..006, and Dual-Control Promotion Gate readiness.`,
            },
            {
              taskId: 'SYS-TASK-02',
              priority: 'P1',
              status: 'ACTIVE_MONITORING',
              titleEn: `Review 8-Step Scientific Discovery Cycle & Hypothesis Graveyard (${sci.graveyardRejectedCount ?? 0} rejected)`,
              titleFa: `بازبینی چرخه ۸مرحله‌ای کشف علمی و بایگانی فرضیه‌های ردشده (${sci.graveyardRejectedCount ?? 0} مورد)`,
              promptToExecute: `Inspect the 8-Step Scientific Discovery Cycle telemetry and explain the current state (${sci.activeCaseState || 'IDLE'}) and hypothesis governance rules.`,
            },
          ],
        };

      case 'VISUAL_DESIGNER':
        return {
          ...persona,
          currentFocusEn: `Maintaining 2D quantile plume clarity, 3D WebGL liquidity surface (P×T×D), and non-blocking floating Council HUD ergonomics across EN/FA viewports.`,
          currentFocusFa: `حفظ وضوح بادبزن عدم قطعیت ۲بعدی، سطح نقدینگی ۳بعدی WebGL و ارگونومی شناور کنسول دوزبانه.`,
          marketConfidencePct: visConf,
          confidenceStatusLabel: toStatusLabel(visConf),
          confidenceRationaleEn: `2D/3D Render Depth=${barsCount} bars · Floating HUD=ACTIVE · Bilingual LTR/RTL=SYNCED`,
          confidenceRationaleFa: `عمق رندر ۲بعدی/۳بعدی=${barsCount} کندل · وضعیت ویجت شناور=فعال`,
          pendingAnalysisTasks: [
            {
              taskId: 'VIS-TASK-01',
              priority: 'P1',
              status: 'READY_TO_RUN',
              titleEn: `Audit 2D Uncertainty Plume & 3D WebGL Surface Visual Signal-to-Noise Ratio`,
              titleFa: `ممیزی نسبت سیگنال به نویز بصری در نمودار ۲بعدی و سطح نقدینگی ۳بعدی WebGL`,
              promptToExecute: `As the Lead Visual & 3D Designer, evaluate the 2D uncertainty plume canvas, 3D WebGL liquidity surface, and bilingual EN/FA HUD ergonomics in index.html.`,
            },
          ],
        };

      case 'COUNCIL_ALL':
      default:
        return {
          ...persona,
          currentFocusEn: `Synthesizing all 6 specialists across ${interval} PAXG/Gold (${priceStr}), 6D Kalman & Parallel Universe (${passedGates}/${totalGates} Gates), Step 4 Proof (${proofEffectiveStatus}), and Cloud SQL (us-east1).`,
          currentFocusFa: `همگام‌سازی هر ۶ متخصص پروژه روی قیمت زنده طلا/PAXG (${priceStr})، هسته علمی ۶بعدی (${passedGates}/${totalGates} گیت) و وضعیت اثبات (${proofEffectiveStatus}).`,
          marketConfidencePct: councilCompositeConf,
          confidenceStatusLabel: toStatusLabel(councilCompositeConf),
          confidenceRationaleEn: `Composite Council Score=${councilCompositeConf}% across Finance (${finConf}%), Math (${mathConf}%), Physics (${physConf}%), Code (${archConf}%), Systems (${sysConf}%), UX (${visConf}%)`,
          confidenceRationaleFa: `امتیاز ترکیبی شورا=${councilCompositeConf}% از میانگین وزنی ۶ متخصص حوزه`,
          pendingAnalysisTasks: [
            {
              taskId: 'COUNCIL-TASK-01',
              priority: 'P0',
              status: 'READY_TO_RUN',
              titleEn: `Run Full 6-Specialist Multi-Disciplinary Executive Briefing (${interval})`,
              titleFa: `اجرای گزارش جامع ۶ متخصص شورا برای وضعیت لحظه‌ای بازار و سیستم (${interval})`,
              promptToExecute: `Convene all 6 specialists of the GDF Council and provide a comprehensive executive briefing on current ${interval} Gold/PAXG market action, 6D Scientific Core & 8-Gate verification, hydrodynamic stability, waterfall performance, and GDF OS / Cloud SQL governance.`,
            },
            {
              taskId: 'COUNCIL-TASK-02',
              priority: 'P1',
              status: 'READY_TO_RUN',
              titleEn: `Cross-Audit Live Yellow Line (${sc.liveArchitecture?.versionTag || 'v1.0'}) vs. Parallel Candidate (${sc.candidateArchitecture?.versionTag || 'v2.0'}) Promotion Readiness`,
              titleFa: `ممیزی متقابل خط زرد زنده (${sc.liveArchitecture?.versionTag || 'v1.0'}) در برابر کاندیدای موازی (${sc.candidateArchitecture?.versionTag || 'v2.0'})`,
              promptToExecute: `Synthesize a multi-disciplinary evaluation comparing the Live Yellow Line (${sc.liveArchitecture?.versionTag || 'v1.0'}) against the Parallel Challenger (${sc.candidateArchitecture?.versionTag || 'v2.0'}) and state whether promotion is scientifically justified.`,
            },
          ],
        };
    }
  });
}

export function executeLookupFinancialDictionary(searchTerm?: string): Record<string, any> {
  const q = String(searchTerm || '').trim().toLowerCase();
  const entries = Object.values(FINANCIAL_TERMINOLOGY_DICTIONARY);
  const filtered = q
    ? entries.filter(
        (e: any) =>
          String(e.conceptId || '').toLowerCase().includes(q) ||
          String(e.termEn || '').toLowerCase().includes(q) ||
          String(e.termFa || '').toLowerCase().includes(q) ||
          String(e.definitionEn || '').toLowerCase().includes(q)
      )
    : entries.slice(0, 15);
  return {
    matchCount: filtered.length,
    concepts: filtered.slice(0, 15),
  };
}

const COUNCIL_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_live_market_and_engine_telemetry',
    description:
      'Retrieves real-time GDF market waterfall telemetry (PAXG spot & COMEX GC=F futures, multi-timeframe bars, provider HTTP latency/error diagnostics), 6D Scientific Core & Parallel Universe state (Live vs Candidate RMSE, Rank IC, Diebold-Mariano t-stat, 8-Gate verification scorecard, enabled symbolic equations, latent write-back parameters), 8-Step Scientific Discovery Cycle telemetry, and GDF Operating System / Cloud SQL proof & governance state.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        interval: {
          type: Type.STRING,
          description: 'Market timeframe to inspect (e.g., "5m", "15m", "1h", "4h", "1d"). Defaults to "15m".',
        },
      },
    },
  },
  {
    name: 'list_repository_files',
    description:
      'Lists files in the GDF repository across allowed directories (src, playbooks, toolbox, scripts) and root configuration files (server.ts, index.html, package.json, tsconfig.json).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        directory: {
          type: Type.STRING,
          description: 'Optional directory path such as "src", "src/services", "src/engine", "src/db", "playbooks", "toolbox", "scripts", or "all".',
        },
      },
    },
  },
  {
    name: 'read_repository_file',
    description:
      'Reads source code or markdown lines from a file in the GDF repository with 1-indexed line numbers.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: {
          type: Type.STRING,
          description: 'Relative path to the file in the repository (e.g., "src/services/realDataWaterfall.ts", "src/engine/scientificCore.ts", "server.ts", "playbooks/PB-001.md").',
        },
        startLine: {
          type: Type.INTEGER,
          description: '1-indexed starting line number (default 1).',
        },
        endLine: {
          type: Type.INTEGER,
          description: '1-indexed ending line number (default 160, max 220 lines per call).',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'search_repository_code',
    description:
      'Searches for a function name, symbol, mathematical variable, or text substring across the GDF repository and returns matching file paths, line numbers, and code snippets.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Substring or symbol to search for (e.g., "fetchWithTimeout", "evaluateDualControlPromotionGate", "VPIN", "evaluateScientificCorePipeline").',
        },
        directory: {
          type: Type.STRING,
          description: 'Optional directory to restrict the search (e.g., "src/services", "src/engine", "playbooks").',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_financial_dictionary',
    description:
      'Looks up canonical bilingual (English & Persian/Farsi) quantitative finance, econophysics, and microstructure definitions and formulas from the GDF Financial Terminology Dictionary.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchTerm: {
          type: Type.STRING,
          description: 'Concept keyword to search (e.g., "VPIN", "Kalman", "Cointegration", "Diebold", "POC").',
        },
      },
    },
  },
];

function dispatchCouncilToolCall(
  name: string,
  args: Record<string, any>,
  defaultInterval: string
): { output: Record<string, any>; summary: string } {
  switch (name) {
    case 'get_live_market_and_engine_telemetry': {
      const tf = typeof args?.interval === 'string' && args.interval.trim() ? args.interval.trim() : defaultInterval;
      const out = executeGetLiveMarketAndEngineTelemetry(tf);
      const closeStr = out.marketWaterfall?.lastBar?.close ? `$${out.marketWaterfall.lastBar.close}` : 'N/A';
      return {
        output: out,
        summary: `Inspected live telemetry (${tf}: state=${out.marketWaterfall?.systemState}, close=${closeStr}, gates=${out.scientificCoreAndParallelUniverse?.verificationReport?.passedGatesCount ?? 0}/8, proof=${out.gdfOperatingSystemAndCloudSql?.proofFreshness?.effectiveStatus})`,
      };
    }
    case 'list_repository_files': {
      const dir = typeof args?.directory === 'string' ? args.directory : 'all';
      const out = executeListRepositoryFiles(dir);
      return {
        output: out,
        summary: `Listed repository files in '${dir}' (${out.totalFiles ?? 0} files)`,
      };
    }
    case 'read_repository_file': {
      const fp = String(args?.filePath || '');
      const sLine = Number(args?.startLine) || 1;
      const eLine = Number(args?.endLine) || sLine + 150;
      const out = executeReadRepositoryFile(fp, sLine, eLine);
      return {
        output: out,
        summary: out.error
          ? `Read blocked/failed on '${fp}': ${out.error}`
          : `Read ${out.filePath} (lines ${out.startLine}–${out.endLine} of ${out.totalLinesInFile})`,
      };
    }
    case 'search_repository_code': {
      const q = String(args?.query || '');
      const dir = typeof args?.directory === 'string' ? args.directory : undefined;
      const out = executeSearchRepositoryCode(q, dir);
      return {
        output: out,
        summary: `Searched repo for '${q}' (${out.matchCount ?? 0} matches)`,
      };
    }
    case 'lookup_financial_dictionary': {
      const q = typeof args?.searchTerm === 'string' ? args.searchTerm : '';
      const out = executeLookupFinancialDictionary(q);
      return {
        output: out,
        summary: `Looked up GDF Financial Dictionary for '${q || 'all'}' (${out.matchCount ?? 0} concepts)`,
      };
    }
    default:
      return {
        output: { error: `Unknown tool: ${name}` },
        summary: `Unknown tool call: ${name}`,
      };
  }
}

function buildDeterministicTelemetryFallbackMarkdown(
  expert: ExpertPersonaDescriptor,
  question: string,
  telemetry: Record<string, any>,
  toolsInvoked: ExpertToolInvocationRecord[],
  lang: 'en' | 'fa',
  _errReason?: string
): string {
  const wf = telemetry.marketWaterfall || {};
  const sc = telemetry.scientificCoreAndParallelUniverse || {};
  const vr = sc.verificationReport || {};
  const os = telemetry.gdfOperatingSystemAndCloudSql || {};
  const sci = telemetry.eightStepScientificDiscoveryCycle || {};
  const closeStr = wf.lastBar ? `$${wf.lastBar.close.toFixed(2)}` : 'UNAVAILABLE';
  const oneBarDelta = wf.lastBar?.oneBarChangeUsd ?? 0;
  const spreadStr = wf.secondaryBenchmark
    ? `$${wf.secondaryBenchmark.crossVenueSpreadUsd} (Z=${wf.secondaryBenchmark.crossVenueZScore})`
    : 'N/A (Single Venue)';

  if (lang === 'fa') {
    return [
      `### ${expert.badgeLabel} ${expert.titleFa}`,
      `- **📈 استراتژی بازار و نقدینگی (${wf.activeInterval || '15m'})**: وضعیت فید=\`${wf.systemState}\` | منبع=\`${wf.activeProvider}\` | قیمت فعلی طلا/PAXG=\`${closeStr}\` (تغییر کندل اخیر: \`$${oneBarDelta}\`) | اختلاف بین‌بازاری اسپات/کامکس=\`${spreadStr}\` | تعداد کندل تاییدشده=\`${wf.barsCount}\``,
      `- **🧮 ریاضیات تصادفی و هسته علمی ۶ بعدی**: معماری زنده=\`${sc.liveArchitecture?.versionTag}\` (لنگر تعادلی=\`$${Number(sc.liveArchitecture?.compositeEquilibriumAnchor || 0).toFixed(2)}\`، دریفت خالص=\`$${Number(sc.liveArchitecture?.compositeNetDriftUsdPerStep || 0).toFixed(3)}/step\`) در برابر کاندیدای موازی=\`${sc.candidateArchitecture?.versionTag}\` (\`${vr.passedGatesCount ?? 0}/${vr.totalGatesCount ?? 8}\` گیت تایید شده، وضعیت=\`${vr.overallStatus || 'CALIBRATING'}\`، آماره Diebold-Mariano=\`${Number(vr.dieboldMarianoTStat || 0).toFixed(3)}\`)`,
      `- **⚛️ اکونوفیزیک و چرخه اکتشاف ۸ مرحله‌ای**: وضعیت ماشین حالت=\`${sci.activeCaseState || 'IDLE'}\` | فرضیه‌های آزمایش‌شده=\`${sci.cumulativeHypothesesTested ?? 0}\` | بایگانی فرضیه‌های ردشده=\`${sci.graveyardRejectedCount ?? 0}\``,
      `- **🛡️ مهندسی سیستم، اثبات اجرایی و Cloud SQL**: وضعیت نشان اثبات (Proof Badge)=\`${os.proofFreshness?.effectiveStatus}\` (\`${os.latestProofSummary?.proofId || 'NONE'}\`) | بازبینی رجیستری=\`#${os.revision}\` | پایگاه داده پایدار Cloud SQL (\`us-east1\`)=\`${os.cloudSqlConfigured ? 'متصل و فعال' : 'غیرفعال'}\``,
      toolsInvoked.length > 0
        ? `- **🔍 ابزارها و فایل‌های بررسی‌شده در مخزن**: ${toolsInvoked.map((t) => `\`${t.summary}\``).join(' ، ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const qLower = String(question || '').toLowerCase();
  const asksReliability = /reliab|accura|predict|trust|valid|hit rate|scorecard|gate/i.test(qLower);
  const asksMacroOrElection = /election|midterm|dem|rep|fiscal|surge|shock|macro|yield|tips|tariff|deficit|news|geopolit/i.test(qLower);

  const specialistSections: string[] = [
    `### ${expert.badgeLabel} ${expert.titleEn} — Live Telemetry & Repository Synthesis`,
  ];

  if (asksReliability) {
    specialistSections.push(
      `#### 🎯 How Reliable GDF Is Right Now in Predicting Gold (${wf.activeInterval || '15m'})`,
      `- **8-Gate Causal Out-of-Sample (OOS) Verification**: Currently passing \`${vr.passedGatesCount ?? 0}/${vr.totalGatesCount ?? 8}\` statistical gates (\`${vr.overallStatus || 'CALIBRATING'}\`) across \`${vr.realizedOosBarsEvaluated ?? 0}/${vr.dataDrivenMinWindowBars ?? 30}\` realized OOS bars (Live OOS RMSE=\`$${Number(vr.liveRmseUsd || 0).toFixed(3)}\`, Rank IC=\`${Number(vr.liveRankIc || 0).toFixed(3)}\`, Diebold-Mariano t-stat=\`${Number(vr.dieboldMarianoTStat || 0).toFixed(3)}\`).`,
      `- **Why GDF Avoids Overfitting**: Every forecast combines the **6D Volume-Clock Extended Kalman Filter** (\`[p, v, a, b, m, r]\`), **Student-t (\nu=4) fat-tailed uncertainty plumes**, and an **Adaptive Circuit Breaker** that freezes filter mutation if live feeds degrade.`
    );
  }

  if (asksMacroOrElection) {
    specialistSections.push(
      `#### 🏛️ How GDF Models Election / Midterm & Fiscal-Deficit Gold Price Surges`,
      `- **1. 3-Factor Orthogonal Macro Gravity (\`m_t\` state in \`quantEngine.ts\`)**: Political and fiscal shifts (such as U.S. Midterm outcomes altering deficit spending, Treasury issuance, and inflation expectations) immediately reprice **10Y TIPS Real Yields** and **DXY liquidity**. GDF's Gram-Schmidt orthogonalized macro factor engine converts real-yield compression into an upward drift force toward the upper equilibrium anchor (\`$${Number(sc.liveArchitecture?.compositeEquilibriumAnchor || 0).toFixed(2)}\`).`,
      `- **2. Bayesian Online Changepoint Detection (\`BOCPD\`) & VPIN Toxicity**: Rather than guessing political polls, GDF detects the exact moment institutional order flow reprices a fiscal/election shock via **BOCPD hazard jumps (\`\\lambda_{jump}\`)** and **VPIN order-flow imbalance**, automatically shifting the 5-state Dirichlet regime posterior into **Breakout / High-Volatility Expansion**.`,
      `- **3. Langevin Double-Well Breakout & Pulse-Echo Sonar**: When fiscal/election buying injects kinetic energy exceeding the local potential well barrier around \`${closeStr}\`, the Overdamped Langevin SDE projects rapid migration toward the upper **HTF Point-of-Control (POC) liquidity magnet**.`
    );
  }

  if (expert.id === 'COUNCIL_ALL' || expert.id === 'FINANCIAL_STRATEGIST') {
    specialistSections.push(
      `#### 📈 Quantitative Market & Cross-Venue Microstructure (${wf.activeInterval || '15m'})`,
      `- **Primary Feed**: \`${wf.activeProvider}\` (\`${wf.activeSymbol}\`) | **System State**: \`${wf.systemState}\` | **Last Close**: \`${closeStr}\` (\`Δ = $${oneBarDelta}\`) across \`${wf.barsCount}\` verified bars.`,
      `- **PAXG/COMEX Basis & Equilibrium**: Cross-venue spread is \`${spreadStr}\` against composite equilibrium anchor \`$${Number(sc.liveArchitecture?.compositeEquilibriumAnchor || 0).toFixed(2)}\` with net step drift \`$${Number(sc.liveArchitecture?.compositeNetDriftUsdPerStep || 0).toFixed(3)}/step\`.`
    );
  }

  if (expert.id === 'COUNCIL_ALL' || expert.id === 'MATHEMATICIAN' || expert.id === 'PHYSICIST') {
    specialistSections.push(
      `#### 🧮⚛️ 6D Stochastic Core, Econophysics & 8-Step Discovery Cycle`,
      `- **Live vs. Challenger Architecture**: Incumbent Yellow Line \`${sc.liveArchitecture?.versionTag}\` (OOS RMSE=\`$${Number(vr.liveRmseUsd || 0).toFixed(3)}\`, Rank IC=\`${Number(vr.liveRankIc || 0).toFixed(3)}\`) vs. Parallel Challenger \`${sc.candidateArchitecture?.versionTag}\` (OOS RMSE=\`$${Number(vr.candidateRmseUsd || 0).toFixed(3)}\`, Rank IC=\`${Number(vr.candidateRankIc || 0).toFixed(3)}\`, DM t-stat=\`${Number(vr.dieboldMarianoTStat || 0).toFixed(3)}\`).`,
      `- **8-Gate OOS Verifier & Epistemic Honesty**: \`${vr.passedGatesCount ?? 0}/${vr.totalGatesCount ?? 8}\` gates passed (\`${vr.overallStatus || 'CALIBRATING'}\`, evaluated on \`${vr.realizedOosBarsEvaluated ?? 0}/${vr.dataDrivenMinWindowBars ?? 30}\` realized OOS bars).`,
      `- **8-Step Discovery Engine**: State=\`${sci.activeCaseState || 'IDLE'}\` | Cumulative Hypotheses Tested=\`${sci.cumulativeHypothesesTested ?? 0}\` | Graveyard Rejections=\`${sci.graveyardRejectedCount ?? 0}\`.`
    );
  }

  if (
    expert.id === 'COUNCIL_ALL' ||
    expert.id === 'SOFTWARE_ARCHITECT' ||
    expert.id === 'SYSTEMS_ENGINEER' ||
    expert.id === 'VISUAL_DESIGNER'
  ) {
    specialistSections.push(
      `#### 💻🛡️🎨 Systems Governance, Repository Architecture & Cloud SQL Persistence`,
      `- **Dual-Control Promotion & Proof Runner**: Proof Badge=\`${os.proofFreshness?.effectiveStatus}\` (\`${os.latestProofSummary?.proofId || 'NONE'}\`, duration=\`${os.latestProofSummary?.totalDurationMs ?? 0}ms\`) | Registry Revision=\`#${os.revision}\` | Stage=\`${os.currentStage}\`.`,
      `- **Durable Storage**: Cloud SQL PostgreSQL (\`us-east1\`)=\`${os.cloudSqlConfigured ? 'ONLINE & SYNCED' : 'LOCAL_ONLY'}\` | Local Atomic Store=\`${os.persistenceHealth?.statusLabel || 'PERSISTENT'}\`.`
    );
  }

  if (toolsInvoked.length > 0) {
    specialistSections.push(
      `#### 🔍 Repository & Telemetry Evidence Inspected`,
      `- ${toolsInvoked.map((t) => `\`${t.summary}\``).join(' • ')}`
    );
  }

  return specialistSections.filter(Boolean).join('\n');
}

export async function runExpertCouncilConsultation(params: {
  message: string;
  expertId?: ExpertPersonaId;
  interval?: string;
  language?: 'en' | 'fa';
  history?: ExpertCouncilChatTurn[];
}): Promise<ExpertCouncilResponse> {
  const nowIso = new Date().toISOString();
  const expertId: ExpertPersonaId =
    EXPERT_COUNCIL_ROSTER.find((e) => e.id === params.expertId)?.id || 'COUNCIL_ALL';
  const expert = EXPERT_COUNCIL_ROSTER.find((e) => e.id === expertId) || EXPERT_COUNCIL_ROSTER[0];
  const interval = (params.interval || '15m').trim();
  const lang: 'en' | 'fa' = params.language === 'fa' ? 'fa' : 'en';
  const userMessage = String(params.message || '').trim();

  const toolsInvoked: ExpertToolInvocationRecord[] = [];
  // Always capture a baseline live telemetry digest so every council response is grounded in real-time state
  const liveTelemetry = executeGetLiveMarketAndEngineTelemetry(interval);
  toolsInvoked.push({
    toolName: 'get_live_market_and_engine_telemetry',
    args: { interval },
    summary: `Live Telemetry Snapshot (${interval}: state=${liveTelemetry.marketWaterfall?.systemState}, proof=${liveTelemetry.gdfOperatingSystemAndCloudSql?.proofFreshness?.effectiveStatus})`,
  });

  const digest = {
    activeInterval: liveTelemetry.marketWaterfall?.activeInterval || interval,
    systemState: liveTelemetry.marketWaterfall?.systemState || 'UNINITIALIZED',
    activeProvider: liveTelemetry.marketWaterfall?.activeProvider || 'NONE',
    lastCloseUsd: liveTelemetry.marketWaterfall?.lastBar?.close ?? null,
    liveArchitectureVersion:
      liveTelemetry.scientificCoreAndParallelUniverse?.liveArchitecture?.versionTag || 'v1.0',
    candidateArchitectureVersion:
      liveTelemetry.scientificCoreAndParallelUniverse?.candidateArchitecture?.versionTag || 'v2.0',
    passedGatesCount:
      liveTelemetry.scientificCoreAndParallelUniverse?.verificationReport?.passedGatesCount ?? 0,
    totalGatesCount:
      liveTelemetry.scientificCoreAndParallelUniverse?.verificationReport?.totalGatesCount ?? 8,
    proofStatus:
      liveTelemetry.gdfOperatingSystemAndCloudSql?.proofFreshness?.effectiveStatus || 'CHECKING',
    cloudSqlActive: Boolean(liveTelemetry.gdfOperatingSystemAndCloudSql?.cloudSqlConfigured),
  };

  // Pre-search repository if the user mentions a specific file or code symbol
  const fileMatch = userMessage.match(/([a-zA-Z0-9_/-]+\.(?:ts|html|md|json))/);
  if (fileMatch) {
    const readRes = executeReadRepositoryFile(fileMatch[1], 1, 140);
    toolsInvoked.push({
      toolName: 'read_repository_file',
      args: { filePath: fileMatch[1], startLine: 1, endLine: 140 },
      summary: readRes.error
        ? `Read attempt on ${fileMatch[1]}: ${readRes.error}`
        : `Read ${readRes.filePath} (lines 1–${readRes.endLine})`,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: 'FALLBACK_TELEMETRY_ONLY',
      expertId,
      expertTitleEn: expert.titleEn,
      expertTitleFa: expert.titleFa,
      modelUsed: 'gdf-deterministic-telemetry-engine',
      replyMarkdown: buildDeterministicTelemetryFallbackMarkdown(
        expert,
        userMessage,
        liveTelemetry,
        toolsInvoked,
        lang,
        'GEMINI_API_KEY not configured in environment'
      ),
      toolsInvoked,
      liveTelemetryDigest: digest,
      timestampIso: nowIso,
    };
  }

  let activeModelUsed = 'gemini-3.8-flash';
  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    const generateWithModelFailover = async (reqContents: any[], reqConfig: any) => {
      let lastErr: any = null;
      for (let idx = 0; idx < candidateModels.length; idx++) {
        const candidateModel = candidateModels[idx];
        try {
          if (idx > 0) {
            await new Promise((r) => setTimeout(r, 450 * idx));
          }
          const res = await ai.models.generateContent({
            model: candidateModel,
            contents: reqContents,
            config: reqConfig,
          });
          activeModelUsed = candidateModel;
          return res;
        } catch (e: any) {
          lastErr = e;
        }
      }
      throw lastErr;
    };

    const systemInstruction = `${expert.systemPromptRole}

CRITICAL GDF CONSTITUTIONAL & EPISTEMIC RULES:
1. STRICT REAL DATA ONLY: Never fabricate or hallucinate market prices, yields, candle counts, RMSEs, or proof outcomes. Always ground every number in the live telemetry snapshot or repository source code returned by your tools.
2. EPISTEMIC HONESTY: If Out-of-Sample (OOS) residual bars < 30 or status is CALIBRATING / HALTED_DEGRADED, state it explicitly. Never overclaim statistical significance.
3. REPOSITORY INTROSPECTION: You have direct read-only tool access to the entire GDF repository (\`list_repository_files\`, \`read_repository_file\`, \`search_repository_code\`, \`get_live_market_and_engine_telemetry\`, \`lookup_financial_dictionary\`). Whenever the user asks about code, architecture, formulas, timeouts, or bugs, call \`search_repository_code\` or \`read_repository_file\` to cite exact file paths and line numbers.
4. READ-ONLY AUDITOR BOUNDARY: You operate under the GDF READ_ONLY_AUDITOR_AND_ADVISOR boundary—you analyze, diagnose, mathematically derive, and recommend actions, while the human Operator executes state mutations via the Dual-Control Promotion Gate.
5. LANGUAGE: Respond in ${lang === 'fa' ? 'Persian (فارسی) with accurate quantitative terminology' : 'clear, institutional-grade English'} (unless the user explicitly writes in another language, in which case match the user's language). Use clean Markdown formatting with concise sections and bullet points.

CURRENT LIVE TELEMETRY BASELINE (${nowIso}):
${JSON.stringify(liveTelemetry, null, 2)}`;

    const contents: any[] = [];
    const priorHistory = Array.isArray(params.history) ? params.history.slice(-6) : [];
    for (const h of priorHistory) {
      if (h && typeof h.text === 'string' && h.text.trim()) {
        contents.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }],
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    let currentResponse = await generateWithModelFailover(contents, {
      systemInstruction,
      tools: [{ functionDeclarations: COUNCIL_TOOL_DECLARATIONS }],
    });

    // Execute up to 4 rounds of autonomous tool calling
    let loopCount = 0;
    while (
      currentResponse.functionCalls &&
      currentResponse.functionCalls.length > 0 &&
      loopCount < 4
    ) {
      loopCount++;
      const modelTurnContent = currentResponse.candidates?.[0]?.content;
      if (modelTurnContent) {
        contents.push(modelTurnContent);
      }

      const functionResponseParts: any[] = [];
      for (const fnCall of currentResponse.functionCalls) {
        const fnName = fnCall.name || 'unknown';
        const fnArgs = (fnCall.args as Record<string, any>) || {};
        const dispatched = dispatchCouncilToolCall(fnName, fnArgs, interval);
        toolsInvoked.push({
          toolName: fnName,
          args: fnArgs,
          summary: dispatched.summary,
        });
        functionResponseParts.push({
          functionResponse: {
            id: fnCall.id,
            name: fnName,
            response: dispatched.output,
          },
        });
      }

      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });

      currentResponse = await generateWithModelFailover(contents, {
        systemInstruction,
        tools: [{ functionDeclarations: COUNCIL_TOOL_DECLARATIONS }],
      });
    }

    const replyText = (currentResponse.text ?? '').trim();
    return {
      status: 'SUCCESS',
      expertId,
      expertTitleEn: expert.titleEn,
      expertTitleFa: expert.titleFa,
      modelUsed: activeModelUsed,
      replyMarkdown:
        replyText ||
        buildDeterministicTelemetryFallbackMarkdown(
          expert,
          userMessage,
          liveTelemetry,
          toolsInvoked,
          lang
        ),
      toolsInvoked,
      liveTelemetryDigest: digest,
      timestampIso: nowIso,
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err || 'Unknown Gemini API error');
    return {
      status: 'FALLBACK_TELEMETRY_ONLY',
      expertId,
      expertTitleEn: expert.titleEn,
      expertTitleFa: expert.titleFa,
      modelUsed: activeModelUsed,
      replyMarkdown: buildDeterministicTelemetryFallbackMarkdown(
        expert,
        userMessage,
        liveTelemetry,
        toolsInvoked,
        lang,
        errMsg
      ),
      toolsInvoked,
      liveTelemetryDigest: digest,
      timestampIso: nowIso,
    };
  }
}
