# GDF (Gold Dynamic Flow) — Quantitative Market-State & Forecasting Platform

An institutional-grade, bilingual (English / Persian فارسی) quantitative-finance and market-analysis platform for Gold (`PAXG/USD` Spot Token, `XAU/USD` Spot Proxies, and `GC=F` COMEX Futures).

GDF models market price as the observable footprint of a low-dimensional **Latent Market State** evolving on a **Volume-Synchronized Information Clock ($\Delta\tau$)**, observed across multiple noisy market venues, and continuously audited through **Out-of-Sample Forecast Residual Analysis** and an **Alternative Forecast Scenario (Parallel Universe Discovery Core)**.

---

## 1. Core Quantitative & Econometric Architecture

- **Volume-Synchronized Time / Information Clock ($\Delta\tau_t$)**: Replaces uniform wall-clock steps with an activity-driven clock combining relative bar volume, true-range expansion over ATR(14), and intrabar trade intensity.
- **Adaptive Market-State Estimator (Scalar-Gain Kalman Observer & 6D Scientific Core)**: Tracks latent fair-value price level ($p_\tau$), drift velocity ($v_\tau$), curvature/acceleration ($a_\tau$), liquidity resilience ($l_\tau$), and empirical-Bayes shrunk drift ($b_t^*$) with a $3\sigma$ Mahalanobis jump gate.
- **GARCH(1,1) Conditional Volatility & Volatility Regimes**: QML-calibrated Bollerslev GARCH(1,1) conditional variance governing horizon-expanding **Predictive Intervals / Forecast Uncertainty Bands ($\pm 1\sigma$ / 68% and $\pm 2\sigma$ / 95%)**.
- **Exogenous Market Drivers & Cross-Asset Sensitivity**: Live macro ingestion of 10-Year US TIPS Real Yields (`DFII10`), 10-Year Nominal Treasury Yields (`US10Y`), US Dollar Index (`DXY`), and Breakeven Inflation (`T10YIE`), projected via a 3-factor macro alignment index (`MACRO_PCA_3FACTOR_PROXY`).
- **Instrument Basis Adjustment**: Rolling EWMA spread and $Z$-score calibration (`BASIS_ZSCORE_PROXY`) between COMEX Gold Futures (`GC=F`) and spot gold proxies (`PAXG/USD`), explicitly respecting instrument provenance.
- **Order-Flow Imbalance (OFI) & Liquidity-Sweep Versus Breakout Classifier**: Qualified OHLCV microstructure proxies (`BULK_VOLUME_VPIN_PROXY`, `SWEEP_LOG_ODDS_PROXY`, `ABSORPTION_INITIATION_FLOW_PROXY`) that distinguish resting-liquidity absorption and stop-loss sweeps from structural initiation breakouts.
- **Forecast Residual Analysis & Adaptive Model Evaluation**: Real-time decomposition of realized-minus-predicted primary trajectory residuals ($e_t = P_t - \hat{P}_{t|t-1}$), Ljung-Box $Q(5)$ serial correlation testing, causal zero-lookahead walk-forward validation across horizons $h \in \{1, 5, 15, 60\}$, and an 8-gate Diebold-Mariano / CVaR-95 verifier governing promotion of the **Candidate Forecast Trajectory (Magenta Line)** to the **Primary Forecast Trajectory (Yellow Line)**.

---

## 2. Bilingual Financial Terminology & Epistemic Transparency (EN / FA)

All user-facing concepts, estimator specifications, tooltips, and 3D Market Theatre layers are governed by a centralized **Bilingual Financial Terminology Dictionary** (`src/config/financialDictionary.ts`, exposed via `GET /api/terminology`) and **Model Specification Registry** (`src/config/modelSpecRegistry.ts`, exposed via `GET /api/model-specs`):

- **Epistemic Badges**: Every metric is explicitly classified as `[RAW OBSERVATION]` / `[مشاهده خام]`, `[FILTERED ESTIMATE]` / `[تخمین فیلترشده]`, or `[HEURISTIC PROXY]` / `[پروکسی ابتکاری]`.
- **Estimator Fidelity**: Every quantitative model is audited as either `VERIFIED_EXACT` or `QUALIFIED_PROXY` with explicit disclosure of equations, inputs, degrees of freedom, and structural limitations.
- **Persian Typography & RTL Engineering**: Enforces standard Persian Yeh (`ی` U+06CC), Persian Kaf (`ک` U+06A9), proper Zero-Width Non-Joiners (`نیم‌فاصله` U+200C), and strict LTR bidirectional isolation (`dir="ltr"`, `unicode-bidi: isolate`) for mathematical formulas, prices, signed percentages, and ticker symbols.

---

## 3. Cinematic 2D & 3D Visualization Layers

- **2D Scientific Chart (`#windyCanvas`)**: Continuous green↔red buy/sell pressure spectrum candles with relative-volume luminosity, Waiting-Money resting liquidity heat zones, Windy-style liquidity streamlines (with adaptive `Full / Lite / Off` performance modes), **Primary Forecast Trajectory** (solid yellow), **Candidate Forecast Trajectory** (dashed magenta), and $\pm 1\sigma / \pm 2\sigma$ uncertainty bands.
- **3D Market Theatre (`#threeGlobeStage`)**: Synchronized 1-to-1 with the verified 2D state across six canonical cinematic layers:
  1. **Arena** — Live spot execution ring and order-flow shockwaves.
  2. **Bull and Bear Titans** — Opposing directional order-flow pressure sculptures driven by intrabar Close Location Value, wick rejection, and absorption Z-scores.
  3. **Graveyard** — Spatial archive of historical bars, swept stop clusters, and invalidated support/resistance relics.
  4. **Deep Terrain** — Multi-timeframe liquidity depth topography (`Monthly → 5m` POC, VAH, VAL, HVN bastions, and LVN channels).
  5. **Macro Sky** — Exogenous cross-asset canopy driven by real yields, DXY, and GARCH volatility.
  6. **Historical Replay** — Deterministic bar-by-bar time scrubbing synchronized between the 2D chart and 3D Market Theatre.

---

## 4. Strict Real-Data Governance & Verification Suites

GDF enforces `STRICT_REAL_DATA_ONLY = true`. If all upstream market tiers degrade or fail quorum checks, the system enters `HALTED_DEGRADED` circuit-breaker stasis and freezes filter covariance rather than generating synthetic data.

### Running Verification & Terminology Audits

```bash
npm install
npx tsx scripts/check-bilingual-terminology.ts
npx tsx scripts/check-phase3-spec-parity.ts
npx tsx scripts/check-phase4-confidence-metrics.ts
npx tsx scripts/check-phase5-validation-and-html-guard.ts
npx tsx scripts/check-phase6-cognitive-hierarchy.ts
npx tsx scripts/check-parallel-universe-core.ts
npx tsx scripts/check-scientific-core.ts
npm run dev
```
