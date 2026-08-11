const { spawnSync } = require('node:child_process');

// Expo SDK 54 currently resolves Metro to image-size 1.2.1. npm reports the
// two advisories below across every published image-size version and suggests
// an unsafe Expo/React Native downgrade. Keep this exception exact so any new
// advisory or any unrelated dependency finding still fails CI.
const allowedAdvisorySources = new Set([1138808, 1138809]);

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  process.stderr.write(result.stderr || result.stdout || String(error));
  process.exit(2);
}

const vulnerabilities = report.vulnerabilities || {};
const unsafe = new Set();
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const directAdvisories = (vulnerability.via || []).filter((item) => (
    item && typeof item === 'object' && Number.isInteger(item.source)
  ));
  if (directAdvisories.some((advisory) => !allowedAdvisorySources.has(advisory.source))) {
    unsafe.add(name);
  }
}

let changed = true;
while (changed) {
  changed = false;
  for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
    if (unsafe.has(name)) continue;
    const inherited = (vulnerability.via || []).filter((item) => typeof item === 'string');
    if (inherited.some((dependency) => unsafe.has(dependency))) {
      unsafe.add(name);
      changed = true;
    }
  }
}

if (unsafe.size) {
  process.stderr.write(`Dependency audit failed for: ${[...unsafe].sort().join(', ')}\n`);
  process.exit(1);
}

const activeAdvisories = Object.values(vulnerabilities).flatMap((vulnerability) => (
  (vulnerability.via || []).filter((item) => item && typeof item === 'object')
));
if (activeAdvisories.some((advisory) => !allowedAdvisorySources.has(advisory.source))) {
  process.stderr.write('Dependency audit contained an advisory outside the exact allowlist.\n');
  process.exit(1);
}

if (activeAdvisories.length) {
  process.stdout.write(
    'Dependency audit passed with the two documented, currently unpatched image-size advisories inherited through Expo/Metro.\n'
  );
} else {
  process.stdout.write('Dependency audit passed with no vulnerabilities.\n');
}
