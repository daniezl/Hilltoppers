import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const copies = [
  {
    from: path.join(rootDir, 'manifest.json'),
    to: path.join(distDir, 'manifest.json')
  },
  {
    from: path.join(rootDir, 'icons'),
    to: path.join(distDir, 'icons')
  }
];

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.warn(`[postbuild] Skip missing path: ${from}`);
    continue;
  }
  const destinationDir = path.extname(to) ? path.dirname(to) : to;
  mkdirSync(destinationDir, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[postbuild] Copied ${from} → ${to}`);
}

// A build that is not the store release gets a label after its version, e.g.
// "1.4.3 (PR #41)". Someone who loads an unpacked copy next to the store copy
// sees two identical entries in chrome://extensions otherwise. `version_name`
// is display-only; the numeric `version` Chrome compares stays untouched.
const buildLabel = (process.env.EXTENSION_BUILD_LABEL ?? '').trim();
if (buildLabel) {
  const manifestPath = path.join(distDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version_name = `${manifest.version} (${buildLabel})`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[postbuild] Set version_name to "${manifest.version_name}"`);
}
