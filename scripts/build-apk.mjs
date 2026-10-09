// Builds the Android debug APK:  npm run android:build
//
//   1. vite build --mode native   (web bundle for the app, no service worker)
//   2. cap sync android           (copy the bundle + plugins into android/)
//   3. gradlew assembleDebug      (needs JDK 21+ and the Android SDK)
//   4. copy the APK to release/toolbox-debug.apk
//
// Steps 1-2 need neither JDK nor SDK, so they always run. If a prerequisite for
// step 3 is missing, the script says exactly what to install for this OS and
// exits with code 2; after installing, run the same command again.
//
// `npm run android:build -- --check` only reports what it finds.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(root, 'android');
const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const checkOnly = process.argv.includes('--check');
const REQUIRED_JDK = 21; // Capacitor 8 compiles with Java 21

const log = (message = '') => console.log(message);
const step = (message) => log(`\n==> ${message}`);

/* ------------------------------ detection ------------------------------ */

function javaMajor(javaBin) {
  const result = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const match = /version "(\d+)(?:\.(\d+))?/.exec(`${result.stderr}${result.stdout}`);
  if (!match) return null;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2]) : major; // "1.8.0" means Java 8
}

function findJdk() {
  const exe = isWin ? 'java.exe' : 'java';
  const homes = [
    process.env.JAVA_HOME,
    // JDK bundled with Android Studio.
    isWin && 'C:\\Program Files\\Android\\Android Studio\\jbr',
    isMac && '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    !isWin && !isMac && '/opt/android-studio/jbr',
  ].filter(Boolean);

  const seen = [];
  for (const home of homes) {
    const bin = join(home, 'bin', exe);
    if (!existsSync(bin)) continue;
    const major = javaMajor(bin);
    seen.push(`${home} (Java ${major ?? '?'})`);
    if (major !== null && major >= REQUIRED_JDK) return { home, major, seen };
  }
  // Fall back to whatever `java` is on PATH (Gradle uses it when JAVA_HOME is unset).
  const major = javaMajor('java');
  if (major !== null) {
    seen.push(`java on PATH (Java ${major})`);
    if (major >= REQUIRED_JDK) return { home: null, major, seen };
  }
  return { home: undefined, major: null, seen };
}

function findSdk() {
  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];

  const localProperties = join(androidDir, 'local.properties');
  if (existsSync(localProperties)) {
    const match = /^sdk\.dir\s*=\s*(.+)$/m.exec(readFileSync(localProperties, 'utf8'));
    if (match) candidates.push(match[1].trim().replace(/\\\\/g, '\\').replace(/\\:/g, ':'));
  }

  if (isWin) candidates.push(join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk'));
  else if (isMac) candidates.push(join(homedir(), 'Library', 'Android', 'sdk'));
  else candidates.push(join(homedir(), 'Android', 'Sdk'));

  return candidates.filter(Boolean).find((dir) => existsSync(join(dir, 'platforms')) || existsSync(join(dir, 'platform-tools')));
}

/* ------------------------------- helpers ------------------------------- */

function run(command, args, options = {}) {
  log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`\nCommand failed (exit ${result.status}): ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function nodeBin(packageName, binName) {
  const pkgDir = join(root, 'node_modules', packageName);
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[binName];
  return join(pkgDir, rel);
}

/**
 * The Gradle wrapper downloads Gradle with Java's HttpURLConnection, which
 * only tries the FIRST address a host resolves to. If that one CDN node is
 * unreachable from your network (it happens: GitHub's release host has several
 * IPs) the whole build dies with "Connection timed out". Node tries every
 * address, so fetch the distribution here and leave it where the wrapper looks;
 * the wrapper then skips its own download. Best effort: on any problem it
 * warns and lets the wrapper try on its own.
 */
async function ensureGradleDistribution() {
  let partial = null;
  try {
    const properties = readFileSync(join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.properties'), 'utf8');
    const url = /^distributionUrl=(.+)$/m.exec(properties)?.[1]?.trim().replace(/\\:/g, ':');
    if (!url) return;

    // Same location the wrapper uses: <gradle home>/wrapper/dists/<name>/<base36 md5 of url>/<name>.zip
    const fileName = url.split('/').pop();
    const hash = BigInt(`0x${createHash('md5').update(url).digest('hex')}`).toString(36);
    const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
    const dir = join(gradleHome, 'wrapper', 'dists', fileName.replace(/\.zip$/, ''), hash);
    const zip = join(dir, fileName);
    if (existsSync(zip) || existsSync(`${zip}.ok`)) return;

    log(`Downloading ${fileName} (the Gradle wrapper's own download is unreliable on some networks)...`);
    mkdirSync(dir, { recursive: true });
    const response = await fetch(url, { signal: AbortSignal.timeout(20 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    const total = Number(response.headers.get('content-length')) || 0;
    partial = `${zip}.part`;
    const out = createWriteStream(partial);
    let received = 0;
    let nextReport = 10;
    for await (const chunk of response.body) {
      if (!out.write(chunk)) await once(out, 'drain');
      received += chunk.length;
      if (total && (received / total) * 100 >= nextReport) {
        log(`  ${nextReport}%`);
        nextReport += 10;
      }
    }
    out.end();
    await once(out, 'finish');
    if (total && received !== total) throw new Error(`incomplete download (${received}/${total} bytes)`);
    renameSync(partial, zip);
  } catch (error) {
    if (partial) rmSync(partial, { force: true });
    log(`Could not pre-download Gradle (${error.message}); letting the Gradle wrapper try itself.`);
  }
}

function installInstructions({ needJdk, needSdk }) {
  const lines = ['', '============================================================', 'The web app is built and synced into android/, but the APK needs:', ''];

  if (isWin) {
    if (needJdk) {
      lines.push(`  * JDK ${REQUIRED_JDK} or newer`, '      winget install EclipseAdoptium.Temurin.21.JDK', '      (then open a NEW terminal so JAVA_HOME / PATH refresh)', '');
    }
    if (needSdk) {
      lines.push(
        '  * Android SDK',
        '      winget install Google.AndroidStudio',
        '      Open Android Studio once and finish the setup wizard; it installs the SDK to',
        '      %LOCALAPPDATA%\\Android\\Sdk. In SDK Manager also tick "Android SDK Platform 36".',
        '      (Command-line tools only: https://developer.android.com/studio#command-line-tools-only,',
        '       then: sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0")',
        '',
      );
    }
  } else if (isMac) {
    if (needJdk) lines.push(`  * JDK ${REQUIRED_JDK} or newer`, '      brew install --cask temurin@21', '');
    if (needSdk) {
      lines.push('  * Android SDK', '      brew install --cask android-studio', '      Open it once to finish setup; the SDK lands in ~/Library/Android/sdk.', '');
    }
  } else {
    if (needJdk) lines.push(`  * JDK ${REQUIRED_JDK} or newer`, '      sudo apt install openjdk-21-jdk     (Debian/Ubuntu; use your distro\'s package otherwise)', '');
    if (needSdk) {
      lines.push('  * Android SDK', '      Install Android Studio (https://developer.android.com/studio), open it once to finish setup;', '      the SDK lands in ~/Android/Sdk.', '');
    }
  }

  lines.push('Then run this single command to produce the APK:', '', '      npm run android:build', '============================================================', '');
  return lines.join('\n');
}

/* --------------------------------- main -------------------------------- */

const jdk = findJdk();
const sdk = findSdk();

if (checkOnly) {
  log(`Platform:     ${process.platform}`);
  log(`JDK ${REQUIRED_JDK}+:     ${jdk.home === undefined ? `NOT FOUND (seen: ${jdk.seen.join(', ') || 'nothing'})` : `${jdk.home ?? 'java on PATH'} (Java ${jdk.major})`}`);
  log(`Android SDK:  ${sdk ?? 'NOT FOUND'}`);
  process.exit(jdk.home === undefined || !sdk ? 2 : 0);
}

step('1/4  Building the web app for Android');
run(process.execPath, [nodeBin('vite', 'vite'), 'build', '--mode', 'native']);

step('2/4  Syncing into the Android project');
if (!existsSync(androidDir)) {
  run(process.execPath, [nodeBin('@capacitor/cli', 'cap'), 'add', 'android']);
  run(process.execPath, [join(root, 'scripts', 'generate-icons.mjs')]); // app launcher icons
}
run(process.execPath, [nodeBin('@capacitor/cli', 'cap'), 'sync', 'android']);

const needJdk = jdk.home === undefined;
const needSdk = !sdk;
if (needJdk || needSdk) {
  if (needJdk && jdk.seen.length) log(`\nFound, but too old (need Java ${REQUIRED_JDK}+): ${jdk.seen.join(', ')}`);
  console.error(installInstructions({ needJdk, needSdk }));
  process.exit(2);
}

step(`3/4  Building the debug APK with Gradle (JDK ${jdk.major}, SDK ${sdk})`);
// Tell Gradle where the SDK is (also lets Android Studio open the project).
writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);

const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
if (jdk.home) env.JAVA_HOME = jdk.home;

await ensureGradleDistribution();

if (isWin) {
  // shell: true is required to launch a .bat; the explicit ".\" is needed because
  // cmd.exe does not always search the working directory.
  run('.\\gradlew.bat assembleDebug --console=plain', [], { cwd: androidDir, env, shell: true });
} else {
  chmodSync(join(androidDir, 'gradlew'), 0o755);
  run('./gradlew', ['assembleDebug', '--console=plain'], { cwd: androidDir, env });
}

step('4/4  Collecting the APK');
const built = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!existsSync(built)) {
  console.error(`Gradle finished but ${built} does not exist.`);
  process.exit(1);
}
const releaseDir = join(root, 'release');
mkdirSync(releaseDir, { recursive: true });
const apk = join(releaseDir, 'toolbox-debug.apk');
copyFileSync(built, apk);

log(`\nAPK ready (${(statSync(apk).size / 1024 / 1024).toFixed(1)} MB):`);
log(`  ${apk}`);
log('\nInstall: copy it to your phone and open it, or with USB debugging on:');
log(`  adb install -r "${apk}"`);
