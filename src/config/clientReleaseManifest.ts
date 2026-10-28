import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type ClientUpdateState =
  | 'CHECKING'
  | 'UPDATE_AVAILABLE'
  | 'UP_TO_DATE'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'INSTALLING'
  | 'RELOADING'
  | 'FAILED'
  | 'UNKNOWN';

export type ClientVersionComparisonOutcome =
  | 'EQUAL'
  | 'INSTALLED_OLDER'
  | 'INSTALLED_NEWER_INCONSISTENT'
  | 'INCOMPATIBLE_SERVER'
  | 'UNVERIFIED_MANIFEST'
  | 'MALFORMED_MANIFEST'
  | 'UNREACHABLE_MANIFEST';

export type AllowedUpdateMenuAction = 'CHECK_FOR_UPDATES' | 'UPDATE_NOW' | 'RETRY' | 'CLOSE';

export interface ParsedGdfVersion {
  raw: string;
  dateNumber: number; // YYYYMMDD or 0 if not date-prefixed
  major: number;
  minor: number;
  patch: number;
  buildTag: string;
}

export interface ClientReleaseAssetMetadata {
  path: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
  version: string;
  required: boolean;
}

export interface ClientReleaseCompatibility {
  minCompatibleClientVersion: string;
  maxCompatibleClientVersion: string;
  minCompatibleServerVersion: string;
  maxCompatibleServerVersion: string;
  requiredApiContractVersion: string;
}

export interface ClientReleaseManifestPayload {
  schemaVersion: '2.0.0';
  status: 'SUCCESS' | 'ERROR';
  channel: 'production' | 'staging';
  publishedAtIso: string;
  releaseDate: string;
  latestClientVersion: string;
  latestClientBuildId: string;
  serverVersion: string;
  serverBuildTime: number;
  apiContractVersion: string;
  isVerified: boolean;
  verificationMethod: string;
  bundleIntegritySha256: string;
  compatibility: ClientReleaseCompatibility;
  assets: ClientReleaseAssetMetadata[];
  releaseNotes: string[];
  releaseNotesFa: string[];
  evaluation?: ClientUpdateEvaluationResult;
}

export interface ClientUpdateEvaluationResult {
  state: ClientUpdateState;
  comparison: ClientVersionComparisonOutcome;
  isUpdateAvailable: boolean;
  isCompatible: boolean;
  isVerified: boolean;
  installedClientVersion: string;
  installedClientBuildId: string;
  publishedClientVersion: string;
  publishedClientBuildId: string;
  serverRuntimeVersion: string;
  apiContractVersion: string;
  bundleIntegritySha256: string | null;
  inconsistencyWarning: string | null;
  statusBadgeEn: string;
  statusBadgeFa: string;
  statusMessageEn: string;
  statusMessageFa: string;
  allowedActions: AllowedUpdateMenuAction[];
}

export const AUTHORITATIVE_CLIENT_VERSION = '2026.10.27-v80.0-ScientificLatentCoreAndPulseEchoSonar';
export const AUTHORITATIVE_CLIENT_BUILD_ID = 'gdf-client-20261027-v80.0';
export const AUTHORITATIVE_SERVER_VERSION = '2026.10.27-v80.0-ScientificLatentCoreAndPulseEchoSonar';
export const AUTHORITATIVE_API_CONTRACT_VERSION = '2026.10-v80';

const INVALID_VERSION_TOKENS = new Set([
  '',
  'unknown',
  'null',
  'undefined',
  'n/a',
  'none',
  'checking',
  'checking...',
  'error',
]);

/**
 * Parses a GDF release version string into structured numeric components.
 * Supports canonical GDF versions (`YYYY.MM.DD-vMAJOR.MINOR[-PATCH][-Tag]`)
 * as well as standard semantic versions (`vMAJOR.MINOR[.PATCH][-Tag]`).
 * Returns null if the string is empty, 'UNKNOWN', or malformed.
 */
export function parseReleaseVersion(versionStr: unknown): ParsedGdfVersion | null {
  if (typeof versionStr !== 'string') return null;
  const trimmed = versionStr.trim();
  if (!trimmed || INVALID_VERSION_TOKENS.has(trimmed.toLowerCase())) {
    return null;
  }

  // Pattern 1: YYYY.MM.DD-vMAJOR.MINOR(.PATCH)?(-Tag)?
  const gdfRegex = /^(\d{4})\.(\d{2})\.(\d{2})-v(\d+)\.(\d+)(?:\.(\d+))?(?:-([A-Za-z0-9_.-]+))?$/;
  const gdfMatch = trimmed.match(gdfRegex);
  if (gdfMatch) {
    const year = Number(gdfMatch[1]);
    const month = Number(gdfMatch[2]);
    const day = Number(gdfMatch[3]);
    const major = Number(gdfMatch[4]);
    const minor = Number(gdfMatch[5]);
    const patch = gdfMatch[6] !== undefined ? Number(gdfMatch[6]) : 0;
    const buildTag = gdfMatch[7] || '';
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      !Number.isFinite(major) ||
      !Number.isFinite(minor) ||
      !Number.isFinite(patch)
    ) {
      return null;
    }
    return {
      raw: trimmed,
      dateNumber: year * 10000 + month * 100 + day,
      major,
      minor,
      patch,
      buildTag,
    };
  }

  // Pattern 2: Standard semver v?MAJOR.MINOR(.PATCH)?(-Tag)?
  const semverRegex = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([A-Za-z0-9_.-]+))?$/;
  const semMatch = trimmed.match(semverRegex);
  if (semMatch) {
    const major = Number(semMatch[1]);
    const minor = Number(semMatch[2]);
    const patch = semMatch[3] !== undefined ? Number(semMatch[3]) : 0;
    const buildTag = semMatch[4] || '';
    if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
      return null;
    }
    return {
      raw: trimmed,
      dateNumber: 0,
      major,
      minor,
      patch,
      buildTag,
    };
  }

  return null;
}

/**
 * Compares two GDF release version strings using structured numeric comparison.
 * Returns:
 *  -1 if versionA < versionB
 *   0 if versionA === versionB
 *  +1 if versionA > versionB
 *  null if either version is malformed/unparseable
 */
export function compareReleaseVersions(versionA: unknown, versionB: unknown): -1 | 0 | 1 | null {
  const parsedA = parseReleaseVersion(versionA);
  const parsedB = parseReleaseVersion(versionB);
  if (!parsedA || !parsedB) return null;

  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  if (parsedA.dateNumber > 0 && parsedB.dateNumber > 0 && parsedA.dateNumber !== parsedB.dateNumber) {
    return parsedA.dateNumber < parsedB.dateNumber ? -1 : 1;
  }
  if (parsedA.raw === parsedB.raw) {
    return 0;
  }
  // Same numeric tuple (major, minor, patch, date): treat same numeric release as equal
  return 0;
}

export function computeSha256HexFromBuffer(buf: Buffer | string): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function verifyClientAssetIntegrity(params: {
  content: Buffer | string;
  expectedSha256: string;
  expectedVersionMarker?: string;
}): { valid: boolean; actualSha256: string; sizeBytes: number; reason?: string } {
  const buf = typeof params.content === 'string' ? Buffer.from(params.content, 'utf8') : params.content;
  if (!buf || buf.length === 0) {
    return { valid: false, actualSha256: '', sizeBytes: 0, reason: 'Empty asset payload' };
  }
  const actualSha256 = computeSha256HexFromBuffer(buf);
  const expectedClean = String(params.expectedSha256 || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedClean)) {
    return {
      valid: false,
      actualSha256,
      sizeBytes: buf.length,
      reason: 'Malformed expected SHA-256 digest in manifest',
    };
  }
  if (actualSha256 !== expectedClean) {
    return {
      valid: false,
      actualSha256,
      sizeBytes: buf.length,
      reason: `SHA-256 integrity mismatch: expected ${expectedClean.slice(0, 12)}..., got ${actualSha256.slice(0, 12)}...`,
    };
  }
  if (params.expectedVersionMarker) {
    const text = buf.toString('utf8');
    if (!text.includes(params.expectedVersionMarker)) {
      return {
        valid: false,
        actualSha256,
        sizeBytes: buf.length,
        reason: `Asset payload missing expected release version marker (${params.expectedVersionMarker})`,
      };
    }
  }
  return { valid: true, actualSha256, sizeBytes: buf.length };
}

/**
 * Extracts the embedded CLIENT_APP_VERSION from index.html on disk so the manifest
 * always reflects the actual served HTML client file.
 */
export function extractEmbeddedClientVersionFromHtml(htmlContent: string): {
  clientVersion: string | null;
  clientBuildId: string | null;
} {
  const metaVersionMatch = htmlContent.match(/<meta\s+name=["']gdf-client-version["']\s+content=["']([^"']+)["']/i);
  const constVersionMatch = htmlContent.match(/const\s+CLIENT_APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  const metaBuildMatch = htmlContent.match(/<meta\s+name=["']gdf-client-build-id["']\s+content=["']([^"']+)["']/i);
  const constBuildMatch = htmlContent.match(/const\s+CLIENT_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);

  const clientVersion = (metaVersionMatch?.[1] || constVersionMatch?.[1] || '').trim() || null;
  const clientBuildId = (metaBuildMatch?.[1] || constBuildMatch?.[1] || '').trim() || null;
  return { clientVersion, clientBuildId };
}

/**
 * Builds the authoritative client release manifest by inspecting and hashing the actual
 * browser client files served by this GDF instance.
 */
export function buildAuthoritativeClientReleaseManifest(options?: {
  rootDir?: string;
  serverVersion?: string;
  serverBuildTime?: number;
  installedClientVersion?: string;
  installedClientBuildId?: string;
}): ClientReleaseManifestPayload {
  const rootDir = options?.rootDir || process.cwd();
  const serverVersion = options?.serverVersion || AUTHORITATIVE_SERVER_VERSION;
  const serverBuildTime = options?.serverBuildTime || Date.now();

  const assetSpecs: Array<{
    urlPath: string;
    diskRelativePath: string;
    contentType: string;
    required: boolean;
  }> = [
    { urlPath: '/index.html', diskRelativePath: 'index.html', contentType: 'text/html; charset=utf-8', required: true },
    {
      urlPath: '/js/gdfClientCore.js',
      diskRelativePath: path.join('public', 'js', 'gdfClientCore.js'),
      contentType: 'application/javascript; charset=utf-8',
      required: true,
    },
    { urlPath: '/sw.js', diskRelativePath: 'sw.js', contentType: 'application/javascript; charset=utf-8', required: true },
    {
      urlPath: '/manifest.webmanifest',
      diskRelativePath: path.join('public', 'manifest.webmanifest'),
      contentType: 'application/manifest+json; charset=utf-8',
      required: false,
    },
  ];

  let detectedClientVersion = 'UNKNOWN';
  let detectedClientBuildId = 'UNKNOWN';
  let allRequiredVerified = true;
  const assets: ClientReleaseAssetMetadata[] = [];

  for (const spec of assetSpecs) {
    const fullPath = path.join(rootDir, spec.diskRelativePath);
    if (!fs.existsSync(fullPath)) {
      if (spec.required) {
        allRequiredVerified = false;
      }
      continue;
    }
    const buf = fs.readFileSync(fullPath);
    if (buf.length === 0) {
      if (spec.required) {
        allRequiredVerified = false;
      }
      continue;
    }
    const sha256 = computeSha256HexFromBuffer(buf);
    if (spec.urlPath === '/index.html') {
      const htmlText = buf.toString('utf8');
      const extracted = extractEmbeddedClientVersionFromHtml(htmlText);
      if (extracted.clientVersion && parseReleaseVersion(extracted.clientVersion)) {
        detectedClientVersion = extracted.clientVersion;
      } else {
        allRequiredVerified = false;
      }
      if (extracted.clientBuildId) {
        detectedClientBuildId = extracted.clientBuildId;
      } else {
        allRequiredVerified = false;
      }
    }
    if (spec.urlPath === '/sw.js') {
      const swText = buf.toString('utf8');
      const swVerMatch = swText.match(/const\s+SW_RELEASE_VERSION\s*=\s*['"]([^'"]+)['"]/);
      const swEmbeddedVer = (swVerMatch?.[1] || '').trim();
      if (!swEmbeddedVer || (detectedClientVersion !== 'UNKNOWN' && swEmbeddedVer !== detectedClientVersion)) {
        allRequiredVerified = false;
      }
      const publicSwPath = path.join(rootDir, 'public', 'sw.js');
      if (fs.existsSync(publicSwPath)) {
        const publicSwSha = computeSha256HexFromBuffer(fs.readFileSync(publicSwPath));
        if (publicSwSha !== sha256) {
          allRequiredVerified = false;
        }
      }
    }
    assets.push({
      path: spec.urlPath,
      sha256,
      sizeBytes: buf.length,
      contentType: spec.contentType,
      version: detectedClientVersion,
      required: spec.required,
    });
  }

  for (const a of assets) {
    a.version = detectedClientVersion;
  }

  const bundleSeed = assets.map(a => `${a.path}:${a.sha256}:${a.sizeBytes}`).join('|');
  const bundleIntegritySha256 = assets.length > 0 ? computeSha256HexFromBuffer(bundleSeed) : '';
  const isVerified =
    allRequiredVerified &&
    detectedClientVersion !== 'UNKNOWN' &&
    detectedClientBuildId !== 'UNKNOWN' &&
    Boolean(parseReleaseVersion(detectedClientVersion)) &&
    assets.some(a => a.path === '/index.html') &&
    assets.some(a => a.path === '/js/gdfClientCore.js') &&
    assets.some(a => a.path === '/sw.js');

  const manifest: ClientReleaseManifestPayload = {
    schemaVersion: '2.0.0',
    status: isVerified ? 'SUCCESS' : 'ERROR',
    channel: 'production',
    publishedAtIso: new Date(serverBuildTime).toISOString(),
    releaseDate:
      detectedClientVersion !== 'UNKNOWN'
        ? detectedClientVersion.slice(0, 10).replace(/\./g, '-')
        : new Date(serverBuildTime).toISOString().slice(0, 10),
    latestClientVersion: detectedClientVersion,
    latestClientBuildId:
      detectedClientBuildId !== 'UNKNOWN' && bundleIntegritySha256
        ? `${detectedClientBuildId}-${bundleIntegritySha256.slice(0, 8)}`
        : 'UNKNOWN',
    serverVersion,
    serverBuildTime,
    apiContractVersion: AUTHORITATIVE_API_CONTRACT_VERSION,
    isVerified,
    verificationMethod: 'SHA256_ASSET_MANIFEST_AND_EMBEDDED_VERSION_GATE',
    bundleIntegritySha256,
    compatibility: {
      minCompatibleClientVersion: '2026.10.25-v75.0-Baseline',
      maxCompatibleClientVersion: '2026.12.31-v99.9-Max',
      minCompatibleServerVersion: '2026.10.25-v75.0-Baseline',
      maxCompatibleServerVersion: '2026.12.31-v99.9-Max',
      requiredApiContractVersion: AUTHORITATIVE_API_CONTRACT_VERSION,
    },
    assets,
    releaseNotes: [
      'Authoritative HTML client release manifest with per-asset SHA-256 integrity verification.',
      'Atomic in-place browser client self-update engine with staging cache rollback protection.',
      'Strict separation of installed HTML client version, published client release, and server runtime version.',
      'Deterministic 9-state update machine (CHECKING, UPDATE_AVAILABLE, UP_TO_DATE, DOWNLOADING, VERIFYING, INSTALLING, RELOADING, FAILED, UNKNOWN).',
      'Full English and Persian (Farsi) financial terminology standardization and RTL layout support.',
    ],
    releaseNotesFa: [
      'مانیفست رسمی انتشار کلاینت HTML همراه با اعتبارسنجی یکپارچگی SHA-256 برای تمامی فایل‌های کلاینت.',
      'موتور به‌روزرسانی خودکار درون‌برنامه‌ای (In-Place) در مرورگر با قابلیت بازگشت ایمن (Rollback) در صورت خطا.',
      'تفکیک دقیق نسخه کلاینت نصب‌شده، نسخه منتشرشده کلاینت و نسخه سرور بدون مقایسه رشته‌ای ساده.',
      'ماشین حالت ۹ وضعیته قطعی برای مدیریت کامل فرآیند بررسی، دریافت، راستی‌آزمایی و نصب به‌روزرسانی.',
      'استانداردسازی کامل اصطلاحات تخصصی مالی و مهندسی به دو زبان انگلیسی و فارسی همراه با چیدمان راست‌به‌چپ (RTL).',
    ],
  };

  if (options?.installedClientVersion !== undefined) {
    manifest.evaluation = evaluateClientUpdateStatus({
      installedClientVersion: options.installedClientVersion,
      installedClientBuildId: options.installedClientBuildId,
      manifest,
      runningServerVersion: serverVersion,
    });
  }

  return manifest;
}

/**
 * Evaluates the authoritative client update state by comparing the installed HTML client
 * against the published client release manifest and server compatibility rules.
 *
 * Invariants:
 * - Never returns UP_TO_DATE when the manifest or server release is UNKNOWN, missing, or malformed.
 * - Never shows UPDATE_NOW unless a newer, verified, compatible client release exists.
 * - Flags an explicit inconsistency if the installed client is newer than the published manifest.
 */
export function evaluateClientUpdateStatus(params: {
  installedClientVersion: unknown;
  installedClientBuildId?: unknown;
  manifest: Partial<ClientReleaseManifestPayload> | null | undefined;
  runningServerVersion?: unknown;
}): ClientUpdateEvaluationResult {
  const rawInstalledVer =
    typeof params.installedClientVersion === 'string' && params.installedClientVersion.trim()
      ? params.installedClientVersion.trim()
      : 'UNKNOWN';
  const rawInstalledBuildId =
    typeof params.installedClientBuildId === 'string' && params.installedClientBuildId.trim()
      ? params.installedClientBuildId.trim()
      : 'UNKNOWN';

  // 1. Unreachable / null manifest
  if (!params.manifest || typeof params.manifest !== 'object') {
    return {
      state: 'UNKNOWN',
      comparison: 'UNREACHABLE_MANIFEST',
      isUpdateAvailable: false,
      isCompatible: false,
      isVerified: false,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: 'UNKNOWN',
      publishedClientBuildId: 'UNKNOWN',
      serverRuntimeVersion: 'UNKNOWN',
      apiContractVersion: 'UNKNOWN',
      bundleIntegritySha256: null,
      inconsistencyWarning: 'Release manifest is unreachable or returned no payload.',
      statusBadgeEn: 'UPDATE STATUS UNKNOWN',
      statusBadgeFa: 'وضعیت به‌روزرسانی نامشخص',
      statusMessageEn: 'Could not verify client release status because the release manifest is unreachable.',
      statusMessageFa: 'امکان بررسی وضعیت به‌روزرسانی وجود ندارد؛ مانیفست انتشار در دسترس نیست.',
      allowedActions: ['CHECK_FOR_UPDATES', 'RETRY', 'CLOSE'],
    };
  }

  const m = params.manifest;
  const rawPublishedClientVer =
    typeof m.latestClientVersion === 'string' && m.latestClientVersion.trim()
      ? m.latestClientVersion.trim()
      : '';
  const rawPublishedBuildId =
    typeof m.latestClientBuildId === 'string' && m.latestClientBuildId.trim()
      ? m.latestClientBuildId.trim()
      : 'UNKNOWN';
  const rawServerVer =
    typeof params.runningServerVersion === 'string' && params.runningServerVersion.trim()
      ? params.runningServerVersion.trim()
      : typeof m.serverVersion === 'string' && m.serverVersion.trim()
      ? m.serverVersion.trim()
      : 'UNKNOWN';
  const apiContractVer =
    typeof m.apiContractVersion === 'string' && m.apiContractVersion.trim()
      ? m.apiContractVersion.trim()
      : 'UNKNOWN';

  const parsedInstalled = parseReleaseVersion(rawInstalledVer);
  const parsedPublished = parseReleaseVersion(rawPublishedClientVer);

  // 2. Malformed manifest or UNKNOWN published version or unparseable installed version
  if (
    !parsedPublished ||
    !parsedInstalled ||
    !Array.isArray(m.assets) ||
    m.assets.length === 0 ||
    !m.assets.every(
      a => a && typeof a.path === 'string' && typeof a.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(a.sha256)
    )
  ) {
    return {
      state: 'UNKNOWN',
      comparison: 'MALFORMED_MANIFEST',
      isUpdateAvailable: false,
      isCompatible: false,
      isVerified: false,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: parsedPublished ? rawPublishedClientVer : 'UNKNOWN',
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: typeof m.bundleIntegritySha256 === 'string' ? m.bundleIntegritySha256 : null,
      inconsistencyWarning: 'Release manifest or version identifier is malformed or incomplete.',
      statusBadgeEn: 'UPDATE STATUS UNKNOWN',
      statusBadgeFa: 'وضعیت به‌روزرسانی نامشخص',
      statusMessageEn: 'Update status is unknown because the release manifest or version metadata is incomplete.',
      statusMessageFa: 'وضعیت به‌روزرسانی به دلیل ناقص یا نامعتبر بودن اطلاعات مانیفست نامشخص است.',
      allowedActions: ['CHECK_FOR_UPDATES', 'RETRY', 'CLOSE'],
    };
  }

  // 3. Unverified manifest gate
  if (m.isVerified !== true) {
    return {
      state: 'FAILED',
      comparison: 'UNVERIFIED_MANIFEST',
      isUpdateAvailable: false,
      isCompatible: false,
      isVerified: false,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: rawPublishedClientVer,
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: m.bundleIntegritySha256 || null,
      inconsistencyWarning: 'Published client release failed server-side asset integrity verification.',
      statusBadgeEn: 'RELEASE UNVERIFIED',
      statusBadgeFa: 'انتشار تأییدنشده',
      statusMessageEn: 'Published client release is not verified. In-place client update is blocked for safety.',
      statusMessageFa: 'نسخه منتشرشده کلاینت تأییدیه یکپارچگی ندارد؛ به‌روزرسانی برای حفظ ایمنی مسدود شد.',
      allowedActions: ['CHECK_FOR_UPDATES', 'RETRY', 'CLOSE'],
    };
  }

  // 4. Server compatibility gate
  const compat = m.compatibility;
  let isServerCompatible = true;
  if (compat) {
    const minSrvCmp = compat.minCompatibleServerVersion
      ? compareReleaseVersions(rawServerVer, compat.minCompatibleServerVersion)
      : 0;
    const maxSrvCmp = compat.maxCompatibleServerVersion
      ? compareReleaseVersions(rawServerVer, compat.maxCompatibleServerVersion)
      : 0;
    if (minSrvCmp === null || maxSrvCmp === null || minSrvCmp < 0 || maxSrvCmp > 0) {
      isServerCompatible = false;
    }
    if (
      compat.requiredApiContractVersion &&
      apiContractVer !== 'UNKNOWN' &&
      compat.requiredApiContractVersion !== apiContractVer
    ) {
      isServerCompatible = false;
    }
  }

  if (!isServerCompatible) {
    return {
      state: 'FAILED',
      comparison: 'INCOMPATIBLE_SERVER',
      isUpdateAvailable: false,
      isCompatible: false,
      isVerified: true,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: rawPublishedClientVer,
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: m.bundleIntegritySha256 || null,
      inconsistencyWarning: `Published client (${rawPublishedClientVer}) is incompatible with running server (${rawServerVer}).`,
      statusBadgeEn: 'INCOMPATIBLE RELEASE',
      statusBadgeFa: 'عدم سازگاری نسخه با سرور',
      statusMessageEn: `Published client release (${rawPublishedClientVer}) requires server range [${compat?.minCompatibleServerVersion} .. ${compat?.maxCompatibleServerVersion}], but running server is ${rawServerVer}.`,
      statusMessageFa: `نسخه کلاینت منتشرشده (${rawPublishedClientVer}) با نسخه سرور فعلی (${rawServerVer}) سازگار نیست.`,
      allowedActions: ['CHECK_FOR_UPDATES', 'RETRY', 'CLOSE'],
    };
  }

  // 5. Structured version comparison between installed client and published client manifest
  const cmp = compareReleaseVersions(rawInstalledVer, rawPublishedClientVer);
  if (cmp === null) {
    return {
      state: 'UNKNOWN',
      comparison: 'MALFORMED_MANIFEST',
      isUpdateAvailable: false,
      isCompatible: false,
      isVerified: false,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: rawPublishedClientVer,
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: m.bundleIntegritySha256 || null,
      inconsistencyWarning: 'Could not compare installed and published version structures.',
      statusBadgeEn: 'UPDATE STATUS UNKNOWN',
      statusBadgeFa: 'وضعیت به‌روزرسانی نامشخص',
      statusMessageEn: 'Version comparison failed due to unrecognized version format.',
      statusMessageFa: 'مقایسه نسخه به دلیل فرمت نامعتبر امکان‌پذیر نیست.',
      allowedActions: ['CHECK_FOR_UPDATES', 'RETRY', 'CLOSE'],
    };
  }

  if (cmp > 0) {
    // Installed client is NEWER than published manifest -> flag inconsistency, do NOT downgrade
    return {
      state: 'UNKNOWN',
      comparison: 'INSTALLED_NEWER_INCONSISTENT',
      isUpdateAvailable: false,
      isCompatible: true,
      isVerified: true,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: rawPublishedClientVer,
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: m.bundleIntegritySha256 || null,
      inconsistencyWarning: `Installed client (${rawInstalledVer}) is newer than published manifest (${rawPublishedClientVer}). Automatic downgrade blocked.`,
      statusBadgeEn: 'VERSION INCONSISTENCY',
      statusBadgeFa: 'عدم تطابق نسخه (کلاینت جدیدتر)',
      statusMessageEn: `Installed client (${rawInstalledVer}) is newer than the published manifest release (${rawPublishedClientVer}). Downgrade is blocked.`,
      statusMessageFa: `نسخه کلاینت نصب‌شده (${rawInstalledVer}) جدیدتر از مانیفست انتشار (${rawPublishedClientVer}) است. بازگشت به نسخه قدیمی‌تر مسدود شد.`,
      allowedActions: ['CHECK_FOR_UPDATES', 'RETRY', 'CLOSE'],
    };
  }

  if (cmp < 0) {
    // Installed client is older than published compatible & verified release -> UPDATE_AVAILABLE
    return {
      state: 'UPDATE_AVAILABLE',
      comparison: 'INSTALLED_OLDER',
      isUpdateAvailable: true,
      isCompatible: true,
      isVerified: true,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: rawPublishedClientVer,
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: m.bundleIntegritySha256 || null,
      inconsistencyWarning: null,
      statusBadgeEn: 'UPDATE AVAILABLE',
      statusBadgeFa: 'نسخه جدید موجود است',
      statusMessageEn: `Verified compatible HTML client release (${rawPublishedClientVer}) is ready for in-place browser update.`,
      statusMessageFa: `نسخه جدید و تأییدشده کلاینت (${rawPublishedClientVer}) آماده به‌روزرسانی مستقیم در مرورگر است.`,
      allowedActions: ['UPDATE_NOW', 'CHECK_FOR_UPDATES', 'CLOSE'],
    };
  }

  // cmp === 0: Check if build ID explicitly indicates a newer hotfix build for the same version number
  const hasDistinctBuildId =
    rawInstalledBuildId !== 'UNKNOWN' &&
    rawPublishedBuildId !== 'UNKNOWN' &&
    rawInstalledBuildId !== rawPublishedBuildId &&
    !rawPublishedBuildId.startsWith(rawInstalledBuildId);

  if (hasDistinctBuildId) {
    return {
      state: 'UPDATE_AVAILABLE',
      comparison: 'INSTALLED_OLDER',
      isUpdateAvailable: true,
      isCompatible: true,
      isVerified: true,
      installedClientVersion: rawInstalledVer,
      installedClientBuildId: rawInstalledBuildId,
      publishedClientVersion: rawPublishedClientVer,
      publishedClientBuildId: rawPublishedBuildId,
      serverRuntimeVersion: rawServerVer,
      apiContractVersion: apiContractVer,
      bundleIntegritySha256: m.bundleIntegritySha256 || null,
      inconsistencyWarning: null,
      statusBadgeEn: 'UPDATE AVAILABLE',
      statusBadgeFa: 'بیلد جدید موجود است',
      statusMessageEn: `New verified client build (${rawPublishedBuildId}) for release ${rawPublishedClientVer} is ready for in-place update.`,
      statusMessageFa: `بیلد جدید و تأییدشده کلاینت (${rawPublishedBuildId}) آماده به‌روزرسانی مستقیم در مرورگر است.`,
      allowedActions: ['UPDATE_NOW', 'CHECK_FOR_UPDATES', 'CLOSE'],
    };
  }

  // Exact verified match -> UP_TO_DATE
  return {
    state: 'UP_TO_DATE',
    comparison: 'EQUAL',
    isUpdateAvailable: false,
    isCompatible: true,
    isVerified: true,
    installedClientVersion: rawInstalledVer,
    installedClientBuildId: rawInstalledBuildId,
    publishedClientVersion: rawPublishedClientVer,
    publishedClientBuildId: rawPublishedBuildId,
    serverRuntimeVersion: rawServerVer,
    apiContractVersion: apiContractVer,
    bundleIntegritySha256: m.bundleIntegritySha256 || null,
    inconsistencyWarning: null,
    statusBadgeEn: 'UP TO DATE',
    statusBadgeFa: 'به‌روز است',
    statusMessageEn: `Installed HTML client (${rawInstalledVer}) matches the latest verified client release.`,
    statusMessageFa: `کلاینت نصب‌شده (${rawInstalledVer}) کاملاً منطبق بر آخرین انتشار تأییدشده است.`,
    allowedActions: ['CHECK_FOR_UPDATES', 'CLOSE'],
  };
}
