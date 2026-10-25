import fs from 'fs';
import path from 'path';
import {
  AdaptiveDPObserver,
  evaluatePureQuantPipeline,
} from '../src/engine/quantEngine.js';
import { buildHaltedDegradedForecastPayload } from '../src/services/telemetryService.js';
import type {
  VerifiedCandle,
  VerifiedMacroYieldResult,
} from '../src/contracts/quantContracts.js';

function fail(msg: string): never {
  console.error(`\x1b[31m[PHASE 6 COGNITIVE HIERARCHY & LABEL NEUTRALIZATION CHECK FAILED]\x1b[0m ${msg}`);
  process.exit(1);
}

const rootDir = process.cwd();
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const quantEngineTs = fs.readFileSync(path.join(rootDir, 'src/engine/quantEngine.ts'), 'utf8');
const telemetryServiceTs = fs.readFileSync(path.join(rootDir, 'src/services/telemetryService.ts'), 'utf8');

// 1. Verify Three-Tier Visual & Epistemic Hierarchy DOM Structure
const requiredHierarchyIds = [
  'id="tier1PrimarySection"',
  'id="tier1PrimaryRibbon"',
  'id="tier1CircuitBreakerBadge"',
  'id="tier1FeedIntegrityBadge"',
  'id="tier1ActiveTimeframeBadge"',
  'id="tier1VolRegimeBadge"',
  'id="tier1MacroRegimeBadge"',
  'id="tier2PrimaryWorkspace"',
  'id="radarStage"',
  'id="threeGlobeStage"',
  'id="tier2CoreSummaryStrip"',
  'id="t2Equilibrium"',
  'id="t2EquilibriumUnc"',
  'id="t2DriftVelocity"',
  'id="t2DriftUnc"',
  'id="t2MacroProxy"',
  'id="t2MacroProxyUnc"',
  'id="t2ValidationMainBadge"',
  'id="tier3ProgressiveDisclosure"',
];

for (const domId of requiredHierarchyIds) {
  if (!indexHtml.includes(domId)) {
    fail(`Missing required 3-tier hierarchy DOM marker in index.html: ${domId}`);
  }
}

// Verify all 6 Tier-3 panels exist and NONE have 'is-open' class by default in HTML
const tier3Panels = [
  'panelNews',
  'panelMTF',
  'panelTelemetry',
  'panelDP',
  'panelConvergence',
  'panelValidation',
];

for (const panelId of tier3Panels) {
  const openRegex = new RegExp(`class="[^"]*collapsible-panel[^"]*is-open[^"]*"[^>]*id="${panelId}"`);
  const openRegexAlt = new RegExp(`id="${panelId}"[^>]*class="[^"]*collapsible-panel[^"]*is-open[^"]*"`);
  if (openRegex.test(indexHtml) || openRegexAlt.test(indexHtml)) {
    fail(`Tier-3 panel #${panelId} must be collapsed by default (found .is-open in initial HTML).`);
  }
}

if (/class="[^"]*collapsible-panel\s+is-open/.test(indexHtml)) {
  fail('Found a .collapsible-panel with .is-open in initial HTML. All Tier-3 diagnostic panels must be collapsed by default.');
}

// 2. Verify Complete Neutralization of Prescriptive / Emotionally Charged Labels
const forbiddenPatterns: { pattern: RegExp; description: string }[] = [
  { pattern: /Bear\s+Kill/i, description: 'Forbidden sensational label "Bear Kill"' },
  { pattern: /Bull\s+Lift/i, description: 'Forbidden sensational label "Bull Lift"' },
  { pattern: /KILL\s+ZONE/i, description: 'Forbidden sensational label "KILL ZONE"' },
  { pattern: /ALPHA\s+SIGNAL/i, description: 'Forbidden sensational label "ALPHA SIGNAL"' },
  { pattern: /\bEXECUTE\b/, description: 'Forbidden imperative command "EXECUTE"' },
  { pattern: /Battle\s+Candles/i, description: 'Forbidden combat metaphor "Battle Candles"' },
  { pattern: /3D\s+Battle\s+Candle/i, description: 'Forbidden combat metaphor "3D Battle Candle"' },
  { pattern: /Candle\s+Clash/i, description: 'Forbidden combat metaphor "Candle Clash"' },
  { pattern: /HOLD\s+MACRO\s+BIAS/i, description: 'Forbidden prescriptive directive "HOLD MACRO BIAS"' },
  { pattern: /ACCUMULATE\s+DIP/i, description: 'Forbidden prescriptive directive "ACCUMULATE DIP"' },
  { pattern: /AGGRESSIVE\s+LONG/i, description: 'Forbidden prescriptive directive "AGGRESSIVE LONG"' },
  { pattern: /HIGH\s+CONVICTION\s+BULLISH/i, description: 'Forbidden prescriptive directive "HIGH CONVICTION BULLISH"' },
  { pattern: /QUANT\s+DECISION\s+TERMINAL/i, description: 'Forbidden prescriptive banner "QUANT DECISION TERMINAL"' },
];

for (const { pattern, description } of forbiddenPatterns) {
  if (pattern.test(indexHtml)) {
    fail(`${description} found in index.html`);
  }
  if (pattern.test(quantEngineTs)) {
    fail(`${description} found in src/engine/quantEngine.ts`);
  }
  if (pattern.test(telemetryServiceTs)) {
    fail(`${description} found in src/services/telemetryService.ts`);
  }
}

// Verify runtime quantEngine & telemetryService outputs on real archived fixture data are strictly neutral
const fixturesDir = path.join(rootDir, 'fixtures', 'real-market');
const rawPaxg = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'paxg_15m.json'), 'utf8'));
const candles: VerifiedCandle[] = Array.isArray(rawPaxg) ? rawPaxg : rawPaxg.candles;
const rawComex = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'comex_gcf_15m.json'), 'utf8'));
const comexCandles: VerifiedCandle[] = Array.isArray(rawComex) ? rawComex : rawComex.candles;
const macroFixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'macro_yields_fx.json'), 'utf8'));

const liveMacro: VerifiedMacroYieldResult = {
  nominal10Y: macroFixture.nominal10Y ?? 4.965,
  tipsRealYield10Y: macroFixture.tipsRealYield10Y ?? 2.745,
  breakevenInflation10Y: macroFixture.breakevenInflation10Y ?? 2.22,
  dxyIndex: macroFixture.dxyIndex ?? 101.68,
  realYieldGravity: macroFixture.realYieldGravity ?? -1.432,
  dollarDrag: macroFixture.dollarDrag ?? -0.109,
  centralBankTide: macroFixture.centralBankTide ?? 0.55,
  netMacroLift: macroFixture.netMacroLift ?? -0.991,
  source: 'Archived Phase-0 Real Fixture',
  status: 'ONLINE_MULTI_SOURCE_VERIFIED',
  lastUpdated: new Date().toISOString(),
  respondingSources: ['Fixture_TNX', 'Fixture_TIPS', 'Fixture_DXY'],
  sanityCheckZScore: 0.12,
  outliersRejected: [],
};

const secondaryBenchmark = {
  provider: 'Yahoo Finance COMEX Gold Futures (Fixture)',
  symbol: 'GC=F',
  candles: comexCandles,
  crossVenueSpreadUsd: 1.4,
  crossVenueZScore: -0.57,
  isOutlierDislocation: false,
};

const observer = new AdaptiveDPObserver();
const quantOut = evaluatePureQuantPipeline(
  candles,
  liveMacro,
  secondaryBenchmark,
  900,
  observer,
  'LIVE_NOMINAL',
  'TIER_1_PRIMARY'
);

if (/EXECUTE|LONG|SHORT|KILL|BUY|SELL/i.test(quantOut.sweepDiscriminator.tacticalAction)) {
  fail(`Sweep discriminator tacticalAction contains non-neutral wording: "${quantOut.sweepDiscriminator.tacticalAction}"`);
}

for (const row of quantOut.multiTimeframe.matrix) {
  if (/HOLD|ACCUMULATE|EXECUTE|SCALP|LONG|SHORT/i.test(row.actionBias)) {
    fail(`MTF row ${row.timeframe} actionBias contains non-neutral wording: "${row.actionBias}"`);
  }
}

const haltedPayload = buildHaltedDegradedForecastPayload({
  waterfall: {
    systemState: 'HALTED_DEGRADED',
    activeTier: 'NONE_HALTED',
    sourceName: 'NONE',
    candles: [],
    secondaryBenchmark: null,
    diagnostics: [],
    haltReason: 'Test halt EN',
    haltReasonFa: 'Test halt FA',
    timestamp: Date.now()
  } as any,
  liveMacro,
  realNewsFeed: {
    items: [],
    activeSources: [],
    status: 'UNAVAILABLE',
    timestamp: Date.now()
  } as any,
  observerInst: observer,
  interval: '15m',
  intervalStepSeconds: 900,
  appVersion: '2.6.0-PHASE6'
});
if (/EXECUTE/i.test(haltedPayload.sweepDiscriminator.tacticalAction)) {
  fail(`Halted payload tacticalAction contains forbidden word EXECUTE: "${haltedPayload.sweepDiscriminator.tacticalAction}"`);
}

// 3. Verify Visual Uncertainty Cues in 2D and 3D + HALTED_DEGRADED 3D Freeze
const requiredUncertaintyMarkers = [
  'id="cardEquilibriumUncBand"',
  'id="cardGarchUncBand"',
  'id="dpVelocityUncBand"',
  'id="threeHaltedOverlay"',
  'id="threeUncertaintyModBadge"',
  'particleCoherence',
  'innovationJitter',
  'isHaltedDegraded',
  'up75Pts',
  'lo25Pts',
  '+2σ (P95)',
  '+1σ (P75)',
];

for (const marker of requiredUncertaintyMarkers) {
  if (!indexHtml.includes(marker)) {
    fail(`Missing required 2D/3D visual uncertainty or HALTED_DEGRADED freeze marker in index.html: ${marker}`);
  }
}

// 4. Verify Persistent Bilingual Epistemic Framing Badges
const requiredEpistemicAttributes = [
  'data-epistemic="RAW_OBSERVATION"',
  'data-epistemic="FILTERED_ESTIMATE"',
  'data-epistemic="HEURISTIC_PROXY"',
  '[RAW OBSERVATION]',
  '[FILTERED ESTIMATE]',
  '[HEURISTIC PROXY]',
  '[مشاهده خام]',
  '[تخمین فیلترشده]',
  '[پروکسی ابتکاری]',
];

for (const epMarker of requiredEpistemicAttributes) {
  if (!indexHtml.includes(epMarker)) {
    fail(`Missing required bilingual epistemic framing badge marker in index.html: ${epMarker}`);
  }
}

const rawCount = (indexHtml.match(/data-epistemic="RAW_OBSERVATION"/g) || []).length;
const filteredCount = (indexHtml.match(/data-epistemic="FILTERED_ESTIMATE"/g) || []).length;
const proxyCount = (indexHtml.match(/data-epistemic="HEURISTIC_PROXY"/g) || []).length;

if (rawCount < 4 || filteredCount < 6 || proxyCount < 6) {
  fail(
    `Insufficient epistemic badge coverage across metrics: RAW=${rawCount}, FILTERED=${filteredCount}, PROXY=${proxyCount}`
  );
}

console.log(
  `\x1b[32m[PHASE 6 COGNITIVE HIERARCHY & LABEL NEUTRALIZATION CHECK PASSED]\x1b[0m ` +
    `3-tier hierarchy verified (6 Tier-3 panels collapsed by default), 0 prescriptive/sensational strings, ` +
    `2D/3D ±1σ/±2σ uncertainty + HALTED_DEGRADED 3D freeze active, and ${rawCount + filteredCount + proxyCount} persistent bilingual epistemic badges verified.`
);
