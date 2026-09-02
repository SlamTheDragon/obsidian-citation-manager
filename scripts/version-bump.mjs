import fs from 'fs';
import path from 'path';

const type = process.argv[2] || 'patch';

const packageJsonPath = path.resolve('package.json');
const manifestJsonPath = path.resolve('manifest.json');
const versionsJsonPath = path.resolve('versions.json');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestJsonPath, 'utf8'));
const versions = fs.existsSync(versionsJsonPath) ? JSON.parse(fs.readFileSync(versionsJsonPath, 'utf8')) : {};

let [major, minor, patch] = pkg.version.split('.').map(Number);

if (type === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (type === 'minor') {
  minor += 1;
  patch = 0;
} else if (type === 'patch') {
  patch += 1;
} else if (/^\d+\.\d+\.\d+$/.test(type)) {
  [major, minor, patch] = type.split('.').map(Number);
} else {
  console.error(`Invalid version bump type: ${type}. Use patch, minor, major, or X.Y.Z`);
  process.exit(1);
}

const newVersion = `${major}.${minor}.${patch}`;
console.log(`[Version Bump] ${pkg.version} -> ${newVersion}`);

pkg.version = newVersion;
manifest.version = newVersion;
versions[newVersion] = manifest.minAppVersion || '0.15.0';

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
fs.writeFileSync(manifestJsonPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
fs.writeFileSync(versionsJsonPath, JSON.stringify(versions, null, 2) + '\n', 'utf8');

console.log(`[Version Bump] Successfully updated package.json, manifest.json, and versions.json to ${newVersion}!`);
