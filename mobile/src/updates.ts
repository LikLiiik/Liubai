export const RELEASE_FEED = 'https://raw.githubusercontent.com/LikLiiik/Liubai/main/releases/android-release.json';
export const APP_PACKAGE = 'app.liubai.planner';
export type PublishedRelease = {
  version: string; androidVersionCode: number; package: string; file: string;
  sizeBytes: number; sha256: string; downloadUrl: string; notes?: string;
};
export type UpdateStatus = 'available' | 'current' | 'ahead';
type UpdateErrorCode = 'network' | 'timeout' | 'not-published' | 'invalid' | 'cancelled';
export class UpdateError extends Error {
  code: UpdateErrorCode;
  constructor(code: UpdateErrorCode, message: string) { super(message); this.code = code; }
}

function versionParts(version: string): number[] | null {
  return /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.test(version) ? version.split('.').map(Number) : null;
}

export function isReleaseDownloadUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return false;
    return url.hostname === 'expo.dev' && /^\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk$/.test(url.pathname)
      || url.hostname === 'github.com' && /^\/LikLiiik\/Liubai\/releases\/download\/[^/]+\/[^/]+\.apk$/.test(url.pathname);
  } catch { return false; }
}

export function parsePublishedRelease(value: unknown): PublishedRelease {
  if (!value || typeof value !== 'object') throw new UpdateError('invalid', '发布信息暂不可用，请稍后重试。');
  const record = value as Record<string, unknown>;
  const checks = record.checks as Record<string, unknown> | undefined;
  if (record.package !== APP_PACKAGE || typeof record.version !== 'string' || !versionParts(record.version)
    || !Number.isSafeInteger(record.androidVersionCode) || (record.androidVersionCode as number) < 1
    || typeof record.file !== 'string' || !/^[A-Za-z0-9._-]+\.apk$/.test(record.file)
    || !Number.isSafeInteger(record.sizeBytes) || (record.sizeBytes as number) <= 0
    || typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256)
    || !isReleaseDownloadUrl(record.downloadUrl)
    || checks?.archiveCrc !== 'passed' || checks.package !== 'passed' || checks.embeddedBundle !== 'passed'
    || record.notes !== undefined && (typeof record.notes !== 'string' || record.notes.length > 2000)) {
    throw new UpdateError('invalid', '发布信息暂不可用，请稍后重试。');
  }
  return { version: record.version, androidVersionCode: record.androidVersionCode as number, package: APP_PACKAGE,
    file: record.file, sizeBytes: record.sizeBytes as number, sha256: record.sha256.toLowerCase(),
    downloadUrl: record.downloadUrl, ...(record.notes ? { notes: record.notes as string } : {}) };
}

export function compareRelease(release: PublishedRelease, currentVersion: string, currentBuild?: number): UpdateStatus {
  const installed = versionParts(currentVersion), published = versionParts(release.version);
  if (!installed || !published) throw new UpdateError('invalid', '无法识别当前版本，请稍后重试。');
  for (let index = 0; index < 3; index++) {
    if (published[index] !== installed[index]) return published[index] > installed[index] ? 'available' : 'ahead';
  }
  if (currentBuild !== undefined && Number.isSafeInteger(currentBuild) && currentBuild > 0) {
    if (release.androidVersionCode > currentBuild) return 'available';
    if (release.androidVersionCode < currentBuild) return 'ahead';
  }
  return 'current';
}

export type ReleaseFetch = (url: string, options: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'text'>>;
export async function fetchPublishedRelease(options: { signal?: AbortSignal; timeoutMs?: number; fetcher?: ReleaseFetch } = {}): Promise<PublishedRelease> {
  if (options.signal?.aborted) throw new UpdateError('cancelled', '已取消检查。');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  try {
    const interrupted = new Promise<never>((_, reject) => {
      cancel = () => { controller.abort(); reject(new UpdateError('cancelled', '已取消检查。')); };
      if (options.signal?.aborted) { cancel(); return; }
      options.signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => { controller.abort(); reject(new UpdateError('timeout', '检查超时，请检查网络后重试。')); }, options.timeoutMs ?? 12000);
    });
    const request = async () => {
      const response = await (options.fetcher ?? fetch)(`${RELEASE_FEED}?t=${Date.now()}`, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' },
      });
      if (response.status === 404) throw new UpdateError('not-published', '暂时没有已发布的安卓版本。');
      if (!response.ok) throw new UpdateError('network', '检查失败，请检查网络后重试。');
      const raw = await response.text();
      if (raw.length > 65536) throw new UpdateError('invalid', '发布信息暂不可用，请稍后重试。');
      let value: unknown;
      try { value = JSON.parse(raw); } catch { throw new UpdateError('invalid', '发布信息暂不可用，请稍后重试。'); }
      return parsePublishedRelease(value);
    };
    return await Promise.race([interrupted, request()]);
  } catch (error) {
    if (error instanceof UpdateError) throw error;
    throw new UpdateError('network', '检查失败，请检查网络后重试。');
  } finally {
    clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); controller.abort();
  }
}
