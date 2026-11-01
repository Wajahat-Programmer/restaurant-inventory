#!/usr/bin/env node
/**
 * Builds a signed release APK and, only when asked, publishes it.
 *
 *   node scripts/release.js                     build the current version (package.json)
 *   node scripts/release.js 1.2.0               set the version first, then build
 *   node scripts/release.js --publish           also tag, push, and create the GitHub release
 *   node scripts/release.js --skip-qa           skip typecheck + lint + tests (not for real releases)
 *   node scripts/release.js --abis x86_64       build for another CPU (emulator testing)
 *   node scripts/release.js --notes "text"      release notes (default: commit subjects since the last tag)
 *
 * Output (never committed): release/restaurant-inventory-vX.Y.Z.apk, its .sha256 file, and notes.
 * The signing key stays outside the repository: RI_KEYSTORE_FILE, RI_KEYSTORE_PASSWORD,
 * RI_KEY_ALIAS and RI_KEY_PASSWORD in ~/.gradle/gradle.properties (or GRADLE_USER_HOME).
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
const option = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--') )[0];

const fail = message => {
  console.error(`\nSTOP: ${message}`);
  process.exit(1);
};
// git is a real program, so it needs no shell; with one, cmd.exe splits `-m "Release v1"` into two arguments.
const run = (cmd, cmdArgs, opts = {}) => {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd !== 'git', ...opts });
  if (r.status !== 0) {
    fail(`${cmd} ${cmdArgs.join(' ')} failed (exit ${r.status}).`);
  }
};
const out = (cmd, cmdArgs, opts = {}) => {
  const useShell = process.platform === 'win32' && cmd !== 'git';
  const r = spawnSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', shell: useShell, ...opts });
  return { code: r.status, text: `${r.stdout || ''}${r.stderr || ''}`.trim() };
};

// 1. The version: one place, package.json.
const pkgPath = path.join(root, 'package.json');
if (positional) {
  if (!/^\d+\.\d+\.\d+$/.test(positional)) {
    fail(`"${positional}" is not a version like 1.2.0.`);
  }
  const text = fs.readFileSync(pkgPath, 'utf8');
  fs.writeFileSync(pkgPath, text.replace(/("version":\s*")[^"]+(")/, `$1${positional}$2`));
}
const version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
const tag = `v${version}`;
console.log(`Releasing ${tag}`);

// 2. A release is built from committed code, so the tag points at what was built.
const dirty = out('git', ['status', '--porcelain']).text.split('\n').filter(l => l && !l.includes('package.json'));
if (dirty.length) {
  fail(`There are uncommitted changes. Commit them first:\n${dirty.join('\n')}`);
}
if (out('git', ['tag', '--list', tag]).text === tag && flag('publish')) {
  fail(`The tag ${tag} already exists. Pick a new version.`);
}

// 3. Quality gate.
if (!flag('skip-qa')) {
  run('npm', ['run', 'qa']);
} else {
  console.warn('WARNING: skipping the QA checks.');
}

// 4. Signing key present?
const gradleHome = process.env.GRADLE_USER_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '', '.gradle');
const propsFile = path.join(gradleHome, 'gradle.properties');
const props = fs.existsSync(propsFile) ? fs.readFileSync(propsFile, 'utf8') : '';
for (const key of ['RI_KEYSTORE_FILE', 'RI_KEYSTORE_PASSWORD', 'RI_KEY_ALIAS', 'RI_KEY_PASSWORD']) {
  if (!new RegExp(`^${key}=`, 'm').test(props)) {
    fail(`${key} is missing from ${propsFile}. A release must be signed with the release key, or installed phones cannot update.`);
  }
}

// 5. Build.
const abis = option('abis') || 'arm64-v8a,armeabi-v7a';
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(gradlew, ['app:assembleRelease', `-PreactNativeArchitectures=${abis}`], { cwd: path.join(root, 'android') });

const built = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!fs.existsSync(built)) {
  fail(`The build finished but ${built} is missing.`);
}
fs.mkdirSync(path.join(root, 'release'), { recursive: true });
const apkName = `restaurant-inventory-${tag}.apk`;
const apk = path.join(root, 'release', apkName);
fs.copyFileSync(built, apk);

// 6. Prove it is signed with the release key, not the debug key.
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
const tools = path.join(sdk, 'build-tools');
const versions = fs.existsSync(tools) ? fs.readdirSync(tools).filter(v => /^\d/.test(v)).sort() : [];
const signer = versions.length && path.join(tools, versions[versions.length - 1], process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
if (!signer || !fs.existsSync(signer)) {
  fail('apksigner was not found in the Android SDK build-tools, so the signature could not be checked.');
}
const cert = out(`"${signer}"`, ['verify', '--print-certs', `"${apk}"`]);
if (cert.code !== 0) {
  fail(`The APK signature is not valid:\n${cert.text}`);
}
if (/Android Debug/i.test(cert.text)) {
  fail('The APK is signed with the DEBUG key. Set up the release key before releasing.');
}
const sha1 = /certificate SHA-256 digest: ([0-9a-f]+)/i.exec(cert.text);
console.log(`Signed. Certificate SHA-256: ${sha1 ? sha1[1] : 'unknown'}`);

// 7. Checksum file in the "<hash>  <name>" format the app understands.
const hash = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
fs.writeFileSync(`${apk}.sha256`, `${hash}  ${apkName}\n`);

// 7b. The illustrated user manual travels with the release (rebuild it with scripts/build-user-manual.js).
const manualPdf = path.join(root, 'docs', 'Restaurant-Inventory-User-Manual.pdf');

// 8. Release notes.
let notes = option('notes');
if (!notes) {
  const last = out('git', ['describe', '--tags', '--abbrev=0']).text;
  const range = last && !last.includes('fatal') ? [`${last}..HEAD`] : [];
  const subjects = out('git', ['log', ...range, '--pretty=format:- %s']).text.replace(/^- (Release v.*)$/gm, '');
  notes = subjects.trim() || `Version ${version}`;
}
const notesFile = path.join(root, 'release', `notes-${tag}.md`);
fs.writeFileSync(notesFile, `${notes}\n`);

const mb = (fs.statSync(apk).size / 1024 / 1024).toFixed(1);
console.log(`\nBuilt ${apkName} (${mb} MB)\n  sha256 ${hash}\n  ${apk}\n  ${apk}.sha256\n  ${notesFile}`);

// 9. Publish only when asked.
if (!flag('publish')) {
  console.log(`\nNot published. To publish: node scripts/release.js --publish`);
  process.exit(0);
}
const gh = out('gh', ['auth', 'status']);
if (gh.code !== 0) {
  fail('The GitHub CLI is not installed or not signed in (gh auth login). The files are ready in release/ to upload by hand.');
}
if (version !== JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version) {
  fail('package.json changed during the build.');
}
if (out('git', ['status', '--porcelain', 'package.json']).text) {
  run('git', ['add', 'package.json']);
  run('git', ['commit', '-m', `Release ${tag}`]);
}
run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);
run('git', ['push', 'origin', 'HEAD:main']);
run('git', ['push', 'origin', tag]);
const extra = fs.existsSync(manualPdf) ? [`"${manualPdf}"`] : [];
run('gh', ['release', 'create', tag, `"${apk}"`, `"${apk}.sha256"`, ...extra, '--title', `"Restaurant Inventory ${version}"`, '--notes-file', `"${notesFile}"`]);
console.log(`\nPublished ${tag}. Phones running an older version will be offered it.`);
