const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, 'manifest.json');
const PACKAGE_PATH = path.join(__dirname, 'package.json');

function parseSemVer(versionStr) {
  if (!versionStr || typeof versionStr !== 'string') {
    throw new Error(`Invalid version string: "${versionStr}"`);
  }
  const clean = versionStr.trim().replace(/^v/i, '');
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    throw new Error(`Version "${versionStr}" does not match semantic versioning (X.Y.Z).`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || ''
  };
}

function computeNextVersion(currentVersion, bumpType) {
  const type = (bumpType || 'patch').trim().toLowerCase();

  // If argument is an exact SemVer string (e.g. "1.2.0")
  if (/^v?\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(type)) {
    return type.replace(/^v/i, '');
  }

  const { major, minor, patch } = parseSemVer(currentVersion);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown bump argument "${bumpType}". Expected "patch", "minor", "major", or a specific SemVer string like "1.2.0".`);
  }
}

function runBump() {
  const bumpArg = process.argv[2] || 'patch';

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('Error: manifest.json not found in directory.');
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(`Error reading manifest.json: ${err.message}`);
    process.exit(1);
  }

  const currentVersion = manifest.version || '1.0.0';
  let nextVersion;
  try {
    nextVersion = computeNextVersion(currentVersion, bumpArg);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Update manifest.json
  manifest.version = nextVersion;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Update package.json if present
  if (fs.existsSync(PACKAGE_PATH)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
      pkg.version = nextVersion;
      fs.writeFileSync(PACKAGE_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    } catch (err) {
      console.warn(`Warning: Could not update package.json: ${err.message}`);
    }
  }

  console.log(`Bumped to v${nextVersion}`);
}

runBump();
