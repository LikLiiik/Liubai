import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// This job only receives a short-lived repository token after all tag checks pass.
const repository = 'LikLiiik/Liubai';
assert.equal(process.env.GITHUB_REPOSITORY, repository);
const tag = process.env.GITHUB_REF_NAME;
assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/);
const version = tag.slice(1);
const metadata = JSON.parse(await readFile(`releases/versions/${version}.json`, 'utf8'));
const app = JSON.parse(await readFile('mobile/app.json', 'utf8')).expo;
const pkg = JSON.parse(await readFile('mobile/package.json', 'utf8'));
assert.equal(metadata.version, version);
assert.equal(app.version, version);
assert.equal(pkg.version, version);
assert.equal(metadata.package, app.android.package);
assert.equal(metadata.file, `liubai-${version}-android.apk`);
assert.ok(Number.isInteger(metadata.androidVersionCode) && metadata.androidVersionCode > 0);
assert.ok(Number.isInteger(metadata.sizeBytes) && metadata.sizeBytes > 0 && metadata.sizeBytes < 250_000_000);
assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
assert.match(metadata.sourceCommit, /^[a-f0-9]{40}$/);
execFileSync('git', ['merge-base', '--is-ancestor', metadata.sourceCommit, 'HEAD']);
for (const check of ['archiveCrc', 'package', 'embeddedBundle', 'arm64Libraries']) assert.equal(metadata.checks[check], 'passed');
assert.match(metadata.buildDownloadUrl ?? '', /^https:\/\/expo\.dev\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk$/);
const stableUrl = `https://github.com/${repository}/releases/download/${tag}/${metadata.file}`;
assert.equal(metadata.downloadUrl, stableUrl);
assert.ok(process.env.GITHUB_TOKEN);
const auth = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const api = `https://api.github.com/repos/${repository}/releases`;
async function request(url, method = 'GET', body, headers = {}) {
  const response = await fetch(url, { method, headers: { ...auth, ...headers }, body, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`GitHub ${method} failed: ${response.status}`);
  return response.json();
}
// No GitHub credentials are sent to the artifact host.
const artifact = await fetch(metadata.buildDownloadUrl, { signal: AbortSignal.timeout(180_000) });
assert.ok(artifact.ok, `APK download failed: ${artifact.status}`);
const apk = Buffer.from(await artifact.arrayBuffer());
assert.equal(apk.length, metadata.sizeBytes);
assert.equal(createHash('sha256').update(apk).digest('hex'), metadata.sha256);
const lookup = await fetch(`${api}/tags/${tag}`, { headers: auth, signal: AbortSignal.timeout(30_000) });
assert.ok(lookup.ok || lookup.status === 404, `Release lookup failed: ${lookup.status}`);
let release = lookup.ok ? await lookup.json() : null;
const body = `${metadata.notes}\n\n安卓安装包，下载后由系统确认安装。\n\nSHA-256: \`${metadata.sha256}\`\n\n原生手势、系统通知与学校实际登录读取仍需手机试用验证。`;
if (!release) release = await request(api, 'POST', JSON.stringify({ tag_name: tag, name: `留白 ${version}`, body, draft: true, prerelease: false }), { 'Content-Type': 'application/json' });
assert.equal(release.tag_name, tag);
const uploadUrl = release.upload_url.replace(/\{.*$/, '');
assert.equal(uploadUrl, `https://uploads.github.com/repos/${repository}/releases/${release.id}/assets`);
const assets = [
  { name: metadata.file, bytes: apk, type: 'application/vnd.android.package-archive' },
  { name: `${metadata.file}.sha256`, bytes: Buffer.from(`${metadata.sha256}  ${metadata.file}\n`), type: 'text/plain' },
  { name: 'android-release.json', bytes: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`), type: 'application/json' },
];
for (const asset of assets) {
  const digest = `sha256:${createHash('sha256').update(asset.bytes).digest('hex')}`;
  const existing = release.assets.find(item => item.name === asset.name);
  if (existing) {
    assert.equal(existing.size, asset.bytes.length, 'Existing asset differs; refusing to replace it');
    assert.equal(existing.digest, digest, 'Existing asset differs; refusing to replace it');
  } else {
    assert.equal(release.draft, true, 'Refusing to modify an already published release');
    const uploaded = await request(`${uploadUrl}?name=${encodeURIComponent(asset.name)}`, 'POST', asset.bytes, { 'Content-Type': asset.type });
    assert.equal(uploaded.size, asset.bytes.length);
    assert.equal(uploaded.digest, digest);
  }
}
if (release.draft) release = await request(`${api}/${release.id}`, 'PATCH', JSON.stringify({ draft: false, make_latest: 'true' }), { 'Content-Type': 'application/json' });
assert.equal(release.draft, false);
console.log(`Published ${release.html_url}`);
