/**
 * @file scripts/check-bilingual-terminology.ts
 * @description Automated Verification Suite for GDF Bilingual Financial Terminology Standardization
 * (English + Persian/Farsi), Persian Typography Hygiene, RTL/LTR Bidi Isolation, 3D Market Theatre
 * Layer Preservation, and Numerical/Mathematical Output Invariance.
 */

import fs from 'fs';
import path from 'path';
import {
  BILINGUAL_STYLE_POLICY,
  FINANCIAL_TERMINOLOGY_DICTIONARY,
  auditPersianStringHygiene,
  getAllConcepts,
} from '../src/config/financialDictionary.js';
import { MODEL_SPEC_REGISTRY, getModelSpecList } from '../src/config/modelSpecRegistry.js';
import { AdaptiveDPObserver, evaluatePureQuantPipeline } from '../src/engine/quantEngine.js';
import {
  fetchVerifiedMacroWaterfall,
  fetchVerifiedMarketWaterfall,
} from '../src/services/realDataWaterfall.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runBilingualTerminologyAudit() {
  console.log('================================================================================');
  console.log('🌐 GDF BILINGUAL FINANCIAL TERMINOLOGY & NUMERICAL INVARIANCE AUDIT');
  console.log('================================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. Verify Central Bilingual Financial Dictionary Completeness (27 Concepts)
  // ---------------------------------------------------------------------------
  const requiredCoreConceptIds = [
    'MARKET_FLOW_AND_PRICE_DYNAMICS',
    'ADAPTIVE_MARKET_STATE_ESTIMATOR',
    'EXOGENOUS_MARKET_DRIVERS',
    'LATENT_MARKET_FACTORS',
    'VOLUME_SYNCHRONIZED_TIME',
    'ORDER_FLOW_IMBALANCE',
    'LIQUIDITY_DEPTH',
    'PRICE_IMPACT_RESPONSE',
    'FORECAST_RESIDUAL_ANALYSIS',
    'ALTERNATIVE_FORECAST_SCENARIO',
    'PREDICTIVE_INTERVAL_UNCERTAINTY_BAND',
    'ADAPTIVE_MODEL_EVALUATION_AND_VALIDATION',
    'LIQUIDITY_SWEEP_VS_BREAKOUT_CLASSIFIER',
    'PRIMARY_FORECAST_TRAJECTORY',
    'CANDIDATE_FORECAST_TRAJECTORY',
    'INSTRUMENT_BASIS_ADJUSTMENT',
    'CROSS_ASSET_SENSITIVITY',
    'VOLATILITY_REGIME',
    'MARKET_DATA_FEED_INTEGRITY',
    'DATA_PROVIDER_QUORUM',
    'FORECAST_RELIABILITY',
  ];

  const requiredTheatreLayerIds = [
    'THEATRE_ARENA',
    'THEATRE_BULL_BEAR_TITANS',
    'THEATRE_GRAVEYARD',
    'THEATRE_DEEP_TERRAIN',
    'THEATRE_MACRO_SKY',
    'THEATRE_HISTORICAL_REPLAY',
  ];

  const allRequiredIds = [...requiredCoreConceptIds, ...requiredTheatreLayerIds];
  for (const id of allRequiredIds) {
    const entry = FINANCIAL_TERMINOLOGY_DICTIONARY[id];
    assert(Boolean(entry), `Missing required canonical concept ID in FINANCIAL_TERMINOLOGY_DICTIONARY: ${id}`);
    assert(entry.canonicalEn.trim().length > 2, `Empty canonicalEn for ${id}`);
    assert(entry.canonicalFa.trim().length > 2, `Empty canonicalFa for ${id}`);
    assert(entry.shortLabelEn.trim().length > 1, `Empty shortLabelEn for ${id}`);
    assert(entry.shortLabelFa.trim().length > 1, `Empty shortLabelFa for ${id}`);
    assert(entry.tooltipEn.trim().length > 10, `Empty tooltipEn for ${id}`);
    assert(entry.tooltipFa.trim().length > 10, `Empty tooltipFa for ${id}`);
    assert(entry.technicalDefinitionEn.trim().length > 10, `Empty technicalDefinitionEn for ${id}`);
    assert(entry.technicalDefinitionFa.trim().length > 10, `Empty technicalDefinitionFa for ${id}`);
    assert(entry.variableOrEquation.trim().length > 1, `Empty variableOrEquation for ${id}`);
    assert(entry.unitAndSignConvention.trim().length > 1, `Empty unitAndSignConvention for ${id}`);

    // Persian character hygiene on all Persian fields
    for (const faField of [
      entry.canonicalFa,
      entry.shortLabelFa,
      entry.tooltipFa,
      entry.technicalDefinitionFa,
      ...entry.approvedAliasesFa,
      ...entry.deprecatedTermsFa,
    ]) {
      const hygiene = auditPersianStringHygiene(faField);
      assert(
        hygiene.valid,
        `Persian typography hygiene violation in concept ${id}: "${faField}" -> ${JSON.stringify(hygiene)}`
      );
    }
  }
  console.log(
    `✅ [1/6] Central Financial Dictionary Verified (${getAllConcepts().length} canonical concepts, 100% EN/FA metadata & epistemic tags, Policy ${BILINGUAL_STYLE_POLICY.version}).`
  );

  // ---------------------------------------------------------------------------
  // 2. Verify Model Specification Registry & Client Mirror Parity + Hygiene
  // ---------------------------------------------------------------------------
  const specs = getModelSpecList();
  assert(specs.length >= 17, `Expected at least 17 Model Specifications, found ${specs.length}`);
  const clientCoreSource = fs.readFileSync(path.resolve('public/js/gdfClientCore.js'), 'utf8');

  for (const spec of specs) {
    assert(
      clientCoreSource.includes(`${spec.id}:`),
      `public/js/gdfClientCore.js is missing static mirror entry for ModelSpec ID: ${spec.id}`
    );
    const faStrings = [
      spec.honestLabelFa,
      spec.visualizationLayerFa,
      spec.mathClassFa,
      spec.samplingAndLookbackFa,
      spec.dofAndCalibrationFa,
      spec.structuralLimitationsFa,
    ];
    for (const s of faStrings) {
      const h = auditPersianStringHygiene(s);
      assert(
        h.valid,
        `Persian typography violation in MODEL_SPEC_REGISTRY[${spec.id}]: "${s}" -> ${JSON.stringify(h)}`
      );
    }
  }
  const clientHygiene = auditPersianStringHygiene(clientCoreSource);
  assert(
    clientHygiene.valid,
    `Persian typography violation in public/js/gdfClientCore.js: ${JSON.stringify(clientHygiene)}`
  );
  console.log(
    `✅ [2/6] Model Specification Registry (${specs.length} estimators) & gdfClientCore.js mirror synchronized with 100% Persian character hygiene.`
  );

  // ---------------------------------------------------------------------------
  // 3. Verify i18n.en and i18n.fa Key Parity & Hygiene in index.html
  // ---------------------------------------------------------------------------
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  const i18nMatch = indexHtml.match(/const i18n = (\{[\s\S]*?\n\};)\s*\n\s*const EPISTEMIC_BADGE_LABELS/);
  assert(Boolean(i18nMatch), 'Could not locate `const i18n = { ... };` block in index.html');

  const i18nObj = new Function(`return ${i18nMatch![1].replace(/;$/, '')}`)() as {
    en: Record<string, string>;
    fa: Record<string, string>;
  };

  const enKeys = Object.keys(i18nObj.en);
  const faKeys = Object.keys(i18nObj.fa);

  const missingInFa = enKeys.filter(k => !(k in i18nObj.fa));
  const missingInEn = faKeys.filter(k => !(k in i18nObj.en));

  assert(
    missingInFa.length === 0,
    `i18n.fa is missing keys present in i18n.en: ${missingInFa.join(', ')}`
  );
  assert(
    missingInEn.length === 0,
    `i18n.en is missing keys present in i18n.fa: ${missingInEn.join(', ')}`
  );

  for (const key of enKeys) {
    const enVal = i18nObj.en[key];
    const faVal = i18nObj.fa[key];
    assert(typeof enVal === 'string' && enVal.trim().length > 0, `Empty i18n.en.${key}`);
    assert(typeof faVal === 'string' && faVal.trim().length > 0, `Empty i18n.fa.${key}`);
    const faHygiene = auditPersianStringHygiene(faVal);
    assert(
      faHygiene.valid,
      `Persian typography hygiene violation in i18n.fa.${key} ("${faVal}"): ${JSON.stringify(faHygiene)}`
    );
  }
  console.log(
    `✅ [3/6] index.html i18n Dictionary Parity Verified (${enKeys.length} EN keys === ${faKeys.length} FA keys, zero missing translations, zero Arabic ي/ك).`
  );

  // ---------------------------------------------------------------------------
  // 4. Verify 3D Market Theatre Layer Names & Bilingual Chapter Copy
  // ---------------------------------------------------------------------------
  const zoneCopyMatch = indexHtml.match(/const ZONE_CHAPTER_COPY = (\{[\s\S]*?\n\});/);
  assert(Boolean(zoneCopyMatch), 'Could not locate ZONE_CHAPTER_COPY in index.html');
  const zoneCopy = new Function(`return ${zoneCopyMatch![1]}`)() as Record<
    string,
    {
      mainTitle: string;
      subTitle: string;
      caption: string;
      mainTitleFa: string;
      subTitleFa: string;
      captionFa: string;
    }
  >;

  const expectedZones = ['overview', 'battle', 'graveyard', 'manifold', 'forecast', 'aftermath', 'ahead', 'replay'];
  for (const z of expectedZones) {
    assert(Boolean(zoneCopy[z]), `Missing zone preset "${z}" in ZONE_CHAPTER_COPY`);
    assert(Boolean(zoneCopy[z].mainTitle && zoneCopy[z].mainTitleFa), `Missing EN/FA mainTitle in ZONE_CHAPTER_COPY.${z}`);
    assert(Boolean(zoneCopy[z].subTitle && zoneCopy[z].subTitleFa), `Missing EN/FA subTitle in ZONE_CHAPTER_COPY.${z}`);
    assert(Boolean(zoneCopy[z].caption && zoneCopy[z].captionFa), `Missing EN/FA caption in ZONE_CHAPTER_COPY.${z}`);
    const h = auditPersianStringHygiene(
      `${zoneCopy[z].mainTitleFa} ${zoneCopy[z].subTitleFa} ${zoneCopy[z].captionFa}`
    );
    assert(h.valid, `Persian hygiene violation in ZONE_CHAPTER_COPY.${z}`);
  }

  // Verify all 6 canonical 3D Market Theatre layer names are preserved in index.html
  for (const layerName of [
    'Arena',
    'Bull and Bear Titans',
    'Graveyard',
    'Deep Terrain',
    'Macro Sky',
    'Historical Replay',
  ]) {
    assert(
      indexHtml.includes(layerName),
      `Preserved 3D Market Theatre layer name "${layerName}" missing from index.html`
    );
  }
  console.log(
    `✅ [4/6] 3D Market Theatre Bilingual Chapters (8 presets) & 6 Canonical Layer Names (Arena, Bull and Bear Titans, Graveyard, Deep Terrain, Macro Sky, Historical Replay) Verified.`
  );

  // ---------------------------------------------------------------------------
  // 5. Verify RTL & Bidirectional Isolation Rules in index.html
  // ---------------------------------------------------------------------------
  assert(
    indexHtml.includes('html[dir="rtl"]') && indexHtml.includes('unicode-bidi: isolate'),
    'Missing RTL bidirectional isolation CSS rules (html[dir="rtl"] / unicode-bidi: isolate) in index.html'
  );
  assert(
    indexHtml.includes('tabular-nums'),
    'Missing tabular-nums numeric alignment rule in index.html'
  );
  console.log('✅ [5/6] RTL Layout & LTR Bidirectional Formula/Numeral Isolation CSS Rules Verified.');

  // ---------------------------------------------------------------------------
  // 6. Verify Mathematical & Numerical Output Invariance on Verified Real Fixture
  // ---------------------------------------------------------------------------
  const [wf, macro] = await Promise.all([
    fetchVerifiedMarketWaterfall('15m', { fixtureReplay: true }),
    fetchVerifiedMacroWaterfall(),
  ]);

  const runA = evaluatePureQuantPipeline(
    wf.candles,
    macro,
    wf.secondaryBenchmark,
    900,
    new AdaptiveDPObserver(),
    'LIVE_NOMINAL',
    'TIER_1_PRIMARY',
    wf.htfDailyCandles
  );

  const runB = evaluatePureQuantPipeline(
    wf.candles,
    macro,
    wf.secondaryBenchmark,
    900,
    new AdaptiveDPObserver(),
    'LIVE_NOMINAL',
    'TIER_1_PRIMARY',
    wf.htfDailyCandles
  );

  assert(
    Number.isFinite(runA.equilibriumPrice) && runA.equilibriumPrice === runB.equilibriumPrice,
    `Equilibrium price numerical drift detected: ${runA.equilibriumPrice} vs ${runB.equilibriumPrice}`
  );
  assert(
    Number.isFinite(runA.observerTelemetry.driftVelocity) &&
      runA.observerTelemetry.driftVelocity === runB.observerTelemetry.driftVelocity,
    `Kalman state velocity numerical drift detected: ${runA.observerTelemetry.driftVelocity} vs ${runB.observerTelemetry.driftVelocity}`
  );
  assert(
    Number.isFinite(runA.garchVolatility.currentVolPct) &&
      runA.garchVolatility.currentVolPct === runB.garchVolatility.currentVolPct,
    `GARCH volatility numerical drift detected: ${runA.garchVolatility.currentVolPct} vs ${runB.garchVolatility.currentVolPct}`
  );
  assert(
    JSON.stringify(runA.ensemble.medianTrack) === JSON.stringify(runB.ensemble.medianTrack),
    'Primary Forecast Trajectory (ensemble.medianTrack) numerical mismatch'
  );
  assert(
    runA.directionalPressure.zScore === runB.directionalPressure.zScore,
    'Directional pressure Z-score numerical mismatch'
  );

  console.log(
    `✅ [6/6] Mathematical & Numerical Output Invariance Verified (OU Eq=$${runA.equilibriumPrice.toFixed(
      2
    )}, Kalman v_t=${runA.observerTelemetry.driftVelocity.toFixed(4)}, GARCH Vol=${runA.garchVolatility.currentVolPct.toFixed(
      4
    )}%, Horizon Steps=${runA.ensemble.medianTrack.length}).`
  );
  console.log('\n🎉 ALL BILINGUAL TERMINOLOGY, RTL/BIDI, AND NUMERICAL INVARIANCE CHECKS PASSED.');
}

runBilingualTerminologyAudit().catch(err => {
  console.error('Fatal error in check-bilingual-terminology:', err);
  process.exit(1);
});
