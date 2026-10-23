/**
 * GDF Client Core Module (Phase 2 & Phase 3 Frontend Modularization & Model Registry)
 * Provides client-side contract validation, circuit-breaker banner controller,
 * zero-synthetic provenance verification, and the interactive Bilingual Model Specification
 * Inspection Drawer for the 3D Hydrodynamic / Morse HUD.
 */
(function (global) {
  'use strict';

  const TIMEFRAME_STEPS = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
  };

  /**
   * Code-backed Model Specification Registry mirror (synced with /src/config/modelSpecRegistry.ts)
   */
  let MODEL_SPEC_REGISTRY = {
    OU_EQUILIBRIUM_ANCHOR: {
      id: 'OU_EQUILIBRIUM_ANCHOR',
      classification: 'VERIFIED_EXACT',
      uiCurrentLegacyLabelEn: 'Equilibrium Geopotential Anchor',
      honestLabelEn: '40-Bar OU Rolling Equilibrium [Viz: Geopotential Anchor]',
      honestLabelFa: 'تعادل میانگین متحرک ۴۰ دوره‌ای OU [لایه بصری: لنگر ژئوپتانسیل]',
      visualizationLayerEn: 'Geopotential Equilibrium Isobar & Gravitational Attractor',
      visualizationLayerFa: 'خط هم‌فشار تعادل ژئوپتانسیل و جاذب گرانشی',
      mathClassEn: 'Discrete-time Ornstein-Uhlenbeck (AR(1)) rolling sample mean anchor with empirical autocorrelation half-life.',
      mathClassFa: 'میانگین متحرک گسسته ارنشتاین-اولنبک (AR(1)) با نیمه‌عمر خودهمبستگی تجربی.',
      equationLatexOrAscii: 'mu_eq(t) = (1/40) * sum_{k=0}^{39} P_{t-k},   dP_t = kappa_OU * (mu_eq - P_t) dt + sigma dW_t',
      inputDataFeeds: [
        'Tier-1 Binance PAXG/USDT OHLCV Closes',
        'Tier-2 Yahoo Finance GC=F / PAXG-USD Closes',
        'Tier-3 Kraken PAXG/USD Closes',
      ],
      samplingAndLookbackEn: 'Bar close frequency (1m to 1d); 40-bar rolling equilibrium window; 120-bar OLS AR(1) calibration window.',
      samplingAndLookbackFa: 'فرکانس بسته شدن کندل (۱ دقیقه تا روزانه)؛ پنجره تعادلی ۴۰ کندلی؛ پنجره ۱۲۰ کندلی رگرسیون AR(1).',
      dofAndCalibrationEn: 'df = N - 2 (typically 118 dof); ordinary least squares (OLS) lag-1 autoregression beta_1 -> kappa_OU = -ln(beta_1).',
      dofAndCalibrationFa: 'درجه آزادی N-2 (معمولاً ۱۱۸)؛ کمترین مربعات معمولی (OLS) خودهمبستگی مرتبه اول.',
      structuralLimitationsEn: 'Assumes locally stationary mean reversion over a 40-bar horizon; lags during persistent structural trend breakouts.',
      structuralLimitationsFa: 'فرض ایستایی موضعی بازگشت به میانگین در افق ۴۰ کندلی؛ دارای تأخیر فاز در روندهای جهت‌دار قوی.',
    },
    MACRO_FACTOR_DRIFT: {
      id: 'MACRO_FACTOR_DRIFT',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'Macro Wind Velocity / FRED US Treasury Feed',
      honestLabelEn: 'Linear Macro Factor Drift Proxy [Viz: Macro Wind Velocity]',
      honestLabelFa: 'پروکسی خطی رانش فاکتورهای کلان [لایه بصری: سرعت باد کلان]',
      visualizationLayerEn: 'Atmospheric Wind Streamlines & Synoptic Lift Vector',
      visualizationLayerFa: 'خطوط جریان باد اتمسفری و بردار صعود سینوپتیک',
      mathClassEn: 'Linear affine factor combination of 10Y TIPS real yield, DXY dollar index, and central bank liquidity baseline.',
      mathClassFa: 'ترکیب خطی آفین از بازده واقعی TIPS ده‌ساله، شاخص دلار (DXY) و پایه نقدینگی بانک مرکزی.',
      equationLatexOrAscii: 'v_macro = -1.65*(TIPS_10Y - 1.85) - 0.14*(DXY - 103.5) + CB_Tide',
      inputDataFeeds: [
        'US Treasury FiscalData API (Avg Interest Rates)',
        'Yahoo Finance ^TNX (10Y Nominal), TIP ETF, DX-Y.NYB (DXY)',
        'FRED DFII10 / DGS10 / DTWEXBGS CSV Streams',
      ],
      samplingAndLookbackEn: 'Polled every 10s with daily/intraday macro benchmark marks.',
      samplingAndLookbackFa: 'به‌روزرسانی هر ۱۰ ثانیه بر اساس آخرین نرخ‌های رسمی روزانه و درون‌روزی بازار کلان.',
      dofAndCalibrationEn: '3 linear factor sensitivities calibrated to historical gold-to-real-yield and gold-to-DXY beta regimes.',
      dofAndCalibrationFa: '۳ ضریب حساسیت خطی کالیبره‌شده بر اساس بتای تاریخی طلا به بازده واقعی و شاخص دلار.',
      structuralLimitationsEn: 'Linear static sensitivities do not capture regime-switching non-linear convexity or intraday FOMC announcement jumps; when live FRED/Treasury TIPS series is delayed, real yield is inferred from ^TNX and TIP ETF.',
      structuralLimitationsFa: 'ضرایب خطی ثابت، غیرخطی‌بودن تغییر رژیم یا پرش‌های لحظه‌ای بیانیه‌های فدرال رزرو را مدل نمی‌کنند.',
    },
    GARCH_CONDITIONAL_VOL: {
      id: 'GARCH_CONDITIONAL_VOL',
      classification: 'VERIFIED_EXACT',
      uiCurrentLegacyLabelEn: 'GARCH Atmospheric Turbulence',
      honestLabelEn: 'GARCH(1,1) Conditional Volatility [Viz: Atmospheric Turbulence]',
      honestLabelFa: 'نوسان‌پذیری شرطی GARCH(1,1) [لایه بصری: تلاطم اتمسفری]',
      visualizationLayerEn: 'Hurricane Ensemble Dispersion Cone & Isobaric Turbulence',
      visualizationLayerFa: 'مخروط پراکندگی شبیه‌سازی توفان و تلاطم هم‌فشار',
      mathClassEn: 'Bollerslev (1986) GARCH(1,1) conditional variance recursion calibrated via Gaussian Quasi-Maximum Likelihood (QML).',
      mathClassFa: 'رابطه بازگشتی واریانس شرطی بولرسلو (۱۹۸۶) GARCH(1,1) کالیبره‌شده با شبه‌حداکثر درست‌نمایی گوسی (QML).',
      equationLatexOrAscii: 'sigma_t^2 = omega + alpha * r_{t-1}^2 + beta * sigma_{t-1}^2,   alpha + beta < 1',
      inputDataFeeds: [
        'Verified OHLCV Log-Returns r_t = ln(C_t / C_{t-1}) from active Gold Waterfall tier',
      ],
      samplingAndLookbackEn: 'Bar close frequency; up to 250 trailing real log-returns.',
      samplingAndLookbackFa: 'فرکانس بسته شدن کندل؛ حداکثر ۲۵۰ بازده لگاریتمی واقعی اخیر.',
      dofAndCalibrationEn: '3 parameters (omega, alpha, beta) estimated via constrained QML grid optimization over stationarity domain (alpha + beta <= 0.985).',
      dofAndCalibrationFa: '۳ پارامتر (امگا، آلفا، بتا) برآوردشده با بهینه‌سازی شبکه‌ای QML تحت قید ایستایی.',
      structuralLimitationsEn: 'Symmetric GARCH(1,1) response does not model leverage asymmetry (EGARCH/GJR-GARCH) or intraday microstructure noise below 1m.',
      structuralLimitationsFa: 'مدل متقارن GARCH(1,1) عدم تقارن اهرمی (EGARCH) یا نویز ریزساختار زیر ۱ دقیقه را تفکیک نمی‌کند.',
    },
    PCA_MACRO_PROJECTION: {
      id: 'PCA_MACRO_PROJECTION',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'PCA Orthogonal Macro Vectors',
      honestLabelEn: '3-Factor Orthogonalized Macro Projection Proxy [Viz: PCA Vectors]',
      honestLabelFa: 'پروکسی تصویر متعامد ۳ عاملی کلان [لایه بصری: بردارهای PCA]',
      visualizationLayerEn: '3-Axis Orthogonal Force Vector Decomposition',
      visualizationLayerFa: 'تجزیه بردار نیرو در ۳ محور متعامد',
      mathClassEn: 'Fixed-loading orthogonal linear projection of 8 normalized macro/market Z-scores onto 3 composite axes (F1 Real Rates, F2 Liquidity, F3 Tail Convexity) with empirical return/volume correlation conditioning.',
      mathClassFa: 'تصویر خطی با وزن‌های ثابت از ۸ نمره استاندارد (Z-score) کلان و بازار بر روی ۳ محور ترکیبی (نرخ واقعی، نقدینگی، تحدب دم).',
      equationLatexOrAscii: 'F_1 = 0.58*Z_1 + 0.52*Z_2 + 0.48*Z_3,  F_2 = 0.64*Z_4 + 0.58*Z_5,  F_3 = 0.55*Z_6 + 0.48*Z_7 + 0.42*Z_8',
      inputDataFeeds: [
        'Verified Macro Waterfall (10Y Nominal, 10Y TIPS, Breakeven, DXY, CB Tide)',
        'Active Gold OHLCV Bar Volatility & Cross-Venue Basis Z-Score',
      ],
      samplingAndLookbackEn: 'Updated every forecast cycle over 60-bar empirical return/volume correlation matrix.',
      samplingAndLookbackFa: 'به‌روزرسانی در هر چرخه پیش‌بینی بر اساس ماتریس همبستگی ۶۰ کندلی بازده و حجم.',
      dofAndCalibrationEn: '8 standardized macro/market inputs projected via analytical fixed factor loadings; condition number kappa derived from 2x2 return-volume correlation eigenvalues.',
      dofAndCalibrationFa: '۸ ورودی استانداردشده تصویرشده با بارهای عاملی تحلیلی؛ عدد شرط ماتریس از مقادیر ویژه همبستگی بازده و حجم.',
      structuralLimitationsEn: 'Uses analytical domain-orthogonal factor weights rather than a rolling high-dimensional SVD eigendecomposition across 8 full historical macro time series.',
      structuralLimitationsFa: 'به جای تجزیه مقادیر منفرد (SVD) غلتان بر روی سری‌های زمانی بلندمدت ۸ متغیر کلان، از وزن‌های متعامد تحلیلی ثابت استفاده می‌کند.',
    },
    CROSS_VENUE_BASIS_PROXY: {
      id: 'CROSS_VENUE_BASIS_PROXY',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'Cointegration Basis Filter',
      honestLabelEn: 'Rolling Cross-Venue Basis Z-Score Proxy [Viz: Cointegration Filter]',
      honestLabelFa: 'پروکسی نمره Z اسپرد غلتان بین‌بازاری [لایه بصری: فیلتر هم‌انباشتگی]',
      visualizationLayerEn: 'Cross-Venue Arbitrage Tether & Purged Spot Anchor',
      visualizationLayerFa: 'مهار آربیتراژ بین‌بازاری و لنگر قیمت نقدی پالایش‌شده',
      mathClassEn: '30-bar rolling empirical spread mean, standard deviation, Z-score, and 35%-shrunk basis adjustment between primary spot venue and secondary gold benchmark.',
      mathClassFa: 'میانگین، انحراف معیار و نمره Z غلتان ۳۰ کندلی اسپرد بین بازار اصلی و بنچمارک ثانویه طلا.',
      equationLatexOrAscii: 'delta_t = P_primary - P_secondary,   Z_t = (delta_t - mu_30) / sigma_30,   P_purged = P_primary - 0.35*(delta_t - mu_30)',
      inputDataFeeds: [
        'Primary Venue (Binance PAXG/USDT or active tier)',
        'Secondary Venue Benchmark (Yahoo COMEX GC=F, PAXG-USD, or Kraken PAXG/USD)',
      ],
      samplingAndLookbackEn: '30-bar rolling window aligned across primary and secondary OHLCV timestamps.',
      samplingAndLookbackFa: 'پنجره غلتان ۳۰ کندلی هم‌ترازشده بین کندل‌های بازار اول و دوم.',
      dofAndCalibrationEn: 'df = 29; rolling sample mean and sample standard deviation with floor sigma >= 0.35 USD.',
      dofAndCalibrationFa: 'درجه آزادی ۲۹؛ میانگین و انحراف معیار نمونه‌ای غلتان با کف انحراف معیار ۰.۳۵ دلار.',
      structuralLimitationsEn: 'Measures rolling 1st-moment spread Z-score with fixed beta = 1 rather than a formal Johansen trace/eigenvalue cointegration vector or Augmented Dickey-Fuller stationarity test.',
      structuralLimitationsFa: 'نمره Z اسپرد را با فرض بتای برابر ۱ محاسبه می‌کند و آزمون رسمی هم‌انباشتگی جوهانسن یا دیکی-فولر تعمیم‌یافته (ADF) را اجرا نمی‌کند.',
    },
    SWEEP_LOG_ODDS_PROXY: {
      id: 'SWEEP_LOG_ODDS_PROXY',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'Sweep Discriminator & Morse Well / Hawkes λ',
      honestLabelEn: 'OHLCV Wick-Volume Sweep Log-Odds Proxy [Viz: Sweep Discriminator]',
      honestLabelFa: 'پروکسی لگاریتم شانس شدو-حجم استاپ‌هانت [لایه بصری: تفکیک‌گر جاروب نقدینگی]',
      visualizationLayerEn: 'Liquidity Stop-Sweep Classifier & Self-Exciting Burst Indicator',
      visualizationLayerFa: 'طبقه‌بند جاروب نقدینگی و شاخص خوشه‌بندی نوسان',
      mathClassEn: 'Linear log-odds discriminator standardized into empirical Z-scores and historical percentile ranks (P5–P95) with ±1 SE uncertainty bands over the trailing real-data distribution.',
      mathClassFa: 'تفکیک‌گر لگاریتم شانس استانداردشده به نمره Z تجربی و رتبه صدکی (P5 تا P95) همراه با باند عدم قطعیت خطای استاندارد (±1 SE).',
      equationLatexOrAscii: 'L_t = b_0 + w_1*(Wick/Range) + w_2*V_rel + w_3*VPIN_proxy + w_4*Lambda_decay - w_5*MacroAlign,   Z_{L,t} = (L_t - mu_L) / sigma_L',
      inputDataFeeds: [
        'Verified OHLCV High, Low, Open, Close, and Volume bars',
      ],
      samplingAndLookbackEn: 'Bar close frequency; 12-bar trailing exponential decay kernel; 60-bar empirical distribution lookback.',
      samplingAndLookbackFa: 'فرکانس بسته شدن کندل؛ هسته میرایی نمایی ۱۲ کندل اخیر؛ پنجره توزیع تجربی ۶۰ کندلی.',
      dofAndCalibrationEn: 'Empirical Z-score Z_{L,t} and percentile rank P5–P95 with standard error SE(z) = sqrt((1 + z^2/2)/N) over N trailing real bars.',
      dofAndCalibrationFa: 'نمره Z تجربی و رتبه صدکی P5 تا P95 همراه با خطای استاندارد SE(z) بر روی N کندل واقعی اخیر.',
      structuralLimitationsEn: 'Inferred strictly from OHLCV bar geometry and volume; does not ingest Level-2/Level-3 limit order book depth, resting stop-order queues, or tick-level Hawkes point-process arrival timestamps.',
      structuralLimitationsFa: 'صرفاً از هندسه کندل‌های OHLCV و حجم استنتاج شده و به عمق دفتر سفارشات (L2/L3) یا زمان‌بندی تیک‌به‌تیک فرآیند نقطه‌ای هاکس دسترسی ندارد.',
    },
    MORSE_POTENTIAL_MANIFOLD: {
      id: 'MORSE_POTENTIAL_MANIFOLD',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: '3D Coupled Morse Potential Manifold & Gamma Walls',
      honestLabelEn: 'Anharmonic Price Potential & ATR Barrier Proxy [Viz: Morse Manifold]',
      honestLabelFa: 'پروکسی پتانسیل ناهماهنگ قیمت و سدهای ATR [لایه بصری: منیفولد مورس]',
      visualizationLayerEn: '3D Coupled Morse Potential Energy Well & Gaussian Barrier Ridges',
      visualizationLayerFa: 'چاه انرژی پتانسیل مورس سه‌بعدی و دیواره‌های گوسی',
      mathClassEn: 'Anharmonic Morse potential function U(P) = D_e*(1 - exp(-alpha*(P - P_eq)))^2 superimposed with 3 ATR-scaled Gaussian barrier functions.',
      mathClassFa: 'تابع پتانسیل ناهماهنگ مورس به همراه ۳ تابع مانع گوسی مقیاس‌یافته با ATR.',
      equationLatexOrAscii: 'U(P) = D_e * (1 - exp(-alpha*(P - P_eq)))^2 + sum_{j=1}^3 A_j * exp(-(P - K_j)^2 / (2*sigma_j^2))',
      inputDataFeeds: [
        'Verified OHLCV Bars (14-bar ATR, 40-bar Equilibrium Anchor)',
        'GARCH(1,1) Conditional Volatility & Bulk-Volume VPIN Proxy',
      ],
      samplingAndLookbackEn: 'Evaluated continuously across the active price grid using 14-bar ATR and 40-bar equilibrium.',
      samplingAndLookbackFa: 'ارزیابی پیوسته بر روی شبکه قیمت با استفاده از ATR ۱۴ کندلی و تعادل ۴۰ کندلی.',
      dofAndCalibrationEn: 'Well depth D_e and stiffness alpha scaled by empirical ATR and GARCH volatility; barriers placed at +1.10 ATR, -0.95 ATR, and +1.85 ATR.',
      dofAndCalibrationFa: 'عمق چاه و سختی آلفا مقیاس‌یافته با ATR و نوسان GARCH؛ موانع در مضارب ۱.۱۰+، ۰.۹۵- و ۱.۸۵+ برابر ATR.',
      structuralLimitationsEn: 'Barriers ("Gamma Walls") are volatility-scaled ATR support/resistance proxies, not derived from live COMEX/CME options open interest or dealer gamma exposure (GEX) chains.',
      structuralLimitationsFa: 'دیواره‌های قیمتی («دیوارهای گاما») پروکسی‌های حمایت و مقاومت مبتنی بر ATR هستند و از زنجیره قراردادهای اختیار معامله (Options Open Interest / GEX) استخراج نشده‌اند.',
    },
    EKF_STATE_OBSERVER: {
      id: 'EKF_STATE_OBSERVER',
      classification: 'VERIFIED_EXACT',
      uiCurrentLegacyLabelEn: 'Offshore DP Observer State-Space (Extended Kalman Filter)',
      honestLabelEn: 'Scalar-Gain State-Space Kalman Observer [Viz: Marine DP Observer]',
      honestLabelFa: 'ناظر فضای حالت کالمن با بهره اسکالر [لایه بصری: ناظر موقعیت‌یابی دریایی DP]',
      visualizationLayerEn: 'Offshore Dynamic Positioning (DP) Vessel Thruster & Current Tracking',
      visualizationLayerFa: 'ناظر موقعیت‌یابی دینامیک دریایی (DP) و ردیابی جریان',
      mathClassEn: 'Discrete-time recursive scalar Kalman state observer with Mahalanobis 3-sigma outlier gate, Normalized Innovation Squared (NIS) consistency monitor, and empirical-Bayes shrinkage.',
      mathClassFa: 'ناظر بازگشتی گسسته فیلتر کالمن اسکالر با دروازه پرش ۳ سیگمای ماهالانوبیس، پایشگر سازگاری مجذور نوآوری نرمال‌شده (NIS) و انقباض بیزی تجربی.',
      equationLatexOrAscii: 'K_k = P_{k|k-1} / (P_{k|k-1} + R_k),   b_k = b_{k-1} + K_k * e_k,   NIS_k = e_k^2 / S_k',
      inputDataFeeds: [
        'Verified OHLCV Bar Closes & Volumes',
        'Linear Macro Factor Drift Proxy & 40-Bar OU Equilibrium Anchor',
      ],
      samplingAndLookbackEn: 'Recursive state update over trailing 25 verified OHLCV bars per forecast cycle.',
      samplingAndLookbackFa: 'به‌روزرسانی بازگشتی حالت بر روی ۲۵ کندل واقعی اخیر در هر چرخه.',
      dofAndCalibrationEn: 'Process noise Q and measurement noise R calibrated from 60-bar empirical return variance; innovation consistency evaluated via NIS_k = e_tilde_k^2 against chi^2(1) 95% bounds.',
      dofAndCalibrationFa: 'نویز فرآیند Q و نویز اندازه‌گیری R کالیبره‌شده از واریانس تجربی ۶۰ کندل اخیر؛ سازگاری نوآوری با آماره NIS_k.',
      structuralLimitationsEn: 'Linear state observation model with state-dependent noise scaling; filter innovation consistency (NIS) is separated from out-of-sample directional accuracy (which requires N >= 30 realized horizons).',
      structuralLimitationsFa: 'مدل مشاهده خطی با مقیاس‌دهی نویز وابسته به حالت؛ پایداری نوآوری فیلتر (NIS) از دقت پیش‌بینی خارج از نمونه (که نیازمند حداقل ۳۰ نمونه تحقق‌یافته است) کاملاً تفکیک شده است.',
    },
    BULK_VOLUME_VPIN_PROXY: {
      id: 'BULK_VOLUME_VPIN_PROXY',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'VPIN Flow Toxicity',
      honestLabelEn: 'Bulk-Volume VPIN Toxicity Proxy [Viz: Order-Flow Toxicity]',
      honestLabelFa: 'پروکسی سمیت حجم تجمعی VPIN [لایه بصری: سمیت جریان سفارشات]',
      visualizationLayerEn: 'Hydrodynamic Laminar vs. Toxic Flow Turbulence Indicator',
      visualizationLayerFa: 'شاخص جریان لایه‌ای در برابر جریان سمی متلاطم',
      mathClassEn: 'Easley, Lopez de Prado & O’Hara (2012) Normal-CDF Bulk Volume Classification (BVC) order imbalance proxy over a 20-bar rolling window.',
      mathClassFa: 'پروکسی عدم توازن حجم تجمعی مبتنی بر توزیع نرمال تجمع (BVC) در پنجره غلتان ۲۰ کندلی.',
      equationLatexOrAscii: 'V_i^B = V_i * Phi((C_i - O_i) / sigma_{Delta P}),   VPIN_proxy = sum |2*V_i^B - V_i| / sum V_i',
      inputDataFeeds: [
        'Verified OHLCV Open, Close, and Volume bars',
      ],
      samplingAndLookbackEn: '20-bar rolling lookback at active chart timeframe (wall-clock bars).',
      samplingAndLookbackFa: 'پنجره غلتان ۲۰ کندلی در تایم‌فریم فعال چارت (کندل‌های زمانی).',
      dofAndCalibrationEn: 'df = 19; standard deviation of bar price changes sigma_{Delta P} estimated across 20 trailing bars.',
      dofAndCalibrationFa: 'درجه آزادی ۱۹؛ انحراف معیار تغییرات قیمت برآوردشده از ۲۰ کندل اخیر.',
      structuralLimitationsEn: 'Approximates buy/sell volume split from wall-clock OHLCV bar price changes via Gaussian CDF rather than equal-volume bucket sampling of tick-by-tick aggressor-flagged trades.',
      structuralLimitationsFa: 'تفکیک حجم خرید و فروش را با تابع توزیع نرمال روی کندل‌های زمانی تقریب می‌زند و به معاملات تیک‌به‌تیک با برچسب سفارش‌دهنده مهاجم دسترسی ندارد.',
    },
    EMPIRICAL_BAYES_SHRINKAGE: {
      id: 'EMPIRICAL_BAYES_SHRINKAGE',
      classification: 'VERIFIED_EXACT',
      uiCurrentLegacyLabelEn: 'Shrunk Bias (b_t^* · Bayes) / Bayes Shrinkage (κ_t)',
      honestLabelEn: 'Empirical-Bayes Drift Shrinkage (κ_t) [Viz: Damped Bias]',
      honestLabelFa: 'انقباض بیزی تجربی رانش (κ_t) [لایه بصری: انحراف میراشده]',
      visualizationLayerEn: 'Damped Current Restoring Regularizer',
      visualizationLayerFa: 'تنظیم‌کننده میرایی جریان نامشهود',
      mathClassEn: 'Empirical-Bayes / James-Stein style precision shrinkage multiplier mapping raw unmeasured drift toward the zero-drift prior under low volume or high noise.',
      mathClassFa: 'ضریب انقباض بیزی تجربی (مشابه جیمز-استین) برای متمایل کردن رانش خام به سمت پیشین صفر در شرایط کم‌حجم یا پرنویز.',
      equationLatexOrAscii: 'kappa_t = clip(0.15, 0.96, (tau_prior^2 / (tau_prior^2 + sigma_noise^2)) * VolumeFactor),   b_t^* = kappa_t * b_t',
      inputDataFeeds: [
        'EKF Raw Unmeasured Bias (b_t)',
        'Bulk-Volume VPIN Proxy & Relative Bar Volume Ratio',
      ],
      samplingAndLookbackEn: 'Evaluated per bar across the 20-bar rolling volume/volatility window.',
      samplingAndLookbackFa: 'محاسبه به ازای هر کندل در پنجره ۲۰ کندلی حجم و نوسان.',
      dofAndCalibrationEn: 'Bounded in [0.15, 0.96]; prior variance tau_prior^2 and noise variance sigma_noise^2 parameterized by bar volatility and VPIN proxy.',
      dofAndCalibrationFa: 'محدود در بازه [۰.۱۵، ۰.۹۶]؛ واریانس پیشین و نویز پارامترگذاری‌شده با نوسان کندل و پروکسی VPIN.',
      structuralLimitationsEn: 'Scalar shrinkage toward zero prior; in 1D/2D state spaces this acts as ridge/empirical-Bayes regularization rather than a p >= 3 multivariate minimax James-Stein theorem.',
      structuralLimitationsFa: 'انقباض اسکالر به سمت صفر؛ در فضای ۱ یا ۲ بعدی به عنوان منظم‌ساز بیزی تجربی عمل می‌کند (قضیه کلاسیک جیمز-استین نیازمند بعد ۳ به بالاست).',
    },
    VOLUME_CLOCK_SUBORDINATOR_PROXY: {
      id: 'VOLUME_CLOCK_SUBORDINATOR_PROXY',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'Volume-Clock Step (Δτ_k)',
      honestLabelEn: 'Relative Bar-Volume Clock Proxy (Δτ_k) [Viz: Volume Clock]',
      honestLabelFa: 'پروکسی گام ساعت حجمی کندل (Δτ_k) [لایه بصری: ساعت حجمی]',
      visualizationLayerEn: 'Intrinsic Market Activity Time Dilation / Compression',
      visualizationLayerFa: 'انبساط و انقباض زمان ذاتی فعالیت بازار',
      mathClassEn: 'Clark (1973) subordinated time-step proxy defined by current bar volume normalized by 20-bar rolling mean volume.',
      mathClassFa: 'پروکسی گام زمانی تابع کلارک (۱۹۷۳) بر اساس نسبت حجم کندل جاری به میانگین حجم ۲۰ کندل اخیر.',
      equationLatexOrAscii: 'Delta_tau_k = clip(0.12, 3.80, V_k / mean(V_{k-19..k})),   Q_k = Q_base * Delta_tau_k',
      inputDataFeeds: [
        'Verified OHLCV Bar Volume Series',
      ],
      samplingAndLookbackEn: '20-bar rolling mean volume baseline at active wall-clock chart interval.',
      samplingAndLookbackFa: 'میانگین متحرک ۲۰ کندلی حجم در تایم‌فریم زمانی انتخاب‌شده.',
      dofAndCalibrationEn: 'Clamped to [0.12, 3.80] with a 0.35 heartbeat floor guard during ultra-thin liquidity sessions.',
      dofAndCalibrationFa: 'محدودشده در بازه [۰.۱۲، ۳.۸۰] همراه با کف محافظ ۰.۳۵ در ساعات کم‌نقدینگی.',
      structuralLimitationsEn: 'Scales process noise Q_k and measurement noise R_k on wall-clock OHLCV bars rather than re-sampling raw trade ticks into true equal-volume bars.',
      structuralLimitationsFa: 'ضرایب نویز Q و R را روی کندل‌های زمانی مقیاس‌دهی می‌کند و داده‌های تیک را به کندل‌های هم‌حجم واقعی بازنمونه‌برداری نمی‌کند.',
    },
    MAHALANOBIS_TAIL_JUMP_GATE: {
      id: 'MAHALANOBIS_TAIL_JUMP_GATE',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'Huber Jump Gate / Merton Jump-Diffusion',
      honestLabelEn: 'Mahalanobis 3σ Jump Gate & Tail Intensity Proxy [Viz: Jump Gate]',
      honestLabelFa: 'دروازه پرش ۳ سیگمای ماهالانوبیس و پروکسی شدت پرش [لایه بصری: گیت پرش]',
      visualizationLayerEn: 'Poisson Shock Bulkhead & Drift Freeze Valve',
      visualizationLayerFa: 'دیواره ضربه‌گیر شوک پوآسون و شیر توقف رانش',
      mathClassEn: 'Studentized innovation threshold gate (|e_tilde| > 3.0 sigma) with Huber-style innovation clipping and empirical tail-exceedance rate proxy.',
      mathClassFa: 'گیت آستانه خطای نوآوری استانداردشده (بیش از ۳ سیگما) با برش راباست هوبر و نرخ فراگذری دم توزیع.',
      equationLatexOrAscii: '|e_tilde_k| = |e_k| / sqrt(P_{k|k-1} + R_k),   Gate = FREEZE if |e_tilde_k| > 3.0',
      inputDataFeeds: [
        'EKF Innovation Residual e_k and Predictive Variance S_k = P_{k|k-1} + R_k',
      ],
      samplingAndLookbackEn: 'Evaluated at every bar step across 120-bar tail exceedance calibration window.',
      samplingAndLookbackFa: 'ارزیابی در هر گام کندل همراه با پنجره کالیبراسیون ۱۲۰ کندلی فراگذری دم.',
      dofAndCalibrationEn: '3.0-sigma gating threshold; jump intensity lambda calibrated from empirical frequency of |Z| > 2.5 returns.',
      dofAndCalibrationFa: 'آستانه گیت ۳.۰ سیگما؛ شدت پرش لاندای کالیبره‌شده از فراوانی تجربی بازده‌های بیش از ۲.۵ سیگما.',
      structuralLimitationsEn: 'Uses a discrete 1D studentized innovation gate and empirical tail-count rate rather than continuous-time Merton (1976) Poisson-Gaussian mixture maximum likelihood deconvolutions.',
      structuralLimitationsFa: 'از گیت گسسته ۱ بعدی خطای استانداردشده و شمارش تجربی دم استفاده می‌کند، نه تخمین درست‌نمایی مخلوط پوآسون-گوسی زمان پیوسته مرتون (۱۹۷۶).',
    },
    MTF_SIGNAL_TO_NOISE_MATRIX: {
      id: 'MTF_SIGNAL_TO_NOISE_MATRIX',
      classification: 'QUALIFIED_PROXY',
      uiCurrentLegacyLabelEn: 'Multi-Timeframe Atmospheric Regime Matrix (Reynolds Re)',
      honestLabelEn: 'Multi-Horizon Drift-to-Volatility Signal Matrix [Viz: Reynolds Regime]',
      honestLabelFa: 'ماتریس نسبت سیگنال رانش به نوسان چندافقی [لایه بصری: رژیم رینولدز]',
      visualizationLayerEn: 'Multi-Scale Atmospheric Regime & Reynolds Number Flow Classification',
      visualizationLayerFa: 'طبقه‌بندی رژیم اتمسفری چندمقیاسی و عدد رینولدز جریان',
      mathClassEn: 'Dimensionless drift-to-volatility signal ratio and standardized empirical directional pressure (Z-score & P5–P95 percentile rank with ±1 SE uncertainty band) across M5–D1 horizons.',
      mathClassFa: 'نسبت بی‌بعد سیگنال رانش به نوسان‌پذیری و فشار جهتی استانداردشده تجربی (نمره Z و رتبه صدکی P5 تا P95 با باند عدم قطعیت ±1 SE) در افق‌های M5 تا D1.',
      equationLatexOrAscii: 'Re_proxy = round((|v_h| / max(0.08, sigma_emp,h)) * 1250),   Z_{P,h} = (Pi_h - mu_Pi) / sigma_Pi',
      inputDataFeeds: [
        'Active Timeframe EKF Drift Velocity, Empirical Slice Volatility, and Macro Factor Lift',
      ],
      samplingAndLookbackEn: 'Evaluated every forecast cycle across 5 standardized horizon slices (12, 24, 48, 72, 96 bars).',
      samplingAndLookbackFa: 'ارزیابی در هر چرخه پیش‌بینی در ۵ برش افق زمانی استاندارد (۱۲، ۲۴، ۴۸، ۷۲ و ۹۶ کندل).',
      dofAndCalibrationEn: 'Horizon scaling factors [0.45, 1.0, 2.1, 4.2, 8.5] with sample-size standard error SE(z) = sqrt((1 + z^2/2)/N_slice).',
      dofAndCalibrationFa: 'ضرایب مقیاس افق زمانی همراه با خطای استاندارد حجم نمونه SE(z).',
      structuralLimitationsEn: '"Reynolds Number (Re)" is a hydrodynamic visualization metaphor for the financial drift-to-volatility ratio; directional pressure is reported as an empirical Z-score and P5–P95 rank rather than a calibrated probability.',
      structuralLimitationsFa: '«عدد رینولدز (Re)» یک استعاره بصری هیدرودینامیکی برای نسبت رانش به نوسان مالی است و فشار جهتی به صورت نمره Z تجربی و رتبه صدکی P5–P95 گزارش می‌شود.',
    },
  };

  let activeSpecId = 'EKF_STATE_OBSERVER';

  function syncModelSpecRegistry(serverRegistry) {
    if (serverRegistry && typeof serverRegistry === 'object') {
      MODEL_SPEC_REGISTRY = Object.assign({}, MODEL_SPEC_REGISTRY, serverRegistry);
    }
  }

  /**
   * Validates that an incoming forecast payload adheres to the GDF Zero-Synthetic Contract.
   */
  function validateForecastContract(payload) {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, reason: 'Empty or non-object forecast payload' };
    }
    if (payload.isSynthetic === true) {
      return { valid: false, reason: 'PROVENANCE_VIOLATION: Payload flagged as synthetic' };
    }
    if (payload.modelSpecRegistry) {
      syncModelSpecRegistry(payload.modelSpecRegistry);
    }
    if (payload.systemState === 'HALTED_DEGRADED' || payload.isHalted) {
      return { valid: true, isHalted: true };
    }
    if (!Array.isArray(payload.candles) || payload.candles.length === 0) {
      return { valid: false, reason: 'Missing verified candles array in nominal state' };
    }
    return { valid: true, isHalted: false };
  }

  /**
   * Renders the bilingual (EN/FA) Circuit Breaker / Fallback banner in the HUD.
   */
  function renderCircuitBreakerBanner(data, currentLang) {
    if (data && data.modelSpecRegistry) {
      syncModelSpecRegistry(data.modelSpecRegistry);
    }
    const banner = document.getElementById('circuitBreakerBanner');
    const titleEl = document.getElementById('cbBannerTitle');
    const subEl = document.getElementById('cbBannerSubtitle');
    const badgeEl = document.getElementById('cbBannerTierBadge');
    const iconEl = document.getElementById('cbBannerIcon');
    if (!banner || !titleEl || !subEl || !badgeEl) return;

    const state = data?.systemState || (data?.isHalted ? 'HALTED_DEGRADED' : 'LIVE_NOMINAL');
    if (state === 'HALTED_DEGRADED') {
      banner.style.display = 'block';
      banner.style.borderColor = 'rgba(255, 23, 68, 0.85)';
      banner.style.background = 'linear-gradient(90deg, rgba(48, 8, 18, 0.96), rgba(24, 8, 16, 0.96))';
      if (iconEl) iconEl.textContent = '🚨';
      titleEl.style.color = '#ff5252';
      titleEl.textContent =
        currentLang === 'fa'
          ? 'توقف اضطراری (HALTED_DEGRADED) — عدم دسترسی به تمامی منابع زنده بازار'
          : 'HALTED / DEGRADED MODE — ALL LIVE EXTERNAL MARKET PROVIDERS UNREACHABLE';
      subEl.style.color = '#ffcdd2';
      subEl.textContent =
        currentLang === 'fa'
          ? data?.haltReasonFa ||
            'به‌روزرسانی فیلتر کالمن (EKF)، ساعت حجمی (τ) و نوسانات GARCH متوقف شد. هیچ داده مصنوعی تولید نمی‌شود.'
          : data?.haltReasonEn ||
            'Filter covariance (P), volume-clock (τ), and GARCH variance mutations are FROZEN. Zero synthetic data generated.';
      badgeEl.style.color = '#ff8a80';
      badgeEl.style.borderColor = 'rgba(255, 82, 82, 0.65)';
      badgeEl.style.background = 'rgba(255, 23, 68, 0.22)';
      badgeEl.textContent = 'STATE: HALTED_DEGRADED · MUTATIONS FROZEN';
    } else if (state === 'DEGRADED_FALLBACK') {
      banner.style.display = 'block';
      banner.style.borderColor = 'rgba(255, 171, 0, 0.8)';
      banner.style.background = 'linear-gradient(90deg, rgba(45, 30, 6, 0.95), rgba(24, 18, 8, 0.95))';
      if (iconEl) iconEl.textContent = '⚠️';
      titleEl.style.color = '#ffab00';
      titleEl.textContent =
        currentLang === 'fa'
          ? `وضعیت جایگزین (DEGRADED_FALLBACK) — فعال بر روی منبع واقعی ${data.activeTier}`
          : `DEGRADED FALLBACK MODE — OPERATING ON VERIFIED ${data.activeTier} (${data.activeProvider})`;
      subEl.style.color = '#ffe082';
      subEl.textContent =
        currentLang === 'fa'
          ? data?.haltReasonFa || `منبع سطح ۱ در دسترس نیست؛ داده‌های واقعی از ${data.activeProvider} دریافت می‌شوند.`
          : data?.haltReasonEn ||
            `Primary Tier-1 feed unavailable; streaming verified real bars from ${data.activeProvider}.`;
      badgeEl.style.color = '#ffd740';
      badgeEl.style.borderColor = 'rgba(255, 171, 0, 0.6)';
      badgeEl.style.background = 'rgba(255, 171, 0, 0.18)';
      badgeEl.textContent = `${data.activeTier} · ${data.activeSymbol || 'GOLD'}`;
    } else {
      banner.style.display = 'none';
    }
  }

  /**
   * Opens and populates the bilingual Model Specification Registry inspection drawer/modal.
   */
  function openModelSpecDrawer(specId, currentLang) {
    const lang = currentLang || document.documentElement.lang || 'en';
    const isFa = lang === 'fa';
    const overlay = document.getElementById('modelSpecModalOverlay');
    const body = document.getElementById('modelSpecModalBody');
    const headerTitle = document.getElementById('modelSpecModalTitle');
    const headerSub = document.getElementById('modelSpecModalSub');
    if (!overlay || !body) return;

    const targetId = specId && MODEL_SPEC_REGISTRY[specId] ? specId : activeSpecId;
    activeSpecId = targetId;
    const spec = MODEL_SPEC_REGISTRY[targetId];
    if (!spec) return;

    if (headerTitle) {
      headerTitle.textContent = isFa
        ? 'دفتر ثبت مشخصات اقتصادسنجی و ریاضی مدل‌ها (Model Specification Registry)'
        : 'Econometric Model Specification & Fidelity Registry';
    }
    if (headerSub) {
      headerSub.textContent = isFa
        ? 'تفکیک شفاف تخمین‌گرهای دقیق (VERIFIED_EXACT) از پروکسی‌های کندلی (QUALIFIED_PROXY) و لایه استعاره بصری'
        : 'Audited Estimator Classification (VERIFIED_EXACT vs. QUALIFIED_PROXY) & Visualization Metaphor Separation';
    }

    const isExact = spec.classification === 'VERIFIED_EXACT';
    const badgeColor = isExact ? '#00e676' : '#f5d76e';
    const badgeBg = isExact ? 'rgba(0, 230, 118, 0.14)' : 'rgba(245, 215, 110, 0.14)';
    const badgeLabel = isExact
      ? isFa
        ? '✓ VERIFIED_EXACT (تخمین‌گر دقیق تاییدشده)'
        : '✓ VERIFIED_EXACT (Exact Econometric Estimator)'
      : isFa
      ? '⚡ QUALIFIED_PROXY (پروکسی مشروط مبتنی بر OHLCV)'
      : '⚡ QUALIFIED_PROXY (Qualified OHLCV / Factor Proxy)';

    const allSpecs = Object.values(MODEL_SPEC_REGISTRY);
    const pillsHtml = allSpecs
      .map(item => {
        const active = item.id === targetId;
        const dotColor = item.classification === 'VERIFIED_EXACT' ? '#00e676' : '#f5d76e';
        const shortTitle = (isFa ? item.honestLabelFa : item.honestLabelEn).split('[')[0].trim();
        return `<button type="button" class="model-spec-nav-pill ${active ? 'active' : ''}" data-select-spec="${item.id}" style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;border:1px solid ${
          active ? '#00e5ff' : 'rgba(40,60,95,0.65)'
        };background:${active ? 'rgba(0,229,255,0.16)' : 'rgba(10,16,28,0.85)'};color:${
          active ? '#fff' : '#9cb0cc'
        };">
          <span style="width:6px;height:6px;border-radius:50%;background:${dotColor};"></span>
          <span>${shortTitle}</span>
        </button>`;
      })
      .join('');

    const feedsListHtml = (spec.inputDataFeeds || [])
      .map(f => `<li style="margin-bottom:3px;color:#d1dced;">${f}</li>`)
      .join('');

    body.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(40,60,95,0.5);">
        ${pillsHtml}
      </div>

      <div style="background:rgba(14,23,42,0.92);border:1px solid ${badgeColor}66;border-radius:10px;padding:14px 16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <span style="font-family:monospace;font-size:11px;color:#00e5ff;font-weight:800;">ID: ${spec.id}</span>
          <span style="font-size:11px;font-weight:800;color:${badgeColor};background:${badgeBg};border:1px solid ${badgeColor}66;padding:3px 9px;border-radius:6px;">${badgeLabel}</span>
        </div>
        <div style="font-size:15px;font-weight:800;color:#fff;margin-bottom:4px;">${isFa ? spec.honestLabelFa : spec.honestLabelEn}</div>
        <div style="font-size:11px;color:#7d8ba1;">
          ${isFa ? 'برچسب قدیمی رابط کاربری:' : 'Legacy UI Metaphor Label:'} <span style="color:#9cb0cc;font-family:monospace;">${spec.uiCurrentLegacyLabelEn}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:12px;">
        <div style="background:rgba(10,16,28,0.85);border:1px solid rgba(40,60,95,0.55);border-radius:8px;padding:11px 13px;">
          <div style="font-size:10px;font-weight:800;color:#00e5ff;text-transform:uppercase;margin-bottom:4px;">
            ${isFa ? '۱. کلاس دقیق ریاضی و اقتصادسنجی' : '1. Exact Mathematical Class'}
          </div>
          <div style="font-size:11.5px;color:#e3ecfa;line-height:1.5;">${isFa ? spec.mathClassFa : spec.mathClassEn}</div>
          <div style="margin-top:7px;padding:6px 8px;background:rgba(4,8,16,0.9);border:1px solid rgba(0,229,255,0.2);border-radius:5px;font-family:monospace;font-size:10.5px;color:#f5d76e;overflow-x:auto;direction:ltr;text-align:left;">
            ${spec.equationLatexOrAscii}
          </div>
        </div>

        <div style="background:rgba(10,16,28,0.85);border:1px solid rgba(40,60,95,0.55);border-radius:8px;padding:11px 13px;">
          <div style="font-size:10px;font-weight:800;color:#b388ff;text-transform:uppercase;margin-bottom:4px;">
            ${isFa ? '۲. لایه استعاره بصری (هیدرودینامیک / مورس)' : '2. Explicit Visualization Layer Metaphor'}
          </div>
          <div style="font-size:11.5px;color:#e3ecfa;line-height:1.5;margin-bottom:8px;">
            ${isFa ? spec.visualizationLayerFa : spec.visualizationLayerEn}
          </div>
          <div style="font-size:10px;font-weight:800;color:#00e676;text-transform:uppercase;margin-bottom:4px;">
            ${isFa ? '۳. جریان‌های داده واقعی ورودی' : '3. Verified Real Input Data Feeds'}
          </div>
          <ul style="margin:0;padding-left:16px;font-size:11px;line-height:1.45;">
            ${feedsListHtml}
          </ul>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px;margin-bottom:12px;">
        <div style="background:rgba(10,16,28,0.85);border:1px solid rgba(40,60,95,0.55);border-radius:8px;padding:11px 13px;">
          <div style="font-size:10px;font-weight:800;color:#f5d76e;text-transform:uppercase;margin-bottom:4px;">
            ${isFa ? '۴. فرکانس نمونه‌برداری و افق بازنگری (Lookback)' : '4. Sampling Frequency & Lookback Window'}
          </div>
          <div style="font-size:11.5px;color:#d1dced;line-height:1.5;">${isFa ? spec.samplingAndLookbackFa : spec.samplingAndLookbackEn}</div>
        </div>

        <div style="background:rgba(10,16,28,0.85);border:1px solid rgba(40,60,95,0.55);border-radius:8px;padding:11px 13px;">
          <div style="font-size:10px;font-weight:800;color:#00e5ff;text-transform:uppercase;margin-bottom:4px;">
            ${isFa ? '۵. درجات آزادی و روش کالیبراسیون' : '5. Degrees of Freedom & Calibration Method'}
          </div>
          <div style="font-size:11.5px;color:#d1dced;line-height:1.5;">${isFa ? spec.dofAndCalibrationFa : spec.dofAndCalibrationEn}</div>
        </div>
      </div>

      <div style="background:rgba(255,171,0,0.08);border:1px solid rgba(255,171,0,0.4);border-radius:8px;padding:11px 14px;">
        <div style="font-size:10px;font-weight:800;color:#ffab00;text-transform:uppercase;margin-bottom:4px;">
          ⚠️ ${isFa ? '۶. محدودیت‌های ساختاری و دامنه اعتبار مدل' : '6. Known Structural Limitations & Scope'}
        </div>
        <div style="font-size:11.5px;color:#ffe082;line-height:1.55;">
          ${isFa ? spec.structuralLimitationsFa : spec.structuralLimitationsEn}
        </div>
      </div>
    `;

    body.querySelectorAll('[data-select-spec]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const nextId = btn.getAttribute('data-select-spec');
        if (nextId) openModelSpecDrawer(nextId, lang);
      });
    });

    overlay.classList.remove('hidden');
  }

  function initModelSpecTriggers() {
    document.addEventListener('click', e => {
      const trigger = e.target && e.target.closest ? e.target.closest('[data-model-spec]') : null;
      if (trigger) {
        e.stopPropagation();
        const specId = trigger.getAttribute('data-model-spec');
        const lang = document.documentElement.lang || 'en';
        openModelSpecDrawer(specId, lang);
      }
    });

    const closeBtn = document.getElementById('modelSpecModalClose');
    const overlay = document.getElementById('modelSpecModalOverlay');
    if (closeBtn && overlay) {
      closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
      overlay.addEventListener('click', e => {
        if (e.target === overlay) overlay.classList.add('hidden');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModelSpecTriggers);
  } else {
    initModelSpecTriggers();
  }

  global.GDFClientCore = {
    TIMEFRAME_STEPS,
    MODEL_SPEC_REGISTRY,
    validateForecastContract,
    renderCircuitBreakerBanner,
    openModelSpecDrawer,
    syncModelSpecRegistry,
  };
})(window);
