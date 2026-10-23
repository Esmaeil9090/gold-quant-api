# GDF (Gold Dynamic Flow) — Phase 0 Remediation Manifest (`v0.0-baseline`)

This manifest catalogs every synthetic market generator, random-walk fallback, candle-derived news generator, hardcoded econometric constant, and self-referential percentage gauge present in `/server.ts` and `/index.html` at baseline tag `v0.0-baseline`.

---

## 1. Synthetic Market Generators, Sinusoidal Simulators & Random-Walk Fallbacks (Permanently Forbidden — Phase 1 Deletion)

| ID | File Path | Baseline Lines | Symbol / Function | Description & Remediation Action |
| :--- | :--- | :--- | :--- | :--- |
| **SYN-01** | `/server.ts` | `1050–1082` | `generateSyntheticCandles(interval, anchorPrice)` | Generates 300 fabricated OHLCV candles using pseudo-random return shocks (`(Math.random() - 0.492) * 2.8`), random high/low wicks, and random volume when Binance fails. **Action (Phase 1):** Delete permanently. Replace with 3-tier verified real-data waterfall (Binance PAXG/USDT -> Yahoo Finance `GC=F` / `XAUUSD=X` -> Kraken `PAXGUSD`) and circuit breaker halting. |
| **SYN-02** | `/server.ts` | `1525–1535` | `/api/gold-forecast` catch block fallback | Calls `generateSyntheticCandles(interval, backupSpot)` and sets `isSynthetic = true` when `fetchBinanceCandles` throws. **Action (Phase 1):** Delete synthetic fallback branch. Route through multi-provider real waterfall; if all 3 tiers fail, transition terminal state to `HALTED_DEGRADED` and freeze filter mutations. |
| **SYN-03** | `/server.ts` | `333–345` | `computeCointegrationBasis` sinusoidal COMEX proxy | Fabricates COMEX benchmark series via `const comexSynthetic = c.close * 0.9996 + (Math.sin(i * 0.35) * 0.45)`. **Action (Phase 1):** Delete sinusoidal proxy. Compute true empirical basis spread against real COMEX `GC=F` / secondary spot benchmark (`PAXG - GC=F` or `PAXG - Kraken PAXGUSD`). |
| **SYN-04** | `/server.ts` | `1190–1272` | `generateHurricaneEnsemblePlumes` unseeded random-walk loop | Uses unseeded Box-Muller shocks, ad-hoc Student-t perturbation, and hardcoded Poisson jump frequency `0.035` to fabricate 300 random-walk paths. **Action (Phase 1):** Replace random-walk Monte Carlo loop with deterministic analytical / empirical historical-residual quantile fan (`medianTrack`, `upper95`, `upper75`, `lower25`, `lower05`) derived strictly from real trailing return innovations and GARCH conditional variance. |
| **SYN-05** | `/index.html` | `5144–5523` | `getClientFallbackData(tf)` | Client-side synthetic generator producing 120 sinusoidal OHLCV candles, fabricated forecast tracks, fabricated EKF convergence history, hardcoded multi-timeframe matrix, hardcoded macro yield feed, and hardcoded news. **Action (Phase 1):** Delete `getClientFallbackData(tf)` in its entirety. |
| **SYN-06** | `/index.html` | `4662`, `5617–5624` | `changeTimeframe` & `fetchQuantData` catch block | Invokes `forecastData = getClientFallbackData(...)` on timeframe switch and when `/api/gold-forecast` fails. **Action (Phase 1):** Delete calls to `getClientFallbackData`; activate explicit `HALTED_DEGRADED` circuit-breaker state when all live feeds fail, freezing state mutations and surfacing the bilingual degraded/halted warning banner. |
| **SYN-07** | `/index.html` | `8770–8779` | `DOMContentLoaded` startup pre-seed | Calls `forecastData = getClientFallbackData(currentTimeframe)` prior to initial API resolution. **Action (Phase 1):** Remove synthetic pre-seed; initialize terminal in verified live fetch state and render strictly upon verified `/api/gold-forecast` payload receipt. |

---

## 2. Candle-Derived & Hardcoded News Fabrication (Permanently Forbidden — Phase 1 Replacement)

| ID | File Path | Baseline Lines | Symbol / Function | Description & Remediation Action |
| :--- | :--- | :--- | :--- | :--- |
| **NEWS-01** | `/server.ts` | `141–238` | `generateMacroNews(candles)` | Fabricates 6 static macro news headlines (`news-fed-cuts`, `news-pboc-gold`, `news-cpi-surge`, `news-geopolitics`, `news-tips-yields`, `news-ecb-stagflation`) anchored to candle array timestamps (`candles[Math.max(0, n - 24)].time`, etc.) and a fake `+30m Catalyst` at `now + 1800`. **Action (Phase 1):** Delete `generateMacroNews(candles)`. Replace with `fetchVerifiedMacroNews()` ingesting live external financial/macro RSS feeds (Yahoo Finance Gold/Macro RSS, CNBC Economy/Fed RSS, MarketWatch Macro RSS) with real publication timestamps, source attribution, and explicit bilingual `"News Feed Unavailable"` / `"جریان اخبار در دسترس نیست"` status if all external news feeds fail. |
| **NEWS-02** | `/index.html` | `5410–5441` | `macroNews` inside `getClientFallbackData` | Hardcoded array of fabricated news events anchored to client clock `now - 3600`, `now - 7200`. **Action (Phase 1):** Delete along with `getClientFallbackData`. |

---

## 3. Hardcoded Econometric Constants & Author-Selected Priors (Phase 1 Empirical Calibration / Registry)

| ID | File Path | Baseline Lines | Subsystem & Constant | Baseline Value | Remediation Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CONST-01** | `/server.ts` | `312–316`, `324–327` | `computeVpinAndShrinkage` toxicity thresholds & Bayes priors | `vpin > 0.38`, `vpin < 0.18`, `sigmaB2 = 4.0`, `sigmaNoise2 = 1.2` | Calibrate `sigmaB2` and `sigmaNoise2` from rolling empirical return/innovation variance on real candles; register toxicity quantile bounds in `parameterRegistry.ts`. |
| **CONST-02** | `/server.ts` | `387–397`, `413–425`, `439` | `computeOrthogonalMacroFactors` static theories `T5..T8` & fixed weights | `t5=+0.48`, `t6=+0.32`, `t7=+0.28`, `t8=+0.36`, weights `0.582, 0.258, 0.160`, `Cond=1.00` | Derive cross-asset factors dynamically from real market series (`GC=F`, `PAXG`, `^TNX`, `DFII10`, `T10YIE`, `DX-Y.NYB`, realized vol/momentum) and compute empirical variance weights & condition number. |
| **CONST-03** | `/server.ts` | `473–489`, `500–545` | `AdaptiveDPObserver` EKF & Volume-Clock priors | `alphaClock=0.72`, `tauMin=0.25`, `tauMax=2.50`, `Pv=1.0`, `Pb=0.8`, `Qv0=0.14`, `Qb0=0.09`, `R=1.6`, Huber cutoff `3.0` | Expose in `parameterRegistry.ts` with empirical innovation-variance adaptation for `R`, `Qv0`, `Qb0` and explicit freeze guard when feed state is `HALTED_DEGRADED`. |
| **CONST-04** | `/server.ts` | `635–663`, `670–678` | `computeLogOddsSweepDiscriminator` weights & thresholds | `hawkesLambda=0.25`, decay `0.65`, weights `1.85, 1.15, 0.55, -0.65`, threshold `±0.85` | Calibrate range intensity and wick absorption against rolling empirical distribution of real bars; document log-odds coefficients and sensitivity bounds in `parameterRegistry.ts`. |
| **CONST-05** | `/server.ts` | `700–728` | `computeMorsePotentialManifold` well & wall multipliers | `wellDepthDe = 12.5 + |F|*4.2`, `stiffnessAlpha = 0.085 / max(1, atr*0.2)`, walls at `±1.8 * atr` | Anchor potential well depth, stiffness, and liquidity walls to rolling realized high/low extremes and ATR from real candles. |
| **CONST-06** | `/server.ts` | `781–782`, `826–836` | `fetchLiveMacroYieldFeed` fallback constants | `nominal10Y=4.26`, `dxy=103.90`, `breakeven=2.22`, `centralBankTide=+0.55` | Implement multi-source real macro waterfall (`^TNX`, `DGS10`, `DFII10`, `T10YIE`, `DX-Y.NYB`, `^TYX`) with median + z-score sanity check and explicit degraded status if macro sources fail. |
| **CONST-07** | `/server.ts` | `866–919` | `computeMultiTimeframeMatrix` synthetic scaling multipliers | `scale: 0.65..3.2`, `volMult: 1.35..0.60` | Compute multi-horizon drift and volatility across empirical bar aggregation windows of the real candle series rather than multiplying single-timeframe volatility by fixed scalars. |
| **CONST-08** | `/server.ts` | `1088–1096` | `calculateGarchVolatility` hardcoded parameters | `alpha = 0.085`, `beta = 0.892` | Estimate empirical GARCH(1,1) parameters from real trailing log-returns via variance-targeted QMLE grid search with stationarity constraint `alpha + beta < 0.992`. |

---

## 4. Self-Referential Percentage Gauges & Uncalibrated Confidence Bars (Cataloged for Phase 1 & Phase 2 Remediation)

| ID | File Path | Baseline Lines | UI / Telemetry Element | Baseline Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **GAUGE-01** | `/server.ts` | `554–556`, `596` | `AdaptiveDPObserver.convergenceConfidence` | Heuristic formula `95.5 - Math.abs(contInnovation) * 0.65` clamped to `[65, 99.2]%`. |
| **GAUGE-02** | `/server.ts` | `1356–1502` | `computeDataReliability` | Hardcodes `spotScore = isSynthetic ? 84.5 : 99.4`, `macroScore = 98.8`, `basisScore = 98.4`, `pcaScore = 99.6` and blends them into `compositeReliabilityPct`. |
| **GAUGE-03** | `/index.html` | `2360`, `3094`, `6091–6171` | `#reliabilityBtnText`, `#relCompositeScore`, `updateDataReliabilityUI` | Displays `🛡️ Data Reliability: 99.2%` and `"Parity Consensus 100%"` (line 6169). |
| **GAUGE-04** | `/index.html` | `2403`, `2405`, `3195–3196`, `3358–3359`, `6358–6365` | `#domBearLabel` (`Bear Kill 100%`), `#domBullLabel` (`100% Bull Lift`) | Uncalibrated heuristic dominance bar derived from `50 + totalForce * 14` clamped to `[8, 92]%`. |
| **GAUGE-05** | `/index.html` | `2863`, `5780` | `#dpConfidence` (`Observer Confidence`) | Displays `95.0%` static HTML default and renders heuristic `observerTelemetry.convergenceConfidence`. |
| **GAUGE-06** | `/index.html` | `885–919` (`server.ts`), `5995–6045` (`index.html`) | `bullProb` / `bearProb` in Multi-Timeframe Matrix | Heuristic `Math.min(88, Math.round(62 + netVelocity * 12))` displayed as percentage probability. |
