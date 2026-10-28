/**
 * @file src/config/financialDictionary.ts
 * @description Centralized, Authoritative Bilingual Financial & Quantitative Terminology Dictionary
 * for Gold Dynamic Flow (GDF).
 *
 * Every user-facing mathematical, quantitative, microstructure, risk, governance, and 3D Market Theatre
 * concept in GDF is defined here with 100% English (EN) and Persian/Farsi (FA) semantic, mathematical,
 * and epistemic parity.
 *
 * Persian Typography & Hygiene Rules Enforced:
 * - Always uses Persian Yeh 'ی' (U+06CC) and Persian Kaf 'ک' (U+06A9); never Arabic 'ي' (U+064A) or 'ك' (U+0643).
 * - Proper Zero-Width Non-Joiner (ZWNJ / نیم‌فاصله, U+200C) in compound words, plural suffixes (ها / های),
 *   and verbal participles (می‌شود / شده).
 * - Explicit RTL/LTR bidirectional isolation rules for inline mathematical equations, symbols, units, and tickers.
 */

export type EpistemicClassification =
  | 'observed'
  | 'estimated'
  | 'inferred'
  | 'forecast'
  | 'assumed'
  | 'proxy'
  | 'unavailable';

export type ConceptImplementationStatus =
  | 'implemented_and_verified'
  | 'implemented_but_unverified'
  | 'partially_implemented'
  | 'planned'
  | 'unavailable'
  | 'not_applicable';

export type ConceptDomain =
  | 'CORE_TERMINOLOGY'
  | 'MODEL_ESTIMATOR'
  | 'THEATRE_LAYER'
  | 'GOVERNANCE_AND_INTEGRITY';

export interface FinancialConceptEntry {
  /** Stable canonical concept identifier */
  id: string;
  /** Functional domain category */
  domain: ConceptDomain;
  /** Canonical English term */
  canonicalEn: string;
  /** Canonical Persian (Farsi) equivalent */
  canonicalFa: string;
  /** Approved short English label for charts, badges, and compact UI */
  shortLabelEn: string;
  /** Approved short Persian label for charts, badges, and compact UI */
  shortLabelFa: string;
  /** Concise English tooltip / UI explanation */
  tooltipEn: string;
  /** Concise Persian tooltip / UI explanation */
  tooltipFa: string;
  /** Rigorous English technical & mathematical definition */
  technicalDefinitionEn: string;
  /** Rigorous Persian technical & mathematical definition */
  technicalDefinitionFa: string;
  /** Governing variable, equation, estimator ID, or data source */
  variableOrEquation: string;
  /** Unit of measurement and directional sign convention */
  unitAndSignConvention: string;
  /** Epistemic classification of the quantity */
  epistemicClassification: EpistemicClassification;
  /** Actual verified codebase implementation status */
  implementationStatus: ConceptImplementationStatus;
  /** Approved secondary English terms / aliases */
  approvedAliasesEn: string[];
  /** Approved secondary Persian terms / aliases */
  approvedAliasesFa: string[];
  /** Deprecated English terms replaced by this canonical concept */
  deprecatedTermsEn: string[];
  /** Deprecated Persian terms replaced by this canonical concept */
  deprecatedTermsFa: string[];
  /** Localization, abbreviation, numeral, and RTL/LTR bidirectional rendering rules */
  localizationNotes: string;
}

export interface BilingualStylePolicy {
  version: string;
  persianCharacterStandard: {
    yehCodepoint: string;
    kafCodepoint: string;
    forbiddenArabicCodepoints: string[];
    zwnjCodepoint: string;
    zwnjPolicy: string;
  };
  abbreviationPolicy: {
    rule: string;
    retainedInternationalAcronyms: string[];
    translatedWithAcronymOnFirstReference: Record<string, { en: string; fa: string }>;
  };
  numeralAndDirectionalityPolicy: {
    proseNumeralsFa: string;
    quantitativeTelemetryNumerals: string;
    ltrIsolationSelector: string;
    bidiRules: string[];
  };
}

export const BILINGUAL_STYLE_POLICY: BilingualStylePolicy = {
  version: '2.0.0-BILINGUAL-STD',
  persianCharacterStandard: {
    yehCodepoint: 'U+06CC (ی)',
    kafCodepoint: 'U+06A9 (ک)',
    forbiddenArabicCodepoints: ['U+064A (ي)', 'U+0643 (ك)'],
    zwnjCodepoint: 'U+200C (نیم‌فاصله)',
    zwnjPolicy:
      'Enforce U+200C in Persian plural suffixes (ها/های), present/past prefixes and participles (می‌شود، فیلترشده، همگام‌شده), and compound technical modifiers (عدم‌قطعیت، درون‌کندلی، برون‌زا).'
  },
  abbreviationPolicy: {
    rule: 'Retain globally recognized trading tickers and statistical acronyms in Latin script wrapped in LTR isolation when embedded in Persian prose; always provide the full Persian financial term alongside or on first reference.',
    retainedInternationalAcronyms: [
      'XAU/USD',
      'PAXG/USD',
      'GC=F',
      'DXY',
      'US10Y',
      'DFII10',
      'TIPS',
      'VIX',
      'GVZ',
      'ETF',
      'COT',
      'OHLCV',
      'EMA',
      'WMA',
      'HMA',
      'RSI',
      'MACD',
      'ATR',
      'VWAP',
      'EWMA',
      'ARX',
      'L1',
      'MAE',
      'RMSE',
      'BPS',
      'UTC'
    ],
    translatedWithAcronymOnFirstReference: {
      VPIN: {
        en: 'OHLCV Flow Imbalance Proxy (VPIN Approximation)',
        fa: 'پروکسی ناترازی جریان سفارش بر پایه OHLCV (تقریب VPIN)'
      },
      OFI: {
        en: 'Intrabar Order-Flow Imbalance Proxy (OFI)',
        fa: 'پروکسی ناترازی جریان سفارش درون‌کندلی (OFI)'
      },
      PCA: {
        en: 'Cross-Asset Macro Alignment Score (Fixed-Weight Factor Index)',
        fa: 'شاخص هم‌راستایی کلان بین‌دارایی (ترکیب خطی با وزن ثابت)'
      },
      KALMAN: {
        en: 'Scalar-Gain Kalman State Observer',
        fa: 'ناظر وضعیت کالمن با بهره اسکالر'
      },
      SPRT: {
        en: 'Sequential Probability Ratio Test (Wald SPRT)',
        fa: 'آزمون نسبت احتمال ترتیبی والد (SPRT)'
      },
      PH: {
        en: 'Page-Hinkley Drift Detector',
        fa: 'آشکارساز انحراف تدریجی پیج-هینکلی (Page-Hinkley)'
      },
      ECE: {
        en: 'Expected Calibration Error (ECE)',
        fa: 'خطای کالیبراسیون مورد انتظار (ECE)'
      },
      PIT: {
        en: 'Probability Integral Transform (PIT)',
        fa: 'تبدیل انتگرال احتمال (PIT)'
      }
    }
  },
  numeralAndDirectionalityPolicy: {
    proseNumeralsFa:
      'Persian narrative prose may use Persian numerals or standard international numerals consistently within a sentence; all live market prices, basis points, probabilities, timestamps, and equations use international numerals (0–9) with explicit LTR directionality so minus signs, decimal points, and percentage symbols never invert.',
    quantitativeTelemetryNumerals: 'International numerals (0-9) with tabular-nums font-variant and explicit dir="ltr" / unicode-bidi: isolate.',
    ltrIsolationSelector: '.ltr-num, .math-formula, [dir="ltr"], bdi',
    bidiRules: [
      'Every mathematical formula, symbolic variable (e.g. X_t, y_t^{(k)}, +2σ), price ($2,650.40), signed percentage (+0.42%, -1.15%), and timeframe (1m, 5m, 15m, 1h, 4h) must be isolated in LTR directionality.',
      'In RTL mode (body[dir="rtl"]), layout containers mirror horizontally while charts, time axes, and numeric tickers preserve standard left-to-right mathematical progression.'
    ]
  }
};

/**
 * Authoritative Bilingual Terminology Registry covering:
 * 1. All 21 Core Financial & Quantitative Standardization Concepts
 * 2. All 6 Preserved 3D Market Theatre Cinematic Layers
 * 3. All 17 Model Specification Registry Estimators
 */
export const FINANCIAL_TERMINOLOGY_DICTIONARY: Record<string, FinancialConceptEntry> = {
  // ============================================================================
  // PART 1: 21 CORE FINANCIAL & QUANTITATIVE CONCEPTS (PROMPT MANDATE TABLE)
  // ============================================================================
  MARKET_FLOW_AND_PRICE_DYNAMICS: {
    id: 'MARKET_FLOW_AND_PRICE_DYNAMICS',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Market Flow and Price Dynamics',
    canonicalFa: 'پویایی جریان بازار و قیمت',
    shortLabelEn: 'Market Flow Dynamics',
    shortLabelFa: 'پویایی جریان بازار',
    tooltipEn: 'Joint evolution of spot price trajectory, order-flow pressure, and multi-timeframe liquidity structure.',
    tooltipFa: 'تحول هم‌زمان مسیر قیمت نقدی، فشار جریان سفارش‌ها و ساختار نقدینگی چندزمانه در بازار.',
    technicalDefinitionEn:
      'Continuous-time and discrete-bar representation of gold price dynamics driven by observable order-flow imbalance, volatility regimes, and cross-asset macro drift.',
    technicalDefinitionFa:
      'نمایش پیوسته و گسسته پویایی قیمت طلا که تحت تأثیر ناترازی مشاهده‌پذیر جریان سفارش، رژیم‌های نوسان و رانش کلان بین‌دارایی شکل می‌گیرد.',
    variableOrEquation: 'dP_t = μ_t dt + σ_t dW_t + J_t dN_t',
    unitAndSignConvention: 'USD/oz (levels) and USD/bar or bps/bar (drift); positive (+) = upward price pressure.',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Price and Order-Flow Dynamics', 'Market Microstructure and Price Evolution'],
    approvedAliasesFa: ['پویایی قیمت و جریان سفارش', 'ساختار خرد و تحول قیمت بازار'],
    deprecatedTermsEn: ['Hydrodynamic Market Physics', 'Fluid Dynamics of Gold'],
    deprecatedTermsFa: ['فیزیک هیدرودینامیک بازار', 'دینامیک سیالات طلا'],
    localizationNotes: 'Replaces marine/fluid-dynamics metaphors with standard market microstructure terminology.'
  },

  ADAPTIVE_MARKET_STATE_ESTIMATOR: {
    id: 'ADAPTIVE_MARKET_STATE_ESTIMATOR',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Adaptive Market-State Estimator',
    canonicalFa: 'برآوردگر تطبیقی وضعیت بازار',
    shortLabelEn: 'Market-State Estimator',
    shortLabelFa: 'برآوردگر وضعیت بازار',
    tooltipEn: 'Recursive state-space filter estimating latent fair-value level, velocity, acceleration, and unmeasured drift bias.',
    tooltipFa: 'فیلتر بازگشتی فضای حالت که سطح ارزش منصفانه پنهان، سرعت، شتاب قیمت و بایاس رانش اندازه‌گیری‌نشده را برآورد می‌کند.',
    technicalDefinitionEn:
      'Scalar-gain recursive Kalman observer coupled with a 4-dimensional information-clock latent state filter X_τ = [p_τ, v_τ, a_τ, l_τ]^T.',
    technicalDefinitionFa:
      'ناظر بازگشتی کالمن با بهره اسکالر همراه با فیلتر چهاربعدی وضعیت پنهان روی ساعت اطلاعاتی X_τ = [p_τ, v_τ, a_τ, l_τ]^T.',
    variableOrEquation: 'x̂_{t|t} = x̂_{t|t-1} + K_t (y_t - H x̂_{t|t-1})',
    unitAndSignConvention: 'Level in USD/oz, velocity in USD/bar, bias in USD/bar; positive (+) = bullish drift.',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Scalar-Gain Kalman Observer', 'State-Space Market Filter'],
    approvedAliasesFa: ['ناظر کالمن با بهره اسکالر', 'فیلتر فضای حالت بازار'],
    deprecatedTermsEn: ['Marine Dynamic Positioning (DP) Vessel', 'Offshore DP Observer', 'Vessel Positioning Filter'],
    deprecatedTermsFa: ['ناظر موقعیت‌یابی دینامیک دریایی', 'کشتی حفاری فراساحلی'],
    localizationNotes: 'Strictly use state-space / Kalman filtering terminology; never use vessel or marine positioning metaphors.'
  },

  EXOGENOUS_MARKET_DRIVERS: {
    id: 'EXOGENOUS_MARKET_DRIVERS',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Exogenous Market Drivers',
    canonicalFa: 'محرک‌های برون‌زای بازار',
    shortLabelEn: 'Exogenous Drivers',
    shortLabelFa: 'محرک‌های برون‌زا',
    tooltipEn: 'External macro and cross-asset inputs (DXY, US10Y, TIPS real yields, VIX, silver) influencing gold drift.',
    tooltipFa: 'متغیرهای کلان و بین‌دارایی بیرونی (شاخص دلار DXY، بازده اوراق ده ساله آمریکا، بازده حقیقی TIPS، شاخص نوسان VIX و نقره) مؤثر بر رانش طلا.',
    technicalDefinitionEn:
      'Observable cross-asset explanatory variables u_t fed into the ARX drift predictor and state-space exogenous forcing vector.',
    technicalDefinitionFa:
      'متغیرهای توضیحی مشاهده‌پذیر بین‌دارایی u_t که به پیش‌بینی‌کننده رانش ARX و بردار تحریک برون‌زای فضای حالت وارد می‌شوند.',
    variableOrEquation: 'u_t = [ΔDXY_t, ΔUS10Y_t, ΔDFII10_t, ΔVIX_t, ΔXAG_t]^T',
    unitAndSignConvention: 'Standardized z-score or bps change; negative DXY/real-yield shock typically exerts positive (+) gold drift.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Exogenous Macro Inputs', 'Cross-Asset Macro Drivers'],
    approvedAliasesFa: ['ورودی‌های کلان برون‌زا', 'محرک‌های کلان بین‌دارایی'],
    deprecatedTermsEn: ['Environmental Wind/Wave/Current Forces', 'Macro Weather Forces'],
    deprecatedTermsFa: ['نیروهای محیطی باد و موج و جریان', 'نیروهای آب‌وهوایی کلان'],
    localizationNotes: 'Keep ticker symbols (DXY, US10Y, TIPS, VIX) in Latin script inside LTR spans.'
  },

  LATENT_MARKET_FACTORS: {
    id: 'LATENT_MARKET_FACTORS',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Latent Market Factors',
    canonicalFa: 'عوامل پنهان بازار',
    shortLabelEn: 'Latent Factors',
    shortLabelFa: 'عوامل پنهان',
    tooltipEn: 'Unobservable state variables (latent price, drift velocity, curvature, and liquidity elasticity) inferred from noisy venue observations.',
    tooltipFa: 'متغیرهای حالت مشاهده‌ناپذیر (قیمت پنهان، سرعت رانش، انحنا و کشش نقدینگی) که از مشاهدات پرنویز بازارها استنتاج می‌شوند.',
    technicalDefinitionEn:
      'Low-dimensional latent state vector X_τ = [p_τ, v_τ, a_τ, l_τ]^T evolving on the volume-synchronized information clock and observed via multi-venue linear measurement equations.',
    technicalDefinitionFa:
      'بردار وضعیت پنهان کم‌بعد X_τ = [p_τ, v_τ, a_τ, l_τ]^T که روی ساعت اطلاعاتی همگام با حجم تکامل یافته و از طریق معادلات اندازه‌گیری خطی چندبازاره مشاهده می‌شود.',
    variableOrEquation: 'X_τ = [p_τ, v_τ, a_τ, l_τ]^T,  y_t^{(k)} = b_k + β_k p_τ + c_k^T z_t + ε_t^{(k)}',
    unitAndSignConvention: 'p_τ in USD/oz, v_τ in USD/Δτ, a_τ in USD/Δτ², l_τ dimensionless [0, 1].',
    epistemicClassification: 'inferred',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Latent State Vector', 'Unobserved Market State Variables'],
    approvedAliasesFa: ['بردار وضعیت پنهان', 'متغیرهای حالت مشاهده‌ناپذیر بازار'],
    deprecatedTermsEn: ['Hidden Subsurface Currents', 'Unseen Ocean State'],
    deprecatedTermsFa: ['جریان‌های زیرسطحی پنهان'],
    localizationNotes: 'Translate "Latent" consistently as «پنهان» in financial state-space contexts.'
  },

  VOLUME_SYNCHRONIZED_TIME: {
    id: 'VOLUME_SYNCHRONIZED_TIME',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Volume-Synchronized Time',
    canonicalFa: 'زمان همگام‌شده با حجم معاملات',
    shortLabelEn: 'Information Clock (Δτ)',
    shortLabelFa: 'ساعت اطلاعاتی (Δτ)',
    tooltipEn: 'Intrinsic market clock advancing proportionally to trading volume, price range, and tick activity rather than wall-clock seconds.',
    tooltipFa: 'ساعت درونی بازار که به‌جای ثانیه‌های تقویمی، متناسب با حجم معاملات، دامنه نوسان کندل و شدت فعالیت تیک‌ها به‌پیش می‌رود.',
    technicalDefinitionEn:
      'Information-time increment Δτ_t = w_V (V_t / V̄) + w_R ((H_t - L_t) / ATR_t) + w_N (N_t / N̄) governing state-transition variance and drift scaling.',
    technicalDefinitionFa:
      'گام زمانی اطلاعاتی Δτ_t = w_V (V_t / V̄) + w_R ((H_t - L_t) / ATR_t) + w_N (N_t / N̄) که واریانس انتقال حالت و مقیاس‌بندی رانش را کنترل می‌کند.',
    variableOrEquation: 'Δτ_t = w_V(V_t/V̄) + w_R((H_t-L_t)/ATR_t) + w_N(N_t/N̄)',
    unitAndSignConvention: 'Dimensionless positive ratio (Δτ_t > 0; Δτ_t = 1.0 corresponds to baseline market activity).',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Information Clock', 'Activity-Driven Market Clock'],
    approvedAliasesFa: ['ساعت اطلاعاتی بازار', 'مقیاس زمانی مبتنی بر حجم و فعالیت'],
    deprecatedTermsEn: ['Relativistic Time Dilation', 'Chrono-Warp Clock'],
    deprecatedTermsFa: ['اتساع زمان نسبیتی'],
    localizationNotes: 'Use «زمان همگام‌شده با حجم معاملات» in headers and «ساعت اطلاعاتی (Δτ)» in compact telemetry badges.'
  },

  ORDER_FLOW_IMBALANCE: {
    id: 'ORDER_FLOW_IMBALANCE',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Order-Flow Imbalance (OFI)',
    canonicalFa: 'ناترازی جریان سفارش‌ها (OFI)',
    shortLabelEn: 'Order-Flow Imbalance',
    shortLabelFa: 'ناترازی جریان سفارش',
    tooltipEn: 'Net directional buying versus selling pressure inferred from intrabar candle structure and volume-weighted price displacement.',
    tooltipFa: 'فشار خالص خرید در برابر فروش که از ساختار درون‌کندلی و جابه‌جایی قیمت موزون به حجم استنتاج می‌شود.',
    technicalDefinitionEn:
      'Normalized intrabar candle-body to range ratio (Close - Open) / max(High - Low, ε) weighted by relative volume; explicitly labeled as an OHLCV proxy rather than Level-2/3 tick order-book OFI.',
    technicalDefinitionFa:
      'نسبت نرمال‌شده بدنه به دامنه کندل (Close - Open) / max(High - Low, ε) موزون به حجم نسبی؛ به‌طور شفاف به‌عنوان پروکسی مبتنی بر OHLCV (و نه دفتر سفارش سطح ۲ یا ۳) برچسب‌گذاری شده است.',
    variableOrEquation: 'OFI_proxy = (C_t - O_t) / max(H_t - L_t, ε)',
    unitAndSignConvention: 'Bounded in [-1, +1] or scaled [-100, +100]; positive (+) = net buyer aggression, negative (-) = net seller aggression.',
    epistemicClassification: 'proxy',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Intrabar Order-Flow Imbalance Proxy', 'OHLCV Flow Imbalance'],
    approvedAliasesFa: ['پروکسی ناترازی جریان سفارش درون‌کندلی', 'ناترازی جریان سفارش (OFI)'],
    deprecatedTermsEn: ['Level-3 Order Book OFI', 'True Tick Microstructure Toxicity'],
    deprecatedTermsFa: ['جریان سفارش سطح ۳', 'سمیت تیک به تیک دفتر سفارش'],
    localizationNotes: 'Must always preserve the [HEURISTIC PROXY] / [پروکسی ابتکاری] epistemic disclosure.'
  },

  LIQUIDITY_DEPTH: {
    id: 'LIQUIDITY_DEPTH',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Liquidity Depth',
    canonicalFa: 'عمق نقدینگی',
    shortLabelEn: 'Liquidity Depth',
    shortLabelFa: 'عمق نقدینگی',
    tooltipEn: 'Estimated capacity of the market to absorb order flow without large price displacement across price levels.',
    tooltipFa: 'ظرفیت برآوردشده بازار برای جذب جریان سفارش‌ها بدون ایجاد جابه‌جایی شدید قیمتی در سطوح مختلف.',
    technicalDefinitionEn:
      'Latent liquidity resilience state l_τ ∈ [0, 1] combined with multi-timeframe historical volume-node concentration (Waiting Money heat zones).',
    technicalDefinitionFa:
      'متغیر حالت تاب‌آوری نقدینگی پنهان l_τ ∈ [0, 1] در ترکیب با تمرکز گره‌های حجمی تاریخی چندزمانه (مناطق تمرکز نقدینگی در انتظار).',
    variableOrEquation: 'l_τ ∈ [0, 1],  DepthScore_i = Σ w_tf · VolumeProfile(P_i)',
    unitAndSignConvention: 'Normalized index [0, 1] or [0%, 100%]; higher value = deeper resting liquidity / lower price impact per unit volume.',
    epistemicClassification: 'proxy',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Resting Liquidity Concentration', 'Market Absorption Depth'],
    approvedAliasesFa: ['تمرکز نقدینگی در انتظار', 'عمق جذب نقدینگی بازار'],
    deprecatedTermsEn: ['Full L3 Limit Order Book Depth', 'DOM Depth Ladder'],
    deprecatedTermsFa: ['عمق کامل دفتر سفارش سطح ۳'],
    localizationNotes: 'Clarify that depth zones are inferred from historical OHLCV volume profiles and price-rejection density.'
  },

  PRICE_IMPACT_RESPONSE: {
    id: 'PRICE_IMPACT_RESPONSE',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Price-Impact Response',
    canonicalFa: 'پاسخ اثر قیمتی',
    shortLabelEn: 'Price-Impact Response',
    shortLabelFa: 'پاسخ اثر قیمتی',
    tooltipEn: 'Dynamic price displacement and post-shock decay/continuation curve following a volume, volatility, or macro impulse.',
    tooltipFa: 'منحنی جابه‌جایی پویا و میرایی یا تداوم حرکت قیمت پس از وقوع یک تکانه حجمی، نوسانی یا کلان.',
    technicalDefinitionEn:
      'Impulse-response kernel H(Δτ) measuring the half-life λ, net continuation versus mean-reversion ratio, and shock amplification after an exogenous or endogenous market event.',
    technicalDefinitionFa:
      'هسته پاسخ تکانه H(Δτ) که نیمه‌عمر میرایی λ، نسبت تداوم به بازگشت به میانگین و تقویت شوک را پس از یک رخداد برون‌زا یا درون‌زای بازار اندازه‌گیری می‌کند.',
    variableOrEquation: 'ΔP(τ + δ) = A · exp(-λ δ) · cos(ω δ) + B · Impulse_τ',
    unitAndSignConvention: 'USD/oz displacement per unit shock; Decay half-life in information-clock bars (Δτ).',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Impulse-Response Kernel', 'Post-Shock Price Response (Pulse-Echo)'],
    approvedAliasesFa: ['هسته پاسخ تکانه قیمت', 'پاسخ اثر قیمتی پس از شوک (پالس-پژواک)'],
    deprecatedTermsEn: ['Acoustic Sonar Ping Reflection', 'Submarine Echo Ranging'],
    deprecatedTermsFa: ['بازتاب سونار صوتی زیرسطحی'],
    localizationNotes: 'When referencing the Scientific Core "Pulse-Echo" module, pair it with the canonical financial term «پاسخ اثر قیمتی (پالس-پژواک)».'
  },

  FORECAST_RESIDUAL_ANALYSIS: {
    id: 'FORECAST_RESIDUAL_ANALYSIS',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Forecast Residual Analysis',
    canonicalFa: 'تحلیل خطای پیش‌بینی و باقیمانده‌ها',
    shortLabelEn: 'Residual Analysis',
    shortLabelFa: 'تحلیل باقیمانده‌ها',
    tooltipEn: 'Real-time decomposition of out-of-sample forecast errors (e_t = y_t - ŷ_t) into bias, autocorrelation, and volatility-clustering components.',
    tooltipFa: 'تجزیه بی‌درنگ خطاهای پیش‌بینی خارج از نمونه (e_t = y_t - ŷ_t) به مؤلفه‌های بایاس، خودهمبستگی و خوشه‌بندی نوسان.',
    technicalDefinitionEn:
      'Continuous audit of realized innovation residuals e_t = P_t - P̂_{t|t-1}, tracking L1 MAE, RMSE, directional hit rate, lag-1 autocorrelation ρ_1(e), and structural drift triggers (Wald SPRT and Page-Hinkley).',
    technicalDefinitionFa:
      'پایش پیوسته باقیمانده‌های نوآوری تحقق‌یافته e_t = P_t - P̂_{t|t-1} شامل خطای مطلق میانگین (MAE)، ریشه میانگین مربعات خطا (RMSE)، نرخ اصابت جهتی، خودهمبستگی مرتبه اول ρ_1(e) و آشکارسازهای انحراف ساختاری.',
    variableOrEquation: 'e_t = y_t - ŷ_{t|t-1},  MAE = (1/N) Σ |e_t|,  RMSE = √((1/N) Σ e_t²)',
    unitAndSignConvention: 'Error in USD/oz; signed bias > 0 indicates systematic under-prediction, < 0 indicates over-prediction.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Out-of-Sample Residual Diagnostics', 'Innovation Error Decomposition'],
    approvedAliasesFa: ['عیب‌یابی باقیمانده‌های خارج از نمونه', 'تجزیه خطای نوآوری پیش‌بینی'],
    deprecatedTermsEn: ['Self-Aware Oracle Consciousness', 'Sentient Residual Mind'],
    deprecatedTermsFa: ['خودآگاهی اوراکل هوشیار'],
    localizationNotes: 'Always describe residual monitoring as statistical error decomposition and adaptive feedback, never sentience.'
  },

  ALTERNATIVE_FORECAST_SCENARIO: {
    id: 'ALTERNATIVE_FORECAST_SCENARIO',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Alternative Forecast Scenario',
    canonicalFa: 'سناریوی جایگزین پیش‌بینی',
    shortLabelEn: 'Alternative Scenario',
    shortLabelFa: 'سناریوی جایگزین',
    tooltipEn: 'Shadow state-space hypothesis evaluated in parallel against live market data before any promotion to the primary forecast.',
    tooltipFa: 'فرضیه موازی فضای حالت که پیش از هرگونه ارتقا به پیش‌بینی اصلی، به‌طور هم‌زمان در برابر داده‌های زنده بازار آزموده می‌شود.',
    technicalDefinitionEn:
      'Isolated shadow ensemble ("Parallel Universe Discovery Core") exploring perturbed decay rates, macro sensitivities, and regime-switching thresholds under strict out-of-sample L1 residual scoring.',
    technicalDefinitionFa:
      'مجموعه مدل سایه ایزوله که نرخ‌های میرایی، حساسیت‌های کلان و آستانه‌های تغییر رژیم جایگزین را تحت ارزیابی سخت‌گیرانه خطای L1 خارج از نمونه می‌آزماید.',
    variableOrEquation: 'L_cand(t) = Σ_{k=1}^W γ^{W-k} |P_{t-k} - P̂^{(cand)}_{t-k}|',
    unitAndSignConvention: 'Trajectory in USD/oz; promotion requires strictly lower cumulative out-of-sample L1 error than the live model.',
    epistemicClassification: 'forecast',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Shadow Model Hypothesis', 'Parallel Scenario Evaluation'],
    approvedAliasesFa: ['فرضیه مدل سایه', 'ارزیابی سناریوی موازی پیش‌بینی'],
    deprecatedTermsEn: ['Multiverse Portal', 'Quantum Timeline Split'],
    deprecatedTermsFa: ['پورتال چندجهانی کوانتومی'],
    localizationNotes: 'When "Parallel Universe" is retained as an internal module title, pair it with «سناریوی جایگزین پیش‌بینی (محیط موازی اکتشافی)».'
  },

  PREDICTIVE_INTERVAL_UNCERTAINTY_BAND: {
    id: 'PREDICTIVE_INTERVAL_UNCERTAINTY_BAND',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Predictive Interval / Forecast Uncertainty Band',
    canonicalFa: 'بازه پیش‌بینی / باند عدم‌قطعیت پیش‌بینی',
    shortLabelEn: 'Uncertainty Band (68% · 95%)',
    shortLabelFa: 'باند عدم‌قطعیت (۶۸٪ · ۹۵٪)',
    tooltipEn: 'Horizon-expanding ±1σ (P25–P75 / 68%) and ±2σ (P05–P95 / 95%) dispersion cones around the conditional mean trajectory.',
    tooltipFa: 'مخروط‌های پراکندگی ±1σ (۶۸٪) و ±2σ (۹۵٪) حول مسیر میانگین شرطی که با افزایش افق زمانی پیش‌بینی بازتر می‌شوند.',
    technicalDefinitionEn:
      'Parametric dispersion envelope P̂_{t+h|t} ± z_α · σ_t · √h · (1 + κ · JumpHazard_t) calibrated against realized empirical coverage.',
    technicalDefinitionFa:
      'پوشش پراکندگی پارامتریک P̂_{t+h|t} ± z_α · σ_t · √h · (1 + κ · JumpHazard_t) که در برابر پوشش تجربی تحقق‌یافته کالیبره می‌شود.',
    variableOrEquation: '[P05, P25, P50, P75, P95] = P̂_{t+h|t} ± {1σ, 2σ} · √h',
    unitAndSignConvention: 'Bounds in USD/oz; strictly ordered P05 ≤ P25 ≤ P50 ≤ P75 ≤ P95 at every horizon step h.',
    epistemicClassification: 'forecast',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Confidence Fan (±1σ / ±2σ)', 'Forecast Dispersion Envelope'],
    approvedAliasesFa: ['مخروط عدم‌قطعیت (±1σ / ±2σ)', 'پوشش پراکندگی پیش‌بینی'],
    deprecatedTermsEn: ['Guaranteed Price Corridor', 'Risk-Free Channel'],
    deprecatedTermsFa: ['کانال قیمتی تضمین‌شده'],
    localizationNotes: 'Keep +2σ (P95), +1σ (P75), -1σ (P25), -2σ (P05) markers in LTR isolation.'
  },

  ADAPTIVE_MODEL_EVALUATION_AND_VALIDATION: {
    id: 'ADAPTIVE_MODEL_EVALUATION_AND_VALIDATION',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Adaptive Model Evaluation and Validation',
    canonicalFa: 'ارزیابی و اعتبارسنجی تطبیقی مدل',
    shortLabelEn: 'Model Validation',
    shortLabelFa: 'اعتبارسنجی تطبیقی مدل',
    tooltipEn: 'Continuous out-of-sample benchmarking, calibration auditing (ECE, Brier, PIT), and gated candidate promotion.',
    tooltipFa: 'محک‌زنی پیوسته خارج از نمونه، ممیزی کالیبراسیون احتمالی (ECE، امتیاز بریر، PIT) و ارتقای کنترل‌شده مدل نامزد.',
    technicalDefinitionEn:
      'Closed-loop governance protocol combining rolling out-of-sample forecast verification, sequential drift testing, and manual or verified automatic promotion of superior candidate architectures.',
    technicalDefinitionFa:
      'پروتکل حاکمیتی حلقه بسته شامل راستی‌آزمایی غلتان پیش‌بینی‌های خارج از نمونه، آزمون‌های ترتیبی انحراف و ارتقای دستی یا خودکارِ تأییدشده معماری‌های نامزد برتر.',
    variableOrEquation: 'Promote if VerifiedCycles ≥ N_min ∧ MAE_cand < (1 - δ) MAE_live',
    unitAndSignConvention: 'MAE/RMSE in USD/oz; Brier score and ECE in [0, 1] (lower = better calibration).',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Out-of-Sample Model Governance', 'Empirical Forecast Verification'],
    approvedAliasesFa: ['حاکمیت مدل خارج از نمونه', 'راستی‌آزمایی تجربی پیش‌بینی'],
    deprecatedTermsEn: ['Unconditional AI Self-Evolution', 'Autonomous Neural Mutation'],
    deprecatedTermsFa: ['تکامل خودمختار هوش مصنوعی'],
    localizationNotes: 'Emphasize empirical verification and statistical gating criteria.'
  },

  LIQUIDITY_SWEEP_VS_BREAKOUT_CLASSIFIER: {
    id: 'LIQUIDITY_SWEEP_VS_BREAKOUT_CLASSIFIER',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Liquidity-Sweep Versus Breakout Classifier',
    canonicalFa: 'طبقه‌بند جاروب نقدینگی در برابر شکست واقعی',
    shortLabelEn: 'Sweep vs. Breakout Classifier',
    shortLabelFa: 'طبقه‌بند جاروب یا شکست',
    tooltipEn: 'Rule-based microstructure classifier distinguishing stop-loss liquidity sweeps (false breakouts) from sustained structural breakouts.',
    tooltipFa: 'طبقه‌بند مبتنی بر قواعد ساختار خرد که جاروب نقدینگی حدضررها (شکست کاذب) را از شکست ساختاری پایدار تفکیک می‌کند.',
    technicalDefinitionEn:
      'Evaluates wick-to-body rejection ratios, volume-spike z-scores, and breaches of prior 20-bar swing highs/lows to estimate stop-run reversion risk versus breakout continuation.',
    technicalDefinitionFa:
      'با ارزیابی نسبت سایه به بدنه کندل، نمره معیار جهش حجم و عبور از سقف یا کف ۲۰ کندل اخیر، ریسک بازگشت ناشی از جاروب نقدینگی را در برابر تداوم شکست برآورد می‌کند.',
    variableOrEquation: 'I(High_t > max_{20} High ∧ Close_t < max_{20} High) · WickRatio_t',
    unitAndSignConvention: 'Normalized heuristic score in [0, 100]; states: NEUTRAL, WATCH, ACTIVE_SWEEP, STRUCTURAL_BREAKOUT.',
    epistemicClassification: 'proxy',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Stop-Run & Rejection Heuristic', 'False-Breakout Microstructure Filter'],
    approvedAliasesFa: ['پروکسی تشخیص جاروب حدضرر و بازگشت قیمت', 'فیلتر شکست کاذب و جاروب نقدینگی'],
    deprecatedTermsEn: ['Sweep Shield Defense System', 'Kill Zone Detector'],
    deprecatedTermsFa: ['سپر دفاعی جاروب', 'آشکارساز منطقه کشتار'],
    localizationNotes: 'Avoid military/combat metaphors; use standard microstructure liquidity-sweep and false-breakout terminology.'
  },

  PRIMARY_FORECAST_TRAJECTORY: {
    id: 'PRIMARY_FORECAST_TRAJECTORY',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Primary Forecast Trajectory',
    canonicalFa: 'مسیر پیش‌بینی اصلی',
    shortLabelEn: 'Primary Forecast (Yellow)',
    shortLabelFa: 'مسیر پیش‌بینی اصلی (زرد)',
    tooltipEn: 'Active production conditional-mean price projection (solid yellow curve) generated by the verified live model architecture.',
    tooltipFa: 'مسیر پیش‌بینی میانگین شرطی فعال در محیط عملیاتی (منحنی پیوسته زرد) که توسط معماری مدل زنده و تأییدشده تولید می‌شود.',
    technicalDefinitionEn:
      'Conditional expectation E[P_{t+h} | F_t] over the 12-step forward horizon generated by blending the state-space observer, ARX macro drift, and mean-reversion anchor.',
    technicalDefinitionFa:
      'امید ریاضی شرطی E[P_{t+h} | F_t] در افق ۱۲ گام آینده که از ترکیب ناظر فضای حالت، رانش کلان ARX و لنگر بازگشت به میانگین حاصل می‌شود.',
    variableOrEquation: 'P̂^{(live)}_{t+h|t} = E[P_{t+h} | F_t, θ_live]',
    unitAndSignConvention: 'USD/oz across forward horizon steps h = 1..12.',
    epistemicClassification: 'forecast',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Live Forecast Trajectory', 'Conditional Mean Projection'],
    approvedAliasesFa: ['مسیر پیش‌بینی زنده', 'برآورد مسیر میانگین شرطی'],
    deprecatedTermsEn: ['Golden Oracle Line', 'Destiny Trajectory'],
    deprecatedTermsFa: ['خط طلایی اوراکل'],
    localizationNotes: 'Explicitly reference the solid yellow visual encoding in legend tooltips for both languages.'
  },

  CANDIDATE_FORECAST_TRAJECTORY: {
    id: 'CANDIDATE_FORECAST_TRAJECTORY',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Candidate Forecast Trajectory',
    canonicalFa: 'مسیر پیش‌بینی نامزد',
    shortLabelEn: 'Candidate Trajectory (Magenta)',
    shortLabelFa: 'مسیر پیش‌بینی نامزد (سرخابی)',
    tooltipEn: 'Shadow challenger price projection (dashed magenta curve) evaluated in real time against the primary forecast.',
    tooltipFa: 'مسیر پیش‌بینی رقیب در محیط سایه (منحنی خط‌چین سرخابی) که به‌صورت بی‌درنگ در برابر پیش‌بینی اصلی ارزیابی می‌شود.',
    technicalDefinitionEn:
      'Forward trajectory P̂^{(cand)}_{t+h|t} produced by the highest-performing shadow parameterization in the Parallel Universe discovery pool.',
    technicalDefinitionFa:
      'مسیر پیش‌رو P̂^{(cand)}_{t+h|t} تولیدشده توسط بهترین پارامتربندی سایه در مجموعه اکتشافی سناریوهای جایگزین.',
    variableOrEquation: 'P̂^{(cand)}_{t+h|t} = E[P_{t+h} | F_t, θ_candidate]',
    unitAndSignConvention: 'USD/oz across forward horizon steps h = 1..12; rendered as dashed magenta (#d946ef).',
    epistemicClassification: 'forecast',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Challenger Forecast Trajectory', 'Shadow Candidate Projection'],
    approvedAliasesFa: ['مسیر پیش‌بینی رقیب', 'پیش‌بینی نامزد در محیط سایه'],
    deprecatedTermsEn: ['Magenta Multiverse Beam'],
    deprecatedTermsFa: ['پرتو سرخابی جهان موازی'],
    localizationNotes: 'Use «مسیر پیش‌بینی نامزد» consistently across chart legend, Parallel Universe modal, and MMI controls.'
  },

  INSTRUMENT_BASIS_ADJUSTMENT: {
    id: 'INSTRUMENT_BASIS_ADJUSTMENT',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Instrument Basis Adjustment',
    canonicalFa: 'تعدیل اختلاف قیمت ابزارها (Basis)',
    shortLabelEn: 'Basis Adjustment',
    shortLabelFa: 'تعدیل پایه قیمتی (Basis)',
    tooltipEn: 'Rolling spread calibration and z-score monitoring between spot gold proxies (PAXG/USD, XAU/USD) and COMEX gold futures (GC=F).',
    tooltipFa: 'کالیبراسیون غلتان اسپرد و پایش نمره معیار (z-score) اختلاف قیمت میان ابزارهای نقدی طلا (PAXG/USD، XAU/USD) و قرارداد آتی کامکس (GC=F).',
    technicalDefinitionEn:
      'First-order rolling EWMA mean and variance normalization of the futures-to-spot basis spread Basis_t = F_{GC,t} - S_{XAU,t} plus cross-venue observation offsets b_k.',
    technicalDefinitionFa:
      'نرمال‌سازی میانگین و واریانس غلتان EWMA مرتبه اول برای اختلاف قیمت آتی به نقدی Basis_t = F_{GC,t} - S_{XAU,t} به‌همراه افست‌های اندازه‌گیری بین‌بازاره b_k.',
    variableOrEquation: 'Basis_t = F_{GC,t} - S_{XAU,t},  Z_{basis,t} = (Basis_t - μ_{EWMA}) / σ_{EWMA}',
    unitAndSignConvention: 'Spread in USD/oz; normalized basis in dimensionless z-score units (σ).',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Rolling Futures-Spot Basis Z-Score', 'Cross-Venue Basis Calibration'],
    approvedAliasesFa: ['نمره معیار اختلاف قیمت آتی و نقدی', 'کالیبراسیون اختلاف قیمت بین‌بازاره (Basis)'],
    deprecatedTermsEn: ['Johansen Cointegration Vector', 'Strict Cointegration Arbitrage Filter'],
    deprecatedTermsFa: ['بردار هم‌انباشتگی یوهانسن', 'فیلتر آربیتراژ هم‌انباشتگی'],
    localizationNotes: 'Include "(Basis)" on first Persian reference so quantitative traders immediately recognize the spread concept.'
  },

  CROSS_ASSET_SENSITIVITY: {
    id: 'CROSS_ASSET_SENSITIVITY',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Cross-Asset Sensitivity',
    canonicalFa: 'حساسیت بین‌دارایی',
    shortLabelEn: 'Cross-Asset Sensitivity',
    shortLabelFa: 'حساسیت بین‌دارایی',
    tooltipEn: 'Dynamic beta and correlation coupling between gold returns and US Dollar Index (DXY), Treasury yields, real yields (TIPS), and equity volatility.',
    tooltipFa: 'ضرایب حساسیت (بتا) و همبستگی پویا میان بازده طلا و شاخص دلار (DXY)، بازده اوراق خزانه‌داری، بازده حقیقی (TIPS) و نوسان بازار سهام.',
    technicalDefinitionEn:
      'Rolling 20-period Pearson correlation ρ(ΔP_XAU, ΔMacro_i) and ridge-regularized ARX regression sensitivities β_i.',
    technicalDefinitionFa:
      'همبستگی پیرسون غلتان ۲۰ دوره‌ای ρ(ΔP_XAU, ΔMacro_i) و ضرایب حساسیت رگرسیون منظم‌سازی‌شده ARX (β_i).',
    variableOrEquation: 'β_i = Cov(ΔP_t, Δu_{i,t-1}) / (Var(Δu_{i,t-1}) + λ)',
    unitAndSignConvention: 'Correlation ρ ∈ [-1, +1]; sensitivity β in USD/oz per 1σ macro move.',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Macro Factor Beta & Correlation', 'Cross-Market Coupling'],
    approvedAliasesFa: ['بتا و همبستگی عوامل کلان', 'هم‌بستگی و حساسیت بین‌بازاره'],
    deprecatedTermsEn: ['Orthogonal Eigen-Gravity Tensor'],
    deprecatedTermsFa: ['تانسور گرانش ویژه متعامد'],
    localizationNotes: 'Use «حساسیت بین‌دارایی» for regression betas and «همبستگی غلتان» for rolling Pearson correlations.'
  },

  VOLATILITY_REGIME: {
    id: 'VOLATILITY_REGIME',
    domain: 'CORE_TERMINOLOGY',
    canonicalEn: 'Volatility Regime',
    canonicalFa: 'رژیم نوسان',
    shortLabelEn: 'Volatility Regime',
    shortLabelFa: 'رژیم نوسان',
    tooltipEn: 'Classification of current market state into Low-Volatility Compression, Normal Diffusion, Trend Expansion, or High-Volatility Tail Shock.',
    tooltipFa: 'طبقه‌بندی وضعیت جاری بازار در یکی از حالت‌های فشردگی کم‌نوسان، انتشار عادی، گسترش رونددار یا شوک دنباله پرنوسان.',
    technicalDefinitionEn:
      'Continuous regime membership vector π_t across {TREND, RANGE, VOLATILITY_SHOCK, LIQUIDITY_VACUUM} derived from realized ATR ratios, Hurst exponent H, and jump-tail hazard.',
    technicalDefinitionFa:
      'بردار عضویت پیوسته رژیم بازار π_t در چهار حالت {رونددار، نوسان محدود، شوک نوسانی، خلأ نقدینگی} بر اساس نسبت ATR تحقق‌یافته، نمای هرست (H) و نرخ خطر پرش.',
    variableOrEquation: 'π_t = Softmax(f(ATR_ratio, H_t, JumpHazard_t))',
    unitAndSignConvention: 'Probabilities π_{k,t} ∈ [0, 1] with Σ_k π_{k,t} = 1.0.',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Market Volatility State', 'Soft Regime Probability Vector'],
    approvedAliasesFa: ['وضعیت نوسان بازار', 'بردار احتمال رژیم‌های بازار'],
    deprecatedTermsEn: ['Sea State Beaufort Scale'],
    deprecatedTermsFa: ['مقیاس بوفورت وضعیت دریا'],
    localizationNotes: 'Translate regime labels cleanly: Trend = «رونددار»، Range = «دامنه نوسانی محدود»، Shock = «شوک نوسانی»، Vacuum = «خلأ نقدینگی».'
  },

  MARKET_DATA_FEED_INTEGRITY: {
    id: 'MARKET_DATA_FEED_INTEGRITY',
    domain: 'GOVERNANCE_AND_INTEGRITY',
    canonicalEn: 'Market-Data Feed Integrity',
    canonicalFa: 'یکپارچگی جریان داده‌های بازار',
    shortLabelEn: 'Feed Integrity',
    shortLabelFa: 'یکپارچگی داده',
    tooltipEn: 'Real-time verification of market data freshness, instrument provenance, zero-synthetic-fallback enforcement, and circuit-breaker health.',
    tooltipFa: 'راستی‌آزمایی بی‌درنگ تازگی داده‌های بازار، اصالت ابزار معاملاتی، ممنوعیت داده‌های مصنوعی و سلامت مدارشکن ایمنی.',
    technicalDefinitionEn:
      'Strict provenance audit enforcing STRICT_REAL_DATA_ONLY = true, verifying feed latency, schema validity, and explicit spot vs. tokenized-gold (PAXG) vs. futures (GC=F) identity.',
    technicalDefinitionFa:
      'ممیزی سخت‌گیرانه اصالت داده با اعمال قانون STRICT_REAL_DATA_ONLY = true، بررسی تأخیر فید، اعتبار اسکیما و تفکیک شفاف هویت ابزار نقدی (XAU/USD)، طلای توکنیزه‌شده (PAXG) و آتی (GC=F).',
    variableOrEquation: 'IntegrityState ∈ {OK, DEGRADED, HALTED_CIRCUIT_BREAKER}',
    unitAndSignConvention: 'Categorical state + freshness lag in milliseconds/seconds.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Real-Data Provenance & Feed Health', 'Strict Real-Data Governance'],
    approvedAliasesFa: ['اصالت و سلامت جریان داده زنده', 'حاکمیت داده واقعی بدون جایگزین مصنوعی'],
    deprecatedTermsEn: ['Telemetry Uplink Shield'],
    deprecatedTermsFa: ['سپر ارتباطی تله‌متری'],
    localizationNotes: 'Always state clearly when a venue is degraded or when PAXG/USD spot token is active.'
  },

  DATA_PROVIDER_QUORUM: {
    id: 'DATA_PROVIDER_QUORUM',
    domain: 'GOVERNANCE_AND_INTEGRITY',
    canonicalEn: 'Data-Provider Quorum',
    canonicalFa: 'حدنصاب تأمین‌کنندگان داده',
    shortLabelEn: 'Provider Quorum',
    shortLabelFa: 'حدنصاب منابع داده',
    tooltipEn: 'Cross-venue consensus check measuring price agreement and staleness across independent market data providers.',
    tooltipFa: 'بررسی اجماع بین‌بازاره که میزان توافق قیمتی و تازگی داده‌ها را میان تأمین‌کنندگان مستقل داده بازار می‌سنجد.',
    technicalDefinitionEn:
      'Multi-provider validation gate evaluating active venue count N_active, cross-venue basis dispersion σ_venue, and staleness thresholds.',
    technicalDefinitionFa:
      'دروازه اعتبارسنجی چندمنبعی که تعداد منابع فعال N_active، پراکندگی قیمت بین‌بازاره σ_venue و آستانه‌های کهنگی داده را ارزیابی می‌کند.',
    variableOrEquation: 'QuorumPass ⇔ (N_active ≥ N_min) ∧ (max_{j,k} |P_j - P_k - b_{jk}| ≤ τ_max)',
    unitAndSignConvention: 'Active provider count (integer) and dispersion in USD/oz or bps.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Multi-Venue Data Consensus', 'Cross-Provider Quorum Gate'],
    approvedAliasesFa: ['اجماع چندبازاره منابع داده', 'دروازه حدنصاب تأمین‌کنندگان داده'],
    deprecatedTermsEn: ['Sensor Array Voting Quorum'],
    deprecatedTermsFa: ['حدنصاب رأی‌گیری آرایه حسگرها'],
    localizationNotes: 'Use «حدنصاب تأمین‌کنندگان داده» in formal headers and «حدنصاب منابع داده» in compact badges.'
  },

  FORECAST_RELIABILITY: {
    id: 'FORECAST_RELIABILITY',
    domain: 'GOVERNANCE_AND_INTEGRITY',
    canonicalEn: 'Forecast Reliability',
    canonicalFa: 'قابلیت اتکای پیش‌بینی',
    shortLabelEn: 'Forecast Reliability',
    shortLabelFa: 'قابلیت اتکای پیش‌بینی',
    tooltipEn: 'Decomposed 4-pillar diagnostic profile: Data Freshness & Quorum, Cross-Asset Agreement, Kalman Innovation Stability, and Empirical Calibration.',
    tooltipFa: 'پروفایل تشخیصی چهارستونه شامل: تازگی و حدنصاب داده، هم‌جهتی بین‌دارایی، پایداری نوآوری کالمن و کالیبراسیون تجربی خارج از نمونه.',
    technicalDefinitionEn:
      'Multi-dimensional diagnostic vector [S_data, S_macro, S_innovation, S_calibration] replacing any single uncalibrated "confidence percentage".',
    technicalDefinitionFa:
      'بردار تشخیصی چندبعدی [S_data, S_macro, S_innovation, S_calibration] که جایگزین هرگونه «درصد اطمینان» تک‌عددی و کالیبره‌نشده شده است.',
    variableOrEquation: 'ReliabilityProfile = { dataHealth, factorAgreement, filterStability, empiricalCalibration }',
    unitAndSignConvention: 'Each sub-pillar scored in [0, 100] with explicit qualitative tier {HIGH, MODERATE, DEGRADED, UNCALIBRATED}.',
    epistemicClassification: 'estimated',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['4-Pillar Diagnostic Quality Profile', 'Decomposed Forecast Quality'],
    approvedAliasesFa: ['پروفایل کیفیت تشخیصی چهارستونه', 'کیفیت تفکیک‌شده پیش‌بینی'],
    deprecatedTermsEn: ['Win Probability %', 'Guaranteed Accuracy Score'],
    deprecatedTermsFa: ['درصد احتمال برد قطعی', 'امتیاز دقت تضمینی'],
    localizationNotes: 'Never collapse Forecast Reliability into a single uncalibrated win-probability percentage.'
  },

  // ============================================================================
  // PART 2: PRESERVED 3D MARKET THEATRE CINEMATIC LAYERS (6 MANDATORY CONCEPTS)
  // ============================================================================
  THEATRE_ARENA: {
    id: 'THEATRE_ARENA',
    domain: 'THEATRE_LAYER',
    canonicalEn: 'Arena (Live Spot Execution & Order-Flow Ring)',
    canonicalFa: 'صحنه نبرد بازار (Arena — حلقه جریان سفارش و قیمت نقدی)',
    shortLabelEn: 'Arena',
    shortLabelFa: 'Arena (صحنه اصلی بازار)',
    tooltipEn: 'Central 3D focal ring visualizing the live spot price anchor, bid/ask pressure waves, and volume-synchronized pulse intensity.',
    tooltipFa: 'حلقه کانونی سه‌بعدی که قیمت لحظه‌ای نقدی، امواج فشار خرید و فروش و شدت تپش همگام با حجم معاملات را نمایش می‌دهد.',
    technicalDefinitionEn:
      'Maps live spot price P_t, intrabar order-flow imbalance OFI_t, and information-clock rate Δτ_t to the central ring elevation, color temperature, and shockwave cadence.',
    technicalDefinitionFa:
      'قیمت نقدی زنده P_t، ناترازی جریان سفارش درون‌کندلی OFI_t و نرخ ساعت اطلاعاتی Δτ_t را به تراز ارتفاعی، دمای رنگ و ضرباهنگ موج‌های حلقه مرکزی نگاشت می‌کند.',
    variableOrEquation: 'ArenaState = f(P_t, OFI_t, Δτ_t, Spread_t)',
    unitAndSignConvention: 'Center anchored at current spot price (USD/oz); green/cyan glow = net buyer dominance, red/amber glow = net seller dominance.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['The Arena', 'Arena — Live Microstructure Floor'],
    approvedAliasesFa: ['صحنه اصلی (Arena)', 'میدان مرکزی جریان سفارش (Arena)'],
    deprecatedTermsEn: [],
    deprecatedTermsFa: [],
    localizationNotes: 'Preserve the canonical layer name "Arena" while pairing it with its exact Persian financial explanation.'
  },

  THEATRE_BULL_BEAR_TITANS: {
    id: 'THEATRE_BULL_BEAR_TITANS',
    domain: 'THEATRE_LAYER',
    canonicalEn: 'Bull and Bear Titans (Directional Order-Flow Forces)',
    canonicalFa: 'تایتان‌های گاو و خرس (Bull and Bear Titans — نیروهای فشار خرید و فروش)',
    shortLabelEn: 'Bull and Bear Titans',
    shortLabelFa: 'تایتان‌های خرید و فروش (Bull & Bear)',
    tooltipEn: 'Opposing sculptural energy forms driven directly by real-time net buyer aggression versus net seller pressure and multi-timeframe momentum.',
    tooltipFa: 'دو پیکره انرژی متقابل که مستقیماً توسط قدرت خالص خریداران در برابر فشار فروشندگان و مومنتوم چندزمانه هدایت می‌شوند.',
    technicalDefinitionEn:
      'Scales opposing force vectors using normalized order-flow imbalance OFI_t, directional volume delta, and state-space velocity v_τ.',
    technicalDefinitionFa:
      'بردارهای نیروی متقابل را بر اساس ناترازی نرمال‌شده جریان سفارش OFI_t، دلتای حجم جهتی و سرعت فضای حالت v_τ مقیاس‌بندی می‌کند.',
    variableOrEquation: 'F_bull = σ(+OFI_t, +v_τ),  F_bear = σ(-OFI_t, -v_τ)',
    unitAndSignConvention: 'Normalized force ratio in [0, 1]; symmetric equilibrium at 0.50 / 0.50.',
    epistemicClassification: 'proxy',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Bull and Bear Titans', 'Directional Pressure Titans'],
    approvedAliasesFa: ['تایتان‌های گاو و خرس', 'قطب‌های فشار خرید و فروش'],
    deprecatedTermsEn: [],
    deprecatedTermsFa: [],
    localizationNotes: 'Preserve "Bull and Bear Titans" as the cinematic layer name and explain its real order-flow pressure inputs.'
  },

  THEATRE_GRAVEYARD: {
    id: 'THEATRE_GRAVEYARD',
    domain: 'THEATRE_LAYER',
    canonicalEn: 'Graveyard (Invalidated Levels & Swept Stop Clusters)',
    canonicalFa: 'گورستان سطوح شکسته (Graveyard — سطوح بی‌اعتبارشده و خوشه‌های حدضرر جاروب‌شده)',
    shortLabelEn: 'Graveyard',
    shortLabelFa: 'Graveyard (گورستان سطوح شکسته)',
    tooltipEn: 'Spatial archive of historical support/resistance zones where resting stop-loss liquidity was swept or structurally invalidated.',
    tooltipFa: 'بایگانی فضایی سطوح حمایت و مقاومت تاریخی که نقدینگی حدضرر در آن‌ها جاروب شده یا به‌طور ساختاری شکسته و بی‌اعتبار شده‌اند.',
    technicalDefinitionEn:
      'Records price levels P_swept where the Liquidity-Sweep Versus Breakout Classifier detected high-volume wick rejections or structural level breaches.',
    technicalDefinitionFa:
      'سطوح قیمتی P_swept را ثبت می‌کند که در آن‌ها طبقه‌بند جاروب نقدینگی در برابر شکست، رد قیمتی پرحجم یا شکست ساختاری سطح را تشخیص داده است.',
    variableOrEquation: 'GraveyardSet = { (t_i, P_i, SweepIntensity_i) | LevelBreached(P_i) = true }',
    unitAndSignConvention: 'Price levels in USD/oz with historical timestamp and rejection magnitude.',
    epistemicClassification: 'proxy',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['The Graveyard', 'Graveyard — Swept Liquidity Monoliths'],
    approvedAliasesFa: ['گورستان نقدینگی (Graveyard)', 'سطوح جاروب‌شده تاریخی (Graveyard)'],
    deprecatedTermsEn: [],
    deprecatedTermsFa: [],
    localizationNotes: 'Preserve "Graveyard" and clearly state that monoliths represent historically swept liquidity and invalidated price levels.'
  },

  THEATRE_DEEP_TERRAIN: {
    id: 'THEATRE_DEEP_TERRAIN',
    domain: 'THEATRE_LAYER',
    canonicalEn: 'Deep Terrain (Multi-Timeframe Liquidity Depth Topography)',
    canonicalFa: 'توپوگرافی عمق نقدینگی (Deep Terrain — بستر نقدینگی چندزمانه)',
    shortLabelEn: 'Deep Terrain',
    shortLabelFa: 'Deep Terrain (بستر عمق نقدینگی)',
    tooltipEn: '3D topographic elevation mesh representing resting liquidity concentration, volume profile nodes, and support/resistance walls.',
    tooltipFa: 'شبکه ارتفاعی سه‌بعدی که تمرکز نقدینگی در انتظار، گره‌های پروفایل حجم و دیوارهای حمایت و مقاومت چندزمانه را نمایش می‌دهد.',
    technicalDefinitionEn:
      'Constructs a continuous spatial surface z(P, t) from multi-timeframe OHLCV volume concentration and price-acceptance density.',
    technicalDefinitionFa:
      'یک سطح فضایی پیوسته z(P, t) از تمرکز حجم معاملات چندزمانه (OHLCV) و چگالی پذیرش قیمت می‌سازد.',
    variableOrEquation: 'Elevation(P) = Σ_{tf ∈ {1m,5m,15m,1h,4h}} w_{tf} · VolumeNodeDensity_{tf}(P)',
    unitAndSignConvention: 'Horizontal axis = price (USD/oz), vertical elevation = relative liquidity depth [0, 1].',
    epistemicClassification: 'proxy',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Deep Terrain', 'Liquidity Depth Topography'],
    approvedAliasesFa: ['بستر عمیق نقدینگی (Deep Terrain)', 'توپوگرافی حجم و نقدینگی'],
    deprecatedTermsEn: [],
    deprecatedTermsFa: [],
    localizationNotes: 'Preserve "Deep Terrain" while grounding the explanation in multi-timeframe volume profile and liquidity depth.'
  },

  THEATRE_MACRO_SKY: {
    id: 'THEATRE_MACRO_SKY',
    domain: 'THEATRE_LAYER',
    canonicalEn: 'Macro Sky (Exogenous Cross-Asset Macro Canopy)',
    canonicalFa: 'آسمان کلان (Macro Sky — چتر محرک‌های کلان بین‌دارایی)',
    shortLabelEn: 'Macro Sky',
    shortLabelFa: 'Macro Sky (آسمان محرک‌های کلان)',
    tooltipEn: 'Upper atmospheric canopy driven by live US Dollar Index (DXY), 10Y Treasury yields, TIPS real yields, VIX volatility, and silver cross-currents.',
    tooltipFa: 'چتر اتمسفری فوقانی که توسط شاخص دلار آمریکا (DXY)، بازده اوراق ده ساله، بازده حقیقی (TIPS)، شاخص نوسان (VIX) و همبستگی نقره هدایت می‌شود.',
    technicalDefinitionEn:
      'Visualizes the exogenous macro forcing vector u_t and cross-asset alignment score as directional atmospheric drift and canopy illumination.',
    technicalDefinitionFa:
      'بردار محرک‌های برون‌زای کلان u_t و شاخص هم‌راستایی بین‌دارایی را به‌صورت جریان‌های اتمسفری جهتی و درخشش چتر فوقانی تصویرسازی می‌کند.',
    variableOrEquation: 'MacroCanopy = f(ΔDXY_t, ΔUS10Y_t, ΔDFII10_t, ΔVIX_t, MacroAlignmentScore_t)',
    unitAndSignConvention: 'Macro pressure index in [-100, +100]; positive (+) = supportive macro tailwinds for gold, negative (-) = macro headwinds.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Macro Sky', 'Exogenous Macro Canopy'],
    approvedAliasesFa: ['آسمان کلان (Macro Sky)', 'سقف محرک‌های کلان اقتصادی'],
    deprecatedTermsEn: [],
    deprecatedTermsFa: [],
    localizationNotes: 'Preserve "Macro Sky" and explicitly list DXY, US10Y, TIPS real yields, and VIX as the driving variables.'
  },

  THEATRE_HISTORICAL_REPLAY: {
    id: 'THEATRE_HISTORICAL_REPLAY',
    domain: 'THEATRE_LAYER',
    canonicalEn: 'Historical Replay (Time-Indexed Market State Reconstruction)',
    canonicalFa: 'بازپخش تاریخی (Historical Replay — بازسازی زمانی وضعیت بازار)',
    shortLabelEn: 'Historical Replay',
    shortLabelFa: 'Historical Replay (بازپخش تاریخی)',
    tooltipEn: 'Deterministic bar-by-bar scrubbing and playback of historical OHLCV bars, latent state estimates, and forecast trajectories.',
    tooltipFa: 'پیمایش و بازپخش کندل‌به‌کندل داده‌های تاریخی OHLCV، برآوردهای وضعیت پنهان و مسیرهای پیش‌بینی ثبت‌شده.',
    technicalDefinitionEn:
      'Reconstructs the complete 2D and 3D market state at historical bar index t_replay using recorded OHLCV history and causal filter evaluation.',
    technicalDefinitionFa:
      'وضعیت کامل دوبعدی و سه‌بعدی بازار را در اندیس زمانی تاریخی t_replay با استفاده از تاریخچه واقعی OHLCV و ارزیابی علی فیلترها بازسازی می‌کند.',
    variableOrEquation: 'State(t_replay) = EvaluateCausalPipeline(History_{1..t_replay})',
    unitAndSignConvention: 'Bar index t ∈ [1, N] with UTC timestamp and historical spot price in USD/oz.',
    epistemicClassification: 'observed',
    implementationStatus: 'implemented_and_verified',
    approvedAliasesEn: ['Historical Replay', 'Causal Market State Scrubbing'],
    approvedAliasesFa: ['بازپخش تاریخی (Historical Replay)', 'مرور زمانی وضعیت‌های گذشته بازار'],
    deprecatedTermsEn: [],
    deprecatedTermsFa: [],
    localizationNotes: 'Preserve "Historical Replay" in navigation and storyboard controls.'
  }
};

/**
 * Normalizes Persian text to guarantee strict character hygiene:
 * 1. Replaces Arabic Yeh 'ي' (U+064A) and Alef Maksura 'ى' (U+0649) with Persian Yeh 'ی' (U+06CC).
 * 2. Replaces Arabic Kaf 'ك' (U+0643) with Persian Kaf 'ک' (U+06A9).
 * 3. Removes accidental stray CJK/Hangul characters while preserving Persian, Latin, mathematical, and punctuation symbols.
 */
export function normalizePersianTypography(input: string): string {
  if (!input || typeof input !== 'string') return input;
  return input
    .replace(/[\u064A\u0649]/g, '\u06CC')
    .replace(/\u0643/g, '\u06A9')
    .replace(/[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Checks whether a Persian string violates typography hygiene (contains Arabic Yeh/Kaf or stray Hangul/CJK).
 */
export function auditPersianStringHygiene(text: string): {
  valid: boolean;
  hasArabicYeh: boolean;
  hasArabicKaf: boolean;
  hasForeignScriptTypo: boolean;
} {
  const hasArabicYeh = /[\u064A\u0649]/.test(text);
  const hasArabicKaf = /\u0643/.test(text);
  const hasForeignScriptTypo = /[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/.test(text);
  return {
    valid: !hasArabicYeh && !hasArabicKaf && !hasForeignScriptTypo,
    hasArabicYeh,
    hasArabicKaf,
    hasForeignScriptTypo
  };
}

export function getConceptById(id: string): FinancialConceptEntry | null {
  return FINANCIAL_TERMINOLOGY_DICTIONARY[id] || null;
}

export function getAllConcepts(): FinancialConceptEntry[] {
  return Object.values(FINANCIAL_TERMINOLOGY_DICTIONARY);
}
