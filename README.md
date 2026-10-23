# GDF — Gold Dynamic Flow (`gold-quant-api`)

**Institutional Quantitative Decision Engine, Hydrodynamic Flow & 3D Morse Potential Manifold**

![GDF Banner](public/icons/icon-512.png)

GDF (Gold Dynamic Flow) is a production-grade quantitative decision engine and telemetry terminal designed for **XAU/USD (Spot Gold / PAXG)**. Moving beyond static technical indicators, GDF bridges slow sovereign macroeconomic capital flows with high-frequency micro-structural auction mechanics across both a 2D hydrodynamic vector canvas and a WebGL **3D Spatial Morse Potential Globe Viewport**.

---

## 🌟 Key Features

1. **Hybrid Volume-Clock Subordinator ($\tau$) & EKF Engine**:
   - Normalizes informational entropy across quiet Asian sessions and volatile NY COMEX crosses by subordinatng wall-clock time ($t$) to Intrinsic Volume Time ($\tau$).
   - Dynamically scales process noise covariance ($Q_\tau$) with a dead-zone heartbeat ceiling ($\Delta t_{\max}$) to prevent covariance starvation or explosion.
2. **Bayesian Log-Odds Sweep Discriminator**:
   - Distinguishes true structural macro breakouts from primary dealer inventory clearance sweeps (stop-runs) by fusing absorption volume, Hawkes self-exciting jump intensity, and cross-asset macro residuals.
   - Protects macro-aligned positions from false VPIN toxicity exits during temporary stop-hunting excursions (`SWEEP SHIELD` state).
3. **3D Spatial Morse Potential Manifold & Volumetric Globe World**:
   - Interactive Three.js WebGL 3D world accessible directly from the chart header (`🌐` button next to Fullscreen).
   - Visualizes the **Coupled Morse Potential Surface** combining the smooth Wicksellian Macro Gravity Bowl with rugged Dealer Inventory Gamma Walls & Liquidity Canyons.
   - Real-time **Volumetric Bull vs. Bear Candle Clash** particle physics inside active candles, EKF Kalman Laser Telemetry beams, and 3D Monte Carlo trajectory tubes.
4. **2D Hydrodynamic Streamline Vector Field**:
   - Real-time 60 FPS vector field simulating fluid flow, turbulence fronts, and streamline momentum across 1m, 5m, 15m, 30m, 1h, 4h, and 1D scales.
5. **Marine Dynamic Positioning (DP) Observer State-Space System**:
   - Huber Jump-Gated Extended Kalman Filter (EKF) separating continuous unmeasured institutional drift ($b_t$) from jump dislocations.
   - Volume-Synchronized Probability of Toxicity (VPIN) flow-toxicity metric and Empirical Bayes shrinkage ($\kappa_t$).
6. **Merton Jump-Diffusion & GJR-GARCH Volatility Ensemble**:
   - 100-path stochastic Monte Carlo simulation with continuous Gaussian diffusion and Poisson discrete jumps.
   - Multi-layer confidence cones (90% outer plume, 50% core band, median trajectory).
7. **Live Macro Stream Ingestion & PCA Vector Orthogonalization**:
   - Ingestion of 10Y TIPS Real Yield (`DFII10`), DXY Dollar Index, and Breakeven Inflation.
   - Principal Component Analysis (PCA) rotating 8 gold macro theories into 3 mutually orthogonal factors.
8. **Institutional Chart Controls, Bilingual UI (EN/FA) & PWA**:
   - Full touch & desktop mouse navigation, interactive drawing suite (Trendlines, Fibonacci, Horizontal Rays), 17 configurable indicators, English/Farsi RTL support, and installable offline-capable PWA.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or 20+
- npm or bun

### Installation
```bash
# Clone the repository
git clone https://github.com/Esmaeil9090/gold-quant-api.git

# Enter project directory
cd gold-quant-api

# Install dependencies
npm install

# Start local development server (runs on http://localhost:3000)
npm run dev
```

### Production Build & Deployment
```bash
# Build TypeScript / verify bundle
npm run build

# Start production server
npm start
```

---

## 📁 Project Structure

```
├── server.ts              # Express server with Volume-Clock EKF, Sweep Discriminator & Macro/Micro engines
├── index.html             # High-performance 2D Canvas + 3D Three.js Morse Manifold Globe UI & HUD
├── public/
│   ├── manifest.webmanifest # PWA Web App Manifest
│   ├── sw.js              # Service Worker for offline caching
│   └── icons/             # Multi-resolution GDF shield app icons (PNG & SVG)
├── package.json           # Dependencies & build scripts
├── tsconfig.json          # TypeScript compiler configuration
└── metadata.json          # AI Studio platform configuration
```

---

## 📐 Core Mathematical Architecture

### 1. Volume-Synchronized Clock Subordinator ($\tau$)
$$\Delta \tau_k = \frac{V_k}{\bar{V}_{\text{bucket}}}, \qquad \Delta \tau_{\text{eff}} = \min\!\left(\max(\Delta \tau_k, \epsilon_\tau),\, \Delta \tau_{\max}\right)$$
$$Q_k(\Delta \tau_{\text{eff}}) = Q_0 \cdot \Delta \tau_{\text{eff}} + Q_{\text{floor}} \cdot \min(\Delta t_k, \Delta t_{\max})$$

### 2. Log-Odds Sweep vs. Breakout Discriminator ($L_k$)
$$L_k = \lambda_0 L_{k-1} + w_{\text{abs}} Z_{\text{absorption},k} + w_{\text{div}} Z_{\text{macro\_div},k} - w_{\text{follow}} Z_{\text{follow\_through},k}$$
$$P(\text{Sweep}_k) = \frac{1}{1 + e^{-L_k}}$$

### 3. Coupled Morse Potential Manifold ($U(p, \tau)$)
$$U(p, \tau) = D_e \left(1 - e^{-a(p - p_{\text{macro}}(\tau))}\right)^2 + \sum_{j} A_j \exp\!\left(-\frac{(p - L_j)^2}{2\sigma_j^2}\right)$$

---

## 📄 License
MIT License. Created for institutional quantitative research and algorithmic decision support.

