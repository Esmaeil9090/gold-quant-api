/**
 * GDF Phase 3 — Code-Backed Model Specification Registry
 *
 * Records the exact mathematical class, input data feeds, sampling frequency / lookback,
 * degrees of freedom / calibration method, known structural limitations, and formal
 * econometric classification (VERIFIED_EXACT | QUALIFIED_PROXY) for every estimator
 * displayed in the GDF terminal.
 *
 * Preserves the hydrodynamic / Morse visual metaphor explicitly as a visualization layer
 * while enforcing strict econometric language fidelity in both English and Persian (FA).
 */

export type EstimatorClassification = 'VERIFIED_EXACT' | 'QUALIFIED_PROXY';

export interface ModelSpecificationEntry {
  id: string;
  classification: EstimatorClassification;
  uiCurrentLegacyLabelEn: string;
  honestLabelEn: string;
  honestLabelFa: string;
  visualizationLayerEn: string;
  visualizationLayerFa: string;
  mathClassEn: string;
  mathClassFa: string;
  equationLatexOrAscii: string;
  inputDataFeeds: string[];
  samplingAndLookbackEn: string;
  samplingAndLookbackFa: string;
  dofAndCalibrationEn: string;
  dofAndCalibrationFa: string;
  structuralLimitationsEn: string;
  structuralLimitationsFa: string;
}

export const MODEL_SPEC_REGISTRY: Record<string, ModelSpecificationEntry> = {
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
    structuralLimitationsEn: 'Scalar shrinkage toward zero prior; in 1D/2D state spaces this acts as ridge/empirical-Bayes regularization rather than a $p >= 3$ multivariate minimax James-Stein theorem.',
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

  MTF_VOLUME_PROFILE_LIQUIDITY_PROXY: {
    id: 'MTF_VOLUME_PROFILE_LIQUIDITY_PROXY',
    classification: 'QUALIFIED_PROXY',
    uiCurrentLegacyLabelEn: 'Top-Down Multi-Timeframe Liquidity Pools (POC / HVN / LVN / Value Area)',
    honestLabelEn: 'Top-Down MTF Volume-Profile Liquidity Pool Proxy [Viz: Isobaric Depth Wells]',
    honestLabelFa: 'پروکسی استخرهای نقدینگی پروفایل حجم چندتایم‌فریمی (Monthly→5M) [لایه بصری: چاه‌های عمق هم‌فشار]',
    visualizationLayerEn: 'Hierarchical Depth Wells, High-Volume Attractors (HVN), and Low-Volume Vacuum Corridors (LVN)',
    visualizationLayerFa: 'چاه‌های عمق سلسله‌مراتبی، جاذب‌های پرحجم (HVN) و دالان‌های خلاء کم‌حجم (LVN)',
    mathClassEn: 'Top-down hierarchical kernel-smoothed price-volume histogram (Monthly -> Weekly -> Daily -> 4H -> 1H -> 15M/5M) extracting Point of Control (POC), 70% Value Area (VAH/VAL), local density maxima (HVN), and local density minima (LVN).',
    mathClassFa: 'هیستوگرام قیمت-حجم هموارشده سلسله‌مراتبی از بالا به پایین (ماهانه تا ۵ دقیقه) جهت استخراج نقطه کنترل (POC)، محدوده ارزش ۷۰٪ (VAH/VAL)، گره‌های پرحجم (HVN) و گره‌های کم‌حجم (LVN).',
    equationLatexOrAscii: 'V_tier(b) = sum_{i in tier} V_i * I(P_i in Bin_b),   POC = argmax_b V_tier(b),   VA_0.70 = [VAL, VAH] s.t. sum_{b in VA} V(b) >= 0.70 * V_tot',
    inputDataFeeds: [
      'Verified Daily (1D) Historical OHLCV Bars (Monthly & Weekly Macro Liquidity Pools)',
      'Verified Intraday (4H, 1H, 15M/5M) OHLCV Bars from Active Waterfall Venue',
    ],
    samplingAndLookbackEn: 'Strict top-down hierarchy: Monthly (up to 180–300 daily bars, w=0.28), Weekly (60 daily bars, w=0.22), Daily (20 daily bars, w=0.18), 4H (w=0.14), 1H (w=0.10), 15M/5M (w=0.08).',
    samplingAndLookbackFa: 'سلسله‌مراتب 엄격 از بالا به پایین: ماهانه (وزن ۰.۲۸)، هفتگی (وزن ۰.۲۲)، روزانه (وزن ۰.۱۸)، ۴ ساعته (وزن ۰.۱۴)، ۱ ساعته (وزن ۰.۱۰) و ۱۵/۵ دقیقه (وزن ۰.۰۸).',
    dofAndCalibrationEn: '24 adaptive price bins per timeframe tier with 3-point Gaussian-like kernel smoothing; 70% Value Area computed via greedy dual-pointer expansion around POC.',
    dofAndCalibrationFa: '۲۴ سطل قیمتی تطبیقی در هر تایم‌فریم با هموارسازی کرنل ۳ نقطه‌ای؛ محدوده ارزش ۷۰ درصدی حول POC.',
    structuralLimitationsEn: 'Constructs volume-at-price profiles by distributing OHLCV bar volume across bar high-low price bins rather than ingesting tick-by-tick Level-2/CME Market-by-Price (MBP) trade prints.',
    structuralLimitationsFa: 'پروفایل حجم در قیمت را با توزیع حجم کندل‌های OHLCV در بازه سقف تا کف کندل می‌سازد و به تیک‌های لحظه‌ای دفتر سفارشات (L2/MBP) دسترسی ندارد.',
  },

  ABSORPTION_INITIATION_FLOW_PROXY: {
    id: 'ABSORPTION_INITIATION_FLOW_PROXY',
    classification: 'QUALIFIED_PROXY',
    uiCurrentLegacyLabelEn: 'Liquidity Absorption vs. Initiation Flow Classifier',
    honestLabelEn: 'OHLCV Wick-to-Body Liquidity Absorption & Initiation Proxy [Viz: Boundary Flow Valve]',
    honestLabelFa: 'پروکسی طبقه‌بند جذب در برابر آغازگری نقدینگی مبتنی بر OHLCV [لایه بصری: دریچه جریان مرزی]',
    visualizationLayerEn: 'Value-Area Boundary Reflection vs. LVN Vacuum Breakthrough Streamlines',
    visualizationLayerFa: 'بازتاب مرزی محدوده ارزش در برابر خطوط جریان عبور از خلاء نقدینگی',
    mathClassEn: 'Standardized Z-score discriminator comparing relative volume-weighted wick rejection at HTF HVN/VAH/VAL boundaries (Absorption) against signed body-to-range expansion across LVN corridors (Initiation).',
    mathClassFa: 'تفکیک‌گر نمره Z استاندارد برای مقایسه رد شدو-حجم در مرزهای HVN/VAH/VAL (جذب نقدینگی) در برابر انبساط بدنه کندل در دالان‌های کم‌حجم LVN (آغازگری جهتی).',
    equationLatexOrAscii: 'Z_abs = zscore((Wick_dom / Range) * sqrt(V_rel) * Proximity_HVN),   Z_init = zscore(((C - O) / Range) * sqrt(V_rel) * (1 - Wick_dom / Range))',
    inputDataFeeds: [
      'Verified OHLCV Bar Geometry (Open, High, Low, Close, Volume)',
      'Top-Down MTF Liquidity Pool Coordinates (POC, VAH, VAL, HVN, LVN)',
    ],
    samplingAndLookbackEn: 'Evaluated per bar close over a 30-bar rolling standardization window.',
    samplingAndLookbackFa: 'محاسبه در پایان هر کندل بر روی پنجره استانداردسازی ۳۰ کندلی.',
    dofAndCalibrationEn: 'df = 29; classification triggered when |Z_abs| > 0.75 (Resting Liquidity Absorption) or |Z_init| > 0.75 (Directional Initiation Expansion).',
    dofAndCalibrationFa: 'درجه آزادی ۲۹؛ آستانه تشخیص ۰.۷۵ سیگما برای تفکیک جذب نقدینگی از آغازگری حرکت.',
    structuralLimitationsEn: 'Infers passive absorption vs. aggressive market-order initiation from OHLCV wick/body proportions and volume rather than resting limit-order queue depletion or footprint delta.',
    structuralLimitationsFa: 'جذب سفارشات محدود در برابر آغازگری سفارشات بازار را از نسبت شدو و بدنه کندل و حجم استنتاج می‌کند و به دلتای فوت‌پرینت تیک دسترسی ندارد.',
  },

  PROPORTIONAL_LIQUIDITY_STATE_FUSION: {
    id: 'PROPORTIONAL_LIQUIDITY_STATE_FUSION',
    classification: 'QUALIFIED_PROXY',
    uiCurrentLegacyLabelEn: 'Integrated Multi-Timeframe Liquidity Trajectory Fusion',
    honestLabelEn: 'Dynamic Precision-Weighted State-Vector & MTF Liquidity Fusion [Viz: Yellow Plume Attractor]',
    honestLabelFa: 'ادغام بردار حالت و نقدینگی چندتایم‌فریمی با وزن‌دهی دقت معکوس واریانس [لایه بصری: جاذب مسیر زرد]',
    visualizationLayerEn: 'Coupled Hydrodynamic & Liquidity-Well Yellow Trajectory Attractor',
    visualizationLayerFa: 'جاذب هم‌بسته هیدرودینامیک و چاه نقدینگی برای خط زرد مسیر آینده',
    mathClassEn: 'Dynamic inverse-variance precision state fusion combining 40-bar OU mean reversion, EKF shrunk drift, orthogonal macro factor lift, sweep microstructure log-odds impulse, and top-down HTF liquidity pool gravity/initiation drift with rolling out-of-sample error variance weights w_{m,t} proportional to (sigma_{m,t}^2 + eps)^{-1}.',
    mathClassFa: 'ترکیب محدب پویا مبتنی بر معکوس واریانس خطای خارج از نمونه شامل بازگشت به میانگین OU، رانش کالمن، نیروی کلان، جاروب نقدینگی و جاذبه/رانش نقدینگی چندتایم‌فریمی.',
    equationLatexOrAscii: 'w_{m,t} = (sigma_{m,t}^2 + eps)^{-1} / sum_k (sigma_{k,t}^2 + eps)^{-1},   v_fused = sum_m w_{m,t} * v_{m,t}',
    inputDataFeeds: [
      '40-Bar OU Equilibrium & Scalar-Gain EKF State Velocity',
      'PCA Macro Factor Lift & Sweep Log-Odds Z-Score',
      'Top-Down MTF Liquidity Pools (Monthly→5M POC/HVN/LVN) & Absorption/Initiation State',
    ],
    samplingAndLookbackEn: 'Synchronized at every forecast cycle across trailing realized bar residuals and all 24 forward projection steps.',
    samplingAndLookbackFa: 'همگام‌سازی‌شده در هر چرخه پیش‌بینی بر اساس واریانس خطای کندل‌های تحقق‌یافته و ۲۴ گام رو به جلو.',
    dofAndCalibrationEn: 'Dynamic precision weights w_{m,t} estimated online from rolling out-of-sample squared forecast errors summing strictly to 1.00; zero hardcoded constant weights.',
    dofAndCalibrationFa: 'وزن‌های دقت پویا که به صورت آنلاین از معکوس واریانس خطای پیش‌بینی خارج از نمونه محاسبه شده و مجموع آن‌ها دقیقاً ۱.۰۰ است.',
    structuralLimitationsEn: 'Precision weights adapt to trailing out-of-sample error variance over finite OHLCV windows; rapid structural breaks require confirmation across the walk-forward window.',
    structuralLimitationsFa: 'وزن‌های دقت بر اساس واریانس خطای پنجره محدود کندل‌های اخیر سازگار می‌شوند.',
  },

  PARALLEL_UNIVERSE_DISCOVERY_CORE: {
    id: 'PARALLEL_UNIVERSE_DISCOVERY_CORE',
    classification: 'VERIFIED_EXACT',
    uiCurrentLegacyLabelEn: 'Intelligence & Awareness Core with Parallel Universe (Level B Symbolic Discovery)',
    honestLabelEn: 'Intelligence & Awareness Core · Multi-Timeframe Parallel Universe Symbolic Discovery & 8-Gate Closed-Loop Verifier',
    honestLabelFa: 'هسته هوشمندی و آگاهی · جهان موازی کشف نمادین چندتایم‌فریمی و راستی‌آزمایی ۸ مرحله‌ای حلقه بسته',
    visualizationLayerEn: 'Same-Chart Dual-Line Comparison (#windyCanvas): Live Approved Architecture (Yellow Line #f5d76e) vs. Parallel Universe Candidate (Dashed Magenta Line #e040fb)',
    visualizationLayerFa: 'مقایسه دو خط روی نمودار واحد (#windyCanvas): معماری زنده تاییدشده (خط زرد #f5d76e) در برابر کاندیدای جهان موازی (خط خط‌چین سرخابی #e040fb)',
    mathClassEn: 'Isolated candidate model architecture executing Level-B constrained symbolic equation discovery across 8 closed-form primitives (including lagged residual error-correction, second-order basis acceleration, multi-timeframe HTF/LTF drift-POC synergy, and asymmetric real-yield tail-shock shield), split-half stability gating, rolling ridge-regularized parameter estimation, faulty model pruning, and an 8-gate Diebold-Mariano / CVaR-95 / multi-regime walk-forward verification protocol persisted in a versioned atomic JSON store.',
    mathClassFa: 'معماری کاندیدای ایزوله با قابلیت کشف نمادین ۸ خانواده معادله بسته سطح B (شامل تصحیح خودکار پسماند تاخیری، شتاب مرتبه دوم اسپرد، هم‌افزایی رانش چندتایم‌فریمی و سپر نامتقارن شوک بازده واقعی)، حذف مدل‌های ناپایدار، وزن‌دهی پویا و پروتکل راستی‌آزمایی ۸ گانه دیبولد-ماریانو با ذخیره‌سازی پایدار.',
    equationLatexOrAscii: 'v_cand(t) = sum_{m in Active} w_{m,t} * phi_m(X_t^{TF}, X_t^{HTF}, X_t^{LTF}, e_{t-1}^{live}; theta_{m,t}),   DM_t = mean(d_t) / sqrt(Var(d_t) / N_eff)',
    inputDataFeeds: [
      'Identical Verified Real-Data Waterfall Snapshot (Active Timeframe OHLCV + Multi-Timeframe 5m/15m/1h/4h/1d Verified Series)',
      'Multi-Source Macro Yields/DXY, Cross-Venue Basis Spread & Acceleration, and Live Yellow-Line Lagged OOS Residuals',
    ],
    samplingAndLookbackEn: 'Data-driven minimum evaluation window N_min >= max(16, ceil(4 * tau_half_life)) derived from empirical residual autocorrelation half-life; state persisted atomically across restarts in versioned store v2.',
    samplingAndLookbackFa: 'پنجره ارزیابی خارج از نمونه مبتنی بر داده که از نیمه‌عمر خودهمبستگی تجربی پسماندها استخراج می‌شود؛ ذخیره اتمی نسخه ۲ برای بقا در ری‌استارت.',
    dofAndCalibrationEn: 'Empirical variance-scaled Ridge regularization (lambda_t = Var(Delta P) / N_fit) with split-half sign stability gating; promotion restricted to Manual MMI approval or Automatic promotion when all 8 verification gates pass (VERIFIED_FOR_PROMOTION).',
    dofAndCalibrationFa: 'تخمین پارامتر رگرسیون ریج علّی با گیت پایداری دونیمه‌ای؛ ارتقا صرفاً از طریق تایید دستی اپراتور (MMI) یا ارتقای خودکار پس از عبور از هر ۸ گیت راستی‌آزمایی.',
    structuralLimitationsEn: 'Symbolic discovery is constrained to 8 closed-form, auditable non-linear primitives over verified OHLCV, volume-clock, basis, multi-timeframe liquidity, and macro state variables; container redeployments without a mounted volume log an explicit ephemeral storage warning.',
    structuralLimitationsFa: 'کشف معادلات نمادین مقید به ۸ فرم ریاضی بسته و قابل حسابرسی روی داده‌های واقعی است.',
  },
};

export function getModelSpecList(): ModelSpecificationEntry[] {
  return Object.values(MODEL_SPEC_REGISTRY);
}

export function getModelSpecById(id: string): ModelSpecificationEntry | undefined {
  return MODEL_SPEC_REGISTRY[id];
}

