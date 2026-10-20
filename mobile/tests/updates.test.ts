import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { compareRelease, fetchPublishedRelease, isReleaseDownloadUrl, parsePublishedRelease, RELEASE_FEED, UpdateError, type ReleaseFetch } from '../src/updates.ts';

const published = JSON.parse(readFileSync(new URL('../../releases/android-release.json', import.meta.url), 'utf8'));
const response = (value: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(value) });
const code = (expected: string) => (error: unknown) => error instanceof UpdateError && error.code === expected;

test('the existing published release is accepted without exposing unrelated build metadata', () => {
  const release = parsePublishedRelease(published);
  assert.equal(release.version, published.version);
  assert.equal(release.downloadUrl, published.downloadUrl);
  assert.equal('buildId' in release, false);
  assert.equal('sourceCommit' in release, false);
});

test('semantic version comparison is numeric, includes Android build revisions and never offers a downgrade', () => {
  const release = { ...parsePublishedRelease(published), version: '0.10.0', androidVersionCode: 12 };
  assert.equal(compareRelease(release, '0.9.9', 99), 'available');
  assert.equal(compareRelease(release, '0.10.0', 11), 'available');
  assert.equal(compareRelease(release, '0.10.0', 12), 'current');
  assert.equal(compareRelease(release, '0.10.0'), 'current');
  assert.equal(compareRelease(release, '0.10.0', 13), 'ahead');
  assert.equal(compareRelease(release, '1.0.0', 1), 'ahead');
  assert.throws(() => compareRelease(release, 'unknown'), code('invalid'));
});

test('only validated stable app releases can provide an installation link', () => {
  for (const patch of [
    { package: 'other.application' }, { version: '0.4.0-beta.1' }, { version: 'v0.4.0' }, { version: '0.04.0' },
    { androidVersionCode: 0 }, { sizeBytes: -1 }, { sha256: 'wrong' }, { downloadUrl: 'javascript:alert(1)' },
    { checks: { ...published.checks, archiveCrc: 'failed' } }, { checks: null }, { notes: 5 },
  ]) assert.throws(() => parsePublishedRelease({ ...published, ...patch }), code('invalid'));
  assert.throws(() => parsePublishedRelease(null), code('invalid'));
  assert.equal(parsePublishedRelease({ ...published, notes: '新增检查更新' }).notes, '新增检查更新');
});

test('download destinations are limited to HTTPS APK assets from this project or Expo', () => {
  assert.equal(isReleaseDownloadUrl(published.downloadUrl), true);
  assert.equal(isReleaseDownloadUrl('https://github.com/LikLiiik/Liubai/releases/download/v0.4.0/liubai-0.4.0.apk'), true);
  for (const url of [
    'http://expo.dev/artifacts/eas/test.apk', 'https://expo.dev.evil.test/artifacts/eas/test.apk',
    'https://evil.test/update.apk', 'https://github.com/another/repository/releases/download/v1/test.apk',
    'https://expo.dev@evil.test/artifacts/eas/test.apk', 'https://user@expo.dev/artifacts/eas/test.apk',
    'https://expo.dev:444/artifacts/eas/test.apk', 'https://expo.dev/artifacts/eas/test.apk?redirect=evil',
    'https://expo.dev/artifacts/eas/test.aab',
  ]) assert.equal(isReleaseDownloadUrl(url), false, url);
});

test('checking fetches the live publication record without cookies or cached version data', async () => {
  let requests = 0;
  const fetcher: ReleaseFetch = async (url, options) => {
    requests++;
    assert.equal(new URL(url).origin + new URL(url).pathname, RELEASE_FEED);
    assert.ok(new URL(url).searchParams.has('t'));
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal);
    return response(published);
  };
  assert.equal((await fetchPublishedRelease({ fetcher })).version, published.version);
  assert.equal(requests, 1);
});

test('missing publication, network failure and malformed responses remain retryable errors', async () => {
  await assert.rejects(fetchPublishedRelease({ fetcher: async () => response(null, 404) }), code('not-published'));
  await assert.rejects(fetchPublishedRelease({ fetcher: async () => response(null, 503) }), code('network'));
  await assert.rejects(fetchPublishedRelease({ fetcher: async () => { throw new Error('offline'); } }), code('network'));
  await assert.rejects(fetchPublishedRelease({ fetcher: async () => ({ ...response(null), text: async () => '<html>error</html>' }) }), code('invalid'));
  await assert.rejects(fetchPublishedRelease({ fetcher: async () => ({ ...response(null), text: async () => 'x'.repeat(65537) }) }), code('invalid'));
  assert.equal((await fetchPublishedRelease({ fetcher: async () => response(published) })).version, published.version);
});

test('timeout covers both the connection and response body, even if a transport ignores abort', async () => {
  let signal: AbortSignal | null | undefined;
  await assert.rejects(fetchPublishedRelease({ timeoutMs: 10, fetcher: async (_, options) => { signal = options.signal; return new Promise(() => {}); } }), code('timeout'));
  assert.equal(signal?.aborted, true);
  await assert.rejects(fetchPublishedRelease({ timeoutMs: 10, fetcher: async () => ({ ...response(null), text: async () => new Promise(() => {}) }) }), code('timeout'));
});

test('leaving the screen cancels an active check and an already cancelled check makes no request', async () => {
  const controller = new AbortController();
  const pending = fetchPublishedRelease({ signal: controller.signal, fetcher: async () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(pending, code('cancelled'));
  let called = false;
  await assert.rejects(fetchPublishedRelease({ signal: controller.signal, fetcher: async () => { called = true; return response(published); } }), code('cancelled'));
  assert.equal(called, false);
});
